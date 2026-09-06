import {
  correlateInvestigationEvents,
  decodeSemanticEvents,
  SalesforceLogScanner,
  type InvestigationNode as ScannerNode,
  type SalesforceLogSummaries,
  type SemanticEvent,
} from '@traceforge/log-scanner';

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

export interface InvestigationResult {
  nodes: UiInvestigationNode[];
  summaries?: SalesforceLogSummaries;
  isTruncated: boolean;
}

/** Map scanner node types to the smaller set rendered by the clients. */
function kindFor(node: ScannerNode): UiInvestigationNode['kind'] | undefined {
  switch (node.type) {
    case 'code-unit':
      return 'code-unit';
    case 'method':
      return 'method';
    case 'soql':
      return 'soql';
    case 'dml':
      return 'dml';
    case 'exception':
      return 'exception';
    case 'transaction':
      return 'transaction';
    default:
      return undefined;
  }
}

/** Convert scanner timestamps from nanoseconds to relative milliseconds. */
function formatTimestamp(timestamp: number | undefined, baseTimestamp: number): string {
  if (timestamp === undefined) return '—';
  return `+${((timestamp - baseTimestamp) / 1_000_000).toFixed(3)} ms`;
}

/** Calculate duration from a node's correlated start/end events. */
function durationMs(node: ScannerNode): number | undefined {
  if (node.startTimestamp === undefined || node.endTimestamp === undefined) {
    return undefined;
  }

  return (node.endTimestamp - node.startTimestamp) / 1_000_000;
}

/** Preserve diagnostic events as a fallback when no node line range is available. */
function rawOutput(events: SemanticEvent[]): string[] {
  return events
    .filter(
      (event) =>
        event.type === 'user-debug' ||
        event.type === 'exception' ||
        event.type.startsWith('soql-') ||
        event.type.startsWith('dml-'),
    )
    .map((event) => event.raw.rawLine);
}

/** Extract variables declared or assigned directly under a correlated scope. */
function variablesFromChildren(node: ScannerNode): UiVariable[] {
  return node.children
    .filter((child) => child.type === 'variable')
    .flatMap((child) => {
      const scope = child.events.find((event) => event.type === 'variable-scope');
      const assignment = child.events.find((event) => event.type === 'variable-assignment');

      return [{
        name: assignment?.name ?? scope?.name ?? child.name ?? 'variable',
        type: scope?.details?.type ?? 'unknown',
        value: assignment?.value ?? '—',
      }];
    });
}

/** Find the first and last physical lines represented by a correlated node. */
function nodeLineRange(node: ScannerNode): { start: number; end: number } | undefined {
  const lineNumbers = node.events
    .map((event) => event.lineNumber)
    .filter((line): line is number => Number.isFinite(line));

  if (lineNumbers.length === 0) return undefined;

  return {
    start: Math.min(...lineNumbers),
    end: Math.max(...lineNumbers),
  };
}

/** Extract only the raw Salesforce log lines covered by a selected node. */
function rawLogSlice(content: string, node: ScannerNode): string | undefined {
  const range = nodeLineRange(node);
  if (!range) return undefined;

  const lines = content.split(/\r?\n/);
  const output = lines.slice(range.start - 1, range.end).join('\n');
  return output || undefined;
}

function uiNode(node: ScannerNode, baseTimestamp: number, content: string): UiInvestigationNode | undefined {
  const kind = kindFor(node);
  if (!kind) return undefined;

  // These low-level nodes remain part of the scanner model but are intentionally
  // hidden from the primary UI tree to keep the investigation view readable.
  const children = node.children
    .map((child) => {
      if (
        child.type === 'system' ||
        child.type === 'statement' ||
        child.type === 'variable' ||
        child.type === 'limit' ||
        child.type === 'savepoint'
      ) {
        return undefined;
      }

      return uiNode(child, baseTimestamp, content);
    })
    .filter((child): child is UiInvestigationNode => child !== undefined);

  const variables = variablesFromChildren(node);
  const output = rawLogSlice(content, node) ?? rawOutput(node.events).join('\n');
  const exception =
    node.type === 'exception' ||
    node.children.some((child) => child.type === 'exception');

  return {
    id: node.id,
    kind,
    label: node.name ?? kind,
    subtitle:
      node.type === 'code-unit'
        ? 'Salesforce code unit'
        : node.type === 'method'
          ? 'Method invocation'
          : node.type.toUpperCase(),
    line: node.line,
    timestamp: formatTimestamp(node.startTimestamp, baseTimestamp),
    durationMs: durationMs(node),
    status: exception ? 'error' : 'ok',
    variables,
    logOutput: output || undefined,
    children,
  };
}

/** Run scan → semantic decode → correlation → client-facing investigation mapping. */
export function analyzeLog(content: string): InvestigationResult {
  const scanner = new SalesforceLogScanner();
  const raw = scanner.scan(content);
  const semantic = decodeSemanticEvents(raw.events);

  const nodes = correlateInvestigationEvents(semantic)
    .map((root) =>
      root.startTimestamp === undefined
        ? undefined
        : uiNode(root, root.startTimestamp, content),
    )
    .filter((node): node is UiInvestigationNode => node !== undefined);

  const isTruncated =
    content.includes('MAXIMUM DEBUG LOG SIZE REACHED') ||
    content.includes('*** MAXIMUM DEBUG LOG SIZE REACHED ***');

  return {
    nodes,
    summaries: raw.summaries,
    isTruncated,
  };
}
