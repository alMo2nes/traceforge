import {
  ApexLogParser,
  type ParsedLog,
  type EventNode
} from 'apex-log-parser';

import type {
  LogEvent,
  LogEventType
} from '@traceforge/shared';

export interface TraceForgeParsedLog
  extends Omit<ParsedLog, 'events'> {
  events: LogEvent[];
}

export class SalesforceLogParser {
  private readonly parser = new ApexLogParser();

  parse(content: string, source = 'unknown'): TraceForgeParsedLog {
    const result = this.parser.parse(content, source);

    return {
      ...result,
      events: result.events.map((event) => this.toLogEvent(event))
    };
  }

  private toLogEvent(event: EventNode): LogEvent {
    return {
      id: event.id,
      parentId: event.parentId,
      type: this.mapEventType(event.type),
      rawType: event.type,
      name: event.name,
      lineNumber: event.lineNumber,
      durationMs: event.durationMs,
      timeStart: event.timeStart,
      timeEnd: event.timeEnd,
      source: event.source
    };
  }

  private mapEventType(type: string): LogEventType {
    switch (type) {
      case 'ROOT':
      case 'EXECUTION':
        return 'EXECUTION';

      case 'CODE_UNIT':
        return 'CODE_UNIT';

      case 'METHOD':
        return 'METHOD';

      case 'SOQL':
        return 'SOQL';

      case 'DML':
        return 'DML';

      case 'CALLOUT':
        return 'CALLOUT';

      case 'LIMIT':
        return 'LIMIT';

      case 'EXCEPTION_THROWN':
      case 'FATAL_ERROR':
      case 'EXCEPTION':
        return 'EXCEPTION';

      case 'SYSTEM_METHOD_ENTRY':
      case 'SYSTEM_METHOD_EXIT':
      case 'SYSTEM_CONSTRUCTOR_ENTRY':
      case 'SYSTEM_CONSTRUCTOR_EXIT':
      case 'USER_DEBUG':
        return 'SYSTEM';

      default:
        return 'OTHER';
    }
  }
}
