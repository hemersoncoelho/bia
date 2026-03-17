import React, { useState, useEffect } from 'react';
import { X, Loader2, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface NewTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  companyId: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'time';
}

export const NewTeamModal: React.FC<NewTeamModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  companyId,
}) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const slug = slugify(trimmed);
      const { error: insertError } = await supabase
        .from('teams')
        .insert({
          company_id: companyId,
          name: trimmed,
          slug: slug || 'time',
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar time. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputCls =
    'w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-primary placeholder-stone-600 focus:outline-none focus:border-stone-500 transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-base border border-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-border bg-surface/50">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-amber-500" />
            <h2 className="text-lg font-medium text-primary">Novo Time</h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-stone-400 hover:text-white transition-colors p-2 rounded-md hover:bg-surface"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5 uppercase tracking-wider">
              Nome do time *
            </label>
            <div className="relative">
              <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Comercial, Suporte, Financeiro"
                className={`${inputCls} pl-10`}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 text-sm text-stone-400 hover:text-white border border-border rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-2.5 text-sm font-medium bg-primary text-background rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Time'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
