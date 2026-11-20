import { ArrowLeft, Check, Eye, Flame, Play, Sun } from 'lucide-react';
import { useState } from 'react';
import { IMMERSIVE_MAP_LIST, MAP_PREVIEW_URLS, SOLO_MAP_LIST } from '../game/maps';
import type { ArenaMap, MapId, MatchConfig } from '../game/types';

interface MapSelectScreenProps {
  config: MatchConfig;
  modeLabel?: string;
  submitLabel?: string;
  onSelectMap: (nextConfig: MatchConfig) => void;
  onConfirmAndLaunch: () => void;
  onBack: () => void;
}

const ALL_MAPS: ArenaMap[] = [...SOLO_MAP_LIST, ...IMMERSIVE_MAP_LIST];

export function MapSelectScreen({
  config,
  modeLabel,
  submitLabel,
  onSelectMap,
  onConfirmAndLaunch,
  onBack,
}: MapSelectScreenProps) {
  const [filter, setFilter] = useState<'ALL' | 'NORMAL' | 'IMMERSIVE'>('ALL');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const visibleMaps =
    filter === 'ALL'
      ? ALL_MAPS
      : filter === 'NORMAL'
        ? SOLO_MAP_LIST
        : IMMERSIVE_MAP_LIST;

  const selectedMap = ALL_MAPS.find((m) => m.id === config.mapId) ?? ALL_MAPS[0];
  const previewSrc = MAP_PREVIEW_URLS[selectedMap.id];
  const is2v2 = (config.teamMode ?? 'FFA') === '2V2';

  const pickMap = (mapId: MapId) => {
    const mapDef = ALL_MAPS.find((m) => m.id === mapId);
    if (!mapDef) return;
    onSelectMap({
      ...config,
      mapId,
      immersive: mapDef.immersive,
      extraDark: mapDef.immersive ? Boolean(config.extraDark) : false,
    });
  };

  const setLighting = (extraDark: boolean) => {
    if (!selectedMap.immersive) return;
    onSelectMap({ ...config, extraDark });
  };

  return (
    <div className="h-dvh w-full overflow-y-auto overscroll-contain bg-[#0B1120]">
      <div className="min-h-full w-full flex flex-col items-center justify-center p-3 sm:p-5">
        <div className="my-auto w-full max-w-5xl rounded-2xl border border-slate-800 bg-[#111A2C] overflow-hidden shadow-2xl">
          {/* Top Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800/90 bg-[#0F172A]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Hub
              </button>
              <div>
                <h1 className="font-display text-lg sm:text-xl font-extrabold text-slate-50 leading-tight">
                  Select Arena
                </h1>
                <p className="text-[11px] text-slate-400">
                  {modeLabel ??
                    `${is2v2 ? '2v2 Teams' : 'Free-for-All'} · ${
                      config.mode === 'BRAWL' ? `Brawl (${config.targetKills} KOs)` : 'Last Standing'
                    }`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
              {(
                [
                  { id: 'ALL', label: 'All Maps' },
                  { id: 'NORMAL', label: 'Normal 2D' },
                  { id: 'IMMERSIVE', label: 'Immersive' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    filter === tab.id
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Split: Featured Preview Banner (Left/Top) + Map Grid Selector (Right/Bottom) */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Featured Top-Feathered Preview Card */}
            <div className="lg:col-span-6 flex flex-col bg-[#0E1626] border-b lg:border-b-0 lg:border-r border-slate-800">
              <div className="relative h-56 sm:h-68 md:h-76 w-full overflow-hidden bg-slate-950">
                {!failedImages[selectedMap.id] ? (
                  <img
                    src={previewSrc}
                    alt={`${selectedMap.name} arena preview`}
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImages((prev) => ({ ...prev, [selectedMap.id]: true }))}
                    className="h-full w-full object-cover object-center transition-transform duration-500"
                  />
                ) : (
                  <div
                    className="h-full w-full"
                    style={{
                      background: selectedMap.immersive
                        ? 'radial-gradient(circle at 50% 40%, #92400E 0%, #1C1917 75%)'
                        : 'radial-gradient(circle at 50% 40%, #0284C7 0%, #0F172A 75%)',
                    }}
                  />
                )}
                {/* Smooth downward feathered fade merging image cleanly into panel */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(14,22,38,0.08) 0%, rgba(14,22,38,0.18) 42%, rgba(14,22,38,0.84) 78%, #0E1626 100%)',
                  }}
                />
              </div>

              <div className="px-5 pb-5 -mt-10 relative z-10 flex-1 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-sky-300">
                    <span>{selectedMap.immersive ? 'Immersive Follow Camera' : 'Classic Full-Map Arena'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular text-slate-400">
                      {selectedMap.width}×{selectedMap.height}
                    </span>
                    {selectedMap.id === 'library' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-300">2 Floors + The Figure</span>
                      </>
                    )}
                  </div>
                  <h2 className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-slate-50">
                    {selectedMap.name}
                  </h2>
                  <p className="mt-1.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {selectedMap.description}
                  </p>
                </div>

                {selectedMap.immersive && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-3">
                    <div className="text-xs font-semibold text-slate-300 mb-2">
                      Immersive Lighting Mode
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-950 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setLighting(false)}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          !config.extraDark
                            ? 'bg-sky-500 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        Bright Arena
                      </button>
                      <button
                        type="button"
                        onClick={() => setLighting(true)}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          config.extraDark
                            ? 'bg-amber-400 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <Flame className="w-3.5 h-3.5" />
                        Extra Dark · Torch
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onConfirmAndLaunch}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 hover:bg-sky-300 active:scale-[0.99] px-5 py-3 text-sm font-extrabold text-slate-950 transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-sky-500/20"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {submitLabel ?? `Launch ${selectedMap.name}`}
                </button>
              </div>
            </div>

            {/* Map Cards Selector Grid */}
            <div className="lg:col-span-6 p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">
                  Available Arenas ({visibleMaps.length})
                </span>
                <span className="flex items-center gap-1 text-[11px]">
                  <Eye className="w-3.5 h-3.5 text-sky-400" />
                  Tap any arena to preview
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visibleMaps.map((m) => {
                  const selected = m.id === selectedMap.id;
                  const src = MAP_PREVIEW_URLS[m.id];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pickMap(m.id)}
                      className={`group text-left rounded-xl border overflow-hidden transition-all cursor-pointer flex flex-col bg-[#0F172A] ${
                        selected
                          ? 'border-sky-400 ring-2 ring-sky-400/35'
                          : 'border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="relative h-24 w-full overflow-hidden bg-slate-950">
                        {!failedImages[m.id] ? (
                          <img
                            src={src}
                            alt={m.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedImages((prev) => ({ ...prev, [m.id]: true }))
                            }
                            className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="h-full w-full bg-slate-900" />
                        )}
                        <div
                          className="pointer-events-none absolute inset-0"
                          style={{
                            background:
                              'linear-gradient(180deg, rgba(15,23,42,0) 20%, rgba(15,23,42,0.75) 75%, #0F172A 100%)',
                          }}
                        />
                        {selected && (
                          <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center shadow">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <div className="px-3 pb-3 -mt-3 relative z-10">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-sm font-bold text-slate-100 truncate">
                            {m.name}
                          </span>
                          <span className="text-[10px] font-mono-tabular text-slate-400 shrink-0">
                            {m.immersive ? 'Immersive' : '2D'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2 leading-snug">
                          {m.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
