import { describe, expect, it } from 'vitest';

import { parseSalesforceLogSummaries } from './summaries.js';

describe('Salesforce log summaries', () => {
  it('parses namespace governor limits', () => {
    const result = parseSalesforceLogSummaries([
      '00:00.0 (1)|LIMIT_USAGE_FOR_NS|(default)|',
      '  Number of SOQL queries: 2 out of 100',
      '  Number of DML statements: 3 out of 150',
      '',
      '00:00.0 (2)|LIMIT_USAGE_FOR_NS|fot|',
      '  Number of SOQL queries: 4 out of 100',
      '  Maximum CPU time: 45 out of 10000',
      ''
    ].join('\n'));

    expect(result.governorLimits).toEqual([
      {
        namespace: '(default)',
        metrics: {
          'Number of SOQL queries': { used: 2, limit: 100 },
          'Number of DML statements': { used: 3, limit: 150 }
        }
      },
      {
        namespace: 'fot',
        metrics: {
          'Number of SOQL queries': { used: 4, limit: 100 },
          'Maximum CPU time': { used: 45, limit: 10000 }
        }
      }
    ]);
  });

  it('parses cumulative profiling entries', () => {
    const result = parseSalesforceLogSummaries([
      '00:00.0 (1)|CUMULATIVE_PROFILING|SOQL operations|',
      'AnonymousBlock: line 45, column 1: [SELECT Id FROM Account]: executed 1 time in 20 ms',
      '00:00.0 (2)|CUMULATIVE_PROFILING|DML operations|',
      'AnonymousBlock: line 35, column 1: Insert: List<Account>: executed 1 time in 431 ms',
      '00:00.0 (3)|CUMULATIVE_PROFILING|method invocations|',
      'External entry point: public static void execute(): executed 1 time in 541 ms'
    ].join('\n'));

    expect(result.profiling).toEqual([
      expect.objectContaining({ category: 'SOQL', line: 45, invocationCount: 1, durationMs: 20 }),
      expect.objectContaining({ category: 'DML', line: 35, invocationCount: 1, durationMs: 431 }),
      expect.objectContaining({ category: 'METHOD', invocationCount: 1, durationMs: 541 })
    ]);
  });
});
