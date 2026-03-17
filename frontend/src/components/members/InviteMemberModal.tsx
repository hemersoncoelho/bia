import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Loader2, UserPlus, Mail, Shield, Users, User, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Role } from '../../types';

const ROLE_LABELS: Record<Role, string> = {
  company_admin: 'Admin',
  manager: 'Gerente',
  agent: 'Usuário',
  system_admin: 'Admin Sistema',
  platform_admin: 'Admin Plataforma',
  viewer: 'Visualizador',
};

const COMPANY_ROLES: Role[] = ['company_admin', 'manager', 'agent'];

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  companyId: string;
  teams: { id: string; name: string }[];
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  companyId,
  teams,
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFullName('');
      setEmail('');
      setPassword('');
      setRole('agent');
      setTeamId(null);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password.trim()) return;

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('create_company_member', {
        p_email: trimmed,
        p_password: password.trim(),
        p_full_name: fullName.trim() || null,
        p_company_id: companyId,
        p_role: role,
        p_team_id: teamId || null,
      });

      if (rpcError) throw new Error(rpcError.message);

      const result = data as { success?: boolean; error?: string; message?: string };
      if (!result?.success) throw new Error(result?.error || 'Erro ao criar membro.');

      setLoading(false);
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar membro.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputCls =
    'w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-primary placeholder-stone-600 focus:outline-none focus:border-stone-500 transition-colors';

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-base border border-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-border bg-surface/50">
          <div className="flex items-center gap-2">
            <UserPlus size={20} className="text-amber-500" />
            <h2 className="text-lg font-medium text-primary">Criar Membro</h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-stone-400 hover:text-white transition-colors p-2 rounded-md hover:bg-surface"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5 uppercase tracking-wider">
              Nome (opcional)
            </label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nome do membro"
                className={`${inputCls} pl-10`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5 uppercase tracking-wider">
              Email *
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.com"
                className={`${inputCls} pl-10`}
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5 uppercase tracking-wider">
              Senha inicial *
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className={`${inputCls} pl-10`}
                required
                minLength={6}
              />
            </div>
            <p className="text-xs text-stone-500 mt-1">O usuário poderá alterar a senha nas configurações depois.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5 uppercase tracking-wider">
              Função
            </label>
            <div className="relative">
              <Shield size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className={`${inputCls} pl-10`}
              >
                {COMPANY_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] ?? r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {teams.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5 uppercase tracking-wider">
                Time (opcional)
              </label>
              <div className="relative">
                <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                <select
                  value={teamId ?? ''}
                  onChange={(e) => setTeamId(e.target.value || null)}
                  className={`${inputCls} pl-10`}
                >
                  <option value="">Sem time</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 text-sm text-stone-400 hover:text-white border border-border rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim() || password.length < 6}
              className="flex-1 py-2.5 text-sm font-medium bg-primary text-background rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Criar Membro
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
