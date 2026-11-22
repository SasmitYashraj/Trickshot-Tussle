import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crown,
  Eye,
  Footprints,
  Heart,
  KeyRound,
  Lock,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  FloorLevel,
  LibraryMatchState,
  LibraryShape,
  MatchMode,
} from '../game/types';
import { LIBRARY_BOOKS_PER_PLAYER, LIBRARY_BRAWL_MAX_HEARTS, PLAYER_MAX_SPEED } from '../game/types';

export function LibraryShapeIcon({
  shape,
  className = 'w-5 h-5',
  color = '#FACC15',
}: {
  shape: LibraryShape;
  className?: string;
  color?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={shape}>
      {shape === 'circle' && (
        <circle cx="12" cy="12" r="8.5" fill={color} stroke="#140803" strokeWidth="1.8" />
      )}
      {shape === 'triangle' && (
        <polygon points="12,3 21,20 3,20" fill={color} stroke="#140803" strokeWidth="1.8" />
      )}
      {shape === 'square' && (
        <rect x="4" y="4" width="16" height="16" rx="1.5" fill={color} stroke="#140803" strokeWidth="1.8" />
      )}
      {shape === 'diamond' && (
        <polygon points="12,2.5 21,12 12,21.5 3,12" fill={color} stroke="#140803" strokeWidth="1.8" />
      )}
      {shape === 'star' && (
        <polygon
          points="12,2.4 14.8,8.5 21.4,9.3 16.5,13.9 17.8,20.5 12,17.2 6.2,20.5 7.5,13.9 2.6,9.3 9.2,8.5"
          fill={color}
          stroke="#140803"
          strokeWidth="1.6"
        />
      )}
      {shape === 'pentagon' && (
        <polygon
          points="12,2.8 21,9.4 17.6,20 6.4,20 3,9.4"
          fill={color}
          stroke="#140803"
          strokeWidth="1.8"
        />
      )}
      {shape === 'hexagon' && (
        <polygon
          points="12,2.8 20,7.4 20,16.6 12,21.2 4,16.6 4,7.4"
          fill={color}
          stroke="#140803"
          strokeWidth="1.8"
        />
      )}
      {shape === 'cross' && (
        <polygon
          points="9,3 15,3 15,9 21,9 21,15 15,15 15,21 9,21 9,15 3,15 3,9 9,9"
          fill={color}
          stroke="#140803"
          strokeWidth="1.8"
        />
      )}
    </svg>
  );
}

interface LibraryOverlaysProps {
  libraryState: LibraryMatchState;
  localPlayerId: number;
  mode: MatchMode;
  isOnline: boolean;
  isCursorScheme: boolean;
  stealthEnabled: boolean;
  playerFloor: FloorLevel;
  playerSpeed: number;
  playerAlive: boolean;
  canCollectBook: boolean;
  canUnlockDoor: boolean;
  lockOpen: boolean;
  lockErrorSeq: number;
  spectateTargetName?: string | null;
  spectateCount?: number;
  onToggleStealth: () => void;
  onCycleSpectate?: (delta: -1 | 1) => void;
  onFinishSoloMatch?: () => void;
  onCollectBook: () => void;
  onOpenLock: () => void;
  onCloseLock: () => void;
  onDialDigit: (index: number, nextDigit: number) => void;
  onSubmitCode: (digits: number[]) => void;
}

export function LibraryOverlays({
  libraryState,
  localPlayerId,
  mode,
  isOnline,
  isCursorScheme,
  stealthEnabled,
  playerFloor,
  playerSpeed,
  playerAlive,
  canCollectBook,
  canUnlockDoor,
  lockOpen,
  lockErrorSeq,
  spectateTargetName,
  spectateCount = 0,
  onToggleStealth,
  onCycleSpectate,
  onFinishSoloMatch,
  onCollectBook,
  onOpenLock,
  onCloseLock,
  onDialDigit,
  onSubmitCode,
}: LibraryOverlaysProps) {
  const prog = libraryState.playerProgress.find((pp) => pp.playerId === localPlayerId);
  const [localDigits, setLocalDigits] = useState<number[]>([0, 0, 0, 0, 0]);
  const [shakeError, setShakeError] = useState(false);

  useEffect(() => {
    if (prog?.codeDigits && prog.codeDigits.length === 5) {
      setLocalDigits(prog.codeDigits);
    }
  }, [lockOpen, prog?.codeDigits]);

  useEffect(() => {
    if (lockErrorSeq <= 0) return;
    setShakeError(true);
    const id = window.setTimeout(() => setShakeError(false), 620);
    return () => window.clearTimeout(id);
  }, [lockErrorSeq]);

  const speedPct = Math.min(100, Math.round((playerSpeed / PLAYER_MAX_SPEED) * 100));
  const noiseLevel = speedPct >= 99 ? 'LOUD' : speedPct >= 80 ? 'RISKY' : 'SILENT';

  const monster = libraryState.monster;
  const monsterStunned = monster.stunTimer > 0;
  const monsterRaging = !monsterStunned && monster.mode === 'rage';

  const handleStepWheel = (idx: number, delta: number) => {
    const cur = localDigits[idx] ?? 0;
    const next = ((cur + delta) % 10 + 10) % 10;
    const updated = [...localDigits];
    updated[idx] = next;
    setLocalDigits(updated);
    onDialDigit(idx, next);
  };

  const canSpectate = !playerAlive && (Boolean(prog?.unlocked) || Boolean(prog?.eliminated));

  return (
    <>
      {/* Compact High-Transparency Library Telemetry Overlay */}
      <div
        style={{ left: 'max(0.65rem, env(safe-area-inset-left))' }}
        className="pointer-events-auto select-none absolute top-[4.55rem] sm:top-[5.15rem] lg:top-3 z-20 flex flex-col gap-1 max-w-[10.25rem] sm:max-w-[11.75rem]"
      >
        <div className="rounded-xl border border-amber-400/20 bg-slate-950/65 px-2.5 py-1.5 text-[11px] text-slate-100 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 font-display font-bold text-amber-200">
              <BookOpen className="w-3 h-3 text-amber-400 shrink-0" />
              <span>
                {prog?.collectedCount ?? 0}/{LIBRARY_BOOKS_PER_PLAYER}
              </span>
            </div>
            <span className="font-mono-tabular text-[10px] font-bold text-amber-300/95">
              {playerFloor === 1 ? 'UP' : 'GND'}
            </span>
          </div>

          {/* Stealth / Noise & Rage/Stun Status */}
          <div className="mt-1 flex items-center justify-between gap-1.5 text-[10px] font-mono-tabular">
            <span
              className={
                noiseLevel === 'LOUD'
                  ? 'font-bold text-rose-300'
                  : noiseLevel === 'RISKY'
                    ? 'font-bold text-amber-300'
                    : 'font-semibold text-emerald-300'
              }
            >
              {noiseLevel} {speedPct}%
            </span>
            {monsterStunned ? (
              <span className="font-bold text-yellow-300">
                STUN {Math.ceil(monster.stunTimer)}s
              </span>
            ) : monsterRaging ? (
              <span className="font-bold text-orange-400 animate-pulse">RAGE!</span>
            ) : null}
          </div>

          {/* Library Brawl 8-Heart Limit */}
          {mode === 'BRAWL' && prog?.hearts !== undefined && (
            <div className="mt-1 flex items-center justify-between gap-1 text-[10px] font-mono-tabular">
              <span className="text-rose-200/90 font-semibold flex items-center gap-1">
                <Heart className="w-2.5 h-2.5 fill-rose-500 text-rose-400 shrink-0" />
                {prog.hearts}/{LIBRARY_BRAWL_MAX_HEARTS}
              </span>
              {prog.unlocked && (
                <span className="text-amber-300 font-bold flex items-center gap-0.5">
                  <Crown className="w-2.5 h-2.5" />#{prog.escapedRank ?? 1}
                </span>
              )}
            </div>
          )}

          {/* Compact Clue Grid */}
          {prog && prog.clues.length > 0 && (
            <div className="mt-1.5 pt-1 border-t border-amber-400/15 grid grid-cols-2 gap-1">
              {prog.clues.map((c, idx) => (
                <div
                  key={`${c.shape}_${idx}`}
                  className="flex items-center gap-1 rounded bg-slate-950/40 px-1 py-0.5 border border-slate-800/50"
                >
                  <LibraryShapeIcon shape={c.shape} className="w-3 h-3 shrink-0" />
                  <span className="font-mono-tabular text-[10px] font-bold text-amber-100">
                    ={c.digit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dedicated PC Stealth Button ([C] hotkey) */}
        {isCursorScheme && playerAlive && (
          <button
            type="button"
            onClick={onToggleStealth}
            className={`inline-flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
              stealthEnabled
                ? 'border-emerald-400/55 bg-emerald-950/75 text-emerald-200 hover:bg-emerald-900/80'
                : 'border-amber-400/30 bg-slate-950/70 text-slate-200 hover:bg-slate-900/80'
            }`}
          >
            <span className="inline-flex items-center gap-1">
              <Footprints className="w-3 h-3 shrink-0" />
              {stealthEnabled ? 'Stealth ON' : 'Stealth OFF'}
            </span>
            <span className="font-mono-tabular opacity-75">[C]</span>
          </button>
        )}
      </div>

      {/* Escaped / Eliminated Spectator Strip (client-side camera switching over existing state) */}
      {canSpectate && (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-xl border border-amber-400/35 bg-slate-950/85 px-3 py-2 text-xs text-slate-100 shadow-xl">
          <div className="flex items-center gap-1.5 pr-1">
            {prog?.unlocked ? (
              <Crown className="w-4 h-4 text-amber-300 shrink-0" />
            ) : (
              <Eye className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span className="font-semibold text-amber-100 whitespace-nowrap">
              {prog?.unlocked
                ? `Escaped #${prog.escapedRank ?? 1}`
                : 'Eliminated'}
            </span>
          </div>

          {spectateCount > 0 && onCycleSpectate && (
            <div className="flex items-center gap-1 border-l border-slate-700/80 pl-2">
              <button
                type="button"
                onClick={() => onCycleSpectate(-1)}
                aria-label="Previous player camera"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 font-mono-tabular text-[11px] font-bold text-sky-200 whitespace-nowrap">
                {spectateTargetName ? `Watching ${spectateTargetName}` : 'Spectating'}
              </span>
              <button
                type="button"
                onClick={() => onCycleSpectate(1)}
                aria-label="Next player camera"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {!isOnline && onFinishSoloMatch && (
            <button
              type="button"
              onClick={onFinishSoloMatch}
              className="ml-1 rounded-lg bg-amber-400 hover:bg-amber-300 px-2.5 py-1 text-[11px] font-extrabold text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
            >
              Finish Match
            </button>
          )}
        </div>
      )}

      {/* Bottom-Center Context Action Prompt (Collect Book or Open Door Padlock) */}
      {playerAlive && !lockOpen && (canCollectBook || canUnlockDoor) && (
        <div className="pointer-events-auto absolute bottom-16 lg:bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
          {canCollectBook && (
            <button
              type="button"
              onClick={onCollectBook}
              className="min-h-12 inline-flex items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-500/95 hover:bg-amber-400 active:scale-[0.98] px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-xl transition-all cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>Collect Book [E]</span>
            </button>
          )}
          {canUnlockDoor && (
            <button
              type="button"
              onClick={onOpenLock}
              className="min-h-12 inline-flex items-center gap-2 rounded-xl border border-emerald-300/70 bg-emerald-500/95 hover:bg-emerald-400 active:scale-[0.98] px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-xl transition-all cursor-pointer whitespace-nowrap"
            >
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Unlock Door [E]</span>
            </button>
          )}
        </div>
      )}

      {/* Semi-Transparent 5-Wheel Rotating Padlock Popup */}
      {lockOpen && playerAlive && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-auto bg-black/25">
          <div
            className={`w-full max-w-md rounded-2xl border ${
              shakeError ? 'border-rose-400 animate-pulse' : 'border-amber-500/45'
            } bg-slate-950/80 p-5 text-slate-100 shadow-2xl`}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-amber-500/25">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="font-display text-lg font-extrabold text-amber-100">
                    Library Door Padlock
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Match the 5 pillar shapes using your book clues
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseLock}
                aria-label="Close padlock"
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-slate-700/70 bg-slate-900/70 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Reference of Your Collected Clues */}
            {prog && prog.clues.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-500/20 bg-slate-900/50 px-2.5 py-2">
                {prog.clues.map((c, idx) => (
                  <div
                    key={`modal_clue_${c.shape}_${idx}`}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-950/65 px-2 py-0.5 border border-slate-800"
                  >
                    <LibraryShapeIcon shape={c.shape} className="w-3.5 h-3.5" />
                    <span className="font-mono-tabular text-[11px] font-bold text-amber-200">
                      ={c.digit}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* 5 Rotating Digit Wheels */}
            <div className="mt-3 grid grid-cols-5 gap-2">
              {libraryState.pillarSequence.slice(0, 5).map((shape, idx) => (
                <div
                  key={`${shape}_${idx}`}
                  className="flex flex-col items-center rounded-xl border border-amber-500/35 bg-slate-900/60 py-2 px-1"
                >
                  <span className="font-mono-tabular text-[10px] font-bold text-slate-400">
                    #{idx + 1}
                  </span>
                  <div className="my-1">
                    <LibraryShapeIcon shape={shape} className="w-5 h-5" />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStepWheel(idx, 1)}
                    aria-label={`Increase digit ${idx + 1}`}
                    className="min-h-11 w-full flex items-center justify-center rounded-lg hover:bg-amber-500/20 text-amber-300 active:scale-95 cursor-pointer"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStepWheel(idx, 1)}
                    className="w-full py-1.5 rounded-md bg-slate-950/75 border border-amber-400/40 font-mono-tabular text-xl font-black text-amber-200 text-center cursor-pointer hover:border-amber-300"
                  >
                    {localDigits[idx] ?? 0}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStepWheel(idx, -1)}
                    aria-label={`Decrease digit ${idx + 1}`}
                    className="min-h-11 w-full flex items-center justify-center rounded-lg hover:bg-amber-500/20 text-amber-300 active:scale-95 cursor-pointer"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>

            {shakeError && (
              <div className="mt-3 text-center text-xs font-bold text-rose-300">
                Padlock jammed — check your collected shape clues!
              </div>
            )}

            <div className="mt-4 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onSubmitCode(localDigits)}
                className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                Unlock Door
              </button>
              <button
                type="button"
                onClick={onCloseLock}
                className="min-h-12 inline-flex items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/70 hover:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                Close [E]
              </button>
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
              <Volume2 className="w-3 h-3 text-amber-400/80" />
              <span>Semi-transparent lock lets you watch behind you for The Figure.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
