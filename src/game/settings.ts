import { ARENA_MAPS, SOLO_MAP_LIST } from './maps';
import {
  type BotDifficulty,
  type BulletBounceLevel,
  type BulletSpawnLevel,
  DEFAULT_MATCH_MODIFIERS,
  FIGURE_DIFFICULTY_ORDER,
  type FigureDifficulty,
  type MapId,
  type MatchConfig,
  type MatchMode,
  type MatchModifiers,
  type ModifierLevel,
  type OptionalSpawnLevel,
  PLAYER_COLOR_PALETTE,
  type DodgeWaveMode,
  type PracticeTargetMode,
  type TeamMode,
} from './types';

export type JoystickPosition = 'LEFT' | 'RIGHT';
export type JoystickSize = 'SMALL' | 'MEDIUM' | 'LARGE';

export interface GeneralSettings {
  musicEnabled: boolean;
  joystickPosition: JoystickPosition;
  joystickSize: JoystickSize;
  releaseJitterProtection: boolean;
  playerName: string;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  musicEnabled: true,
  joystickPosition: 'LEFT',
  joystickSize: 'MEDIUM',
  releaseJitterProtection: true,
  playerName: 'Player',
};

const GENERAL_STORAGE_KEY = 'trickshot_general_settings_v1';
const MATCH_CONFIG_STORAGE_KEY = 'trickshot_match_config_v1';

function isModifierLevel(val: unknown): val is ModifierLevel {
  return val === 'LOW' || val === 'MEDIUM' || val === 'HIGH';
}

function isBulletSpawnLevel(val: unknown): val is BulletSpawnLevel {
  return val === 'DREAD' || val === 'LOW' || val === 'MEDIUM' || val === 'HIGH';
}

function isOptionalSpawnLevel(val: unknown): val is OptionalSpawnLevel {
  return val === 'NONE' || val === 'LOW' || val === 'MEDIUM' || val === 'HIGH';
}

function isBulletBounceLevel(val: unknown): val is BulletBounceLevel {
  return (
    val === 'NONE' ||
    val === 'LOW' ||
    val === 'MEDIUM' ||
    val === 'HIGH' ||
    val === 'VERY_HIGH' ||
    val === 'INSANITY'
  );
}

function isFigureDifficulty(val: unknown): val is FigureDifficulty {
  return (
    typeof val === 'string' &&
    (FIGURE_DIFFICULTY_ORDER as readonly string[]).includes(val)
  );
}

export function sanitizeModifiers(raw: unknown): MatchModifiers {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    bulletSpawn: isBulletSpawnLevel(obj.bulletSpawn)
      ? obj.bulletSpawn
      : DEFAULT_MATCH_MODIFIERS.bulletSpawn,
    nitroSpawn: isOptionalSpawnLevel(obj.nitroSpawn)
      ? obj.nitroSpawn
      : DEFAULT_MATCH_MODIFIERS.nitroSpawn,
    tntSpawn: isOptionalSpawnLevel(obj.tntSpawn)
      ? obj.tntSpawn
      : DEFAULT_MATCH_MODIFIERS.tntSpawn,
    medkitSpawn: isOptionalSpawnLevel(obj.medkitSpawn)
      ? obj.medkitSpawn
      : DEFAULT_MATCH_MODIFIERS.medkitSpawn,
    bulletBounces: isBulletBounceLevel(obj.bulletBounces)
      ? obj.bulletBounces
      : DEFAULT_MATCH_MODIFIERS.bulletBounces,
    playerSpeed: isModifierLevel(obj.playerSpeed)
      ? obj.playerSpeed
      : DEFAULT_MATCH_MODIFIERS.playerSpeed,
    turnSpeed: isModifierLevel(obj.turnSpeed)
      ? obj.turnSpeed
      : DEFAULT_MATCH_MODIFIERS.turnSpeed,
    bulletSpeed: isModifierLevel(obj.bulletSpeed)
      ? obj.bulletSpeed
      : DEFAULT_MATCH_MODIFIERS.bulletSpeed,
    bulletCapacity: isModifierLevel(obj.bulletCapacity)
      ? obj.bulletCapacity
      : DEFAULT_MATCH_MODIFIERS.bulletCapacity,
    stunTime: isModifierLevel(obj.stunTime)
      ? obj.stunTime
      : DEFAULT_MATCH_MODIFIERS.stunTime,
    spawnProtection: isModifierLevel(obj.spawnProtection)
      ? obj.spawnProtection
      : DEFAULT_MATCH_MODIFIERS.spawnProtection,
    playerSize: isModifierLevel(obj.playerSize)
      ? obj.playerSize
      : DEFAULT_MATCH_MODIFIERS.playerSize,
    figureDifficulty: isFigureDifficulty(obj.figureDifficulty)
      ? obj.figureDifficulty
      : DEFAULT_MATCH_MODIFIERS.figureDifficulty,
    keepBulletsOnStun:
      typeof obj.keepBulletsOnStun === 'boolean'
        ? obj.keepBulletsOnStun
        : DEFAULT_MATCH_MODIFIERS.keepBulletsOnStun,
    postStunGrace: isModifierLevel(obj.postStunGrace)
      ? obj.postStunGrace
      : DEFAULT_MATCH_MODIFIERS.postStunGrace,
  };
}

export function sanitizePlayerName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_GENERAL_SETTINGS.playerName;
  return raw.slice(0, 14);
}

export function loadGeneralSettings(): GeneralSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_GENERAL_SETTINGS };
  try {
    const raw = window.localStorage.getItem(GENERAL_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GENERAL_SETTINGS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      musicEnabled:
        typeof parsed.musicEnabled === 'boolean'
          ? parsed.musicEnabled
          : DEFAULT_GENERAL_SETTINGS.musicEnabled,
      joystickPosition:
        parsed.joystickPosition === 'RIGHT' || parsed.joystickPosition === 'LEFT'
          ? parsed.joystickPosition
          : DEFAULT_GENERAL_SETTINGS.joystickPosition,
      joystickSize:
        parsed.joystickSize === 'SMALL' ||
        parsed.joystickSize === 'MEDIUM' ||
        parsed.joystickSize === 'LARGE'
          ? parsed.joystickSize
          : DEFAULT_GENERAL_SETTINGS.joystickSize,
      releaseJitterProtection:
        typeof parsed.releaseJitterProtection === 'boolean'
          ? parsed.releaseJitterProtection
          : DEFAULT_GENERAL_SETTINGS.releaseJitterProtection,
      playerName:
        typeof parsed.playerName === 'string' && parsed.playerName.trim().length > 0
          ? parsed.playerName.slice(0, 14)
          : DEFAULT_GENERAL_SETTINGS.playerName,
    };
  } catch {
    return { ...DEFAULT_GENERAL_SETTINGS };
  }
}

export function saveGeneralSettings(settings: GeneralSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      GENERAL_STORAGE_KEY,
      JSON.stringify({
        musicEnabled: settings.musicEnabled,
        joystickPosition: settings.joystickPosition,
        joystickSize: settings.joystickSize,
        releaseJitterProtection: settings.releaseJitterProtection,
        playerName: settings.playerName.slice(0, 14),
      })
    );
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

export function loadSavedMatchConfig(fallback: MatchConfig): MatchConfig {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(MATCH_CONFIG_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const mode: MatchMode =
      parsed.mode === 'BRAWL' || parsed.mode === 'ELIMINATION'
        ? parsed.mode
        : fallback.mode;
    const teamMode: TeamMode =
      parsed.teamMode === '2V2' || parsed.teamMode === 'FFA'
        ? parsed.teamMode
        : fallback.teamMode ?? 'FFA';
    const difficulty: BotDifficulty =
      parsed.difficulty === 'CHILL' ||
      parsed.difficulty === 'TACTICAL' ||
      parsed.difficulty === 'VETERAN' ||
      parsed.difficulty === 'RUTHLESS'
        ? parsed.difficulty
        : fallback.difficulty;

    const rawMapId = typeof parsed.mapId === 'string' ? (parsed.mapId as MapId) : fallback.mapId;
    const validMap = Object.prototype.hasOwnProperty.call(ARENA_MAPS, rawMapId)
      ? ARENA_MAPS[rawMapId]
      : ARENA_MAPS[fallback.mapId];

    const local2P =
      typeof parsed.local2P === 'boolean' ? parsed.local2P : Boolean(fallback.local2P);
    const local2PIncludeBots =
      typeof parsed.local2PIncludeBots === 'boolean'
        ? parsed.local2PIncludeBots
        : fallback.local2PIncludeBots ?? true;
    const practiceTargetMode: PracticeTargetMode =
      parsed.practiceTargetMode === 'EVASIVE' ||
      parsed.practiceTargetMode === 'STATIC' ||
      parsed.practiceTargetMode === 'MOVING' ||
      parsed.practiceTargetMode === 'BOTH'
        ? parsed.practiceTargetMode
        : fallback.practiceTargetMode ?? 'BOTH';
    const dodgeWaveMode: DodgeWaveMode =
      parsed.dodgeWaveMode === 'RANDOM' ||
      parsed.dodgeWaveMode === 'ONE' ||
      parsed.dodgeWaveMode === 'TWO' ||
      parsed.dodgeWaveMode === 'THREE'
        ? parsed.dodgeWaveMode
        : fallback.dodgeWaveMode ?? 'RANDOM';

    const effectiveMap = local2P && validMap.immersive ? SOLO_MAP_LIST[0] : validMap;

    const p1ColorId =
      typeof parsed.playerColorId === 'string' &&
      PLAYER_COLOR_PALETTE.some((c) => c.id === parsed.playerColorId)
        ? parsed.playerColorId
        : fallback.playerColorId;
    const p2ColorId =
      typeof parsed.player2ColorId === 'string' &&
      PLAYER_COLOR_PALETTE.some((c) => c.id === parsed.player2ColorId)
        ? parsed.player2ColorId
        : fallback.player2ColorId;

    return {
      ...fallback,
      mode,
      teamMode,
      mapId: effectiveMap.id,
      immersive: effectiveMap.immersive,
      extraDark: effectiveMap.immersive ? Boolean(parsed.extraDark) : false,
      difficulty,
      targetKills:
        typeof parsed.targetKills === 'number' && Number.isFinite(parsed.targetKills)
          ? Math.max(1, Math.min(30, Math.round(parsed.targetKills)))
          : fallback.targetKills,
      local2P,
      local2PIncludeBots,
      targetPractice: false,
      practiceTargetMode,
      dodgePractice: false,
      dodgeWaveMode,
      playerColorId: p1ColorId,
      player2ColorId: p2ColorId,
      modifiers: sanitizeModifiers(parsed.modifiers),
    };
  } catch {
    return fallback;
  }
}

export function saveMatchConfig(config: MatchConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      MATCH_CONFIG_STORAGE_KEY,
      JSON.stringify({ ...config, targetPractice: false, dodgePractice: false })
    );
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}
