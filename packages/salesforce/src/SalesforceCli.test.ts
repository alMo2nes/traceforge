import { execFile } from 'node:child_process';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DebugLogService } from './DebugLogService.js';
import { SalesforceCli, SalesforceCliError, type SalesforceCliRunner } from './SalesforceCli.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn()
}));

const mockedExecFile = vi.mocked(execFile);

describe('SalesforceCli', () => {
  beforeEach(() => {
    mockedExecFile.mockReset();
  });

  it('runs sf with the supplied arguments', async () => {
    mockedExecFile.mockImplementation((_file, _args, _options, callback) => {
      callback?.(null, '{"status":0,"result":[]}\n', '');
      return undefined as never;
    });

    await expect(new SalesforceCli().run(['apex', 'list', 'log', '--json']))
      .resolves.toBe('{"status":0,"result":[]}\n');

    expect(mockedExecFile).toHaveBeenCalledWith(
      'sf',
      ['apex', 'list', 'log', '--json'],
      expect.objectContaining({ maxBuffer: 32 * 1024 * 1024 }),
      expect.any(Function)
    );
  });

  it('reports a missing Salesforce CLI clearly', async () => {
    const missing = Object.assign(new Error('spawn sf ENOENT'), { code: 'ENOENT' });
    mockedExecFile.mockImplementation((_file, _args, _options, callback) => {
      callback?.(missing, '', '');
      return undefined as never;
    });

    await expect(new SalesforceCli().run(['apex', 'list', 'log', '--json']))
      .rejects.toThrow('Salesforce CLI is not installed');
  });

  it('reports unauthenticated org errors clearly', async () => {
    const failure = Object.assign(new Error('command failed'), {
      stderr: 'Target org is not authenticated.'
    });
    mockedExecFile.mockImplementation((_file, _args, _options, callback) => {
      callback?.(failure, '', failure.stderr);
      return undefined as never;
    });

    await expect(new SalesforceCli().run(['apex', 'list', 'log', '--json']))
      .rejects.toThrow('not authenticated');
  });
});

describe('DebugLogService', () => {
  it('maps and sorts JSON debug log records', async () => {
    const cli: SalesforceCliRunner = {
      run: vi.fn().mockResolvedValue(JSON.stringify({
        status: 0,
        result: [
          { Id: '07Lolder', StartTime: '2026-01-01T00:00:00.000+0000', Operation: 'EXECUTION' },
          {
            Id: '07Lnewer',
            StartTime: '2026-01-02T00:00:00.000+0000',
            DurationMilliseconds: 25,
            LogLength: 42,
            LogUserId: '005user',
            LogUser: { Name: 'user@example.com' }
          }
        ]
      }))
    };

    const logs = await new DebugLogService(cli).listLogs('dev-org');

    expect(logs.map((log) => log.id)).toEqual(['07Lnewer', '07Lolder']);
    expect(logs[0]).toMatchObject({
      userId: '005user', userName: 'user@example.com', durationMs: 25, logLength: 42
    });
    expect(cli.run).toHaveBeenCalledWith([
      'apex', 'list', 'log', '--target-org', 'dev-org', '--json'
    ]);
  });

  it('discovers the default username and sorts it first', async () => {
    const cli: SalesforceCliRunner = {
      run: vi.fn().mockResolvedValue(JSON.stringify({
        status: 0,
        result: {
          scratchOrgs: [
            { alias: 'other-org', username: 'other@example.com', isDefaultUsername: false },
            { alias: 'default-org', username: 'default@example.com', isDefaultUsername: true }
          ]
        }
      }))
    };

    const orgs = await new DebugLogService(cli).listOrgs();

    expect(orgs[0]).toMatchObject({ alias: 'default-org', username: 'default@example.com', isDefaultUsername: true });
    expect(orgs[1]).toMatchObject({ alias: 'other-org', username: 'other@example.com', isDefaultUsername: false });
  });

  it('extracts a log from the Salesforce CLI JSON response', async () => {
    const cli: SalesforceCliRunner = {
      run: vi.fn().mockResolvedValue(JSON.stringify({ status: 0, result: '42.0|EXECUTION_STARTED' }))
    };

    await expect(new DebugLogService(cli).fetchLog('dev-org', '07Llog'))
      .resolves.toBe('42.0|EXECUTION_STARTED');
  });

  it('extracts the log array returned by sf apex get log', async () => {
    const cli: SalesforceCliRunner = {
      run: vi.fn().mockResolvedValue(JSON.stringify({
        status: 0, result: [{ log: '42.0|EXECUTION_STARTED' }]
      }))
    };

    await expect(new DebugLogService(cli).fetchLog('dev-org', '07Llog'))
      .resolves.toBe('42.0|EXECUTION_STARTED');
  });

  it('rejects malformed list responses', async () => {
    const cli: SalesforceCliRunner = { run: vi.fn().mockResolvedValue('{"status":0,"result":{}}') };

    await expect(new DebugLogService(cli).listLogs('dev-org'))
      .rejects.toBeInstanceOf(SalesforceCliError);
  });
});
