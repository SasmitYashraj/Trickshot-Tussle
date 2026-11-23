import { ArrowLeft, Check, Flame, Play, Sun } from 'lucide-react';
import { useState } from 'react';
import {
  IMMERSIVE_DARK_PREVIEW_URLS,
  IMMERSIVE_MAP_LIST,
  MAP_PREVIEW_URLS,
  SOLO_MAP_LIST,
} from '../game/maps';
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

  const isLocal2P = Boolean(config.local2P);
  const local2PBots = config.local2PIncludeBots !== false;
  const is2v2 = (config.teamMode ?? 'FFA') === '2V2' && (!isLocal2P || local2PBots);

  const visibleMaps = isLocal2P
    ? SOLO_MAP_LIST
    : filter === 'ALL'
      ? ALL_MAPS
      : filter === 'NORMAL'
        ? SOLO_MAP_LIST
        : IMMERSIVE_MAP_LIST;

  const selectedMap =
    (isLocal2P
      ? SOLO_MAP_LIST.find((m) => m.id === config.mapId) ?? SOLO_MAP_LIST[0]
      : ALL_MAPS.find((m) => m.id === config.mapId) ?? ALL_MAPS[0]);
  const showLightingBar = !isLocal2P && filter !== 'NORMAL';

  const pickMap = (mapId: MapId) => {
    const mapDef = ALL_MAPS.find((m) => m.id === mapId);
    if (!mapDef || (isLocal2P && mapDef.immersive)) return;
    onSelectMap({
      ...config,
      mapId,
      immersive: mapDef.immersive,
      extraDark: mapDef.immersive ? Boolean(config.extraDark) : false,
    });
  };

  const setLighting = (extraDark: boolean) => {
    const targetMap = selectedMap.immersive ? selectedMap : IMMERSIVE_MAP_LIST[0];
    onSelectMap({
      ...config,
      mapId: targetMap.id,
      immersive: true,
      extraDark,
    });
  };

  return (
    <div className="h-dvh w-full overflow-y-auto overscroll-contain bg-[#0B1120]">
      <div className="min-h-full w-full flex flex-col items-center justify-center p-2.5 sm:p-4">
        <div className="my-auto w-full max-w-5xl rounded-2xl border border-slate-800 bg-[#111A2C] overflow-hidden shadow-2xl">
          {/* Compact Top Navigation + Filter + Light/Dark Switch */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 border-b border-slate-800/90 bg-[#0F172A]">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <div className="min-w-0">
                <h1 className="font-display text-base sm:text-lg font-extrabold text-slate-50 leading-tight truncate">
                  Select Arena
                </h1>
                <p className="text-[11px] text-slate-400 truncate">
                  {modeLabel ??
                    `${
                      isLocal2P
                        ? `2P Local · ${local2PBots ? (is2v2 ? 'Co-op 2v2' : 'FFA + 2 Bots') : '1v1'}`
                        : is2v2
                          ? '2v2 Teams'
                          : 'Free-for-All'
                    } · ${
                      config.mode === 'BRAWL' ? `Brawl (${config.targetKills} KOs)` : 'Last Standing'
                    }`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {showLightingBar && (
                <div
                  role="group"
                  aria-label="Immersive Lighting Mode"
                  className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800"
                >
                  <button
                    type="button"
                    onClick={() => setLighting(false)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      !config.extraDark
                        ? 'bg-amber-300 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setLighting(true)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      config.extraDark
                        ? 'bg-sky-400 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    Dark · Torch
                  </button>
                </div>
              )}

              {isLocal2P ? (
                <span className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-300 whitespace-nowrap">
                  Normal 2D Only · Offline 2P
                </span>
              ) : (
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
                  {(
                    [
                      { id: 'ALL', label: 'All' },
                      { id: 'NORMAL', label: 'Normal 2D' },
                      { id: 'IMMERSIVE', label: 'Immersive' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilter(tab.id)}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        filter === tab.id
                          ? 'bg-sky-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Compact Zero-Blot Map Grid: Thumbnail Beside Map Name with Live Light<->Dark Crossfade */}
          <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {visibleMaps.map((m) => {
              const selected = m.id === selectedMap.id;
              const lightSrc = MAP_PREVIEW_URLS[m.id];
              const darkSrc = IMMERSIVE_DARK_PREVIEW_URLS[m.id];
              const showDark = Boolean(m.immersive && config.extraDark && darkSrc);

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pickMap(m.id)}
                  className={`group text-left rounded-xl border p-2 transition-all cursor-pointer flex items-center gap-3 bg-[#0F172A] ${
                    selected
                      ? 'border-sky-400 ring-2 ring-sky-400/35 bg-[#131F36]'
                      : 'border-slate-800 hover:border-slate-600'
                  }`}
                >
                  {/* Side Thumbnail with Smooth Animated Light <-> Dark Crossfade */}
                  <div
                    className="relative w-28 sm:w-32 h-20 rounded-lg overflow-hidden shrink-0 bg-slate-950 border border-slate-800/80"
                    style={{
                      background: m.immersive
                        ? 'radial-gradient(circle at 50% 45%, #78350F 0%, #090D16 80%)'
                        : 'radial-gradient(circle at 50% 45%, #0369A1 0%, #090D16 80%)',
                    }}
                  >
                    {!failedImages[m.id] && (
                      <img
                        src={lightSrc}
                        alt={m.name}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [m.id]: true }))
                        }
                        className={`absolute inset-0 h-full w-full object-cover object-center transition-all duration-500 ease-out group-hover:scale-105 ${
                          showDark ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
                        }`}
                      />
                    )}
                    {darkSrc && !failedImages[`${m.id}_dark`] && (
                      <img
                        src={darkSrc}
                        alt={`${m.name} dark mode`}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [`${m.id}_dark`]: true }))
                        }
                        className={`absolute inset-0 h-full w-full object-cover object-center transition-all duration-500 ease-out group-hover:scale-105 ${
                          showDark ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                        }`}
                      />
                    )}

                    {/* Subtle soft corner vignette */}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(15,23,42,0.06) 0%, rgba(15,23,42,0.42) 100%)',
                      }}
                    />

                    {selected && (
                      <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center shadow">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>

                  {/* Map Title & Concise Metadata */}
                  <div className="min-w-0 flex-1 py-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-sm sm:text-base font-extrabold text-slate-50 truncate">
                        {m.name}
                      </span>
                      <span
                        className={`text-[10px] font-mono-tabular font-semibold shrink-0 ${
                          m.immersive
                            ? config.extraDark
                              ? 'text-sky-300'
                              : 'text-amber-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {m.immersive
                          ? config.extraDark
                            ? 'Immersive · Dark'
                            : 'Immersive · Light'
                          : 'Normal 2D'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] sm:text-xs text-slate-400 line-clamp-2 leading-snug">
                      {m.description}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] font-mono-tabular text-slate-500">
                      <span>
                        {m.width}×{m.height}
                      </span>
                      {m.id === 'library' && (
                        <span className="text-amber-400/90 font-semibold">
                          · 2 Floors &amp; The Figure
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Slim Single-Row Footer: Return to Hub OR Play Immediately */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 border-t border-slate-800/90 bg-[#0F172A]">
            <div className="text-xs text-slate-300 truncate">
              Selected:{' '}
              <span className="font-bold text-slate-50">{selectedMap.name}</span>
              {selectedMap.immersive && (
                <span className="ml-1.5 text-[11px] font-semibold text-amber-300">
                  ({config.extraDark ? 'Extra Dark · Torch' : 'Light Mode'})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-bold text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Use Selected &amp; Go Back
              </button>
              <button
                type="button"
                onClick={onConfirmAndLaunch}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-400 hover:bg-sky-300 active:scale-[0.99] px-4 py-2 text-xs font-extrabold text-slate-950 transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-sky-500/20"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {submitLabel ?? 'Play Now'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
