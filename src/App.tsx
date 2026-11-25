import { ChevronLeft, ChevronRight, Eye, Pause, Play, RotateCw, Settings, Undo2, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ColorSelectScreen } from './components/ColorSelectScreen';
import { GameOverModal } from './components/GameOverModal';
import { LibraryLoadingScreen } from './components/LibraryLoadingScreen';
import { LibraryOverlays } from './components/LibraryOverlays';
import { MapSelectScreen } from './components/MapSelectScreen';
import { OnlineLobbyScreen } from './components/OnlineLobbyScreen';
import { PlayerHealthBar } from './components/PlayerHealthBar';
import { SettingsModal } from './components/SettingsModal';
import { TitleScreen } from './components/TitleScreen';
import { TouchControls } from './components/TouchControls';
import { ArenaEngine, canCollectBookSpot } from './game/engine';
import { ARENA_MAPS } from './game/maps';
import {
  type GeneralSettings,
  loadGeneralSettings,
  loadSavedMatchConfig,
  saveGeneralSettings,
  saveMatchConfig,
} from './game/settings';
import {
  type CameraState,
  type RenderableWorld,
  getArenaViewTransform,
  renderArena,
} from './game/renderer';
import { sound } from './game/sound';
import {
  type ControlScheme,
  DEFAULT_MATCH_MODIFIERS,
  type EngineEvent,
  type FloorLevel,
  type GameSnapshot,
  type GameState,
  type JoystickState,
  KILL_STREAK_WINDOW,
  LIBRARY_BOOKS_PER_PLAYER,
  LIBRARY_INTRO_DURATION,
  type LibraryMatchState,
  type MatchConfig,
  type MatchMode,
  OnlineRoomState,
  PLAYER_MAX_SPEED,
  PLAYER_SPEED_MULTS,
  WorldSyncState,
} from './game/types';
import { MultiplayerClient } from './net/multiplayerClient';

interface LibraryUiSnapshot {
  state: LibraryMatchState;
  playerFloor: FloorLevel;
  playerSpeed: number;
  playerAlive: boolean;
  canCollectBook: boolean;
  canUnlockDoor: boolean;
  p2Alive: boolean;
  canCollectBookP2: boolean;
  canUnlockDoorP2: boolean;
  spectateCandidates: Array<{ id: number; name: string }>;
}

const DEFAULT_SOLO_CONFIG: MatchConfig = {
  mode: 'ELIMINATION',
  teamMode: 'FFA',
  mapId: 'crossroads',
  difficulty: 'TACTICAL',
  targetKills: 8,
  immersive: false,
  local2P: false,
  local2PIncludeBots: true,
  playerColorId: 'cobalt',
  player2ColorId: 'crimson',
  modifiers: { ...DEFAULT_MATCH_MODIFIERS },
};

const DEFAULT_ONLINE_CONFIG: MatchConfig = {
  mode: 'ELIMINATION',
  teamMode: 'FFA',
  mapId: 'immersive_mansion',
  difficulty: 'TACTICAL',
  targetKills: 8,
  immersive: true,
  extraDark: false,
  fillBots: true,
  playerColorId: 'cobalt',
  modifiers: { ...DEFAULT_MATCH_MODIFIERS },
};

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function playEngineEvents(
  events: EngineEvent[],
  listenerX?: number,
  listenerY?: number,
  listenerIds: number[] = [0],
  onLocalKillStreak?: (streak: number, mode: MatchMode, playerId?: number) => void,
  onLocalSelfKill?: (playerId?: number) => void,
  listenerFloor: FloorLevel = 0,
  onLocalLockError?: () => void,
  onLocalMonsterKill?: () => void
) {
  const localSet = new Set(listenerIds);
  const hasLocalEliminationClimax = events.some(
    (e) =>
      e.type === 'killstreak' &&
      e.mode === 'ELIMINATION' &&
      e.playerId !== undefined &&
      localSet.has(e.playerId) &&
      (e.value ?? 0) >= 3
  );

  for (const evt of events) {
    let spatial: { volume: number; pan: number } | undefined;
    const sameFl = evt.floor === undefined || evt.floor === listenerFloor;

    if (listenerX !== undefined && listenerY !== undefined) {
      const dx = evt.x - listenerX;
      const dy = evt.y - listenerY;
      const d = Math.hypot(dx, dy);
      const isHeavyGlobal =
        evt.type === 'explosion' ||
        evt.type === 'knockout' ||
        evt.type === 'monster_kill' ||
        evt.type === 'killstreak' ||
        evt.type === 'victory' ||
        evt.type === 'monster_step' ||
        evt.type === 'monster_roar' ||
        evt.type === 'monster_stun' ||
        evt.type === 'door_unlock';

      // Reload sound: full punch for the local player(s), subtle nearby audio, skip faraway bot reloads
      if (evt.type === 'pickup') {
        const isSelf = (evt.value !== undefined && localSet.has(evt.value)) || d < 95;
        if (!isSelf && d > 560) continue;
        const floorAtten = sameFl ? 1 : 0.4;
        const vol = (isSelf ? 1 : Math.max(0.18, 0.72 * (1 - d / 560))) * floorAtten;
        const pan = Math.max(-0.85, Math.min(0.85, dx / 480));
        spatial = { volume: vol, pan };
      } else {
        const maxDist = isHeavyGlobal ? 1650 : 980;
        if (
          d > maxDist &&
          evt.type !== 'victory' &&
          evt.type !== 'killstreak' &&
          evt.type !== 'monster_roar' &&
          evt.type !== 'door_unlock' &&
          evt.type !== 'monster_kill'
        ) {
          continue;
        }
        const falloff = d < 95 ? 1 : Math.max(isHeavyGlobal ? 0.24 : 0.14, 1 - (d - 95) / maxDist);
        const floorAtten = sameFl
          ? 1
          : evt.type === 'monster_step'
            ? 0.28
            : evt.type === 'monster_roar' || evt.type === 'monster_stun' || evt.type === 'door_unlock'
              ? 0.52
              : 0.42;
        const pan = Math.max(-0.85, Math.min(0.85, dx / 520));
        spatial = { volume: Math.min(1, falloff * floorAtten), pan };
      }
    }

    try {
      switch (evt.type) {
        case 'shoot':
          sound.playShoot(spatial);
          break;
        case 'pickup':
          sound.playPickup(spatial);
          break;
        case 'heal':
          sound.playHeal(spatial);
          break;
        case 'bounce': {
          const bounceSurface =
            evt.value === 2
              ? 'metal'
              : evt.value === 3
                ? 'stone'
                : evt.value === 4
                  ? 'foliage'
                  : evt.value === 5
                    ? 'ice'
                    : evt.value === 6
                      ? 'monster'
                      : 'wood';
          sound.playBounce(spatial, bounceSurface);
          break;
        }
        case 'hit':
          sound.playHit(spatial, evt.value === 1 ? 'wood' : evt.value === 2 ? 'crate' : 'body');
          break;
        case 'explosion':
          sound.playExplosion(evt.value === 2 ? 'tnt' : 'nitro', spatial);
          break;
        case 'tnt_tick':
          sound.playTntTick(evt.value ?? 3, spatial);
          break;
        case 'splash':
          sound.playSplash(spatial);
          break;
        case 'knockout':
          sound.playKnockout(spatial);
          break;
        case 'monster_kill':
          if (evt.playerId !== undefined && localSet.has(evt.playerId)) {
            sound.playMonsterJumpscare();
            onLocalMonsterKill?.();
          } else {
            sound.playKnockout(spatial);
          }
          break;
        case 'book_collect':
          if (evt.playerId !== undefined && localSet.has(evt.playerId)) {
            sound.playBookCollect(spatial);
          }
          break;
        case 'monster_step':
          sound.playMonsterStep(spatial, (evt.value ?? 1) >= 2);
          break;
        case 'monster_roar':
          sound.playMonsterRoar(spatial);
          break;
        case 'monster_stun':
          sound.playMonsterStun(spatial);
          break;
        case 'lock_dial':
          if (evt.playerId !== undefined && localSet.has(evt.playerId)) {
            sound.playLockDial();
          }
          break;
        case 'lock_error':
          if (evt.playerId !== undefined && localSet.has(evt.playerId)) {
            sound.playLockError();
            onLocalLockError?.();
          }
          break;
        case 'door_unlock':
          sound.playDoorUnlock(spatial);
          break;
        case 'killstreak': {
          // Strictly private: audible and visible ONLY to local player(s) who scored the kill
          if (evt.playerId !== undefined && localSet.has(evt.playerId)) {
            const count = evt.value ?? 1;
            const streakMode: MatchMode = evt.mode ?? 'BRAWL';
            sound.playKillStreak(count, streakMode);
            onLocalKillStreak?.(count, streakMode, evt.playerId);
          }
          break;
        }
        case 'self_kill': {
          if (evt.playerId !== undefined && localSet.has(evt.playerId)) {
            sound.playSelfKill();
            onLocalSelfKill?.(evt.playerId);
          }
          break;
        }
        case 'victory':
          if (!hasLocalEliminationClimax) {
            sound.playVictory();
          }
          break;
      }
    } catch {
      // Never allow audio API errors to stall the simulation/render loop
    }
  }
}

function worldToSnapshot(world: WorldSyncState, localSlot: number): GameSnapshot {
  return {
    players: world.players.map((p) => {
      const libProg = world.libraryState?.playerProgress.find((pp) => pp.playerId === p.id);
      return {
        id: p.id,
        name: p.name,
        team: p.team,
        isHuman: p.id === localSlot,
        color: p.color,
        accentColor: p.accentColor,
        finish: p.finish,
        hp: p.hp,
        maxHp: p.maxHp,
        ammo: p.ammo,
        maxAmmo: p.maxAmmo,
        alive: p.alive,
        stunTimer: p.stunTimer,
        respawnTimer: p.respawnTimer,
        kills: p.kills,
        deaths: p.deaths,
        damageDealt: p.damageDealt,
        hearts: libProg?.hearts,
        escapedRank: libProg?.escapedRank ?? null,
        eliminated: libProg?.eliminated,
      };
    }),
    elapsedTime: world.elapsedTime,
    activeBullets: world.bullets.length,
    teamMode: world.teamMode,
    winnerId: world.winnerId,
    winnerTeam: world.winnerTeam,
    winnerReason: world.winnerReason,
  };
}

function getHudSnapshotSignature(snap: GameSnapshot): string {
  const sec = Math.max(0, Math.floor(snap.elapsedTime));
  let s = `${sec}|${snap.winnerId ?? 'n'}|${snap.winnerTeam ?? 'n'}`;
  for (const p of snap.players) {
    const stun = p.stunTimer > 0 ? Math.ceil(p.stunTimer * 2) : 0;
    const resp = p.respawnTimer > 0 ? Math.ceil(p.respawnTimer * 2) : 0;
    s += `;${p.id}:${p.hp},${p.ammo},${p.alive ? 1 : 0},${p.kills},${p.deaths},${stun},${resp},${p.hearts ?? ''},${p.escapedRank ?? ''},${p.eliminated ? 1 : 0}`;
  }
  return s;
}

export default function App() {
  const initialRoomCode =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? ''
      : '';

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [menuStep, setMenuStep] = useState<'HUB' | 'MAP_SELECT' | 'COLOR_SELECT'>('HUB');
  const [colorSelectSlot, setColorSelectSlot] = useState<1 | 2>(1);
  const [config, setConfig] = useState<MatchConfig>(() =>
    loadSavedMatchConfig(DEFAULT_SOLO_CONFIG)
  );
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(() =>
    loadGeneralSettings()
  );
  const [pauseSettingsOpen, setPauseSettingsOpen] = useState(false);
  const [isPortraitViewport, setIsPortraitViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );
  const [muted, setMuted] = useState(false);
  const [hasUsedJoystick, setHasUsedJoystick] = useState(false);
  const [controlScheme, setControlScheme] = useState<ControlScheme>(() => {
    if (
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches ||
        ('ontouchstart' in window && window.innerWidth < 1024))
    ) {
      return 'DRAG_STICK';
    }
    return 'CURSOR_SPACE';
  });

  const [isOnline, setIsOnline] = useState(false);
  const [roomState, setRoomState] = useState<OnlineRoomState | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineConnecting, setOnlineConnecting] = useState(false);
  const [killStreak, setKillStreak] = useState<{
    count: number;
    expiresAt: number;
    mode: MatchMode;
    durationMs: number;
    playerId?: number;
  } | null>(null);
  const [selfKillPopup, setSelfKillPopup] = useState<{ expiresAt: number; playerId?: number } | null>(null);
  const [streakNow, setStreakNow] = useState<number>(0);

  const [pcSpeedLimit, setPcSpeedLimit] = useState<number>(100);
  const [spectateTargetId, setSpectateTargetId] = useState<number | null>(null);
  const [libraryLockOpen, setLibraryLockOpen] = useState<boolean>(false);
  const [libraryLockPlayerId, setLibraryLockPlayerId] = useState<number>(0);
  const [hostLobbyConfirmOpen, setHostLobbyConfirmOpen] = useState<boolean>(false);
  const [lockErrorSeq, setLockErrorSeq] = useState<number>(0);
  const [jumpscareFlash, setJumpscareFlash] = useState<boolean>(false);
  const [libraryUi, setLibraryUi] = useState<LibraryUiSnapshot | null>(null);
  const [immersiveSpectateList, setImmersiveSpectateList] = useState<
    Array<{ id: number; name: string }>
  >([]);

  const engineRef = useRef<ArenaEngine>(new ArenaEngine(config));
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => engineRef.current.getSnapshot(0));

  const onlineWorldRef = useRef<WorldSyncState | null>(null);
  const onlineLastSyncAtRef = useRef<number>(0);
  const onlineJoystickRef = useRef<JoystickState>({
    active: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
    maxRadius: 68,
    dx: 0,
    dy: 0,
    magnitude: 0,
    angle: 0,
  });

  const cursorScreenRef = useRef<{ x: number; y: number } | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, initialized: false });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 1000, height: 700 });
  const configRef = useRef<MatchConfig>(config);
  const gameStateRef = useRef<GameState>(gameState);
  const isOnlineRef = useRef<boolean>(isOnline);
  const roomStateRef = useRef<OnlineRoomState | null>(roomState);
  const controlSchemeRef = useRef<ControlScheme>(controlScheme);
  const pcSpeedLimitRef = useRef<number>(pcSpeedLimit);
  const spectateTargetIdRef = useRef<number | null>(spectateTargetId);
  const libraryLockOpenRef = useRef<boolean>(libraryLockOpen);
  const libraryLockPlayerIdRef = useRef<number>(libraryLockPlayerId);
  const hostLobbyConfirmOpenRef = useRef<boolean>(hostLobbyConfirmOpen);
  const libraryUiRef = useRef<LibraryUiSnapshot | null>(libraryUi);
  const renderedLibraryUiRef = useRef<LibraryUiSnapshot | null>(libraryUi);
  const lastHudSigRef = useRef<string>('');
  const immersiveSpectateRef = useRef<Array<{ id: number; name: string }>>([]);
  const jumpscareTimerRef = useRef<number | null>(null);
  const clientRef = useRef<MultiplayerClient | null>(null);

  const triggerJumpscareFlash = useCallback(() => {
    setJumpscareFlash(true);
    if (jumpscareTimerRef.current !== null) {
      window.clearTimeout(jumpscareTimerRef.current);
    }
    jumpscareTimerRef.current = window.setTimeout(() => {
      setJumpscareFlash(false);
      jumpscareTimerRef.current = null;
    }, 680);
  }, []);

  const isLandscapeBlocked =
    isPortraitViewport && (gameState === 'PLAYING' || gameState === 'PAUSED');
  const isLandscapeBlockedRef = useRef<boolean>(isLandscapeBlocked);

  useEffect(() => {
    configRef.current = config;
    saveMatchConfig(config);
  }, [config]);

  useEffect(() => {
    saveGeneralSettings(generalSettings);
    sound.setMusicEnabled(generalSettings.musicEnabled);
  }, [generalSettings]);

  useEffect(() => {
    isLandscapeBlockedRef.current = isLandscapeBlocked;
    if (isLandscapeBlocked) {
      pressedKeysRef.current.clear();
      cursorScreenRef.current = null;
      engineRef.current.releaseJoystick();
      engineRef.current.releaseJoystick2();
      engineRef.current.setHumanCursorInput(false, 0, 0);
      engineRef.current.setPlayer2CursorInput(false, 0, 0);
      onlineJoystickRef.current.active = false;
      onlineJoystickRef.current.magnitude = 0;
      if (isOnlineRef.current) {
        clientRef.current?.sendJoystickInput(false, 0, 0);
      }
    }
  }, [isLandscapeBlocked]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncOrientation = () => {
      setIsPortraitViewport(window.innerHeight > window.innerWidth);
    };
    syncOrientation();
    window.addEventListener('resize', syncOrientation);
    window.addEventListener('orientationchange', syncOrientation);
    window.screen?.orientation?.addEventListener?.('change', syncOrientation);
    return () => {
      window.removeEventListener('resize', syncOrientation);
      window.removeEventListener('orientationchange', syncOrientation);
      window.screen?.orientation?.removeEventListener?.('change', syncOrientation);
    };
  }, []);

  const requestLandscapeLock = useCallback((allowFullscreen = false) => {
    if (typeof window === 'undefined') return;
    if (allowFullscreen) {
      const docEl = document.documentElement as HTMLElement & {
        requestFullscreen?: () => Promise<void>;
      };
      if (
        typeof document.fullscreenElement !== 'undefined' &&
        !document.fullscreenElement &&
        window.matchMedia?.('(pointer: coarse)').matches
      ) {
        docEl.requestFullscreen?.().catch(() => {});
      }
    }
    const orient = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined;
    orient?.lock?.('landscape').catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const orient = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void })
      | undefined;
    if (!orient) return;
    if (gameState === 'PLAYING') {
      orient.lock?.('landscape').catch(() => {});
    } else if (gameState === 'TITLE_MENU' || gameState === 'ONLINE_LOBBY') {
      setPauseSettingsOpen(false);
      try {
        orient.unlock?.();
      } catch {
        // Ignore unsupported unlock
      }
    }
  }, [gameState]);

  useEffect(() => {
    libraryLockOpenRef.current = libraryLockOpen;
  }, [libraryLockOpen]);

  useEffect(() => {
    libraryLockPlayerIdRef.current = libraryLockPlayerId;
  }, [libraryLockPlayerId]);

  useEffect(() => {
    hostLobbyConfirmOpenRef.current = hostLobbyConfirmOpen;
  }, [hostLobbyConfirmOpen]);

  useEffect(() => {
    pcSpeedLimitRef.current = pcSpeedLimit;
  }, [pcSpeedLimit]);

  useEffect(() => {
    spectateTargetIdRef.current = spectateTargetId;
  }, [spectateTargetId]);

  const updatePcSpeedLimit = useCallback((nextVal: number) => {
    const clamped = Math.max(35, Math.min(100, Math.round(nextVal)));
    pcSpeedLimitRef.current = clamped;
    setPcSpeedLimit(clamped);
  }, []);

  const togglePcStealth = useCallback(() => {
    const next = pcSpeedLimitRef.current < 80 ? 100 : 72;
    pcSpeedLimitRef.current = next;
    setPcSpeedLimit(next);
  }, []);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  const switchControlScheme = useCallback((next: ControlScheme) => {
    setControlScheme(next);
    controlSchemeRef.current = next;
    engineRef.current.setControlScheme(next);
    cursorScreenRef.current = null;
    pressedKeysRef.current.clear();
    onlineJoystickRef.current.active = false;
    if (isOnlineRef.current) {
      clientRef.current?.sendJoystickInput(false, 0, 0);
    }
  }, []);

  useEffect(() => {
    controlSchemeRef.current = controlScheme;
  }, [controlScheme]);

  // Setup persistent PeerJS client instance
  useEffect(() => {
    const client = new MultiplayerClient({
      onRoom: (room) => {
        setOnlineConnecting(false);
        setOnlineError(null);
        setRoomState(room);
        roomStateRef.current = room;
        setIsOnline(true);
        isOnlineRef.current = true;
        if (room.phase === 'LOBBY') {
          onlineWorldRef.current = null;
          cameraRef.current.initialized = false;
          cameraRef.current.scale = undefined;
          setKillStreak(null);
          setSelfKillPopup(null);
          setLibraryLockOpen(false);
          setLibraryLockPlayerId(0);
          setHostLobbyConfirmOpen(false);
          setLockErrorSeq(0);
          setSpectateTargetId(null);
          spectateTargetIdRef.current = null;
          immersiveSpectateRef.current = [];
          setImmersiveSpectateList([]);
          setLibraryUi(null);
          libraryUiRef.current = null;
          renderedLibraryUiRef.current = null;
          setGameState('ONLINE_LOBBY');
        } else if (room.phase === 'PLAYING') {
          const roomMapDef = ARENA_MAPS[room.config.mapId];
          if (room.config.mapId === 'library') {
            sound.preloadLibraryAudio();
          } else if (roomMapDef.immersive) {
            sound.preloadImmersiveTrack(roomMapDef.floorTheme);
          }
          cameraRef.current.initialized = false;
          cameraRef.current.scale = undefined;
          setHasUsedJoystick(false);
          setKillStreak(null);
          setSelfKillPopup(null);
          setLibraryLockOpen(false);
          setLibraryLockPlayerId(0);
          setHostLobbyConfirmOpen(false);
          setLockErrorSeq(0);
          setSpectateTargetId(null);
          spectateTargetIdRef.current = null;
          immersiveSpectateRef.current = [];
          setImmersiveSpectateList([]);
          setLibraryUi(null);
          libraryUiRef.current = null;
          renderedLibraryUiRef.current = null;
          lastHudSigRef.current = '';
          setGameState('PLAYING');
        } else if (room.phase === 'GAME_OVER') {
          setKillStreak((prev) => (prev?.mode === 'ELIMINATION' ? prev : null));
          setLibraryLockOpen(false);
          setHostLobbyConfirmOpen(false);
          immersiveSpectateRef.current = [];
          setImmersiveSpectateList([]);
          setGameState('GAME_OVER');
        }
      },
      onWorld: (world) => {
        onlineWorldRef.current = world;
        onlineLastSyncAtRef.current = performance.now();
        const mySlot = roomStateRef.current?.mySlot ?? 0;
        const specId = spectateTargetIdRef.current;
        const listenerP =
          (specId != null
            ? world.players.find((p) => p.id === specId && p.alive)
            : undefined) ?? world.players.find((p) => p.id === mySlot);
        if (world.events && world.events.length > 0) {
          playEngineEvents(
            world.events,
            listenerP?.x,
            listenerP?.y,
            [mySlot],
            (streak, streakMode, playerId) => {
              const nowMs = performance.now();
              const durationMs = streakMode === 'ELIMINATION' ? 3400 : KILL_STREAK_WINDOW * 1000;
              setStreakNow(nowMs);
              setKillStreak({ count: streak, expiresAt: nowMs + durationMs, mode: streakMode, durationMs, playerId });
            },
            (playerId) => {
              setSelfKillPopup({ expiresAt: performance.now() + 2800, playerId });
            },
            listenerP?.floor ?? 0,
            () => setLockErrorSeq((prev) => prev + 1),
            triggerJumpscareFlash
          );
        }
        const nextSnap = worldToSnapshot(world, mySlot);
        const sig = getHudSnapshotSignature(nextSnap);
        if (sig !== lastHudSigRef.current) {
          lastHudSigRef.current = sig;
          setSnapshot(nextSnap);
        }
      },
      onError: (message) => {
        setOnlineConnecting(false);
        setOnlineError(message);
        if (
          isOnlineRef.current &&
          (gameStateRef.current === 'PLAYING' || gameStateRef.current === 'GAME_OVER')
        ) {
          onlineWorldRef.current = null;
          onlineJoystickRef.current.active = false;
          cursorScreenRef.current = null;
          setRoomState(null);
          setIsOnline(false);
          setGameState('TITLE_MENU');
        }
      },
      onStatus: (connected) => {
        if (!connected) {
          setOnlineConnecting(false);
        }
      },
    });

    clientRef.current = client;
    const handleUnload = () => {
      client.disconnect();
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      client.disconnect();
    };
  }, []);

  const startSoloMatch = useCallback(
    (overrideConfig?: MatchConfig) => {
      const baseCfg = overrideConfig ?? config;
      const rawMapDef = ARENA_MAPS[baseCfg.mapId];
      const effectiveMapId = baseCfg.local2P && rawMapDef.immersive ? 'crossroads' : baseCfg.mapId;
      const mapDef = ARENA_MAPS[effectiveMapId];
      const nextCfg: MatchConfig = {
        ...baseCfg,
        mapId: effectiveMapId,
        immersive: mapDef.immersive,
        extraDark: mapDef.immersive ? Boolean(baseCfg.extraDark) : false,
      };
      if (effectiveMapId !== baseCfg.mapId) {
        setConfig(nextCfg);
      }
      sound.unlock();
      requestLandscapeLock(true);
      if (nextCfg.mapId === 'library') {
        sound.preloadLibraryAudio();
      } else if (mapDef.immersive) {
        sound.preloadImmersiveTrack(mapDef.floorTheme);
      }
      setIsOnline(false);
      setRoomState(null);
      setMenuStep('HUB');
      setPauseSettingsOpen(false);
      cameraRef.current.initialized = false;
      cameraRef.current.scale = undefined;
      engineRef.current.reset(nextCfg);
      engineRef.current.setControlScheme(controlSchemeRef.current);
      const initialSnap = engineRef.current.getSnapshot(0);
      lastHudSigRef.current = getHudSnapshotSignature(initialSnap);
      setSnapshot(initialSnap);
      setHasUsedJoystick(false);
      setKillStreak(null);
      setSelfKillPopup(null);
      setLibraryLockOpen(false);
      setLibraryLockPlayerId(0);
      setLockErrorSeq(0);
      setSpectateTargetId(null);
      spectateTargetIdRef.current = null;
      immersiveSpectateRef.current = [];
      setImmersiveSpectateList([]);
      setJumpscareFlash(false);
      setLibraryUi(null);
      libraryUiRef.current = null;
      renderedLibraryUiRef.current = null;
      setGameState('PLAYING');
    },
    [config, requestLandscapeLock]
  );

  // Auto-expire self-kill funny popup (keep visible even on immediate GAME_OVER)
  useEffect(() => {
    if (!selfKillPopup) return;
    if (gameState !== 'PLAYING' && gameState !== 'GAME_OVER') {
      setSelfKillPopup(null);
      return;
    }
    const msLeft = Math.max(0, selfKillPopup.expiresAt - performance.now());
    const id = window.setTimeout(() => setSelfKillPopup(null), msLeft);
    return () => window.clearTimeout(id);
  }, [selfKillPopup, gameState]);

  // Smooth countdown timer for active kill-streak / Last Standing progression side popup
  useEffect(() => {
    if (!killStreak) return;
    const allowInGameOver = gameState === 'GAME_OVER' && killStreak.mode === 'ELIMINATION';
    if (gameState !== 'PLAYING' && !allowInGameOver) {
      setKillStreak(null);
      return;
    }
    const id = window.setInterval(() => {
      const nowMs = performance.now();
      if (nowMs >= killStreak.expiresAt) {
        setKillStreak(null);
      } else {
        setStreakNow(nowMs);
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [killStreak, gameState]);

  const handleCreateOnlineRoom = (name: string) => {
    sound.unlock();
    setOnlineError(null);
    setOnlineConnecting(true);
    clientRef.current?.createRoom(name, {
      ...DEFAULT_ONLINE_CONFIG,
      playerColorId: config.playerColorId,
      modifiers: { ...DEFAULT_MATCH_MODIFIERS, ...(config.modifiers ?? {}) },
    });
  };

  const handleJoinOnlineRoom = (code: string, name: string) => {
    sound.unlock();
    setOnlineError(null);
    setOnlineConnecting(true);
    clientRef.current?.joinRoom(code, name, config.playerColorId);
  };

  const handleLeaveOnline = () => {
    setOnlineConnecting(false);
    setOnlineError(null);
    setHostLobbyConfirmOpen(false);
    clientRef.current?.leaveRoom();
    onlineWorldRef.current = null;
    onlineJoystickRef.current.active = false;
    cursorScreenRef.current = null;
    setRoomState(null);
    setIsOnline(false);
    setGameState('TITLE_MENU');
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sound.setMuted(next);
  };

  const openHostLobbyMenu = useCallback(() => {
    if (!isOnlineRef.current) return;
    const room = roomStateRef.current;
    if (!room || room.mySlot !== room.hostSlot || gameStateRef.current !== 'PLAYING') return;
    pressedKeysRef.current.clear();
    onlineJoystickRef.current.active = false;
    onlineJoystickRef.current.pointerId = null;
    onlineJoystickRef.current.magnitude = 0;
    clientRef.current?.sendJoystickInput(false, onlineJoystickRef.current.angle, 0);
    setLibraryLockOpen(false);
    setHostLobbyConfirmOpen(true);
  }, []);

  const confirmReturnToLobby = () => {
    setHostLobbyConfirmOpen(false);
    clientRef.current?.returnToLobby();
  };

  const togglePause = useCallback(() => {
    if (isOnlineRef.current) return;
    setGameState((prev) => {
      if (prev === 'PLAYING') {
        engineRef.current.releaseJoystick();
        engineRef.current.releaseJoystick2();
        engineRef.current.setHumanCursorInput(false, 0, 0);
        engineRef.current.setPlayer2CursorInput(false, 0, 0);
        setLibraryLockOpen(false);
        return 'PAUSED';
      }
      if (prev === 'PAUSED') return 'PLAYING';
      return prev;
    });
  }, []);

  useEffect(() => {
    const MOVE_CODES = new Set([
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ShiftLeft',
      'ShiftRight',
    ]);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && hostLobbyConfirmOpenRef.current) {
        setHostLobbyConfirmOpen(false);
        return;
      }

      if (e.key === 'Escape' && libraryLockOpenRef.current) {
        setLibraryLockOpen(false);
        return;
      }

      if (
        !isOnlineRef.current &&
        e.key === 'Escape' &&
        (gameStateRef.current === 'PLAYING' || gameStateRef.current === 'PAUSED')
      ) {
        pressedKeysRef.current.clear();
        togglePause();
        return;
      }

      if (
        isOnlineRef.current &&
        e.key === 'Escape' &&
        gameStateRef.current === 'PLAYING' &&
        roomStateRef.current?.mySlot === roomStateRef.current?.hostSlot
      ) {
        openHostLobbyMenu();
        return;
      }

      if (gameStateRef.current !== 'PLAYING' || hostLobbyConfirmOpenRef.current) return;

      const isLocal2PActive = !isOnlineRef.current && Boolean(configRef.current.local2P);

      if (e.code === 'KeyC' && !e.repeat && controlSchemeRef.current === 'CURSOR_SPACE') {
        const libUi = libraryUiRef.current;
        if (libUi && libUi.state.introTimer <= 0 && (libUi.playerAlive || (isLocal2PActive && libUi.p2Alive))) {
          togglePcStealth();
          return;
        }
      }

      if (e.code === 'KeyE' && !e.repeat) {
        const libUi = libraryUiRef.current;
        if (libUi && libUi.state.introTimer <= 0 && libUi.playerAlive) {
          sound.unlock();
          if (libraryLockOpenRef.current) {
            setLibraryLockOpen(false);
            return;
          }
          if (libUi.canCollectBook) {
            if (isOnlineRef.current) {
              clientRef.current?.sendCollectBook();
            } else {
              engineRef.current.collectNearbyBook(0);
            }
            return;
          }
          if (libUi.canUnlockDoor) {
            setLibraryLockPlayerId(0);
            setLibraryLockOpen(true);
            return;
          }
        }
      }

      if (MOVE_CODES.has(e.code)) {
        if (e.code.startsWith('Arrow')) e.preventDefault();
        pressedKeysRef.current.add(e.code);
        setHasUsedJoystick(true);
      }

      if (e.code === 'Space' || (isLocal2PActive && e.code === 'KeyF')) {
        e.preventDefault();
        if (e.repeat) return;
        sound.unlock();
        setHasUsedJoystick(true);
        if (isOnlineRef.current) {
          clientRef.current?.sendShootAction();
        } else {
          engineRef.current.firePlayerShot(0);
        }
      }

      if (
        isLocal2PActive &&
        (e.code === 'Enter' || e.code === 'Slash' || e.code === 'Numpad0')
      ) {
        e.preventDefault();
        if (e.repeat) return;
        sound.unlock();
        setHasUsedJoystick(true);
        engineRef.current.firePlayerShot(1);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.code);
      if (e.code === 'Space' && gameStateRef.current === 'PLAYING') {
        e.preventDefault();
      }
    };

    const onBlur = () => {
      pressedKeysRef.current.clear();
    };

    const onVisibilityOrHide = () => {
      const hidden = document.hidden || document.visibilityState === 'hidden';
      if (hidden) {
        pressedKeysRef.current.clear();
        cursorScreenRef.current = null;
      }
      sound.setAppBackgrounded(hidden);
    };

    const onPageHide = () => {
      pressedKeysRef.current.clear();
      cursorScreenRef.current = null;
      sound.setAppBackgrounded(true);
    };

    const onPageShowOrFocus = () => {
      if (!document.hidden && document.visibilityState !== 'hidden') {
        sound.setAppBackgrounded(false);
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityOrHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShowOrFocus);
    window.addEventListener('focus', onPageShowOrFocus);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityOrHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShowOrFocus);
      window.removeEventListener('focus', onPageShowOrFocus);
    };
  }, [togglePause, togglePcStealth, openHostLobbyMenu]);

  // High-DPI Canvas ResizeObserver
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const updateSize = () => {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(100, Math.floor(rect.width));
      const height = Math.max(100, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvasSizeRef.current = { width, height };
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [gameState]);

  // Main simulation / render loop
  useEffect(() => {
    if (gameState !== 'PLAYING' && gameState !== 'PAUSED' && gameState !== 'GAME_OVER') {
      return;
    }

    let rafId = 0;
    let lastTime = performance.now();
    let hudAccumulator = 0;
    let libHudAccumulator = 0;

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(0.05, Math.max(0, rawDt));

      let worldToRender: RenderableWorld | null = null;
      let activeJoystick: JoystickState = engineRef.current.joystick;
      let localId = 0;

      if (isOnlineRef.current) {
        localId = roomStateRef.current?.mySlot ?? 0;
        activeJoystick = onlineJoystickRef.current;
        const serverWorld = onlineWorldRef.current;
        if (serverWorld) {
          // Subtle velocity extrapolation up to 35ms between 30Hz server frames
          const sinceSync = Math.min(0.038, Math.max(0, (now - onlineLastSyncAtRef.current) / 1000));
          worldToRender = {
            mapId: serverWorld.mapId,
            immersive: serverWorld.immersive,
            extraDark: serverWorld.extraDark,
            teamMode: serverWorld.teamMode,
            elapsedTime: serverWorld.elapsedTime + sinceSync,
            screenShake: serverWorld.screenShake,
            libraryState: serverWorld.libraryState,
            players: serverWorld.players.map((p) => ({
              ...p,
              x: p.alive ? p.x + p.vx * sinceSync : p.x,
              y: p.alive ? p.y + p.vy * sinceSync : p.y,
            })),
            bullets: serverWorld.bullets.map((b) => ({
              ...b,
              x: b.x + b.vx * sinceSync,
              y: b.y + b.vy * sinceSync,
            })),
            pickups: serverWorld.pickups,
            boxes: serverWorld.boxes ?? [],
            icePits: serverWorld.icePits ?? [],
            explosions: serverWorld.explosions,
            particles: serverWorld.particles,
            floatingTexts: serverWorld.floatingTexts,
          };
        }
      } else {
        const engine = engineRef.current;
        const isLocal2PTick = Boolean(engine.config.local2P);
        if (gameStateRef.current === 'PLAYING' && !isLandscapeBlockedRef.current) {
          engine.update(dt);
          const evts = engine.drainEvents();
          if (evts.length > 0) {
            const specId = spectateTargetIdRef.current;
            const p0Ent = engine.players.find((p) => p.id === 0);
            const p1Ent = engine.players.find((p) => p.id === 1);
            let listenerX = p0Ent?.x;
            let listenerY = p0Ent?.y;
            let listenerFl: FloorLevel = p0Ent?.floor ?? 0;
            if (isLocal2PTick) {
              const aliveH = [p0Ent, p1Ent].filter((p): p is NonNullable<typeof p> => Boolean(p && p.alive));
              if (aliveH.length === 2) {
                listenerX = (aliveH[0].x + aliveH[1].x) * 0.5;
                listenerY = (aliveH[0].y + aliveH[1].y) * 0.5;
                listenerFl = aliveH[0].floor ?? 0;
              } else if (aliveH.length === 1) {
                listenerX = aliveH[0].x;
                listenerY = aliveH[0].y;
                listenerFl = aliveH[0].floor ?? 0;
              }
            } else if (specId != null) {
              const sp = engine.players.find((p) => p.id === specId && p.alive);
              if (sp) {
                listenerX = sp.x;
                listenerY = sp.y;
                listenerFl = sp.floor ?? 0;
              }
            }
            playEngineEvents(
              evts,
              listenerX,
              listenerY,
              isLocal2PTick ? [0, 1] : [0],
              (streak, streakMode, playerId) => {
                const nowMs = performance.now();
                const durationMs = streakMode === 'ELIMINATION' ? 3400 : KILL_STREAK_WINDOW * 1000;
                setStreakNow(nowMs);
                setKillStreak({
                  count: streak,
                  expiresAt: nowMs + durationMs,
                  mode: streakMode,
                  durationMs,
                  playerId,
                });
              },
              (playerId) => {
                setSelfKillPopup({ expiresAt: performance.now() + 2800, playerId });
              },
              listenerFl,
              () => setLockErrorSeq((prev) => prev + 1),
              triggerJumpscareFlash
            );
          }
          if (engine.winnerId !== null) {
            const finalSnap = engine.getSnapshot(0);
            lastHudSigRef.current = getHudSnapshotSignature(finalSnap);
            setSnapshot(finalSnap);
            setLibraryLockOpen(false);
            setGameState('GAME_OVER');
          }
        }

        const inLibraryIntro =
          engine.map.id === 'library' && (engine.libraryState?.introTimer ?? 0) > 0;
        hudAccumulator += dt;
        if (!inLibraryIntro && hudAccumulator >= 0.08) {
          hudAccumulator = 0;
          const nextSnap = engine.getSnapshot(0);
          const sig = getHudSnapshotSignature(nextSnap);
          if (sig !== lastHudSigRef.current) {
            lastHudSigRef.current = sig;
            setSnapshot(nextSnap);
          }
        }

        worldToRender = {
          mapId: engine.map.id,
          immersive: engine.map.immersive,
          extraDark: Boolean(engine.config.extraDark),
          teamMode: engine.config.teamMode ?? 'FFA',
          elapsedTime: engine.elapsedTime,
          screenShake: engine.screenShake,
          libraryState: engine.libraryState ?? undefined,
          players: engine.players,
          bullets: engine.bullets,
          pickups: engine.pickups,
          boxes: engine.boxes,
          icePits: engine.icePits,
          explosions: engine.explosions,
          particles: engine.particles,
          floatingTexts: engine.floatingTexts,
        };
      }

      const isLocal2PNow = !isOnlineRef.current && Boolean(engineRef.current.config.local2P);

      // Sync Library HUD / proximity / universal immersive spectate targets
      if (worldToRender && worldToRender.mapId === 'library' && worldToRender.libraryState) {
        if (immersiveSpectateRef.current.length > 0) {
          immersiveSpectateRef.current = [];
          setImmersiveSpectateList([]);
        }
        const libState = worldToRender.libraryState;
        const libWalls = ARENA_MAPS[worldToRender.mapId].walls;
        const localP = worldToRender.players.find((p) => p.id === localId);
        const p2Ent = isLocal2PNow ? worldToRender.players.find((p) => p.id === 1) : undefined;
        const pFloor = (localP?.floor ?? 0) as FloorLevel;
        const pSpeed = localP ? Math.hypot(localP.vx ?? 0, localP.vy ?? 0) : 0;
        const pAlive = Boolean(localP?.alive);
        const p2Alive = Boolean(p2Ent?.alive);
        const prog = libState.playerProgress.find((pp) => pp.playerId === localId);
        const door = libState.doors.find((d) => d.playerId === localId);
        const progP2 = isLocal2PNow ? libState.playerProgress.find((pp) => pp.playerId === 1) : undefined;
        const doorP2 = isLocal2PNow ? libState.doors.find((d) => d.playerId === 1) : undefined;

        const canCollectBook = Boolean(
          pAlive &&
            localP &&
            prog &&
            prog.books.some((b) => canCollectBookSpot(localP, b, libWalls))
        );
        const canUnlockDoor = Boolean(
          pAlive &&
            pFloor === 0 &&
            localP &&
            door &&
            !prog?.unlocked &&
            Math.hypot(localP.x - door.x, localP.y - door.y) <= 155
        );

        const canCollectBookP2 = Boolean(
          isLocal2PNow &&
            p2Alive &&
            p2Ent &&
            progP2 &&
            progP2.books.some((b) => canCollectBookSpot(p2Ent, b, libWalls))
        );
        const canUnlockDoorP2 = Boolean(
          isLocal2PNow &&
            p2Alive &&
            (p2Ent?.floor ?? 0) === 0 &&
            p2Ent &&
            doorP2 &&
            !progP2?.unlocked &&
            Math.hypot(p2Ent.x - doorP2.x, p2Ent.y - doorP2.y) <= 155
        );

        const spectateCandidates = worldToRender.players
          .filter((p) => (isLocal2PNow ? p.id !== 0 && p.id !== 1 : p.id !== localId) && p.alive)
          .map((p) => ({ id: p.id, name: p.name }));

        const allHumansDown = isLocal2PNow
          ? !pAlive && !p2Alive && (Boolean(prog?.unlocked || prog?.eliminated) && Boolean(progP2?.unlocked || progP2?.eliminated))
          : !pAlive && (Boolean(prog?.unlocked) || Boolean(prog?.eliminated));

        if (allHumansDown) {
          const curTarget = spectateTargetIdRef.current;
          if (
            spectateCandidates.length > 0 &&
            !spectateCandidates.some((c) => c.id === curTarget)
          ) {
            spectateTargetIdRef.current = spectateCandidates[0].id;
            setSpectateTargetId(spectateCandidates[0].id);
          }
        } else if (spectateTargetIdRef.current !== null) {
          spectateTargetIdRef.current = null;
          setSpectateTargetId(null);
        }

        const lockOwnerAlive =
          libraryLockPlayerIdRef.current === 1 ? p2Alive : pAlive;
        if (!lockOwnerAlive && libraryLockOpenRef.current) {
          setLibraryLockOpen(false);
        }

        const nextLibUi: LibraryUiSnapshot = {
          state: libState,
          playerFloor: pFloor,
          playerSpeed: pSpeed,
          playerAlive: pAlive,
          canCollectBook,
          canUnlockDoor,
          p2Alive,
          canCollectBookP2,
          canUnlockDoorP2,
          spectateCandidates,
        };
        libraryUiRef.current = nextLibUi;
        const prevUi = renderedLibraryUiRef.current;

        const activeCfgForSpeed = isOnlineRef.current
          ? roomStateRef.current?.config
          : engineRef.current.config;
        const spdMult =
          PLAYER_SPEED_MULTS[activeCfgForSpeed?.modifiers?.playerSpeed ?? 'MEDIUM'] ?? 1;
        const effMaxSpeed = Math.max(1, PLAYER_MAX_SPEED * spdMult);

        libHudAccumulator += dt;
        const stateFlipped =
          !prevUi ||
          prevUi.canCollectBook !== canCollectBook ||
          prevUi.canUnlockDoor !== canUnlockDoor ||
          prevUi.canCollectBookP2 !== canCollectBookP2 ||
          prevUi.canUnlockDoorP2 !== canUnlockDoorP2 ||
          (prevUi.state.introTimer > 0 && libState.introTimer <= 0) ||
          prevUi.state.playerProgress.find((pp) => pp.playerId === localId)?.collectedCount !==
            prog?.collectedCount ||
          prevUi.playerFloor !== pFloor ||
          prevUi.playerAlive !== pAlive ||
          prevUi.p2Alive !== p2Alive ||
          prevUi.spectateCandidates.length !== spectateCandidates.length;

        const speedPctChanged =
          !prevUi ||
          Math.min(100, Math.round((prevUi.playerSpeed / effMaxSpeed) * 100)) !==
            Math.min(100, Math.round((pSpeed / effMaxSpeed) * 100));
        const stunSecChanged =
          !prevUi ||
          Math.ceil(prevUi.state.monster.stunTimer) !== Math.ceil(libState.monster.stunTimer);
        const introActive = libState.introTimer > 0;

        const hudInterval = introActive ? 0.1 : 0.08;
        if (stateFlipped || (libHudAccumulator >= hudInterval && (introActive || speedPctChanged || stunSecChanged))) {
          libHudAccumulator = 0;
          renderedLibraryUiRef.current = nextLibUi;
          setLibraryUi(nextLibUi);
        }
      } else {
        if (libraryUiRef.current !== null || renderedLibraryUiRef.current !== null) {
          libraryUiRef.current = null;
          renderedLibraryUiRef.current = null;
          setLibraryUi(null);
        }
        const isImmersiveWorld = Boolean(
          worldToRender && (worldToRender.immersive || ARENA_MAPS[worldToRender.mapId].immersive)
        );
        const activeCfg = isOnlineRef.current
          ? roomStateRef.current?.config ?? DEFAULT_ONLINE_CONFIG
          : engineRef.current.config;
        const localP = worldToRender?.players.find((p) => p.id === localId);
        const p2Ent = isLocal2PNow ? worldToRender?.players.find((p) => p.id === 1) : undefined;
        const anyLocalAlive = isLocal2PNow
          ? Boolean(localP?.alive || p2Ent?.alive)
          : Boolean(localP?.alive);
        const canNonLibSpectate = Boolean(
          worldToRender &&
            isImmersiveWorld &&
            gameStateRef.current === 'PLAYING' &&
            activeCfg.mode === 'ELIMINATION' &&
            localP &&
            !anyLocalAlive
        );

        if (canNonLibSpectate && worldToRender) {
          const candidates = worldToRender.players
            .filter((p) => (isLocal2PNow ? p.id !== 0 && p.id !== 1 : p.id !== localId) && p.alive)
            .map((p) => ({ id: p.id, name: p.name }));
          const curTarget = spectateTargetIdRef.current;
          if (candidates.length > 0 && !candidates.some((c) => c.id === curTarget)) {
            spectateTargetIdRef.current = candidates[0].id;
            setSpectateTargetId(candidates[0].id);
          } else if (candidates.length === 0 && curTarget !== null) {
            spectateTargetIdRef.current = null;
            setSpectateTargetId(null);
          }
          const prevList = immersiveSpectateRef.current;
          const changed =
            prevList.length !== candidates.length ||
            candidates.some((c, i) => prevList[i]?.id !== c.id || prevList[i]?.name !== c.name);
          if (changed) {
            immersiveSpectateRef.current = candidates;
            setImmersiveSpectateList(candidates);
          }
        } else {
          if (spectateTargetIdRef.current !== null) {
            spectateTargetIdRef.current = null;
            setSpectateTargetId(null);
          }
          if (immersiveSpectateRef.current.length > 0) {
            immersiveSpectateRef.current = [];
            setImmersiveSpectateList([]);
          }
        }
      }

      // WASD / Arrow movement + Shift slow-walk (or PC Speed Slider in Library) + 360-degree pure cursor aim
      const { width, height } = canvasSizeRef.current;
      if (
        gameStateRef.current === 'PLAYING' &&
        !isLandscapeBlockedRef.current &&
        controlSchemeRef.current === 'CURSOR_SPACE' &&
        worldToRender
      ) {
        const keys = pressedKeysRef.current;
        const maxPct = worldToRender.mapId === 'library' ? pcSpeedLimitRef.current / 100 : 1.0;

        if (isLocal2PNow) {
          const p1Ent = worldToRender.players.find((p) => p.id === 0);
          if (p1Ent && p1Ent.alive) {
            let kx1 = 0;
            let ky1 = 0;
            if (keys.has('KeyA')) kx1 -= 1;
            if (keys.has('KeyD')) kx1 += 1;
            if (keys.has('KeyW')) ky1 -= 1;
            if (keys.has('KeyS')) ky1 += 1;
            const moving1 = kx1 !== 0 || ky1 !== 0;
            const moveAngle1 = moving1 ? Math.atan2(ky1, kx1) : p1Ent.angle;
            const shift1 = keys.has('ShiftLeft');
            const mag1 = moving1 ? (shift1 ? Math.min(0.44, maxPct) : maxPct) : 0;
            engineRef.current.setHumanCursorInput(moving1, moveAngle1, mag1, moveAngle1, moving1);
          } else {
            engineRef.current.setHumanCursorInput(false, 0, 0);
          }

          const p2Ent = worldToRender.players.find((p) => p.id === 1);
          if (p2Ent && p2Ent.alive) {
            let kx2 = 0;
            let ky2 = 0;
            if (keys.has('ArrowLeft')) kx2 -= 1;
            if (keys.has('ArrowRight')) kx2 += 1;
            if (keys.has('ArrowUp')) ky2 -= 1;
            if (keys.has('ArrowDown')) ky2 += 1;
            const moving2 = kx2 !== 0 || ky2 !== 0;
            const moveAngle2 = moving2 ? Math.atan2(ky2, kx2) : p2Ent.angle;
            const shift2 = keys.has('ShiftRight');
            const mag2 = moving2 ? (shift2 ? Math.min(0.44, maxPct) : maxPct) : 0;
            engineRef.current.setPlayer2CursorInput(moving2, moveAngle2, mag2, moveAngle2, moving2);
          } else {
            engineRef.current.setPlayer2CursorInput(false, 0, 0);
          }
        } else {
          const localP = worldToRender.players.find((p) => p.id === localId);
          if (localP && localP.alive) {
            let kx = 0;
            let ky = 0;
            if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
            if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
            if (keys.has('KeyW') || keys.has('ArrowUp')) ky -= 1;
            if (keys.has('KeyS') || keys.has('ArrowDown')) ky += 1;

            const moving = kx !== 0 || ky !== 0;
            const moveAngle = moving ? Math.atan2(ky, kx) : localP.angle;
            const shiftHeld = keys.has('ShiftLeft') || keys.has('ShiftRight');
            const magnitude = moving ? (shiftHeld ? Math.min(0.44, maxPct) : maxPct) : 0;

            let aimAngle = localP.angle;
            let hasAim = moving;
            if (cursorScreenRef.current) {
              const map = ARENA_MAPS[worldToRender.mapId];
              const isImmersive = worldToRender.immersive || map.immersive;
              const { scale, offsetX, offsetY } = getArenaViewTransform(
                map,
                isImmersive,
                width,
                height,
                localP,
                cameraRef.current,
                false
              );
              const px = offsetX + localP.x * scale;
              const py = offsetY + localP.y * scale;
              const dx = cursorScreenRef.current.x - px;
              const dy = cursorScreenRef.current.y - py;
              if (Math.hypot(dx, dy) > 2) {
                aimAngle = Math.atan2(dy, dx);
                hasAim = true;
              }
            } else if (moving) {
              aimAngle = moveAngle;
            }

            if (isOnlineRef.current) {
              clientRef.current?.sendJoystickInput(moving, aimAngle, magnitude, moveAngle);
            } else {
              engineRef.current.setHumanCursorInput(moving, aimAngle, magnitude, moveAngle, hasAim);
            }
          }
        }
      }

      if (worldToRender) {
        const isLibrary = worldToRender.mapId === 'library';
        const mapTheme = ARENA_MAPS[worldToRender.mapId].floorTheme;
        const isImmersivePlaying =
          gameStateRef.current === 'PLAYING' &&
          (worldToRender.immersive || ARENA_MAPS[worldToRender.mapId].immersive);
        const isNormalPlaying =
          gameStateRef.current === 'PLAYING' &&
          !(worldToRender.immersive || ARENA_MAPS[worldToRender.mapId].immersive);
        const extraDark = Boolean(worldToRender.extraDark);
        // Immersive maps now use their dedicated real music tracks (no synthetic ambient drone)
        sound.setImmersiveAmbient(false, false);

        const isLibraryPlaying =
          isLibrary &&
          gameStateRef.current === 'PLAYING' &&
          (worldToRender.libraryState?.introTimer ?? LIBRARY_INTRO_DURATION) <= 0;
        const totalMaxBooks = LIBRARY_BOOKS_PER_PLAYER * Math.max(1, worldToRender.players.length);
        const libProgress = worldToRender.libraryState
          ? worldToRender.libraryState.totalCollectedAll / totalMaxBooks
          : 0;
        const libInRage = worldToRender.libraryState?.monster.mode === 'rage';
        sound.updateLibraryMusic(dt, isLibraryPlaying, libProgress, libInRage);

        sound.setMapEnvironment(mapTheme, isImmersivePlaying);
        sound.updateAmbientCritters(
          dt,
          isImmersivePlaying && !isLibrary && mapTheme === 'grass_outdoors'
        );

        // Seamless 2-stage ramping music tracks for Emerald Grove & Wooden Mansion
        const useImmersiveTrack =
          isImmersivePlaying &&
          !isLibrary &&
          (mapTheme === 'grass_outdoors' || mapTheme === 'mansion_wood');
        let immersiveProgress = 0;
        let immersiveFinalStage = false;
        if (useImmersiveTrack) {
          const totalPlayers = Math.max(2, worldToRender.players.length);
          const alivePlayers = worldToRender.players.filter((p) => p.alive).length;
          const deadPlayers = Math.max(0, totalPlayers - alivePlayers);
          const deadRatio = deadPlayers / Math.max(1, totalPlayers - 1);
          const timeBuild = Math.min(0.42, worldToRender.elapsedTime / 75);
          const activeCfg = isOnlineRef.current
            ? roomStateRef.current?.config ?? DEFAULT_ONLINE_CONFIG
            : engineRef.current.config;
          if (activeCfg.mode === 'ELIMINATION') {
            immersiveFinalStage = alivePlayers <= 2;
            const stage1To3Ratio =
              totalPlayers > 3 ? Math.min(1, deadPlayers / (totalPlayers - 2)) : deadRatio;
            immersiveProgress =
              mapTheme === 'mansion_wood' && !immersiveFinalStage
                ? Math.min(0.66, Math.max(stage1To3Ratio * 0.54, timeBuild * 0.6) + stage1To3Ratio * 0.12)
                : Math.min(1, Math.max(deadRatio * 0.85, timeBuild) + deadRatio * 0.15);
          } else {
            const scorePlayers = isOnlineRef.current
              ? onlineWorldRef.current?.players ?? []
              : engineRef.current.players;
            const leadKills =
              worldToRender.teamMode === '2V2'
                ? Math.max(
                    scorePlayers
                      .filter((p) => p.team === 0)
                      .reduce((sum, p) => sum + p.kills, 0),
                    scorePlayers
                      .filter((p) => p.team === 1)
                      .reduce((sum, p) => sum + p.kills, 0)
                  )
                : Math.max(0, ...scorePlayers.map((p) => p.kills));
            const target = Math.max(1, activeCfg.targetKills);
            const killProg = Math.min(1, leadKills / target);
            immersiveProgress = Math.min(
              1,
              killProg * 0.84 + Math.min(0.16, worldToRender.elapsedTime / 100)
            );
            immersiveFinalStage = leadKills >= Math.max(1, Math.ceil(target * 0.7));
          }
        }
        sound.updateImmersiveMapMusic(
          dt,
          useImmersiveTrack,
          mapTheme,
          immersiveProgress,
          immersiveFinalStage
        );

        // Compute dynamic tension (0..1) for ramping normal-mode suspense music
        let normalTension = 0;
        if (isNormalPlaying) {
          const totalPlayers = Math.max(2, worldToRender.players.length);
          const deadPlayers = worldToRender.players.filter((p) => !p.alive).length;
          const deadRatio = deadPlayers / Math.max(1, totalPlayers - 1);
          const timeBuild = Math.min(0.45, worldToRender.elapsedTime / 75);
          const activeCfg = isOnlineRef.current
            ? roomStateRef.current?.config ?? DEFAULT_ONLINE_CONFIG
            : engineRef.current.config;
          if (activeCfg.mode === 'ELIMINATION') {
            const showdownBoost = deadPlayers >= totalPlayers - 2 ? 0.14 : 0;
            normalTension = Math.min(1, Math.max(deadRatio * 0.78, timeBuild * 0.55) + deadRatio * 0.22 + showdownBoost);
          } else {
            const maxKills = Math.max(
              0,
              ...engineRef.current.players.map((p) => p.kills),
              ...(onlineWorldRef.current?.players.map((p) => p.kills) ?? [0])
            );
            const killProg = Math.min(1, maxKills / Math.max(1, activeCfg.targetKills));
            normalTension = Math.min(
              1,
              killProg * 0.78 + (deadPlayers / totalPlayers) * 0.16 + Math.min(0.18, worldToRender.elapsedTime / 110)
            );
          }
        }
        sound.updateNormalMusic(dt, isNormalPlaying, normalTension, mapTheme);

        const specId = spectateTargetIdRef.current;
        const listener =
          (specId != null
            ? worldToRender.players.find((p) => p.id === specId && p.alive)
            : undefined) ??
          (isLocal2PNow
            ? worldToRender.players.find((p) => (p.id === 0 || p.id === 1) && p.alive) ??
              worldToRender.players.find((p) => p.id === 0)
            : worldToRender.players.find((p) => p.id === localId));
        sound.updateImmersiveFootsteps(
          dt,
          listener,
          worldToRender.players,
          mapTheme,
          isImmersivePlaying,
          extraDark
        );
      }

      const hideBehindLibIntro = Boolean(
        worldToRender &&
          worldToRender.mapId === 'library' &&
          (worldToRender.libraryState?.introTimer ?? 0) > 0
      );
      const canvas = canvasRef.current;
      if (canvas && worldToRender && !hideBehindLibIntro) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = canvas.width / Math.max(1, width);
          ctx.save();
          ctx.scale(dpr, dpr);
          renderArena(
            ctx,
            worldToRender,
            activeJoystick,
            width,
            height,
            localId,
            cameraRef.current,
            {
              controlScheme: controlSchemeRef.current,
              cursorScreen: !isOnlineRef.current && engineRef.current.config.local2P ? null : cursorScreenRef.current,
              hideJoystick: controlSchemeRef.current === 'DRAG_STICK',
              spectateTargetId: spectateTargetIdRef.current,
              localPlayerIds: !isOnlineRef.current && engineRef.current.config.local2P ? [0, 1] : undefined,
              dt,
            }
          );
          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      sound.setImmersiveAmbient(false, false);
      sound.setMapEnvironment('mansion_wood', false);
      sound.updateAmbientCritters(0, false);
      sound.updateNormalMusic(0, false, 0);
      sound.updateLibraryMusic(0, false, 0, false);
      sound.updateImmersiveMapMusic(0, false, 'mansion_wood', 0, false);
    };
  }, [gameState]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== 'PLAYING') return;
    sound.unlock();

    // Auto-switch to stationary TouchControls if user taps with a touchscreen
    if (e.pointerType === 'touch' && controlSchemeRef.current !== 'DRAG_STICK') {
      controlSchemeRef.current = 'DRAG_STICK';
      engineRef.current.setControlScheme('DRAG_STICK');
      cursorScreenRef.current = null;
      pressedKeysRef.current.clear();
      setControlScheme('DRAG_STICK');
      return;
    }

    if (controlSchemeRef.current === 'CURSOR_SPACE') {
      if (!isOnlineRef.current && configRef.current.local2P) return;
      const pt = getCanvasPoint(e);
      cursorScreenRef.current = pt;
      if (!hasUsedJoystick) setHasUsedJoystick(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== 'PLAYING') return;
    if (controlSchemeRef.current === 'CURSOR_SPACE') {
      if (!isOnlineRef.current && configRef.current.local2P) return;
      cursorScreenRef.current = getCanvasPoint(e);
      if (!hasUsedJoystick) setHasUsedJoystick(true);
    }
  };

  const handlePointerUp = () => {
    // Stationary TouchControls handles its own pointer capture & release
  };

  const handlePointerLeave = () => {
    if (controlSchemeRef.current !== 'CURSOR_SPACE') return;
    cursorScreenRef.current = null;
  };

  if (gameState === 'TITLE_MENU') {
    if (menuStep === 'MAP_SELECT') {
      return (
        <MapSelectScreen
          config={config}
          onSelectMap={setConfig}
          onConfirmAndLaunch={() => startSoloMatch(config)}
          onBack={() => setMenuStep('HUB')}
        />
      );
    }

    if (menuStep === 'COLOR_SELECT') {
      const isP2Color = Boolean(config.local2P && colorSelectSlot === 2);
      const isRightStickMenu = generalSettings.joystickPosition === 'RIGHT';
      return (
        <ColorSelectScreen
          config={config}
          selectedColorId={isP2Color ? config.player2ColorId ?? 'crimson' : config.playerColorId ?? 'cobalt'}
          playerSlotLabel={
            config.local2P
              ? isP2Color
                ? isRightStickMenu
                  ? 'P2 (Top-Left)'
                  : 'P2 (Top-Right)'
                : isRightStickMenu
                  ? 'P1 (Bottom-Right)'
                  : 'P1 (Bottom-Left)'
              : undefined
          }
          onSelectColor={(colorId) =>
            setConfig((prev) =>
              isP2Color ? { ...prev, player2ColorId: colorId } : { ...prev, playerColorId: colorId }
            )
          }
          onBack={() => setMenuStep('HUB')}
        />
      );
    }

    return (
      <TitleScreen
        config={config}
        generalSettings={generalSettings}
        initialRoomCode={initialRoomCode}
        onlineError={onlineError}
        onlineConnecting={onlineConnecting}
        onChangeConfig={setConfig}
        onChangeGeneralSettings={setGeneralSettings}
        onOpenMapSelect={() => setMenuStep('MAP_SELECT')}
        onOpenColorSelect={(slot) => {
          setColorSelectSlot(slot === 2 ? 2 : 1);
          setMenuStep('COLOR_SELECT');
        }}
        onStartSolo={() => startSoloMatch(config)}
        onCreateOnlineRoom={handleCreateOnlineRoom}
        onJoinOnlineRoom={handleJoinOnlineRoom}
      />
    );
  }

  if (gameState === 'ONLINE_LOBBY' && roomState) {
    return (
      <OnlineLobbyScreen
        room={roomState}
        generalSettings={generalSettings}
        errorMessage={onlineError}
        onUpdateConfig={(nextCfg) => clientRef.current?.updateRoomConfig(nextCfg)}
        onChangeGeneralSettings={setGeneralSettings}
        onUpdateColor={(colorId) => clientRef.current?.updatePlayerColor(colorId)}
        onSwapTeam={() => clientRef.current?.swapTeam()}
        onStartMatch={() => {
          requestLandscapeLock(true);
          clientRef.current?.startMatch();
        }}
        onLeave={handleLeaveOnline}
      />
    );
  }

  const activeConfig = isOnline && roomState ? roomState.config : config;
  const isRightStick = generalSettings.joystickPosition === 'RIGHT';
  const isLocal2P = !isOnline && Boolean(activeConfig.local2P);
  const local2PBots = !isLocal2P || activeConfig.local2PIncludeBots !== false;
  const is2v2 = ((activeConfig.teamMode ?? snapshot.teamMode ?? 'FFA') === '2V2') && local2PBots;
  const isHost = isOnline && roomState ? roomState.mySlot === roomState.hostSlot : true;
  const localSlot = isOnline && roomState ? roomState.mySlot : 0;
  const localSnap = snapshot.players.find((p) => p.id === localSlot);
  const p2HumanSnap = isLocal2P ? snapshot.players.find((p) => p.id === 1) : undefined;
  const slot0Snap = snapshot.players.find((p) => p.id === 0);
  const slot2Snap = snapshot.players.find((p) => p.id === 2);
  const slot3Snap = snapshot.players.find((p) => p.id === 3);

  const team0List = snapshot.players.filter((p) => p.team === 0);
  const team1List = snapshot.players.filter((p) => p.team === 1);
  const p0 = is2v2 ? team0List[0] : slot0Snap;
  const p2 = is2v2 ? team0List[1] : slot2Snap;
  const p1 = is2v2 ? team1List[0] : snapshot.players.find((p) => p.id === 1);
  const p3 = is2v2 ? team1List[1] : slot3Snap;

  const teamAKills = team0List.reduce((sum, p) => sum + p.kills, 0);
  const teamBKills = team1List.reduce((sum, p) => sum + p.kills, 0);

  return (
    <div className="h-dvh w-screen flex flex-col bg-[#0B1120] overflow-hidden">
      {/* Desktop Top Bar (hidden on phone/tablet for full-screen landscape play) */}
      <header className="hidden lg:flex h-14 shrink-0 border-b border-slate-800/90 bg-[#0F172A] px-6 items-center justify-between gap-3">
        <span className="font-display text-lg font-extrabold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
          Trickshot Tussle
        </span>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap">
          {isOnline && roomState && (
            <>
              <span className="font-mono-tabular font-semibold text-sky-400">
                Room {roomState.code}
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          {is2v2 && (
            <>
              <span className="font-mono-tabular font-bold text-sky-300">A {teamAKills}</span>
              <span className="text-slate-600">vs</span>
              <span className="font-mono-tabular font-bold text-rose-300">B {teamBKills}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>
            {activeConfig.mode === 'BRAWL'
              ? is2v2
                ? `2v2 · First to ${activeConfig.targetKills} KOs`
                : `First to ${activeConfig.targetKills} KOs`
              : is2v2
                ? '2v2 Last Team Standing'
                : 'Last Standing'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{ARENA_MAPS[activeConfig.mapId].name}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular text-slate-200 font-semibold">
            {formatClock(snapshot.elapsedTime)}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center rounded-lg border border-slate-800 bg-slate-900 p-0.5">
            <button
              type="button"
              onClick={() => switchControlScheme('CURSOR_SPACE')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                controlScheme === 'CURSOR_SPACE'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isLocal2P ? '2P Keys' : 'WASD + Aim'}
            </button>
            <button
              type="button"
              onClick={() => switchControlScheme('DRAG_STICK')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                controlScheme === 'DRAG_STICK'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isLocal2P ? 'Diagonal Sticks' : 'Drag Stick'}
            </button>
          </div>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {!isOnline ? (
            <button
              type="button"
              onClick={togglePause}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {gameState === 'PAUSED' ? (
                <Play className="w-3.5 h-3.5" />
              ) : (
                <Pause className="w-3.5 h-3.5" />
              )}
              <span>{gameState === 'PAUSED' ? 'Resume' : 'Pause'}</span>
            </button>
          ) : (
            <>
              {isHost && (
                <button
                  type="button"
                  onClick={openHostLobbyMenu}
                  title="Return all players to the lobby"
                  className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Lobby</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleLeaveOnline}
                className="h-9 px-3 inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Leave Room
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Arena Stage with Side Health Bars */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row items-stretch p-0 lg:p-4 lg:gap-3">
        {/* Left Side Health Bars (Desktop) */}
        <aside className="hidden lg:flex w-56 shrink-0 flex-col justify-between gap-4 py-1">
          {p0 ? (
            <PlayerHealthBar
              player={p0}
              mode={activeConfig.mode}
              targetKills={activeConfig.targetKills}
              align="left"
            />
          ) : (
            <div />
          )}
          <div className="rounded-xl border border-slate-800/80 bg-[#0F172A]/80 p-3.5 text-xs text-slate-400 space-y-2">
            <div className="font-semibold text-slate-200">
              {controlScheme === 'CURSOR_SPACE'
                ? isLocal2P
                  ? '2P Keyboard Controls'
                  : 'WASD + Aim'
                : isLocal2P
                  ? 'Diagonal Touch Sticks'
                  : 'Touch Stick'}
            </div>
            {controlScheme === 'CURSOR_SPACE' ? (
              isLocal2P ? (
                <>
                  <p className="leading-relaxed">
                    <span className="font-semibold text-sky-300">P1:</span>{' '}
                    <span className="font-semibold text-slate-200">WASD</span> (Left Shift creep),{' '}
                    <span className="font-semibold text-slate-200">Space</span> shoot.
                  </p>
                  <p className="leading-relaxed">
                    <span className="font-semibold text-rose-300">P2:</span>{' '}
                    <span className="font-semibold text-slate-200">Arrows</span> (Right Shift creep),{' '}
                    <span className="font-semibold text-slate-200">Enter / /</span> shoot.
                  </p>
                </>
              ) : (
                <>
                  <p className="leading-relaxed">
                    Move with <span className="font-semibold text-slate-200">WASD</span> or Arrows (hold <span className="font-semibold text-slate-200">Shift</span> to creep).
                  </p>
                  <p className="leading-relaxed">
                    Aim 360° with your cursor and press <span className="font-semibold text-slate-200">Spacebar</span> to shoot.
                  </p>
                  {activeConfig.mapId === 'library' && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-amber-200">Walk Speed Cap</span>
                        <span
                          className={`font-mono-tabular font-bold ${
                            pcSpeedLimit >= 100
                              ? 'text-rose-300'
                              : pcSpeedLimit >= 80
                                ? 'text-amber-300'
                                : 'text-emerald-300'
                          }`}
                        >
                          {pcSpeedLimit}% {pcSpeedLimit < 80 ? 'Silent' : pcSpeedLimit < 100 ? 'Risk' : 'Loud'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={35}
                        max={100}
                        step={1}
                        value={pcSpeedLimit}
                        onChange={(e) => updatePcSpeedLimit(Number(e.target.value))}
                        aria-label="PC Walk Speed Percentage"
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono-tabular">
                        <span>35%</span>
                        <span className="text-emerald-400/90 font-semibold">80% Safe</span>
                        <span>100%</span>
                      </div>
                    </div>
                  )}
                </>
              )
            ) : isLocal2P ? (
              <>
                <p className="leading-relaxed">
                  <span className="font-semibold text-sky-300">P1</span> uses{' '}
                  {isRightStick ? 'Bottom-Right' : 'Bottom-Left'} stick;{' '}
                  <span className="font-semibold text-rose-300">P2</span> uses{' '}
                  {isRightStick ? 'Top-Left' : 'Top-Right'} stick.
                </p>
                <p className="leading-relaxed">
                  Drag to move &amp; aim, release to shoot.
                </p>
              </>
            ) : (
              <>
                <p className="leading-relaxed">
                  Use the stationary {isRightStick ? 'right' : 'left'} joystick to move &amp; aim. Speed scales smoothly by thumb distance.
                </p>
                <p className="leading-relaxed">
                  Release the joystick to shoot.
                </p>
              </>
            )}
          </div>
          {p2 ? (
            <PlayerHealthBar
              player={p2}
              mode={activeConfig.mode}
              targetKills={activeConfig.targetKills}
              align="left"
            />
          ) : (
            <div />
          )}
        </aside>

        {/* Center Game Canvas (Full-Screen on Mobile/Tablet) */}
        <div
          ref={stageRef}
          className="relative flex-1 min-w-0 min-h-0 rounded-none lg:rounded-2xl border-0 lg:border border-slate-800 bg-[#070B14] overflow-hidden"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            className={`arena-canvas block w-full h-full ${
              controlScheme === 'CURSOR_SPACE' ? 'cursor-none' : 'cursor-crosshair'
            }`}
          />

          {/* Compact Floating Top-Center Utility Controls on Mobile/Landscape */}
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 lg:hidden z-20">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute sound' : 'Mute sound'}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-slate-950/55 text-slate-200 hover:bg-slate-900/80 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            {!isOnline ? (
              <button
                type="button"
                onClick={togglePause}
                aria-label={gameState === 'PAUSED' ? 'Resume match' : 'Pause match'}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-slate-950/55 text-slate-100 hover:bg-slate-900/80 transition-colors cursor-pointer"
              >
                {gameState === 'PAUSED' ? (
                  <Play className="w-3.5 h-3.5" />
                ) : (
                  <Pause className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <>
                {isHost && (
                  <button
                    type="button"
                    onClick={openHostLobbyMenu}
                    aria-label="Return to lobby"
                    title="Host Options: Return to Lobby"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-slate-950/60 border border-amber-400/35 text-amber-300 hover:bg-slate-900/85 transition-colors cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLeaveOnline}
                  className="h-8 px-2.5 inline-flex items-center rounded-lg bg-slate-950/55 text-[11px] font-semibold text-slate-200 hover:bg-slate-900/80 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Leave
                </button>
              </>
            )}
          </div>

          {/* Borderless Thin Overlay Health Bars at Screen Edges for Phone/Landscape */}
          {isLocal2P ? (
            <>
              {/* P1 + optional Bot 3 HUD (automatically clears P1 & P2 diagonal sticks) */}
              <div
                style={
                  isRightStick
                    ? {
                        bottom: 'max(0.5rem, env(safe-area-inset-bottom))',
                        left: 'max(0.75rem, env(safe-area-inset-left))',
                      }
                    : {
                        top: 'max(0.375rem, env(safe-area-inset-top))',
                        left: 'max(0.75rem, env(safe-area-inset-left))',
                      }
                }
                className={`pointer-events-none absolute flex ${
                  isRightStick ? 'flex-col-reverse' : 'flex-col'
                } gap-1.5 w-28 sm:w-36 lg:hidden z-10`}
              >
                {slot0Snap && (
                  <PlayerHealthBar
                    player={slot0Snap}
                    mode={activeConfig.mode}
                    targetKills={activeConfig.targetKills}
                    align="left"
                    compact
                  />
                )}
                {slot2Snap && (
                  <PlayerHealthBar
                    player={slot2Snap}
                    mode={activeConfig.mode}
                    targetKills={activeConfig.targetKills}
                    align="left"
                    compact
                  />
                )}
              </div>
              {/* P2 + optional Bot 4 HUD */}
              <div
                style={
                  isRightStick
                    ? {
                        top: 'max(0.375rem, env(safe-area-inset-top))',
                        right: 'max(0.75rem, env(safe-area-inset-right))',
                      }
                    : {
                        bottom: 'max(0.5rem, env(safe-area-inset-bottom))',
                        right: 'max(0.75rem, env(safe-area-inset-right))',
                      }
                }
                className={`pointer-events-none absolute flex ${
                  isRightStick ? 'flex-col' : 'flex-col-reverse'
                } gap-1.5 w-28 sm:w-36 lg:hidden z-10`}
              >
                {p2HumanSnap && (
                  <PlayerHealthBar
                    player={p2HumanSnap}
                    mode={activeConfig.mode}
                    targetKills={activeConfig.targetKills}
                    align="right"
                    compact
                  />
                )}
                {slot3Snap && (
                  <PlayerHealthBar
                    player={slot3Snap}
                    mode={activeConfig.mode}
                    targetKills={activeConfig.targetKills}
                    align="right"
                    compact
                  />
                )}
              </div>
            </>
          ) : (
            <div
              style={{
                top: 'max(0.375rem, env(safe-area-inset-top))',
                left: 'max(0.75rem, env(safe-area-inset-left))',
                right: 'max(0.75rem, env(safe-area-inset-right))',
              }}
              className="pointer-events-none absolute flex items-start justify-between gap-2 lg:hidden z-10"
            >
              <div className="flex flex-col gap-1.5 w-28 sm:w-36">
                {p0 && (
                  <PlayerHealthBar
                    player={p0}
                    mode={activeConfig.mode}
                    targetKills={activeConfig.targetKills}
                    align="left"
                    compact
                  />
                )}
                {p2 && (
                  <PlayerHealthBar
                    player={p2}
                    mode={activeConfig.mode}
                    targetKills={activeConfig.targetKills}
                    align="left"
                    compact
                  />
                )}
              </div>
              <div className="flex flex-col gap-1.5 w-28 sm:w-36">
                {p1 && (
                  <PlayerHealthBar
                    player={p1}
                    mode={activeConfig.mode}
                    targetKills={activeConfig.targetKills}
                    align="right"
                    compact
                  />
                )}
                {p3 && (
                  <PlayerHealthBar
                    player={p3}
                    mode={activeConfig.mode}
                    targetKills={activeConfig.targetKills}
                    align="right"
                    compact
                  />
                )}
              </div>
            </div>
          )}

          {/* Transparent Side-Edge Kill Popup (Private to the player who scored the kill) */}
          {killStreak &&
            (gameState === 'PLAYING' || (gameState === 'GAME_OVER' && killStreak.mode === 'ELIMINATION')) &&
            (() => {
              const remainingMs = Math.max(0, killStreak.expiresAt - streakNow);
              const isElimination = killStreak.mode === 'ELIMINATION';
              const pct = Math.max(0, Math.min(100, (remainingMs / killStreak.durationMs) * 100));
              const count = killStreak.count;

              const fires = isElimination
                ? count >= 3
                  ? '🔥🔥🔥👑'
                  : count === 2
                    ? '🔥🔥'
                    : '🔥'
                : count >= 4
                  ? '🔥🔥🔥'
                  : count === 3
                    ? '🔥🔥'
                    : '🔥';

              const headlineText = isElimination
                ? count >= 3
                  ? 'SOLO ACE!'
                  : count === 2
                    ? 'RAMPAGE!'
                    : 'KILL!'
                : `${count}x ${
                    count >= 6
                      ? 'GODLIKE'
                      : count === 5
                        ? 'UNSTOPPABLE'
                        : count === 4
                          ? 'RAMPAGE'
                          : count === 3
                            ? 'TRIPLE STREAK'
                            : 'DOUBLE KILL'
                  }`;

              const subCaption = isElimination
                ? count >= 3
                  ? 'ALL 3 RIVALS ELIMINATED'
                  : count === 2
                    ? '2 ELIMINATED'
                    : '1 ELIMINATED'
                : null;

              const tierColor = isElimination
                ? count >= 3
                  ? 'text-amber-200'
                  : count === 2
                    ? 'text-orange-300'
                    : 'text-yellow-200'
                : count >= 5
                  ? 'text-rose-300'
                  : count >= 4
                    ? 'text-orange-300'
                    : count === 3
                      ? 'text-amber-300'
                      : 'text-yellow-200';

              const actorPrefix =
                isLocal2P && killStreak.playerId !== undefined
                  ? `${killStreak.playerId === 1 ? 'P2' : 'P1'} · `
                  : '';

              return (
                <div
                  style={isLocal2P ? undefined : { right: 'max(0.75rem, env(safe-area-inset-right))' }}
                  className={
                    isLocal2P
                      ? 'pointer-events-none select-none absolute top-11 left-1/2 -translate-x-1/2 lg:left-auto lg:translate-x-0 lg:right-4 lg:top-4 z-40 flex flex-col items-center text-center lg:items-end lg:text-right'
                      : 'pointer-events-none select-none absolute top-[4.65rem] sm:top-[5.15rem] lg:top-4 lg:right-4 z-40 flex flex-col items-end text-right'
                  }
                >
                  <div className="flex items-baseline gap-1.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
                    <span className="text-sm sm:text-base leading-none">{fires}</span>
                    <span className={`font-display text-xs sm:text-sm font-black tracking-wide uppercase ${tierColor}`}>
                      {actorPrefix}
                      {headlineText}
                    </span>
                  </div>
                  {isElimination ? (
                    <span className="mt-0.5 font-mono-tabular text-[10px] font-bold tracking-wider text-sky-200/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                      {subCaption}
                    </span>
                  ) : (
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="font-mono-tabular text-[10px] font-bold text-amber-200/95 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                        {(remainingMs / 1000).toFixed(1)}s
                      </span>
                      <div className="h-1.5 w-24 sm:w-32 overflow-hidden rounded-full bg-white/15">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-yellow-300 via-orange-500 to-rose-500 transition-[width] duration-75 ease-linear"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

          {/* Transparent Funny Self-Kill Popup (own bullet bounce KO) */}
          {selfKillPopup && (gameState === 'PLAYING' || gameState === 'GAME_OVER') && (
            <div
              style={isLocal2P ? undefined : { right: 'max(0.75rem, env(safe-area-inset-right))' }}
              className={
                isLocal2P
                  ? `pointer-events-none select-none absolute ${
                      killStreak ? 'top-20 lg:top-16' : 'top-11 lg:top-4'
                    } left-1/2 -translate-x-1/2 lg:left-auto lg:translate-x-0 lg:right-4 z-40 flex flex-col items-center text-center lg:items-end lg:text-right animate-bounce`
                  : `pointer-events-none select-none absolute ${
                      killStreak ? 'top-[7.2rem] sm:top-[7.8rem] lg:top-16' : 'top-[4.65rem] sm:top-[5.15rem] lg:top-4'
                    } lg:right-4 z-40 flex flex-col items-end text-right animate-bounce`
              }
            >
              <div className="flex items-baseline gap-1.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
                <span className="text-sm sm:text-base leading-none">🤡💀</span>
                <span className="font-display text-xs sm:text-sm font-black tracking-wide uppercase text-pink-300">
                  {isLocal2P && selfKillPopup.playerId !== undefined
                    ? `${selfKillPopup.playerId === 1 ? 'P2' : 'P1'} · `
                    : ''}
                  OOPS! SHOT YOURSELF!
                </span>
              </div>
              <span className="mt-0.5 font-mono-tabular text-[10px] font-bold tracking-wider text-amber-200/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                OWN TRICKSHOT KO
              </span>
            </div>
          )}

          {/* Stationary Joystick(s): Left or Right setting (plus diagonal P2 in Offline 2P) */}
          {controlScheme === 'DRAG_STICK' && gameState === 'PLAYING' && !isLandscapeBlocked && (
            <>
              <TouchControls
                position={isRightStick ? 'bottom-right' : 'bottom-left'}
                playerLabel={isLocal2P ? 'P1' : undefined}
                ammo={localSnap?.ammo ?? 0}
                stunned={(localSnap?.stunTimer ?? 0) > 0}
                alive={localSnap?.alive ?? true}
                playerColor={localSnap?.color}
                playerAccentColor={localSnap?.accentColor}
                playerFinish={localSnap?.finish}
                onStickChange={(active, angle, magnitude) => {
                  sound.unlock();
                  if (!hasUsedJoystick) setHasUsedJoystick(true);
                  if (isOnlineRef.current) {
                    onlineJoystickRef.current.active = active;
                    onlineJoystickRef.current.angle = angle;
                    onlineJoystickRef.current.magnitude = magnitude;
                    clientRef.current?.sendJoystickInput(active, angle, magnitude);
                  } else {
                    engineRef.current.setJoystickVector(active, angle, magnitude);
                  }
                }}
                onStickRelease={() => {
                  sound.unlock();
                  if (!hasUsedJoystick) setHasUsedJoystick(true);
                  if (isOnlineRef.current) {
                    clientRef.current?.sendJoystickRelease();
                  } else {
                    engineRef.current.firePlayerShot(0);
                  }
                }}
              />
              {isLocal2P && p2HumanSnap && (
                <TouchControls
                  position={isRightStick ? 'top-left' : 'top-right'}
                  playerLabel="P2"
                  ammo={p2HumanSnap.ammo}
                  stunned={p2HumanSnap.stunTimer > 0}
                  alive={p2HumanSnap.alive}
                  playerColor={p2HumanSnap.color}
                  playerAccentColor={p2HumanSnap.accentColor}
                  playerFinish={p2HumanSnap.finish}
                  onStickChange={(active, angle, magnitude) => {
                    sound.unlock();
                    if (!hasUsedJoystick) setHasUsedJoystick(true);
                    engineRef.current.setJoystick2Vector(active, angle, magnitude);
                  }}
                  onStickRelease={() => {
                    sound.unlock();
                    if (!hasUsedJoystick) setHasUsedJoystick(true);
                    engineRef.current.firePlayerShot(1);
                  }}
                />
              )}
            </>
          )}

          {!hasUsedJoystick && gameState === 'PLAYING' && controlScheme === 'CURSOR_SPACE' && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-slate-700/80 bg-slate-950/85 px-4 py-2 text-xs font-medium text-slate-200 whitespace-nowrap shadow-lg">
              {isLocal2P
                ? 'P1: WASD + Space · P2: Arrows + Enter (or /)'
                : activeConfig.mapId === 'library'
                  ? 'WASD to move (Shift or <80% slider to sneak) · [E] Collect/Unlock · Spacebar to shoot'
                  : 'WASD to move (Shift to creep) · Cursor to aim · Spacebar to shoot'}
            </div>
          )}

          {/* Compact PC Walk-Speed Slider on <lg screens in Library CURSOR_SPACE mode */}
          {activeConfig.mapId === 'library' &&
            controlScheme === 'CURSOR_SPACE' &&
            gameState === 'PLAYING' &&
            (libraryUi?.state.introTimer ?? LIBRARY_INTRO_DURATION) <= 0 && (
              <div className="lg:hidden pointer-events-auto absolute bottom-3 left-3 z-20 w-48 rounded-xl border border-amber-500/35 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-200 shadow-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-amber-200">Walk Cap</span>
                  <span className="font-mono-tabular font-bold text-emerald-300">
                    {pcSpeedLimit}%
                  </span>
                </div>
                <input
                  type="range"
                  min={35}
                  max={100}
                  step={1}
                  value={pcSpeedLimit}
                  onChange={(e) => updatePcSpeedLimit(Number(e.target.value))}
                  aria-label="PC Walk Speed Percentage"
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            )}

          {/* Library HUD, Collect/Unlock Prompt, PC Stealth & Spectate, & Semi-Transparent 5-Wheel Padlock */}
          {activeConfig.mapId === 'library' &&
            libraryUi &&
            libraryUi.state.introTimer <= 0 &&
            (gameState === 'PLAYING' || gameState === 'GAME_OVER') && (
              <LibraryOverlays
                libraryState={libraryUi.state}
                localPlayerId={localSlot}
                mode={activeConfig.mode}
                isOnline={isOnline}
                isCursorScheme={controlScheme === 'CURSOR_SPACE'}
                stealthEnabled={pcSpeedLimit < 80}
                playerFloor={libraryUi.playerFloor}
                playerSpeed={libraryUi.playerSpeed}
                playerMaxSpeed={
                  PLAYER_MAX_SPEED *
                  (PLAYER_SPEED_MULTS[activeConfig.modifiers?.playerSpeed ?? 'MEDIUM'] ?? 1)
                }
                figureDifficulty={activeConfig.modifiers?.figureDifficulty}
                playerAlive={libraryUi.playerAlive}
                canCollectBook={libraryUi.canCollectBook}
                canUnlockDoor={libraryUi.canUnlockDoor}
                lockOpen={libraryLockOpen}
                lockErrorSeq={lockErrorSeq}
                spectateTargetName={
                  libraryUi.spectateCandidates.find((c) => c.id === spectateTargetId)?.name ??
                  libraryUi.spectateCandidates[0]?.name ??
                  null
                }
                spectateCount={libraryUi.spectateCandidates.length}
                onToggleStealth={togglePcStealth}
                onCycleSpectate={(delta) => {
                  const list = libraryUi.spectateCandidates;
                  if (list.length === 0) return;
                  const idx = Math.max(0, list.findIndex((c) => c.id === spectateTargetId));
                  const next = list[(idx + delta + list.length) % list.length];
                  setSpectateTargetId(next.id);
                }}
                onFinishSoloMatch={() => {
                  if (!isOnline) {
                    engineRef.current.finishSoloLibrary();
                    if (engineRef.current.winnerId !== null) {
                      setSnapshot(engineRef.current.getSnapshot(0));
                      setLibraryLockOpen(false);
                      setGameState('GAME_OVER');
                    }
                  }
                }}
                onCollectBook={() => {
                  sound.unlock();
                  if (isOnlineRef.current) {
                    clientRef.current?.sendCollectBook();
                  } else {
                    engineRef.current.collectNearbyBook(0);
                  }
                }}
                onOpenLock={() => {
                  sound.unlock();
                  setLibraryLockPlayerId(0);
                  setLibraryLockOpen(true);
                }}
                onCloseLock={() => setLibraryLockOpen(false)}
                onDialDigit={(idx, nextDigit) => {
                  sound.unlock();
                  if (isOnlineRef.current) {
                    clientRef.current?.sendLockDial(idx, nextDigit);
                  } else {
                    engineRef.current.setDoorDialDigit(0, idx, nextDigit);
                  }
                }}
                onSubmitCode={(digits) => {
                  sound.unlock();
                  if (isOnlineRef.current) {
                    clientRef.current?.sendSubmitDoorCode(digits);
                  } else if (engineRef.current.submitDoorCode(0, digits)) {
                    setLibraryLockOpen(false);
                  }
                }}
              />
            )}

          {/* Universal Immersive Spectating Strip (Wooden Mansion & Emerald Grove Elimination) */}
          {activeConfig.mapId !== 'library' &&
            ARENA_MAPS[activeConfig.mapId].immersive &&
            gameState === 'PLAYING' &&
            (isLocal2P ? !localSnap?.alive && !p2HumanSnap?.alive : !localSnap?.alive) &&
            immersiveSpectateList.length > 0 && (
              <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/85 px-3 py-2 text-xs text-slate-100 shadow-xl">
                <div className="flex items-center gap-1.5 pr-1">
                  <Eye className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="font-semibold text-slate-200 whitespace-nowrap">
                    Eliminated
                  </span>
                </div>
                <div className="flex items-center gap-1 border-l border-slate-700/80 pl-2">
                  <button
                    type="button"
                    onClick={() => {
                      const list = immersiveSpectateList;
                      if (list.length === 0) return;
                      const idx = Math.max(0, list.findIndex((c) => c.id === spectateTargetId));
                      const next = list[(idx - 1 + list.length) % list.length];
                      spectateTargetIdRef.current = next.id;
                      setSpectateTargetId(next.id);
                    }}
                    aria-label="Previous player camera"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-200 cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1.5 font-mono-tabular text-[11px] font-bold text-sky-200 whitespace-nowrap">
                    {`Watching ${
                      immersiveSpectateList.find((c) => c.id === spectateTargetId)?.name ??
                      immersiveSpectateList[0].name
                    }`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const list = immersiveSpectateList;
                      if (list.length === 0) return;
                      const idx = Math.max(0, list.findIndex((c) => c.id === spectateTargetId));
                      const next = list[(idx + 1) % list.length];
                      spectateTargetIdRef.current = next.id;
                      setSpectateTargetId(next.id);
                    }}
                    aria-label="Next player camera"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-200 cursor-pointer shrink-0"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

          {/* Brief crimson-orange Figure Jumpscare flash when caught */}
          {jumpscareFlash && (
            <div className="pointer-events-none absolute inset-0 z-40 bg-gradient-to-b from-orange-600/45 via-red-950/30 to-black/70 animate-pulse" />
          )}

          {/* 5-Second Black DOORS-Inspired Library Loading Screen */}
          {activeConfig.mapId === 'library' &&
            gameState === 'PLAYING' &&
            (libraryUi?.state.introTimer ?? LIBRARY_INTRO_DURATION) > 0 && (
              <LibraryLoadingScreen
                introTimer={libraryUi?.state.introTimer ?? LIBRARY_INTRO_DURATION}
                figureDifficulty={activeConfig.modifiers?.figureDifficulty}
              />
            )}
        </div>

        {/* Right Side Health Bars (Desktop) */}
        <aside className="hidden lg:flex w-56 shrink-0 flex-col justify-between gap-4 py-1">
          {p1 ? (
            <PlayerHealthBar
              player={p1}
              mode={activeConfig.mode}
              targetKills={activeConfig.targetKills}
              align="right"
            />
          ) : (
            <div />
          )}
          <div className="rounded-xl border border-slate-800/80 bg-[#0F172A]/80 p-3.5 text-xs text-slate-400 space-y-2">
            <div className="font-semibold text-slate-200">Arena Objects</div>
            <div className="flex items-center justify-between">
              <span className="text-yellow-300">Bullet Hit</span>
              <span className="font-mono-tabular text-slate-300">-33 HP · Stun</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-lime-400">Nitro Crate</span>
              <span className="font-mono-tabular text-slate-300">-33 HP · Blast</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-red-400">TNT (3s)</span>
              <span className="font-mono-tabular text-slate-300">-45 HP · Shoot Fuse</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-amber-400">Cardboard</span>
              <span className="font-mono-tabular text-slate-300">Push · 1-Hit Cover</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-emerald-400">Medkit</span>
              <span className="font-mono-tabular text-slate-300">+35 HP</span>
            </div>
          </div>
          {p3 ? (
            <PlayerHealthBar
              player={p3}
              mode={activeConfig.mode}
              targetKills={activeConfig.targetKills}
              align="right"
            />
          ) : (
            <div />
          )}
        </aside>
      </main>

      {/* Host Return-to-Lobby Confirmation Overlay (Online Host Only) */}
      {hostLobbyConfirmOpen && isOnline && isHost && gameState === 'PLAYING' && (
        <div
          onClick={() => setHostLobbyConfirmOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-700/80 bg-[#111A2C] p-6 shadow-2xl"
          >
            <h2 className="font-display text-xl font-bold text-slate-50">
              Return Everyone to Lobby?
            </h2>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
              {ARENA_MAPS[activeConfig.mapId].name} · {formatClock(snapshot.elapsedTime)} elapsed.
              This ends the live match for all players and brings the room straight back to the lobby.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setHostLobbyConfirmOpen(false)}
                className="w-full rounded-xl bg-sky-400 hover:bg-sky-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors cursor-pointer"
              >
                Keep Playing
              </button>
              <button
                type="button"
                onClick={confirmReturnToLobby}
                className="w-full rounded-xl border border-amber-500/45 bg-amber-500/20 hover:bg-amber-500/30 px-4 py-2.5 text-sm font-bold text-amber-200 transition-colors cursor-pointer"
              >
                Return All to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Overlay (Solo only) */}
      {gameState === 'PAUSED' && !isOnline && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700/80 bg-[#111A2C] p-6 shadow-2xl">
            <h2 className="font-display text-2xl font-bold text-slate-50">Match Paused</h2>
            <p className="mt-1 text-xs text-slate-400">
              {ARENA_MAPS[activeConfig.mapId].name} · {formatClock(snapshot.elapsedTime)} elapsed
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={togglePause}
                className="w-full rounded-xl bg-sky-400 hover:bg-sky-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors cursor-pointer"
              >
                Resume Match
              </button>
              <button
                type="button"
                onClick={() => setPauseSettingsOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4 text-sky-400" />
                Settings
              </button>
              <button
                type="button"
                onClick={() => startSoloMatch()}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition-colors cursor-pointer"
              >
                Restart Match
              </button>
              <button
                type="button"
                onClick={() => {
                  setPauseSettingsOpen(false);
                  setGameState('TITLE_MENU');
                }}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Back to Setup
              </button>
            </div>
          </div>
        </div>
      )}

      {pauseSettingsOpen && gameState === 'PAUSED' && !isOnline && (
        <SettingsModal
          general={generalSettings}
          modifiers={activeConfig.modifiers ?? DEFAULT_MATCH_MODIFIERS}
          modifiersReadOnly
          onChangeGeneral={setGeneralSettings}
          onChangeModifiers={() => {}}
          onClose={() => setPauseSettingsOpen(false)}
        />
      )}

      {/* Game Over Modal */}
      {gameState === 'GAME_OVER' && (
        <GameOverModal
          snapshot={snapshot}
          isOnline={isOnline}
          isHost={isHost}
          onPlayAgain={() => {
            if (isOnline) {
              requestLandscapeLock(true);
              clientRef.current?.startMatch();
            } else {
              startSoloMatch();
            }
          }}
          onBackToMenu={() => {
            if (isOnline) {
              handleLeaveOnline();
            } else {
              setGameState('TITLE_MENU');
            }
          }}
          onReturnToLobby={isOnline ? () => clientRef.current?.returnToLobby() : undefined}
        />
      )}

      {/* Landscape-Only Enforcement Overlay During Gameplay */}
      {isLandscapeBlocked && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#060A14]/95 backdrop-blur-md p-6">
          <div className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-[#111A2C] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-14 w-14 rounded-2xl border border-amber-400/40 bg-amber-500/15 flex items-center justify-center">
              <RotateCw className="w-7 h-7 text-amber-300 animate-spin" style={{ animationDuration: '3.2s' }} />
            </div>
            <h2 className="font-display text-xl font-extrabold text-slate-50">
              Landscape Mode Only
            </h2>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              This game runs exclusively in landscape orientation while playing. Rotate your device sideways (or widen your window) to continue.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => requestLandscapeLock(true)}
                className="w-full rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2.5 text-sm font-extrabold text-slate-950 transition-colors cursor-pointer"
              >
                Switch to Landscape
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isOnline) {
                    handleLeaveOnline();
                  } else {
                    setPauseSettingsOpen(false);
                    setGameState('TITLE_MENU');
                  }
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                {isOnline ? 'Leave Online Room' : 'Back to Setup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
