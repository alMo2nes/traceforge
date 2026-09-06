import * as vscode from 'vscode';
import { DebugLogService } from '@traceforge/salesforce';
import { TraceFlagService } from '@traceforge/salesforce';
import { analyzeLog } from '@traceforge/investigation';
import { createWebviewHandler, type WebviewRequest } from './webviewBridge.js';

const VIEW_TYPE = 'traceforge';
const PANEL_TITLE = 'TraceForge';

/**
 * VS Code extension entry point. The extension host owns all local-machine and
 * Salesforce operations; the React application runs as an isolated Webview.
 */
export function activate(context: vscode.ExtensionContext): void {
  const services = {
    debugLogs: new DebugLogService(),
    traceFlags: new TraceFlagService(),
  };

  let panel: vscode.WebviewPanel | undefined;

  const open = () => {
    if (panel) {
      panel.reveal(vscode.ViewColumn.One);
      return panel;
    }

    panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      PANEL_TITLE,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'media', 'web'),
        ],
      },
    );

    panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

    const disposable = createWebviewHandler(
      panel.webview,
      services,
      context,
    );
    panel.onDidDispose(() => {
      disposable.dispose();
      panel = undefined;
    });

    return panel;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('traceforge.open', () => {
      open();
    }),
    vscode.commands.registerCommand('traceforge.analyzeLatestLog', async () => {
      const currentPanel = open();

      try {
        const orgs = await services.debugLogs.listOrgs();
        const org = orgs.find((item) => item.isDefaultUsername) ?? orgs[0];

        if (!org) {
          await vscode.window.showWarningMessage(
            'TraceForge could not find an authenticated Salesforce org.',
          );
          return;
        }

        const logs = await services.debugLogs.listLogs(org.alias);
        const latest = logs[0];

        if (!latest) {
          await vscode.window.showInformationMessage(
            `No Salesforce debug logs were found for ${org.alias}.`,
          );
          return;
        }

        currentPanel.webview.postMessage({
          type: 'open-log',
          org: org.alias,
          logId: latest.id,
        });
      } catch (error) {
        await vscode.window.showErrorMessage(errorMessage(error));
      }
    }),
  );
}

export function deactivate(): void {
  // Services use short-lived Salesforce connections, so no explicit shutdown work is required.
}

/**
 * Build the HTML shell around the Vite-generated React application.
 * The CSP permits only scripts/styles served from the extension Webview source.
 */
function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const webRoot = vscode.Uri.joinPath(extensionUri, 'media', 'web');
  const indexUri = webview.asWebviewUri(vscode.Uri.joinPath(webRoot, 'index.html'));
  const nonce = createNonce();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource};"
  />
  <title>TraceForge</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${indexUri}"></script>
</body>
</html>`;
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Keep the request type import visible to TypeScript when the bridge is tree-shaken by the bundler. */
void (undefined as unknown as WebviewRequest);
