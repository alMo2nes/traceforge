interface RawLogModalProps {
  logId?: string;
  loading: boolean;
  content: string;
  onClose: () => void;
}

export function RawLogModal({ logId, loading, content, onClose }: RawLogModalProps) {
  return (
    <div className="raw-log-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="raw-log-modal">
        <div className="panel-header">
          <div><div className="panel-title">Raw log</div><div className="panel-meta">{logId}</div></div>
          <button className="icon-btn" type="button" onClick={onClose}>×</button>
        </div>
        <pre className="raw-log-content">{loading ? 'Loading…' : content}</pre>
      </section>
    </div>
  );
}
