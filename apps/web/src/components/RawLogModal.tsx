import { useEffect, useRef } from 'react';

interface RawLogModalProps {
  logId?: string;
  loading: boolean;
  content: string;
  onClose: () => void;
}

/**
 * Displays the complete raw Salesforce transaction log in a native modal dialog.
 * Uses the modern HTML <dialog> element for top-layer placement and platform-native dismiss.
 */
export function RawLogModal({
  logId,
  loading,
  content,
  onClose,
}: RawLogModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      dialog.showModal();
    }

    const handleClose = () => {
      onClose();
    };

    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="native-modal"
      aria-labelledby="raw-log-title"
      closedby="any"
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
    >
      <section className="raw-log-modal">
        <div className="panel-header">
          <div>
            <div id="raw-log-title" className="panel-title">Raw log</div>
            <div className="panel-meta">{logId}</div>
          </div>

          <button
            className="icon-btn"
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close raw log"
          >
            ×
          </button>
        </div>

        <pre className="raw-log-content">
          {loading ? 'Loading…' : content}
        </pre>
      </section>
    </dialog>
  );
}

