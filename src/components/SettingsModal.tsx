import { Gamepad2, Music, RotateCcw, Settings, Sliders, Smartphone, User, X } from 'lucide-react';
import { useState } from 'react';
import {
  DEFAULT_GENERAL_SETTINGS,
  type GeneralSettings,
  type JoystickPosition,
} from '../game/settings';
import { DEFAULT_MATCH_MODIFIERS, type MatchModifiers } from '../game/types';
import { ModifiersContent } from './ModifiersScreen';

interface SettingsModalProps {
  general: GeneralSettings;
  modifiers: MatchModifiers;
  initialTab?: 'GENERAL' | 'MODIFIERS';
  modifiersReadOnly?: boolean;
  hideModifiersTab?: boolean;
  onChangeGeneral: (next: GeneralSettings) => void;
  onChangeModifiers: (next: MatchModifiers) => void;
  onClose: () => void;
}

export function SettingsModal({
  general,
  modifiers,
  initialTab = 'GENERAL',
  modifiersReadOnly = false,
  hideModifiersTab = false,
  onChangeGeneral,
  onChangeModifiers,
  onClose,
}: SettingsModalProps) {
  const [tab, setTab] = useState<'GENERAL' | 'MODIFIERS'>(
    hideModifiersTab ? 'GENERAL' : initialTab
  );

  const modifiedCount = (Object.keys(DEFAULT_MATCH_MODIFIERS) as Array<keyof MatchModifiers>).filter(
    (k) => (modifiers[k] ?? DEFAULT_MATCH_MODIFIERS[k]) !== DEFAULT_MATCH_MODIFIERS[k]
  ).length;

  const isGeneralDefault =
    general.musicEnabled === DEFAULT_GENERAL_SETTINGS.musicEnabled &&
    general.joystickPosition === DEFAULT_GENERAL_SETTINGS.joystickPosition &&
    general.playerName === DEFAULT_GENERAL_SETTINGS.playerName;

  const setMusic = (musicEnabled: boolean) => {
    onChangeGeneral({ ...general, musicEnabled });
  };

  const setJoystickPosition = (joystickPosition: JoystickPosition) => {
    onChangeGeneral({ ...general, joystickPosition });
  };

  const setPlayerName = (playerName: string) => {
    onChangeGeneral({ ...general, playerName: playerName.slice(0, 14) });
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-slate-950/80 backdrop-blur-sm"
    >
      <div className="min-h-full w-full flex flex-col items-center justify-center p-3 sm:p-5">
        <div
          onClick={(e) => e.stopPropagation()}
          className="my-auto w-full max-w-2xl rounded-2xl border border-slate-700/80 bg-[#111A2C] p-5 sm:p-6 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                <Settings className="w-4 h-4 text-sky-400" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-lg sm:text-xl font-extrabold text-slate-50 truncate">
                  Game Settings
                </h2>
                <p className="text-xs text-slate-400 truncate">
                  All preferences and match modifiers are saved automatically
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Section Switcher: General / Modifiers */}
          {!hideModifiersTab && (
            <div className="mt-4 grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setTab('GENERAL')}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'GENERAL'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                General Settings
              </button>
              <button
                type="button"
                onClick={() => setTab('MODIFIERS')}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'MODIFIERS'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 shrink-0" />
                Modifiers{modifiedCount > 0 ? ` (${modifiedCount})` : ''}
              </button>
            </div>
          )}

          {/* Tab Content */}
          <div className="mt-4">
            {tab === 'GENERAL' ? (
              <div className="space-y-3">
                {/* Online Lobby Player Name */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/65 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-sky-400 shrink-0" />
                      <label htmlFor="settings-player-name" className="text-xs font-bold text-slate-100">
                        Player Name
                      </label>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Used in Online Lobby mode (max 14 chars)
                    </span>
                  </div>
                  <input
                    id="settings-player-name"
                    type="text"
                    maxLength={14}
                    value={general.playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Player"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  />
                </div>

                {/* Music On / Off */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/65 p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Music className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-slate-100">Music</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Toggle background music across Classic, Immersive, and Library arenas (SFX stay on)
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-950/90 border border-slate-800 shrink-0 w-36">
                    <button
                      type="button"
                      onClick={() => setMusic(true)}
                      className={`px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                        general.musicEnabled
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      On
                    </button>
                    <button
                      type="button"
                      onClick={() => setMusic(false)}
                      className={`px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                        !general.musicEnabled
                          ? 'bg-rose-500 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Off
                    </button>
                  </div>
                </div>

                {/* Joystick Position Left / Right */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/65 p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <Gamepad2 className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-slate-100">Joystick Position</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {general.joystickPosition === 'LEFT'
                          ? 'Left side (Solo: Bottom-Left · 2P: P1 Bottom-Left, P2 Top-Right)'
                          : 'Right side (Solo: Bottom-Right · 2P: P1 Bottom-Right, P2 Top-Left)'}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-950/90 border border-slate-800 shrink-0 w-36">
                    <button
                      type="button"
                      onClick={() => setJoystickPosition('LEFT')}
                      className={`px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                        general.joystickPosition === 'LEFT'
                          ? 'bg-sky-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Left
                    </button>
                    <button
                      type="button"
                      onClick={() => setJoystickPosition('RIGHT')}
                      className={`px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                        general.joystickPosition === 'RIGHT'
                          ? 'bg-sky-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Right
                    </button>
                  </div>
                </div>

                {/* Landscape Mode Policy */}
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Smartphone className="w-4 h-4 text-amber-400 -rotate-90 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-200">Screen Orientation</div>
                      <div className="text-[11px] text-slate-400">
                        All matches run exclusively in Landscape mode while playing
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/35 text-[10px] font-extrabold uppercase tracking-wider text-amber-300 whitespace-nowrap shrink-0">
                    Landscape Only
                  </span>
                </div>

                <div className="pt-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={isGeneralDefault}
                    onClick={() => onChangeGeneral({ ...DEFAULT_GENERAL_SETTINGS })}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-45 px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset General
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center justify-center rounded-xl bg-sky-400 hover:bg-sky-300 px-5 py-2 text-xs font-bold text-slate-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <ModifiersContent
                modifiers={modifiers}
                readOnly={modifiersReadOnly}
                onChange={onChangeModifiers}
                footerAction={
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center justify-center rounded-xl bg-sky-400 hover:bg-sky-300 px-5 py-2 text-xs font-bold text-slate-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Done
                  </button>
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
