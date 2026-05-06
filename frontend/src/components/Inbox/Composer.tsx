import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile, FileText, Bot, Lock } from 'lucide-react';

interface ComposerProps {
  onSendMessage: (body: string, isInternal: boolean) => Promise<void>;
  disabled?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({ onSendMessage, disabled }) => {
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isNote = mode === 'note';
  const canSend = !disabled && !sending && body.trim().length > 0;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body]);

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSendMessage(body, isNote);
      setBody('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      textareaRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={`shrink-0 border-t transition-colors duration-200 ${
        disabled
          ? 'border-border bg-background'
          : isNote
          ? 'border-amber-500/25 bg-amber-500/3'
          : 'border-border bg-background'
      }`}
    >
      {/* ── Mode selector ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-4 pt-3.5 pb-3 border-b border-border/50">
        <button
          onClick={() => setMode('reply')}
          disabled={disabled}
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all ${
            !isNote
              ? 'bg-white text-stone-900 shadow-sm shadow-white/10'
              : 'text-stone-600 hover:text-stone-400 hover:bg-surface disabled:opacity-40'
          }`}
        >
          <Send size={12} />
          Responder
        </button>

        <button
          onClick={() => setMode('note')}
          disabled={disabled}
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all ${
            isNote
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              : 'text-stone-600 hover:text-stone-400 hover:bg-surface disabled:opacity-40'
          }`}
        >
          <FileText size={12} />
          Nota Interna
        </button>

        <div className="ml-auto">
          <button
            disabled={disabled}
            className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-500 hover:text-indigo-400 px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/10 transition-all disabled:opacity-30"
          >
            <Bot size={12} />
            Sugerir IA
          </button>
        </div>
      </div>

      {/* ── Input area ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3.5">
        {disabled ? (
          /* Closed conversation state */
          <div className="flex items-center justify-center gap-2 py-4 text-stone-700">
            <Lock size={14} />
            <span className="text-xs font-medium">Conversa encerrada</span>
          </div>
        ) : (
          <div
            className={`rounded-xl border transition-all duration-200 ${
              isNote
                ? 'border-amber-500/30 focus-within:border-amber-500/60 bg-amber-500/4'
                : 'border-border focus-within:border-stone-600 bg-surface'
            }`}
          >
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              className="w-full bg-transparent resize-none px-3.5 pt-3.5 pb-2 text-sm text-primary placeholder-stone-700 outline-none leading-relaxed no-scrollbar min-h-[64px]"
              placeholder={
                isNote
                  ? 'Nota interna — visível apenas para sua equipe...'
                  : 'Escreva uma mensagem... (⌘ + Enter para enviar)'
              }
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              rows={1}
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 pb-3 pt-1.5">
              <div className="flex items-center gap-0.5">
                <button
                  className="p-1.5 text-stone-700 hover:text-stone-400 rounded-md hover:bg-surface/60 transition-colors"
                  title="Anexar arquivo"
                >
                  <Paperclip size={15} />
                </button>
                <button
                  className="p-1.5 text-stone-700 hover:text-stone-400 rounded-md hover:bg-surface/60 transition-colors"
                  title="Emoji"
                >
                  <Smile size={15} />
                </button>
                {body.length > 0 && (
                  <span className="ml-2 text-[10px] font-mono text-stone-700 tabular-nums">
                    {body.length}
                  </span>
                )}
              </div>

              <button
                onClick={handleSend}
                disabled={!canSend}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  !canSend
                    ? 'text-stone-700 cursor-not-allowed'
                    : isNote
                    ? 'bg-amber-500 text-amber-950 hover:bg-amber-400 shadow-sm shadow-amber-500/20 active:scale-95'
                    : 'bg-white text-stone-900 hover:bg-stone-100 shadow-sm active:scale-95'
                }`}
              >
                {sending ? (
                  <span className="text-xs tracking-wide">Enviando…</span>
                ) : (
                  <>
                    <span>{isNote ? 'Salvar' : 'Enviar'}</span>
                    <Send size={12} className="opacity-70" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Hint */}
        {!disabled && !isNote && (
          <p className="text-[10px] font-mono text-stone-800 mt-1.5 text-right select-none">
            ⌘ + Enter para enviar
          </p>
        )}
        {isNote && (
          <p className="text-[10px] font-mono text-amber-700/60 mt-1.5 select-none flex items-center gap-1">
            <Lock size={9} />
            Visível apenas para agentes internos
          </p>
        )}
      </div>
    </div>
  );
};
