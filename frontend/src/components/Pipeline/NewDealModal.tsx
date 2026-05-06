import React, { useState, useEffect, useCallback } from 'react';
import { X, AlertCircle, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import type { PipelineStage } from '../../types';

interface NewDealModalProps {
  companyId: string;
  pipelineId: string;
  stages: PipelineStage[];
  onClose: () => void;
  onSuccess: () => void;
}

interface ContactOption {
  id: string;
  full_name: string | null;
}

export const NewDealModal: React.FC<NewDealModalProps> = ({
  companyId,
  pipelineId,
  stages,
  onClose,
  onSuccess,
}) => {
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  const [title, setTitle]               = useState('');
  const [amount, setAmount]             = useState('');
  const [stageId, setStageId]           = useState(stages[0]?.id ?? '');
  const [contactId, setContactId]       = useState('');
  const [expectedClose, setExpectedClose] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fetchContacts = useCallback(async () => {
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name')
      .eq('company_id', companyId)
      .order('full_name');
    setContacts((data as ContactOption[]) ?? []);
  }, [companyId]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !stageId) return;

    setSaving(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        company_id:  companyId,
        pipeline_id: pipelineId,
        stage_id:    stageId,
        title:       title.trim(),
        amount:      parseFloat(amount) || 0,
        currency:    'BRL',
        status:      'open',
      };

      if (contactId)     payload.contact_id           = contactId;
      if (expectedClose) payload.expected_close_date  = expectedClose;

      const { error: insertErr } = await supabase.from('deals').insert(payload);
      if (insertErr) throw insertErr;

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar negócio.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-surface-hover border border-border rounded-lg px-3 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-text-muted transition-colors';

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-text-main">Novo Negócio</h2>
            <p className="text-[11px] text-stone-500 mt-0.5">Jornada do Cliente</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-main transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Título */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-stone-500 mb-1.5">Título *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Proposta Enterprise – Ana Costa"
              className={inputCls}
              required
              autoFocus
            />
          </div>

          {/* Valor */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-stone-500 mb-1.5">Valor (R$)</label>
            <div className="relative">
              <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0,00"
                className={cn(inputCls, 'pl-9')}
              />
            </div>
          </div>

          {/* Estágio */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-stone-500 mb-1.5">Estágio *</label>
            <select value={stageId} onChange={e => setStageId(e.target.value)} className={inputCls} required>
              {stages.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Contato */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-stone-500 mb-1.5">Contato</label>
            <select value={contactId} onChange={e => setContactId(e.target.value)} className={inputCls}>
              <option value="">Sem contato vinculado</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.full_name || 'Sem nome'}</option>
              ))}
            </select>
          </div>

          {/* Data de fechamento */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-stone-500 mb-1.5">Previsão de Fechamento</label>
            <input
              type="date"
              value={expectedClose}
              onChange={e => setExpectedClose(e.target.value)}
              className={cn(inputCls, 'text-stone-300')}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm text-text-muted hover:text-text-main border border-border rounded-lg transition-all">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || !stageId}
              className="flex-1 py-2.5 text-sm font-medium bg-white text-black rounded-lg hover:bg-stone-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Criando...' : 'Criar Negócio'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
