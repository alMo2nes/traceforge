export interface LogSearchResult {
  eventId: string;
  source: string;
  type: string;
  name?: string;
  lineNumber?: number;
}

export type LogEventType =
  | 'EXECUTION'
  | 'CODE_UNIT'
  | 'METHOD'
  | 'SOQL'
  | 'DML'
  | 'CALLOUT'
  | 'EXCEPTION'
  | 'LIMIT'
  | 'SYSTEM'
  | 'OTHER';

/**
 * A normalized event from a Salesforce debug log.
 *
 * rawType is deliberately retained because the normalized type is a
 * semantic projection and must never make source information unavailable
 * to investigation features.
 */
export interface LogEvent {
  id: string;
  parentId?: string;
  type: LogEventType;
  rawType?: string;
  name?: string;
  lineNumber?: number;
  durationMs?: number;
  timeStart?: number;
  timeEnd?: number;
  source?: string;
}
