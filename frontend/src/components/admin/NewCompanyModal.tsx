import React, { useState } from 'react';
import { X, Loader2, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface NewCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewCompanyModal: React.FC<NewCompanyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const slugify = (text: string): string =>
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'empresa';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setError('');
    setLoading(true);

    try {
      const slug = slugify(trimmed) + '-' + Math.random().toString(36).slice(2, 8);
      // O trigger fn_seed_default_pipeline_on_company_insert cria o pipeline
      // padrão automaticamente no banco — nada a fazer aqui no frontend.
      const { error: insertError } = await supabase
        .from('companies')
        .insert({ name: trimmed, slug, is_active: true });

      if (insertError) throw insertError;

      setName('');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || 'Erro ao criar empresa. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-base border border-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-border bg-surface/50">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-amber-500" />
            <h2 className="text-lg font-medium text-primary">Nova Empresa</h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-text-muted hover:text-text-main transition-colors p-2 rounded-md hover:bg-surface-hover"
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
            <label className="block text-xs font-semibold text-stone-400 tracking-wider uppercase mb-1.5">
              Nome da empresa *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Acme Corp"
              required
              disabled={loading}
              autoFocus
              className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-primary placeholder-stone-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-colors"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-stone-400 hover:text-primary transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-background text-sm font-medium rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Criar Empresa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
