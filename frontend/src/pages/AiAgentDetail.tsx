import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Bot,
  ChevronLeft,
  Loader2,
  Trash2,
  Zap,
  ZapOff,
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Settings2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { AgentForm } from '../components/AiAgents/AgentForm';
import { AgentTestPanel } from '../components/AiAgents/AgentTestPanel';
import { AgentToolGrid } from '../components/AiAgents/AgentToolGrid';
import type { AgentFormData } from '../components/AiAgents/AgentForm';
import type { AiAgent, ToolContext } from '../types';

type TabId = 'config' | 'test';

const TAB_LABELS: Record<TabId, { label: string; icon: React.ReactNode }> = {
  config: { label: 'Configuração', icon: <Settings2 size={14} /> },
  test: { label: 'Área de Testes', icon: <FlaskConical size={14} /> },
};

export const AiAgentDetail: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { currentCompany } = useTenant();

  const isNew = agentId === 'new';

  const [agent, setAgent] = useState<AiAgent | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('config');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [toolContext, setToolContext] = useState<ToolContext | null>(null);

  // Form state (lifted so the test panel can read it live)
  const [liveForm, setLiveForm] = useState<AgentFormData>({
    name: '',
    description: '',
    provider: 'openai',
    model: 'gpt-4o-mini',
    system_prompt: '',
    scope: { channels: [], auto_reply: false },
    handoff_keywords: [],
    handoff_after_mins: '',
    is_published: false,
  });

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAgent = useCallback(async () => {
    if (!currentCompany || isNew) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', agentId)
      .eq('company_id', currentCompany.id)
      .single();

    if (error || !data) {
      navigate('/ai-agents');
      return;
    }

    // Mapeia colunas novas (model_provider, model_name, config) para o shape antigo do frontend
    const cfg = (data.config ?? {}) as Record<string, any>;
    const a = {
      ...data,
      provider: data.model_provider ?? 'openai',
      model: data.model_name ?? 'gpt-4o-mini',
      scope: {
        channels: cfg.channels ?? [],
        auto_reply: cfg.auto_reply ?? false,
      },
      handoff_keywords: cfg.handoff_keywords ?? [],
      handoff_after_mins: cfg.handoff_after_mins ?? null,
      is_published: cfg.is_published ?? false,
    } as AiAgent;

    setAgent(a);
    setLiveForm({
      name: a.name,
      description: a.description ?? '',
      provider: a.provider,
      model: a.model,
      system_prompt: a.system_prompt ?? '',
      scope: a.scope,
      handoff_keywords: a.handoff_keywords,
      handoff_after_mins: a.handoff_after_mins?.toString() ?? '',
      is_published: a.is_published,
    });
    setLoading(false);
  }, [currentCompany, agentId, isNew, navigate]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  const fetchToolContext = useCallback(async () => {
    if (!currentCompany) return;

    const [
      schedulesRes,
      serviceTypesRes,
      pipelinesRes,
      teamsRes,
      teamMembersRes,
      productCatalogRes,
    ] = await Promise.all([
      supabase
        .from('schedules')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', currentCompany.id)
        .eq('is_active', true),
      supabase
        .from('service_types')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', currentCompany.id)
        .eq('is_active', true),
      supabase
        .from('pipelines')
        .select('id')
        .eq('company_id', currentCompany.id),
      supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', currentCompany.id),
      supabase
        .from('user_companies')
        .select('user_id', { count: 'exact', head: true })
        .eq('company_id', currentCompany.id),
      supabase
        .from('product_catalog')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', currentCompany.id)
        .eq('is_active', true),
    ]);

    const pipelineIds = (pipelinesRes.data ?? []).map((pipeline) => pipeline.id);
    const pipelineStagesRes = pipelineIds.length > 0
      ? await supabase
          .from('pipeline_stages')
          .select('id', { count: 'exact', head: true })
          .in('pipeline_id', pipelineIds)
      : { count: 0 };

    setToolContext({
      schedulesConfigured: (schedulesRes.count ?? 0) > 0,
      serviceTypesConfigured: (serviceTypesRes.count ?? 0) > 0,
      pipelineConfigured: pipelineIds.length > 0 && (pipelineStagesRes.count ?? 0) > 0,
      teamsConfigured: (teamsRes.count ?? 0) > 0 && (teamMembersRes.count ?? 0) > 0,
      mediaStorageConfigured: true,
      knowledgeProviderConfigured: false,
      productCatalogConfigured: (productCatalogRes.count ?? 0) > 0,
    });
  }, [currentCompany]);

  useEffect(() => {
    fetchToolContext();
  }, [fetchToolContext]);

  const handleSave = async (form: AgentFormData) => {
    if (!currentCompany) return;
    setSaving(true);
    setLiveForm(form);

    const { data } = await supabase.rpc('rpc_save_ai_agent', {
      p_company_id: currentCompany.id,
      p_name: form.name,
      p_description: form.description || null,
      p_provider: form.provider,
      p_model: form.model,
      p_system_prompt: form.system_prompt || null,
      p_scope: form.scope,
      p_handoff_keywords: form.handoff_keywords,
      p_handoff_after_mins: form.handoff_after_mins ? parseInt(form.handoff_after_mins) : null,
      p_is_published: form.is_published,
      p_agent_id: isNew ? null : agentId,
    });

    if (data?.success) {
      showToast('success', isNew ? 'Agente criado com sucesso!' : 'Agente atualizado.');
      if (isNew && data.agent_id) {
        navigate(`/ai-agents/${data.agent_id}`, { replace: true });
      } else {
        fetchAgent();
      }
    } else {
      showToast('error', data?.error ?? 'Erro ao salvar agente.');
    }
    setSaving(false);
  };

  const handleToggleActive = async () => {
    if (!agent || toggling) return;
    setToggling(true);

    const { data } = await supabase.rpc('rpc_toggle_ai_agent', {
      p_agent_id: agent.id,
      p_is_active: !agent.is_active,
    });

    if (data?.success) {
      setAgent((a) => (a ? { ...a, is_active: !a.is_active } : a));
      showToast('success', agent.is_active ? 'Agente desativado.' : 'Agente ativado!');
    }
    setToggling(false);
  };

  const handleDelete = async () => {
    if (!agent || deleting) return;
    if (!confirm(`Deseja excluir o agente "${agent.name}"? Esta ação não pode ser desfeita.`))
      return;

    setDeleting(true);
    const { error } = await supabase.from('ai_agents').delete().eq('id', agent.id);

    if (!error) {
      navigate('/ai-agents');
    } else {
      showToast('error', 'Erro ao excluir agente.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-base">
        <Loader2 size={28} className="animate-spin text-stone-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg-base overflow-hidden">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-8 py-4 border-b border-border bg-background flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/ai-agents"
            className="text-stone-500 hover:text-primary transition-colors p-1 rounded hover:bg-surface"
          >
            <ChevronLeft size={20} />
          </Link>
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                agent?.is_active
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                  : 'bg-stone-800 border-border text-stone-500'
              }`}
            >
              <Bot size={18} />
            </div>
            <div>
              <h1 className="text-base font-bold text-primary leading-tight">
                {isNew ? 'Novo Agente' : (agent?.name ?? '—')}
              </h1>
              {!isNew && agent && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider flex items-center gap-1 ${
                      agent.is_active ? 'text-emerald-400' : 'text-stone-500'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        agent.is_active ? 'bg-emerald-400' : 'bg-stone-600'
                      }`}
                    />
                    {agent.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                  {!agent.is_published && (
                    <span className="text-[10px] font-mono uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                      Rascunho
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Header actions (only for existing agents) */}
        {!isNew && agent && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleActive}
              disabled={toggling}
              className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
                agent.is_active
                  ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                  : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
              } disabled:opacity-50`}
            >
              {toggling ? (
                <Loader2 size={14} className="animate-spin" />
              ) : agent.is_active ? (
                <ZapOff size={14} />
              ) : (
                <Zap size={14} />
              )}
              {agent.is_active ? 'Desativar' : 'Ativar'}
            </button>

            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Excluir agente"
              className="p-2 text-stone-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-border bg-background">
        {(Object.entries(TAB_LABELS) as [TabId, { label: string; icon: React.ReactNode }][]).map(
          ([id, { label, icon }]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === id
                  ? 'text-primary border-primary'
                  : 'text-text-muted border-transparent hover:text-primary'
              }`}
            >
              {icon}
              {label}
              {id === 'test' && !isNew && (
                <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 py-0.5 rounded font-mono uppercase tracking-wider">
                  Sandbox
                </span>
              )}
            </button>
          )
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'config' ? (
          <div className="h-full overflow-y-auto custom-scrollbar px-8 py-6 max-w-5xl">
            <AgentForm
              initial={agent ?? undefined}
              onChange={setLiveForm}
              onSave={(form) => {
                setLiveForm(form);
                return handleSave(form);
              }}
              saving={saving}
              toolsSlot={
                !isNew && agent && currentCompany ? (
                  <AgentToolGrid
                    agentId={agent.id}
                    companyId={currentCompany.id}
                    context={toolContext}
                  />
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="h-full">
            {isNew ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <FlaskConical size={32} className="text-stone-600 mb-4" />
                <p className="text-sm text-stone-500">
                  Salve o agente primeiro para acessar a área de testes.
                </p>
              </div>
            ) : (
              <AgentTestPanel form={liveForm} agentName={liveForm.name || agent?.name || ''} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
