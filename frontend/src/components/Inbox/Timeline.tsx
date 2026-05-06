import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Bot,
  ArrowLeftRight,
  Play,
  Pause,
  FileText,
  Download,
  MapPin,
  User as UserIcon,
} from 'lucide-react';
import type { Message } from '../../types';

interface TimelineProps {
  messages: Message[];
  contactName: string;
  loading: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONTACT_PALETTE = [
  'bg-emerald-500/15 text-emerald-400',
  'bg-violet-500/15 text-violet-400',
  'bg-amber-500/15 text-amber-400',
  'bg-blue-500/15 text-blue-400',
  'bg-rose-500/15 text-rose-400',
  'bg-cyan-500/15 text-cyan-400',
];

function getContactColor(name: string): string {
  if (!name) return CONTACT_PALETTE[0];
  let code = 0;
  for (let i = 0; i < name.length; i++) code += name.charCodeAt(i);
  return CONTACT_PALETTE[code % CONTACT_PALETTE.length];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDateKey(iso: string): string {
  return new Date(iso).toDateString();
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'queued':
      return <Clock size={11} className="text-stone-700" />;
    case 'sent':
      return <Check size={11} className="text-stone-600" />;
    case 'delivered':
      return <CheckCheck size={11} className="text-stone-600" />;
    case 'read':
      return <CheckCheck size={11} className="text-blue-400" />;
    case 'failed':
      return <AlertCircle size={11} className="text-rose-500" />;
    default:
      return null;
  }
}

// ── Date Separator ────────────────────────────────────────────────────────────

function DateSeparator({ iso }: { iso: string }) {
  return (
    <div className="flex items-center gap-3 py-4 select-none">
      <div className="flex-1 h-px bg-border/60" />
      <span className="text-[10px] font-mono uppercase tracking-widest text-stone-600 px-2">
        {formatDateLabel(iso)}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

// ── Audio Player ──────────────────────────────────────────────────────────────

// isDark=true → fundo escuro (bubble do bot índigo) → usa cores brancas
// isDark=false → fundo claro (contato ou agente humano) → usa cores stone/indigo
function AudioBubble({ url, durationSecs, isDark, transcription }: {
  url: string;
  mime?: string | null;
  durationSecs?: number;
  isDark: boolean;
  transcription?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSecs ?? 0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      a.play();
    }
  };

  const handleTimeUpdate = () => {
    const a = audioRef.current;
    if (!a) return;
    setCurrentTime(a.currentTime);
    setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
  };

  const handleLoadedMetadata = () => {
    const a = audioRef.current;
    if (a && a.duration && isFinite(a.duration)) setDuration(a.duration);
  };

  const handleEnded = () => {
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    a.currentTime = ratio * a.duration;
  };

  const barColor = isDark ? 'bg-white/30' : 'bg-stone-500/40';
  const fillColor = isDark ? 'bg-white' : 'bg-indigo-400';
  const btnColor = isDark
    ? 'bg-white/20 hover:bg-white/30 text-white'
    : 'bg-surface-hover hover:bg-surface border border-border text-text-main';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3 w-52">
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />

        {/* Play/Pause button */}
        <button
          onClick={toggle}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${btnColor}`}
        >
          {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>

        {/* Progress bar + time */}
        <div className="flex-1 flex flex-col gap-1">
          <div
            className={`h-1.5 rounded-full ${barColor} cursor-pointer relative`}
            onClick={handleSeek}
          >
            <div
              className={`absolute left-0 top-0 h-full rounded-full ${fillColor} transition-all`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={`text-[10px] font-mono ${isDark ? 'text-white/60' : 'text-stone-600'}`}>
            {formatDuration(playing ? currentTime : duration)}
          </span>
        </div>
      </div>

      {/* Transcription */}
      {transcription && (
        <p className={`text-xs leading-relaxed italic max-w-[13rem] ${
          isDark ? 'text-white/55' : 'text-stone-500'
        }`}>
          "{transcription}"
        </p>
      )}
    </div>
  );
}

// ── Image Bubble ──────────────────────────────────────────────────────────────

function ImageBubble({ url, caption }: { url: string; caption?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-1">
        <img
          src={url}
          alt="imagem"
          className="max-w-[220px] rounded-xl cursor-pointer object-cover border border-border/40"
          onClick={() => setOpen(true)}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {caption && <p className="text-sm leading-relaxed mt-1">{caption}</p>}
      </div>

      {/* Lightbox */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
        >
          <img
            src={url}
            alt="imagem ampliada"
            className="max-w-full max-h-full rounded-xl shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

// ── Video Bubble ──────────────────────────────────────────────────────────────

function VideoBubble({ url, caption }: { url: string; caption?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <video
        src={url}
        controls
        className="max-w-[260px] rounded-xl border border-border/40"
        preload="metadata"
      />
      {caption && <p className="text-sm leading-relaxed mt-1">{caption}</p>}
    </div>
  );
}

// ── Document Bubble ───────────────────────────────────────────────────────────

function DocumentBubble({ url, filename, caption, isDark }: {
  url: string;
  filename?: string | null;
  mime?: string | null;
  caption?: string;
  isDark: boolean;
}) {
  const name = filename || 'documento';
  const ext = name.includes('.') ? name.split('.').pop()?.toUpperCase() : 'FILE';

  return (
    <div className="flex flex-col gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
          isDark
            ? 'bg-white/10 border-white/20 hover:bg-white/20'
            : 'bg-surface-hover border-border hover:bg-surface'
        }`}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          isDark ? 'bg-white/20' : 'bg-indigo-500/15'
        }`}>
          <FileText size={16} className={isDark ? 'text-white' : 'text-indigo-400'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
          <p className={`text-[10px] ${isDark ? 'text-white/50' : 'text-stone-600'}`}>{ext}</p>
        </div>
        <Download size={14} className={isDark ? 'text-white/60' : 'text-stone-500'} />
      </a>
      {caption && <p className="text-sm leading-relaxed mt-1">{caption}</p>}
    </div>
  );
}

// ── Location Bubble ───────────────────────────────────────────────────────────

function LocationBubble({ body, metadata }: { body: string; metadata?: Record<string, unknown> | null }) {
  const lat = metadata?.latitude as number | undefined;
  const lng = metadata?.longitude as number | undefined;
  const address = (metadata?.address as string) || body;
  const mapsUrl = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : null;

  return (
    <a
      href={mapsUrl ?? '#'}
      target={mapsUrl ? '_blank' : undefined}
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border bg-surface-hover border-border hover:bg-surface transition-colors"
    >
      <MapPin size={16} className="text-rose-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{address || 'Localização'}</p>
        {lat && lng && (
          <p className="text-[10px] text-stone-600 font-mono">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
        )}
      </div>
    </a>
  );
}

// ── Sticker Bubble ────────────────────────────────────────────────────────────

function StickerBubble({ url }: { url: string }) {
  return (
    <img
      src={url}
      alt="sticker"
      className="w-24 h-24 object-contain"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

// ── Contact Card Bubble ───────────────────────────────────────────────────────

function ContactCardBubble({ body, isDark }: { body: string; isDark: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
      isDark
        ? 'bg-white/10 border-white/20'
        : 'bg-surface-hover border-border'
    }`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
        isDark ? 'bg-white/20' : 'bg-emerald-500/15'
      }`}>
        <UserIcon size={16} className={isDark ? 'text-white' : 'text-emerald-400'} />
      </div>
      <div>
        <p className="text-sm font-medium">{body || 'Contato'}</p>
        <p className={`text-[10px] ${isDark ? 'text-white/50' : 'text-stone-600'}`}>Cartão de contato</p>
      </div>
    </div>
  );
}

// ── Message Content ───────────────────────────────────────────────────────────

// isDark=true apenas para o bubble do bot (fundo índigo escuro)
// Para contato (esquerda) e agente humano (fundo branco), isDark=false
function MessageContent({ msg, isDark }: { msg: Message; isDark: boolean }) {
  const type = msg.message_type ?? 'text';

  switch (type) {
    case 'audio':
      if (msg.media_url) {
        return (
          <AudioBubble
            url={msg.media_url}
            mime={msg.media_mime_type}
            durationSecs={(msg.metadata as any)?.seconds}
            isDark={isDark}
            transcription={(msg.metadata as any)?.transcription}
          />
        );
      }
      return <span className="text-sm italic text-stone-500">Áudio indisponível</span>;

    case 'image':
      if (msg.media_url) {
        return <ImageBubble url={msg.media_url} caption={msg.body || undefined} />;
      }
      return <span className="text-sm italic text-stone-500">Imagem indisponível</span>;

    case 'video':
      if (msg.media_url) {
        return <VideoBubble url={msg.media_url} caption={msg.body || undefined} />;
      }
      return <span className="text-sm italic text-stone-500">Vídeo indisponível</span>;

    case 'document':
      if (msg.media_url) {
        return (
          <DocumentBubble
            url={msg.media_url}
            filename={msg.media_filename}
            mime={msg.media_mime_type}
            caption={msg.body || undefined}
            isDark={isDark}
          />
        );
      }
      return <span className="text-sm italic text-stone-500">Documento indisponível</span>;

    case 'sticker':
      if (msg.media_url) return <StickerBubble url={msg.media_url} />;
      return <span className="text-sm italic text-stone-500">Sticker indisponível</span>;

    case 'location':
      return <LocationBubble body={msg.body} metadata={msg.metadata} />;

    case 'contact_card':
      return <ContactCardBubble body={msg.body} isDark={isDark} />;

    case 'reaction':
      return (
        <span className="text-2xl" title="Reação">{msg.body || '👍'}</span>
      );

    case 'text':
    default:
      return <span className="text-sm leading-relaxed">{msg.body}</span>;
  }
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export const Timeline: React.FC<TimelineProps> = ({ messages, contactName, loading }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevContactName = useRef<string>('');

  useEffect(() => {
    const conversationChanged = prevContactName.current !== contactName;
    prevContactName.current = contactName;

    if (conversationChanged) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, contactName]);

  if (loading) {
    return (
      <div ref={scrollRef} className="flex-1 px-6 py-6 space-y-5 overflow-y-auto no-scrollbar">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`flex ${i % 3 === 0 ? 'justify-end' : 'justify-start'} animate-pulse`}
          >
            <div
              className={`rounded-2xl bg-surface ${
                i % 3 === 0 ? 'w-48 h-12' : 'w-64 h-16'
              }`}
            />
          </div>
        ))}
      </div>
    );
  }

  const renderedDates = new Set<string>();
  const contactColor = getContactColor(contactName);
  const contactInitial = (contactName || '?').charAt(0).toUpperCase();

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-3 no-scrollbar">
      {/* Conversation start marker */}
      <div className="flex items-center gap-3 pt-5 pb-7 select-none">
        <div className="flex-1 h-px bg-border/40" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-stone-700 px-2">
          Início da conversa
        </span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      <div className="space-y-1">
        {messages.map((msg, idx) => {
          const dateKey = getDateKey(msg.created_at);
          const showDateSep = !renderedDates.has(dateKey);
          if (showDateSep) renderedDates.add(dateKey);

          // Normalise: 'user' is the DB value for agent messages
          const isAgent = msg.sender_type === 'agent' || (msg.sender_type as string) === 'user';
          const isBot = msg.sender_type === 'bot';
          const isRight = isAgent || isBot;

          // Grouping: same sender, not special message, no date break
          const normalizeSender = (t: string) => t === 'user' ? 'agent' : t;
          const prev = idx > 0 ? messages[idx - 1] : null;
          const sameAsPrev =
            prev &&
            normalizeSender(prev.sender_type) === normalizeSender(msg.sender_type) &&
            !msg.is_internal &&
            prev.sender_type !== 'system' &&
            !prev.is_internal &&
            !showDateSep;

          return (
            <React.Fragment key={msg.id}>
              {/* Date separator */}
              {showDateSep && idx > 0 && <DateSeparator iso={msg.created_at} />}

              {/* ── Internal Note ── */}
              {msg.is_internal && (
                <div className="flex justify-center py-2">
                  <div className="max-w-md w-full mx-auto bg-amber-500/6 border border-amber-500/20 text-amber-300/90 px-4 py-3 rounded-xl text-sm">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] uppercase tracking-widest font-bold opacity-60">
                        Nota Interna
                      </span>
                      <span className="text-[10px] opacity-40 font-mono">
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-amber-200/80">{msg.body}</p>
                  </div>
                </div>
              )}

              {/* ── System Event ── */}
              {!msg.is_internal && msg.sender_type === 'system' && (
                <div className="flex justify-center py-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium border bg-indigo-500/8 border-indigo-500/15 text-indigo-400">
                    <ArrowLeftRight size={10} />
                    <span>{msg.body}</span>
                    <span className="text-[10px] opacity-50 font-mono ml-1">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                </div>
              )}

              {/* ── Contact Message (left) ── */}
              {!msg.is_internal && msg.sender_type === 'contact' && (
                <div
                  className={`flex items-end gap-2.5 max-w-[76%] ${sameAsPrev ? 'mt-1' : 'mt-4'}`}
                >
                  {/* Avatar */}
                  {!sameAsPrev ? (
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${contactColor}`}
                    >
                      {contactInitial}
                    </div>
                  ) : (
                    <div className="w-7 shrink-0" />
                  )}

                  <div className="flex flex-col gap-0.5">
                    {!sameAsPrev && (
                      <span className="text-[10px] font-medium text-stone-600 ml-0.5">
                        {contactName}
                      </span>
                    )}
                    <div className="bg-surface border border-border text-stone-200 px-3.5 py-2.5 rounded-2xl rounded-tl-[6px] shadow-sm">
                      <MessageContent msg={msg} isDark={false} />
                    </div>
                    {!sameAsPrev && (
                      <span className="text-[10px] text-stone-700 font-mono ml-0.5">
                        {formatTime(msg.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* ── Agent / Bot Message (right) ── */}
              {!msg.is_internal && isRight && (
                <div
                  className={`flex flex-col items-end max-w-[76%] ml-auto ${sameAsPrev ? 'mt-1' : 'mt-4'}`}
                >
                  {!sameAsPrev && (
                    <div className="flex items-center gap-2 mr-0.5 mb-1">
                      <span className="text-[10px] text-stone-700 font-mono">
                        {formatTime(msg.created_at)}
                      </span>
                      {isBot ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-400">
                          <Bot size={10} />
                          {msg.ai_agent_name ?? 'Agente IA'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500">
                          {msg.sender_name ?? 'Você'}
                        </span>
                      )}
                    </div>
                  )}

                  <div
                    className={`px-3.5 py-2.5 rounded-2xl rounded-tr-[6px] shadow-sm ${
                      isBot
                        ? 'bg-indigo-600/85 text-white border border-indigo-500/30'
                        : 'bg-white text-stone-900'
                    }`}
                  >
                    <MessageContent msg={msg} isDark={isBot} />
                  </div>

                  {/* Status */}
                  {!isBot && !sameAsPrev && (
                    <div className="flex items-center gap-1 mt-0.5 mr-0.5">
                      <StatusIcon status={msg.status} />
                      {msg.status === 'failed' && (
                        <span className="text-[10px] text-rose-500 font-mono">falha</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div ref={bottomRef} className="h-8" />
    </div>
  );
};
