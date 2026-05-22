import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { AgentOperation, AgentOperationStatus } from '../types';

// ── Tipos locais ──────────────────────────────────────────────────────────────
type MutationResult = { success: boolean; error?: string };

export interface UseAgentOperationsReturn {
  operations: AgentOperation[];
  operationsInQueue: number;
  operationsExecutedToday: number;
  autopilotEnabled: boolean;
  loading: boolean;
  updateMessage: (id: string, message: string) => Promise<MutationResult>;
  reschedule: (id: string, sendAt: string) => Promise<MutationResult>;
  snooze: (id: string, minutes?: number) => Promise<MutationResult>;
  cancel: (id: string) => Promise<MutationResult>;
  toggleAutopilot: () => Promise<MutationResult>;
}

// Status que aparecem no card "Autopilot · operações em curso"
const ACTIVE_STATUSES: AgentOperationStatus[] = ['queued', 'paused', 'needs_reschedule'];

export function useAgentOperations(companyId: string | null): UseAgentOperationsReturn {
  const [operations, setOperations] = useState<AgentOperation[]>([]);
  const [autopilotEnabled, setAutopilotEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  // Ref para evitar race condition em fetches concorrentes
  const fetchGenRef = useRef(0);

  // ── Fetch de operações ─────────────────────────────────────────────────────
  const fetchOperations = useCallback(async () => {
    if (!companyId) { setOperations([]); return; }
    setLoading(true);
    const gen = ++fetchGenRef.current;

    try {
      const { data, error } = await supabase
        .from('agent_operations')
        .select('*')
        .eq('company_id', companyId)
        .in('status', [...ACTIVE_STATUSES, 'sending', 'sent'])
        .order('send_at', { ascending: true });

      if (gen !== fetchGenRef.current) return;
      if (error) {
        // Tabela pode ainda não ter sido criada — falha silenciosa
        console.warn('[useAgentOperations] fetch error:', error.message);
        setOperations([]);
      } else {
        setOperations((data ?? []) as AgentOperation[]);
      }
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, [companyId]);

  const fetchOperationsRef = useRef(fetchOperations);
  useEffect(() => { fetchOperationsRef.current = fetchOperations; });

  // ── Fetch do estado do Autopilot ──────────────────────────────────────────
  const fetchAutopilot = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('companies')
      .select('autopilot_enabled')
      .eq('id', companyId)
      .maybeSingle();
    if (data && typeof (data as Record<string, unknown>).autopilot_enabled === 'boolean') {
      setAutopilotEnabled((data as { autopilot_enabled: boolean }).autopilot_enabled);
    }
  }, [companyId]);

  // ── Bootstrap + realtime ─────────────────────────────────────────────────
  useEffect(() => {
    void fetchOperations();
    void fetchAutopilot();
  }, [fetchOperations, fetchAutopilot]);

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`agent-ops-${companyId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agent_operations',
        filter: `company_id=eq.${companyId}`,
      }, () => { void fetchOperationsRef.current(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  // ── KPIs derivados ────────────────────────────────────────────────────────
  const operationsInQueue = operations.filter(o => o.status === 'queued').length;

  const todayStr = new Date().toDateString();
  const operationsExecutedToday = operations.filter(
    o => o.status === 'sent' && new Date(o.updated_at).toDateString() === todayStr,
  ).length;

  // ── Mutações ──────────────────────────────────────────────────────────────
  const updateMessage = useCallback(async (id: string, message: string): Promise<MutationResult> => {
    if (!companyId) return { success: false, error: 'no_company' };

    // Optimistic update
    setOperations(prev =>
      prev.map(o => o.id === id ? { ...o, message, updated_at: new Date().toISOString() } : o),
    );

    const { data, error } = await supabase.rpc('rpc_update_agent_operation_message', {
      p_company_id: companyId,
      p_operation_id: id,
      p_message: message,
    });

    const result = data as { success: boolean; error?: string } | null;
    if (error || !result?.success) {
      // Rollback
      void fetchOperationsRef.current();
      return { success: false, error: error?.message ?? result?.error ?? 'unknown' };
    }
    return { success: true };
  }, [companyId]);

  const reschedule = useCallback(async (id: string, sendAt: string): Promise<MutationResult> => {
    if (!companyId) return { success: false, error: 'no_company' };

    setOperations(prev =>
      prev.map(o => o.id === id ? { ...o, send_at: sendAt, status: 'queued', updated_at: new Date().toISOString() } : o),
    );

    const { data, error } = await supabase.rpc('rpc_reschedule_agent_operation', {
      p_company_id: companyId,
      p_operation_id: id,
      p_send_at: sendAt,
    });

    const result = data as { success: boolean; error?: string } | null;
    if (error || !result?.success) {
      void fetchOperationsRef.current();
      return { success: false, error: error?.message ?? result?.error ?? 'unknown' };
    }
    return { success: true };
  }, [companyId]);

  const snooze = useCallback(async (id: string, minutes = 60): Promise<MutationResult> => {
    if (!companyId) return { success: false, error: 'no_company' };

    const op = operations.find(o => o.id === id);
    if (op) {
      const newSendAt = new Date(new Date(op.send_at).getTime() + minutes * 60000).toISOString();
      setOperations(prev =>
        prev.map(o => o.id === id ? { ...o, send_at: newSendAt, updated_at: new Date().toISOString() } : o),
      );
    }

    const { data, error } = await supabase.rpc('rpc_snooze_agent_operation', {
      p_company_id: companyId,
      p_operation_id: id,
      p_minutes: minutes,
    });

    const result = data as { success: boolean; error?: string } | null;
    if (error || !result?.success) {
      void fetchOperationsRef.current();
      return { success: false, error: error?.message ?? result?.error ?? 'unknown' };
    }
    return { success: true };
  }, [companyId, operations]);

  const cancel = useCallback(async (id: string): Promise<MutationResult> => {
    if (!companyId) return { success: false, error: 'no_company' };

    setOperations(prev => prev.filter(o => o.id !== id));

    const { data, error } = await supabase.rpc('rpc_cancel_agent_operation', {
      p_company_id: companyId,
      p_operation_id: id,
    });

    const result = data as { success: boolean; error?: string } | null;
    if (error || !result?.success) {
      void fetchOperationsRef.current();
      return { success: false, error: error?.message ?? result?.error ?? 'unknown' };
    }
    return { success: true };
  }, [companyId]);

  const toggleAutopilot = useCallback(async (): Promise<MutationResult> => {
    if (!companyId) return { success: false, error: 'no_company' };
    const next = !autopilotEnabled;
    setAutopilotEnabled(next);

    const { data, error } = await supabase.rpc('rpc_set_company_autopilot_enabled', {
      p_company_id: companyId,
      p_enabled: next,
    });

    const result = data as { success: boolean; error?: string } | null;
    if (error || !result?.success) {
      setAutopilotEnabled(!next); // rollback
      return { success: false, error: error?.message ?? result?.error ?? 'unknown' };
    }
    return { success: true };
  }, [companyId, autopilotEnabled]);

  return {
    operations: operations.filter(o => ACTIVE_STATUSES.includes(o.status)),
    operationsInQueue,
    operationsExecutedToday,
    autopilotEnabled,
    loading,
    updateMessage,
    reschedule,
    snooze,
    cancel,
    toggleAutopilot,
  };
}
