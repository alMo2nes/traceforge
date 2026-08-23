import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { flattenNodes, type InvestigationNode, type LogRecord, type VariableValue } from './data';
import { traceforgeApi, type DebugLogInfo, type InvestigationNodeDto, type OrgInfo, type TraceFlagResult } from './api';
import { TraceFlagModal } from './TraceFlagModal';
import './styles.css';
import './layout.css';
import './integration.css';

const nodeIcon: Record<InvestigationNode['kind'], string> = { transaction: 'TX', 'code-unit': 'CU', method: 'fn', soql: 'DB', dml: 'DML', flow: 'FLW', exception: '!' };
type UiNode = InvestigationNode & { logOutput?: string };

function formatDuration(value?: number): string { return value === undefined ? '—' : `${value.toFixed(2)} ms`; }
function localTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}
function toLogRecord(log: DebugLogInfo): LogRecord {
  const entryPoint = log.operation || 'Salesforce transaction';
  const status: LogRecord['status'] = (log.status ?? '').toLowerCase() === 'success' ? 'Success' : 'Error';
  const node: InvestigationNode = { id: `tx-${log.id}`, kind: 'transaction', label: entryPoint, subtitle: log.userName ? `User · ${log.userName}` : 'Salesforce transaction', timestamp: localTime(log.startTime), durationMs: log.durationMs, status: status === 'Success' ? 'ok' : 'error', variables: [], children: [] };
  return { id: log.id, timestamp: node.timestamp, entryPoint, operation: log.operation ?? '—', durationMs: log.durationMs ?? 0, sizeKb: log.logLength ? Math.round(log.logLength / 1024) : 0, user: log.userName ?? log.userId ?? '—', status, summary: log.userName ? `${entryPoint} · ${log.userName}` : entryPoint, nodes: [node] };
}
function dtoToNode(node: InvestigationNodeDto): UiNode { return { ...node, children: node.children.map(dtoToNode) }; }
function containsQuery(log: LogRecord, query: string): InvestigationNode[] {
  if (!query.trim()) return [];
  const needle = query.trim().toLowerCase();
  const matches = flattenNodes(log.nodes).filter((node) => [node.label, node.subtitle, node.variables.map((variable) => `${variable.name} ${variable.value}`).join(' ')].some((value) => value?.toLowerCase().includes(needle)));
  return matches.length ? matches : ([log.entryPoint, log.operation, log.user, log.summary].some((value) => value?.toLowerCase().includes(needle)) && log.nodes.length ? [log.nodes[0]] : []);
}

function visibleVariables(rootNodes: InvestigationNode[], selectedId: string): VariableValue[] {
  const path: InvestigationNode[] = [];
  const findPath = (nodes: InvestigationNode[]): boolean => {
    for (const node of nodes) {
      path.push(node);
      if (node.id === selectedId || findPath(node.children)) return true;
      path.pop();
    }
    return false;
  };
  findPath(rootNodes);

  const merged = new Map<string, VariableValue>();
  for (const node of path) {
    for (const variable of node.variables) merged.set(variable.name, variable);
  }
  return [...merged.values()];
}

function App() {
  const [query, setQuery] = useState('');
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [liveLogs, setLiveLogs] = useState<LogRecord[] | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [activeLogId, setActiveLogId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [showSystem, setShowSystem] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('traceforge-theme') === 'light' ? 'light' : 'dark');
  const [inspectorHeight, setInspectorHeight] = useState(280);
  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [traceMessage, setTraceMessage] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [rawLogOpen, setRawLogOpen] = useState(false);
  const [rawLog, setRawLog] = useState('');
  const [rawLoading, setRawLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('traceforge-theme', theme); }, [theme]);
  useEffect(() => { const stored = Number(localStorage.getItem('traceforge-inspector-height')); if (Number.isFinite(stored) && stored >= 180 && stored <= 620) setInspectorHeight(stored); }, []);

  useEffect(() => {
    let cancelled = false;
    traceforgeApi.listOrgs()
      .then((items) => {
        if (cancelled) return;
        setOrgs(items);
        const storedAlias = localStorage.getItem('traceforge-org') ?? '';
        const defaultOrg = items.find((org) => org.isDefaultUsername);
        const storedOrg = items.find((org) => org.alias === storedAlias);
        const chosen = defaultOrg?.alias ?? storedOrg?.alias ?? '';
        setSelectedOrg(chosen);
        if (chosen) localStorage.setItem('traceforge-org', chosen);
      })
      .catch((error) => { if (!cancelled) setConnectionError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (!cancelled) setOrgsLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const loadInvestigation = async (logId: string): Promise<void> => {
    if (!selectedOrg || !liveMode) return;
    setAnalysisLoading(true);
    try {
      const result = await traceforgeApi.investigateLog(selectedOrg, logId);
      setLiveLogs((current) => current?.map((log) => log.id === logId ? { ...log, nodes: result.nodes.map(dtoToNode) } : log) ?? current);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
    } finally { setAnalysisLoading(false); }
  };

  useEffect(() => {
    if (!orgsLoaded || !selectedOrg) return;
    let cancelled = false;
    localStorage.setItem('traceforge-org', selectedOrg);
    setDataLoading(true); setConnectionError(''); setLiveLogs(null); setLiveMode(false); setSelectedLogIds([]); setActiveLogId(''); setSelectedNodeId('');
    traceforgeApi.listLogs(selectedOrg)
      .then((records) => {
        if (cancelled) return;
        const mapped = records.map(toLogRecord);
        setLiveLogs(mapped); setLiveMode(true); setSelectedLogIds(mapped.slice(0, 4).map((log) => log.id));
        const first = mapped[0]; setActiveLogId(first?.id ?? ''); setSelectedNodeId(first?.nodes[0]?.id ?? '');
      })
      .catch((error) => { if (!cancelled) { setLiveMode(false); setConnectionError(error instanceof Error ? error.message : String(error)); } })
      .finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [orgsLoaded, selectedOrg]);

  const displayLogs = liveLogs ?? [];
  const activeLog = displayLogs.find((log) => log.id === activeLogId);
  const selectedLogs = displayLogs.filter((log) => selectedLogIds.includes(log.id));
  const matches = useMemo(() => selectedLogs.flatMap((log) => containsQuery(log, query).map((node) => ({ log, node }))), [selectedLogs, query]);
  const selectedNode = useMemo(() => activeLog ? flattenNodes(activeLog.nodes).find((node) => node.id === selectedNodeId) ?? activeLog.nodes[0] : undefined, [activeLog, selectedNodeId]);
  const inspectorVariables = useMemo(() => selectedNode ? visibleVariables(activeLog?.nodes ?? [], selectedNode.id) : [], [activeLog, selectedNode]);

  const selectOrg = (value: string) => { setSelectedOrg(value); if (value) localStorage.setItem('traceforge-org', value); };
  const selectLog = (id: string) => { setActiveLogId(id); const first = displayLogs.find((log) => log.id === id)?.nodes[0]; setSelectedNodeId(first?.id ?? ''); if (liveMode) void loadInvestigation(id); };
  const toggleLog = (id: string) => setSelectedLogIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const refresh = () => {
    if (!selectedOrg) return;
    setDataLoading(true);
    traceforgeApi.listLogs(selectedOrg).then((records) => setLiveLogs(records.map(toLogRecord))).catch((error) => setConnectionError(error instanceof Error ? error.message : String(error))).finally(() => setDataLoading(false));
  };
  const collapseAll = () => { const next: Record<string, boolean> = {}; if (activeLog) flattenNodes(activeLog.nodes).forEach((node) => { if (node.children.length) next[node.id] = true; }); setCollapsed(next); };
  const expandAll = () => setCollapsed({});
  const toggleNode = (id: string) => setCollapsed((current) => ({ ...current, [id]: !current[id] }));
  const raw = async () => { if (!activeLog || !selectedOrg) return; setRawLogOpen(true); setRawLoading(true); try { setRawLog((await traceforgeApi.fetchLog(selectedOrg, activeLog.id)).content); } catch (error) { setRawLog(error instanceof Error ? error.message : String(error)); } finally { setRawLoading(false); } };
  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault(); const startY = event.clientY; const startHeight = inspectorHeight;
    const move = (moveEvent: PointerEvent) => { const value = Math.max(180, Math.min(620, startHeight + startY - moveEvent.clientY)); setInspectorHeight(value); localStorage.setItem('traceforge-inspector-height', String(value)); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none'; addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true });
  };
  const detail = (selectedNode as UiNode | undefined)?.logOutput ?? selectedNode?.subtitle ?? '';
  const onTraceCreated = (result: TraceFlagResult) => setTraceMessage(`Trace flag active until ${result.expirationDate ? new Date(result.expirationDate).toLocaleTimeString() : 'expiration'}.`);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">T</div><div><div className="brand-name">TraceForge</div><div className="brand-subtitle">Salesforce transaction investigation</div></div></div>
        <div className="context-pills">
          <label className="org-picker"><span>Org</span><select value={selectedOrg} onChange={(event) => selectOrg(event.target.value)} disabled={!orgs.length}>
            {!orgs.length && <option value="">{orgsLoaded ? 'No connected org' : 'Loading orgs…'}</option>}
            {orgs.map((org) => <option key={`${org.alias}-${org.username}`} value={org.alias}>{org.alias}{org.isDefaultUsername ? ' (default)' : ''}</option>)}
          </select></label>
          <span className={`mode-pill ${liveMode ? 'live' : 'demo'}`}>{liveMode ? 'Live org' : 'No org selected'}</span>
          <span className="status-dot"><span />{dataLoading ? 'Loading' : !orgsLoaded ? 'Connecting' : selectedOrg ? 'Ready' : 'Select org'}</span>
          <button className="theme-btn" type="button" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ Light' : '☾ Dark'}</button>
        </div>
      </header>

      <main className="workspace">
        {!selectedOrg ? (
          <section className="panel org-empty-state"><div className="empty-state"><h2>{orgsLoaded ? 'Select a Salesforce org' : 'Loading connected Salesforce orgs…'}</h2><p>{orgsLoaded ? (orgs.length ? 'Choose an org from the selector above to load its debug logs.' : 'No authenticated Salesforce orgs were found in the local Salesforce CLI.') : 'TraceForge will load debug logs after the connected orgs are resolved.'}</p></div></section>
        ) : (
          <>
            <section className="toolbar"><div className="search-wrap"><span className="search-icon">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search class, method, variable, ID, exception..." /><span className="shortcut">⌘ K</span></div><div className="toolbar-actions"><label className="toggle"><input type="checkbox" checked={showSystem} onChange={(event) => setShowSystem(event.target.checked)} /><span /> Show system calls</label><button className="ghost-btn" type="button" onClick={() => setTraceModalOpen(true)}>Trace flag</button><button className="primary-btn" type="button" onClick={refresh} disabled={dataLoading}>{dataLoading ? 'Refreshing…' : 'Refresh logs'}</button></div></section>
            {traceMessage && <div className="trace-toast">{traceMessage}</div>}{connectionError && <div className="connection-banner">{connectionError}</div>}
            <div className="content-grid" style={{ '--inspector-height': `${inspectorHeight}px` } as CSSProperties}>
              <aside className="logs-panel panel"><div className="panel-header"><div><div className="panel-title">Logs</div><div className="panel-meta">{displayLogs.length} transactions</div></div></div><div className="selection-bar"><span>{selectedLogIds.length} selected</span><button type="button" onClick={() => setSelectedLogIds(displayLogs.map((log) => log.id))}>Select all</button></div><div className="log-list">{displayLogs.map((log) => <button key={log.id} className={`log-card ${log.id === activeLogId ? 'active' : ''}`} onClick={() => selectLog(log.id)}><span className="check-wrap" onClick={(event) => { event.stopPropagation(); toggleLog(log.id); }}><span className={`fake-check ${selectedLogIds.includes(log.id) ? 'checked' : ''}`}>{selectedLogIds.includes(log.id) ? '✓' : ''}</span></span><span className="log-main"><span className="log-time">{log.timestamp}</span><span className="log-entry">{log.entryPoint}</span><span className="log-summary">{log.summary}</span><span className="log-tags"><span className={`result ${log.status.toLowerCase()}`}>{log.status}</span><span>{formatDuration(log.durationMs)}</span><span>{log.sizeKb} KB</span></span></span></button>)}</div></aside>
              <section className="results-panel panel"><div className="panel-header"><div><div className="panel-title">Search results</div><div className="panel-meta">{matches.length} matches across {selectedLogs.length} selected logs</div></div><span className="match-chip">{query || 'Search'}</span></div><div className="results-list">{matches.length === 0 ? <div className="empty-state">{query ? 'No matching instances in the selected logs.' : 'Enter a search term to search the selected logs.'}</div> : matches.map(({ log, node }) => <button key={`${log.id}-${node.id}`} className={`match-row ${log.id === activeLogId && node.id === selectedNodeId ? 'selected' : ''}`} onClick={() => { selectLog(log.id); setSelectedNodeId(node.id); }}><span className={`node-icon ${node.kind}`}>{nodeIcon[node.kind]}</span><span className="match-main"><span className="match-name">{node.label}</span><span className="match-context">{log.timestamp} · {log.entryPoint}{node.line ? ` · line ${node.line}` : ''}</span></span><span className="match-duration">{formatDuration(node.durationMs)}</span></button>)}</div></section>
              <section className="tree-panel panel"><div className="panel-header tree-header"><div><div className="panel-title">Transaction</div><div className="panel-meta">{activeLog ? `${activeLog.timestamp} · ${activeLog.operation} · ${activeLog.id}` : 'No log selected'}</div></div><div className="tree-actions"><button className="ghost-btn small" type="button" onClick={collapseAll} disabled={!activeLog}>Collapse</button><button className="ghost-btn small" type="button" onClick={expandAll} disabled={!activeLog}>Expand</button><button className="ghost-btn small" type="button" onClick={() => void raw()} disabled={!activeLog}>Raw log</button></div></div><div className="tree-scroll">{activeLog?.nodes.map((node) => <TreeNode key={node.id} node={node} selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} depth={0} collapsed={collapsed} onToggle={toggleNode} showSystem={showSystem} />)}</div></section>
              <div className="inspector-resizer" role="separator" aria-orientation="horizontal" aria-label="Resize inspector" onPointerDown={resize}><span /></div>
              <section className="inspector-panel panel"><div className="panel-header inspector-header"><div className="inspector-header-main"><span className={`node-icon ${selectedNode?.kind ?? 'transaction'}`}>{selectedNode ? nodeIcon[selectedNode.kind] : '—'}</span><div><div className="panel-title">{selectedNode?.label ?? 'Inspector'}</div><div className="inspector-meta-line">{selectedNode ? `Selected node · ${selectedNode.kind}` : 'Select a transaction node'}</div></div></div><div className="inspector-header-facts">{selectedNode && <><span>Time <strong>{selectedNode.timestamp}</strong></span><span>Duration <strong>{formatDuration(selectedNode.durationMs)}</strong></span><span>Source line <strong>{selectedNode.line ?? '—'}</strong></span><span>Log <strong>{activeLog?.id ?? '—'}</strong></span></>}</div>{selectedNode?.status === 'error' && <span className="error-badge">Error</span>}</div>{selectedNode && <div className="inspector-content"><div className="inspector-section"><div className="section-heading">Variables & values <span className="section-count">{inspectorVariables.length}</span></div><div className="variable-table">{inspectorVariables.length === 0 ? <div className="muted-text">No visible variables captured for this scope.</div> : inspectorVariables.map((variable) => <div className="variable-row" key={`${variable.name}-${variable.type}`}><span className="variable-name">{variable.name}</span><span className="variable-type">{variable.type}</span><code>{variable.value}</code></div>)}</div></div><div className="inspector-section log-output-section"><div className="section-heading">Log output</div><pre className="log-output">{analysisLoading ? 'Loading investigation…' : detail}</pre></div></div>}</section>
            </div>
          </>
        )}
      </main>

      <TraceFlagModal org={selectedOrg} open={traceModalOpen} onClose={() => setTraceModalOpen(false)} onCreated={onTraceCreated} />
      {rawLogOpen && <div className="raw-log-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRawLogOpen(false); }}><section className="raw-log-modal"><div className="panel-header"><div><div className="panel-title">Raw log</div><div className="panel-meta">{activeLog?.id}</div></div><button className="icon-btn" type="button" onClick={() => setRawLogOpen(false)}>×</button></div><pre className="raw-log-content">{rawLoading ? 'Loading…' : rawLog}</pre></section></div>}
    </div>
  );
}

function TreeNode({ node, selectedNodeId, onSelect, depth, collapsed, onToggle, showSystem }: { node: InvestigationNode; selectedNodeId: string; onSelect: (id: string) => void; depth: number; collapsed: Record<string, boolean>; onToggle: (id: string) => void; showSystem: boolean }) {
  const isCollapsed = collapsed[node.id];
  const children = showSystem ? node.children : node.children.filter((child) => child.kind !== 'method' || !child.label.startsWith('System.'));
  return <div className="tree-node-wrap"><div className={`tree-node ${selectedNodeId === node.id ? 'selected' : ''} ${node.status === 'error' ? 'error' : ''}`} style={{ paddingLeft: `${10 + depth * 20}px` }} onClick={() => onSelect(node.id)}><span className={`chevron ${children.length ? '' : 'empty'}`} onClick={(event) => { event.stopPropagation(); if (children.length) onToggle(node.id); }}>{children.length ? (isCollapsed ? '▸' : '▾') : '·'}</span><span className={`node-icon ${node.kind}`}>{nodeIcon[node.kind]}</span><span className="tree-label"><span>{node.label}</span><small>{node.subtitle}</small></span>{node.line && <span className="tree-line">L{node.line}</span>}<span className="tree-time">{formatDuration(node.durationMs)}</span></div>{!isCollapsed && children.map((child) => <TreeNode key={child.id} node={child} selectedNodeId={selectedNodeId} onSelect={onSelect} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} showSystem={showSystem} />)}</div>;
}

export default App;
