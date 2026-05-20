import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TeamMember { id: string; full_name: string; }

interface Props {
  companyId: string;
  userId?: string | null;
  teamMembers: TeamMember[];
  onClose: () => void;
  onCreated: () => void;
}

function isPermissionError(err: { code?: string; message?: string } | null) {
  if (!err) return false;
  const t = `${err.code ?? ''} ${err.message ?? ''}`.toLowerCase();
  return t.includes('42501') || t.includes('permission') || t.includes('row-level security') || t.includes('not authorized');
}

export const NewTaskModal: React.FC<Props> = ({ companyId, userId, teamMembers, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError('');

    const { error: err } = await supabase.from('tasks').insert({
      company_id: companyId,
      title: title.trim(),
      description: description.trim() || null,
      due_at: dueAt || null,
      assigned_to: assignedTo || null,
      status: 'open',
      priority: 'normal',
      source_type: 'manual',
      ai_generated: false,
      created_by: userId ?? null,
    });

    if (err) {
      setError(isPermissionError(err) ? 'Sem permissão para criar tarefa nesta empresa.' : 'Erro ao criar tarefa. Tente novamente.');
    } else {
      onCreated();
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2 className="text-base font-semibold text-primary">Nova Tarefa</h2>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-primary transition-colors" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">Título *</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleCreate()}
              placeholder="Ex: Enviar proposta comercial" autoFocus
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-primary outline-none placeholder-stone-600 transition-colors focus:border-primary/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">Descrição</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Detalhes adicionais..." rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2.5 text-sm text-primary outline-none placeholder-stone-600 transition-colors focus:border-primary/40"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">Vencimento</label>
              <input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-primary outline-none transition-colors focus:border-primary/40" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">Responsável</label>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                className="w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2.5 text-sm text-primary outline-none transition-colors focus:border-primary/40">
                <option value="">Sem responsável</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-primary transition-colors">Cancelar</button>
          <button type="button" onClick={() => void handleCreate()} disabled={!title.trim() || saving}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-background hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Criar Tarefa
          </button>
        </div>
      </div>
    </div>
  );
};
