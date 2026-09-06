# TraceForge VS Code Extension

The TraceForge VS Code extension hosts the React investigation UI in a Webview and keeps Salesforce/local-machine operations in the VS Code extension host.

## Development

From the repository root:

```bash
pnpm install
pnpm vscode:build
```

Open the repository in VS Code and launch the extension through the Extension Development Host workflow.

## Runtime boundary

```text
React Webview
     │ postMessage
     ▼
Extension host
     │
     ├── @traceforge/salesforce
     └── @traceforge/investigation
             │
             └── @traceforge/log-scanner
```

The Webview never executes the Salesforce CLI or Node.js APIs directly. It sends explicit requests across the VS Code Webview message boundary, and the extension host performs the operation and returns JSON-serializable results.

The React client also retains an HTTP transport for standalone browser development; this transport is bypassed automatically inside VS Code.

## Main commands

- `TraceForge: Open Investigation`
- `TraceForge: Analyze Latest Salesforce Log`

A TraceForge Activity Bar launcher is also contributed to VS Code.
