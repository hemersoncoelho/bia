import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Zap, Clock, ListChecks, MoreHorizontal, Archive,
  Pause, Play, Pencil, Layers, Copy, Sparkles, MessageSquare, CheckCircle2,
  Send, AlertCircle, Loader2, Ban, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import type { CadenceTemplate, CadenceStatus, CadenceTriggerType, CadenceEvent, CadenceEventStatus } from '../../types';

const STATUS_LABELS: Record<CadenceStatus, string> = {
  draft: 'Rascunho', active: 'Ativa', paused: 'Pausada', archived: 'Arquivada',
};
const STATUS_BADGE: Record<CadenceStatus, string> = {
  draft: 'text-stone-400 bg-stone-400/10 border-stone-500/25',
  active: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/25',
  paused: 'text-amber-400 bg-amber-400/10 border-amber-500/25',
  archived: 'text-stone-600 bg-stone-600/10 border-stone-600/25',
};
const TRIGGER_LABELS: Record<CadenceTriggerType, string> = {
  appointment_scheduled: 'Consulta agendada',
  appointment_rescheduled: 'Consulta remarcada',
  appointment_cancelled: 'Consulta cancelada',
  no_response: 'Lead sem resposta',
  quote_sent: 'Orçamento enviado',
  manual: 'Manual',
};

// ── Timeline step ─────────────────────────────────────────────────────────────
const TimelinePoint: React.FC<{ label: string; accent?: boolean; last?: boolean }> = ({ label, accent, last }) => (
  <div className="flex items-center gap-1.5">
    <span className={cn(
      'h-2.5 w-2.5 rounded-full border transition-colors',
      accent ? 'border-primary bg-primary' : 'border-stone-500 bg-surface',
    )} />
    <span className={cn('text-[10px] font-medium', accent ? 'text-primary' : 'text-stone-500')}>
      {label}
    </span>
    {!last && <span className="h-px w-5 bg-border" />}
  </div>
);

// ── Timeline preview builder ──────────────────────────────────────────────────
function TimelinePreview({ triggerType, stepCount }: { triggerType: CadenceTriggerType; stepCount: number }) {
  if (stepCount === 0) return null;

  const isAppointment = ['appointment_scheduled', 'appointment_rescheduled', 'appointment_cancelled'].includes(triggerType);
  if (!isAppointment && stepCount === 0) return null;

  if (isAppointment) {
    const visibleSteps = [
      { label: '1d antes' },
      { label: 'No dia', accent: true },
      ...(stepCount > 2 ? [{ label: '2h antes' }] : []),
    ];

    return (
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {visibleSteps.map((item, index) => (
          <TimelinePoint
            key={item.label}
            label={item.label}
            accent={item.accent}
            last={index === visibleSteps.length - 1 && stepCount <= 3}
          />
        ))}
        {stepCount > 3 && (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-stone-500">+{stepCount - 3}</span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-1.5">
      <TimelinePoint label={`${stepCount} ${stepCount === 1 ? 'passo' : 'passos'}`} accent last />
    </div>
  );
}

// ── Event status config ───────────────────────────────────────────────────────
const EVENT_STATUS_CONFIG: Record<CadenceEventStatus, { label: string; badge: string; icon: React.ReactNode }> = {
  pending:    { label: 'Aguardando', badge: 'text-amber-400 bg-amber-400/10 border-amber-500/25', icon: <Clock size={11} className="text-amber-400" /> },
  processing: { label: 'Processando', badge: 'text-blue-400 bg-blue-400/10 border-blue-500/25', icon: <Loader2 size={11} className="text-blue-400 animate-spin" /> },
  sent:       { label: 'Enviado', badge: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/25', icon: <Send size={11} className="text-emerald-400" /> },
  failed:     { label: 'Falhou', badge: 'text-red-400 bg-red-400/10 border-red-500/25', icon: <AlertCircle size={11} className="text-red-400" /> },
  canceled:   { label: 'Cancelado', badge: 'text-stone-500 bg-stone-500/10 border-stone-600/25', icon: <Ban size={11} className="text-stone-500" /> },
  skipped:    { label: 'Ignorado', badge: 'text-stone-500 bg-stone-500/10 border-stone-600/25', icon: <Ban size={11} className="text-stone-500" /> },
};

type EventsFilter = 'upcoming' | 'sent' | 'failed';
const EVENTS_FILTER_LABELS: Record<EventsFilter, string> = {
  upcoming: 'Próximos',
  sent:     'Enviados',
  failed:   'Com falha',
};
const EVENTS_FILTER_STATUSES: Record<EventsFilter, CadenceEventStatus[]> = {
  upcoming: ['pending', 'processing'],
  sent:     ['sent'],
  failed:   ['failed'],
};

// ── CadenceEventsPanel ────────────────────────────────────────────────────────
const CadenceEventsPanel: React.FC<{ companyId: string }> = ({ companyId }) => {
  const [filter, setFilter] = useState<EventsFilter>('upcoming');
  const [events, setEvents] = useState<CadenceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    const statuses = EVENTS_FILTER_STATUSES[filter];
    const { data, error: rpcErr } = await supabase.rpc('rpc_get_cadence_events_for_company', {
      p_company_id: companyId,
      p_status:     statuses,
      p_limit:      30,
      p_offset:     0,
    });

    if (rpcErr) {
      setError('Erro ao carregar eventos. Verifique as permissões.');
      setEvents([]);
    } else {
      const result = data as { success: boolean; events: CadenceEvent[] } | null;
      setEvents(result?.events ?? []);
    }
    setLoading(false);
  }, [companyId, filter]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary">Eventos de cadência</h3>
        <button
          type="button"
          onClick={() => void fetchEvents()}
          className="rounded p-1 text-stone-500 hover:text-primary transition-colors"
          aria-label="Recarregar eventos"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="mb-3 flex gap-1">
        {(Object.keys(EVENTS_FILTER_LABELS) as EventsFilter[]).map(k => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none',
              filter === k
                ? 'bg-surface-hover text-primary'
                : 'text-text-muted hover:text-primary',
            )}
          >
            {EVENTS_FILTER_LABELS[k]}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-surface" />
          ))}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-xs text-stone-500">
          Nenhum evento {EVENTS_FILTER_LABELS[filter].toLowerCase()} no momento.
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="space-y-1.5">
          {events.map(evt => {
            const cfg = EVENT_STATUS_CONFIG[evt.status];
            return (
              <div
                key={evt.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-hover"
              >
                {/* Status icon */}
                <span className="mt-0.5 shrink-0">{cfg.icon}</span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-xs font-medium text-primary">
                      {evt.contact_name ?? 'Contato'}
                    </span>
                    {evt.cadence_name && (
                      <span className="text-[10px] text-stone-500">· {evt.cadence_name}</span>
                    )}
                    {evt.step_name && (
                      <span className="text-[10px] text-stone-600">— {evt.step_name}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-stone-500">
                    <Clock size={9} />
                    <span>
                      {new Date(evt.scheduled_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {evt.recipient_phone && (
                      <span className="font-mono">{evt.recipient_phone}</span>
                    )}
                    {evt.attempts > 0 && (
                      <span className="text-stone-600">{evt.attempts}× tentativa{evt.attempts > 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {evt.last_error && evt.status === 'failed' && (
                    <p className="mt-0.5 truncate text-[10px] text-red-400">{evt.last_error}</p>
                  )}
                </div>

                {/* Status badge */}
                <span className={cn(
                  'shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                  cfg.badge,
                )}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  companyId: string;
  onNewCadence: () => void;
  onEditCadence: (cadence: CadenceTemplate) => void;
}

export const CadenceList: React.FC<Props> = ({ companyId, onNewCadence, onEditCadence }) => {
  const [cadences, setCadences] = useState<CadenceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const fetchCadences = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('cadence_templates')
      .select('*, steps:cadence_steps(id)')
      .eq('company_id', companyId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });

    setCadences(
      (data ?? []).map((row) => ({
        ...(row as unknown as CadenceTemplate),
        step_count: Array.isArray((row as Record<string, unknown>).steps)
          ? ((row as Record<string, unknown>).steps as unknown[]).length
          : 0,
      }))
    );
    setLoading(false);
  }, [companyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchCadences(); }, [fetchCadences]);

  const updateStatus = async (id: string, status: CadenceStatus) => {
    await supabase.from('cadence_templates').update({ status }).eq('id', id).eq('company_id', companyId);
    setCadences(prev => prev.map(c => c.id === id ? { ...c, status } : c).filter(c => c.status !== 'archived'));
    setOpenMenu(null);
  };

  const handleDuplicate = async (cadence: CadenceTemplate) => {
    const { data: newTemplate } = await supabase
      .from('cadence_templates')
      .insert({
        company_id: companyId,
        name: `${cadence.name} (cópia)`,
        description: cadence.description,
        category: cadence.category,
        trigger_type: cadence.trigger_type,
        status: 'draft',
        settings: cadence.settings ?? {},
      })
      .select().single();

    if (newTemplate) {
      const { data: steps } = await supabase.from('cadence_steps').select('*').eq('cadence_template_id', cadence.id);
      if (steps?.length) {
        await supabase.from('cadence_steps').insert(
          steps.map((stepRow) => {
            const rest = { ...(stepRow as Record<string, unknown>) };
            delete rest.id;
            delete rest.cadence_template_id;
            delete rest.created_at;
            delete rest.updated_at;
            return { ...rest, company_id: companyId, cadence_template_id: newTemplate.id };
          })
        );
      }
      await fetchCadences();
    }
    setOpenMenu(null);
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="max-w-4xl space-y-3">
        {[1,2,3].map(i => (
        <div key={i} className="rounded-lg border border-border bg-surface p-4 task-card-animate" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-surface-hover" />
                  <div className="h-4 w-16 animate-pulse rounded bg-surface-hover" />
                </div>
                <div className="h-3 w-64 animate-pulse rounded bg-surface-hover" />
                <div className="flex gap-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-surface-hover" />
                  <div className="h-3 w-16 animate-pulse rounded bg-surface-hover" />
                </div>
              </div>
              <div className="h-7 w-7 animate-pulse rounded bg-surface-hover" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Empty state ──
  if (cadences.length === 0) {
    return (
      <div className="max-w-4xl">
      <div className="card-animate overflow-hidden rounded-2xl border border-border bg-surface">
        {/* Hero split */}
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-2">
          {/* Left — copy */}
          <div className="flex flex-col justify-center px-8 py-12">
            <span className="mb-3 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#22d3ee]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22d3ee]" />Cadências
            </span>
            <h3 className="mb-3 text-2xl font-bold tracking-tight text-primary leading-snug">
              Crie cadências que{' '}
              <span className="text-[#22d3ee]">não esquecem</span>{' '}
              de ninguém
            </h3>
            <p className="mb-6 max-w-sm text-sm leading-relaxed text-text-muted">
              Automatize sequências de follow-up que disparam no momento certo — consulta agendada, lead sem resposta ou retorno combinado.
            </p>
            <div className="mb-6 flex flex-col gap-2 text-[12px] text-stone-500">
              {[
                { icon: <Clock size={11} className="text-[#22d3ee]" />, label: 'Setup em 2 min' },
                { icon: <Sparkles size={11} className="text-violet-400" />, label: 'IA decide o melhor horário' },
                { icon: <Layers size={11} className="text-amber-400" />, label: 'Pode pausar a qualquer momento' },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-2">
                  {icon}
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onNewCadence}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-background transition-all hover:-translate-y-0.5 hover:bg-primary/90 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Plus size={14} />Criar minha primeira cadência
              </button>
            </div>
          </div>

          {/* Right — animated flow preview */}
          <div
            className="relative flex items-center justify-center overflow-hidden rounded-r-2xl py-12"
            style={{ background: 'radial-gradient(ellipse at 70% 30%, rgba(34,211,238,0.06), transparent 55%), radial-gradient(ellipse at 30% 70%, rgba(139,92,246,0.06), transparent 55%), var(--bg-surface)' }}
          >
            <div className="flex w-56 flex-col gap-0">
              {/* Flow step cards */}
              {[
                { label: 'GATILHO', desc: 'Consulta agendada', icon: <Zap size={13} className="text-amber-400" />, color: 'border-amber-500/30 bg-amber-500/[0.04]' },
                { label: 'LEMBRETE', desc: '24h antes · WhatsApp', icon: <MessageSquare size={13} className="text-[#22d3ee]" />, color: 'border-[rgba(34,211,238,0.3)] bg-[rgba(34,211,238,0.04)]' },
                { label: 'IA DECIDE', desc: 'Horário ideal de envio', icon: <Sparkles size={13} className="text-violet-400" />, color: 'border-violet-500/30 bg-violet-500/[0.04]' },
                { label: 'CONFIRMAÇÃO', desc: '2h antes · Auto', icon: <CheckCircle2 size={13} className="text-emerald-400" />, color: 'border-emerald-500/30 bg-emerald-500/[0.04]' },
              ].map(({ label, desc, icon, color }, i) => (
                <React.Fragment key={label}>
                  <div className={cn('card-animate rounded-xl border px-3 py-2.5', color)} style={{ animationDelay: `${i * 120}ms` }}>
                    <div className="flex items-center gap-2 mb-1">
                      {icon}
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-stone-400">{label}</span>
                    </div>
                    <p className="text-xs text-text-muted">{desc}</p>
                  </div>
                  {i < 3 && (
                    <div className="relative mx-auto h-6 w-px bg-border/50">
                      <span className="flow-dot absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#22d3ee]" style={{ animationDelay: `${i * 0.8}s` }} />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Template suggestions */}
        <div className="border-t border-border px-8 py-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-500">Comece com um template</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Lembrete de consulta', icon: '📅', trigger: 'appointment_scheduled' },
              { label: 'Lead sem resposta', icon: '💬', trigger: 'no_response' },
              { label: 'Pós-orçamento', icon: '💰', trigger: 'manual' },
              { label: 'Reativação', icon: '🔁', trigger: 'manual' },
            ].map(({ label, icon }) => (
              <button
                key={label}
                type="button"
                onClick={onNewCadence}
                className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface-hover/50 px-3 py-3 text-left transition-all duration-200 hover:border-primary/20 hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <span className="text-base">{icon}</span>
                <span className="text-xs font-medium text-primary leading-snug">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <CadenceEventsPanel companyId={companyId} />
      </div>
    );
  }

  // ── List ──
  return (
    <div className="max-w-4xl">
      <div className="space-y-3">
      {cadences.map((cadence, index) => (
        <div
          key={cadence.id}
          className={cn(
            'activity-card-sheen task-card-animate group rounded-lg border border-border border-l-[3px] bg-surface p-4',
            'transition-all duration-200 hover:-translate-y-px hover:border-primary/20 hover:shadow-sm',
            cadence.status === 'active' && 'border-l-emerald-500/60',
            cadence.status === 'paused' && 'border-l-amber-500/60',
            cadence.status === 'draft' && 'border-l-stone-500/60',
          )}
          style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Name + status badge */}
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-primary">{cadence.name}</h3>
                <span className={cn(
                  'rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  STATUS_BADGE[cadence.status],
                )}>
                  {STATUS_LABELS[cadence.status]}
                </span>
              </div>

              {cadence.description && (
                <p className="mb-2 line-clamp-1 text-xs text-text-muted">{cadence.description}</p>
              )}

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                <span className="flex items-center gap-1.5">
                  <Zap size={11} className="text-amber-400" />
                  {TRIGGER_LABELS[cadence.trigger_type as CadenceTriggerType] ?? cadence.trigger_type}
                </span>
                <span className="flex items-center gap-1.5">
                  <ListChecks size={11} className="text-indigo-400" />
                  {cadence.step_count ?? 0} {(cadence.step_count ?? 0) === 1 ? 'passo' : 'passos'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={11} />
                  {new Date(cadence.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </span>
              </div>

              {/* Timeline preview */}
              <TimelinePreview
                triggerType={cadence.trigger_type as CadenceTriggerType}
                stepCount={cadence.step_count ?? 0}
              />
            </div>

            {/* Actions menu */}
            <div className="relative shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <button
                type="button"
                onClick={() => setOpenMenu(openMenu === cadence.id ? null : cadence.id)}
                className="rounded-md p-1.5 text-stone-500 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                aria-label="Opções da cadência"
              >
                <MoreHorizontal size={15} />
              </button>

              {openMenu === cadence.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                  <div className="absolute right-0 top-8 z-20 w-44 rounded-lg border border-border bg-surface py-1.5 shadow-2xl">
                    <MenuItem icon={Pencil} label="Editar" onClick={() => { onEditCadence(cadence); setOpenMenu(null); }} />
                    <MenuItem icon={Copy} label="Duplicar" onClick={() => void handleDuplicate(cadence)} />
                    {cadence.status === 'active' && (
                      <MenuItem icon={Pause} label="Pausar" onClick={() => void updateStatus(cadence.id, 'paused')} />
                    )}
                    {(cadence.status === 'draft' || cadence.status === 'paused') && (
                      <MenuItem icon={Play} label="Ativar" onClick={() => void updateStatus(cadence.id, 'active')} />
                    )}
                    <div className="my-1 border-t border-border" />
                    <MenuItem icon={Archive} label="Arquivar" onClick={() => void updateStatus(cadence.id, 'archived')} danger />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
      </div>
      <CadenceEventsPanel companyId={companyId} />
    </div>
  );
};

// ── MenuItem ──────────────────────────────────────────────────────────────────
const MenuItem: React.FC<{
  icon: React.FC<{size?: number; className?: string}>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}> = ({ icon: Icon, label, onClick, danger }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-surface-hover',
      danger ? 'text-red-400 hover:text-red-300' : 'text-text-muted hover:text-primary',
    )}
  >
    <Icon size={13} />{label}
  </button>
);
