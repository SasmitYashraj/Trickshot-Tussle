import { Crosshair, Play, ShieldAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MAP_PREVIEW_URLS, SOLO_MAP_LIST } from '../game/maps';
import type { DodgeWaveMode, MapId, PracticeTargetMode } from '../game/types';

interface TargetPracticeModalProps {
  initialMode: PracticeTargetMode;
  initialDodgeMode: DodgeWaveMode;
  initialMapId: MapId;
  onStartTarget: (mode: PracticeTargetMode, mapId: MapId) => void;
  onStartDodge: (waveMode: DodgeWaveMode, mapId: MapId) => void;
  onClose: () => void;
}

const TARGET_MODE_OPTIONS: Array<{ id: PracticeTargetMode; label: string; note: string }> = [
  { id: 'STATIC', label: 'Static', note: 'Stationary boards' },
  { id: 'MOVING', label: 'Moving', note: 'Glides at player speed' },
  { id: 'BOTH', label: 'Both', note: 'Random static or moving' },
];

const DODGE_MODE_OPTIONS: Array<{ id: DodgeWaveMode; label: string; note: string }> = [
  { id: 'ONE', label: '1 at a Time', note: '1 corner bot fires per wave' },
  { id: 'TWO', label: '2 at a Time', note: '2 corner bots fire together' },
  { id: 'THREE', label: '3 at a Time', note: '3 corner bots fire together' },
];

export function TargetPracticeModal({
  initialMode,
  initialDodgeMode,
  initialMapId,
  onStartTarget,
  onStartDodge,
  onClose,
}: TargetPracticeModalProps) {
  const defaultNormalMap: MapId = SOLO_MAP_LIST.some((m) => m.id === initialMapId)
    ? initialMapId
    : SOLO_MAP_LIST[0].id;
  const [practiceType, setPracticeType] = useState<'TARGET' | 'DODGE'>('TARGET');
  const [targetMode, setTargetMode] = useState<PracticeTargetMode>(initialMode);
  const [dodgeMode, setDodgeMode] = useState<DodgeWaveMode>(initialDodgeMode);
  const [mapId, setMapId] = useState<MapId>(defaultNormalMap);
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});

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

  const isDodge = practiceType === 'DODGE';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-slate-950/85 backdrop-blur-sm"
    >
      <div className="min-h-full w-full flex flex-col items-center justify-center p-3 sm:p-5">
        <div
          onClick={(e) => e.stopPropagation()}
          className="my-auto w-full max-w-xl rounded-2xl border border-slate-700/80 bg-[#111A2C] p-4 sm:p-5 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                  isDodge
                    ? 'bg-sky-500/15 border-sky-400/35'
                    : 'bg-rose-500/15 border-rose-400/35'
                }`}
              >
                {isDodge ? (
                  <ShieldAlert className="w-4.5 h-4.5 text-sky-400" />
                ) : (
                  <Crosshair className="w-4.5 h-4.5 text-rose-400" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base sm:text-lg font-extrabold text-slate-50 truncate">
                  Practice
                </h2>
                <p className="text-[11px] text-slate-400 truncate">
                  {isDodge
                    ? '4 Ruthless corner bots · Survive all bounces per wave · Uses active modifiers'
                    : '1 bullet (0.5s refill) · No pickups · Uses your active modifiers'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close practice"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Practice Drill Type Switch */}
          <div className="mt-4 grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setPracticeType('TARGET')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                !isDodge ? 'bg-rose-500 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5 shrink-0" />
              Target Practice
            </button>
            <button
              type="button"
              onClick={() => setPracticeType('DODGE')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                isDodge ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              Dodging Practice
            </button>
          </div>

          {/* Mode Options */}
          <div className="mt-4">
            <div className="text-xs font-semibold text-slate-400 mb-2">
              {isDodge ? 'Corner Bot Wave Intensity' : 'Target Movement'}
            </div>
            {isDodge ? (
              <div className="grid grid-cols-3 gap-2">
                {DODGE_MODE_OPTIONS.map((opt) => {
                  const selected = dodgeMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDodgeMode(opt.id)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        selected
                          ? 'border-sky-400 bg-sky-500/15 text-slate-50'
                          : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      <div className="font-display text-xs sm:text-sm font-bold whitespace-nowrap">
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        {opt.note}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {TARGET_MODE_OPTIONS.map((opt) => {
                  const selected = targetMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTargetMode(opt.id)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        selected
                          ? 'border-rose-400 bg-rose-500/15 text-slate-50'
                          : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      <div className="font-display text-xs sm:text-sm font-bold whitespace-nowrap">
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        {opt.note}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Normal Map Selection */}
          <div className="mt-4">
            <div className="text-xs font-semibold text-slate-400 mb-2">Select Arena Map</div>
            <div className="grid grid-cols-2 gap-2.5">
              {SOLO_MAP_LIST.map((m) => {
                const selected = mapId === m.id;
                const preview = MAP_PREVIEW_URLS[m.id];
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMapId(m.id)}
                    className={`group relative rounded-xl border overflow-hidden text-left transition-all cursor-pointer ${
                      selected
                        ? 'border-sky-400 ring-1 ring-sky-400/60 bg-slate-900'
                        : 'border-slate-800 bg-slate-900/75 hover:border-slate-600'
                    }`}
                  >
                    <div className="relative h-20 w-full bg-slate-950 overflow-hidden">
                      {!imgFailed[m.id] ? (
                        <img
                          src={preview}
                          alt={m.name}
                          referrerPolicy="no-referrer"
                          onError={() => setImgFailed((prev) => ({ ...prev, [m.id]: true }))}
                          className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="h-full w-full bg-slate-900" />
                      )}
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background:
                            'linear-gradient(180deg, rgba(13,20,36,0.05) 10%, rgba(13,20,36,0.72) 70%, #0D1424 100%)',
                        }}
                      />
                    </div>
                    <div className="px-3 pb-2.5 -mt-4 relative z-10 flex items-center justify-between gap-2">
                      <span className="font-display text-xs sm:text-sm font-bold text-slate-100 truncate">
                        {m.name}
                      </span>
                      {selected && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300 shrink-0">
                          Selected
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                isDodge ? onStartDodge(dodgeMode, mapId) : onStartTarget(targetMode, mapId)
              }
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-extrabold cursor-pointer whitespace-nowrap shadow-lg ${
                isDodge
                  ? 'bg-sky-400 hover:bg-sky-300 text-slate-950 shadow-sky-500/20'
                  : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              {isDodge ? 'Start Dodging Practice' : 'Start Target Practice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
