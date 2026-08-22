import { SalesforceCli, SalesforceCliError, type SalesforceCliRunner } from './SalesforceCli.js';

export interface SalesforceUser {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
}

export interface DebugLevelInfo {
  id: string;
  developerName: string;
  masterLabel: string;
}

export interface TraceFlagInfo {
  id: string;
  tracedEntityId: string;
  debugLevelId: string;
  logType: string;
  startDate?: string;
  expirationDate?: string;
}

export interface CreateTraceFlagInput {
  userId: string;
  debugLevelId?: string;
  durationMinutes?: number;
}

interface CliEnvelope {
  result: unknown;
}

const FINEST_LEVEL_NAME = 'FINEST';
const DEBUG_LEVEL_FIELDS = [
  'ApexCode',
  'ApexProfiling',
  'Callout',
  'Database',
  'System',
  'Validation',
  'Visualforce',
  'Workflow',
  'Wave',
  'Nba'
] as const;

/** Manages user-level USER_DEBUG trace flags through the Salesforce Tooling API via sf CLI. */
export class TraceFlagService {
  constructor(private readonly cli: SalesforceCliRunner = new SalesforceCli()) {}

  async listUsers(org: string): Promise<SalesforceUser[]> {
    const query = `SELECT Id, Name, Username, IsActive FROM User WHERE IsActive = true ORDER BY Name`;
    const response = await this.query(org, query);
    if (!Array.isArray(response)) throw new SalesforceCliError('Salesforce CLI returned an invalid user list.');

    return response
      .filter(this.isObject)
      .map((row) => ({
        id: this.stringValue(row.Id) ?? '',
        name: this.stringValue(row.Name) ?? '',
        username: this.stringValue(row.Username) ?? '',
        isActive: row.IsActive === true
      }))
      .filter((user) => user.id && user.username);
  }

  async listDebugLevels(org: string): Promise<DebugLevelInfo[]> {
    const query = `SELECT Id, DeveloperName, MasterLabel FROM DebugLevel ORDER BY MasterLabel`;
    const response = await this.query(org, query, true);
    if (!Array.isArray(response)) throw new SalesforceCliError('Salesforce CLI returned an invalid debug level list.');

    return response
      .filter(this.isObject)
      .map((row) => ({
        id: this.stringValue(row.Id) ?? '',
        developerName: this.stringValue(row.DeveloperName) ?? '',
        masterLabel: this.stringValue(row.MasterLabel) ?? ''
      }))
      .filter((level) => level.id && level.masterLabel);
  }

  async ensureFinestDebugLevel(org: string): Promise<DebugLevelInfo> {
    const existing = (await this.listDebugLevels(org)).find(
      (level) => level.developerName.toUpperCase() === FINEST_LEVEL_NAME || level.masterLabel.toUpperCase() === FINEST_LEVEL_NAME
    );
    if (existing) return existing;

    const values = [
      `DeveloperName='${FINEST_LEVEL_NAME}'`,
      `MasterLabel='${FINEST_LEVEL_NAME}'`,
      ...DEBUG_LEVEL_FIELDS.map((field) => `${field}=FINEST`)
    ].join(' ');

    const response = await this.parseJson(
      await this.cli.run([
        'data', 'create', 'record',
        '--target-org', org,
        '--use-tooling-api',
        '--sobject', 'DebugLevel',
        '--values', values,
        '--json'
      ]),
      'create FINEST debug level'
    );

    const createdId = this.extractId(response);
    if (!createdId) throw new SalesforceCliError('Salesforce CLI did not return the created FINEST DebugLevel ID.');

    return { id: createdId, developerName: FINEST_LEVEL_NAME, masterLabel: FINEST_LEVEL_NAME };
  }

  async createOrUpdateUserTraceFlag(org: string, input: CreateTraceFlagInput): Promise<TraceFlagInfo> {
    const durationMinutes = Math.min(Math.max(input.durationMinutes ?? 30, 1), 24 * 60);
    const start = new Date();
    const expiration = new Date(start.getTime() + durationMinutes * 60_000);

    const debugLevel = input.debugLevelId
      ? { id: input.debugLevelId }
      : await this.ensureFinestDebugLevel(org);

    const existing = await this.findActiveUserTraceFlag(org, input.userId);
    const values = [
      `TracedEntityId=${input.userId}`,
      `DebugLevelId=${debugLevel.id}`,
      `LogType=USER_DEBUG`,
      `StartDate=${start.toISOString()}`,
      `ExpirationDate=${expiration.toISOString()}`
    ].join(' ');

    if (existing) {
      await this.cli.run([
        'data', 'update', 'record',
        '--target-org', org,
        '--use-tooling-api',
        '--sobject', 'TraceFlag',
        '--record-id', existing.id,
        '--values', values,
        '--json'
      ]);
      return {
        ...existing,
        debugLevelId: debugLevel.id,
        startDate: start.toISOString(),
        expirationDate: expiration.toISOString()
      };
    }

    const response = await this.parseJson(
      await this.cli.run([
        'data', 'create', 'record',
        '--target-org', org,
        '--use-tooling-api',
        '--sobject', 'TraceFlag',
        '--values', values,
        '--json'
      ]),
      'create user trace flag'
    );

    const id = this.extractId(response);
    if (!id) throw new SalesforceCliError('Salesforce CLI did not return the created TraceFlag ID.');

    return {
      id,
      tracedEntityId: input.userId,
      debugLevelId: debugLevel.id,
      logType: 'USER_DEBUG',
      startDate: start.toISOString(),
      expirationDate: expiration.toISOString()
    };
  }

  private async findActiveUserTraceFlag(org: string, userId: string): Promise<TraceFlagInfo | undefined> {
    const query = `SELECT Id, TracedEntityId, DebugLevelId, LogType, StartDate, ExpirationDate FROM TraceFlag WHERE TracedEntityId = '${userId}' AND LogType = 'USER_DEBUG'`;
    const response = await this.query(org, query, true);
    if (!Array.isArray(response)) return undefined;

    const now = Date.now();
    for (const value of response) {
      if (!this.isObject(value) || typeof value.Id !== 'string') continue;
      const expiration = this.stringValue(value.ExpirationDate);
      if (!expiration || new Date(expiration).getTime() > now) {
        return {
          id: value.Id,
          tracedEntityId: this.stringValue(value.TracedEntityId) ?? userId,
          debugLevelId: this.stringValue(value.DebugLevelId) ?? '',
          logType: this.stringValue(value.LogType) ?? 'USER_DEBUG',
          startDate: this.stringValue(value.StartDate),
          expirationDate: expiration
        };
      }
    }
    return undefined;
  }

  private async query(org: string, soql: string, tooling = false): Promise<unknown> {
    const args = ['data', 'query', '--target-org', org, '--query', soql, '--result-format', 'json', '--json'];
    if (tooling) args.push('--use-tooling-api');
    const output = await this.cli.run(args);
    const response = this.parseJson(output, 'query Salesforce');
    return response.result;
  }

  private parseJson(output: string, operation: string): CliEnvelope {
    try {
      const value: unknown = JSON.parse(output);
      if (!this.isObject(value) || !('result' in value)) throw new Error('Missing result property');
      return value as unknown as CliEnvelope;
    } catch (error) {
      throw new SalesforceCliError(`Could not parse Salesforce CLI JSON while attempting to ${operation}.`, error);
    }
  }

  private extractId(response: CliEnvelope): string | undefined {
    if (this.isObject(response.result)) {
      for (const field of ['id', 'Id']) {
        const value = response.result[field];
        if (typeof value === 'string') return value;
      }
      const nested = response.result.result;
      if (typeof nested === 'string') return nested;
      if (this.isObject(nested) && typeof nested.id === 'string') return nested.id;
    }
    return undefined;
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private isObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null;
  }
}
