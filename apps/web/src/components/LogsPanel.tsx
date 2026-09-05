import type { LogRecord } from '../data';
import { LoadingSpinner } from './LoadingSpinner';

interface LogsPanelProps {
  logs: LogRecord[];
  selectedLogIds: string[];
  activeLogId: string;
  loading: boolean;
  onSelectLog: (id: string) => void;
  onToggleLog: (id: string) => void;
}

function formatDuration(value?: number): string { return value === undefined ? '—' : `${value.toFixed(2)} ms`; }

export function LogsPanel({ logs, selectedLogIds, activeLogId, loading, onSelectLog, onToggleLog }: LogsPanelProps) {
  return (
    <aside className="logs-panel panel">
      <div className="panel-header">
        <div><div className="panel-title">Logs</div><div className="panel-meta">{logs.length} transactions</div></div>
      </div>
      <div className="selection-bar">
        <span>{selectedLogIds.length} selected</span>
        <button type="button" onClick={() => logs.length && logs.forEach((log) => !selectedLogIds.includes(log.id) && onToggleLog(log.id))}>Select all</button>
      </div>
      <div className="log-list">
        {logs.map((log) => (
          <button key={log.id} className={`log-card ${log.id === activeLogId ? 'active' : ''}`} onClick={() => onSelectLog(log.id)}>
            <span className="check-wrap" onClick={(event) => { event.stopPropagation(); onToggleLog(log.id); }}>
              <span className={`fake-check ${selectedLogIds.includes(log.id) ? 'checked' : ''}`}>{selectedLogIds.includes(log.id) ? '✓' : ''}</span>
            </span>
            <span className="log-main">
              <span className="log-time">{log.timestamp}</span>
              <span className="log-entry">{log.entryPoint}</span>
              <span className="log-summary">{log.summary}</span>
              <span className="log-tags"><span className={`result ${log.status.toLowerCase()}`}>{log.status}</span><span>{formatDuration(log.durationMs)}</span><span>{log.sizeKb} KB</span></span>
            </span>
          </button>
        ))}
      </div>
      {loading && <LoadingSpinner label="Loading logs…" />}
    </aside>
  );
}
