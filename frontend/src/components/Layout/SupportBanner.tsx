import React from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { ShieldAlert } from 'lucide-react';

export const SupportBanner: React.FC = () => {
  const { isSupportMode, disableSupportMode } = useTenant();

  if (!isSupportMode) return null;

  return (
    <button
      onClick={disableSupportMode}
      className="sidebar-nav-item relative group flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 hover:text-amber-400 transition-all duration-200"
    >
      <ShieldAlert size={18} className="shrink-0" strokeWidth={1.8} />
      {/* Pulse dot */}
      <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
      <span className="sidebar-tooltip">Sair do Suporte</span>
    </button>
  );
};
