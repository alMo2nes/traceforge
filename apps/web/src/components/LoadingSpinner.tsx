interface LoadingSpinnerProps {
  label?: string;
}

/**
 * Shared loading indicator used by panels while asynchronous data is being fetched.
 * Keeping this in one component makes loading states visually consistent across the UI.
 */
export function LoadingSpinner({ label = 'Loading…' }: LoadingSpinnerProps) {
  return (
    <div className="panel-loading" aria-live="polite" aria-busy="true">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
