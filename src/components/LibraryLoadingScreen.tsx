import { LIBRARY_INTRO_DURATION } from '../game/types';

interface LibraryLoadingScreenProps {
  introTimer: number;
}

export function LibraryLoadingScreen({ introTimer }: LibraryLoadingScreenProps) {
  if (introTimer <= 0) return null;

  const progress = Math.max(0, Math.min(1, 1 - introTimer / LIBRARY_INTRO_DURATION));

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between bg-black text-slate-100 p-6 sm:p-10 md:p-14 select-none overflow-hidden">
      {/* Top-Left Title & Inspired By Subtext */}
      <div className="relative z-10 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-amber-100">
            The Library
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm font-semibold uppercase tracking-[0.26em] text-amber-400/80">
            inspired by DOORS
          </p>
        </div>
      </div>

      {/* Main Split: Left 1-Line Feather + Instructions | Right Monster Artwork */}
      <div className="relative z-10 my-auto grid grid-cols-1 md:grid-cols-12 items-center gap-6 md:gap-10 max-w-6xl w-full mx-auto">
        <div className="md:col-span-6 space-y-5">
          {/* 1-Line Feather Graphic */}
          <div className="flex items-center gap-3 text-amber-300/85">
            <svg
              viewBox="0 0 260 22"
              className="w-56 sm:w-64 h-5 overflow-visible"
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

          <div className="space-y-3.5 text-slate-200">
            <div className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-amber-400 shrink-0" />
              <div>
                <div className="font-display text-lg sm:text-xl font-bold text-amber-100">
                  Collect books
                </div>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Search the Ground Floor &amp; Upper Mezzanine shelves for 8 hidden books to reveal your shape cipher, then unlock your central pillar door.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-sky-400 shrink-0" />
              <div>
                <div className="font-display text-lg sm:text-xl font-bold text-sky-100">
                  Walk slow
                </div>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Hold <span className="font-semibold text-slate-200">Shift</span> or lower the speed slider under 80% on PC (or ease the touch joystick) to move silently.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-orange-500 shrink-0" />
              <div>
                <div className="font-display text-lg sm:text-xl font-bold text-orange-200">
                  He only hears
                </div>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  The Figure is blind and bullet-proof—he charges full-speed steps and blasts in Rage mode. Use Nitro or TNT blasts to stun him for 15 seconds.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-6 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <div
              className="absolute inset-4 rounded-full blur-3xl opacity-45"
              style={{
                background:
                  'radial-gradient(circle, rgba(249,115,22,0.55) 0%, rgba(124,45,18,0.22) 55%, rgba(0,0,0,0) 75%)',
              }}
            />
            <img
              src="/assets/aistudio/image_b23b52cc.png"
              alt="The Figure"
              className="relative max-h-[42vh] md:max-h-[56vh] w-auto object-contain drop-shadow-[0_0_28px_rgba(249,115,22,0.35)]"
            />
          </div>
        </div>
      </div>

      {/* Bottom-Right LOADING... */}
      <div className="relative z-10 flex items-end justify-end">
        <div className="flex flex-col items-end gap-2">
          <div className="w-44 sm:w-56 h-1 overflow-hidden bg-slate-900 rounded-full">
            <div
              className="h-full bg-amber-400 transition-[width] duration-100 ease-linear"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="font-mono-tabular text-xs sm:text-sm font-bold tracking-[0.35em] text-amber-300/90 animate-pulse">
            LOADING...
          </div>
        </div>
      </div>
    </div>
  );
}
