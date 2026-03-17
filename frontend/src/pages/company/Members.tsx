import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { InviteMemberModal } from '../../components/members/InviteMemberModal';
import { 
  Users, 
  UserPlus, 
  Search, 
  MoreVertical, 
  Mail, 
  Shield,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface Member {
  id: string;
  full_name: string;
  email?: string;
  role: string;
  team_name?: string;
}

export const MembersPage: React.FC = () => {
  const { currentCompany } = useTenant();
  const [searchTerm, setSearchTerm] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  const fetchMembers = useCallback(async () => {
    if (!currentCompany) return;
    setLoading(true);
    try {
      // team:team_id(name) — relação FK; fallback para select simples se a relação falhar
      const { data, error } = await supabase
        .from('user_companies')
        .select('user_id, role_in_company, team_id')
        .eq('company_id', currentCompany.id);

      if (error) throw error;

      const userIds = (data ?? []).map((r: any) => r.user_id).filter(Boolean);
      const teamIds = [...new Set((data ?? []).map((r: any) => r.team_id).filter(Boolean))];

      let teamNames: Record<string, string> = {};
      if (teamIds.length > 0) {
        const { data: teamsData } = await supabase
          .from('teams')
          .select('id, name')
          .in('id', teamIds);
        (teamsData ?? []).forEach((t: any) => { teamNames[t.id] = t.name ?? ''; });
      }

      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles, error: profilesErr } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', userIds);
        if (!profilesErr && profiles) {
          profiles.forEach((p: any) => { profileMap[p.id] = p.full_name ?? 'Usuário'; });
        }
      }

      const list: Member[] = (data ?? [])
        .filter((r: any) => r?.user_id)
        .map((r: any) => ({
          id: String(r.user_id),
          full_name: profileMap[r.user_id] ?? 'Usuário',
          role: (r.role_in_company ?? 'agent').replace('_', ' '),
          team_name: r.team_id ? teamNames[r.team_id] : undefined,
        }));

      setMembers(list);
    } catch (err) {
      console.error('[Members] fetch error:', err);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [currentCompany]);

  const fetchTeams = useCallback(async () => {
    if (!currentCompany) return;
    const { data } = await supabase
      .from('teams')
      .select('id, name')
      .eq('company_id', currentCompany.id)
      .order('name');
    setTeams((data ?? []) as { id: string; name: string }[]);
  }, [currentCompany]);

  useEffect(() => {
    fetchMembers();
    fetchTeams();
  }, [fetchMembers, fetchTeams]);

  if (!currentCompany) return null;

  const filteredMembers = useMemo(() => members.filter(m => 
    (m.full_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.email ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  ), [members, searchTerm]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 reveal active">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-3">
            <Users size={24} className="text-stone-500" />
            Membros da Equipe
          </h1>
          <p className="text-text-muted mt-1">Gerencie quem tem acesso à {currentCompany.name} e suas permissões.</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-background rounded-lg text-sm font-medium hover:bg-stone-200 transition-colors"
        >
          <UserPlus size={18} />
          Criar Membro
        </button>
      </div>

      {/* Stats & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total de Membros" value={loading ? '—' : members.length.toString()} />
        <StatCard label="Ativos" value={loading ? '—' : members.length.toString()} />
        <div className="glass-panel p-2 rounded-xl flex items-center px-4 gap-3 md:col-span-2">
          <Search size={16} className="text-stone-500" />
          <input 
            type="text" 
            placeholder="Buscar membros..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none text-sm text-primary placeholder:text-stone-600 focus:outline-none w-full"
          />
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-border">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5 border-b border-border">
              <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Membro</th>
              <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Função</th>
              <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Times</th>
              <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Status</th>
              <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-stone-500 text-right">Ações</th>
            </tr>
          </thead>
          <tbody key={loading ? 'loading' : filteredMembers.length === 0 ? 'empty' : 'loaded'} className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <Loader2 size={24} className="animate-spin text-stone-500 mx-auto mb-2" />
                  <p className="text-sm text-stone-500">Carregando membros...</p>
                </td>
              </tr>
            ) : filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-stone-500 italic text-sm">
                  {searchTerm ? `Nenhum membro encontrado para "${searchTerm}".` : 'Nenhum membro na equipe.'}
                </td>
              </tr>
            ) : (
              filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center text-sm font-bold text-stone-500 group-hover:bg-stone-700 transition-colors">
                        {(member.full_name || '?').charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-primary">{member.full_name}</div>
                        <div className="text-xs text-text-muted flex items-center gap-1">
                          <Mail size={12} />
                          {member.email ?? '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <Shield size={14} className="text-stone-500" />
                      <span className="bg-white/5 px-2 py-1 rounded-md text-stone-300 uppercase tracking-wider">
                        {member.role}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {member.team_name ? (
                        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                          {member.team_name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-stone-600 italic">Sem time</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-mono uppercase tracking-wider bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 w-fit">
                      <CheckCircle2 size={12} />
                      Ativo
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-white/5 rounded-lg text-stone-500 hover:text-primary transition-colors">
                      <MoreVertical size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onSuccess={fetchMembers}
        companyId={currentCompany.id}
        teams={teams}
      />
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="glass-panel p-4 rounded-xl">
    <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">{label}</div>
    <div className="text-2xl font-bold text-primary">{value}</div>
  </div>
);
