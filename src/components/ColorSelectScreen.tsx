import { ArrowLeft, Check, Palette } from 'lucide-react';
import { useState } from 'react';
import {
  type MatchConfig,
  PLAYER_COLOR_PALETTE,
  type PlayerColorOption,
  type PlayerSkinFinish,
} from '../game/types';
import { PlayerAvatar } from './PlayerAvatar';

interface ColorSelectScreenProps {
  config: MatchConfig;
  selectedColorId?: string;
  playerSlotLabel?: string;
  onSelectColor: (colorId: string) => void;
  onBack: () => void;
}

type ColorFilter = 'ALL' | 'SOLIDS' | 'TEXTURES' | 'ANIMATED';

const SOLID_FINISHES = new Set<PlayerSkinFinish>([
  'solid',
  'matte',
  'two_tone',
  'billiard_stripe',
  'racing_stripe',
]);

const TEXTURE_FINISHES = new Set<PlayerSkinFinish>([
  'fish_scale',
  'wood',
  'metal',
  'carbon_fiber',
  'frosted_ice',
  'mummy',
  'camo',
  'hazard',
  'damascus',
  'amber_fossil',
  'kintsugi',
]);

function getCategory(opt: PlayerColorOption): Exclude<ColorFilter, 'ALL'> {
  const f = opt.finish ?? 'solid';
  if (SOLID_FINISHES.has(f)) return 'SOLIDS';
  if (TEXTURE_FINISHES.has(f)) return 'TEXTURES';
  return 'ANIMATED';
}

function getCategoryBadge(opt: PlayerColorOption): string {
  const cat = getCategory(opt);
  if (cat === 'SOLIDS') {
    if (opt.finish === 'matte') return 'Matte';
    if (opt.finish === 'two_tone' || opt.finish === 'billiard_stripe' || opt.finish === 'racing_stripe') {
      return 'Pattern';
    }
    return 'Solid';
  }
  if (cat === 'TEXTURES') return 'Texture';
  return 'Animated';
}

export function ColorSelectScreen({
  config,
  selectedColorId,
  playerSlotLabel,
  onSelectColor,
  onBack,
}: ColorSelectScreenProps) {
  const [filter, setFilter] = useState<ColorFilter>('ALL');

  const activeColorId = selectedColorId ?? config.playerColorId ?? 'cobalt';
  const activeOption =
    PLAYER_COLOR_PALETTE.find((c) => c.id === activeColorId) ?? PLAYER_COLOR_PALETTE[0];

  const visibleColors =
    filter === 'ALL'
      ? PLAYER_COLOR_PALETTE
      : PLAYER_COLOR_PALETTE.filter((c) => getCategory(c) === filter);

  return (
    <div className="h-dvh w-full overflow-y-auto overscroll-contain bg-[#0B1120]">
      <div className="min-h-full w-full flex flex-col items-center justify-center p-2.5 sm:p-4">
        <div className="my-auto w-full max-w-5xl rounded-2xl border border-slate-800 bg-[#111A2C] overflow-hidden shadow-2xl">
          {/* Top Navigation + Category Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 border-b border-slate-800/90 bg-[#0F172A]">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <div className="h-9 w-9 rounded-lg bg-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0">
                <PlayerAvatar
                  color={activeOption.color}
                  accentColor={activeOption.accentColor}
                  finish={activeOption.finish}
                  size={28}
                />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-base sm:text-lg font-extrabold text-slate-50 leading-tight truncate flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-sky-400 shrink-0" />
                  {playerSlotLabel ? `${playerSlotLabel} · Colours & Finishes` : 'Fighter Colours & Finishes'}
                </h1>
                <p className="text-[11px] text-slate-400 truncate">
                  Active: <span className="font-semibold text-sky-300">{activeOption.name}</span> ·{' '}
                  {PLAYER_COLOR_PALETTE.length} finishes available
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
              {(
                [
                  { id: 'ALL', label: 'All' },
                  { id: 'SOLIDS', label: 'Solids' },
                  { id: 'TEXTURES', label: 'Textures' },
                  { id: 'ANIMATED', label: 'Animated' },
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
          </div>

          {/* Color & Material Grid */}
          <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 max-h-[66dvh] overflow-y-auto overscroll-contain">
            {visibleColors.map((opt) => {
              const selected = activeColorId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectColor(opt.id)}
                  className={`group relative text-left rounded-xl border p-2.5 transition-all cursor-pointer flex flex-col items-center gap-2 bg-[#0F172A] ${
                    selected
                      ? 'border-sky-400 ring-2 ring-sky-400/35 bg-[#131F36]'
                      : 'border-slate-800 hover:border-slate-600 hover:bg-slate-900'
                  }`}
                >
                  {selected && (
                    <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center shadow">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}

                  <div className="h-12 w-12 rounded-xl bg-slate-950/75 border border-slate-800/80 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <PlayerAvatar
                      color={opt.color}
                      accentColor={opt.accentColor}
                      finish={opt.finish}
                      size={36}
                    />
                  </div>

                  <div className="w-full text-center min-w-0">
                    <div className="text-xs font-bold text-slate-100 truncate">{opt.name}</div>
                    <div className="text-[10px] font-medium text-slate-400 mt-0.5">
                      {getCategoryBadge(opt)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Slim Single-Row Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 border-t border-slate-800/90 bg-[#0F172A]">
            <div className="flex items-center gap-2 text-xs text-slate-300 truncate">
              <PlayerAvatar
                color={activeOption.color}
                accentColor={activeOption.accentColor}
                finish={activeOption.finish}
                size={22}
              />
              <span>
                Selected: <span className="font-bold text-slate-50">{activeOption.name}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-400 hover:bg-sky-300 active:scale-[0.99] px-5 py-2 text-xs font-extrabold text-slate-950 transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-sky-500/20"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              Use Colour &amp; Go Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
