import type { MatchConfig, OnlineRoomState, WorldSyncState } from '../game/types';

type RoomHandler = (room: OnlineRoomState) => void;
type WorldHandler = (world: WorldSyncState) => void;
type ErrorHandler = (message: string) => void;
type StatusHandler = (connected: boolean) => void;

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private onRoom: RoomHandler;
  private onWorld: WorldHandler;
  private onError: ErrorHandler;
  private onStatus: StatusHandler;
  private pendingQueue: unknown[] = [];
  private lastInputSentAt = 0;

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

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.onStatus(true);
      while (this.pendingQueue.length > 0) {
        const msg = this.pendingQueue.shift();
        this.send(msg);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'room_state' && data.room) {
          this.onRoom(data.room as OnlineRoomState);
        } else if (data.type === 'game_state' && data.world) {
          this.onWorld(data.world as WorldSyncState);
        } else if (data.type === 'error' && data.message) {
          this.onError(String(data.message));
        }
      } catch {
        // Ignore malformed payloads
      }
    };

    ws.onclose = () => {
      this.onStatus(false);
    };

    ws.onerror = () => {
      this.onError('WebSocket connection error.');
    };
  }

  public disconnect() {
    if (this.ws) {
      this.send({ type: 'leave_room' });
      this.ws.close();
      this.ws = null;
    }
    this.pendingQueue = [];
  }

  private send(payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.pendingQueue.push(payload);
      this.connect();
    }
  }

  public createRoom(name: string, config: MatchConfig) {
    this.send({ type: 'create_room', name, config });
  }

  public joinRoom(code: string, name: string) {
    this.send({ type: 'join_room', code: code.trim().toUpperCase(), name });
  }

  public updateRoomConfig(config: MatchConfig) {
    this.send({ type: 'update_room_config', config });
  }

  public startMatch() {
    this.send({ type: 'start_match' });
  }

  public returnToLobby() {
    this.send({ type: 'return_to_lobby' });
  }

  public leaveRoom() {
    this.send({ type: 'leave_room' });
  }

  private lastSentActive = false;
  private lastSentMoveAngle: number | undefined = undefined;

  public sendJoystickInput(active: boolean, angle: number, magnitude: number, moveAngle?: number) {
    const now = performance.now();
    const stateChanged =
      active !== this.lastSentActive ||
      (moveAngle !== undefined &&
        (this.lastSentMoveAngle === undefined || Math.abs(moveAngle - this.lastSentMoveAngle) > 0.05));
    if (!stateChanged && now - this.lastInputSentAt < 24) return; // ~42Hz cap while steady
    this.lastInputSentAt = now;
    this.lastSentActive = active;
    this.lastSentMoveAngle = moveAngle;
    this.send({ type: 'joystick_input', active, angle, magnitude, moveAngle });
  }

  public sendJoystickRelease() {
    this.send({ type: 'joystick_release' });
  }

  public sendShootAction() {
    this.send({ type: 'shoot_action' });
  }
}
