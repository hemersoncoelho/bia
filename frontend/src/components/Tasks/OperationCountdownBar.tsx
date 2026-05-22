import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

interface Props {
  sendAt: string;
  /** Mostra a barra apenas quando a operação está a menos de `thresholdMs` ms. Padrão: 60 min. */
  thresholdMs?: number;
  className?: string;
}

/**
 * Barra fina de countdown para operações iminentes.
 *
 * Regras:
 * - Aparece apenas quando send_at está dentro do threshold (padrão 60 min).
 * - É apenas indicação visual — a execução real fica no backend/n8n.
 * - Respeita prefers-reduced-motion: sem animação se a preferência estiver ativa.
 * - Não é fonte de verdade para execução.
 */
export const OperationCountdownBar: React.FC<Props> = ({
  sendAt,
  thresholdMs = 60 * 60 * 1000,
  className,
}) => {
  const [pct, setPct] = useState<number | null>(null);
  const [timeLabel, setTimeLabel] = useState('');

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const target = new Date(sendAt).getTime();
      const remaining = target - now;

      if (remaining <= 0 || remaining > thresholdMs) {
        setPct(null);
        return;
      }

      const fraction = 1 - remaining / thresholdMs;
      setPct(Math.min(100, Math.max(0, Math.round(fraction * 100))));

      const mins = Math.ceil(remaining / 60000);
      setTimeLabel(mins <= 1 ? 'menos de 1 min' : `${mins} min`);
    };

    update();
    const id = window.setInterval(update, 15_000);
    return () => window.clearInterval(id);
  }, [sendAt, thresholdMs]);

  if (pct === null) return null;

  return (
    <div
      className={cn('flex flex-col gap-0.5', className)}
      aria-label={`Executa em ${timeLabel}`}
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] font-medium text-orange-400 uppercase tracking-wide">
          Iminente
        </span>
        <span className="font-mono text-[9px] text-stone-500">{timeLabel}</span>
      </div>
      <div
        className="h-0.5 w-full overflow-hidden rounded-full bg-orange-500/15"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full rounded-full bg-orange-400',
            /* Sem animação se prefers-reduced-motion estiver ativa */
            'motion-safe:transition-[width] motion-safe:duration-[15000ms] motion-safe:ease-linear',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
