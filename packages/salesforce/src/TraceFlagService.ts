import { SalesforceCliError } from './SalesforceCli.js';
import { SalesforceConnectionService } from './SalesforceConnection.js';

export interface SalesforceUser { id: string; name: string; username: string; isActive: boolean; }
export interface DebugLevelInfo { id: string; developerName: string; masterLabel: string; }
export interface TraceFlagInfo { id: string; tracedEntityId: string; debugLevelId: string; logType: string; startDate?: string; expirationDate?: string; }
export interface CreateTraceFlagInput { userId: string; debugLevelId?: string; durationMinutes?: number; }

interface TraceFlagRecord {
  Id: string;
  TracedEntityId: string;
  DebugLevelId: string;
  LogType: string;
  StartDate?: string;
  ExpirationDate?: string;
}

const FINEST_LEVEL_NAME = 'FINEST';
const DEBUG_LEVEL_FIELDS = ['ApexCode','ApexProfiling','Callout','Database','System','Validation','Visualforce','Workflow'] as const;

/** Manages user-level USER_DEBUG TraceFlags directly through Salesforce Tooling API via JSforce. */
export class TraceFlagService {
  constructor(private readonly connectionService = new SalesforceConnectionService()) {}

  async listUsers(org: string): Promise<SalesforceUser[]> {
    console.info(`[TRACE] list users org=${org}`);
    const connection = await this.connectionService.connect(org);
    const result = await connection.query<{ Id: string; Name: string; Username: string; IsActive: boolean }>(
      'SELECT Id, Name, Username, IsActive FROM User WHERE IsActive = true ORDER BY Name'
    );
    return result.records.map((row) => ({ id: row.Id, name: row.Name, username: row.Username, isActive: row.IsActive }));
  }

  async listDebugLevels(org: string): Promise<DebugLevelInfo[]> {
    console.info(`[TRACE] list debug levels org=${org}`);
    const connection = await this.connectionService.connect(org);
    const result = await connection.tooling.query<{ Id: string; DeveloperName: string; MasterLabel: string }>(
      'SELECT Id, DeveloperName, MasterLabel FROM DebugLevel ORDER BY MasterLabel'
    );
    return result.records.map((row) => ({ id: row.Id, developerName: row.DeveloperName, masterLabel: row.MasterLabel }));
  }

  async ensureFinestDebugLevel(org: string): Promise<DebugLevelInfo> {
    const levels = await this.listDebugLevels(org);
    const existing = levels.find((level) =>
      level.developerName.toUpperCase() === FINEST_LEVEL_NAME || level.masterLabel.toUpperCase() === FINEST_LEVEL_NAME
    );
    if (existing) {
      console.info(`[TRACE] using existing FINEST debug level id=${existing.id}`);
      return existing;
    }

    const connection = await this.connectionService.connect(org);
    console.info(`[TRACE] creating FINEST debug level org=${org}`);
    const record: Record<string, string> = {
      DeveloperName: FINEST_LEVEL_NAME,
      MasterLabel: FINEST_LEVEL_NAME
    };
    for (const field of DEBUG_LEVEL_FIELDS) record[field] = FINEST_LEVEL_NAME;

    const created = await connection.tooling.sobject('DebugLevel').create(record);
    if (!created.success || !created.id) {
      throw new SalesforceCliError(`Salesforce Tooling API failed to create FINEST DebugLevel: ${created.errors?.map((e) => e.message).join('; ') ?? 'unknown error'}`);
    }
    console.info(`[TRACE] created FINEST debug level id=${created.id}`);
    return { id: created.id, developerName: FINEST_LEVEL_NAME, masterLabel: FINEST_LEVEL_NAME };
  }

  async createOrUpdateUserTraceFlag(org: string, input: CreateTraceFlagInput): Promise<TraceFlagInfo> {
    const durationMinutes = Math.min(Math.max(input.durationMinutes ?? 30, 1), 24 * 60);
    const start = new Date();
    const expiration = new Date(start.getTime() + durationMinutes * 60_000);
    console.info(`[TRACE] start org=${org} user=${input.userId} debugLevel=${input.debugLevelId ?? 'AUTO-FINEST'} durationMinutes=${durationMinutes}`);

    const debugLevel = input.debugLevelId ? { id: input.debugLevelId } : await this.ensureFinestDebugLevel(org);
    const existing = await this.findActiveUserTraceFlag(org, input.userId);
    const values = {
      TracedEntityId: input.userId,
      DebugLevelId: debugLevel.id,
      LogType: 'USER_DEBUG',
      StartDate: start.toISOString(),
      ExpirationDate: expiration.toISOString()
    };
    const connection = await this.connectionService.connect(org);

    if (existing) {
      console.info(`[TRACE] updating existing TraceFlag id=${existing.id}`);
      const updated = await connection.tooling.sobject('TraceFlag').update({ Id: existing.id, ...values });
      if (!updated.success) {
        throw new SalesforceCliError(`Salesforce Tooling API failed to update TraceFlag: ${updated.errors?.map((e) => e.message).join('; ') ?? 'unknown error'}`);
      }
      return { ...existing, debugLevelId: debugLevel.id, startDate: start.toISOString(), expirationDate: expiration.toISOString() };
    }

    console.info(`[TRACE] creating TraceFlag user=${input.userId}`);
    const created = await connection.tooling.sobject('TraceFlag').create(values);
    if (!created.success || !created.id) {
      throw new SalesforceCliError(`Salesforce Tooling API failed to create TraceFlag: ${created.errors?.map((e) => e.message).join('; ') ?? 'unknown error'}`);
    }
    console.info(`[TRACE] TraceFlag created id=${created.id} user=${input.userId}`);
    return { id: created.id, tracedEntityId: input.userId, debugLevelId: debugLevel.id, logType: 'USER_DEBUG', startDate: start.toISOString(), expirationDate: expiration.toISOString() };
  }

  private async findActiveUserTraceFlag(org: string, userId: string): Promise<TraceFlagInfo | undefined> {
    console.info(`[TRACE] looking for active TraceFlag user=${userId}`);
    const connection = await this.connectionService.connect(org);
    const query = `SELECT Id, TracedEntityId, DebugLevelId, LogType, StartDate, ExpirationDate FROM TraceFlag WHERE TracedEntityId = '${userId}' AND LogType = 'USER_DEBUG' ORDER BY ExpirationDate DESC`;
    const result = await connection.tooling.query<TraceFlagRecord>(query);
    const now = Date.now();
    for (const value of result.records) {
      if (!value.ExpirationDate || new Date(value.ExpirationDate).getTime() > now) {
        console.info(`[TRACE] found active TraceFlag id=${value.Id}`);
        return {
          id: value.Id,
          tracedEntityId: value.TracedEntityId,
          debugLevelId: value.DebugLevelId,
          logType: value.LogType,
          startDate: value.StartDate,
          expirationDate: value.ExpirationDate
        };
      }
    }
    console.info('[TRACE] no active TraceFlag found');
    return undefined;
  }
}
