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
  DEFAULT_MATCH_MODIFIERS,
  type EngineEvent,
  type Explosion,
  type FloatingText,
  type FloorLevel,
  type GameSnapshot,
  type IcePit,
  type JoystickState,
  KILL_STREAK_WINDOW,
  LIBRARY_BOOKS_PER_PLAYER,
  LIBRARY_BRAWL_MAX_HEARTS,
  LIBRARY_CODE_LEN,
  LIBRARY_HEARING_RADIUS,
  LIBRARY_INTRO_DURATION,
  LIBRARY_SHAPES,
  type LibraryBookFace,
  type LibraryBookSpot,
  type LibraryClue,
  type LibraryDoor,
  type LibraryMatchState,
  type LibraryMonsterState,
  type LibraryShape,
  MEDKIT_HEAL,
  MEDKIT_RADIUS,
  MONSTER_RADIUS,
  MONSTER_STUN_DURATION,
  type MatchConfig,
  type MatchModifiers,
  type ModifierLevel,
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

function isWallOnFloor(wall: WallRect, floor: FloorLevel): boolean {
  return wall.floor === undefined || wall.floor === floor;
}

function sameFloor(a?: FloorLevel, b?: FloorLevel): boolean {
  return (a ?? 0) === (b ?? 0);
}

const SPAWN_RATE_MULTS: Record<ModifierLevel, number> = {
  LOW: 0.6,
  MEDIUM: 1.0,
  HIGH: 1.55,
};

const PLAYER_SPEED_MULTS: Record<ModifierLevel, number> = {
  LOW: 0.78,
  MEDIUM: 1.0,
  HIGH: 1.26,
};

const BULLET_SPEED_MULTS: Record<ModifierLevel, number> = {
  LOW: 0.76,
  MEDIUM: 1.0,
  HIGH: 1.32,
};

const BULLET_CAP_VALUES: Record<ModifierLevel, number> = {
  LOW: 3,
  MEDIUM: 5,
  HIGH: 8,
};

const STUN_TIME_VALUES: Record<ModifierLevel, number> = {
  LOW: 0.45,
  MEDIUM: STUN_DURATION,
  HIGH: 1.45,
};

export function canCollectBookSpot(
  player: { x: number; y: number; floor?: FloorLevel },
  book: LibraryBookSpot,
  walls: WallRect[]
): boolean {
  const pFloor = player.floor ?? 0;
  if (book.collected || book.floor !== pFloor) return false;
  if (Math.hypot(book.x - player.x, book.y - player.y) > 88) return false;

  if (book.face === 'W' && player.x > book.x + 12) return false;
  if (book.face === 'E' && player.x < book.x - 12) return false;
  if (book.face === 'N' && player.y > book.y + 12) return false;
  if (book.face === 'S' && player.y < book.y - 12) return false;

  for (const wall of walls) {
    if (wall.kind !== 'bookshelf' || !isWallOnFloor(wall, pFloor)) continue;
    if (segmentIntersectsRect(player.x, player.y, book.x, book.y, wall)) {
      return false;
    }
  }
  return true;
}

interface NavNode {
  id: number;
  x: number;
  y: number;
  floor: FloorLevel;
  isStair: boolean;
  neighbors: number[];
}

interface BotAiMemory {
  patrolX: number;
  patrolY: number;
  patrolFloor: FloorLevel;
  patrolTimer: number;
  scanPhase: number;
  lastSeenEnemyId: number | null;
  lastSeenX: number;
  lastSeenY: number;
  lastSeenFloor: FloorLevel;
  lastSeenTimer: number;
  rageBaitTimer: number;
  rageBaitCooldown: number;
  dialTimer: number;
  dialMistakeDone: boolean;
  lastProgressX: number;
  lastProgressY: number;
  stuckTimer: number;
  unstickTimer: number;
  unstickAngle: number;
}

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
  public libraryState?: LibraryMatchState;

  private nextId = 1;
  private bulletSpawnTimer = 1.4;
  private nitroSpawnTimer = 4.5;
  private tntSpawnTimer = 7.0;
  private medkitSpawnTimer = 9.0;
  private boxSpawnTimer = 4.0;
  private rapidStreaks = new Map<number, { count: number; lastKillAt: number }>();

  private navNodes: NavNode[] = [];
  private botNavNodes: NavNode[] = [];
  private monsterPath: NavNode[] = [];
  private monsterPathTimer = 0;
  private monsterStepTimer = 0.25;
  private monsterRageSpeedScale = 1.0;
  private monsterHearCheckTimer = 0;
  private monsterLastProgressX = 0;
  private monsterLastProgressY = 0;
  private monsterStuckTimer = 0;
  private monsterTransFromX = 0;
  private monsterTransFromY = 0;
  private monsterTransToX = 0;
  private monsterTransToY = 0;
  private librarySolutions = new Map<number, number[]>();
  private libraryBookQueues = new Map<number, LibraryClue[]>();
  private libraryCollectedSpots = new Set<number>();
  private botPaths = new Map<number, { nodes: NavNode[]; timer: number; goalX: number; goalY: number; goalFloor: FloorLevel }>();
  private botCodeCooldown = new Map<number, number>();
  private botAiMemory = new Map<number, BotAiMemory>();

  private getModifiers(): MatchModifiers {
    return this.config.modifiers ?? DEFAULT_MATCH_MODIFIERS;
  }

  private getPlayerMaxSpeed(): number {
    return PLAYER_MAX_SPEED * PLAYER_SPEED_MULTS[this.getModifiers().playerSpeed];
  }

  private getBulletSpeed(): number {
    return BULLET_SPEED * BULLET_SPEED_MULTS[this.getModifiers().bulletSpeed];
  }

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
    this.rapidStreaks.clear();
    this.libraryState = undefined;
    this.navNodes = [];
    this.botNavNodes = [];
    this.monsterPath = [];
    this.monsterPathTimer = 0;
    this.monsterStepTimer = 0.25;
    this.monsterRageSpeedScale = 1.0;
    this.monsterHearCheckTimer = 0;
    this.monsterLastProgressX = 0;
    this.monsterLastProgressY = 0;
    this.monsterStuckTimer = 0;
    this.monsterTransFromX = 0;
    this.monsterTransFromY = 0;
    this.monsterTransToX = 0;
    this.monsterTransToY = 0;
    this.librarySolutions.clear();
    this.libraryBookQueues.clear();
    this.libraryCollectedSpots.clear();
    this.botPaths.clear();
    this.botCodeCooldown.clear();
    this.botAiMemory.clear();

    const mods = this.getModifiers();
    const isImmersive = this.map.immersive;
    const isLibrary = this.map.id === 'library';
    this.bulletSpawnTimer = (isLibrary ? 1.8 : isImmersive ? 1.5 : 2.0) / SPAWN_RATE_MULTS[mods.bulletSpawn];
    this.nitroSpawnTimer = (isLibrary ? 12.0 : isImmersive ? 11.5 : 6.0) / SPAWN_RATE_MULTS[mods.nitroSpawn];
    this.tntSpawnTimer = (isLibrary ? 9.0 : isImmersive ? 7.5 : 9.0) / SPAWN_RATE_MULTS[mods.tntSpawn];
    this.medkitSpawnTimer = (isLibrary ? 10.5 : isImmersive ? 9.0 : 11.0) / SPAWN_RATE_MULTS[mods.medkitSpawn];
    this.boxSpawnTimer = isLibrary ? 3.5 : isImmersive ? 2.5 : 2.4;

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

    const maxAmmo = BULLET_CAP_VALUES[mods.bulletCapacity] ?? PLAYER_MAX_AMMO;

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
        finish: palette.finish ?? 'solid',
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        angle: aimCenterAngle,
        floor: isLibrary ? 1 : 0,
        stairBlend: isLibrary ? 1 : 0,
        hp: PLAYER_MAX_HP,
        maxHp: PLAYER_MAX_HP,
        ammo: 0,
        maxAmmo,
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
        aiMoveRatio: isLibrary ? 0.72 : 0.72,
        aiHoldShotTimer: 0.7,
      };
    });

    if (isLibrary) {
      this.buildLibraryNavGraph();
      this.initLibraryMatchState();
    }

    // Calm initial pickups & movable cardboard cover boxes spread across the arena
    const initBullets = isLibrary ? 7 : isImmersive ? 5 : 3;
    const initNitros = isLibrary ? 2 : 1;
    const initTnts = isLibrary ? 1 : 0;
    const initBoxes = isLibrary ? 12 : isImmersive ? 10 : 6;
    for (let i = 0; i < initBullets; i++) this.spawnPickup('bullet');
    for (let i = 0; i < initNitros; i++) this.spawnPickup('nitro');
    for (let i = 0; i < initTnts; i++) this.spawnPickup('tnt');
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

  private emitEvent(
    type: EngineEvent['type'],
    x: number,
    y: number,
    value?: number,
    playerId?: number,
    floor?: FloorLevel
  ) {
    this.events.push({ type, x, y, value, playerId, floor });
  }

  public update(dt: number) {
    if (this.winnerId !== null) {
      this.updateParticlesAndTexts(dt);
      this.screenShake = Math.max(0, this.screenShake - dt * 28);
      return;
    }

    // 5-second Library intro / loading screen countdown before action begins
    if (this.libraryState && this.libraryState.introTimer > 0) {
      this.libraryState.introTimer = Math.max(0, this.libraryState.introTimer - dt);
      return;
    }

    this.elapsedTime += dt;
    this.screenShake = Math.max(0, this.screenShake - dt * 28);

    this.updateSpawners(dt);
    this.updatePlayers(dt);
    this.updateBoxes(dt);
    this.updatePickups(dt);
    this.updateBullets(dt);
    if (this.libraryState) {
      this.updateLibraryMonster(dt);
    }
    this.updateParticlesAndTexts(dt);
    this.checkWinConditions();
  }

  private updateSpawners(dt: number) {
    const mods = this.getModifiers();
    const bMult = SPAWN_RATE_MULTS[mods.bulletSpawn];
    const nMult = SPAWN_RATE_MULTS[mods.nitroSpawn];
    const tMult = SPAWN_RATE_MULTS[mods.tntSpawn];
    const mMult = SPAWN_RATE_MULTS[mods.medkitSpawn];

    const isImmersive = this.map.immersive;
    const bulletCap = Math.max(2, Math.round((isImmersive ? 9 : 5) * bMult));
    const nitroCap = Math.max(1, Math.round((isImmersive ? 2 : 2) * nMult));
    const tntCap = Math.max(1, Math.round((isImmersive ? 2 : 1) * tMult));
    const medkitCap = Math.max(1, Math.round((isImmersive ? 2 : 1) * mMult));
    const boxCap = isImmersive ? 15 : 9;

    const bulletInterval = (isImmersive ? 2.1 : 2.6) / bMult;
    const nitroInterval = (isImmersive ? 13.5 : 8.0) / nMult;
    const tntInterval = (isImmersive ? 9.5 : 11.5) / tMult;
    const medkitInterval = (isImmersive ? 11.5 : 13.5) / mMult;
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

  private isPointWalkableOnFloor(x: number, y: number, radius: number, floor: FloorLevel): boolean {
    if (x < ARENA_WALL_THICKNESS + radius || x > this.map.width - ARENA_WALL_THICKNESS - radius) {
      return false;
    }
    if (y < ARENA_WALL_THICKNESS + radius || y > this.map.height - ARENA_WALL_THICKNESS - radius) {
      return false;
    }
    if (this.map.id === 'library' && floor === 1) {
      const inUpper = (this.map.upperZones ?? []).some(
        (z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h
      );
      const onStair = (this.map.stairs ?? []).some(
        (s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h
      );
      if (!inUpper && !onStair) return false;
    }
    for (const wall of this.map.walls) {
      if (!isWallOnFloor(wall, floor)) continue;
      if (circleIntersectsRect(x, y, radius, wall)) return false;
    }
    return true;
  }

  private isSegmentClearOnFloor(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radius: number,
    floor: FloorLevel
  ): boolean {
    const d = dist(x1, y1, x2, y2);
    const steps = Math.max(2, Math.ceil(d / 18));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      if (!this.isPointWalkableOnFloor(px, py, radius, floor)) return false;
    }
    return true;
  }

  private findFreeSpot(radius: number, targetFloor?: FloorLevel): (Vec2 & { floor: FloorLevel }) | null {
    const pad = ARENA_WALL_THICKNESS + radius + 24;
    const isLibrary = this.map.id === 'library';
    for (let attempt = 0; attempt < 96; attempt++) {
      const floor: FloorLevel =
        targetFloor !== undefined ? targetFloor : isLibrary ? (attempt % 2 === 0 ? 0 : 1) : 0;
      const x = pad + Math.random() * (this.map.width - pad * 2);
      const y = pad + Math.random() * (this.map.height - pad * 2);

      if (!this.isPointWalkableOnFloor(x, y, radius + 12, floor)) continue;

      // Avoid spawning inside staircase ramps on Library
      if (
        isLibrary &&
        (this.map.stairs ?? []).some(
          (s) => x >= s.x - 16 && x <= s.x + s.w + 16 && y >= s.y - 16 && y <= s.y + s.h + 16
        )
      ) {
        continue;
      }

      let blocked = false;
      for (const p of this.players) {
        if (p.alive && sameFloor(p.floor, floor) && dist(x, y, p.x, p.y) < radius + PLAYER_RADIUS + 48) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      for (const item of this.pickups) {
        if (sameFloor(item.floor, floor) && dist(x, y, item.x, item.y) < radius + item.radius + 44) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      for (const box of this.boxes) {
        if (sameFloor(box.floor, floor) && dist(x, y, box.x, box.y) < radius + box.w * 0.62 + 16) {
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
      if (!blocked) return { x, y, floor };
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
      floor: spot.floor,
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
    this.emitEvent('hit', box.x, box.y, 1, undefined, box.floor ?? 0);
    this.spawnParticles(box.x, box.y, '#D97706', 10, 130, box.floor ?? 0);
    this.spawnParticles(box.x, box.y, '#FDE68A', 5, 95, box.floor ?? 0);
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
      const boxFloor = box.floor ?? 0;
      for (const wall of this.map.walls) {
        if (!isWallOnFloor(wall, boxFloor)) continue;
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
        if (!sameFloor(a.floor, b.floor)) continue;
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
      floor: spot.floor,
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

  private resolveRectAgainstWalls(
    item: { x: number; y: number; vx: number; vy: number; floor?: FloorLevel },
    halfW: number,
    halfH: number
  ) {
    const floor = item.floor ?? 0;
    for (const wall of this.map.walls) {
      if (!isWallOnFloor(wall, floor)) continue;
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

        const tntState = { x: item.x, y: item.y, vx: item.vx ?? 0, vy: item.vy ?? 0, floor: item.floor ?? 0 };
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
            this.emitEvent('tnt_tick', item.x, item.y, secCeil, undefined, item.floor ?? 0);
          }
          if (item.countdown <= 0) {
            tntToExplode.push({ item, attacker: item.ownerId ?? null });
          }
        }
      }
    }

    for (const tnt of tntItems) {
      for (const box of this.boxes) {
        if (box.state !== 'active' || !sameFloor(box.floor, tnt.floor)) continue;
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
        if (!sameFloor(a.floor, b.floor)) continue;
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
        if (box.state !== 'active' || !sameFloor(box.floor, item.floor)) continue;
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
        if (!sameFloor(tnt.floor, item.floor)) continue;
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
          const prog = this.libraryState?.playerProgress.find((pp) => pp.playerId === player.id);
          const blockedByLibrary = Boolean(
            prog && (prog.unlocked || prog.eliminated || (prog.hearts ?? LIBRARY_BRAWL_MAX_HEARTS) <= 0)
          );
          if (!blockedByLibrary && player.respawnTimer > 0) {
            player.respawnTimer -= dt;
            if (player.respawnTimer <= 0) {
              this.respawnPlayer(player);
            }
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
      this.updateEntityFloorAndBlend(player);

      // Push movable active cardboard boxes & movable TNT crates (including smooth corner-unstick slide!)
      for (const box of this.boxes) {
        if (box.state !== 'active' || !sameFloor(box.floor, player.floor)) continue;
        if (this.pushMovableCrate(player, box, box.w * 0.5, box.h * 0.5)) {
          box.lastPusherId = player.id;
        }
      }

      for (const item of this.pickups) {
        if (item.kind !== 'tnt' || !sameFloor(item.floor, player.floor)) continue;
        const tntCrate = {
          x: item.x,
          y: item.y,
          vx: item.vx ?? 0,
          vy: item.vy ?? 0,
          floor: item.floor ?? 0,
        };
        if (this.pushMovableCrate(player, tntCrate, TNT_HALF_SIZE, TNT_HALF_SIZE)) {
          item.x = tntCrate.x;
          item.y = tntCrate.y;
          item.vx = tntCrate.vx;
          item.vy = tntCrate.vy;
          if (!item.armed) item.ownerId = player.id;
        }
      }

      const pFloor = player.floor ?? 0;
      for (let pass = 0; pass < 2; pass++) {
        for (const wall of this.map.walls) {
          if (!isWallOnFloor(wall, pFloor)) continue;
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
      this.updateEntityFloorAndBlend(player);
    }

    for (let i = 0; i < this.players.length; i++) {
      const a = this.players[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.players.length; j++) {
        const b = this.players[j];
        if (!b.alive || !sameFloor(a.floor, b.floor)) continue;
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
        if (!item || !sameFloor(item.floor, player.floor)) continue;
        const hitDist = PLAYER_RADIUS + item.radius - 2;
        if (dist(player.x, player.y, item.x, item.y) <= hitDist) {
          if (item.kind === 'bullet') {
            if (player.ammo < player.maxAmmo) {
              player.ammo += 1;
              this.pickups.splice(i, 1);
              this.emitEvent('pickup', item.x, item.y, player.id, undefined, item.floor ?? 0);
              this.spawnParticles(item.x, item.y, '#FACC15', 8, 95, item.floor ?? 0);
              this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 8), '+1 AMMO', '#FDE047', item.floor ?? 0);
            }
          } else if (item.kind === 'medkit') {
            if (player.hp < player.maxHp) {
              const healed = Math.min(MEDKIT_HEAL, player.maxHp - player.hp);
              player.hp += healed;
              this.pickups.splice(i, 1);
              this.emitEvent('heal', item.x, item.y, undefined, undefined, item.floor ?? 0);
              this.spawnParticles(item.x, item.y, '#34D399', 12, 110, item.floor ?? 0);
              this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 8), `+${healed} HP`, '#34D399', item.floor ?? 0);
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

  private detectWallPins(
    cx: number,
    cy: number,
    halfW: number,
    halfH: number,
    floor: FloorLevel = 0
  ): { pinX: -1 | 0 | 1; pinY: -1 | 0 | 1 } {
    let pinX: -1 | 0 | 1 = 0;
    let pinY: -1 | 0 | 1 = 0;
    const tol = 4;

    for (const wall of this.map.walls) {
      if (!isWallOnFloor(wall, floor)) continue;
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
    crate: { x: number; y: number; vx: number; vy: number; floor?: FloorLevel },
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

    const pins = this.detectWallPins(crate.x, crate.y, halfW, halfH, crate.floor ?? 0);

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

      const targetSpeed = this.getPlayerMaxSpeed() * normalizedRatio;
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

  private getBotMemory(bot: Player): BotAiMemory {
    let mem = this.botAiMemory.get(bot.id);
    if (!mem) {
      mem = {
        patrolX: this.map.width * 0.5,
        patrolY: this.map.height * 0.5,
        patrolFloor: bot.floor ?? 0,
        patrolTimer: 0,
        scanPhase: bot.id * 1.7,
        lastSeenEnemyId: null,
        lastSeenX: bot.x,
        lastSeenY: bot.y,
        lastSeenFloor: bot.floor ?? 0,
        lastSeenTimer: 0,
        rageBaitTimer: 0,
        rageBaitCooldown: 2.5,
        dialTimer: 0,
        dialMistakeDone: false,
        lastProgressX: bot.x,
        lastProgressY: bot.y,
        stuckTimer: 0,
        unstickTimer: 0,
        unstickAngle: bot.angle,
      };
      this.botAiMemory.set(bot.id, mem);
    }
    return mem;
  }

  private canBotSeePoint(
    bot: Player,
    tx: number,
    ty: number,
    targetFloor: FloorLevel = 0,
    isGlowingObject = false
  ): boolean {
    const bFloor = bot.floor ?? 0;
    if (!sameFloor(bFloor, targetFloor)) return false;
    const d = dist(bot.x, bot.y, tx, ty);
    if (this.map.immersive) {
      const maxRange = this.config.extraDark ? (isGlowingObject ? 470 : 450) : 560;
      if (d > maxRange) return false;
      if (this.config.extraDark) {
        const ambientAura = isGlowingObject ? 290 : 208;
        if (d > ambientAura) {
          const angDiff = Math.abs(normalizeAngle(Math.atan2(ty - bot.y, tx - bot.x) - bot.angle));
          if (angDiff > 0.68) return false;
        }
      }
    }
    return this.hasLineOfSight(bot.x, bot.y, tx, ty, bFloor);
  }

  private pickClearMoveAngle(
    bot: Player,
    desiredAngle: number,
    probeDist = 72,
    strafeBias = 1
  ): number {
    const bFloor = bot.floor ?? 0;
    const clearR = PLAYER_RADIUS + 4;
    if (
      this.isSegmentClearOnFloor(
        bot.x,
        bot.y,
        bot.x + Math.cos(desiredAngle) * probeDist,
        bot.y + Math.sin(desiredAngle) * probeDist,
        clearR,
        bFloor
      )
    ) {
      return desiredAngle;
    }

    const offsets = [0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.85, -1.85, 2.45, -2.45, Math.PI];
    let bestAngle = desiredAngle + strafeBias * 1.15;
    let bestScore = -Infinity;
    for (const off of offsets) {
      const cand = normalizeAngle(desiredAngle + off * strafeBias);
      const px = bot.x + Math.cos(cand) * probeDist;
      const py = bot.y + Math.sin(cand) * probeDist;
      if (!this.isPointWalkableOnFloor(px, py, clearR, bFloor)) continue;
      if (!this.isSegmentClearOnFloor(bot.x, bot.y, px, py, clearR - 2, bFloor)) continue;
      const align = Math.cos(normalizeAngle(cand - desiredAngle));
      if (align > bestScore) {
        bestScore = align;
        bestAngle = cand;
      }
    }
    return bestAngle;
  }

  private pickArenaPatrolPoint(bot: Player): Vec2 {
    const pad = ARENA_WALL_THICKNESS + PLAYER_RADIUS + 40;
    const minDist = this.map.immersive ? 380 : 220;
    for (let tries = 0; tries < 20; tries++) {
      const x = pad + Math.random() * (this.map.width - pad * 2);
      const y = pad + Math.random() * (this.map.height - pad * 2);
      if (
        dist(bot.x, bot.y, x, y) >= minDist &&
        this.isPointWalkableOnFloor(x, y, PLAYER_RADIUS + 10, bot.floor ?? 0)
      ) {
        return { x, y };
      }
    }
    return { x: this.map.width * 0.5, y: this.map.height * 0.5 };
  }

  private findTrickshotToPoint(
    shooter: Player,
    tx: number,
    ty: number,
    hitRadius = PLAYER_RADIUS + 14
  ): number | null {
    const floor = shooter.floor ?? 0;
    const bSpeed = this.getBulletSpeed();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      let x = shooter.x + Math.cos(a) * (PLAYER_RADIUS + 8);
      let y = shooter.y + Math.sin(a) * (PLAYER_RADIUS + 8);
      let vx = Math.cos(a) * bSpeed;
      let vy = Math.sin(a) * bSpeed;
      let bounces = 0;

      for (let step = 0; step < 58; step++) {
        const subDt = 0.02;
        x += vx * subDt;
        y += vy * subDt;

        for (const wall of this.map.walls) {
          if (!isWallOnFloor(wall, floor)) continue;
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
        if (bounces >= 1 && dist(x, y, tx, ty) < hitRadius) {
          return a;
        }
      }
    }
    return null;
  }

  private applyBotControls(bot: Player, dt: number) {
    if (this.libraryState) {
      this.applyLibraryBotControls(bot, dt);
      return;
    }
    const diff: BotDifficulty = this.config.difficulty;
    const reactionInterval = diff === 'RUTHLESS' ? 0.12 : diff === 'TACTICAL' ? 0.24 : 0.48;
    const aimSpread = diff === 'RUTHLESS' ? 0.02 : diff === 'TACTICAL' ? 0.11 : 1.05;
    const bFloor = bot.floor ?? 0;
    const mem = this.getBotMemory(bot);

    bot.aiThinkTimer -= dt;
    bot.aiHoldShotTimer -= dt;
    mem.patrolTimer = Math.max(0, mem.patrolTimer - dt);
    mem.lastSeenTimer = Math.max(0, mem.lastSeenTimer - dt);
    mem.unstickTimer = Math.max(0, mem.unstickTimer - dt);
    mem.scanPhase += dt * (this.config.extraDark ? 2.1 : 1.3);

    // Stuck detection
    if (dist(bot.x, bot.y, mem.lastProgressX, mem.lastProgressY) > 18) {
      mem.lastProgressX = bot.x;
      mem.lastProgressY = bot.y;
      mem.stuckTimer = 0;
    } else if (bot.aiMoveRatio > 0.25) {
      mem.stuckTimer += dt;
      if (mem.stuckTimer > 0.65) {
        mem.stuckTimer = 0;
        bot.aiStrafeDir *= -1;
        mem.unstickTimer = 0.5;
        mem.unstickAngle = this.pickClearMoveAngle(
          bot,
          normalizeAngle(bot.aiTargetAngle + bot.aiStrafeDir * 1.7),
          84,
          bot.aiStrafeDir
        );
        const np = this.pickArenaPatrolPoint(bot);
        mem.patrolX = np.x;
        mem.patrolY = np.y;
        mem.patrolTimer = 3.2;
      }
    }

    let evadeX = 0;
    let evadeY = 0;

    // 1. Incoming bullet evasion (Chill barely dodges; Ruthless reacts early & cleanly)
    const bulletLookDist = diff === 'RUTHLESS' ? 255 : diff === 'TACTICAL' ? 210 : 115;
    const bulletWeight = diff === 'RUTHLESS' ? 2.65 : diff === 'TACTICAL' ? 2.2 : 0.75;
    for (const b of this.bullets) {
      if (b.ownerId === bot.id && b.age < BULLET_SELF_GRACE) continue;
      if (!sameFloor(b.floor, bFloor)) continue;
      const d = dist(bot.x, bot.y, b.x, b.y);
      if (d < bulletLookDist) {
        const bSpeed = Math.hypot(b.vx, b.vy) || 1;
        const relX = bot.x - b.x;
        const relY = bot.y - b.y;
        const dot = (relX * b.vx + relY * b.vy) / bSpeed;
        if (dot > -15 && dot < bulletLookDist) {
          const perp = Math.abs((relX * b.vy - relY * b.vx) / bSpeed);
          if (perp < PLAYER_RADIUS + 34) {
            const side = relX * b.vy - relY * b.vx >= 0 ? 1 : -1;
            const weight = (bulletLookDist - d) / bulletLookDist;
            evadeX += (b.vy / bSpeed) * side * weight * bulletWeight;
            evadeY += (-b.vx / bSpeed) * side * weight * bulletWeight;
          }
        }
      }
    }

    // 2. Explosive hazard evasion (Chill clumsily ignores unexploded Nitro so they can blow themselves up!)
    for (const p of this.pickups) {
      if (!sameFloor(p.floor, bFloor)) continue;
      if (p.kind === 'tnt' && p.armed) {
        const d = dist(bot.x, bot.y, p.x, p.y);
        const fleeR = diff === 'CHILL' ? 105 : diff === 'RUTHLESS' ? TNT_BLAST_RADIUS + 56 : TNT_BLAST_RADIUS + 42;
        if (d < fleeR) {
          const away = Math.atan2(bot.y - p.y, bot.x - p.x);
          const mult = diff === 'CHILL' ? 1.2 : 2.6;
          const urgency = ((fleeR - d) / TNT_BLAST_RADIUS) * mult;
          evadeX += Math.cos(away) * urgency;
          evadeY += Math.sin(away) * urgency;
        }
      } else if (p.kind === 'nitro' && diff !== 'CHILL') {
        const d = dist(bot.x, bot.y, p.x, p.y);
        const safeDist = diff === 'RUTHLESS' ? NITRO_RADIUS + PLAYER_RADIUS + 34 : NITRO_RADIUS + PLAYER_RADIUS + 20;
        if (d < safeDist) {
          const away = Math.atan2(bot.y - p.y, bot.x - p.x);
          evadeX += Math.cos(away) * 2.1;
          evadeY += Math.sin(away) * 2.1;
        }
      }
    }

    // 3. Broken ice pit evasion
    for (const pit of this.icePits) {
      const margin = diff === 'CHILL' ? PLAYER_RADIUS + 14 : PLAYER_RADIUS + 42;
      if (pit.broken && isPointInIcePit(bot.x, bot.y, pit, margin)) {
        const away = Math.atan2(bot.y - pit.y, bot.x - pit.x);
        evadeX += Math.cos(away) * 3.0;
        evadeY += Math.sin(away) * 3.0;
      }
    }

    // Check visible enemies using fair Immersive visibility (NO wallhack/darkness ESP)
    const allEnemies = this.players.filter(
      (p) => p.id !== bot.id && p.alive && !this.isTeammate(bot.id, p.id) && sameFloor(p.floor, bFloor)
    );
    const visibleEnemies = allEnemies.filter((e) => this.canBotSeePoint(bot, e.x, e.y, e.floor ?? 0));
    let activeAimAngle: number | null = null;

    if (visibleEnemies.length > 0) {
      let bestVisible = visibleEnemies[0];
      let bestScore = -Infinity;
      for (const e of visibleEnemies) {
        const d = dist(bot.x, bot.y, e.x, e.y);
        const finishBonus = e.hp <= BULLET_DAMAGE ? 150 : 0;
        const score = -d * 0.35 + (e.stunTimer > 0 ? 120 : 0) + finishBonus + (100 - e.hp) * 1.0 + e.kills * 25;
        if (score > bestScore) {
          bestScore = score;
          bestVisible = e;
        }
      }
      mem.lastSeenEnemyId = bestVisible.id;
      mem.lastSeenX = bestVisible.x;
      mem.lastSeenY = bestVisible.y;
      mem.lastSeenFloor = bestVisible.floor ?? 0;
      mem.lastSeenTimer = diff === 'RUTHLESS' ? 1.55 : 1.05;
    }

    const evading = Math.hypot(evadeX, evadeY) > 0.35;
    if (evading) {
      const rawEvade = Math.atan2(evadeY, evadeX);
      bot.aiTargetAngle = this.pickClearMoveAngle(bot, rawEvade, 74, bot.aiStrafeDir);
      bot.aiMoveRatio = 1.0;
    } else if (mem.unstickTimer > 0) {
      bot.aiTargetAngle = mem.unstickAngle;
      bot.aiMoveRatio = 0.9;
    } else if (bot.aiThinkTimer <= 0) {
      bot.aiThinkTimer = reactionInterval + Math.random() * 0.1;
      if (Math.random() < 0.24) bot.aiStrafeDir *= -1;

      let goalX = mem.patrolX;
      let goalY = mem.patrolY;
      let moveRatio = 0.82;
      let wantsToShoot = false;
      let shootAngle = bot.angle;

      // Refresh patrol point if reached or expired
      if (mem.patrolTimer <= 0 || dist(bot.x, bot.y, mem.patrolX, mem.patrolY) < 95) {
        const np = this.pickArenaPatrolPoint(bot);
        mem.patrolX = np.x;
        mem.patrolY = np.y;
        mem.patrolTimer = 3.5 + Math.random() * 2.5;
        goalX = np.x;
        goalY = np.y;
      }

      const visibleMedkits = this.pickups.filter(
        (p) =>
          p.kind === 'medkit' &&
          sameFloor(p.floor, bFloor) &&
          (!this.map.immersive || this.canBotSeePoint(bot, p.x, p.y, bFloor, true))
      );
      const visibleBullets = this.pickups.filter(
        (p) =>
          p.kind === 'bullet' &&
          sameFloor(p.floor, bFloor) &&
          (!this.map.immersive || this.canBotSeePoint(bot, p.x, p.y, bFloor, true))
      );

      // Helper: pick best visible enemy
      let target: Player | null = null;
      let targetDist = Infinity;
      if (visibleEnemies.length > 0) {
        let bestScore = -Infinity;
        for (const e of visibleEnemies) {
          const d = dist(bot.x, bot.y, e.x, e.y);
          let score = -d * 0.35 + (e.stunTimer > 0 ? 120 : 0) + (100 - e.hp) * 1.1 + e.kills * 25;
          if (diff === 'RUTHLESS' && e.hp <= BULLET_DAMAGE) score += 160;
          if (e.spawnInvulnTimer > 0) score -= 50;
          if (score > bestScore) {
            bestScore = score;
            target = e;
            targetDist = d;
          }
        }
      }

      // Check strategic Nitro/TNT plays
      let explosiveShotAngle: number | null = null;
      let explosiveClusterCount = 0;
      const checkCandidates = visibleEnemies.length > 0 ? visibleEnemies : [];
      if (bot.ammo > 0 && checkCandidates.length > 0) {
        let bestBlastScore = 0;
        for (const n of this.pickups) {
          if (!sameFloor(n.floor, bFloor)) continue;
          if (n.kind !== 'nitro' && !(n.kind === 'tnt' && !n.armed)) continue;
          if (this.map.immersive && !this.canBotSeePoint(bot, n.x, n.y, bFloor, true)) continue;

          const blastR = n.kind === 'tnt' ? TNT_BLAST_RADIUS : NITRO_BLAST_RADIUS;
          const selfDist = dist(n.x, n.y, bot.x, bot.y);

          if (diff === 'CHILL') {
            // Chill bot clumsily blasts nitro/TNT even when standing TOO close!
            const nearEnemy = checkCandidates.find((e) => dist(n.x, n.y, e.x, e.y) < blastR + 40);
            if (nearEnemy && selfDist < blastR + 85 && this.hasLineOfSight(bot.x, bot.y, n.x, n.y, bFloor)) {
              if (Math.random() < 0.55) {
                explosiveShotAngle = Math.atan2(n.y - bot.y, n.x - bot.x);
                explosiveClusterCount = 1;
                break;
              }
            }
            continue;
          }

          // Tactical & Ruthless NEVER self-blast or friendly-fire teammates
          const safeSelfMargin = diff === 'RUTHLESS' ? blastR + 24 : blastR + 20;
          if (selfDist <= safeSelfMargin) continue;
          const teammateInBlast = this.players.some(
            (tm) => tm.alive && tm.id !== bot.id && this.isTeammate(bot.id, tm.id) && dist(n.x, n.y, tm.x, tm.y) <= blastR + 24
          );
          if (teammateInBlast) continue;

          const hitMargin = diff === 'RUTHLESS' ? blastR + 8 : blastR - 10;
          const enemiesInBlast = checkCandidates.filter((e) => dist(n.x, n.y, e.x, e.y) <= hitMargin);
          if (enemiesInBlast.length === 0) continue;

          const directLos = this.hasLineOfSight(bot.x, bot.y, n.x, n.y, bFloor);
          const shotA = directLos
            ? Math.atan2(n.y - bot.y, n.x - bot.x)
            : diff === 'RUTHLESS'
              ? this.findTrickshotToPoint(bot, n.x, n.y, n.radius + 14)
              : null;

          if (shotA !== null) {
            const score = enemiesInBlast.length * 100 + (n.kind === 'nitro' ? 30 : 15);
            if (score > bestBlastScore) {
              bestBlastScore = score;
              explosiveShotAngle = shotA;
              explosiveClusterCount = enemiesInBlast.length;
            }
          }
        }
      }

      // Ruthless ammo stockpiling check: collect 2-3 bullets before firing unless immediate kill / threat / Nitro cluster!
      const nearestBullet = visibleBullets.reduce<{ p: Pickup; d: number } | null>((best, p) => {
        const d = dist(bot.x, bot.y, p.x, p.y);
        return !best || d < best.d ? { p, d } : best;
      }, null);

      const immediateDanger = Boolean(
        target &&
          (targetDist < 310 ||
            (target.ammo > 0 && Math.abs(normalizeAngle(Math.atan2(bot.y - target.y, bot.x - target.x) - target.angle)) < 0.42 && targetDist < 420))
      );
      const guaranteedFinish = Boolean(target && (target.hp <= BULLET_DAMAGE || target.stunTimer > 0));
      const closeCluster = visibleEnemies.filter((e) => dist(bot.x, bot.y, e.x, e.y) < 380).length >= 2;
      const stockpileAmmoGoal = Math.min(bot.maxAmmo, 3);
      const shouldStockpileRuthless =
        diff === 'RUTHLESS' &&
        bot.ammo > 0 &&
        bot.ammo < stockpileAmmoGoal &&
        nearestBullet !== null &&
        nearestBullet.d < 720 &&
        !immediateDanger &&
        !guaranteedFinish &&
        explosiveClusterCount === 0 &&
        !closeCluster;

      if (bot.hp <= 55 && visibleMedkits.length > 0) {
        let best = visibleMedkits[0];
        let bestD = dist(bot.x, bot.y, best.x, best.y);
        for (const m of visibleMedkits) {
          const d = dist(bot.x, bot.y, m.x, m.y);
          if (d < bestD) {
            best = m;
            bestD = d;
          }
        }
        goalX = best.x;
        goalY = best.y;
        moveRatio = 0.95;
      } else if (bot.ammo === 0 || shouldStockpileRuthless) {
        if (nearestBullet) {
          goalX = nearestBullet.p.x;
          goalY = nearestBullet.p.y;
          moveRatio = shouldStockpileRuthless ? 0.96 : 0.92;
        } else if (mem.lastSeenTimer > 0 && !shouldStockpileRuthless) {
          goalX = mem.lastSeenX;
          goalY = mem.lastSeenY;
          moveRatio = 0.85;
        }
      } else if (target) {
        if (explosiveShotAngle !== null && bot.aiHoldShotTimer <= 0) {
          wantsToShoot = true;
          shootAngle = explosiveShotAngle + (Math.random() - 0.5) * aimSpread * 0.45;
          activeAimAngle = shootAngle;
        } else if (bot.aiHoldShotTimer <= 0 && this.hasLineOfSight(bot.x, bot.y, target.x, target.y, bFloor)) {
          const travelT = targetDist / this.getBulletSpeed();
          const leadScale = diff === 'RUTHLESS' ? 0.72 : diff === 'TACTICAL' ? 0.78 : 0.1;
          let predX = target.x + target.vx * travelT * leadScale;
          let predY = target.y + target.vy * travelT * leadScale;
          if (!this.isPointWalkableOnFloor(predX, predY, PLAYER_RADIUS, bFloor)) {
            predX = target.x;
            predY = target.y;
          }
          wantsToShoot = true;

          if (diff === 'CHILL' && Math.random() < 0.65) {
            // Chill frequently panics and shoots in random directions!
            shootAngle = Math.random() * Math.PI * 2 - Math.PI;
          } else {
            shootAngle = Math.atan2(predY - bot.y, predX - bot.x) + (Math.random() - 0.5) * aimSpread;
          }
          activeAimAngle = shootAngle;
        } else {
          // Strafe / close distance on visible target
          const toTarget = Math.atan2(target.y - bot.y, target.x - bot.x);
          const strafeAngle = toTarget + bot.aiStrafeDir * 0.6;
          goalX = bot.x + Math.cos(strafeAngle) * 190;
          goalY = bot.y + Math.sin(strafeAngle) * 190;
          moveRatio = diff === 'RUTHLESS' ? 0.92 : 0.8;
          activeAimAngle = toTarget;

          const trickChance = diff === 'RUTHLESS' ? 0.35 : diff === 'TACTICAL' ? 0.2 : 0;
          if (trickChance > 0 && bot.aiHoldShotTimer <= 0 && Math.random() < trickChance) {
            const bounceAngle = this.findTrickshotAngle(bot, target);
            if (bounceAngle !== null) {
              wantsToShoot = true;
              shootAngle = bounceAngle + (Math.random() - 0.5) * aimSpread * 0.35;
              activeAimAngle = shootAngle;
            }
          }
        }
      } else {
        // No visible enemies! Look for nearby visible ammo/medkits or investigate brief last-seen / patrol
        if (diff === 'CHILL' && bot.ammo > 0 && bot.aiHoldShotTimer <= 0 && Math.random() < 0.22) {
          // Chill randomly fires occasional stray shots in arbitrary directions!
          wantsToShoot = true;
          shootAngle = Math.random() * Math.PI * 2 - Math.PI;
        } else if (mem.lastSeenTimer > 0 && (!this.map.immersive || dist(bot.x, bot.y, mem.lastSeenX, mem.lastSeenY) > 65)) {
          goalX = mem.lastSeenX;
          goalY = mem.lastSeenY;
          moveRatio = 0.88;
          activeAimAngle = Math.atan2(mem.lastSeenY - bot.y, mem.lastSeenX - bot.x);
        } else if (nearestBullet && bot.ammo < bot.maxAmmo && (diff === 'RUTHLESS' || bot.ammo < 2)) {
          goalX = nearestBullet.p.x;
          goalY = nearestBullet.p.y;
          moveRatio = 0.9;
        }
      }

      if (wantsToShoot && bot.ammo > 0) {
        bot.angle = shootAngle;
        bot.vx = 0;
        bot.vy = 0;
        this.fireBullet(bot);
        bot.aiHoldShotTimer =
          diff === 'RUTHLESS'
            ? bot.ammo >= 1
              ? 0.28
              : 0.42
            : diff === 'TACTICAL'
              ? 0.7
              : 1.1;
        return;
      }

      const rawMoveAngle = Math.atan2(goalY - bot.y, goalX - bot.x);
      bot.aiTargetAngle = this.pickClearMoveAngle(bot, rawMoveAngle, 68, bot.aiStrafeDir);
      bot.aiMoveRatio = moveRatio;
    }

    // Smooth aiming / flashlight search sweep in Extra Dark Immersive mode
    let desiredFacing = bot.aiTargetAngle;
    if (activeAimAngle !== null) {
      desiredFacing = activeAimAngle;
    } else if (this.map.immersive && visibleEnemies.length === 0 && !evading) {
      if (mem.lastSeenTimer > 0) {
        desiredFacing = Math.atan2(mem.lastSeenY - bot.y, mem.lastSeenX - bot.x);
      } else {
        desiredFacing = normalizeAngle(bot.aiTargetAngle + Math.sin(mem.scanPhase) * (this.config.extraDark ? 0.58 : 0.32));
      }
    }

    const angleDiff = normalizeAngle(desiredFacing - bot.angle);
    const turnSpeed = diff === 'RUTHLESS' ? 11.5 : 8;
    bot.angle = normalizeAngle(bot.angle + clamp(angleDiff, -turnSpeed * dt, turnSpeed * dt));

    const targetSpeed = this.getPlayerMaxSpeed() * bot.aiMoveRatio;
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

  private hasLineOfSight(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    floor: FloorLevel = 0
  ): boolean {
    for (const wall of this.map.walls) {
      if (!isWallOnFloor(wall, floor)) continue;
      if (segmentIntersectsRect(x1, y1, x2, y2, wall)) return false;
    }
    return true;
  }

  private findTrickshotAngle(shooter: Player, target: Player): number | null {
    const floor = shooter.floor ?? 0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      let x = shooter.x + Math.cos(a) * (PLAYER_RADIUS + 8);
      let y = shooter.y + Math.sin(a) * (PLAYER_RADIUS + 8);
      const bSpeed = this.getBulletSpeed();
      let vx = Math.cos(a) * bSpeed;
      let vy = Math.sin(a) * bSpeed;
      let bounces = 0;

      for (let step = 0; step < 58; step++) {
        const subDt = 0.02;
        x += vx * subDt;
        y += vy * subDt;

        for (const wall of this.map.walls) {
          if (!isWallOnFloor(wall, floor)) continue;
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

    const pFloor = player.floor ?? 0;
    const muzzleDist = PLAYER_RADIUS + BULLET_RADIUS + 3;
    const bx = player.x + Math.cos(player.angle) * muzzleDist;
    const by = player.y + Math.sin(player.angle) * muzzleDist;

    const bSpeed = this.getBulletSpeed();
    const bullet: Bullet = {
      id: this.nextId++,
      ownerId: player.id,
      color: player.color,
      x: bx,
      y: by,
      vx: Math.cos(player.angle) * bSpeed,
      vy: Math.sin(player.angle) * bSpeed,
      radius: BULLET_RADIUS,
      floor: pFloor,
      bouncesLeft: BULLET_MAX_BOUNCES,
      maxBounces: BULLET_MAX_BOUNCES,
      age: 0,
      maxAge: BULLET_MAX_AGE,
      trail: [{ x: bx, y: by }],
    };

    this.bullets.push(bullet);
    player.vx -= Math.cos(player.angle) * 35;
    player.vy -= Math.sin(player.angle) * 35;

    this.emitEvent('shoot', bx, by, undefined, undefined, pFloor);
    this.spawnParticles(bx, by, player.accentColor, 6, 120, pFloor);
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
        const bFloor = b.floor ?? 0;
        for (const wall of this.map.walls) {
          if (!isWallOnFloor(wall, bFloor)) continue;
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
            const isMetal = wall.kind === 'metal' || wall.kind === 'perimeter_steel';
            this.emitEvent('bounce', b.x, b.y, isMetal ? 2 : 1, undefined, bFloor);
            this.spawnParticles(b.x, b.y, wall.kind === 'metal' ? '#E2E8F0' : '#FDE047', 5, 110, bFloor);
            hitWall = true;
            break;
          }
        }

        if (hitWall && b.bouncesLeft < 0) {
          this.spawnParticles(b.x, b.y, b.color, 7, 100, bFloor);
          destroyed = true;
          break;
        }

        for (const box of this.boxes) {
          if (box.state !== 'active' || !sameFloor(box.floor, bFloor)) continue;
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
          if (!p || !sameFloor(p.floor, bFloor)) continue;
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
                this.emitEvent('tnt_tick', p.x, p.y, 3, undefined, bFloor);
                this.addFloatingText(p.x, p.y - (TNT_HALF_SIZE + 12), '3s FUSE!', '#FEF08A', bFloor);
              }

              this.emitEvent('hit', p.x, p.y, 2, undefined, bFloor);
              this.spawnParticles(b.x, b.y, '#EF4444', 9, 140, bFloor);
              this.spawnParticles(b.x, b.y, '#FEF08A', 5, 110, bFloor);
              destroyed = true;
              break;
            }
          }
        }
        if (destroyed) break;

        // Bullets bounce harmlessly off The Figure (bulletproof!)
        if (this.libraryState && sameFloor(this.libraryState.monster.floor, bFloor)) {
          const m = this.libraryState.monster;
          const dx = b.x - m.x;
          const dy = b.y - m.y;
          const d = Math.hypot(dx, dy);
          if (d <= m.radius + b.radius) {
            const nx = d > 0.001 ? dx / d : 1;
            const ny = d > 0.001 ? dy / d : 0;
            const overlap = m.radius + b.radius - d + 1;
            b.x += nx * overlap;
            b.y += ny * overlap;
            const dot = b.vx * nx + b.vy * ny;
            if (dot < 0) {
              b.vx -= 2 * dot * nx;
              b.vy -= 2 * dot * ny;
            }
            b.bouncesLeft -= 1;
            this.emitEvent('bounce', b.x, b.y, 2, undefined, bFloor);
            this.spawnParticles(b.x, b.y, '#FB923C', 6, 130, bFloor);
            if (b.bouncesLeft < 0) {
              destroyed = true;
              break;
            }
          }
        }

        for (const player of this.players) {
          if (!player.alive || player.stunTimer > 0 || !sameFloor(player.floor, bFloor)) continue;
          if (player.id === b.ownerId && b.age < BULLET_SELF_GRACE) continue;
          if (player.id !== b.ownerId && this.isTeammate(b.ownerId, player.id)) continue;
          if (dist(b.x, b.y, player.x, player.y) <= b.radius + PLAYER_RADIUS) {
            const speed = Math.hypot(b.vx, b.vy) || 1;
            const knockX = (b.vx / speed) * 220;
            const knockY = (b.vy / speed) * 220;
            const owner = this.players.find((pl) => pl.id === b.ownerId);
            if (owner && owner.id !== player.id) owner.shotsHit += 1;

            this.applyDamage(player, BULLET_DAMAGE, b.ownerId, knockX, knockY, true);
            this.spawnParticles(b.x, b.y, b.color, 10, 150, bFloor);
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
      const blastColor = isTnt ? '#FACC15' : '#FEF08A';
      const blastFloor: FloorLevel = current.item.floor ?? 0;

      this.explosions.push({
        id: this.nextId++,
        x: current.item.x,
        y: current.item.y,
        radius: blastRadius,
        age: 0,
        duration: 0.62,
        color: blastColor,
        kind: isTnt ? 'tnt' : 'nitro',
        floor: blastFloor,
      });

      this.screenShake = Math.min(16, this.screenShake + (isTnt ? 11 : 8));
      this.emitEvent('explosion', current.item.x, current.item.y, isTnt ? 2 : 1, undefined, blastFloor);
      this.spawnParticles(current.item.x, current.item.y, '#FACC15', isTnt ? 22 : 15, 250, blastFloor);
      this.spawnParticles(current.item.x, current.item.y, '#FEF08A', isTnt ? 14 : 10, 180, blastFloor);
      this.spawnSmokeParticles(current.item.x, current.item.y, isTnt ? 12 : 8, 95, blastFloor);

      if (this.libraryState) {
        const m = this.libraryState.monster;
        const dM = dist(current.item.x, current.item.y, m.x, m.y);
        if (sameFloor(m.floor, blastFloor) && dM <= blastRadius + m.radius) {
          m.stunTimer = MONSTER_STUN_DURATION;
          m.mode = 'calm';
          m.rageTimer = 0;
          m.rageFadeTimer = 0;
          m.reachedHoldTimer = 0;
          m.vx = 0;
          m.vy = 0;
          this.monsterPath = [];
          this.emitEvent('monster_stun', m.x, m.y, undefined, undefined, m.floor);
          this.addFloatingText(m.x, m.y - (m.radius + 14), 'FIGURE STUNNED 10s!', '#FDE047', m.floor);
        } else {
          // Explosive blasts elsewhere alert The Figure into Rage mode toward the blast site
          this.triggerMonsterRage(current.item.x, current.item.y, blastFloor);
        }
      }

      for (const player of this.players) {
        if (!player.alive || !sameFloor(player.floor, blastFloor)) continue;
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
        if (box.state === 'active' && sameFloor(box.floor, blastFloor)) {
          if (dist(current.item.x, current.item.y, box.x, box.y) <= blastRadius + box.w * 0.4) {
            this.punctureBox(box, box.x - current.item.x, box.y - current.item.y);
          }
        }
      }

      for (const other of this.pickups) {
        if ((other.kind === 'nitro' || other.kind === 'tnt') && sameFloor(other.floor, blastFloor) && !processedIds.has(other.id)) {
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

  private applyDeathPenalty(player: Player): void {
    player.hp = 0;
    player.alive = false;
    player.deaths += 1;
    player.stunTimer = 0;
    player.ammo = 0;

    if (this.libraryState) {
      const prog = this.libraryState.playerProgress.find((pp) => pp.playerId === player.id);
      if (this.config.mode === 'BRAWL') {
        if (prog) {
          prog.hearts = Math.max(0, (prog.hearts ?? LIBRARY_BRAWL_MAX_HEARTS) - 1);
          if (prog.hearts <= 0) {
            prog.eliminated = true;
            player.respawnTimer = 0;
            this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 28), 'NO HEARTS LEFT!', '#FB7185', player.floor ?? 0);
            return;
          }
        }
        player.respawnTimer = RESPAWN_DELAY;
      } else {
        if (prog) prog.eliminated = true;
        player.respawnTimer = 0;
      }
      return;
    }

    player.respawnTimer = this.config.mode === 'BRAWL' ? RESPAWN_DELAY : 0;
  }

  private drownPlayer(player: Player, attackerId: number | null) {
    if (!player.alive) return;
    this.applyDeathPenalty(player);

    if (attackerId !== null && attackerId !== player.id && !this.isTeammate(attackerId, player.id)) {
      const attacker = this.players.find((p) => p.id === attackerId);
      if (attacker) {
        attacker.kills += 1;
        this.recordKillStreak(attacker, player.x, player.y);
      }
    }

    this.emitEvent('splash', player.x, player.y);
    this.emitEvent('knockout', player.x, player.y);
    this.spawnParticles(player.x, player.y, '#BAE6FD', 18, 190);
    this.spawnParticles(player.x, player.y, '#38BDF8', 16, 150);
    this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 10), 'SPLASH KO!', '#7DD3FC');
  }

  private recordKillStreak(attacker: Player, x: number, y: number) {
    if (this.config.mode === 'ELIMINATION') {
      this.events.push({
        type: 'killstreak',
        x,
        y,
        value: attacker.kills,
        playerId: attacker.id,
        mode: 'ELIMINATION',
      });
      return;
    }

    const prev = this.rapidStreaks.get(attacker.id);
    const count =
      prev && this.elapsedTime - prev.lastKillAt <= KILL_STREAK_WINDOW ? prev.count + 1 : 1;
    this.rapidStreaks.set(attacker.id, { count, lastKillAt: this.elapsedTime });
    if (count >= 2) {
      this.events.push({
        type: 'killstreak',
        x,
        y,
        value: count,
        playerId: attacker.id,
        mode: 'BRAWL',
      });
    }
  }

  private applyDamage(
    player: Player,
    amount: number,
    attackerId: number | null,
    knockVx: number,
    knockVy: number,
    byBullet = false
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
      const mods = this.getModifiers();
      player.stunTimer = STUN_TIME_VALUES[mods.stunTime] ?? STUN_DURATION;
      if (!mods.keepBulletsOnStun) {
        player.ammo = 0;
      }
      this.emitEvent('hit', player.x, player.y, 3);
      this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 10), `-${amount}`, '#FDA4AF');
      if (player.hp === 1) {
        this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 28), '1 HP CLUTCH!', '#FACC15');
      }
    } else {
      this.applyDeathPenalty(player);

      if (attackerId !== null && attackerId !== player.id) {
        const attacker = this.players.find((p) => p.id === attackerId);
        if (attacker) {
          attacker.kills += 1;
          this.recordKillStreak(attacker, player.x, player.y);
        }
      } else if (attackerId === player.id) {
        if (byBullet) {
          this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 28), 'OWN SHOT!', '#F472B6');
          this.emitEvent('self_kill', player.x, player.y, 1, player.id);
        } else {
          this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 28), 'SELF KO', '#F87171');
        }
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
    player.floor = this.map.id === 'library' ? 1 : 0;
    player.stairBlend = this.map.id === 'library' ? 1 : 0;
    player.hp = PLAYER_MAX_HP;
    player.ammo = 0;
    player.stunTimer = 0;
    player.alive = true;
    player.spawnInvulnTimer = SPAWN_INVULN_DURATION;
    player.angle = Math.atan2(this.map.height / 2 - bestSpawn.y, this.map.width / 2 - bestSpawn.x);
    this.spawnParticles(player.x, player.y, player.color, 14, 120, player.floor);
    this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 10), 'SPAWN!', player.accentColor, player.floor);
  }

  public finishSoloLibrary() {
    if (!this.libraryState || this.winnerId !== null) return;
    if (this.libraryState.escapedOrder.length > 0) {
      const firstId = this.libraryState.escapedOrder[0];
      const firstPlayer = this.players.find((p) => p.id === firstId) ?? this.players[0];
      this.winnerId = firstPlayer.id;
      this.winnerTeam = this.config.teamMode === '2V2' ? (firstPlayer.team ?? firstPlayer.id % 2) : null;
      this.winnerReason =
        firstPlayer.name === 'You'
          ? 'You escaped The Library in 1st place!'
          : `${firstPlayer.name} escaped The Library in 1st place!`;
      this.emitEvent('victory', firstPlayer.x, firstPlayer.y, 1, firstPlayer.id, 0);
    } else {
      const sorted = [...this.players].sort((a, b) => {
        const pa = this.libraryState!.playerProgress.find((pp) => pp.playerId === a.id)?.collectedCount ?? 0;
        const pb = this.libraryState!.playerProgress.find((pp) => pp.playerId === b.id)?.collectedCount ?? 0;
        if (pb !== pa) return pb - pa;
        return b.kills - a.kills || b.damageDealt - a.damageDealt;
      });
      const champ = sorted[0] ?? this.players[0];
      this.winnerId = champ.id;
      this.winnerTeam = this.config.teamMode === '2V2' ? (champ.team ?? champ.id % 2) : null;
      this.winnerReason = 'Library match concluded';
      this.emitEvent('victory', champ.x, champ.y, 1, champ.id, 0);
    }
  }

  private checkWinConditions() {
    if (this.players.length === 0 || this.winnerId !== null) return;

    if (this.libraryState) {
      const activeContenders = this.players.filter((p) => {
        const prog = this.libraryState!.playerProgress.find((pp) => pp.playerId === p.id);
        if (!prog || prog.unlocked || prog.eliminated) return false;
        return this.config.mode === 'BRAWL'
          ? (prog.hearts ?? LIBRARY_BRAWL_MAX_HEARTS) > 0
          : p.alive;
      });
      if (activeContenders.length === 0) {
        if (this.libraryState.escapedOrder.length > 0) {
          const firstId = this.libraryState.escapedOrder[0];
          const champ = this.players.find((p) => p.id === firstId) ?? this.players[0];
          this.winnerId = champ.id;
          this.winnerTeam = this.config.teamMode === '2V2' ? (champ.team ?? champ.id % 2) : null;
          this.winnerReason =
            champ.name === 'You'
              ? 'You escaped The Library in 1st place!'
              : `${champ.name} escaped The Library in 1st place!`;
          this.emitEvent('victory', champ.x, champ.y, 1, champ.id, 0);
        } else {
          const sorted = [...this.players].sort((a, b) => {
            const pa = this.libraryState!.playerProgress.find((pp) => pp.playerId === a.id)?.collectedCount ?? 0;
            const pb = this.libraryState!.playerProgress.find((pp) => pp.playerId === b.id)?.collectedCount ?? 0;
            if (pb !== pa) return pb - pa;
            return b.kills - a.kills || b.damageDealt - a.damageDealt;
          });
          const best = sorted[0] ?? this.players[0];
          this.winnerId = best.id;
          this.winnerTeam = this.config.teamMode === '2V2' ? (best.team ?? best.id % 2) : null;
          this.winnerReason = `The Library claimed everyone — ${best.name} led with most progress`;
          this.emitEvent('victory', best.x, best.y, 1, best.id, 0);
        }
      }
      return;
    }

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
        const champ = alivePlayers[0];
        this.winnerId = champ.id;
        this.winnerReason =
          champ.name === 'You'
            ? 'You are the last player standing'
            : `${champ.name} is the last player standing`;
        this.emitEvent('victory', champ.x, champ.y);
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

  private spawnSmokeParticles(
    x: number,
    y: number,
    count: number,
    maxSpeed: number,
    floor: FloorLevel = 0
  ) {
    const smokeShades = ['#374151', '#1F2937', '#4B5563'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 18 + Math.random() * maxSpeed;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 28,
        y: y + (Math.random() - 0.5) * 28,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 12,
        radius: 10 + Math.random() * 12,
        color: smokeShades[i % smokeShades.length],
        age: 0,
        duration: 0.55 + Math.random() * 0.45,
        floor,
        isSmoke: true,
      });
    }
  }

  private spawnParticles(
    x: number,
    y: number,
    color: string,
    count: number,
    maxSpeed: number,
    floor: FloorLevel = 0
  ) {
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
        floor,
      });
    }
  }

  private addFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    floor: FloorLevel = 0
  ) {
    this.floatingTexts.push({
      id: this.nextId++,
      x,
      y,
      text,
      color,
      age: 0,
      duration: 0.85,
      floor,
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

  // ==================== THE LIBRARY MECHANICS ====================

  private updateEntityFloorAndBlend(ent: { x: number; y: number; floor?: FloorLevel; stairBlend?: number }) {
    if (this.map.id !== 'library') {
      ent.floor = 0;
      ent.stairBlend = 0;
      return;
    }
    const stairs = this.map.stairs ?? [];
    for (const st of stairs) {
      if (
        ent.x >= st.x - 4 &&
        ent.x <= st.x + st.w + 4 &&
        ent.y >= st.y - 4 &&
        ent.y <= st.y + st.h + 4
      ) {
        const rawT =
          st.upDir === 'up'
            ? clamp((st.y + st.h - ent.y) / st.h, 0, 1)
            : clamp((ent.y - st.y) / st.h, 0, 1);
        ent.stairBlend = rawT;
        ent.floor = rawT >= 0.5 ? 1 : 0;
        return;
      }
    }
    ent.floor = ent.floor ?? 0;
    ent.stairBlend = ent.floor === 1 ? 1 : 0;
  }

  private buildGridNavGraph(cell: number, testR: number): NavNode[] {
    const cols = Math.floor(this.map.width / cell);
    const rows = Math.floor(this.map.height / cell);
    const nodes: NavNode[] = [];
    const lookup = new Map<string, number>();
    const key = (gx: number, gy: number, fl: FloorLevel) => `${fl}:${gx}:${gy}`;

    for (const fl of [0, 1] as FloorLevel[]) {
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const wx = (gx + 0.5) * cell;
          const wy = (gy + 0.5) * cell;
          if (!this.isPointWalkableOnFloor(wx, wy, testR, fl)) continue;
          const isStair = (this.map.stairs ?? []).some(
            (s) => wx >= s.x - 16 && wx <= s.x + s.w + 16 && wy >= s.y - 16 && wy <= s.y + s.h + 16
          );
          const id = nodes.length;
          nodes.push({ id, x: wx, y: wy, floor: fl, isStair, neighbors: [] });
          lookup.set(key(gx, gy, fl), id);
        }
      }
    }

    const baseGridCount = nodes.length;

    for (const fl of [0, 1] as FloorLevel[]) {
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const id = lookup.get(key(gx, gy, fl));
          if (id === undefined) continue;
          const node = nodes[id];
          const offsets = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [-1, 1],
            [1, -1],
            [-1, -1],
          ];
          for (const [ox, oy] of offsets) {
            const nid = lookup.get(key(gx + ox, gy + oy, fl));
            if (nid === undefined) continue;
            if (ox !== 0 && oy !== 0) {
              if (
                lookup.get(key(gx + ox, gy, fl)) === undefined ||
                lookup.get(key(gx, gy + oy, fl)) === undefined
              ) {
                continue;
              }
            }
            const nb = nodes[nid];
            if (!this.isSegmentClearOnFloor(node.x, node.y, nb.x, nb.y, testR, fl)) continue;
            if (!node.neighbors.includes(nid)) node.neighbors.push(nid);
          }
        }
      }
    }

    for (const st of this.map.stairs ?? []) {
      const cx = st.x + st.w * 0.5;
      const groundApproachY = st.upDir === 'up' ? st.y + st.h + 72 : st.y - 72;
      const groundEntryY = st.upDir === 'up' ? st.y + st.h + 12 : st.y - 12;
      const midY = st.y + st.h * 0.5;
      const upperEntryY = st.upDir === 'up' ? st.y - 12 : st.y + st.h + 12;
      const upperApproachY = st.upDir === 'up' ? st.y - 72 : st.y + st.h + 72;

      const gAppId = nodes.length;
      nodes.push({ id: gAppId, x: cx, y: groundApproachY, floor: 0, isStair: false, neighbors: [] });
      const gEntId = nodes.length;
      nodes.push({ id: gEntId, x: cx, y: groundEntryY, floor: 0, isStair: true, neighbors: [] });
      const m0Id = nodes.length;
      nodes.push({ id: m0Id, x: cx, y: midY, floor: 0, isStair: true, neighbors: [] });
      const m1Id = nodes.length;
      nodes.push({ id: m1Id, x: cx, y: midY, floor: 1, isStair: true, neighbors: [] });
      const uEntId = nodes.length;
      nodes.push({ id: uEntId, x: cx, y: upperEntryY, floor: 1, isStair: true, neighbors: [] });
      const uAppId = nodes.length;
      nodes.push({ id: uAppId, x: cx, y: upperApproachY, floor: 1, isStair: false, neighbors: [] });

      nodes[gAppId].neighbors.push(gEntId);
      nodes[gEntId].neighbors.push(gAppId, m0Id);
      nodes[m0Id].neighbors.push(gEntId, m1Id);
      nodes[m1Id].neighbors.push(m0Id, uEntId);
      nodes[uEntId].neighbors.push(m1Id, uAppId);
      nodes[uAppId].neighbors.push(uEntId);

      for (let i = 0; i < baseGridCount; i++) {
        const n = nodes[i];
        if (n.floor === 0) {
          const dApp = dist(n.x, n.y, cx, groundApproachY);
          if (dApp <= 145 && this.isSegmentClearOnFloor(n.x, n.y, cx, groundApproachY, testR, 0)) {
            nodes[gAppId].neighbors.push(n.id);
            n.neighbors.push(gAppId);
          }
          const dEnt = dist(n.x, n.y, cx, groundEntryY);
          if (dEnt <= 135 && this.isSegmentClearOnFloor(n.x, n.y, cx, groundEntryY, testR, 0)) {
            nodes[gEntId].neighbors.push(n.id);
            n.neighbors.push(gEntId);
          }
        } else {
          const dApp = dist(n.x, n.y, cx, upperApproachY);
          if (dApp <= 145 && this.isSegmentClearOnFloor(n.x, n.y, cx, upperApproachY, testR, 1)) {
            nodes[uAppId].neighbors.push(n.id);
            n.neighbors.push(uAppId);
          }
          const dEnt = dist(n.x, n.y, cx, upperEntryY);
          if (dEnt <= 135 && this.isSegmentClearOnFloor(n.x, n.y, cx, upperEntryY, testR, 1)) {
            nodes[uEntId].neighbors.push(n.id);
            n.neighbors.push(uEntId);
          }
        }
      }
    }

    return nodes;
  }

  private buildLibraryNavGraph() {
    this.navNodes = this.buildGridNavGraph(32, MONSTER_RADIUS + 2);
    this.botNavNodes = this.buildGridNavGraph(36, PLAYER_RADIUS + 4);
  }

  private findClosestNavNodeOnGraph(
    graph: NavNode[],
    x: number,
    y: number,
    floor: FloorLevel,
    preferLos = true
  ): NavNode | null {
    let bestLos: NavNode | null = null;
    let bestLosD = Infinity;
    let bestAny: NavNode | null = null;
    let bestAnyD = Infinity;

    for (const n of graph) {
      if (n.floor !== floor) continue;
      const d = dist(x, y, n.x, n.y);
      if (d < bestAnyD) {
        bestAnyD = d;
        bestAny = n;
      }
      if (preferLos && d < 240 && d < bestLosD && this.hasLineOfSight(x, y, n.x, n.y, floor)) {
        bestLosD = d;
        bestLos = n;
      }
    }
    return bestLos ?? bestAny;
  }

  private findClosestNavNode(x: number, y: number, floor: FloorLevel): NavNode | null {
    return this.findClosestNavNodeOnGraph(this.navNodes, x, y, floor, true);
  }

  private findNavPathOnGraph(
    graph: NavNode[],
    fromX: number,
    fromY: number,
    fromFloor: FloorLevel,
    toX: number,
    toY: number,
    toFloor: FloorLevel
  ): NavNode[] {
    if (graph.length === 0) return [];
    const start = this.findClosestNavNodeOnGraph(graph, fromX, fromY, fromFloor, true);
    const goal = this.findClosestNavNodeOnGraph(graph, toX, toY, toFloor, true);
    if (!start || !goal) return [];
    if (start.id === goal.id) return [goal];

    const nCount = graph.length;
    const gScore = new Float32Array(nCount).fill(Infinity);
    const fScore = new Float32Array(nCount).fill(Infinity);
    const cameFrom = new Int32Array(nCount).fill(-1);
    const closed = new Uint8Array(nCount);
    const inOpen = new Uint8Array(nCount);

    const heap: number[] = [start.id];
    const pushHeap = (id: number) => {
      heap.push(id);
      let idx = heap.length - 1;
      while (idx > 0) {
        const parent = (idx - 1) >> 1;
        if (fScore[heap[parent]] <= fScore[heap[idx]]) break;
        const tmp = heap[parent];
        heap[parent] = heap[idx];
        heap[idx] = tmp;
        idx = parent;
      }
    };
    const popHeap = (): number => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let idx = 0;
        const len = heap.length;
        while (true) {
          let smallest = idx;
          const l = idx * 2 + 1;
          const r = idx * 2 + 2;
          if (l < len && fScore[heap[l]] < fScore[heap[smallest]]) smallest = l;
          if (r < len && fScore[heap[r]] < fScore[heap[smallest]]) smallest = r;
          if (smallest === idx) break;
          const tmp = heap[idx];
          heap[idx] = heap[smallest];
          heap[smallest] = tmp;
          idx = smallest;
        }
      }
      return top;
    };

    gScore[start.id] = 0;
    fScore[start.id] = dist(start.x, start.y, goal.x, goal.y) + (start.floor !== goal.floor ? 320 : 0);
    inOpen[start.id] = 1;

    while (heap.length > 0) {
      const currId = popHeap();
      inOpen[currId] = 0;
      if (closed[currId]) continue;
      if (currId === goal.id) {
        const path: NavNode[] = [];
        let trace = goal.id;
        while (trace !== -1 && trace !== start.id) {
          path.push(graph[trace]);
          trace = cameFrom[trace];
        }
        path.reverse();
        return path;
      }
      closed[currId] = 1;
      const curr = graph[currId];
      for (const nbId of curr.neighbors) {
        if (closed[nbId]) continue;
        const nb = graph[nbId];
        const stepCost = curr.floor !== nb.floor ? 120 : dist(curr.x, curr.y, nb.x, nb.y);
        const tentative = gScore[currId] + stepCost;
        if (tentative < gScore[nbId]) {
          cameFrom[nbId] = currId;
          gScore[nbId] = tentative;
          fScore[nbId] = tentative + dist(nb.x, nb.y, goal.x, goal.y) + (nb.floor !== goal.floor ? 320 : 0);
          if (!inOpen[nbId]) {
            inOpen[nbId] = 1;
            pushHeap(nbId);
          } else {
            pushHeap(nbId);
          }
        }
      }
    }
    return [];
  }

  private findNavPath(
    fromX: number,
    fromY: number,
    fromFloor: FloorLevel,
    toX: number,
    toY: number,
    toFloor: FloorLevel
  ): NavNode[] {
    return this.findNavPathOnGraph(this.navNodes, fromX, fromY, fromFloor, toX, toY, toFloor);
  }

  private initLibraryMatchState() {
    const shuffledShapes = [...LIBRARY_SHAPES].sort(() => Math.random() - 0.5);
    const pillarSequence: LibraryShape[] = shuffledShapes.slice(0, LIBRARY_CODE_LEN);
    const decoyShapes: LibraryShape[] = shuffledShapes.slice(LIBRARY_CODE_LEN);

    const pc = this.map.pillarCenter ?? { x: this.map.width * 0.5, y: this.map.height * 0.5 };
    const doors: LibraryDoor[] = [
      { playerId: 0, side: 'W', x: pc.x - 110, y: pc.y },
      { playerId: 1, side: 'E', x: pc.x + 110, y: pc.y },
      { playerId: 2, side: 'N', x: pc.x, y: pc.y - 110 },
      { playerId: 3, side: 'S', x: pc.x, y: pc.y + 110 },
    ];

    // Collect valid book placement spots tucked tightly against Ground & Upper bookshelf ledges (with face side recorded!)
    const groundSpots: Array<{ x: number; y: number; floor: FloorLevel; face: LibraryBookFace }> = [];
    const upperSpots: Array<{ x: number; y: number; floor: FloorLevel; face: LibraryBookFace }> = [];

    for (const wall of this.map.walls) {
      if (wall.kind !== 'bookshelf' || wall.floor === undefined) continue;
      const fl = wall.floor;
      const vertical = wall.h > wall.w;
      const candidates: Array<{ x: number; y: number; face: LibraryBookFace }> = vertical
        ? [
            { x: wall.x - 16, y: wall.y + wall.h * 0.28, face: 'W' },
            { x: wall.x + wall.w + 16, y: wall.y + wall.h * 0.72, face: 'E' },
          ]
        : [
            { x: wall.x + wall.w * 0.28, y: wall.y - 16, face: 'N' },
            { x: wall.x + wall.w * 0.72, y: wall.y + wall.h + 16, face: 'S' },
          ];
      for (const c of candidates) {
        if (!this.isPointWalkableOnFloor(c.x, c.y, 14, fl)) continue;
        if (
          (this.map.stairs ?? []).some(
            (s) => c.x >= s.x - 10 && c.x <= s.x + s.w + 10 && c.y >= s.y - 10 && c.y <= s.y + s.h + 10
          )
        ) {
          continue;
        }
        if (fl === 0) groundSpots.push({ x: c.x, y: c.y, floor: 0, face: c.face });
        else upperSpots.push({ x: c.x, y: c.y, floor: 1, face: c.face });
      }
    }

    const playerProgress = this.players.map((p) => {
      // Unique 5-digit solution for this player
      const digits = Array.from({ length: LIBRARY_CODE_LEN }, () => Math.floor(Math.random() * 10));
      this.librarySolutions.set(p.id, digits);

      // 4 real clues + 3 decoy clues in Books #1-#7; Book #8 ALWAYS reveals the 5th real clue!
      const realClues: LibraryClue[] = pillarSequence.map((shape, idx) => ({
        shape,
        digit: digits[idx],
      }));
      const shuffledReal = [...realClues].sort(() => Math.random() - 0.5);
      const guaranteedFinalClue = shuffledReal[LIBRARY_CODE_LEN - 1];
      const earlyRealClues = shuffledReal.slice(0, LIBRARY_CODE_LEN - 1);
      const earlyDecoys: LibraryClue[] = decoyShapes.map((shape) => ({
        shape,
        digit: Math.floor(Math.random() * 10),
      }));
      const earlyQueue = [...earlyRealClues, ...earlyDecoys].sort(() => Math.random() - 0.5);
      this.libraryBookQueues.set(p.id, [...earlyQueue, guaranteedFinalClue]);

      // Pick 4 distinct Ground shelf spots + 4 distinct Upper shelf spots for this player
      const gPick = [...groundSpots].sort(() => Math.random() - 0.5).slice(0, 4);
      const uPick = [...upperSpots].sort(() => Math.random() - 0.5).slice(0, 4);
      const chosen = [...gPick, ...uPick].slice(0, LIBRARY_BOOKS_PER_PLAYER);
      const books: LibraryBookSpot[] = chosen.map((spot, idx) => ({
        id: p.id * 100 + idx,
        x: Math.round(spot.x),
        y: Math.round(spot.y),
        floor: spot.floor,
        face: spot.face,
        collected: false,
      }));

      return {
        playerId: p.id,
        collectedCount: 0,
        books,
        clues: [],
        codeDigits: new Array(LIBRARY_CODE_LEN).fill(0),
        unlocked: false,
        escapedRank: null,
        hearts: LIBRARY_BRAWL_MAX_HEARTS,
        eliminated: false,
      };
    });

    // Spawn Figure completely clear of Ground shelves in the open West central hall
    const spawnX = pc.x - 360;
    const spawnY = pc.y;
    const monster: LibraryMonsterState = {
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      angle: 0,
      floor: 0,
      radius: MONSTER_RADIUS,
      mode: 'calm',
      stunTimer: 0,
      rageTimer: 0,
      rageFadeTimer: 0,
      reachedHoldTimer: 0,
      targetX: pc.x + 360,
      targetY: pc.y,
      targetFloor: 0,
      transitioning: false,
      transitionProgress: 0,
    };
    this.monsterLastProgressX = spawnX;
    this.monsterLastProgressY = spawnY;
    this.monsterStuckTimer = 0;

    this.libraryState = {
      pillarSequence,
      totalCollectedAll: 0,
      introTimer: LIBRARY_INTRO_DURATION,
      escapedOrder: [],
      monster,
      playerProgress,
      doors,
    };
  }

  private getLibraryProgressFraction(): number {
    if (!this.libraryState) return 0;
    const totalMax = Math.max(8, this.players.length * LIBRARY_BOOKS_PER_PLAYER);
    return clamp(this.libraryState.totalCollectedAll / totalMax, 0, 1);
  }

  private triggerMonsterRage(targetX: number, targetY: number, targetFloor: FloorLevel) {
    if (!this.libraryState) return;
    const m = this.libraryState.monster;
    if (m.stunTimer > 0) return;

    const wasCalm = m.mode !== 'rage';
    m.mode = 'rage';
    m.targetX = targetX;
    m.targetY = targetY;
    m.targetFloor = targetFloor;
    m.rageTimer = 10.0;
    m.reachedHoldTimer = -1;
    m.rageFadeTimer = 0;
    this.monsterPathTimer = 0;

    if (wasCalm) {
      this.emitEvent('monster_roar', m.x, m.y, undefined, undefined, m.floor);
      this.addFloatingText(m.x, m.y - (m.radius + 14), 'HE HEARD YOU!', '#F97316', m.floor);
    }
  }

  public collectNearbyBook(playerId: number): boolean {
    if (!this.libraryState || this.winnerId !== null || this.libraryState.introTimer > 0) return false;
    const player = this.players.find((p) => p.id === playerId && p.alive);
    const prog = this.libraryState.playerProgress.find((pp) => pp.playerId === playerId);
    if (!player || !prog) return false;

    const pFloor = player.floor ?? 0;
    let bestBook: LibraryBookSpot | null = null;
    let bestD = Infinity;
    for (const b of prog.books) {
      if (!canCollectBookSpot(player, b, this.map.walls)) continue;
      const d = dist(player.x, player.y, b.x, b.y);
      if (d < bestD) {
        bestD = d;
        bestBook = b;
      }
    }
    if (!bestBook) return false;

    bestBook.collected = true;
    this.libraryCollectedSpots.add(bestBook.id);
    const queue = this.libraryBookQueues.get(playerId) ?? [];
    const clue = queue[prog.collectedCount];
    prog.collectedCount += 1;
    this.libraryState.totalCollectedAll += 1;

    if (clue) {
      prog.clues.push(clue);
      this.addFloatingText(
        player.x,
        player.y - (PLAYER_RADIUS + 14),
        `CLUE ${prog.collectedCount}/8: = ${clue.digit}`,
        '#FDE047',
        pFloor
      );
    }
    this.emitEvent('book_collect', bestBook.x, bestBook.y, prog.collectedCount, playerId, pFloor);
    this.spawnParticles(bestBook.x, bestBook.y, '#FBBF24', 12, 130, pFloor);
    return true;
  }

  public setDoorDialDigit(playerId: number, index: number, digit: number) {
    if (!this.libraryState) return;
    const prog = this.libraryState.playerProgress.find((pp) => pp.playerId === playerId);
    if (!prog || index < 0 || index >= LIBRARY_CODE_LEN) return;
    prog.codeDigits[index] = ((Math.round(digit) % 10) + 10) % 10;
    const player = this.players.find((p) => p.id === playerId);
    if (player) {
      this.emitEvent('lock_dial', player.x, player.y, prog.codeDigits[index], playerId, player.floor ?? 0);
    }
  }

  public submitDoorCode(playerId: number, digits: number[]): boolean {
    if (!this.libraryState || this.winnerId !== null || this.libraryState.introTimer > 0) return false;
    const player = this.players.find((p) => p.id === playerId && p.alive);
    const prog = this.libraryState.playerProgress.find((pp) => pp.playerId === playerId);
    const door = this.libraryState.doors.find((d) => d.playerId === playerId);
    const solution = this.librarySolutions.get(playerId);
    if (!player || !prog || prog.unlocked || !door || !solution) return false;

    if ((player.floor ?? 0) !== 0 || dist(player.x, player.y, door.x, door.y) > 155) {
      return false;
    }

    const cleanDigits = digits.slice(0, LIBRARY_CODE_LEN).map((d) => ((Math.round(d) % 10) + 10) % 10);
    prog.codeDigits = cleanDigits;

    const correct =
      cleanDigits.length === solution.length && cleanDigits.every((d, idx) => d === solution[idx]);
    if (!correct) {
      this.emitEvent('lock_error', door.x, door.y, 1, playerId, 0);
      this.addFloatingText(player.x, player.y - (PLAYER_RADIUS + 14), 'WRONG CODE!', '#FB7185', 0);
      return false;
    }

    prog.unlocked = true;
    this.libraryState.escapedOrder.push(playerId);
    prog.escapedRank = this.libraryState.escapedOrder.length;
    player.alive = false;
    player.respawnTimer = 0;
    player.vx = 0;
    player.vy = 0;
    player.ammo = 0;
    this.emitEvent('door_unlock', door.x, door.y, prog.escapedRank, playerId, 0);
    this.spawnParticles(door.x, door.y, '#34D399', 26, 200, 0);
    this.spawnParticles(door.x, door.y, '#FACC15', 14, 170, 0);
    this.addFloatingText(
      door.x,
      door.y - 36,
      `#${prog.escapedRank} ESCAPED!`,
      '#FDE047',
      0
    );
    this.checkWinConditions();
    return true;
  }

  private updateLibraryMonster(dt: number) {
    if (!this.libraryState) return;
    const m = this.libraryState.monster;
    const progFrac = this.getLibraryProgressFraction();

    if (m.stunTimer > 0) {
      m.stunTimer = Math.max(0, m.stunTimer - dt);
      m.vx *= Math.exp(-8 * dt);
      m.vy *= Math.exp(-8 * dt);
      return;
    }

    // 1. Calm / Stealth / Loud-Sound Hearing Logic (900px circle on same floor = 40% central map area)
    const maxPlayerSpd = this.getPlayerMaxSpeed();
    let loudestSound: { x: number; y: number; floor: FloorLevel } | null = null;
    this.monsterHearCheckTimer -= dt;
    const checkProbabilisticStealth = this.monsterHearCheckTimer <= 0;
    if (checkProbabilisticStealth) {
      this.monsterHearCheckTimer = 0.32;
    }

    for (const p of this.players) {
      if (!p.alive || p.stunTimer > 0) continue;
      const pFloor = p.floor ?? 0;
      if (pFloor !== m.floor) continue;

      const d = dist(p.x, p.y, m.x, m.y);
      if (d > LIBRARY_HEARING_RADIUS) continue;

      const speed = Math.hypot(p.vx, p.vy);
      const speedRatio = speed / maxPlayerSpd;
      if (speedRatio >= 0.96) {
        // 100% walking speed inside 900px hearing circle -> instant rage trigger!
        loudestSound = { x: p.x, y: p.y, floor: pFloor };
        break;
      } else if (speedRatio >= 0.80 && checkProbabilisticStealth) {
        // 80%..100% speed: probability scales 0% at circumference (900px) -> up to 30% at 0.5 player diameter away
        const closeDist = m.radius + PLAYER_RADIUS + 42;
        const prox = clamp((LIBRARY_HEARING_RADIUS - d) / Math.max(1, LIBRARY_HEARING_RADIUS - closeDist), 0, 1);
        const speedWeight = clamp((speedRatio - 0.80) / 0.20, 0.25, 1.0);
        const chance = 0.30 * prox * speedWeight;
        if (Math.random() < chance) {
          loudestSound = { x: p.x, y: p.y, floor: pFloor };
        }
      }
    }

    if (loudestSound) {
      this.triggerMonsterRage(loudestSound.x, loudestSound.y, loudestSound.floor);
    }

    // 2. Speed & Mode State Machine (Calm 0.50->0.85x, Rage 1.00->1.50x, 1s smooth fade-out)
    const calmRatio = 0.50 + progFrac * 0.35;
    const rageRatio = 1.00 + progFrac * 0.50;

    if (m.mode === 'rage') {
      m.rageTimer -= dt;
      if (m.floor === m.targetFloor && dist(m.x, m.y, m.targetX, m.targetY) <= 44) {
        if (m.reachedHoldTimer < 0) {
          m.reachedHoldTimer = 1.0; // End 1s after reaching sound location
        }
      }
      if (m.reachedHoldTimer >= 0) {
        m.reachedHoldTimer -= dt;
      }

      if (m.rageTimer <= 0 || (m.reachedHoldTimer >= 0 && m.reachedHoldTimer <= 0)) {
        // Begin 1s smooth fade-out back to Calm mode
        m.mode = 'calm';
        m.rageFadeTimer = 1.0;
      }
    }

    if (m.rageFadeTimer > 0) {
      m.rageFadeTimer = Math.max(0, m.rageFadeTimer - dt);
    }

    const targetRatio =
      m.mode === 'rage'
        ? rageRatio
        : m.rageFadeTimer > 0
          ? calmRatio + (rageRatio - calmRatio) * m.rageFadeTimer
          : calmRatio;
    this.monsterRageSpeedScale = targetRatio;
    const moveSpeed = PLAYER_MAX_SPEED * targetRatio;

    const pickCalmDestination = () => {
      const wantFloor: FloorLevel = Math.random() < 0.64 ? 0 : 1;
      const candidates = this.navNodes.filter(
        (n) => !n.isStair && n.floor === wantFloor && dist(n.x, n.y, m.x, m.y) > 260
      );
      const pool = candidates.length > 0 ? candidates : this.navNodes.filter((n) => !n.isStair);
      for (let tries = 0; tries < 8 && pool.length > 0; tries++) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const path = this.findNavPath(m.x, m.y, m.floor, pick.x, pick.y, pick.floor);
        if (path.length > 0) {
          m.targetX = pick.x;
          m.targetY = pick.y;
          m.targetFloor = pick.floor;
          this.monsterPath = path;
          this.monsterPathTimer = 0.85;
          return;
        }
      }
    };

    // 3. Dedicated 2.0-second Smooth Cross-Floor Staircase Traversal & Fade
    if (m.transitioning) {
      const nextP = clamp((m.transitionProgress ?? 0) + dt / 2.0, 0, 1);
      m.transitionProgress = nextP;
      const dxT = this.monsterTransToX - this.monsterTransFromX;
      const dyT = this.monsterTransToY - this.monsterTransFromY;
      m.x = this.monsterTransFromX + dxT * nextP;
      m.y = this.monsterTransFromY + dyT * nextP;
      m.vx = dxT / 2.0;
      m.vy = dyT / 2.0;
      if (Math.hypot(dxT, dyT) > 2) {
        const desiredAngle = Math.atan2(dyT, dxT);
        const diff = normalizeAngle(desiredAngle - m.angle);
        m.angle = normalizeAngle(m.angle + clamp(diff, -8 * dt, 8 * dt));
      }
      m.floor = nextP < 0.5 ? (m.fromFloor ?? m.floor) : (m.toFloor ?? m.floor);
      this.monsterLastProgressX = m.x;
      this.monsterLastProgressY = m.y;
      this.monsterStuckTimer = 0;

      if (nextP >= 1) {
        m.transitioning = false;
        m.floor = m.toFloor ?? m.floor;
        m.fromFloor = undefined;
        m.toFloor = undefined;
        m.transitionProgress = 0;
        while (this.monsterPath.length > 0 && this.monsterPath[0].isStair) {
          this.monsterPath.shift();
        }
        if (this.monsterPath.length === 0) {
          if (m.mode === 'calm') {
            pickCalmDestination();
          } else {
            this.monsterPath = this.findNavPath(m.x, m.y, m.floor, m.targetX, m.targetY, m.targetFloor);
          }
        }
      }
    } else {
      // Normal same-floor A* pathfinding
      this.monsterPathTimer -= dt;
      if (m.mode === 'calm') {
        const closeToPatrol = m.floor === m.targetFloor && dist(m.x, m.y, m.targetX, m.targetY) < 75;
        if (closeToPatrol || (this.monsterPath.length === 0 && this.monsterPathTimer <= 0)) {
          pickCalmDestination();
        }
      } else if (this.monsterPathTimer <= 0 || this.monsterPath.length === 0) {
        this.monsterPath = this.findNavPath(m.x, m.y, m.floor, m.targetX, m.targetY, m.targetFloor);
        this.monsterPathTimer = 0.4;
      }

      // Check if Monster has reached the stair mouth to begin a 2.0s cross-floor climb/descent
      let startedTransition = false;
      for (let idx = 0; idx < this.monsterPath.length; idx++) {
        const stepNode = this.monsterPath[idx];
        if (stepNode.floor !== m.floor) {
          const st = (this.map.stairs ?? []).find(
            (s) =>
              stepNode.x >= s.x - 24 &&
              stepNode.x <= s.x + s.w + 24 &&
              stepNode.y >= s.y - 80 &&
              stepNode.y <= s.y + s.h + 80
          );
          if (st) {
            const cx = st.x + st.w * 0.5;
            const groundY = st.upDir === 'up' ? st.y + st.h + 52 : st.y - 52;
            const upperY = st.upDir === 'up' ? st.y - 52 : st.y + st.h + 52;
            const entryX = cx;
            const entryY = m.floor === 0 ? groundY : upperY;
            if (dist(m.x, m.y, entryX, entryY) <= 56) {
              m.transitioning = true;
              m.fromFloor = m.floor;
              m.toFloor = stepNode.floor;
              m.transitionProgress = 0;
              this.monsterTransFromX = m.x;
              this.monsterTransFromY = m.y;
              this.monsterTransToX = cx;
              this.monsterTransToY = stepNode.floor === 1 ? upperY : groundY;
              startedTransition = true;
            }
          }
          break;
        }
      }

      if (!startedTransition) {
        let wpX = m.targetX;
        let wpY = m.targetY;
        while (this.monsterPath.length > 0) {
          const next = this.monsterPath[0];
          const hitDist = next.isStair ? 30 : 42;
          if (
            next.floor === m.floor &&
            dist(m.x, m.y, next.x, next.y) < hitDist &&
            this.monsterPath.length > 1
          ) {
            this.monsterPath.shift();
          } else {
            wpX = next.x;
            wpY = next.y;
            break;
          }
        }

        const dx = wpX - m.x;
        const dy = wpY - m.y;
        const dWp = Math.hypot(dx, dy);
        if (dWp > 3) {
          const desiredAngle = Math.atan2(dy, dx);
          const diff = normalizeAngle(desiredAngle - m.angle);
          m.angle = normalizeAngle(m.angle + clamp(diff, -6.5 * dt, 6.5 * dt));
          m.vx = (dx / dWp) * moveSpeed;
          m.vy = (dy / dWp) * moveSpeed;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
        } else {
          m.vx *= Math.exp(-8 * dt);
          m.vy *= Math.exp(-8 * dt);
        }

        for (let pass = 0; pass < 2; pass++) {
          for (const wall of this.map.walls) {
            if (!isWallOnFloor(wall, m.floor)) continue;
            const cx = clamp(m.x, wall.x, wall.x + wall.w);
            const cy = clamp(m.y, wall.y, wall.y + wall.h);
            const wdx = m.x - cx;
            const wdy = m.y - cy;
            const d2 = wdx * wdx + wdy * wdy;
            if (d2 < m.radius * m.radius) {
              const d = Math.sqrt(d2);
              if (d > 0.0001) {
                const ov = m.radius - d;
                m.x += (wdx / d) * ov;
                m.y += (wdy / d) * ov;
              } else {
                const lp = m.x - wall.x;
                const rp = wall.x + wall.w - m.x;
                const tp = m.y - wall.y;
                const bp = wall.y + wall.h - m.y;
                const minP = Math.min(lp, rp, tp, bp);
                if (minP === lp) m.x = wall.x - m.radius;
                else if (minP === rp) m.x = wall.x + wall.w + m.radius;
                else if (minP === tp) m.y = wall.y - m.radius;
                else m.y = wall.y + wall.h + m.radius;
              }
            }
          }
        }

        // Stuck detector: if Figure ever fails to make net progress for >0.55s, slide toward clearest nav node & reroute
        if (dist(m.x, m.y, this.monsterLastProgressX, this.monsterLastProgressY) > 22) {
          this.monsterLastProgressX = m.x;
          this.monsterLastProgressY = m.y;
          this.monsterStuckTimer = 0;
        } else if (moveSpeed > 40) {
          this.monsterStuckTimer += dt;
          if (this.monsterStuckTimer > 0.55) {
            const nearest = this.findClosestNavNode(m.x, m.y, m.floor);
            if (nearest) {
              const dN = dist(m.x, m.y, nearest.x, nearest.y);
              if (dN > 4) {
                const pull = Math.min(28, dN);
                m.x += ((nearest.x - m.x) / dN) * pull;
                m.y += ((nearest.y - m.y) / dN) * pull;
              }
            }
            this.monsterStuckTimer = 0;
            this.monsterPathTimer = 0;
            if (m.mode === 'calm') {
              pickCalmDestination();
            } else {
              this.monsterPath = this.findNavPath(m.x, m.y, m.floor, m.targetX, m.targetY, m.targetFloor);
            }
          }
        }
      }
    }

    // Heavy booming footsteps event
    this.monsterStepTimer -= dt;
    if (this.monsterStepTimer <= 0 && Math.hypot(m.vx, m.vy) > 35) {
      this.monsterStepTimer = m.mode === 'rage' ? 0.24 : 0.44 - progFrac * 0.1;
      this.emitEvent('monster_step', m.x, m.y, m.mode === 'rage' ? 2 : 1, undefined, m.floor);
    }

    // Instakill any player on the same floor touched by The Figure!
    for (const p of this.players) {
      if (!p.alive || (p.floor ?? 0) !== m.floor) continue;
      if (dist(p.x, p.y, m.x, m.y) <= m.radius + PLAYER_RADIUS - 6) {
        this.applyDeathPenalty(p);
        this.emitEvent('monster_kill', p.x, p.y, 1, p.id, m.floor);
        this.spawnParticles(p.x, p.y, '#EF4444', 24, 210, m.floor);
        this.addFloatingText(p.x, p.y - (PLAYER_RADIUS + 12), 'CAUGHT BY FIGURE!', '#FB7185', m.floor);
      }
    }
  }

  private getBookApproachPoint(book: LibraryBookSpot): Vec2 {
    const offset = 44;
    if (book.face === 'W') return { x: book.x - offset, y: book.y };
    if (book.face === 'E') return { x: book.x + offset, y: book.y };
    if (book.face === 'N') return { x: book.x, y: book.y - offset };
    if (book.face === 'S') return { x: book.x, y: book.y + offset };
    return { x: book.x, y: book.y };
  }

  private pickLibraryEscapeAngle(bot: Player, monster: LibraryMonsterState, floor: FloorLevel): number {
    const clearR = PLAYER_RADIUS + 4;
    let bestAngle = Math.atan2(bot.y - monster.y, bot.x - monster.x);
    let bestScore = -Infinity;

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = bot.x + Math.cos(a) * 110;
      const py = bot.y + Math.sin(a) * 110;
      if (!this.isPointWalkableOnFloor(px, py, clearR, floor)) continue;
      if (!this.isSegmentClearOnFloor(bot.x, bot.y, px, py, clearR - 2, floor)) continue;

      const nextD = dist(px, py, monster.x, monster.y);
      let score = nextD;
      // Bonus if heading toward an open staircase entry to shake Figure across floors
      for (const st of this.map.stairs ?? []) {
        const entryX = st.x + st.w * 0.5;
        const entryY =
          floor === 0
            ? st.upDir === 'up'
              ? st.y + st.h + 24
              : st.y - 24
            : st.upDir === 'up'
              ? st.y - 24
              : st.y + st.h + 24;
        if (dist(px, py, entryX, entryY) < dist(bot.x, bot.y, entryX, entryY)) {
          score += 55;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestAngle = a;
      }
    }
    return bestAngle;
  }

  private applyLibraryBotControls(bot: Player, dt: number) {
    if (!this.libraryState) return;
    const diff: BotDifficulty = this.config.difficulty;
    const bFloor = bot.floor ?? 0;
    const prog = this.libraryState.playerProgress.find((pp) => pp.playerId === bot.id);
    if (prog && (prog.unlocked || prog.eliminated)) return;

    const mem = this.getBotMemory(bot);
    const door = this.libraryState.doors.find((d) => d.playerId === bot.id);
    const m = this.libraryState.monster;
    const cooldown = Math.max(0, (this.botCodeCooldown.get(bot.id) ?? 0) - dt);
    this.botCodeCooldown.set(bot.id, cooldown);

    mem.scanPhase += dt * (this.config.extraDark ? 2.0 : 1.3);
    mem.rageBaitTimer = Math.max(0, mem.rageBaitTimer - dt);
    mem.rageBaitCooldown = Math.max(0, mem.rageBaitCooldown - dt);
    mem.unstickTimer = Math.max(0, mem.unstickTimer - dt);

    // 1. Collect nearby book automatically if close and on correct side
    if (prog && prog.collectedCount < LIBRARY_BOOKS_PER_PLAYER) {
      for (const b of prog.books) {
        if (canCollectBookSpot(bot, b, this.map.walls)) {
          this.collectNearbyBook(bot.id);
          this.botPaths.delete(bot.id);
          break;
        }
      }
    }

    const sameFloorMonster = sameFloor(m.floor, bFloor);
    const monsterDist = sameFloorMonster ? dist(bot.x, bot.y, m.x, m.y) : 9999;

    // 2. If all 8 books collected and near own door, dial & solve cleanly!
    if (prog && door && prog.collectedCount >= LIBRARY_BOOKS_PER_PLAYER && bFloor === 0 && dist(bot.x, bot.y, door.x, door.y) <= 135 && cooldown <= 0) {
      const figureTooClose = m.stunTimer <= 0 && sameFloorMonster && monsterDist < 245;
      if (!figureTooClose) {
        const dialNeed = diff === 'RUTHLESS' ? 0.55 : diff === 'TACTICAL' ? 1.0 : 1.55;
        mem.dialTimer += dt;
        const digitIdx = Math.min(LIBRARY_CODE_LEN - 1, Math.floor((mem.dialTimer / dialNeed) * LIBRARY_CODE_LEN));
        const solution = this.librarySolutions.get(bot.id);
        if (solution && mem.dialTimer >= dialNeed) {
          mem.dialTimer = 0;
          this.botCodeCooldown.set(bot.id, 1.5);
          if (diff === 'CHILL' && !mem.dialMistakeDone && Math.random() < 0.28) {
            mem.dialMistakeDone = true;
            const bad = [...solution];
            bad[0] = (bad[0] + 1) % 10;
            this.submitDoorCode(bot.id, bad);
          } else {
            this.submitDoorCode(bot.id, solution);
          }
          return;
        } else if (solution && Math.random() < dt * 3.5) {
          this.setDoorDialDigit(bot.id, digitIdx, solution[digitIdx]);
        }
        // Slow down briefly while dialing at the safe pillar door
        bot.vx *= Math.exp(-10 * dt);
        bot.vy *= Math.exp(-10 * dt);
        return;
      }
    } else {
      mem.dialTimer = 0;
    }

    // Stuck detector for Library aisles, stairs, and door corners
    if (dist(bot.x, bot.y, mem.lastProgressX, mem.lastProgressY) > 16) {
      mem.lastProgressX = bot.x;
      mem.lastProgressY = bot.y;
      mem.stuckTimer = 0;
    } else if (bot.aiMoveRatio > 0.25) {
      mem.stuckTimer += dt;
      if (mem.stuckTimer > 0.65) {
        mem.stuckTimer = 0;
        bot.aiStrafeDir *= -1;
        this.botPaths.delete(bot.id);
        const nearest = this.findClosestNavNodeOnGraph(this.botNavNodes, bot.x, bot.y, bFloor, true);
        if (nearest && dist(bot.x, bot.y, nearest.x, nearest.y) > 10) {
          mem.unstickAngle = Math.atan2(nearest.y - bot.y, nearest.x - bot.x);
        } else {
          mem.unstickAngle = this.pickClearMoveAngle(bot, bot.angle + bot.aiStrafeDir * 1.5, 75, bot.aiStrafeDir);
        }
        mem.unstickTimer = 0.55;
      }
    }

    // 3. Evade Monster, incoming bullets, and TNT/Nitro blasts
    let evadeX = 0;
    let evadeY = 0;
    const monsterBeingTargeted =
      m.stunTimer <= 0 &&
      sameFloorMonster &&
      (monsterDist < (diff === 'RUTHLESS' ? 360 : 320) ||
        (m.mode === 'rage' && dist(m.targetX, m.targetY, bot.x, bot.y) < 190 && monsterDist < 520));

    if (monsterBeingTargeted) {
      const escA = this.pickLibraryEscapeAngle(bot, m, bFloor);
      evadeX += Math.cos(escA) * 3.8;
      evadeY += Math.sin(escA) * 3.8;
    }

    const bulletLook = diff === 'RUTHLESS' ? 240 : diff === 'TACTICAL' ? 200 : 110;
    for (const b of this.bullets) {
      if (!sameFloor(b.floor, bFloor) || (b.ownerId === bot.id && b.age < BULLET_SELF_GRACE)) continue;
      const d = dist(bot.x, bot.y, b.x, b.y);
      if (d < bulletLook) {
        const bSpd = Math.hypot(b.vx, b.vy) || 1;
        const side = (bot.x - b.x) * b.vy - (bot.y - b.y) * b.vx >= 0 ? 1 : -1;
        evadeX += (b.vy / bSpd) * side * (diff === 'CHILL' ? 0.8 : 2.1);
        evadeY += (-b.vx / bSpd) * side * (diff === 'CHILL' ? 0.8 : 2.1);
      }
    }

    for (const p of this.pickups) {
      if (!sameFloor(p.floor, bFloor)) continue;
      if (p.kind === 'tnt' && p.armed) {
        const d = dist(bot.x, bot.y, p.x, p.y);
        const fleeR = diff === 'CHILL' ? 105 : TNT_BLAST_RADIUS + 46;
        if (d < fleeR) {
          const away = Math.atan2(bot.y - p.y, bot.x - p.x);
          evadeX += Math.cos(away) * 2.8;
          evadeY += Math.sin(away) * 2.8;
        }
      } else if (p.kind === 'nitro' && diff !== 'CHILL') {
        const d = dist(bot.x, bot.y, p.x, p.y);
        if (d < NITRO_RADIUS + PLAYER_RADIUS + 26) {
          const away = Math.atan2(bot.y - p.y, bot.x - p.x);
          evadeX += Math.cos(away) * 2.1;
          evadeY += Math.sin(away) * 2.1;
        }
      }
    }

    bot.aiThinkTimer -= dt;
    bot.aiHoldShotTimer -= dt;

    // Smart Explosive Use on Library (Stun Figure OR Blast/Bait Rivals!)
    let activeAimAngle: number | null = null;
    if (bot.ammo > 0 && bot.aiHoldShotTimer <= 0) {
      // Priority A (Ruthless / Tactical): Shoot Nitro or TNT to STUN Figure when Figure is chasing or close!
      if (diff !== 'CHILL' && m.stunTimer <= 0 && sameFloorMonster && monsterDist < 540) {
        for (const n of this.pickups) {
          if (!sameFloor(n.floor, bFloor)) continue;
          if (n.kind !== 'nitro' && !(n.kind === 'tnt' && !n.armed)) continue;
          const blastR = n.kind === 'tnt' ? TNT_BLAST_RADIUS : NITRO_BLAST_RADIUS;
          if (
            dist(n.x, n.y, m.x, m.y) <= blastR + m.radius - 6 &&
            dist(n.x, n.y, bot.x, bot.y) > blastR + 24 &&
            this.hasLineOfSight(bot.x, bot.y, n.x, n.y, bFloor)
          ) {
            bot.angle = Math.atan2(n.y - bot.y, n.x - bot.x);
            this.fireBullet(bot);
            bot.aiHoldShotTimer = 0.65;
            return;
          }
        }
      }

      // Priority B (Ruthless): Shoot Nitro/TNT near rival (either kills rival OR triggers Figure rage toward rival!)
      const visibleRivals = this.players.filter(
        (e) =>
          e.id !== bot.id &&
          e.alive &&
          !this.isTeammate(bot.id, e.id) &&
          this.canBotSeePoint(bot, e.x, e.y, e.floor ?? 0)
      );
      if (diff === 'RUTHLESS') {
        for (const n of this.pickups) {
          if (!sameFloor(n.floor, bFloor)) continue;
          if (n.kind !== 'nitro' && !(n.kind === 'tnt' && !n.armed)) continue;
          const blastR = n.kind === 'tnt' ? TNT_BLAST_RADIUS : NITRO_BLAST_RADIUS;
          if (dist(n.x, n.y, bot.x, bot.y) <= blastR + 24) continue;
          const rivalNear = visibleRivals.some((e) => dist(n.x, n.y, e.x, e.y) <= blastR + 25);
          if (rivalNear && this.hasLineOfSight(bot.x, bot.y, n.x, n.y, bFloor)) {
            bot.angle = Math.atan2(n.y - bot.y, n.x - bot.x);
            this.fireBullet(bot);
            bot.aiHoldShotTimer = 0.55;
            return;
          }
        }
      }

      // Priority C: Shoot genuinely visible rival on same floor (NO darkness cheat!)
      if (visibleRivals.length > 0 && (diff !== 'RUTHLESS' || bot.ammo >= 2 || visibleRivals.some((e) => dist(bot.x, bot.y, e.x, e.y) < 260 || e.hp <= BULLET_DAMAGE))) {
        const target = visibleRivals[0];
        const aimSpread = diff === 'RUTHLESS' ? 0.03 : diff === 'TACTICAL' ? 0.12 : 0.45;
        const dT = dist(bot.x, bot.y, target.x, target.y);
        const travelT = dT / this.getBulletSpeed();
        const lead = diff === 'RUTHLESS' ? 0.92 : diff === 'TACTICAL' ? 0.72 : 0.15;
        const predX = target.x + target.vx * travelT * lead;
        const predY = target.y + target.vy * travelT * lead;
        bot.angle = Math.atan2(predY - bot.y, predX - bot.x) + (Math.random() - 0.5) * aimSpread;
        this.fireBullet(bot);
        bot.aiHoldShotTimer = diff === 'RUTHLESS' ? 0.38 : diff === 'TACTICAL' ? 0.85 : 1.25;
        return;
      }
    }

    if (Math.hypot(evadeX, evadeY) > 0.35) {
      const rawEvade = Math.atan2(evadeY, evadeX);
      bot.aiTargetAngle = this.pickClearMoveAngle(bot, rawEvade, 74, bot.aiStrafeDir);
      // When chased at close range, sprint to break line/cross stairs; once distanced, stealth!
      bot.aiMoveRatio = monsterDist < 290 ? 0.98 : 0.72;
    } else if (mem.unstickTimer > 0) {
      bot.aiTargetAngle = mem.unstickAngle;
      bot.aiMoveRatio = sameFloorMonster && monsterDist < LIBRARY_HEARING_RADIUS - 40 ? 0.72 : 0.9;
    } else {
      const inHearing = m.stunTimer <= 0 && sameFloorMonster && monsterDist < LIBRARY_HEARING_RADIUS - 35;

      // Ruthless Figure Rage Baiting: if Figure is calm and a rival is much closer to Figure while bot has strong escape margin, briefly sprint to wake Figure onto them!
      if (
        diff === 'RUTHLESS' &&
        inHearing &&
        m.mode === 'calm' &&
        mem.rageBaitCooldown <= 0 &&
        monsterDist > 390 &&
        mem.rageBaitTimer <= 0
      ) {
        const rivalNearFigure = this.players.some(
          (e) =>
            e.id !== bot.id &&
            e.alive &&
            !this.isTeammate(bot.id, e.id) &&
            sameFloor(e.floor, m.floor) &&
            dist(e.x, e.y, m.x, m.y) < Math.min(340, monsterDist - 140)
        );
        if (rivalNearFigure) {
          mem.rageBaitTimer = 0.42;
          mem.rageBaitCooldown = 8.5;
        }
      }

      let safeWalkRatio = 0.92;
      if (mem.rageBaitTimer > 0) {
        safeWalkRatio = 1.0; // Deliberate sprint noise to rage Figure near rival!
      } else if (inHearing) {
        // Chill bots clumsily slip above 80% noise threshold sometimes and accidentally wake Figure!
        safeWalkRatio = diff === 'CHILL' && Math.random() < 0.04 ? 0.98 : 0.72;
      }

      if (bot.aiThinkTimer <= 0) {
        bot.aiThinkTimer = diff === 'RUTHLESS' ? 0.18 : 0.25;
        let goalX = this.map.width * 0.5;
        let goalY = this.map.height * 0.5;
        let goalFloor: FloorLevel = bFloor;

        // Opportunistic visible/nearby pickups on Library
        const medkitTarget =
          bot.hp <= 55
            ? this.pickups
                .filter((p) => p.kind === 'medkit' && sameFloor(p.floor, bFloor) && dist(bot.x, bot.y, p.x, p.y) < 380)
                .sort((a, b) => dist(bot.x, bot.y, a.x, a.y) - dist(bot.x, bot.y, b.x, b.y))[0]
            : undefined;
        const ammoWant = diff === 'RUTHLESS' ? 2 : diff === 'TACTICAL' ? 1 : 0;
        const ammoTarget =
          bot.ammo < ammoWant
            ? this.pickups
                .filter((p) => p.kind === 'bullet' && sameFloor(p.floor, bFloor) && dist(bot.x, bot.y, p.x, p.y) < 380)
                .sort((a, b) => dist(bot.x, bot.y, a.x, a.y) - dist(bot.x, bot.y, b.x, b.y))[0]
            : undefined;

        if (medkitTarget) {
          goalX = medkitTarget.x;
          goalY = medkitTarget.y;
          goalFloor = bFloor;
        } else if (ammoTarget && (!prog || prog.collectedCount < LIBRARY_BOOKS_PER_PLAYER)) {
          goalX = ammoTarget.x;
          goalY = ammoTarget.y;
          goalFloor = bFloor;
        } else if (prog && prog.collectedCount < LIBRARY_BOOKS_PER_PLAYER) {
          const remaining = prog.books.filter((b) => !b.collected);
          remaining.sort((a, b) => {
            const penaltyA =
              (a.floor === bFloor ? 0 : 620) +
              (diff !== 'CHILL' && m.stunTimer <= 0 && a.floor === m.floor && dist(a.x, a.y, m.x, m.y) < 360 ? 550 : 0);
            const penaltyB =
              (b.floor === bFloor ? 0 : 620) +
              (diff !== 'CHILL' && m.stunTimer <= 0 && b.floor === m.floor && dist(b.x, b.y, m.x, m.y) < 360 ? 550 : 0);
            return penaltyA + dist(bot.x, bot.y, a.x, a.y) - (penaltyB + dist(bot.x, bot.y, b.x, b.y));
          });
          if (remaining[0]) {
            const app = this.getBookApproachPoint(remaining[0]);
            goalX = app.x;
            goalY = app.y;
            goalFloor = remaining[0].floor;
          }
        } else if (door) {
          const outX = door.side === 'W' ? door.x - 58 : door.side === 'E' ? door.x + 58 : door.x;
          const outY = door.side === 'N' ? door.y - 58 : door.side === 'S' ? door.y + 58 : door.y;
          goalX = outX;
          goalY = outY;
          goalFloor = 0;
        }

        // If already on same floor with short unobstructed line to goal, steer straight to exact goal!
        const directClear =
          bFloor === goalFloor &&
          dist(bot.x, bot.y, goalX, goalY) < 220 &&
          this.isSegmentClearOnFloor(bot.x, bot.y, goalX, goalY, PLAYER_RADIUS + 2, bFloor);

        let wpX = goalX;
        let wpY = goalY;

        if (!directClear) {
          const existing = this.botPaths.get(bot.id);
          const needNewPath =
            !existing ||
            existing.timer <= 0 ||
            existing.goalFloor !== goalFloor ||
            dist(existing.goalX, existing.goalY, goalX, goalY) > 75 ||
            existing.nodes.length === 0;
          if (needNewPath) {
            const nodes = this.findNavPathOnGraph(this.botNavNodes, bot.x, bot.y, bFloor, goalX, goalY, goalFloor);
            this.botPaths.set(bot.id, { nodes, timer: 1.0, goalX, goalY, goalFloor });
          } else {
            existing.timer -= diff === 'RUTHLESS' ? 0.18 : 0.25;
          }

          const pathState = this.botPaths.get(bot.id);
          if (pathState && pathState.nodes.length > 0) {
            while (pathState.nodes.length > 0) {
              const next = pathState.nodes[0];
              const hitDist = next.isStair ? 42 : 44;
              if (
                dist(bot.x, bot.y, next.x, next.y) < hitDist &&
                ((next.isStair && (next.floor === bFloor || pathState.nodes.length > 1)) || next.floor === bFloor)
              ) {
                pathState.nodes.shift();
              } else {
                wpX = next.x;
                wpY = next.y;
                break;
              }
            }
          }
        }

        const rawAngle = Math.atan2(wpY - bot.y, wpX - bot.x);
        bot.aiTargetAngle = this.pickClearMoveAngle(bot, rawAngle, 58, bot.aiStrafeDir);
        bot.aiMoveRatio = safeWalkRatio;
      }
    }

    const desiredFacing =
      activeAimAngle !== null
        ? activeAimAngle
        : this.config.extraDark
          ? normalizeAngle(bot.aiTargetAngle + Math.sin(mem.scanPhase) * 0.42)
          : bot.aiTargetAngle;
    const angleDiff = normalizeAngle(desiredFacing - bot.angle);
    const turnSpeed = diff === 'RUTHLESS' ? 11 : 8;
    bot.angle = normalizeAngle(bot.angle + clamp(angleDiff, -turnSpeed * dt, turnSpeed * dt));

    const targetSpeed = this.getPlayerMaxSpeed() * bot.aiMoveRatio;
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

  public getSnapshot(localPlayerId = 0): GameSnapshot {
    return {
      players: this.players.map((p) => {
        const prog = this.libraryState?.playerProgress.find((pp) => pp.playerId === p.id);
        return {
          id: p.id,
          name: p.name,
          team: p.team,
          isHuman: p.id === localPlayerId,
          color: p.color,
          accentColor: p.accentColor,
          finish: p.finish ?? 'solid',
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
          hearts: prog?.hearts,
          escapedRank: prog?.escapedRank ?? null,
          eliminated: prog?.eliminated ?? false,
        };
      }),
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
      modifiers: this.getModifiers(),
      elapsedTime: this.elapsedTime,
      screenShake: this.screenShake,
      winnerId: this.winnerId,
      winnerTeam: this.winnerTeam,
      winnerReason: this.winnerReason,
      libraryState: this.libraryState
        ? {
            pillarSequence: this.libraryState.pillarSequence,
            totalCollectedAll: this.libraryState.totalCollectedAll,
            introTimer: Math.round(this.libraryState.introTimer * 100) / 100,
            escapedOrder: [...this.libraryState.escapedOrder],
            monster: { ...this.libraryState.monster },
            playerProgress: this.libraryState.playerProgress.map((pp) => ({
              playerId: pp.playerId,
              collectedCount: pp.collectedCount,
              books: pp.books,
              clues: pp.clues,
              codeDigits: pp.codeDigits,
              unlocked: pp.unlocked,
              escapedRank: pp.escapedRank ?? null,
              hearts: pp.hearts,
              eliminated: pp.eliminated ?? false,
            })),
            doors: this.libraryState.doors,
          }
        : undefined,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        color: p.color,
        accentColor: p.accentColor,
        finish: p.finish ?? 'solid',
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        vx: Math.round(p.vx),
        vy: Math.round(p.vy),
        angle: Math.round(p.angle * 1000) / 1000,
        floor: p.floor ?? 0,
        stairBlend: Math.round((p.stairBlend ?? 0) * 100) / 100,
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
