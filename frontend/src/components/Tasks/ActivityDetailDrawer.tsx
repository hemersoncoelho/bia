import React, { useState, useEffect } from 'react';
import {
  X, Copy, Check, ExternalLink, MessageSquare, Calendar, User,
  Bot, AlertTriangle, Sparkles, Clock, Flag, CheckCircle2,
  Pencil,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Task, TaskStatus, TaskPriority, TaskSourceType } from '../../types';

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Aberta', in_progress: 'Em andamento', done: 'Concluída', cancelled: 'Cancelada',
};
const STATUS_BADGE: Record<TaskStatus, string> = {
  open: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  in_progress: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  done: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  cancelled: 'text-stone-500 bg-stone-500/10 border-stone-500/20',
};
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente',
};
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: 'text-sky-400', normal: 'text-stone-400', high: 'text-amber-400', urgent: 'text-red-400',
};
const SOURCE_LABELS: Record<TaskSourceType, string> = {
  manual: 'Manual',
  ai: 'IA',
  followup_trigger: 'Follow-up',
  cadence: 'Cadência',
  appointment: 'Agenda',
  inbox: 'Inbox',
  system: 'Sistema',
};
const SOURCE_BADGE: Record<TaskSourceType, string> = {
  manual: 'text-stone-400 bg-stone-400/10 border-stone-500/20',
  ai: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30',
  followup_trigger: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
  cadence: 'text-violet-300 bg-violet-500/15 border-violet-500/30',
  appointment: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  inbox: 'text-blue-300 bg-blue-500/15 border-blue-500/30',
  system: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
};
const ALL_STATUSES: TaskStatus[] = ['open', 'in_progress', 'done', 'cancelled'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function normalizePriority(v: unknown): TaskPriority {
  const valid: TaskPriority[] = ['low','normal','high','urgent'];
  return (typeof v === 'string' && (valid as string[]).includes(v)) ? (v as TaskPriority) : 'normal';
}
function normalizeSource(v: unknown): TaskSourceType {
  const valid: TaskSourceType[] = ['manual','ai','followup_trigger','cadence','appointment','inbox','system'];
  return (typeof v === 'string' && (valid as string[]).includes(v)) ? (v as TaskSourceType) : 'manual';
}
function getSource(task: Task): TaskSourceType {
  if (task.source_type === 'followup_trigger') return 'followup_trigger';
  if (isRecord(task.metadata) && task.metadata.source === 'expired_followup_trigger') return 'followup_trigger';
  return normalizeSource(task.source_type);
}
function metadataText(metadata: unknown, key: string): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value : null;
}
function confidencePercent(c?: number): number | null {
  if (c === undefined || c === null || Number.isNaN(c)) return null;
  return Math.round(c <= 1 ? c * 100 : c);
}
function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function toDateTimeLocal(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

interface Props {
  task: Task | null;
  onClose: () => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onOpenConversation: (id: string) => void;
  onUpdate?: (id: string, changes: Partial<Task>) => Promise<void>;
}

export const ActivityDetailDrawer: React.FC<Props> = ({ task, onClose, onStatusChange, onOpenConversation, onUpdate }) => {
  const [copied, setCopied] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDueAt, setEditDueAt] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('normal');

  useEffect(() => {
    if (!task) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [task, onClose]);

  useEffect(() => {
    setCopied(false);
    setEditMode(false);
    setEditTitle(task?.title ?? '');
    setEditDesc(task?.description ?? '');
    setEditDueAt(toDateTimeLocal(task?.due_at));
    setEditPriority(normalizePriority(task?.priority));
  }, [task]);

  const handleCopy = async () => {
    if (!task?.recommended_message) return;
    try {
      await navigator.clipboard.writeText(task.recommended_message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* noop */ }
  };

  const handleCancelEdit = () => {
    setEditTitle(task?.title ?? '');
    setEditDesc(task?.description ?? '');
    setEditDueAt(toDateTimeLocal(task?.due_at));
    setEditPriority(normalizePriority(task?.priority));
    setEditMode(false);
  };

  const handleSaveEdit = async () => {
    if (!task || !onUpdate) return;
    const changes: Partial<Task> = {
      title: editTitle.trim() || task.title,
      description: editDesc.trim(),
      priority: editPriority,
    };
    if (editDueAt) changes.due_at = new Date(editDueAt).toISOString();
    await onUpdate(task.id, changes);
    setEditMode(false);
  };

  const priority = normalizePriority(task?.priority);
  const confidence = confidencePercent(task?.ai_confidence);
  const needsReview = confidence !== null && confidence < 65;
  const sourceType = task ? getSource(task) : 'manual';
  const detectedEvent = metadataText(task?.metadata, 'detected_event');

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300',
          task ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detalhe da atividade"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] w-full flex-col rounded-t-2xl border-t border-border bg-surface shadow-2xl',
          'sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:max-w-lg sm:rounded-none sm:border-l sm:border-t-0',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          task ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full sm:translate-y-0',
        )}
      >
        {!task ? null : (
          <>
            {/* AI gradient accent */}
            {task.ai_generated && (
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent" />
            )}

            {/* Header */}
            <div className="shrink-0 border-b border-border px-5 py-4">
              <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-500">
                  Detalhe da atividade
                </p>
                {editMode ? (
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full rounded-md border border-border bg-background/70 px-2.5 py-1.5 text-base font-semibold leading-snug text-primary outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  />
                ) : (
                  <h2 className="text-base font-semibold leading-snug text-primary">{task.title}</h2>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {onUpdate && (
                  <>
                    <button
                      type="button"
                      onClick={editMode ? handleSaveEdit : () => setEditMode(true)}
                      className="rounded-md p-1.5 text-stone-400 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      aria-label={editMode ? 'Salvar edição' : 'Editar tarefa'}
                    >
                      {editMode ? <Check size={18} /> : <Pencil size={17} />}
                    </button>
                    {editMode && (
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="rounded-md p-1.5 text-stone-500 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        aria-label="Cancelar edição"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md p-1.5 text-stone-400 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label="Fechar detalhes"
                >
                  <X size={18} />
                </button>
              </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className={cn(
                  'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  STATUS_BADGE[task.status],
                )}>
                  {STATUS_LABELS[task.status]}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  SOURCE_BADGE[sourceType],
                )}>
                  {task.ai_generated ? <Bot size={10} /> : <Sparkles size={10} />}
                  {SOURCE_LABELS[sourceType]}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  PRIORITY_COLOR[priority],
                )}>
                  <Flag size={10} />
                  {PRIORITY_LABELS[priority]}
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] font-medium text-stone-500">
                  <Calendar size={10} />
                  {formatDateTime(task.due_at)}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-5 space-y-6">

              {/* ── Dados principais ── */}
              <section>
                <SectionLabel>Dados principais</SectionLabel>
                <div className="space-y-3">

                  {/* Status switcher */}
                  <Row label="Status">
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_STATUSES.map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onStatusChange(task.id, s)}
                          className={cn(
                            'rounded border px-2.5 py-1 text-xs font-medium transition-all',
                            task.status === s
                              ? STATUS_BADGE[s] + ' ring-1 ring-inset ring-current/30'
                              : 'border-border text-text-muted hover:border-primary/25 hover:text-primary',
                          )}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </Row>

                  <Row label="Prioridade">
                    {editMode ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(['low', 'normal', 'high', 'urgent'] as TaskPriority[]).map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setEditPriority(p)}
                            className={cn(
                              'rounded border px-2.5 py-1 text-xs font-medium transition-all',
                              editPriority === p
                                ? 'border-primary/40 bg-primary/10 text-primary ring-1 ring-inset ring-primary/20'
                                : 'border-border text-text-muted hover:border-primary/25 hover:text-primary',
                            )}
                          >
                            {PRIORITY_LABELS[p]}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className={cn('flex items-center gap-1.5 text-sm font-medium', PRIORITY_COLOR[priority])}>
                        <Flag size={12} />{PRIORITY_LABELS[priority]}
                      </span>
                    )}
                  </Row>

                  <Row label="Origem">
                    <span className={cn('inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium', SOURCE_BADGE[sourceType])}>
                      {SOURCE_LABELS[sourceType]}
                    </span>
                  </Row>

                  <Row label="Prazo">
                    {editMode ? (
                      <input
                        type="datetime-local"
                        value={editDueAt}
                        onChange={e => setEditDueAt(e.target.value)}
                        className="w-full rounded-md border border-border bg-background/70 px-2.5 py-1.5 text-sm text-primary outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                      />
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-primary">
                        <Calendar size={13} />{formatDateTime(task.due_at)}
                      </span>
                    )}
                  </Row>

                  <Row label="Contato">
                    <span className="flex items-center gap-1.5 text-sm text-primary">
                      <User size={13} />{task.contact_name || 'Contato sem nome'}
                    </span>
                  </Row>

                  {task.assigned_to_name && (
                    <Row label="Responsável">
                      <span className="text-sm text-primary">{task.assigned_to_name}</span>
                    </Row>
                  )}

                  {(task.description || editMode) && (
                    <Row label="Descrição">
                      {editMode ? (
                        <textarea
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          rows={4}
                          className="w-full resize-none rounded-md border border-border bg-background/70 px-2.5 py-2 text-sm leading-relaxed text-primary outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                        />
                      ) : (
                        <p className="text-sm leading-relaxed text-text-muted">{task.description}</p>
                      )}
                    </Row>
                  )}

                  {task.conversation_id && (
                    <Row label="Conversa">
                      <button
                        type="button"
                        onClick={() => onOpenConversation(task.conversation_id!)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 transition-colors hover:text-blue-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
                      >
                        <MessageSquare size={13} />Abrir no Inbox<ExternalLink size={11} />
                      </button>
                    </Row>
                  )}
                </div>
              </section>

              {/* ── Inteligência da IA ── */}
              {(task.ai_generated || task.ai_reason || confidence !== null) && (
                <section>
                  <SectionLabel>Inteligência da IA</SectionLabel>
                  <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Bot size={14} className="shrink-0 text-indigo-400" />
                      <span className="text-xs font-semibold text-indigo-300">
                        {needsReview ? 'Gerada pela IA — requer revisão' : 'Gerada pela IA'}
                      </span>
                    </div>

                    {confidence !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-stone-400">Confiança da IA</span>
                        <span className={cn('flex items-center gap-1.5 text-sm font-semibold', needsReview ? 'text-amber-300' : 'text-emerald-400')}>
                          {confidence}%
                          {needsReview && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-300">
                              <AlertTriangle size={9} />Revisar
                            </span>
                          )}
                        </span>
                      </div>
                    )}

                    {task.ai_reason && (
                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Motivo</p>
                        <p className="text-xs leading-relaxed text-text-muted">{task.ai_reason}</p>
                      </div>
                    )}

                    {detectedEvent && (
                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Evento detectado</p>
                        <p className="text-xs leading-relaxed text-text-muted">{detectedEvent}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── Mensagem sugerida ── */}
              {task.recommended_message && (
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <SectionLabel noMargin>Mensagem sugerida</SectionLabel>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-primary/25 hover:text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                    >
                      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      {copied ? 'Copiada!' : 'Copiar'}
                    </button>
                  </div>
                  <div className="rounded-md border border-border bg-background/60 px-3 py-3 text-sm leading-relaxed text-primary">
                    {task.recommended_message}
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] text-stone-500">
                    <Sparkles size={10} />Copiar não envia automaticamente pelo WhatsApp.
                  </p>
                </section>
              )}

              {/* ── Informações ── */}
              <section className="border-t border-border pt-4">
                <SectionLabel>Informações</SectionLabel>
                <div className="space-y-1.5 text-xs text-stone-500">
                  <div className="flex items-center gap-1.5">
                    <Clock size={11} />Criada em {formatDateTime(task.created_at)}
                  </div>
                  {task.updated_at && (
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} />Atualizada em {formatDateTime(task.updated_at)}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Footer actions */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-background/50 px-5 py-3">
              {task.status !== 'done' && (
                <button
                  type="button"
                  onClick={() => onStatusChange(task.id, 'done')}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-background transition-all hover:-translate-y-0.5 hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]"
                >
                  <CheckCircle2 size={14} />
                  Concluir
                </button>
              )}
              {task.conversation_id && (
                <button
                  type="button"
                  onClick={() => onOpenConversation(task.conversation_id!)}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:border-primary/25 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <MessageSquare size={14} />
                  Abrir conversa
                </button>
              )}
              {task.recommended_message && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:border-primary/25 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copied ? 'Copiada' : 'Copiar mensagem'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

// ── Sub-components ───────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode; noMargin?: boolean }> = ({ children, noMargin }) => (
  <p className={cn(
    'text-[10px] font-semibold uppercase tracking-widest text-stone-500',
    !noMargin && 'mb-3',
  )}>
    {children}
  </p>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[96px_1fr] gap-2 items-start">
    <span className="pt-0.5 text-xs text-stone-500">{label}</span>
    <div>{children}</div>
  </div>
);
