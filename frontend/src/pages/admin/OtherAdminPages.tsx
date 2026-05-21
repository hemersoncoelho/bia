import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2,
  Users,
  Building2,
  ShieldCheck,
  UserCog,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface PlatformUser {
  id: string;
  full_name: string;
  email: string;
  system_role: string;
  created_at: string;
  company_count: number;
}

const ROLE_LABELS: Record<string, string> = {
  platform_admin: 'Admin Plataforma',
  system_admin: 'System Admin',
  company_admin: 'Admin Empresa',
  manager: 'Gerente',
  agent: 'Agente',
  viewer: 'Visualizador',
};

const ROLE_COLORS: Record<string, string> = {
  platform_admin: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  system_admin:   'text-rose-400 bg-rose-500/10 border-rose-500/30',
  company_admin:  'text-blue-400 bg-blue-500/10 border-blue-500/30',
  manager:        'text-purple-400 bg-purple-500/10 border-purple-500/30',
  agent:          'text-stone-400 bg-stone-500/10 border-stone-500/30',
  viewer:         'text-stone-500 bg-stone-600/10 border-stone-600/30',
};

const SYSTEM_ROLE_OPTIONS = [
  { value: 'agent',          label: 'Agente' },
  { value: 'manager',        label: 'Gerente' },
  { value: 'company_admin',  label: 'Admin Empresa' },
  { value: 'platform_admin', label: 'Admin Plataforma' },
];

const COMPANY_ROLE_OPTIONS = [
  { value: 'agent',         label: 'Agente' },
  { value: 'manager',       label: 'Gerente' },
  { value: 'company_admin', label: 'Admin da Empresa' },
];

interface Company { id: string; name: string; }

// ── Modal de criação de usuário ────────────────────────────────────────────────

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: (user: PlatformUser) => void;
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ onClose, onSuccess }) => {
  const [email, setEmail]               = useState('');
  const [fullName, setFullName]         = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [systemRole, setSystemRole]     = useState('agent');
  const [companyId, setCompanyId]       = useState('');
  const [companyRole, setCompanyRole]   = useState('agent');
  const [companies, setCompanies]       = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Carrega empresas ao abrir o modal
  useEffect(() => {
    supabase
      .from('companies')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        setCompanies((data as Company[]) ?? []);
        if (data?.[0]) setCompanyId(data[0].id);
        setLoadingCompanies(false);
      });
  }, []);

  // Fecha com Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Sincroniza role na empresa com o sistema quando fizer sentido
  useEffect(() => {
    if (systemRole === 'platform_admin') setCompanyRole('company_admin');
    else if (systemRole === 'manager')   setCompanyRole('manager');
    else if (systemRole === 'agent')     setCompanyRole('agent');
  }, [systemRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (!companyId) {
      setError('Selecione uma empresa.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await supabase.functions.invoke('create-platform-user', {
        body: {
          email:           email.trim().toLowerCase(),
          full_name:       fullName.trim(),
          password,
          system_role:     systemRole,
          company_id:      companyId,
          role_in_company: companyRole,
        },
      });

      if (res.error) {
        let errorMsg = res.error.message;
        try {
          const body = await (res.error as any).context?.json?.();
          if (body?.error) errorMsg = body.error;
        } catch {}
        throw new Error(errorMsg);
      }
      const data = res.data as { success: boolean; error?: string; user_id?: string };
      if (!data.success) throw new Error(data.error ?? 'Erro desconhecido.');

      const selectedCompany = companies.find(c => c.id === companyId);
      onSuccess({
        id:            data.user_id ?? '',
        full_name:     fullName.trim(),
        email:         email.trim().toLowerCase(),
        system_role:   systemRole,
        created_at:    new Date().toISOString(),
        company_count: selectedCompany ? 1 : 0,
      });
    } catch (err: any) {
      setError(err.message || 'Erro ao criar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-primary placeholder-stone-600 outline-none focus:border-amber-500/50 transition-colors';

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-primary">Novo Usuário</h2>
              <p className="text-xs text-stone-500 mt-0.5">Criar conta e vincular a uma empresa</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-main transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="p-6 space-y-4 overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-color) transparent' }}
          >
            {error && (
              <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2.5">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Nome */}
            <div>
              <label className="text-[11px] font-mono uppercase tracking-widest text-stone-500 block mb-1.5">
                Nome completo *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Ex: Maria Silva"
                required
                autoFocus
                className={inputCls}
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-[11px] font-mono uppercase tracking-widest text-stone-500 block mb-1.5">
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                required
                className={inputCls}
              />
            </div>

            {/* Senha */}
            <div>
              <label className="text-[11px] font-mono uppercase tracking-widest text-stone-500 block mb-1.5">
                Senha *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  className={cn(inputCls, 'pr-10')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-400 transition-colors"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[10px] text-stone-600 mt-1">
                O usuário poderá alterar a senha após o primeiro login.
              </p>
            </div>

            {/* Separador */}
            <div className="border-t border-border/60 pt-1">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
                Vínculo com empresa
              </p>

              {/* Empresa */}
              <div className="mb-4">
                <label className="text-[11px] font-mono uppercase tracking-widest text-stone-500 block mb-1.5">
                  Empresa *
                </label>
                {loadingCompanies ? (
                  <div className="flex items-center gap-2 text-xs text-stone-500 py-2">
                    <Loader2 size={12} className="animate-spin" /> Carregando empresas…
                  </div>
                ) : (
                  <select
                    value={companyId}
                    onChange={e => setCompanyId(e.target.value)}
                    required
                    className={cn(inputCls, 'cursor-pointer')}
                  >
                    <option value="">Selecione uma empresa</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Papel na empresa */}
              <div className="mb-4">
                <label className="text-[11px] font-mono uppercase tracking-widest text-stone-500 block mb-1.5">
                  Papel na empresa
                </label>
                <select
                  value={companyRole}
                  onChange={e => setCompanyRole(e.target.value)}
                  className={cn(inputCls, 'cursor-pointer')}
                >
                  {COMPANY_ROLE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Role de sistema */}
              <div>
                <label className="text-[11px] font-mono uppercase tracking-widest text-stone-500 block mb-1.5">
                  Nível de acesso (sistema)
                </label>
                <select
                  value={systemRole}
                  onChange={e => setSystemRole(e.target.value)}
                  className={cn(inputCls, 'cursor-pointer')}
                >
                  {SYSTEM_ROLE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-stone-600 mt-1">
                  Define o que o usuário pode ver e fazer em toda a plataforma.
                </p>
              </div>
            </div>

            {/* Ações */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 py-2.5 text-sm text-text-muted border border-border rounded-lg hover:bg-surface-hover transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || loadingCompanies}
                className="flex-1 py-2.5 text-sm font-semibold bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {saving ? 'Criando…' : 'Criar Usuário'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

// ── Lista de Usuários ──────────────────────────────────────────────────────────

export const UsersList: React.FC = () => {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('get_platform_users');
    if (error) {
      setError(error.message);
    } else {
      setUsers(data as PlatformUser[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleUserCreated = (newUser: PlatformUser) => {
    setUsers(prev => [newUser, ...prev]);
    setShowModal(false);
    setSuccessMsg(`Usuário "${newUser.full_name}" criado com sucesso.`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">

      {/* Header */}
      <div className="flex justify-between items-end border-b border-border pb-6">
        <div>
          <span className="text-xs font-mono uppercase text-amber-500 block mb-2 tracking-widest">
            Gestão Global
          </span>
          <h1 className="text-4xl font-medium tracking-tight text-primary">
            Controle de Usuários
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <span className="flex items-center gap-2 text-stone-500 text-sm font-mono">
              <Users size={14} />
              {users.length} usuário{users.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-widest bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-all font-semibold"
          >
            <Plus size={13} />
            Novo Usuário
          </button>
        </div>
      </div>

      {/* Toast de sucesso */}
      {successMsg && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 size={15} className="shrink-0" />
          {successMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 text-stone-500 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm font-mono">Carregando usuários...</span>
        </div>
      ) : error ? (
        <div className="glass-panel p-8 rounded-xl border border-red-500/20 text-center">
          <p className="text-red-400 text-sm font-mono">{error}</p>
        </div>
      ) : users.length === 0 ? (
        <div className="glass-panel p-12 rounded-xl border border-border text-center text-stone-500 border-dashed">
          Nenhum usuário encontrado.
        </div>
      ) : (
        <div className="glass-panel rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-4 text-xs font-mono uppercase tracking-widest text-stone-500">Usuário</th>
                <th className="text-left px-6 py-4 text-xs font-mono uppercase tracking-widest text-stone-500">Role</th>
                <th className="text-left px-6 py-4 text-xs font-mono uppercase tracking-widest text-stone-500">Empresas</th>
                <th className="text-left px-6 py-4 text-xs font-mono uppercase tracking-widest text-stone-500">Desde</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <tr
                  key={user.id}
                  className={`border-b border-border/50 last:border-0 hover:bg-surface/50 transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-stone-400 font-semibold text-sm shrink-0">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-primary">{user.full_name}</p>
                        <p className="text-xs text-stone-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border',
                      ROLE_COLORS[user.system_role] ?? ROLE_COLORS.agent
                    )}>
                      {['platform_admin', 'system_admin'].includes(user.system_role)
                        ? <ShieldCheck size={11} />
                        : <UserCog size={11} />
                      }
                      {ROLE_LABELS[user.system_role] ?? user.system_role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-sm text-stone-400">
                      <Building2 size={13} />
                      {user.company_count}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-stone-500">
                      {new Date(user.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-xs text-stone-500 hover:text-amber-400 transition-colors font-mono">
                      Gerenciar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de criação */}
      {showModal && (
        <CreateUserModal
          onClose={() => setShowModal(false)}
          onSuccess={handleUserCreated}
        />
      )}
    </div>
  );
};

export const ModulesList: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">
       <div className="flex justify-between items-end border-b border-border pb-6">
         <div>
           <span className="text-xs font-mono uppercase text-amber-500 block mb-2 tracking-widest">
             Configuração da Plataforma
           </span>
           <h1 className="text-4xl font-medium tracking-tight text-primary">
             Catálogo de Módulos
           </h1>
         </div>
       </div>
       <div className="glass-panel p-12 rounded-xl border border-border text-center text-stone-500 border-dashed">
         Gestão de Módulos Globais e Permissões (Planejado)
       </div>
    </div>
  );
};

export const SupportPanel: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">
       <div className="flex justify-between items-end border-b border-border pb-6">
         <div>
           <span className="text-xs font-mono uppercase text-amber-500 block mb-2 tracking-widest">
             Operações
           </span>
           <h1 className="text-4xl font-medium tracking-tight text-primary">
             Central de Suporte Operacional
           </h1>
         </div>
       </div>
       <div className="glass-panel p-12 rounded-xl border border-border text-center text-stone-500 border-dashed">
         Visão Global de Tickets e Acessos de Suporte Rápidos (Planejado)
       </div>
    </div>
  );
};
