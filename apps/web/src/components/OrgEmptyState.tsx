interface OrgEmptyStateProps {
  orgsLoaded: boolean;
  orgCount: number;
}

export function OrgEmptyState({ orgsLoaded, orgCount }: OrgEmptyStateProps) {
  return (
    <section className="panel org-empty-state">
      <div className="empty-state">
        <h2>{orgsLoaded ? 'Select a Salesforce org' : 'Loading connected Salesforce orgs…'}</h2>
        <p>{orgsLoaded
          ? (orgCount ? 'Choose an org from the selector above to load its debug logs.' : 'No authenticated Salesforce orgs were found in the local Salesforce CLI.')
          : 'TraceForge will load debug logs after the connected orgs are resolved.'}</p>
      </div>
    </section>
  );
}
