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

interface VsCodeApi {
  postMessage(message: unknown): void;
}

interface VsCodeResponse {
  type: 'response';
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

/**
 * The same React application can run in two hosts:
 * - a normal browser, where requests use the local HTTP development API;
 * - a VS Code Webview, where requests cross the Webview/extension boundary.
 */
export const vscodeApi =
  typeof window !== 'undefined' && window.acquireVsCodeApi
    ? window.acquireVsCodeApi()
    : undefined;

const pendingBridgeRequests = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }
>();

if (vscodeApi && typeof window !== 'undefined') {
  window.addEventListener(
    'message',
    (event: MessageEvent<VsCodeResponse>) => {
      const message = event.data;
      if (!message || message.type !== 'response') return;

      const pending = pendingBridgeRequests.get(message.id);
      if (!pending) return;

      pendingBridgeRequests.delete(message.id);

      if (message.success) {
        pending.resolve(message.result);
      } else {
        pending.reject(
          new Error(
            message.error ?? 'TraceForge extension request failed.',
          ),
        );
      }
    },
  );
}

function createRequestId(): string {
  return `tf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Send one operation to the VS Code extension host and await its response. */
function requestViaExtension<T>(
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!vscodeApi) {
    return Promise.reject(
      new Error('TraceForge VS Code bridge is unavailable.'),
    );
  }

  const id = createRequestId();

  return new Promise<T>((resolve, reject) => {
    pendingBridgeRequests.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
    });

    vscodeApi.postMessage({
      type: 'request',
      id,
      method,
      args,
    });
  });
}

const API_BASE = (
  import.meta.env.VITE_TRACEFORGE_API_URL ?? 'http://localhost:3001'
).replace(/\/$/, '');

/** Browser-mode HTTP client retained for standalone development. */
async function requestHttp<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
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

function request<T>(
  method: string,
  path: string,
  args: Record<string, unknown> = {},
  init?: RequestInit,
): Promise<T> {
  return vscodeApi
    ? requestViaExtension<T>(method, args)
    : requestHttp<T>(path, init);
}

export const traceforgeApi = {
  listOrgs: () =>
    request<OrgInfo[]>('listOrgs', '/api/orgs'),

  listUsers: (org: string) =>
    request<SalesforceUserInfo[]>(
      'listUsers',
      `/api/orgs/${encodeURIComponent(org)}/users`,
      { org },
    ),

  listDebugLevels: (org: string) =>
    request<DebugLevelResponse>(
      'listDebugLevels',
      `/api/orgs/${encodeURIComponent(org)}/debug-levels`,
      { org },
    ),

  listLogs: (org: string) =>
    request<DebugLogInfo[]>(
      'listLogs',
      `/api/orgs/${encodeURIComponent(org)}/logs`,
      { org },
    ),

  fetchLog: (org: string, logId: string) =>
    request<{ content: string }>(
      'fetchLog',
      `/api/orgs/${encodeURIComponent(org)}/logs/${encodeURIComponent(logId)}`,
      { org, logId },
    ),

  investigateLog: (org: string, logId: string) =>
    request<InvestigationResponseDto>(
      'investigateLog',
      `/api/orgs/${encodeURIComponent(org)}/logs/${encodeURIComponent(logId)}/investigation`,
      { org, logId },
    ),

  createTraceFlag: (
    org: string,
    payload: {
      userId: string;
      debugLevelId?: string;
      durationMinutes: number;
    },
  ) =>
    request<TraceFlagResult>(
      'createTraceFlag',
      `/api/orgs/${encodeURIComponent(org)}/trace-flags`,
      { org, ...payload },
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    ),

  /** Open the selected Apex class at its source line in VS Code when available. */
  openSource: (label: string, line?: number) =>
    request<boolean>('openSource', '', { label, line }),
};
