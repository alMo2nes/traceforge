import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  flattenNodes,
  type InvestigationNode,
  type LogRecord,
  type VariableValue,
} from './data';
import {
  traceforgeApi,
  type DebugLogInfo,
  type GovernorLimitUsageDto,
  type InvestigationNodeDto,
  type OrgInfo,
  type TraceFlagResult,
} from './api';
import { TraceFlagModal } from './TraceFlagModal';
import { TopBar } from './components/TopBar';
import { Toolbar } from './components/Toolbar';
import { LogsPanel } from './components/LogsPanel';
import {
  SearchResultsPanel,
  type SearchMatch,
} from './components/SearchResultsPanel';
import { TransactionPanel } from './components/TransactionPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { RawLogModal } from './components/RawLogModal';
import { OrgEmptyState } from './components/OrgEmptyState';
import './styles.css';
import './layout.css';
import './integration.css';

type UiNode = InvestigationNode & { logOutput?: string };

/** Format the Salesforce ISO timestamp for compact display in the log list. */
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

/** Convert the lightweight log-list DTO into the UI transaction model. */
function toLogRecord(log: DebugLogInfo): LogRecord {
  const entryPoint = log.operation || 'Salesforce transaction';
  const status: LogRecord['status'] =
    (log.status ?? '').toLowerCase() === 'success' ? 'Success' : 'Error';

  const node: InvestigationNode = {
    id: `tx-${log.id}`,
    kind: 'transaction',
    label: entryPoint,
    subtitle: log.userName
      ? `User · ${log.userName}`
      : 'Salesforce transaction',
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

/** Convert the API investigation model into the web application's node model recursively. */
function dtoToNode(node: InvestigationNodeDto): UiNode {
  return {
    ...node,
    children: node.children.map(dtoToNode),
  };
}

/**
 * Search a transaction tree for a query. The fallback checks transaction metadata
 * so a search can still identify a log before it has been fully investigated.
 */
function containsQuery(log: LogRecord, query: string): InvestigationNode[] {
  if (!query.trim()) return [];

  const needle = query.trim().toLowerCase();
  const matches = flattenNodes(log.nodes).filter((node) =>
    [
      node.label,
      node.subtitle,
      node.variables
        .map((variable) => `${variable.name} ${variable.value}`)
        .join(' '),
    ].some((value) => value?.toLowerCase().includes(needle)),
  );

  if (matches.length) return matches;

  const metadataMatches = [
    log.entryPoint,
    log.operation,
    log.user,
    log.summary,
  ].some((value) => value?.toLowerCase().includes(needle));

  return metadataMatches && log.nodes[0] ? [log.nodes[0]] : [];
}

/**
 * Build the selected node's ancestry path and merge variables from each scope.
 * This lets a method inspect variables declared by its surrounding code unit.
 */
function visibleVariables(
  rootNodes: InvestigationNode[],
  selectedId: string,
): VariableValue[] {
  const path: InvestigationNode[] = [];

  const findPath = (nodes: InvestigationNode[]): boolean => {
    for (const node of nodes) {
      path.push(node);

      if (node.id === selectedId || findPath(node.children)) {
        return true;
      }

      path.pop();
    }

    return false;
  };

  findPath(rootNodes);

  // Child scopes overwrite a parent value with the same variable name.
  const merged = new Map<string, VariableValue>();
  for (const node of path) {
    for (const variable of node.variables) {
      merged.set(variable.name, variable);
    }
  }

  return [...merged.values()];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  // Application state is kept here; visual rendering is delegated to the frame components.
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
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    localStorage.getItem('traceforge-theme') === 'light' ? 'light' : 'dark',
  );
  const [inspectorHeight, setInspectorHeight] = useState(280);
  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [traceMessage, setTraceMessage] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [rawLogOpen, setRawLogOpen] = useState(false);
  const [rawLog, setRawLog] = useState('');
  const [rawLoading, setRawLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [logTruncated, setLogTruncated] = useState<Record<string, boolean>>({});
  const [logSummaries, setLogSummaries] = useState<Record<string, GovernorLimitUsageDto[]>>({});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('traceforge-theme', theme);
  }, [theme]);

  useEffect(() => {
    const stored = Number(localStorage.getItem('traceforge-inspector-height'));

    if (Number.isFinite(stored) && stored >= 180 && stored <= 620) {
      setInspectorHeight(stored);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    traceforgeApi
      .listOrgs()
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
      .catch((error) => {
        if (!cancelled) {
          setConnectionError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setOrgsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!orgsLoaded || !selectedOrg) return;

    let cancelled = false;

    localStorage.setItem('traceforge-org', selectedOrg);
    setDataLoading(true);
    setConnectionError('');
    setLiveLogs(null);
    setLiveMode(false);
    setSelectedLogIds([]);
    setActiveLogId('');
    setSelectedNodeId('');
    setCollapsed({});

    traceforgeApi
      .listLogs(selectedOrg)
      .then((records) => {
        if (cancelled) return;

        const mapped = records.map(toLogRecord);
        setLiveLogs(mapped);
        setLiveMode(true);
        setSelectedLogIds(mapped.slice(0, 4).map((log) => log.id));

        const first = mapped[0];
        setActiveLogId(first?.id ?? '');
        setSelectedNodeId(first?.nodes[0]?.id ?? '');
      })
      .catch((error) => {
        if (!cancelled) {
          setLiveMode(false);
          setConnectionError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgsLoaded, selectedOrg]);

  const displayLogs = liveLogs ?? [];
  const activeLog = displayLogs.find((log) => log.id === activeLogId);
  const selectedLogs = displayLogs.filter((log) =>
    selectedLogIds.includes(log.id),
  );

  const matches = useMemo<SearchMatch[]>(
    () =>
      selectedLogs.flatMap((log) =>
        containsQuery(log, query).map((node) => ({ log, node })),
      ),
    [selectedLogs, query],
  );

  const selectedNode = useMemo(
    () =>
      activeLog
        ? flattenNodes(activeLog.nodes).find(
            (node) => node.id === selectedNodeId,
          ) ?? activeLog.nodes[0]
        : undefined,
    [activeLog, selectedNodeId],
  );

  const inspectorVariables = useMemo(
    () =>
      selectedNode
        ? visibleVariables(activeLog?.nodes ?? [], selectedNode.id)
        : [],
    [activeLog, selectedNode],
  );

  const detail = (selectedNode as UiNode | undefined)?.logOutput ?? '';

  const selectOrg = (value: string) => {
    setSelectedOrg(value);

    if (value) {
      localStorage.setItem('traceforge-org', value);
    }
  };

  /** Load and correlate one transaction into the hierarchical investigation tree. */
  const loadInvestigation = async (logId: string): Promise<void> => {
    if (!selectedOrg || !liveMode) return;

    setAnalysisLoading(true);

    try {
      const result = await traceforgeApi.investigateLog(selectedOrg, logId);

      if (result.isTruncated !== undefined) {
        setLogTruncated((prev) => ({ ...prev, [logId]: result.isTruncated ?? false }));
      }
      if (result.summaries?.governorLimits) {
        setLogSummaries((prev) => ({ ...prev, [logId]: result.summaries!.governorLimits }));
      }

      setLiveLogs((current) =>
        current?.map((log) =>
          log.id === logId
            ? { ...log, nodes: result.nodes.map(dtoToNode) }
            : log,
        ) ?? current,
      );
    } catch (error) {
      setConnectionError(errorMessage(error));
    } finally {
      setAnalysisLoading(false);
    }
  };

  const selectLog = (id: string) => {
    setActiveLogId(id);

    const first = displayLogs.find((log) => log.id === id)?.nodes[0];
    setSelectedNodeId(first?.id ?? '');

    if (liveMode) {
      void loadInvestigation(id);
    }
  };

  const toggleLog = (id: string) => {
    setSelectedLogIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const refresh = () => {
    if (!selectedOrg) return;

    setDataLoading(true);

    traceforgeApi
      .listLogs(selectedOrg)
      .then((records) => setLiveLogs(records.map(toLogRecord)))
      .catch((error) => setConnectionError(errorMessage(error)))
      .finally(() => setDataLoading(false));
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};

    if (activeLog) {
      flattenNodes(activeLog.nodes).forEach((node) => {
        if (node.children.length) {
          next[node.id] = true;
        }
      });
    }

    setCollapsed(next);
  };

  const expandAll = () => setCollapsed({});

  const toggleNode = (id: string) => {
    setCollapsed((current) => ({
      ...current,
      [id]: !current[id],
    }));
  };

  /** Open the complete raw transaction log in the dedicated modal. */
  const openRawLog = async () => {
    if (!activeLog || !selectedOrg) return;

    setRawLogOpen(true);
    setRawLoading(true);

    try {
      const result = await traceforgeApi.fetchLog(selectedOrg, activeLog.id);
      setRawLog(result.content);
    } catch (error) {
      setRawLog(errorMessage(error));
    } finally {
      setRawLoading(false);
    }
  };

  /** Resize the bottom inspector while keeping the pointer interaction independent of React rendering. */
  const resizeInspector = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = inspectorHeight;

    const move = (moveEvent: PointerEvent) => {
      const value = Math.max(
        180,
        Math.min(620, startHeight + startY - moveEvent.clientY),
      );

      setInspectorHeight(value);
      localStorage.setItem('traceforge-inspector-height', String(value));
    };

    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    addEventListener('pointermove', move);
    addEventListener('pointerup', up, { once: true });
  };

  const onTraceCreated = (result: TraceFlagResult) => {
    setTraceMessage(
      `Trace flag active until ${
        result.expirationDate
          ? new Date(result.expirationDate).toLocaleTimeString()
          : 'expiration'
      }.`,
    );
  };

  const handleSearchMatch = (logId: string, nodeId: string) => {
    selectLog(logId);
    setSelectedNodeId(nodeId);
  };

  return (
    <div className="app-shell">
      <TopBar
        orgs={orgs}
        selectedOrg={selectedOrg}
        onOrgChange={selectOrg}
        orgsLoaded={orgsLoaded}
        liveMode={liveMode}
        dataLoading={dataLoading}
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
        }
      />

      <main className="workspace">
        {!selectedOrg ? (
          <OrgEmptyState
            orgsLoaded={orgsLoaded}
            orgCount={orgs.length}
          />
        ) : (
          <>
            <Toolbar
              query={query}
              onQueryChange={setQuery}
              showSystem={showSystem}
              onShowSystemChange={setShowSystem}
              onTraceFlag={() => setTraceModalOpen(true)}
              onRefresh={refresh}
              dataLoading={dataLoading}
            />

            {traceMessage && (
              <div className="trace-toast" role="status" aria-live="polite">
                {traceMessage}
              </div>
            )}

            {connectionError && (
              <div className="connection-banner" role="alert" aria-live="assertive">
                {connectionError}
              </div>
            )}

            <div
              className="content-grid"
              style={
                {
                  '--inspector-height': `${inspectorHeight}px`,
                } as CSSProperties
              }
            >
              <LogsPanel
                logs={displayLogs}
                selectedLogIds={selectedLogIds}
                activeLogId={activeLogId}
                loading={dataLoading}
                onSelectLog={selectLog}
                onToggleLog={toggleLog}
              />

              <SearchResultsPanel
                matches={matches}
                query={query}
                selectedLogCount={selectedLogs.length}
                activeLogId={activeLogId}
                selectedNodeId={selectedNodeId}
                loading={dataLoading || analysisLoading}
                onSelectMatch={handleSearchMatch}
              />

              <TransactionPanel
                activeLog={activeLog}
                selectedNodeId={selectedNodeId}
                collapsed={collapsed}
                showSystem={showSystem}
                loading={dataLoading || analysisLoading}
                isTruncated={activeLog ? logTruncated[activeLog.id] : false}
                onSelectNode={setSelectedNodeId}
                onToggleNode={toggleNode}
                onCollapseAll={collapseAll}
                onExpandAll={expandAll}
                onRawLog={() => void openRawLog()}
              />

              <InspectorPanel
                selectedNode={selectedNode}
                activeLog={activeLog}
                variables={inspectorVariables}
                governorLimits={activeLog ? logSummaries[activeLog.id] : undefined}
                loading={analysisLoading}
                detail={detail}
                onResizeStart={resizeInspector}
              />
            </div>
          </>
        )}
      </main>

      <TraceFlagModal
        org={selectedOrg}
        open={traceModalOpen}
        onClose={() => setTraceModalOpen(false)}
        onCreated={onTraceCreated}
      />

      {rawLogOpen && (
        <RawLogModal
          logId={activeLog?.id}
          loading={rawLoading}
          content={rawLog}
          onClose={() => setRawLogOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
