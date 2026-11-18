import { Globe, Play, User, Users } from 'lucide-react';
import { useState } from 'react';
import { SOLO_MAP_LIST } from '../game/maps';
import type { BotDifficulty, MapId, MatchConfig, MatchMode } from '../game/types';

interface TitleScreenProps {
  config: MatchConfig;
  initialRoomCode?: string;
  onlineError: string | null;
  onChangeConfig: (next: MatchConfig) => void;
  onStartSolo: () => void;
  onCreateOnlineRoom: (name: string) => void;
  onJoinOnlineRoom: (code: string, name: string) => void;
}

export function TitleScreen({
  config,
  initialRoomCode = '',
  onlineError,
  onChangeConfig,
  onStartSolo,
  onCreateOnlineRoom,
  onJoinOnlineRoom,
}: TitleScreenProps) {
  const [tab, setTab] = useState<'SOLO' | 'ONLINE'>(initialRoomCode ? 'ONLINE' : 'SOLO');
  const [nickname, setNickname] = useState('Player');
  const [joinCode, setJoinCode] = useState(initialRoomCode);

  const setMode = (mode: MatchMode) => onChangeConfig({ ...config, mode });
  const setMap = (mapId: MapId) => onChangeConfig({ ...config, mapId, immersive: false });
  const setDifficulty = (difficulty: BotDifficulty) => onChangeConfig({ ...config, difficulty });

  return (
    <div className="h-full w-full overflow-y-auto flex items-center justify-center p-4 sm:p-6 bg-[#0B1120]">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-[#111A2C] p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-start gap-8">
          {/* Left column: Title & Arena Legend */}
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-50 text-balance">
              Trickshot Tussle
            </h1>
            <p className="mt-2.5 text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
              Move with <span className="font-semibold text-slate-100">WASD</span> (hold <span className="font-semibold text-slate-100">Shift</span> to creep), aim 360° with your cursor, and press <span className="font-semibold text-slate-100">Spacebar</span> to fire on PC—or drag &amp; release on touchscreens.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-3.5 w-3.5 rounded-full bg-yellow-400 border border-yellow-200 shrink-0" />
                  <span className="text-sm font-semibold text-slate-100">Ricochet Shots</span>
                </div>
                <p className="mt-1 text-xs text-slate-400 leading-snug">
                  Pick up bullets on the floor. Knockouts drop held bullets; stunned foes are briefly protected.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-3.5 w-3.5 rounded-sm bg-amber-600 border border-amber-200 shrink-0" />
                  <span className="text-sm font-semibold text-slate-100">Cardboard Cover</span>
                </div>
                <p className="mt-1 text-xs text-slate-400 leading-snug">
                  Pushable crates spawn randomly and absorb 1 bullet before puncturing away.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-3.5 w-3.5 rounded-sm bg-red-600 border border-red-200 shrink-0" />
                  <span className="text-sm font-semibold text-slate-100">Nitro &amp; Shootable TNT</span>
                </div>
                <p className="mt-1 text-xs text-slate-400 leading-snug">
                  Shoot Nitro or 3s TNT crates to blast them early and catch rivals off guard.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-3.5 w-3.5 rounded-sm bg-emerald-500 border border-emerald-200 shrink-0" />
                  <span className="text-sm font-semibold text-slate-100">Medkit &amp; Stun</span>
                </div>
                <p className="mt-1 text-xs text-slate-400 leading-snug">
                  Medkits restore +35 HP. Taking damage stuns you briefly with immunity until recovery.
                </p>
              </div>
            </div>
          </div>

          {/* Right column: Play Mode Tabs (Solo vs Online Multiplayer) */}
          <div className="w-full lg:w-84 shrink-0 flex flex-col gap-5 border-t lg:border-t-0 lg:border-l border-slate-800 pt-6 lg:pt-0 lg:pl-7">
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
                <div>
                  <div className="text-xs font-semibold text-slate-400 mb-2">Match Mode</div>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setMode('BRAWL')}
                      className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        config.mode === 'BRAWL'
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Brawl (8 KOs)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('ELIMINATION')}
                      className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        config.mode === 'ELIMINATION'
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Last Standing
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-400 mb-2">Arena Layout (Large)</div>
                  <div className="flex flex-col gap-1.5">
                    {SOLO_MAP_LIST.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMap(m.id)}
                        className={`text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                          config.mapId === m.id
                            ? 'bg-slate-800 border-sky-500/70 text-slate-50'
                            : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-semibold">{m.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{m.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-400 mb-2">Rival Skill</div>
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

                <button
                  type="button"
                  onClick={onStartSolo}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 hover:bg-sky-300 active:scale-[0.99] px-5 py-3 text-sm font-bold text-slate-950 transition-all cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start Solo Match
                </button>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs text-slate-300 leading-relaxed">
                  Play across devices with up to 4 friends! Host chooses between Normal Full-Map Arenas or Immersive Camera &amp; Extra Dark Torch modes.
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
                  onClick={() => onCreateOnlineRoom(nickname)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 hover:bg-sky-300 active:scale-[0.99] px-4 py-2.5 text-sm font-bold text-slate-950 transition-all cursor-pointer whitespace-nowrap"
                >
                  <Users className="w-4 h-4" />
                  Create Online Lobby
                </button>

                <div className="pt-3 border-t border-slate-800">
                  <label htmlFor="join-room-code" className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Or Join with Lobby Code
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
                      disabled={joinCode.trim().length < 3}
                      onClick={() => onJoinOnlineRoom(joinCode, nickname)}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Join Lobby
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
