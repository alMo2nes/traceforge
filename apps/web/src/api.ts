export interface OrgInfo {
  alias: string;
  username?: string;
  instanceUrl?: string;
  isDefaultUsername: boolean;
}

export interface SalesforceUserInfo {
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

export interface DebugLevelResponse {
  levels: DebugLevelInfo[];
  finestAvailable: boolean;
  finestAutoCreate: boolean;
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

export interface InvestigationVariable {
  name: string;
  type: string;
  value: string;
}

export interface InvestigationNodeDto {
  id: string;
  kind:
    | 'transaction'
    | 'code-unit'
    | 'method'
    | 'soql'
    | 'dml'
    | 'flow'
    | 'exception';
  label: string;
  subtitle?: string;
  line?: number;
  timestamp: string;
  durationMs?: number;
  status?: 'ok' | 'error' | 'info';
  variables: InvestigationVariable[];
  logOutput?: string;
  children: InvestigationNodeDto[];
}

export interface GovernorLimitUsageDto {
  namespace: string;
  metrics: Record<string, { used: number; limit: number }>;
}

export interface InvestigationResponseDto {
  nodes: InvestigationNodeDto[];
  summaries?: {
    governorLimits: GovernorLimitUsageDto[];
    emailsQueued?: number;
  };
  isTruncated?: boolean;
}

export interface TraceFlagResult {
  id: string;
  tracedEntityId: string;
  debugLevelId: string;
  logType: string;
  startDate?: string;
  expirationDate?: string;
}

// The web client defaults to the local development API but can be pointed at
// another server through Vite's VITE_TRACEFORGE_API_URL environment variable.
const API_BASE = (
  import.meta.env.VITE_TRACEFORGE_API_URL ?? 'http://localhost:3001'
).replace(/\/$/, '');

/**
 * Common HTTP wrapper used by all API calls. It normalizes non-2xx responses
 * into Error instances so the UI can display a consistent connection message.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const payload: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : `${response.status} ${response.statusText}`;

    throw new Error(message);
  }

  return payload as T;
}

export const traceforgeApi = {
  // Salesforce org discovery and configuration.
  listOrgs: () => request<OrgInfo[]>('/api/orgs'),
  listUsers: (org: string) =>
    request<SalesforceUserInfo[]>(
      `/api/orgs/${encodeURIComponent(org)}/users`,
    ),
  listDebugLevels: (org: string) =>
    request<DebugLevelResponse>(
      `/api/orgs/${encodeURIComponent(org)}/debug-levels`,
    ),

  // Debug-log retrieval and investigation.
  listLogs: (org: string) =>
    request<DebugLogInfo[]>(
      `/api/orgs/${encodeURIComponent(org)}/logs`,
    ),
  fetchLog: (org: string, logId: string) =>
    request<{ content: string }>(
      `/api/orgs/${encodeURIComponent(org)}/logs/${encodeURIComponent(logId)}`,
    ),
  investigateLog: (org: string, logId: string) =>
    request<InvestigationResponseDto>(
      `/api/orgs/${encodeURIComponent(org)}/logs/${encodeURIComponent(logId)}/investigation`,
    ),

  // Trace-flag management for capturing subsequent transactions.
  createTraceFlag: (
    org: string,
    payload: {
      userId: string;
      debugLevelId?: string;
      durationMinutes: number;
    },
  ) =>
    request<TraceFlagResult>(
      `/api/orgs/${encodeURIComponent(org)}/trace-flags`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    ),
};
