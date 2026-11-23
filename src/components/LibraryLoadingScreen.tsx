import {
  FIGURE_DIFFICULTY_PROFILES,
  type FigureDifficulty,
  LIBRARY_INTRO_DURATION,
} from '../game/types';

interface LibraryLoadingScreenProps {
  introTimer: number;
  figureDifficulty?: FigureDifficulty;
}

export function LibraryLoadingScreen({
  introTimer,
  figureDifficulty = 'STANDARD',
}: LibraryLoadingScreenProps) {
  if (introTimer <= 0) return null;

  const progress = Math.max(0, Math.min(1, 1 - introTimer / LIBRARY_INTRO_DURATION));
  const profile =
    FIGURE_DIFFICULTY_PROFILES[figureDifficulty] ?? FIGURE_DIFFICULTY_PROFILES.STANDARD;
  const silentPct = Math.round(profile.stealthThreshold * 100);
  const stunLabel = Number.isInteger(profile.stunDuration)
    ? `${profile.stunDuration}s`
    : `${profile.stunDuration.toFixed(1)}s`;
  const stairLabel =
    profile.stairClimbTime <= 0
      ? 'no slowdown!'
      : `${profile.stairClimbTime}s`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between bg-black text-slate-100 px-4 py-3 sm:p-6 md:p-10 select-none overflow-hidden h-dvh">
      {/* Top-Left Title & Inspired By Subtext */}
      <div className="relative z-10 flex items-start justify-between shrink-0">
        <div>
          <h1 className="font-display text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-amber-100 leading-none">
            The Library
          </h1>
          <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.26em] text-amber-400/80">
            inspired by DOORS
            {figureDifficulty !== 'STANDARD' ? ` · ${profile.label} Mode` : ''}
          </p>
        </div>
      </div>

      {/* Main Split: Left Crisp Points | Right Figure Artwork (Always side-by-side so phone landscape fits completely!) */}
      <div className="relative z-10 my-auto grid grid-cols-12 items-center gap-2.5 sm:gap-6 md:gap-10 max-w-5xl w-full mx-auto min-h-0">
        <div className="col-span-7 sm:col-span-6 space-y-1.5 sm:space-y-3">
          {/* 1-Line Feather Graphic */}
          <div className="flex items-center text-amber-300/85">
            <svg
              viewBox="0 0 260 22"
              className="w-32 sm:w-52 h-3 sm:h-4.5 overflow-visible"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 12 C 60 12, 130 11, 214 11"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d="M170 11 C 192 2, 224 2, 256 10 C 228 17, 198 18, 170 11 Z"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="rgba(251, 191, 36, 0.14)"
              />
              <path
                d="M190 11 L 204 6 M206 11 L 222 6 M222 11 L 238 7"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <ul className="space-y-1 sm:space-y-2 text-slate-200">
            <li className="flex items-center gap-1.5 sm:gap-2.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-amber-400 shrink-0" />
              <span className="font-display text-[11px] sm:text-sm md:text-base font-bold text-amber-100 leading-tight sm:leading-snug">
                Find 8 books on both floors to unlock center door
              </span>
            </li>

            <li className="flex items-center gap-1.5 sm:gap-2.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-sky-400 shrink-0" />
              <span className="font-display text-[11px] sm:text-sm md:text-base font-bold text-sky-100 leading-tight sm:leading-snug">
                Hold <span className="text-sky-300">Shift</span> / walk &lt;{silentPct}% speed to stay silent
                {profile.hearThroughFloors ? (
                  <span className="text-rose-300"> (hears through floors!)</span>
                ) : null}
              </span>
            </li>

            <li className="flex items-center gap-1.5 sm:gap-2.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-cyan-400 shrink-0" />
              <span className="font-display text-[11px] sm:text-sm md:text-base font-bold text-cyan-100 leading-tight sm:leading-snug">
                Shooting Figure slows him down for <span className="text-cyan-300">5s</span>
              </span>
            </li>

            <li className="flex items-center gap-1.5 sm:gap-2.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-orange-500 shrink-0" />
              <span className="font-display text-[11px] sm:text-sm md:text-base font-bold text-orange-200 leading-tight sm:leading-snug">
                Nitro or TNT blasts stun Figure for <span className="text-amber-300">{stunLabel}</span>
              </span>
            </li>

            <li className="flex items-center gap-1.5 sm:gap-2.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-rose-400 shrink-0" />
              <span className="font-display text-[11px] sm:text-sm md:text-base font-bold text-rose-100 leading-tight sm:leading-snug">
                {profile.stairClimbTime <= 0 ? (
                  <>
                    Figure climbs stairs at <span className="text-rose-300">full speed ({stairLabel})</span>
                  </>
                ) : (
                  <>
                    Figure climbs stairs slowly (<span className="text-rose-300">{stairLabel}</span>)
                  </>
                )}
              </span>
            </li>
          </ul>
        </div>

        <div className="col-span-5 sm:col-span-6 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <div
              className="absolute -inset-3 sm:-inset-6 rounded-full opacity-55 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgba(249,115,22,0.42) 0%, rgba(124,45,18,0.16) 52%, rgba(0,0,0,0) 74%)',
              }}
            />
            <img
              src="/assets/aistudio/image_b23b52cc.png"
              alt="The Figure"
              className="relative max-h-[38dvh] sm:max-h-[46dvh] md:max-h-[52dvh] w-auto object-contain"
            />
          </div>
        </div>
      </div>

      {/* Bottom-Right LOADING... */}
      <div className="relative z-10 flex items-end justify-end shrink-0">
        <div className="flex flex-col items-end gap-1.5">
          <div className="w-36 sm:w-52 h-1 overflow-hidden bg-slate-900 rounded-full">
            <div
              className="h-full bg-amber-400 transition-[width] duration-100 ease-linear"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="font-mono-tabular text-[10px] sm:text-xs font-bold tracking-[0.35em] text-amber-300/90 animate-pulse">
            LOADING...
          </div>
        </div>
      </div>
    </div>
  );
}
