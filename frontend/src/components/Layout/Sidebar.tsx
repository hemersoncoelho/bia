import React, { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  BarChart3,
  Inbox,
  CheckSquare,
  Users,
  Kanban,
  Bot,
  UsersRound,
  Group,
  Plug,
  Settings,
  ChevronDown,
  UserSearch,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { SupportBanner } from './SupportBanner';

const NAV_ITEMS = [
  { icon: Home, label: 'Home', to: '/home' },
  { icon: BarChart3, label: 'Dashboard', to: '/dashboard' },
  { icon: Inbox, label: 'Inbox', to: '/inbox' },
  { icon: CheckSquare, label: 'Tarefas', to: '/tasks' },
  { icon: Kanban, label: 'Pipeline', to: '/deals' },
  { icon: Bot, label: 'Agentes IA', to: '/ai-agents' },
  { icon: Plug, label: 'Integrações', to: '/integrations' },
] as const;

const RESTRICTED_FOR_AGENT = ['/home', '/integrations'];

export const Sidebar: React.FC = () => {
  const { isSupportMode, companyRole } = useTenant();
  const [contatosOpen, setContatosOpen] = useState(false);

  const navItems = useMemo(() => {
    const items = NAV_ITEMS.map(({ icon: Icon, label, to }) => ({ icon: <Icon size={20} />, label, to }));
    if (companyRole === 'agent') {
      return items.filter((item) => !RESTRICTED_FOR_AGENT.includes(item.to));
    }
    return items;
  }, [companyRole]);

  const activeLinkClass = 'bg-surface text-primary';
  const inactiveLinkClass = 'text-text-muted hover:text-primary hover:bg-surface/50';
  const baseLinkClass =
    'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group';

  return (
    <aside
      className={`w-64 border-r flex flex-col h-full shrink-0 relative transition-colors duration-300
        ${isSupportMode ? 'border-amber-800/40 bg-background' : 'border-border bg-background'}`}
    >
      {/* Acento suporte */}
      {isSupportMode && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-amber-500/80 via-amber-600/40 to-transparent rounded-r-full pointer-events-none" />
      )}

      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-border group cursor-pointer hover:bg-surface transition-colors shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded flex-center font-bold text-lg group-hover:rotate-12 transition-all duration-500
              ${isSupportMode ? 'bg-amber-500/20 text-amber-400 border border-amber-600/30' : 'bg-primary text-background'}`}
          >
            S
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-bold tracking-tight text-lg text-primary">SalesIA</span>
            {isSupportMode && (
              <span className="text-[9px] font-mono uppercase tracking-widest text-amber-500/60 mt-0.5">Suporte Ativo</span>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        <div className="px-3 mb-4">
          <span className="text-xs font-mono uppercase text-text-muted tracking-widest">OPERACIONAL</span>
        </div>

        {/* Nav items sem submenu */}
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `${baseLinkClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}
          >
            <span className="opacity-70 group-hover:opacity-100 transition-opacity">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {/* Contatos — accordion com Leads, Equipe e Times */}
        <div className="pt-1">
          <button
            onClick={() => setContatosOpen((v) => !v)}
            className={`${baseLinkClass} w-full justify-between ${inactiveLinkClass}`}
          >
            <span className="flex items-center gap-3">
              <span className="opacity-70 group-hover:opacity-100 transition-opacity">
                <Users size={20} />
              </span>
              Contatos
            </span>
            <ChevronDown
              size={14}
              className={`text-stone-500 transition-transform duration-200 ${contatosOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {contatosOpen && (
            <div className="ml-4 mt-1 pl-3 border-l border-border space-y-1">
              {/* Leads = tela atual de Contacts/CRM */}
              <NavLink
                to="/contacts"
                className={({ isActive }) =>
                  `${baseLinkClass} text-xs py-2 ${isActive ? activeLinkClass : inactiveLinkClass}`
                }
              >
                <span className="opacity-70 group-hover:opacity-100 transition-opacity">
                  <UserSearch size={16} />
                </span>
                Leads
              </NavLink>

              {/* Equipe = membros internos */}
              <NavLink
                to="/members"
                className={({ isActive }) =>
                  `${baseLinkClass} text-xs py-2 ${isActive ? activeLinkClass : inactiveLinkClass}`
                }
              >
                <span className="opacity-70 group-hover:opacity-100 transition-opacity">
                  <UsersRound size={16} />
                </span>
                Equipe
              </NavLink>

              {/* Times = agrupamentos operacionais */}
              <NavLink
                to="/teams"
                className={({ isActive }) =>
                  `${baseLinkClass} text-xs py-2 ${isActive ? activeLinkClass : inactiveLinkClass}`
                }
              >
                <span className="opacity-70 group-hover:opacity-100 transition-opacity">
                  <Group size={16} />
                </span>
                Times
              </NavLink>
            </div>
          )}
        </div>
      </nav>

      {/* Settings */}
      <div className="p-3 border-t border-border space-y-1">
        <NavLink
          to="/settings"
          end
          className={({ isActive }) => `${baseLinkClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}
        >
          <span className="opacity-70 group-hover:opacity-100 transition-opacity">
            <Settings size={20} />
          </span>
          Configurações
        </NavLink>
      </div>

      <SupportBanner />
    </aside>
  );
};
