import type { OrgInfo } from '../api';

interface TopBarProps {
  orgs: OrgInfo[];
  selectedOrg: string;
  onOrgChange: (value: string) => void;
  orgsLoaded: boolean;
  liveMode: boolean;
  dataLoading: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function TopBar({ orgs, selectedOrg, onOrgChange, orgsLoaded, liveMode, dataLoading, theme, onToggleTheme }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">T</div>
        <div>
          <div className="brand-name">TraceForge</div>
          <div className="brand-subtitle">Salesforce transaction investigation</div>
        </div>
      </div>
      <div className="context-pills">
        <label className="org-picker">
          <span>Org</span>
          <select value={selectedOrg} onChange={(event) => onOrgChange(event.target.value)} disabled={!orgs.length}>
            {!orgs.length && <option value="">{orgsLoaded ? 'No connected org' : 'Loading orgs…'}</option>}
            {orgs.map((org) => <option key={`${org.alias}-${org.username}`} value={org.alias}>{org.alias}{org.isDefaultUsername ? ' (default)' : ''}</option>)}
          </select>
        </label>
        <span className={`mode-pill ${liveMode ? 'live' : 'demo'}`}>{liveMode ? 'Live org' : 'No org selected'}</span>
        <span className="status-dot"><span />{dataLoading ? 'Loading' : !orgsLoaded ? 'Connecting' : selectedOrg ? 'Ready' : 'Select org'}</span>
        <button className="theme-btn" type="button" onClick={onToggleTheme}>{theme === 'dark' ? '☀ Light' : '☾ Dark'}</button>
      </div>
    </header>
  );
}
