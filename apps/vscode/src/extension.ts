import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';

import { DebugLogService, TraceFlagService } from '@traceforge/salesforce';
import { createWebviewHandler } from './webviewBridge.js';

const VIEW_TYPE = 'traceforge';
const PANEL_TITLE = 'TraceForge';

/** VS Code extension entry point. The extension host owns all local operations. */
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
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media', 'web')],
      },
    );

    void setWebviewContent(panel.webview, context.extensionUri);

    const bridge = createWebviewHandler(panel.webview, services);
    panel.onDidDispose(() => {
      bridge.dispose();
      panel = undefined;
    });

    return panel;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('traceforge.open', () => open()),
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

        await currentPanel.webview.postMessage({
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
  // No persistent resources need explicit cleanup.
}

/** Load the Vite build and rewrite local asset references to Webview URIs. */
async function setWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): Promise<void> {
  const webRoot = vscode.Uri.joinPath(extensionUri, 'media', 'web');
  const indexPath = join(extensionUri.fsPath, 'media', 'web', 'index.html');
  const source = await readFile(indexPath, 'utf8');
  const nonce = createNonce();

  const html = source.replace(
    /(src|href)="(\.\/|\/)?([^"]+)"/g,
    (match, attribute: string, _prefix: string, asset: string) => {
      if (!asset.startsWith('assets/')) return match;
      const uri = webview.asWebviewUri(vscode.Uri.joinPath(webRoot, asset));
      return `${attribute}="${uri}"`;
    },
  ).replace(
    /<script([^>]*?)>/g,
    (_match, attributes: string) => `<script nonce="${nonce}"${attributes}>`,
  );

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `font-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `connect-src ${webview.cspSource}`,
  ].join('; ');

  webview.html = html.replace(
    '<head>',
    `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
  );
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(
    { length: 32 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
