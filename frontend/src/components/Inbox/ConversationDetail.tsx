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
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getAttendeeTextColor } from '../../utils/attendeeColors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { Timeline } from './Timeline';
import { Composer } from './Composer';
import { NotesList } from '../Notes/NotesList';
import type { Task, TaskStatus, AiAgent, AttendanceMode, Message } from '../../types';

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
            ? 'text-white bg-surface border border-border'
            : 'text-stone-600 hover:text-white hover:bg-surface'
        )}
        title="Transferir conversa"
      >
        <UserCheck size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-52 bg-[#1C1C1E] border border-[#3A3A3C] rounded-xl shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-[#3A3A3C]">
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
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-stone-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                    >
                      <span className="w-6 h-6 rounded-full bg-stone-700 text-stone-300 text-[10px] font-semibold flex items-center justify-center shrink-0">
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
  agentName?: string;
  agentActive?: boolean;
  agents: AiAgent[];
  onChangeMode: (mode: AttendanceMode, agentId?: string) => void;
}

const AttendanceBadge: React.FC<AttendanceBadgeProps> = ({
  mode,
  agentName,
  agentActive,
  agents,
  onChangeMode,
}) => {
  const [open, setOpen] = useState(false);
  const cfg = MODE_CONFIG[mode];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Modo de atendimento"
        className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${cfg.bg} ${cfg.border} ${cfg.color}`}
      >
        {cfg.icon}
        {cfg.label}
        {agentName && mode !== 'human' && (
          <span className="font-normal opacity-70 max-w-[80px] truncate">— {agentName}</span>
        )}
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
}

type SidebarTab = 'context' | 'notes';

export const ConversationDetail: React.FC<ConversationDetailProps> = ({
  conversation,
  onConversationUpdate,
}) => {
  const { user } = useAuth();
  const { currentCompany } = useTenant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('context');

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showQuickTask, setShowQuickTask] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [savingTask, setSavingTask] = useState(false);

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

  // Fetch available published agents for handoff dropdown
  const fetchAgents = useCallback(async () => {
    if (!currentCompany) return;
    const { data } = await supabase
      .from('ai_agents')
      .select('id, company_id, name, provider, model, scope, handoff_keywords, is_active, is_published, created_at, updated_at')
      .eq('company_id', currentCompany.id)
      .eq('is_published', true)
      .order('name');
    if (data) {
      setAvailableAgents(
        data.map((a) => ({
          ...a,
          handoff_keywords: a.handoff_keywords ?? [],
          scope: a.scope ?? { channels: [], auto_reply: false },
          is_published: a.is_published ?? true,
        })) as AiAgent[]
      );
    }
  }, [currentCompany]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Fetch messages
  useEffect(() => {
    if (!conversation) return;

    const fetchMessages = async () => {
      setLoadingMessages(true);

      // FK: messages.sender_user_id → profiles.user_id
      const { data, error } = await supabase
        .from('messages')
        .select(`*, sender_profile:sender_user_id(full_name)`)
        .eq('conversation_id', conversation.conversation_id)
        .order('created_at', { ascending: true });
      // Note: PostgREST resolves the FK to the "profiles" table automatically
      // because messages.sender_user_id has a FK constraint pointing to profiles.user_id

      if (error) {
        console.error('[Messages] fetch error:', error);
      }

      if (!error && data) {
        setMessages(
          data.map((m) => {
            // Normalise sender_type: the DB may use 'user' for agent messages
            let senderType = m.sender_type as string;
            if (senderType === 'user') senderType = 'agent';

            return {
              id: String(m.public_id ?? m.id),
              conversation_id: m.conversation_id,
              sender_type: senderType as any,
              sender_id: m.sender_user_id ?? m.sender_id,
              body: m.body ?? '',
              status: m.status ?? 'sent',
              is_internal: m.is_internal ?? false,
              ai_agent_id: m.ai_agent_id,
              ai_agent_name: m.ai_agent_name ?? null,
              created_at: m.created_at,
              sender_name: (m.sender_profile as any)?.full_name,
            };
          })
        );
      }
      setLoadingMessages(false);

      if (conversation.unread_count > 0) {
        await supabase.rpc('rpc_mark_conversation_read', {
          p_conversation_id: conversation.conversation_id,
        });
        if (onConversationUpdate) onConversationUpdate();
      }
    };

    fetchMessages();
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

  // Send message — step 1: persiste no banco; step 2: despacha via UAZAPI (WhatsApp)
  const handleSendMessage = async (body: string, isInternal: boolean) => {
    if (!user || !conversation) return;

    const tempId = `temp-${Date.now()}`;
    const newMsg: Message = {
      id: tempId,
      conversation_id: conversation.conversation_id,
      sender_type: 'agent',
      sender_id: user.id,
      body,
      // 'queued' mostra indicador de loading na Timeline até confirmar
      status: isInternal ? 'sent' : 'queued',
      is_internal: isInternal,
      created_at: new Date().toISOString(),
      sender_name: user.full_name,
    };

    setMessages((prev) => [...prev, newMsg]);

    // Passo 1 — gravar no banco
    const { error: rpcError, data: rpcData } = await supabase.rpc('rpc_enqueue_outbound_message', {
      p_conversation_id: conversation.conversation_id,
      p_body: body,
      p_sender_id: user.id,
      p_is_internal: isInternal,
    });

    if (rpcError || !rpcData?.success) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
      return;
    }

    // Notas internas não vão para o WhatsApp
    if (isInternal) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m))
      );
      if (onConversationUpdate) onConversationUpdate();
      return;
    }

    // Passo 2 — despachar via UAZAPI (nunca expõe token no cliente)
    const { error: dispatchError, data: dispatchData } = await supabase.functions.invoke<{
      success: boolean;
      error?: string;
      dispatched?: boolean;
    }>('send-whatsapp-message', {
      body: {
        conversation_id: conversation.conversation_id,
        message_id: rpcData.message_id,
        body,
      },
    });

    if (dispatchError || !dispatchData?.success) {
      const errMsg = dispatchData?.error || dispatchError?.message || 'Falha ao enviar mensagem.';
      console.warn('[send-whatsapp-message]', errMsg);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
    } else {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m))
      );
      if (onConversationUpdate) onConversationUpdate();
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
      // Optimistically add the system event message to the timeline
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
      // Evento de sistema na timeline para rastrear a transferência
      const sysMsg: Message = {
        id: `sys-${Date.now()}`,
        conversation_id: conversation.conversation_id,
        sender_type: 'system',
        body: userName
          ? `Conversa transferida para ${userName}.`
          : 'Conversa transferida.',
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
          <span className="text-[10px] font-mono text-stone-800 uppercase tracking-widest">SalesIA</span>
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
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0 bg-surface/20 min-h-[64px]">
          <div className="flex items-center gap-3">
            {/* Colorful avatar */}
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 border border-border/50 ${avatarColor}`}
            >
              {contactInitials}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white leading-tight flex items-center gap-2">
                {conversation.contact_name}
                {isClosed && (
                  <span className="text-[10px] bg-stone-700/50 text-stone-500 px-1.5 py-0.5 rounded border border-stone-700 uppercase tracking-wider font-mono">
                    Encerrada
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isClosed ? 'bg-stone-600' : 'bg-emerald-500'}`}
                />
                <span className={`text-[10px] font-mono uppercase tracking-wider ${getAttendeeTextColor(conversation.assigned_to_name ?? '')}`}>
                  {conversation.assigned_to_name
                    ? `${conversation.assigned_to_name.split(' ')[0]}`
                    : 'Não atribuído'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Attendance mode badge + selector */}
            {!isClosed && (
              <AttendanceBadge
                mode={currentMode}
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
              className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-500 hover:text-white px-2.5 py-1 bg-background border border-border rounded-lg transition-colors"
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
              className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-500 hover:text-white px-2.5 py-1 bg-background border border-border rounded-lg transition-colors"
            >
              <User size={10} />
              Só humano
            </button>
          </div>
        )}

        <Timeline
          messages={messages}
          contactName={conversation.contact_name}
          loading={loadingMessages}
        />
        <Composer onSendMessage={handleSendMessage} disabled={isClosed} />

        {/* Discrete sidebar toggle — sits on the right border, vertically centered */}
        <button
          onClick={() => setShowContext(v => !v)}
          title={showContext ? 'Fechar painel' : 'Abrir painel'}
          className={cn(
            'absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20',
            'flex items-center justify-center',
            'w-4 h-10 rounded-full border transition-all duration-200',
            showContext
              ? 'bg-surface border-border text-stone-500 hover:text-white hover:border-stone-500'
              : 'bg-surface border-border text-stone-600 hover:text-white hover:border-stone-500'
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
        <div className="w-72 flex flex-col shrink-0 border-l border-border bg-[#131314]">

          {/* Tab bar */}
          <div className="flex shrink-0 border-b border-border">
            {(['context', 'notes'] as SidebarTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold transition-all relative',
                  sidebarTab === tab
                    ? 'text-white'
                    : 'text-stone-600 hover:text-stone-400'
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
                          : 'bg-white/[0.03] border-white/[0.06]'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-stone-200 truncate">
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
                {conversation.open_deals_count > 0 && (
                  <CollapsibleSection
                    label="Negócios"
                    icon={<DollarSign size={12} />}
                    defaultOpen={true}
                  >
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 hover:bg-white/[0.05] transition-colors cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0">
                          <DollarSign size={13} className="text-emerald-400" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-stone-300 truncate">
                            {conversation.contact_name}
                          </p>
                          <p className="text-[10px] text-emerald-400 font-mono">
                            {conversation.open_deals_count} negócio{conversation.open_deals_count > 1 ? 's' : ''} aberto{conversation.open_deals_count > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    </div>
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
                          : 'text-stone-600 hover:text-stone-300 hover:bg-white/[0.05]'
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
                          className="flex-1 bg-white/[0.04] border border-border rounded-lg px-2.5 py-1.5 text-xs text-stone-200 placeholder-stone-600 outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-colors"
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
                        <div key={i} className="h-9 bg-white/[0.03] rounded-lg animate-pulse" />
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
