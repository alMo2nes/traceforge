import { useEffect, useMemo, useState } from 'react';
import { flattenNodes, logs, type InvestigationNode, type LogRecord } from './data';
import './styles.css';

const nodeIcon: Record<InvestigationNode['kind'], string> = {
  transaction: 'TX',
  'code-unit': 'CU',
  method: 'fn',
  soql: 'DB',
  dml: 'DML',
  flow: 'FLW',
  exception: '!',
};

function formatDuration(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(2)} ms`;
}

function containsQuery(log: LogRecord, query: string): InvestigationNode[] {
  if (!query.trim()) return [];
  const needle = query.trim().toLowerCase();
  return flattenNodes(log.nodes).filter((node) =>
    [node.label, node.subtitle, node.variables.map((v) => `${v.name} ${v.value}`).join(' ')].some((value) =>
      value?.toLowerCase().includes(needle),
    ),
  );
}

function App() {
  const [query, setQuery] = useState('AccountService');
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>(['07L-demo-001', '07L-demo-002', '07L-demo-003', '07L-demo-005']);
  const [activeLogId, setActiveLogId] = useState('07L-demo-001');
  const [selectedNodeId, setSelectedNodeId] = useState('n-001');
  const [showSystem, setShowSystem] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = window.localStorage.getItem('traceforge-theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('traceforge-theme', theme);
  }, [theme]);

  const activeLog = logs.find((log) => log.id === activeLogId) ?? logs[0];
  const selectedLogs = logs.filter((log) => selectedLogIds.includes(log.id));

  const matches = useMemo(
    () => selectedLogs.flatMap((log) => containsQuery(log, query).map((node) => ({ log, node }))),
    [selectedLogs, query],
  );

  const selectedNode = useMemo(() => {
    const node = flattenNodes(activeLog.nodes).find((item) => item.id === selectedNodeId);
    return node ?? activeLog.nodes[0];
  }, [activeLog, selectedNodeId]);

  const toggleLog = (id: string) => {
    setSelectedLogIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const selectLog = (id: string) => {
    setActiveLogId(id);
    const first = logs.find((log) => log.id === id)?.nodes[0];
    setSelectedNodeId(first?.id ?? '');
  };

  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <div className="brand-name">TraceForge</div>
            <div className="brand-subtitle">Salesforce transaction investigation</div>
          </div>
        </div>
        <div className="context-pills">
          <span className="pill">mbk3</span>
          <span className="pill muted">moones@example.com</span>
          <span className="status-dot"><span /> Live session</span>
          <button
            className="theme-btn"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              aria-label="Search across selected logs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search class, method, variable, ID, exception..."
            />
            <span className="shortcut">⌘ K</span>
          </div>
          <div className="toolbar-actions">
            <label className="toggle"><input type="checkbox" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} /><span /> Show system calls</label>
            <button className="ghost-btn">Trace flag</button>
            <button className="primary-btn">Refresh logs</button>
          </div>
        </section>

        <div className="content-grid">
          <aside className="logs-panel panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Logs</div>
                <div className="panel-meta">{logs.length} transactions · 09:21–09:29</div>
              </div>
              <button className="icon-btn" title="Filter">☷</button>
            </div>
            <div className="selection-bar">
              <span>{selectedLogIds.length} selected</span>
              <button onClick={() => setSelectedLogIds(logs.map((log) => log.id))}>Select all</button>
            </div>
            <div className="log-list">
              {logs.map((log) => {
                const selected = selectedLogIds.includes(log.id);
                const active = log.id === activeLogId;
                return (
                  <button key={log.id} className={`log-card ${active ? 'active' : ''}`} onClick={() => selectLog(log.id)}>
                    <span className="check-wrap" onClick={(e) => { e.stopPropagation(); toggleLog(log.id); }}><span className={`fake-check ${selected ? 'checked' : ''}`}>{selected ? '✓' : ''}</span></span>
                    <span className="log-main">
                      <span className="log-time">{log.timestamp}</span>
                      <span className="log-entry">{log.entryPoint}</span>
                      <span className="log-summary">{log.summary}</span>
                      <span className="log-tags"><span className={`result ${log.status.toLowerCase()}`}>{log.status}</span><span>{formatDuration(log.durationMs)}</span><span>{log.sizeKb} KB</span></span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="results-panel panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Search results</div>
                <div className="panel-meta">{matches.length} matches across {selectedLogs.length} selected logs</div>
              </div>
              <span className="match-chip">{query || 'Search'}</span>
            </div>
            <div className="results-list">
              {matches.length === 0 ? (
                <div className="empty-state">No matching instances in the selected logs.</div>
              ) : matches.map(({ log, node }) => (
                <button key={`${log.id}-${node.id}`} className={`match-row ${log.id === activeLogId && node.id === selectedNodeId ? 'selected' : ''}`} onClick={() => { selectLog(log.id); setSelectedNodeId(node.id); }}>
                  <span className={`node-icon ${node.kind}`}>{nodeIcon[node.kind]}</span>
                  <span className="match-main">
                    <span className="match-name">{node.label}</span>
                    <span className="match-context">{log.timestamp} · {log.entryPoint}{node.line ? ` · line ${node.line}` : ''}</span>
                  </span>
                  <span className="match-duration">{formatDuration(node.durationMs)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="tree-panel panel">
            <div className="panel-header tree-header">
              <div>
                <div className="panel-title">Transaction</div>
                <div className="panel-meta">{activeLog.timestamp} · {activeLog.operation} · {activeLog.id}</div>
              </div>
              <div className="tree-actions"><button className="ghost-btn small">Collapse</button><button className="ghost-btn small">Raw log</button></div>
            </div>
            <div className="tree-scroll">
              {activeLog.nodes.map((node) => (
                <TreeNode key={node.id} node={node} selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} depth={0} showSystem={showSystem} />
              ))}
            </div>
          </section>

          <section className="inspector-panel panel">
            <div className="panel-header inspector-header">
              <div>
                <div className="panel-title">Inspector</div>
                <div className="panel-meta">Selected node · variables, exception, or debug output</div>
              </div>
              {selectedNode?.status === 'error' && <span className="error-badge">Error</span>}
            </div>
            {selectedNode && <div className="inspector-content">
              <div className="inspector-title-row"><span className={`node-icon large ${selectedNode.kind}`}>{nodeIcon[selectedNode.kind]}</span><div><h2>{selectedNode.label}</h2><p>{selectedNode.subtitle}</p></div></div>
              <div className="facts-grid">
                <div><span>Time</span><strong>{selectedNode.timestamp}</strong></div>
                <div><span>Duration</span><strong>{formatDuration(selectedNode.durationMs)}</strong></div>
                <div><span>Source line</span><strong>{selectedNode.line ?? '—'}</strong></div>
                <div><span>Log</span><strong>{activeLog.id}</strong></div>
              </div>
              <div className="inspector-section"><div className="section-heading">Variables & values</div><div className="variable-table">
                {selectedNode.variables.length === 0 ? <div className="muted-text">No variables captured at this node.</div> : selectedNode.variables.map((variable) => <div className="variable-row" key={`${variable.name}-${variable.type}`}><span className="variable-name">{variable.name}</span><span className="variable-type">{variable.type}</span><code>{variable.value}</code></div>)}
              </div></div>
              <div className="inspector-section"><div className="section-heading">Log output</div><pre className="log-output">{selectedNode.debugOutput ?? selectedNode.errorDetails ?? activeLog.summary}</pre></div>
            </div>}
          </section>
        </div>
      </main>
    </div>
  );
}

function TreeNode({ node, selectedNodeId, onSelect, depth, showSystem }: { node: InvestigationNode; selectedNodeId: string; onSelect: (id: string) => void; depth: number; showSystem: boolean }) {
  return (
    <div className="tree-node-wrap">
      <button className={`tree-node ${selectedNodeId === node.id ? 'selected' : ''} ${node.status === 'error' ? 'error' : ''}`} style={{ paddingLeft: `${10 + depth * 20}px` }} onClick={() => onSelect(node.id)}>
        <span className={`chevron ${node.children.length ? '' : 'empty'}`}>{node.children.length ? '▾' : '·'}</span>
        <span className={`node-icon ${node.kind}`}>{nodeIcon[node.kind]}</span>
        <span className="tree-label"><span>{node.label}</span><small>{node.subtitle}</small></span>
        {node.line && <span className="tree-line">L{node.line}</span>}
        <span className="tree-time">{formatDuration(node.durationMs)}</span>
      </button>
      {node.children.length > 0 && node.children.map((child) => <TreeNode key={child.id} node={child} selectedNodeId={selectedNodeId} onSelect={onSelect} depth={depth + 1} showSystem={showSystem} />)}
    </div>
  );
}

export default App;
