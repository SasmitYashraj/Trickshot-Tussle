import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameOverModal } from './components/GameOverModal';
import { OnlineLobbyScreen } from './components/OnlineLobbyScreen';
import { PlayerHealthBar } from './components/PlayerHealthBar';
import { TitleScreen } from './components/TitleScreen';
import { TouchControls } from './components/TouchControls';
import { ArenaEngine } from './game/engine';
import { ARENA_MAPS } from './game/maps';
import {
  type CameraState,
  type RenderableWorld,
  getArenaViewTransform,
  renderArena,
} from './game/renderer';
import { sound } from './game/sound';
import type {
  ControlScheme,
  EngineEvent,
  GameSnapshot,
  GameState,
  JoystickState,
  MatchConfig,
  OnlineRoomState,
  WorldSyncState,
} from './game/types';
import { MultiplayerClient } from './net/multiplayerClient';

const DEFAULT_SOLO_CONFIG: MatchConfig = {
  mode: 'BRAWL',
  mapId: 'crossroads',
  difficulty: 'TACTICAL',
  targetKills: 8,
  immersive: false,
};

const DEFAULT_ONLINE_CONFIG: MatchConfig = {
  mode: 'BRAWL',
  mapId: 'immersive_mansion',
  difficulty: 'TACTICAL',
  targetKills: 8,
  immersive: true,
  extraDark: false,
  fillBots: true,
};

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function playEngineEvents(events: EngineEvent[], listenerX?: number, listenerY?: number) {
  for (const evt of events) {
    if (listenerX !== undefined && listenerY !== undefined) {
      const dist = Math.hypot(evt.x - listenerX, evt.y - listenerY);
      // In huge immersive maps, skip quiet far-off pickups/bounces outside earshot
      if (dist > 950 && evt.type !== 'explosion' && evt.type !== 'knockout' && evt.type !== 'victory') {
        continue;
      }
    }
    switch (evt.type) {
      case 'shoot':
        sound.playShoot();
        break;
      case 'pickup':
        sound.playPickup();
        break;
      case 'heal':
        sound.playHeal();
        break;
      case 'bounce':
        sound.playBounce();
        break;
      case 'hit':
        sound.playHit();
        break;
      case 'explosion':
        sound.playExplosion();
        break;
      case 'tnt_tick':
        sound.playTntTick(evt.value ?? 3);
        break;
      case 'knockout':
        sound.playKnockout();
        break;
      case 'victory':
        sound.playVictory();
        break;
    }
  }
}

function worldToSnapshot(world: WorldSyncState, localSlot: number): GameSnapshot {
  return {
    players: world.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHuman: p.id === localSlot,
      color: p.color,
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
    })),
    elapsedTime: world.elapsedTime,
    activeBullets: world.bullets.length,
    winnerId: world.winnerId,
    winnerReason: world.winnerReason,
  };
}

export default function App() {
  const initialRoomCode =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? ''
      : '';

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
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
  const clientRef = useRef<MultiplayerClient | null>(null);

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
          setGameState('ONLINE_LOBBY');
        } else if (room.phase === 'PLAYING') {
          cameraRef.current.initialized = false;
          setHasUsedJoystick(false);
          setGameState('PLAYING');
        } else if (room.phase === 'GAME_OVER') {
          setGameState('GAME_OVER');
        }
      },
      onWorld: (world) => {
        onlineWorldRef.current = world;
        onlineLastSyncAtRef.current = performance.now();
        const mySlot = roomStateRef.current?.mySlot ?? 0;
        const me = world.players.find((p) => p.id === mySlot);
        if (world.events && world.events.length > 0) {
          playEngineEvents(world.events, me?.x, me?.y);
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
      const nextCfg = { ...(overrideConfig ?? config), immersive: false };
      sound.unlock();
      setIsOnline(false);
      setRoomState(null);
      cameraRef.current.initialized = false;
      engineRef.current.reset(nextCfg);
      engineRef.current.setControlScheme(controlSchemeRef.current);
      setSnapshot(engineRef.current.getSnapshot(0));
      setHasUsedJoystick(false);
      setGameState('PLAYING');
    },
    [config]
  );

  const handleCreateOnlineRoom = (name: string) => {
    sound.unlock();
    setOnlineError(null);
    setOnlineConnecting(true);
    clientRef.current?.createRoom(name, DEFAULT_ONLINE_CONFIG);
  };

  const handleJoinOnlineRoom = (code: string, name: string) => {
    sound.unlock();
    setOnlineError(null);
    setOnlineConnecting(true);
    clientRef.current?.joinRoom(code, name);
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
  }, [togglePause]);

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
            elapsedTime: serverWorld.elapsedTime + sinceSync,
            screenShake: serverWorld.screenShake,
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
          if (evts.length > 0) playEngineEvents(evts);
          if (engine.winnerId !== null) {
            setSnapshot(engine.getSnapshot(0));
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
          elapsedTime: engine.elapsedTime,
          screenShake: engine.screenShake,
          players: engine.players,
          bullets: engine.bullets,
          pickups: engine.pickups,
          boxes: engine.boxes,
          explosions: engine.explosions,
          particles: engine.particles,
          floatingTexts: engine.floatingTexts,
        };
      }

      // WASD / Arrow movement + Shift slow-walk + 360-degree pure cursor aim
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
          const magnitude = moving ? (shiftHeld ? 0.44 : 1.0) : 0;

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
        const isImmersivePlaying =
          gameStateRef.current === 'PLAYING' &&
          (worldToRender.immersive || ARENA_MAPS[worldToRender.mapId].immersive);
        const extraDark = Boolean(worldToRender.extraDark);
        sound.setImmersiveAmbient(isImmersivePlaying, extraDark);
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
    return (
      <TitleScreen
        config={config}
        initialRoomCode={initialRoomCode}
        onlineError={onlineError}
        onlineConnecting={onlineConnecting}
        onChangeConfig={setConfig}
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
        onStartMatch={() => clientRef.current?.startMatch()}
        onLeave={handleLeaveOnline}
      />
    );
  }

  const activeConfig = isOnline && roomState ? roomState.config : config;
  const isHost = isOnline && roomState ? roomState.mySlot === roomState.hostSlot : true;
  const localSlot = isOnline && roomState ? roomState.mySlot : 0;
  const localSnap = snapshot.players.find((p) => p.id === localSlot);

  const p0 = snapshot.players.find((p) => p.id === 0);
  const p1 = snapshot.players.find((p) => p.id === 1);
  const p2 = snapshot.players.find((p) => p.id === 2);
  const p3 = snapshot.players.find((p) => p.id === 3);

  return (
    <div className="h-dvh w-screen flex flex-col bg-[#0B1120] overflow-hidden">
      {/* Top Bar */}
      <header className="h-11 sm:h-14 shrink-0 border-b border-slate-800/90 bg-[#0F172A] px-2.5 sm:px-6 flex items-center justify-between gap-2 sm:gap-3">
        <span className="font-display text-sm sm:text-lg font-extrabold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
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
          <span>
            {activeConfig.mode === 'BRAWL'
              ? `First to ${activeConfig.targetKills} KOs`
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

          {/* Compact Side-Corner Mini Health Bars for Phone/Tablet */}
          <div className="pointer-events-none absolute top-2 left-2 right-2 flex items-start justify-between gap-2 lg:hidden z-10">
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
              WASD to move (Shift to creep) · Cursor to aim · Spacebar to shoot
            </div>
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
              <span className="text-orange-400">Nitro Crate</span>
              <span className="font-mono-tabular text-slate-300">-33 HP · Blast</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-red-400">TNT (3s)</span>
              <span className="font-mono-tabular text-slate-300">-45 HP · Shootable</span>
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
