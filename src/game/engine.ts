import { ARENA_MAPS } from './maps.ts';
import {
  ARENA_WALL_THICKNESS,
  type ArenaMap,
  BULLET_DAMAGE,
  BULLET_MAX_AGE,
  BULLET_MAX_BOUNCES,
  BULLET_RADIUS,
  BULLET_SELF_GRACE,
  BULLET_SPEED,
  type BotDifficulty,
  type Bullet,
  CARDBOARD_FADE_IN,
  CARDBOARD_FADE_OUT,
  CARDBOARD_PUNCTURE_FRAME,
  CARDBOARD_SIZE,
  type CardboardBox,
  type ControlScheme,
  type EngineEvent,
  type Explosion,
  type FloatingText,
  type GameSnapshot,
  type IcePit,
  type JoystickState,
  MEDKIT_HEAL,
  MEDKIT_RADIUS,
  type MatchConfig,
  NITRO_BLAST_RADIUS,
  NITRO_DAMAGE,
  NITRO_RADIUS,
  PICKUP_BULLET_RADIUS,
  PLAYER_MAX_ACCEL,
  PLAYER_MAX_AMMO,
  PLAYER_MAX_HP,
  PLAYER_MAX_SPEED,
  PLAYER_RADIUS,
  PLAYER_TURN_SPEED,
  PLAYER_COLOR_PALETTE,
  type PlayerColorOption,
  type Particle,
  type Pickup,
  type PickupKind,
  type Player,
  RESPAWN_DELAY,
  SPAWN_INVULN_DURATION,
  STUN_DURATION,
  TNT_BLAST_RADIUS,
  TNT_COUNTDOWN,
  TNT_DAMAGE,
  TNT_RADIUS,
  type Vec2,
  type WallRect,
  type WorldSyncState,
} from './types.ts';

const TNT_HALF_SIZE = 29;

export const PLAYER_PRESETS = [
  { id: 0, defaultName: 'Cobalt', colorId: 'cobalt', color: '#0EA5E9', accentColor: '#7DD3FC' },
  { id: 1, defaultName: 'Viper', colorId: 'crimson', color: '#EF4444', accentColor: '#FCA5A5' },
  { id: 2, defaultName: 'Volt', colorId: 'volt', color: '#FACC15', accentColor: '#FEF08A' },
  { id: 3, defaultName: 'Jade', colorId: 'jade', color: '#22C55E', accentColor: '#86EFAC' },
];

export interface SlotSetup {
  slot: number;
  name: string;
  isHuman: boolean;
  enabled: boolean;
  colorId?: string;
  team?: number;
}

export function pickDistinctColorOption(
  preferredId: string | undefined,
  usedIds: Set<string>,
  fallbackIdx = 0
): PlayerColorOption {
  if (preferredId) {
    const match = PLAYER_COLOR_PALETTE.find((c) => c.id === preferredId);
    if (match && !usedIds.has(match.id)) {
      usedIds.add(match.id);
      return match;
    }
  }
  const ordered = [
    PLAYER_COLOR_PALETTE[fallbackIdx % PLAYER_COLOR_PALETTE.length],
    ...PLAYER_COLOR_PALETTE,
  ];
  for (const opt of ordered) {
    if (!usedIds.has(opt.id)) {
      usedIds.add(opt.id);
      return opt;
    }
  }
  return PLAYER_COLOR_PALETTE[fallbackIdx % PLAYER_COLOR_PALETTE.length];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function circleIntersectsRect(cx: number, cy: number, r: number, rect: WallRect): boolean {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

function segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, rect: WallRect): boolean {
  const steps = Math.max(2, Math.ceil(dist(x1, y1, x2, y2) / 18));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    if (px >= rect.x - 4 && px <= rect.x + rect.w + 4 && py >= rect.y - 4 && py <= rect.y + rect.h + 4) {
      return true;
    }
  }
  return false;
}

function isPointInEllipse(px: number, py: number, ex: number, ey: number, rx: number, ry: number): boolean {
  if (rx <= 0 || ry <= 0) return false;
  const nx = (px - ex) / rx;
  const ny = (py - ey) / ry;
  return nx * nx + ny * ny < 1;
}

function isPointInIcePit(px: number, py: number, pit: IcePit, margin = 0): boolean {
  if (!pit.points || pit.points.length < 3) {
    return isPointInEllipse(px, py, pit.x, pit.y, Math.max(16, pit.rx + margin), Math.max(16, pit.ry + margin));
  }
  const scaleX = Math.max(0.22, (pit.rx + margin) / Math.max(1, pit.rx));
  const scaleY = Math.max(0.22, (pit.ry + margin) / Math.max(1, pit.ry));
  const lx = (px - pit.x) / scaleX;
  const ly = (py - pit.y) / scaleY;
  let inside = false;
  const pts = pit.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const intersect =
      yi > ly !== yj > ly && lx < ((xj - xi) * (ly - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function circleOverlapsIcePit(cx: number, cy: number, cr: number, pit: IcePit): boolean {
  if (isPointInIcePit(cx, cy, pit, cr * 0.8)) return true;
  if (pit.points && pit.points.length >= 3) {
    for (const pt of pit.points) {
      if (dist(cx, cy, pit.x + pt.x, pit.y + pt.y) <= cr) return true;
    }
  }
  return false;
}

export class ArenaEngine {
  public config: MatchConfig;
  public map: ArenaMap;
  public players: Player[] = [];
  public bullets: Bullet[] = [];
  public pickups: Pickup[] = [];
  public boxes: CardboardBox[] = [];
  public icePits: IcePit[] = [];
  public explosions: Explosion[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public events: EngineEvent[] = [];

  public controlScheme: ControlScheme = 'CURSOR_SPACE';
  public cursorInput = {
    active: false,
    moveAngle: 0,
    aimAngle: 0,
    hasAim: false,
    magnitude: 0,
  };

  public joystick: JoystickState = {
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
  };

  public elapsedTime = 0;
  public screenShake = 0;
  public winnerId: number | null = null;
  public winnerTeam: number | null = null;
  public winnerReason = '';

  private nextId = 1;
  private bulletSpawnTimer = 1.4;
  private nitroSpawnTimer = 4.5;
  private tntSpawnTimer = 7.0;
  private medkitSpawnTimer = 9.0;
  private boxSpawnTimer = 4.0;

  constructor(config: MatchConfig, slots?: SlotSetup[]) {
    this.config = config;
    this.map = ARENA_MAPS[config.mapId];
    this.reset(config, slots);
  }

  public reset(config: MatchConfig, slots?: SlotSetup[]) {
    this.config = config;
    this.map = ARENA_MAPS[config.mapId];
    this.bullets = [];
    this.pickups = [];
    this.boxes = [];
    this.icePits = (this.map.icePits ?? []).map((pit, idx) => ({
      id: idx + 1,
      x: pit.x,
      y: pit.y,
      rx: pit.rx,
      ry: pit.ry,
      points: pit.points,
      broken: false,
    }));
    this.explosions = [];
    this.particles = [];
    this.floatingTexts = [];
    this.events = [];
    this.elapsedTime = 0;
    this.screenShake = 0;
    this.winnerId = null;
    this.winnerTeam = null;
    this.winnerReason = '';

    const isImmersive = this.map.immersive;
    this.bulletSpawnTimer = isImmersive ? 1.5 : 2.0;
    this.nitroSpawnTimer = isImmersive ? 11.5 : 6.0;
    this.tntSpawnTimer = isImmersive ? 7.5 : 9.0;
    this.medkitSpawnTimer = isImmersive ? 9.0 : 11.0;
    this.boxSpawnTimer = isImmersive ? 2.5 : 2.4;

    this.joystick.active = false;
    this.joystick.pointerId = null;
    this.joystick.magnitude = 0;
    this.joystick.dx = 0;
    this.joystick.dy = 0;

    this.cursorInput.active = false;
    this.cursorInput.hasAim = false;
    this.cursorInput.magnitude = 0;

    const effectiveSlots: SlotSetup[] =
      slots ??
      PLAYER_PRESETS.map((p, idx) => ({
        slot: idx,
        name: idx === 0 ? 'You' : p.defaultName,
        isHuman: idx === 0,
        enabled: true,
        colorId: idx === 0 ? config.playerColorId : undefined,
        team: idx === 0 || idx === 2 ? 0 : 1,
      }));

    // Assign strictly unique colors (humans pick first, then bots fill remaining non-similar colors)
    const activeSlots = effectiveSlots.filter((s) => s.enabled);
    const usedColorIds = new Set<string>();
    const assignedColors = new Map<number, PlayerColorOption>();

    for (const s of activeSlots.filter((sl) => sl.isHuman)) {
      const chosen = pickDistinctColorOption(s.colorId, usedColorIds, s.slot);
      assignedColors.set(s.slot, chosen);
    }
    for (const s of activeSlots.filter((sl) => !sl.isHuman)) {
      const fallbackColor = PLAYER_PRESETS[s.slot]?.colorId;
      const chosen = pickDistinctColorOption(s.colorId ?? fallbackColor, usedColorIds, s.slot);
      assignedColors.set(s.slot, chosen);
    }

    this.players = activeSlots.map((s) => {
      const palette = assignedColors.get(s.slot) ?? PLAYER_COLOR_PALETTE[s.slot % PLAYER_COLOR_PALETTE.length];
      const spawn = this.map.spawns[s.slot];
      const aimCenterAngle = Math.atan2(this.map.height / 2 - spawn.y, this.map.width / 2 - spawn.x);
      const team = s.team !== undefined ? s.team : s.slot === 0 || s.slot === 2 ? 0 : 1;
      return {
        id: s.slot,
        name: s.name,
        team: this.config.teamMode === '2V2' ? team : undefined,
        isHuman: s.isHuman,
        isRemote: Boolean(slots),
        color: palette.color,
        accentColor: palette.accentColor,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        angle: aimCenterAngle,
        hp: PLAYER_MAX_HP,
        maxHp: PLAYER_MAX_HP,
        ammo: 0,
        maxAmmo: PLAYER_MAX_AMMO,
        stunTimer: 0,
        hurtFlashTimer: 0,
        respawnTimer: 0,
        spawnInvulnTimer: SPAWN_INVULN_DURATION,
        alive: true,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        shotsFired: 0,
        shotsHit: 0,
        lastHitBy: null,
        remoteActive: false,
        remoteAngle: aimCenterAngle,
        remoteMoveAngle: aimCenterAngle,
        remoteAimActive: false,
        remoteMagnitude: 0,
        aiStrafeDir: s.slot % 2 === 0 ? 1 : -1,
        aiThinkTimer: 0.15 + s.slot * 0.1,
        aiTargetAngle: aimCenterAngle,
        aiMoveRatio: 0.72,
        aiHoldShotTimer: 0.7,
      };
    });

    // Calm initial pickups & movable cardboard cover boxes spread across the arena
    const initBullets = isImmersive ? 5 : 3;
    const initNitros = isImmersive ? 1 : 1;
    const initBoxes = isImmersive ? 10 : 6;
    for (let i = 0; i < initBullets; i++) this.spawnPickup('bullet');
    for (let i = 0; i < initNitros; i++) this.spawnPickup('nitro');
    for (let i = 0; i < initBoxes; i++) this.spawnCardboardBox();
  }

  public startJoystick(pointerId: number, x: number, y: number) {
    this.joystick.active = true;
    this.joystick.pointerId = pointerId;
    this.joystick.originX = x;
    this.joystick.originY = y;
    this.joystick.currentX = x;
    this.joystick.currentY = y;
    this.joystick.dx = 0;
    this.joystick.dy = 0;
    this.joystick.magnitude = 0;
  }

  public moveJoystick(pointerId: number, x: number, y: number) {
    if (!this.joystick.active || this.joystick.pointerId !== pointerId) return;
    const rawDx = x - this.joystick.originX;
    const rawDy = y - this.joystick.originY;
    const rawDist = Math.hypot(rawDx, rawDy);
    const maxR = this.joystick.maxRadius;
    const clampedDist = Math.min(rawDist, maxR);
    const angle = rawDist > 0.001 ? Math.atan2(rawDy, rawDx) : this.joystick.angle;

    this.joystick.currentX = this.joystick.originX + Math.cos(angle) * clampedDist;
    this.joystick.currentY = this.joystick.originY + Math.sin(angle) * clampedDist;
    this.joystick.magnitude = clampedDist / maxR;
    this.joystick.angle = angle;
    this.joystick.dx = Math.cos(angle) * this.joystick.magnitude;
    this.joystick.dy = Math.sin(angle) * this.joystick.magnitude;
  }

  public setJoystickVector(active: boolean, angle: number, magnitude: number, pointerId: number | null = null) {
    this.joystick.active = active;
    this.joystick.pointerId = active ? pointerId : null;
    const mag = clamp(Number.isFinite(magnitude) ? magnitude : 0, 0, 1);
    const safeAngle = Number.isFinite(angle) ? angle : this.joystick.angle;
    this.joystick.angle = safeAngle;
    this.joystick.magnitude = active ? mag : 0;
    this.joystick.dx = active ? Math.cos(safeAngle) * mag : 0;
    this.joystick.dy = active ? Math.sin(safeAngle) * mag : 0;
  }

  public setControlScheme(scheme: ControlScheme) {
    this.controlScheme = scheme;
    this.joystick.active = false;
    this.joystick.pointerId = null;
    this.joystick.magnitude = 0;
    this.joystick.dx = 0;
    this.joystick.dy = 0;
    this.cursorInput.active = false;
    this.cursorInput.hasAim = false;
    this.cursorInput.magnitude = 0;
  }

  public setHumanCursorInput(
    active: boolean,
    aimAngle: number,
    magnitude: number,
    moveAngle?: number,
    hasAim = true
  ) {
    this.cursorInput.active = active;
    this.cursorInput.hasAim = hasAim;
    if (Number.isFinite(aimAngle)) this.cursorInput.aimAngle = aimAngle;
    const nextMoveAngle = moveAngle !== undefined ? moveAngle : aimAngle;
    if (Number.isFinite(nextMoveAngle)) this.cursorInput.moveAngle = nextMoveAngle;
    this.cursorInput.magnitude = clamp(Number.isFinite(magnitude) ? magnitude : 0, 0, 1);
  }

  public firePlayerShot(slot: number) {
    const player = this.players.find((p) => p.id === slot);
    if (player && player.alive && player.stunTimer <= 0 && player.ammo > 0 && this.winnerId === null) {
      this.fireBullet(player);
    }
  }

  public releaseJoystick(pointerId?: number) {
    if (!this.joystick.active) return;
    if (pointerId !== undefined && this.joystick.pointerId !== pointerId) return;

    this.joystick.active = false;
    this.joystick.pointerId = null;
    this.joystick.dx = 0;
    this.joystick.dy = 0;
    this.joystick.magnitude = 0;

    this.firePlayerShot(0);
  }

  public setRemoteInput(
    slot: number,
    active: boolean,
    angle: number,
    magnitude: number,
    moveAngle?: number
  ) {
    const player = this.players.find((p) => p.id === slot);
    if (!player) return;
    player.remoteActive = active;
    if (Number.isFinite(angle)) player.remoteAngle = angle;
    if (typeof moveAngle === 'number' && Number.isFinite(moveAngle)) {
      player.remoteMoveAngle = moveAngle;
      player.remoteAimActive = true;
    } else {
      if (Number.isFinite(angle)) player.remoteMoveAngle = angle;
      player.remoteAimActive = false;
    }
    player.remoteMagnitude = clamp(Number.isFinite(magnitude) ? magnitude : 0, 0, 1);
  }

  public releaseRemoteJoystick(slot: number) {
    const player = this.players.find((p) => p.id === slot);
    if (!player) return;
    player.remoteActive = false;
    player.remoteMagnitude = 0;
    this.firePlayerShot(slot);
  }

  public drainEvents(): EngineEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  private emitEvent(type: EngineEvent['type'], x: number, y: number, value?: number) {
    this.events.push({ type, x, y, value });
  }

  public update(dt: number) {
    if (this.winnerId !== null) {
      this.updateParticlesAndTexts(dt);
      this.screenShake = Math.max(0, this.screenShake - dt * 28);
      return;
    }

    this.elapsedTime += dt;
    this.screenShake = Math.max(0, this.screenShake - dt * 28);

    this.updateSpawners(dt);
    this.updatePlayers(dt);
    this.updateBoxes(dt);
    this.updatePickups(dt);
    this.updateBullets(dt);
    this.updateParticlesAndTexts(dt);
    this.checkWinConditions();
  }

  private updateSpawners(dt: number) {
    const isImmersive = this.map.immersive;
    const bulletCap = isImmersive ? 9 : 5;
    const nitroCap = isImmersive ? 2 : 2;
    const tntCap = isImmersive ? 2 : 1;
    const medkitCap = isImmersive ? 2 : 1;
    const boxCap = isImmersive ? 15 : 9;

    const bulletInterval = isImmersive ? 2.1 : 2.6;
    const nitroInterval = isImmersive ? 13.5 : 8.0;
    const tntInterval = isImmersive ? 9.5 : 11.5;
    const medkitInterval = isImmersive ? 11.5 : 13.5;
    const boxInterval = isImmersive ? 3.6 : 3.2;

    const bulletCount = this.pickups.filter((p) => p.kind === 'bullet').length;
    const nitroCount = this.pickups.filter((p) => p.kind === 'nitro').length;
    const tntCount = this.pickups.filter((p) => p.kind === 'tnt').length;
    const medkitCount = this.pickups.filter((p) => p.kind === 'medkit').length;
    const boxCount = this.boxes.filter((b) => b.state === 'spawning' || b.state === 'active').length;

    this.bulletSpawnTimer -= dt;
    if (this.bulletSpawnTimer <= 0) {
      this.bulletSpawnTimer = bulletInterval;
      if (bulletCount < bulletCap) this.spawnPickup('bullet');
    }

    this.nitroSpawnTimer -= dt;
    if (this.nitroSpawnTimer <= 0) {
      this.nitroSpawnTimer = nitroInterval;
      if (nitroCount < nitroCap) this.spawnPickup('nitro');
    }

    this.tntSpawnTimer -= dt;
    if (this.tntSpawnTimer <= 0) {
      this.tntSpawnTimer = tntInterval;
      if (tntCount < tntCap) this.spawnPickup('tnt');
    }

    this.medkitSpawnTimer -= dt;
    if (this.medkitSpawnTimer <= 0) {
      this.medkitSpawnTimer = medkitInterval;
      if (medkitCount < medkitCap) this.spawnPickup('medkit');
    }

    this.boxSpawnTimer -= dt;
    if (this.boxSpawnTimer <= 0) {
      this.boxSpawnTimer = boxInterval;
      if (boxCount < boxCap) this.spawnCardboardBox();
    }
  }

  private findFreeSpot(radius: number): Vec2 | null {
    const pad = ARENA_WALL_THICKNESS + radius + 24;
    for (let attempt = 0; attempt < 64; attempt++) {
      const x = pad + Math.random() * (this.map.width - pad * 2);
      const y = pad + Math.random() * (this.map.height - pad * 2);

      let blocked = false;
      for (const wall of this.map.walls) {
        if (circleIntersectsRect(x, y, radius + 12, wall)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      for (const p of this.players) {
        if (p.alive && dist(x, y, p.x, p.y) < radius + PLAYER_RADIUS + 48) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      for (const item of this.pickups) {
        if (dist(x, y, item.x, item.y) < radius + item.radius + 44) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      for (const box of this.boxes) {
        if (dist(x, y, box.x, box.y) < radius + box.w * 0.62 + 16) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      for (const pit of this.icePits) {
        if (pit.broken && isPointInIcePit(x, y, pit, radius + 16)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return { x, y };
    }
    return null;
  }

  private spawnCardboardBox() {
    const spot = this.findFreeSpot(CARDBOARD_SIZE * 0.72);
    if (!spot) return;

    this.boxes.push({
      id: this.nextId++,
      x: spot.x,
      y: spot.y,
      w: CARDBOARD_SIZE,
      h: CARDBOARD_SIZE,
      vx: 0,
      vy: 0,
      age: 0,
      lastPusherId: null,
      state: 'spawning',
      stateTimer: CARDBOARD_FADE_IN,
    });
  }

  private punctureBox(box: CardboardBox, impactVx = 0, impactVy = 0) {
    if (box.state !== 'active') return;
    box.state = 'punctured';
    box.stateTimer = CARDBOARD_PUNCTURE_FRAME;
    const speed = Math.hypot(impactVx, impactVy);
    if (speed > 1) {
      box.vx += (impactVx / speed) * 85;
      box.vy += (impactVy / speed) * 85;
    }
    this.emitEvent('hit', box.x, box.y);
    this.spawnParticles(box.x, box.y, '#D97706', 10, 130);
    this.spawnParticles(box.x, box.y, '#FDE68A', 5, 95);
  }

  private updateBoxes(dt: number) {
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const box = this.boxes[i];
      box.age += dt;

      if (box.state === 'spawning') {
        box.stateTimer -= dt;
        if (box.stateTimer <= 0) {
          box.state = 'active';
          box.stateTimer = 0;
        }
      } else if (box.state === 'punctured') {
        box.stateTimer -= dt;
        if (box.stateTimer <= 0) {
          box.state = 'fading';
          box.stateTimer = CARDBOARD_FADE_OUT;
        }
      } else if (box.state === 'fading') {
        box.stateTimer -= dt;
        if (box.stateTimer <= 0) {
          this.boxes.splice(i, 1);
          continue;
        }
      }

      if (Math.abs(box.vx) > 0.5 || Math.abs(box.vy) > 0.5) {
        box.x += box.vx * dt;
        box.y += box.vy * dt;
        const friction = Math.exp(-9.5 * dt);
        box.vx *= friction;
        box.vy *= friction;
        if (Math.hypot(box.vx, box.vy) < 4) {
          box.vx = 0;
          box.vy = 0;
        }
      }

      // Resolve pushed cardboard boxes against solid arena walls
      const halfW = box.w * 0.5;
      const halfH = box.h * 0.5;
      for (const wall of this.map.walls) {
        const boxLeft = box.x - halfW;
        const boxRight = box.x + halfW;
        const boxTop = box.y - halfH;
        const boxBottom = box.y + halfH;
        const overlapX = Math.min(boxRight, wall.x + wall.w) - Math.max(boxLeft, wall.x);
        const overlapY = Math.min(boxBottom, wall.y + wall.h) - Math.max(boxTop, wall.y);
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            const sign = box.x < wall.x + wall.w * 0.5 ? -1 : 1;
            box.x += sign * overlapX;
            if ((sign < 0 && box.vx > 0) || (sign > 0 && box.vx < 0)) box.vx = 0;
          } else {
            const sign = box.y < wall.y + wall.h * 0.5 ? -1 : 1;
            box.y += sign * overlapY;
            if ((sign < 0 && box.vy > 0) || (sign > 0 && box.vy < 0)) box.vy = 0;
          }
        }
      }

      // Boxes pushed deep into broken winter water sink with a splash
      if (box.state === 'active') {
        for (const pit of this.icePits) {
          if (pit.broken && isPointInIcePit(box.x, box.y, pit, -12)) {
            box.state = 'fading';
            box.stateTimer = 0.16;
            this.emitEvent('splash', box.x, box.y);
            this.spawnParticles(box.x, box.y, '#7DD3FC', 12, 130);
            break;
          }
        }
      }
    }

    // Separate active boxes from one another
    for (let i = 0; i < this.boxes.length; i++) {
      const a = this.boxes[i];
      if (a.state !== 'active') continue;
      for (let j = i + 1; j < this.boxes.length; j++) {
        const b = this.boxes[j];
        if (b.state !== 'active') continue;
        const overlapX = (a.w + b.w) * 0.5 - Math.abs(b.x - a.x);
        const overlapY = (a.h + b.h) * 0.5 - Math.abs(b.y - a.y);
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            const sign = a.x <= b.x ? 1 : -1;
            a.x -= sign * overlapX * 0.5;
            b.x += sign * overlapX * 0.5;
          } else {
            const sign = a.y <= b.y ? 1 : -1;
            a.y -= sign * overlapY * 0.5;
            b.y += sign * overlapY * 0.5;
          }
        }
      }
    }
  }

  private spawnPickup(kind: PickupKind) {
    const radius =
      kind === 'bullet'
        ? PICKUP_BULLET_RADIUS
        : kind === 'nitro'
          ? NITRO_RADIUS
          : kind === 'tnt'
            ? TNT_RADIUS
            : MEDKIT_RADIUS;

    const spot = this.findFreeSpot(radius);
    if (!spot) return;

    const pickup: Pickup = {
      id: this.nextId++,
      kind,
      x: spot.x,
      y: spot.y,
      radius,
      age: 0,
    };

    if (kind === 'tnt') {
      pickup.vx = 0;
      pickup.vy = 0;
      pickup.armed = false;
      pickup.ownerId = null;
      pickup.countdown = TNT_COUNTDOWN;
      pickup.maxCountdown = TNT_COUNTDOWN;
      pickup.lastTickSecond = 3;
    }

    this.pickups.push(pickup);
  }

  private resolveRectAgainstWalls(item: { x: number; y: number; vx: number; vy: number }, halfW: number, halfH: number) {
    for (const wall of this.map.walls) {
      const overlapX = Math.min(item.x + halfW, wall.x + wall.w) - Math.max(item.x - halfW, wall.x);
      const overlapY = Math.min(item.y + halfH, wall.y + wall.h) - Math.max(item.y - halfH, wall.y);
      if (overlapX > 0 && overlapY > 0) {
        if (overlapX < overlapY) {
          const sign = item.x < wall.x + wall.w * 0.5 ? -1 : 1;
          item.x += sign * overlapX;
          if ((sign < 0 && item.vx > 0) || (sign > 0 && item.vx < 0)) item.vx = 0;
        } else {
          const sign = item.y < wall.y + wall.h * 0.5 ? -1 : 1;
          item.y += sign * overlapY;
          if ((sign < 0 && item.vy > 0) || (sign > 0 && item.vy < 0)) item.vy = 0;
        }
      }
    }
  }

  private updatePickups(dt: number) {
    const tntToExplode: Array<{ item: Pickup; attacker: number | null }> = [];
    const tntItems: Pickup[] = [];

    for (const item of this.pickups) {
      item.age += dt;
      if (item.kind === 'tnt') {
        tntItems.push(item);

        const vx = item.vx ?? 0;
        const vy = item.vy ?? 0;
        if (Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5) {
          item.x += vx * dt;
          item.y += vy * dt;
          const friction = Math.exp(-8.5 * dt);
          const nextVx = vx * friction;
          const nextVy = vy * friction;
          if (Math.hypot(nextVx, nextVy) < 4) {
            item.vx = 0;
            item.vy = 0;
          } else {
            item.vx = nextVx;
            item.vy = nextVy;
          }
        }

        const tntState = { x: item.x, y: item.y, vx: item.vx ?? 0, vy: item.vy ?? 0 };
        this.resolveRectAgainstWalls(tntState, TNT_HALF_SIZE, TNT_HALF_SIZE);
        item.x = tntState.x;
        item.y = tntState.y;
        item.vx = tntState.vx;
        item.vy = tntState.vy;

        if (item.armed && item.countdown !== undefined) {
          item.countdown -= dt;
          const secCeil = Math.ceil(item.countdown);
          if (secCeil >= 1 && item.lastTickSecond !== secCeil) {
            item.lastTickSecond = secCeil;
            this.emitEvent('tnt_tick', item.x, item.y, secCeil);
          }
          if (item.countdown <= 0) {
            tntToExplode.push({ item, attacker: item.ownerId ?? null });
          }
        }
      }
    }

    for (const tnt of tntItems) {
      for (const box of this.boxes) {
        if (box.state !== 'active') continue;
        const overlapX = TNT_HALF_SIZE + box.w * 0.5 - Math.abs(box.x - tnt.x);
        const overlapY = TNT_HALF_SIZE + box.h * 0.5 - Math.abs(box.y - tnt.y);
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            const sign = tnt.x <= box.x ? 1 : -1;
            tnt.x -= sign * overlapX * 0.5;
            box.x += sign * overlapX * 0.5;
          } else {
            const sign = tnt.y <= box.y ? 1 : -1;
            tnt.y -= sign * overlapY * 0.5;
            box.y += sign * overlapY * 0.5;
          }
        }
      }
    }
    for (let i = 0; i < tntItems.length; i++) {
      for (let j = i + 1; j < tntItems.length; j++) {
        const a = tntItems[i];
        const b = tntItems[j];
        const overlapX = TNT_HALF_SIZE * 2 - Math.abs(b.x - a.x);
        const overlapY = TNT_HALF_SIZE * 2 - Math.abs(b.y - a.y);
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            const sign = a.x <= b.x ? 1 : -1;
            a.x -= sign * overlapX * 0.5;
            b.x += sign * overlapX * 0.5;
          } else {
            const sign = a.y <= b.y ? 1 : -1;
            a.y -= sign * overlapY * 0.5;
            b.y += sign * overlapY * 0.5;
          }
        }
      }
    }

    // Nitros detonate immediately on contact with Cardboard Boxes or TNT crates
    const nitrosToDetonate: Array<{ item: Pickup; attacker: number | null }> = [];
    for (const item of this.pickups) {
      if (item.kind !== 'nitro') continue;
      let triggered = false;

      for (const box of this.boxes) {
        if (box.state !== 'active') continue;
        const boxRect: WallRect = {
          x: box.x - box.w * 0.5,
          y: box.y - box.h * 0.5,
          w: box.w,
          h: box.h,
        };
        if (circleIntersectsRect(item.x, item.y, NITRO_RADIUS - 2, boxRect)) {
          nitrosToDetonate.push({ item, attacker: box.lastPusherId ?? null });
          triggered = true;
          break;
        }
      }
      if (triggered) continue;

      for (const tnt of tntItems) {
        const tntRect: WallRect = {
          x: tnt.x - TNT_HALF_SIZE,
          y: tnt.y - TNT_HALF_SIZE,
          w: TNT_HALF_SIZE * 2,
          h: TNT_HALF_SIZE * 2,
        };
        if (circleIntersectsRect(item.x, item.y, NITRO_RADIUS - 2, tntRect)) {
          nitrosToDetonate.push({ item, attacker: tnt.ownerId ?? null });
          break;
        }
      }
    }

    // Unlit/moving TNT crates pushed into broken water pits sink with a splash
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const item = this.pickups[i];
      if (!item || item.kind !== 'tnt') continue;
      for (const pit of this.icePits) {
        if (pit.broken && isPointInIcePit(item.x, item.y, pit, -12)) {
          this.pickups.splice(i, 1);
          this.emitEvent('splash', item.x, item.y);
          this.spawnParticles(item.x, item.y, '#7DD3FC', 14, 145);
          break;
        }
      }
    }

    for (const entry of nitrosToDetonate) {
      if (this.pickups.some((p) => p.id === entry.item.id)) {
        this.detonatePickup(entry.item, entry.attacker);
      }
    }

    for (const entry of tntToExplode) {
      if (this.pickups.some((p) => p.id === entry.item.id)) {
        this.detonatePickup(entry.item, entry.attacker);
      }
    }
  }

  private updatePlayers(dt: number) {
    for (const player of this.players) {
      if (!player.alive) {
        if (this.config.mode === 'BRAWL') {
          player.respawnTimer -= dt;
          if (player.respawnTimer <= 0) {
            this.respawnPlayer(player);
          }
        }
        continue;
      }

      if (player.hurtFlashTimer > 0) player.hurtFlashTimer = Math.max(0, player.hurtFlashTimer - dt);
      if (player.spawnInvulnTimer > 0) player.spawnInvulnTimer = Math.max(0, player.spawnInvulnTimer - dt);

      if (player.stunTimer > 0) {
        player.stunTimer = Math.max(0, player.stunTimer - dt);
        const friction = Math.exp(-6.5 * dt);
        player.vx *= friction;
        player.vy *= friction;
      } else if (player.isHuman) {
        if (player.isRemote) {
          this.applyAnalogInput(
            player,
            player.remoteActive,
            player.remoteAngle,
            player.remoteMagnitude,
            dt,
            player.remoteMoveAngle,
            Boolean(player.remoteAimActive)
          );
        } else if (this.controlScheme === 'CURSOR_SPACE') {
          this.applyAnalogInput(
            player,
            this.cursorInput.active,
            this.cursorInput.aimAngle,
            this.cursorInput.magnitude,
            dt,
            this.cursorInput.moveAngle,
            this.cursorInput.hasAim
          );
        } else {
          this.applyAnalogInput(
            player,
            this.joystick.active,
            this.joystick.angle,
            this.joystick.magnitude,
            dt
          );
        }
      } else {
        this.applyBotControls(player, dt);
      }

      player.x += player.vx * dt;
      player.y += player.vy * dt;

      // Push movable active cardboard boxes & movable TNT crates (including smooth corner-unstick slide!)
      for (const box of this.boxes) {
        if (box.state !== 'active') continue;
        if (this.pushMovableCrate(player, box, box.w * 0.5, box.h * 0.5)) {
          box.lastPusherId = player.id;
        }
      }

      for (const item of this.pickups) {
        if (item.kind !== 'tnt') continue;
        const tntCrate = {
          x: item.x,
          y: item.y,
          vx: item.vx ?? 0,
          vy: item.vy ?? 0,
        };
        if (this.pushMovableCrate(player, tntCrate, TNT_HALF_SIZE, TNT_HALF_SIZE)) {
          item.x = tntCrate.x;
          item.y = tntCrate.y;
          item.vx = tntCrate.vx;
          item.vy = tntCrate.vy;
          if (!item.armed) item.ownerId = player.id;
        }
      }

      for (let pass = 0; pass < 2; pass++) {
        for (const wall of this.map.walls) {
          const closestX = clamp(player.x, wall.x, wall.x + wall.w);
          const closestY = clamp(player.y, wall.y, wall.y + wall.h);
          const dx = player.x - closestX;
          const dy = player.y - closestY;
          const d2 = dx * dx + dy * dy;

          if (d2 < PLAYER_RADIUS * PLAYER_RADIUS) {
            const d = Math.sqrt(d2);
            if (d > 0.0001) {
              const overlap = PLAYER_RADIUS - d;
              player.x += (dx / d) * overlap;
              player.y += (dy / d) * overlap;
            } else {
              const leftPen = player.x - wall.x;
              const rightPen = wall.x + wall.w - player.x;
              const topPen = player.y - wall.y;
              const bottomPen = wall.y + wall.h - player.y;
              const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
              if (minPen === leftPen) player.x = wall.x - PLAYER_RADIUS;
              else if (minPen === rightPen) player.x = wall.x + wall.w + PLAYER_RADIUS;
              else if (minPen === topPen) player.y = wall.y - PLAYER_RADIUS;
              else player.y = wall.y + wall.h + PLAYER_RADIUS;
            }
          }
        }
      }
    }

    for (let i = 0; i < this.players.length; i++) {
      const a = this.players[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.players.length; j++) {
        const b = this.players[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = PLAYER_RADIUS * 2;
        if (d < minD && d > 0.001) {
          const overlap = (minD - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
      }
    }

    for (const player of this.players) {
      if (!player.alive) continue;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const item = this.pickups[i];
        if (!item) continue;
        const hitDist = PLAYER_RADIUS + item.radius - 2;
        if (dist(player.x, player.y, item.x, item.y) <= hitDist) {
          if (item.kind === 'bullet') {
            if (player.ammo < player.maxAmmo) {
              player.ammo += 1;
              this.pickups.splice(i, 1);
              this.emitEvent('pickup', item.x, item.y);
              this.spawnParticles(item.x, item.y, '#FACC15', 8, 95);
              this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 8), '+1 AMMO', '#FDE047');
            }
          } else if (item.kind === 'medkit') {
            if (player.hp < player.maxHp) {
              const healed = Math.min(MEDKIT_HEAL, player.maxHp - player.hp);
              player.hp += healed;
              this.pickups.splice(i, 1);
              this.emitEvent('heal', item.x, item.y);
              this.spawnParticles(item.x, item.y, '#34D399', 12, 110);
              this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 8), `+${healed} HP`, '#34D399');
            }
          } else if (item.kind === 'nitro') {
            this.detonatePickup(item, player.id);
          }
        }
      }
    }

    // Broken winter ice pits expose deep water -> instant knockout on falling in!
    if (this.icePits.length > 0) {
      for (const player of this.players) {
        if (!player.alive) continue;
        for (const pit of this.icePits) {
          if (!pit.broken) continue;
          if (isPointInIcePit(player.x, player.y, pit, -14)) {
            this.drownPlayer(player, player.lastHitBy);
            break;
          }
        }
      }
    }
  }

  private detectWallPins(cx: number, cy: number, halfW: number, halfH: number): { pinX: -1 | 0 | 1; pinY: -1 | 0 | 1 } {
    let pinX: -1 | 0 | 1 = 0;
    let pinY: -1 | 0 | 1 = 0;
    const tol = 4;

    for (const wall of this.map.walls) {
      const overlapY = Math.min(cy + halfH, wall.y + wall.h) - Math.max(cy - halfH, wall.y);
      if (overlapY > 4) {
        if (Math.abs(cx - halfW - (wall.x + wall.w)) <= tol) pinX = -1;
        else if (Math.abs(cx + halfW - wall.x) <= tol) pinX = 1;
      }
      const overlapX = Math.min(cx + halfW, wall.x + wall.w) - Math.max(cx - halfW, wall.x);
      if (overlapX > 4) {
        if (Math.abs(cy - halfH - (wall.y + wall.h)) <= tol) pinY = -1;
        else if (Math.abs(cy + halfH - wall.y) <= tol) pinY = 1;
      }
    }
    return { pinX, pinY };
  }

  private pushMovableCrate(
    player: Player,
    crate: { x: number; y: number; vx: number; vy: number },
    halfW: number,
    halfH: number
  ): boolean {
    const bx = crate.x - halfW;
    const by = crate.y - halfH;
    const bw = halfW * 2;
    const bh = halfH * 2;
    const closestX = clamp(player.x, bx, bx + bw);
    const closestY = clamp(player.y, by, by + bh);
    const dx = player.x - closestX;
    const dy = player.y - closestY;
    const d2 = dx * dx + dy * dy;
    if (d2 >= PLAYER_RADIUS * PLAYER_RADIUS) return false;

    const d = Math.sqrt(d2);
    let nx = 0;
    let ny = 0;
    let overlap = 0;
    if (d > 0.0001) {
      nx = dx / d;
      ny = dy / d;
      overlap = PLAYER_RADIUS - d;
    } else {
      const leftPen = player.x - bx;
      const rightPen = bx + bw - player.x;
      const topPen = player.y - by;
      const bottomPen = by + bh - player.y;
      const m = Math.min(leftPen, rightPen, topPen, bottomPen);
      if (m === leftPen) nx = -1;
      else if (m === rightPen) nx = 1;
      else if (m === topPen) ny = -1;
      else ny = 1;
      overlap = PLAYER_RADIUS + m;
    }

    const pins = this.detectWallPins(crate.x, crate.y, halfW, halfH);

    if (pins.pinX !== 0 && pins.pinY !== 0) {
      // Corner-pinned crate: slide smoothly out along the unblocked wall edge away from the player's body
      const escX = -pins.pinX;
      const escY = -pins.pinY;
      const relX = player.x - crate.x;
      const relY = player.y - crate.y;

      const xScore =
        Math.abs(relY) -
        Math.abs(relX) +
        (player.vx * escX > 35 ? 48 : player.vx * escX < -35 ? -20 : 0);
      const yScore =
        Math.abs(relX) -
        Math.abs(relY) +
        (player.vy * escY > 35 ? 48 : player.vy * escY < -35 ? -20 : 0);

      player.x += nx * overlap * 0.35;
      player.y += ny * overlap * 0.35;

      if (xScore >= yScore) {
        crate.x += escX * Math.max(overlap * 0.9, 6);
        crate.vx = escX * 225;
        crate.vy = 0;
      } else {
        crate.y += escY * Math.max(overlap * 0.9, 6);
        crate.vy = escY * 225;
        crate.vx = 0;
      }
      return true;
    }

    player.x += nx * overlap * 0.42;
    player.y += ny * overlap * 0.42;
    crate.x -= nx * overlap * 0.58;
    crate.y -= ny * overlap * 0.58;

    let pushVx = crate.vx - nx * 135 + player.vx * 0.35;
    let pushVy = crate.vy - ny * 135 + player.vy * 0.35;

    // If flush against a single wall, redirect inward push into lateral glide so crates slide smoothly along walls
    if (pins.pinX !== 0 && pushVx * pins.pinX > 0) {
      const lateralDir = Math.abs(player.vy) > 20 ? Math.sign(player.vy) : Math.sign(crate.y - player.y || 1);
      pushVy += lateralDir * Math.min(180, Math.abs(pushVx) * 0.85);
      pushVx = 0;
    }
    if (pins.pinY !== 0 && pushVy * pins.pinY > 0) {
      const lateralDir = Math.abs(player.vx) > 20 ? Math.sign(player.vx) : Math.sign(crate.x - player.x || 1);
      pushVx += lateralDir * Math.min(180, Math.abs(pushVy) * 0.85);
      pushVy = 0;
    }

    crate.vx = clamp(pushVx, -280, 280);
    crate.vy = clamp(pushVy, -280, 280);
    return true;
  }

  private applyAnalogInput(
    player: Player,
    active: boolean,
    aimAngle: number,
    magnitude: number,
    dt: number,
    moveAngle = aimAngle,
    allowIdleAim = false
  ) {
    if (allowIdleAim || (active && magnitude > 0.03)) {
      if (Number.isFinite(aimAngle)) {
        const diff = normalizeAngle(aimAngle - player.angle);
        const maxTurn = PLAYER_TURN_SPEED * dt;
        player.angle = normalizeAngle(player.angle + clamp(diff, -maxTurn, maxTurn));
      }
    }

    if (active) {
      const deadzone = 0.08;
      const normalizedRatio =
        magnitude <= deadzone ? 0 : (magnitude - deadzone) / (1 - deadzone);

      const targetSpeed = PLAYER_MAX_SPEED * normalizedRatio;
      const targetVx = Math.cos(moveAngle) * targetSpeed;
      const targetVy = Math.sin(moveAngle) * targetSpeed;

      const dvx = targetVx - player.vx;
      const dvy = targetVy - player.vy;
      const dv = Math.hypot(dvx, dvy);
      const maxStep = PLAYER_MAX_ACCEL * dt;
      if (dv <= maxStep) {
        player.vx = targetVx;
        player.vy = targetVy;
      } else {
        player.vx += (dvx / dv) * maxStep;
        player.vy += (dvy / dv) * maxStep;
      }
    } else {
      const stopFactor = Math.exp(-16 * dt);
      player.vx *= stopFactor;
      player.vy *= stopFactor;
      if (Math.hypot(player.vx, player.vy) < 4) {
        player.vx = 0;
        player.vy = 0;
      }
    }
  }

  private applyBotControls(bot: Player, dt: number) {
    const diff: BotDifficulty = this.config.difficulty;
    const reactionInterval = diff === 'RUTHLESS' ? 0.14 : diff === 'TACTICAL' ? 0.24 : 0.4;
    const aimSpread = diff === 'RUTHLESS' ? 0.04 : diff === 'TACTICAL' ? 0.11 : 0.24;

    bot.aiThinkTimer -= dt;
    bot.aiHoldShotTimer -= dt;

    let evadeX = 0;
    let evadeY = 0;

    for (const b of this.bullets) {
      if (b.ownerId === bot.id && b.age < BULLET_SELF_GRACE) continue;
      const d = dist(bot.x, bot.y, b.x, b.y);
      if (d < 210) {
        const bSpeed = Math.hypot(b.vx, b.vy) || 1;
        const relX = bot.x - b.x;
        const relY = bot.y - b.y;
        const dot = (relX * b.vx + relY * b.vy) / bSpeed;
        if (dot > -15 && dot < 210) {
          const perp = Math.abs((relX * b.vy - relY * b.vx) / bSpeed);
          if (perp < PLAYER_RADIUS + 34) {
            const side = relX * b.vy - relY * b.vx >= 0 ? 1 : -1;
            const weight = (210 - d) / 210;
            evadeX += (b.vy / bSpeed) * side * weight * 2.2;
            evadeY += (-b.vx / bSpeed) * side * weight * 2.2;
          }
        }
      }
    }

    for (const p of this.pickups) {
      if (p.kind === 'tnt' && p.armed) {
        const d = dist(bot.x, bot.y, p.x, p.y);
        if (d < TNT_BLAST_RADIUS + 42) {
          const away = Math.atan2(bot.y - p.y, bot.x - p.x);
          const urgency = ((TNT_BLAST_RADIUS + 42 - d) / TNT_BLAST_RADIUS) * 2.6;
          evadeX += Math.cos(away) * urgency;
          evadeY += Math.sin(away) * urgency;
        }
      } else if (p.kind === 'nitro') {
        const d = dist(bot.x, bot.y, p.x, p.y);
        if (d < NITRO_RADIUS + PLAYER_RADIUS + 20) {
          const away = Math.atan2(bot.y - p.y, bot.x - p.x);
          evadeX += Math.cos(away) * 2.0;
          evadeY += Math.sin(away) * 2.0;
        }
      }
    }

    for (const pit of this.icePits) {
      if (pit.broken && isPointInIcePit(bot.x, bot.y, pit, PLAYER_RADIUS + 42)) {
        const away = Math.atan2(bot.y - pit.y, bot.x - pit.x);
        evadeX += Math.cos(away) * 3.0;
        evadeY += Math.sin(away) * 3.0;
      }
    }

    const evading = Math.hypot(evadeX, evadeY) > 0.35;
    if (evading) {
      bot.aiTargetAngle = Math.atan2(evadeY, evadeX);
      bot.aiMoveRatio = 1.0;
    } else if (bot.aiThinkTimer <= 0) {
      bot.aiThinkTimer = reactionInterval + Math.random() * 0.12;
      if (Math.random() < 0.25) bot.aiStrafeDir *= -1;

      let goalX = this.map.width / 2;
      let goalY = this.map.height / 2;
      let moveRatio = 0.78;
      let wantsToShoot = false;
      let shootAngle = bot.angle;

      const medkits = this.pickups.filter((p) => p.kind === 'medkit');
      if (bot.hp <= 55 && medkits.length > 0) {
        let best = medkits[0];
        let bestD = dist(bot.x, bot.y, best.x, best.y);
        for (const m of medkits) {
          const d = dist(bot.x, bot.y, m.x, m.y);
          if (d < bestD) {
            best = m;
            bestD = d;
          }
        }
        goalX = best.x;
        goalY = best.y;
        moveRatio = 0.95;
      } else if (bot.ammo === 0) {
        const ammoPickups = this.pickups.filter((p) => p.kind === 'bullet');
        if (ammoPickups.length > 0) {
          let best = ammoPickups[0];
          let bestD = dist(bot.x, bot.y, best.x, best.y);
          for (const a of ammoPickups) {
            const d = dist(bot.x, bot.y, a.x, a.y);
            if (d < bestD) {
              best = a;
              bestD = d;
            }
          }
          goalX = best.x;
          goalY = best.y;
          moveRatio = 0.92;
        }
      } else {
        const enemies = this.players.filter(
          (p) => p.id !== bot.id && p.alive && !this.isTeammate(bot.id, p.id)
        );
        if (enemies.length > 0) {
          let target = enemies[0];
          let bestScore = -Infinity;
          for (const e of enemies) {
            const d = dist(bot.x, bot.y, e.x, e.y);
            // In immersive large map, bots don't magically snipe across 1200px fog
            const maxVision = this.map.immersive ? 650 : 1800;
            const visible = d < maxVision;
            const los = visible && this.hasLineOfSight(bot.x, bot.y, e.x, e.y);
            let score = -d * 0.35 + (los ? 190 : 0) + (e.stunTimer > 0 ? 110 : 0) + (100 - e.hp) * 1.0 + e.kills * 30;
            if (e.spawnInvulnTimer > 0) score -= 40;
            if (score > bestScore) {
              bestScore = score;
              target = e;
            }
          }

          const targetDist = dist(bot.x, bot.y, target.x, target.y);
          const inRange = !this.map.immersive || targetDist < 680;

          let explosiveShotAngle: number | null = null;
          if (inRange) {
            for (const n of this.pickups) {
              if (n.kind !== 'nitro' && !(n.kind === 'tnt' && !n.armed)) continue;
              const blastR = n.kind === 'tnt' ? TNT_BLAST_RADIUS : NITRO_BLAST_RADIUS;
              if (
                dist(n.x, n.y, target.x, target.y) < blastR - 10 &&
                dist(n.x, n.y, bot.x, bot.y) > blastR + 20 &&
                this.hasLineOfSight(bot.x, bot.y, n.x, n.y)
              ) {
                explosiveShotAngle = Math.atan2(n.y - bot.y, n.x - bot.x);
                break;
              }
            }
          }

          if (explosiveShotAngle !== null && bot.aiHoldShotTimer <= 0) {
            wantsToShoot = true;
            shootAngle = explosiveShotAngle + (Math.random() - 0.5) * aimSpread * 0.6;
          } else if (inRange && this.hasLineOfSight(bot.x, bot.y, target.x, target.y) && bot.aiHoldShotTimer <= 0) {
            const travelT = targetDist / BULLET_SPEED;
            const predX = target.x + target.vx * travelT * 0.78;
            const predY = target.y + target.vy * travelT * 0.78;
            wantsToShoot = true;
            shootAngle = Math.atan2(predY - bot.y, predX - bot.x) + (Math.random() - 0.5) * aimSpread;
          } else {
            const toTarget = Math.atan2(target.y - bot.y, target.x - bot.x);
            const strafeAngle = toTarget + bot.aiStrafeDir * 0.6;
            goalX = bot.x + Math.cos(strafeAngle) * 180;
            goalY = bot.y + Math.sin(strafeAngle) * 180;
            moveRatio = 0.8;

            if (inRange && diff !== 'CHILL' && bot.aiHoldShotTimer <= 0 && Math.random() < 0.2) {
              const bounceAngle = this.findTrickshotAngle(bot, target);
              if (bounceAngle !== null) {
                wantsToShoot = true;
                shootAngle = bounceAngle + (Math.random() - 0.5) * aimSpread * 0.5;
              }
            }
          }
        }
      }

      if (wantsToShoot && bot.ammo > 0) {
        bot.angle = shootAngle;
        bot.vx = 0;
        bot.vy = 0;
        this.fireBullet(bot);
        bot.aiHoldShotTimer = diff === 'RUTHLESS' ? 0.45 : diff === 'TACTICAL' ? 0.7 : 1.05;
        return;
      }

      let moveAngle = Math.atan2(goalY - bot.y, goalX - bot.x);
      const probeX = bot.x + Math.cos(moveAngle) * 50;
      const probeY = bot.y + Math.sin(moveAngle) * 50;
      for (const wall of this.map.walls) {
        if (circleIntersectsRect(probeX, probeY, PLAYER_RADIUS + 8, wall)) {
          moveAngle += bot.aiStrafeDir * 1.15;
          break;
        }
      }

      bot.aiTargetAngle = moveAngle;
      bot.aiMoveRatio = moveRatio;
    }

    const angleDiff = normalizeAngle(bot.aiTargetAngle - bot.angle);
    bot.angle = normalizeAngle(bot.angle + clamp(angleDiff, -8 * dt, 8 * dt));

    const targetSpeed = PLAYER_MAX_SPEED * bot.aiMoveRatio;
    const targetVx = Math.cos(bot.aiTargetAngle) * targetSpeed;
    const targetVy = Math.sin(bot.aiTargetAngle) * targetSpeed;
    const dvx = targetVx - bot.vx;
    const dvy = targetVy - bot.vy;
    const dv = Math.hypot(dvx, dvy);
    const maxStep = PLAYER_MAX_ACCEL * dt;
    if (dv <= maxStep) {
      bot.vx = targetVx;
      bot.vy = targetVy;
    } else {
      bot.vx += (dvx / dv) * maxStep;
      bot.vy += (dvy / dv) * maxStep;
    }
  }

  private hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    for (const wall of this.map.walls) {
      if (segmentIntersectsRect(x1, y1, x2, y2, wall)) return false;
    }
    return true;
  }

  private findTrickshotAngle(shooter: Player, target: Player): number | null {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      let x = shooter.x + Math.cos(a) * (PLAYER_RADIUS + 8);
      let y = shooter.y + Math.sin(a) * (PLAYER_RADIUS + 8);
      let vx = Math.cos(a) * BULLET_SPEED;
      let vy = Math.sin(a) * BULLET_SPEED;
      let bounces = 0;

      for (let step = 0; step < 58; step++) {
        const subDt = 0.02;
        x += vx * subDt;
        y += vy * subDt;

        for (const wall of this.map.walls) {
          const cx = clamp(x, wall.x, wall.x + wall.w);
          const cy = clamp(y, wall.y, wall.y + wall.h);
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy < BULLET_RADIUS * BULLET_RADIUS) {
            bounces++;
            if (Math.abs(dx) > Math.abs(dy)) vx = -vx;
            else vy = -vy;
            x += Math.sign(dx || vx) * 4;
            y += Math.sign(dy || vy) * 4;
            break;
          }
        }
        if (bounces > 2) break;
        if (bounces >= 1 && dist(x, y, target.x, target.y) < PLAYER_RADIUS + 18) {
          return a;
        }
      }
    }
    return null;
  }

  private fireBullet(player: Player) {
    player.ammo = Math.max(0, player.ammo - 1);
    player.shotsFired += 1;

    const muzzleDist = PLAYER_RADIUS + BULLET_RADIUS + 3;
    const bx = player.x + Math.cos(player.angle) * muzzleDist;
    const by = player.y + Math.sin(player.angle) * muzzleDist;

    const bullet: Bullet = {
      id: this.nextId++,
      ownerId: player.id,
      color: player.color,
      x: bx,
      y: by,
      vx: Math.cos(player.angle) * BULLET_SPEED,
      vy: Math.sin(player.angle) * BULLET_SPEED,
      radius: BULLET_RADIUS,
      bouncesLeft: BULLET_MAX_BOUNCES,
      maxBounces: BULLET_MAX_BOUNCES,
      age: 0,
      maxAge: BULLET_MAX_AGE,
      trail: [{ x: bx, y: by }],
    };

    this.bullets.push(bullet);
    player.vx -= Math.cos(player.angle) * 35;
    player.vy -= Math.sin(player.angle) * 35;

    this.emitEvent('shoot', bx, by);
    this.spawnParticles(bx, by, player.accentColor, 6, 120);
  }

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b) continue;
      b.age += dt;
      if (b.age >= b.maxAge) {
        this.spawnParticles(b.x, b.y, b.color, 5, 70);
        this.bullets.splice(i, 1);
        continue;
      }

      const moveDist = Math.hypot(b.vx, b.vy) * dt;
      const steps = Math.max(1, Math.ceil(moveDist / 4));
      const subDt = dt / steps;
      let destroyed = false;

      for (let s = 0; s < steps; s++) {
        b.x += b.vx * subDt;
        b.y += b.vy * subDt;

        let hitWall = false;
        for (const wall of this.map.walls) {
          const cx = clamp(b.x, wall.x, wall.x + wall.w);
          const cy = clamp(b.y, wall.y, wall.y + wall.h);
          const dx = b.x - cx;
          const dy = b.y - cy;
          const d2 = dx * dx + dy * dy;

          if (d2 < b.radius * b.radius) {
            const d = Math.sqrt(d2);
            let nx = 0;
            let ny = 0;
            if (d > 0.0001) {
              nx = dx / d;
              ny = dy / d;
            } else {
              const leftPen = b.x - wall.x;
              const rightPen = wall.x + wall.w - b.x;
              const topPen = b.y - wall.y;
              const bottomPen = wall.y + wall.h - b.y;
              const m = Math.min(leftPen, rightPen, topPen, bottomPen);
              if (m === leftPen) nx = -1;
              else if (m === rightPen) nx = 1;
              else if (m === topPen) ny = -1;
              else ny = 1;
            }

            const overlap = b.radius - d + 0.5;
            b.x += nx * overlap;
            b.y += ny * overlap;

            const dot = b.vx * nx + b.vy * ny;
            if (dot < 0) {
              b.vx -= 2 * dot * nx;
              b.vy -= 2 * dot * ny;
            }

            b.bouncesLeft -= 1;
            this.emitEvent('bounce', b.x, b.y);
            this.spawnParticles(b.x, b.y, wall.kind === 'metal' ? '#E2E8F0' : '#FDE047', 5, 110);
            hitWall = true;
            break;
          }
        }

        if (hitWall && b.bouncesLeft < 0) {
          this.spawnParticles(b.x, b.y, b.color, 7, 100);
          destroyed = true;
          break;
        }

        for (const box of this.boxes) {
          if (box.state !== 'active') continue;
          const rect: WallRect = {
            x: box.x - box.w * 0.5,
            y: box.y - box.h * 0.5,
            w: box.w,
            h: box.h,
          };
          if (circleIntersectsRect(b.x, b.y, b.radius, rect)) {
            this.punctureBox(box, b.vx, b.vy);
            destroyed = true;
            break;
          }
        }
        if (destroyed) break;

        for (let pIdx = this.pickups.length - 1; pIdx >= 0; pIdx--) {
          const p = this.pickups[pIdx];
          if (!p) continue;
          if (p.kind === 'nitro' && dist(b.x, b.y, p.x, p.y) <= b.radius + p.radius) {
            this.detonatePickup(p, b.ownerId);
            destroyed = true;
            break;
          }
          if (p.kind === 'tnt') {
            const tntRect: WallRect = {
              x: p.x - TNT_HALF_SIZE,
              y: p.y - TNT_HALF_SIZE,
              w: TNT_HALF_SIZE * 2,
              h: TNT_HALF_SIZE * 2,
            };
            if (circleIntersectsRect(b.x, b.y, b.radius, tntRect)) {
              const bSpeed = Math.hypot(b.vx, b.vy) || 1;
              const pushImpulse = 300;
              p.vx = (p.vx ?? 0) + (b.vx / bSpeed) * pushImpulse;
              p.vy = (p.vy ?? 0) + (b.vy / bSpeed) * pushImpulse;
              p.ownerId = b.ownerId;

              if (!p.armed) {
                p.armed = true;
                p.countdown = TNT_COUNTDOWN;
                p.maxCountdown = TNT_COUNTDOWN;
                p.lastTickSecond = 3;
                this.emitEvent('tnt_tick', p.x, p.y, 3);
                this.addFloatingText(p.x, p.y - (TNT_HALF_SIZE + 12), '3s FUSE!', '#FEF08A');
              }

              this.emitEvent('hit', p.x, p.y);
              this.spawnParticles(b.x, b.y, '#EF4444', 9, 140);
              this.spawnParticles(b.x, b.y, '#FEF08A', 5, 110);
              destroyed = true;
              break;
            }
          }
        }
        if (destroyed) break;

        for (const player of this.players) {
          if (!player.alive || player.stunTimer > 0) continue;
          if (player.id === b.ownerId && b.age < BULLET_SELF_GRACE) continue;
          if (player.id !== b.ownerId && this.isTeammate(b.ownerId, player.id)) continue;
          if (dist(b.x, b.y, player.x, player.y) <= b.radius + PLAYER_RADIUS) {
            const speed = Math.hypot(b.vx, b.vy) || 1;
            const knockX = (b.vx / speed) * 220;
            const knockY = (b.vy / speed) * 220;
            const owner = this.players.find((pl) => pl.id === b.ownerId);
            if (owner && owner.id !== player.id) owner.shotsHit += 1;

            this.applyDamage(player, BULLET_DAMAGE, b.ownerId, knockX, knockY);
            this.spawnParticles(b.x, b.y, b.color, 10, 150);
            destroyed = true;
            break;
          }
        }
        if (destroyed) break;
      }

      if (destroyed) {
        this.bullets.splice(i, 1);
      } else {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 12) b.trail.shift();
      }
    }
  }

  private detonatePickup(initialItem: Pickup, attackerId: number | null) {
    const queue: { item: Pickup; attacker: number | null }[] = [{ item: initialItem, attacker: attackerId }];
    const processedIds = new Set<number>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (processedIds.has(current.item.id)) continue;
      processedIds.add(current.item.id);

      const idx = this.pickups.findIndex((p) => p.id === current.item.id);
      if (idx !== -1) {
        this.pickups.splice(idx, 1);
      }

      const isTnt = current.item.kind === 'tnt';
      const blastRadius = isTnt ? TNT_BLAST_RADIUS : NITRO_BLAST_RADIUS;
      const blastDamage = isTnt ? TNT_DAMAGE : NITRO_DAMAGE;
      const blastColor = isTnt ? '#EF4444' : '#FB923C';

      this.explosions.push({
        id: this.nextId++,
        x: current.item.x,
        y: current.item.y,
        radius: blastRadius,
        age: 0,
        duration: 0.42,
        color: blastColor,
      });

      this.screenShake = Math.min(16, this.screenShake + (isTnt ? 11 : 8));
      this.emitEvent('explosion', current.item.x, current.item.y);
      this.spawnParticles(current.item.x, current.item.y, blastColor, isTnt ? 26 : 18, 250);
      this.spawnParticles(current.item.x, current.item.y, '#FEF08A', 10, 170);

      for (const player of this.players) {
        if (!player.alive) continue;
        if (
          current.attacker !== null &&
          current.attacker !== player.id &&
          this.isTeammate(current.attacker, player.id)
        ) {
          continue;
        }
        const d = dist(current.item.x, current.item.y, player.x, player.y);
        if (d <= blastRadius + PLAYER_RADIUS * 0.6) {
          const angle = Math.atan2(player.y - current.item.y, player.x - current.item.x);
          const knockForce = 290;
          this.applyDamage(
            player,
            blastDamage,
            current.attacker,
            Math.cos(angle) * knockForce,
            Math.sin(angle) * knockForce
          );
        }
      }

      for (const box of this.boxes) {
        if (box.state === 'active') {
          if (dist(current.item.x, current.item.y, box.x, box.y) <= blastRadius + box.w * 0.4) {
            this.punctureBox(box, box.x - current.item.x, box.y - current.item.y);
          }
        }
      }

      for (const other of this.pickups) {
        if ((other.kind === 'nitro' || other.kind === 'tnt') && !processedIds.has(other.id)) {
          if (dist(current.item.x, current.item.y, other.x, other.y) <= blastRadius) {
            queue.push({ item: other, attacker: current.attacker });
          }
        }
      }

      // Break fragile winter ice pits touched by Nitro or TNT blasts -> exposes deep water!
      for (const pit of this.icePits) {
        if (!pit.broken && circleOverlapsIcePit(current.item.x, current.item.y, blastRadius, pit)) {
          pit.broken = true;
          this.emitEvent('splash', pit.x, pit.y);
          this.spawnParticles(pit.x, pit.y, '#BAE6FD', 22, 220);
          this.spawnParticles(pit.x, pit.y, '#38BDF8', 14, 165);
          this.addFloatingText(pit.x, pit.y - 10, 'ICE BROKEN!', '#7DD3FC');

          for (const player of this.players) {
            if (!player.alive) continue;
            if (isPointInIcePit(player.x, player.y, pit, -14)) {
              this.drownPlayer(player, current.attacker ?? player.lastHitBy);
            }
          }
        }
      }
    }
  }

  public isTeammate(aId: number | null | undefined, bId: number | null | undefined): boolean {
    if (this.config.teamMode !== '2V2') return false;
    if (aId === null || aId === undefined || bId === null || bId === undefined) return false;
    const a = this.players.find((p) => p.id === aId);
    const b = this.players.find((p) => p.id === bId);
    return Boolean(a && b && a.team !== undefined && a.team === b.team);
  }

  private drownPlayer(player: Player, attackerId: number | null) {
    if (!player.alive) return;
    player.hp = 0;
    player.alive = false;
    player.deaths += 1;
    player.stunTimer = 0;
    player.ammo = 0;
    player.respawnTimer = RESPAWN_DELAY;

    if (attackerId !== null && attackerId !== player.id && !this.isTeammate(attackerId, player.id)) {
      const attacker = this.players.find((p) => p.id === attackerId);
      if (attacker) attacker.kills += 1;
    }

    this.emitEvent('splash', player.x, player.y);
    this.emitEvent('knockout', player.x, player.y);
    this.spawnParticles(player.x, player.y, '#BAE6FD', 18, 190);
    this.spawnParticles(player.x, player.y, '#38BDF8', 16, 150);
    this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 10), 'SPLASH KO!', '#7DD3FC');
  }

  private applyDamage(
    player: Player,
    amount: number,
    attackerId: number | null,
    knockVx: number,
    knockVy: number
  ) {
    if (!player.alive || player.spawnInvulnTimer > 0 || player.stunTimer > 0) return;
    if (attackerId !== null && attackerId !== player.id && this.isTeammate(attackerId, player.id)) {
      return;
    }

    player.hp = Math.max(0, player.hp - amount);
    player.hurtFlashTimer = 0.22;
    player.vx = knockVx;
    player.vy = knockVy;

    if (attackerId !== null && attackerId !== player.id) {
      player.lastHitBy = attackerId;
      const attacker = this.players.find((p) => p.id === attackerId);
      if (attacker) attacker.damageDealt += amount;
    }

    if (player.hp > 0) {
      player.stunTimer = STUN_DURATION;
      this.emitEvent('hit', player.x, player.y);
      this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 10), `-${amount}`, '#FDA4AF');
      if (player.hp === 1) {
        this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 28), '1 HP CLUTCH!', '#FACC15');
      }
    } else {
      player.alive = false;
      player.deaths += 1;
      player.stunTimer = 0;
      player.ammo = 0;
      player.respawnTimer = RESPAWN_DELAY;

      if (attackerId !== null && attackerId !== player.id) {
        const attacker = this.players.find((p) => p.id === attackerId);
        if (attacker) attacker.kills += 1;
      } else if (attackerId === player.id) {
        this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 28), 'SELF KO', '#F87171');
      }

      this.emitEvent('knockout', player.x, player.y);
      this.spawnParticles(player.x, player.y, player.color, 24, 210);
      this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 10), 'KO!', '#F43F5E');
    }
  }

  private respawnPlayer(player: Player) {
    let bestSpawn = this.map.spawns[player.id];
    let bestMinEnemyDist = -1;
    for (const sp of this.map.spawns) {
      let minD = Infinity;
      for (const other of this.players) {
        if (other.id !== player.id && other.alive && !this.isTeammate(player.id, other.id)) {
          minD = Math.min(minD, dist(sp.x, sp.y, other.x, other.y));
        }
      }
      if (minD > bestMinEnemyDist) {
        bestMinEnemyDist = minD;
        bestSpawn = sp;
      }
    }

    player.x = bestSpawn.x;
    player.y = bestSpawn.y;
    player.vx = 0;
    player.vy = 0;
    player.hp = PLAYER_MAX_HP;
    player.ammo = 0;
    player.stunTimer = 0;
    player.alive = true;
    player.spawnInvulnTimer = SPAWN_INVULN_DURATION;
    player.angle = Math.atan2(this.map.height / 2 - bestSpawn.y, this.map.width / 2 - bestSpawn.x);
    this.spawnParticles(player.x, player.y, player.color, 14, 120);
    this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 10), 'SPAWN!', player.accentColor);
  }

  private checkWinConditions() {
    if (this.players.length <= 1) return;

    if (this.config.teamMode === '2V2') {
      const team0 = this.players.filter((p) => p.team === 0);
      const team1 = this.players.filter((p) => p.team === 1);
      const team0Kills = team0.reduce((sum, p) => sum + p.kills, 0);
      const team1Kills = team1.reduce((sum, p) => sum + p.kills, 0);

      if (this.config.mode === 'ELIMINATION') {
        const alive0 = team0.filter((p) => p.alive);
        const alive1 = team1.filter((p) => p.alive);
        if (alive0.length > 0 && alive1.length === 0) {
          this.winnerTeam = 0;
          this.winnerId = alive0[0].id;
          this.winnerReason = 'Team Alpha wins Last Standing';
          this.emitEvent('victory', alive0[0].x, alive0[0].y);
        } else if (alive1.length > 0 && alive0.length === 0) {
          this.winnerTeam = 1;
          this.winnerId = alive1[0].id;
          this.winnerReason = 'Team Bravo wins Last Standing';
          this.emitEvent('victory', alive1[0].x, alive1[0].y);
        } else if (alive0.length === 0 && alive1.length === 0) {
          const team0Dmg = team0.reduce((sum, p) => sum + p.damageDealt, 0);
          const team1Dmg = team1.reduce((sum, p) => sum + p.damageDealt, 0);
          const winTeam = team0Kills > team1Kills || (team0Kills === team1Kills && team0Dmg >= team1Dmg) ? 0 : 1;
          const mvp = (winTeam === 0 ? team0 : team1)[0] ?? this.players[0];
          this.winnerTeam = winTeam;
          this.winnerId = mvp.id;
          this.winnerReason = `Double knockout — ${winTeam === 0 ? 'Team Alpha' : 'Team Bravo'} wins on points`;
          this.emitEvent('victory', mvp.x, mvp.y);
        }
      } else {
        if (team0Kills >= this.config.targetKills) {
          const mvp = [...team0].sort((a, b) => b.kills - a.kills)[0] ?? this.players[0];
          this.winnerTeam = 0;
          this.winnerId = mvp.id;
          this.winnerReason = `Team Alpha reached ${this.config.targetKills} team knockouts`;
          this.emitEvent('victory', mvp.x, mvp.y);
        } else if (team1Kills >= this.config.targetKills) {
          const mvp = [...team1].sort((a, b) => b.kills - a.kills)[0] ?? this.players[0];
          this.winnerTeam = 1;
          this.winnerId = mvp.id;
          this.winnerReason = `Team Bravo reached ${this.config.targetKills} team knockouts`;
          this.emitEvent('victory', mvp.x, mvp.y);
        }
      }
      return;
    }

    if (this.config.mode === 'ELIMINATION') {
      const alivePlayers = this.players.filter((p) => p.alive);
      if (alivePlayers.length === 1) {
        this.winnerId = alivePlayers[0].id;
        this.winnerReason = `${alivePlayers[0].name} is the last player standing`;
        this.emitEvent('victory', alivePlayers[0].x, alivePlayers[0].y);
      } else if (alivePlayers.length === 0) {
        const sorted = [...this.players].sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt);
        this.winnerId = sorted[0].id;
        this.winnerReason = `Double knockout — ${sorted[0].name} wins on points`;
        this.emitEvent('victory', sorted[0].x, sorted[0].y);
      }
    } else {
      const champ = this.players.find((p) => p.kills >= this.config.targetKills);
      if (champ) {
        this.winnerId = champ.id;
        this.winnerReason = `${champ.name} reached ${this.config.targetKills} knockouts`;
        this.emitEvent('victory', champ.x, champ.y);
      }
    }
  }

  private spawnParticles(x: number, y: number, color: string, count: number, maxSpeed: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 35 + Math.random() * maxSpeed;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        radius: 2 + Math.random() * 3.5,
        color,
        age: 0,
        duration: 0.25 + Math.random() * 0.3,
      });
    }
  }

  private addFloatingText(x: number, y: number, text: string, color: string) {
    this.floatingTexts.push({
      id: this.nextId++,
      x,
      y,
      text,
      color,
      age: 0,
      duration: 0.85,
    });
  }

  private updateParticlesAndTexts(dt: number) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.age += dt;
      if (ex.age >= ex.duration) this.explosions.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.age += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.exp(-5 * dt);
      pt.vy *= Math.exp(-5 * dt);
      if (pt.age >= pt.duration) this.particles.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.age += dt;
      ft.y -= 28 * dt;
      if (ft.age >= ft.duration) this.floatingTexts.splice(i, 1);
    }
  }

  public getSnapshot(localPlayerId = 0): GameSnapshot {
    return {
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        isHuman: p.id === localPlayerId,
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
      elapsedTime: this.elapsedTime,
      activeBullets: this.bullets.length,
      teamMode: this.config.teamMode ?? 'FFA',
      winnerId: this.winnerId,
      winnerTeam: this.winnerTeam,
      winnerReason: this.winnerReason,
    };
  }

  public toWorldSyncState(): WorldSyncState {
    const events = this.drainEvents();
    return {
      mapId: this.map.id,
      immersive: this.map.immersive,
      extraDark: Boolean(this.config.extraDark),
      teamMode: this.config.teamMode ?? 'FFA',
      elapsedTime: this.elapsedTime,
      screenShake: this.screenShake,
      winnerId: this.winnerId,
      winnerTeam: this.winnerTeam,
      winnerReason: this.winnerReason,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        color: p.color,
        accentColor: p.accentColor,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        vx: Math.round(p.vx),
        vy: Math.round(p.vy),
        angle: Math.round(p.angle * 1000) / 1000,
        hp: p.hp,
        maxHp: p.maxHp,
        ammo: p.ammo,
        maxAmmo: p.maxAmmo,
        stunTimer: Math.round(p.stunTimer * 100) / 100,
        hurtFlashTimer: Math.round(p.hurtFlashTimer * 100) / 100,
        respawnTimer: Math.round(p.respawnTimer * 100) / 100,
        spawnInvulnTimer: Math.round(p.spawnInvulnTimer * 100) / 100,
        alive: p.alive,
        kills: p.kills,
        deaths: p.deaths,
        damageDealt: p.damageDealt,
      })),
      bullets: this.bullets,
      pickups: this.pickups,
      boxes: this.boxes,
      icePits: this.icePits,
      explosions: this.explosions,
      particles: this.particles,
      floatingTexts: this.floatingTexts,
      events,
    };
  }
}
