import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Search, Bell, Settings, User, LogOut, ChevronDown, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Topbar: React.FC = () => {
  const { effectiveUser, logout } = useAuth();
  const { currentCompany, isSupportMode } = useTenant();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-6 z-10 sticky top-0 shrink-0">
      
      {/* Left: Context / Title */}
      <div className="flex flex-col">
        <h2 className="text-lg font-semibold text-primary/90 flex items-center gap-2">
          {currentCompany?.name || 'Selecione uma Empresa'}
        </h2>
        <span className="text-[10px] font-mono uppercase text-text-muted tracking-wide flex items-center gap-1">
          {isSupportMode ? (
            <span className="text-amber-500 animate-pulse bg-amber-500/10 px-1 rounded">Modo Delegado</span>
          ) : (
            'Operacional'
          )}
        </span>
      </div>

      {/* Right: Actions & User Menu */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative group hidden md:block">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar atalhos..." 
            className="bg-bg-base border border-border rounded-full py-1.5 pl-9 pr-4 text-sm w-48 focus:w-64 transition-all duration-300 outline-none text-text-primary placeholder:text-text-muted/50 focus:border-border-hover/50"
          />
        </div>

        <button 
          onClick={toggleTheme}
          className="w-8 h-8 flex-center rounded-full hover:bg-bg-base text-text-muted hover:text-primary transition-colors"
          title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button className="relative w-8 h-8 flex-center rounded-full hover:bg-bg-base text-text-muted hover:text-primary transition-colors">
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-accent-blue rounded-full border border-surface shadow-[0_0_8px_rgba(43,116,255,0.6)]"></span>
        </button>

        <button className="w-8 h-8 flex-center rounded-full hover:bg-bg-base text-text-muted hover:text-primary transition-colors">
          <Settings size={18} />
        </button>

        <div className="h-6 w-px bg-border"></div>

        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium text-primary leading-tight">
              {effectiveUser?.full_name}
            </span>
            <span className="text-[10px] font-mono uppercase text-text-muted tracking-wide">
              {effectiveUser?.role.replace('_', ' ') || 'agent'}
            </span>
          </div>
          
          <div className="w-9 h-9 rounded-full bg-surface border border-border flex-center relative overflow-hidden group-hover:border-primary/50 transition-colors">
            {effectiveUser?.avatar_url ? (
              <img src={effectiveUser.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <User size={16} className="text-text-muted group-hover:text-primary transition-colors" />
            )}
          </div>
          
          <ChevronDown size={14} className="text-text-muted group-hover:text-primary transition-colors" />
        </div>

        {/* Temporary explicit logout for testing */}
        <button 
          onClick={handleLogout}
          className="ml-2 w-8 h-8 flex-center rounded border border-border hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/50 text-text-muted transition-colors group"
          title="Sair do sistema"
        >
          <LogOut size={16} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </header>
  );
};
