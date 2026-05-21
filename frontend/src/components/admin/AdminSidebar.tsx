import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Building2,
  Users,
  Blocks,
  ShieldAlert,
  Settings,
  ShieldHalf
} from 'lucide-react';
export const AdminSidebar: React.FC = () => {

  const navItems = [
    { icon: <Building2 size={20} />, label: 'Tenants', to: '/admin/tenants' },
    { icon: <Users size={20} />, label: 'Usuários Globais', to: '/admin/users' },
    { icon: <Blocks size={20} />, label: 'Módulos', to: '/admin/modules' },
    { icon: <ShieldAlert size={20} />, label: 'Suporte & Ops', to: '/admin/support' },
  ];

  return (
    <aside className="w-64 border-r border-border bg-background flex flex-col h-full shrink-0">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-border group cursor-pointer hover:bg-surface transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-amber-500 text-background flex-center font-bold text-lg group-hover:rotate-12 transition-transform duration-500">
            <ShieldHalf size={20} />
          </div>
          <span className="font-bold tracking-tight text-lg text-primary">Sia One <span className="text-amber-500">Admin</span></span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        <div className="px-3 mb-4">
          <span className="text-xs font-mono uppercase text-amber-500/80 tracking-widest">
            PLATAFORMA
          </span>
        </div>
        
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group
               ${isActive
                 ? 'bg-amber-500/10 text-amber-500'
                 : 'text-text-muted hover:text-amber-500 hover:bg-amber-500/5'
               }`
            }
          >
            <span className="opacity-70 group-hover:opacity-100 transition-opacity">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Utilities / Settings */}
      <div className="p-3 border-t border-border mt-auto">
        <NavLink
            to="/admin/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group
               ${isActive 
                 ? 'bg-amber-500/10 text-amber-500' 
                 : 'text-text-muted hover:text-amber-500 hover:bg-amber-500/5'
               }`
            }
          >
            <span className="opacity-70 group-hover:opacity-100 transition-opacity">
              <Settings size={20} />
            </span>
            Configurações
        </NavLink>
      </div>
    </aside>
  );
};
