import React, { useMemo, useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  BarChart3,
  MessageSquare,
  ClipboardList,
  Filter,
  CalendarDays,
  Bot,
  Users,
  Plug,
  Settings,
  UserSearch,
  UsersRound,
  Group,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { SupportBanner } from './SupportBanner';

/* ─── Types ─── */
type NavLeaf = {
  icon: LucideIcon;
  label: string;
  to: string;
  children?: never;
};

type NavBranch = {
  icon: LucideIcon;
  label: string;
  to?: never;
  children: NavLeaf[];
};

type NavEntry = NavLeaf | NavBranch;

interface NavGroup {
  section: string;
  items: NavEntry[];
}

/* ─── Navigation structure ─── */
const NAV_GROUPS: NavGroup[] = [
  {
    section: 'OPERACIONAL',
    items: [
      { icon: Home, label: 'Home', to: '/home' },
      { icon: BarChart3, label: 'Dashboard', to: '/dashboard' },
      { icon: MessageSquare, label: 'Inbox', to: '/inbox' },
      { icon: ClipboardList, label: 'Tarefas', to: '/tasks' },
      { icon: Filter, label: 'CRM', to: '/deals' },
      { icon: CalendarDays, label: 'Agenda', to: '/agenda' },
    ],
  },
  {
    section: 'PESSOAS',
    items: [
      {
        icon: Users,
        label: 'Pessoas',
        children: [
          { icon: UserSearch, label: 'Leads', to: '/contacts' },
          { icon: UsersRound, label: 'Membros', to: '/members' },
          { icon: Group, label: 'Times', to: '/teams' },
        ],
      },
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

/* ─── Regular nav item ─── */
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

/* ─── Group nav item (flyout) ─── */
const SidebarGroupItem: React.FC<{
  icon: LucideIcon;
  label: string;
  items: NavLeaf[];
}> = ({ icon: Icon, label, items }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isAnyActive = items.some((item) => location.pathname.startsWith(item.to));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative mx-auto w-9">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`sidebar-nav-item relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 group
          ${isAnyActive
            ? 'is-active bg-surface text-primary'
            : 'text-text-muted hover:text-primary hover:bg-surface-hover'
          }`}
      >
        <Icon size={18} strokeWidth={1.8} className="shrink-0 relative z-[1]" />
        {/* Arrow badge */}
        <ChevronRight
          size={8}
          strokeWidth={3}
          className={`absolute bottom-[3px] right-[3px] transition-transform duration-200 ${open ? 'rotate-90' : ''} ${isAnyActive ? 'text-primary' : 'text-text-muted'}`}
        />
        {!open && <span className="sidebar-tooltip">{label}</span>}
      </button>

      {/* Flyout panel */}
      {open && (
        <div className="absolute left-full top-0 ml-3 z-[200] min-w-[148px] bg-surface border border-border rounded-xl shadow-xl py-1.5 overflow-hidden">
          <p className="px-3 pt-0.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted border-b border-border/50 mb-1">
            {label}
          </p>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-150 rounded-lg mx-1
                 ${isActive
                   ? 'bg-surface-hover text-primary font-medium'
                   : 'text-text-muted hover:text-primary hover:bg-surface-hover'
                 }`
              }
            >
              <item.icon size={15} strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Sidebar ─── */
export const Sidebar: React.FC = () => {
  const { isSupportMode, companyRole } = useTenant();

  const filteredGroups = useMemo(() => {
    if (companyRole !== 'agent') return NAV_GROUPS;
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items
        .map((item) => {
          if (item.children) {
            const filtered = item.children.filter(
              (child) => !RESTRICTED_FOR_AGENT.includes(child.to)
            );
            return filtered.length > 0 ? { ...item, children: filtered } : null;
          }
          return RESTRICTED_FOR_AGENT.includes(item.to) ? null : item;
        })
        .filter((item): item is NavEntry => item !== null),
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
        <span className="sidebar-tooltip">Sia One</span>
      </div>

      {/* ─── Navigation groups ─── */}
      <nav className="flex-1 overflow-visible py-1 flex flex-col gap-3">
        {filteredGroups.map((group, gi) => (
          <div key={group.section} className="flex flex-col gap-1">
            {group.items.map((item) =>
              item.children ? (
                <SidebarGroupItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  items={item.children}
                />
              ) : (
                <SidebarNavItem
                  key={item.to}
                  icon={item.icon}
                  label={item.label}
                  to={item.to}
                />
              )
            )}

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
