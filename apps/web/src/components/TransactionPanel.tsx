import type { InvestigationNode, LogRecord } from '../data';

const nodeIcon: Record<InvestigationNode['kind'], string> = { transaction: 'TX', 'code-unit': 'CU', method: 'fn', soql: 'DB', dml: 'DML', flow: 'FLW', exception: '!' };

interface TransactionPanelProps {
  activeLog?: LogRecord;
  selectedNodeId: string;
  collapsed: Record<string, boolean>;
  showSystem: boolean;
  onSelectNode: (id: string) => void;
  onToggleNode: (id: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onRawLog: () => void;
}

function formatDuration(value?: number): string { return value === undefined ? '—' : `${value.toFixed(2)} ms`; }

export function TransactionPanel({ activeLog, selectedNodeId, collapsed, showSystem, onSelectNode, onToggleNode, onCollapseAll, onExpandAll, onRawLog }: TransactionPanelProps) {
  return (
    <section className="tree-panel panel">
      <div className="panel-header tree-header">
        <div><div className="panel-title">Transaction</div><div className="panel-meta">{activeLog ? `${activeLog.timestamp} · ${activeLog.operation} · ${activeLog.id}` : 'No log selected'}</div></div>
        <div className="tree-actions">
          <button className="ghost-btn small" type="button" onClick={onCollapseAll} disabled={!activeLog}>Collapse</button>
          <button className="ghost-btn small" type="button" onClick={onExpandAll} disabled={!activeLog}>Expand</button>
          <button className="ghost-btn small" type="button" onClick={onRawLog} disabled={!activeLog}>Raw log</button>
        </div>
      </div>
      <div className="tree-scroll">{activeLog?.nodes.map((node) => <TreeNode key={node.id} node={node} selectedNodeId={selectedNodeId} onSelect={onSelectNode} depth={0} collapsed={collapsed} onToggle={onToggleNode} showSystem={showSystem} />)}</div>
    </section>
  );
}

function TreeNode({ node, selectedNodeId, onSelect, depth, collapsed, onToggle, showSystem }: { node: InvestigationNode; selectedNodeId: string; onSelect: (id: string) => void; depth: number; collapsed: Record<string, boolean>; onToggle: (id: string) => void; showSystem: boolean }) {
  const isCollapsed = collapsed[node.id];
  const children = showSystem ? node.children : node.children.filter((child) => child.kind !== 'method' || !child.label.startsWith('System.'));
  return <div className="tree-node-wrap"><div className={`tree-node ${selectedNodeId === node.id ? 'selected' : ''} ${node.status === 'error' ? 'error' : ''}`} style={{ paddingLeft: `${10 + depth * 20}px` }} onClick={() => onSelect(node.id)}><span className={`chevron ${children.length ? '' : 'empty'}`} onClick={(event) => { event.stopPropagation(); if (children.length) onToggle(node.id); }}>{children.length ? (isCollapsed ? '▸' : '▾') : '·'}</span><span className={`node-icon ${node.kind}`}>{nodeIcon[node.kind]}</span><span className="tree-label"><span>{node.label}</span><small>{node.subtitle}</small></span>{node.line && <span className="tree-line">L{node.line}</span>}<span className="tree-time">{formatDuration(node.durationMs)}</span></div>{!isCollapsed && children.map((child) => <TreeNode key={child.id} node={child} selectedNodeId={selectedNodeId} onSelect={onSelect} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} showSystem={showSystem} />)}</div>;
}
