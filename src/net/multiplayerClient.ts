import Peer, { type DataConnection } from 'peerjs';
import { ArenaEngine, PLAYER_PRESETS, type SlotSetup } from '../game/engine';
import { ARENA_MAPS } from '../game/maps';
import type {
  MatchConfig,
  OnlineLobbySlot,
  OnlineRoomState,
  WorldSyncState,
} from '../game/types';

type RoomHandler = (room: OnlineRoomState) => void;
type WorldHandler = (world: WorldSyncState) => void;
type ErrorHandler = (message: string) => void;
type StatusHandler = (connected: boolean) => void;

const PEER_PREFIX = 'trickshot-tussle-room-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const PEER_OPTIONS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  },
};

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

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
    targetKills:
      typeof raw?.targetKills === 'number' ? Math.max(3, Math.min(20, raw.targetKills)) : 8,
    immersive: map.immersive,
    extraDark: map.immersive ? Boolean(raw?.extraDark) : false,
    fillBots: raw?.fillBots !== undefined ? Boolean(raw.fillBots) : true,
  };
}

interface HostMember {
  conn: DataConnection;
  slot: number;
  name: string;
}

interface HostRoom {
  code: string;
  hostSlot: number;
  hostName: string;
  phase: 'LOBBY' | 'PLAYING' | 'GAME_OVER';
  config: MatchConfig;
  members: Map<number, HostMember>;
  engine: ArenaEngine | null;
  tickTimer: ReturnType<typeof setInterval> | null;
  tickCount: number;
}

export class MultiplayerClient {
  private peer: Peer | null = null;
  private hostRoom: HostRoom | null = null;
  private guestConn: DataConnection | null = null;
  private role: 'idle' | 'host' | 'guest' = 'idle';
  private guestJoined = false;
  private intentionalClose = false;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private sessionSeq = 0;

  private onRoom: RoomHandler;
  private onWorld: WorldHandler;
  private onError: ErrorHandler;
  private onStatus: StatusHandler;

  private lastInputSentAt = 0;
  private lastSentActive = false;
  private lastSentMagnitude = 0;
  private lastSentAngle = 0;
  private lastSentMoveAngle: number | undefined = undefined;
  private pendingInputTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingInput: {
    active: boolean;
    angle: number;
    magnitude: number;
    moveAngle?: number;
  } | null = null;

  constructor(handlers: {
    onRoom: RoomHandler;
    onWorld: WorldHandler;
    onError: ErrorHandler;
    onStatus: StatusHandler;
  }) {
    this.onRoom = handlers.onRoom;
    this.onWorld = handlers.onWorld;
    this.onError = handlers.onError;
    this.onStatus = handlers.onStatus;
  }

  private clearConnectTimeout() {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
  }

  private stopHostLoop() {
    if (this.hostRoom?.tickTimer) {
      clearInterval(this.hostRoom.tickTimer);
      this.hostRoom.tickTimer = null;
    }
  }

  private teardown(notifyClose = true) {
    this.sessionSeq += 1;
    this.intentionalClose = true;
    this.clearConnectTimeout();
    this.stopHostLoop();

    if (this.hostRoom) {
      for (const member of this.hostRoom.members.values()) {
        try {
          if (notifyClose && member.conn.open) {
            member.conn.send({ type: 'error', message: 'Host left the room.' });
          }
          member.conn.close();
        } catch {
          // Ignore close errors
        }
      }
      this.hostRoom.members.clear();
      this.hostRoom.engine = null;
      this.hostRoom = null;
    }

    if (this.guestConn) {
      try {
        if (notifyClose && this.guestConn.open) {
          this.guestConn.send({ type: 'leave_room' });
        }
        this.guestConn.close();
      } catch {
        // Ignore close errors
      }
      this.guestConn = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore destroy errors
      }
      this.peer = null;
    }

    this.role = 'idle';
    this.guestJoined = false;
    this.lastSentActive = false;
    this.lastSentMagnitude = 0;
    this.lastSentAngle = 0;
    this.lastSentMoveAngle = undefined;
    this.lastInputSentAt = 0;
    this.pendingInput = null;
    if (this.pendingInputTimer) {
      clearTimeout(this.pendingInputTimer);
      this.pendingInputTimer = null;
    }
  }

  public disconnect() {
    this.teardown(true);
    this.onStatus(false);
  }

  public leaveRoom() {
    this.teardown(true);
    this.onStatus(false);
  }

  public createRoom(name: string, config: MatchConfig) {
    this.teardown(true);
    this.intentionalClose = false;
    this.role = 'host';
    const seq = this.sessionSeq;
    const hostName = sanitizeName(name, PLAYER_PRESETS[0].defaultName);
    const cleanConfig = sanitizeConfig(config);

    this.attemptHostPeer(hostName, cleanConfig, 0, seq);
  }

  private attemptHostPeer(hostName: string, config: MatchConfig, attempt: number, seq: number) {
    if (seq !== this.sessionSeq) return;

    const code = generateRoomCode();
    const peer = new Peer(`${PEER_PREFIX}${code}`, PEER_OPTIONS);
    this.peer = peer;

    this.clearConnectTimeout();
    this.connectTimeout = setTimeout(() => {
      if (seq !== this.sessionSeq || this.hostRoom) return;
      this.teardown(false);
      this.onStatus(false);
      this.onError('Could not reach the PeerJS room broker. Check your internet connection and try again.');
    }, 12000);

    peer.on('open', () => {
      if (seq !== this.sessionSeq) return;
      this.clearConnectTimeout();

      this.hostRoom = {
        code,
        hostSlot: 0,
        hostName,
        phase: 'LOBBY',
        config,
        members: new Map(),
        engine: null,
        tickTimer: null,
        tickCount: 0,
      };
      this.onStatus(true);
      this.broadcastHostRoomState();
    });

    peer.on('connection', (conn) => {
      if (seq !== this.sessionSeq || !this.hostRoom) {
        conn.close();
        return;
      }
      this.attachGuestConnectionToHost(conn, seq);
    });

    peer.on('error', (err) => {
      if (seq !== this.sessionSeq) return;
      const errType = (err as { type?: string }).type;

      if (errType === 'unavailable-id' && !this.hostRoom && attempt < 5) {
        this.clearConnectTimeout();
        try {
          peer.destroy();
        } catch {
          // Ignore
        }
        this.peer = null;
        this.attemptHostPeer(hostName, config, attempt + 1, seq);
        return;
      }

      if (!this.hostRoom) {
        this.clearConnectTimeout();
        this.teardown(false);
        this.onStatus(false);
        this.onError(
          errType === 'network' || errType === 'server-error' || errType === 'socket-error'
            ? 'Unable to connect to the PeerJS cloud broker.'
            : err.message || 'PeerJS hosting error.'
        );
      }
    });

    peer.on('disconnected', () => {
      if (seq !== this.sessionSeq || this.intentionalClose) return;
      // Attempt silent reconnection to signaling server while keeping existing WebRTC channels alive
      try {
        if (!peer.destroyed) peer.reconnect();
      } catch {
        // Ignore
      }
    });
  }

  private attachGuestConnectionToHost(conn: DataConnection, seq: number) {
    let assignedSlot: number | null = null;

    const handleDisconnect = () => {
      if (seq !== this.sessionSeq || !this.hostRoom || assignedSlot === null) return;
      const slot = assignedSlot;
      assignedSlot = null;
      this.removeHostMember(slot);
    };

    conn.on('data', (raw) => {
      if (seq !== this.sessionSeq || !this.hostRoom) return;
      if (!raw || typeof raw !== 'object') return;
      const msg = raw as Record<string, unknown>;
      const type = msg.type;

      if (type === 'join_request') {
        if (assignedSlot !== null) return;
        const room = this.hostRoom;

        if (room.phase !== 'LOBBY') {
          try {
            conn.send({ type: 'error', message: 'Match already in progress in that lobby.' });
          } catch {
            // Ignore
          }
          setTimeout(() => {
            try {
              conn.close();
            } catch {
              // Ignore
            }
          }, 150);
          return;
        }

        let freeSlot: number | null = null;
        for (let s = 1; s < 4; s++) {
          if (!room.members.has(s)) {
            freeSlot = s;
            break;
          }
        }

        if (freeSlot === null) {
          try {
            conn.send({ type: 'error', message: 'Lobby is full (4/4 players).' });
          } catch {
            // Ignore
          }
          setTimeout(() => {
            try {
              conn.close();
            } catch {
              // Ignore
            }
          }, 150);
          return;
        }

        assignedSlot = freeSlot;
        const playerName = sanitizeName(msg.name, PLAYER_PRESETS[freeSlot].defaultName);
        room.members.set(freeSlot, { conn, slot: freeSlot, name: playerName });
        this.broadcastHostRoomState();
        return;
      }

      if (assignedSlot === null) return;

      if (type === 'leave_room') {
        handleDisconnect();
      } else if (type === 'joystick_input') {
        const room = this.hostRoom;
        if (!room.engine || room.phase !== 'PLAYING') return;
        const angle =
          typeof msg.angle === 'number' && Number.isFinite(msg.angle) ? msg.angle : 0;
        const magnitude =
          typeof msg.magnitude === 'number' && Number.isFinite(msg.magnitude) ? msg.magnitude : 0;
        const moveAngle =
          typeof msg.moveAngle === 'number' && Number.isFinite(msg.moveAngle)
            ? msg.moveAngle
            : undefined;
        room.engine.setRemoteInput(assignedSlot, Boolean(msg.active), angle, magnitude, moveAngle);
      } else if (type === 'joystick_release') {
        const room = this.hostRoom;
        if (!room.engine || room.phase !== 'PLAYING') return;
        room.engine.releaseRemoteJoystick(assignedSlot);
      } else if (type === 'shoot_action') {
        const room = this.hostRoom;
        if (!room.engine || room.phase !== 'PLAYING') return;
        room.engine.firePlayerShot(assignedSlot);
      }
    });

    conn.on('close', handleDisconnect);
    conn.on('error', handleDisconnect);
  }

  private removeHostMember(slot: number) {
    const room = this.hostRoom;
    if (!room || !room.members.has(slot)) return;
    room.members.delete(slot);

    if (room.engine && room.phase === 'PLAYING') {
      const player = room.engine.players.find((p) => p.id === slot);
      if (player) {
        player.isHuman = false;
        player.isRemote = false;
        player.name = `${PLAYER_PRESETS[slot].defaultName} (Bot)`;
      }
    }

    this.broadcastHostRoomState();
  }

  private buildHostSlots(room: HostRoom): OnlineLobbySlot[] {
    const fillBots = room.config.fillBots ?? true;
    return PLAYER_PRESETS.map((preset) => {
      if (preset.id === room.hostSlot) {
        return {
          slot: preset.id,
          name: room.hostName,
          color: preset.color,
          occupied: true,
          isBot: false,
          isHost: true,
        };
      }
      const member = room.members.get(preset.id);
      return {
        slot: preset.id,
        name: member ? member.name : fillBots ? `${preset.defaultName} (Bot)` : 'Open Slot',
        color: preset.color,
        occupied: Boolean(member),
        isBot: !member && fillBots,
        isHost: false,
      };
    });
  }

  private broadcastHostRoomState() {
    const room = this.hostRoom;
    if (!room) return;

    const slots = this.buildHostSlots(room);
    const hostState: OnlineRoomState = {
      code: room.code,
      phase: room.phase,
      mySlot: room.hostSlot,
      hostSlot: room.hostSlot,
      config: room.config,
      slots,
    };
    this.onRoom(hostState);

    for (const member of room.members.values()) {
      if (!member.conn.open) continue;
      const guestState: OnlineRoomState = {
        code: room.code,
        phase: room.phase,
        mySlot: member.slot,
        hostSlot: room.hostSlot,
        config: room.config,
        slots,
      };
      try {
        member.conn.send({ type: 'room_state', room: guestState });
      } catch {
        // Ignore transient send errors
      }
    }
  }

  public joinRoom(code: string, name: string) {
    const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanCode.length < 3) {
      this.onError('Please enter a valid 4-letter room code.');
      return;
    }

    this.teardown(true);
    this.intentionalClose = false;
    this.role = 'guest';
    this.guestJoined = false;
    const seq = this.sessionSeq;
    const cleanName = sanitizeName(name, 'Player');

    const peer = new Peer(PEER_OPTIONS);
    this.peer = peer;

    this.clearConnectTimeout();
    this.connectTimeout = setTimeout(() => {
      if (seq !== this.sessionSeq || this.guestJoined) return;
      this.teardown(false);
      this.onStatus(false);
      this.onError(`Could not connect to room "${cleanCode}". Verify the code and try again.`);
    }, 12000);

    peer.on('open', () => {
      if (seq !== this.sessionSeq) return;
      const conn = peer.connect(`${PEER_PREFIX}${cleanCode}`, { reliable: true });
      this.guestConn = conn;

      conn.on('open', () => {
        if (seq !== this.sessionSeq) return;
        this.onStatus(true);
        try {
          conn.send({ type: 'join_request', name: cleanName });
        } catch {
          this.clearConnectTimeout();
          this.teardown(false);
          this.onStatus(false);
          this.onError(`Failed to send join request to room "${cleanCode}".`);
        }
      });

      conn.on('data', (raw) => {
        if (seq !== this.sessionSeq || !raw || typeof raw !== 'object') return;
        const data = raw as Record<string, unknown>;

        if (data.type === 'room_state' && data.room) {
          this.clearConnectTimeout();
          this.guestJoined = true;
          this.onRoom(data.room as OnlineRoomState);
        } else if (data.type === 'game_state' && data.world) {
          this.onWorld(data.world as WorldSyncState);
        } else if (data.type === 'error' && data.message) {
          const message = String(data.message);
          this.clearConnectTimeout();
          if (!this.guestJoined) {
            this.teardown(false);
            this.onStatus(false);
          }
          this.onError(message);
        }
      });

      conn.on('close', () => {
        if (seq !== this.sessionSeq || this.intentionalClose) return;
        this.clearConnectTimeout();
        const wasJoined = this.guestJoined;
        this.teardown(false);
        this.onStatus(false);
        if (wasJoined) {
          this.onError('Connection to room host was lost.');
        }
      });

      conn.on('error', () => {
        if (seq !== this.sessionSeq || this.intentionalClose) return;
        this.clearConnectTimeout();
        this.teardown(false);
        this.onStatus(false);
        this.onError(`PeerJS connection to room "${cleanCode}" failed.`);
      });
    });

    peer.on('error', (err) => {
      if (seq !== this.sessionSeq || this.intentionalClose) return;
      const errType = (err as { type?: string }).type;
      this.clearConnectTimeout();
      this.teardown(false);
      this.onStatus(false);

      if (errType === 'peer-unavailable') {
        this.onError(`Lobby "${cleanCode}" not found. Check the 4-letter room code.`);
      } else if (errType === 'network' || errType === 'server-error' || errType === 'socket-error') {
        this.onError('Unable to reach the PeerJS signaling server.');
      } else {
        this.onError(err.message || 'PeerJS connection error.');
      }
    });
  }

  public updateRoomConfig(config: MatchConfig) {
    if (this.role !== 'host' || !this.hostRoom || this.hostRoom.phase !== 'LOBBY') return;
    this.hostRoom.config = sanitizeConfig(config);
    this.broadcastHostRoomState();
  }

  public startMatch() {
    if (this.role !== 'host' || !this.hostRoom) return;
    const room = this.hostRoom;
    this.stopHostLoop();

    const fillBots = room.config.fillBots ?? true;
    const slotSetups: SlotSetup[] = PLAYER_PRESETS.map((preset) => {
      if (preset.id === room.hostSlot) {
        return { slot: preset.id, name: room.hostName, isHuman: true, enabled: true };
      }
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
    this.broadcastHostRoomState();

    const initialWorld = room.engine.toWorldSyncState();
    this.onWorld(initialWorld);
    for (const member of room.members.values()) {
      if (!member.conn.open) continue;
      try {
        member.conn.send({ type: 'game_state', world: initialWorld });
      } catch {
        // Ignore
      }
    }

    const dt = 1 / 60;
    room.tickTimer = setInterval(() => {
      if (!this.hostRoom || this.hostRoom !== room || !room.engine || room.phase !== 'PLAYING') {
        this.stopHostLoop();
        return;
      }

      room.engine.update(dt);
      room.tickCount += 1;

      if (room.engine.winnerId !== null) {
        const finalWorld = room.engine.toWorldSyncState();
        this.onWorld(finalWorld);
        for (const member of room.members.values()) {
          if (!member.conn.open) continue;
          try {
            member.conn.send({ type: 'game_state', world: finalWorld });
          } catch {
            // Ignore
          }
        }
        room.phase = 'GAME_OVER';
        this.broadcastHostRoomState();
        this.stopHostLoop();
        return;
      }

      if (room.tickCount % 2 === 0) {
        const world = room.engine.toWorldSyncState();
        this.onWorld(world);
        for (const member of room.members.values()) {
          if (!member.conn.open) continue;
          try {
            member.conn.send({ type: 'game_state', world });
          } catch {
            // Ignore
          }
        }
      }
    }, 1000 / 60);
  }

  public returnToLobby() {
    if (this.role !== 'host' || !this.hostRoom) return;
    this.stopHostLoop();
    this.hostRoom.engine = null;
    this.hostRoom.phase = 'LOBBY';
    this.broadcastHostRoomState();
  }

  private transmitGuestJoystickInput(
    active: boolean,
    angle: number,
    magnitude: number,
    moveAngle?: number
  ) {
    if (!this.guestConn?.open) return;
    this.lastInputSentAt = performance.now();
    this.lastSentActive = active;
    this.lastSentMagnitude = magnitude;
    this.lastSentAngle = angle;
    this.lastSentMoveAngle = moveAngle;
    this.pendingInput = null;
    if (this.pendingInputTimer) {
      clearTimeout(this.pendingInputTimer);
      this.pendingInputTimer = null;
    }
    try {
      const payload: {
        type: 'joystick_input';
        active: boolean;
        angle: number;
        magnitude: number;
        moveAngle?: number;
      } = {
        type: 'joystick_input',
        active,
        angle,
        magnitude,
      };
      if (typeof moveAngle === 'number' && Number.isFinite(moveAngle)) {
        payload.moveAngle = moveAngle;
      }
      this.guestConn.send(payload);
    } catch {
      // Ignore
    }
  }

  public sendJoystickInput(active: boolean, angle: number, magnitude: number, moveAngle?: number) {
    if (this.role === 'host') {
      const room = this.hostRoom;
      if (!room?.engine || room.phase !== 'PLAYING') return;
      room.engine.setRemoteInput(room.hostSlot, active, angle, magnitude, moveAngle);
      return;
    }

    if (this.role !== 'guest' || !this.guestConn?.open) return;
    const now = performance.now();
    const angleDelta = Math.abs(
      Math.atan2(Math.sin(angle - this.lastSentAngle), Math.cos(angle - this.lastSentAngle))
    );
    const criticalChange =
      active !== this.lastSentActive ||
      (this.lastSentMagnitude <= 0.08 && magnitude > 0.08) ||
      (active && angleDelta > 0.35) ||
      (typeof moveAngle === 'number' &&
        (this.lastSentMoveAngle === undefined || Math.abs(moveAngle - this.lastSentMoveAngle) > 0.08));

    const elapsed = now - this.lastInputSentAt;
    if (criticalChange || elapsed >= 22) {
      this.transmitGuestJoystickInput(active, angle, magnitude, moveAngle);
      return;
    }

    // Trailing flush guarantees final steady-hold magnitude/angle always reaches the host
    this.pendingInput = { active, angle, magnitude, moveAngle };
    if (!this.pendingInputTimer) {
      this.pendingInputTimer = setTimeout(() => {
        this.pendingInputTimer = null;
        if (this.pendingInput && this.role === 'guest' && this.guestConn?.open) {
          const next = this.pendingInput;
          this.transmitGuestJoystickInput(next.active, next.angle, next.magnitude, next.moveAngle);
        }
      }, Math.max(4, 22 - elapsed));
    }
  }

  public sendJoystickRelease() {
    this.pendingInput = null;
    if (this.pendingInputTimer) {
      clearTimeout(this.pendingInputTimer);
      this.pendingInputTimer = null;
    }
    this.lastSentActive = false;
    this.lastSentMagnitude = 0;

    if (this.role === 'host') {
      const room = this.hostRoom;
      if (!room?.engine || room.phase !== 'PLAYING') return;
      room.engine.releaseRemoteJoystick(room.hostSlot);
      return;
    }

    if (this.role !== 'guest' || !this.guestConn?.open) return;
    try {
      this.guestConn.send({ type: 'joystick_release' });
    } catch {
      // Ignore
    }
  }

  public sendShootAction() {
    if (this.role === 'host') {
      const room = this.hostRoom;
      if (!room?.engine || room.phase !== 'PLAYING') return;
      room.engine.firePlayerShot(room.hostSlot);
      return;
    }

    if (this.role !== 'guest' || !this.guestConn?.open) return;
    try {
      this.guestConn.send({ type: 'shoot_action' });
    } catch {
      // Ignore
    }
  }
}
