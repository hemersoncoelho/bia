import React from 'react';
import { Zap } from 'lucide-react';
import type { RealTenant } from '../adminTypes';

interface SupportBannerProps {
  tenant: RealTenant;
  onEnter: () => void;
}

export const SupportBanner: React.FC<SupportBannerProps> = ({ tenant, onEnter }) => (
  <div
    className="rounded-xl p-5 relative overflow-hidden border border-orange-500/20"
    style={{ background: 'radial-gradient(ellipse at 0% 50%, rgba(251,146,60,0.12) 0%, rgba(20,20,21,0) 60%), #141415' }}
  >
    <div className="absolute top-0 left-0 w-40 h-40 rounded-full opacity-10 blur-3xl pointer-events-none"
      style={{ background: '#fb923c', transform: 'translate(-30%, -30%)' }}
    />
    <div className="relative flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400 shrink-0">
          <Zap size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Acesso direto ao tenant</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Entre como admin e opere em nome de {tenant.name}</p>
        </div>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">
        O modo suporte permite visualizar e operar o tenant sem alterar credenciais.
        Todas as ações são registradas no log de auditoria.
      </p>
      <button
        onClick={onEnter}
        className="w-full py-2.5 text-sm font-semibold bg-orange-500 text-black rounded-xl hover:bg-orange-400 transition-all flex items-center justify-center gap-2"
      >
        <Zap size={14} /> Entrar agora
      </button>
    </div>
  </div>
);
