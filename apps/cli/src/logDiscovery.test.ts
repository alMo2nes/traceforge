import { describe, expect, it, vi } from 'vitest';

import type { DebugLogInfo } from '@traceforge/salesforce';
import { filterLogs, parseLogsArguments, runLogsCommand } from './logDiscovery.js';

const logs: DebugLogInfo[] = [
  {
    id: '07Lnewest', userName: 'dev@example.com', operation: 'EXECUTION',
    startTime: '2026-08-15T10:00:00Z', durationMs: 40, status: 'Success', logLength: 2048
  },
  {
    id: '07Lolder', userName: 'other@example.com', operation: 'VF',
    startTime: '2026-08-15T09:00:00Z', durationMs: 20, status: 'Success', logLength: 512
  }
];

function dependencies(overrides: Partial<Parameters<typeof runLogsCommand>[1]> = {}) {
  return {
    service: {
      listLogs: vi.fn().mockResolvedValue(logs),
      fetchLog: vi.fn().mockResolvedValue('42.0|EXECUTION_STARTED')
    },
    analyze: vi.fn(),
    write: vi.fn(),
    interactive: false,
    ...overrides
  };
}

describe('logs command', () => {
  it('selects and analyzes the latest available log', async () => {
    const deps = dependencies();

    await runLogsCommand(['--org', 'mbk3', '--latest'], deps);

    expect(deps.service.listLogs).toHaveBeenCalledWith('mbk3');
    expect(deps.service.fetchLog).toHaveBeenCalledWith('mbk3', '07Lnewest');
    expect(deps.analyze).toHaveBeenCalledWith('42.0|EXECUTION_STARTED', 'mbk3:07Lnewest');
  });

  it('selects and analyzes a requested log ID', async () => {
    const deps = dependencies();

    await runLogsCommand(['--org', 'mbk3', '--id', '07Lolder'], deps);

    expect(deps.service.fetchLog).toHaveBeenCalledWith('mbk3', '07Lolder');
  });

  it('prints a complete log discovery table without selecting in non-interactive mode', async () => {
    const deps = dependencies();

    await runLogsCommand(['--org', 'mbk3'], deps);

    expect(deps.write).toHaveBeenCalledWith(expect.stringContaining('DURATION'));
    expect(deps.write).toHaveBeenCalledWith(expect.stringContaining('STATUS'));
    expect(deps.write).toHaveBeenCalledWith(expect.stringContaining('SIZE'));
    expect(deps.write).toHaveBeenCalledWith(expect.stringContaining('No log selected'));
    expect(deps.service.fetchLog).not.toHaveBeenCalled();
  });

  it('filters logs by user and applies the result limit', () => {
    expect(filterLogs(logs, { user: 'dev@', limit: 1 })).toEqual([logs[0]]);
    expect(filterLogs(logs, { limit: 1 })).toEqual([logs[0]]);
  });

  it('handles an empty log list cleanly', async () => {
    const deps = dependencies({ service: { listLogs: vi.fn().mockResolvedValue([]), fetchLog: vi.fn() } });

    await runLogsCommand(['--org', 'mbk3', '--latest'], deps);

    expect(deps.write).toHaveBeenCalledWith('\nNo Salesforce debug logs are available for mbk3.');
  });

  it('rejects an invalid requested log ID', async () => {
    await expect(runLogsCommand(['--id', '07Lmissing'], dependencies()))
      .rejects.toThrow('07Lmissing is not available');
  });

  it('surfaces Salesforce CLI errors', async () => {
    const deps = dependencies({
      service: { listLogs: vi.fn().mockRejectedValue(new Error('Salesforce CLI command failed')), fetchLog: vi.fn() }
    });

    await expect(runLogsCommand(['--latest'], deps))
      .rejects.toThrow('Salesforce CLI command failed');
  });

  it('rejects conflicting selection options', () => {
    expect(() => parseLogsArguments(['--latest', '--id', '07Lone']))
      .toThrow('either --latest or --id');
  });
});
