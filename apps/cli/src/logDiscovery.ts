import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import type { DebugLogInfo } from '@traceforge/salesforce';

export interface DebugLogReader {
  listLogs(org?: string): Promise<DebugLogInfo[]>;
  fetchLog(org: string | undefined, logId: string): Promise<string>;
}

export interface LogsCommandDependencies {
  service: DebugLogReader;
  analyze(content: string, source: string): void | Promise<void>;
  write(message: string): void;
  interactive: boolean;
  selectLog?(logs: DebugLogInfo[]): Promise<DebugLogInfo | undefined>;
}

export interface LogsOptions {
  org?: string;
  latest: boolean;
  id?: string;
  user?: string;
  limit?: number;
}

export function parseLogsArguments(args: string[]): LogsOptions {
  const options: LogsOptions = { latest: false };

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--latest') {
      options.latest = true;
    } else if (argument === '--org' || argument === '--id' || argument === '--user' || argument === '--limit') {
      const value = args[++index];
      if (!value) {
        throw new Error(`The ${argument} option requires a value.`);
      }

      if (argument === '--org') options.org = value;
      if (argument === '--id') options.id = value;
      if (argument === '--user') options.user = value;
      if (argument === '--limit') {
        const limit = Number(value);
        if (!Number.isInteger(limit) || limit <= 0) {
          throw new Error('The --limit option must be a positive integer.');
        }
        options.limit = limit;
      }
    } else {
      throw new Error(`Unknown logs option: ${argument}`);
    }
  }

  if (options.latest && options.id) {
    throw new Error('Use either --latest or --id <logId>, not both.');
  }

  return options;
}

export function filterLogs(logs: DebugLogInfo[], options: Pick<LogsOptions, 'user' | 'limit'>): DebugLogInfo[] {
  const user = options.user?.toLowerCase();
  const filtered = user
    ? logs.filter((log) => [log.userName, log.userId].some((value) => value?.toLowerCase().includes(user)))
    : logs;

  return options.limit === undefined ? filtered : filtered.slice(0, options.limit);
}

export async function runLogsCommand(args: string[], dependencies: LogsCommandDependencies): Promise<void> {
  const options = parseLogsArguments(args);
  const targetLabel = options.org ?? 'default org';
  const logs = filterLogs(await dependencies.service.listLogs(options.org), options);

  if (logs.length === 0) {
    if (options.latest) {
      dependencies.write(`\nNo Salesforce debug logs are available for ${targetLabel}.`);
      return;
    }

    dependencies.write(`\n=== SALESFORCE DEBUG LOGS: ${targetLabel} ===\n`);
    dependencies.write(options.user
      ? `No debug logs found for user filter "${options.user}".`
      : 'No debug logs available.');
    return;
  }

  if (options.latest) {
    await analyzeSelected(logs[0]!, options.org, targetLabel, dependencies);
    return;
  }

  if (options.id) {
    const selected = logs.find((log) => log.id === options.id);
    if (!selected) {
      throw new Error(`Debug log ID ${options.id} is not available in the selected log list.`);
    }
    await analyzeSelected(selected, options.org, targetLabel, dependencies);
    return;
  }

  dependencies.write(`\n=== SALESFORCE DEBUG LOGS: ${targetLabel} ===\n`);
  printLogTable(logs, dependencies.write);

  let selected: DebugLogInfo | undefined;
  if (dependencies.interactive) {
    selected = await (dependencies.selectLog ?? selectLogInteractively)(logs);
    if (!selected) {
      dependencies.write('Log selection cancelled.');
      return;
    }
  } else {
    dependencies.write('No log selected. Use --latest or --id <logId> in a non-interactive environment.');
    return;
  }

  if (!selected) {
    return;
  }

  await analyzeSelected(selected, options.org, targetLabel, dependencies);
}

async function analyzeSelected(
  selected: DebugLogInfo,
  org: string | undefined,
  targetLabel: string,
  dependencies: LogsCommandDependencies
): Promise<void> {
  dependencies.write(`Fetching Salesforce log ${selected.id} from ${targetLabel}...`);
  await dependencies.analyze(
    await dependencies.service.fetchLog(org, selected.id),
    `${targetLabel}:${selected.id}`
  );
}

export function printLogTable(logs: DebugLogInfo[], write: (message: string) => void): void {
  write(`${'#'.padEnd(4)}${'ID'.padEnd(20)}  ${'USER'.padEnd(26)}  ${'OPERATION'.padEnd(24)}  ${'START TIME'.padEnd(26)}  ${'DURATION'.padEnd(12)}  ${'STATUS'.padEnd(12)}  SIZE`);
  logs.forEach((log, index) => {
    const duration = log.durationMs === undefined ? '-' : `${log.durationMs.toFixed(0)} ms`;
    const size = log.logLength === undefined ? '-' : formatBytes(log.logLength);
    write(`${String(index + 1).padEnd(4)}${log.id.padEnd(20)}  ${display(log.userName ?? log.userId).padEnd(26)}  ${display(log.operation).padEnd(24)}  ${display(log.startTime).padEnd(26)}  ${duration.padEnd(12)}  ${display(log.status).padEnd(12)}  ${size}`);
  });
}

async function selectLogInteractively(logs: DebugLogInfo[]): Promise<DebugLogInfo | undefined> {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = (await prompt.question('\nSelect a log number or ID (q to cancel): ')).trim();
      if (answer.toLowerCase() === 'q' || answer === '') return undefined;
      const byNumber = Number(answer);
      const selected = Number.isInteger(byNumber) ? logs[byNumber - 1] : logs.find((log) => log.id === answer);
      if (selected) return selected;
      stdout.write('Invalid selection. Enter a displayed number or log ID.\n');
    }
  } finally {
    prompt.close();
  }
}

function display(value: string | undefined): string {
  const text = value ?? '-';
  return text.length <= 24 ? text : `${text.slice(0, 21)}...`;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
