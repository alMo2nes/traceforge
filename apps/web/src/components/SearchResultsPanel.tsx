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

export interface SearchMatch {
  log: LogRecord;
  node: InvestigationNode;
}

interface SearchResultsPanelProps {
  matches: SearchMatch[];
  query: string;
  selectedLogCount: number;
  activeLogId: string;
  selectedNodeId: string;
  loading: boolean;
  onSelectMatch: (logId: string, nodeId: string) => void;
}

function formatDuration(value?: number): string {
  return value === undefined ? '—' : `${value.toFixed(2)} ms`;
}

/**
 * Displays every matching investigation node across the currently selected logs.
 * A match is kept associated with its source log so navigation can activate both.
 */
export function SearchResultsPanel({
  matches,
  query,
  selectedLogCount,
  activeLogId,
  selectedNodeId,
  loading,
  onSelectMatch,
}: SearchResultsPanelProps) {
  return (
    <section className="results-panel panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Search results</div>
          <div className="panel-meta">
            {matches.length} matches across {selectedLogCount} selected logs
          </div>
        </div>
        <span className="match-chip">{query || 'Search'}</span>
      </div>

      <div className="results-list">
        {matches.length === 0 ? (
          <div className="empty-state">
            {query
              ? 'No matching instances in the selected logs.'
              : 'Enter a search term to search the selected logs.'}
          </div>
        ) : (
          matches.map(({ log, node }) => {
            const selected = log.id === activeLogId && node.id === selectedNodeId;

            return (
              <button
                key={`${log.id}-${node.id}`}
                className={`match-row ${selected ? 'selected' : ''}`}
                onClick={() => onSelectMatch(log.id, node.id)}
              >
                <span className={`node-icon ${node.kind}`}>
                  {nodeIcon[node.kind]}
                </span>
                <span className="match-main">
                  <span className="match-name">{node.label}</span>
                  <span className="match-context">
                    {log.timestamp} · {log.entryPoint}
                    {node.line ? ` · line ${node.line}` : ''}
                  </span>
                </span>
                <span className="match-duration">
                  {formatDuration(node.durationMs)}
                </span>
              </button>
            );
          })
        )}
      </div>

      {loading && <LoadingSpinner label="Loading results…" />}
    </section>
  );
}
