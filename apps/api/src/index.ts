import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { DebugLogService } from '../../../packages/salesforce/src/DebugLogService.js';
import { TraceFlagService } from '../../../packages/salesforce/src/TraceFlagService.js';
import { analyzeLog } from './investigation.js';

const port = Number(process.env.TRACEFORGE_API_PORT ?? 3001);
const debugLogs = new DebugLogService();
const traceFlags = new TraceFlagService();

function corsOrigin(req: IncomingMessage): string {
  const configured = process.env.TRACEFORGE_WEB_URL;
  if (configured) return configured;
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }
  return 'http://localhost:5173';
}

const logCache = new Map<string, { content: string; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getCachedLog(org: string, logId: string): Promise<string> {
  const key = `${org}:${logId}`;
  const hit = logCache.get(key);
  if (hit && Date.now() - hit.timestamp < CACHE_TTL_MS) {
    return hit.content;
  }
  const content = await debugLogs.fetchLog(org, logId);
  logCache.set(key, { content, timestamp: Date.now() });
  return content;
}

/** Write a JSON response with dynamic CORS headers. */
function json(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = JSON.stringify(value);

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': corsOrigin(req),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

/** Parse a JSON request body and accept only object payloads. */
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (!chunks.length) return {};

  const parsed: unknown = JSON.parse(
    Buffer.concat(chunks).toString('utf8'),
  );

  return typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

/** Split the request URL into route segments for the small HTTP router below. */
function pathParts(req: IncomingMessage): string[] {
  return new URL(
    req.url ?? '/',
    `http://${req.headers.host ?? 'localhost'}`,
  ).pathname.split('/').filter(Boolean);
}

/** Route local API requests to Salesforce services. */
async function handle(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sendJson = (status: number, value: unknown) =>
    json(req, res, status, value);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': corsOrigin(req),
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    const parts = pathParts(req);

    // Discover authenticated Salesforce orgs.
    if (req.method === 'GET' && parts.join('/') === 'api/orgs') {
      return sendJson(200, await debugLogs.listOrgs());
    }

    // Trace-flag management requires the users available in the selected org.
    if (
      req.method === 'GET' &&
      parts[0] === 'api' &&
      parts[1] === 'orgs' &&
      parts[3] === 'users'
    ) {
      return sendJson(
        200,
        await traceFlags.listUsers(decodeURIComponent(parts[2])),
      );
    }

    // Return debug levels and tell the UI whether FINEST already exists.
    if (
      req.method === 'GET' &&
      parts[0] === 'api' &&
      parts[1] === 'orgs' &&
      parts[3] === 'debug-levels'
    ) {
      const org = decodeURIComponent(parts[2]);
      const levels = await traceFlags.listDebugLevels(org);
      const finest = levels.some(
        (level) =>
          level.developerName.toUpperCase() === 'FINEST' ||
          level.masterLabel.toUpperCase() === 'FINEST',
      );

      return sendJson(200, {
        levels,
        finestAvailable: finest,
        finestAutoCreate: !finest,
      });
    }

    // Analyze a log by scanning raw events and correlating them into UI nodes.
    if (
      req.method === 'GET' &&
      parts[0] === 'api' &&
      parts[1] === 'orgs' &&
      parts[3] === 'logs' &&
      parts.length === 6 &&
      parts[5] === 'investigation'
    ) {
      const org = decodeURIComponent(parts[2]);
      const logId = decodeURIComponent(parts[4]);

      console.info(`[API] analyze log org=${org} logId=${logId}`);

      const content = await getCachedLog(org, logId);
      return sendJson(200, analyzeLog(content));
    }

    // Return a complete raw transaction log for the Raw Log modal.
    if (
      req.method === 'GET' &&
      parts[0] === 'api' &&
      parts[1] === 'orgs' &&
      parts[3] === 'logs' &&
      parts.length === 5
    ) {
      const org = decodeURIComponent(parts[2]);
      const logId = decodeURIComponent(parts[4]);

      console.info(`[API] fetch raw log org=${org} logId=${logId}`);

      return sendJson(200, {
        content: await getCachedLog(org, logId),
      });
    }

    // Return lightweight metadata used by the Logs panel.
    if (
      req.method === 'GET' &&
      parts[0] === 'api' &&
      parts[1] === 'orgs' &&
      parts[3] === 'logs' &&
      parts.length === 4
    ) {
      return sendJson(
        200,
        await debugLogs.listLogs(decodeURIComponent(parts[2])),
      );
    }

    // Create or update a user trace flag for subsequent transactions.
    if (
      req.method === 'POST' &&
      parts[0] === 'api' &&
      parts[1] === 'orgs' &&
      parts[3] === 'trace-flags'
    ) {
      const org = decodeURIComponent(parts[2]);
      const payload = await body(req);
      const userId =
        typeof payload.userId === 'string' ? payload.userId : '';
      const debugLevelId =
        typeof payload.debugLevelId === 'string'
          ? payload.debugLevelId
          : undefined;
      const durationMinutes =
        typeof payload.durationMinutes === 'number'
          ? payload.durationMinutes
          : 30;

      console.info(
        `[API] create trace flag org=${org} user=${userId} ` +
        `debugLevel=${debugLevelId ?? 'AUTO-FINEST'} duration=${durationMinutes}`,
      );

      if (!userId) {
        return sendJson(400, { error: 'userId is required' });
      }

      const result = await traceFlags.createOrUpdateUserTraceFlag(org, {
        userId,
        debugLevelId,
        durationMinutes,
      });

      console.info(
        `[API] trace flag success id=${result.id} user=${result.tracedEntityId}`,
      );

      return sendJson(200, result);
    }

    return sendJson(404, { error: 'Not found' });
  } catch (error) {
    console.error('[API] request failed', error);
    return sendJson(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

createServer((req, res) => {
  void handle(req, res);
}).listen(port, () => {
  console.log(
    `TraceForge API listening on http://localhost:${port}`,
  );
});
