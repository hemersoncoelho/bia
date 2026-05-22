import React, { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  message: string;
  onSave: (newMessage: string) => Promise<{ success: boolean; error?: string }>;
  disabled?: boolean;
}

/**
 * Balão de mensagem com edição inline.
 *
 * Estados:
 * - Normal: mostra o texto com botão "editar" em hover.
 * - Edição: textarea substituindo o texto.
 * - Salvando: textarea desabilitada com indicador.
 * - Erro: feedback visual + rollback.
 */
export const AgentMessageBubble: React.FC<Props> = ({ message, onSave, disabled }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sincroniza draft quando message muda externamente (ex: optimistic rollback)
  useEffect(() => {
    if (!editing) setDraft(message);
  }, [message, editing]);

  // Foca textarea ao entrar em modo de edição
  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const handleEdit = () => {
    if (disabled) return;
    setDraft(message);
    setError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    if (saving) return;
    const trimmed = draft.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);

    const result = await onSave(trimmed);

    setSaving(false);
    if (result.success) {
      setEditing(false);
    } else {
      setError('Não foi possível salvar. Tente novamente.');
    }
  };

  const handleCancel = () => {
    setDraft(message);
    setError(null);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
    // Ctrl+Enter salva
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSave();
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={saving}
          rows={3}
          aria-label="Mensagem que será enviada"
          className={cn(
            'w-full resize-none rounded-lg border bg-white/[0.06] px-3 py-2',
            'text-xs leading-relaxed text-primary placeholder-stone-500',
            'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40',
            saving ? 'cursor-not-allowed opacity-50 border-border' : 'border-violet-500/30',
          )}
        />
        {error && (
          <p className="text-[10px] text-rose-400">{error}</p>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !draft.trim()}
            className={cn(
              'flex items-center gap-1 rounded border px-2.5 py-1 text-[10px] font-semibold transition-colors focus:outline-none',
              'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20',
              (saving || !draft.trim()) && 'cursor-not-allowed opacity-50',
            )}
          >
            <Check size={10} />
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium text-stone-500 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none"
          >
            <X size={10} />
            Cancelar
          </button>
          <span className="ml-auto text-[9px] text-stone-600">Ctrl+Enter para salvar</span>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Editar mensagem"
        onClick={handleEdit}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEdit(); } }}
        className={cn(
          'relative cursor-text rounded-lg rounded-tl-sm border px-3 py-2',
          'border-white/[0.07] bg-white/[0.04]',
          !disabled && 'hover:border-violet-500/25 hover:bg-white/[0.06] transition-colors',
        )}
      >
        <p className="text-[11px] leading-relaxed text-text-muted">{message}</p>

        {/* Botão editar em hover */}
        {!disabled && (
          <button
            type="button"
            aria-label="Editar mensagem"
            onClick={e => { e.stopPropagation(); handleEdit(); }}
            className={cn(
              'absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded px-1.5 py-0.5',
              'text-[9px] font-medium text-stone-500 opacity-0 transition-opacity',
              'group-hover:opacity-100 hover:bg-violet-500/10 hover:text-violet-300',
              'focus:outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-violet-400/40',
            )}
          >
            <Pencil size={8} />
            editar
          </button>
        )}
      </div>
    </div>
  );
};
