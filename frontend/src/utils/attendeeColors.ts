// Cores distintas para cada atendente (baseado em hash do nome)
const ATTENDEE_PALETTE = [
  { text: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  { text: 'text-sky-400', bg: 'bg-sky-500/15', border: 'border-sky-500/30' },
  { text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  { text: 'text-rose-400', bg: 'bg-rose-500/15', border: 'border-rose-500/30' },
  { text: 'text-violet-400', bg: 'bg-violet-500/15', border: 'border-violet-500/30' },
  { text: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30' },
  { text: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30' },
  { text: 'text-pink-400', bg: 'bg-pink-500/15', border: 'border-pink-500/30' },
  { text: 'text-lime-400', bg: 'bg-lime-500/15', border: 'border-lime-500/30' },
  { text: 'text-teal-400', bg: 'bg-teal-500/15', border: 'border-teal-500/30' },
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Retorna classes Tailwind para badge de atendente (texto + fundo + borda) */
export function getAttendeeBadgeClasses(name: string): string {
  if (!name?.trim()) return 'text-stone-500 bg-stone-500/10 border-stone-600/30';
  const idx = hashString(name.trim()) % ATTENDEE_PALETTE.length;
  const p = ATTENDEE_PALETTE[idx];
  return `${p.text} ${p.bg} ${p.border}`;
}

/** Retorna apenas a classe de cor do texto para o nome do atendente */
export function getAttendeeTextColor(name: string): string {
  if (!name?.trim()) return 'text-stone-600';
  const idx = hashString(name.trim()) % ATTENDEE_PALETTE.length;
  return ATTENDEE_PALETTE[idx].text;
}
