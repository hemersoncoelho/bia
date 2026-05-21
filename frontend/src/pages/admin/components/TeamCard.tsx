import React from 'react';
import { Users } from 'lucide-react';
import type { MockTeam } from '../adminTypes';
import { TEAM_COLOR_MAP, hashHSL } from '../adminUtils';

interface TeamCardProps {
  team: MockTeam;
}

export const TeamCard: React.FC<TeamCardProps> = ({ team }) => {
  const colorCls = TEAM_COLOR_MAP[team.color] ?? TEAM_COLOR_MAP.cyan;
  const avatarCount = Math.min(team.memberCount, 4);

  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.1] transition-all">
      <div className={`p-2.5 rounded-xl shrink-0 ${colorCls}`}>
        <Users size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{team.name}</p>
        <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">{team.manager}</p>
      </div>
      <div className="flex items-center -space-x-2 shrink-0">
        {Array.from({ length: avatarCount }).map((_, i) => (
          <div
            key={i}
            className="w-6 h-6 rounded-full border-2 border-[#141415] flex items-center justify-center text-[8px] font-bold text-white"
            style={{ background: hashHSL(`${team.name}${i}`) }}
            aria-hidden="true"
          />
        ))}
        {team.memberCount > avatarCount && (
          <div className="w-6 h-6 rounded-full border-2 border-[#141415] bg-zinc-700 flex items-center justify-center text-[8px] font-mono text-zinc-400">
            +{team.memberCount - avatarCount}
          </div>
        )}
      </div>
    </div>
  );
};
