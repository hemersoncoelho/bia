import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { X, Send, Plus, Loader2 } from 'lucide-react';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (conversationId: string, sendError?: string) => void;
}

export const NewConversationModal: React.FC<NewConversationModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const { currentCompany } = useTenant();

  const [contactName, setContactName] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'email' | 'instagram' | 'telegram' | 'webchat'>('whatsapp');
  const [identity, setIdentity] = useState('');
  const [message, setMessage] = useState('');

  const IDENTITY_PLACEHOLDER: Record<string, string> = {
    whatsapp: '+55 11 99999-9999',
    email: 'cliente@email.com',
    instagram: '@usuario',
    telegram: '@usuario',
    webchat: 'ID do visitante',
  };
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentCompany) return;
    
    setErrorMsg('');
    setLoading(true);

    try {
       const { data, error } = await supabase.rpc('rpc_create_contact_and_conversation', {
          p_company_id: currentCompany.id,
          p_contact_name: contactName,
          p_channel: channel,
          p_identity: identity,
          p_initial_message: message,
          p_agent_id: user.id
       });

       if (error) throw error;
       if (!data?.success) throw new Error(data?.error || 'Failed to create conversation');

       // Se o número já tem uma conversa aberta → vai direto para ela (sem enviar WhatsApp)
       if (data.reused) {
          setContactName('');
          setIdentity('');
          setMessage('');
          onSuccess(data.conversation_id);
          onClose();
          setLoading(false);
          return;
       }

       // Despachar mensagem via UAZAPI quando canal for WhatsApp
       if (channel === 'whatsapp' && data.message_id != null) {
          const msgId = typeof data.message_id === 'string' ? Number(data.message_id) : data.message_id;
          const { data: { session } } = await supabase.auth.getSession();
          const { error: fnError, data: fnData } = await supabase.functions.invoke<{ success: boolean; error?: string }>('send-whatsapp-message', {
             body: {
                conversation_id: data.conversation_id,
                message_id: msgId,
                body: message,
             },
             headers: session?.access_token
               ? { Authorization: `Bearer ${session.access_token}` }
               : undefined,
          });
          if (fnError || !fnData?.success) {
             const err = fnData?.error || fnError?.message || 'Falha ao enviar no WhatsApp.';
             console.warn('[send-whatsapp-message]', err);
             setContactName('');
             setIdentity('');
             setMessage('');
             onSuccess(data.conversation_id, err);
             onClose();
             setLoading(false);
             return;
          }
       }

       // Success! Reset form and notify parent
       setContactName('');
       setIdentity('');
       setMessage('');
       onSuccess(data.conversation_id);
       onClose();

    } catch (err: any) {
       console.error("New conversation error:", err);
       setErrorMsg(err.message || 'Ocorreu um erro ao criar a conversa.');
    } finally {
       setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-base border border-border w-full max-w-lg rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-surface/50">
          <div>
             <h2 className="text-lg font-medium text-emerald-400 flex items-center gap-2">
                <Plus size={18} /> Novo Atendimento
             </h2>
             <p className="text-xs text-text-muted mt-1">
                Inicie uma nova conversa outbound com um cliente.
             </p>
          </div>
          <button 
             onClick={onClose}
             disabled={loading}
             className="text-stone-400 hover:text-white transition-colors p-2 rounded-md hover:bg-surface"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col p-6 space-y-4">
          
          {errorMsg && (
             <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm p-3 rounded-lg">
                {errorMsg}
             </div>
          )}

          <div className="space-y-1">
             <label className="text-xs font-semibold text-stone-400 tracking-wider uppercase">Nome do Contato</label>
             <input 
                required
                disabled={loading}
                type="text" 
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                autoFocus
                className="w-full bg-surface border border-border rounded-lg p-2.5 text-sm text-primary focus:border-stone-500 focus:ring-1 focus:ring-stone-500/50 outline-none transition-all"
                placeholder="Ex: João da Silva"
             />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1">
                 <label className="text-xs font-semibold text-stone-400 tracking-wider uppercase">Canal</label>
                 <select 
                    disabled={loading}
                    value={channel}
                    onChange={e => {
                      setChannel(e.target.value as typeof channel);
                      setIdentity('');
                    }}
                    className="w-full bg-surface border border-border rounded-lg p-2.5 text-sm text-primary focus:border-stone-500 focus:ring-1 focus:ring-stone-500/50 outline-none transition-all appearance-none"
                 >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">E-mail</option>
                    <option value="instagram">Instagram</option>
                    <option value="telegram">Telegram</option>
                    <option value="webchat">Webchat</option>
                 </select>
             </div>
             
             <div className="space-y-1">
                 <label className="text-xs font-semibold text-stone-400 tracking-wider uppercase">Identificador</label>
                 <input 
                    required
                    disabled={loading}
                    type={channel === 'email' ? 'email' : 'text'}
                    value={identity}
                    onChange={e => setIdentity(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg p-2.5 text-sm text-primary focus:border-stone-500 focus:ring-1 focus:ring-stone-500/50 outline-none transition-all"
                    placeholder={IDENTITY_PLACEHOLDER[channel]}
                 />
             </div>
          </div>

          <div className="space-y-1 pt-2">
             <label className="text-xs font-semibold text-stone-400 tracking-wider uppercase">Mensagem Inicial</label>
             <textarea 
                required
                disabled={loading}
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg p-2.5 text-sm text-primary focus:border-stone-500 focus:ring-1 focus:ring-stone-500/50 outline-none transition-all resize-none custom-scrollbar"
                placeholder="Ex: Olá João, tudo bem? Aqui é o consultor da Acme Corp..."
             />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 mt-2 flex justify-end gap-3 border-t border-border/50">
             <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-stone-300 hover:text-white transition-colors"
             >
                Cancelar
             </button>
             <button
                type="submit"
                disabled={loading || !contactName.trim() || !identity.trim() || !message.trim()}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
             >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Iniciar Atendimento
             </button>
          </div>

        </form>
      </div>
    </div>
  );
};
