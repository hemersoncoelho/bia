import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { WhatsAppConnectModal } from '../../components/Integrations/WhatsAppConnectModal';
import { uazapiService } from '../../services/uazapiService';
import type { IntegrationStatus as UazapiStatus } from '../../services/uazapiService';
import {
  Plug,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Settings,
  Zap,
} from 'lucide-react';

type IntegrationStatus = 'connected' | 'disconnected' | 'pending';

interface Integration {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  category: 'messaging' | 'email' | 'social' | 'api';
  icon: string;
  color: string;
}

// Status vem do banco quando houver tabela de integrações.
// Por ora, todas desconectadas — sem dados fake.
const INTEGRATIONS: Integration[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Atendimento via WhatsApp com API oficial da Meta.',
    status: 'disconnected',
    category: 'messaging',
    icon: '💬',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'email',
    name: 'E-mail',
    description: 'Integre caixas de entrada SMTP/IMAP ou Google Workspace.',
    status: 'disconnected',
    category: 'email',
    icon: '✉️',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  {
    id: 'instagram',
    name: 'Instagram Direct',
    description: 'Responda mensagens diretas do Instagram pelo Inbox.',
    status: 'disconnected',
    category: 'social',
    icon: '📸',
    color: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  },
  {
    id: 'webchat',
    name: 'Webchat',
    description: 'Widget de chat ao vivo para seu site ou landing page.',
    status: 'disconnected',
    category: 'messaging',
    icon: '🌐',
    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Conecte seu bot do Telegram ao atendimento.',
    status: 'disconnected',
    category: 'messaging',
    icon: '✈️',
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  },
  {
    id: 'api',
    name: 'API / Webhook',
    description: 'Integre sistemas externos via REST API ou webhooks.',
    status: 'disconnected',
    category: 'api',
    icon: '⚡',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
];

const STATUS_CONFIG: Record<IntegrationStatus, { label: string; icon: React.ReactNode; cls: string }> = {
  connected: {
    label: 'Conectado',
    icon: <CheckCircle2 size={12} />,
    cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  disconnected: {
    label: 'Desconectado',
    icon: <XCircle size={12} />,
    cls: 'text-stone-500 bg-white/5 border-white/10',
  },
  pending: {
    label: 'Pendente',
    icon: <Clock size={12} />,
    cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
};

const CATEGORY_LABELS: Record<Integration['category'], string> = {
  messaging: 'Mensageria',
  email: 'E-mail',
  social: 'Redes Sociais',
  api: 'API & Webhooks',
};

export const IntegrationsPage: React.FC = () => {
  const { currentCompany } = useTenant();
  const [activeCategory, setActiveCategory] = useState<'all' | Integration['category']>('all');
  const [waStatus, setWaStatus] = useState<UazapiStatus>('disconnected');
  const [isWppModalOpen, setIsWppModalOpen] = useState(false);

  useEffect(() => {
    if (currentCompany) {
      loadStatus();
    }
  }, [currentCompany]);

  const loadStatus = async () => {
     try {
       const res = await uazapiService.getStatus(currentCompany!.id);
       setWaStatus(res.status || 'disconnected');
     } catch (err) {
       // 401 = sessão expirada ou JWT inválido; outros erros = falha na função
       // Mantém 'disconnected' para não quebrar a página
       console.warn("Status WhatsApp não disponível:", err);
       setWaStatus('disconnected');
     }
  };

  if (!currentCompany) return null;

  const categories: Array<'all' | Integration['category']> = ['all', 'messaging', 'email', 'social', 'api'];

  const dynamicIntegrations = INTEGRATIONS.map(int => {
    if (int.id === 'whatsapp') {
      let mappedStatus: IntegrationStatus = 'disconnected';
      if (waStatus === 'connected') mappedStatus = 'connected';
      if (waStatus === 'connecting') mappedStatus = 'pending';
      return { ...int, status: mappedStatus };
    }
    return int;
  });

  const filtered =
    activeCategory === 'all'
      ? dynamicIntegrations
      : dynamicIntegrations.filter((i) => i.category === activeCategory);

  const connectedCount = dynamicIntegrations.filter((i) => i.status === 'connected').length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-3">
            <Plug size={24} className="text-stone-500" />
            Integrações
          </h1>
          <p className="text-text-muted mt-1">
            Conecte canais e sistemas externos à operação de {currentCompany.name}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider ${
            connectedCount > 0
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-white/5 border border-border text-stone-500'
          }`}>
            <CheckCircle2 size={14} />
            {connectedCount > 0 ? `${connectedCount} conectada${connectedCount !== 1 ? 's' : ''}` : 'Nenhuma conectada'}
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-surface text-primary border border-border'
                : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            {cat === 'all' ? 'Todas' : CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Integration cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((integration) => (
          <IntegrationCard 
             key={integration.id} 
             integration={integration} 
             onConnect={() => {
                if (integration.id === 'whatsapp') setIsWppModalOpen(true);
             }}
          />
        ))}
      </div>

      <WhatsAppConnectModal 
         isOpen={isWppModalOpen} 
         onClose={() => setIsWppModalOpen(false)} 
         onSuccess={loadStatus} 
      />

      {/* Docs / Help section */}
      <div className="glass-panel p-6 rounded-2xl border border-dashed border-border flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <Zap size={24} className="text-amber-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-primary">Precisa de uma integração customizada?</h3>
          <p className="text-xs text-text-muted mt-1">
            Use nossa API REST ou configure webhooks para integrar qualquer sistema externo.
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-stone-400 hover:text-primary hover:border-stone-500 transition-colors shrink-0">
          Ver documentação
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

const IntegrationCard: React.FC<{ integration: Integration; onConnect: () => void }> = ({ integration, onConnect }) => {
  const statusCfg = STATUS_CONFIG[integration.status];

  return (
    <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5 hover:border-stone-600 transition-all group">
      {/* Icon + status */}
      <div className="flex items-start justify-between">
        <div className={`w-12 h-12 rounded-xl border flex items-center justify-center text-2xl ${integration.color}`}>
          {integration.icon}
        </div>
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-mono uppercase tracking-wider ${statusCfg.cls}`}
        >
          {statusCfg.icon}
          {statusCfg.label}
        </div>
      </div>

      {/* Info */}
      <div>
        <h3 className="text-base font-semibold text-primary group-hover:text-white transition-colors">
          {integration.name}
        </h3>
        <p className="text-sm text-text-muted mt-1 leading-relaxed">{integration.description}</p>
      </div>

      {/* Action */}
      <div className="mt-auto pt-4 border-t border-border">
        {integration.status === 'connected' ? (
          <button 
             onClick={onConnect}
             className="flex items-center gap-2 text-xs text-stone-400 hover:text-primary transition-colors"
          >
            <Settings size={14} />
            Gerenciar configuração
          </button>
        ) : (
          <button 
             onClick={onConnect}
             title={integration.id !== 'whatsapp' ? 'Em breve' : ''}
             disabled={integration.id !== 'whatsapp'}
             className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-stone-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plug size={14} />
            {integration.status === 'pending' ? 'Continuar configuração' : 'Conectar'}
          </button>
        )}
      </div>
    </div>
  );
};
