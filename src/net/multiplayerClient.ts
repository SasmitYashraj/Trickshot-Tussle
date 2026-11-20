import Peer, { type DataConnection } from 'peerjs';
import { ArenaEngine, PLAYER_PRESETS, pickDistinctColorOption, type SlotSetup } from '../game/engine';
import { ARENA_MAPS } from '../game/maps';
import {
  DEFAULT_MATCH_MODIFIERS,
  type MatchConfig,
  type MatchModifiers,
  type ModifierLevel,
  type OnlineLobbySlot,
  type OnlineRoomState,
  PLAYER_COLOR_PALETTE,
  type PlayerColorOption,
  type WorldSyncState,
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

function sanitizeColorId(raw: unknown, fallback: string): string {
  if (typeof raw === 'string' && PLAYER_COLOR_PALETTE.some((c) => c.id === raw)) {
    return raw;
  }
  return fallback;
}

function sanitizeModifierLevel(raw: unknown, fallback: ModifierLevel): ModifierLevel {
  return raw === 'LOW' || raw === 'MEDIUM' || raw === 'HIGH' ? raw : fallback;
}

function sanitizeModifiers(raw: Partial<MatchModifiers> | undefined): MatchModifiers {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_MATCH_MODIFIERS };
  return {
    bulletSpawn: sanitizeModifierLevel(raw.bulletSpawn, DEFAULT_MATCH_MODIFIERS.bulletSpawn),
    nitroSpawn: sanitizeModifierLevel(raw.nitroSpawn, DEFAULT_MATCH_MODIFIERS.nitroSpawn),
    tntSpawn: sanitizeModifierLevel(raw.tntSpawn, DEFAULT_MATCH_MODIFIERS.tntSpawn),
    medkitSpawn: sanitizeModifierLevel(raw.medkitSpawn, DEFAULT_MATCH_MODIFIERS.medkitSpawn),
    playerSpeed: sanitizeModifierLevel(raw.playerSpeed, DEFAULT_MATCH_MODIFIERS.playerSpeed),
    bulletSpeed: sanitizeModifierLevel(raw.bulletSpeed, DEFAULT_MATCH_MODIFIERS.bulletSpeed),
    bulletCapacity: sanitizeModifierLevel(raw.bulletCapacity, DEFAULT_MATCH_MODIFIERS.bulletCapacity),
    stunTime: sanitizeModifierLevel(raw.stunTime, DEFAULT_MATCH_MODIFIERS.stunTime),
    keepBulletsOnStun:
      typeof raw.keepBulletsOnStun === 'boolean'
        ? raw.keepBulletsOnStun
        : DEFAULT_MATCH_MODIFIERS.keepBulletsOnStun,
  };
}

function sanitizeConfig(raw: Partial<MatchConfig> | undefined): MatchConfig {
  const map =
    raw?.mapId && ARENA_MAPS[raw.mapId] ? ARENA_MAPS[raw.mapId] : ARENA_MAPS.immersive_mansion;
  const teamMode = raw?.teamMode === '2V2' ? '2V2' : 'FFA';
  return {
    mode: raw?.mode === 'BRAWL' ? 'BRAWL' : 'ELIMINATION',
    teamMode,
    mapId: map.id,
    difficulty:
      raw?.difficulty === 'CHILL' || raw?.difficulty === 'RUTHLESS' ? raw.difficulty : 'TACTICAL',
    targetKills:
      typeof raw?.targetKills === 'number' ? Math.max(3, Math.min(20, raw.targetKills)) : 8,
    immersive: map.immersive,
    extraDark: map.immersive ? Boolean(raw?.extraDark) : false,
    fillBots: teamMode === '2V2' ? true : raw?.fillBots !== undefined ? Boolean(raw.fillBots) : true,
    playerColorId:
      typeof raw?.playerColorId === 'string' &&
      PLAYER_COLOR_PALETTE.some((c) => c.id === raw.playerColorId)
        ? raw.playerColorId
        : undefined,
    modifiers: sanitizeModifiers(raw?.modifiers),
  };
}

interface HostMember {
  conn: DataConnection;
  slot: number;
  name: string;
  colorId: string;
}

interface HostRoom {
  code: string;
  hostSlot: number;
  hostName: string;
  hostColorId: string;
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
    const hostColorId = sanitizeColorId(cleanConfig.playerColorId, PLAYER_PRESETS[0].colorId);

    this.attemptHostPeer(hostName, hostColorId, cleanConfig, 0, seq);
  }

  private attemptHostPeer(
    hostName: string,
    hostColorId: string,
    config: MatchConfig,
    attempt: number,
    seq: number
  ) {
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
        hostColorId,
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
        this.attemptHostPeer(hostName, hostColorId, config, attempt + 1, seq);
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
      try {
        if (!peer.destroyed) peer.reconnect();
      } catch {
        // Ignore
      }
    });
  }

  private getHumanUsedColorIds(room: HostRoom, excludeSlot?: number): Set<string> {
    const used = new Set<string>();
    if (excludeSlot !== room.hostSlot) {
      used.add(room.hostColorId);
    }
    for (const m of room.members.values()) {
      if (m.slot !== excludeSlot) {
        used.add(m.colorId);
      }
    }
    return used;
  }

  private resolveSlotColors(room: HostRoom): Map<number, PlayerColorOption> {
    const usedIds = new Set<string>();
    const map = new Map<number, PlayerColorOption>();

    // 1. Reserve host color
    const hostColor = pickDistinctColorOption(room.hostColorId, usedIds, room.hostSlot);
    room.hostColorId = hostColor.id;
    map.set(room.hostSlot, hostColor);

    // 2. Reserve connected human guest colors
    const sortedMembers = [...room.members.values()].sort((a, b) => a.slot - b.slot);
    for (const member of sortedMembers) {
      const col = pickDistinctColorOption(member.colorId, usedIds, member.slot);
      member.colorId = col.id;
      map.set(member.slot, col);
    }

    // 3. Assign remaining distinct colors to bot/open slots
    for (const preset of PLAYER_PRESETS) {
      if (!map.has(preset.id)) {
        map.set(preset.id, pickDistinctColorOption(preset.colorId, usedIds, preset.id));
      }
    }
    return map;
  }

  private attachGuestConnectionToHost(conn: DataConnection, seq: number) {
    let memberRef: HostMember | null = null;

    const handleDisconnect = () => {
      if (seq !== this.sessionSeq || !this.hostRoom || !memberRef) return;
      const slot = memberRef.slot;
      memberRef = null;
      this.removeHostMember(slot);
    };

    conn.on('data', (raw) => {
      if (seq !== this.sessionSeq || !this.hostRoom) return;
      if (!raw || typeof raw !== 'object') return;
      const msg = raw as Record<string, unknown>;
      const type = msg.type;

      if (type === 'join_request') {
        if (memberRef) return;
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

        // In 2V2 prefer putting the second player on Team Bravo (slot 1/3) first if available, else any free slot
        const candidateOrder = room.config.teamMode === '2V2' ? [1, 3, 2, 0] : [0, 1, 2, 3];
        let freeSlot: number | null = null;
        for (const s of candidateOrder) {
          if (s !== room.hostSlot && !room.members.has(s)) {
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

        const playerName = sanitizeName(msg.name, PLAYER_PRESETS[freeSlot].defaultName);
        const usedByHumans = this.getHumanUsedColorIds(room);
        const chosenColor = pickDistinctColorOption(
          typeof msg.colorId === 'string' ? msg.colorId : PLAYER_PRESETS[freeSlot].colorId,
          usedByHumans,
          freeSlot
        );
        memberRef = { conn, slot: freeSlot, name: playerName, colorId: chosenColor.id };
        room.members.set(freeSlot, memberRef);
        this.broadcastHostRoomState();
        return;
      }

      if (!memberRef) return;
      const currentSlot = memberRef.slot;

      if (type === 'leave_room') {
        handleDisconnect();
      } else if (type === 'set_color') {
        const room = this.hostRoom;
        if (room.phase !== 'LOBBY') return;
        const requestedId = sanitizeColorId(msg.colorId, '');
        if (!requestedId) return;
        const usedByOthers = this.getHumanUsedColorIds(room, currentSlot);
        if (!usedByOthers.has(requestedId)) {
          memberRef.colorId = requestedId;
          this.broadcastHostRoomState();
        }
      } else if (type === 'swap_team') {
        const room = this.hostRoom;
        if (room.phase !== 'LOBBY' || room.config.teamMode !== '2V2') return;
        const currentTeam = currentSlot % 2;
        const targetSlots = currentTeam === 0 ? [1, 3] : [0, 2];
        const openTarget = targetSlots.find((s) => s !== room.hostSlot && !room.members.has(s));
        if (openTarget !== undefined) {
          room.members.delete(currentSlot);
          memberRef.slot = openTarget;
          room.members.set(openTarget, memberRef);
          this.broadcastHostRoomState();
        }
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
        room.engine.setRemoteInput(currentSlot, Boolean(msg.active), angle, magnitude, moveAngle);
      } else if (type === 'joystick_release') {
        const room = this.hostRoom;
        if (!room.engine || room.phase !== 'PLAYING') return;
        room.engine.releaseRemoteJoystick(currentSlot);
      } else if (type === 'shoot_action') {
        const room = this.hostRoom;
        if (!room.engine || room.phase !== 'PLAYING') return;
        room.engine.firePlayerShot(currentSlot);
      } else if (type === 'collect_book') {
        const room = this.hostRoom;
        if (!room.engine || room.phase !== 'PLAYING') return;
        room.engine.collectNearbyBook(currentSlot);
      } else if (type === 'lock_dial') {
        const room = this.hostRoom;
        if (!room.engine || room.phase !== 'PLAYING') return;
        if (typeof msg.index === 'number' && typeof msg.digit === 'number') {
          room.engine.setDoorDialDigit(currentSlot, msg.index, msg.digit);
        }
      } else if (type === 'submit_door_code') {
        const room = this.hostRoom;
        if (!room.engine || room.phase !== 'PLAYING') return;
        if (Array.isArray(msg.digits)) {
          room.engine.submitDoorCode(
            currentSlot,
            msg.digits.map((d) => (typeof d === 'number' ? d : 0))
          );
        }
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
    const fillBots = room.config.teamMode === '2V2' ? true : (room.config.fillBots ?? true);
    const colors = this.resolveSlotColors(room);
    return PLAYER_PRESETS.map((preset) => {
      const col = colors.get(preset.id) ?? PLAYER_COLOR_PALETTE[preset.id];
      const team = preset.id % 2;
      if (preset.id === room.hostSlot) {
        return {
          slot: preset.id,
          name: room.hostName,
          color: col.color,
          colorId: col.id,
          finish: col.finish ?? 'solid',
          team,
          occupied: true,
          isBot: false,
          isHost: true,
        };
      }
      const member = room.members.get(preset.id);
      return {
        slot: preset.id,
        name: member ? member.name : fillBots ? `${preset.defaultName} (Bot)` : 'Open Slot',
        color: col.color,
        colorId: col.id,
        finish: col.finish ?? 'solid',
        team,
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

  public joinRoom(code: string, name: string, colorId?: string) {
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
          conn.send({ type: 'join_request', name: cleanName, colorId });
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

  public updatePlayerColor(colorId: string) {
    const cleanId = sanitizeColorId(colorId, '');
    if (!cleanId) return;

    if (this.role === 'host' && this.hostRoom && this.hostRoom.phase === 'LOBBY') {
      const usedByGuests = this.getHumanUsedColorIds(this.hostRoom, this.hostRoom.hostSlot);
      if (!usedByGuests.has(cleanId)) {
        this.hostRoom.hostColorId = cleanId;
        this.broadcastHostRoomState();
      }
      return;
    }

    if (this.role === 'guest' && this.guestConn?.open) {
      try {
        this.guestConn.send({ type: 'set_color', colorId: cleanId });
      } catch {
        // Ignore
      }
    }
  }

  public swapTeam() {
    if (this.role === 'host' && this.hostRoom && this.hostRoom.phase === 'LOBBY') {
      const room = this.hostRoom;
      if (room.config.teamMode !== '2V2') return;
      const currentTeam = room.hostSlot % 2;
      const targetSlots = currentTeam === 0 ? [1, 3] : [0, 2];
      const openTarget = targetSlots.find((s) => !room.members.has(s));
      if (openTarget !== undefined) {
        room.hostSlot = openTarget;
        this.broadcastHostRoomState();
      }
      return;
    }

    if (this.role === 'guest' && this.guestConn?.open) {
      try {
        this.guestConn.send({ type: 'swap_team' });
      } catch {
        // Ignore
      }
    }
  }

  public startMatch() {
    if (this.role !== 'host' || !this.hostRoom) return;
    const room = this.hostRoom;
    this.stopHostLoop();

    const is2v2 = room.config.teamMode === '2V2';
    const fillBots = is2v2 ? true : (room.config.fillBots ?? true);
    const colors = this.resolveSlotColors(room);

    const slotSetups: SlotSetup[] = PLAYER_PRESETS.map((preset) => {
      const colorId = colors.get(preset.id)?.id ?? preset.colorId;
      const team = is2v2 ? preset.id % 2 : undefined;
      if (preset.id === room.hostSlot) {
        return {
          slot: preset.id,
          name: room.hostName,
          isHuman: true,
          enabled: true,
          colorId,
          team,
        };
      }
      const member = room.members.get(preset.id);
      if (member) {
        return {
          slot: preset.id,
          name: member.name,
          isHuman: true,
          enabled: true,
          colorId,
          team,
        };
      }
      return {
        slot: preset.id,
        name: preset.defaultName,
        isHuman: false,
        enabled: fillBots,
        colorId,
        team,
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

  public sendCollectBook() {
    if (this.role === 'host') {
      const room = this.hostRoom;
      if (!room?.engine || room.phase !== 'PLAYING') return;
      room.engine.collectNearbyBook(room.hostSlot);
      return;
    }

    if (this.role !== 'guest' || !this.guestConn?.open) return;
    try {
      this.guestConn.send({ type: 'collect_book' });
    } catch {
      // Ignore
    }
  }

  public sendLockDial(index: number, digit: number) {
    if (this.role === 'host') {
      const room = this.hostRoom;
      if (!room?.engine || room.phase !== 'PLAYING') return;
      room.engine.setDoorDialDigit(room.hostSlot, index, digit);
      return;
    }

    if (this.role !== 'guest' || !this.guestConn?.open) return;
    try {
      this.guestConn.send({ type: 'lock_dial', index, digit });
    } catch {
      // Ignore
    }
  }

  public sendSubmitDoorCode(digits: number[]) {
    if (this.role === 'host') {
      const room = this.hostRoom;
      if (!room?.engine || room.phase !== 'PLAYING') return;
      room.engine.submitDoorCode(room.hostSlot, digits);
      return;
    }

    if (this.role !== 'guest' || !this.guestConn?.open) return;
    try {
      this.guestConn.send({ type: 'submit_door_code', digits });
    } catch {
      // Ignore
    }
  }
}
