import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { ArenaEngine, PLAYER_PRESETS, type SlotSetup } from './src/game/engine.ts';
import { ARENA_MAPS } from './src/game/maps.ts';
import type { MatchConfig, OnlineLobbySlot, OnlineRoomState } from './src/game/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

interface ClientMember {
  ws: WebSocket;
  slot: number;
  name: string;
}

interface Room {
  code: string;
  hostSlot: number;
  phase: 'LOBBY' | 'PLAYING' | 'GAME_OVER';
  config: MatchConfig;
  members: Map<number, ClientMember>;
  engine: ArenaEngine | null;
  tickTimer: ReturnType<typeof setInterval> | null;
  tickCount: number;
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<WebSocket, { code: string; slot: number }>();

function sanitizeName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().slice(0, 14);
  return trimmed.length > 0 ? trimmed : fallback;
}

function sanitizeConfig(raw: Partial<MatchConfig> | undefined): MatchConfig {
  const map =
    raw?.mapId && ARENA_MAPS[raw.mapId] ? ARENA_MAPS[raw.mapId] : ARENA_MAPS.immersive_mansion;
  return {
    mode: raw?.mode === 'ELIMINATION' ? 'ELIMINATION' : 'BRAWL',
    mapId: map.id,
    difficulty:
      raw?.difficulty === 'CHILL' || raw?.difficulty === 'RUTHLESS' ? raw.difficulty : 'TACTICAL',
    targetKills: typeof raw?.targetKills === 'number' ? Math.max(3, Math.min(20, raw.targetKills)) : 8,
    immersive: map.immersive,
    extraDark: map.immersive ? Boolean(raw?.extraDark) : false,
    fillBots: raw?.fillBots !== undefined ? Boolean(raw.fillBots) : true,
  };
}

function buildSlots(room: Room): OnlineLobbySlot[] {
  return PLAYER_PRESETS.map((preset) => {
    const member = room.members.get(preset.id);
    const fillBots = room.config.fillBots ?? true;
    return {
      slot: preset.id,
      name: member ? member.name : fillBots ? `${preset.defaultName} (Bot)` : 'Open Slot',
      color: preset.color,
      occupied: Boolean(member),
      isBot: !member && fillBots,
      isHost: room.hostSlot === preset.id,
    };
  });
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoomState(room: Room) {
  const slots = buildSlots(room);
  for (const member of room.members.values()) {
    const state: OnlineRoomState = {
      code: room.code,
      phase: room.phase,
      mySlot: member.slot,
      hostSlot: room.hostSlot,
      config: room.config,
      slots,
    };
    sendJson(member.ws, { type: 'room_state', room: state });
  }
}

function stopRoomLoop(room: Room) {
  if (room.tickTimer) {
    clearInterval(room.tickTimer);
    room.tickTimer = null;
  }
}

function startRoomMatch(room: Room) {
  stopRoomLoop(room);
  const fillBots = room.config.fillBots ?? true;

  const slotSetups: SlotSetup[] = PLAYER_PRESETS.map((preset) => {
    const member = room.members.get(preset.id);
    if (member) {
      return { slot: preset.id, name: member.name, isHuman: true, enabled: true };
    }
    return {
      slot: preset.id,
      name: preset.defaultName,
      isHuman: false,
      enabled: fillBots,
    };
  });

  const enabledCount = slotSetups.filter((s) => s.enabled).length;
  if (enabledCount < 2) {
    // Ensure at least 2 players exist in match
    for (const s of slotSetups) {
      if (!s.enabled) {
        s.enabled = true;
        break;
      }
    }
  }

  room.engine = new ArenaEngine(room.config, slotSetups);
  room.phase = 'PLAYING';
  room.tickCount = 0;
  broadcastRoomState(room);

  // Authoritative 60Hz physics tick, broadcasting state at 30Hz
  const dt = 1 / 60;
  room.tickTimer = setInterval(() => {
    if (!room.engine || room.phase !== 'PLAYING') {
      stopRoomLoop(room);
      return;
    }

    room.engine.update(dt);
    room.tickCount += 1;

    if (room.engine.winnerId !== null) {
      const finalWorld = room.engine.toWorldSyncState();
      for (const member of room.members.values()) {
        sendJson(member.ws, { type: 'game_state', world: finalWorld });
      }
      room.phase = 'GAME_OVER';
      broadcastRoomState(room);
      stopRoomLoop(room);
      return;
    }

    if (room.tickCount % 2 === 0) {
      const world = room.engine.toWorldSyncState();
      for (const member of room.members.values()) {
        sendJson(member.ws, { type: 'game_state', world });
      }
    }
  }, 1000 / 60);
}

function removeMemberFromRoom(ws: WebSocket) {
  const ref = socketToRoom.get(ws);
  if (!ref) return;
  socketToRoom.delete(ws);

  const room = rooms.get(ref.code);
  if (!room) return;
  room.members.delete(ref.slot);

  if (room.members.size === 0) {
    stopRoomLoop(room);
    rooms.delete(room.code);
    return;
  }

  // If disconnected mid-match, convert that slot to AI bot seamlessly if bots enabled, or mark dead
  if (room.engine && room.phase === 'PLAYING') {
    const player = room.engine.players.find((p) => p.id === ref.slot);
    if (player) {
      player.isHuman = false;
      player.isRemote = false;
      player.name = `${PLAYER_PRESETS[ref.slot].defaultName} (Bot)`;
    }
  }

  if (room.hostSlot === ref.slot) {
    const nextHost = room.members.keys().next().value;
    if (nextHost !== undefined) {
      room.hostSlot = nextHost;
    }
  }

  broadcastRoomState(room);
}

async function startServer() {
  const app = express();
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type;
      if (type === 'create_room') {
        removeMemberFromRoom(ws);
        let code = generateRoomCode();
        while (rooms.has(code)) code = generateRoomCode();

        const config = sanitizeConfig(msg.config as Partial<MatchConfig> | undefined);
        const name = sanitizeName(msg.name, PLAYER_PRESETS[0].defaultName);

        const room: Room = {
          code,
          hostSlot: 0,
          phase: 'LOBBY',
          config,
          members: new Map([[0, { ws, slot: 0, name }]]),
          engine: null,
          tickTimer: null,
          tickCount: 0,
        };
        rooms.set(code, room);
        socketToRoom.set(ws, { code, slot: 0 });
        broadcastRoomState(room);
      } else if (type === 'join_room') {
        const rawCode = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
        const room = rooms.get(rawCode);
        if (!room) {
          sendJson(ws, { type: 'error', message: `Lobby "${rawCode || '?'}" not found.` });
          return;
        }
        if (room.phase !== 'LOBBY') {
          sendJson(ws, { type: 'error', message: 'Match already in progress in that lobby.' });
          return;
        }
        // Find first free slot 0..3
        let freeSlot: number | null = null;
        for (let s = 0; s < 4; s++) {
          if (!room.members.has(s)) {
            freeSlot = s;
            break;
          }
        }
        if (freeSlot === null) {
          sendJson(ws, { type: 'error', message: 'Lobby is full (4/4 players).' });
          return;
        }

        removeMemberFromRoom(ws);
        const name = sanitizeName(msg.name, PLAYER_PRESETS[freeSlot].defaultName);
        room.members.set(freeSlot, { ws, slot: freeSlot, name });
        socketToRoom.set(ws, { code: room.code, slot: freeSlot });
        broadcastRoomState(room);
      } else if (type === 'leave_room') {
        removeMemberFromRoom(ws);
      } else if (type === 'update_room_config') {
        const ref = socketToRoom.get(ws);
        if (!ref) return;
        const room = rooms.get(ref.code);
        if (!room || room.hostSlot !== ref.slot || room.phase !== 'LOBBY') return;
        room.config = sanitizeConfig(msg.config as Partial<MatchConfig> | undefined);
        broadcastRoomState(room);
      } else if (type === 'start_match') {
        const ref = socketToRoom.get(ws);
        if (!ref) return;
        const room = rooms.get(ref.code);
        if (!room || room.hostSlot !== ref.slot) return;
        startRoomMatch(room);
      } else if (type === 'return_to_lobby') {
        const ref = socketToRoom.get(ws);
        if (!ref) return;
        const room = rooms.get(ref.code);
        if (!room || room.hostSlot !== ref.slot) return;
        stopRoomLoop(room);
        room.engine = null;
        room.phase = 'LOBBY';
        broadcastRoomState(room);
      } else if (type === 'joystick_input') {
        const ref = socketToRoom.get(ws);
        if (!ref) return;
        const room = rooms.get(ref.code);
        if (!room || !room.engine || room.phase !== 'PLAYING') return;
        room.engine.setRemoteInput(
          ref.slot,
          Boolean(msg.active),
          Number(msg.angle ?? 0),
          Number(msg.magnitude ?? 0),
          msg.moveAngle !== undefined ? Number(msg.moveAngle) : undefined
        );
      } else if (type === 'joystick_release') {
        const ref = socketToRoom.get(ws);
        if (!ref) return;
        const room = rooms.get(ref.code);
        if (!room || !room.engine || room.phase !== 'PLAYING') return;
        room.engine.releaseRemoteJoystick(ref.slot);
      } else if (type === 'shoot_action') {
        const ref = socketToRoom.get(ws);
        if (!ref) return;
        const room = rooms.get(ref.code);
        if (!room || !room.engine || room.phase !== 'PLAYING') return;
        room.engine.firePlayerShot(ref.slot);
      }
    });

    ws.on('close', () => {
      removeMemberFromRoom(ws);
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Trickshot Tussle server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
