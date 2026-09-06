import {
  correlateInvestigationEvents,
  decodeSemanticEvents,
  SalesforceLogScanner,
  type InvestigationNode as ScannerNode,
  type SalesforceLogSummaries,
  type SemanticEvent,
} from '../../../packages/log-scanner/src/index.js';

export interface UiVariable {
  name: string;
  type: string;
  value: string;
}

export interface UiInvestigationNode {
  id: string;
  kind:
    | 'transaction'
    | 'code-unit'
    | 'method'
    | 'soql'
    | 'dml'
    | 'flow'
    | 'exception';
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

/** Map scanner-specific node types to the smaller set exposed by the web UI. */
function kindFor(
  node: ScannerNode,
): UiInvestigationNode['kind'] | undefined {
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

/** Convert the scanner's nanosecond timestamps to UI-friendly relative milliseconds. */
function formatTimestamp(
  timestamp: number | undefined,
  baseTimestamp: number,
): string {
  if (timestamp === undefined) return '—';

  return `+${((timestamp - baseTimestamp) / 1_000_000).toFixed(3)} ms`;
}

function durationMs(node: ScannerNode): number | undefined {
  if (
    node.startTimestamp === undefined ||
    node.endTimestamp === undefined
  ) {
    return undefined;
  }

  return (node.endTimestamp - node.startTimestamp) / 1_000_000;
}

/**
 * Keep useful diagnostic events available as a fallback for nodes without a
 * complete raw-line range, for example point-in-time exception nodes.
 */
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

/** Extract variables correlated with a code-unit or method scope. */
function variablesFromChildren(node: ScannerNode): UiVariable[] {
  return node.children
    .filter((child) => child.type === 'variable')
    .flatMap((child) => {
      const scope = child.events.find(
        (event) => event.type === 'variable-scope',
      );
      const assignment = child.events.find(
        (event) => event.type === 'variable-assignment',
      );

      return [
        {
          name:
            assignment?.name ??
            scope?.name ??
            child.name ??
            'variable',
          type: scope?.details?.type ?? 'unknown',
          value: assignment?.value ?? '—',
        },
      ];
    });
}

/**
 * Return the original Salesforce log line range represented by this node.
 * Event line numbers are one-based, while Array#slice uses a zero-based start.
 */
function nodeLineRange(
  node: ScannerNode,
): { start: number; end: number } | undefined {
  const lineNumbers = node.events
    .map((event) => event.lineNumber)
    .filter((line): line is number => Number.isFinite(line));

  if (lineNumbers.length === 0) return undefined;

  return {
    start: Math.min(...lineNumbers),
    end: Math.max(...lineNumbers),
  };
}

/**
 * Extract only the raw Salesforce lines belonging to a selected investigation node.
 * This is what lets the Inspector show one method/code-unit instead of the full log.
 */
function rawLogSlice(
  content: string,
  node: ScannerNode,
): string | undefined {
  const range = nodeLineRange(node);
  if (!range) return undefined;

  const lines = content.split(/\r?\n/);
  const output = lines.slice(range.start - 1, range.end).join('\n');

  return output || undefined;
}

/** Build the API/UI node recursively while filtering implementation-only scanner nodes. */
function uiNode(
  node: ScannerNode,
  baseTimestamp: number,
  content: string,
): UiInvestigationNode | undefined {
  const kind = kindFor(node);
  if (!kind) return undefined;

  const children = node.children
    .map((child) => {
      // These event types are useful to the parser but are intentionally not
      // rendered as separate rows in the user-facing execution tree.
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
    .filter(
      (child): child is UiInvestigationNode => child !== undefined,
    );

  const variables = variablesFromChildren(node);
  const output =
    rawLogSlice(content, node) ?? [...rawOutput(node.events)].join('\n');
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
    logOutput: output,
    children,
  };
}

export interface InvestigationResult {
  nodes: UiInvestigationNode[];
  summaries?: SalesforceLogSummaries;
  isTruncated: boolean;
}

/** Run the complete scan → semantic decode → correlation → UI mapping pipeline. */
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
    .filter(
      (node): node is UiInvestigationNode => node !== undefined,
    );

  const isTruncated =
    content.includes('MAXIMUM DEBUG LOG SIZE REACHED') ||
    content.includes('*** MAXIMUM DEBUG LOG SIZE REACHED ***');

  return {
    nodes,
    summaries: raw.summaries,
    isTruncated,
  };
}
