import { SalesforceCli, SalesforceCliError, type SalesforceCliRunner } from './SalesforceCli.js';
import { SalesforceConnectionService } from './SalesforceConnection.js';

export interface SalesforceOrg {
  alias: string;
  username: string;
  instanceUrl?: string;
  isDefaultUsername: boolean;
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

interface ApexLogRecord {
  Id: string;
  LogUserId?: string;
  LogUser?: { Name?: string };
  Operation?: string;
  Status?: string;
  StartTime?: string;
  DurationMilliseconds?: number;
  LogLength?: number;
}

/**
 * Retrieves and analyzes Salesforce debug logs through JSforce.
 * The Salesforce CLI is used only for local authentication/session discovery.
 */
export class DebugLogService {
  constructor(
    private readonly cli: SalesforceCliRunner = new SalesforceCli(),
    private readonly connectionService = new SalesforceConnectionService(cli)
  ) {}

  /** Connected-org discovery still comes from the local sf auth store. */
  async listOrgs(): Promise<SalesforceOrg[]> {
    const response = this.parseCliJson(await this.cli.run(['org', 'list', '--json']), 'list authenticated orgs');
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
          instanceUrl: this.stringValue(candidate.instanceUrl),
          isDefaultUsername: candidate.isDefaultUsername === true
        });
      }
    }

    return [...orgs.values()].sort((a, b) => {
      if (a.isDefaultUsername !== b.isDefaultUsername) return a.isDefaultUsername ? -1 : 1;
      return a.alias.localeCompare(b.alias);
    });
  }

  async listLogs(org?: string): Promise<DebugLogInfo[]> {
    if (!org) return [];
    console.info(`[LOGS] list logs org=${org}`);
    const connection = await this.connectionService.connect(org);
    const result = await connection.tooling.query<ApexLogRecord>(
      'SELECT Id, LogUserId, LogUser.Name, Operation, Status, StartTime, DurationMilliseconds, LogLength FROM ApexLog ORDER BY StartTime DESC'
    );
    return result.records.map((log) => ({
      id: log.Id,
      userId: log.LogUserId,
      userName: log.LogUser?.Name,
      operation: log.Operation,
      status: log.Status,
      startTime: log.StartTime,
      durationMs: log.DurationMilliseconds,
      logLength: log.LogLength
    }));
  }

  async fetchLog(org: string, logId: string): Promise<string> {
    console.info(`[LOGS] fetch log org=${org} id=${logId}`);
    const connection = await this.connectionService.connect(org);
    const body = await connection.request<string>(`/services/data/${connection.version}/tooling/sobjects/ApexLog/${encodeURIComponent(logId)}/Body`);
    if (typeof body !== 'string') {
      throw new SalesforceCliError(`Salesforce Tooling API returned a non-text ApexLog body for ${logId}.`);
    }
    return body;
  }

  private parseCliJson(output: string, operation: string): { result: unknown } {
    try {
      const cleaned = output.replace(/^\uFEFF/, '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      const json = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
      const value: unknown = JSON.parse(json);
      if (!this.isObject(value) || !('result' in value)) throw new Error('Missing result property');
      return value as { result: unknown };
    } catch (error) {
      throw new SalesforceCliError(`Could not parse Salesforce CLI JSON while attempting to ${operation}.`, error);
    }
  }

  private stringValue(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
  private isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
}
