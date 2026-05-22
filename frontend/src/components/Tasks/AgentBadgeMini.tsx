import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  className?: string;
}

/**
 * Badge pill discreto para tarefas e operações originadas por IA/Autopilot.
 * Label: "IA" · tom violet · ícone Sparkles.
 */
export const AgentBadgeMini: React.FC<Props> = ({ className }) => (
  <span
    className={cn(
      'inline-flex items-center gap-0.5 rounded border border-violet-500/25 bg-violet-500/10',
      'px-1 py-px font-mono text-[9px] font-semibold uppercase tracking-wide text-violet-400',
      className,
    )}
    aria-label="Criado por IA"
  >
    <Sparkles size={8} className="shrink-0" />
    IA
  </span>
);
