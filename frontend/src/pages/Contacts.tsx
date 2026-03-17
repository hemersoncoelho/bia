import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Search, X, RefreshCw, Users, Plus, Phone, Mail,
  MessageSquare, Instagram, ChevronRight, AlertCircle,
  Calendar, Hash,
} from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { useDebounce } from '../hooks/useDebounce';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

type LifecycleStage = 'lead' | 'qualified' | 'opportunity' | 'customer' | 'lost';

interface ContactIdentity {
  id: string;
  provider: string;
  identifier: string;
  channel_type?: string;
  display_value?: string;
  is_primary?: boolean;
}

interface Contact {
  id: string;
  company_id: string;
  full_name: string | null;
  lifecycle_stage: LifecycleStage;
  status: string;
  source: string | null;
  notes: string | null;
  last_interaction_at: string | null;
  created_at: string;
  updated_at: string;
  contact_identities: ContactIdentity[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const LIFECYCLE_LABELS: Record<LifecycleStage, string> = {
  lead: 'Lead',
  qualified: 'Qualificado',
  opportunity: 'Oportunidade',
  customer: 'Cliente',
  lost: 'Perdido',
};

const LIFECYCLE_BADGE: Record<LifecycleStage, string> = {
  lead: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  qualified: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  opportunity: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  customer: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  lost: 'text-stone-500 bg-stone-500/10 border-stone-500/20',
};

const LIFECYCLE_DOT: Record<LifecycleStage, string> = {
  lead: 'bg-sky-400',
  qualified: 'bg-violet-400',
  opportunity: 'bg-amber-400',
  customer: 'bg-emerald-400',
  lost: 'bg-stone-500',
};

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  whatsapp: <Phone size={12} />,
  email: <Mail size={12} />,
  instagram: <Instagram size={12} />,
  webchat: <MessageSquare size={12} />,
  telegram: <MessageSquare size={12} />,
};

const CHANNEL_COLOR: Record<string, string> = {
  whatsapp: 'text-emerald-400 bg-emerald-400/10',
  email: 'text-blue-400 bg-blue-400/10',
  instagram: 'text-pink-400 bg-pink-400/10',
  webchat: 'text-violet-400 bg-violet-400/10',
  telegram: 'text-sky-400 bg-sky-400/10',
};

const ALL_STAGES: LifecycleStage[] = ['lead', 'qualified', 'opportunity', 'customer', 'lost'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

// ── Contact Detail Panel ─────────────────────────────────────────────────────

interface ContactDetailPanelProps {
  contact: Contact;
  onClose: () => void;
}

const ContactDetailPanel: React.FC<ContactDetailPanelProps> = ({ contact, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stage = (contact.lifecycle_stage ?? 'lead') as LifecycleStage;
  const badge = LIFECYCLE_BADGE[stage] ?? LIFECYCLE_BADGE.lead;
  const dot   = LIFECYCLE_DOT[stage]  ?? LIFECYCLE_DOT.lead;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-[#141415] border-l border-[#27272A] z-50 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-[#27272A] shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/[0.08] border border-[#27272A] flex items-center justify-center text-sm font-bold text-stone-300 uppercase shrink-0">
              {getInitials(contact.full_name)}
            </div>
            <div>
              <h2 className="text-base font-semibold text-white leading-snug">
                {contact.full_name || 'Sem nome'}
              </h2>
              <span className={cn(
                'inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest border rounded px-2 py-0.5 mt-1',
                badge
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
                {LIFECYCLE_LABELS[stage]}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-stone-500 hover:text-white transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#27272A]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272A transparent' }}>

          {/* Canais de contato */}
          {contact.contact_identities.length > 0 && (
            <div className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">Canais</p>
              <div className="space-y-2">
                {contact.contact_identities.map(id => {
                  const ch = id.channel_type ?? id.provider;
                  const val = id.display_value ?? id.identifier;
                  return (
                    <div key={id.id} className="flex items-center gap-3">
                      <span className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium shrink-0',
                        CHANNEL_COLOR[ch] ?? 'text-stone-400 bg-stone-400/10'
                      )}>
                        {CHANNEL_ICON[ch] ?? <Hash size={12} />}
                        {ch}
                      </span>
                      <span className="text-sm text-stone-300 font-mono truncate">{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Origem */}
          {contact.source && (
            <div className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-1.5">Origem</p>
              <p className="text-sm text-stone-300">{contact.source}</p>
            </div>
          )}

          {/* Notas */}
          {contact.notes && (
            <div className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-1.5">Notas</p>
              <p className="text-sm text-stone-300 leading-relaxed whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}

          {/* Linha do tempo */}
          <div className="p-5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-4">Linha do Tempo</p>
            <div className="relative space-y-4 pl-4">
              <div className="absolute left-1.5 top-1 bottom-1 w-px bg-[#27272A]" />

              <div className="relative flex items-start gap-3">
                <div className="absolute -left-[11px] w-2 h-2 rounded-full bg-[#27272A] border border-[#3A3A3C] mt-1 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-stone-300">Contato criado</p>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-stone-600">
                    <Calendar size={10} />
                    <span>{formatDate(contact.created_at)}</span>
                  </div>
                </div>
              </div>

              {contact.last_interaction_at && (
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-[11px] w-2 h-2 rounded-full bg-stone-700 border border-stone-600 mt-1 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-stone-300">Última interação</p>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-stone-600">
                      <Calendar size={10} />
                      <span>{formatDate(contact.last_interaction_at)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#27272A] shrink-0">
          <p className="text-[10px] text-stone-700 font-mono text-center">
            ID: {contact.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
      </div>
    </>
  );
};

// ── New Contact Modal ─────────────────────────────────────────────────────────

interface NewContactModalProps {
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const NewContactModal: React.FC<NewContactModalProps> = ({ companyId, onClose, onSuccess }) => {
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [stage, setStage]       = useState<LifecycleStage>('lead');
  const [channel, setChannel]   = useState('whatsapp');
  const [identifier, setIdentifier] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const { data: contact, error: contactErr } = await supabase
        .from('contacts')
        .insert({ company_id: companyId, full_name: fullName.trim(), status: stage === 'lead' ? 'lead' : stage === 'lost' ? 'inactive' : 'active' })
        .select('id')
        .single();

      if (contactErr) throw contactErr;

      if (identifier.trim()) {
        const value = identifier.trim();
        await supabase.from('contact_identities').insert({
          contact_id: contact.id,
          channel_type: channel,
          normalized_value: value,
          display_value: value,
          is_primary: true,
        });
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar contato.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-[#1C1C1E] border border-[#3A3A3C] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-stone-500 transition-colors';

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[#141415] border border-[#27272A] rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Novo Contato</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-stone-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-stone-500 mb-1.5">Nome Completo *</label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Ex: Rafael Mendes"
              className={inputCls}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-stone-500 mb-1.5">Estágio</label>
            <select value={stage} onChange={e => setStage(e.target.value as LifecycleStage)} className={inputCls}>
              {ALL_STAGES.map(s => (
                <option key={s} value={s}>{LIFECYCLE_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-stone-500 mb-1.5">Canal de Contato</label>
            <div className="flex gap-2">
              <select value={channel} onChange={e => setChannel(e.target.value)} className={cn(inputCls, 'w-36 shrink-0')}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
                <option value="instagram">Instagram</option>
                <option value="webchat">WebChat</option>
                <option value="telegram">Telegram</option>
              </select>
              <input
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder={channel === 'email' ? 'email@exemplo.com' : channel === 'whatsapp' ? '+5511999999999' : 'identificador'}
                className={cn(inputCls, 'flex-1')}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm text-stone-400 hover:text-white border border-[#27272A] hover:border-stone-500 rounded-lg transition-all">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !fullName.trim()}
              className="flex-1 py-2.5 text-sm font-medium bg-white text-black rounded-lg hover:bg-stone-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Criando...' : 'Criar Contato'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

// ── Contact Row ───────────────────────────────────────────────────────────────

interface ContactRowProps {
  contact: Contact;
  onSelect: (c: Contact) => void;
}

const ContactRow: React.FC<ContactRowProps> = ({ contact, onSelect }) => {
  const stage   = (contact.lifecycle_stage ?? 'lead') as LifecycleStage;
  const badge   = LIFECYCLE_BADGE[stage] ?? LIFECYCLE_BADGE.lead;
  const dot     = LIFECYCLE_DOT[stage]  ?? LIFECYCLE_DOT.lead;
  const primary = contact.contact_identities.find(i => i.is_primary) ?? contact.contact_identities[0];
  const displayVal = primary?.display_value ?? primary?.identifier;

  return (
    <button
      onClick={() => onSelect(contact)}
      className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] border-b border-[#1F1F21] transition-colors group text-left"
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-[#27272A] flex items-center justify-center text-xs font-semibold text-stone-300 uppercase shrink-0">
        {getInitials(contact.full_name)}
      </div>

      {/* Name + identifier */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{contact.full_name || 'Sem nome'}</p>
        {displayVal && (
          <p className="text-[11px] text-stone-500 truncate mt-0.5 font-mono">{displayVal}</p>
        )}
      </div>

      {/* Stage badge */}
      <span className={cn(
        'hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest border rounded px-2 py-0.5 shrink-0',
        badge
      )}>
        <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
        {LIFECYCLE_LABELS[stage]}
      </span>

      {/* Channels */}
      <div className="hidden md:flex items-center gap-1 shrink-0">
        {contact.contact_identities.slice(0, 3).map(id => {
          const ch = id.channel_type ?? id.provider;
          return (
            <span key={id.id} className={cn(
              'flex items-center px-1.5 py-1 rounded text-[10px]',
              CHANNEL_COLOR[ch] ?? 'text-stone-400 bg-stone-400/10'
            )}>
              {CHANNEL_ICON[ch] ?? <Hash size={10} />}
            </span>
          );
        })}
      </div>

      {/* Last interaction */}
      <span className="hidden lg:block text-[11px] text-stone-600 shrink-0 tabular-nums w-24 text-right">
        {contact.last_interaction_at
          ? new Date(contact.last_interaction_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
          : '—'}
      </span>

      <ChevronRight size={14} className="text-stone-700 group-hover:text-stone-400 transition-colors shrink-0" />
    </button>
  );
};

// ── Contacts Page ─────────────────────────────────────────────────────────────

export const Contacts: React.FC = () => {
  const { currentCompany } = useTenant();

  const [contacts, setContacts]         = useState<Contact[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const debouncedSearch = useDebounce(searchQuery, 280);
  const [stageFilter, setStageFilter]   = useState<LifecycleStage | 'all'>('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchContacts = useCallback(async () => {
    if (!currentCompany) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: err } = await supabase
        .from('contacts')
        .select(`
          id, company_id, full_name, status,
          source, notes, last_interaction_at, created_at, updated_at,
          contact_identities (id, channel_type, normalized_value, display_value, is_primary)
        `)
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false });

      if (err) throw err;
      const mapped = (data ?? []).map((c: any) => ({
        ...c,
        lifecycle_stage: (c.lifecycle_stage ?? (c.status === 'lead' ? 'lead' : c.status === 'active' ? 'qualified' : c.status === 'inactive' ? 'lost' : 'lead')) as LifecycleStage,
        contact_identities: (c.contact_identities ?? []).map((ci: any) => ({
          id: ci.id,
          provider: ci.provider ?? ci.channel_type ?? 'unknown',
          identifier: ci.identifier ?? ci.normalized_value ?? ci.display_value ?? '',
          channel_type: ci.channel_type ?? ci.provider,
          display_value: ci.display_value ?? ci.normalized_value ?? ci.identifier,
          is_primary: ci.is_primary ?? true,
        })),
      }));
      setContacts(mapped as Contact[]);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar contatos.');
    } finally {
      setLoading(false);
    }
  }, [currentCompany]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      const matchStage = stageFilter === 'all' || c.lifecycle_stage === stageFilter;
      if (!matchStage) return false;
      if (!debouncedSearch) return true;
      const q = debouncedSearch.toLowerCase();
      const nameMatch = c.full_name?.toLowerCase().includes(q);
      const identityMatch = c.contact_identities.some(id => (id.display_value ?? id.identifier)?.toLowerCase().includes(q));
      return nameMatch || identityMatch;
    });
  }, [contacts, stageFilter, debouncedSearch]);

  const stageCount = useCallback((stage: LifecycleStage) =>
    contacts.filter(c => c.lifecycle_stage === stage).length, [contacts]);

  if (!currentCompany) {
    return (
      <div className="p-8 text-stone-500 font-mono uppercase text-xs tracking-widest text-center mt-20">
        Nenhuma empresa no contexto.
      </div>
    );
  }

  return (
    <div className="flex flex-col reveal active" style={{ height: 'calc(100vh - 112px)' }}>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-[#27272A] pb-5 mb-5 gap-4 shrink-0">
        <div>
          <span className="text-[11px] font-mono uppercase text-stone-500 block mb-2 tracking-widest">
            CRM
          </span>
          <h1 className="text-3xl font-medium tracking-tight text-white flex items-center gap-3">
            <Users size={26} className="text-stone-500 shrink-0" />
            Leads
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={fetchContacts}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-[11px] font-mono uppercase tracking-widest text-stone-500 hover:text-white border border-[#27272A] rounded-lg hover:bg-white/5 transition-all disabled:opacity-40"
          >
            <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
            Atualizar
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-widest bg-white text-black rounded-lg hover:bg-stone-200 transition-all font-semibold"
          >
            <Plus size={13} />
            Novo Contato
          </button>
        </div>
      </div>

      {/* ── Stage filter tabs + search ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 shrink-0">
        {/* Stage tabs */}
        <div className="flex bg-[#141415] border border-[#27272A] rounded-lg p-1 gap-1 flex-wrap">
          <button
            onClick={() => setStageFilter('all')}
            className={cn(
              'px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest rounded transition-all',
              stageFilter === 'all'
                ? 'bg-white text-black font-semibold'
                : 'text-stone-500 hover:text-stone-200'
            )}
          >
            Todos ({contacts.length})
          </button>
          {ALL_STAGES.filter(s => stageCount(s) > 0).map(s => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={cn(
                'px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest rounded transition-all',
                stageFilter === s
                  ? 'bg-white text-black font-semibold'
                  : 'text-stone-500 hover:text-stone-200'
              )}
            >
              {LIFECYCLE_LABELS[s]} ({stageCount(s)})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder='Buscar contato... ( / )'
            className="w-full bg-[#141415] border border-[#27272A] rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-stone-500 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-400">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-lg flex items-center gap-3 shrink-0 text-sm">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
          <button onClick={fetchContacts} className="ml-auto text-xs font-mono uppercase tracking-widest hover:text-rose-300 transition-colors">
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-hidden bg-[#141415] border border-[#27272A] rounded-xl">
        {/* Table header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-[#27272A] shrink-0">
          <div className="w-9 shrink-0" />
          <div className="flex-1 text-[10px] font-mono uppercase tracking-widest text-stone-600">Nome</div>
          <div className="hidden sm:block w-28 text-[10px] font-mono uppercase tracking-widest text-stone-600">Estágio</div>
          <div className="hidden md:block w-24 text-[10px] font-mono uppercase tracking-widest text-stone-600">Canais</div>
          <div className="hidden lg:block w-24 text-right text-[10px] font-mono uppercase tracking-widest text-stone-600">Última Int.</div>
          <div className="w-5 shrink-0" />
        </div>

        {/* Rows */}
        <div className="overflow-y-auto h-[calc(100%-41px)]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272A transparent' }}>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#1F1F21] animate-pulse">
                <div className="w-9 h-9 rounded-full bg-white/[0.06] shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-white/[0.06] rounded w-1/3" />
                  <div className="h-2.5 bg-white/[0.04] rounded w-1/4" />
                </div>
                <div className="hidden sm:block h-5 w-24 bg-white/[0.04] rounded" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-dashed border-[#27272A] flex items-center justify-center mb-4">
                <Users size={22} className="text-stone-600" />
              </div>
              <p className="text-sm font-medium text-stone-500 mb-1">
                {searchQuery || stageFilter !== 'all' ? 'Nenhum resultado' : 'Sem contatos'}
              </p>
              <p className="text-xs text-stone-700 max-w-[200px] leading-relaxed">
                {searchQuery || stageFilter !== 'all'
                  ? 'Tente ajustar os filtros.'
                  : 'Crie o primeiro contato clicando em "+ Novo Contato".'}
              </p>
            </div>
          ) : (
            filtered.map(c => (
              <ContactRow key={c.id} contact={c} onSelect={setSelectedContact} />
            ))
          )}
        </div>
      </div>

      {/* ── Footer count ── */}
      {!loading && filtered.length > 0 && (
        <div className="pt-3 shrink-0">
          <span className="text-[11px] text-stone-600 font-mono">
            {filtered.length} de {contacts.length} contato{contacts.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ── Detail panel ── */}
      {selectedContact && (
        <ContactDetailPanel
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
        />
      )}

      {/* ── New contact modal ── */}
      {showNewModal && (
        <NewContactModal
          companyId={currentCompany.id}
          onClose={() => setShowNewModal(false)}
          onSuccess={() => { setShowNewModal(false); fetchContacts(); }}
        />
      )}
    </div>
  );
};
