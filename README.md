# TraceForge

TraceForge is a Salesforce debug-log investigation tool for exploring Apex transactions, execution trees, variables, queries, DML operations, exceptions, and raw debug output.

The project is organized as a small monorepo with a reusable log-scanning package, a Node.js API, a CLI, and a React/Vite web application.

## Features

### Salesforce org integration

- Uses the locally installed Salesforce `sf` CLI authentication.
- Discovers authenticated orgs and lets the web UI switch between them.
- Lists recent Salesforce debug logs for the selected org.
- Supports user trace-flag management from the web UI.
- Can use an existing Debug Level or automatically select/create the finest available level.
- Does not request or persist Salesforce credentials.

### Debug-log investigation

TraceForge turns raw Salesforce debug-log events into a hierarchical investigation tree containing relevant events such as:

- Transactions and Apex code units
- Method invocations
- SOQL queries
- DML operations
- Exceptions
- Variables and assignments
- User debug output
- System calls, which can be hidden or displayed from the UI

The log scanner keeps the low-level raw event information while the correlator builds the higher-level execution hierarchy.

### Web application

The web application provides four main investigation areas:

- **Logs** — browse transactions, select multiple logs for cross-log searching, and switch the active transaction.
- **Search results** — search selected logs for class names, methods, variables, IDs, exceptions, and other captured values. Every matching node is shown independently, including matches from different transactions.
- **Transaction** — browse the hierarchical execution tree, collapse or expand nodes, optionally show system calls, and open the complete raw Salesforce log.
- **Inspector** — inspect the selected node, including inherited variables from its parent scopes and node-specific raw log output.

The Inspector is resizable and scrollable. Variable tables use the full available width, while the log output shows the raw-log slice belonging to the selected investigation node rather than always showing the entire transaction.

All data-bearing panels display a loading indicator while their corresponding Salesforce or investigation request is in progress.

The UI also supports dark and light themes.

## Project structure

```text
traceforge/
├── apps/
│   ├── api/                  # Node.js HTTP API used by the web application
│   ├── cli/                  # Command-line log discovery and investigation tools
│   └── web/                  # React + Vite investigation UI
├── packages/
│   ├── log-scanner/          # Raw Salesforce log scanner, semantic decoder and correlator
│   ├── salesforce/           # Salesforce org, debug-log and trace-flag services
│   └── ...                   # Other shared project packages
├── samples/
│   └── logs/                 # Example debug logs
└── package.json              # Workspace configuration
```

## CLI usage

Analyze a local log:

```bash
pnpm cli samples/logs/sample.log
```

List debug logs from the Salesforce CLI's default authenticated org:

```bash
pnpm cli logs
```

Select an authenticated org alias (or username):

```bash
pnpm cli logs --org my-org
```

Retrieve, parse, and analyze the latest available log:

```bash
pnpm cli logs --org my-org --latest
```

Inspect a specific debug log:

```bash
pnpm cli inspect-log my-org 07Lxxxxxxxxxxxxxxx
```

## Web application

Start the API and web application from the workspace according to the package scripts, then open the Vite development server in your browser.

The web application expects the API at `http://localhost:3001` by default. Set `VITE_TRACEFORGE_API_URL` when the API is hosted elsewhere.

```bash
pnpm install
pnpm build
pnpm test
```

For local development, authenticate the required Salesforce org first:

```bash
sf org login web
```

TraceForge relies on the existing Salesforce CLI authentication and never asks users to enter or store Salesforce credentials.

## Architecture

The main investigation flow is:

```text
Salesforce debug log
        │
        ▼
SalesforceLogScanner
        │ raw events
        ▼
Semantic event decoder
        │ semantic events
        ▼
Investigation correlator
        │ hierarchical nodes
        ▼
API / investigation mapper
        │ UI nodes + variables + raw node output
        ▼
React web application
```

The web UI is intentionally componentized. `App.tsx` owns application state and API orchestration, while the visual frames are implemented as focused components under `apps/web/src/components/`.

## Security notes

TraceForge uses the user's existing local Salesforce CLI authentication. Access tokens and other credentials are not stored by TraceForge and must never be logged or exposed in the UI.
