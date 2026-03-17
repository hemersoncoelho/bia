import React from 'react';
import { Bot, Zap, UserRound, UserX } from 'lucide-react';
import { getAttendeeBadgeClasses } from '../../utils/attendeeColors';

export interface ConversationItemProps {
  conversation: any;
  isActive: boolean;
  onClick: (id: string) => void;
}

const AVATAR_PALETTE = [
  'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'bg-violet-500/15 text-violet-400 border-violet-500/25',
  'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'bg-blue-500/15 text-blue-400 border-blue-500/25',
  'bg-rose-500/15 text-rose-400 border-rose-500/25',
  'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  'bg-orange-500/15 text-orange-400 border-orange-500/25',
];

function getAvatarStyle(name: string): string {
  if (!name) return AVATAR_PALETTE[0];
  let code = 0;
  for (let i = 0; i < name.length; i++) code += name.charCodeAt(i);
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-rose-500',
  high: 'bg-amber-500',
};

export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isActive,
  onClick,
}) => {
  const avatarStyle = getAvatarStyle(conversation.contact_name || '');
  const hasUnread = conversation.unread_count > 0;
  const initials = (conversation.contact_name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase();
  const isAI = conversation.attendance_mode === 'ai';
  const isHybrid = conversation.attendance_mode === 'hybrid';
  const priorityDot = PRIORITY_DOT[conversation.priority];

  return (
    <div
      onClick={() => onClick(conversation.conversation_id)}
      className={`relative flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-all duration-150 border-b border-border group
        ${isActive ? 'bg-surface' : 'hover:bg-surface/50'}
      `}
    >
      {/* Left accent bar */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full transition-all duration-200 ${
          isActive ? 'bg-white' : hasUnread ? 'bg-emerald-500' : 'bg-transparent'
        }`}
      />

      {/* Avatar */}
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 border ${avatarStyle}`}
      >
        {initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Name + time + unread */}
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {priorityDot && (
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot}`} />
            )}
            <span
              className={`text-sm font-medium truncate transition-colors ${
                isActive || hasUnread
                  ? 'text-white'
                  : 'text-stone-400 group-hover:text-white'
              }`}
            >
              {conversation.contact_name || 'Contato Desconhecido'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasUnread && (
              <span className="bg-emerald-500 text-black text-[10px] font-bold px-1.5 min-w-[18px] py-0.5 rounded-full text-center leading-tight">
                {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
              </span>
            )}
            <span className="text-[10px] font-mono text-stone-600 group-hover:text-stone-500 transition-colors tabular-nums">
              {formatTime(conversation.last_message_at)}
            </span>
          </div>
        </div>

        {/* Row 2: Preview */}
        <p
          className={`text-xs leading-relaxed line-clamp-2 transition-colors ${
            hasUnread
              ? 'text-stone-400'
              : 'text-stone-600 group-hover:text-stone-500'
          }`}
        >
          {conversation.last_message_preview || 'Nenhuma mensagem recente.'}
        </p>

        {/* Row 3: Atendente + modo */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {/* Modo IA */}
          {isAI && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-indigo-300 bg-indigo-500/15 px-1.5 py-0.5 rounded-md border border-indigo-500/30">
              <Bot size={10} />
              IA
            </span>
          )}

          {/* Modo Híbrido */}
          {isHybrid && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded-md border border-violet-500/30">
              <Zap size={10} />
              Híbrido
            </span>
          )}

          {/* Atendente atribuído */}
          {conversation.assigned_to_name ? (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border truncate max-w-[120px] ${getAttendeeBadgeClasses(conversation.assigned_to_name)}`}>
              <UserRound size={10} className="shrink-0" />
              {conversation.assigned_to_name.split(' ')[0]}
            </span>
          ) : !isAI ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-stone-500 bg-stone-500/10 px-1.5 py-0.5 rounded-md border border-stone-600/30">
              <UserX size={10} className="shrink-0" />
              Sem atendente
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
