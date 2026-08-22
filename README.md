# TraceForge

TraceForge parses and analyzes Salesforce Apex debug logs.

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

TraceForge uses the locally installed `sf` CLI and its existing authentication.
Authenticate an org with `sf org login web` if needed; TraceForge never requests
or stores Salesforce credentials.
