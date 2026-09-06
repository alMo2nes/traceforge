import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';

import { DebugLogService, TraceFlagService } from '@traceforge/salesforce';
import { createWebviewHandler } from './webviewBridge.js';
import { TraceForgeSidebarProvider } from './SidebarProvider.js';

const TRANSACTION_VIEW_TYPE = 'traceforge.transaction';
const TRANSACTION_TITLE = 'TraceForge: Transaction';
const INSPECTOR_VIEW_ID = 'traceforge.inspector';
const WEB_ROOT = 'media/web';

export class TraceForgeInspectorProvider implements vscode.WebviewViewProvider {
  private webview?: vscode.Webview;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webview = webviewView.webview;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, WEB_ROOT)],
    };
    void setWebviewContent(webviewView.webview, this.context.extensionUri, 'inspector');
  }

  postMessage(message: unknown): void {
    void this.webview?.postMessage(message);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const services = {
    debugLogs: new DebugLogService(),
    traceFlags: new TraceFlagService(),
  };

  const sidebar = new TraceForgeSidebarProvider();
  const inspector = new TraceForgeInspectorProvider(context);

  let transactionPanel: vscode.WebviewPanel | undefined;
  let inspectorView: TraceForgeInspectorProvider | undefined = inspector;

  const openTransaction = (org: string, logId: string) => {
    if (transactionPanel) {
      transactionPanel.reveal(vscode.ViewColumn.One);
      void transactionPanel.webview.postMessage({ type: 'open-log', org, logId });
      return transactionPanel;
    }

    transactionPanel = vscode.window.createWebviewPanel(
      TRANSACTION_VIEW_TYPE,
      TRANSACTION_TITLE,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, WEB_ROOT)],
      },
    );

    void setWebviewContent(transactionPanel.webview, context.extensionUri, 'transaction');
    const bridge = createWebviewHandler(transactionPanel.webview, services, context, {
      onNodeSelected: (payload) => {
        inspectorView?.postMessage({ type: 'node-selected', ...payload });
        void vscode.commands.executeCommand(`${INSPECTOR_VIEW_ID}.focus`);
      },
    });

    transactionPanel.onDidDispose(() => {
      bridge.dispose();
      transactionPanel = undefined;
    });

    void transactionPanel.webview.postMessage({ type: 'open-log', org, logId });
    return transactionPanel;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('traceforge.open', () => openTransaction('', '')),
    vscode.commands.registerCommand('traceforge.analyzeLatestLog', async () => {
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
        if (!logs[0]) {
          await vscode.window.showInformationMessage(
            `No Salesforce debug logs were found for ${org.alias}.`,
          );
          return;
        }

        openTransaction(org.alias, logs[0].id);
      } catch (error) {
        await vscode.window.showErrorMessage(errorMessage(error));
      }
    }),
    vscode.window.registerWebviewViewProvider('traceforge.sidebar', sidebar),
    vscode.window.registerWebviewViewProvider(INSPECTOR_VIEW_ID, inspector),
  );

  sidebar.setOpenLogHandler((org, logId) => openTransaction(org, logId));
  sidebar.setInspectorMessageHandler((message) => inspector.postMessage(message));
}

export function deactivate(): void {
  // No persistent resources need explicit cleanup.
}

async function setWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  surface: 'transaction' | 'inspector',
): Promise<void> {
  const webRoot = vscode.Uri.joinPath(extensionUri, WEB_ROOT);
  const indexPath = join(extensionUri.fsPath, WEB_ROOT, 'index.html');
  const source = await readFile(indexPath, 'utf8');
  const nonce = createNonce();

  const html = source
    .replace(/<body>/, `<body data-traceforge-surface="${surface}">`)
    .replace(
      /(src|href)="(\.\/|\/)?([^"]+)"/g,
      (match, attribute: string, _prefix: string, asset: string) => {
        if (!asset.startsWith('assets/')) return match;
        const uri = webview.asWebviewUri(vscode.Uri.joinPath(webRoot, asset));
        return `${attribute}="${uri}"`;
      },
    )
    .replace(/<script([^>]*?)>/g, (_match, attributes: string) =>
      `<script nonce="${nonce}"${attributes}>`,
    );

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `font-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  webview.html = html.replace(
    '<head>',
    `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
  );
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
