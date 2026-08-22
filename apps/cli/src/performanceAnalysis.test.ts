import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { LogAnalyzer } from '@traceforge/analyzer';
import { SalesforceLogParser } from '@traceforge/parser-adapter';
import { describe, expect, it } from 'vitest';

describe('performance analysis with the sample log', () => {
  it('derives duration-based findings from parsed log events', async () => {
    const content = await readFile(resolve(process.cwd(), 'samples/logs/sample.log'), 'utf8');
    const parsed = new SalesforceLogParser().parse(content, 'sample.log');
    const analysis = new LogAnalyzer(parsed.events).getPerformanceAnalysis();

    expect(analysis.totalExecutionDurationMs).toBeGreaterThan(0);
    expect(analysis.primaryBottleneck?.event.type).toBe('METHOD');
    expect(analysis.expensiveOperation?.event.type).toBe('METHOD');
    expect(analysis.expensiveCallouts?.events.length).toBeGreaterThan(0);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });
});
