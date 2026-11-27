import { RotateCcw, Sliders, X } from 'lucide-react';
import {
  DEFAULT_MATCH_MODIFIERS,
  FIGURE_DIFFICULTY_ORDER,
  FIGURE_DIFFICULTY_PROFILES,
  type BulletBounceLevel,
  type BulletSpawnLevel,
  type FigureDifficulty,
  type MatchModifiers,
  type ModifierLevel,
  type OptionalSpawnLevel,
} from '../game/types';

interface ModifiersScreenProps {
  modifiers: MatchModifiers;
  readOnly?: boolean;
  onChange: (next: MatchModifiers) => void;
  onClose: () => void;
}

type OptionalSpawnKey = 'nitroSpawn' | 'tntSpawn' | 'medkitSpawn';

type LevelModifierKey = keyof Omit<
  MatchModifiers,
  'keepBulletsOnStun' | 'figureDifficulty' | 'bulletSpawn' | 'bulletBounces' | OptionalSpawnKey
>;

interface OptionalSpawnRowDef {
  key: OptionalSpawnKey;
  label: string;
  hint: string;
}

interface LevelRowDef {
  key: LevelModifierKey;
  label: string;
  hint: string;
  labels?: Record<ModifierLevel, string>;
}

const OPTIONAL_SPAWN_ROWS: OptionalSpawnRowDef[] = [
  { key: 'nitroSpawn', label: 'Nitro Spawns', hint: 'Instant-detonation crates' },
  { key: 'tntSpawn', label: 'TNT Spawns', hint: 'Pushable 3s fuse crates' },
  { key: 'medkitSpawn', label: 'Medkit Spawns', hint: '+35 HP healing kits' },
];

const LEVEL_ROWS: LevelRowDef[] = [
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
  {
    key: 'playerSize',
    label: 'Player Size',
    hint: 'Normal maps only (all fighters)',
    labels: { LOW: 'Small', MEDIUM: 'Medium', HIGH: 'Large' },
  },
];

const LEVELS: ModifierLevel[] = ['LOW', 'MEDIUM', 'HIGH'];
const OPTIONAL_SPAWN_LEVELS: OptionalSpawnLevel[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];
const BULLET_SPAWN_LEVELS: BulletSpawnLevel[] = ['DREAD', 'LOW', 'MEDIUM', 'HIGH'];
const BULLET_BOUNCE_LEVELS: Array<{ id: BulletBounceLevel; label: string }> = [
  { id: 'NONE', label: 'None (0)' },
  { id: 'LOW', label: 'Low (2)' },
  { id: 'MEDIUM', label: 'Med (4)' },
  { id: 'HIGH', label: 'High (6)' },
  { id: 'VERY_HIGH', label: 'Very High (9)' },
  { id: 'INSANITY', label: 'Insanity (15)' },
];

export function ModifiersContent({
  modifiers,
  readOnly = false,
  onChange,
  footerAction,
}: {
  modifiers: MatchModifiers;
  readOnly?: boolean;
  onChange: (next: MatchModifiers) => void;
  footerAction?: React.ReactNode;
}) {
  const setLevel = (key: LevelModifierKey, level: ModifierLevel) => {
    if (readOnly) return;
    onChange({ ...modifiers, [key]: level });
  };

  const setOptionalSpawn = (key: OptionalSpawnKey, level: OptionalSpawnLevel) => {
    if (readOnly) return;
    onChange({ ...modifiers, [key]: level });
  };

  const setBulletSpawn = (bulletSpawn: BulletSpawnLevel) => {
    if (readOnly) return;
    onChange({ ...modifiers, bulletSpawn });
  };

  const setBulletBounces = (bulletBounces: BulletBounceLevel) => {
    if (readOnly) return;
    onChange({ ...modifiers, bulletBounces });
  };

  const setFigureDifficulty = (figureDifficulty: FigureDifficulty) => {
    if (readOnly) return;
    onChange({ ...modifiers, figureDifficulty });
  };

  const toggleKeepBullets = () => {
    if (readOnly) return;
    onChange({ ...modifiers, keepBulletsOnStun: !modifiers.keepBulletsOnStun });
  };

  const resetDefaults = () => {
    if (readOnly) return;
    onChange({ ...DEFAULT_MATCH_MODIFIERS });
  };

  const activeFigureDiff =
    modifiers.figureDifficulty ?? DEFAULT_MATCH_MODIFIERS.figureDifficulty;
  const activeFigureProfile =
    FIGURE_DIFFICULTY_PROFILES[activeFigureDiff] ?? FIGURE_DIFFICULTY_PROFILES.STANDARD;
  const activePostStunLevel: ModifierLevel =
    modifiers.postStunGrace === 'LOW' ||
    modifiers.postStunGrace === 'MEDIUM' ||
    modifiers.postStunGrace === 'HIGH'
      ? modifiers.postStunGrace
      : DEFAULT_MATCH_MODIFIERS.postStunGrace;

  const isDefault = (Object.keys(DEFAULT_MATCH_MODIFIERS) as Array<keyof MatchModifiers>).every(
    (k) => (modifiers[k] ?? DEFAULT_MATCH_MODIFIERS[k]) === DEFAULT_MATCH_MODIFIERS[k]
  );

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/65 p-3">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-slate-100">Bullet Spawns</span>
                <span className="text-[11px] text-slate-400">Floor ammo drop frequency</span>
              </div>
              <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-950/90 border border-slate-800">
                {BULLET_SPAWN_LEVELS.map((lvl) => {
                  const active = (modifiers.bulletSpawn ?? DEFAULT_MATCH_MODIFIERS.bulletSpawn) === lvl;
                  const label =
                    lvl === 'DREAD'
                      ? 'Dread'
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
                      onClick={() => setBulletSpawn(lvl)}
                      className={`px-1.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? lvl === 'DREAD'
                            ? 'bg-rose-500 text-white'
                            : lvl === 'MEDIUM'
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

            {OPTIONAL_SPAWN_ROWS.map((row) => {
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
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-950/90 border border-slate-800">
                    {OPTIONAL_SPAWN_LEVELS.map((lvl) => {
                      const active = current === lvl;
                      const label =
                        lvl === 'NONE'
                          ? 'None'
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
                          onClick={() => setOptionalSpawn(row.key, lvl)}
                          className={`px-1.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? lvl === 'NONE'
                                ? 'bg-rose-500 text-white'
                                : lvl === 'MEDIUM'
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

            {/* Bullet Bounces (6 Levels: None to Insanity, Default Med = 4) */}
            <div className="sm:col-span-2 rounded-xl border border-slate-800 bg-slate-900/65 p-3">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-slate-100">Bullet Bounces</span>
                <span className="text-[11px] text-slate-400">
                  Wall rebounds before breaking (Med 4 = Default)
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 rounded-lg bg-slate-950/90 border border-slate-800">
                {BULLET_BOUNCE_LEVELS.map((opt) => {
                  const active =
                    (modifiers.bulletBounces ?? DEFAULT_MATCH_MODIFIERS.bulletBounces) === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={readOnly}
                      onClick={() => setBulletBounces(opt.id)}
                      className={`px-1.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? opt.id === 'NONE'
                            ? 'bg-rose-500 text-white'
                            : opt.id === 'MEDIUM'
                              ? 'bg-sky-500 text-slate-950'
                              : opt.id === 'HIGH'
                                ? 'bg-amber-400 text-slate-950'
                                : opt.id === 'VERY_HIGH'
                                  ? 'bg-orange-500 text-slate-950'
                                  : opt.id === 'INSANITY'
                                    ? 'bg-fuchsia-500 text-white'
                                    : 'bg-slate-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
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

            <div className="rounded-xl border border-slate-800 bg-slate-900/65 p-3">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-slate-100">Post-Stun Protection</span>
                <span className="text-[11px] text-slate-400">Grace shield &amp; speed after stun</span>
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-950/90 border border-slate-800">
                {LEVELS.map((lvl) => {
                  const active = activePostStunLevel === lvl;
                  const label =
                    lvl === 'LOW' ? '0.5s +25%' : lvl === 'MEDIUM' ? '1.0s +50%' : '1.5s +75%';
                  return (
                    <button
                      key={lvl}
                      type="button"
                      disabled={readOnly}
                      onClick={() => setLevel('postStunGrace', lvl)}
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
          </div>

          {/* Library Special Modifier: Figure Difficulty (5 Modes) */}
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-slate-900/80 to-rose-950/25 p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35">
                  The Library Special
                </span>
                <span className="text-xs font-bold text-slate-100">Figure Difficulty Mode</span>
              </div>
              <span className="text-[11px] text-amber-200/75">
                Scales hearing, rage speed &amp; duration, stair slowdown, and blast stun
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1 p-1 rounded-lg bg-slate-950/90 border border-slate-800">
              {FIGURE_DIFFICULTY_ORDER.map((diffId) => {
                const prof = FIGURE_DIFFICULTY_PROFILES[diffId];
                const active = activeFigureDiff === diffId;
                return (
                  <button
                    key={diffId}
                    type="button"
                    disabled={readOnly}
                    onClick={() => setFigureDifficulty(diffId)}
                    className={`px-1.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap truncate ${
                      active
                        ? diffId === 'STANDARD'
                          ? 'bg-sky-500 text-slate-950'
                          : diffId === 'DOCILE'
                            ? 'bg-emerald-400 text-slate-950'
                            : diffId === 'HUNTER'
                              ? 'bg-amber-400 text-slate-950'
                              : diffId === 'FERAL'
                                ? 'bg-orange-500 text-slate-950'
                                : 'bg-rose-500 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    {prof.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="rounded-lg bg-slate-950/65 border border-slate-800/80 px-2.5 py-1.5">
                <div className="text-slate-400 text-[10px]">Hearing</div>
                <div
                  className={`font-semibold ${
                    activeFigureProfile.hearThroughFloors ? 'text-rose-300' : 'text-slate-100'
                  }`}
                >
                  {activeFigureProfile.hearingRadius}px ·{' '}
                  {activeFigureProfile.hearThroughFloors ? 'Through Floors' : 'Same Floor'}
                </div>
              </div>
              <div className="rounded-lg bg-slate-950/65 border border-slate-800/80 px-2.5 py-1.5">
                <div className="text-slate-400 text-[10px]">Rage Speed &amp; Time</div>
                <div className="font-semibold text-amber-200">
                  {activeFigureProfile.rageMinRatio.toFixed(2)}x–
                  {activeFigureProfile.rageMaxRatio.toFixed(2)}x · {activeFigureProfile.rageDuration}s
                </div>
              </div>
              <div className="rounded-lg bg-slate-950/65 border border-slate-800/80 px-2.5 py-1.5">
                <div className="text-slate-400 text-[10px]">Stair Climb</div>
                <div
                  className={`font-semibold ${
                    activeFigureProfile.stairClimbTime <= 0 ? 'text-rose-300' : 'text-slate-100'
                  }`}
                >
                  {activeFigureProfile.stairClimbTime <= 0
                    ? 'No Slowdown'
                    : `${activeFigureProfile.stairClimbTime}s`}
                </div>
              </div>
              <div className="rounded-lg bg-slate-950/65 border border-slate-800/80 px-2.5 py-1.5">
                <div className="text-slate-400 text-[10px]">Blast Stun</div>
                <div className="font-semibold text-sky-200">
                  {activeFigureProfile.stunDuration}s
                </div>
              </div>
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
            {footerAction}
          </div>
    </>
  );
}

export function ModifiersScreen({
  modifiers,
  readOnly = false,
  onChange,
  onClose,
}: ModifiersScreenProps) {
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

          <div className="mt-4">
            <ModifiersContent
              modifiers={modifiers}
              readOnly={readOnly}
              onChange={onChange}
              footerAction={
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-xl bg-sky-400 hover:bg-sky-300 px-5 py-2 text-xs font-bold text-slate-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Done
                </button>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
