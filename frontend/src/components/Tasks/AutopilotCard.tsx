import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AgentOperation } from '../../types';
import { AgentOperationCard } from './AgentOperationCard';

// ── AutopilotToggle ───────────────────────────────────────────────────────────
interface ToggleProps {
  enabled: boolean;
  onToggle: () => void;
  loading?: boolean;
}

const AutopilotToggle: React.FC<ToggleProps> = ({ enabled, onToggle, loading }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    aria-label={enabled ? 'Autopilot ativo. Clique para pausar.' : 'Autopilot pausado. Clique para ativar.'}
    onClick={onToggle}
    disabled={loading}
    className={cn(
      'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
      'transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40',
      enabled
        ? 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/15'
        : 'border-stone-500/25 bg-stone-500/10 text-stone-400 hover:bg-stone-500/15',
      loading && 'cursor-not-allowed opacity-60',
    )}
  >
    {/* Dot de status */}
    <span
      className={cn(
        'h-1.5 w-1.5 rounded-full transition-colors',
        enabled ? 'bg-violet-400 motion-safe:animate-pulse' : 'bg-stone-500',
      )}
      aria-hidden="true"
    />
    {enabled ? 'AUTO-PILOTO' : 'PAUSADO'}
  </button>
);

// ── RescheduleModal (inline) ──────────────────────────────────────────────────
interface RescheduleModalProps {
  operationId: string;
  currentSendAt: string;
  onConfirm: (id: string, sendAt: string) => void;
  onClose: () => void;
}

const RescheduleModal: React.FC<RescheduleModalProps> = ({
  operationId, currentSendAt, onConfirm, onClose,
}) => {
  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [value, setValue] = useState(toLocalInput(currentSendAt));

  const handleConfirm = () => {
    const iso = new Date(value).toISOString();
    onConfirm(operationId, iso);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-40 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <h3 className="mb-3 text-sm font-semibold text-primary">Reagendar operação</h3>
        <input
          type="datetime-local"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none">
            Cancelar
          </button>
          <button type="button" onClick={handleConfirm}
            className="rounded border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-sm font-semibold text-violet-300 transition-colors hover:bg-violet-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40">
            Confirmar
          </button>
        </div>
      </div>
    </>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────
export interface AutopilotCardProps {
  operations: AgentOperation[];
  autopilotEnabled: boolean;
  onToggleAutopilot: () => void;
  onUpdateMessage: (id: string, message: string) => Promise<{ success: boolean; error?: string }>;
  onReschedule: (id: string, sendAt: string) => Promise<{ success: boolean; error?: string }>;
  onSnooze: (id: string) => Promise<{ success: boolean; error?: string }>;
  onCancel: (id: string) => void;
  delay?: number;
}

// ── Card principal ────────────────────────────────────────────────────────────
export const AutopilotCard: React.FC<AutopilotCardProps> = ({
  operations,
  autopilotEnabled,
  onToggleAutopilot,
  onUpdateMessage,
  onReschedule,
  onSnooze,
  onCancel,
  delay = 60,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<string | null>(null);

  const visible = expanded ? operations : operations.slice(0, 2);
  const hidden = operations.length - 2;

  const handleToggle = async () => {
    setToggleLoading(true);
    onToggleAutopilot();
    setToggleLoading(false);
  };

  const handleRescheduleConfirm = async (id: string, sendAt: string) => {
    await onReschedule(id, sendAt);
    setRescheduleTarget(null);
  };

  const rescheduleOp = rescheduleTarget
    ? operations.find(o => o.id === rescheduleTarget)
    : null;

  return (
    <>
      <div
        className="bento-card-animate relative flex flex-col gap-2 overflow-hidden rounded-xl border border-violet-500/20 bg-surface px-3 py-3"
        style={{
          animationDelay: `${delay}ms`,
          background: 'radial-gradient(ellipse at top right, rgba(167,139,250,0.04), transparent 55%)',
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-violet-500/10">
            <Sparkles size={12} className="text-violet-400" />
          </span>
          <span className="text-xs font-semibold text-primary">Autopilot · operações em curso</span>

          {/* Dot de atividade quando autopilot ativo */}
          {autopilotEnabled && operations.length > 0 && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-violet-400 motion-safe:animate-pulse"
              aria-hidden="true"
            />
          )}

          {operations.length > 0 && (
            <span className="ml-0.5 font-mono text-[10px] tabular-nums text-stone-500">
              {operations.length} {operations.length === 1 ? 'operação' : 'operações'}
            </span>
          )}

          <div className="ml-auto">
            <AutopilotToggle
              enabled={autopilotEnabled}
              onToggle={() => void handleToggle()}
              loading={toggleLoading}
            />
          </div>
        </div>

        {/* ── Banner quando pausado ── */}
        {!autopilotEnabled && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
            <p className="text-[11px] text-amber-300">
              Autopilot pausado. Nenhuma operação será executada até você reativar.
            </p>
          </div>
        )}

        {/* ── Lista de operações ── */}
        {operations.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-3 text-center">
            <p className="text-[11px] text-stone-500">Nenhuma operação em fila.</p>
            <p className="text-[10px] text-stone-600">O agente criará operações conforme as conversas evoluem.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map(op => (
              <div key={op.id} className="task-card-animate">
                <AgentOperationCard
                  operation={op}
                  autopilotEnabled={autopilotEnabled}
                  onUpdateMessage={onUpdateMessage}
                  onReschedule={(id) => setRescheduleTarget(id)}
                  onSnooze={onSnooze}
                  onCancel={onCancel}
                />
              </div>
            ))}

            {/* Ver mais / menos */}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className="flex items-center justify-center gap-1 rounded-md border border-dashed border-violet-500/20 py-1.5 text-[11px] font-medium text-stone-500 transition-all hover:border-solid hover:border-violet-500/30 hover:text-violet-300 focus:outline-none"
              >
                {expanded
                  ? <><ChevronUp size={11} />Mostrar menos</>
                  : <><ChevronDown size={11} />Ver mais
                    <span className="rounded px-1 font-mono text-[10px] font-semibold bg-violet-500/10 text-violet-400">
                      +{hidden}
                    </span>
                  </>
                }
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Reagendar modal ── */}
      {rescheduleOp && (
        <RescheduleModal
          operationId={rescheduleOp.id}
          currentSendAt={rescheduleOp.send_at}
          onConfirm={handleRescheduleConfirm}
          onClose={() => setRescheduleTarget(null)}
        />
      )}
    </>
  );
};
