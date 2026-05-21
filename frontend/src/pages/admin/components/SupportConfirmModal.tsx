import React, { useEffect } from 'react';
import { X, Zap, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import type { RealTenant } from '../adminTypes';

interface SupportConfirmModalProps {
  tenant: RealTenant;
  onConfirm: () => void;
  onClose: () => void;
}

export const SupportConfirmModal: React.FC<SupportConfirmModalProps> = ({
  tenant, onConfirm, onClose,
}) => {
  const { user } = useAuth();
  const adminEmail = user?.email ?? '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md bg-[#141415] border border-white/[0.1] rounded-2xl shadow-2xl"
          style={{ animation: 'cardIn 0.25s cubic-bezier(0.16,1,0.3,1) both' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-modal-title"
        >
          <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/15 text-orange-400">
                <Zap size={16} />
              </div>
              <h2 id="support-modal-title" className="text-base font-semibold text-white">
                Entrar como suporte
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/20">
              <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-300/90 leading-relaxed">
                Você entrará na conta de <strong className="text-white">{tenant.name}</strong> como{' '}
                <span className="font-mono text-amber-400">{adminEmail}</span>.
                Suas ações ficam registradas no log de auditoria.
              </p>
            </div>

            <p className="text-sm text-zinc-400">
              O modo suporte permite visualizar e operar o tenant em nome do administrador.
              Um banner persistente será exibido enquanto estiver no modo suporte.
            </p>
          </div>

          <div className="flex gap-3 p-5 pt-0">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm text-zinc-400 border border-white/[0.1] rounded-xl hover:bg-white/[0.04] hover:text-white transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 text-sm font-semibold bg-orange-500 text-black rounded-xl hover:bg-orange-400 transition-all flex items-center justify-center gap-2"
            >
              <Zap size={14} />
              Entrar como {tenant.name}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
