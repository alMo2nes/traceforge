import * as vscode from 'vscode';
import { DebugLogService, TraceFlagService } from '@traceforge/salesforce';
import { analyzeLog } from '@traceforge/investigation';

export interface WebviewRequest {
  type: 'request';
  id: string;
  method:
    | 'listOrgs'
    | 'listUsers'
    | 'listDebugLevels'
    | 'listLogs'
    | 'fetchLog'
    | 'investigateLog'
    | 'createTraceFlag'
    | 'openSource';
  args: Record<string, unknown>;
}

interface ExtensionServices {
  debugLogs: DebugLogService;
  traceFlags: TraceFlagService;
}

interface BridgeResponse {
  type: 'response';
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Handle all messages coming from the React Webview. Keeping this boundary
 * small makes it possible to reuse the same React UI from a future IntelliJ plugin.
 */
export function createWebviewHandler(
  webview: vscode.Webview,
  services: ExtensionServices,
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return webview.onDidReceiveMessage(async (message: WebviewRequest) => {
    if (!isRequest(message)) return;

    try {
      const result = await handleRequest(message, services, context);
      const response: BridgeResponse = {
        type: 'response',
        id: message.id,
        success: true,
        result,
      };
      await webview.postMessage(response);
    } catch (error) {
      const response: BridgeResponse = {
        type: 'response',
        id: message.id,
        success: false,
        error: errorMessage(error),
      };
      await webview.postMessage(response);
    }
  });
}

async function handleRequest(
  request: WebviewRequest,
  services: ExtensionServices,
  context: vscode.ExtensionContext,
): Promise<unknown> {
  const org = stringArg(request.args, 'org');
  const logId = stringArg(request.args, 'logId');

  switch (request.method) {
    case 'listOrgs':
      return services.debugLogs.listOrgs();

    case 'listUsers':
      assertRequired(org, 'org');
      return services.traceFlags.listUsers(org);

    case 'listDebugLevels': {
      assertRequired(org, 'org');
      const levels = await services.traceFlags.listDebugLevels(org);
      const finest = levels.some(
        (level) =>
          level.developerName.toUpperCase() === 'FINEST' ||
          level.masterLabel.toUpperCase() === 'FINEST',
      );
      return {
        levels,
        finestAvailable: finest,
        finestAutoCreate: !finest,
      };
    }

    case 'listLogs':
      assertRequired(org, 'org');
      return services.debugLogs.listLogs(org);

    case 'fetchLog':
      assertRequired(org, 'org');
      assertRequired(logId, 'logId');
      return { content: await services.debugLogs.fetchLog(org, logId) };

    case 'investigateLog': {
      assertRequired(org, 'org');
      assertRequired(logId, 'logId');
      const content = await services.debugLogs.fetchLog(org, logId);
      const result = analyzeLog(content);
      return {
        nodes: result,
        isTruncated: content.includes('MAXIMUM DEBUG LOG SIZE REACHED'),
      };
    }

    case 'createTraceFlag': {
      assertRequired(org, 'org');
      const userId = stringArg(request.args, 'userId');
      assertRequired(userId, 'userId');

      const debugLevelId = stringArg(request.args, 'debugLevelId');
      const durationMinutes = numberArg(request.args, 'durationMinutes', 30);

      return services.traceFlags.createOrUpdateUserTraceFlag(org, {
        userId,
        debugLevelId,
        durationMinutes,
      });
    }

    case 'openSource':
      return openSource(request.args, context);
  }
}

/** Open the Apex class inferred from a method/code-unit label at its source line. */
async function openSource(
  args: Record<string, unknown>,
  context: vscode.ExtensionContext,
): Promise<boolean> {
  const label = stringArg(args, 'label');
  const line = numberArg(args, 'line', 1);

  if (!label) return false;

  const match = label.match(/^([A-Za-z0-9_]+)\./);
  const className = match?.[1] ?? label.replace(/\(.*$/, '').trim();
  if (!className) return false;

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    throw new Error('Open a Salesforce project/workspace before opening source.');
  }

  const files = await vscode.workspace.findFiles(
    `**/${className}.cls`,
    '**/node_modules/**',
    20,
  );
  const file = files[0];

  if (!file) {
    throw new Error(`Could not find ${className}.cls in the current workspace.`);
  }

  const document = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(document, {
    selection: new vscode.Range(Math.max(0, line - 1), 0, Math.max(0, line - 1), 0),
    preview: false,
  });

  return true;
}

function isRequest(value: unknown): value is WebviewRequest {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Partial<WebviewRequest>;
  return request.type === 'request' && typeof request.id === 'string' && typeof request.method === 'string';
}

function stringArg(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberArg(args: Record<string, unknown>, name: string, fallback: number): number {
  return typeof args[name] === 'number' && Number.isFinite(args[name]) ? Number(args[name]) : fallback;
}

function assertRequired(value: string | undefined, name: string): asserts value is string {
  if (!value) throw new Error(`${name} is required`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
