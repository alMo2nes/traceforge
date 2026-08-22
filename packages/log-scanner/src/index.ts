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
}

/**
 * Low-level Salesforce debug log scanner.
 *
 * This scanner intentionally does not interpret Salesforce semantics. Its job
 * is to preserve every line that matches the timestamp|EVENT|details shape so
 * higher-level investigation code can decide what each event means.
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
      ignoredLineCount
    };
  }

  private parseLine(rawLine: string, lineNumber: number): RawLogEvent | undefined {
    const firstSeparator = rawLine.indexOf('|');
    if (firstSeparator <= 0) {
      return undefined;
    }

    const timestampText = rawLine.slice(0, firstSeparator).trim();
    const timestamp = Number(timestampText);
    if (!Number.isFinite(timestamp)) {
      return undefined;
    }

    const remainder = rawLine.slice(firstSeparator + 1);
    const secondSeparator = remainder.indexOf('|');
    if (secondSeparator <= 0) {
      return undefined;
    }

    const eventType = remainder.slice(0, secondSeparator).trim();
    if (!eventType) {
      return undefined;
    }

    const details = remainder.slice(secondSeparator + 1);

    return {
      id: `raw-${lineNumber}`,
      timestamp,
      eventType,
      details: details || undefined,
      lineNumber,
      rawLine
    };
  }
}
