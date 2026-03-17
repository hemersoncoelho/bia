import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface RecentMember {
  id: string;
  full_name: string;
  role: string;
}

export interface CompanySummary {
  totalMembers: number;
  totalTeams: number;
  openConversations: number;
  openDealsValue: number;
  pipelineStages: { stage_name: string; deal_count: number; total_value: number; color?: string }[];
  recentMembers: RecentMember[];
}

export function useCompanySummary(companyId: string | null) {
  const [data, setData] = useState<CompanySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!companyId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Batch 1: KPIs + counts + deals (4 queries em paralelo)
      const [kpisRes, membersRes, teamsRes, pipelineRes] = await Promise.all([
        supabase.from('v_company_kpis').select('open_conversations').eq('company_id', companyId).maybeSingle(),
        supabase.from('user_companies').select('user_id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('teams').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('deals').select('stage_id, amount').eq('company_id', companyId).eq('status', 'open'),
      ]);

      const openConvs = kpisRes.data?.open_conversations ?? 0;
      const totalMembers = membersRes.count ?? 0;
      const totalTeams = teamsRes.count ?? 0;

      const dealsByStage: Record<string, { count: number; value: number }> = {};
      (pipelineRes.data ?? []).forEach((d: any) => {
        const stageId = d.stage_id;
        if (!stageId) return;
        if (!dealsByStage[stageId]) dealsByStage[stageId] = { count: 0, value: 0 };
        dealsByStage[stageId].count += 1;
        dealsByStage[stageId].value += Number(d.amount ?? 0);
      });

      // Batch 2: pipelines + stages + recent members (3 queries em paralelo)
      const { data: pipelinesData } = await supabase
        .from('pipelines')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_active', true);

      const pipelineIds = (pipelinesData ?? []).map((p: { id: string }) => p.id);

      const [stagesData, membersData] = await Promise.all([
        pipelineIds.length > 0
          ? supabase.from('pipeline_stages').select('id, name, position, color').in('pipeline_id', pipelineIds).order('position', { ascending: true })
          : Promise.resolve({ data: [] }),
        supabase.from('user_companies').select('user_id, role_in_company').eq('company_id', companyId).limit(5),
      ]);

      const pipelineStages = (stagesData.data ?? [])
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map((s: any) => {
          const agg = dealsByStage[s.id] ?? { count: 0, value: 0 };
          return { stage_name: s.name, deal_count: agg.count, total_value: agg.value, color: s.color };
        });

      const openDealsValue = Object.values(dealsByStage).reduce((sum, a) => sum + a.value, 0);

      const userIds = (membersData.data ?? []).map((m: any) => m.user_id).filter(Boolean);
      const roleByUser: Record<string, string> = {};
      (membersData.data ?? []).forEach((m: any) => {
        roleByUser[m.user_id] = (m.role_in_company ?? 'agent').replace('_', ' ');
      });

      let recentMembers: RecentMember[] = [];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', userIds);
        recentMembers = (profilesData ?? []).map((p: any) => ({
          id: p.id,
          full_name: p.full_name ?? 'Usuário',
          role: roleByUser[p.id] ?? 'agent',
        }));
      }

      setData({
        totalMembers,
        totalTeams,
        openConversations: openConvs,
        openDealsValue,
        pipelineStages,
        recentMembers,
      });
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar resumo.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
