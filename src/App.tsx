import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameOverModal } from './components/GameOverModal';
import { LibraryLoadingScreen } from './components/LibraryLoadingScreen';
import { LibraryOverlays } from './components/LibraryOverlays';
import { MapSelectScreen } from './components/MapSelectScreen';
import { OnlineLobbyScreen } from './components/OnlineLobbyScreen';
import { PlayerHealthBar } from './components/PlayerHealthBar';
import { TitleScreen } from './components/TitleScreen';
import { TouchControls } from './components/TouchControls';
import { ArenaEngine, canCollectBookSpot } from './game/engine';
import { ARENA_MAPS } from './game/maps';
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
  spectateCandidates: Array<{ id: number; name: string }>;
}

const DEFAULT_SOLO_CONFIG: MatchConfig = {
  mode: 'ELIMINATION',
  teamMode: 'FFA',
  mapId: 'crossroads',
  difficulty: 'TACTICAL',
  targetKills: 8,
  immersive: false,
  playerColorId: 'cobalt',
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
  listenerId = 0,
  onLocalKillStreak?: (streak: number, mode: MatchMode) => void,
  onLocalSelfKill?: () => void,
  listenerFloor: FloorLevel = 0,
  onLocalLockError?: () => void,
  onLocalMonsterKill?: () => void
) {
  const hasLocalEliminationClimax = events.some(
    (e) =>
      e.type === 'killstreak' &&
      e.mode === 'ELIMINATION' &&
      e.playerId !== undefined &&
      e.playerId === listenerId &&
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

      // Reload sound: full punch for the local player, subtle nearby audio, skip faraway bot reloads
      if (evt.type === 'pickup') {
        const isSelf = evt.value === listenerId || d < 95;
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
        case 'bounce':
          sound.playBounce(spatial, evt.value === 2 ? 'metal' : 'solid');
          break;
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
          if (evt.playerId === listenerId) {
            sound.playMonsterJumpscare();
            onLocalMonsterKill?.();
          } else {
            sound.playKnockout(spatial);
          }
          break;
        case 'book_collect':
          if (evt.playerId === listenerId) {
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
          if (evt.playerId === listenerId) {
            sound.playLockDial();
          }
          break;
        case 'lock_error':
          if (evt.playerId === listenerId) {
            sound.playLockError();
            onLocalLockError?.();
          }
          break;
        case 'door_unlock':
          sound.playDoorUnlock(spatial);
          break;
        case 'killstreak': {
          // Strictly private: audible and visible ONLY to the player who scored the kill
          if (evt.playerId !== undefined && evt.playerId === listenerId) {
            const count = evt.value ?? 1;
            const streakMode: MatchMode = evt.mode ?? 'BRAWL';
            sound.playKillStreak(count, streakMode);
            onLocalKillStreak?.(count, streakMode);
          }
          break;
        }
        case 'self_kill': {
          if (evt.playerId !== undefined && evt.playerId === listenerId) {
            sound.playSelfKill();
            onLocalSelfKill?.();
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

export default function App() {
  const initialRoomCode =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? ''
      : '';

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [menuStep, setMenuStep] = useState<'HUB' | 'MAP_SELECT'>('HUB');
  const [config, setConfig] = useState<MatchConfig>(DEFAULT_SOLO_CONFIG);
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
  } | null>(null);
  const [selfKillPopup, setSelfKillPopup] = useState<{ expiresAt: number } | null>(null);
  const [streakNow, setStreakNow] = useState<number>(0);

  const [pcSpeedLimit, setPcSpeedLimit] = useState<number>(100);
  const [spectateTargetId, setSpectateTargetId] = useState<number | null>(null);
  const [libraryLockOpen, setLibraryLockOpen] = useState<boolean>(false);
  const [lockErrorSeq, setLockErrorSeq] = useState<number>(0);
  const [jumpscareFlash, setJumpscareFlash] = useState<boolean>(false);
  const [libraryUi, setLibraryUi] = useState<LibraryUiSnapshot | null>(null);

  const engineRef = useRef<ArenaEngine>(new ArenaEngine(DEFAULT_SOLO_CONFIG));
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
  const gameStateRef = useRef<GameState>(gameState);
  const isOnlineRef = useRef<boolean>(isOnline);
  const roomStateRef = useRef<OnlineRoomState | null>(roomState);
  const controlSchemeRef = useRef<ControlScheme>(controlScheme);
  const pcSpeedLimitRef = useRef<number>(pcSpeedLimit);
  const spectateTargetIdRef = useRef<number | null>(spectateTargetId);
  const libraryLockOpenRef = useRef<boolean>(libraryLockOpen);
  const libraryUiRef = useRef<LibraryUiSnapshot | null>(libraryUi);
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

  useEffect(() => {
    libraryLockOpenRef.current = libraryLockOpen;
  }, [libraryLockOpen]);

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
          setKillStreak(null);
          setSelfKillPopup(null);
          setLibraryLockOpen(false);
          setLockErrorSeq(0);
          setSpectateTargetId(null);
          setLibraryUi(null);
          libraryUiRef.current = null;
          setGameState('ONLINE_LOBBY');
        } else if (room.phase === 'PLAYING') {
          if (room.config.mapId === 'library') {
            sound.preloadLibraryAudio();
          }
          cameraRef.current.initialized = false;
          setHasUsedJoystick(false);
          setKillStreak(null);
          setSelfKillPopup(null);
          setLibraryLockOpen(false);
          setLockErrorSeq(0);
          setSpectateTargetId(null);
          setLibraryUi(null);
          libraryUiRef.current = null;
          setGameState('PLAYING');
        } else if (room.phase === 'GAME_OVER') {
          setKillStreak((prev) => (prev?.mode === 'ELIMINATION' ? prev : null));
          setLibraryLockOpen(false);
          setGameState('GAME_OVER');
        }
      },
      onWorld: (world) => {
        onlineWorldRef.current = world;
        onlineLastSyncAtRef.current = performance.now();
        const mySlot = roomStateRef.current?.mySlot ?? 0;
        const me = world.players.find((p) => p.id === mySlot);
        if (world.events && world.events.length > 0) {
          playEngineEvents(
            world.events,
            me?.x,
            me?.y,
            mySlot,
            (streak, streakMode) => {
              const nowMs = performance.now();
              const durationMs = streakMode === 'ELIMINATION' ? 3400 : KILL_STREAK_WINDOW * 1000;
              setStreakNow(nowMs);
              setKillStreak({ count: streak, expiresAt: nowMs + durationMs, mode: streakMode, durationMs });
            },
            () => {
              setSelfKillPopup({ expiresAt: performance.now() + 2800 });
            },
            me?.floor ?? 0,
            () => setLockErrorSeq((prev) => prev + 1),
            triggerJumpscareFlash
          );
        }
        setSnapshot(worldToSnapshot(world, mySlot));
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
      const mapDef = ARENA_MAPS[baseCfg.mapId];
      const nextCfg: MatchConfig = {
        ...baseCfg,
        immersive: mapDef.immersive,
        extraDark: mapDef.immersive ? Boolean(baseCfg.extraDark) : false,
      };
      sound.unlock();
      if (nextCfg.mapId === 'library') {
        sound.preloadLibraryAudio();
      }
      setIsOnline(false);
      setRoomState(null);
      setMenuStep('HUB');
      cameraRef.current.initialized = false;
      engineRef.current.reset(nextCfg);
      engineRef.current.setControlScheme(controlSchemeRef.current);
      setSnapshot(engineRef.current.getSnapshot(0));
      setHasUsedJoystick(false);
      setKillStreak(null);
      setSelfKillPopup(null);
      setLibraryLockOpen(false);
      setLockErrorSeq(0);
      setSpectateTargetId(null);
      setJumpscareFlash(false);
      setLibraryUi(null);
      libraryUiRef.current = null;
      setGameState('PLAYING');
    },
    [config]
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

  const togglePause = useCallback(() => {
    if (isOnlineRef.current) return;
    setGameState((prev) => {
      if (prev === 'PLAYING') {
        engineRef.current.releaseJoystick();
        engineRef.current.setHumanCursorInput(false, 0, 0);
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

      if (gameStateRef.current !== 'PLAYING') return;

      if (e.code === 'KeyC' && !e.repeat && controlSchemeRef.current === 'CURSOR_SPACE') {
        const libUi = libraryUiRef.current;
        if (libUi && libUi.state.introTimer <= 0 && libUi.playerAlive) {
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

      if (e.code === 'Space') {
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

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('blur', onBlur);
    };
  }, [togglePause, togglePcStealth]);

  // High-DPI Canvas ResizeObserver
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const updateSize = () => {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(100, Math.floor(rect.width));
      const height = Math.max(100, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

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
        if (gameStateRef.current === 'PLAYING') {
          engine.update(dt);
          const evts = engine.drainEvents();
          if (evts.length > 0) {
            const human = engine.players[0];
            playEngineEvents(
              evts,
              human?.x,
              human?.y,
              0,
              (streak, streakMode) => {
                const nowMs = performance.now();
                const durationMs = streakMode === 'ELIMINATION' ? 3400 : KILL_STREAK_WINDOW * 1000;
                setStreakNow(nowMs);
                setKillStreak({ count: streak, expiresAt: nowMs + durationMs, mode: streakMode, durationMs });
              },
              () => {
                setSelfKillPopup({ expiresAt: performance.now() + 2800 });
              },
              human?.floor ?? 0,
              () => setLockErrorSeq((prev) => prev + 1),
              triggerJumpscareFlash
            );
          }
          if (engine.winnerId !== null) {
            setSnapshot(engine.getSnapshot(0));
            setLibraryLockOpen(false);
            setGameState('GAME_OVER');
          }
        }

        hudAccumulator += dt;
        if (hudAccumulator >= 0.08) {
          hudAccumulator = 0;
          setSnapshot(engine.getSnapshot(0));
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

      // Sync Library HUD / proximity / spectate targets / audio track availability cleanly
      if (worldToRender && worldToRender.mapId === 'library' && worldToRender.libraryState) {
        const libState = worldToRender.libraryState;
        const libWalls = ARENA_MAPS[worldToRender.mapId].walls;
        const localP = worldToRender.players.find((p) => p.id === localId);
        const pFloor = (localP?.floor ?? 0) as FloorLevel;
        const pSpeed = localP ? Math.hypot(localP.vx ?? 0, localP.vy ?? 0) : 0;
        const pAlive = Boolean(localP?.alive);
        const prog = libState.playerProgress.find((pp) => pp.playerId === localId);
        const door = libState.doors.find((d) => d.playerId === localId);

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

        const spectateCandidates = worldToRender.players
          .filter((p) => p.id !== localId && p.alive)
          .map((p) => ({ id: p.id, name: p.name }));

        if (!pAlive && (prog?.unlocked || prog?.eliminated)) {
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

        if (!pAlive && libraryLockOpenRef.current) {
          setLibraryLockOpen(false);
        }

        const nextLibUi: LibraryUiSnapshot = {
          state: libState,
          playerFloor: pFloor,
          playerSpeed: pSpeed,
          playerAlive: pAlive,
          canCollectBook,
          canUnlockDoor,
          spectateCandidates,
        };
        const prevUi = libraryUiRef.current;
        libraryUiRef.current = nextLibUi;

        libHudAccumulator += dt;
        const stateFlipped =
          !prevUi ||
          prevUi.canCollectBook !== canCollectBook ||
          prevUi.canUnlockDoor !== canUnlockDoor ||
          (prevUi.state.introTimer > 0 && libState.introTimer <= 0) ||
          prevUi.state.playerProgress.find((pp) => pp.playerId === localId)?.collectedCount !==
            prog?.collectedCount ||
          prevUi.playerFloor !== pFloor ||
          prevUi.playerAlive !== pAlive ||
          prevUi.spectateCandidates.length !== spectateCandidates.length;

        if (stateFlipped || libHudAccumulator >= 0.08) {
          libHudAccumulator = 0;
          setLibraryUi(nextLibUi);
        }
      } else if (libraryUiRef.current !== null) {
        libraryUiRef.current = null;
        setLibraryUi(null);
      }

      // WASD / Arrow movement + Shift slow-walk (or PC Speed Slider in Library) + 360-degree pure cursor aim
      const { width, height } = canvasSizeRef.current;
      if (
        gameStateRef.current === 'PLAYING' &&
        controlSchemeRef.current === 'CURSOR_SPACE' &&
        worldToRender
      ) {
        const localP = worldToRender.players.find((p) => p.id === localId);
        if (localP && localP.alive) {
          const keys = pressedKeysRef.current;
          let kx = 0;
          let ky = 0;
          if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
          if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
          if (keys.has('KeyW') || keys.has('ArrowUp')) ky -= 1;
          if (keys.has('KeyS') || keys.has('ArrowDown')) ky += 1;

          const moving = kx !== 0 || ky !== 0;
          const moveAngle = moving ? Math.atan2(ky, kx) : localP.angle;
          const shiftHeld = keys.has('ShiftLeft') || keys.has('ShiftRight');
          const maxPct = worldToRender.mapId === 'library' ? pcSpeedLimitRef.current / 100 : 1.0;
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

      if (worldToRender) {
        const isLibrary = worldToRender.mapId === 'library';
        const isImmersivePlaying =
          gameStateRef.current === 'PLAYING' &&
          (worldToRender.immersive || ARENA_MAPS[worldToRender.mapId].immersive);
        const isNormalPlaying =
          gameStateRef.current === 'PLAYING' &&
          !(worldToRender.immersive || ARENA_MAPS[worldToRender.mapId].immersive);
        const extraDark = Boolean(worldToRender.extraDark);
        // Never emit synthetic atmospheric/BGM drone in The Library; use Unhinged player + SFX only
        sound.setImmersiveAmbient(isImmersivePlaying && !isLibrary, extraDark);

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
        sound.updateNormalMusic(
          dt,
          isNormalPlaying,
          normalTension,
          ARENA_MAPS[worldToRender.mapId].floorTheme
        );

        const listener = worldToRender.players.find((p) => p.id === localId);
        sound.updateImmersiveFootsteps(
          dt,
          listener,
          worldToRender.players,
          ARENA_MAPS[worldToRender.mapId].floorTheme,
          isImmersivePlaying,
          extraDark
        );
      }

      const canvas = canvasRef.current;
      if (canvas && worldToRender) {
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
              cursorScreen: cursorScreenRef.current,
              hideJoystick: controlSchemeRef.current === 'DRAG_STICK',
              spectateTargetId: spectateTargetIdRef.current,
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
      sound.updateNormalMusic(0, false, 0);
      sound.updateLibraryMusic(0, false, 0, false);
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
      const pt = getCanvasPoint(e);
      cursorScreenRef.current = pt;
      if (!hasUsedJoystick) setHasUsedJoystick(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== 'PLAYING') return;
    if (controlSchemeRef.current === 'CURSOR_SPACE') {
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

    return (
      <TitleScreen
        config={config}
        initialRoomCode={initialRoomCode}
        onlineError={onlineError}
        onlineConnecting={onlineConnecting}
        onChangeConfig={setConfig}
        onOpenMapSelect={() => setMenuStep('MAP_SELECT')}
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
        errorMessage={onlineError}
        onUpdateConfig={(nextCfg) => clientRef.current?.updateRoomConfig(nextCfg)}
        onUpdateColor={(colorId) => clientRef.current?.updatePlayerColor(colorId)}
        onSwapTeam={() => clientRef.current?.swapTeam()}
        onStartMatch={() => clientRef.current?.startMatch()}
        onLeave={handleLeaveOnline}
      />
    );
  }

  const activeConfig = isOnline && roomState ? roomState.config : config;
  const is2v2 = (activeConfig.teamMode ?? snapshot.teamMode ?? 'FFA') === '2V2';
  const isHost = isOnline && roomState ? roomState.mySlot === roomState.hostSlot : true;
  const localSlot = isOnline && roomState ? roomState.mySlot : 0;
  const localSnap = snapshot.players.find((p) => p.id === localSlot);

  const team0List = snapshot.players.filter((p) => p.team === 0);
  const team1List = snapshot.players.filter((p) => p.team === 1);
  const p0 = is2v2 ? team0List[0] : snapshot.players.find((p) => p.id === 0);
  const p2 = is2v2 ? team0List[1] : snapshot.players.find((p) => p.id === 2);
  const p1 = is2v2 ? team1List[0] : snapshot.players.find((p) => p.id === 1);
  const p3 = is2v2 ? team1List[1] : snapshot.players.find((p) => p.id === 3);

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
              WASD + Aim
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
              Drag Stick
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
            <>
              <button
                type="button"
                onClick={() => startSoloMatch()}
                aria-label="Restart match"
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
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
            </>
          ) : (
            <button
              type="button"
              onClick={handleLeaveOnline}
              className="h-9 px-3 inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Leave Room
            </button>
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
              {controlScheme === 'CURSOR_SPACE' ? 'WASD + Aim' : 'Touch Stick'}
            </div>
            {controlScheme === 'CURSOR_SPACE' ? (
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
            ) : (
              <>
                <p className="leading-relaxed">
                  Use the stationary left joystick to move &amp; aim. Speed scales smoothly by thumb distance.
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
              <>
                <button
                  type="button"
                  onClick={() => startSoloMatch()}
                  aria-label="Restart match"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-slate-950/55 text-slate-200 hover:bg-slate-900/80 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
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
              </>
            ) : (
              <button
                type="button"
                onClick={handleLeaveOnline}
                className="h-8 px-2.5 inline-flex items-center rounded-lg bg-slate-950/55 text-[11px] font-semibold text-slate-200 hover:bg-slate-900/80 transition-colors cursor-pointer whitespace-nowrap"
              >
                Leave
              </button>
            )}
          </div>

          {/* Borderless Thin Overlay Health Bars at Screen Edges for Phone/Landscape */}
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

              return (
                <div
                  style={{
                    right: 'max(0.75rem, env(safe-area-inset-right))',
                  }}
                  className="pointer-events-none select-none absolute top-[4.65rem] sm:top-[5.15rem] lg:top-4 lg:right-4 z-40 flex flex-col items-end text-right"
                >
                  <div className="flex items-baseline gap-1.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
                    <span className="text-sm sm:text-base leading-none">{fires}</span>
                    <span className={`font-display text-xs sm:text-sm font-black tracking-wide uppercase ${tierColor}`}>
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
              style={{
                right: 'max(0.75rem, env(safe-area-inset-right))',
              }}
              className={`pointer-events-none select-none absolute ${
                killStreak ? 'top-[7.2rem] sm:top-[7.8rem] lg:top-16' : 'top-[4.65rem] sm:top-[5.15rem] lg:top-4'
              } lg:right-4 z-40 flex flex-col items-end text-right animate-bounce`}
            >
              <div className="flex items-baseline gap-1.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
                <span className="text-sm sm:text-base leading-none">🤡💀</span>
                <span className="font-display text-xs sm:text-sm font-black tracking-wide uppercase text-pink-300">
                  OOPS! SHOT YOURSELF!
                </span>
              </div>
              <span className="mt-0.5 font-mono-tabular text-[10px] font-bold tracking-wider text-amber-200/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                OWN TRICKSHOT KO
              </span>
            </div>
          )}

          {/* Stationary Left-Side Joystick (Release to Shoot) */}
          {controlScheme === 'DRAG_STICK' && gameState === 'PLAYING' && (
            <TouchControls
              ammo={localSnap?.ammo ?? 0}
              stunned={(localSnap?.stunTimer ?? 0) > 0}
              alive={localSnap?.alive ?? true}
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
          )}

          {!hasUsedJoystick && gameState === 'PLAYING' && controlScheme === 'CURSOR_SPACE' && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-slate-700/80 bg-slate-950/85 px-4 py-2 text-xs font-medium text-slate-200 whitespace-nowrap shadow-lg">
              {activeConfig.mapId === 'library'
                ? 'WASD to move (Shift or <80% slider to sneak) · [E] Collect/Unlock · Spacebar to shoot'
                : 'WASD to move (Shift to creep) · Cursor to aim · Spacebar to shoot'}
            </div>
          )}

          {/* Compact PC Walk-Speed Slider on <lg screens in Library CURSOR_SPACE mode */}
          {activeConfig.mapId === 'library' &&
            controlScheme === 'CURSOR_SPACE' &&
            gameState === 'PLAYING' &&
            (libraryUi?.state.introTimer ?? LIBRARY_INTRO_DURATION) <= 0 && (
              <div className="lg:hidden pointer-events-auto absolute bottom-3 left-3 z-20 w-48 rounded-xl border border-amber-500/35 bg-slate-950/65 backdrop-blur-sm px-3 py-2 text-[11px] text-slate-200 shadow-lg">
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
                  if (!isOnline && engineRef.current.finishSoloLibrary()) {
                    setSnapshot(engineRef.current.getSnapshot(0));
                    setLibraryLockOpen(false);
                    setGameState('GAME_OVER');
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

          {/* Brief crimson-orange Figure Jumpscare flash when caught */}
          {jumpscareFlash && (
            <div className="pointer-events-none absolute inset-0 z-40 bg-gradient-to-b from-orange-600/45 via-red-950/30 to-black/70 animate-pulse" />
          )}

          {/* 5-Second Black DOORS-Inspired Library Loading Screen */}
          {activeConfig.mapId === 'library' &&
            gameState === 'PLAYING' &&
            (libraryUi?.state.introTimer ?? LIBRARY_INTRO_DURATION) > 0 && (
              <LibraryLoadingScreen introTimer={libraryUi?.state.introTimer ?? LIBRARY_INTRO_DURATION} />
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
                onClick={() => startSoloMatch()}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition-colors cursor-pointer"
              >
                Restart Match
              </button>
              <button
                type="button"
                onClick={() => setGameState('TITLE_MENU')}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Back to Setup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameState === 'GAME_OVER' && (
        <GameOverModal
          snapshot={snapshot}
          isOnline={isOnline}
          isHost={isHost}
          onPlayAgain={() => {
            if (isOnline) {
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
    </div>
  );
}
