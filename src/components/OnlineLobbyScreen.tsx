import { ArrowLeftRight, Check, Copy, Lock, LogOut, Play, Settings, Sliders, Users } from 'lucide-react';
import { useState } from 'react';
import {
  ARENA_MAPS,
  IMMERSIVE_DARK_PREVIEW_URLS,
  IMMERSIVE_MAP_LIST,
  MAP_PREVIEW_URLS,
  SOLO_MAP_LIST,
} from '../game/maps';
import type { GeneralSettings } from '../game/settings';
import {
  type BotDifficulty,
  DEFAULT_MATCH_MODIFIERS,
  type MapId,
  type MatchConfig,
  type MatchMode,
  type OnlineRoomState,
  PLAYER_COLOR_PALETTE,
  type TeamMode,
} from '../game/types';
import { PlayerAvatar } from './PlayerAvatar';
import { SettingsModal } from './SettingsModal';

interface OnlineLobbyScreenProps {
  room: OnlineRoomState;
  generalSettings: GeneralSettings;
  errorMessage: string | null;
  onUpdateConfig: (config: MatchConfig) => void;
  onChangeGeneralSettings: (next: GeneralSettings) => void;
  onUpdateColor: (colorId: string) => void;
  onSwapTeam: () => void;
  onStartMatch: () => void;
  onLeave: () => void;
}

export function OnlineLobbyScreen({
  room,
  generalSettings,
  errorMessage,
  onUpdateConfig,
  onChangeGeneralSettings,
  onUpdateColor,
  onSwapTeam,
  onStartMatch,
  onLeave,
}: OnlineLobbyScreenProps) {
  const [copied, setCopied] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'GENERAL' | 'MODIFIERS' | null>(null);
  const [previewFailed, setPreviewFailed] = useState<Record<string, boolean>>({});
  const isHost = room.mySlot === room.hostSlot;
  const is2v2 = room.config.teamMode === '2V2';
  const occupiedCount = room.slots.filter((s) => s.occupied).length;
  const activePlayerCount = room.slots.filter((s) => s.occupied || s.isBot).length;
  const mySlotObj = room.slots.find((s) => s.slot === room.mySlot);
  const myTeam = mySlotObj?.team ?? room.mySlot % 2;
  const otherTeamHasOpenSlot =
    is2v2 && room.slots.some((s) => s.team !== myTeam && !s.occupied);
  const humanTakenColors = new Set(
    room.slots.filter((s) => s.occupied && s.slot !== room.mySlot).map((s) => s.colorId)
  );

  const copyInviteLink = async () => {
    const url = `${window.location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored in restricted clipboard contexts
    }
  };

  const setMode = (mode: MatchMode) => onUpdateConfig({ ...room.config, mode });
  const setTeamMode = (teamMode: TeamMode) =>
    onUpdateConfig({ ...room.config, teamMode, fillBots: teamMode === '2V2' ? true : room.config.fillBots });
  const setArenaView = (immersive: boolean) => {
    if (immersive === room.config.immersive) return;
    const nextMapId = immersive ? IMMERSIVE_MAP_LIST[0].id : SOLO_MAP_LIST[0].id;
    onUpdateConfig({
      ...room.config,
      immersive,
      mapId: nextMapId,
      extraDark: immersive ? room.config.extraDark : false,
    });
  };
  const setMap = (mapId: MapId) => onUpdateConfig({ ...room.config, mapId });
  const setDifficulty = (difficulty: BotDifficulty) => onUpdateConfig({ ...room.config, difficulty });
  const toggleFillBots = () =>
    onUpdateConfig({ ...room.config, fillBots: !(room.config.fillBots ?? true) });

  const availableMaps = room.config.immersive ? IMMERSIVE_MAP_LIST : SOLO_MAP_LIST;

  return (
    <div className="h-dvh w-full overflow-y-auto overscroll-contain bg-[#0B1120]">
      <div className="min-h-full w-full flex flex-col items-center justify-center p-3 sm:p-5">
        <div className="my-auto w-full max-w-4xl rounded-2xl border border-slate-800 bg-[#111A2C] p-4 sm:p-6 md:p-7 shadow-2xl">
          {/* Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-sky-400 font-semibold">
                <Users className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  Trickshot Tussle Online ·{' '}
                  {room.config.immersive ? 'Immersive Camera & Vignette' : 'Normal Full Arena'}
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-2.5">
                <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-50">
                  Room Code:{' '}
                  <span className="font-mono-tabular tracking-widest text-sky-400">{room.code}</span>
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSettingsTab('GENERAL')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Settings className="w-3.5 h-3.5 text-sky-400" />
                Settings
              </button>
              <button
                type="button"
                onClick={copyInviteLink}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Invite Link Copied' : 'Copy Invite Link'}
              </button>
              <button
                type="button"
                onClick={onLeave}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                Leave
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-2.5 text-xs text-rose-200">
              {errorMessage}
            </div>
          )}

          <div className="mt-5 flex flex-col md:flex-row gap-5 md:gap-6">
            {/* Player Slots */}
            <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-200">
                Players ({occupiedCount}/4 Joined)
              </h2>
              {is2v2 ? (
                <button
                  type="button"
                  disabled={!otherTeamHasOpenSlot}
                  onClick={onSwapTeam}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-45 px-2.5 py-1 text-xs font-semibold text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400" />
                  Switch Team ({myTeam === 0 ? 'A → B' : 'B → A'})
                </button>
              ) : (
                <span className="text-xs text-slate-400">
                  Share the code or link for friends to join
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {room.slots.map((slot) => {
                const isMe = slot.slot === room.mySlot;
                return (
                  <div
                    key={slot.slot}
                    className={`rounded-xl border p-3.5 transition-colors ${
                      isMe
                        ? 'bg-[#17253C] border-sky-500/60'
                        : slot.occupied
                          ? 'bg-[#152136] border-slate-700'
                          : slot.isBot
                            ? 'bg-slate-900/70 border-slate-800'
                            : 'bg-slate-950/50 border-slate-800/60 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerAvatar
                          color={slot.color}
                          accentColor={PLAYER_COLOR_PALETTE.find((c) => c.id === slot.colorId)?.accentColor}
                          finish={slot.finish}
                          size={22}
                          showVisor={false}
                        />
                        <span className="font-display text-sm font-bold text-slate-100 truncate">
                          {slot.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {is2v2 && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              slot.team === 0
                                ? 'bg-sky-500/20 text-sky-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {slot.team === 0 ? 'Team A' : 'Team B'}
                          </span>
                        )}
                        <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
                          {isMe ? 'You' : slot.isHost ? 'Host' : slot.occupied ? 'Joined' : slot.isBot ? 'AI Bot' : 'Empty'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-300">Fighter Color &amp; Finish</span>
                <span className="text-[11px] text-slate-400">
                  {PLAYER_COLOR_PALETTE.find((c) => c.id === mySlotObj?.colorId)?.name ?? 'Unique per player'}
                </span>
              </div>
              <div className="grid grid-cols-7 sm:grid-cols-11 gap-1.5">
                {PLAYER_COLOR_PALETTE.map((opt) => {
                  const isMine = mySlotObj?.colorId === opt.id;
                  const takenByHuman = humanTakenColors.has(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={takenByHuman}
                      title={takenByHuman ? `${opt.name} (taken)` : opt.name}
                      aria-label={`Choose ${opt.name}`}
                      onClick={() => onUpdateColor(opt.id)}
                      className={`h-8 rounded-lg border flex items-center justify-center transition-all ${
                        isMine
                          ? 'bg-slate-800 border-white scale-105 shadow-[0_0_0_2px_rgba(14,165,233,0.45)] cursor-pointer'
                          : takenByHuman
                            ? 'bg-slate-950 border-slate-900 opacity-30 cursor-not-allowed'
                            : 'bg-slate-950/60 border-slate-800 opacity-85 hover:opacity-100 cursor-pointer'
                      }`}
                    >
                      {takenByHuman ? (
                        <Lock className="w-3 h-3 text-slate-500" />
                      ) : (
                        <PlayerAvatar
                          color={opt.color}
                          accentColor={opt.accentColor}
                          finish={opt.finish}
                          size={22}
                          showVisor={false}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-300 space-y-1.5">
              <div className="font-semibold text-slate-100">
                {room.config.immersive ? 'Immersive Mode Rules' : 'Normal Arena Rules'}
              </div>
              <p className="text-slate-400 leading-relaxed">
                {room.config.immersive
                  ? 'Explore the sprawling Wooden Mansion, Emerald Grove, or the two-floor DOORS-inspired The Library (hunt 8 books, walk below 80% speed to hide from The Figure, and unlock your 5-digit cipher door). In Extra Dark mode, sweep your forward flashlight past cover while glowing bullets light the room.'
                  : 'See the entire 1500×1050 arena at once for pure bank-shot geometry! Push cardboard cover boxes into lanes, shoot TNT or Nitro crates to detonate them early, and time shots carefully—stunned fighters are protected until they get back up.'}
              </p>
            </div>
          </div>

          {/* Match Configuration */}
          <div className="w-full md:w-76 lg:w-80 shrink-0 flex flex-col gap-3.5 border-t md:border-t-0 md:border-l border-slate-800 pt-5 md:pt-0 md:pl-6">
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-2">Arena View</div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800">
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => setArenaView(false)}
                  className={`px-2 py-2 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    !room.config.immersive
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  Normal (Full Map)
                </button>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => setArenaView(true)}
                  className={`px-2 py-2 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    room.config.immersive
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  Immersive Camera
                </button>
              </div>
            </div>

            {/* Feathered Selected Map Preview Banner */}
            <div className="rounded-xl border border-slate-800 bg-[#0D1424] overflow-hidden">
              <div className="relative h-20 w-full bg-slate-950 overflow-hidden">
                {!previewFailed[room.config.mapId] ? (
                  <img
                    src={MAP_PREVIEW_URLS[room.config.mapId]}
                    alt={ARENA_MAPS[room.config.mapId].name}
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewFailed((prev) => ({ ...prev, [room.config.mapId]: true }))}
                    className={`absolute inset-0 h-full w-full object-cover object-center transition-all duration-500 ${
                      room.config.immersive &&
                      room.config.extraDark &&
                      IMMERSIVE_DARK_PREVIEW_URLS[room.config.mapId]
                        ? 'opacity-0'
                        : 'opacity-100'
                    }`}
                  />
                ) : (
                  <div className="h-full w-full bg-slate-900" />
                )}
                {room.config.immersive &&
                  IMMERSIVE_DARK_PREVIEW_URLS[room.config.mapId] &&
                  !previewFailed[`${room.config.mapId}_dark`] && (
                    <img
                      src={IMMERSIVE_DARK_PREVIEW_URLS[room.config.mapId]}
                      alt={`${ARENA_MAPS[room.config.mapId].name} dark mode`}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setPreviewFailed((prev) => ({ ...prev, [`${room.config.mapId}_dark`]: true }))
                      }
                      className={`absolute inset-0 h-full w-full object-cover object-center transition-all duration-500 ${
                        room.config.extraDark ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                  )}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(13,20,36,0.08) 10%, rgba(13,20,36,0.75) 70%, #0D1424 100%)',
                  }}
                />
              </div>
              <div className="px-3 pb-2.5 -mt-4 relative z-10 flex items-center justify-between gap-2">
                <span className="font-display text-sm font-extrabold text-slate-50 truncate">
                  {ARENA_MAPS[room.config.mapId].name}
                </span>
                <span className="text-[10px] font-mono-tabular text-sky-300 shrink-0">
                  {room.config.immersive
                    ? room.config.extraDark
                      ? 'Immersive · Dark'
                      : 'Immersive · Light'
                    : '2D'}
                </span>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-400 mb-2">
                {room.config.immersive ? 'Immersive Map' : 'Arena Map'}
              </div>
              <div
                className={
                  availableMaps.length > 2
                    ? 'grid grid-cols-1 sm:grid-cols-2 gap-1.5'
                    : 'flex flex-col gap-1.5'
                }
              >
                {availableMaps.map((m) => {
                  const darkThumb = IMMERSIVE_DARK_PREVIEW_URLS[m.id];
                  const showDark = Boolean(m.immersive && room.config.extraDark && darkThumb);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!isHost}
                      onClick={() => setMap(m.id)}
                      className={`text-left px-2.5 py-2 rounded-lg border transition-colors flex items-center gap-2.5 ${
                        room.config.mapId === m.id
                          ? 'bg-slate-800 border-sky-500/70 text-slate-50'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      } ${!isHost ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
                    >
                      <div className="relative w-12 h-9 rounded overflow-hidden shrink-0 bg-slate-950 border border-slate-800/80">
                        {!previewFailed[m.id] && (
                          <img
                            src={MAP_PREVIEW_URLS[m.id]}
                            alt={m.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setPreviewFailed((prev) => ({ ...prev, [m.id]: true }))
                            }
                            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                              showDark ? 'opacity-0' : 'opacity-100'
                            }`}
                          />
                        )}
                        {darkThumb && !previewFailed[`${m.id}_dark`] && (
                          <img
                            src={darkThumb}
                            alt={`${m.name} dark`}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setPreviewFailed((prev) => ({ ...prev, [`${m.id}_dark`]: true }))
                            }
                            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                              showDark ? 'opacity-100' : 'opacity-0'
                            }`}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{m.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{m.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {room.config.immersive && (
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2">Lighting Mode</div>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800">
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => onUpdateConfig({ ...room.config, extraDark: false })}
                    className={`px-2 py-2 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      !room.config.extraDark
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    Bright Immersive
                  </button>
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => onUpdateConfig({ ...room.config, extraDark: true })}
                    className={`px-2 py-2 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      room.config.extraDark
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    Extra Dark · Torch
                  </button>
                </div>
              </div>
            )}

            <div>
              <div className="text-xs font-semibold text-slate-400 mb-2">Team Format</div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800">
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => setTeamMode('FFA')}
                  className={`px-2 py-1.5 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    !is2v2 ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  Free-for-All
                </button>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => setTeamMode('2V2')}
                  className={`px-2 py-1.5 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    is2v2 ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  2v2 Teams
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-400 mb-2">Match Mode</div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800">
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => setMode('ELIMINATION')}
                  className={`px-2 py-2 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    room.config.mode === 'ELIMINATION'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  Last Standing
                </button>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => setMode('BRAWL')}
                  className={`px-2 py-2 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    room.config.mode === 'BRAWL'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  Brawl (8 KOs)
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
              <span className="text-xs font-medium text-slate-200">Fill empty slots with bots</span>
              <button
                type="button"
                disabled={!isHost || is2v2}
                onClick={toggleFillBots}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  is2v2 || (room.config.fillBots ?? true)
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                } ${!isHost || is2v2 ? 'opacity-70 cursor-default' : 'cursor-pointer'}`}
              >
                {is2v2 ? '2v2 Auto' : room.config.fillBots ?? true ? 'On' : 'Off'}
              </button>
            </div>

            {(room.config.fillBots ?? true) && (
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2">Bot Skill</div>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800">
                  {(['CHILL', 'TACTICAL', 'RUTHLESS'] as BotDifficulty[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      disabled={!isHost}
                      onClick={() => setDifficulty(level)}
                      className={`px-2 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        room.config.difficulty === level
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      {level === 'CHILL' ? 'Chill' : level === 'TACTICAL' ? 'Tactical' : 'Ruthless'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSettingsTab('MODIFIERS')}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              {isHost ? 'Arena Modifiers' : 'View Host Modifiers'}
            </button>

            {isHost ? (
              <button
                type="button"
                disabled={activePlayerCount < 2}
                onClick={onStartMatch}
                className="mt-1 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 hover:bg-sky-300 disabled:opacity-50 px-5 py-3 text-sm font-bold text-slate-950 transition-all cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                {room.config.immersive ? 'Start Immersive Match' : 'Start Arena Match'}
              </button>
            ) : (
              <div className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-center text-xs font-medium text-slate-300">
                Waiting for host to start match...
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {settingsTab !== null && (
        <SettingsModal
          general={generalSettings}
          modifiers={room.config.modifiers ?? DEFAULT_MATCH_MODIFIERS}
          initialTab={settingsTab}
          modifiersReadOnly={!isHost}
          onChangeGeneral={onChangeGeneralSettings}
          onChangeModifiers={(nextMods) => onUpdateConfig({ ...room.config, modifiers: nextMods })}
          onClose={() => setSettingsTab(null)}
        />
      )}
    </div>
  );
}
