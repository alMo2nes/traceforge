import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { DebugLogService, TraceFlagService } from '@traceforge/salesforce';
import { createWebviewHandler, type ExtensionServices } from './webviewBridge.js';

const WEB_ROOT = 'media/web';

/** Native Activity Bar webview containing org selection, log list and search. */
export class TraceForgeSidebarProvider implements vscode.WebviewViewProvider {
  private webview?: vscode.Webview;
  private bridge?: vscode.Disposable;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly services: ExtensionServices,
    private readonly onOpenLog: (org: string, logId: string) => void,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webview = webviewView.webview;
    this.bridge?.dispose();
    this.bridge = createWebviewHandler(
      this.webview,
      this.services,
      this.context,
      {
        onOpenLog: this.onOpenLog,
      },
    );

    this.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, WEB_ROOT),
      ],
    };

    void this.loadContent();
  }

  dispose(): void {
    this.bridge?.dispose();
  }

  private async loadContent(): Promise<void> {
    if (!this.webview) return;

    const webRoot = vscode.Uri.joinPath(this.context.extensionUri, WEB_ROOT);
    const indexPath = join(this.context.extensionUri.fsPath, WEB_ROOT, 'index.html');
    const source = await readFile(indexPath, 'utf8');
    const nonce = createNonce();

    const html = source
      .replace(/<body>/, '<body data-traceforge-surface="sidebar">')
      .replace(
        /(src|href)="(\.\/|\/)?([^"]+)"/g,
        (match, attribute: string, _prefix: string, asset: string) => {
          if (!asset.startsWith('assets/')) return match;
          const uri = this.webview!.asWebviewUri(
            vscode.Uri.joinPath(webRoot, asset),
          );
          return `${attribute}="${uri}"`;
        },
      )
      .replace(
        /<script([^>]*?)>/g,
        (_match, attributes: string) =>
          `<script nonce="${nonce}"${attributes}>`,
      );

    const csp = [
      "default-src 'none'",
      `img-src ${this.webview.cspSource} data:`,
      `font-src ${this.webview.cspSource}`,
      `style-src ${this.webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    this.webview.html = html.replace(
      '<head>',
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );
  }
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(
    { length: 32 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('');
}
