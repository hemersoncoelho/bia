import React, { useState, useEffect, useRef } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { uazapiService } from '../../services/uazapiService';
import { X, Loader2, Smartphone, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface WhatsAppConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const WhatsAppConnectModal: React.FC<WhatsAppConnectModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { currentCompany } = useTenant();
  const [step, setStep] = useState<'method_selection' | 'loading' | 'qrcode' | 'paircode' | 'connected' | 'error'>('loading');
  const [errorDetails, setErrorDetails] = useState('');
  const [phone, setPhone] = useState('');
  const [pairingMethod, setPairingMethod] = useState<'qrcode' | 'paircode'>('qrcode');
  
  // Status from API
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [pairCodeData, setPairCodeData] = useState<string | null>(null);
  
  // Polling ref
  const pollingInterval = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen && currentCompany) {
      checkInitialStatus();
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [isOpen]);

  const stopPolling = () => {
    if (pollingInterval.current) {
      window.clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    // Poll every 3 seconds
    pollingInterval.current = window.setInterval(async () => {
      try {
        if (!currentCompany) return;
        const res = await uazapiService.getStatus(currentCompany.id);
        
        if (res.status === 'connected') {
           stopPolling();
           setStep('connected');
           onSuccess(); // refresh parent
        } else if (res.status === 'connecting') {
           if (res.qrcode && res.qrcode !== qrCodeData) {
              setQrCodeData(res.qrcode);
           }
        } else if (res.status === 'disconnected') {
           stopPolling();
           setErrorDetails('A conexão foi perdida ou o QR Code expirou. Tente novamente.');
           setStep('error');
        }
      } catch (err: any) {
        console.error("Polling error", err);
      }
    }, 3000);
  };

  const checkInitialStatus = async () => {
    try {
      setStep('loading');
      setErrorDetails('');
      const res = await uazapiService.getStatus(currentCompany!.id);
      
      if (res.status === 'connected') {
        setStep('connected');
      } else if (res.status === 'connecting') {
        // Already trying to connect previously
        if (res.paircode) {
          setPairCodeData(res.paircode);
          setStep('paircode');
        } else if (res.qrcode) {
          setQrCodeData(res.qrcode);
          setStep('qrcode');
        } else {
          setStep('method_selection');
        }
        startPolling();
      } else {
        // Completely disconnected, show method selection
        setStep('method_selection');
      }
    } catch (err: any) {
      setErrorDetails(err.message || 'Erro ao consultar status da instância.');
      setStep('error');
    }
  };

  const handleInitAndConnect = async () => {
    try {
      if (!currentCompany) return;
      setStep('loading');
      setErrorDetails('');

      // 1. Init (cria se nao existir)
      await uazapiService.init(currentCompany.id);
      
      // 2. Connect
      const res = await uazapiService.connect(
        currentCompany.id, 
        pairingMethod === 'paircode' ? phone : undefined
      );

      if (res.paircode) {
         setPairCodeData(res.paircode);
         setStep('paircode');
      } else if (res.qrcode) {
         setQrCodeData(res.qrcode);
         setStep('qrcode');
      } else {
         throw new Error("Não foi possível gerar QR Code ou Pair Code.");
      }

      startPolling();

    } catch (err: any) {
      stopPolling();
      setErrorDetails(err.message || 'Erro ao inicializar e conectar instância.');
      setStep('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-base border border-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-surface/50">
          <div>
            <h2 className="text-lg font-medium text-primary flex items-center gap-2">
              <Smartphone size={18} className="text-emerald-400" /> WhatsApp Business
            </h2>
            <p className="text-xs text-text-muted mt-1">
              Conecte sua instância oficial via UAZAPI.
            </p>
          </div>
          <button 
             onClick={onClose}
             className="text-stone-400 hover:text-white transition-colors p-2 rounded-md hover:bg-surface"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
           
           {step === 'loading' && (
             <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <Loader2 size={32} className="text-emerald-500 animate-spin" />
                <p className="text-sm font-medium text-stone-300">Consultando status da instância...</p>
             </div>
           )}

           {step === 'method_selection' && (
             <div className="space-y-6">
                <div className="space-y-3">
                   <h3 className="text-sm font-medium text-primary">Escolha o método de conexão</h3>
                   
                   <label className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${pairingMethod === 'qrcode' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-surface border-border hover:border-stone-600'}`}>
                      <input type="radio" className="mt-1 flex-shrink-0" name="pair_method" checked={pairingMethod === 'qrcode'} onChange={() => setPairingMethod('qrcode')} />
                      <div>
                         <p className={`text-sm font-medium ${pairingMethod === 'qrcode' ? 'text-emerald-400' : 'text-primary'}`}>QR Code (Recomendado)</p>
                         <p className="text-xs text-text-muted mt-1">Escaneie o código diretamente do aplicativo do WhatsApp no seu celular principal.</p>
                      </div>
                   </label>

                   <label className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${pairingMethod === 'paircode' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-surface border-border hover:border-stone-600'}`}>
                      <input type="radio" className="mt-1 flex-shrink-0" name="pair_method" checked={pairingMethod === 'paircode'} onChange={() => setPairingMethod('paircode')} />
                      <div>
                         <p className={`text-sm font-medium ${pairingMethod === 'paircode' ? 'text-emerald-400' : 'text-primary'}`}>Código de Pareamento</p>
                         <p className="text-xs text-text-muted mt-1">Informe seu número para gerar um código de 8 dígitos para inserir no WhatsApp.</p>
                      </div>
                   </label>
                </div>

                {pairingMethod === 'paircode' && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                     <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Número do WhatsApp</label>
                     <input 
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="Ex: 5511999999999"
                        className="w-full bg-surface border border-border rounded-lg p-3 text-sm text-primary focus:border-emerald-500/50 outline-none transition-all"
                     />
                  </div>
                )}

                <button 
                  onClick={handleInitAndConnect}
                  disabled={pairingMethod === 'paircode' && phone.length < 10}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Gerar Conexão
                </button>
             </div>
           )}

           {step === 'qrcode' && qrCodeData && (
             <div className="flex flex-col items-center justify-center space-y-6">
               <div className="bg-white p-4 rounded-xl shadow-lg border-4 border-emerald-500/20">
                 {/* Remove the data:image/png;base64 prefix if UAZAPI already includes it, or add if it doesn't */}
                 <img 
                    src={qrCodeData.startsWith('data:image') ? qrCodeData : `data:image/png;base64,${qrCodeData}`} 
                    alt="WhatsApp QR Code" 
                    className="w-48 h-48 object-contain"
                 />
               </div>
               <div className="text-center space-y-2">
                 <h3 className="text-lg font-medium text-emerald-400">Escaneie o QR Code</h3>
                 <ol className="text-xs text-stone-400 text-left space-y-1.5 bg-surface p-4 rounded-lg list-decimal list-inside">
                    <li>Abra o WhatsApp no seu celular</li>
                    <li>Vá em <strong>Aparelhos Conectados</strong></li>
                    <li>Toque em <strong>Conectar um aparelho</strong></li>
                    <li>Aponte a câmera para esta tela</li>
                 </ol>
               </div>
               <div className="flex items-center gap-2 text-xs text-stone-400">
                  <Loader2 size={14} className="animate-spin text-emerald-500" />
                  Aguardando leitura... (Status atualizará automaticamente)
               </div>
             </div>
           )}

           {step === 'paircode' && pairCodeData && (
             <div className="flex flex-col items-center justify-center space-y-6 text-center">
               <div className="bg-surface border border-border px-8 py-6 rounded-2xl w-full">
                 <p className="text-xs text-stone-400 mb-3 uppercase tracking-widest font-semibold">Seu Código</p>
                 <div className="text-4xl font-mono text-emerald-400 tracking-[0.2em] font-bold">
                    {pairCodeData.match(/.{1,4}/g)?.join('-') || pairCodeData}
                 </div>
               </div>
               <div className="text-center space-y-2">
                 <h3 className="text-lg font-medium text-primary">Aguardando Pareamento</h3>
                 <ol className="text-xs text-stone-400 text-left space-y-1.5 bg-surface p-4 rounded-lg list-decimal list-inside">
                    <li>Você receberá uma notificação no WhatsApp oficial</li>
                    <li>Toque na notificação (ou vá em Aparelhos Conectados)</li>
                    <li>Confirme a tentativa e insira o código acima</li>
                 </ol>
               </div>
               <div className="flex items-center gap-2 text-xs text-stone-400">
                  <Loader2 size={14} className="animate-spin text-emerald-500" />
                  Aguardando confirmação no celular...
               </div>
             </div>
           )}

           {step === 'connected' && (
             <div className="flex flex-col items-center justify-center py-6 space-y-5 text-center">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center border-4 border-emerald-500/20">
                   <CheckCircle2 size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-primary">Instância Conectada!</h3>
                  <p className="text-sm text-text-muted mt-1">O WhatsApp está pronto para enviar e receber mensagens.</p>
                </div>
                <button 
                  onClick={onClose}
                  className="px-6 py-2.5 bg-surface border border-border hover:bg-white/5 text-primary text-sm font-medium rounded-lg transition-colors"
                >
                  Concluir
                </button>
             </div>
           )}

           {step === 'error' && (
             <div className="flex flex-col items-center justify-center py-6 space-y-5 text-center">
                <div className="w-16 h-16 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center border-4 border-rose-500/20">
                   <AlertCircle size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-rose-400">Falha na Conexão</h3>
                  <p className="text-sm text-stone-400 mt-2 max-w-xs mx-auto">{errorDetails}</p>
                </div>
                <button 
                  onClick={checkInitialStatus}
                  className="flex items-center gap-2 px-6 py-2.5 bg-surface border border-border hover:bg-white/5 text-primary text-sm font-medium rounded-lg transition-colors"
                >
                  <RefreshCw size={16} /> Tentar Novamente
                </button>
             </div>
           )}

        </div>
      </div>
    </div>
  );
};
