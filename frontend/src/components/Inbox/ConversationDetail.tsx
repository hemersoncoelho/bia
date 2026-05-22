import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  UserCheck,
  CheckCircle2,
  DollarSign,
  Plus,
  X,
  StickyNote,
  Bot,
  User,
  Zap,
  ZapOff,
  ChevronDown,
  MessageSquare,
  ChevronsRight,
  ChevronsLeft,
  Trophy,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getAttendeeTextColor } from '../../utils/attendeeColors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { Timeline } from './Timeline';
import { Composer } from './Composer';
import { NotesList } from '../Notes/NotesList';
import { useFollowUpState } from '../../hooks/useFollowUpState';
import { FollowUpPanel } from '../FollowUp/FollowUpPanel';
import type { Task, TaskStatus, AiAgent, AttendanceMode, Message, Deal, DealStatus } from '../../types';

type LinkedDeal = Pick<Deal, 'id' | 'title' | 'amount' | 'status' | 'loss_reason' | 'closed_at'>;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Aberta',
  in_progress: 'Em Andamento',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

const STATUS_DOT: Record<TaskStatus, string> = {
  open: 'bg-blue-400',
  in_progress: 'bg-amber-400',
  done: 'bg-emerald-400',
  cancelled: 'bg-stone-500',
};

const MODE_CONFIG: Record<
  AttendanceMode,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  human: {
    label: 'Humano',
    color: 'text-stone-300',
    bg: 'bg-stone-700/50',
    border: 'border-stone-600',
    icon: <User size={11} />,
  },
  ai: {
    label: 'IA',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/15',
    border: 'border-indigo-500/30',
    icon: <Bot size={11} />,
  },
  hybrid: {
    label: 'Híbrido',
    color: 'text-violet-400',
    bg: 'bg-violet-500/15',
    border: 'border-violet-500/30',
    icon: <Zap size={11} />,
  },
};

// ── Collapsible Section ───────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  label: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  label,
  icon,
  defaultOpen = true,
  action,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/60 last:border-b-0">
      {/* Header row — entire row is the toggle target */}
      <div
        role="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 pt-4 pb-2 cursor-pointer select-none group"
      >
        {icon && (
          <span className="text-stone-500 group-hover:text-stone-400 transition-colors shrink-0">
            {icon}
          </span>
        )}
        <span className="text-[11px] font-semibold text-stone-500 group-hover:text-stone-300 transition-colors uppercase tracking-wider flex-1 min-w-0 truncate">
          {label}
        </span>
        <ChevronDown
          size={12}
          className={cn(
            'text-stone-600 group-hover:text-stone-400 transition-all duration-200 shrink-0',
            !open && '-rotate-90'
          )}
        />
        {action && (
          <div className="shrink-0" onClick={e => e.stopPropagation()}>
            {action}
          </div>
        )}
      </div>

      {/* Animated content */}
      <div
        className={cn(
          'grid transition-all duration-200 ease-in-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
};

// ── Transfer Button ───────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  full_name: string;
}

interface TransferButtonProps {
  companyId: string;
  onTransfer: (userId: string, userName?: string) => void;
}

const TransferButton: React.FC<TransferButtonProps> = ({ companyId, onTransfer }) => {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const fetchMembers = useCallback(async () => {
    if (members.length > 0) return;
    setLoading(true);
    // Usa company_memberships como fonte canônica (pós-consolidação Etapa 2)
    const { data: memberships } = await supabase
      .from('company_memberships')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('status', 'active');

    if (memberships?.length) {
      const ids = memberships.map((m) => m.user_id).filter(Boolean);
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', ids);
      if (profiles) {
        setMembers(profiles.map((p) => ({ id: p.id, full_name: p.full_name || 'Usuário' })));
      }
    }
    setLoading(false);
  }, [companyId, members.length]);

  const handleOpen = () => {
    setOpen(v => !v);
    fetchMembers();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className={cn(
          'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
          open
            ? 'text-text-main bg-surface border border-border'
            : 'text-text-muted hover:text-text-main hover:bg-surface'
        )}
        title="Transferir conversa"
      >
        <UserCheck size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-52 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                Transferir conversa
              </span>
            </div>
            {loading ? (
              <div className="px-3 py-3 text-[11px] text-stone-600">Carregando...</div>
            ) : members.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-stone-600">Nenhum membro encontrado</div>
            ) : (
              <div className="py-1">
                {members.map((m) => {
                  const initials = m.full_name
                    .split(' ')
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase();
                  return (
                    <button
                      key={m.id}
                      onClick={() => { onTransfer(m.id, m.full_name); setOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-main hover:bg-surface-hover transition-colors text-left"
                    >
                      <span className="w-6 h-6 rounded-full bg-surface-hover border border-border text-text-muted text-[10px] font-semibold flex items-center justify-center shrink-0">
                        {initials}
                      </span>
                      <span className="truncate">{m.full_name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Mini Task Card ────────────────────────────────────────────────────────────

interface MiniTaskProps {
  task: Task;
  onStatusChange: (id: string, status: TaskStatus) => void;
}

const MiniTask: React.FC<MiniTaskProps> = ({ task, onStatusChange }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isDone = task.status === 'done' || task.status === 'cancelled';
  const isOverdue =
    task.due_at &&
    task.status !== 'done' &&
    task.status !== 'cancelled' &&
    new Date(task.due_at) < new Date();

  const formatDue = (iso?: string) => {
    if (!iso) return null;
    const date = new Date(iso);
    const diffDays = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Vencida';
    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Amanhã';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const statusOptions: TaskStatus[] = ['open', 'in_progress', 'done', 'cancelled'];

  return (
    <div className={`flex gap-2.5 py-2 ${isDone ? 'opacity-40' : ''}`}>
      <div className="relative mt-0.5 shrink-0">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="Alterar status"
          className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
            task.status === 'done'
              ? 'bg-emerald-500 border-emerald-500'
              : task.status === 'in_progress'
              ? 'border-amber-400'
              : 'border-stone-500 hover:border-primary'
          }`}
        >
          {task.status === 'done' && <CheckCircle2 size={10} className="text-white" />}
          {task.status === 'in_progress' && (
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          )}
          {task.status === 'cancelled' && <X size={8} className="text-stone-500" />}
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-5 left-0 z-20 bg-background border border-border rounded-lg shadow-xl py-1 w-36">
              {statusOptions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    onStatusChange(task.id, s);
                    setMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-surface flex items-center gap-2 ${
                    task.status === s ? 'text-primary' : 'text-text-muted'
                  }`}
                >
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={`text-xs font-medium leading-tight ${
            isDone ? 'line-through text-text-muted' : 'text-primary'
          }`}
        >
          {task.title}
        </p>
        {task.due_at && (
          <p
            className={`text-[10px] mt-0.5 font-mono ${
              isOverdue ? 'text-red-400' : 'text-stone-500'
            }`}
          >
            {isOverdue && '⚠ '}
            {formatDue(task.due_at)}
          </p>
        )}
      </div>
    </div>
  );
};

// ── Attendance Mode Badge ─────────────────────────────────────────────────────

interface AttendanceBadgeProps {
  mode: AttendanceMode;
  humanName?: string;
  agentName?: string;
  agentActive?: boolean;
  agents: AiAgent[];
  onChangeMode: (mode: AttendanceMode, agentId?: string) => void;
}

const AttendanceBadge: React.FC<AttendanceBadgeProps> = ({
  mode,
  humanName,
  agentName,
  agentActive,
  agents,
  onChangeMode,
}) => {
  const [open, setOpen] = useState(false);
  const cfg = MODE_CONFIG[mode];

  const displayLabel =
    mode === 'human' && humanName
      ? humanName.split(' ')[0]
      : mode === 'ai' && agentName
      ? agentName
      : cfg.label;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Modo de atendimento"
        className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${cfg.bg} ${cfg.border} ${cfg.color}`}
      >
        {cfg.icon}
        {displayLabel}
        {mode === 'ai' && agentActive === false && (
          <span className="text-[9px] text-amber-400 font-mono uppercase">(inativo)</span>
        )}
        <ChevronDown size={11} className="opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-8 left-0 z-20 bg-background border border-border rounded-xl shadow-2xl py-2 w-64">
            <div className="px-3 pb-1.5 pt-0.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                Modo de Atendimento
              </span>
            </div>

            {/* Human */}
            <button
              onClick={() => {
                onChangeMode('human');
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-surface ${
                mode === 'human' ? 'text-primary' : 'text-text-muted'
              }`}
            >
              <User size={14} className="text-stone-400" />
              <div className="text-left">
                <div className="font-medium text-sm">Humano</div>
                <div className="text-[10px] text-stone-500">Agente responde manualmente</div>
              </div>
              {mode === 'human' && <CheckCircle2 size={14} className="text-emerald-400 ml-auto" />}
            </button>

            {/* AI — only if there are active agents */}
            {agents.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] font-mono text-stone-600 uppercase tracking-wider">
                    Transferir para IA
                  </span>
                </div>
                {agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      onChangeMode('ai', a.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-surface ${
                      mode === 'ai' && agentName === a.name ? 'text-indigo-400' : 'text-text-muted'
                    }`}
                  >
                    <Bot size={14} className="text-indigo-400 shrink-0" />
                    <div className="text-left min-w-0">
                      <div className="font-medium text-sm truncate">{a.name}</div>
                      <div className="text-[10px] text-stone-500 truncate">
                        {a.model} · {a.is_active ? 'Ativo' : 'Inativo'}
                      </div>
                    </div>
                    {!a.is_active && (
                      <span className="text-[9px] text-amber-400 font-mono uppercase ml-auto shrink-0">
                        inativo
                      </span>
                    )}
                  </button>
                ))}

                {/* Hybrid */}
                <div className="border-t border-border mt-1 pt-1">
                  <button
                    onClick={() => {
                      onChangeMode('hybrid');
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-surface ${
                      mode === 'hybrid' ? 'text-violet-400' : 'text-text-muted'
                    }`}
                  >
                    <Zap size={14} className="text-violet-400" />
                    <div className="text-left">
                      <div className="font-medium text-sm">Híbrido</div>
                      <div className="text-[10px] text-stone-500">
                        IA assiste, humano supervisiona
                      </div>
                    </div>
                    {mode === 'hybrid' && (
                      <CheckCircle2 size={14} className="text-emerald-400 ml-auto" />
                    )}
                  </button>
                </div>
              </>
            )}

            {agents.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-stone-500 flex items-center gap-2">
                <Bot size={12} />
                <span>
                  Nenhum agente configurado.{' '}
                  <a href="/ai-agents" className="text-indigo-400 hover:underline">
                    Criar agente
                  </a>
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── ConversationDetail ────────────────────────────────────────────────────────

interface ConversationDetailProps {
  conversation: any;
  onConversationUpdate?: () => void;
  initialSendError?: string;
  onInitialSendErrorDismissed?: () => void;
}

type SidebarTab = 'context' | 'notes';

export const ConversationDetail: React.FC<ConversationDetailProps> = ({
  conversation,
  onConversationUpdate,
  initialSendError,
  onInitialSendErrorDismissed,
}) => {
  const { user } = useAuth();
  const { currentCompany } = useTenant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [oldestMsgAt, setOldestMsgAt] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('context');
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (initialSendError && conversation?.conversation_id) {
      setSendError(initialSendError);
    }
  }, [initialSendError, conversation?.conversation_id]);

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showQuickTask, setShowQuickTask] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  // Linked deal (deal vinculado à conversa para ações de ganho/perda)
  const [linkedDeal, setLinkedDeal] = useState<LinkedDeal | null>(null);
  const [linkedDealLoading, setLinkedDealLoading] = useState(false);
  const [dealCloseMode, setDealCloseMode] = useState<null | 'won' | 'lost'>(null);
  const [dealLossReason, setDealLossReason] = useState('');
  const [dealClosing, setDealClosing] = useState(false);
  const [dealCloseError, setDealCloseError] = useState<string | null>(null);

  // AI Agents
  const [availableAgents, setAvailableAgents] = useState<AiAgent[]>([]);
  const [currentMode, setCurrentMode] = useState<AttendanceMode>(
    conversation?.attendance_mode ?? 'human'
  );
  const [handoffLoading, setHandoffLoading] = useState(false);

  // Sync mode from conversation prop
  useEffect(() => {
    setCurrentMode(conversation?.attendance_mode ?? 'human');
  }, [conversation?.attendance_mode]);

  // Follow-up state
  const {
    data: followUpData,
    history: followUpHistory,
    isLoading: followUpLoading,
    error: followUpError,
    stopCycle: stopFollowUpCycle,
  } = useFollowUpState({
    contactId: conversation?.contact_id ?? null,
    conversationId: conversation?.conversation_id ?? null,
  });

  const handleStopFollowUpCycle = async () => {
    await stopFollowUpCycle('manual_cancel');
  };

  // Fetch available published agents for handoff dropdown
  const fetchAgents = useCallback(async () => {
    if (!currentCompany) return;
    const { data } = await supabase
      .from('ai_agents')
      .select('id, company_id, name, model_provider, model_name, system_prompt, config, is_active, created_at, updated_at')
      .eq('company_id', currentCompany.id)
      .order('name');
    if (data) {
      setAvailableAgents(
        data
          .map((a) => {
            const cfg = (a.config ?? {}) as Record<string, any>;
            return {
              ...a,
              provider: (a.model_provider ?? 'openai') as AiAgent['provider'],
              model: a.model_name ?? 'gpt-4o-mini',
              scope: {
                channels: cfg.channels ?? [],
                auto_reply: cfg.auto_reply ?? false,
              },
              handoff_keywords: cfg.handoff_keywords ?? [],
              handoff_after_mins: cfg.handoff_after_mins ?? null,
              // is_published vive apenas no config JSONB (não é coluna top-level)
              is_published: (cfg.is_published as boolean) ?? false,
            };
          })
          // Filtra client-side: só agentes publicados aparecem no dropdown
          .filter((a) => a.is_published) as AiAgent[]
      );
    }
  }, [currentCompany]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // ── Deal vinculado: fetch + win/loss handlers ──────────────────────────────

  const fetchLinkedDeal = useCallback(async () => {
    if (!conversation?.conversation_id || !currentCompany) return;
    setLinkedDealLoading(true);
    try {
      // Busca pelo conversation_id (link direto)
      const { data: byConv } = await supabase
        .from('deals')
        .select('id, title, amount, status, loss_reason, closed_at')
        .eq('company_id', currentCompany.id)
        .eq('conversation_id', conversation.conversation_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byConv) {
        setLinkedDeal(byConv as LinkedDeal);
        return;
      }

      // Fallback: contact_id com status open
      if (conversation.contact_id) {
        const { data: byContact } = await supabase
          .from('deals')
          .select('id, title, amount, status, loss_reason, closed_at')
          .eq('company_id', currentCompany.id)
          .eq('contact_id', conversation.contact_id)
          .eq('status', 'open')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setLinkedDeal((byContact as LinkedDeal) ?? null);
      } else {
        setLinkedDeal(null);
      }
    } finally {
      setLinkedDealLoading(false);
    }
  }, [conversation?.conversation_id, conversation?.contact_id, currentCompany]);

  useEffect(() => {
    setLinkedDeal(null);
    setDealCloseMode(null);
    setDealLossReason('');
    setDealCloseError(null);
    fetchLinkedDeal();
  }, [conversation?.conversation_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDealWon = async () => {
    if (!currentCompany || !linkedDeal) return;
    setDealClosing(true);
    setDealCloseError(null);
    try {
      const { data, error } = await supabase.rpc('rpc_mark_deal_won', {
        p_deal_id: linkedDeal.id,
        p_company_id: currentCompany.id,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Falha ao marcar como ganho');
      setLinkedDeal(prev => prev
        ? { ...prev, status: 'won' as DealStatus, closed_at: data.closed_at ?? new Date().toISOString(), loss_reason: null }
        : null
      );
      setDealCloseMode(null);
      onConversationUpdate?.();
    } catch (err: any) {
      setDealCloseError(err.message || 'Erro ao marcar como ganho.');
    } finally {
      setDealClosing(false);
    }
  };

  const handleDealLost = async () => {
    if (!currentCompany || !linkedDeal) return;
    setDealClosing(true);
    setDealCloseError(null);
    try {
      const { data, error } = await supabase.rpc('rpc_mark_deal_lost', {
        p_deal_id: linkedDeal.id,
        p_company_id: currentCompany.id,
        p_loss_reason: dealLossReason.trim() || null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Falha ao marcar como perdido');
      setLinkedDeal(prev => prev
        ? {
            ...prev,
            status: 'lost' as DealStatus,
            closed_at: data.closed_at ?? new Date().toISOString(),
            loss_reason: (data.loss_reason ?? dealLossReason.trim()) || null,
          }
        : null
      );
      setDealCloseMode(null);
      setDealLossReason('');
      onConversationUpdate?.();
    } catch (err: any) {
      setDealCloseError(err.message || 'Erro ao marcar como perdido.');
    } finally {
      setDealClosing(false);
    }
  };

  // Normaliza uma linha de mensagem do banco para o tipo Message do frontend
  const normalizeMessage = useCallback((m: any): Message => {
    let senderType = (m.sender_type ?? 'agent') as string;
    // DB armazena 'user' para mensagens de agente humano
    if (senderType === 'user') senderType = 'agent';
    return {
      id: String(m.public_id ?? m.id),
      conversation_id: m.conversation_id,
      sender_type: senderType as any,
      sender_id: m.sender_user_id ?? m.sender_id ?? null,
      body: m.body ?? '',
      message_type: m.message_type ?? 'text',
      media_url: m.media_url ?? null,
      media_mime_type: m.media_mime_type ?? null,
      media_filename: m.media_filename ?? null,
      metadata: m.metadata ?? null,
      status: m.status ?? 'sent',
      is_internal: m.is_internal ?? false,
      ai_agent_id: m.ai_agent_id ?? null,
      ai_agent_name: m.ai_agent_name ?? null,
      created_at: m.created_at,
      sender_name: m._sender_name ?? (m.sender_profile as any)?.full_name ?? null,
    };
  }, []);

  const MSG_PAGE_SIZE = 50;

  const MSG_COLS = [
    'id', 'public_id', 'conversation_id', 'direction', 'message_type',
    'sender_type', 'sender_user_id', 'body', 'media_url', 'media_mime_type',
    'media_filename', 'metadata', 'status', 'is_internal',
    'ai_agent_id', 'ai_agent_name', 'created_at',
  ].join(', ');

  const enrichWithNames = useCallback(async (rows: any[]): Promise<Message[]> => {
    const senderIds = [...new Set(rows.map((m) => m.sender_user_id).filter(Boolean))];
    let nameMap: Record<string, string> = {};
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', senderIds);
      if (profiles) {
        nameMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
      }
    }
    return rows.map((m) => normalizeMessage({ ...m, _sender_name: nameMap[m.sender_user_id] ?? null }));
  }, [normalizeMessage]);

  const handleLoadMore = useCallback(async (conversationId: string) => {
    if (!oldestMsgAt || loadingMore) return;
    setLoadingMore(true);
    const { data } = await supabase
      .from('messages')
      .select(MSG_COLS)
      .eq('conversation_id', conversationId)
      .lt('created_at', oldestMsgAt)
      .order('created_at', { ascending: false })
      .limit(MSG_PAGE_SIZE);
    if (data && data.length > 0) {
      const older = await enrichWithNames([...data].reverse());
      setMessages((prev) => [...older, ...prev]);
      setHasMoreMessages(data.length === MSG_PAGE_SIZE);
      setOldestMsgAt((data[data.length - 1] as unknown as { created_at: string } | null)?.created_at ?? null);
    } else {
      setHasMoreMessages(false);
    }
    setLoadingMore(false);
  }, [oldestMsgAt, loadingMore, enrichWithNames]);

  // Fetch messages
  useEffect(() => {
    if (!conversation?.conversation_id) return;

    const conversationId = conversation.conversation_id;

    setHasMoreMessages(false);
    setOldestMsgAt(null);

    const fetchMessages = async () => {
      setLoadingMessages(true);

      // Carrega apenas as últimas MSG_PAGE_SIZE mensagens (ordem desc, depois inverte)
      const { data, error } = await supabase
        .from('messages')
        .select(MSG_COLS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(MSG_PAGE_SIZE);

      if (error) {
        console.error('[Messages] fetch error:', error);
      }

      if (!error && data) {
        const rows = [...data].reverse(); // volta para ordem cronológica
        const enriched = await enrichWithNames(rows);
        setMessages(enriched);
        setHasMoreMessages(data.length === MSG_PAGE_SIZE);
        setOldestMsgAt((data[data.length - 1] as unknown as { created_at: string } | null)?.created_at ?? null);
      }
      setLoadingMessages(false);

      if (conversation.unread_count > 0) {
        await supabase.rpc('rpc_mark_conversation_read', {
          p_conversation_id: conversationId,
        });
        if (onConversationUpdate) onConversationUpdate();
      }
    };

    fetchMessages();

    // Realtime: escuta novas mensagens na conversa (inbound do contato)
    const channel = supabase
      .channel(`messages-conv-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as any;
          // Busca o nome do remetente se for mensagem de agente
          if (newMsg.sender_user_id) {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('full_name')
              .eq('id', newMsg.sender_user_id)
              .single();
            if (profile) newMsg._sender_name = profile.full_name;
          }
          const normalized = normalizeMessage(newMsg);
          setMessages((prev) => {
            // Evita duplicata: se já existe mensagem com mesmo id real, ignora
            const realId = String(newMsg.public_id ?? newMsg.id);
            const hasDuplicate = prev.some(
              (m) => m.id === realId && !m.id.startsWith('temp-')
            );
            if (hasDuplicate) return prev;
            // Substitui mensagem temporária se existir (mesmo body + sender_id)
            const tempIdx = prev.findIndex(
              (m) =>
                m.id.startsWith('temp-') &&
                m.body === newMsg.body &&
                m.sender_id === newMsg.sender_user_id
            );
            if (tempIdx >= 0) {
              const next = [...prev];
              next[tempIdx] = normalized;
              return next;
            }
            return [...prev, normalized];
          });
          if (onConversationUpdate) onConversationUpdate();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          const updatedId = String(updated.public_id ?? updated.id);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updatedId ? { ...m, status: updated.status ?? m.status } : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.conversation_id]);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    if (!currentCompany || !conversation?.contact_id) return;
    setLoadingTasks(true);

    const { data } = await supabase
      .from('tasks')
      .select('*, assigned_to_profile:assigned_to(full_name)')
      .eq('company_id', currentCompany.id)
      .eq('contact_id', conversation.contact_id)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(10);

    if (data) {
      setTasks(
        data.map((t) => ({
          id: t.id,
          company_id: t.company_id,
          title: t.title,
          description: t.description,
          due_at: t.due_at,
          status: t.status as TaskStatus,
          assigned_to: t.assigned_to,
          assigned_to_name: (t.assigned_to_profile as any)?.full_name,
          contact_id: t.contact_id,
          conversation_id: t.conversation_id,
          deal_id: t.deal_id,
          created_at: t.created_at,
        }))
      );
    }
    setLoadingTasks(false);
  }, [currentCompany, conversation?.contact_id]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Send message — notas internas via RPC; WhatsApp via webhook n8n (salva + envia UAZAPI)
  const handleSendMessage = async (body: string, isInternal: boolean) => {
    if (!user || !conversation) return;

    setSendError(null);
    const tempId = `temp-${Date.now()}`;
    const newMsg: Message = {
      id: tempId,
      conversation_id: conversation.conversation_id,
      sender_type: 'agent',
      sender_id: user.id,
      body,
      message_type: 'text',
      status: isInternal ? 'sent' : 'queued',
      is_internal: isInternal,
      created_at: new Date().toISOString(),
      sender_name: user.full_name,
    };

    setMessages((prev) => [...prev, newMsg]);

    // Notas internas não vão para o WhatsApp — usa RPC diretamente
    if (isInternal) {
      const { error: rpcError, data: rpcData } = await supabase.rpc('rpc_enqueue_outbound_message', {
        p_conversation_id: conversation.conversation_id,
        p_body: body,
        p_sender_id: user.id,
        p_is_internal: true,
      });

      if (rpcError || !rpcData?.success) {
        console.error('[rpc_enqueue internal] error:', rpcError?.message ?? rpcData?.error);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
        return;
      }

      const realId = rpcData.public_id
        ? String(rpcData.public_id)
        : rpcData.message_id != null
          ? String(rpcData.message_id)
          : tempId;

      if (realId !== tempId) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: realId } : m)));
      }
      setMessages((prev) => prev.map((m) => (m.id === realId ? { ...m, status: 'sent' } : m)));
      if (onConversationUpdate) onConversationUpdate();
      return;
    }

    // Mensagem WhatsApp — n8n cuida do envio via UAZAPI e da persistência no banco
    try {
      const res = await fetch(
        'https://n8n.solucoesai.tech/webhook/sia-one-outbound-human',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: conversation.contact_phone ?? '',
            body,
            company_id: currentCompany!.id,
            conversation_id: conversation.conversation_id,
            sender_name: user.full_name,
            sender_id: user.id,
          }),
        }
      );

      const data = await res.json();

      if (!data.ok) {
        const errMsg = data.error || 'Falha ao enviar no WhatsApp.';
        console.warn('[outbound-human n8n]', errMsg);
        setSendError(errMsg);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
        return;
      }

      // Mantém o tempId como está — o Realtime substituirá pelo id real via match body+sender_id.
      // NÃO substituir aqui pelo id numérico do n8n: o Realtime usa public_id (UUID), causando
      // mismatch e duplicação quando os dois chegam com ids diferentes.
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m)));

      // Se a conversa estava no modo IA, pausar e atribuir ao agente humano que enviou
      if (currentMode !== 'human') {
        // 1. Pausar IA — muda attendance_mode para 'human' e registra ai_paused_at
        supabase
          .rpc('rpc_set_conversation_attendance', {
            p_conversation_id: conversation.conversation_id,
            p_mode: 'human',
            // p_agent_id NÃO é passado: esse parâmetro espera um UUID de ai_agents,
            // não o id do usuário humano. Omitir usa o DEFAULT NULL da RPC.
          })
          .then(({ data: modeData, error: modeError }) => {
            if (modeError) {
              console.warn('[rpc_set_conversation_attendance] erro ao pausar IA:', modeError.message);
              return; // não bloqueia o envio
            }
            if (modeData?.success) setCurrentMode('human');
          });

        // 2. Atribuir conversa ao agente humano que enviou a mensagem (fire-and-forget)
        supabase
          .rpc('rpc_assign_conversation', {
            p_conversation_id: conversation.conversation_id,
            p_user_id: user.id,
          })
          .then(({ error: assignError }) => {
            if (assignError) {
              console.warn('[rpc_assign_conversation] erro ao atribuir conversa:', assignError.message);
            }
          });

        // 3. Vincula o deal ao humano que assumiu o atendimento
        if (linkedDeal?.id) {
          supabase.from('deals').update({ owner_user_id: user.id }).eq('id', linkedDeal.id);
        }
      }
      supabase
        .from('conversations')
        .update({ priority: 'high', updated_at: new Date().toISOString() })
        .eq('id', conversation.conversation_id);

      if (onConversationUpdate) onConversationUpdate();
    } catch (err) {
      console.error('[outbound-human n8n]', err);
      setSendError('Erro de rede ao enviar mensagem.');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
    }
  };

  // Handoff / mode change
  const handleChangeMode = async (mode: AttendanceMode, agentId?: string) => {
    if (!conversation || handoffLoading) return;
    setHandoffLoading(true);

    const { data } = await supabase.rpc('rpc_set_conversation_attendance', {
      p_conversation_id: conversation.conversation_id,
      p_mode: mode,
      p_agent_id: agentId ?? null,
    });

    if (data?.success) {
      setCurrentMode(mode);
      // Quando humano assume o atendimento, vincula o deal a ele
      if (mode === 'human' && user && linkedDeal?.id) {
        supabase.from('deals').update({ owner_user_id: user.id }).eq('id', linkedDeal.id);
      }
      const eventBody =
        mode === 'ai'
          ? 'Atendimento transferido para IA.'
          : mode === 'human'
          ? 'Atendimento retomado por humano.'
          : 'Modo híbrido ativado: IA assistindo o atendimento.';

      const sysMsg: Message = {
        id: `sys-${Date.now()}`,
        conversation_id: conversation.conversation_id,
        sender_type: 'system',
        body: eventBody,
        message_type: 'text',
        status: 'sent',
        is_internal: false,
        ai_agent_id: agentId,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, sysMsg]);
      if (onConversationUpdate) onConversationUpdate();
    }
    setHandoffLoading(false);
  };

  const handleTransfer = async (userId: string, userName?: string) => {
    if (!conversation) return;
    const { data } = await supabase.rpc('rpc_assign_conversation', {
      p_conversation_id: conversation.conversation_id,
      p_user_id: userId,
    });
    if (data?.success !== false) {
      // Vincula o deal ao novo responsável
      if (linkedDeal?.id) {
        supabase.from('deals').update({ owner_user_id: userId }).eq('id', linkedDeal.id);
      }
      const sysMsg: Message = {
        id: `sys-${Date.now()}`,
        conversation_id: conversation.conversation_id,
        sender_type: 'system',
        body: userName
          ? `Conversa transferida para ${userName}.`
          : 'Conversa transferida.',
        message_type: 'text',
        status: 'sent',
        is_internal: false,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, sysMsg]);
      if (onConversationUpdate) onConversationUpdate();
    }
  };

  const handleCloseConversation = async () => {
    if (!conversation) return;
    await supabase.rpc('rpc_close_conversation', {
      p_conversation_id: conversation.conversation_id,
    });
    if (onConversationUpdate) onConversationUpdate();
  };

  const handleTaskStatusChange = async (taskId: string, status: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    await supabase.from('tasks').update({ status }).eq('id', taskId);
  };

  const handleQuickTask = async () => {
    if (!quickTaskTitle.trim() || !currentCompany || !conversation?.contact_id) return;
    setSavingTask(true);

    await supabase.from('tasks').insert({
      company_id: currentCompany.id,
      title: quickTaskTitle.trim(),
      contact_id: conversation.contact_id,
      conversation_id: conversation.conversation_id,
      assigned_to: user?.id || null,
      status: 'open',
    });

    setQuickTaskTitle('');
    setShowQuickTask(false);
    setSavingTask(false);
    fetchTasks();
  };

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-center p-12">
        <div className="mb-8 select-none">
          <span className="text-[10px] font-mono uppercase tracking-widest text-stone-700 block mb-5">
            Inbox / Conversas
          </span>
          <h2 className="text-4xl font-semibold tracking-tight text-stone-700 leading-tight mb-3">
            Selecione uma<br />conversa
          </h2>
          <p className="text-sm text-stone-700 max-w-[240px] mx-auto leading-relaxed">
            Escolha uma conversa na lista ao lado ou inicie um novo atendimento.
          </p>
        </div>
        <div className="w-14 h-14 rounded-full border border-dashed border-stone-800 flex items-center justify-center text-stone-700">
          <MessageSquare size={22} />
        </div>
        <div className="mt-12 flex items-center gap-3">
          <div className="h-px w-12 bg-stone-800" />
          <span className="text-[10px] font-mono text-stone-800 uppercase tracking-widest">Sia One</span>
          <div className="h-px w-12 bg-stone-800" />
        </div>
      </div>
    );
  }

  const isClosed = conversation.status === 'closed';
  const modeCfg = MODE_CONFIG[currentMode];
  const activeAgentForConv = availableAgents.find(
    (a) => a.id === conversation.ai_agent_id
  );

  // Avatar color based on contact name
  const AVATAR_PALETTE = [
    'bg-emerald-500/20 text-emerald-400',
    'bg-violet-500/20 text-violet-400',
    'bg-amber-500/20 text-amber-400',
    'bg-blue-500/20 text-blue-400',
    'bg-rose-500/20 text-rose-400',
    'bg-cyan-500/20 text-cyan-400',
  ];
  const contactName = conversation.contact_name || '?';
  let avatarCode = 0;
  for (let i = 0; i < contactName.length; i++) avatarCode += contactName.charCodeAt(i);
  const avatarColor = AVATAR_PALETTE[avatarCode % AVATAR_PALETTE.length];
  const contactInitials = contactName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="flex-1 flex h-full bg-bg-base overflow-hidden">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border relative">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center justify-between gap-3 shrink-0 bg-surface/20 min-h-[68px] flex-wrap">
          <div className="flex items-center gap-3">
            {/* Colorful avatar */}
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 border border-border/50 ${avatarColor}`}
            >
              {contactInitials}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-main leading-tight flex items-center gap-2">
                {conversation.contact_name}
                {isClosed && (
                  <span className="text-[10px] bg-stone-700/50 text-stone-500 px-1.5 py-0.5 rounded border border-stone-700 uppercase tracking-wider font-mono">
                    Encerrada
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                {currentMode === 'ai' ? (
                  <>
                    <Bot size={10} className="text-indigo-400 shrink-0" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 truncate max-w-[140px]">
                      {activeAgentForConv?.name ?? conversation.ai_agent_name ?? 'IA'}
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${isClosed ? 'bg-stone-600' : 'bg-emerald-500'}`}
                    />
                    <span className={`text-[10px] font-mono uppercase tracking-wider ${getAttendeeTextColor(conversation.assigned_to_name ?? '')}`}>
                      {conversation.assigned_to_name
                        ? `${conversation.assigned_to_name.split(' ')[0]}`
                        : 'Não atribuído'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Attendance mode badge + selector */}
            {!isClosed && (
              <AttendanceBadge
                mode={currentMode}
                humanName={conversation.assigned_to_name}
                agentName={activeAgentForConv?.name ?? conversation.ai_agent_name}
                agentActive={activeAgentForConv?.is_active ?? conversation.ai_agent_active}
                agents={availableAgents}
                onChangeMode={handleChangeMode}
              />
            )}

            {/* Botão dedicado Pausar IA — visível sempre que a IA está ativa */}
            {!isClosed && currentMode !== 'human' && (
              <button
                onClick={() => handleChangeMode('human')}
                disabled={handoffLoading}
                title={currentMode === 'ai' ? 'Pausar IA' : 'Assumir atendimento'}
                className={cn(
                  'flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50',
                  currentMode === 'ai'
                    ? 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 hover:text-indigo-300'
                    : 'text-violet-400 border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 hover:text-violet-300'
                )}
              >
                <ZapOff size={11} />
                {currentMode === 'ai' ? 'Pausar IA' : 'Só humano'}
              </button>
            )}

            <div className="w-px h-5 bg-border mx-0.5" />

            {/* Transfer conversation — dropdown with team members */}
            <TransferButton
              companyId={currentCompany?.id ?? ''}
              onTransfer={handleTransfer}
            />

            {/* Close conversation */}
            {!isClosed && (
              <button
                onClick={handleCloseConversation}
                className="w-8 h-8 flex items-center justify-center text-stone-600 hover:text-rose-400 hover:bg-surface rounded-lg transition-colors"
                title="Encerrar conversa"
              >
                <CheckCircle2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* AI active banner */}
        {currentMode === 'ai' && !isClosed && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-2 bg-indigo-500/6 border-b border-indigo-500/15">
            <div className="flex items-center gap-2 text-indigo-400 text-xs">
              <Bot size={12} />
              <span className="font-medium text-indigo-300">
                {activeAgentForConv?.name ?? conversation.ai_agent_name ?? 'Agente IA'}
              </span>
              <span className="text-indigo-500 font-mono text-[10px]">respondendo automaticamente</span>
              {activeAgentForConv && !activeAgentForConv.is_active && (
                <span className="text-amber-400 text-[10px] font-mono uppercase">(inativo)</span>
              )}
            </div>
            <button
              onClick={() => handleChangeMode('human')}
              disabled={handoffLoading}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted hover:text-text-main px-2.5 py-1 bg-background border border-border rounded-lg transition-colors"
            >
              <ZapOff size={10} />
              Pausar
            </button>
          </div>
        )}

        {currentMode === 'hybrid' && !isClosed && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-2 bg-violet-500/6 border-b border-violet-500/15">
            <div className="flex items-center gap-2 text-violet-400 text-xs">
              <Zap size={12} />
              <span className="font-medium text-violet-300">Modo Híbrido</span>
              <span className="text-violet-600 font-mono text-[10px]">IA assistindo, você no controle</span>
            </div>
            <button
              onClick={() => handleChangeMode('human')}
              disabled={handoffLoading}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted hover:text-text-main px-2.5 py-1 bg-background border border-border rounded-lg transition-colors"
            >
              <User size={10} />
              Só humano
            </button>
          </div>
        )}

        {/* Botão de paginação reversa — só aparece se há histórico anterior */}
        {hasMoreMessages && (
          <div className="shrink-0 flex justify-center py-2 border-b border-border/30">
            <button
              onClick={() => handleLoadMore(conversation.conversation_id)}
              disabled={loadingMore}
              className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500 hover:text-stone-300 px-3 py-1.5 rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
            >
              {loadingMore
                ? <Loader2 size={12} className="animate-spin" />
                : <span>↑</span>}
              {loadingMore ? 'Carregando…' : 'Carregar mensagens anteriores'}
            </button>
          </div>
        )}

        <Timeline
          messages={messages}
          contactName={conversation.contact_name}
          loading={loadingMessages}
        />
        {sendError && (
          <div className="shrink-0 mx-4 mb-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between gap-2">
            <span>{sendError}</span>
            <button
              onClick={() => {
                setSendError(null);
                onInitialSendErrorDismissed?.();
              }}
              className="text-rose-500 hover:text-rose-300 transition-colors shrink-0"
              aria-label="Fechar"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <Composer onSendMessage={handleSendMessage} disabled={isClosed} />

        {/* Discrete sidebar toggle — sits on the right border, vertically centered */}
        <button
          onClick={() => setShowContext(v => !v)}
          title={showContext ? 'Fechar painel' : 'Abrir painel'}
          className={cn(
            'absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20',
            'flex items-center justify-center',
            'w-6 h-12 rounded-full border transition-all duration-200',
            showContext
              ? 'bg-surface border-border text-text-muted hover:text-text-main hover:border-stone-500'
              : 'bg-surface border-border text-text-muted hover:text-text-main hover:border-stone-500'
          )}
        >
          {showContext
            ? <ChevronsRight size={11} />
            : <ChevronsLeft size={11} />
          }
        </button>
      </div>

      {/* Context Sidebar */}
      {showContext && (
        <div className="w-64 xl:w-72 flex flex-col shrink-0 border-l border-border bg-surface">

          {/* Tab bar */}
          <div className="flex shrink-0 border-b border-border">
            {(['context', 'notes'] as SidebarTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold transition-all relative',
                  sidebarTab === tab
                    ? 'text-text-main'
                    : 'text-text-muted hover:text-text-main'
                )}
              >
                {tab === 'notes' && <StickyNote size={11} />}
                {tab === 'context' ? 'Contexto' : 'Notas'}
                {/* Active underline */}
                {sidebarTab === tab && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar">

            {/* ── Context Tab ── */}
            {sidebarTab === 'context' && (
              <div className="py-1">

                {/* Agente IA */}
                {conversation.ai_agent_id && (
                  <CollapsibleSection
                    label="Agente IA"
                    icon={<Bot size={12} />}
                    defaultOpen={true}
                  >
                    <div
                      className={cn(
                        'rounded-xl border p-3 text-sm',
                        currentMode === 'ai'
                          ? 'bg-indigo-500/8 border-indigo-500/20'
                          : 'bg-surface-hover border-border'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-text-main truncate">
                          {conversation.ai_agent_name ?? '—'}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-md border shrink-0',
                            modeCfg.bg, modeCfg.border, modeCfg.color
                          )}
                        >
                          {modeCfg.label}
                        </span>
                      </div>
                      {currentMode === 'ai' && (
                        <p className="text-[10px] text-indigo-400/70 mt-2 flex items-center gap-1">
                          <Bot size={9} /> Respondendo automaticamente
                        </p>
                      )}
                      {currentMode === 'human' && conversation.ai_paused_at && (
                        <p className="text-[10px] text-stone-500 mt-2">
                          Pausado às{' '}
                          {new Date(conversation.ai_paused_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                  </CollapsibleSection>
                )}

                {/* Negócios */}
                {(conversation.open_deals_count > 0 || linkedDeal) && (
                  <CollapsibleSection
                    label="Negócios"
                    icon={<DollarSign size={12} />}
                    defaultOpen={true}
                  >
                    {linkedDealLoading ? (
                      <div className="h-12 bg-surface-hover rounded-xl animate-pulse" />
                    ) : linkedDeal ? (
                      <div className="space-y-3">
                        {/* Deal card */}
                        <div className={cn(
                          'rounded-xl border p-3',
                          linkedDeal.status === 'won'
                            ? 'bg-emerald-500/8 border-emerald-500/20'
                            : linkedDeal.status === 'lost'
                            ? 'bg-rose-500/8 border-rose-500/20'
                            : 'bg-surface-hover border-border'
                        )}>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                              linkedDeal.status === 'won'
                                ? 'bg-emerald-500/15 border border-emerald-500/20'
                                : linkedDeal.status === 'lost'
                                ? 'bg-rose-500/15 border border-rose-500/20'
                                : 'bg-emerald-500/15 border border-emerald-500/20'
                            )}>
                              {linkedDeal.status === 'won' ? (
                                <Trophy size={13} className="text-emerald-400" />
                              ) : linkedDeal.status === 'lost' ? (
                                <XCircle size={13} className="text-rose-400" />
                              ) : (
                                <DollarSign size={13} className="text-emerald-400" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-text-main truncate">
                                {linkedDeal.title}
                              </p>
                              {linkedDeal.amount > 0 && (
                                <p className="text-[10px] text-emerald-400 font-mono">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(linkedDeal.amount)}
                                </p>
                              )}
                            </div>
                            {linkedDeal.status !== 'open' && (
                              <span className={cn(
                                'text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0',
                                linkedDeal.status === 'won'
                                  ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                                  : 'text-rose-400 bg-rose-400/10 border-rose-400/20'
                              )}>
                                {linkedDeal.status === 'won' ? 'Ganho' : 'Perdido'}
                              </span>
                            )}
                          </div>
                          {linkedDeal.loss_reason && (
                            <p className="text-[10px] text-stone-500 mt-2 pl-9 italic">
                              {linkedDeal.loss_reason}
                            </p>
                          )}
                        </div>

                        {/* Win/Loss actions — apenas para deals abertos */}
                        {linkedDeal.status === 'open' && (
                          <>
                            {dealCloseError && (
                              <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                                <AlertCircle size={11} className="shrink-0" />
                                <span className="flex-1">{dealCloseError}</span>
                                <button onClick={() => setDealCloseError(null)}>
                                  <X size={11} />
                                </button>
                              </div>
                            )}

                            {dealCloseMode === null && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { setDealCloseError(null); setDealCloseMode('won'); }}
                                  disabled={dealClosing}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all text-xs font-semibold disabled:opacity-50"
                                >
                                  <Trophy size={12} />
                                  Ganhar
                                </button>
                                <button
                                  onClick={() => { setDealCloseError(null); setDealCloseMode('lost'); }}
                                  disabled={dealClosing}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/50 transition-all text-xs font-semibold disabled:opacity-50"
                                >
                                  <XCircle size={12} />
                                  Perder
                                </button>
                              </div>
                            )}

                            {dealCloseMode === 'won' && (
                              <div className="space-y-2">
                                <div className="p-2.5 bg-emerald-500/8 border border-emerald-500/20 rounded-lg">
                                  <p className="text-xs text-text-main">
                                    Marcar como <span className="text-emerald-400 font-semibold">Ganho</span>?
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setDealCloseMode(null)}
                                    disabled={dealClosing}
                                    className="flex-1 py-1.5 text-xs text-text-muted border border-border rounded-lg hover:bg-surface-hover transition-all disabled:opacity-50"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={handleDealWon}
                                    disabled={dealClosing}
                                    className="flex-1 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
                                  >
                                    {dealClosing ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                    {dealClosing ? 'Salvando…' : 'Confirmar'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {dealCloseMode === 'lost' && (
                              <div className="space-y-2">
                                <textarea
                                  value={dealLossReason}
                                  onChange={e => setDealLossReason(e.target.value)}
                                  placeholder="Motivo da perda (opcional)"
                                  rows={2}
                                  disabled={dealClosing}
                                  className="w-full bg-surface-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary placeholder-stone-600 outline-none focus:border-rose-500/40 resize-none transition-colors disabled:opacity-50"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => { setDealCloseMode(null); setDealLossReason(''); }}
                                    disabled={dealClosing}
                                    className="flex-1 py-1.5 text-xs text-text-muted border border-border rounded-lg hover:bg-surface-hover transition-all disabled:opacity-50"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={handleDealLost}
                                    disabled={dealClosing}
                                    className="flex-1 py-1.5 text-xs font-semibold bg-rose-700 text-white rounded-lg hover:bg-rose-600 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
                                  >
                                    {dealClosing ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                                    {dealClosing ? 'Salvando…' : 'Confirmar Perda'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      /* Fallback quando open_deals_count > 0 mas deal não foi encontrado por conversation_id */
                      <div className="rounded-xl border border-border bg-surface-hover p-3">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0">
                            <DollarSign size={13} className="text-emerald-400" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-text-main truncate">
                              {conversation.contact_name}
                            </p>
                            <p className="text-[10px] text-emerald-400 font-mono">
                              {conversation.open_deals_count} negócio{conversation.open_deals_count > 1 ? 's' : ''} aberto{conversation.open_deals_count > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CollapsibleSection>
                )}

                {/* Tarefas */}
                <CollapsibleSection
                  label="Tarefas"
                  defaultOpen={true}
                  action={
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowQuickTask(v => !v); }}
                      className={cn(
                        'w-6 h-6 flex items-center justify-center rounded-md transition-colors',
                        showQuickTask
                          ? 'bg-primary/20 text-primary'
                          : 'text-text-muted hover:text-text-main hover:bg-surface-hover'
                      )}
                      title="Nova tarefa"
                    >
                      <Plus size={13} />
                    </button>
                  }
                >
                  {/* Quick task input */}
                  <div
                    className={cn(
                      'grid transition-all duration-200 ease-in-out mb-0',
                      showQuickTask ? 'grid-rows-[1fr] mb-3' : 'grid-rows-[0fr]'
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="flex gap-2 pt-0.5">
                        <input
                          type="text"
                          value={quickTaskTitle}
                          onChange={(e) => setQuickTaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleQuickTask();
                            if (e.key === 'Escape') { setShowQuickTask(false); setQuickTaskTitle(''); }
                          }}
                          placeholder="Título da tarefa..."
                          autoFocus={showQuickTask}
                          className="flex-1 bg-surface-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-main placeholder-stone-600 outline-none focus:border-primary/40 focus:bg-border transition-colors"
                        />
                        <button
                          onClick={handleQuickTask}
                          disabled={!quickTaskTitle.trim() || savingTask}
                          className="px-3 py-1.5 bg-primary text-background text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                        >
                          {savingTask ? '…' : 'Ok'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {loadingTasks ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-9 bg-surface-hover rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : tasks.length === 0 ? (
                    <p className="text-[11px] text-stone-600 text-center py-4">
                      Nenhuma tarefa para este contato
                    </p>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {tasks.map((t) => (
                        <MiniTask key={t.id} task={t} onStatusChange={handleTaskStatusChange} />
                      ))}
                    </div>
                  )}
                </CollapsibleSection>

              {/* ── Follow-ups ── */}
              {conversation.contact_id && (
                <CollapsibleSection
                  label="Follow-ups"
                  defaultOpen={false}
                >
                  <FollowUpPanel
                    data={followUpData}
                    history={followUpHistory}
                    isLoading={followUpLoading}
                    error={followUpError}
                    onStopCycle={handleStopFollowUpCycle}
                    canManage={true}
                  />
                </CollapsibleSection>
              )}

              </div>
            )}

            {/* ── Notes Tab ── */}
            {sidebarTab === 'notes' && (
              <div className="p-4">
                <NotesList conversationId={conversation.conversation_id} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
