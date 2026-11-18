import { HudPlayerSnapshot, MatchMode } from '../game/types';

interface PlayerHealthBarProps {
  player: HudPlayerSnapshot;
  mode: MatchMode;
  targetKills: number;
  align: 'left' | 'right';
  compact?: boolean;
}

export function PlayerHealthBar({
  player,
  mode,
  targetKills,
  align,
  compact = false,
}: PlayerHealthBarProps) {
  const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));

  let statusLabel = 'Active';
  let statusColor = 'text-slate-400';
  if (!player.alive) {
    if (mode === 'BRAWL') {
      statusLabel = `${Math.max(0.1, player.respawnTimer).toFixed(1)}s`;
      statusColor = 'text-amber-300';
    } else {
      statusLabel = 'Out';
      statusColor = 'text-rose-400';
    }
  } else if (player.stunTimer > 0) {
    statusLabel = 'Stun';
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

  if (compact) {
    return (
      <div
        className={`transition-opacity duration-150 ${
          player.alive ? 'opacity-100' : 'opacity-45'
        }`}
      >
        <div
          className={`flex items-baseline justify-between gap-1.5 text-[11px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${
            align === 'right' ? 'flex-row-reverse' : ''
          }`}
        >
          <div className={`flex items-center gap-1 min-w-0 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
            <span className="font-display font-bold text-white truncate max-w-[78px]">
              {player.name}
            </span>
            {player.ammo > 0 && (
              <span className="flex items-center gap-0.5 shrink-0">
                {Array.from({ length: player.ammo }).map((_, i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-yellow-300" />
                ))}
              </span>
            )}
          </div>
          <span className="font-mono-tabular text-[10px] font-bold text-slate-200 whitespace-nowrap">
            {!player.alive
              ? statusLabel
              : mode === 'BRAWL'
                ? `${player.kills}/${targetKills}`
                : `${player.kills}K`}
          </span>
        </div>

        <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full transition-all duration-150 ease-out rounded-full"
            style={{
              width: `${hpPct}%`,
              backgroundColor: player.alive ? player.color : '#64748B',
            }}
          />
        </div>
      </div>
    );
  }

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
          {statusLabel === 'Stun' ? 'Stunned' : !player.alive && mode === 'BRAWL' ? `Spawn ${statusLabel}` : statusLabel}
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
