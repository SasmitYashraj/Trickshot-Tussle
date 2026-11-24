import { BookOpen, Compass, Crosshair, Gamepad2, Map as MapIcon, Package, ShieldAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type TutorialCategory = 'ALL' | 'THEME' | 'MECHANICS' | 'MAPS' | 'OBJECTS' | 'BOTS';

interface TutorialModalProps {
  onClose: () => void;
}

const CATEGORIES: Array<{ id: TutorialCategory; label: string }> = [
  { id: 'ALL', label: 'All Guides' },
  { id: 'THEME', label: 'Core Theme' },
  { id: 'MECHANICS', label: 'Controls & Rules' },
  { id: 'MAPS', label: 'Maps & Library' },
  { id: 'OBJECTS', label: 'Objects' },
  { id: 'BOTS', label: 'Bot Dossiers' },
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
          className="my-auto w-full max-w-3xl rounded-2xl border border-slate-700/80 bg-[#111A2C] p-5 sm:p-6 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4 text-amber-300" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-lg sm:text-xl font-extrabold text-slate-50 truncate">
                  Arena Field Manual
                </h2>
                <p className="text-xs text-slate-400 truncate">
                  Pure text guide to ricochets, arenas, hazards, and opponents
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close tutorial"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Category Filter Tabs */}
          <div className="mt-4 flex flex-wrap gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`flex-1 min-w-[92px] px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
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

          {/* Body Content — Pure Text Form */}
          <div className="mt-4 space-y-5 text-xs sm:text-[13px] text-slate-300 leading-relaxed">
            {show('THEME') && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-300 font-display font-bold text-sm sm:text-base">
                  <Compass className="w-4 h-4 shrink-0" />
                  <span>1. Core Theme: Read Every Wall, Own Every Angle</span>
                </div>
                <p>
                  Trickshot Tussle is built around spatial awareness. Every shot can rebound up to five times across stone, oak, steel, and ice, turning every corridor and piece of furniture into a weapon—or a trap for anyone who shoots carelessly.
                </p>
                <p>
                  Standing still and trading direct shots is the fastest way to lose. Watch the geometry of the room, trace where live bullets are bouncing and returning, slip sideways out of crossfires, and bank shots behind cover. The more deliberate trickshots a player lands, the cleaner every duel becomes.
                </p>
              </section>
            )}

            {show('MECHANICS') && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sky-300 font-display font-bold text-sm sm:text-base">
                  <Gamepad2 className="w-4 h-4 shrink-0" />
                  <span>2. Controls, Ricochets &amp; Match Rules</span>
                </div>

                <div className="space-y-1.5">
                  <div className="font-bold text-slate-100">Touchscreen Joystick (Move &amp; Release)</div>
                  <p>
                    Drag the floating stick in the direction you want to move and face—your fighter rotates toward your stick direction and moves proportionally to how far you pull. A slight nudge near the center lets you pivot in place or creep quietly; pulling further hits full sprint. When you release the stick from outside the inner firing threshold, your fighter fires straight along their current facing angle. Swap the stick between Left and Right corners anytime in Settings.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="font-bold text-slate-100">Desktop &amp; Offline 2-Player Controls</div>
                  <p>
                    On PC, move with <span className="font-semibold text-slate-100">WASD</span> (hold <span className="font-semibold text-slate-100">Shift</span> to creep silently, or toggle <span className="font-semibold text-slate-100">C</span> for Walk Cap), aim 360° with your cursor, press <span className="font-semibold text-slate-100">Spacebar</span> to shoot, and press <span className="font-semibold text-slate-100">E</span> near The Library&apos;s central padlock to enter codes. In Offline 2-Player on classic arenas, touch players use diagonal corners (Bottom-Left vs Top-Right, or mirrored when Right-hand stick is enabled), while PC players battle with <span className="font-semibold text-slate-100">WASD + Space</span> against <span className="font-semibold text-slate-100">Arrow Keys + Enter</span>. Matches always run in landscape orientation.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="font-bold text-slate-100">Ballistics, Stuns &amp; Game Modes</div>
                  <p>
                    Fighters start with <span className="font-semibold text-slate-100">100 HP</span> and collect ammo off the floor (default cap <span className="font-semibold text-slate-100">5 rounds</span>). Each hit deals <span className="font-semibold text-slate-100">33 damage</span> (3 hits to KO), travels at high speed for up to <span className="font-semibold text-slate-100">5 seconds</span> or <span className="font-semibold text-slate-100">5 wall bounces</span>, and has only a <span className="font-semibold text-slate-100">0.14s self-grace</span> window—your own ricochets can injure or KO you! Taking a hit briefly stuns you (<span className="font-semibold text-slate-100">0.85s</span>) followed by a short post-stun shield (<span className="font-semibold text-slate-100">1.0s</span>) and spawn shield (<span className="font-semibold text-slate-100">1.5s</span>) so fights stay dynamic. Play <span className="font-semibold text-slate-100">Last Up</span> (1 life per round) or <span className="font-semibold text-slate-100">8 KOs</span> (fast respawns to 8 eliminations) in <span className="font-semibold text-slate-100">FFA</span> or <span className="font-semibold text-slate-100">2v2</span>, and customize rules anytime in Settings.
                  </p>
                </div>
              </section>
            )}

            {show('MAPS') && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 font-display font-bold text-sm sm:text-base">
                  <MapIcon className="w-4 h-4 shrink-0" />
                  <span>3. Maps &amp; The Library</span>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Classic Open-View Arenas
                  </div>
                  <p>
                    <span className="font-bold text-amber-200">Manor Foyer:</span> A warm modern oak house hall centered around a long banquet table and twin velvet sofas. Clean sightlines and angled furniture edges invite wide cross-room bank shots.
                  </p>
                  <p>
                    <span className="font-bold text-lime-200">Meadow Clearing:</span> A bright, sunlit garden-style lawn bordered by trimmed hedges with two broad shade trees and a sturdy lower boulder. Open curves reward dodging and curving rebounds around trunks rather than tight hallways.
                  </p>
                  <p>
                    <span className="font-bold text-sky-200">Cargo Deck:</span> A polished slate-and-steel warehouse deck anchored by twin heavy shipping containers. Tight parallel lanes create fast symmetrical duels and sharp corner rebounds.
                  </p>
                  <p>
                    <span className="font-bold text-cyan-200">Winter Tussle:</span> A mist-veiled alpine snowfield dotted with pine spruces and fragile frozen ponds. Shooting or blasting Nitro/TNT over an ice pond shatters it into dark freezing water—stepping into broken water deals an instant Splash KO.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Immersive Tracking Arenas (Solo &amp; Online Only)
                  </div>
                  <p>
                    <span className="font-bold text-amber-200">Wooden Mansion:</span> Far larger than Manor Foyer&apos;s single hall, this sprawling multi-wing oak house winds through bedrooms, study bookshelves, side lounges, velvet sofas, banquet tables, and locked steel safes. A tight tracking camera keeps distant rooms hidden—listen for directional gunshot and pickup cues, and enable <span className="font-semibold text-slate-100">Extra Dark</span> for flashlight-beam tension.
                  </p>
                  <p>
                    <span className="font-bold text-emerald-200">Emerald Grove:</span> Unlike Meadow Clearing&apos;s tidy garden lawn, Emerald Grove is a vast deep forest clearing crowded with ancient trees, winding garden hedges, mossy boulders, and central supply crates. Dense timber clusters turn every chase into an ambush of unseen wall and trunk rebounds.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    The Library — Full Survival &amp; Cipher Breakdown
                  </div>
                  <p>
                    A two-floor haunted wooden archive featuring a <span className="font-semibold text-slate-100">Ground Atrium</span> and an <span className="font-semibold text-slate-100">Upper Mezzanine</span> connected by four outer staircases. Each fighter hunts <span className="font-semibold text-slate-100">8 glowing books</span> (4 Ground, 4 Upper): three contain decoy shapes and five reveal real numbered shape clues—collecting your 8th book automatically reveals the final 5th digit. Bring your 5-digit code to your assigned side (<span className="font-semibold text-slate-100">N, E, S, W</span>) of the central Cipher Pillar and press <span className="font-semibold text-slate-100">E</span> (or tap the Padlock button) to dial the semi-transparent lock while keeping an eye on your surroundings.
                  </p>
                  <p>
                    <span className="font-semibold text-rose-300">The Figure:</span> A towering blind entity patrols both floors. Its calm patrol pace accelerates as total books are collected across the match. Running fast, firing guns, or setting off blasts triggers <span className="font-semibold text-rose-200">Rage</span>, sending Figure sprinting straight toward the sound source for <span className="font-semibold text-slate-100">7.5s–16.5s</span> (scaling by Figure Difficulty in Settings). Hold <span className="font-semibold text-slate-100">Shift</span>, toggle <span className="font-semibold text-slate-100">Walk Cap (C)</span>, or ease your joystick below the stealth cap (<span className="font-semibold text-slate-100">62%–85%</span> speed depending on difficulty) to stay silent. Shooting Figure slows it for <span className="font-semibold text-slate-100">5s</span>; catching it in a Nitro or TNT explosion stuns it for <span className="font-semibold text-slate-100">5s–13s</span>. Figure slows down while climbing stairs on lower difficulties, but on <span className="font-semibold text-rose-300">Nightmare</span> it climbs at full speed and hears footsteps through floors! In 8 KOs mode, fighters also have an <span className="font-semibold text-slate-100">8-Heart</span> limit—lose all hearts to Figure or opponents and you are out.
                  </p>
                </div>
              </section>
            )}

            {show('OBJECTS') && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-orange-300 font-display font-bold text-sm sm:text-base">
                  <Package className="w-4 h-4 shrink-0" />
                  <span>4. Pickups, Cover &amp; Explosives</span>
                </div>
                <p>
                  <span className="font-bold text-yellow-300">Floor Bullets:</span> Glowing amber rounds recharge your ammo reserve. Timing routes between ammo spawns controls map pressure—starving an opponent of bullets forces risky scrambles.
                </p>
                <p>
                  <span className="font-bold text-emerald-300">Medkits (+35 HP):</span> Restore 35 health immediately on pickup when injured, letting damaged fighters survive an extra direct hit.
                </p>
                <p>
                  <span className="font-bold text-amber-200">Cardboard Boxes:</span> Pushable 1-hit wooden crates. You can shove them down lanes as mobile cover; blocking one bullet punctures the crate and fades it out before a fresh crate drops elsewhere.
                </p>
                <p>
                  <span className="font-bold text-red-300">Nitro Canisters (-33 HP · 135px Blast):</span> Volatile canisters that detonate the instant any bullet touches them—ignoring walls slightly around tight corners, chain-triggering adjacent Nitro/TNT, lighting up Extra Dark rooms, shattering Winter ice ponds, and stunning The Figure.
                </p>
                <p>
                  <span className="font-bold text-orange-300">TNT Barrels (-45 HP · 170px Blast):</span> Heavy barrels that take a <span className="font-semibold text-slate-100">3.0-second fuse</span> when struck, sliding forward with bullet momentum before erupting in a massive blast wave. Kick a ticking barrel toward someone&apos;s corner—or get clear before it blows.
                </p>
              </section>
            )}

            {show('BOTS') && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-rose-300 font-display font-bold text-sm sm:text-base">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>5. Bot Dossiers (100% Fair-Play Rules)</span>
                </div>
                <p className="text-slate-400">
                  Every bot plays under identical human constraints: same top speed, same turn rate, single-stick facing (they can only fire where they face while moving), no seeing outside Immersive bounds, and full Library stealth/sound rules.
                </p>
                <p>
                  <span className="font-bold text-emerald-300">Chill:</span> <span className="text-slate-200 font-semibold">Strengths:</span> Steady roaming, basic direct shots, and light dodging—ideal for learning bounce lanes and map paths. <span className="text-slate-200 font-semibold">Weaknesses:</span> Rarely reads multi-wall trickshots, turns sluggishly in close quarters, and reacts late to fast flank angles.
                </p>
                <p>
                  <span className="font-bold text-sky-300">Tactical:</span> <span className="text-slate-200 font-semibold">Strengths:</span> Actively contests ammo and medkits, uses bank shots around cover, sweeps dark corridors, and avoids obvious hazards and TNT fuses. <span className="text-slate-200 font-semibold">Weaknesses:</span> Can still be baited by unpredictable multi-bounce geometry or pressured when outnumbered in two-angle crossfires.
                </p>
                <p>
                  <span className="font-bold text-rose-300">Ruthless:</span> <span className="text-slate-200 font-semibold">Strengths:</span> Tracks multi-bounce trajectories in real time, predicts movement to land crisp ricochet angles behind walls, refuses suicide rebounds, intercepts contested pickups smartly instead of walking into close-range traps, detonates Nitro/TNT near enemies, hunts directional sound in Immersive maps, and navigates The Library quietly while timing blasts on The Figure. <span className="text-slate-200 font-semibold">Weaknesses:</span> Bound by human turn speed and stick-facing physics—only split-second turn commits, two-angle pinches, or starving the room of ammo can break their rhythm.
                </p>
              </section>
            )}

            {/* Poetic Closing Quote (Always visible at bottom of Tutorial page) */}
            <blockquote className="rounded-xl border border-amber-400/30 bg-slate-950/75 px-4 py-3.5 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-amber-300/90 text-[11px] font-bold uppercase tracking-[0.2em]">
                <Crosshair className="w-3.5 h-3.5" />
                <span>Rule of the Ricochet</span>
              </div>
              <p className="italic text-slate-200 text-xs sm:text-sm leading-relaxed max-w-2xl mx-auto">
                &ldquo;See the whole room before you pull, trace every wall where the sparks may fly, step past the blade of a returning shot, and turn corner to corner into your canvas—for the truest victory is earned off the bank, and the boldest fighter makes every clash a{' '}
                <span className="not-italic font-display font-black tracking-wide text-amber-300">
                  TRICKSHOT TUSSLE!
                </span>
                &rdquo;
              </p>
            </blockquote>
          </div>

          {/* Footer */}
          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-sky-500 hover:bg-sky-400 px-5 py-2 text-xs font-bold text-slate-950 cursor-pointer whitespace-nowrap"
            >
              Got It
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
