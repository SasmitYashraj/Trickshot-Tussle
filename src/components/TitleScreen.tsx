import { ChevronRight, Globe, Map as MapIcon, Palette, Play, Sliders, User, Users } from 'lucide-react';
import { useState } from 'react';
import { ARENA_MAPS, IMMERSIVE_DARK_PREVIEW_URLS, MAP_PREVIEW_URLS } from '../game/maps';
import {
  type BotDifficulty,
  DEFAULT_MATCH_MODIFIERS,
  type MatchConfig,
  type MatchMode,
  type MatchModifiers,
  PLAYER_COLOR_PALETTE,
  type TeamMode,
} from '../game/types';
import { ModifiersScreen } from './ModifiersScreen';
import { PlayerAvatar } from './PlayerAvatar';
import { PWAInstallButton } from './PWAInstallButton';

interface TitleScreenProps {
  config: MatchConfig;
  initialRoomCode?: string;
  onlineError: string | null;
  onlineConnecting?: boolean;
  onChangeConfig: (next: MatchConfig) => void;
  onOpenMapSelect: () => void;
  onOpenColorSelect: () => void;
  onStartSolo: () => void;
  onCreateOnlineRoom: (name: string) => void;
  onJoinOnlineRoom: (code: string, name: string) => void;
}

export function TitleScreen({
  config,
  initialRoomCode = '',
  onlineError,
  onlineConnecting = false,
  onChangeConfig,
  onOpenMapSelect,
  onOpenColorSelect,
  onStartSolo,
  onCreateOnlineRoom,
  onJoinOnlineRoom,
}: TitleScreenProps) {
  const [tab, setTab] = useState<'SOLO' | 'ONLINE'>(initialRoomCode || onlineError ? 'ONLINE' : 'SOLO');
  const [nickname, setNickname] = useState('Player');
  const [joinCode, setJoinCode] = useState(initialRoomCode);
  const [modifiersOpen, setModifiersOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  const [pointerPct, setPointerPct] = useState<{ x: number; y: number }>({ x: 50, y: 35 });

  const setMode = (mode: MatchMode) => onChangeConfig({ ...config, mode });
  const setTeamMode = (teamMode: TeamMode) => onChangeConfig({ ...config, teamMode });
  const setColor = (playerColorId: string) => onChangeConfig({ ...config, playerColorId });
  const setDifficulty = (difficulty: BotDifficulty) => onChangeConfig({ ...config, difficulty });
  const setModifiers = (modifiers: MatchModifiers) => onChangeConfig({ ...config, modifiers });

  const activeColorId = config.playerColorId ?? 'cobalt';
  const activeColorOpt =
    PLAYER_COLOR_PALETTE.find((c) => c.id === activeColorId) ?? PLAYER_COLOR_PALETTE[0];
  const activeTeamMode: TeamMode = config.teamMode ?? 'FFA';
  const activeModifiers = config.modifiers ?? DEFAULT_MATCH_MODIFIERS;
  const activeMap = ARENA_MAPS[config.mapId];
  const mapPreview = MAP_PREVIEW_URLS[config.mapId];

  const modifiedCount = (Object.keys(DEFAULT_MATCH_MODIFIERS) as Array<keyof MatchModifiers>).filter(
    (k) => (activeModifiers[k] ?? DEFAULT_MATCH_MODIFIERS[k]) !== DEFAULT_MATCH_MODIFIERS[k]
  ).length;

  return (
    <div
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setPointerPct({
            x: Math.max(10, Math.min(90, ((e.clientX - r.left) / r.width) * 100)),
            y: Math.max(10, Math.min(90, ((e.clientY - r.top) / r.height) * 100)),
          });
        }
      }}
      className="relative h-dvh w-full overflow-y-auto overscroll-contain bg-[#0B1120]"
    >
      {/* Subtle Interactive Arena Ambient Lighting */}
      <div
        className="pointer-events-none fixed inset-0 transition-[background] duration-300"
        style={{
          background: `radial-gradient(620px circle at ${pointerPct.x}% ${pointerPct.y}%, rgba(14, 165, 233, 0.12), transparent 65%), radial-gradient(480px circle at ${100 - pointerPct.x}% ${100 - pointerPct.y}%, rgba(245, 158, 11, 0.08), transparent 70%)`,
        }}
      />

      <div className="relative z-10 min-h-full w-full flex flex-col items-center justify-center p-3 sm:p-5">
        <div className="my-auto w-full max-w-4xl rounded-2xl border border-slate-800/90 bg-[#111A2C]/95 backdrop-blur-md p-4 sm:p-6 md:p-7 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-7">
            {/* Left column: Title, Live Skin Preview & Arena Guide */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-12 w-12 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center justify-center shrink-0 shadow-inner">
                    <PlayerAvatar
                      color={activeColorOpt.color}
                      accentColor={activeColorOpt.accentColor}
                      finish={activeColorOpt.finish}
                      size={36}
                    />
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-50 truncate">
                      Trickshot Tussle
                    </h1>
                    <div className="text-[11px] font-medium text-sky-300/90">
                      Fighter Finish: <span className="font-bold text-slate-100">{activeColorOpt.name}</span>
                    </div>
                  </div>
                </div>
                <PWAInstallButton />
              </div>

              <p className="mt-3 text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
                Move with <span className="font-semibold text-slate-100">WASD</span> (hold <span className="font-semibold text-slate-100">Shift</span> to creep), aim 360° with your cursor, and press <span className="font-semibold text-slate-100">Spacebar</span> to fire on PC—or drag &amp; release on touchscreens.
              </p>

              {/* Compact Fighter Colour Row + More Colours Button */}
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/65 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {(() => {
                      const quickPicks = PLAYER_COLOR_PALETTE.slice(0, 5);
                      if (!quickPicks.some((c) => c.id === activeColorId)) {
                        quickPicks.push(activeColorOpt);
                      } else if (PLAYER_COLOR_PALETTE.length > 5) {
                        quickPicks.push(PLAYER_COLOR_PALETTE[5]);
                      }
                      return quickPicks.map((opt) => {
                        const selected = activeColorId === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            title={opt.name}
                            aria-label={`Select ${opt.name}`}
                            onClick={() => setColor(opt.id)}
                            className={`h-9 w-9 rounded-lg border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                              selected
                                ? 'bg-slate-800 border-white scale-105 shadow-[0_0_0_2px_rgba(14,165,233,0.5)]'
                                : 'bg-slate-950/60 border-slate-800 opacity-85 hover:opacity-100 hover:border-slate-600'
                            }`}
                          >
                            <PlayerAvatar
                              color={opt.color}
                              accentColor={opt.accentColor}
                              finish={opt.finish}
                              size={24}
                              showVisor={false}
                            />
                          </button>
                        );
                      });
                    })()}
                  </div>

                  <button
                    type="button"
                    onClick={onOpenColorSelect}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-sky-500 hover:border-sky-400 hover:text-slate-950 px-3 py-2 text-xs font-bold text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Palette className="w-3.5 h-3.5" />
                    More Colours
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex items-center gap-2.5">
                    <span className="h-3.5 w-3.5 rounded-full bg-yellow-400 border border-yellow-200 shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-slate-100">Ricochet Shots</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 leading-snug">
                    Collect floor ammo. Stunned fighters gain brief shield protection; tune rules in Modifiers.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex items-center gap-2.5">
                    <span className="h-3.5 w-3.5 rounded-sm bg-red-600 border border-red-200 shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-slate-100">Cover, Nitro &amp; TNT</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 leading-snug">
                    Push crates &amp; 3s-fuse TNT barrels. Blasts light the room and stun The Figure in Library.
                  </p>
                </div>
              </div>
            </div>

            {/* Right column: Play Mode Tabs (Solo vs Online Multiplayer) */}
            <div className="w-full md:w-80 lg:w-84 shrink-0 flex flex-col gap-3.5 border-t md:border-t-0 md:border-l border-slate-800 pt-5 md:pt-0 md:pl-6">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setTab('SOLO')}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    tab === 'SOLO' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  Solo vs Bots
                </button>
                <button
                  type="button"
                  onClick={() => setTab('ONLINE')}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    tab === 'ONLINE' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Online Lobby
                </button>
              </div>

              {tab === 'SOLO' ? (
                <>
                  {/* Selected Arena Feathered Card -> Opens Dedicated Map Selection Screen */}
                  <button
                    type="button"
                    onClick={onOpenMapSelect}
                    className="group relative w-full rounded-xl border border-slate-700/80 hover:border-sky-400/80 bg-[#0D1424] overflow-hidden text-left transition-all cursor-pointer"
                  >
                    <div className="relative h-24 w-full bg-slate-950 overflow-hidden">
                      {!imgFailed[activeMap.id] ? (
                        <img
                          src={mapPreview}
                          alt={activeMap.name}
                          referrerPolicy="no-referrer"
                          onError={() => setImgFailed((prev) => ({ ...prev, [activeMap.id]: true }))}
                          className={`absolute inset-0 h-full w-full object-cover object-center group-hover:scale-105 transition-all duration-500 ${
                            activeMap.immersive && config.extraDark && IMMERSIVE_DARK_PREVIEW_URLS[activeMap.id]
                              ? 'opacity-0'
                              : 'opacity-100'
                          }`}
                        />
                      ) : (
                        <div className="h-full w-full bg-slate-900" />
                      )}
                      {activeMap.immersive &&
                        IMMERSIVE_DARK_PREVIEW_URLS[activeMap.id] &&
                        !imgFailed[`${activeMap.id}_dark`] && (
                          <img
                            src={IMMERSIVE_DARK_PREVIEW_URLS[activeMap.id]}
                            alt={`${activeMap.name} dark mode`}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setImgFailed((prev) => ({ ...prev, [`${activeMap.id}_dark`]: true }))
                            }
                            className={`absolute inset-0 h-full w-full object-cover object-center group-hover:scale-105 transition-all duration-500 ${
                              config.extraDark ? 'opacity-100' : 'opacity-0'
                            }`}
                          />
                        )}
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background:
                            'linear-gradient(180deg, rgba(13,20,36,0.05) 10%, rgba(13,20,36,0.72) 70%, #0D1424 100%)',
                        }}
                      />
                    </div>
                    <div className="px-3.5 pb-3 -mt-5 relative z-10 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                          {activeMap.immersive
                            ? config.extraDark
                              ? 'Immersive · Extra Dark'
                              : 'Immersive Arena'
                            : 'Classic 2D Arena'}
                        </div>
                        <div className="font-display text-base font-extrabold text-slate-50 truncate">
                          {activeMap.name}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-800/90 group-hover:bg-sky-500 group-hover:text-slate-950 px-2.5 py-1.5 text-[11px] font-bold text-slate-100 transition-colors whitespace-nowrap shrink-0">
                        <MapIcon className="w-3 h-3" />
                        Choose Map
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-400 mb-1.5">Format</div>
                      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setTeamMode('FFA')}
                          className={`px-2 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            activeTeamMode === 'FFA'
                              ? 'bg-slate-700 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          FFA
                        </button>
                        <button
                          type="button"
                          onClick={() => setTeamMode('2V2')}
                          className={`px-2 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            activeTeamMode === '2V2'
                              ? 'bg-sky-500 text-slate-950'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          2v2
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-400 mb-1.5">Match Rule</div>
                      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setMode('ELIMINATION')}
                          className={`px-1.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            config.mode === 'ELIMINATION'
                              ? 'bg-slate-700 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Last Up
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode('BRAWL')}
                          className={`px-1.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            config.mode === 'BRAWL'
                              ? 'bg-slate-700 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          8 KOs
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-400 mb-1.5">Rival Skill</div>
                    <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800">
                      {(['CHILL', 'TACTICAL', 'RUTHLESS'] as BotDifficulty[]).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setDifficulty(level)}
                          className={`px-2 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            config.difficulty === level
                              ? 'bg-slate-700 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {level === 'CHILL' ? 'Chill' : level === 'TACTICAL' ? 'Tactical' : 'Ruthless'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setModifiersOpen(true)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3.5 py-3 text-xs font-bold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Sliders className="w-3.5 h-3.5 text-sky-400" />
                      Modifiers{modifiedCount > 0 ? ` (${modifiedCount})` : ''}
                    </button>

                    <button
                      type="button"
                      onClick={onStartSolo}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 hover:bg-sky-300 active:scale-[0.99] px-4 py-3 text-sm font-extrabold text-slate-950 transition-all cursor-pointer whitespace-nowrap shadow-lg shadow-sky-500/20"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      {activeTeamMode === '2V2' ? 'Start 2v2' : 'Start Match'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs text-slate-300 leading-relaxed">
                    Play across devices with up to 4 friends! Host chooses maps, Extra Dark torch mode, and match modifiers inside the lobby.
                  </div>

                  {onlineError && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200">
                      {onlineError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="player-nickname" className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Your Name
                    </label>
                    <input
                      id="player-nickname"
                      type="text"
                      maxLength={14}
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={onlineConnecting}
                    onClick={() => onCreateOnlineRoom(nickname)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 hover:bg-sky-300 disabled:opacity-60 active:scale-[0.99] px-4 py-2.5 text-sm font-bold text-slate-950 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Users className="w-4 h-4" />
                    {onlineConnecting ? 'Connecting...' : 'Create Online Lobby'}
                  </button>

                  <div className="pt-3 border-t border-slate-800">
                    <label htmlFor="join-room-code" className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Or Join with 4-Letter Code
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="join-room-code"
                        type="text"
                        maxLength={6}
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="CODE"
                        className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono-tabular font-bold uppercase tracking-widest text-slate-100 placeholder:text-slate-600 focus:border-sky-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={onlineConnecting || joinCode.trim().length < 3}
                        onClick={() => onJoinOnlineRoom(joinCode, nickname)}
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {onlineConnecting ? 'Joining...' : 'Join Lobby'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {modifiersOpen && (
        <ModifiersScreen
          modifiers={activeModifiers}
          onChange={setModifiers}
          onClose={() => setModifiersOpen(false)}
        />
      )}
    </div>
  );
}

