import React from 'react';
import { Zap } from 'lucide-react';
import type { AdminTenantUser } from '../adminTypes';

const ROLE_CFG: Record<string, { label: string; classes: string }> = {
  company_admin: { label: 'Admin',    classes: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  manager:       { label: 'Gerente',  classes: 'bg-zinc-500/10  text-zinc-400  border-zinc-500/20' },
  agent:         { label: 'Agente',   classes: 'bg-zinc-700/20  text-zinc-500  border-zinc-700/30' },
};

interface UserRowProps {
  user: AdminTenantUser;
  onSupport?: () => void;
}

function initials(name: string): string {
  const value = name.trim() || 'U';
  return value.split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

export const UserRow: React.FC<UserRowProps> = ({ user, onSupport }) => {
  const cfg = ROLE_CFG[user.role] ?? ROLE_CFG.agent;
  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-white/[0.03] transition-colors group">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 border border-white/[0.1] flex items-center justify-center text-xs font-bold text-white shrink-0">
        {initials(user.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-tight">{user.name}</p>
        <p className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate">
          {user.email || 'email não disponível'}
          {user.team_name ? ` · ${user.team_name}` : ''}
        </p>
      </div>
      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${cfg.classes}`}>
        {cfg.label}
      </span>
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button className="text-[11px] text-zinc-500 px-2.5 py-1 rounded-lg border border-white/[0.06] hover:border-white/[0.15] hover:text-white transition-all">
          Editar
        </button>
        {onSupport && (
          <button
            onClick={onSupport}
            className="text-[11px] text-orange-400 px-2.5 py-1 rounded-lg border border-orange-500/30 hover:bg-orange-500/10 transition-all flex items-center gap-1"
          >
            <Zap size={10} /> Acessar
          </button>
        )}
      </div>
    </div>
  );
};
