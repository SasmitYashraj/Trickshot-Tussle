import { RotateCcw, Sliders, X } from 'lucide-react';
import {
  DEFAULT_MATCH_MODIFIERS,
  type MatchModifiers,
  type ModifierLevel,
} from '../game/types';

interface ModifiersScreenProps {
  modifiers: MatchModifiers;
  readOnly?: boolean;
  onChange: (next: MatchModifiers) => void;
  onClose: () => void;
}

interface LevelRowDef {
  key: keyof Omit<MatchModifiers, 'keepBulletsOnStun' | 'postStunGrace'>;
  label: string;
  hint: string;
  labels?: Record<ModifierLevel, string>;
}

const LEVEL_ROWS: LevelRowDef[] = [
  { key: 'bulletSpawn', label: 'Bullet Spawns', hint: 'Floor ammo drop frequency' },
  { key: 'nitroSpawn', label: 'Nitro Spawns', hint: 'Instant-detonation crates' },
  { key: 'tntSpawn', label: 'TNT Spawns', hint: 'Pushable 3s fuse crates' },
  { key: 'medkitSpawn', label: 'Medkit Spawns', hint: '+35 HP healing kits' },
  { key: 'playerSpeed', label: 'Player Speed', hint: 'Movement & dash tempo' },
  {
    key: 'turnSpeed',
    label: 'Turn Speed',
    hint: 'Aim rotation speed cap',
    labels: { LOW: 'Slow', MEDIUM: 'Medium', HIGH: 'Fast' },
  },
  { key: 'bulletSpeed', label: 'Bullet Velocity', hint: 'Projectile travel speed' },
  {
    key: 'bulletCapacity',
    label: 'Ammo Capacity',
    hint: 'Max held shots per fighter',
    labels: { LOW: 'Low (3)', MEDIUM: 'Med (5)', HIGH: 'High (8)' },
  },
  {
    key: 'stunTime',
    label: 'Stun Recovery',
    hint: 'Post-hit shock window',
    labels: { LOW: '0.45s', MEDIUM: '0.85s', HIGH: '1.45s' },
  },
  {
    key: 'spawnProtection',
    label: 'Spawn Protection',
    hint: 'Respawn shield & speed boost',
    labels: { LOW: '0.9s +25%', MEDIUM: '1.5s +55%', HIGH: '2.2s +85%' },
  },
];

const LEVELS: ModifierLevel[] = ['LOW', 'MEDIUM', 'HIGH'];

export function ModifiersScreen({
  modifiers,
  readOnly = false,
  onChange,
  onClose,
}: ModifiersScreenProps) {
  const setLevel = (
    key: keyof Omit<MatchModifiers, 'keepBulletsOnStun' | 'postStunGrace'>,
    level: ModifierLevel
  ) => {
    if (readOnly) return;
    onChange({ ...modifiers, [key]: level });
  };

  const toggleKeepBullets = () => {
    if (readOnly) return;
    onChange({ ...modifiers, keepBulletsOnStun: !modifiers.keepBulletsOnStun });
  };

  const togglePostStunGrace = () => {
    if (readOnly) return;
    onChange({ ...modifiers, postStunGrace: !modifiers.postStunGrace });
  };

  const resetDefaults = () => {
    if (readOnly) return;
    onChange({ ...DEFAULT_MATCH_MODIFIERS });
  };

  const isDefault = (Object.keys(DEFAULT_MATCH_MODIFIERS) as Array<keyof MatchModifiers>).every(
    (k) => (modifiers[k] ?? DEFAULT_MATCH_MODIFIERS[k]) === DEFAULT_MATCH_MODIFIERS[k]
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-slate-950/80 backdrop-blur-sm">
      <div className="min-h-full w-full flex flex-col items-center justify-center p-3 sm:p-5">
        <div className="my-auto w-full max-w-2xl rounded-2xl border border-slate-700/80 bg-[#111A2C] p-5 sm:p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
                <Sliders className="w-4 h-4 text-sky-400" />
              </div>
              <div>
                <h2 className="font-display text-lg sm:text-xl font-extrabold text-slate-50">
                  Arena Modifiers
                </h2>
                <p className="text-xs text-slate-400">
                  {readOnly
                    ? 'Host match tuning — Medium preserves classic balanced defaults'
                    : 'Tune spawns, speed, ammo cap, and stun behavior · Medium = Classic Balance'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modifiers"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LEVEL_ROWS.map((row) => {
              const current = modifiers[row.key] ?? DEFAULT_MATCH_MODIFIERS[row.key];
              return (
                <div
                  key={row.key}
                  className="rounded-xl border border-slate-800 bg-slate-900/65 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-slate-100">{row.label}</span>
                    <span className="text-[11px] text-slate-400">{row.hint}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-950/90 border border-slate-800">
                    {LEVELS.map((lvl) => {
                      const active = current === lvl;
                      const label = row.labels
                        ? row.labels[lvl]
                        : lvl === 'LOW'
                          ? 'Low'
                          : lvl === 'MEDIUM'
                            ? 'Medium'
                            : 'High';
                      return (
                        <button
                          key={lvl}
                          type="button"
                          disabled={readOnly}
                          onClick={() => setLevel(row.key, lvl)}
                          className={`px-2 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? lvl === 'MEDIUM'
                                ? 'bg-sky-500 text-slate-950'
                                : lvl === 'HIGH'
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-slate-600 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stun & Recovery Toggles */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/65 px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-100">Keep Bullets on Stun</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Disabled drops held bullets on non-lethal hit
                </div>
              </div>
              <button
                type="button"
                disabled={readOnly}
                onClick={toggleKeepBullets}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 border ${
                  modifiers.keepBulletsOnStun
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                } ${readOnly ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
              >
                {modifiers.keepBulletsOnStun ? 'Keep Held' : 'Drop on Stun'}
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/65 px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-100">Post-Stun Bullet Grace</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Bullets pass through for 0.5s after stun ends
                </div>
              </div>
              <button
                type="button"
                disabled={readOnly}
                onClick={togglePostStunGrace}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 border ${
                  modifiers.postStunGrace
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                } ${readOnly ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
              >
                {modifiers.postStunGrace ? '0.5s Grace' : 'No Grace'}
              </button>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            {!readOnly ? (
              <button
                type="button"
                disabled={isDefault}
                onClick={resetDefaults}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-45 px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Defaults
              </button>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl bg-sky-400 hover:bg-sky-300 px-5 py-2 text-xs font-bold text-slate-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
