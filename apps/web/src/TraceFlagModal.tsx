import { useEffect, useRef, useState } from 'react';
import { traceforgeApi, type DebugLevelInfo, type SalesforceUserInfo, type TraceFlagResult } from './api';

interface TraceFlagModalProps {
  org: string;
  open: boolean;
  onClose: () => void;
  onCreated: (result: TraceFlagResult) => void;
}

export function TraceFlagModal({ org, open, onClose, onCreated }: TraceFlagModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [users, setUsers] = useState<SalesforceUserInfo[]>([]);
  const [levels, setLevels] = useState<DebugLevelInfo[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [duration, setDuration] = useState(30);
  const [finestAvailable, setFinestAvailable] = useState(false);
  const [finestAutoCreate, setFinestAutoCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }

    const handleClose = () => {
      onClose();
    };

    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !org) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([traceforgeApi.listUsers(org), traceforgeApi.listDebugLevels(org)])
      .then(([nextUsers, debugLevels]) => {
        if (cancelled) return;
        setUsers(nextUsers);
        setLevels(debugLevels.levels);
        setFinestAvailable(debugLevels.finestAvailable);
        setFinestAutoCreate(debugLevels.finestAutoCreate);
        setSelectedUser((current) => current || nextUsers[0]?.id || '');
        const finest = debugLevels.levels.find((level) =>
          level.developerName.toUpperCase() === 'FINEST' || level.masterLabel.toUpperCase() === 'FINEST',
        );
        setSelectedLevel((current) => current || finest?.id || '');
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, org]);

  if (!open) return null;

  const save = async () => {
    if (!selectedUser) return;
    setSaving(true);
    setError('');
    try {
      const result = await traceforgeApi.createTraceFlag(org, {
        userId: selectedUser,
        debugLevelId: selectedLevel || undefined,
        durationMinutes: duration,
      });
      onCreated(result);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="native-modal"
      aria-labelledby="trace-modal-title"
      closedby="any"
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
    >
      <section className="trace-modal">
        <div className="modal-header">
          <div>
            <div className="modal-kicker">{org}</div>
            <h2 id="trace-modal-title">Create trace flag</h2>
            <p>Capture a new transaction for a Salesforce user.</p>
          </div>
          <button className="icon-btn" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close">×</button>
        </div>

        {loading ? <div className="modal-loading">Loading users and debug levels…</div> : <div className="modal-body">
          <label className="form-field">
            <span>User</span>
            <select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}>
              <option value="">Select a user</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.username}</option>)}
            </select>
          </label>

          <label className="form-field">
            <span>Debug level</span>
            <select value={selectedLevel} onChange={(event) => setSelectedLevel(event.target.value)}>
              <option value="">FINEST — create automatically</option>
              {levels.map((level) => <option key={level.id} value={level.id}>{level.masterLabel}</option>)}
            </select>
          </label>

          <div className={`finest-note ${finestAvailable ? 'available' : ''}`}>
            {finestAvailable
              ? 'FINEST exists in this org and is selected by default.'
              : finestAutoCreate
                ? 'FINEST does not exist. TraceForge will create a FINEST DebugLevel automatically.'
                : 'The selected DebugLevel will be used.'}
          </div>

          <label className="form-field">
            <span>Trace duration</span>
            <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
              {[15, 30, 60, 120, 240].map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes === 60 ? '' : 's'}`}</option>)}
            </select>
          </label>
        </div>}

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-footer">
          <button className="ghost-btn" type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button className="primary-btn" type="button" disabled={loading || saving || !selectedUser} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Start tracing'}
          </button>
        </div>
      </section>
    </dialog>
  );
}
