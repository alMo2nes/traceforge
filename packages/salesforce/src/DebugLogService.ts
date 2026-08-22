import { SalesforceCli, SalesforceCliError, type SalesforceCliRunner } from './SalesforceCli.js';

export interface SalesforceOrg {
  alias: string;
  username?: string;
  instanceUrl?: string;
}

export interface DebugLogInfo {
  id: string;
  userId?: string;
  userName?: string;
  operation?: string;
  status?: string;
  startTime?: string;
  durationMs?: number;
  logLength?: number;
}

interface SalesforceCliEnvelope {
  result: unknown;
}

interface SalesforceCliDebugLog {
  Id?: unknown;
  LogUserId?: unknown;
  LogUser?: { Name?: unknown };
  Operation?: unknown;
  Status?: unknown;
  StartTime?: unknown;
  DurationMilliseconds?: unknown;
  LogLength?: unknown;
}

/**
 * Retrieves Apex debug logs through the locally authenticated Salesforce CLI.
 * No credentials are read or managed by TraceForge.
 */
export class DebugLogService {
  constructor(private readonly cli: SalesforceCliRunner = new SalesforceCli()) {}

  async listOrgs(): Promise<SalesforceOrg[]> {
    const response = this.parseJson(
      await this.cli.run(['org', 'list', '--json']),
      'list authenticated orgs'
    );

    if (!this.isObject(response.result)) {
      throw new SalesforceCliError('Salesforce CLI returned an invalid org list.');
    }

    const orgs = new Map<string, SalesforceOrg>();
    for (const group of Object.values(response.result)) {
      if (!Array.isArray(group)) continue;

      for (const candidate of group) {
        if (!this.isObject(candidate) || typeof candidate.username !== 'string') continue;

        const alias = typeof candidate.alias === 'string' ? candidate.alias : candidate.username;
        orgs.set(candidate.username, {
          alias,
          username: candidate.username,
          instanceUrl: this.stringValue(candidate.instanceUrl)
        });
      }
    }

    return [...orgs.values()].sort((a, b) => a.alias.localeCompare(b.alias));
  }

  async listLogs(org?: string): Promise<DebugLogInfo[]> {
    const targetOrgArgs = org ? ['--target-org', org] : [];
    const response = this.parseJson(
      await this.cli.run(['apex', 'list', 'log', ...targetOrgArgs, '--json']),
      `list debug logs${org ? ` for ${org}` : ''}`
    );

    if (!Array.isArray(response.result)) {
      throw new SalesforceCliError('Salesforce CLI returned an invalid debug log list.');
    }

    return response.result
      .map((value) => this.toDebugLog(value))
      .filter((value): value is DebugLogInfo => value !== undefined)
      .sort((a, b) => (b.startTime ?? '').localeCompare(a.startTime ?? ''));
  }

  async fetchLog(org: string | undefined, logId: string): Promise<string> {
    const targetOrgArgs = org ? ['--target-org', org] : [];
    const output = await this.cli.run([
      'apex', 'get', 'log', ...targetOrgArgs, '--log-id', logId
    ]);

    return this.extractLogContent(output);
  }

  private extractLogContent(output: string): string {
    try {
      const value: unknown = JSON.parse(output);

      if (this.isObject(value) && 'result' in value) {
        const response = value as unknown as SalesforceCliEnvelope;

        if (typeof response.result === 'string') return response.result;

        if (Array.isArray(response.result)) {
          const first = response.result[0];
          if (this.isObject(first) && typeof first.log === 'string') return first.log;
        }

        if (this.isObject(response.result)) {
          for (const property of ['log', 'content', 'output']) {
            const content = response.result[property];
            if (typeof content === 'string') return content;
          }
        }
      }
    } catch {
      // The Salesforce CLI normally returns the log body directly.
    }

    return output;
  }

  private parseJson(output: string, operation: string): SalesforceCliEnvelope {
    try {
      const value: unknown = JSON.parse(output);
      if (!this.isObject(value) || !('result' in value)) {
        throw new Error('Missing result property');
      }
      return value as unknown as SalesforceCliEnvelope;
    } catch (error) {
      throw new SalesforceCliError(
        `Could not parse Salesforce CLI JSON while attempting to ${operation}.`,
        error
      );
    }
  }

  private toDebugLog(value: unknown): DebugLogInfo | undefined {
    if (!this.isObject(value) || typeof value.Id !== 'string') return undefined;

    const log = value as SalesforceCliDebugLog;
    return {
      id: value.Id,
      userId: this.stringValue(log.LogUserId),
      userName: this.stringValue(log.LogUser?.Name),
      operation: this.stringValue(log.Operation),
      status: this.stringValue(log.Status),
      startTime: this.stringValue(log.StartTime),
      durationMs: this.numberValue(log.DurationMilliseconds),
      logLength: this.numberValue(log.LogLength)
    };
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private numberValue(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
