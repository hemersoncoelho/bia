import React, { useState } from 'react';
import {
  X, ChevronRight, ChevronLeft, Loader2, CheckCircle2, Zap,
  CalendarDays, MessageSquare, FileText, Sparkles,
  RefreshCw, XCircle, User, Plus, Eye,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { CadenceStepBuilder } from './CadenceStepBuilder';
import { makeSuggestedSteps, makeEmptyStep, type StepDraft } from './cadenceStepDrafts';
import type { CadenceCategory, CadenceTriggerType } from '../../types';

const CATEGORIES: { value: CadenceCategory; label: string }[] = [
  { value: 'agendamento', label: 'Agendamento' },
  { value: 'qualificacao', label: 'Qualificação' },
  { value: 'pos_orcamento', label: 'Pós-orçamento' },
  { value: 'reativacao', label: 'Reativação' },
  { value: 'pos_atendimento', label: 'Pós-atendimento' },
  { value: 'personalizada', label: 'Personalizada' },
];
const TRIGGERS: { value: CadenceTriggerType; label: string; description: string }[] = [
  { value: 'appointment_scheduled', label: 'Consulta agendada', description: 'Disparada quando uma nova consulta é marcada.' },
  { value: 'appointment_rescheduled', label: 'Consulta remarcada', description: 'Disparada quando uma consulta é remarcada.' },
  { value: 'appointment_cancelled', label: 'Consulta cancelada', description: 'Disparada quando uma consulta é cancelada.' },
  { value: 'no_response', label: 'Lead sem resposta', description: 'Disparada quando lead fica em silêncio por X tempo.' },
  { value: 'quote_sent', label: 'Orçamento enviado', description: 'Disparada após o envio de uma proposta.' },
  { value: 'manual', label: 'Manual', description: 'Iniciada por um membro da equipe.' },
];

const TRIGGER_ICONS: Record<CadenceTriggerType, React.FC<{ size?: number; className?: string }>> = {
  appointment_scheduled: CalendarDays,
  appointment_rescheduled: RefreshCw,
  appointment_cancelled: XCircle,
  no_response: MessageSquare,
  quote_sent: FileText,
  manual: User,
};

const STEPS_LABELS = ['Informações', 'Gatilho', 'Passos', 'Regras', 'Revisão'];

interface FormData {
  name: string;
  description: string;
  category: CadenceCategory;
  trigger_type: CadenceTriggerType;
  settings: {
    cancel_if_appointment_cancelled: boolean;
    recalculate_if_rescheduled: boolean;
    pause_if_replied: boolean;
    send_window_start: string;
    send_window_end: string;
  };
  steps: StepDraft[];
}

type TemplatePatch = Omit<Partial<FormData>, 'settings'> & {
  settings?: Partial<FormData['settings']>;
};

interface BeatBar {
  label: string;
  widthPx: number;
  color: string;
}

interface QuickStartTemplate {
  id: string;
  title: string;
  description: string;
  preview: string[];
  bars: BeatBar[];
  icon: React.FC<{ size?: number; className?: string }>;
  create: () => TemplatePatch;
}

function initialForm(): FormData {
  return {
    name: 'Lembrete de consulta',
    description: 'Lembretes antes da consulta com mensagens claras e aprováveis.',
    category: 'agendamento',
    trigger_type: 'appointment_scheduled',
    settings: {
      cancel_if_appointment_cancelled: true,
      recalculate_if_rescheduled: true,
      pause_if_replied: false,
      send_window_start: '08:00',
      send_window_end: '20:00',
    },
    steps: makeSuggestedSteps(),
  };
}

function makeQualificationSteps(): StepDraft[] {
  return [
    {
      ...makeEmptyStep(),
      name: 'Retomar qualificação',
      action_type: 'whatsapp_message',
      relative_to: 'last_message_at',
      offset_minutes: 1440,
      message_text: 'Olá {{contact.name}}, tudo bem? Passando para saber se você conseguiu avaliar as informações e se posso ajudar no próximo passo.',
      requires_approval: true,
    },
    {
      ...makeEmptyStep(),
      name: 'Criar tarefa de revisão',
      action_type: 'create_task',
      relative_to: 'last_message_at',
      offset_minutes: 2880,
      message_text: '',
      requires_approval: true,
    },
  ];
}

function makeQuoteSteps(): StepDraft[] {
  return [
    {
      ...makeEmptyStep(),
      name: 'Follow-up pós-orçamento',
      action_type: 'whatsapp_message',
      relative_to: 'quote_sent_at',
      offset_minutes: 1440,
      message_text: 'Olá {{contact.name}}, passando para saber se ficou alguma dúvida sobre o orçamento enviado.',
      requires_approval: true,
    },
    {
      ...makeEmptyStep(),
      name: 'Avisar responsável',
      action_type: 'notify_user',
      relative_to: 'quote_sent_at',
      offset_minutes: 4320,
      message_text: '',
      requires_approval: false,
    },
  ];
}

const QUICK_STARTS: QuickStartTemplate[] = [
  {
    id: 'appointment_reminder',
    title: 'Lembrete de consulta',
    description: 'Confirma presença e reduz ausências.',
    preview: ['1 dia antes', 'No dia', '2h antes'],
    bars: [
      { label: '-1d', widthPx: 58, color: '#22d3ee' },
      { label: '-8h', widthPx: 40, color: '#22d3ee' },
      { label: '-2h', widthPx: 26, color: '#22d3ee' },
    ],
    icon: CalendarDays,
    create: () => ({
      name: 'Lembrete de consulta',
      description: 'Lembretes antes da consulta com mensagens claras e aprováveis.',
      category: 'agendamento',
      trigger_type: 'appointment_scheduled',
      steps: makeSuggestedSteps(),
    }),
  },
  {
    id: 'qualification_recovery',
    title: 'Recuperação de qualificação',
    description: 'Retoma leads que pararam no meio.',
    preview: ['24h sem resposta', 'Revisão humana'],
    bars: [
      { label: '24h', widthPx: 52, color: '#a78bfa' },
      { label: 'IA', widthPx: 64, color: '#a78bfa' },
      { label: '3d', widthPx: 30, color: '#78716c' },
    ],
    icon: MessageSquare,
    create: () => ({
      name: 'Recuperação de qualificação',
      description: 'Acompanhamento para leads sem resposta após perguntas importantes.',
      category: 'qualificacao',
      trigger_type: 'no_response',
      settings: { pause_if_replied: true },
      steps: makeQualificationSteps(),
    }),
  },
  {
    id: 'post_quote',
    title: 'Pós-orçamento',
    description: 'Acompanha após envio de proposta.',
    preview: ['1 dia depois', '3 dias depois'],
    bars: [
      { label: '+1d', widthPx: 46, color: '#f97316' },
      { label: '+3d', widthPx: 58, color: '#f97316' },
      { label: '+7d', widthPx: 24, color: '#f97316' },
    ],
    icon: FileText,
    create: () => ({
      name: 'Pós-orçamento',
      description: 'Follow-up para resolver dúvidas e manter o contato aquecido.',
      category: 'pos_orcamento',
      trigger_type: 'quote_sent',
      settings: { pause_if_replied: true },
      steps: makeQuoteSteps(),
    }),
  },
  {
    id: 'blank',
    title: 'Criar do zero',
    description: 'Sequência mínima — personalize tudo.',
    preview: ['Passo inicial'],
    bars: [
      { label: 'Início', widthPx: 82, color: '#78716c' },
    ],
    icon: Sparkles,
    create: () => ({
      name: '',
      description: '',
      category: 'personalizada',
      trigger_type: 'manual',
      steps: [makeEmptyStep()],
    }),
  },
];

interface Props {
  companyId: string;
  userId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export const CadenceWizard: React.FC<Props> = ({ companyId, userId, onClose, onSaved }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(initialForm);
  const [selectedTemplate, setSelectedTemplate] = useState('appointment_reminder');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const patch = (p: Partial<FormData>) => setForm(f => ({ ...f, ...p }));
  const patchSettings = (p: Partial<FormData['settings']>) => patch({ settings: { ...form.settings, ...p } });

  const isAppointmentTrigger = ['appointment_scheduled', 'appointment_rescheduled', 'appointment_cancelled'].includes(form.trigger_type);

  // Auto-populate suggested steps when trigger changes
  const handleTriggerChange = (t: CadenceTriggerType) => {
    const isAppt = ['appointment_scheduled', 'appointment_rescheduled', 'appointment_cancelled'].includes(t);
    patch({ trigger_type: t, steps: isAppt ? makeSuggestedSteps() : [makeEmptyStep()] });
  };

  const applyTemplate = (template: QuickStartTemplate) => {
    const next = template.create();
    setSelectedTemplate(template.id);
    setForm(current => ({
      ...current,
      ...next,
      settings: {
        ...current.settings,
        ...(next.settings ?? {}),
      },
    }));
  };

  const canAdvance = (): boolean => {
    if (step === 1) return form.name.trim().length > 0;
    if (step === 3) return form.steps.every(s => s.name.trim() && (s.action_type !== 'whatsapp_message' || s.message_text.trim()));
    return true;
  };

  const save = async (status: 'draft' | 'active') => {
    if (!form.name.trim() || !companyId) return;
    if (status === 'active' && form.steps.length === 0) { setError('Ative pelo menos 1 passo antes de ativar a cadência.'); return; }
    setSaving(true); setError('');

    const { data: template, error: tErr } = await supabase.from('cadence_templates').insert({
      company_id: companyId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category,
      trigger_type: form.trigger_type,
      status,
      settings: form.settings,
      created_by: userId ?? null,
    }).select().single();

    if (tErr || !template) { setError('Erro ao salvar cadência. Tente novamente.'); setSaving(false); return; }

    if (form.steps.length > 0) {
      const { error: sErr } = await supabase.from('cadence_steps').insert(
        form.steps.map((s, i) => ({
          company_id: companyId,
          cadence_template_id: template.id,
          step_order: i + 1,
          name: s.name.trim() || `Passo ${i + 1}`,
          action_type: s.action_type,
          relative_to: s.relative_to || null,
          offset_minutes: s.offset_minutes,
          message_text: s.message_text.trim() || null,
          requires_approval: s.requires_approval,
          is_active: s.is_active,
          settings: {},
        }))
      );
      if (sErr) { setError('Cadência criada, mas houve erro ao salvar os passos.'); setSaving(false); return; }
    }

    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-5xl flex-col rounded-2xl border border-border bg-surface shadow-2xl" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-stone-500">Criador guiado</p>
            <h2 className="text-base font-semibold text-primary">Nova cadência</h2>
            <p className="mt-0.5 text-xs text-text-muted">Etapa {step} de 5 - {STEPS_LABELS[step - 1]}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-stone-400 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="Fechar criador de cadência"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="shrink-0 flex gap-1 px-6 pt-4">
          {STEPS_LABELS.map((l, i) => (
            <div key={l} className={cn('h-1 flex-1 rounded-full transition-colors', i < step ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>

        {/* Body */}
        <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Início rápido</p>
                  <span className="text-[11px] text-stone-500">Template sugerido: Lembrete de consulta</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {QUICK_STARTS.map(template => {
                    const Icon = template.icon;
                    const active = selectedTemplate === template.id;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => applyTemplate(template)}
                        className={cn(
                          'group rounded-xl border p-3.5 text-left transition-all duration-200 active:scale-[0.99]',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                          active
                            ? 'border-primary/35 bg-primary/[0.06] shadow-sm'
                            : 'border-border bg-background/45 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-surface-hover',
                        )}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors',
                            active ? 'border-primary/25 bg-primary text-background' : 'border-border bg-surface text-stone-500 group-hover:text-primary',
                          )}>
                            <Icon size={14} />
                          </span>
                          <span className="text-sm font-semibold text-primary leading-tight">{template.title}</span>
                        </div>
                        <p className="mb-3 text-xs leading-relaxed text-text-muted">{template.description}</p>
                        {/* Beat-chart bars */}
                        <div className="flex items-end gap-2">
                          {template.bars.map((bar, i) => (
                            <div key={i} className="flex flex-col items-start gap-1">
                              <div
                                className="rounded-sm"
                                style={{ width: bar.widthPx, height: 5, backgroundColor: bar.color, opacity: 0.75 }}
                              />
                              <span
                                className="font-mono text-[9px] font-medium"
                                style={{ color: bar.color, opacity: 0.85 }}
                              >
                                {bar.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field label="Nome da cadência *">
                <input autoFocus value={form.name} onChange={e => patch({ name: e.target.value })}
                  placeholder="Ex: Lembrete de consulta"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-primary outline-none placeholder-stone-600 focus:border-primary/40 transition-colors" />
              </Field>
              <Field label="Descrição">
                <textarea value={form.description} onChange={e => patch({ description: e.target.value })}
                  rows={2} placeholder="Objetivo desta cadência..."
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2.5 text-sm text-primary outline-none placeholder-stone-600 focus:border-primary/40 transition-colors" />
              </Field>
              <Field label="Categoria">
                <select value={form.category} onChange={e => patch({ category: e.target.value as CadenceCategory })}
                  className="w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2.5 text-sm text-primary outline-none focus:border-primary/40 transition-colors">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Eventos do CRM</p>
                <div className="grid grid-cols-2 gap-2">
                  {TRIGGERS.map(t => {
                    const TIcon = TRIGGER_ICONS[t.value];
                    const selected = form.trigger_type === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => handleTriggerChange(t.value)}
                        className={cn(
                          'relative flex flex-col gap-2.5 rounded-xl border p-3 text-left transition-all duration-200 active:scale-[0.99]',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                          selected
                            ? 'border-primary/40 bg-primary/[0.06] shadow-sm'
                            : 'border-border bg-background/45 hover:border-primary/25 hover:bg-surface-hover',
                        )}
                      >
                        {/* Radio circle top-right */}
                        <span className={cn(
                          'absolute right-3 top-3 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          selected ? 'border-primary bg-primary' : 'border-stone-500',
                        )}>
                          {selected && <span className="h-1.5 w-1.5 rounded-full bg-background" />}
                        </span>
                        {/* Icon */}
                        <span className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
                          selected ? 'border-primary/25 bg-primary/10 text-primary' : 'border-border bg-surface text-stone-500',
                        )}>
                          <TIcon size={16} />
                        </span>
                        <div className="pr-5">
                          <p className="text-sm font-semibold text-primary leading-tight">{t.label}</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{t.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filtros adicionais */}
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                  Filtros adicionais · <span className="font-normal normal-case text-stone-600">Opcional</span>
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-text-muted transition-colors hover:border-primary/25 hover:text-primary focus:outline-none"
                >
                  <Plus size={11} />Adicionar filtro
                </button>
                <p className="mt-1.5 text-[10px] text-stone-600">ex. pipeline específico, valor mínimo, responsável...</p>
              </div>

              {isAppointmentTrigger && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300 flex items-start gap-2">
                  <Zap size={13} className="shrink-0 mt-0.5" />
                  Os passos serão configurados com tempo relativo ao horário da consulta.
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <CadenceStepBuilder
              steps={form.steps}
              onChange={steps => patch({ steps })}
              showAppointmentTiming={isAppointmentTrigger}
            />
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-text-muted mb-2">Configure quando a cadência deve parar ou aguardar.</p>
              <ToggleRule checked={form.settings.cancel_if_appointment_cancelled} onChange={v => patchSettings({ cancel_if_appointment_cancelled: v })}
                label="Cancelar cadência se consulta for cancelada" />
              <ToggleRule checked={form.settings.recalculate_if_rescheduled} onChange={v => patchSettings({ recalculate_if_rescheduled: v })}
                label="Recalcular disparos se consulta for remarcada" />
              <ToggleRule checked={form.settings.pause_if_replied} onChange={v => patchSettings({ pause_if_replied: v })}
                label="Pausar cadência se paciente responder" />
              <div className="grid grid-cols-2 gap-4 pt-2">
                <Field label="Janela a partir de">
                  <input type="time" value={form.settings.send_window_start} onChange={e => patchSettings({ send_window_start: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-primary outline-none focus:border-primary/40" />
                </Field>
                <Field label="Janela até">
                  <input type="time" value={form.settings.send_window_end} onChange={e => patchSettings({ send_window_end: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-primary outline-none focus:border-primary/40" />
                </Field>
              </div>
              <p className="text-[11px] text-stone-500">Esta tela só configura a janela operacional. A execução depende do motor de cadências.</p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-text-muted mb-2">Revise antes de salvar.</p>
              <ReviewRow label="Nome" value={form.name} />
              {form.description && <ReviewRow label="Descrição" value={form.description} />}
              <ReviewRow label="Categoria" value={CATEGORIES.find(c => c.value === form.category)?.label ?? form.category} />
              <ReviewRow label="Gatilho" value={TRIGGERS.find(t => t.value === form.trigger_type)?.label ?? form.trigger_type} />
              <ReviewRow label="Passos" value={`${form.steps.length} ${form.steps.length === 1 ? 'passo' : 'passos'} configurados`} />
              {form.steps.length > 0 && (
                <div className="rounded-lg border border-border bg-background/40 p-3 space-y-1.5">
                  {form.steps.map((s, i) => (
                    <div key={s._key} className="flex items-center gap-2 text-xs text-text-muted">
                      <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                      <span className="font-medium text-primary">{i + 1}.</span> {s.name || `Passo ${i + 1}`}
                    </div>
                  ))}
                </div>
              )}
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          )}
            </div>
            <CadencePreviewPanel form={form} step={step} />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-border px-6 py-4">
          <button type="button" onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-text-muted hover:text-primary transition-colors">
            <ChevronLeft size={15} />{step === 1 ? 'Cancelar' : 'Voltar'}
          </button>

          {step < 5 ? (
            <button type="button" onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-background hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Próximo<ChevronRight size={15} />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void save('draft')} disabled={saving}
                className="px-4 py-2 text-sm text-text-muted border border-border rounded-md hover:border-primary/25 hover:text-primary transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : 'Salvar rascunho'}
              </button>
              <button type="button" onClick={() => void save('active')} disabled={saving || form.steps.length === 0}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-background hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {saving && <Loader2 size={14} className="animate-spin" />}
                Ativar cadência
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">{label}</label>
    {children}
  </div>
);

const ToggleRule: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/50 px-4 py-3 transition-colors hover:bg-surface-hover">
    <span className="text-sm text-primary">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        checked ? 'bg-primary' : 'bg-stone-700',
      )}
    >
      <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  </div>
);

const ReviewRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start gap-3">
    <span className="w-24 shrink-0 text-xs text-stone-500">{label}</span>
    <span className="text-sm text-primary">{value}</span>
  </div>
);

function formatStepTiming(step: StepDraft): string {
  const minutes = step.offset_minutes;
  if (minutes === 0) return 'No horário';
  const abs = Math.abs(minutes);
  const unit = abs >= 1440 ? `${Math.round(abs / 1440)}d` : `${Math.round(abs / 60)}h`;
  return minutes < 0 ? `${unit} antes` : `${unit} depois`;
}

const CadencePreviewPanel: React.FC<{ form: FormData; step: number }> = ({ form, step }) => {
  const trigger = TRIGGERS.find(t => t.value === form.trigger_type);
  const TriggerIcon = trigger ? TRIGGER_ICONS[trigger.value] : CalendarDays;
  const visibleSteps = form.steps.slice(0, 3);
  const stepCount = form.steps.length;

  return (
    <aside className="rounded-xl border border-border bg-background/45 p-4 lg:sticky lg:top-0 lg:self-start">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Eye size={13} className="text-stone-400" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-stone-500">Preview</span>
        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-cyan-400">
          ao vivo
        </span>
      </div>

      <div className="space-y-2.5 text-xs">
        {/* Cadência */}
        <div className="rounded-lg border border-border bg-surface/65 p-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-stone-500">Cadência</p>
          <p className="font-semibold text-primary leading-tight">{form.name || 'Nova cadência'}</p>
          {form.description && (
            <p className="mt-1 text-[11px] leading-relaxed text-stone-500 line-clamp-2">{form.description}</p>
          )}
        </div>

        {/* Gatilho */}
        <div className="rounded-lg border border-border bg-surface/65 p-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-stone-500">Gatilho</p>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
              <TriggerIcon size={13} className="text-stone-400" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-primary leading-tight">{trigger?.label ?? form.trigger_type}</p>
              {trigger?.description && (
                <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">{trigger.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Sequência */}
        <div className="rounded-lg border border-border bg-surface/65 p-3">
          <p className="mb-2.5 text-[10px] uppercase tracking-wider text-stone-500">
            Sequência{stepCount > 0 && (
              <span className="ml-1 text-stone-600">· {stepCount} {stepCount === 1 ? 'passo' : 'passos'}</span>
            )}
          </p>
          {visibleSteps.length === 0 ? (
            <p className="text-stone-500">Nenhum passo configurado.</p>
          ) : (
            <ol className="space-y-3">
              {visibleSteps.map((item, index) => (
                <li key={item._key} className="relative flex gap-2.5">
                  {index < visibleSteps.length - 1 && (
                    <span className="absolute left-[9px] top-5 h-[calc(100%+4px)] w-px bg-border" />
                  )}
                  <span className={cn(
                    'relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums',
                    index + 1 <= step ? 'border-primary bg-primary text-background' : 'border-stone-500 bg-background text-stone-500',
                  )}>
                    {index + 1}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="truncate font-semibold text-primary leading-tight">{item.name || `Passo ${index + 1}`}</p>
                    <p className="mt-0.5 text-[10px] text-stone-500">{formatStepTiming(item)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {form.steps.length > 3 && (
            <p className="mt-2 text-[10px] text-stone-500">+{form.steps.length - 3} passo adicional</p>
          )}
        </div>

        {/* Estimativa da IA */}
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles size={11} className="text-violet-400" />
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Estimativa da IA</p>
          </div>
          <p className="font-semibold text-emerald-400">+18% de presença esperada</p>
          <p className="mt-0.5 text-[10px] text-stone-500">Com base em 217 cadências similares.</p>
        </div>
      </div>
    </aside>
  );
};
