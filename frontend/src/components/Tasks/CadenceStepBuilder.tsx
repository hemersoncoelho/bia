import React from 'react';
import { Plus, Trash2, GripVertical, MessageSquare, ListPlus, Bell, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { makeEmptyStep, type StepDraft } from './cadenceStepDrafts';

const ACTION_LABELS = { whatsapp_message: 'Mensagem sugerida', create_task: 'Criar tarefa', notify_user: 'Notificar responsável' };
const ACTION_ICONS = {
  whatsapp_message: <MessageSquare size={13} className="text-emerald-400" />,
  create_task: <ListPlus size={13} className="text-indigo-400" />,
  notify_user: <Bell size={13} className="text-amber-400" />,
};
const OFFSET_PRESETS = [
  { label: '2 dias antes', value: -2880 },
  { label: '1 dia antes', value: -1440 },
  { label: '8h antes (manhã do dia)', value: -480 },
  { label: '2 horas antes', value: -120 },
  { label: 'Na hora da consulta', value: 0 },
  { label: '1 hora depois', value: 60 },
];

const SAMPLE_VARIABLES = ['{{contact.name}}', '{{appointment.date}}', '{{appointment.time}}', '{{company.name}}'];

function previewMessage(text: string): string {
  return text
    .replace('{{contact.name}}', 'Maria')
    .replace('{{appointment.date}}', '20/06')
    .replace('{{appointment.time}}', '14:00')
    .replace('{{company.name}}', 'Clínica Exemplo');
}

interface Props {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  showAppointmentTiming?: boolean;
}

export const CadenceStepBuilder: React.FC<Props> = ({ steps, onChange, showAppointmentTiming = true }) => {
  const update = (key: string, patch: Partial<StepDraft>) =>
    onChange(steps.map(s => s._key === key ? { ...s, ...patch } : s));

  const remove = (key: string) => onChange(steps.filter(s => s._key !== key));

  const add = () => onChange([...steps, makeEmptyStep()]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">{steps.length === 0 ? 'Nenhum passo adicionado.' : `${steps.length} ${steps.length === 1 ? 'passo' : 'passos'} configurados.`}</p>
        <button type="button" onClick={add}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:border-primary/30 hover:text-primary transition-colors">
          <Plus size={13} />Adicionar passo
        </button>
      </div>

      {steps.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-stone-500">
          Clique em "Adicionar passo" para começar.
        </div>
      )}

      {steps.map((step, idx) => (
        <div key={step._key} className={cn('rounded-lg border bg-surface/60 transition-opacity', !step.is_active && 'opacity-50')}>
          {/* Step header */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <GripVertical size={14} className="shrink-0 text-stone-600 cursor-grab" />
            <span className="text-[10px] font-mono text-stone-500">Passo {idx + 1}</span>
            <input value={step.name} onChange={e => update(step._key, { name: e.target.value })}
              placeholder="Nome do passo (ex: Lembrete 1 dia antes)"
              className="flex-1 bg-transparent text-sm font-medium text-primary outline-none placeholder-stone-600" />
            <button type="button" onClick={() => update(step._key, { is_active: !step.is_active })}
              className="shrink-0 text-stone-400 hover:text-primary transition-colors" title={step.is_active ? 'Desativar' : 'Ativar'}>
              {step.is_active ? <ToggleRight size={18} className="text-emerald-400" /> : <ToggleLeft size={18} />}
            </button>
            <button type="button" onClick={() => remove(step._key)} className="shrink-0 text-stone-600 hover:text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>

          {/* Step body */}
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            {/* Ação */}
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-stone-500">Próxima ação</label>
              <select value={step.action_type} onChange={e => update(step._key, { action_type: e.target.value as StepDraft['action_type'] })}
                className="w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm text-primary outline-none transition-colors focus:border-primary/40">
                {(Object.entries(ACTION_LABELS) as [StepDraft['action_type'], string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-stone-500">
                {ACTION_ICONS[step.action_type]}{ACTION_LABELS[step.action_type]}
              </div>
            </div>

            {/* Quando */}
            {showAppointmentTiming && (
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-stone-500">Quando acontece</label>
                <select value={step.offset_minutes} onChange={e => update(step._key, { offset_minutes: Number(e.target.value) })}
                  className="w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm text-primary outline-none transition-colors focus:border-primary/40">
                  {OFFSET_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  <option value={step.offset_minutes}>{!OFFSET_PRESETS.some(p => p.value === step.offset_minutes) ? `${step.offset_minutes} min` : ''}</option>
                </select>
                <p className="mt-1 text-[10px] text-stone-500">Relativo ao horário da consulta.</p>
              </div>
            )}

            {/* Mensagem */}
            {step.action_type === 'whatsapp_message' && (
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Mensagem</label>
                  <div className="flex flex-wrap gap-1">
                    {SAMPLE_VARIABLES.map(v => (
                      <button key={v} type="button"
                        onClick={() => update(step._key, { message_text: step.message_text + v })}
                        className="rounded bg-surface-hover border border-border px-1.5 py-0.5 text-[10px] text-stone-400 hover:text-primary transition-colors font-mono">
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea value={step.message_text} onChange={e => update(step._key, { message_text: e.target.value })}
                  rows={3} placeholder="Ex: Olá {{contact.name}}, sua consulta está confirmada para amanhã às {{appointment.time}}."
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-primary outline-none placeholder-stone-600 transition-colors focus:border-primary/40" />
                {step.message_text && (
                  <div className="mt-2 rounded-md border border-border bg-background/40 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Preview</p>
                    <p className="text-xs text-text-muted">{previewMessage(step.message_text)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Aprovação */}
            <div className="sm:col-span-2 flex items-center gap-2">
              <input type="checkbox" id={`approval-${step._key}`} checked={step.requires_approval}
                onChange={e => update(step._key, { requires_approval: e.target.checked })}
                className="h-3.5 w-3.5 cursor-pointer accent-primary" />
              <label htmlFor={`approval-${step._key}`} className="text-xs text-text-muted cursor-pointer">
                Exigir aprovação humana antes de considerar este passo pronto
              </label>
            </div>
          </div>
        </div>
      ))}

      {steps.length > 0 && (
        <p className="text-[11px] text-stone-500 flex items-start gap-1.5">
          <MessageSquare size={12} className="mt-0.5 shrink-0" />
          Esta tela apenas configura a sequência. Nenhuma mensagem é enviada por aqui.
        </p>
      )}
    </div>
  );
};
