import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DebugLogService } from '../../../packages/salesforce/src/DebugLogService.js';
import { TraceFlagService } from '../../../packages/salesforce/src/TraceFlagService.js';

const port = Number(process.env.TRACEFORGE_API_PORT ?? 3001);
const debugLogs = new DebugLogService();
const traceFlags = new TraceFlagService();

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://localhost:5173',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function pathParts(req: IncomingMessage): string[] {
  return new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname.split('/').filter(Boolean);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  try {
    const parts = pathParts(req);

    if (req.method === 'GET' && parts.join('/') === 'api/orgs') {
      return json(res, 200, await debugLogs.listOrgs());
    }

    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'orgs' && parts[3] === 'users') {
      return json(res, 200, await traceFlags.listUsers(decodeURIComponent(parts[2])));
    }

    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'orgs' && parts[3] === 'debug-levels') {
      const org = decodeURIComponent(parts[2]);
      const levels = await traceFlags.listDebugLevels(org);
      const finest = levels.some((level) => level.developerName.toUpperCase() === 'FINEST' || level.masterLabel.toUpperCase() === 'FINEST');
      return json(res, 200, { levels, finestAvailable: finest, finestAutoCreate: !finest });
    }

    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'orgs' && parts[3] === 'logs' && parts.length === 5) {
      return json(res, 200, { content: await debugLogs.fetchLog(decodeURIComponent(parts[2]), decodeURIComponent(parts[4])) });
    }

    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'orgs' && parts[3] === 'logs' && parts.length === 4) {
      return json(res, 200, await debugLogs.listLogs(decodeURIComponent(parts[2])));
    }

    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'orgs' && parts[3] === 'trace-flags') {
      const org = decodeURIComponent(parts[2]);
      const payload = await body(req);
      const userId = typeof payload.userId === 'string' ? payload.userId : '';
      const debugLevelId = typeof payload.debugLevelId === 'string' ? payload.debugLevelId : undefined;
      const durationMinutes = typeof payload.durationMinutes === 'number' ? payload.durationMinutes : 30;
      if (!userId) return json(res, 400, { error: 'userId is required' });

      const result = await traceFlags.createOrUpdateUserTraceFlag(org, { userId, debugLevelId, durationMinutes });
      return json(res, 200, result);
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

createServer((req, res) => {
  void handle(req, res);
}).listen(port, () => {
  console.log(`TraceForge API listening on http://localhost:${port}`);
});
