import React from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { useCompanySummary } from '../../hooks/useCompanySummary';
import {
  Users,
  UserPlus,
  Settings,
  MessageSquare,
  UsersRound,
  Bot,
  PlusCircle,
  ArrowRight,
  TrendingUp,
  Plug,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const CompanyHome: React.FC = () => {
  const { currentCompany } = useTenant();
  const navigate = useNavigate();
  const { data: summary, loading } = useCompanySummary(currentCompany?.id ?? null);

  if (!currentCompany) return null;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Bem-vindo, <span className="text-stone-400">{currentCompany.name}</span>
          </h1>
          <p className="text-text-muted mt-1">Configuração e visão geral da sua operação comercial.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/inbox')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-background rounded-lg text-sm font-medium hover:bg-stone-200 transition-colors"
          >
            <MessageSquare size={18} />
            Abrir Inbox
          </button>
        </div>
      </div>

      {/* Setup / Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-2xl md:col-span-2">
          <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-stone-500 mb-6 flex items-center gap-2">
            <Settings size={14} />
            Setup da Operação
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <QuickActionCard
              icon={<UserPlus size={20} className="text-blue-400" />}
              title="Adicionar Membro"
              description="Convide sua equipe para a plataforma"
              onClick={() => navigate('/members')}
            />
            <QuickActionCard
              icon={<PlusCircle size={20} className="text-emerald-400" />}
              title="Criar Time"
              description="Organize membros em times de atendimento"
              onClick={() => navigate('/teams')}
            />
            <QuickActionCard
              icon={<Bot size={20} className="text-purple-400" />}
              title="Configurar IA"
              description="Crie e treine seus agentes de atendimento"
              onClick={() => navigate('/ai-agents')}
            />
            <QuickActionCard
              icon={<Plug size={20} className="text-amber-400" />}
              title="Integrações"
              description="Conecte WhatsApp, E-mail, Instagram e APIs"
              onClick={() => navigate('/integrations')}
            />
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex flex-col">
          <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-stone-500 mb-6 flex items-center gap-2">
            <TrendingUp size={14} />
            Resumo Rápido
          </h2>
          <div className="space-y-6 flex-1">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 bg-white/5 rounded animate-pulse" />
                ))}
              </div>
            ) : summary ? (
              <>
                <MetricRow label="Membros" value={summary.totalMembers.toString()} icon={<Users size={16} />} />
                <MetricRow label="Times" value={summary.totalTeams.toString()} icon={<UsersRound size={16} />} />
                <MetricRow label="Conversas Abertas" value={summary.openConversations.toString()} icon={<MessageSquare size={16} />} />
                <MetricRow label="Deals em Aberto" value={formatCurrency(summary.openDealsValue)} icon={<TrendingUp size={16} />} />
              </>
            ) : (
              <div className="text-sm text-stone-500">Sem dados</div>
            )}
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-6 w-full py-2 text-xs font-mono uppercase tracking-widest text-stone-400 hover:text-white transition-colors flex items-center justify-center gap-2 border border-border border-dashed rounded-lg"
          >
            Ver Dashboard Analítico
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Membros Recentes + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-stone-500">Membros Recentes</h2>
            <button onClick={() => navigate('/members')} className="text-xs text-stone-400 hover:text-primary transition-colors">
              Ver todos
            </button>
          </div>
          <div className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : summary?.recentMembers && summary.recentMembers.length > 0 ? (
              summary.recentMembers.slice(0, 5).map((m) => (
                <MemberItem key={m.id} name={m.full_name} role={m.role} />
              ))
            ) : (
              <p className="text-sm text-stone-500 italic">Nenhum membro na equipe</p>
            )}
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-stone-500">Pipeline Comercial</h2>
            <button onClick={() => navigate('/deals')} className="text-xs text-stone-400 hover:text-primary transition-colors">
              Ir para Pipeline
            </button>
          </div>
          <div className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />
                ))}
              </div>
            ) : summary?.pipelineStages && summary.pipelineStages.length > 0 ? (
              summary.pipelineStages.map((s) => (
                <PipelineStageRow
                  key={s.stage_name}
                  label={s.stage_name}
                  count={s.deal_count}
                  color={s.color ?? '#3B82F6'}
                />
              ))
            ) : (
              <p className="text-sm text-stone-500 italic">Nenhum estágio configurado</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const QuickActionCard: React.FC<{ icon: React.ReactNode; title: string; description: string; onClick: () => void }> = ({
  icon,
  title,
  description,
  onClick,
}) => (
  <button
    onClick={onClick}
    className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/[0.08] transition-all text-left group"
  >
    <div className="mt-1 p-2 rounded-lg bg-background border border-border group-hover:scale-110 transition-transform">
      {icon}
    </div>
    <div>
      <h3 className="text-sm font-medium text-primary group-hover:text-white transition-colors">{title}</h3>
      <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{description}</p>
    </div>
  </button>
);

const MetricRow: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3 text-stone-400">
      <div className="p-1.5 rounded-md bg-white/5">{icon}</div>
      <span className="text-sm">{label}</span>
    </div>
    <span className="text-lg font-semibold text-primary">{value}</span>
  </div>
);

const MemberItem: React.FC<{ name: string; role: string }> = ({ name, role }) => (
  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center text-xs font-bold text-stone-500">
        {name.charAt(0)}
      </div>
      <div>
        <h4 className="text-sm font-medium text-stone-200">{name}</h4>
        <p className="text-[10px] text-stone-500 font-mono uppercase tracking-wider">{role}</p>
      </div>
    </div>
  </div>
);

const PipelineStageRow: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => {
  const maxVal = 30;
  const width = Math.min(100, (count / maxVal) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[11px] font-mono uppercase tracking-wider">
        <span className="text-stone-400">{label}</span>
        <span className="text-stone-200">{count}</span>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
};
