import { describe, expect, it } from 'vitest';

import type { LogEvent } from '@traceforge/shared';
import { LogAnalyzer } from './index.js';

function event(id: string, durationMs?: number, parentId?: string): LogEvent {
  return { id, type: 'METHOD', name: id, durationMs, parentId };
}

describe('LogAnalyzer execution tree', () => {
  it('builds parent and child relationships', () => {
    const tree = new LogAnalyzer([event('root', 10), event('child', 4, 'root')]).getExecutionTree();

    expect(tree).toHaveLength(1);
    expect(tree[0]?.event.id).toBe('root');
    expect(tree[0]?.children[0]?.event.id).toBe('child');
  });

  it('calculates self duration from direct child durations', () => {
    const tree = new LogAnalyzer([
      event('root', 20), event('first', 7, 'root'), event('second', 5, 'root')
    ]).getExecutionTree();

    expect(tree[0]?.selfDurationMs).toBe(8);
  });

  it('keeps independent events as multiple roots', () => {
    const tree = new LogAnalyzer([event('first', 5), event('second', 10)]).getExecutionTree();

    expect(tree.map((node) => node.event.id)).toEqual(['first', 'second']);
  });

  it('returns the duration-dominant nested critical path', () => {
    const analyzer = new LogAnalyzer([
      event('root', 100), event('short', 30, 'root'), event('long', 80, 'root'),
      event('leaf', 60, 'long'), event('other-root', 90)
    ]);

    expect(analyzer.getCriticalPath().map((item) => item.id)).toEqual(['root', 'long', 'leaf']);
  });

  it('keeps self duration undefined for events without duration', () => {
    const tree = new LogAnalyzer([event('root'), event('child', 5, 'root')]).getExecutionTree();

    expect(tree[0]?.selfDurationMs).toBeUndefined();
    expect(tree[0]?.children[0]?.selfDurationMs).toBe(5);
  });

  it('clamps negative self duration to zero', () => {
    const tree = new LogAnalyzer([event('root', 5), event('child', 8, 'root')]).getExecutionTree();

    expect(tree[0]?.selfDurationMs).toBe(0);
  });
});
