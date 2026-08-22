import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { flattenNodes, logs as fixtureLogs, type InvestigationNode, type LogRecord } from './data';
import { traceforgeApi, type DebugLogInfo, type OrgInfo, type TraceFlagResult } from './api';
import { TraceFlagModal } from './TraceFlagModal';
import './styles.css';
import './layout.css';

const nodeIcon: Record<InvestigationNode['kind'], string> = {
  transaction: 'TX', 'code-unit': 'CU', method: 'fn', soql: 'DB', dml: 'DML', flow: 'FLW', exception: '!'
};

const nodeDetails: Record<string, string> = {
  'n-001': 'Apex entry point received the request and began Account update processing.',
  'n-002': 'USER_DEBUG|[74]|DEBUG|AccountService.validate() completed validation for account 001…7TAAS',
  'n-005': 'EXCEPTION_THROWN|[147]|System.NullPointerException: Attempt to de-reference a null object\n\nClass.AccountService.update: line 147, column 1\nClass.AccountController.saveAccount: line 93, column 1\n\nContext:\naccount = null',
  'n-202': 'USER_DEBUG|[74]|DEBUG|AccountService.validate() completed validation.\nVariables: isValid=true',
  'n-206': 'FLOW_ELEMENT_ERROR|Apex Action: NotificationService.notify()\nFlowFault: Notification failed\nRecipient is missing',
  'n-303': 'SOQL_EXECUTE_BEGIN|[41]|SELECT Id, Name FROM Account WHERE Id = :accountId\nSOQL_EXECUTE_END|[41]|Rows:1',
};

function formatDuration(value: number | undefined): string { return value === undefined ? '—' : `${value.toFixed(2)} ms`; }

function containsQuery(log: LogRecord, query: string): InvestigationNode[] {
  if (!query.trim()) return [];
  const needle = query.trim().toLowerCase();
  const nodes = flattenNodes(log.nodes).filter((node) =>
    [node.label, node.subtitle, node.variables.map((v) => `${v.name} ${v.value}`).join(' ')].some((value) => value?.toLowerCase().includes(needle)),
  );
  if (nodes.length === 0 && [log.entryPoint, log.operation, log.user, log.summary].some((value) => value?.toLowerCase().includes(needle))) return log.nodes.length ? [log.nodes[0]] : [];
  return nodes;
}

function toLocalTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

function toLogRecord(log: DebugLogInfo): LogRecord {
  const entryPoint = log.operation || 'Salesforce transaction';
  const status: LogRecord['status'] = (log.status ?? '').toLowerCase() === 'success' ? 'Success' : 'Error';
  const node: InvestigationNode = { id: `tx-${log.id}`, kind: 'transaction', label: entryPoint, subtitle: log.userName ? `User · ${log.userName}` : 'Salesforce transaction', timestamp: toLocalTime(log.startTime), durationMs: log.durationMs, status: status === 'Success' ? 'ok' : 'error', variables: [], children: [] };
  return { id: log.id, timestamp: node.timestamp, entryPoint, operation: log.operation ?? '—', durationMs: log.durationMs ?? 0, sizeKb: log.logLength ? Math.round(log.logLength / 1024) : 0, user: log.userName ?? log.userId ?? '—', status, summary: log.userName ? `${entryPoint} · ${log.userName}` : entryPoint, nodes: [node] };
}

function App() {
  const [query, setQuery] = useState('AccountService');
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [selectedOrg, setSelectedOrg] = useState(() => window.localStorage.getItem('traceforge-org') ?? '');
  const [liveLogs, setLiveLogs] = useState<LogRecord[] | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>(['07L-demo-001', '07L-demo-002', '07L-demo-003', '07L-demo-005']);
  const [activeLogId, setActiveLogId] = useState('07L-demo-001');
  const [selectedNodeId, setSelectedNodeId] = useState('n-001');
  const [showSystem, setShowSystem] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => window.localStorage.getItem('traceforge-theme') === 'light' ? 'light' : 'dark');
  const [inspectorHeight, setInspectorHeight] = useState(() => { const stored = Number(window.localStorage.getItem('traceforge-inspector-height')); return Number.isFinite(stored) && stored >= 180 && stored <= 620 ? stored : 280; });
  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [traceMessage, setTraceMessage] = useState('');
  const [traceMessageError, setTraceMessageError] = useState(false);

  const displayLogs = liveLogs ?? fixtureLogs;

  useEffect(() => { document.documentElement.dataset.theme = theme; window.localStorage.setItem('traceforge-theme', theme); }, [theme]);

  useEffect(() => {
    let cancelled = false;
    traceforgeApi.listOrgs().then((nextOrgs) => { if (!cancelled) { setOrgs(nextOrgs); if (!selectedOrg && nextOrgs[0]?.alias) setSelectedOrg(nextOrgs[0].alias); } }).catch((reason) => { if (!cancelled) setConnectionError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [selectedOrg]);

  useEffect(() => {
    if (!selectedOrg) return;
    window.localStorage.setItem('traceforge-org', selectedOrg);
    let cancelled = false;
    setDataLoading(true); setConnectionError('');
    traceforgeApi.listLogs(selectedOrg).then((records) => {
      if (cancelled) return;
      const mapped = records.map(toLogRecord);
      setLiveLogs(mapped); setLiveMode(true);
      setSelectedLogIds(mapped.slice(0, Math.min(4, mapped.length)).map((log) => log.id));
      const first = mapped[0]; setActiveLogId(first?.id ?? ''); setSelectedNodeId(first?.nodes[0]?.id ?? '');
    }).catch((reason) => { if (!cancelled) { setLiveMode(false); setConnectionError(reason instanceof Error ? reason.message : String(reason)); } }).finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [selectedOrg]);

  const activeLog = displayLogs.find((log) => log.id === activeLogId) ?? displayLogs[0];
  const selectedLogs = displayLogs.filter((log) => selectedLogIds.includes(log.id));
  const matches = useMemo(() => selectedLogs.flatMap((log) => containsQuery(log, query).map((node) => ({ log, node }))), [selectedLogs, query]);
  const selectedNode = useMemo(() => { const node = activeLog ? flattenNodes(activeLog.nodes).find((item) => item.id === selectedNodeId) : undefined; return node ?? activeLog?.nodes[0]; }, [activeLog, selectedNodeId]);

  const toggleLog = (id: string) => setSelectedLogIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectLog = (id: string) => { setActiveLogId(id); const first = displayLogs.find((log) => log.id === id)?.nodes[0]; setSelectedNodeId(first?.id ?? ''); };
  const refreshLogs = () => { if (!selectedOrg) return; setDataLoading(true); traceforgeApi.listLogs(selectedOrg).then((records) => setLiveLogs(records.map(toLogRecord))).catch((reason) => setConnectionError(reason instanceof Error ? reason.message : String(reason))).finally(() => setDataLoading(false)); };
  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark');

  const resizeInspector = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); const startY = event.clientY; const startHeight = inspectorHeight;
    const onMove = (moveEvent: PointerEvent) => { const delta = startY - moveEvent.clientY; setInspectorHeight(Math.max(180, Math.min(620, startHeight + delta))); };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none'; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  useEffect(() => { window.localStorage.setItem('traceforge-inspector-height', String(inspectorHeight)); }, [inspectorHeight]);

  const detailText = selectedNode ? (nodeDetails[selectedNode.id] ?? selectedNode.subtitle ?? activeLog?.summary ?? '') : activeLog?.summary ?? '';
  const handleTraceCreated = (result: TraceFlagResult) => { setTraceMessage(`Trace flag active until ${result.expirationDate ? new Date(result.expirationDate).toLocaleTimeString() : 'expiration'}.`); setTraceMessageError(false); };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">T</div><div><div className="brand-name">TraceForge</div><div className="brand-subtitle">Salesforce transaction investigation</div></div></div>
        <div className="context-pills">
          <label className="org-picker"><span>Org</span><select value={selectedOrg} onChange={(event) => setSelectedOrg(event.target.value)} disabled={!orgs.length}>{!orgs.length && <option value="">No connected org</option>}{orgs.map((org) => <option key={`${org.alias}-${org.username}`} value={org.alias}>{org.alias}</option>)}</select></label>
          <span className={`mode-pill ${liveMode ? 'live' : 'demo'}`}>{liveMode ? 'Live org' : 'Demo data'}</span>
          <span className="status-dot"><span /> {dataLoading ? 'Loading' : 'Ready'}</span>
          <button className="theme-btn" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span><span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
        </div>
      </header>

      <main className="workspace">
        <section className="toolbar">
          <div className="search-wrap"><span className="search-icon">⌕</span><input aria-label="Search across selected logs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search class, method, variable, ID, exception..." /><span className="shortcut">⌘ K</span></div>
          <div className="toolbar-actions"><label className="toggle"><input type="checkbox" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} /><span /> Show system calls</label><button className="ghost-btn" type="button" onClick={() => { setTraceMessage(''); setTraceMessageError(false); setTraceModalOpen(true); }} disabled={!selectedOrg}>Trace flag</button><button className="primary-btn" type="button" onClick={refreshLogs} disabled={!selectedOrg || dataLoading}>{dataLoading ? 'Refreshing…' : 'Refresh logs'}</button></div>
        </section>

        {traceMessage && <div className={`trace-toast ${traceMessageError ? 'error' : ''}`}>{traceMessage}</div>}
        {connectionError && !liveMode && <div className="connection-banner">Salesforce API unavailable: {connectionError}. Showing demo logs.</div>}

        <div className="content-grid" style={{ '--inspector-height': `${inspectorHeight}px` } as CSSProperties}>
          <aside className="logs-panel panel"><div className="panel-header"><div><div className="panel-title">Logs</div><div className="panel-meta">{displayLogs.length} transactions</div></div><button className="icon-btn" title="Filter" type="button">☷</button></div><div className="selection-bar"><span>{selectedLogIds.length} selected</span><button type="button" onClick={() => setSelectedLogIds(displayLogs.map((log) => log.id))}>Select all</button></div><div className="log-list">
            {displayLogs.map((log) => { const selected = selectedLogIds.includes(log.id); const active = log.id === activeLogId; return <button key={log.id} className={`log-card ${active ? 'active' : ''}`} onClick={() => selectLog(log.id)}><span className="check-wrap" onClick={(e) => { e.stopPropagation(); toggleLog(log.id); }}><span className={`fake-check ${selected ? 'checked' : ''}`}>{selected ? '✓' : ''}</span></span><span className="log-main"><span className="log-time">{log.timestamp}</span><span className="log-entry">{log.entryPoint}</span><span className="log-summary">{log.summary}</span><span className="log-tags"><span className={`result ${log.status.toLowerCase()}`}>{log.status}</span><span>{formatDuration(log.durationMs)}</span><span>{log.sizeKb} KB</span></span></span></button>; })}
          </div></aside>

          <section className="results-panel panel"><div className="panel-header"><div><div className="panel-title">Search results</div><div className="panel-meta">{matches.length} matches across {selectedLogs.length} selected logs</div></div><span className="match-chip">{query || 'Search'}</span></div><div className="results-list">{matches.length === 0 ? <div className="empty-state">No matching instances in the selected logs.</div> : matches.map(({ log, node }) => <button key={`${log.id}-${node.id}`} className={`match-row ${log.id === activeLogId && node.id === selectedNodeId ? 'selected' : ''}`} onClick={() => { selectLog(log.id); setSelectedNodeId(node.id); }}><span className={`node-icon ${node.kind}`}>{nodeIcon[node.kind]}</span><span className="match-main"><span className="match-name">{node.label}</span><span className="match-context">{log.timestamp} · {log.entryPoint}{node.line ? ` · line ${node.line}` : ''}</span></span><span className="match-duration">{formatDuration(node.durationMs)}</span></button>)}</div></section>

          <section className="tree-panel panel"><div className="panel-header tree-header"><div><div className="panel-title">Transaction</div><div className="panel-meta">{activeLog ? `${activeLog.timestamp} · ${activeLog.operation} · ${activeLog.id}` : 'No log selected'}</div></div><div className="tree-actions"><button className="ghost-btn small" type="button">Collapse</button><button className="ghost-btn small" type="button">Raw log</button></div></div><div className="tree-scroll">{activeLog?.nodes.map((node) => <TreeNode key={node.id} node={node} selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} depth={0} showSystem={showSystem} />)}</div></section>

          <div className="inspector-resizer" role="separator" aria-orientation="horizontal" aria-label="Resize inspector" onPointerDown={resizeInspector}><span /></div>

          <section className="inspector-panel panel"><div className="panel-header inspector-header"><div><div className="panel-title">Inspector</div><div className="panel-meta">Selected node · variables, exception, or debug output</div></div>{selectedNode?.status === 'error' && <span className="error-badge">Error</span>}</div>{selectedNode && <div className="inspector-content"><div className="inspector-title-row"><span className={`node-icon large ${selectedNode.kind}`}>{nodeIcon[selectedNode.kind]}</span><div><h2>{selectedNode.label}</h2><p>{selectedNode.subtitle}</p></div></div><div className="facts-grid"><div><span>Time</span><strong>{selectedNode.timestamp}</strong></div><div><span>Duration</span><strong>{formatDuration(selectedNode.durationMs)}</strong></div><div><span>Source line</span><strong>{selectedNode.line ?? '—'}</strong></div><div><span>Log</span><strong>{activeLog?.id ?? '—'}</strong></div></div><div className="inspector-section"><div className="section-heading">Variables & values</div><div className="variable-table">{selectedNode.variables.length === 0 ? <div className="muted-text">No variables captured at this node.</div> : selectedNode.variables.map((variable) => <div className="variable-row" key={`${variable.name}-${variable.type}`}><span className="variable-name">{variable.name}</span><span className="variable-type">{variable.type}</span><code>{variable.value}</code></div>)}</div></div><div className="inspector-section log-output-section"><div className="section-heading">Log output</div><pre className="log-output">{detailText}</pre></div></div>}</section>
        </div>
      </main>

      {selectedOrg && <TraceFlagModal org={selectedOrg} open={traceModalOpen} onClose={() => setTraceModalOpen(false)} onCreated={handleTraceCreated} />}
    </div>
  );
}

function TreeNode({ node, selectedNodeId, onSelect, depth, showSystem }: { node: InvestigationNode; selectedNodeId: string; onSelect: (id: string) => void; depth: number; showSystem: boolean }) {
  return <div className="tree-node-wrap"><button className={`tree-node ${selectedNodeId === node.id ? 'selected' : ''} ${node.status === 'error' ? 'error' : ''}`} style={{ paddingLeft: `${10 + depth * 20}px` }} onClick={() => onSelect(node.id)}><span className={`chevron ${node.children.length ? '' : 'empty'}`}>{node.children.length ? '▾' : '·'}</span><span className={`node-icon ${node.kind}`}>{nodeIcon[node.kind]}</span><span className="tree-label"><span>{node.label}</span><small>{node.subtitle}</small></span>{node.line && <span className="tree-line">L{node.line}</span>}<span className="tree-time">{formatDuration(node.durationMs)}</span></button>{node.children.length > 0 && node.children.map((child) => <TreeNode key={child.id} node={child} selectedNodeId={selectedNodeId} onSelect={onSelect} depth={depth + 1} showSystem={showSystem} />)}</div>;
}

export default App;
