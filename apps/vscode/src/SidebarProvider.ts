import * as vscode from 'vscode';

/** Lightweight launcher shown in the TraceForge Activity Bar view. */
export class TraceForgeSidebarProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: unknown }).type === 'open'
      ) {
        void vscode.commands.executeCommand('traceforge.open');
      }
    });

    webviewView.webview.html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      padding: 12px;
    }
    h3 { margin: 0 0 8px; }
    p { color: var(--vscode-descriptionForeground); line-height: 1.45; }
    button {
      width: 100%;
      border: 0;
      padding: 8px 12px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      cursor: pointer;
      border-radius: 3px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <h3>TraceForge</h3>
  <p>Investigate Salesforce debug logs in a dedicated editor view.</p>
  <button id="open" type="button">Open Investigation</button>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('open')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'open' });
    });
  </script>
</body>
</html>`;
  }
}
