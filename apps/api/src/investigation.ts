import { correlateInvestigationEvents, decodeSemanticEvents, SalesforceLogScanner, type InvestigationNode as ScannerNode, type SemanticEvent } from '../../../packages/log-scanner/src/index.js';

export interface UiVariable {
  name: string;
  type: string;
  value: string;
}

export interface UiInvestigationNode {
  id: string;
  kind: 'transaction' | 'code-unit' | 'method' | 'soql' | 'dml' | 'flow' | 'exception';
  label: string;
  subtitle?: string;
  line?: number;
  timestamp: string;
  durationMs?: number;
  status?: 'ok' | 'error' | 'info';
  variables: UiVariable[];
  logOutput?: string;
  children: UiInvestigationNode[];
}

function kindFor(node: ScannerNode): UiInvestigationNode['kind'] | undefined {
  switch (node.type) {
    case 'code-unit': return 'code-unit';
    case 'method': return 'method';
    case 'soql': return 'soql';
    case 'dml': return 'dml';
    case 'exception': return 'exception';
    case 'transaction': return 'transaction';
    default: return undefined;
  }
}

function formatTimestamp(timestamp?: number): string {
  if (timestamp === undefined) return '—';
  const base = new Date(timestamp / 1000);
  return base.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

function durationMs(node: ScannerNode): number | undefined {
  if (node.startTimestamp === undefined || node.endTimestamp === undefined) return undefined;
  return (node.endTimestamp - node.startTimestamp) / 1_000_000;
}

function rawOutput(events: SemanticEvent[]): string[] {
  return events
    .filter((event) => event.type === 'user-debug' || event.type === 'exception' || event.type.startsWith('soql-') || event.type.startsWith('dml-'))
    .map((event) => event.raw.rawLine);
}

function variablesFromChildren(node: ScannerNode): UiVariable[] {
  return node.children
    .filter((child) => child.type === 'variable')
    .flatMap((child) => {
      const scope = child.events.find((event) => event.type === 'variable-scope');
      const assignment = child.events.find((event) => event.type === 'variable-assignment');
      return [{
        name: assignment?.name ?? scope?.name ?? child.name ?? 'variable',
        type: scope?.details?.type ?? 'unknown',
        value: assignment?.value ?? '—'
      }];
    });
}

function debugOutputFromChildren(node: ScannerNode): string[] {
  const output: string[] = [];
  for (const child of node.children) {
    if (child.type === 'debug' || child.type === 'exception') output.push(...rawOutput(child.events));
  }
  return output;
}

function uiNode(node: ScannerNode, root = false): UiInvestigationNode | undefined {
  const kind = kindFor(node);
  if (!kind) return undefined;

  const children = node.children
    .map((child) => {
      if (child.type === 'system' || child.type === 'statement' || child.type === 'variable' || child.type === 'limit' || child.type === 'savepoint') {
        return undefined;
      }
      return uiNode(child);
    })
    .filter((child): child is UiInvestigationNode => child !== undefined);

  const variables = variablesFromChildren(node);
  const output = [...rawOutput(node.events), ...debugOutputFromChildren(node)];
  const exception = node.type === 'exception' || node.children.some((child) => child.type === 'exception');

  return {
    id: node.id,
    kind,
    label: node.name ?? kind,
    subtitle: node.type === 'code-unit' ? 'Salesforce code unit' : node.type === 'method' ? 'Method invocation' : node.type.toUpperCase(),
    line: node.line,
    timestamp: formatTimestamp(node.startTimestamp),
    durationMs: durationMs(node),
    status: exception ? 'error' : 'ok',
    variables,
    logOutput: output.length ? output.join('\n') : undefined,
    children
  };
}

export function analyzeLog(content: string): UiInvestigationNode[] {
  const scanner = new SalesforceLogScanner();
  const raw = scanner.scan(content);
  const semantic = decodeSemanticEvents(raw.events);
  return correlateInvestigationEvents(semantic)
    .map((root) => uiNode(root, true))
    .filter((node): node is UiInvestigationNode => node !== undefined);
}
