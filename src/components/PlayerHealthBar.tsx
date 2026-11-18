import { HudPlayerSnapshot, MatchMode } from '../game/types';

interface PlayerHealthBarProps {
  player: HudPlayerSnapshot;
  mode: MatchMode;
  targetKills: number;
  align: 'left' | 'right';
}

export function PlayerHealthBar({ player, mode, targetKills, align }: PlayerHealthBarProps) {
  const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));

  let statusLabel = 'Active';
  let statusColor = 'text-slate-400';
  if (!player.alive) {
    if (mode === 'BRAWL') {
      statusLabel = `Spawn ${Math.max(0.1, player.respawnTimer).toFixed(1)}s`;
      statusColor = 'text-amber-300';
    } else {
      statusLabel = 'Out';
      statusColor = 'text-rose-400';
    }
  } else if (player.stunTimer > 0) {
    statusLabel = 'Stunned';
    statusColor = 'text-amber-300';
  } else if (player.hp === 1) {
    statusLabel = '1 HP';
    statusColor = 'text-rose-400';
  }

  const barColor =
    !player.alive
      ? 'bg-slate-700'
      : hpPct > 50
        ? 'bg-emerald-400'
        : hpPct > 25
          ? 'bg-amber-400'
          : 'bg-rose-500';

  return (
    <div
      className={`rounded-xl border px-3.5 py-3 transition-opacity duration-150 ${
        player.alive ? 'bg-[#131C2E] border-slate-700/80' : 'bg-[#0F1624] border-slate-800/70 opacity-65'
      }`}
    >
      <div className={`flex items-center justify-between gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <div className={`flex items-center gap-2 min-w-0 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          <span
            className="h-3 w-3 shrink-0 rounded-sm border border-slate-950"
            style={{ backgroundColor: player.color }}
            aria-hidden="true"
          />
          <span className="font-display text-sm font-bold text-slate-100 truncate">
            {player.name}
          </span>
        </div>
        <span className={`font-mono-tabular text-xs font-medium whitespace-nowrap ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Numeric HP & Bar */}
      <div className="mt-2.5">
        <div className={`flex items-baseline justify-between text-xs mb-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          <span className="text-slate-400 font-medium">HP</span>
          <span className="font-mono-tabular font-bold text-slate-100">
            {player.hp} <span className="text-slate-500 font-normal">/ {player.maxHp}</span>
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-950/90 border border-slate-800">
          <div
            className={`h-full transition-all duration-150 ease-out ${barColor}`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      {/* Ammo Pips & KOs */}
      <div className={`mt-2.5 flex items-center justify-between gap-2 text-xs ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <div className="flex items-center gap-1" aria-label={`Ammo ${player.ammo} of ${player.maxAmmo}`}>
          {Array.from({ length: player.maxAmmo }).map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full border ${
                i < player.ammo
                  ? 'bg-yellow-400 border-yellow-200'
                  : 'bg-slate-800 border-slate-700'
              }`}
            />
          ))}
        </div>
        <div className="font-mono-tabular text-slate-400 whitespace-nowrap">
          {mode === 'BRAWL' ? `${player.kills}/${targetKills} KO` : `${player.kills} KO`}
        </div>
      </div>
    </div>
  );
}
