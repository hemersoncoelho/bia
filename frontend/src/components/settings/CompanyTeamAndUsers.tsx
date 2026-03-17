import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Role } from '../../types';
import { Users, UsersRound, Plus, Pencil, Check, X, Loader2 } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  company_admin: 'Admin',
  manager: 'Gerente',
  agent: 'Usuário',
};

const COMPANY_ROLES: Role[] = ['company_admin', 'manager', 'agent'];

interface Team {
  id: string;
  name: string;
  slug: string;
  manager_id: string | null;
}

export interface CompanyUser {
  id: string;
  full_name: string;
  email: string;
  role_in_company: Role;
  team_id: string | null;
  team_name?: string;
}

const TeamManagerSelect: React.FC<{
  team: Team;
  companyUsers: CompanyUser[];
  onUpdate: () => void;
}> = ({ team, companyUsers, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('click', fn);
    return () => document.removeEventListener('click', fn);
  }, [open]);
  const handleChange = async (managerId: string | null) => {
    const { error } = await supabase
      .from('teams')
      .update({ manager_id: managerId })
      .eq('id', team.id);
    if (!error) {
      setOpen(false);
      onUpdate();
    }
  };
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-amber-500 hover:text-amber-400 px-2 py-1 rounded"
      >
        <Pencil size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[160px]">
          <button
            onClick={() => handleChange(null)}
            className="w-full text-left px-3 py-1.5 text-xs text-stone-400 hover:bg-stone-800"
          >
            Sem gerente
          </button>
          {companyUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => handleChange(u.id)}
              className="w-full text-left px-3 py-1.5 text-xs text-primary hover:bg-stone-800"
            >
              {u.full_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const UserEditForm: React.FC<{
  user: CompanyUser;
  teams: Team[];
  onSave: (role: Role, teamId: string | null) => Promise<void>;
  onCancel: () => void;
}> = ({ user, teams, onSave, onCancel }) => {
  const [role, setRole] = useState<Role>(user.role_in_company);
  const [teamId, setTeamId] = useState<string | null>(user.team_id);
  return (
    <div className="flex items-center gap-2">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="text-xs bg-surface border border-border rounded px-2 py-1 text-primary"
      >
        {COMPANY_ROLES.map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
        ))}
      </select>
      <select
        value={teamId ?? ''}
        onChange={(e) => setTeamId(e.target.value || null)}
        className="text-xs bg-surface border border-border rounded px-2 py-1 text-primary"
      >
        <option value="">Sem time</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <button onClick={() => onSave(role, teamId)} className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">
        <Check size={14} />
      </button>
      <button onClick={onCancel} className="p-1.5 rounded text-stone-500 hover:bg-surface">
        <X size={14} />
      </button>
    </div>
  );
};

interface CompanyTeamAndUsersProps {
  companyId: string;
  showSupportActions?: boolean;
  onSupportAccess?: (user: CompanyUser) => void;
  onVincularUsuario?: () => void;
}

export const CompanyTeamAndUsers: React.FC<CompanyTeamAndUsersProps> = ({
  companyId,
  showSupportActions = false,
  onSupportAccess,
  onVincularUsuario,
}) => {
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [addingTeam, setAddingTeam] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!companyId) return;
    setUsersLoading(true);
    const { data, error } = await supabase
      .from('user_companies')
      .select(`
        user_id,
        role_in_company,
        team_id,
        teams (id, name),
        user_profiles (
          id,
          full_name
        )
      `)
      .eq('company_id', companyId);

    if (!error && data) {
      const mapped: CompanyUser[] = data
        .map((row: any) => ({
          id: row.user_profiles?.id ?? row.user_id,
          full_name: row.user_profiles?.full_name ?? '—',
          email: '', // email está em auth.users, não em user_profiles
          role_in_company: row.role_in_company,
          team_id: row.team_id ?? null,
          team_name: row.teams?.name,
        }))
        .filter((u: CompanyUser) => u.id);
      setCompanyUsers(mapped);
    }
    setUsersLoading(false);
  }, [companyId]);

  const fetchTeams = useCallback(async () => {
    if (!companyId) return;
    setTeamsLoading(true);
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, slug, manager_id')
      .eq('company_id', companyId)
      .order('name');

    if (!error && data) {
      setTeams(data);
    }
    setTeamsLoading(false);
  }, [companyId]);

  useEffect(() => {
    fetchUsers();
    fetchTeams();
  }, [fetchUsers, fetchTeams]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Times */}
      <div className="glass-panel p-6 rounded-xl border border-border">
        <div className="flex items-center gap-3 mb-6">
          <UsersRound size={20} className="text-amber-500" />
          <h2 className="text-lg font-medium text-primary">Times</h2>
        </div>
        <div className="space-y-3">
          {teamsLoading ? (
            <div className="flex items-center gap-2 text-stone-500 text-sm py-4">
              <Loader2 size={14} className="animate-spin" />
              Carregando...
            </div>
          ) : (
            <>
              {teams.map((team) => (
                <div key={team.id} className="flex items-center justify-between py-2 px-3 bg-surface/50 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium text-primary">{team.name}</p>
                    <p className="text-xs text-stone-500">
                      Gerente: {team.manager_id ? companyUsers.find(u => u.id === team.manager_id)?.full_name ?? '—' : 'Não definido'}
                    </p>
                  </div>
                  <TeamManagerSelect
                    team={team}
                    companyUsers={companyUsers}
                    onUpdate={fetchTeams}
                  />
                </div>
              ))}
              {addingTeam ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Nome do time"
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder-stone-600"
                    autoFocus
                  />
                  <button
                    onClick={async () => {
                      if (!companyId || !newTeamName.trim()) return;
                      const slug = newTeamName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                      const { error } = await supabase.from('teams').insert({
                        company_id: companyId,
                        name: newTeamName.trim(),
                        slug: slug || 'team',
                      });
                      if (!error) {
                        setNewTeamName('');
                        setAddingTeam(false);
                        fetchTeams();
                      }
                    }}
                    className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                  >
                    <Check size={16} />
                  </button>
                  <button onClick={() => { setAddingTeam(false); setNewTeamName(''); }} className="p-2 rounded-lg text-stone-500 hover:bg-surface">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTeam(true)}
                  className="flex items-center gap-2 text-xs font-medium text-amber-500 hover:text-amber-400 py-2"
                >
                  <Plus size={14} /> Novo time
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Usuários */}
      <div className="glass-panel p-6 rounded-xl border border-border lg:col-span-2">
        <div className="flex items-center gap-3 mb-6">
          <Users size={20} className="text-amber-500" />
          <h2 className="text-lg font-medium text-primary">Usuários da Empresa</h2>
        </div>

        <div className="space-y-4">
          {usersLoading ? (
            <div className="flex items-center gap-2 text-stone-500 text-sm py-4">
              <Loader2 size={14} className="animate-spin" />
              Carregando usuários...
            </div>
          ) : companyUsers.length === 0 ? (
            <p className="text-stone-500 text-sm py-4">Nenhum usuário vinculado.</p>
          ) : (
            companyUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-surface border border-border flex items-center justify-center text-stone-400 font-medium text-xs">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">{user.full_name}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-stone-700/50 text-stone-400">
                        {ROLE_LABELS[user.role_in_company] ?? user.role_in_company}
                      </span>
                      {user.team_name && (
                        <span className="text-[10px] text-stone-500">{user.team_name}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editingUser === user.id ? (
                    <UserEditForm
                      user={user}
                      teams={teams}
                      onSave={async (role, teamId) => {
                        const { error } = await supabase
                          .from('user_companies')
                          .update({ role_in_company: role, team_id: teamId || null })
                          .eq('user_id', user.id)
                          .eq('company_id', companyId);
                        if (!error) {
                          setEditingUser(null);
                          fetchUsers();
                        }
                      }}
                      onCancel={() => setEditingUser(null)}
                    />
                  ) : (
                    <>
                      <button
                        onClick={() => setEditingUser(user.id)}
                        className="text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10 text-xs px-2 py-1 rounded transition-colors flex items-center gap-1"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      {showSupportActions && onSupportAccess && (
                        <button
                          onClick={() => onSupportAccess(user)}
                          className="text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10 text-xs px-2 py-1 rounded transition-colors"
                        >
                          Acessar como
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}

          {onVincularUsuario && (
            <button onClick={onVincularUsuario} className="text-xs font-medium text-amber-500 mt-4 block">
              + Vincular Usuário
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
