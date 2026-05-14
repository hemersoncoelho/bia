import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, Inbox, MessageSquarePlus, X } from 'lucide-react';
import { ConversationItem } from './ConversationItem';
import type { InboxConversation } from '../../types';
import type { AdvancedFilters } from '../../pages/Inbox';

type FilterTab = 'all' | 'unread' | 'mine' | 'team';

interface ConversationListProps {
  conversations: InboxConversation[];
  allConversations: InboxConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilter: FilterTab;
  setActiveFilter: (f: FilterTab) => void;
  advancedFilters: AdvancedFilters;
  setAdvancedFilters: (f: AdvancedFilters) => void;
  onNewConversation: () => void;
  currentUserId?: string | null;
  agents: Array<{ id: string; name: string }>;
}

type FilterChipProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

const FilterChip: React.FC<FilterChipProps> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border ${
      active
        ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
        : 'bg-transparent border-border text-stone-500 hover:text-stone-300 hover:border-stone-600'
    }`}
  >
    {label}
  </button>
);

const STATUS_OPTIONS: { value: AdvancedFilters['status']; label: string }[] = [
  { value: 'open', label: 'Aberta' },
  { value: 'pending', label: 'Pendente' },
  { value: 'closed', label: 'Fechada' },
];

const PRIORITY_OPTIONS: { value: AdvancedFilters['priority']; label: string }[] = [
  { value: 'urgent', label: 'Urgente' },
  { value: 'high', label: 'Alta' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Baixa' },
];

const ATTENDANCE_OPTIONS: { value: AdvancedFilters['attendance']; label: string }[] = [
  { value: 'human', label: 'Humano' },
  { value: 'ai', label: 'IA' },
  { value: 'hybrid', label: 'Híbrido' },
];

const DEFAULT_FILTERS: AdvancedFilters = { status: null, priority: null, attendance: null, agent: null };

function countActiveFilters(f: AdvancedFilters): number {
  return [f.status, f.priority, f.attendance, f.agent].filter(Boolean).length;
}

// ── Filters Modal ─────────────────────────────────────────────────────────────

const FiltersModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  current: AdvancedFilters;
  onApply: (f: AdvancedFilters) => void;
  agents: Array<{ id: string; name: string }>;
}> = ({ isOpen, onClose, current, onApply, agents }) => {
  const [local, setLocal] = useState<AdvancedFilters>(current);

  useEffect(() => {
    if (isOpen) setLocal(current);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  function toggleStatus(val: AdvancedFilters['status']) {
    setLocal(l => ({ ...l, status: l.status === val ? null : val }));
  }
  function togglePriority(val: AdvancedFilters['priority']) {
    setLocal(l => ({ ...l, priority: l.priority === val ? null : val }));
  }
  function toggleAttendance(val: AdvancedFilters['attendance']) {
    setLocal(l => ({ ...l, attendance: l.attendance === val ? null : val }));
  }
  function toggleAgent(val: string) {
    setLocal(l => ({ ...l, agent: l.agent === val ? null : val }));
  }
  function clear() { setLocal(DEFAULT_FILTERS); }
  function apply() { onApply(local); onClose(); }

  const activeCount = countActiveFilters(local);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-base border border-border w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-surface/50">
          <div>
            <h2 className="text-lg font-medium text-blue-400 flex items-center gap-2">
              <SlidersHorizontal size={18} /> Filtros
            </h2>
            <p className="text-xs text-text-muted mt-1">Filtre as conversas por critérios específicos</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-main transition-colors p-2 rounded-md hover:bg-surface-hover"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">
          {/* Status */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 block mb-2.5">Status</span>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(opt => (
                <FilterChip
                  key={String(opt.value)}
                  label={opt.label}
                  active={local.status === opt.value}
                  onClick={() => toggleStatus(opt.value)}
                />
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 block mb-2.5">Prioridade</span>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_OPTIONS.map(opt => (
                <FilterChip
                  key={String(opt.value)}
                  label={opt.label}
                  active={local.priority === opt.value}
                  onClick={() => togglePriority(opt.value)}
                />
              ))}
            </div>
          </div>

          {/* Attendance */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 block mb-2.5">Atendimento</span>
            <div className="flex flex-wrap gap-2">
              {ATTENDANCE_OPTIONS.map(opt => (
                <FilterChip
                  key={String(opt.value)}
                  label={opt.label}
                  active={local.attendance === opt.value}
                  onClick={() => toggleAttendance(opt.value)}
                />
              ))}
            </div>
          </div>

          {/* Agent */}
          {agents.length > 0 && (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 block mb-2.5">Agente</span>
              <div className="flex flex-wrap gap-2">
                {agents.map(agent => (
                  <FilterChip
                    key={agent.id}
                    label={agent.name.split(' ')[0]}
                    active={local.agent === agent.id}
                    onClick={() => toggleAgent(agent.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex justify-between items-center">
          <button
            onClick={clear}
            className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-red-400 transition-colors"
          >
            <X size={13} /> Limpar filtros
          </button>
          <button
            onClick={apply}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Aplicar
            {activeCount > 0 && (
              <span className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── ConversationList ──────────────────────────────────────────────────────────

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
  advancedFilters,
  setAdvancedFilters,
  onNewConversation,
  currentUserId,
  agents,
}) => {
  const [showFilters, setShowFilters] = useState(false);

  const unreadCount = allConversations.filter((c) => c.unread_count > 0).length;
  const teamCount = allConversations.filter(
    (c) => c.assigned_to_id && c.assigned_to_id !== currentUserId
  ).length;
  const activeAdvancedCount = countActiveFilters(advancedFilters);

  const TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'all',    label: 'Todas',        count: allConversations.length },
    { id: 'unread', label: 'Não lidas',    count: unreadCount },
    { id: 'mine',   label: 'Minhas' },
    { id: 'team',   label: 'Minha equipe', count: teamCount },
  ];

  return (
    <div className="w-full sm:w-[300px] lg:w-[340px] sm:min-w-[260px] sm:max-w-[340px] sm:shrink-0 flex flex-col h-full border-r border-border bg-background">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
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
              onClick={() => setShowFilters(true)}
              className={`relative w-8 h-8 flex items-center justify-center rounded-lg border transition-all ${
                activeAdvancedCount > 0
                  ? 'bg-blue-500/10 border-blue-500/25 text-blue-400'
                  : 'text-stone-500 hover:text-primary hover:bg-surface border-transparent'
              }`}
              title="Filtros avançados"
            >
              <SlidersHorizontal size={16} />
              {activeAdvancedCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white leading-none">
                  {activeAdvancedCount}
                </span>
              )}
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
            className="w-full bg-surface border border-border text-primary text-sm rounded-lg pl-9 pr-8 py-2.5 placeholder-stone-700 focus:border-stone-500 focus:ring-0 outline-none transition-colors"
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
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar -mx-1 px-1">
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
              className="flex items-start gap-3 px-4 py-4 border-b border-border animate-pulse"
            >
              <div className="w-10 h-10 rounded-full bg-surface shrink-0" />
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
              {searchQuery || activeAdvancedCount > 0 ? 'Nenhum resultado' : 'Caixa vazia'}
            </p>
            <p className="text-xs text-stone-700 max-w-[180px] leading-relaxed">
              {searchQuery || activeAdvancedCount > 0
                ? 'Tente ajustar os filtros ou a busca.'
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

      {/* ── Filters Modal ───────────────────────────────────────────────── */}
      <FiltersModal
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        current={advancedFilters}
        onApply={setAdvancedFilters}
        agents={agents}
      />
    </div>
  );
};
