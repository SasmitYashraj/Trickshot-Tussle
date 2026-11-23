import { Crown, RotateCcw, SlidersHorizontal, Trophy, Users } from 'lucide-react';
import type { GameSnapshot } from '../game/types';
import { PlayerAvatar } from './PlayerAvatar';

interface GameOverModalProps {
  snapshot: GameSnapshot;
  isOnline: boolean;
  isHost: boolean;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
  onReturnToLobby?: () => void;
}

export function GameOverModal({
  snapshot,
  isOnline,
  isHost,
  onPlayAgain,
  onBackToMenu,
  onReturnToLobby,
}: GameOverModalProps) {
  const ranked = [...snapshot.players].sort((a, b) => {
    const aEsc = a.escapedRank ?? Number.POSITIVE_INFINITY;
    const bEsc = b.escapedRank ?? Number.POSITIVE_INFINITY;
    if (aEsc !== bEsc) return aEsc - bEsc;
    if (b.kills !== a.kills) return b.kills - a.kills;
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.damageDealt - a.damageDealt;
  });

  const winner = snapshot.players.find((p) => p.id === snapshot.winnerId) ?? ranked[0];
  const is2v2 = snapshot.teamMode === '2V2' && snapshot.winnerTeam !== null && snapshot.winnerTeam !== undefined;
  const localHumans = snapshot.players.filter((p) => p.isHuman);
  const localPlayer = localHumans[0];
  const humanWon = is2v2 ? localPlayer?.team === snapshot.winnerTeam : winner?.isHuman;
  const headline = is2v2
    ? humanWon
      ? `Team ${snapshot.winnerTeam === 0 ? 'Alpha' : 'Bravo'} Victory`
      : `Team ${snapshot.winnerTeam === 0 ? 'Alpha' : 'Bravo'} Wins`
    : localHumans.length > 1
      ? `${winner?.name ?? 'Player'} Wins`
      : humanWon
        ? 'Victory'
        : `${winner?.name ?? 'Rival'} Wins`;

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-slate-950/75 backdrop-blur-sm">
      <div className="min-h-full w-full flex flex-col items-center justify-center p-3 sm:p-4">
        <div className="my-auto w-full max-w-lg rounded-2xl border border-slate-700/80 bg-[#111A2C] p-5 sm:p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div
            className="h-11 w-11 rounded-xl flex items-center justify-center border border-slate-700"
            style={{ backgroundColor: `${winner?.color ?? '#38BDF8'}22` }}
          >
            <Trophy className="w-5 h-5" style={{ color: winner?.color ?? '#38BDF8' }} />
          </div>
          <div>
            <h2 className="font-display text-2xl font-extrabold text-slate-50">
              {headline}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {snapshot.winnerReason} · {Math.floor(snapshot.elapsedTime)}s match
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Player</th>
                <th className="py-2.5 px-3 font-semibold text-right">KOs</th>
                <th className="py-2.5 px-3 font-semibold text-right">Deaths</th>
                <th className="py-2.5 px-3 font-semibold text-right">Damage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {ranked.map((p) => (
                <tr key={p.id} className={p.isHuman ? 'bg-sky-500/5' : ''}>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar
                        color={p.color}
                        accentColor={p.accentColor}
                        finish={p.finish}
                        size={22}
                        showVisor={false}
                      />
                      <span className="font-semibold text-slate-100">{p.name}</span>
                      {p.escapedRank && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 font-mono-tabular text-[10px] font-bold">
                          <Crown className="w-2.5 h-2.5" />#{p.escapedRank}
                        </span>
                      )}
                      {p.team !== undefined && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            p.team === 0 ? 'bg-sky-500/20 text-sky-300' : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {p.team === 0 ? 'Team A' : 'Team B'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular font-bold text-slate-100">
                    {p.kills}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-400">
                    {p.deaths}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-300">
                    {p.damageDealt}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center gap-3">
          {isOnline ? (
            <>
              {isHost && (
                <>
                  <button
                    type="button"
                    onClick={onPlayAgain}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 hover:bg-sky-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Rematch
                  </button>
                  {onReturnToLobby && (
                    <button
                      type="button"
                      onClick={onReturnToLobby}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Users className="w-4 h-4" />
                      Lobby
                    </button>
                  )}
                </>
              )}
              {!isHost && (
                <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-center text-xs font-medium text-slate-300">
                  Waiting for host to start rematch or return to lobby...
                </div>
              )}
              <button
                type="button"
                onClick={onBackToMenu}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                Leave
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onPlayAgain}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 hover:bg-sky-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                Play Again
              </button>
              <button
                type="button"
                onClick={onBackToMenu}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Match Setup
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
