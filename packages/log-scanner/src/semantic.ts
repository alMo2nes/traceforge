import type { RawLogEvent } from './index.js';

export type SemanticEventType =
  | 'code-unit-start'
  | 'code-unit-finish'
  | 'method-entry'
  | 'method-exit'
  | 'statement'
  | 'variable-scope'
  | 'variable-assignment'
  | 'user-debug'
  | 'soql-begin'
  | 'soql-end'
  | 'soql-explain'
  | 'dml-begin'
  | 'dml-end'
  | 'exception'
  | 'savepoint-set'
  | 'savepoint-rollback'
  | 'limit-usage'
  | 'system-method-entry'
  | 'system-method-exit'
  | 'system-constructor-entry'
  | 'system-constructor-exit';

export interface SemanticEvent {
  id: string;
  type: SemanticEventType;
  timestamp: number;
  lineNumber: number;
  raw: RawLogEvent;
  line?: number;
  name?: string;
  value?: string;
  details?: Record<string, string>;
}

export function decodeSemanticEvent(event: RawLogEvent): SemanticEvent | undefined {
  const fields = splitFields(event.details);
  const first = fields[0];

  switch (event.eventType) {
    case 'CODE_UNIT_STARTED':
      return eventOf(event, 'code-unit-start', {
        line: numericField(first),
        name: fields.at(-1)
      });
    case 'CODE_UNIT_FINISHED':
      return eventOf(event, 'code-unit-finish', { name: first });
    case 'METHOD_ENTRY':
      return eventOf(event, 'method-entry', {
        line: numericField(first),
        name: fields.at(-1)
      });
    case 'METHOD_EXIT':
      return eventOf(event, 'method-exit', {
        line: numericField(first),
        name: fields.at(-1)
      });
    case 'STATEMENT_EXECUTE':
      return eventOf(event, 'statement', { line: numericField(first) });
    case 'VARIABLE_SCOPE_BEGIN':
      return eventOf(event, 'variable-scope', {
        line: numericField(first),
        name: fields[1],
        details: {
          type: fields[2] ?? '',
          isStatic: fields[3] ?? '',
          isFinal: fields[4] ?? ''
        }
      });
    case 'VARIABLE_ASSIGNMENT':
      return eventOf(event, 'variable-assignment', {
        line: numericField(first),
        name: fields[1],
        value: fields[2],
        details: fields[3] ? { heapReference: fields[3] } : undefined
      });
    case 'USER_DEBUG':
      return eventOf(event, 'user-debug', {
        line: numericField(first),
        details: fields[1] !== undefined
          ? { level: fields[1], message: fields.slice(2).join('|') }
          : undefined,
        value: fields.slice(2).join('|') || undefined
      });
    case 'SOQL_EXECUTE_BEGIN':
      return eventOf(event, 'soql-begin', {
        line: numericField(first),
        details: keyValueDetails(fields.slice(1))
      });
    case 'SOQL_EXECUTE_END':
      return eventOf(event, 'soql-end', {
        line: numericField(first),
        details: keyValueDetails(fields.slice(1))
      });
    case 'SOQL_EXECUTE_EXPLAIN':
      return eventOf(event, 'soql-explain', {
        line: numericField(first),
        value: fields.slice(1).join('|')
      });
    case 'DML_BEGIN':
      return eventOf(event, 'dml-begin', {
        line: numericField(first),
        details: keyValueDetails(fields.slice(1))
      });
    case 'DML_END':
      return eventOf(event, 'dml-end', { line: numericField(first) });
    case 'EXCEPTION_THROWN':
      return eventOf(event, 'exception', {
        line: numericField(first),
        value: fields.slice(1).join('|')
      });
    case 'SAVEPOINT_SET':
      return eventOf(event, 'savepoint-set', {
        line: numericField(first),
        value: fields.slice(1).join('|') || undefined
      });
    case 'SAVEPOINT_ROLLBACK':
      return eventOf(event, 'savepoint-rollback', {
        line: numericField(first),
        value: fields.slice(1).join('|') || undefined
      });
    case 'LIMIT_USAGE':
      return eventOf(event, 'limit-usage', {
        line: numericField(first),
        details: fields[1] !== undefined
          ? {
              metric: fields[1],
              used: fields[2] ?? '',
              limit: fields[3] ?? ''
            }
          : undefined
      });
    case 'SYSTEM_METHOD_ENTRY':
      return eventOf(event, 'system-method-entry', {
        line: numericField(first),
        name: fields.slice(1).join('|')
      });
    case 'SYSTEM_METHOD_EXIT':
      return eventOf(event, 'system-method-exit', {
        line: numericField(first),
        name: fields.slice(1).join('|')
      });
    case 'SYSTEM_CONSTRUCTOR_ENTRY':
      return eventOf(event, 'system-constructor-entry', {
        line: numericField(first),
        name: fields.slice(1).join('|')
      });
    case 'SYSTEM_CONSTRUCTOR_EXIT':
      return eventOf(event, 'system-constructor-exit', {
        line: numericField(first),
        name: fields.slice(1).join('|')
      });
    default:
      return undefined;
  }
}

export function decodeSemanticEvents(events: RawLogEvent[]): SemanticEvent[] {
  return events
    .map(decodeSemanticEvent)
    .filter((event): event is SemanticEvent => event !== undefined);
}

function eventOf(event: RawLogEvent, type: SemanticEventType, values: Omit<SemanticEvent, 'id' | 'type' | 'timestamp' | 'lineNumber' | 'raw'>): SemanticEvent {
  return {
    id: event.id,
    type,
    timestamp: event.timestamp,
    lineNumber: event.lineNumber,
    raw: event,
    ...values
  };
}

function splitFields(details: string | undefined): string[] {
  return details?.split('|') ?? [];
}

function numericField(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

function keyValueDetails(fields: string[]): Record<string, string> {
  const details: Record<string, string> = {};
  const fragments: string[] = [];

  for (const field of fields) {
    const separator = field.indexOf(':');
    if (separator > 0) {
      details[field.slice(0, separator)] = field.slice(separator + 1);
    } else if (field) {
      fragments.push(field);
    }
  }

  if (fragments.length > 0) {
    details.value = fragments.join('|');
  }

  return details;
}
