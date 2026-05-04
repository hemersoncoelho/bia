import React, { useState, useEffect } from 'react';
import { Save, Loader2, X, Plus, AlertCircle } from 'lucide-react';
import type { AiAgent, AiAgentProvider, AiAgentScope } from '../../types';

const PROVIDERS: { value: AiAgentProvider; label: string; models: string[] }[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
  },
  {
    value: 'google',
    label: 'Google',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  {
    value: 'custom',
    label: 'Personalizado (OpenAI-compatible)',
    models: [],
  },
];

export interface AgentFormData {
  name: string;
  description: string;
  provider: AiAgentProvider;
  model: string;
  system_prompt: string;
  scope: AiAgentScope;
  handoff_keywords: string[];
  handoff_after_mins: string;
  is_published: boolean;
}

interface AgentFormProps {
  initial?: Partial<AiAgent>;
  onSave: (data: AgentFormData) => Promise<void>;
  onChange?: (data: AgentFormData) => void;
  saving: boolean;
  toolsSlot?: React.ReactNode;
}

export const AgentForm: React.FC<AgentFormProps> = ({ initial, onSave, onChange, saving, toolsSlot }) => {
  const [form, setForm] = useState<AgentFormData>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    provider: initial?.provider ?? 'openai',
    model: initial?.model ?? 'gpt-4o-mini',
    system_prompt: initial?.system_prompt ?? '',
    scope: initial?.scope ?? { channels: [], auto_reply: false },
    handoff_keywords: initial?.handoff_keywords ?? [],
    handoff_after_mins: initial?.handoff_after_mins?.toString() ?? '',
    is_published: initial?.is_published ?? false,
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [error, setError] = useState('');

  const selectedProvider = PROVIDERS.find((p) => p.value === form.provider)!;

  const updateForm = (updater: (current: AgentFormData) => AgentFormData) => {
    setForm((current) => {
      const next = updater(current);
      onChange?.(next);
      return next;
    });
  };

  useEffect(() => {
    if (initial?.provider && initial?.model) return;
    const defaultModel = selectedProvider?.models[0] ?? '';
    updateForm((f) => ({ ...f, model: defaultModel }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.provider]);

  const addKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw || form.handoff_keywords.includes(kw)) return;
    updateForm((f) => ({ ...f, handoff_keywords: [...f.handoff_keywords, kw] }));
    setKeywordInput('');
  };

  const removeKeyword = (kw: string) => {
    updateForm((f) => ({
      ...f,
      handoff_keywords: f.handoff_keywords.filter((k) => k !== kw),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('O nome do agente é obrigatório.');
      return;
    }
    if (!form.system_prompt.trim()) {
      setError('O prompt de sistema é obrigatório.');
      return;
    }
    setError('');
    await onSave({
      ...form,
      scope: {
        ...form.scope,
        channels: ['whatsapp'],
      },
    });
  };

  const inputClass =
    'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder-stone-600 outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500/30 transition-all';

  const labelClass = 'block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Identity */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest">
          Identidade
        </h3>

        <div>
          <label className={labelClass}>Nome do Agente *</label>
          <input
            className={inputClass}
            placeholder="Ex: Suporte Técnico, SDR Qualificador..."
            value={form.name}
            onChange={(e) => updateForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div>
          <label className={labelClass}>Descrição</label>
          <input
            className={inputClass}
            placeholder="Finalidade e contexto de uso deste agente"
            value={form.description}
            onChange={(e) => updateForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </section>

      {/* Model */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest">
          Modelo de IA
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Provedor</label>
            <select
              className={inputClass}
              value={form.provider}
              onChange={(e) =>
                updateForm((f) => ({ ...f, provider: e.target.value as AiAgentProvider }))
              }
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Modelo</label>
            {selectedProvider.models.length > 0 ? (
              <select
                className={inputClass}
                value={form.model}
                onChange={(e) => updateForm((f) => ({ ...f, model: e.target.value }))}
              >
                {selectedProvider.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={inputClass}
                placeholder="nome-do-modelo"
                value={form.model}
                onChange={(e) => updateForm((f) => ({ ...f, model: e.target.value }))}
              />
            )}
          </div>
        </div>
      </section>

      {/* System Prompt */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest">
          Prompt de Sistema *
        </h3>
        <p className="text-[11px] text-stone-600 leading-relaxed">
          Instruções que definem o comportamento, personalidade e limites de atuação do agente.
          Esta configuração <strong className="text-stone-500">não é exposta ao cliente</strong>.
        </p>
        <textarea
          className={`${inputClass} resize-none font-mono text-xs leading-relaxed`}
          rows={10}
          placeholder={`Você é um assistente de suporte da Acme Corp. Sua função é responder dúvidas sobre os planos e fazer qualificação inicial.

Regras:
- Seja sempre educado e objetivo
- Não mencione concorrentes
- Se não souber responder, transfira para um humano
- Idioma: português brasileiro`}
          value={form.system_prompt}
          onChange={(e) => updateForm((f) => ({ ...f, system_prompt: e.target.value }))}
        />
      </section>

      {/* Behavior */}
      <section className="space-y-4">
        <div>
          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest">
            Comportamento
          </h3>
          <p className="text-[11px] text-stone-600 mt-1">
            Atuando no WhatsApp. Configure resposta automática e regras de handoff humano.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 p-4 bg-surface border border-border rounded-xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-stone-300">WhatsApp</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                Canal ativo
              </span>
            </div>
            <p className="text-[11px] text-stone-600 mt-1">
              Resposta automática para conversas recebidas no WhatsApp.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={form.scope.auto_reply}
              onChange={(e) =>
                updateForm((f) => ({
                  ...f,
                  scope: { ...f.scope, channels: ['whatsapp'], auto_reply: e.target.checked },
                }))
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-stone-700 peer-focus:ring-2 peer-focus:ring-indigo-500/30 rounded-full peer peer-checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        <div>
          <label className={labelClass}>Palavras-chave de Transferência</label>
          <p className="text-[11px] text-stone-600 mb-2">
            Quando o cliente mencionar estas palavras, a conversa será transferida para um humano.
          </p>
          <div className="flex gap-2 mb-2">
            <input
              className={`${inputClass} flex-1`}
              placeholder="Ex: humano, atendente, cancelar..."
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addKeyword();
                }
              }}
            />
            <button
              type="button"
              onClick={addKeyword}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-stone-400 hover:text-primary hover:border-stone-500 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
          {form.handoff_keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.handoff_keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1.5 text-xs bg-background border border-border text-stone-400 px-2 py-1 rounded-full"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => removeKeyword(kw)}
                    className="hover:text-red-400 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Transferir após (minutos sem resolução)</label>
          <input
            type="number"
            min="1"
            className={`${inputClass} max-w-xs`}
            placeholder="Ex: 10 (deixe em branco para desativar)"
            value={form.handoff_after_mins}
            onChange={(e) =>
              updateForm((f) => ({ ...f, handoff_after_mins: e.target.value }))
            }
          />
        </div>
      </section>

      {/* Tools */}
      <section className="space-y-4 pt-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xs font-bold text-stone-300 uppercase tracking-widest">
                Ferramentas
              </h3>
              <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/25 rounded-full px-2 py-0.5 uppercase tracking-wider">
                Proposta de valor
              </span>
            </div>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Configure as ações do agente antes de publicar. Ferramentas com dependências
              pendentes aparecem sinalizadas e não são enviadas ao n8n.
            </p>
          </div>
        </div>
        {toolsSlot ?? (
          <div className="p-5 bg-surface border border-border border-dashed rounded-xl text-center">
            <p className="text-sm text-stone-500 mb-1">Salve o agente primeiro</p>
            <p className="text-[11px] text-stone-600">Após salvar, as ferramentas estarão disponíveis para configuração.</p>
          </div>
        )}
      </section>

      {/* Publication */}
      <section className="pt-6 border-t border-border space-y-4">
        <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <label className="relative inline-flex items-center cursor-pointer mt-0.5">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) =>
                updateForm((f) => ({ ...f, is_published: e.target.checked }))
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-stone-700 peer-focus:ring-2 peer-focus:ring-amber-500/30 rounded-full peer peer-checked:bg-amber-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
          <div>
            <span className="text-sm font-semibold text-amber-400">Publicar Agente</span>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Agentes não publicados só aparecem na área de testes. Publique apenas quando estiver
              satisfeito com o comportamento e ferramentas habilitadas.
            </p>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Salvando...' : 'Salvar Agente'}
          </button>
        </div>
      </section>
    </form>
  );
};
