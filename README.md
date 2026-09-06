# TraceForge

TraceForge is a Salesforce debug-log investigation tool for exploring Apex transactions, execution trees, variables, SOQL, DML, exceptions, governor limits, and raw debug output.

## Current architecture

TraceForge is moving to a VS Code extension architecture. The React investigation UI runs inside a VS Code Webview, while the extension host owns local-machine access and Salesforce operations.

```text
┌─────────────────────────────────────────────────────┐
│                 VS Code Extension                   │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │              React Webview UI                 │  │
│  │ Logs · Search · Transaction · Inspector       │  │
│  └──────────────────────▲────────────────────────┘  │
│                         │ postMessage               │
│  ┌──────────────────────┴────────────────────────┐  │
│  │              Extension Host (Node.js)         │  │
│  │ Salesforce services · CLI auth · commands     │  │
│  └──────────────────────▲────────────────────────┘  │
└─────────────────────────┼───────────────────────────┘
                          │
                    Salesforce / sf

Reusable analysis packages are shared independently:
log-scanner → investigation → analyzer/parser packages
```

There is no TraceForge HTTP server in the VS Code runtime. The extension host communicates with Salesforce directly through the existing Salesforce services and local CLI authentication. VS Code Webviews communicate with the extension host through message passing, which is the supported VS Code Webview architecture. citeturn278676search1turn463173search2

The standalone React/API application remains in the repository during this migration so the existing web workflow is not lost while the extension is being developed.

## Features

### Salesforce integration

- Discovers the authenticated Salesforce orgs available through the local `sf` CLI.
- Lists recent debug logs for the selected org.
- Retrieves complete Apex debug-log bodies through the Salesforce Tooling API.
- Manages user trace flags and can automatically use/create the finest DebugLevel.
- Keeps Salesforce credentials outside TraceForge's own persistent storage.

### Debug-log investigation

The reusable investigation pipeline converts a raw Salesforce log into a hierarchical representation:

```text
Raw log
  ↓
SalesforceLogScanner
  ↓
Semantic events
  ↓
Investigation correlator
  ↓
UI investigation nodes
```

The investigation package is client-neutral so the same analysis code can later be used by the VS Code extension, CLI, and a future IntelliJ IDEA plugin.

The Inspector can expose variables inherited from parent scopes and node-scoped raw-log output. Selecting a method, SOQL query, DML operation, or other investigation node does not require displaying the entire transaction log.

### React UI

The current UI is componentized into focused frames including:

- **Logs** — browse transactions, select multiple logs, and change the active transaction.
- **Search results** — search across selected logs and display each matching node independently.
- **Transaction** — browse the hierarchical execution tree, collapse/expand nodes, filter system calls, and open the complete raw log.
- **Inspector** — inspect variables, governor limits, timestamps, source lines, status, and node-specific log output.

The Inspector is resizable and vertically scrollable. Loading states are displayed per data-bearing panel, and the UI supports dark and light themes.

## VS Code extension

The extension lives under `apps/vscode` and provides:

- **TraceForge: Open Investigation** — opens the full investigation UI in an editor Webview.
- **TraceForge: Analyze Latest Salesforce Log** — opens TraceForge against the newest available log.
- A TraceForge Activity Bar container with a lightweight launcher view.
- A Webview/extension-host message bridge for Salesforce operations.
- Direct access to the existing local Salesforce CLI authentication.
- Source navigation groundwork for opening Apex classes from investigation nodes.

VS Code Webviews are isolated UI contexts and use message passing to communicate with extension code; local resources should be restricted and a Content Security Policy should be applied. TraceForge follows that model for the extension-host Webview. citeturn278676search1turn463173search4

### Build the extension

```bash
pnpm install
pnpm vscode:build
```

The build first compiles the React application, copies its Vite output into the extension package, and then compiles the extension host.

During development, open the repository in VS Code and use the Run Extension configuration/debug workflow. The extension entry point is `apps/vscode/src/extension.ts`.

## Repository structure

```text
traceforge/
├── apps/
│   ├── api/                  # Existing standalone HTTP API during migration
│   ├── cli/                  # CLI log discovery and analysis
│   ├── vscode/               # VS Code extension host + Webview packaging
│   └── web/                  # Reusable React UI / standalone web development
├── packages/
│   ├── analyzer/             # Higher-level log analysis
│   ├── investigation/        # Client-neutral investigation tree mapping
│   ├── log-scanner/          # Raw event scanner, semantic decoder and correlator
│   ├── parser-adapter/       # Parser integration
│   ├── salesforce/           # Salesforce CLI/auth, debug-log and trace-flag services
│   ├── shared/               # Shared types/utilities
│   └── ...
├── samples/
│   └── logs/                 # Sample Salesforce debug logs
└── package.json
```

## CLI usage

Analyze a local log:

```bash
pnpm cli samples/logs/sample.log
```

List authenticated orgs:

```bash
pnpm cli orgs
```

List debug logs:

```bash
pnpm cli logs --org my-org
```

Retrieve, parse, and analyze the latest available log:

```bash
pnpm cli logs --org my-org --latest
```

Inspect a specific log:

```bash
pnpm cli inspect-log my-org 07Lxxxxxxxxxxxxxxx
```

## Standalone web development

The existing web application can still be run separately while the VS Code migration is in progress:

```bash
pnpm dev
```

This starts the existing local API and Vite development server. The web client automatically uses its HTTP transport in a normal browser and its VS Code message bridge when hosted inside the extension Webview.

## Future IntelliJ IDEA plugin

The architecture intentionally keeps the Salesforce integration and investigation pipeline outside the VS Code-specific layer. The planned IntelliJ IDEA plugin will be able to reuse these packages and provide its own host/bridge implementation while sharing the same investigation model and React UI patterns where practical.

## Security

TraceForge does not store Salesforce credentials. Access tokens and secrets must never be logged or exposed to the React UI. The VS Code Webview is treated as an untrusted UI boundary and communicates with the extension host only through explicit messages.
