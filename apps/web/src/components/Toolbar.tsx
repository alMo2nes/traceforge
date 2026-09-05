interface ToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  showSystem: boolean;
  onShowSystemChange: (value: boolean) => void;
  onTraceFlag: () => void;
  onRefresh: () => void;
  dataLoading: boolean;
}

/**
 * Controls search, system-call visibility, trace-flag creation, and log refresh.
 */
export function Toolbar({
  query,
  onQueryChange,
  showSystem,
  onShowSystemChange,
  onTraceFlag,
  onRefresh,
  dataLoading,
}: ToolbarProps) {
  return (
    <section className="toolbar">
      <div className="search-wrap">
        <span className="search-icon">⌕</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search class, method, variable, ID, exception..."
        />
        <span className="shortcut">⌘ K</span>
      </div>

      <div className="toolbar-actions">
        <label className="toggle">
          <input
            type="checkbox"
            checked={showSystem}
            onChange={(event) => onShowSystemChange(event.target.checked)}
          />
          <span /> Show system calls
        </label>

        <button className="ghost-btn" type="button" onClick={onTraceFlag}>
          Trace flag
        </button>

        <button
          className="primary-btn"
          type="button"
          onClick={onRefresh}
          disabled={dataLoading}
        >
          {dataLoading ? 'Refreshing…' : 'Refresh logs'}
        </button>
      </div>
    </section>
  );
}
