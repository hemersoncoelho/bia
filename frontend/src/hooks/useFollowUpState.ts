import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import type { FollowUpState, FollowUpHistoryItem } from '../types';

// ── Tipos locais ──────────────────────────────────────────────────────────────

interface UseFollowUpStateParams {
  contactId: string | null | undefined;
  conversationId?: string | null;
  dealId?: string | null;
}

export interface UseFollowUpStateReturn {
  data: FollowUpState | null;
  history: FollowUpHistoryItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  stopCycle: (reason?: string) => Promise<{ success: boolean; error?: string }>;
}

// ── Helpers de label (computados no hook, não no componente) ──────────────────

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const hrs = Math.floor(absDiff / 3600000);
  const mins = Math.floor(absDiff / 60000);
  const days = Math.floor(absDiff / 86400000);

  if (diff > 0) {
    if (days > 0) return `em ${days}d`;
    if (hrs > 0) return `em ${hrs}h`;
    return `em ${mins}min`;
  }
  if (days > 0) return `há ${days}d`;
  if (hrs > 0) return `há ${hrs}h`;
  return `há ${mins}min`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFollowUpState({
  contactId,
  conversationId,
  dealId,
}: UseFollowUpStateParams): UseFollowUpStateReturn {
  const { currentCompany } = useTenant();
  const companyId = currentCompany?.id ?? null;

  const [data, setData] = useState<FollowUpState | null>(null);
  const [history, setHistory] = useState<FollowUpHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGenRef = useRef(0);

  const fetchState = useCallback(async () => {
    if (!companyId || !contactId) {
      setData(null);
      setHistory([]);
      return;
    }

    setIsLoading(true);
    const gen = ++fetchGenRef.current;

    try {
      // ── Busca estado do ciclo via RPC ──────────────────────────────────────
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'rpc_get_follow_up_state',
        {
          p_company_id: companyId,
          p_contact_id: contactId,
          p_conversation_id: conversationId ?? null,
          p_deal_id: dealId ?? null,
        },
      );

      if (gen !== fetchGenRef.current) return;

      if (rpcError) {
        console.warn('[useFollowUpState] rpc_get_follow_up_state error:', rpcError.message);
        setError('Estado de follow indisponível');
        setData(null);
      } else {
        setError(null);
        setData((rpcData as FollowUpState) ?? null);
      }

      // ── Busca histórico de eventos ─────────────────────────────────────────
      let historyQuery = supabase
        .from('follow_up_events')
        .select('id, follow_type, channel, attempt_number, status, sent_at, next_allowed_at, attribution_until, responded_at, stopped_reason')
        .eq('company_id', companyId)
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false })
        .limit(20);

      if (conversationId) {
        historyQuery = historyQuery.eq('conversation_id', conversationId);
      } else if (dealId) {
        historyQuery = historyQuery.eq('deal_id', dealId);
      }

      const { data: histData, error: histError } = await historyQuery;

      if (gen !== fetchGenRef.current) return;

      if (histError) {
        console.warn('[useFollowUpState] history fetch error:', histError.message);
      } else {
        setHistory((histData ?? []) as FollowUpHistoryItem[]);
      }
    } finally {
      if (gen === fetchGenRef.current) setIsLoading(false);
    }
  }, [companyId, contactId, conversationId, dealId]);

  const fetchStateRef = useRef(fetchState);
  useEffect(() => { fetchStateRef.current = fetchState; });

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const refetch = useCallback(() => { void fetchStateRef.current(); }, []);

  // ── Ação: parar ciclo ──────────────────────────────────────────────────────
  const stopCycle = useCallback(async (reason = 'manual_cancel'): Promise<{ success: boolean; error?: string }> => {
    if (!companyId || !contactId) return { success: false, error: 'no_context' };

    const { data: result, error: rpcError } = await supabase.rpc(
      'rpc_stop_follow_up_cycle',
      {
        p_company_id: companyId,
        p_contact_id: contactId,
        p_conversation_id: conversationId ?? null,
        p_deal_id: dealId ?? null,
        p_reason: reason,
      },
    );

    if (rpcError) {
      console.warn('[useFollowUpState] rpc_stop_follow_up_cycle error:', rpcError.message);
      return { success: false, error: rpcError.message };
    }

    const r = result as { success: boolean; error?: string } | null;
    if (!r?.success) return { success: false, error: r?.error ?? 'unknown' };

    void fetchStateRef.current();
    return { success: true };
  }, [companyId, contactId, conversationId, dealId]);

  return { data, history, isLoading, error, refetch, stopCycle };
}

// ── Export de helpers de label (reutilizáveis nos componentes) ────────────────

export { formatRelativeTime };
