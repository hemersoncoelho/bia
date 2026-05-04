import React from 'react';
import { Search, SlidersHorizontal, Inbox, MessageSquarePlus, X } from 'lucide-react';
import { ConversationItem } from './ConversationItem';
import type { InboxConversation } from '../../types';

type FilterTab = 'all' | 'unread' | 'mine' | 'team';

interface ConversationListProps {
  conversations: InboxConversation[];       // already filtered list (for display)
  allConversations: InboxConversation[];    // full list (for counts)
  activeId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilter: FilterTab;
  setActiveFilter: (f: FilterTab) => void;
  onNewConversation: () => void;
  currentUserId?: string | null;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  allConversations,
  activeId,
  onSelect,
  loading,
  searchQuery,
  setSearchQuery,
  activeFilter,
  setActiveFilter,
  onNewConversation,
  currentUserId,
}) => {
  const unreadCount = allConversations.filter((c) => c.unread_count > 0).length;
  const teamCount = allConversations.filter(
    (c) => c.assigned_to_id && c.assigned_to_id !== currentUserId
  ).length;

  const TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'all',    label: 'Todas',       count: allConversations.length },
    { id: 'unread', label: 'Não lidas',   count: unreadCount },
    { id: 'mine',   label: 'Minhas' },
    { id: 'team',   label: 'Minha equipe', count: teamCount },
  ];

  return (
    <div className="w-full sm:w-[340px] sm:shrink-0 flex flex-col h-full border-r border-border bg-background">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 border-b border-border shrink-0">
        {/* Title row */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-stone-600 block mb-1">
              01 / Inbox
            </span>
            <h2 className="text-xl font-semibold tracking-tight text-text-main leading-none">
              Conversas
            </h2>
          </div>
          <div className="flex items-center gap-1 pt-1">
            <button
              onClick={onNewConversation}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-all"
              title="Nova Conversa"
            >
              <MessageSquarePlus size={16} />
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:text-primary hover:bg-surface transition-all"
              title="Filtros"
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600 pointer-events-none"
          />
          <input
            type="text"
            className="w-full bg-surface border border-border text-primary text-xs rounded-lg pl-9 pr-8 py-2.5 placeholder-stone-700 focus:border-stone-500 focus:ring-0 outline-none transition-colors"
            placeholder="Buscar por nome ou mensagem..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-400 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                activeFilter === tab.id
                  ? 'bg-surface border border-border text-text-main shadow-sm'
                  : 'text-stone-600 hover:text-stone-300'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`text-[10px] font-bold px-1 rounded tabular-nums ${
                    activeFilter === tab.id
                      ? tab.id === 'unread'
                        ? 'text-emerald-400 bg-emerald-500/15'
                        : 'text-stone-400 bg-stone-700/50'
                      : 'text-stone-700'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── List ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-4 py-3.5 border-b border-border animate-pulse"
            >
              <div className="w-9 h-9 rounded-full bg-surface shrink-0" />
              <div className="flex-1 space-y-2 pt-0.5">
                <div className="h-3.5 bg-surface rounded w-2/5" />
                <div className="h-3 bg-surface/60 rounded w-full" />
                <div className="h-3 bg-surface/40 rounded w-3/5" />
              </div>
            </div>
          ))
        ) : conversations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-surface border border-dashed border-border flex items-center justify-center mb-4 text-stone-600">
              <Inbox size={22} />
            </div>
            <p className="text-sm font-medium text-stone-500 mb-1">
              {searchQuery ? 'Nenhum resultado' : 'Caixa vazia'}
            </p>
            <p className="text-xs text-stone-700 max-w-[180px] leading-relaxed">
              {searchQuery
                ? 'Tente buscar por outro nome ou mensagem.'
                : 'Nenhuma conversa ativa no momento.'}
            </p>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.conversation_id}
              conversation={conv}
              isActive={conv.conversation_id === activeId}
              onClick={onSelect}
            />
          ))
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      {!loading && allConversations.length > 0 && (
        <div className="px-5 py-3 border-t border-border shrink-0 flex items-center justify-between">
          <span className="text-[10px] font-mono text-stone-700 uppercase tracking-widest">
            {conversations.length} de {allConversations.length} conversa{allConversations.length !== 1 ? 's' : ''}
          </span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-mono text-emerald-600 uppercase tracking-widest">
              {unreadCount} não lida{unreadCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
