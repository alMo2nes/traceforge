import type { SemanticEvent } from './semantic.js';

export type InvestigationNodeType =
  | 'transaction'
  | 'code-unit'
  | 'method'
  | 'soql'
  | 'dml'
  | 'exception'
  | 'statement'
  | 'debug'
  | 'variable'
  | 'system'
  | 'savepoint'
  | 'limit';

export interface InvestigationNode {
  id: string;
  type: InvestigationNodeType;
  name?: string;
  line?: number;
  startTimestamp?: number;
  endTimestamp?: number;
  events: SemanticEvent[];
  children: InvestigationNode[];
}

export function correlateInvestigationEvents(events: SemanticEvent[]): InvestigationNode[] {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp || a.lineNumber - b.lineNumber);
  const roots: InvestigationNode[] = [];
  const codeUnits: InvestigationNode[] = [];
  const methods: InvestigationNode[] = [];
  const openDml: InvestigationNode[] = [];
  const openSoql: InvestigationNode[] = [];

  for (const event of sorted) {
    switch (event.type) {
      case 'code-unit-start': {
        const node = nodeFrom(event, 'code-unit', event.name);
        attach(node, codeUnits.length > 0 ? codeUnits[codeUnits.length - 1] : undefined, roots);
        codeUnits.push(node);
        break;
      }
      case 'code-unit-finish': {
        const node = codeUnits.at(-1);
        if (node && (!event.name || node.name === event.name)) {
          node.events.push(event);
          node.endTimestamp = event.timestamp;
          codeUnits.pop();
        }
        break;
      }
      case 'method-entry': {
        const node = nodeFrom(event, 'method', event.name);
        const parent = methods.at(-1) ?? codeUnits.at(-1);
        attach(node, parent, roots);
        methods.push(node);
        break;
      }
      case 'method-exit': {
        const node = methods.at(-1);
        if (node && (!event.name || node.name === event.name)) {
          node.events.push(event);
          node.endTimestamp = event.timestamp;
          methods.pop();
        }
        break;
      }
      case 'dml-begin': {
        const op = event.details?.Op ?? 'DML';
        const objectType = event.details?.Type ?? '';
        const rows = event.details?.Rows ? ` (${event.details.Rows} rows)` : '';
        const node = nodeFrom(event, 'dml', `${op} ${objectType}${rows}`);
        attach(node, methods.at(-1) ?? codeUnits.at(-1), roots);
        openDml.push(node);
        break;
      }
      case 'dml-end': {
        const node = openDml.at(-1);
        if (node) {
          node.events.push(event);
          node.endTimestamp = event.timestamp;
          openDml.pop();
        }
        break;
      }
      case 'soql-begin': {
        const node = nodeFrom(event, 'soql', event.details?.value ?? 'SOQL');
        attach(node, methods.at(-1) ?? codeUnits.at(-1), roots);
        openSoql.push(node);
        break;
      }
      case 'soql-explain': {
        const node = openSoql.at(-1);
        if (node) node.events.push(event);
        break;
      }
      case 'soql-end': {
        const node = openSoql.at(-1);
        if (node) {
          node.events.push(event);
          node.endTimestamp = event.timestamp;
          openSoql.pop();
        }
        break;
      }
      case 'exception': {
        attach(nodeFrom(event, 'exception', event.value), methods.at(-1) ?? codeUnits.at(-1), roots);
        break;
      }
      case 'statement': {
        attach(nodeFrom(event, 'statement', `Line ${event.line ?? '?'}`), methods.at(-1) ?? codeUnits.at(-1), roots);
        break;
      }
      case 'user-debug': {
        attach(nodeFrom(event, 'debug', event.value), methods.at(-1) ?? codeUnits.at(-1), roots);
        break;
      }
      case 'variable-scope':
      case 'variable-assignment': {
        const target = methods.at(-1) ?? codeUnits.at(-1) ?? roots.at(-1);
        const node = nodeFrom(event, 'variable', event.name);
        if (event.value !== undefined) node.name = `${event.name ?? 'variable'} = ${event.value}`;
        attach(node, target, roots);
        break;
      }
      case 'savepoint-set':
      case 'savepoint-rollback':
        attach(nodeFrom(event, 'savepoint', event.value), methods.at(-1) ?? codeUnits.at(-1), roots);
        break;
      case 'limit-usage':
        attach(nodeFrom(event, 'limit', event.details?.metric), methods.at(-1) ?? codeUnits.at(-1), roots);
        break;
      case 'system-method-entry':
      case 'system-method-exit':
      case 'system-constructor-entry':
      case 'system-constructor-exit':
        attach(nodeFrom(event, 'system', event.name), methods.at(-1) ?? codeUnits.at(-1), roots);
        break;
    }
  }

  return roots;
}

function nodeFrom(event: SemanticEvent, type: InvestigationNodeType, name?: string): InvestigationNode {
  return {
    id: `investigation-${event.id}-${type}`,
    type,
    name,
    line: event.line,
    startTimestamp: event.timestamp,
    events: [event],
    children: []
  };
}

function attach(node: InvestigationNode, parent: InvestigationNode | undefined, roots: InvestigationNode[]): void {
  if (parent) parent.children.push(node);
  else roots.push(node);
}
