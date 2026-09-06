import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  flattenNodes,
  type InvestigationNode,
  type LogRecord,
  type VariableValue,
} from './data';
import {
  traceforgeApi,
  type DebugLogInfo,
  type InvestigationNodeDto,
  type OrgInfo,
} from './api';
import { LogsPanel } from './components/LogsPanel';
import { SearchResultsPanel, type SearchMatch } from './components/SearchResultsPanel';
import { TransactionPanel } from './components/TransactionPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { Toolbar } from './components/Toolbar';
import { RawLogModal } from './components/RawLogModal';
import './styles.css';
import './layout.css';
import './integration.css';

function localTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

function toLogRecord(log: DebugLogInfo): LogRecord {
  const entryPoint = log.operation || 'Salesforce transaction';
  const status: LogRecord['status'] =
    (log.status ?? '').toLowerCase() === 'success' ? 'Success' : 'Error';
  const node: InvestigationNode = {
    id: `tx-${log.id}`,
    kind: 'transaction',
    label: entryPoint,
    subtitle: log.userName ? `User · ${log.userName}` : 'Salesforce transaction',
    timestamp: localTime(log.startTime),
    durationMs: log.durationMs,
    status: status === 'Success' ? 'ok' : 'error',
    variables: [],
    children: [],
  };
  return {
    id: log.id,
    timestamp: node.timestamp,
    entryPoint,
    operation: log.operation ?? '—',
    durationMs: log.durationMs ?? 0,
    sizeKb: log.logLength ? Math.round(log.logLength / 1024) : 0,
    user: log.userName ?? log.userId ?? '—',
    status,
    summary: log.userName ? `${entryPoint} · ${log.userName}` : entryPoint,
    nodes: [node],
  };
}

function dtoToNode(node: InvestigationNodeDto): InvestigationNode & { logOutput?: string } {
  return { ...node, children: node.children.map(dtoToNode) };
}

function containsQuery(log: LogRecord, query: string): InvestigationNode[] {
  if (!query.trim()) return [];
  const needle = query.trim().toLowerCase();
  const matches = flattenNodes(log.nodes).filter((node) =>
    [
      node.label,
      node.subtitle,
      node.variables.map((variable) => `${variable.name} ${variable.value}`).join(' '),
    ].some((value) => value?.toLowerCase().includes(needle)),
  );
  if (matches.length) return matches;
  return [log.entryPoint, log.operation, log.user, log.summary].some((value) =>
    value?.toLowerCase().includes(needle),
  )
    ? [log.nodes[0]]
    : [];
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

function post(message: unknown): void {
  window.acquireVsCodeApi?.().postMessage(message);
}

export function VscodeSidebarSurface(): ReactElement {
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [activeLogId, setActiveLogId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    post({ type: 'ready', surface: 'sidebar' });
    let cancelled = false;
    traceforgeApi.listOrgs().then((items) => {
      if (cancelled) return;
      setOrgs(items);
      const stored = localStorage.getItem('traceforge-org');
      const selected = items.find((item) => item.alias === stored)?.alias
        ?? items.find((item) => item.isDefaultUsername)?.alias
        ?? items[0]?.alias
        ?? '';
      setSelectedOrg(selected);
      if (selected) localStorage.setItem('traceforge-org', selected);
    }).catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : String(reason)));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedOrg) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    traceforgeApi.listLogs(selectedOrg).then((items) => {
      if (cancelled) return;
      const mapped = items.map(toLogRecord);
      setLogs(mapped);
      setSelectedLogIds(mapped.slice(0, 4).map((item) => item.id));
      setActiveLogId(mapped[0]?.id ?? '');
    }).catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [selectedOrg]);

  const matches = useMemo<SearchMatch[]>(
    () => logs
      .filter((log) => selectedLogIds.includes(log.id))
      .flatMap((log) => containsQuery(log, query).map((node) => ({ log, node }))),
    [logs, selectedLogIds, query],
  );

  const openLog = (id: string) => {
    setActiveLogId(id);
    post({ type: 'open-log', org: selectedOrg, logId: id });
  };

  return (
    <div className="vscode-surface sidebar-surface">
      <div className="vscode-surface-header">
        <strong>TraceForge</strong>
        <select value={selectedOrg} onChange={(event) => { setSelectedOrg(event.target.value); localStorage.setItem('traceforge-org', event.target.value); }} aria-label="Salesforce org">
          {!orgs.length && <option value="">Loading orgs…</option>}
          {orgs.map((org) => <option key={org.alias} value={org.alias}>{org.alias}</option>)}
        </select>
      </div>
      <div className="vscode-search">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search logs…" aria-label="Search logs" />
      </div>
      {error && <div className="connection-banner">{error}</div>}
      <LogsPanel
        logs={logs}
        selectedLogIds={selectedLogIds}
        activeLogId={activeLogId}
        loading={loading}
        onSelectLog={openLog}
        onToggleLog={(id) => setSelectedLogIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
      />
      {query && (
        <SearchResultsPanel
          matches={matches}
          query={query}
          selectedLogCount={selectedLogIds.length}
          activeLogId={activeLogId}
          selectedNodeId=""
          loading={loading}
          onSelectMatch={(logId) => openLog(logId)}
        />
      )}
    </div>
  );
}

export function VscodeTransactionSurface(): ReactElement {
  const vscode = window.acquireVsCodeApi?.();
  const [org, setOrg] = useState('');
  const [logId, setLogId] = useState('');
  const [log, setLog] = useState<LogRecord>();
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showSystem, setShowSystem] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawLog, setRawLog] = useState('');

  useEffect(() => {
    post({ type: 'ready', surface: 'transaction' });
    const handler = (event: MessageEvent) => {
      const message = event.data as { type?: string; org?: string; logId?: string; nodeId?: string };
      if (message?.type === 'open-log' && message.org && message.logId) {
        setOrg(message.org);
        setLogId(message.logId);
      }
      if (message?.type === 'open-node' && message.logId === logId && message.nodeId) {
        setSelectedNodeId(message.nodeId);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [logId]);

  useEffect(() => {
    if (!org || !logId) return;
    let cancelled = false;
    setLoading(true);
    traceforgeApi.listLogs(org).then((items) => {
      const selected = items.find((item) => item.id === logId);
      if (!cancelled && selected) setLog(toLogRecord(selected));
    }).catch(() => undefined).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [org, logId]);

  useEffect(() => {
    if (!org || !logId) return;
    let cancelled = false;
    setLoading(true);
    traceforgeApi.investigateLog(org, logId).then((result) => {
      if (cancelled) return;
      setLog((current) => current ? { ...current, nodes: result.nodes.map(dtoToNode) } : current);
      setTruncated(result.isTruncated ?? false);
      const first = result.nodes[0];
      setSelectedNodeId(first?.id ?? '');
      setCollapsed({});
    }).catch(() => undefined).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [org, logId]);

  const selectNode = (id: string) => {
    setSelectedNodeId(id);
    const selected = log && flattenNodes(log.nodes).find((node) => node.id === id);
    if (selected) {
      vscode?.postMessage({ type: 'node-selected', logId, nodeId: id, node: selected, activeLog: log });
    }
  };

  const openRawLog = async () => {
    if (!org || !logId) return;
    setRawOpen(true);
    try { setRawLog((await traceforgeApi.fetchLog(org, logId)).content); } catch (reason) { setRawLog(reason instanceof Error ? reason.message : String(reason)); }
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    log && flattenNodes(log.nodes).forEach((node) => { if (node.children.length) next[node.id] = true; });
    setCollapsed(next);
  };

  return (
    <div className="vscode-surface transaction-surface">
      <Toolbar query={query} onQueryChange={setQuery} showSystem={showSystem} onShowSystemChange={setShowSystem} onTraceFlag={() => undefined} onRefresh={() => undefined} dataLoading={loading} />
      <TransactionPanel activeLog={log} selectedNodeId={selectedNodeId} collapsed={collapsed} showSystem={showSystem} loading={loading} isTruncated={truncated} onSelectNode={selectNode} onToggleNode={(id) => setCollapsed((current) => ({ ...current, [id]: !current[id] }))} onCollapseAll={collapseAll} onExpandAll={() => setCollapsed({})} onRawLog={() => void openRawLog()} />
      {rawOpen && <RawLogModal logId={logId} loading={!rawLog} content={rawLog} onClose={() => setRawOpen(false)} />}
    </div>
  );
}

export function VscodeInspectorSurface(): ReactElement {
  const [node, setNode] = useState<InvestigationNode>();
  const [activeLog, setActiveLog] = useState<LogRecord>();

  useEffect(() => {
    post({ type: 'ready', surface: 'inspector' });
    const handler = (event: MessageEvent) => {
      const message = event.data as { type?: string; node?: InvestigationNode; activeLog?: LogRecord };
      if (message?.type === 'node-selected') {
        setNode(message.node);
        setActiveLog(message.activeLog);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const variables = useMemo(() => node && activeLog ? visibleVariables(activeLog.nodes, node.id) : [], [node, activeLog]);
  const detail = (node as (InvestigationNode & { logOutput?: string }) | undefined)?.logOutput ?? '';

  return (
    <div className="vscode-surface inspector-surface">
      <InspectorPanel selectedNode={node} activeLog={activeLog} variables={variables} loading={false} detail={detail} governorLimits={undefined} />
    </div>
  );
}
