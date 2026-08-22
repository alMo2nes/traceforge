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

export interface LogEvent {
  id: string;
  parentId?: string;
  type: LogEventType;
  name?: string;
  lineNumber?: number;
  durationMs?: number;
  timeStart?: number;
  timeEnd?: number;
  source?: string;
}