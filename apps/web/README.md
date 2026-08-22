# TraceForge Investigation UI

The first investigation workspace is intentionally backed by local fixture data so the interaction model can be evaluated before wiring live Salesforce APIs.

## Run

From the repository root:

```bash
pnpm install
pnpm web
```

Then open `http://localhost:5173`.

## Current workflow

1. Select one or more logs in the left pane.
2. Search for a class, method, variable, record ID, or exception.
3. Review every matching instance across the selected logs.
4. Select a match or log to open its transaction.
5. Select a node in the sanitized call tree.
6. Inspect variables, values, source line, timestamp, duration, and transaction context.

The fixture dataset is in `src/data.ts`. The next integration step is to replace the fixture adapter with the TraceForge backend/investigation model while keeping this UI contract intact.
