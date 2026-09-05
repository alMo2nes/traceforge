import type { InvestigationNode, VariableValue, LogRecord } from '../data';

const nodeIcon: Record<InvestigationNode['kind'], string> = { transaction: 'TX', 'code-unit': 'CU', method: 'fn', soql: 'DB', dml: 'DML', flow: 'FLW', exception: '!' };

interface InspectorPanelProps {
  selectedNode?: InvestigationNode & { logOutput?: string };
  activeLog?: LogRecord;
  variables: VariableValue[];
  analysisLoading: boolean;
  detail: string;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
}

function formatDuration(value?: number): string { return value === undefined ? '—' : `${value.toFixed(2)} ms`; }

export function InspectorPanel({ selectedNode, activeLog, variables, analysisLoading, detail, onResizeStart }: InspectorPanelProps) {
  return (
    <>
      <div className="inspector-resizer" role="separator" aria-orientation="horizontal" aria-label="Resize inspector" onPointerDown={onResizeStart}><span /></div>
      <section className="inspector-panel panel">
        <div className="panel-header inspector-header">
          <div className="inspector-header-main"><span className={`node-icon ${selectedNode?.kind ?? 'transaction'}`}>{selectedNode ? nodeIcon[selectedNode.kind] : '—'}</span><div><div className="panel-title">{selectedNode?.label ?? 'Inspector'}</div><div className="inspector-meta-line">{selectedNode ? `Selected node · ${selectedNode.kind}` : 'Select a transaction node'}</div></div></div>
          <div className="inspector-header-facts">{selectedNode && <><span>Time <strong>{selectedNode.timestamp}</strong></span><span>Duration <strong>{formatDuration(selectedNode.durationMs)}</strong></span><span>Source line <strong>{selectedNode.line ?? '—'}</strong></span><span>Log <strong>{activeLog?.id ?? '—'}</strong></span></>}</div>
          {selectedNode?.status === 'error' && <span className="error-badge">Error</span>}
        </div>
        {selectedNode && <div className="inspector-content">
          <div className="inspector-section">
            <div className="section-heading">Variables & values <span className="section-count">{variables.length}</span></div>
            <div className="variable-table">{variables.length === 0 ? <div className="muted-text">No visible variables captured for this scope.</div> : variables.map((variable) => <div className="variable-row" key={`${variable.name}-${variable.type}`}><span className="variable-name">{variable.name}</span><span className="variable-type">{variable.type}</span><code>{variable.value}</code></div>)}</div>
          </div>
          <div className="inspector-section log-output-section"><div className="section-heading">Log output</div><pre className="log-output">{analysisLoading ? 'Loading investigation…' : detail}</pre></div>
        </div>}
      </section>
    </>
  );
}
