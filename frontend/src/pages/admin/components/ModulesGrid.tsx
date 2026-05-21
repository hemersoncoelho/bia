import React from 'react';
import {
  MessageSquare, GitBranch, CheckSquare, Bot, Calendar,
  BarChart2, Plug, Globe,
} from 'lucide-react';

interface Module {
  name: string;
  icon: React.ReactNode;
  active: boolean;
}

const MODULES: Module[] = [
  { name: 'Inbox',        icon: <MessageSquare size={16} />, active: true },
  { name: 'Pipeline',     icon: <GitBranch size={16} />,     active: true },
  { name: 'Tarefas',      icon: <CheckSquare size={16} />,   active: true },
  { name: 'Agentes IA',   icon: <Bot size={16} />,           active: true },
  { name: 'Agenda',       icon: <Calendar size={16} />,      active: true },
  { name: 'Analytics',    icon: <BarChart2 size={16} />,     active: true },
  { name: 'Integrações',  icon: <Plug size={16} />,          active: false },
  { name: 'API Pública',  icon: <Globe size={16} />,         active: false },
];

export const ModulesGrid: React.FC = () => {
  const activeCount = MODULES.filter(m => m.active).length;

  return (
    <div className="rounded-xl p-5 flex flex-col gap-4 bg-white/[0.025] border border-white/[0.06]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">Módulos Ativos</span>
        <span className="text-xs font-mono text-zinc-500">{activeCount}/{MODULES.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {MODULES.map(mod => (
          <div
            key={mod.name}
            className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
              mod.active
                ? 'bg-emerald-500/[0.05] border-emerald-500/20'
                : 'bg-white/[0.02] border-white/[0.05]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={mod.active ? 'text-emerald-400' : 'text-zinc-600'}>
                {mod.icon}
              </span>
              <span className={`text-xs font-medium ${mod.active ? 'text-zinc-200' : 'text-zinc-600'}`}>
                {mod.name}
              </span>
            </div>
            <div
              className={`relative w-8 h-4 rounded-full transition-all duration-300 ${
                mod.active ? 'bg-emerald-500' : 'bg-zinc-700'
              }`}
              role="switch"
              aria-checked={mod.active}
              aria-label={`Módulo ${mod.name}`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 ${
                  mod.active ? 'left-4.5' : 'left-0.5'
                }`}
                style={{ left: mod.active ? '18px' : '2px' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
