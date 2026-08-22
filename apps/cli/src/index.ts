import { readFile } from 'node:fs/promises';

import { LogAnalyzer, type ExecutionTreeNode } from '@traceforge/analyzer';
import { SalesforceLogParser } from '@traceforge/parser-adapter';
import { DebugLogService } from '@traceforge/salesforce';
import type { LogEvent } from '@traceforge/shared';
import { runLogsCommand } from './logDiscovery.js';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  switch (command) {
    case 'orgs':
      await listOrgs();
      return;

    case 'logs':
      await logsCommand(args);
      return;

    case 'analyze-log':
      await analyzeOrgLog(args[0], args[1]);
      return;

    case 'inspect-log':
      await inspectOrgLog(args[0], args[1]);
      return;

    case 'analyze':
      await analyzeFile(args[0]);
      return;

    case 'inspect':
      await inspectFile(args[0]);
      return;

    default:
      // Preserve the original `pnpm cli <path>` command for local analysis.
      await analyzeFile(command);
  }
}

async function listOrgs(): Promise<void> {
  const orgs = await new DebugLogService().listOrgs();
  console.log('\n=== AUTHENTICATED ORGS ===\n');
  for (const org of orgs) {
    console.log(`${org.alias}\n  ${org.username ?? '-'}\n  ${org.instanceUrl ?? '-'}`);
  }
}

async function logsCommand(args: string[]): Promise<void> {
  await runLogsCommand(args, {
    service: new DebugLogService(),
    analyze,
    write: console.log,
    interactive: process.stdin.isTTY === true && process.stdout.isTTY === true
  });
}

async function analyzeOrgLog(targetOrg: string | undefined, logId: string | undefined): Promise<void> {
  if (!targetOrg || !logId) {
    throw new Error('Usage: pnpm cli analyze-log <org-alias-or-username> <log-id>');
  }

  console.log(`Fetching Salesforce log ${logId} from ${targetOrg}...`);
  const content = await new DebugLogService().fetchLog(targetOrg, logId);
  analyze(content, `${targetOrg}:${logId}`);
}

async function inspectOrgLog(targetOrg: string | undefined, logId: string | undefined): Promise<void> {
  if (!targetOrg || !logId) {
    throw new Error('Usage: pnpm cli inspect-log <org-alias-or-username> <log-id>');
  }

  console.log(`Fetching Salesforce log ${logId} from ${targetOrg}...`);
  const content = await new DebugLogService().fetchLog(targetOrg, logId);
  inspect(content, `${targetOrg}:${logId}`);
}

async function analyzeFile(file: string | undefined): Promise<void> {
  if (!file) {
    throw new Error('Usage: pnpm cli analyze <path-to-salesforce-log>');
  }

  console.log(`Reading Salesforce log: ${file}`);
  analyze(await readFile(file, 'utf8'), file);
}

async function inspectFile(file: string | undefined): Promise<void> {
  if (!file) {
    throw new Error('Usage: pnpm cli inspect <path-to-salesforce-log>');
  }

  console.log(`Reading Salesforce log: ${file}`);
  inspect(await readFile(file, 'utf8'), file);
}

function analyze(content: string, source: string): void {
  const result = new SalesforceLogParser().parse(content, source);
  const analyzer = new LogAnalyzer(result.events);

  console.log('\n=== LOG SUMMARY ===\n');
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`\nEvents: ${result.events.length}`);
  console.log('\n=== TOP 10 HOTSPOTS ===\n');

  for (const event of analyzer.getHotspots(10)) {
    console.log(`${(event.durationMs ?? 0).toFixed(3).padStart(12)} ms  ${event.name ?? event.type}`);
  }

  console.log('\n=== EXECUTION TREE ===\n');
  printExecutionTree(analyzer.getExecutionTree());

  console.log('\n=== CRITICAL PATH ===\n');
  for (const [index, event] of analyzer.getCriticalPath().entries()) {
    console.log(`${index === 0 ? '' : '→ '}${event.name ?? event.type}  ${formatDuration(event.durationMs)}`);
  }

  printPerformanceAnalysis(analyzer);
}

function inspect(content: string, source: string): void {
  const result = new SalesforceLogParser().parse(content, source);
  const events = result.events;
  const byType = new Map<string, number>();

  for (const event of events) {
    const key = event.rawType ?? event.type;
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }

  console.log('\n=== PARSER EVENT INVENTORY ===\n');
  console.log(`Source: ${source}`);
  console.log(`Parsed events: ${events.length}`);

  console.log('\nEvent types:\n');
  for (const [type, count] of [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${String(count).padStart(4)}  ${type}`);
  }

  console.log('\n=== EVENTS ===\n');
  console.log('ID  TYPE  RAW TYPE  PARENT  LINE  START  END  DURATION  NAME');
  console.log('-'.repeat(120));

  for (const event of events) {
    console.log(formatInspectionEvent(event));
  }

  console.log('\n=== EVENT HIERARCHY ===\n');
  const analyzer = new LogAnalyzer(events);
  printInspectionTree(analyzer.getExecutionTree());
}

function formatInspectionEvent(event: LogEvent): string {
  const id = event.id.padEnd(18);
  const type = event.type.padEnd(10);
  const rawType = (event.rawType ?? '-').padEnd(28);
  const parent = (event.parentId ?? '-').padEnd(18);
  const line = String(event.lineNumber ?? '-').padEnd(6);
  const start = formatNumber(event.timeStart).padEnd(10);
  const end = formatNumber(event.timeEnd).padEnd(10);
  const duration = formatNumber(event.durationMs).padEnd(10);
  const name = event.name ?? '-';

  return `${id} ${type} ${rawType} ${parent} ${line} ${start} ${end} ${duration} ${name}`;
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? '-' : value.toFixed(3);
}

function printInspectionTree(nodes: ExecutionTreeNode[], prefix = ''): void {
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const event = node.event;
    const marker = isLast ? '└── ' : '├── ';
    const rawType = event.rawType && event.rawType !== event.type
      ? ` [${event.type} / ${event.rawType}]`
      : ` [${event.type}]`;
    const details = [
      event.lineNumber === undefined ? undefined : `line ${event.lineNumber}`,
      event.durationMs === undefined ? undefined : formatDuration(event.durationMs)
    ].filter(Boolean).join(', ');
    const suffix = details ? ` (${details})` : '';

    console.log(`${prefix}${marker}${event.name ?? event.type}${rawType}${suffix}`);
    printInspectionTree(node.children, `${prefix}${isLast ? '    ' : '│   '}`);
  });
}

function printPerformanceAnalysis(analyzer: LogAnalyzer): void {
  const performance = analyzer.getPerformanceAnalysis();
  console.log('\n=== PERFORMANCE ANALYSIS ===\n');

  if (performance.primaryBottleneck) {
    printHotspot('Primary application bottleneck:', performance.primaryBottleneck);
    console.log('');
  }

  if (performance.highestDatabaseTime) {
    printHotspot('Database hotspot:', performance.highestDatabaseTime);
    console.log('');
  }

  if (performance.highestCalloutTime) {
    printHotspot('Callout hotspot:', performance.highestCalloutTime);
    console.log('');
  }

  if (performance.highestSelfTime && performance.highestSelfTime.event.id !== performance.primaryBottleneck?.event.id) {
    printHotspot('Highest exclusive-time operation:', performance.highestSelfTime);
    console.log('');
  }

  for (const operation of performance.repeatedOperations) {
    console.log('Repeated expensive operation:');
    console.log(`  ${operation.name}`);
    console.log(`  Total: ${formatDuration(operation.totalTimeMs)} | Average: ${formatDuration(operation.averageTimeMs)} | Invocations: ${operation.invocationCount}`);
    console.log(`  ${operation.percentageOfExecution.toFixed(1)}% of execution${operation.percentageOfParent === undefined ? '' : ` | ${operation.percentageOfParent.toFixed(1)}% of parent`}`);
    for (const context of operation.parentContexts) {
      console.log(`  Context: ${context.name} (${context.invocationCount} invocation${context.invocationCount === 1 ? '' : 's'}${context.percentageOfParent === undefined ? '' : `, ${context.percentageOfParent.toFixed(1)}% of parent`})`);
    }
    console.log('');
  }

  console.log('=== RECOMMENDATIONS ===\n');
  if (performance.recommendations.length === 0) {
    console.log('No duration-based performance recommendations are available for this log.');
    return;
  }
  performance.recommendations.forEach((recommendation, index) => {
    console.log(`${index + 1}. ${formatRecommendation(recommendation)}`);
  });
}

function printHotspot(title: string, hotspot: {
  name: string;
  category: string;
  totalTimeMs: number;
  selfTimeMs?: number;
  percentageOfExecution: number;
  invocationCount: number;
  parent?: { name: string };
  severity: string;
}): void {
  console.log(title);
  console.log(`  ${hotspot.name} [${hotspot.category}, ${hotspot.severity}]`);
  console.log(`  Total: ${formatDuration(hotspot.totalTimeMs)} | Self: ${formatDuration(hotspot.selfTimeMs)} | ${hotspot.percentageOfExecution.toFixed(1)}% of execution | Invocations: ${hotspot.invocationCount}`);
  if (hotspot.parent) console.log(`  Called from: ${hotspot.parent.name}`);
}

function formatRecommendation(recommendation: ReturnType<LogAnalyzer['getPerformanceAnalysis']>['recommendations'][number]): string {
  switch (recommendation.kind) {
    case 'investigate-child-operation':
      return `${recommendation.target.name} consumes ${formatDuration(recommendation.target.totalTimeMs)}. Its main child operation is ${recommendation.related!.name} at ${formatDuration(recommendation.related!.totalTimeMs)} (${recommendation.percentageOfParent!.toFixed(1)}% of ${recommendation.target.name} time). Investigate the child operation before optimizing lower-level system calls.`;
    case 'investigate-application-hotspot':
      return `Investigate ${recommendation.target.name}: it consumes ${formatDuration(recommendation.target.totalTimeMs)} (${recommendation.target.percentageOfExecution.toFixed(1)}% of execution).`;
    case 'review-repeated-operation':
      return `${recommendation.target.name} is invoked ${recommendation.target.invocationCount} times for ${formatDuration(recommendation.target.totalTimeMs)} total. Consider reusing results within the same request where semantics allow.`;
    case 'review-callout-latency':
      return `Investigate callout latency: ${recommendation.target.name} took ${formatDuration(recommendation.target.totalTimeMs)}.`;
  }
}

function printExecutionTree(nodes: ExecutionTreeNode[], prefix = ''): void {
  nodes.forEach((node) => {
    const self = node.selfDurationMs === undefined ? '-' : `${node.selfDurationMs.toFixed(3)} ms`;
    console.log(`${prefix}${formatDuration(node.event.durationMs)} total | ${self} self  ${node.event.name ?? node.event.type}`);
    printTreeChildren(node.children);
  });
}

function printTreeChildren(nodes: ExecutionTreeNode[], prefix = ''): void {
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const self = node.selfDurationMs === undefined ? '-' : `${node.selfDurationMs.toFixed(3)} ms`;
    console.log(`${prefix}${isLast ? '└── ' : '├── '}${formatDuration(node.event.durationMs)} total | ${self} self  ${node.event.name ?? node.event.type}`);
    printTreeChildren(node.children, `${prefix}${isLast ? '    ' : '│   '}`);
  });
}

function formatDuration(durationMs: number | undefined): string {
  return durationMs === undefined ? '- ms' : `${durationMs.toFixed(3)} ms`;
}

function printUsage(): void {
  console.log('\nTraceForge — Salesforce Debug Log Analyzer\n');
  console.log('Usage:');
  console.log('  pnpm cli orgs');
  console.log('  pnpm cli logs [--org <org-alias-or-username>] [--latest | --id <log-id>] [--user <user>] [--limit <number>]');
  console.log('  pnpm cli analyze-log <org-alias-or-username> <log-id>');
  console.log('  pnpm cli inspect-log <org-alias-or-username> <log-id>');
  console.log('  pnpm cli analyze <path-to-salesforce-log>');
  console.log('  pnpm cli inspect <path-to-salesforce-log>');
  console.log('  pnpm cli <path-to-salesforce-log>');
}

main().catch((error: unknown) => {
  console.error('\nFailed to analyze Salesforce log.\n');
  console.error(error);
  process.exitCode = 1;
});
