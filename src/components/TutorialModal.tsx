import { BookOpen, Compass, Crosshair, Gamepad2, Map as MapIcon, Package, ShieldAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type TutorialCategory = 'ALL' | 'THEME' | 'MECHANICS' | 'MAPS' | 'OBJECTS' | 'BOTS';

interface TutorialModalProps {
  onClose: () => void;
}

const CATEGORIES: Array<{ id: TutorialCategory; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'THEME', label: 'Theme' },
  { id: 'MECHANICS', label: 'Controls' },
  { id: 'MAPS', label: 'Maps' },
  { id: 'OBJECTS', label: 'Objects' },
  { id: 'BOTS', label: 'Bots' },
];

export function TutorialModal({ onClose }: TutorialModalProps) {
  const [category, setCategory] = useState<TutorialCategory>('ALL');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const show = (section: Exclude<TutorialCategory, 'ALL'>) =>
    category === 'ALL' || category === section;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-slate-950/85 backdrop-blur-sm"
    >
      <div className="min-h-full w-full flex flex-col items-center justify-center p-3 sm:p-5">
        <div
          onClick={(e) => e.stopPropagation()}
          className="my-auto w-full max-w-2xl rounded-2xl border border-slate-700/80 bg-[#111A2C] p-4 sm:p-5 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4 text-amber-300" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base sm:text-lg font-extrabold text-slate-50 truncate">
                  Tutorial
                </h2>
                <p className="text-[11px] text-slate-400 truncate">
                  Quick field notes — discover the rest inside the arena
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close tutorial"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Top Poetic Quote (Immediately Visible) */}
          <blockquote className="mt-3 rounded-xl border border-amber-400/30 bg-slate-950/75 px-3.5 py-2.5 text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-amber-300/90 text-[10px] font-bold uppercase tracking-[0.2em]">
              <Crosshair className="w-3 h-3" />
              <span>Rule of the Ricochet</span>
            </div>
            <p className="italic text-slate-200 text-xs leading-relaxed">
              &ldquo;Read every wall, watch where sparks fly, slip past the rebound, and turn every angle into a{' '}
              <span className="not-italic font-display font-black tracking-wide text-amber-300">
                TRICKSHOT TUSSLE!
              </span>
              &rdquo;
            </p>
          </blockquote>

          {/* Category Filter Tabs */}
          <div className="mt-3 flex flex-wrap gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`flex-1 min-w-[68px] px-2 py-1.5 text-[11px] font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* Crisp One-Liner Body */}
          <div className="mt-3 space-y-2.5 text-xs text-slate-300 leading-snug">
            {show('THEME') && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-display font-bold text-xs sm:text-sm">
                  <Compass className="w-3.5 h-3.5 shrink-0" />
                  <span>Core Theme</span>
                </div>
                <ul className="space-y-1 text-slate-300">
                  <li>
                    <span className="font-semibold text-slate-100">Read the room:</span> Watch wall angles, track bouncing bullets, and stay out of return lanes.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-100">Chase trickshots:</span> Bank shots around cover—the cleaner your trickshots, the deadlier you become.
                  </li>
                </ul>
              </section>
            )}

            {show('MECHANICS') && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sky-300 font-display font-bold text-xs sm:text-sm">
                  <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Controls &amp; Basics</span>
                </div>
                <ul className="space-y-1">
                  <li>
                    <span className="font-semibold text-slate-100">Touch Stick:</span> Drag to move and face; pull slightly to creep silently; release past center to shoot.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-100">PC Controls:</span> <span className="text-slate-100">WASD</span> move · <span className="text-slate-100">Shift</span> creep · <span className="text-slate-100">Cursor</span> aim · <span className="text-slate-100">Space</span> fire · <span className="text-slate-100">E</span> padlock.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-100">Offline 2P:</span> Diagonal touch sticks on one landscape screen, or <span className="text-slate-100">WASD+Space</span> vs <span className="text-slate-100">Arrows+Enter</span>.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-100">Shots &amp; Modes:</span> Bullets bounce up to 5 times and can hurt you too; battle in <span className="text-slate-100">Last Up</span> or <span className="text-slate-100">8 KOs</span> (<span className="text-slate-100">FFA / 2v2</span>).
                  </li>
                </ul>
              </section>
            )}

            {show('MAPS') && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-300 font-display font-bold text-xs sm:text-sm">
                  <MapIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Maps &amp; The Library</span>
                </div>
                <ul className="space-y-1">
                  <li>
                    <span className="font-bold text-amber-200">Manor Foyer:</span> Modern house hall with a central dining table and sofas for wide bank shots.
                  </li>
                  <li>
                    <span className="font-bold text-lime-200">Meadow Clearing:</span> Open sunlit garden lawn with trimmed hedges, twin trees, and dodging room.
                  </li>
                  <li>
                    <span className="font-bold text-sky-200">Cargo Deck:</span> Polished warehouse deck split by twin steel containers for crisp lane duels.
                  </li>
                  <li>
                    <span className="font-bold text-cyan-200">Winter Tussle:</span> Snowy pines and fragile ice ponds—explosions shatter ice into fatal water.
                  </li>
                  <li>
                    <span className="font-bold text-amber-200">Wooden Mansion (Immersive):</span> Multi-room oak house with bedrooms, lounges, and safes—tight view &amp; sound cues.
                  </li>
                  <li>
                    <span className="font-bold text-emerald-200">Emerald Grove (Immersive):</span> Unlike Meadow&apos;s tidy garden, a dense wild forest full of trees, hedges, and ambushes.
                  </li>
                  <li>
                    <span className="font-bold text-amber-300">The Library:</span> Two floors linked by 4 stairs—hunt 8 books (3 decoys, 5 clues), crack your central cipher door (<span className="text-slate-100">E</span>) with a see-through lock, creep around the blind Figure, slow it with bullets, or stun it with blasts.
                  </li>
                </ul>
              </section>
            )}

            {show('OBJECTS') && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-orange-300 font-display font-bold text-xs sm:text-sm">
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  <span>Pickups &amp; Hazards</span>
                </div>
                <ul className="space-y-1">
                  <li>
                    <span className="font-bold text-yellow-300">Bullets &amp; Medkits:</span> Floor ammo reloads your chamber; medkits patch you up mid-fight.
                  </li>
                  <li>
                    <span className="font-bold text-amber-200">Cardboard Boxes:</span> Pushable crates that block a shot before breaking apart.
                  </li>
                  <li>
                    <span className="font-bold text-red-300">Nitro Canister:</span> Explodes on impact, chains nearby blasts, and lights dark rooms.
                  </li>
                  <li>
                    <span className="font-bold text-orange-300">TNT Barrel:</span> Slides when hit on a 3s fuse before unleashing a wide heavy blast.
                  </li>
                </ul>
              </section>
            )}

            {show('BOTS') && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-rose-300 font-display font-bold text-xs sm:text-sm">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>Bots (Same Human Rules &amp; Facing)</span>
                </div>
                <ul className="space-y-1">
                  <li>
                    <span className="font-bold text-emerald-300">Chill:</span> Good for warmups—misses trickshots and turns slowly.
                  </li>
                  <li>
                    <span className="font-bold text-sky-300">Tactical:</span> Contests ammo, banks shots off cover, yet struggles in fast crossfires.
                  </li>
                  <li>
                    <span className="font-bold text-rose-300">Ruthless:</span> Predicts multi-wall rebounds, traps pickups, and hunts sound cues—still obeys human turn speed, so starve ammo or catch them mid-turn.
                  </li>
                </ul>
              </section>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-sky-500 hover:bg-sky-400 px-5 py-1.5 text-xs font-bold text-slate-950 cursor-pointer whitespace-nowrap"
            >
              Got It
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
