import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { supabase } from '../lib/supabase';
import { ConversationList } from '../components/Inbox/ConversationList';
import { ConversationDetail } from '../components/Inbox/ConversationDetail';
import { NewConversationModal } from '../components/Inbox/NewConversationModal';
import type { InboxConversation } from '../types';

type FilterTab = 'all' | 'unread' | 'mine' | 'team';

export interface AdvancedFilters {
  status: 'open' | 'closed' | 'pending' | null;
  priority: 'low' | 'normal' | 'high' | 'urgent' | null;
  attendance: 'human' | 'ai' | 'hybrid' | null;
  agent: string | null;
}

const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  status: null,
  priority: null,
  attendance: null,
  agent: null,
};

export const Inbox: React.FC = () => {
  const { currentCompany } = useTenant();
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const routeConversationId = params['*'];

  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(DEFAULT_ADVANCED_FILTERS);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialSendError, setInitialSendError] = useState<{ conversationId: string; error: string } | null>(null);

  const activeId = routeConversationId && routeConversationId.length > 0 ? routeConversationId : null;

  // Ref para activeId: permite leitura dentro de callbacks Realtime sem depender de closure
  const activeIdRef = useRef<string | null>(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Ref para conversations: leitura sem criar dependência em efeitos pontuais
  const conversationsRef = useRef<InboxConversation[]>([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // Limpa initialSendError ao trocar de conversa
  useEffect(() => {
    if (activeId && initialSendError && activeId !== initialSendError.conversationId) {
      setInitialSendError(null);
    }
  }, [activeId, initialSendError]);

  const fetchInbox = useCallback(async (silent = false) => {
    if (!currentCompany) return;
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase.rpc('rpc_get_inbox_conversations', {
        p_company_id: currentCompany.id,
      });

      if (error) throw error;

      const convs = (data as InboxConversation[]) || [];
      const currentActive = activeIdRef.current;

      // Se a conversa ativa tem não lidas no banco, marca como lida em background
      if (currentActive) {
        const activeConv = convs.find(c => c.conversation_id === currentActive);
        if (activeConv && activeConv.unread_count > 0) {
          supabase.rpc('rpc_mark_conversation_read', { p_conversation_id: currentActive });
        }
      }

      // Nunca exibe badge de não lido para a conversa atualmente aberta
      setConversations(convs.map(c =>
        currentActive && c.conversation_id === currentActive
          ? { ...c, unread_count: 0 }
          : c
      ));
    } catch (err: any) {
      console.error('Error fetching inbox:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentCompany]);

  // Ref estável para ser usado nos callbacks Realtime sem ser dependência do useEffect
  const fetchInboxRef = useRef(fetchInbox);
  useEffect(() => { fetchInboxRef.current = fetchInbox; }, [fetchInbox]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  // Marca como lida imediatamente (otimista + persiste) ao abrir uma conversa
  useEffect(() => {
    if (!activeId) return;
    const conv = conversationsRef.current.find(c => c.conversation_id === activeId);
    if (!conv || conv.unread_count === 0) return;
    setConversations(prev => prev.map(c =>
      c.conversation_id === activeId ? { ...c, unread_count: 0 } : c
    ));
    supabase.rpc('rpc_mark_conversation_read', { p_conversation_id: activeId });
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Busca agentes da empresa para o filtro
  useEffect(() => {
    if (!currentCompany) return;
    supabase
      .from('user_companies')
      .select('user_id')
      .eq('company_id', currentCompany.id)
      .then(({ data: ucData }) => {
        if (!ucData?.length) return;
        supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', ucData.map(uc => uc.user_id))
          .then(({ data: profiles }) => {
            setAgents((profiles || []).map(p => ({ id: p.id, name: p.full_name || 'Usuário' })));
          });
      });
  }, [currentCompany]);

  // Realtime: atualiza a lista silenciosamente quando chegam novos eventos
  // fetchInboxRef e activeIdRef garantem que o canal não seja recriado a cada render
  useEffect(() => {
    if (!currentCompany) return;

    const channel = supabase
      .channel(`inbox-messages-${currentCompany.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as any;
          // Se a nova mensagem inbound é da conversa aberta, marca como lida imediatamente
          if (
            msg.conversation_id === activeIdRef.current &&
            msg.sender_type === 'contact' &&
            !msg.is_internal
          ) {
            supabase.rpc('rpc_mark_conversation_read', { p_conversation_id: msg.conversation_id });
          }
          fetchInboxRef.current(true);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        () => { fetchInboxRef.current(true); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentCompany]);

  // Apply search + tab + advanced filters (memoized + debounced search)
  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      if (activeFilter === 'unread' && (conv.unread_count ?? 0) === 0) return false;
      if (activeFilter === 'mine' && conv.assigned_to_id !== user?.id) return false;
      if (activeFilter === 'team' && (!conv.assigned_to_id || conv.assigned_to_id === user?.id)) return false;
      if (advancedFilters.status && conv.status !== advancedFilters.status) return false;
      if (advancedFilters.priority && conv.priority !== advancedFilters.priority) return false;
      if (advancedFilters.attendance && conv.attendance_mode !== advancedFilters.attendance) return false;
      if (advancedFilters.agent && conv.assigned_to_id !== advancedFilters.agent) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const nameMatch = conv.contact_name?.toLowerCase().includes(q);
        const previewMatch = conv.last_message_preview?.toLowerCase().includes(q);
        if (!nameMatch && !previewMatch) return false;
      }
      return true;
    });
  }, [conversations, activeFilter, advancedFilters, user?.id, debouncedSearch]);

  const handleSelectConversation = (id: string) => { navigate(`/inbox/${id}`, { preventScrollReset: true }); };

  const handleNewConversationSuccess = async (conversationId: string, sendError?: string) => {
    await fetchInbox();
    if (sendError) {
      setInitialSendError({ conversationId, error: sendError });
    }
    navigate(`/inbox/${conversationId}`);
  };

  const activeConversation = conversations.find(c => c.conversation_id === activeId);

  return (
    <div className="bg-background border border-border rounded-xl flex overflow-hidden shadow-lg h-[calc(100dvh-5rem)] min-h-0 reveal active">

      {/* Conversation list: full width on mobile when no conversation is open */}
      <div className={`h-full shrink-0 ${activeId ? 'hidden sm:flex' : 'flex'} w-full sm:w-auto`}>
        <ConversationList
          conversations={filteredConversations}
          allConversations={conversations}
          activeId={activeId}
          onSelect={handleSelectConversation}
          loading={loading}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          advancedFilters={advancedFilters}
          setAdvancedFilters={setAdvancedFilters}
          onNewConversation={() => setIsModalOpen(true)}
          currentUserId={user?.id}
          agents={agents}
        />
      </div>

      {/* Conversation detail: full width on mobile when a conversation is open */}
      <div className={`flex-1 min-w-0 h-full flex-col ${activeId ? 'flex' : 'hidden sm:flex'}`}>
        {/* Mobile back button — only visible on small screens when a conversation is open */}
        {activeId && (
          <button
            onClick={() => navigate('/inbox')}
            className="sm:hidden flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background text-text-muted hover:text-primary text-sm shrink-0 transition-colors"
          >
            <ArrowLeft size={15} />
            <span className="font-medium">Conversas</span>
          </button>
        )}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        <ConversationDetail
          conversation={activeConversation}
          onConversationUpdate={fetchInbox}
          initialSendError={
            activeId && initialSendError?.conversationId === activeId
              ? initialSendError.error
              : undefined
          }
          onInitialSendErrorDismissed={() => setInitialSendError(null)}
        />
        </div>
      </div>

      <NewConversationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleNewConversationSuccess}
      />
    </div>
  );
};
