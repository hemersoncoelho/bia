import React from 'react';
import { PLAN_CFG } from '../adminUtils';
import type { TenantPlan } from '../adminTypes';

interface PlanTagProps {
  plan: TenantPlan | string;
}

export const PlanTag: React.FC<PlanTagProps> = ({ plan }) => {
  const cfg = PLAN_CFG[plan as TenantPlan] ?? PLAN_CFG.basic;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.swatch}`} />
      {cfg.label}
    </span>
  );
};
