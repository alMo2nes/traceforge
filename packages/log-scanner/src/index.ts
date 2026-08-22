import { parseSalesforceLogSummaries, type SalesforceLogSummaries } from './summaries.js';

export interface RawLogEvent {
  id: string;
  timestamp: number;
  eventType: string;
  details?: string;
  lineNumber: number;
  rawLine: string;
}

export interface RawLogScanResult {
  events: RawLogEvent[];
  eventTypeCounts: Record<string, number>;
  ignoredLineCount: number;
  summaries: SalesforceLogSummaries;
}

/**
 * Low-level Salesforce debug log scanner.
 *
 * Salesforce event lines normally look like:
 *
 *   12:34:56.0 (123456)|USER_DEBUG|[10]|DEBUG|message
 *
 * The value in parentheses is the high-resolution elapsed timestamp. Some
 * synthetic/test inputs use a plain numeric timestamp instead. The scanner
 * accepts both forms and preserves everything after the event type verbatim.
 */
export class SalesforceLogScanner {
  scan(content: string): RawLogScanResult {
    const events: RawLogEvent[] = [];
    const eventTypeCounts: Record<string, number> = {};
    let ignoredLineCount = 0;

    const lines = content.split(/\r?\n/);

    for (const [index, rawLine] of lines.entries()) {
      const event = this.parseLine(rawLine, index + 1);

      if (!event) {
        if (rawLine.trim()) {
          ignoredLineCount++;
        }
        continue;
      }

      events.push(event);
      eventTypeCounts[event.eventType] =
        (eventTypeCounts[event.eventType] ?? 0) + 1;
    }

    return {
      events,
      eventTypeCounts,
      ignoredLineCount,
      summaries: parseSalesforceLogSummaries(content)
    };
  }

  private parseLine(rawLine: string, lineNumber: number): RawLogEvent | undefined {
    const separator = rawLine.indexOf('|');
    if (separator <= 0) {
      return undefined;
    }

    const timestampText = rawLine.slice(0, separator).trim();
    const timestamp = this.parseTimestamp(timestampText);
    if (timestamp === undefined) {
      return undefined;
    }

    const remainder = rawLine.slice(separator + 1);
    const nextSeparator = remainder.indexOf('|');
    const eventType = (nextSeparator < 0
      ? remainder
      : remainder.slice(0, nextSeparator)
    ).trim();

    if (!eventType || !/^[A-Z][A-Z0-9_]*$/.test(eventType)) {
      return undefined;
    }

    const details = nextSeparator < 0
      ? undefined
      : remainder.slice(nextSeparator + 1);

    return {
      id: `raw-${lineNumber}`,
      timestamp,
      eventType,
      details: details || undefined,
      lineNumber,
      rawLine
    };
  }

  private parseTimestamp(value: string): number | undefined {
    if (/^\d+(?:\.\d+)?$/.test(value)) {
      return Number(value);
    }

    const highResolutionMatch = value.match(/\((\d+)\)$/);
    if (highResolutionMatch) {
      const timestamp = Number(highResolutionMatch[1]);
      return Number.isFinite(timestamp) ? timestamp : undefined;
    }

    return undefined;
  }
}

export * from './semantic.js';
export * from './correlator.js';
export * from './summaries.js';
