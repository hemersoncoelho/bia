import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  BarChart3,
  Inbox,
  CheckSquare,
  Kanban,
  Bot,
  UsersRound,
  Group,
  Plug,
  Settings,
  UserSearch,
  type LucideIcon,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { SupportBanner } from './SupportBanner';

/* ─── Types ─── */
interface NavItem {
  icon: LucideIcon;
  label: string;
  to: string;
}

interface NavGroup {
  section: string;
  items: NavItem[];
}

/* ─── Navigation structure ─── */
const NAV_GROUPS: NavGroup[] = [
  {
    section: 'OPERACIONAL',
    items: [
      { icon: Home, label: 'Home', to: '/home' },
      { icon: BarChart3, label: 'Dashboard', to: '/dashboard' },
      { icon: Inbox, label: 'Inbox', to: '/inbox' },
      { icon: CheckSquare, label: 'Tarefas', to: '/tasks' },
      { icon: Kanban, label: 'Pipeline', to: '/deals' },
    ],
  },
  {
    section: 'CONTATOS',
    items: [
      { icon: UserSearch, label: 'Leads', to: '/contacts' },
      { icon: UsersRound, label: 'Equipe', to: '/members' },
      { icon: Group, label: 'Times', to: '/teams' },
    ],
  },
  {
    section: 'AUTOMAÇÃO',
    items: [
      { icon: Bot, label: 'Agentes IA', to: '/ai-agents' },
      { icon: Plug, label: 'Integrações', to: '/integrations' },
    ],
  },
];

const RESTRICTED_FOR_AGENT = ['/home', '/integrations'];

/* ─── Nav item ─── */
const SidebarNavItem: React.FC<{
  icon: LucideIcon;
  label: string;
  to: string;
  size?: number;
}> = ({ icon: Icon, label, to, size = 18 }) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `sidebar-nav-item relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg transition-all duration-200 group
         ${isActive
           ? 'is-active bg-surface text-primary'
           : 'text-text-muted hover:text-primary hover:bg-surface-hover'
         }`
      }
    >
      <Icon size={size} strokeWidth={1.8} className="shrink-0 relative z-[1]" />
      <span className="sidebar-tooltip">{label}</span>
    </NavLink>
  );
};

/* ─── Sidebar ─── */
export const Sidebar: React.FC = () => {
  const { isSupportMode, companyRole } = useTenant();

  const filteredGroups = useMemo(() => {
    if (companyRole !== 'agent') return NAV_GROUPS;
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => !RESTRICTED_FOR_AGENT.includes(i.to)),
    })).filter((g) => g.items.length > 0);
  }, [companyRole]);

  return (
    <aside
      className={`sidebar-compact border-r flex flex-col h-full shrink-0 relative z-50 overflow-visible
        ${isSupportMode
          ? 'border-amber-800/40 bg-background'
          : 'border-border bg-background'
        }`}
    >
      {/* Support accent line */}
      {isSupportMode && (
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-amber-500/80 via-amber-600/40 to-transparent pointer-events-none z-10" />
      )}

      {/* ─── Brand ─── */}
      <div className="h-14 flex items-center justify-center cursor-pointer group relative shrink-0">
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[13px] group-hover:rotate-3 transition-transform duration-300
            ${isSupportMode
              ? 'bg-amber-500/10 text-amber-500 border border-amber-600/30'
              : 'bg-primary text-background'
            }`}
        >
          S
        </div>
        <span className="sidebar-tooltip">SalesIA</span>
      </div>

      {/* ─── Navigation groups ─── */}
      <nav className="flex-1 overflow-visible py-1 flex flex-col gap-3">
        {filteredGroups.map((group, gi) => (
          <div key={group.section} className="flex flex-col gap-1">
            {group.items.map((item) => (
              <SidebarNavItem
                key={item.to}
                icon={item.icon}
                label={item.label}
                to={item.to}
              />
            ))}

            {/* Section divider */}
            {gi < filteredGroups.length - 1 && (
              <div className="w-4 h-px bg-border/50 mx-auto mt-2" />
            )}
          </div>
        ))}
      </nav>

      {/* ─── Bottom ─── */}
      <div className="flex flex-col gap-1 py-3 border-t border-border mt-auto overflow-visible">
        <SupportBanner />
        <SidebarNavItem
          icon={Settings}
          label="Configurações"
          to="/settings"
        />
      </div>
    </aside>
  );
};
