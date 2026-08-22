import type {
  LogEvent,
  LogEventType
} from '@traceforge/shared';

export interface SearchResult {
  event: LogEvent;
  path: string[];
}

export interface LogStatistics {
  eventCount: number;
  executionCount: number;
  codeUnitCount: number;
  methodCount: number;
  soqlCount: number;
  dmlCount: number;
  calloutCount: number;
  exceptionCount: number;
  limitCount: number;
  systemEventCount: number;
  otherCount: number;
}

export interface MethodSummary {
  name: string;
  invocations: number;
  totalDurationMs: number;
  maxDurationMs: number;
  avgDurationMs: number;
  minDurationMs: number;
}

export interface ExecutionTreeNode {
  event: LogEvent;
  children: ExecutionTreeNode[];
  selfDurationMs?: number;
}

export type PerformanceCategory =
  | 'database'
  | 'callout'
  | 'apex'
  | 'system'
  | 'entry-point'
  | 'other';

export type PerformanceSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface PerformanceEventReference {
  id: string;
  name: string;
  category: PerformanceCategory;
  totalTimeMs?: number;
}

export interface PerformanceHotspot {
  event: LogEvent;
  name: string;
  category: PerformanceCategory;
  totalTimeMs: number;
  selfTimeMs?: number;
  percentageOfExecution: number;
  invocationCount: number;
  parent?: PerformanceEventReference;
  children: PerformanceEventReference[];
  severity: PerformanceSeverity;
}

export interface RepeatedOperation extends PerformanceHotspot {
  averageTimeMs: number;
  percentageOfParent?: number;
  parentContexts: Array<PerformanceEventReference & {
    invocationCount: number;
    totalTimeMs: number;
    percentageOfParent?: number;
  }>;
}

export type PerformanceRecommendationKind =
  | 'investigate-child-operation'
  | 'investigate-application-hotspot'
  | 'review-repeated-operation'
  | 'review-callout-latency';

export interface PerformanceRecommendation {
  kind: PerformanceRecommendationKind;
  target: PerformanceHotspot;
  related?: PerformanceHotspot;
  percentageOfParent?: number;
}

export interface PerformanceAnalysis {
  totalExecutionDurationMs?: number;
  primaryBottleneck?: PerformanceHotspot;
  highestTotalTime?: PerformanceHotspot;
  highestSelfTime?: PerformanceHotspot;
  highestDatabaseTime?: PerformanceHotspot;
  highestCalloutTime?: PerformanceHotspot;
  highestApexTime?: PerformanceHotspot;
  applicationHotspots: PerformanceHotspot[];
  databaseHotspots: PerformanceHotspot[];
  calloutHotspots: PerformanceHotspot[];
  systemHotspots: PerformanceHotspot[];
  repeatedOperations: RepeatedOperation[];
  recommendations: PerformanceRecommendation[];
}

export class LogAnalyzer {
  private readonly eventsById = new Map<string, LogEvent>();
  private readonly childrenByParentId = new Map<string, LogEvent[]>();

  constructor(private readonly events: LogEvent[]) {
    this.indexEvents();
  }

  private indexEvents(): void {
    for (const event of this.events) {
      this.eventsById.set(event.id, event);

      if (event.parentId) {
        const children = this.childrenByParentId.get(event.parentId) ?? [];

        children.push(event);

        this.childrenByParentId.set(event.parentId, children);
      }
    }
  }

  /**
   * Search all events by type, name or id.
   */
  search(query: string): SearchResult[] {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return this.events
      .filter((event) => {
        const searchableText = [
          event.type,
          event.name,
          event.id
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(normalizedQuery);
      })
      .map((event) => ({
        event,
        path: this.getPath(event)
      }));
  }

  /**
   * Return all direct children of an event.
   */
  getChildren(eventId: string): LogEvent[] {
    return this.childrenByParentId.get(eventId) ?? [];
  }

  /**
   * Return an event by id.
   */
  getEvent(eventId: string): LogEvent | undefined {
    return this.eventsById.get(eventId);
  }

  /**
   * Return the execution path from the root to an event.
   */
  getPath(event: LogEvent): string[] {
    const path: string[] = [];

    let current: LogEvent | undefined = event;

    while (current) {
      if (current.name) {
        path.unshift(current.name);
      }

      current = current.parentId
        ? this.eventsById.get(current.parentId)
        : undefined;
    }

    return path;
  }

  /**
   * Return the most expensive events.
   */
  getHotspots(limit = 10): LogEvent[] {
    return [...this.events]
      .filter((event) => typeof event.durationMs === 'number')
      .sort(
        (a, b) =>
          (b.durationMs ?? 0) -
          (a.durationMs ?? 0)
      )
      .slice(0, limit);
  }

  /**
   * Build the nested execution structure represented by event parent IDs.
   * Events whose parent is absent from the log are treated as roots.
   */
  getExecutionTree(): ExecutionTreeNode[] {
    const nodesById = new Map<string, ExecutionTreeNode>();

    for (const event of this.events) {
      nodesById.set(event.id, { event, children: [] });
    }

    const roots: ExecutionTreeNode[] = [];
    for (const event of this.events) {
      const node = nodesById.get(event.id)!;
      const parent = event.parentId ? nodesById.get(event.parentId) : undefined;

      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    for (const node of nodesById.values()) {
      if (typeof node.event.durationMs === 'number') {
        const childDuration = node.children.reduce(
          (total, child) => total + (child.event.durationMs ?? 0),
          0
        );
        node.selfDurationMs = Math.max(0, node.event.durationMs - childDuration);
      }
    }

    return roots;
  }

  /**
   * Return the duration-dominant nested chain, starting at the longest root.
   */
  getCriticalPath(): LogEvent[] {
    const roots = this.getExecutionTree();
    const root = this.longestDurationNode(roots);
    const path: LogEvent[] = [];
    let current = root;

    while (current) {
      path.push(current.event);
      current = this.longestDurationNode(current.children);
    }

    return path;
  }

  /**
   * Diagnose expensive work using only event durations and their hierarchy.
   */
  getPerformanceAnalysis(): PerformanceAnalysis {
    const tree = this.getExecutionTree();
    const nodes = this.flattenTree(tree);
    const totalExecutionDurationMs = this.executionDuration(tree);
    const hotspots = nodes
      .filter((node) => typeof node.event.durationMs === 'number' && node.event.type !== 'EXECUTION')
      .map((node) => this.toHotspot(node, totalExecutionDurationMs));
    const byTotalTime = this.sortByTotal(hotspots);
    const applicationHotspots = this.sortByTotal(hotspots.filter((hotspot) => hotspot.category === 'apex'));
    const databaseHotspots = this.sortByTotal(hotspots.filter((hotspot) => hotspot.category === 'database'));
    const calloutHotspots = this.sortByTotal(hotspots.filter((hotspot) => hotspot.category === 'callout'));
    const systemHotspots = this.sortByTotal(hotspots.filter((hotspot) => hotspot.category === 'system'));
    const primaryBottleneck = applicationHotspots[0];
    const repeatedOperations = this.repeatedExpensiveOperations(nodes, totalExecutionDurationMs);

    return {
      totalExecutionDurationMs,
      primaryBottleneck,
      highestTotalTime: byTotalTime[0],
      highestSelfTime: [...hotspots].sort((a, b) => (b.selfTimeMs ?? 0) - (a.selfTimeMs ?? 0))[0],
      highestDatabaseTime: databaseHotspots[0],
      highestCalloutTime: calloutHotspots[0],
      highestApexTime: applicationHotspots[0],
      applicationHotspots,
      databaseHotspots,
      calloutHotspots,
      systemHotspots,
      repeatedOperations,
      recommendations: this.recommendations(
        primaryBottleneck,
        databaseHotspots,
        repeatedOperations,
        calloutHotspots
      )
    };
  }

  /**
   * Return high-level statistics about the log.
   */
  getStatistics(): LogStatistics {
    const statistics: LogStatistics = {
      eventCount: this.events.length,
      executionCount: 0,
      codeUnitCount: 0,
      methodCount: 0,
      soqlCount: 0,
      dmlCount: 0,
      calloutCount: 0,
      exceptionCount: 0,
      limitCount: 0,
      systemEventCount: 0,
      otherCount: 0
    };

    for (const event of this.events) {
      switch (event.type) {
        case 'EXECUTION':
          statistics.executionCount++;
          break;

        case 'CODE_UNIT':
          statistics.codeUnitCount++;
          break;

        case 'METHOD':
          statistics.methodCount++;
          break;

        case 'SOQL':
          statistics.soqlCount++;
          break;

        case 'DML':
          statistics.dmlCount++;
          break;

        case 'CALLOUT':
          statistics.calloutCount++;
          break;

        case 'EXCEPTION':
          statistics.exceptionCount++;
          break;

        case 'LIMIT':
          statistics.limitCount++;
          break;

        case 'SYSTEM':
          statistics.systemEventCount++;
          break;

        default:
          statistics.otherCount++;
          break;
      }
    }

    return statistics;
  }

  /**
   * Aggregate METHOD events by method name.
   *
   * This is more useful than returning every individual invocation.
   */
  findMethods(query?: string): MethodSummary[] {
    const normalizedQuery = query?.trim().toLowerCase();

    const methodEvents = this.events.filter((event) => {
      if (event.type !== 'METHOD' || !event.name) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return event.name.toLowerCase().includes(normalizedQuery);
    });

    const grouped = new Map<string, LogEvent[]>();

    for (const event of methodEvents) {
      const name = event.name!;

      const existing = grouped.get(name) ?? [];

      existing.push(event);

      grouped.set(name, existing);
    }

    const results: MethodSummary[] = [];

    for (const [name, invocations] of grouped) {
      const durations = invocations
        .map((event) => event.durationMs)
        .filter(
          (duration): duration is number =>
            typeof duration === 'number'
        );

      if (durations.length === 0) {
        results.push({
          name,
          invocations: invocations.length,
          totalDurationMs: 0,
          maxDurationMs: 0,
          avgDurationMs: 0,
          minDurationMs: 0
        });

        continue;
      }

      const totalDurationMs = durations.reduce(
        (total, duration) => total + duration,
        0
      );

      results.push({
        name,
        invocations: invocations.length,
        totalDurationMs,
        maxDurationMs: Math.max(...durations),
        avgDurationMs:
          totalDurationMs / durations.length,
        minDurationMs: Math.min(...durations)
      });
    }

    return results.sort(
      (a, b) =>
        b.totalDurationMs -
        a.totalDurationMs
    );
  }

  private longestDurationNode(nodes: ExecutionTreeNode[]): ExecutionTreeNode | undefined {
    return nodes.reduce<ExecutionTreeNode | undefined>((longest, node) => {
      if (!longest || (node.event.durationMs ?? 0) > (longest.event.durationMs ?? 0)) {
        return node;
      }

      return longest;
    }, undefined);
  }

  private flattenTree(nodes: ExecutionTreeNode[]): ExecutionTreeNode[] {
    return nodes.flatMap((node) => [node, ...this.flattenTree(node.children)]);
  }

  private executionDuration(tree: ExecutionTreeNode[]): number | undefined {
    const executionDurations = tree
      .filter((node) => node.event.type === 'EXECUTION')
      .map((node) => node.event.durationMs)
      .filter((duration): duration is number => typeof duration === 'number');
    const rootDurations = tree
      .map((node) => node.event.durationMs)
      .filter((duration): duration is number => typeof duration === 'number');
    const durations = executionDurations.length > 0 ? executionDurations : rootDurations;

    return durations.length > 0 ? Math.max(...durations) : undefined;
  }

  private toHotspot(node: ExecutionTreeNode, total?: number): PerformanceHotspot {
    const duration = node.event.durationMs ?? 0;
    const category = this.categoryFor(node.event);
    const parent = node.event.parentId ? this.eventsById.get(node.event.parentId) : undefined;

    return {
      event: node.event,
      name: this.eventName(node.event),
      category,
      totalTimeMs: duration,
      selfTimeMs: node.selfDurationMs,
      percentageOfExecution: total ? (duration / total) * 100 : 0,
      invocationCount: 1,
      parent: parent ? this.eventReference(parent) : undefined,
      children: node.children.map((child) => this.eventReference(child.event)),
      severity: this.severity(duration, total)
    };
  }

  private repeatedExpensiveOperations(nodes: ExecutionTreeNode[], total?: number): RepeatedOperation[] {
    const grouped = new Map<string, ExecutionTreeNode[]>();
    for (const node of nodes) {
      if (node.event.type === 'METHOD' && node.event.name && typeof node.event.durationMs === 'number') {
        grouped.set(node.event.name, [...(grouped.get(node.event.name) ?? []), node]);
      }
    }

    return [...grouped.entries()]
      .map(([name, invocations]) => {
        const totalTimeMs = invocations.reduce((sum, node) => sum + (node.event.durationMs ?? 0), 0);
        const contexts = new Map<string, ExecutionTreeNode[]>();
        for (const node of invocations) {
          const key = node.event.parentId ?? '__root__';
          contexts.set(key, [...(contexts.get(key) ?? []), node]);
        }
        const first = invocations[0]!;
        const parent = first.event.parentId ? this.eventsById.get(first.event.parentId) : undefined;
        const parentDuration = parent?.durationMs;

        return {
          ...this.toHotspot({ ...first, children: [] }, total),
          name,
          totalTimeMs,
          selfTimeMs: invocations.reduce((sum, node) => sum + (node.selfDurationMs ?? 0), 0),
          percentageOfExecution: total ? (totalTimeMs / total) * 100 : 0,
          invocationCount: invocations.length,
          averageTimeMs: totalTimeMs / invocations.length,
          percentageOfParent: parentDuration ? (totalTimeMs / parentDuration) * 100 : undefined,
          parentContexts: [...contexts.entries()].map(([parentId, contextNodes]) => {
            const contextParent = parentId === '__root__' ? undefined : this.eventsById.get(parentId);
            const contextTotal = contextNodes.reduce((sum, node) => sum + (node.event.durationMs ?? 0), 0);
            return {
              id: parentId,
              name: contextParent ? this.eventName(contextParent) : 'root',
              category: contextParent ? this.categoryFor(contextParent) : 'other' as PerformanceCategory,
              totalTimeMs: contextTotal,
              invocationCount: contextNodes.length,
              percentageOfParent: contextParent?.durationMs
                ? (contextTotal / contextParent.durationMs) * 100
                : undefined
            };
          }),
          severity: this.severity(totalTimeMs, total)
        };
      })
      .filter((operation) => operation.invocationCount > 1
        && operation.totalTimeMs >= (total ? total * 0.05 : 100))
      .sort((a, b) => b.totalTimeMs - a.totalTimeMs);
  }

  private recommendations(
    primary: PerformanceHotspot | undefined,
    databases: PerformanceHotspot[],
    repeated: RepeatedOperation[],
    callouts: PerformanceHotspot[]
  ): PerformanceRecommendation[] {
    const result: PerformanceRecommendation[] = [];
    const primaryChildIds = new Set(primary?.children.map((child) => child.id) ?? []);
    const relatedDatabase = databases.find((hotspot) => primaryChildIds.has(hotspot.event.id));

    if (primary && relatedDatabase) {
      result.push({
        kind: 'investigate-child-operation', target: primary, related: relatedDatabase,
        percentageOfParent: primary.totalTimeMs
          ? (relatedDatabase.totalTimeMs / primary.totalTimeMs) * 100
          : undefined
      });
    } else if (primary) {
      result.push({ kind: 'investigate-application-hotspot', target: primary });
    }
    repeated.forEach((target) => result.push({ kind: 'review-repeated-operation', target }));
    if (callouts.length > 0) result.push({ kind: 'review-callout-latency', target: callouts[0]! });
    return result;
  }

  private categoryFor(event: LogEvent): PerformanceCategory {
    if (event.type === 'SOQL' || event.type === 'DML') return 'database';
    if (event.type === 'CALLOUT') return 'callout';
    if (event.type === 'SYSTEM' || (event.type === 'METHOD' && event.name?.startsWith('System.'))) return 'system';
    if (event.type === 'METHOD') return 'apex';
    if (event.type === 'CODE_UNIT' || /^VF:|^\/aura|^\/apex|\bLWC\b|\blightning\b/i.test(event.name ?? '')) return 'entry-point';
    return 'other';
  }

  private severity(duration: number, total?: number): PerformanceSeverity {
    const percentage = total ? (duration / total) * 100 : 0;
    if (percentage >= 50) return 'critical';
    if (percentage >= 20) return 'high';
    if (percentage >= 5) return 'medium';
    return 'low';
  }

  private eventReference(event: LogEvent): PerformanceEventReference {
    return {
      id: event.id,
      name: this.eventName(event),
      category: this.categoryFor(event),
      totalTimeMs: event.durationMs
    };
  }

  private eventName(event: LogEvent): string {
    return event.name ?? event.type;
  }

  private sortByTotal(hotspots: PerformanceHotspot[]): PerformanceHotspot[] {
    return [...hotspots].sort((a, b) => b.totalTimeMs - a.totalTimeMs);
  }
}
