import { useState } from 'react';
import type { InvestigationNode, LogRecord } from '../data';
import { LoadingSpinner } from './LoadingSpinner';

const nodeIcon: Record<InvestigationNode['kind'], string> = {
  transaction: 'TX',
  'code-unit': 'CU',
  method: 'fn',
  soql: 'DB',
  dml: 'DML',
  flow: 'FLW',
  exception: '!',
};

export type NodeKindFilter = 'all' | 'soql' | 'dml' | 'exception';

interface TransactionPanelProps {
  activeLog?: LogRecord;
  selectedNodeId: string;
  collapsed: Record<string, boolean>;
  showSystem: boolean;
  loading: boolean;
  isTruncated?: boolean;
  onSelectNode: (id: string) => void;
  onToggleNode: (id: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onRawLog: () => void;
}

function formatDuration(value?: number): string {
  return value === undefined ? '—' : `${value.toFixed(2)} ms`;
}

function matchesFilter(node: InvestigationNode, filter: NodeKindFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'exception') return node.kind === 'exception' || node.status === 'error';
  return node.kind === filter;
}

function hasMatchingDescendant(node: InvestigationNode, filter: NodeKindFilter): boolean {
  if (matchesFilter(node, filter)) return true;
  return node.children.some((child) => hasMatchingDescendant(child, filter));
}

/**
 * Displays the hierarchical transaction tree returned by the investigation API.
 * System method nodes are hidden by default to keep the tree focused on user code.
 */
export function TransactionPanel({
  activeLog,
  selectedNodeId,
  collapsed,
  showSystem,
  loading,
  isTruncated,
  onSelectNode,
  onToggleNode,
  onCollapseAll,
  onExpandAll,
  onRawLog,
}: TransactionPanelProps) {
  const [filterKind, setFilterKind] = useState<NodeKindFilter>('all');

  return (
    <section className="tree-panel panel">
      <div className="panel-header tree-header">
        <div>
          <div className="panel-title">Transaction</div>
          <div className="panel-meta">
            {activeLog
              ? `${activeLog.timestamp} · ${activeLog.operation} · ${activeLog.id}`
              : 'No log selected'}
          </div>
        </div>

        <div className="tree-actions">
          <button
            className="ghost-btn small"
            type="button"
            onClick={onCollapseAll}
            disabled={!activeLog || loading}
          >
            Collapse
          </button>
          <button
            className="ghost-btn small"
            type="button"
            onClick={onExpandAll}
            disabled={!activeLog || loading}
          >
            Expand
          </button>
          <button
            className="ghost-btn small"
            type="button"
            onClick={onRawLog}
            disabled={!activeLog || loading}
          >
            Raw log
          </button>
        </div>
      </div>

      {isTruncated && (
        <div className="truncation-banner" role="alert">
          ⚠️ <strong>Salesforce debug log truncated</strong> — Maximum debug log size reached.
        </div>
      )}

      <div className="tree-filter-bar">
        <span className="filter-label">Filter:</span>
        <button
          className={`filter-chip ${filterKind === 'all' ? 'active' : ''}`}
          type="button"
          onClick={() => setFilterKind('all')}
        >
          All
        </button>
        <button
          className={`filter-chip soql ${filterKind === 'soql' ? 'active' : ''}`}
          type="button"
          onClick={() => setFilterKind('soql')}
        >
          SOQL
        </button>
        <button
          className={`filter-chip dml ${filterKind === 'dml' ? 'active' : ''}`}
          type="button"
          onClick={() => setFilterKind('dml')}
        >
          DML
        </button>
        <button
          className={`filter-chip exception ${filterKind === 'exception' ? 'active' : ''}`}
          type="button"
          onClick={() => setFilterKind('exception')}
        >
          Errors
        </button>
      </div>

      <div className="tree-scroll">
        {activeLog?.nodes.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            selectedNodeId={selectedNodeId}
            onSelect={onSelectNode}
            depth={0}
            collapsed={collapsed}
            onToggle={onToggleNode}
            showSystem={showSystem}
            filterKind={filterKind}
          />
        ))}
      </div>

      {loading && <LoadingSpinner label="Analyzing transaction…" />}
    </section>
  );
}

interface TreeNodeProps {
  node: InvestigationNode;
  selectedNodeId: string;
  onSelect: (id: string) => void;
  depth: number;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  showSystem: boolean;
  filterKind: NodeKindFilter;
}

/** Renders one tree node recursively while preserving the execution hierarchy. */
function TreeNode({
  node,
  selectedNodeId,
  onSelect,
  depth,
  collapsed,
  onToggle,
  showSystem,
  filterKind,
}: TreeNodeProps) {
  if (filterKind !== 'all' && !hasMatchingDescendant(node, filterKind)) {
    return null;
  }

  const isCollapsed = filterKind === 'all' ? collapsed[node.id] : false;
  const children = (
    showSystem
      ? node.children
      : node.children.filter(
          (child) =>
            child.kind !== 'method' || !child.label.startsWith('System.'),
        )
  ).filter(
    (child) => filterKind === 'all' || hasMatchingDescendant(child, filterKind),
  );

  return (
    <div className="tree-node-wrap">
      <div
        className={`tree-node ${selectedNodeId === node.id ? 'selected' : ''} ${
          node.status === 'error' ? 'error' : ''
        }`}
        style={{ paddingLeft: `${10 + depth * 20}px` }}
        onClick={() => onSelect(node.id)}
      >
        <span
          className={`chevron ${children.length ? '' : 'empty'}`}
          onClick={(event) => {
            event.stopPropagation();
            if (children.length) {
              onToggle(node.id);
            }
          }}
        >
          {children.length ? (isCollapsed ? '▸' : '▾') : '·'}
        </span>

        <span className={`node-icon ${node.kind}`}>
          {nodeIcon[node.kind]}
        </span>

        <span className="tree-label">
          <span>{node.label}</span>
          <small>{node.subtitle}</small>
        </span>

        {node.line && <span className="tree-line">L{node.line}</span>}
        <span className="tree-time">{formatDuration(node.durationMs)}</span>
      </div>

      {!isCollapsed &&
        children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
            depth={depth + 1}
            collapsed={collapsed}
            onToggle={onToggle}
            showSystem={showSystem}
            filterKind={filterKind}
          />
        ))}
    </div>
  );
}
