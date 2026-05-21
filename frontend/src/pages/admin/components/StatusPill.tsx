import React from 'react';
import { STATUS_CFG } from '../adminUtils';
import type { TenantStatus } from '../adminTypes';

interface StatusPillProps {
  status: TenantStatus | string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  const cfg = STATUS_CFG[status as TenantStatus] ?? STATUS_CFG.no_plan;
  const pulse = status === 'active';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} ${pulse ? 'shadow-[0_0_8px_currentColor]' : ''}`} />
      {cfg.label}
    </span>
  );
};
