import type { FollowUpBlockReason, FollowUpCycleStatus, FollowUpFollowType } from '../../types';

// ── Block reason → label pt-BR ────────────────────────────────────────────────

const BLOCK_REASON_LABELS: Record<string, string> = {
  ok: 'Disponível',
  opt_out: 'Contato solicitou pausa',
  max_attempts_reached: 'Limite de tentativas atingido',
  min_interval_not_elapsed: 'Próximo follow ainda não liberado',
  human_recently_engaged: 'Humano assumiu recentemente',
  outside_business_hours: 'Fora do horário comercial',
  autopilot_disabled: 'Autopilot desativado',
  cycle_stopped: 'Ciclo encerrado',
  contact_not_found: 'Contato não encontrado',
  conversation_not_found: 'Conversa não encontrada',
  deal_not_found: 'Negócio não encontrado',
  invalid_channel: 'Canal inválido',
};

export function getBlockReasonLabel(reason: FollowUpBlockReason): string {
  if (!reason || reason === 'ok') return 'Disponível';
  return BLOCK_REASON_LABELS[reason] ?? reason;
}

// ── Cycle status → label pt-BR ────────────────────────────────────────────────

const CYCLE_STATUS_LABELS: Record<string, string> = {
  active: 'Ciclo ativo',
  paused: 'Pausado',
  stopped: 'Encerrado',
  responded: 'Contato respondeu',
  completed: 'Concluído',
};

export function getCycleStatusLabel(status: FollowUpCycleStatus): string {
  if (!status) return 'Sem ciclo';
  return CYCLE_STATUS_LABELS[status] ?? status;
}

// ── Follow type → label pt-BR ─────────────────────────────────────────────────

const FOLLOW_TYPE_LABELS: Record<FollowUpFollowType, string> = {
  agent_auto: 'IA',
  cadence_step: 'Cadência',
  human_manual: 'Manual',
  human_bulk: 'Manual em lote',
  system_rescue: 'Resgate',
};

export function getFollowTypeLabel(type: FollowUpFollowType): string {
  return FOLLOW_TYPE_LABELS[type] ?? type;
}

// ── Event status → label pt-BR ────────────────────────────────────────────────

const EVENT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado',
  sent: 'Enviado',
  delivered: 'Entregue',
  failed: 'Falhou',
  cancelled: 'Cancelado',
  responded: 'Respondido',
  expired: 'Expirado',
  stopped: 'Encerrado',
};

export function getEventStatusLabel(status: string): string {
  return EVENT_STATUS_LABELS[status] ?? status;
}

// ── Attempt badge text ─────────────────────────────────────────────────────────

export function getAttemptLabel(attemptCount: number, maxAttempts: number): string {
  if (attemptCount === 0) return 'Sem follow';
  if (attemptCount >= maxAttempts) return 'Limite atingido';
  return `Follow ${attemptCount}/${maxAttempts}`;
}

// ── Relative time helpers ──────────────────────────────────────────────────────

export function formatRelativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const days = Math.floor(absDiff / 86400000);
  const hrs = Math.floor(absDiff / 3600000);
  const mins = Math.floor(absDiff / 60000);

  if (diff > 0) {
    if (days > 0) return `em ${days}d`;
    if (hrs > 0) return `em ${hrs}h`;
    return `em ${mins}min`;
  }
  if (days > 0) return `há ${days}d`;
  if (hrs > 0) return `há ${hrs}h`;
  return `há ${mins}min`;
}

export function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
