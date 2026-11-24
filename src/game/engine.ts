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
  FIGURE_DIFFICULTY_PROFILES,
  type FigureDifficultyProfile,
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
  MONSTER_SLOW_DURATION,
  MONSTER_STUN_DURATION,
  type MatchConfig,
  type MatchModifiers,
  type BulletSpawnLevel,
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
  PLAYER_SPEED_MULTS,
  PLAYER_TURN_SPEED,
  PLAYER_COLOR_PALETTE,
  POST_STUN_GRACE_DURATION,
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

function getWallBounceCode(kind?: WallRect['kind']): number {
  switch (kind) {
    case 'perimeter_steel':
    case 'metal':
      return 2; // metal
    case 'rock':
    case 'library_pillar':
      return 3; // stone
    case 'perimeter_hedge':
    case 'tree':
    case 'pine_tree':
    case 'hedge':
      return 4; // foliage
    case 'perimeter_ice':
      return 5; // ice
    case 'perimeter_wood':
    case 'sofa':
    case 'bed':
    case 'table':
    case 'bookshelf':
    case 'mezzanine_rail':
    case 'stair_rail':
    default:
      return 1; // wood
  }
}

const SPAWN_RATE_MULTS: Record<ModifierLevel, number> = {
  LOW: 0.6,
  MEDIUM: 1.0,
  HIGH: 1.55,
};

const BULLET_SPAWN_RATE_MULTS: Record<BulletSpawnLevel, number> = {
  DREAD: 0.6,
  LOW: 1.0,
  MEDIUM: 1.55,
  HIGH: 2.25,
};

const TURN_SPEED_MULTS: Record<ModifierLevel, number> = {
  LOW: 0.72,
  MEDIUM: 1.0,
  HIGH: 1.35,
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

const SPAWN_PROTECTION_DURATION: Record<ModifierLevel, number> = {
  LOW: 0.9,
  MEDIUM: SPAWN_INVULN_DURATION,
  HIGH: 2.2,
};

const SPAWN_PROTECTION_BOOST: Record<ModifierLevel, number> = {
  LOW: 0.25,
  MEDIUM: 0.55,
  HIGH: 0.85,
};

const POST_STUN_GRACE_DURATIONS: Record<ModifierLevel, number> = {
  LOW: 0.5,
  MEDIUM: POST_STUN_GRACE_DURATION,
  HIGH: 1.5,
};

const POST_STUN_GRACE_BOOST: Record<ModifierLevel, number> = {
  LOW: 0.25,
  MEDIUM: 0.5,
  HIGH: 0.75,
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
  lastSeenVx: number;
  lastSeenVy: number;
  lastSeenFloor: FloorLevel;
  lastSeenTimer: number;
  pendingShotAngle: number | null;
  pendingShotExpire: number;
  pendingShotTargetId: number | null;
  pendingShotIsTrick: boolean;
  lockedGoalBookId: number | null;
  goalLockTimer: number;
  collectingBookId: number | null;
  bookCollectTimer: number;
  stairCommit: { stairId: number; targetFloor: FloorLevel; timer: number } | null;
  rageBaitTimer: number;
  rageBaitCooldown: number;
  dialTimer: number;
  dialTargetTime: number;
  dialMistakeDone: boolean;
  lastKnownHp: number;
  defendPillarTimer: number;
  lastProgressX: number;
  lastProgressY: number;
  stuckTimer: number;
  unstickTimer: number;
  unstickAngle: number;
  stuckAvoidX: number;
  stuckAvoidY: number;
  stuckAvoidTimer: number;
  lastSector: number;
  tntEscAngle: number;
  tntEscTimer: number;
  escapeGoalX: number;
  escapeGoalY: number;
  escapeGoalTimer: number;
  libMonsterEscAngle: number;
  libMonsterEscTimer: number;
  libRivalEscAngle: number;
  libRivalEscTimer: number;
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

  public cursorInput2 = {
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

  public joystick2: JoystickState = {
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

  private static arenaBotGraphCache = new Map<string, NavNode[]>();
  private static navBucketCache = new WeakMap<
    NavNode[],
    { cellSize: number; cols: number; rows: number; bucketsByFloor: [Map<number, NavNode[]>, Map<number, NavNode[]>] }
  >();

  private wallsByFloor: [WallRect[], WallRect[]] = [[], []];
  private navNodes: NavNode[] = [];
  private botNavNodes: NavNode[] = [];
  private astarCap = 0;
  private astarG = new Float32Array(0);
  private astarF = new Float32Array(0);
  private astarCameFrom = new Int32Array(0);
  private astarClosed = new Uint8Array(0);
  private astarInOpen = new Uint8Array(0);
  private astarHeap: number[] = [];
  private monsterPath: NavNode[] = [];
  private monsterPathTimer = 0;
  private monsterStepTimer = 0.25;
  private monsterRageSpeedScale = 1.0;
  private monsterHearCheckTimer = 0;
  private monsterChasedPlayerId: number | null = null;
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
  private recentSoundCues: Array<{ x: number; y: number; floor: FloorLevel; ttl: number; strength: number }> = [];

  private getModifiers(): MatchModifiers {
    return this.config.modifiers ?? DEFAULT_MATCH_MODIFIERS;
  }

  private getPlayerMaxSpeed(): number {
    return PLAYER_MAX_SPEED * PLAYER_SPEED_MULTS[this.getModifiers().playerSpeed];
  }

  private getPlayerTurnSpeed(): number {
    return PLAYER_TURN_SPEED * (TURN_SPEED_MULTS[this.getModifiers().turnSpeed] ?? 1.0);
  }

  private getBulletSpeed(): number {
    return BULLET_SPEED * BULLET_SPEED_MULTS[this.getModifiers().bulletSpeed];
  }

  private getSpawnProtectionDuration(): number {
    return SPAWN_PROTECTION_DURATION[this.getModifiers().spawnProtection] ?? SPAWN_INVULN_DURATION;
  }

  private getSpawnProtectionBoostBonus(): number {
    return SPAWN_PROTECTION_BOOST[this.getModifiers().spawnProtection] ?? 0.55;
  }

  private getPostStunGraceDuration(): number {
    const lvl = this.getModifiers().postStunGrace;
    if (typeof lvl === 'boolean') return lvl ? POST_STUN_GRACE_DURATION : 0;
    return POST_STUN_GRACE_DURATIONS[lvl] ?? POST_STUN_GRACE_DURATION;
  }

  private getPostStunBoostBonus(): number {
    const lvl = this.getModifiers().postStunGrace;
    if (typeof lvl === 'boolean') return lvl ? 0.5 : 0;
    return POST_STUN_GRACE_BOOST[lvl] ?? 0.5;
  }

  private getFigureProfile(): FigureDifficultyProfile {
    return (
      FIGURE_DIFFICULTY_PROFILES[this.getModifiers().figureDifficulty] ??
      FIGURE_DIFFICULTY_PROFILES.STANDARD
    );
  }

  constructor(config: MatchConfig, slots?: SlotSetup[]) {
    this.config = config;
    this.map = ARENA_MAPS[config.mapId];
    this.reset(config, slots);
  }

  public reset(config: MatchConfig, slots?: SlotSetup[]) {
    const requestedMap = ARENA_MAPS[config.mapId];
    const sanitizedConfig: MatchConfig =
      !slots && config.local2P && requestedMap?.immersive
        ? { ...config, mapId: 'crossroads', immersive: false, extraDark: false }
        : config;
    this.config = sanitizedConfig;
    this.map = ARENA_MAPS[sanitizedConfig.mapId];
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
    this.wallsByFloor = [
      this.map.walls.filter((w) => isWallOnFloor(w, 0)),
      this.map.walls.filter((w) => isWallOnFloor(w, 1)),
    ];
    this.navNodes = [];
    this.botNavNodes = [];
    this.monsterPath = [];
    this.monsterPathTimer = 0;
    this.monsterStepTimer = 0.25;
    this.monsterRageSpeedScale = 1.0;
    this.monsterHearCheckTimer = 0;
    this.monsterChasedPlayerId = null;
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
    this.recentSoundCues = [];

    const mods = this.getModifiers();
    const isImmersive = this.map.immersive;
    const isLibrary = this.map.id === 'library';
    this.bulletSpawnTimer =
      (isLibrary ? 1.8 : isImmersive ? 1.5 : 2.0) /
      (BULLET_SPAWN_RATE_MULTS[mods.bulletSpawn] ?? BULLET_SPAWN_RATE_MULTS.MEDIUM);
    this.nitroSpawnTimer = (isLibrary ? 12.0 : isImmersive ? 11.5 : 6.0) / SPAWN_RATE_MULTS[mods.nitroSpawn];
    this.tntSpawnTimer = (isLibrary ? 9.0 : isImmersive ? 7.5 : 9.0) / SPAWN_RATE_MULTS[mods.tntSpawn];
    this.medkitSpawnTimer = (isLibrary ? 10.5 : isImmersive ? 9.0 : 11.0) / SPAWN_RATE_MULTS[mods.medkitSpawn];
    this.boxSpawnTimer = isLibrary ? 3.5 : isImmersive ? 2.5 : 2.4;

    this.joystick.active = false;
    this.joystick.pointerId = null;
    this.joystick.magnitude = 0;
    this.joystick.dx = 0;
    this.joystick.dy = 0;

    this.joystick2.active = false;
    this.joystick2.pointerId = null;
    this.joystick2.magnitude = 0;
    this.joystick2.dx = 0;
    this.joystick2.dy = 0;

    this.cursorInput.active = false;
    this.cursorInput.hasAim = false;
    this.cursorInput.magnitude = 0;

    this.cursorInput2.active = false;
    this.cursorInput2.hasAim = false;
    this.cursorInput2.magnitude = 0;

    const isLocal2P = !slots && Boolean(config.local2P);
    const includeBots = isLocal2P ? config.local2PIncludeBots !== false : true;
    if (isLocal2P && !includeBots && this.config.teamMode === '2V2') {
      this.config = { ...this.config, teamMode: 'FFA' };
    }

    const effectiveSlots: SlotSetup[] =
      slots ??
      (isLocal2P
        ? PLAYER_PRESETS.map((p, idx) => {
            const is2v2 = this.config.teamMode === '2V2';
            const team = is2v2 ? (idx <= 1 ? 0 : 1) : idx === 0 || idx === 2 ? 0 : 1;
            return {
              slot: idx,
              name: idx === 0 ? 'P1' : idx === 1 ? 'P2' : p.defaultName,
              isHuman: idx <= 1,
              enabled: idx <= 1 || includeBots,
              colorId:
                idx === 0
                  ? config.playerColorId
                  : idx === 1
                    ? config.player2ColorId ?? 'crimson'
                    : undefined,
              team,
            };
          })
        : PLAYER_PRESETS.map((p, idx) => ({
            slot: idx,
            name: idx === 0 ? 'You' : p.defaultName,
            isHuman: idx === 0,
            enabled: true,
            colorId: idx === 0 ? config.playerColorId : undefined,
            team: idx === 0 || idx === 2 ? 0 : 1,
          })));

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
        spawnInvulnTimer: 0,
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
    } else {
      const cacheKey = `${this.map.id}:bot32`;
      let cached = ArenaEngine.arenaBotGraphCache.get(cacheKey);
      if (!cached) {
        cached = this.buildGridNavGraph(32, PLAYER_RADIUS + 2);
        ArenaEngine.arenaBotGraphCache.set(cacheKey, cached);
      }
      this.botNavNodes = cached;
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

  public setJoystick2Vector(active: boolean, angle: number, magnitude: number, pointerId: number | null = null) {
    this.joystick2.active = active;
    this.joystick2.pointerId = active ? pointerId : null;
    const mag = clamp(Number.isFinite(magnitude) ? magnitude : 0, 0, 1);
    const safeAngle = Number.isFinite(angle) ? angle : this.joystick2.angle;
    this.joystick2.angle = safeAngle;
    this.joystick2.magnitude = active ? mag : 0;
    this.joystick2.dx = active ? Math.cos(safeAngle) * mag : 0;
    this.joystick2.dy = active ? Math.sin(safeAngle) * mag : 0;
  }

  public setControlScheme(scheme: ControlScheme) {
    this.controlScheme = scheme;
    this.joystick.active = false;
    this.joystick.pointerId = null;
    this.joystick.magnitude = 0;
    this.joystick.dx = 0;
    this.joystick.dy = 0;
    this.joystick2.active = false;
    this.joystick2.pointerId = null;
    this.joystick2.magnitude = 0;
    this.joystick2.dx = 0;
    this.joystick2.dy = 0;
    this.cursorInput.active = false;
    this.cursorInput.hasAim = false;
    this.cursorInput.magnitude = 0;
    this.cursorInput2.active = false;
    this.cursorInput2.hasAim = false;
    this.cursorInput2.magnitude = 0;
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

  public setPlayer2CursorInput(
    active: boolean,
    aimAngle: number,
    magnitude: number,
    moveAngle?: number,
    hasAim = true
  ) {
    this.cursorInput2.active = active;
    this.cursorInput2.hasAim = hasAim;
    if (Number.isFinite(aimAngle)) this.cursorInput2.aimAngle = aimAngle;
    const nextMoveAngle = moveAngle !== undefined ? moveAngle : aimAngle;
    if (Number.isFinite(nextMoveAngle)) this.cursorInput2.moveAngle = nextMoveAngle;
    this.cursorInput2.magnitude = clamp(Number.isFinite(magnitude) ? magnitude : 0, 0, 1);
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

  public releaseJoystick2(pointerId?: number) {
    if (!this.joystick2.active) return;
    if (pointerId !== undefined && this.joystick2.pointerId !== pointerId) return;

    this.joystick2.active = false;
    this.joystick2.pointerId = null;
    this.joystick2.dx = 0;
    this.joystick2.dy = 0;
    this.joystick2.magnitude = 0;

    this.firePlayerShot(1);
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
    for (let i = this.recentSoundCues.length - 1; i >= 0; i--) {
      this.recentSoundCues[i].ttl -= dt;
      if (this.recentSoundCues[i].ttl <= 0) {
        this.recentSoundCues.splice(i, 1);
      }
    }

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
    const bMult = BULLET_SPAWN_RATE_MULTS[mods.bulletSpawn] ?? BULLET_SPAWN_RATE_MULTS.MEDIUM;
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
    for (const wall of this.wallsByFloor[floor]) {
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
      for (const wall of this.wallsByFloor[boxFloor]) {
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

    // Separate active boxes from one another with momentum exchange & smooth edge sliding
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.boxes.length; i++) {
        const a = this.boxes[i];
        if (a.state !== 'active') continue;
        for (let j = i + 1; j < this.boxes.length; j++) {
          const b = this.boxes[j];
          if (b.state !== 'active' || !sameFloor(a.floor, b.floor)) continue;
          if (this.resolveCratePairCollision(a, a.w * 0.5, a.h * 0.5, b, b.w * 0.5, b.h * 0.5)) {
            this.resolveRectAgainstWalls(a, a.w * 0.5, a.h * 0.5);
            this.resolveRectAgainstWalls(b, b.w * 0.5, b.h * 0.5);
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
    for (const wall of this.wallsByFloor[floor]) {
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
      const tntState = {
        x: tnt.x,
        y: tnt.y,
        vx: tnt.vx ?? 0,
        vy: tnt.vy ?? 0,
        floor: tnt.floor ?? 0,
      };
      for (const box of this.boxes) {
        if (box.state !== 'active' || !sameFloor(box.floor, tnt.floor)) continue;
        if (this.resolveCratePairCollision(tntState, TNT_HALF_SIZE, TNT_HALF_SIZE, box, box.w * 0.5, box.h * 0.5)) {
          this.resolveRectAgainstWalls(tntState, TNT_HALF_SIZE, TNT_HALF_SIZE);
          this.resolveRectAgainstWalls(box, box.w * 0.5, box.h * 0.5);
        }
      }
      tnt.x = tntState.x;
      tnt.y = tntState.y;
      tnt.vx = tntState.vx;
      tnt.vy = tntState.vy;
    }
    for (let i = 0; i < tntItems.length; i++) {
      for (let j = i + 1; j < tntItems.length; j++) {
        const a = tntItems[i];
        const b = tntItems[j];
        if (!sameFloor(a.floor, b.floor)) continue;
        const aState = { x: a.x, y: a.y, vx: a.vx ?? 0, vy: a.vy ?? 0, floor: a.floor ?? 0 };
        const bState = { x: b.x, y: b.y, vx: b.vx ?? 0, vy: b.vy ?? 0, floor: b.floor ?? 0 };
        if (this.resolveCratePairCollision(aState, TNT_HALF_SIZE, TNT_HALF_SIZE, bState, TNT_HALF_SIZE, TNT_HALF_SIZE)) {
          this.resolveRectAgainstWalls(aState, TNT_HALF_SIZE, TNT_HALF_SIZE);
          this.resolveRectAgainstWalls(bState, TNT_HALF_SIZE, TNT_HALF_SIZE);
          a.x = aState.x;
          a.y = aState.y;
          a.vx = aState.vx;
          a.vy = aState.vy;
          b.x = bState.x;
          b.y = bState.y;
          b.vx = bState.vx;
          b.vy = bState.vy;
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
        if (player.stunTimer <= 0) {
          player.postStunGraceTimer = this.getPostStunGraceDuration();
        }
        const friction = Math.exp(-6.5 * dt);
        player.vx *= friction;
        player.vy *= friction;
      } else {
        if ((player.postStunGraceTimer ?? 0) > 0) {
          player.postStunGraceTimer = Math.max(0, (player.postStunGraceTimer ?? 0) - dt);
        }
        if (player.isHuman) {
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
          } else if (player.id === 1) {
            if (this.controlScheme === 'CURSOR_SPACE') {
              this.applyAnalogInput(
                player,
                this.cursorInput2.active,
                this.cursorInput2.aimAngle,
                this.cursorInput2.magnitude,
                dt,
                this.cursorInput2.moveAngle,
                this.cursorInput2.hasAim
              );
            } else {
              this.applyAnalogInput(
                player,
                this.joystick2.active,
                this.joystick2.angle,
                this.joystick2.magnitude,
                dt
              );
            }
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
      }

      player.x += player.vx * dt;
      player.y += player.vy * dt;

      // Push movable active cardboard boxes & movable TNT crates (with post-push wall resolution so corners never jam)
      for (const box of this.boxes) {
        if (box.state !== 'active' || !sameFloor(box.floor, player.floor)) continue;
        if (this.pushMovableCrate(player, box, box.w * 0.5, box.h * 0.5)) {
          this.resolveRectAgainstWalls(box, box.w * 0.5, box.h * 0.5);
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
          this.resolveRectAgainstWalls(tntCrate, TNT_HALF_SIZE, TNT_HALF_SIZE);
          item.x = tntCrate.x;
          item.y = tntCrate.y;
          item.vx = tntCrate.vx;
          item.vy = tntCrate.vy;
          if (!item.armed) item.ownerId = player.id;
        }
      }

      const pFloor = player.floor ?? 0;
      const floorWalls = this.wallsByFloor[pFloor];
      for (let pass = 0; pass < 2; pass++) {
        for (const wall of floorWalls) {
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

  private resolveCratePairCollision(
    a: { x: number; y: number; vx: number; vy: number; floor?: FloorLevel },
    aHalfW: number,
    aHalfH: number,
    b: { x: number; y: number; vx: number; vy: number; floor?: FloorLevel },
    bHalfW: number,
    bHalfH: number
  ): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const overlapX = aHalfW + bHalfW - Math.abs(dx);
    const overlapY = aHalfH + bHalfH - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) return false;

    // Slight corner-grazing smooth tangential glide so edges never catch rigidly
    const cornerThresh = 12;
    if (overlapX < cornerThresh && overlapY < cornerThresh) {
      const signX = dx >= 0 ? 1 : -1;
      const signY = dy >= 0 ? 1 : -1;
      const sep = Math.min(overlapX, overlapY) * 0.52;
      a.x -= signX * sep;
      b.x += signX * sep;
      a.y -= signY * sep * 0.6;
      b.y += signY * sep * 0.6;
      const avgVx = (a.vx + b.vx) * 0.48;
      const avgVy = (a.vy + b.vy) * 0.48;
      a.vx = avgVx - signX * 26;
      b.vx = avgVx + signX * 26;
      a.vy = avgVy - signY * 18;
      b.vy = avgVy + signY * 18;
      return true;
    }

    if (overlapX < overlapY) {
      const sign = dx >= 0 ? 1 : -1;
      a.x -= sign * overlapX * 0.5;
      b.x += sign * overlapX * 0.5;
      const relVx = a.vx - b.vx;
      if (relVx * sign > 0) {
        const imp = relVx * 0.65;
        a.vx -= imp;
        b.vx += imp;
      }
      // Subtle lateral slide if offset on perpendicular axis (prevents edge wedging)
      if (Math.abs(dy) > 8) {
        const lat = Math.sign(dy) * 22;
        a.vy -= lat;
        b.vy += lat;
      }
    } else {
      const sign = dy >= 0 ? 1 : -1;
      a.y -= sign * overlapY * 0.5;
      b.y += sign * overlapY * 0.5;
      const relVy = a.vy - b.vy;
      if (relVy * sign > 0) {
        const imp = relVy * 0.65;
        a.vy -= imp;
        b.vy += imp;
      }
      if (Math.abs(dx) > 8) {
        const lat = Math.sign(dx) * 22;
        a.vx -= lat;
        b.vx += lat;
      }
    }
    return true;
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
    const tol = 7;

    for (const wall of this.wallsByFloor[floor]) {
      const overlapY = Math.min(cy + halfH, wall.y + wall.h) - Math.max(cy - halfH, wall.y);
      if (overlapY > 3) {
        if (Math.abs(cx - halfW - (wall.x + wall.w)) <= tol) pinX = -1;
        else if (Math.abs(cx + halfW - wall.x) <= tol) pinX = 1;
      }
      const overlapX = Math.min(cx + halfW, wall.x + wall.w) - Math.max(cx - halfW, wall.x);
      if (overlapX > 3) {
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

    let pushVx = crate.vx - nx * 135 + player.vx * 0.38;
    let pushVy = crate.vy - ny * 135 + player.vy * 0.38;

    // If flush against a single wall, redirect inward push into lateral glide so crates slide smoothly along walls & edges
    if (pins.pinX !== 0 && pushVx * pins.pinX > 0) {
      const lateralDir = Math.abs(player.vy) > 16 ? Math.sign(player.vy) : Math.sign(crate.y - player.y || 1);
      pushVy += lateralDir * Math.min(200, Math.abs(pushVx) * 0.9);
      pushVx = 0;
    }
    if (pins.pinY !== 0 && pushVy * pins.pinY > 0) {
      const lateralDir = Math.abs(player.vx) > 16 ? Math.sign(player.vx) : Math.sign(crate.x - player.x || 1);
      pushVx += lateralDir * Math.min(200, Math.abs(pushVy) * 0.9);
      pushVy = 0;
    }

    crate.vx = clamp(pushVx, -280, 280);
    crate.vy = clamp(pushVy, -280, 280);
    return true;
  }

  private calcSmoothBoost(remaining: number, duration: number, maxBonus: number): number {
    if (remaining <= 0 || duration <= 0 || maxBonus <= 0) return 1;
    const t = clamp(1 - remaining / duration, 0, 1);
    const u = clamp(t / 0.16, 0, 1);
    const rise = u * u * (3 - 2 * u);
    const d = clamp((1 - t) / 0.38, 0, 1);
    const fall = d * d * (3 - 2 * d);
    return 1 + maxBonus * rise * fall;
  }

  private getSpawnBoostMultiplier(player: Player): number {
    const spawnBoost = this.calcSmoothBoost(
      player.spawnInvulnTimer,
      this.getSpawnProtectionDuration(),
      this.getSpawnProtectionBoostBonus()
    );
    const postStunBoost = this.calcSmoothBoost(
      player.postStunGraceTimer ?? 0,
      this.getPostStunGraceDuration(),
      this.getPostStunBoostBonus()
    );
    return Math.max(spawnBoost, postStunBoost);
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
        const maxTurn = this.getPlayerTurnSpeed() * dt;
        player.angle = normalizeAngle(player.angle + clamp(diff, -maxTurn, maxTurn));
      }
    }

    if (active) {
      const deadzone = 0.08;
      const normalizedRatio =
        magnitude <= deadzone ? 0 : (magnitude - deadzone) / (1 - deadzone);

      const boost = this.getSpawnBoostMultiplier(player);
      const targetSpeed = this.getPlayerMaxSpeed() * boost * normalizedRatio;
      const targetVx = Math.cos(moveAngle) * targetSpeed;
      const targetVy = Math.sin(moveAngle) * targetSpeed;

      const dvx = targetVx - player.vx;
      const dvy = targetVy - player.vy;
      const dv = Math.hypot(dvx, dvy);
      const maxStep = PLAYER_MAX_ACCEL * boost * dt;
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
        lastSeenVx: 0,
        lastSeenVy: 0,
        lastSeenFloor: bot.floor ?? 0,
        lastSeenTimer: 0,
        pendingShotAngle: null,
        pendingShotExpire: 0,
        pendingShotTargetId: null,
        pendingShotIsTrick: false,
        lockedGoalBookId: null,
        goalLockTimer: 0,
        collectingBookId: null,
        bookCollectTimer: 0,
        stairCommit: null,
        rageBaitTimer: 0,
        rageBaitCooldown: 2.5,
        dialTimer: 0,
        dialTargetTime: 15 + Math.random() * 5,
        dialMistakeDone: false,
        lastKnownHp: bot.hp,
        defendPillarTimer: 0,
        lastProgressX: bot.x,
        lastProgressY: bot.y,
        stuckTimer: 0,
        unstickTimer: 0,
        unstickAngle: bot.angle,
        stuckAvoidX: bot.x,
        stuckAvoidY: bot.y,
        stuckAvoidTimer: 0,
        lastSector: -1,
        tntEscAngle: bot.angle,
        tntEscTimer: 0,
        escapeGoalX: bot.x,
        escapeGoalY: bot.y,
        escapeGoalTimer: 0,
        libMonsterEscAngle: bot.angle,
        libMonsterEscTimer: 0,
        libRivalEscAngle: bot.angle,
        libRivalEscTimer: 0,
      };
      this.botAiMemory.set(bot.id, mem);
    }
    return mem;
  }

  private isImmersiveMode(): boolean {
    return this.map.immersive || Boolean(this.config.immersive);
  }

  private isPointWithinImmersiveBounds(
    bot: Player,
    tx: number,
    ty: number,
    isGlowingObject = false,
    checkDarkCone = true
  ): boolean {
    if (!this.isImmersiveMode()) return true;
    const dx = Math.abs(tx - bot.x);
    const dy = Math.abs(ty - bot.y);
    const maxHoriz = this.config.extraDark ? (isGlowingObject ? 445 : 415) : 525;
    const maxVert = this.config.extraDark ? (isGlowingObject ? 310 : 285) : 365;
    if (dx > maxHoriz || dy > maxVert) return false;
    const d = Math.hypot(dx, dy);
    const maxRange = this.config.extraDark ? (isGlowingObject ? 455 : 420) : 560;
    if (d > maxRange) return false;
    if (checkDarkCone && this.config.extraDark) {
      const ambientAura = isGlowingObject ? 225 : 155;
      if (d > ambientAura) {
        const angDiff = Math.abs(normalizeAngle(Math.atan2(ty - bot.y, tx - bot.x) - bot.angle));
        if (angDiff > 0.58) return false;
      }
    }
    return true;
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
    if (!this.isPointWithinImmersiveBounds(bot, tx, ty, isGlowingObject, true)) return false;
    return this.hasLineOfSight(bot.x, bot.y, tx, ty, bFloor);
  }

  private segmentHitsBoxOnFloor(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radius: number,
    floor: FloorLevel
  ): boolean {
    for (const box of this.boxes) {
      if (box.state !== 'active' && box.state !== 'spawning') continue;
      if (!sameFloor(box.floor, floor)) continue;
      const expanded: WallRect = {
        x: box.x - box.w * 0.5 - radius,
        y: box.y - box.h * 0.5 - radius,
        w: box.w + radius * 2,
        h: box.h + radius * 2,
      };
      if (segmentIntersectsRect(x1, y1, x2, y2, expanded)) return true;
    }
    return false;
  }

  private pickClearMoveAngle(
    bot: Player,
    desiredAngle: number,
    probeDist = 72,
    strafeBias = 1,
    avoidHazards = false,
    avoidBoxes = false
  ): number {
    const bFloor = bot.floor ?? 0;
    const clearR = PLAYER_RADIUS + 4;
    const directX = bot.x + Math.cos(desiredAngle) * probeDist;
    const directY = bot.y + Math.sin(desiredAngle) * probeDist;
    const isDirectOk =
      this.isSegmentClearOnFloor(bot.x, bot.y, directX, directY, clearR, bFloor) &&
      (!avoidHazards || !this.segmentHitsHazardOnFloor(bot.x, bot.y, directX, directY, bFloor)) &&
      (!avoidBoxes || !this.segmentHitsBoxOnFloor(bot.x, bot.y, directX, directY, PLAYER_RADIUS * 0.65, bFloor));
    if (isDirectOk) {
      return desiredAngle;
    }

    const offsets = [0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.85, -1.85, 2.45, -2.45, Math.PI];
    let bestSafeAngle: number | null = null;
    let bestSafeScore = -Infinity;
    let bestWallAngle: number | null = null;
    let bestWallScore = -Infinity;

    const tryProbeDist = (distCheck: number) => {
      for (const off of offsets) {
        const cand = normalizeAngle(desiredAngle + off * strafeBias);
        const px = bot.x + Math.cos(cand) * distCheck;
        const py = bot.y + Math.sin(cand) * distCheck;
        if (!this.isPointWalkableOnFloor(px, py, clearR, bFloor)) continue;
        if (!this.isSegmentClearOnFloor(bot.x, bot.y, px, py, clearR - 2, bFloor)) continue;
        const align = Math.cos(normalizeAngle(cand - desiredAngle));
        if (align > bestWallScore) {
          bestWallScore = align;
          bestWallAngle = cand;
        }
        if (avoidHazards && this.segmentHitsHazardOnFloor(bot.x, bot.y, px, py, bFloor)) continue;
        if (avoidBoxes && this.segmentHitsBoxOnFloor(bot.x, bot.y, px, py, PLAYER_RADIUS * 0.65, bFloor)) continue;
        if (align > bestSafeScore) {
          bestSafeScore = align;
          bestSafeAngle = cand;
        }
      }
    };

    tryProbeDist(probeDist);
    // Tight corridor/crate fallback: probe shorter distance so bots never hit opposite walls and fall back blindly
    if (bestSafeAngle === null && probeDist > 42) {
      tryProbeDist(Math.max(30, probeDist * 0.52));
    }
    return bestSafeAngle ?? bestWallAngle ?? normalizeAngle(desiredAngle + strafeBias * 1.15);
  }

  private segmentHitsHazardOnFloor(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    floor: FloorLevel = 0
  ): boolean {
    const segLen = dist(x1, y1, x2, y2);
    if (segLen < 8) return false;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    for (const p of this.pickups) {
      if (!sameFloor(p.floor, floor)) continue;
      if (p.kind !== 'nitro' && !(p.kind === 'tnt' && p.armed)) continue;
      const rad = p.kind === 'nitro' ? NITRO_RADIUS + PLAYER_RADIUS + 32 : TNT_BLAST_RADIUS + 24;
      const t = clamp(((p.x - x1) * dx + (p.y - y1) * dy) / lenSq, 0, 1);
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      if (dist(px, py, p.x, p.y) < rad) return true;
    }

    for (const pit of this.icePits) {
      if (!pit.broken) continue;
      const steps = Math.max(2, Math.ceil(segLen / 34));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (isPointInIcePit(x1 + dx * t, y1 + dy * t, pit, PLAYER_RADIUS + 24)) {
          return true;
        }
      }
    }
    return false;
  }

  private countOpenExits(x: number, y: number, floor: FloorLevel = 0): number {
    let exits = 0;
    const checkR = PLAYER_RADIUS + 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * 145;
      const py = y + Math.sin(a) * 145;
      if (this.isSegmentClearOnFloor(x, y, px, py, checkR, floor)) {
        exits++;
      }
    }
    return exits;
  }

  private pickTntSafeEscapeAngle(
    bot: Player,
    floor: FloorLevel,
    prevAngle: number | null = null
  ): number | null {
    const armedTnts = this.pickups.filter(
      (p) =>
        p.kind === 'tnt' &&
        p.armed &&
        sameFloor(p.floor, floor) &&
        dist(bot.x, bot.y, p.x, p.y) < TNT_BLAST_RADIUS + 95
    );
    if (armedTnts.length === 0) return null;

    const clearR = PLAYER_RADIUS + 4;
    let bestAngle = Math.atan2(bot.y - armedTnts[0].y, bot.x - armedTnts[0].x);
    let bestScore = -Infinity;

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      for (const probeDist of [125, 200]) {
        const px = bot.x + Math.cos(a) * probeDist;
        const py = bot.y + Math.sin(a) * probeDist;
        if (!this.isPointWalkableOnFloor(px, py, clearR, floor)) continue;
        if (!this.isSegmentClearOnFloor(bot.x, bot.y, px, py, clearR - 2, floor)) continue;

        let minTntDist = Infinity;
        for (const t of armedTnts) {
          const predTx = t.x + (t.vx ?? 0) * 0.42;
          const predTy = t.y + (t.vy ?? 0) * 0.42;
          const dCur = dist(px, py, t.x, t.y);
          const dPred = dist(px, py, predTx, predTy);
          minTntDist = Math.min(minTntDist, dCur, dPred);
        }

        let score =
          minTntDist >= TNT_BLAST_RADIUS + 54
            ? 750 + Math.min(220, minTntDist - TNT_BLAST_RADIUS)
            : minTntDist * 3.8;

        const exits = this.countOpenExits(px, py, floor);
        score += exits >= 4 ? exits * 62 : -280 + exits * 45;
        if (prevAngle !== null) {
          score += Math.cos(normalizeAngle(a - prevAngle)) * 95;
        }

        for (const p of this.pickups) {
          if (!sameFloor(p.floor, floor)) continue;
          if (p.kind === 'nitro' && dist(px, py, p.x, p.y) < NITRO_RADIUS + PLAYER_RADIUS + 42) {
            score -= 800;
          }
        }
        for (const pit of this.icePits) {
          if (pit.broken && isPointInIcePit(px, py, pit, PLAYER_RADIUS + 26)) {
            score -= 850;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestAngle = a;
        }
        // Only check longer 200px reach if 125px stayed inside the blast margin
        if (probeDist === 125 && minTntDist >= TNT_BLAST_RADIUS + 54) break;
      }
    }
    return bestAngle;
  }

  private getMapSector(x: number, y: number): number {
    const col = clamp(Math.floor((x / this.map.width) * 3), 0, 2);
    const row = clamp(Math.floor((y / this.map.height) * 2), 0, 1);
    return row * 3 + col;
  }

  private pickArenaPatrolPoint(bot: Player): Vec2 {
    const mem = this.getBotMemory(bot);
    const pad = ARENA_WALL_THICKNESS + PLAYER_RADIUS + 68;
    const minDist = this.isImmersiveMode() ? Math.max(680, this.map.width * 0.36) : 340;
    const botSector = this.getMapSector(bot.x, bot.y);
    const bFloor = bot.floor ?? 0;

    let bestPt: Vec2 | null = null;
    let bestScore = -Infinity;
    for (let tries = 0; tries < 28; tries++) {
      const x = pad + Math.random() * (this.map.width - pad * 2);
      const y = pad + Math.random() * (this.map.height - pad * 2);
      const dSelf = dist(bot.x, bot.y, x, y);
      if (
        dSelf >= (tries < 20 ? minDist : minDist * 0.55) &&
        this.isPointWalkableOnFloor(x, y, PLAYER_RADIUS + 14, bFloor)
      ) {
        const sec = this.getMapSector(x, y);
        const exits = this.countOpenExits(x, y, bFloor);
        let score = dSelf * 0.35 + (exits <= 2 ? -320 : exits * 45);
        if (sec !== botSector) score += 420;
        if (sec !== mem.lastSector) score += 260;
        for (const p of this.pickups) {
          if (!sameFloor(p.floor, bFloor)) continue;
          if (p.kind === 'nitro' && dist(x, y, p.x, p.y) < 130) {
            score -= 450;
          } else if (p.kind === 'tnt' && p.armed && dist(x, y, p.x, p.y) < TNT_BLAST_RADIUS + 70) {
            score -= 900;
          }
        }
        // Only softly spread from bots when >= 3 alive; when 2 remain, do NOT keep them in opposite corners!
        const aliveCount = this.players.filter((p) => p.alive).length;
        if (aliveCount >= 3) {
          let minBotDist = Infinity;
          for (const other of this.players) {
            if (other.id !== bot.id && other.alive && !other.isHuman && sameFloor(other.floor, bFloor)) {
              minBotDist = Math.min(minBotDist, dist(x, y, other.x, other.y));
            }
          }
          if (Number.isFinite(minBotDist)) {
            score += Math.min(350, minBotDist * 0.25);
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestPt = { x, y };
        }
      }
    }
    if (bestPt) {
      mem.lastSector = this.getMapSector(bestPt.x, bestPt.y);
      return bestPt;
    }
    return { x: this.map.width * 0.5, y: this.map.height * 0.5 };
  }

  private simulateShotSafety(
    shooter: Player,
    angle: number,
    floor: FloorLevel,
    opts?: {
      maxDist?: number;
      maxCheckBounces?: number;
      targetPoint?: Vec2;
      targetHitRadius?: number;
      allowExplosiveDetonation?: boolean;
      ignoreTargetPlayerId?: number | null;
    }
  ): {
    safe: boolean;
    hitsSelf: boolean;
    hitsTeammate: boolean;
    hitsBox: boolean;
    unsafeExplosive: boolean;
    reachedTarget: boolean;
    bouncesAtTarget: number;
    stepsAtTarget: number;
  } {
    const bSpeed = this.getBulletSpeed();
    const muzzleDist = PLAYER_RADIUS + BULLET_RADIUS + 3;
    let x = shooter.x + Math.cos(angle) * muzzleDist;
    let y = shooter.y + Math.sin(angle) * muzzleDist;
    let vx = Math.cos(angle) * bSpeed;
    let vy = Math.sin(angle) * bSpeed;

    const floorWalls = this.wallsByFloor[floor];
    const maxDist = opts?.maxDist ?? 680;
    const maxCheckBounces = opts?.maxCheckBounces ?? 2;
    const stepLen = 5;
    const subDt = stepLen / bSpeed;
    const maxSteps = Math.max(12, Math.ceil(maxDist / stepLen));

    // Reject if muzzle spawns already inside a wall or explosive
    for (const wall of floorWalls) {
      if (circleIntersectsRect(x, y, BULLET_RADIUS, wall)) {
        return {
          safe: false,
          hitsSelf: true,
          hitsTeammate: false,
          hitsBox: false,
          unsafeExplosive: false,
          reachedTarget: false,
          bouncesAtTarget: 0,
          stepsAtTarget: 0,
        };
      }
    }

    let bounces = 0;
    let elapsed = 0;
    let firstWallDist = Infinity;

    for (let step = 1; step <= maxSteps; step++) {
      x += vx * subDt;
      y += vy * subDt;
      elapsed += subDt;

      // Wall collision & exact push-out reflection matching updateBullets()
      for (const wall of floorWalls) {
        const cx = clamp(x, wall.x, wall.x + wall.w);
        const cy = clamp(y, wall.y, wall.y + wall.h);
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < BULLET_RADIUS * BULLET_RADIUS) {
          const d = Math.sqrt(d2);
          let nx = 0;
          let ny = 0;
          if (d > 0.0001) {
            nx = dx / d;
            ny = dy / d;
          } else {
            const lp = x - wall.x;
            const rp = wall.x + wall.w - x;
            const tp = y - wall.y;
            const bp = wall.y + wall.h - y;
            const m = Math.min(lp, rp, tp, bp);
            if (m === lp) nx = -1;
            else if (m === rp) nx = 1;
            else if (m === tp) ny = -1;
            else ny = 1;
          }
          const overlap = BULLET_RADIUS - d + 0.5;
          x += nx * overlap;
          y += ny * overlap;
          const dot = vx * nx + vy * ny;
          if (dot < 0) {
            vx -= 2 * dot * nx;
            vy -= 2 * dot * ny;
          }
          if (bounces === 0) firstWallDist = step * stepLen;
          bounces++;
          break;
        }
      }

      if (bounces > maxCheckBounces) break;

      // Cardboard boxes block bullets completely
      for (const box of this.boxes) {
        if ((box.state !== 'active' && box.state !== 'spawning') || !sameFloor(box.floor, floor)) continue;
        const rect: WallRect = {
          x: box.x - box.w * 0.5,
          y: box.y - box.h * 0.5,
          w: box.w,
          h: box.h,
        };
        if (circleIntersectsRect(x, y, BULLET_RADIUS, rect)) {
          return {
            safe: false,
            hitsSelf: false,
            hitsTeammate: false,
            hitsBox: true,
            unsafeExplosive: false,
            reachedTarget: false,
            bouncesAtTarget: bounces,
            stepsAtTarget: step,
          };
        }
      }

      // Check Nitro & TNT objects in bullet path
      for (const p of this.pickups) {
        if (!sameFloor(p.floor, floor)) continue;
        if (p.kind !== 'nitro' && p.kind !== 'tnt') continue;
        let hitExp = false;
        if (p.kind === 'nitro') {
          hitExp = dist(x, y, p.x, p.y) <= BULLET_RADIUS + p.radius;
        } else {
          const tntRect: WallRect = {
            x: p.x - TNT_HALF_SIZE,
            y: p.y - TNT_HALF_SIZE,
            w: TNT_HALF_SIZE * 2,
            h: TNT_HALF_SIZE * 2,
          };
          hitExp = circleIntersectsRect(x, y, BULLET_RADIUS, tntRect);
        }
        if (hitExp) {
          const blastR = p.kind === 'tnt' ? TNT_BLAST_RADIUS : NITRO_BLAST_RADIUS;
          const predSelfX = shooter.x + shooter.vx * Math.min(elapsed + 0.2, 0.5);
          const predSelfY = shooter.y + shooter.vy * Math.min(elapsed + 0.2, 0.5);
          const selfInBlast =
            dist(p.x, p.y, shooter.x, shooter.y) <= blastR + PLAYER_RADIUS + 20 ||
            dist(p.x, p.y, predSelfX, predSelfY) <= blastR + PLAYER_RADIUS + 16;
          const mateInBlast = this.players.some(
            (tm) =>
              tm.id !== shooter.id &&
              tm.alive &&
              this.isTeammate(shooter.id, tm.id) &&
              sameFloor(tm.floor, floor) &&
              dist(p.x, p.y, tm.x, tm.y) <= blastR + PLAYER_RADIUS + 14
          );
          if (selfInBlast || mateInBlast || !opts?.allowExplosiveDetonation) {
            return {
              safe: false,
              hitsSelf: false,
              hitsTeammate: mateInBlast,
              hitsBox: false,
              unsafeExplosive: selfInBlast || !opts?.allowExplosiveDetonation,
              reachedTarget: false,
              bouncesAtTarget: bounces,
              stepsAtTarget: step,
            };
          }
          return {
            safe: true,
            hitsSelf: false,
            hitsTeammate: false,
            hitsBox: false,
            unsafeExplosive: false,
            reachedTarget: true,
            bouncesAtTarget: bounces,
            stepsAtTarget: step,
          };
        }
      }

      // Check teammate collision
      for (const tm of this.players) {
        if (tm.id === shooter.id || !tm.alive || !this.isTeammate(shooter.id, tm.id) || !sameFloor(tm.floor, floor)) {
          continue;
        }
        if (dist(x, y, tm.x, tm.y) <= PLAYER_RADIUS + BULLET_RADIUS + 8) {
          return {
            safe: false,
            hitsSelf: false,
            hitsTeammate: true,
            hitsBox: false,
            unsafeExplosive: false,
            reachedTarget: false,
            bouncesAtTarget: bounces,
            stepsAtTarget: step,
          };
        }
      }

      // Self-hit safety check after >= 1 bounce (checking both current and moving shooter body!)
      if (bounces >= 1) {
        const predT = Math.min(elapsed, 0.58);
        const predSx = shooter.x + shooter.vx * predT;
        const predSy = shooter.y + shooter.vy * predT;
        const selfMargin = PLAYER_RADIUS + BULLET_RADIUS + (bounces === 1 ? 30 : 22);
        if (
          dist(x, y, shooter.x, shooter.y) < selfMargin ||
          dist(x, y, predSx, predSy) < selfMargin
        ) {
          return {
            safe: false,
            hitsSelf: true,
            hitsTeammate: false,
            hitsBox: false,
            unsafeExplosive: false,
            reachedTarget: false,
            bouncesAtTarget: bounces,
            stepsAtTarget: step,
          };
        }
      }

      // Check if we reached intended target point before any bad outcome
      if (opts?.targetPoint) {
        const hitR = opts.targetHitRadius ?? PLAYER_RADIUS + 10;
        if (dist(x, y, opts.targetPoint.x, opts.targetPoint.y) <= hitR) {
          return {
            safe: true,
            hitsSelf: false,
            hitsTeammate: false,
            hitsBox: false,
            unsafeExplosive: false,
            reachedTarget: true,
            bouncesAtTarget: bounces,
            stepsAtTarget: step,
          };
        }
      }

      // For direct shots without an explicit targetPoint, also check if any non-teammate alive enemy was hit cleanly
      if (!opts?.targetPoint && opts?.ignoreTargetPlayerId !== undefined && opts.ignoreTargetPlayerId !== null) {
        const tgt = this.players.find((pl) => pl.id === opts.ignoreTargetPlayerId && pl.alive && sameFloor(pl.floor, floor));
        if (tgt && dist(x, y, tgt.x, tgt.y) <= PLAYER_RADIUS + BULLET_RADIUS + 2) {
          return {
            safe: true,
            hitsSelf: false,
            hitsTeammate: false,
            hitsBox: false,
            unsafeExplosive: false,
            reachedTarget: true,
            bouncesAtTarget: bounces,
            stepsAtTarget: step,
          };
        }
      }
    }

    // Also guard against point-blank perpendicular wall shots (< 58px) where fast bounces snap right back into shooter
    if (firstWallDist < 58 && bounces >= 1) {
      return {
        safe: false,
        hitsSelf: true,
        hitsTeammate: false,
        hitsBox: false,
        unsafeExplosive: false,
        reachedTarget: false,
        bouncesAtTarget: bounces,
        stepsAtTarget: maxSteps,
      };
    }

    return {
      safe: true,
      hitsSelf: false,
      hitsTeammate: false,
      hitsBox: false,
      unsafeExplosive: false,
      reachedTarget: false,
      bouncesAtTarget: bounces,
      stepsAtTarget: maxSteps,
    };
  }

  private findTrickshotToPoint(
    shooter: Player,
    tx: number,
    ty: number,
    hitRadius = PLAYER_RADIUS + 14,
    numRays = 20,
    maxBounces = 2,
    allowExplosiveDetonation = false
  ): number | null {
    const floor = shooter.floor ?? 0;
    if (this.isImmersiveMode() && !this.isPointWithinImmersiveBounds(shooter, tx, ty, false, true)) {
      return null;
    }
    const maxRayDist = this.isImmersiveMode() ? 560 : 1280;
    const floorWalls = this.wallsByFloor[floor];
    const candidates: number[] = [];
    const seenBuckets = new Set<number>();
    const addCand = (ang: number) => {
      const na = normalizeAngle(ang);
      const bucket = Math.round(na * 42);
      if (!seenBuckets.has(bucket)) {
        seenBuckets.add(bucket);
        candidates.push(na);
      }
    };

    // Analytic reflection angles off interior & perimeter walls
    for (const wall of floorWalls) {
      if (wall.x > ARENA_WALL_THICKNESS && wall.x < this.map.width - ARENA_WALL_THICKNESS) {
        addCand(Math.atan2(ty - shooter.y, 2 * wall.x - tx - shooter.x));
        addCand(Math.atan2(ty - shooter.y, 2 * (wall.x + wall.w) - tx - shooter.x));
      }
      if (wall.y > ARENA_WALL_THICKNESS && wall.y < this.map.height - ARENA_WALL_THICKNESS) {
        addCand(Math.atan2(2 * wall.y - ty - shooter.y, tx - shooter.x));
        addCand(Math.atan2(2 * (wall.y + wall.h) - ty - shooter.y, tx - shooter.x));
      }
    }
    addCand(Math.atan2(ty - shooter.y, 2 * ARENA_WALL_THICKNESS - tx - shooter.x));
    addCand(Math.atan2(ty - shooter.y, 2 * (this.map.width - ARENA_WALL_THICKNESS) - tx - shooter.x));
    addCand(Math.atan2(2 * ARENA_WALL_THICKNESS - ty - shooter.y, tx - shooter.x));
    addCand(Math.atan2(2 * (this.map.height - ARENA_WALL_THICKNESS) - ty - shooter.y, tx - shooter.x));

    for (let i = 0; i < numRays; i++) {
      addCand((i / numRays) * Math.PI * 2);
    }

    let bestAngle: number | null = null;
    let bestScore = Infinity;

    for (const a of candidates) {
      const sim = this.simulateShotSafety(shooter, a, floor, {
        maxDist: maxRayDist,
        maxCheckBounces: maxBounces,
        targetPoint: { x: tx, y: ty },
        targetHitRadius: hitRadius,
        allowExplosiveDetonation,
      });
      if (sim.safe && sim.reachedTarget && sim.bouncesAtTarget >= 1) {
        const score = sim.bouncesAtTarget * 45 + sim.stepsAtTarget;
        if (score < bestScore) {
          bestScore = score;
          bestAngle = a;
        }
      }
    }
    return bestAngle;
  }

  private isDirectShotBlockedByTeammate(
    shooter: Player,
    tx: number,
    ty: number,
    floor: FloorLevel
  ): boolean {
    const dx = tx - shooter.x;
    const dy = ty - shooter.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 16) return false;
    const blockR = PLAYER_RADIUS + BULLET_RADIUS + 4;
    for (const tm of this.players) {
      if (tm.id === shooter.id || !tm.alive || !this.isTeammate(shooter.id, tm.id) || !sameFloor(tm.floor, floor)) {
        continue;
      }
      const t = ((tm.x - shooter.x) * dx + (tm.y - shooter.y) * dy) / lenSq;
      if (t <= 0.04 || t >= 0.96) continue;
      const px = shooter.x + dx * t;
      const py = shooter.y + dy * t;
      if (dist(px, py, tm.x, tm.y) < blockR) return true;
    }
    return false;
  }

  private isDirectShotClearAndSafe(
    shooter: Player,
    tx: number,
    ty: number,
    floor: FloorLevel,
    targetId: number | null
  ): boolean {
    if (!this.isSegmentClearOnFloor(shooter.x, shooter.y, tx, ty, BULLET_RADIUS - 1, floor)) return false;
    if (this.segmentHitsBoxOnFloor(shooter.x, shooter.y, tx, ty, BULLET_RADIUS + 1, floor)) return false;
    if (this.isDirectShotBlockedByTeammate(shooter, tx, ty, floor)) return false;
    const angle = Math.atan2(ty - shooter.y, tx - shooter.x);
    const sim = this.simulateShotSafety(shooter, angle, floor, {
      maxDist: Math.min(720, dist(shooter.x, shooter.y, tx, ty) + 260),
      maxCheckBounces: 2,
      targetPoint: { x: tx, y: ty },
      targetHitRadius: PLAYER_RADIUS + 8,
      allowExplosiveDetonation: false,
      ignoreTargetPlayerId: targetId,
    });
    return sim.safe && !sim.hitsBox && !sim.hitsSelf && !sim.hitsTeammate && !sim.unsafeExplosive;
  }

  private isShotSafeAtFire(
    bot: Player,
    fireAngle: number,
    targetId: number | null,
    isTrickOrExplosive: boolean
  ): boolean {
    const floor = bot.floor ?? 0;
    const sim = this.simulateShotSafety(bot, fireAngle, floor, {
      maxDist: isTrickOrExplosive ? 720 : 540,
      maxCheckBounces: 2,
      allowExplosiveDetonation: isTrickOrExplosive && targetId === null,
      ignoreTargetPlayerId: targetId,
    });
    if (sim.hitsSelf || sim.hitsTeammate || sim.unsafeExplosive) return false;
    if (!isTrickOrExplosive && sim.hitsBox) return false;
    return true;
  }

  private getIncomingBulletEvade(
    bot: Player,
    floor: FloorLevel,
    diff: BotDifficulty
  ): { x: number; y: number } {
    let evadeX = 0;
    let evadeY = 0;
    const bulletLookDist = diff === 'RUTHLESS' ? 340 : diff === 'TACTICAL' ? 225 : 115;
    const bulletWeight = diff === 'RUTHLESS' ? 3.35 : diff === 'TACTICAL' ? 2.2 : 0.75;
    const floorWalls = this.wallsByFloor[floor];

    for (const b of this.bullets) {
      // Never ignore own bullet once it has already bounced off a wall!
      if (b.ownerId === bot.id && b.age < BULLET_SELF_GRACE && b.bouncesLeft >= b.maxBounces) continue;
      if (!sameFloor(b.floor, floor)) continue;
      const d = dist(bot.x, bot.y, b.x, b.y);
      if (d >= Math.max(bulletLookDist, 420)) continue;

      const bSpeed = Math.hypot(b.vx, b.vy) || 1;
      const relX = bot.x - b.x;
      const relY = bot.y - b.y;
      const dot = (relX * b.vx + relY * b.vy) / bSpeed;
      let directThreat = false;

      if (d < bulletLookDist && dot > -15 && dot < bulletLookDist) {
        const perp = Math.abs((relX * b.vy - relY * b.vx) / bSpeed);
        if (perp < PLAYER_RADIUS + 42) {
          const losClear = diff === 'CHILL' || this.hasLineOfSight(b.x, b.y, bot.x, bot.y, floor);
          if (losClear) {
            directThreat = true;
            const side = relX * b.vy - relY * b.vx >= 0 ? 1 : -1;
            const weight = (bulletLookDist - d) / bulletLookDist;
            evadeX += (b.vy / bSpeed) * side * weight * bulletWeight;
            evadeY += (-b.vx / bSpeed) * side * weight * bulletWeight;
          }
        }
      }

      // Ruthless accurately predicts upcoming wall bounces (fine 6px substeps, up to 2 bounces!)
      if (diff === 'RUTHLESS' && !directThreat && b.bouncesLeft > 0 && d < 420) {
        const stepDist = 6;
        let ux = b.vx / bSpeed;
        let uy = b.vy / bSpeed;
        let px = b.x;
        let py = b.y;
        let bouncesChecked = 0;
        const maxChecks = Math.min(2, b.bouncesLeft);

        for (let s = 1; s <= 68; s++) {
          px += ux * stepDist;
          py += uy * stepDist;

          // Stop ray if blocked by a cardboard box
          let hitBox = false;
          for (const box of this.boxes) {
            if (box.state !== 'active' || !sameFloor(box.floor, floor)) continue;
            if (
              circleIntersectsRect(px, py, b.radius, {
                x: box.x - box.w * 0.5,
                y: box.y - box.h * 0.5,
                w: box.w,
                h: box.h,
              })
            ) {
              hitBox = true;
              break;
            }
          }
          if (hitBox) break;

          let bouncedNow = false;
          for (const w of floorWalls) {
            const cx = clamp(px, w.x, w.x + w.w);
            const cy = clamp(py, w.y, w.y + w.h);
            const dx = px - cx;
            const dy = py - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 < (b.radius + 1) * (b.radius + 1)) {
              const dw = Math.sqrt(d2);
              let nx = 0;
              let ny = 0;
              if (dw > 0.0001) {
                nx = dx / dw;
                ny = dy / dw;
              } else {
                const lp = px - w.x;
                const rp = w.x + w.w - px;
                const tp = py - w.y;
                const bp = w.y + w.h - py;
                const m = Math.min(lp, rp, tp, bp);
                if (m === lp) nx = -1;
                else if (m === rp) nx = 1;
                else if (m === tp) ny = -1;
                else ny = 1;
              }
              const overlap = b.radius + 1 - dw + 0.5;
              px += nx * overlap;
              py += ny * overlap;
              const vDotN = ux * nx + uy * ny;
              if (vDotN < 0) {
                ux -= 2 * vDotN * nx;
                uy -= 2 * vDotN * ny;
              }
              bouncesChecked++;
              bouncedNow = true;
              break;
            }
          }

          if (bouncedNow) {
            const rRelX = bot.x - px;
            const rRelY = bot.y - py;
            const rDot = rRelX * ux + rRelY * uy;
            if (rDot > -12 && rDot < 270) {
              const rPerp = Math.abs(rRelX * uy - rRelY * ux);
              if (rPerp < PLAYER_RADIUS + 38 && this.hasLineOfSight(px, py, bot.x, bot.y, floor)) {
                const side = rRelX * uy - rRelY * ux >= 0 ? 1 : -1;
                const bounceWeight = ((270 - Math.max(0, rDot)) / 270) * 2.75;
                evadeX += uy * side * bounceWeight;
                evadeY += -ux * side * bounceWeight;
                break;
              }
            }
            if (bouncesChecked >= maxChecks) break;
          }
        }
      }
    }
    return { x: evadeX, y: evadeY };
  }

  private getAimThreatDodge(
    bot: Player,
    visibleEnemies: Player[],
    floor: FloorLevel
  ): { x: number; y: number } {
    let evadeX = 0;
    let evadeY = 0;
    const clearR = PLAYER_RADIUS + 4;
    for (const e of visibleEnemies) {
      if (e.ammo <= 0 || e.stunTimer > 0) continue;
      const d = dist(bot.x, bot.y, e.x, e.y);
      if (d >= 490 || !this.hasLineOfSight(e.x, e.y, bot.x, bot.y, floor)) continue;
      const angToBot = Math.atan2(bot.y - e.y, bot.x - e.x);
      const aimErr = normalizeAngle(angToBot - e.angle);
      if (Math.abs(aimErr) >= 0.36) continue;

      const leftA = normalizeAngle(angToBot + Math.PI * 0.5);
      const rightA = normalizeAngle(angToBot - Math.PI * 0.5);
      const prefSide = Math.abs(aimErr) > 0.05 ? Math.sign(aimErr) : bot.aiStrafeDir;

      const scoreSide = (ang: number, sign: number): number => {
        const px = bot.x + Math.cos(ang) * 92;
        const py = bot.y + Math.sin(ang) * 92;
        if (!this.isPointWalkableOnFloor(px, py, clearR, floor)) return -999;
        if (!this.isSegmentClearOnFloor(bot.x, bot.y, px, py, clearR - 2, floor)) return -500;
        if (this.segmentHitsHazardOnFloor(bot.x, bot.y, px, py, floor)) return -800;
        let sc = sign === prefSide ? 25 : 0;
        if (!this.hasLineOfSight(e.x, e.y, px, py, floor)) sc += 180;
        const pxFar = bot.x + Math.cos(ang) * 145;
        const pyFar = bot.y + Math.sin(ang) * 145;
        if (this.isPointWalkableOnFloor(pxFar, pyFar, clearR, floor)) sc += 30;
        return sc;
      };

      const leftScore = scoreSide(leftA, 1);
      const rightScore = scoreSide(rightA, -1);
      const bestAng = leftScore >= rightScore ? leftA : rightA;
      const urgency =
        ((490 - d) / 490) *
        (1 - Math.abs(aimErr) / 0.38) *
        (bot.hp <= 40 || (bot.postStunGraceTimer ?? 0) > 0 ? 1.85 : 1.35);
      evadeX += Math.cos(bestAng) * urgency;
      evadeY += Math.sin(bestAng) * urgency;
    }
    return { x: evadeX, y: evadeY };
  }

  private evaluatePickupForRuthless(
    bot: Player,
    p: Pickup,
    visibleEnemies: Player[],
    floor: FloorLevel
  ): { safe: boolean; beaten: boolean; score: number } {
    const botDist = dist(bot.x, bot.y, p.x, p.y);
    const botBoost = (bot.postStunGraceTimer ?? 0) > 0 || bot.spawnInvulnTimer > 0;
    const botDirect = this.hasLineOfSight(bot.x, bot.y, p.x, p.y, floor);
    const botEff = (botBoost ? botDist * 0.68 : botDist) + (botDirect ? 0 : 115);

    let beaten = false;
    let tieBreakerRisk = 0;

    for (const e of visibleEnemies) {
      const eDist = dist(e.x, e.y, p.x, p.y);
      const eDirect = this.hasLineOfSight(e.x, e.y, p.x, p.y, floor);
      const eBoost = (e.postStunGraceTimer ?? 0) > 0 || e.spawnInvulnTimer > 0;
      const eTowardVel = ((p.x - e.x) * e.vx + (p.y - e.y) * e.vy) / Math.max(1, eDist);
      const eEff =
        (eBoost ? eDist * 0.68 : eDist) +
        (eDirect ? 0 : 115) -
        clamp(eTowardVel * 0.28, -40, 80);

      // True race intelligence: if an enemy is going for this pickup and will reach it first (or camps right on it), don't walk into close-range death!
      const enemyGoingForIt =
        p.kind === 'bullet'
          ? e.ammo < e.maxAmmo && (eTowardVel > 40 || eDist < 120 || (e.ammo === 0 && eDist < botDist + 30))
          : e.hp < e.maxHp && (eTowardVel > 40 || eDist < 115);
      if (enemyGoingForIt && eEff + 18 < botEff) {
        beaten = true;
      }

      if (bot.spawnInvulnTimer <= 0 && e.ammo > 0 && e.stunTimer <= 0 && eDirect) {
        // Also avoid walking straight through an armed enemy sitting directly on/in front of a contested pickup
        if (eDist < 125 && eDist + 35 < botDist) {
          beaten = true;
        }
        const dBotE = dist(bot.x, bot.y, e.x, e.y);
        if (dBotE < botDist && botDist > 120) {
          const ux = (p.x - bot.x) / botDist;
          const uy = (p.y - bot.y) / botDist;
          const proj = (e.x - bot.x) * ux + (e.y - bot.y) * uy;
          if (proj > 0 && proj < botDist) {
            const perp = Math.abs((e.x - bot.x) * uy - (e.y - bot.y) * ux);
            if (perp < PLAYER_RADIUS * 1.85 && eDist < 170) beaten = true;
          }
        }
        if (eDist < 320) {
          const aimAtPickup = Math.abs(normalizeAngle(Math.atan2(p.y - e.y, p.x - e.x) - e.angle));
          tieBreakerRisk += ((320 - eDist) / 320) * (aimAtPickup < 0.5 ? 110 : 55);
        }
      }
    }

    // No passive low-HP refusal: if unbeaten, bots take calculated risks (preferring less-exposed pickups when multiple exist)
    const safe = !beaten;
    const score = (beaten ? -1200 : 500) - botEff - tieBreakerRisk * 0.45;
    return { safe, beaten, score };
  }

  private pickSafeEscapePoint(
    bot: Player,
    threats: Player[],
    floor: FloorLevel,
    safeMedkit: Pickup | null,
    safeBullet: Pickup | null,
    prevGoal: Vec2 | null = null
  ): Vec2 {
    const clearR = PLAYER_RADIUS + 4;
    const pad = ARENA_WALL_THICKNESS + PLAYER_RADIUS + 48;
    const centerX = this.map.width * 0.5;
    const centerY = this.map.height * 0.5;
    const candidates: Vec2[] = [];

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      for (const r of [190, 320]) {
        candidates.push({ x: bot.x + Math.cos(a) * r, y: bot.y + Math.sin(a) * r });
      }
    }
    // Evaluate well-connected nav intersections across the floor so unarmed bots route into open corridors instead of corners
    for (const node of this.botNavNodes) {
      if (!sameFloor(node.floor, floor)) continue;
      const dn = dist(bot.x, bot.y, node.x, node.y);
      if (dn >= 140 && dn <= 640 && node.neighbors.length >= 2) {
        candidates.push({ x: node.x, y: node.y });
      }
    }
    if (safeMedkit) candidates.push({ x: safeMedkit.x, y: safeMedkit.y });
    if (safeBullet) candidates.push({ x: safeBullet.x, y: safeBullet.y });

    let bestPt: Vec2 | null = null;
    let bestScore = -Infinity;

    for (const pt of candidates) {
      if (
        pt.x < pad ||
        pt.x > this.map.width - pad ||
        pt.y < pad ||
        pt.y > this.map.height - pad
      ) {
        continue;
      }
      if (!this.isPointWalkableOnFloor(pt.x, pt.y, clearR, floor)) continue;
      const directClear = this.isSegmentClearOnFloor(bot.x, bot.y, pt.x, pt.y, clearR - 2, floor);
      if (directClear && this.segmentHitsHazardOnFloor(bot.x, bot.y, pt.x, pt.y, floor)) continue;

      let score = directClear ? 95 : 0;
      const moveLen = Math.max(1, dist(bot.x, bot.y, pt.x, pt.y));

      // Always keep changing position: never camp in the same spot!
      if (moveLen < 175 && !safeMedkit && !safeBullet) {
        score -= (175 - moveLen) * 1.4;
      }

      // Reject dead-end corners & reward open multi-exit intersections (never get cornered!)
      const exits = this.countOpenExits(pt.x, pt.y, floor);
      if (exits <= 2) {
        score -= 560;
      } else if (exits === 3) {
        score -= 120;
      } else {
        score += exits * 62;
      }

      // Strongly reject points near armed TNTs (predicting sliding TNT), Nitros, or broken ice
      let nearHazard = false;
      for (const p of this.pickups) {
        if (!sameFloor(p.floor, floor)) continue;
        if (p.kind === 'tnt' && p.armed) {
          const tx = p.x + (p.vx ?? 0) * 0.42;
          const ty = p.y + (p.vy ?? 0) * 0.42;
          const dTnt = Math.min(dist(pt.x, pt.y, p.x, p.y), dist(pt.x, pt.y, tx, ty));
          if (dTnt < TNT_BLAST_RADIUS + 64) {
            score -= 1300;
            nearHazard = true;
          }
        } else if (p.kind === 'nitro') {
          if (dist(pt.x, pt.y, p.x, p.y) < NITRO_RADIUS + PLAYER_RADIUS + 46) {
            score -= 1050;
            nearHazard = true;
          }
        }
      }
      if (!nearHazard) {
        for (const pit of this.icePits) {
          if (pit.broken && isPointInIcePit(pt.x, pt.y, pit, PLAYER_RADIUS + 34)) {
            score -= 1100;
            break;
          }
        }
      }

      let minThreatDist = Infinity;
      const moveUx = (pt.x - bot.x) / moveLen;
      const moveUy = (pt.y - bot.y) / moveLen;

      for (const t of threats) {
        const dt = dist(pt.x, pt.y, t.x, t.y);
        minThreatDist = Math.min(minThreatDist, dt);
        const hasLos = this.hasLineOfSight(t.x, t.y, pt.x, pt.y, floor);
        if (!hasLos) {
          score += t.ammo > 0 ? 140 : 60;
        } else if (t.ammo > 0 && dt < 370) {
          const aimOff = Math.abs(normalizeAngle(Math.atan2(pt.y - t.y, pt.x - t.x) - t.angle));
          if (aimOff < 0.38) score -= 240;
        }

        // Penalize running straight toward a close armed threat in LOS (unless flanking behind cover)
        const dBotThreat = dist(bot.x, bot.y, t.x, t.y);
        if (t.ammo > 0 && dBotThreat < 360 && dt < dBotThreat - 30 && hasLos) {
          const toThreatUx = (t.x - bot.x) / Math.max(1, dBotThreat);
          const toThreatUy = (t.y - bot.y) / Math.max(1, dBotThreat);
          if (moveUx * toThreatUx + moveUy * toThreatUy > 0.45) {
            score -= 360;
          }
        }
      }

      if (Number.isFinite(minThreatDist)) {
        score += Math.min(440, minThreatDist) * 0.65;
      }

      // Bias toward open arena center/midfield rather than getting pinned along outer walls
      const botCenterD = dist(bot.x, bot.y, centerX, centerY);
      const ptCenterD = dist(pt.x, pt.y, centerX, centerY);
      if (ptCenterD < botCenterD) {
        score += Math.min(180, (botCenterD - ptCenterD) * 0.45);
      }

      if (safeMedkit && bot.hp < bot.maxHp) {
        const dm = dist(pt.x, pt.y, safeMedkit.x, safeMedkit.y);
        if (dm < 340) score += (340 - dm) * 1.25;
      }
      if (safeBullet && bot.ammo === 0) {
        const db = dist(pt.x, pt.y, safeBullet.x, safeBullet.y);
        if (db < 340) score += (340 - db) * 1.25;
      }

      const edgeClear = Math.min(
        pt.x - ARENA_WALL_THICKNESS,
        this.map.width - ARENA_WALL_THICKNESS - pt.x,
        pt.y - ARENA_WALL_THICKNESS,
        this.map.height - ARENA_WALL_THICKNESS - pt.y
      );
      if (edgeClear < 135) score -= (135 - edgeClear) * 2.2;
      // Smooth commitment only while still traveling toward prevGoal; once near it, pick a fresh position!
      if (prevGoal && !nearHazard && dist(bot.x, bot.y, prevGoal.x, prevGoal.y) > 95 && dist(pt.x, pt.y, prevGoal.x, prevGoal.y) < 125) {
        score += 120;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPt = pt;
      }
    }

    if (bestPt) return bestPt;
    const awayCenterA = Math.atan2(centerY - bot.y, centerX - bot.x);
    const escA = this.pickClearMoveAngle(bot, awayCenterA, 120, bot.aiStrafeDir, true, true);
    return {
      x: clamp(bot.x + Math.cos(escA) * 180, pad, this.map.width - pad),
      y: clamp(bot.y + Math.sin(escA) * 180, pad, this.map.height - pad),
    };
  }

  private pickCoverStrafePoint(
    bot: Player,
    target: Player,
    visibleEnemies: Player[],
    floor: FloorLevel,
    keepDistance: number
  ): Vec2 | null {
    const clearR = PLAYER_RADIUS + 4;
    const pad = ARENA_WALL_THICKNESS + PLAYER_RADIUS + 36;
    const targetProtected =
      target.spawnInvulnTimer > 0 || target.stunTimer > 0 || (target.postStunGraceTimer ?? 0) > 0;
    const wantCoverFromTarget = bot.aiHoldShotTimer > 0.1 || targetProtected;
    let bestPt: Vec2 | null = null;
    let bestScore = -Infinity;

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      for (const rad of [145, 225]) {
        const px = bot.x + Math.cos(a) * rad;
        const py = bot.y + Math.sin(a) * rad;
        if (
          px < pad ||
          px > this.map.width - pad ||
          py < pad ||
          py > this.map.height - pad
        ) {
          continue;
        }
        if (!this.isPointWalkableOnFloor(px, py, clearR, floor)) continue;
        if (!this.isSegmentClearOnFloor(bot.x, bot.y, px, py, clearR - 2, floor)) continue;
        if (this.segmentHitsHazardOnFloor(bot.x, bot.y, px, py, floor)) continue;

        const dT = dist(px, py, target.x, target.y);
        let score = -Math.abs(dT - keepDistance) * 0.65;
        const hasLosToTarget = this.hasLineOfSight(px, py, target.x, target.y, floor);
        if (wantCoverFromTarget) {
          if (!hasLosToTarget) score += 210;
        } else if (hasLosToTarget) {
          score += 125;
        }

        // Never back into dead-end corners or outer walls where a chaser can pin the bot
        const exits = this.countOpenExits(px, py, floor);
        if (exits <= 2) score -= 460;
        else if (exits === 3) score -= 140;
        else score += exits * 24;

        const edgeClear = Math.min(
          px - ARENA_WALL_THICKNESS,
          this.map.width - ARENA_WALL_THICKNESS - px,
          py - ARENA_WALL_THICKNESS,
          this.map.height - ARENA_WALL_THICKNESS - py
        );
        if (edgeClear < 110) score -= (110 - edgeClear) * 2.1;

        for (const e of visibleEnemies) {
          if (e.id !== target.id && e.ammo > 0 && e.stunTimer <= 0) {
            if (!this.hasLineOfSight(e.x, e.y, px, py, floor)) {
              score += 290;
            }
          }
          if (e.ammo > 0 && e.stunTimer <= 0) {
            const aimOff = Math.abs(normalizeAngle(Math.atan2(py - e.y, px - e.x) - e.angle));
            if (aimOff < 0.34 && this.hasLineOfSight(e.x, e.y, px, py, floor)) {
              score -= 185;
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestPt = { x: px, y: py };
        }
      }
    }
    return bestPt;
  }

  private applyBotControls(bot: Player, dt: number) {
    if (this.libraryState) {
      this.applyLibraryBotControls(bot, dt);
      return;
    }
    const diff: BotDifficulty = this.config.difficulty;
    const reactionInterval = diff === 'RUTHLESS' ? 0.072 : diff === 'TACTICAL' ? 0.2 : 0.48;
    const aimSpread = diff === 'RUTHLESS' ? 0.008 : diff === 'TACTICAL' ? 0.09 : 1.05;
    const bFloor = bot.floor ?? 0;
    const mem = this.getBotMemory(bot);

    bot.aiThinkTimer -= dt;
    bot.aiHoldShotTimer -= dt;
    mem.patrolTimer = Math.max(0, mem.patrolTimer - dt);
    mem.lastSeenTimer = Math.max(0, mem.lastSeenTimer - dt);
    mem.unstickTimer = Math.max(0, mem.unstickTimer - dt);
    mem.stuckAvoidTimer = Math.max(0, mem.stuckAvoidTimer - dt);
    mem.pendingShotExpire = Math.max(0, mem.pendingShotExpire - dt);
    mem.tntEscTimer = Math.max(0, mem.tntEscTimer - dt);
    mem.escapeGoalTimer = Math.max(0, mem.escapeGoalTimer - dt);
    mem.scanPhase += dt * (this.config.extraDark ? 2.1 : 1.3);

    if (mem.pendingShotExpire <= 0) {
      mem.pendingShotAngle = null;
    }

    // Stuck detection — marks avoid zone & forces A* backtrack toward nearest open nav corridor!
    if (dist(bot.x, bot.y, mem.lastProgressX, mem.lastProgressY) > 20) {
      mem.lastProgressX = bot.x;
      mem.lastProgressY = bot.y;
      mem.stuckTimer = 0;
    } else if (bot.aiMoveRatio > 0.25 && mem.pendingShotAngle === null) {
      mem.stuckTimer += dt;
      if (mem.stuckTimer > 0.45) {
        mem.stuckTimer = 0;
        bot.aiStrafeDir *= -1;
        mem.stuckAvoidX = bot.x;
        mem.stuckAvoidY = bot.y;
        mem.stuckAvoidTimer = 4.5;
        this.botPaths.delete(bot.id);
        mem.unstickTimer = 0.5;
        const nearestNode = this.findClosestNavNodeOnGraph(this.botNavNodes, bot.x, bot.y, bFloor, true);
        if (
          nearestNode &&
          dist(bot.x, bot.y, nearestNode.x, nearestNode.y) > 16 &&
          !this.segmentHitsHazardOnFloor(bot.x, bot.y, nearestNode.x, nearestNode.y, bFloor)
        ) {
          mem.unstickAngle = this.pickClearMoveAngle(
            bot,
            Math.atan2(nearestNode.y - bot.y, nearestNode.x - bot.x),
            88,
            bot.aiStrafeDir,
            diff !== 'CHILL',
            diff === 'RUTHLESS'
          );
        } else {
          mem.unstickAngle = this.pickClearMoveAngle(
            bot,
            normalizeAngle(bot.aiTargetAngle + Math.PI * 0.72 * bot.aiStrafeDir),
            88,
            bot.aiStrafeDir,
            diff !== 'CHILL',
            diff === 'RUTHLESS'
          );
        }
        const np = this.pickArenaPatrolPoint(bot);
        mem.patrolX = np.x;
        mem.patrolY = np.y;
        mem.patrolTimer = 4.2;
      }
    }

    // 1. Incoming bullet evasion (direct CPA + 1st wall bounce prediction for Ruthless)
    const bulletEvade = this.getIncomingBulletEvade(bot, bFloor, diff);
    let evadeX = bulletEvade.x;
    let evadeY = bulletEvade.y;

    // 2. Explosive hazard evasion (cached/smoothed every ~0.11s so movement stays silky smooth)
    let urgentTntEscape = false;
    if (diff !== 'CHILL') {
      const hasArmedTntNear = this.pickups.some(
        (p) =>
          p.kind === 'tnt' &&
          p.armed &&
          sameFloor(p.floor, bFloor) &&
          dist(bot.x, bot.y, p.x, p.y) < TNT_BLAST_RADIUS + 95
      );
      if (hasArmedTntNear) {
        urgentTntEscape = true;
        if (mem.tntEscTimer <= 0) {
          const tntEscA = this.pickTntSafeEscapeAngle(bot, bFloor, mem.tntEscAngle);
          if (tntEscA !== null) {
            mem.tntEscAngle = tntEscA;
          }
          mem.tntEscTimer = 0.11;
        }
        evadeX += Math.cos(mem.tntEscAngle) * 4.2;
        evadeY += Math.sin(mem.tntEscAngle) * 4.2;
      } else {
        mem.tntEscTimer = 0;
      }
    }
    for (const p of this.pickups) {
      if (!sameFloor(p.floor, bFloor)) continue;
      if (p.kind === 'tnt' && p.armed && diff === 'CHILL') {
        const d = dist(bot.x, bot.y, p.x, p.y);
        if (d < 105) {
          const away = Math.atan2(bot.y - p.y, bot.x - p.x);
          const urgency = ((105 - d) / TNT_BLAST_RADIUS) * 1.2;
          evadeX += Math.cos(away) * urgency;
          evadeY += Math.sin(away) * urgency;
        }
      } else if (p.kind === 'nitro' && diff !== 'CHILL') {
        const d = dist(bot.x, bot.y, p.x, p.y);
        const safeDist = diff === 'RUTHLESS' ? NITRO_RADIUS + PLAYER_RADIUS + 42 : NITRO_RADIUS + PLAYER_RADIUS + 20;
        if (d < safeDist) {
          const away = Math.atan2(bot.y - p.y, bot.x - p.x);
          evadeX += Math.cos(away) * 2.4;
          evadeY += Math.sin(away) * 2.4;
        }
      }
    }

    // 3. Broken ice pit evasion
    for (const pit of this.icePits) {
      const margin = diff === 'CHILL' ? PLAYER_RADIUS + 14 : PLAYER_RADIUS + 44;
      if (pit.broken && isPointInIcePit(bot.x, bot.y, pit, margin)) {
        const away = Math.atan2(bot.y - pit.y, bot.x - pit.x);
        evadeX += Math.cos(away) * 3.2;
        evadeY += Math.sin(away) * 3.2;
      }
    }

    const isImmersive = this.isImmersiveMode();
    // 4. Bot-to-bot soft separation (kept separate from hardEvading so bots pass smoothly without cancelling combat!)
    let sepX = 0;
    let sepY = 0;
    for (const other of this.players) {
      if (other.id === bot.id || !other.alive || !sameFloor(other.floor, bFloor)) continue;
      const dO = dist(bot.x, bot.y, other.x, other.y);
      const isEnemy = !this.isTeammate(bot.id, other.id);
      if (diff === 'CHILL' && bot.ammo === 0 && isEnemy && other.ammo > 0 && dO < 360 && (!isImmersive || this.canBotSeePoint(bot, other.x, other.y, other.floor ?? 0))) {
        const away = Math.atan2(bot.y - other.y, bot.x - other.x);
        const push = ((360 - dO) / 360) * 1.8;
        evadeX += Math.cos(away) * push;
        evadeY += Math.sin(away) * push;
      } else if (!other.isHuman && dO < 78 && dO > 1) {
        const away = Math.atan2(bot.y - other.y, bot.x - other.x);
        const rep = ((78 - dO) / 78) * 0.85;
        sepX += Math.cos(away) * rep;
        sepY += Math.sin(away) * rep;
      }
    }

    // Check visible enemies using strict fair Immersive visibility
    const allEnemies = this.players.filter(
      (p) => p.id !== bot.id && p.alive && !this.isTeammate(bot.id, p.id) && sameFloor(p.floor, bFloor)
    );
    const visibleEnemies = allEnemies.filter((e) => this.canBotSeePoint(bot, e.x, e.y, e.floor ?? 0));

    // Ruthless 4b: proactive aim-line evasion kept separate so bot still aims & fires back while dodging crosshairs!
    const aimDodge =
      diff === 'RUTHLESS' && visibleEnemies.length > 0
        ? this.getAimThreatDodge(bot, visibleEnemies, bFloor)
        : { x: 0, y: 0 };

    // Detect close armed enemies actively chasing the bot (anti-follow / counter-punish awareness)
    const chasingEnemies =
      diff === 'RUTHLESS'
        ? visibleEnemies.filter((e) => {
            if (e.stunTimer > 0 || e.ammo <= 0) return false;
            const d = dist(bot.x, bot.y, e.x, e.y);
            if (d > 420) return false;
            const toward = ((bot.x - e.x) * e.vx + (bot.y - e.y) * e.vy) / Math.max(1, d);
            return toward > 55 || d < 260;
          })
        : [];

    // Score visible target: Ruthless targets high-threat/human leaders, chasers, AND finishers!
    const scoreEnemy = (e: Player): number => {
      const d = dist(bot.x, bot.y, e.x, e.y);
      const finishBonus = e.hp <= BULLET_DAMAGE ? 145 : 0;
      const stunBonus = e.stunTimer > 0 && (e.postStunGraceTimer ?? 0) <= 0 ? 110 : 0;
      const chaserBonus = chasingEnemies.some((c) => c.id === e.id) ? 85 : 0;
      const threatBonus = diff === 'RUTHLESS' ? e.kills * 38 + (e.isHuman ? 45 : 0) : e.kills * 22;
      const shieldLeft = Math.max(e.spawnInvulnTimer, e.postStunGraceTimer ?? 0);
      const gracePenalty = shieldLeft > 0.25 ? -90 : 0;
      return -d * 0.34 + stunBonus + finishBonus + chaserBonus + (100 - e.hp) * 0.95 + threatBonus + gracePenalty;
    };

    let primaryTarget: Player | null = null;
    let primaryTargetDist = Infinity;
    if (visibleEnemies.length > 0) {
      let bestVisible = visibleEnemies[0];
      let bestScore = -Infinity;
      for (const e of visibleEnemies) {
        const s = scoreEnemy(e);
        if (s > bestScore) {
          bestScore = s;
          bestVisible = e;
          primaryTargetDist = dist(bot.x, bot.y, e.x, e.y);
        }
      }
      primaryTarget = bestVisible;
      mem.lastSeenEnemyId = bestVisible.id;
      mem.lastSeenX = bestVisible.x;
      mem.lastSeenY = bestVisible.y;
      mem.lastSeenVx = bestVisible.vx;
      mem.lastSeenVy = bestVisible.vy;
      mem.lastSeenFloor = bestVisible.floor ?? 0;
      mem.lastSeenTimer = diff === 'RUTHLESS' ? (isImmersive ? 2.6 : 1.75) : 0.95;
    }

    const hardEvading = Math.hypot(evadeX, evadeY) > 0.35;

    // Compute explosive opportunism & combat shot planning!
    // CRITICAL: For RUTHLESS, never skip combat planning just because hardEvading is active (bots shoot back while dodging!).
    const shouldRunThinkTick = bot.aiThinkTimer <= 0;
    const shouldPlanCombatNow =
      shouldRunThinkTick && (diff === 'RUTHLESS' || (!hardEvading && mem.unstickTimer <= 0));

    let explosiveShotAngle: number | null = null;
    let explosiveClusterCount = 0;

    if (shouldPlanCombatNow) {
      if (bot.ammo > 0 && visibleEnemies.length > 0) {
        let bestBlastScore = 0;
        for (const n of this.pickups) {
          if (!sameFloor(n.floor, bFloor)) continue;
          if (n.kind !== 'nitro' && !(n.kind === 'tnt' && !n.armed)) continue;
          if (isImmersive && !this.canBotSeePoint(bot, n.x, n.y, bFloor, true)) continue;

          const blastR = n.kind === 'tnt' ? TNT_BLAST_RADIUS : NITRO_BLAST_RADIUS;
          const selfDist = dist(n.x, n.y, bot.x, bot.y);

          if (diff === 'CHILL') {
            const nearEnemy = visibleEnemies.find((e) => dist(n.x, n.y, e.x, e.y) < blastR + 40);
            if (nearEnemy && selfDist < blastR + 85 && this.hasLineOfSight(bot.x, bot.y, n.x, n.y, bFloor)) {
              if (Math.random() < 0.55) {
                explosiveShotAngle = Math.atan2(n.y - bot.y, n.x - bot.x);
                explosiveClusterCount = 1;
                break;
              }
            }
            continue;
          }

          if (selfDist <= blastR + 34) continue;
          const teammateInBlast = this.players.some(
            (tm) => tm.alive && tm.id !== bot.id && this.isTeammate(bot.id, tm.id) && dist(n.x, n.y, tm.x, tm.y) <= blastR + 28
          );
          if (teammateInBlast) continue;

          const hitMargin = diff === 'RUTHLESS' ? blastR + 12 : blastR - 10;
          const enemiesInBlast = visibleEnemies.filter((e) => dist(n.x, n.y, e.x, e.y) <= hitMargin);
          if (enemiesInBlast.length === 0) continue;

          const directClear =
            this.isSegmentClearOnFloor(bot.x, bot.y, n.x, n.y, BULLET_RADIUS - 1, bFloor) &&
            !this.segmentHitsBoxOnFloor(bot.x, bot.y, n.x, n.y, BULLET_RADIUS + 1, bFloor) &&
            !this.isDirectShotBlockedByTeammate(bot, n.x, n.y, bFloor);
          let shotA: number | null = directClear ? Math.atan2(n.y - bot.y, n.x - bot.x) : null;
          if (shotA !== null) {
            const simCheck = this.simulateShotSafety(bot, shotA, bFloor, {
              maxDist: dist(bot.x, bot.y, n.x, n.y) + 80,
              maxCheckBounces: 1,
              targetPoint: { x: n.x, y: n.y },
              targetHitRadius: n.radius + 12,
              allowExplosiveDetonation: true,
            });
            if (!simCheck.safe || simCheck.hitsSelf || simCheck.hitsBox || simCheck.hitsTeammate) {
              shotA = null;
            }
          }
          if (shotA === null && diff === 'RUTHLESS') {
            shotA = this.findTrickshotToPoint(bot, n.x, n.y, n.radius + 14, 36, 3, true);
          }

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
    }

    const planCombatShot = (tgt: Player, allowFireDuringGrace = true) => {
      if (bot.ammo <= 0) return;

      if (explosiveShotAngle !== null && bot.aiHoldShotTimer <= 0) {
        const aimA = explosiveShotAngle + (Math.random() - 0.5) * aimSpread * 0.45;
        mem.pendingShotExpire = mem.pendingShotAngle !== null && mem.pendingShotExpire > 0 ? mem.pendingShotExpire : 0.42;
        mem.pendingShotAngle = aimA;
        mem.pendingShotTargetId = null;
        mem.pendingShotIsTrick = true;
        return;
      }

      if (tgt.stunTimer > 0) return;

      const shieldLeft = Math.max(tgt.spawnInvulnTimer, tgt.postStunGraceTimer ?? 0);
      const bSpeed = this.getBulletSpeed();
      const dTgt = dist(bot.x, bot.y, tgt.x, tgt.y);
      const travelT = Math.max(0, (dTgt - PLAYER_RADIUS - BULLET_RADIUS) / bSpeed);
      // Fair human skill: when enemy shield is about to drop within bullet flight time, fire so it lands right as shield ends!
      const tgtShootable =
        shieldLeft <= 0 ||
        (diff === 'RUTHLESS' && allowFireDuringGrace && shieldLeft <= travelT * 0.88);

      if (this.hasLineOfSight(bot.x, bot.y, tgt.x, tgt.y, bFloor)) {
        let predX = tgt.x;
        let predY = tgt.y;
        const leadScale = diff === 'RUTHLESS' ? 0.96 : diff === 'TACTICAL' ? 0.74 : 0.1;
        for (let it = 0; it < 2; it++) {
          const tHit = dist(bot.x, bot.y, predX, predY) / bSpeed;
          const nx = tgt.x + tgt.vx * tHit * leadScale;
          const ny = tgt.y + tgt.vy * tHit * leadScale;
          if (this.isPointWalkableOnFloor(nx, ny, PLAYER_RADIUS, bFloor)) {
            predX = nx;
            predY = ny;
          }
        }

        if (!tgtShootable || bot.aiHoldShotTimer > 0) return;

        let finalAimX = predX;
        let finalAimY = predY;
        if (diff !== 'CHILL') {
          const predClear = this.isDirectShotClearAndSafe(bot, predX, predY, bFloor, tgt.id);
          if (!predClear) {
            const directClear = this.isDirectShotClearAndSafe(bot, tgt.x, tgt.y, bFloor, tgt.id);
            if (directClear) {
              finalAimX = tgt.x;
              finalAimY = tgt.y;
            } else if (diff === 'RUTHLESS' && shieldLeft <= 0) {
              const cornerTrick = this.findTrickshotAngle(bot, tgt, true);
              if (cornerTrick !== null) {
                const aimA = cornerTrick + (Math.random() - 0.5) * aimSpread * 0.25;
                mem.pendingShotExpire = mem.pendingShotAngle !== null && mem.pendingShotExpire > 0 ? mem.pendingShotExpire : 0.45;
                mem.pendingShotAngle = aimA;
                mem.pendingShotTargetId = tgt.id;
                mem.pendingShotIsTrick = true;
              }
              return;
            } else {
              return;
            }
          }
        }
        const shootA =
          diff === 'CHILL' && Math.random() < 0.65
            ? Math.random() * Math.PI * 2 - Math.PI
            : Math.atan2(finalAimY - bot.y, finalAimX - bot.x) + (Math.random() - 0.5) * aimSpread;
        mem.pendingShotExpire = mem.pendingShotAngle !== null && mem.pendingShotExpire > 0 ? mem.pendingShotExpire : 0.42;
        mem.pendingShotAngle = shootA;
        mem.pendingShotTargetId = diff === 'CHILL' ? null : tgt.id;
        mem.pendingShotIsTrick = false;
      } else if (tgtShootable && bot.aiHoldShotTimer <= 0 && shieldLeft <= 0) {
        const trickChance = diff === 'RUTHLESS' ? 0.72 : diff === 'TACTICAL' ? 0.26 : 0;
        if (trickChance > 0 && Math.random() < trickChance) {
          const bounceAngle = this.findTrickshotAngle(bot, tgt, diff === 'RUTHLESS');
          if (bounceAngle !== null) {
            const aimA = bounceAngle + (Math.random() - 0.5) * aimSpread * 0.25;
            mem.pendingShotExpire = mem.pendingShotAngle !== null && mem.pendingShotExpire > 0 ? mem.pendingShotExpire : 0.48;
            mem.pendingShotAngle = aimA;
            mem.pendingShotTargetId = tgt.id;
            mem.pendingShotIsTrick = true;
          }
        }
      }
    };

    if (mem.unstickTimer > 0 && !urgentTntEscape) {
      bot.aiTargetAngle = mem.unstickAngle;
      bot.aiMoveRatio = 0.95;
      if (diff === 'RUTHLESS' && shouldRunThinkTick) {
        bot.aiThinkTimer = reactionInterval + Math.random() * 0.045;
        if (primaryTarget) planCombatShot(primaryTarget);
      }
    } else if (hardEvading) {
      const blendAimDodge = diff === 'RUTHLESS' && !urgentTntEscape ? 0.45 : 0;
      const rawEvade = Math.atan2(
        evadeY + aimDodge.y * blendAimDodge,
        evadeX + aimDodge.x * blendAimDodge
      );
      bot.aiTargetAngle = this.pickClearMoveAngle(
        bot,
        rawEvade,
        74,
        bot.aiStrafeDir,
        diff !== 'CHILL' && !urgentTntEscape,
        diff === 'RUTHLESS' && !urgentTntEscape
      );
      bot.aiMoveRatio = 1.0;

      // Ruthless shoots accurately WHILE evading incoming bullets/hazards!
      if (diff === 'RUTHLESS' && shouldRunThinkTick) {
        bot.aiThinkTimer = reactionInterval + Math.random() * 0.045;
        if (primaryTarget) {
          planCombatShot(primaryTarget);
        } else if (explosiveShotAngle !== null && bot.ammo > 0 && bot.aiHoldShotTimer <= 0) {
          mem.pendingShotExpire = mem.pendingShotAngle !== null && mem.pendingShotExpire > 0 ? mem.pendingShotExpire : 0.42;
          mem.pendingShotAngle = explosiveShotAngle;
          mem.pendingShotTargetId = null;
          mem.pendingShotIsTrick = true;
        }
      }
    } else if (shouldRunThinkTick) {
      bot.aiThinkTimer = reactionInterval + Math.random() * (diff === 'RUTHLESS' ? 0.045 : 0.08);
      if (diff === 'RUTHLESS') {
        const flipChance = Math.hypot(aimDodge.x, aimDodge.y) > 0.35 ? 0.2 : 0.09;
        if (Math.random() < flipChance) bot.aiStrafeDir *= -1;
      } else if (Math.random() < 0.24) {
        bot.aiStrafeDir *= -1;
      }

      let goalX = mem.patrolX;
      let goalY = mem.patrolY;
      let moveRatio = 0.85;

      if (mem.patrolTimer <= 0 || dist(bot.x, bot.y, mem.patrolX, mem.patrolY) < 95) {
        const np = this.pickArenaPatrolPoint(bot);
        mem.patrolX = np.x;
        mem.patrolY = np.y;
        mem.patrolTimer = 3.2 + Math.random() * 2.2;
        goalX = np.x;
        goalY = np.y;
      }

      const visibleMedkits = this.pickups.filter(
        (p) =>
          p.kind === 'medkit' &&
          sameFloor(p.floor, bFloor) &&
          (!isImmersive || this.canBotSeePoint(bot, p.x, p.y, bFloor, true))
      );
      const visibleBullets = this.pickups.filter(
        (p) =>
          p.kind === 'bullet' &&
          sameFloor(p.floor, bFloor) &&
          (!isImmersive || this.canBotSeePoint(bot, p.x, p.y, bFloor, true))
      );

      const target = primaryTarget;
      const targetDist = primaryTargetDist;

      // Smart pickup selection:
      // Ruthless skips bullets/medkits an enemy is going to reach first (avoiding losing close-range races), otherwise takes aggressive risks!
      let nearestBullet: { p: Pickup; d: number } | null = null;
      if (diff === 'RUTHLESS') {
        let bestBulletScore = -Infinity;
        for (const p of visibleBullets) {
          const evalRes = this.evaluatePickupForRuthless(bot, p, visibleEnemies, bFloor);
          const d = dist(bot.x, bot.y, p.x, p.y);
          if (evalRes.safe && evalRes.score > bestBulletScore) {
            bestBulletScore = evalRes.score;
            nearestBullet = { p, d };
          }
        }
      } else {
        nearestBullet = visibleBullets.reduce<{ p: Pickup; d: number } | null>((best, p) => {
          const d = dist(bot.x, bot.y, p.x, p.y);
          return !best || d < best.d ? { p, d } : best;
        }, null);
      }

      let nearestMedkit: { p: Pickup; d: number } | null = null;
      if (diff === 'RUTHLESS') {
        let bestMedScore = -Infinity;
        for (const p of visibleMedkits) {
          const evalRes = this.evaluatePickupForRuthless(bot, p, visibleEnemies, bFloor);
          if (evalRes.safe && evalRes.score > bestMedScore) {
            bestMedScore = evalRes.score;
            nearestMedkit = { p, d: dist(bot.x, bot.y, p.x, p.y) };
          }
        }
      } else {
        nearestMedkit = visibleMedkits.reduce<{ p: Pickup; d: number } | null>((best, p) => {
          const d = dist(bot.x, bot.y, p.x, p.y);
          return !best || d < best.d ? { p, d } : best;
        }, null);
      }

      const immediateDanger = Boolean(
        target &&
          (targetDist < 285 ||
            (target.ammo > 0 &&
              Math.abs(normalizeAngle(Math.atan2(bot.y - target.y, bot.x - target.x) - target.angle)) < 0.42 &&
              targetDist < 420))
      );
      const guaranteedFinish = Boolean(
        target &&
          (target.hp <= BULLET_DAMAGE || target.stunTimer > 0) &&
          target.spawnInvulnTimer <= 0 &&
          (target.postStunGraceTimer ?? 0) <= 0
      );
      const closeCluster = visibleEnemies.filter((e) => dist(bot.x, bot.y, e.x, e.y) < 380).length >= 2;
      const stockpileAmmoGoal = allEnemies.length <= 1 ? 2 : Math.min(bot.maxAmmo, 3);
      const shouldStockpileRuthless =
        diff === 'RUTHLESS' &&
        bot.ammo > 0 &&
        bot.ammo < stockpileAmmoGoal &&
        nearestBullet !== null &&
        nearestBullet.d < (bot.spawnInvulnTimer > 0 ? 780 : 620) &&
        (!immediateDanger || bot.spawnInvulnTimer > 0) &&
        !guaranteedFinish &&
        explosiveClusterCount === 0 &&
        !closeCluster;

      const medkitDist = nearestMedkit?.d ?? Infinity;
      const shouldSeekMedkit =
        nearestMedkit !== null &&
        bot.hp < bot.maxHp &&
        (diff === 'RUTHLESS'
          ? (bot.hp <= 74 && (!guaranteedFinish || bot.hp <= 42 || medkitDist < 320)) ||
            (bot.hp < 92 && medkitDist < 400)
          : diff === 'TACTICAL'
            ? (bot.hp <= 66 && (!guaranteedFinish || bot.hp <= 36)) || (bot.hp < 86 && medkitDist < 250)
            : bot.hp <= 45);

      // Post-stun speed boost: break point-blank pressure or rush ammo/medkit quickly without passive hiding!
      const postStunEscape =
        diff === 'RUTHLESS' &&
        (bot.postStunGraceTimer ?? 0) > 0 &&
        !shouldSeekMedkit &&
        (bot.ammo === 0 || (target !== null && targetDist < 195) || chasingEnemies.length >= 2);
      const shouldTacticalEscape = postStunEscape;

      let isSeekingPickup = false;

      if (bot.spawnInvulnTimer > 0 && diff === 'RUTHLESS' && bot.ammo === 0 && nearestBullet) {
        // Spawn invulnerability + speed boost: sprint straight to nearest unbeaten bullet!
        goalX = nearestBullet.p.x;
        goalY = nearestBullet.p.y;
        moveRatio = 1.0;
        isSeekingPickup = true;
      } else if (shouldTacticalEscape && visibleEnemies.length > 0) {
        if (target && bot.ammo > 0) {
          planCombatShot(target);
        }
        if (bot.ammo === 0 && nearestBullet) {
          goalX = nearestBullet.p.x;
          goalY = nearestBullet.p.y;
          moveRatio = 1.0;
          isSeekingPickup = true;
        } else {
          const prevEsc = mem.escapeGoalTimer > 0 ? { x: mem.escapeGoalX, y: mem.escapeGoalY } : null;
          const escPt = this.pickSafeEscapePoint(
            bot,
            visibleEnemies,
            bFloor,
            bot.hp < bot.maxHp ? nearestMedkit?.p ?? null : null,
            bot.ammo === 0 ? nearestBullet?.p ?? null : null,
            prevEsc
          );
          mem.escapeGoalX = escPt.x;
          mem.escapeGoalY = escPt.y;
          mem.escapeGoalTimer = 1.1;
          goalX = escPt.x;
          goalY = escPt.y;
          moveRatio = 1.0;
        }
      } else if (shouldSeekMedkit && nearestMedkit) {
        goalX = nearestMedkit.p.x;
        goalY = nearestMedkit.p.y;
        moveRatio = 1.0;
        isSeekingPickup = true;

        if (target) {
          planCombatShot(target);
        }
      } else if (bot.ammo === 0 || shouldStockpileRuthless) {
        // Unarmed / stockpiling: chase unbeaten bullets; if none visible/unbeaten, rotate to open lanes to find new spawns!
        if (nearestBullet) {
          goalX = nearestBullet.p.x;
          goalY = nearestBullet.p.y;
          moveRatio = 1.0;
          isSeekingPickup = true;
        } else if (diff !== 'CHILL' && visibleEnemies.length > 0 && bot.ammo === 0) {
          const prevEsc = mem.escapeGoalTimer > 0 ? { x: mem.escapeGoalX, y: mem.escapeGoalY } : null;
          const escPt = this.pickSafeEscapePoint(bot, visibleEnemies, bFloor, null, null, prevEsc);
          mem.escapeGoalX = escPt.x;
          mem.escapeGoalY = escPt.y;
          mem.escapeGoalTimer = 1.1;
          goalX = escPt.x;
          goalY = escPt.y;
          moveRatio = 1.0;
        } else {
          goalX = mem.patrolX;
          goalY = mem.patrolY;
          moveRatio = 0.96;
        }
      } else if (target) {
        planCombatShot(target);
        const beingChased = chasingEnemies.length > 0;
        const needCoverOrAntiCrossfire =
          diff === 'RUTHLESS' &&
          (visibleEnemies.filter((e) => e.id !== target.id && e.ammo > 0 && e.stunTimer <= 0).length > 0 ||
            bot.aiHoldShotTimer > 0.08 ||
            target.spawnInvulnTimer > 0 ||
            (target.postStunGraceTimer ?? 0) > 0 ||
            beingChased ||
            Math.hypot(aimDodge.x, aimDodge.y) > 0.35);

        if (needCoverOrAntiCrossfire) {
          const idealRange =
            target.spawnInvulnTimer > 0 || (target.postStunGraceTimer ?? 0) > 0
              ? 360
              : beingChased
                ? 285
                : bot.hp <= 55
                  ? 350
                  : 285;
          const coverPt = this.pickCoverStrafePoint(bot, target, visibleEnemies, bFloor, idealRange);
          if (coverPt) {
            goalX = coverPt.x;
            goalY = coverPt.y;
          } else {
            const toTarget = Math.atan2(target.y - bot.y, target.x - bot.x);
            const moveOff = targetDist < 245 ? Math.PI + bot.aiStrafeDir * 0.88 : bot.aiStrafeDir * 0.95;
            goalX = bot.x + Math.cos(toTarget + moveOff) * 210;
            goalY = bot.y + Math.sin(toTarget + moveOff) * 210;
          }
          moveRatio = 1.0;
        } else {
          const toTarget = Math.atan2(target.y - bot.y, target.x - bot.x);
          const strafeSign = targetDist < 220 ? -0.95 : 0.7;
          const moveOff = targetDist < 220 ? Math.PI + bot.aiStrafeDir * 0.78 : bot.aiStrafeDir * strafeSign;
          goalX = bot.x + Math.cos(toTarget + moveOff) * 210;
          goalY = bot.y + Math.sin(toTarget + moveOff) * 210;
          moveRatio = diff === 'RUTHLESS' ? 1.0 : 0.84;
        }
      } else {
        // No visible enemies!
        if (diff === 'CHILL' && bot.ammo > 0 && bot.aiHoldShotTimer <= 0 && Math.random() < 0.22) {
          const stray = Math.random() * Math.PI * 2 - Math.PI;
          mem.pendingShotAngle = stray;
          mem.pendingShotExpire = 0.45;
          mem.pendingShotTargetId = null;
          mem.pendingShotIsTrick = false;
        } else if (mem.lastSeenTimer > 0 && bot.ammo > 0) {
          const elapsed = (isImmersive ? 2.6 : 1.75) - mem.lastSeenTimer;
          const estX = clamp(mem.lastSeenX + mem.lastSeenVx * elapsed * 0.65, ARENA_WALL_THICKNESS + 45, this.map.width - ARENA_WALL_THICKNESS - 45);
          const estY = clamp(mem.lastSeenY + mem.lastSeenVy * elapsed * 0.65, ARENA_WALL_THICKNESS + 45, this.map.height - ARENA_WALL_THICKNESS - 45);
          const useX = this.isPointWalkableOnFloor(estX, estY, PLAYER_RADIUS, bFloor) ? estX : mem.lastSeenX;
          const useY = this.isPointWalkableOnFloor(estX, estY, PLAYER_RADIUS, bFloor) ? estY : mem.lastSeenY;
          // If Ruthless is low HP and saw enemy right nearby, don't walk blindly back into their muzzle — hold corner or seek medkit/bullet!
          if (diff === 'RUTHLESS' && nearestMedkit && bot.hp <= 68) {
            goalX = nearestMedkit.p.x;
            goalY = nearestMedkit.p.y;
            moveRatio = 1.0;
            isSeekingPickup = true;
          } else {
            goalX = useX;
            goalY = useY;
            moveRatio = diff === 'RUTHLESS' ? 0.96 : 0.92;
          }

          // Fair bank shots only when predicted target remains within immersive sight & short disappearance window
          const fairLastSeen =
            !isImmersive || (mem.lastSeenTimer > 1.3 && this.isPointWithinImmersiveBounds(bot, useX, useY, false, true));
          if (diff === 'RUTHLESS' && fairLastSeen && bot.aiHoldShotTimer <= 0 && mem.lastSeenTimer > 0.35 && Math.random() < 0.62) {
            const predTrick = this.findTrickshotToPoint(bot, useX, useY, PLAYER_RADIUS + 20, 40, 3);
            if (predTrick !== null) {
              mem.pendingShotAngle = predTrick;
              mem.pendingShotExpire = 0.45;
              mem.pendingShotTargetId = null;
              mem.pendingShotIsTrick = true;
            }
          }
        } else if (diff !== 'CHILL' && isImmersive && bot.ammo >= 1 && this.recentSoundCues.length > 0 && (!nearestBullet || bot.ammo >= 2)) {
          // In Immersive arenas, hunt fresh directional gunshot/explosion cues!
          let bestCue: { x: number; y: number; d: number } | null = null;
          for (const cue of this.recentSoundCues) {
            if (!sameFloor(cue.floor, bFloor)) continue;
            const dCue = dist(bot.x, bot.y, cue.x, cue.y);
            if (dCue > 150 && (!bestCue || dCue < bestCue.d)) {
              bestCue = { x: cue.x, y: cue.y, d: dCue };
            }
          }
          if (bestCue) {
            goalX = bestCue.x;
            goalY = bestCue.y;
            moveRatio = 0.96;
          }
        } else if (nearestBullet && bot.ammo < bot.maxAmmo && (diff === 'RUTHLESS' || bot.ammo < 2)) {
          goalX = nearestBullet.p.x;
          goalY = nearestBullet.p.y;
          moveRatio = 0.96;
          isSeekingPickup = true;
        } else if (diff !== 'CHILL' && this.recentSoundCues.length > 0) {
          let bestCue: { x: number; y: number; d: number } | null = null;
          for (const cue of this.recentSoundCues) {
            if (!sameFloor(cue.floor, bFloor)) continue;
            const dCue = dist(bot.x, bot.y, cue.x, cue.y);
            if (dCue > 170 && (!bestCue || dCue < bestCue.d)) {
              bestCue = { x: cue.x, y: cue.y, d: dCue };
            }
          }
          if (bestCue) {
            goalX = bestCue.x;
            goalY = bestCue.y;
            moveRatio = 0.94;
          }
        }
      }

      const useThreatFlanking =
        diff === 'RUTHLESS' &&
        bot.spawnInvulnTimer <= 0 &&
        visibleEnemies.length > 0 &&
        (bot.ammo === 0 || shouldTacticalEscape);
      const threatZones = useThreatFlanking
        ? visibleEnemies
            .filter((e) => e.ammo > 0 && e.stunTimer <= 0)
            .map((e) => ({
              x: e.x,
              y: e.y,
              floor: e.floor ?? 0,
              radius: 235,
              penalty: 580,
            }))
        : undefined;

      // Use cached hazard-aware & threat-flanking A* path whenever direct segment hits walls, Nitros/TNTs, or enemy firing lanes!
      let wpX = goalX;
      let wpY = goalY;
      const directWallClear = this.isSegmentClearOnFloor(bot.x, bot.y, goalX, goalY, PLAYER_RADIUS + 2, bFloor);
      const directHazardHit =
        diff !== 'CHILL' && this.segmentHitsHazardOnFloor(bot.x, bot.y, goalX, goalY, bFloor);
      const directThreatCross =
        Boolean(threatZones && threatZones.length > 0) &&
        threatZones!.some((tz) => {
          const dx = goalX - bot.x;
          const dy = goalY - bot.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 16) return false;
          const t = clamp(((tz.x - bot.x) * dx + (tz.y - bot.y) * dy) / lenSq, 0, 1);
          return dist(bot.x + dx * t, bot.y + dy * t, tz.x, tz.y) < tz.radius * 0.72;
        });

      if ((!directWallClear || directHazardHit || directThreatCross) && this.botNavNodes.length > 0) {
        const existing = this.botPaths.get(bot.id);
        const needNewPath =
          !existing ||
          existing.timer <= 0 ||
          existing.goalFloor !== bFloor ||
          dist(existing.goalX, existing.goalY, goalX, goalY) > 95 ||
          existing.nodes.length === 0;
        if (needNewPath) {
          const nodes = this.findNavPathOnGraph(this.botNavNodes, bot.x, bot.y, bFloor, goalX, goalY, bFloor, {
            avoidHazards: diff !== 'CHILL',
            avoidPoint:
              mem.stuckAvoidTimer > 0
                ? { x: mem.stuckAvoidX, y: mem.stuckAvoidY, radius: 135 }
                : undefined,
            avoidThreats: threatZones,
          });
          this.botPaths.set(bot.id, { nodes, timer: 0.45, goalX, goalY, goalFloor: bFloor });
        } else {
          existing.timer -= reactionInterval;
        }

        const pathState = this.botPaths.get(bot.id);
        if (pathState && pathState.nodes.length > 0) {
          while (pathState.nodes.length > 0) {
            const next = pathState.nodes[0];
            const hitDist = next.isStair ? 42 : 44;
            if (dist(bot.x, bot.y, next.x, next.y) < hitDist && pathState.nodes.length > 1) {
              pathState.nodes.shift();
            } else {
              wpX = next.x;
              wpY = next.y;
              break;
            }
          }
        }
      } else {
        this.botPaths.delete(bot.id);
      }

      let rawMoveAngle = Math.atan2(wpY - bot.y, wpX - bot.x);
      if (Math.hypot(sepX, sepY) > 0.05 && !isSeekingPickup) {
        rawMoveAngle = Math.atan2(
          Math.sin(rawMoveAngle) + sepY * 0.45,
          Math.cos(rawMoveAngle) + sepX * 0.45
        );
      }
      if (diff === 'RUTHLESS' && Math.hypot(aimDodge.x, aimDodge.y) > 0.35 && (!isSeekingPickup || bot.ammo === 0)) {
        const dodgeScale = isSeekingPickup ? 0.35 : 0.72;
        const moveScale = isSeekingPickup ? 0.92 : 0.7;
        const bx = Math.cos(rawMoveAngle) * moveScale + aimDodge.x * dodgeScale;
        const by = Math.sin(rawMoveAngle) * moveScale + aimDodge.y * dodgeScale;
        rawMoveAngle = Math.atan2(by, bx);
        moveRatio = 1.0;
      }
      const wpDist = dist(bot.x, bot.y, wpX, wpY);
      const probeDist = isSeekingPickup && wpDist < 130 ? Math.max(24, wpDist - 8) : 68;
      // Don't block normal movement with movable cardboard boxes (bots push them smoothly instead of stalling in Immersive corridors!)
      bot.aiTargetAngle = this.pickClearMoveAngle(
        bot,
        rawMoveAngle,
        probeDist,
        bot.aiStrafeDir,
        diff !== 'CHILL',
        false
      );
      bot.aiMoveRatio = moveRatio;
    }

    // Fair-play joystick coupling: bots face the direction they move in (never moonwalk or pre-aim backward!).
    // To shoot, they must flick the single joystick to pendingShotAngle using exact human turn-speed and deadzone rules.
    if (bot.ammo <= 0 || bot.aiHoldShotTimer > 0) {
      mem.pendingShotAngle = null;
      mem.pendingShotExpire = 0;
    } else if (mem.pendingShotAngle !== null) {
      const fleeConflict =
        (urgentTntEscape && Math.abs(normalizeAngle(mem.pendingShotAngle - bot.aiTargetAngle)) > 0.85) ||
        (Math.hypot(evadeX, evadeY) > 0.9 && Math.abs(normalizeAngle(mem.pendingShotAngle - bot.angle)) > 0.45);
      if (fleeConflict) {
        mem.pendingShotAngle = null;
        mem.pendingShotExpire = 0;
      }
    }

    let stickAngle = bot.aiTargetAngle;
    let stickMagnitude = bot.aiMoveRatio > 0.01 ? 0.08 + clamp(bot.aiMoveRatio, 0, 1) * 0.92 : 0;

    // In Extra Dark Immersive mode, subtly sweep flashlight while patrolling so corridors are scanned naturally
    if (
      this.config.extraDark &&
      mem.pendingShotAngle === null &&
      !hardEvading &&
      visibleEnemies.length === 0 &&
      bot.aiMoveRatio > 0.25 &&
      diff !== 'CHILL'
    ) {
      stickAngle = normalizeAngle(stickAngle + Math.sin(mem.scanPhase) * 0.22);
    }

    if (mem.pendingShotAngle !== null) {
      stickAngle = mem.pendingShotAngle;
      const turnDelta = Math.abs(normalizeAngle(mem.pendingShotAngle - bot.aiTargetAngle));
      if (turnDelta <= 0.55 && !hardEvading && !urgentTntEscape && bot.aiMoveRatio > 0.05) {
        const flickRatio = clamp(Math.min(bot.aiMoveRatio, 0.88), 0, 1);
        stickMagnitude = 0.08 + flickRatio * 0.92;
      } else {
        // Deadzone flick: pivots in place at exact human turn speed without moonwalking or lunging into danger
        stickMagnitude = 0.07;
      }
    }

    this.applyAnalogInput(bot, stickMagnitude > 0, stickAngle, stickMagnitude, dt);

    // Fire ONLY after rotating into tight alignment & re-verifying exact trajectory safety!
    const fireTol = diff === 'RUTHLESS' ? 0.065 : diff === 'TACTICAL' ? 0.095 : 0.14;
    if (
      mem.pendingShotAngle !== null &&
      bot.ammo > 0 &&
      bot.aiHoldShotTimer <= 0 &&
      Math.abs(normalizeAngle(mem.pendingShotAngle - bot.angle)) <= fireTol
    ) {
      let canFireNow = true;
      if (mem.pendingShotTargetId !== null) {
        const tgt = this.players.find((pl) => pl.id === mem.pendingShotTargetId && pl.alive);
        if (!mem.pendingShotIsTrick) {
          if (!tgt || !this.canBotSeePoint(bot, tgt.x, tgt.y, tgt.floor ?? 0)) {
            canFireNow = false;
          }
        } else if (isImmersive) {
          if (!tgt || !this.isPointWithinImmersiveBounds(bot, tgt.x, tgt.y, false, false)) {
            canFireNow = false;
          }
        }
      }
      if (
        canFireNow &&
        diff !== 'CHILL' &&
        !this.isShotSafeAtFire(bot, bot.angle, mem.pendingShotTargetId, mem.pendingShotIsTrick)
      ) {
        canFireNow = false;
      }
      mem.pendingShotAngle = null;
      mem.pendingShotExpire = 0;
      if (canFireNow) {
        this.fireBullet(bot);
        const closeFight = primaryTarget !== null && primaryTargetDist < 310;
        bot.aiHoldShotTimer =
          diff === 'RUTHLESS'
            ? bot.ammo >= 1
              ? closeFight || chasingEnemies.length > 0
                ? 0.16
                : 0.22
              : 0.36
            : diff === 'TACTICAL'
              ? 0.7
              : 1.1;
      }
    }
  }

  private hasLineOfSight(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    floor: FloorLevel = 0
  ): boolean {
    for (const wall of this.wallsByFloor[floor]) {
      if (segmentIntersectsRect(x1, y1, x2, y2, wall)) return false;
    }
    return true;
  }

  private findTrickshotAngle(shooter: Player, target: Player, proMode = false): number | null {
    const tDist = dist(shooter.x, shooter.y, target.x, target.y);
    const travelT = Math.min(0.65, tDist / this.getBulletSpeed());
    const tx = target.x + target.vx * travelT * (proMode ? 0.85 : 0.45);
    const ty = target.y + target.vy * travelT * (proMode ? 0.85 : 0.45);
    return this.findTrickshotToPoint(
      shooter,
      tx,
      ty,
      PLAYER_RADIUS + 18,
      proMode ? 48 : 20,
      proMode ? 4 : 2
    );
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
    this.recentSoundCues.push({ x: player.x, y: player.y, floor: pFloor, ttl: 5.5, strength: 1 });
    if (this.recentSoundCues.length > 10) this.recentSoundCues.shift();
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
        for (const wall of this.wallsByFloor[bFloor]) {
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
            const bounceCode = getWallBounceCode(wall.kind);
            this.emitEvent('bounce', b.x, b.y, bounceCode, undefined, bFloor);
            this.spawnParticles(b.x, b.y, bounceCode === 2 ? '#E2E8F0' : bounceCode === 5 ? '#BAE6FD' : '#FDE047', 5, 110, bFloor);
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

        // Bullets bounce off The Figure AND smoothly slow it down to calm speed for 3 seconds!
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

            const wasSlowed = (m.slowTimer ?? 0) > 1.8;
            m.slowTimer = MONSTER_SLOW_DURATION;
            if (!wasSlowed && m.stunTimer <= 0) {
              this.addFloatingText(m.x, m.y - (m.radius + 14), 'SLOWED 5s!', '#38BDF8', m.floor);
            }
            const shooter = this.players.find((pl) => pl.id === b.ownerId);
            if (shooter) shooter.shotsHit += 1;

            this.emitEvent('bounce', b.x, b.y, 6, undefined, bFloor);
            this.spawnParticles(b.x, b.y, '#FB923C', 6, 130, bFloor);
            this.spawnParticles(b.x, b.y, '#38BDF8', 7, 145, bFloor);
            if (b.bouncesLeft < 0) {
              destroyed = true;
              break;
            }
          }
        }

        for (const player of this.players) {
          if (!player.alive || player.spawnInvulnTimer > 0 || player.stunTimer > 0 || (player.postStunGraceTimer ?? 0) > 0 || !sameFloor(player.floor, bFloor)) continue;
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
      this.recentSoundCues.push({
        x: current.item.x,
        y: current.item.y,
        floor: blastFloor,
        ttl: 7.0,
        strength: 2,
      });
      if (this.recentSoundCues.length > 10) this.recentSoundCues.shift();
      this.spawnParticles(current.item.x, current.item.y, '#FACC15', isTnt ? 22 : 15, 250, blastFloor);
      this.spawnParticles(current.item.x, current.item.y, '#FEF08A', isTnt ? 14 : 10, 180, blastFloor);
      this.spawnSmokeParticles(current.item.x, current.item.y, isTnt ? 12 : 8, 95, blastFloor);

      if (this.libraryState) {
        const m = this.libraryState.monster;
        const dM = dist(current.item.x, current.item.y, m.x, m.y);
        if (sameFloor(m.floor, blastFloor) && dM <= blastRadius + m.radius) {
          const stunSecs = this.getFigureProfile().stunDuration;
          m.stunTimer = stunSecs;
          m.mode = 'calm';
          m.rageTimer = 0;
          m.rageFadeTimer = 0;
          m.reachedHoldTimer = 0;
          m.vx = 0;
          m.vy = 0;
          this.monsterPath = [];
          this.monsterChasedPlayerId = null;
          this.emitEvent('monster_stun', m.x, m.y, undefined, undefined, m.floor);
          const stunText = Number.isInteger(stunSecs) ? `${stunSecs}s` : `${stunSecs.toFixed(1)}s`;
          this.addFloatingText(
            m.x,
            m.y - (m.radius + 14),
            `FIGURE STUNNED ${stunText}!`,
            '#FDE047',
            m.floor
          );
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
    player.postStunGraceTimer = 0;
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
    if (
      !player.alive ||
      player.spawnInvulnTimer > 0 ||
      player.stunTimer > 0 ||
      (player.postStunGraceTimer ?? 0) > 0
    ) {
      return;
    }
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
    player.postStunGraceTimer = 0;
    player.alive = true;
    player.spawnInvulnTimer = this.getSpawnProtectionDuration();
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

    const floors: FloorLevel[] = this.map.id === 'library' ? [0, 1] : [0];
    for (const fl of floors) {
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

    for (const fl of floors) {
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
    const monsterKey = `${this.map.id}:monster32`;
    let cachedMonster = ArenaEngine.arenaBotGraphCache.get(monsterKey);
    if (!cachedMonster) {
      cachedMonster = this.buildGridNavGraph(32, MONSTER_RADIUS + 2);
      ArenaEngine.arenaBotGraphCache.set(monsterKey, cachedMonster);
    }
    this.navNodes = cachedMonster;

    const botKey = `${this.map.id}:bot32`;
    let cachedBots = ArenaEngine.arenaBotGraphCache.get(botKey);
    if (!cachedBots) {
      cachedBots = this.buildGridNavGraph(32, PLAYER_RADIUS + 2);
      ArenaEngine.arenaBotGraphCache.set(botKey, cachedBots);
    }
    this.botNavNodes = cachedBots;
  }

  private getNavBuckets(graph: NavNode[]) {
    let entry = ArenaEngine.navBucketCache.get(graph);
    if (!entry) {
      const cellSize = 180;
      const cols = Math.max(1, Math.ceil(this.map.width / cellSize));
      const rows = Math.max(1, Math.ceil(this.map.height / cellSize));
      const bucketsByFloor: [Map<number, NavNode[]>, Map<number, NavNode[]>] = [new Map(), new Map()];
      for (const n of graph) {
        const cx = clamp(Math.floor(n.x / cellSize), 0, cols - 1);
        const cy = clamp(Math.floor(n.y / cellSize), 0, rows - 1);
        const idx = cy * cols + cx;
        const map = bucketsByFloor[n.floor];
        let arr = map.get(idx);
        if (!arr) {
          arr = [];
          map.set(idx, arr);
        }
        arr.push(n);
      }
      entry = { cellSize, cols, rows, bucketsByFloor };
      ArenaEngine.navBucketCache.set(graph, entry);
    }
    return entry;
  }

  private findClosestNavNodeOnGraph(
    graph: NavNode[],
    x: number,
    y: number,
    floor: FloorLevel,
    preferLos = true
  ): NavNode | null {
    if (graph.length === 0) return null;
    const { cellSize, cols, rows, bucketsByFloor } = this.getNavBuckets(graph);
    const floorMap = bucketsByFloor[floor];
    const centerCx = clamp(Math.floor(x / cellSize), 0, cols - 1);
    const centerCy = clamp(Math.floor(y / cellSize), 0, rows - 1);

    let bestLos: NavNode | null = null;
    let bestLosD = Infinity;
    let bestAny: NavNode | null = null;
    let bestAnyD = Infinity;

    for (let cy = Math.max(0, centerCy - 2); cy <= Math.min(rows - 1, centerCy + 2); cy++) {
      for (let cx = Math.max(0, centerCx - 2); cx <= Math.min(cols - 1, centerCx + 2); cx++) {
        const bucket = floorMap.get(cy * cols + cx);
        if (!bucket) continue;
        for (const n of bucket) {
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
      }
    }

    if (bestLos) return bestLos;
    if (bestAny) return bestAny;

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

  private ensureAstarBuffers(nCount: number) {
    if (this.astarCap < nCount) {
      this.astarCap = nCount;
      this.astarG = new Float32Array(nCount);
      this.astarF = new Float32Array(nCount);
      this.astarCameFrom = new Int32Array(nCount);
      this.astarClosed = new Uint8Array(nCount);
      this.astarInOpen = new Uint8Array(nCount);
    }
    this.astarG.fill(Infinity, 0, nCount);
    this.astarF.fill(Infinity, 0, nCount);
    this.astarCameFrom.fill(-1, 0, nCount);
    this.astarClosed.fill(0, 0, nCount);
    this.astarInOpen.fill(0, 0, nCount);
    this.astarHeap.length = 0;
  }

  private findNavPathOnGraph(
    graph: NavNode[],
    fromX: number,
    fromY: number,
    fromFloor: FloorLevel,
    toX: number,
    toY: number,
    toFloor: FloorLevel,
    opts?: {
      avoidHazards?: boolean;
      avoidPoint?: { x: number; y: number; radius: number };
      avoidThreats?: Array<{ x: number; y: number; floor: FloorLevel; radius: number; penalty: number }>;
    }
  ): NavNode[] {
    if (graph.length === 0) return [];
    const start = this.findClosestNavNodeOnGraph(graph, fromX, fromY, fromFloor, true);
    const goal = this.findClosestNavNodeOnGraph(graph, toX, toY, toFloor, true);
    if (!start || !goal) return [];
    if (start.id === goal.id) return [goal];

    const avoidHazards = Boolean(opts?.avoidHazards);
    const avoidPt = opts?.avoidPoint;
    const avoidThreats = opts?.avoidThreats ?? [];
    const hazards = avoidHazards
      ? this.pickups
          .filter((p) => p.kind === 'nitro' || (p.kind === 'tnt' && p.armed))
          .map((p) => ({
            x: p.kind === 'tnt' ? p.x + (p.vx ?? 0) * 0.42 : p.x,
            y: p.kind === 'tnt' ? p.y + (p.vy ?? 0) * 0.42 : p.y,
            floor: p.floor ?? 0,
            radius: p.kind === 'nitro' ? NITRO_RADIUS + PLAYER_RADIUS + 48 : TNT_BLAST_RADIUS + 54,
            penalty: p.kind === 'nitro' ? 850 : 1400,
          }))
      : [];
    const brokenPits = avoidHazards ? this.icePits.filter((pit) => pit.broken) : [];

    const nCount = graph.length;
    this.ensureAstarBuffers(nCount);
    const gScore = this.astarG;
    const fScore = this.astarF;
    const cameFrom = this.astarCameFrom;
    const closed = this.astarClosed;
    const inOpen = this.astarInOpen;
    const heap = this.astarHeap;
    heap.push(start.id);

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
        let stepCost = curr.floor !== nb.floor ? 120 : dist(curr.x, curr.y, nb.x, nb.y);
        const midX = (curr.x + nb.x) * 0.5;
        const midY = (curr.y + nb.y) * 0.5;
        if (avoidHazards) {
          for (const h of hazards) {
            if (
              h.floor === nb.floor &&
              (dist(nb.x, nb.y, h.x, h.y) < h.radius ||
                (curr.floor === nb.floor && dist(midX, midY, h.x, h.y) < h.radius))
            ) {
              stepCost += h.penalty;
            }
          }
          for (const pit of brokenPits) {
            if (
              isPointInIcePit(nb.x, nb.y, pit, PLAYER_RADIUS + 34) ||
              isPointInIcePit(midX, midY, pit, PLAYER_RADIUS + 34)
            ) {
              stepCost += 950;
            }
          }
        }
        if (avoidThreats.length > 0) {
          for (const tz of avoidThreats) {
            if (
              tz.floor === nb.floor &&
              (dist(nb.x, nb.y, tz.x, tz.y) < tz.radius ||
                (curr.floor === nb.floor && dist(midX, midY, tz.x, tz.y) < tz.radius))
            ) {
              stepCost += tz.penalty;
            }
          }
        }
        if (avoidPt && dist(nb.x, nb.y, avoidPt.x, avoidPt.y) < avoidPt.radius) {
          stepCost += 460;
        }
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
      slowTimer: 0,
      speedRatio: 0.5,
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

  private triggerMonsterRage(
    targetX: number,
    targetY: number,
    targetFloor: FloorLevel,
    chasedPlayerId?: number
  ) {
    if (!this.libraryState) return;
    const m = this.libraryState.monster;
    if (m.stunTimer > 0) return;

    const wasCalm = m.mode !== 'rage';
    m.mode = 'rage';
    m.targetX = targetX;
    m.targetY = targetY;
    m.targetFloor = targetFloor;
    m.rageTimer = this.getFigureProfile().rageDuration;
    m.reachedHoldTimer = -1;
    m.rageFadeTimer = 0;
    this.monsterPathTimer = 0;
    if (chasedPlayerId !== undefined) {
      this.monsterChasedPlayerId = chasedPlayerId;
    }

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
      this.monsterChasedPlayerId = null;
      return;
    }

    // 1. Calm / Stealth / Loud-Sound Hearing Logic (scales with Figure Difficulty Mode)
    const figureProfile = this.getFigureProfile();
    const hearRadius = figureProfile.hearingRadius;
    const hearThroughFloors = figureProfile.hearThroughFloors;
    const stealthThreshold = figureProfile.stealthThreshold;
    const loudThreshold = Math.min(0.97, stealthThreshold + 0.16);
    const maxPlayerSpd = this.getPlayerMaxSpeed();
    let loudestSound: { x: number; y: number; floor: FloorLevel; playerId: number } | null = null;
    this.monsterHearCheckTimer -= dt;
    const checkProbabilisticStealth = this.monsterHearCheckTimer <= 0;
    if (checkProbabilisticStealth) {
      this.monsterHearCheckTimer = 0.32;
    }

    for (const p of this.players) {
      if (!p.alive || p.stunTimer > 0) continue;
      const pFloor = p.floor ?? 0;
      const onSameFloor = pFloor === m.floor;
      const onStairs = (p.stairBlend ?? 0) > 0.02 && (p.stairBlend ?? 0) < 0.98;
      const activelyChased =
        m.mode === 'rage' &&
        p.id === this.monsterChasedPlayerId &&
        dist(p.x, p.y, m.x, m.y) <= hearRadius;
      if (!onSameFloor && !onStairs && !activelyChased && !hearThroughFloors) continue;

      const d = dist(p.x, p.y, m.x, m.y);
      if (d > hearRadius) continue;

      const speed = Math.hypot(p.vx, p.vy);
      const speedRatio = speed / maxPlayerSpd;
      if (
        speedRatio >= loudThreshold ||
        (activelyChased && (onStairs || !onSameFloor) && (speedRatio >= 0.55 || d <= 520))
      ) {
        loudestSound = { x: p.x, y: p.y, floor: pFloor, playerId: p.id };
        break;
      } else if ((onSameFloor || hearThroughFloors) && speedRatio >= stealthThreshold && checkProbabilisticStealth) {
        const closeDist = m.radius + PLAYER_RADIUS + 42;
        const prox = clamp((hearRadius - d) / Math.max(1, hearRadius - closeDist), 0, 1);
        const speedWeight = clamp(
          (speedRatio - stealthThreshold) / Math.max(0.08, loudThreshold - stealthThreshold),
          0.25,
          1.0
        );
        const floorAtten = onSameFloor ? 1.0 : 0.85;
        const chance = 0.32 * prox * speedWeight * floorAtten;
        if (Math.random() < chance) {
          loudestSound = { x: p.x, y: p.y, floor: pFloor, playerId: p.id };
        }
      }
    }

    if (loudestSound) {
      this.triggerMonsterRage(loudestSound.x, loudestSound.y, loudestSound.floor, loudestSound.playerId);
    }

    // 2. Speed & Mode State Machine (Calm 0.50->0.85x, Rage scales by difficulty, 1s fade-out, 5s bullet slowdown)
    const calmRatio = 0.5 + progFrac * 0.35;
    const rageRatio =
      figureProfile.rageMinRatio + progFrac * (figureProfile.rageMaxRatio - figureProfile.rageMinRatio);

    m.slowTimer = Math.max(0, (m.slowTimer ?? 0) - dt);

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
        this.monsterChasedPlayerId = null;
      }
    }

    if (m.rageFadeTimer > 0) {
      m.rageFadeTimer = Math.max(0, m.rageFadeTimer - dt);
    }

    const baseTargetRatio =
      m.mode === 'rage'
        ? rageRatio
        : m.rageFadeTimer > 0
          ? calmRatio + (rageRatio - calmRatio) * m.rageFadeTimer
          : calmRatio;

    const desiredRatio = (m.slowTimer ?? 0) > 0 ? Math.min(baseTargetRatio, calmRatio) : baseTargetRatio;
    const currentRatio = m.speedRatio ?? desiredRatio;
    const blendRate = desiredRatio < currentRatio ? 5.8 : 4.5;
    const nextRatio = currentRatio + (desiredRatio - currentRatio) * (1 - Math.exp(-blendRate * dt));
    m.speedRatio = nextRatio;

    this.monsterRageSpeedScale = nextRatio;
    const moveSpeed = PLAYER_MAX_SPEED * nextRatio;

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

    // 3. Cross-Floor Staircase Traversal & Fade (1.5s default, or full speed when stairClimbTime === 0)
    if (m.transitioning) {
      const dxT = this.monsterTransToX - this.monsterTransFromX;
      const dyT = this.monsterTransToY - this.monsterTransFromY;
      const transDist = Math.max(1, Math.hypot(dxT, dyT));
      const stairDuration =
        figureProfile.stairClimbTime > 0
          ? figureProfile.stairClimbTime
          : transDist / Math.max(140, moveSpeed);
      const nextP = clamp((m.transitionProgress ?? 0) + dt / stairDuration, 0, 1);
      m.transitionProgress = nextP;
      m.x = this.monsterTransFromX + dxT * nextP;
      m.y = this.monsterTransFromY + dyT * nextP;
      m.vx = dxT / stairDuration;
      m.vy = dyT / stairDuration;
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

      // Check if Monster has reached the stair mouth to begin a slow 3.0s cross-floor climb/descent
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
            const groundY = st.upDir === 'up' ? st.y + st.h + 24 : st.y - 24;
            const upperY = st.upDir === 'up' ? st.y - 24 : st.y + st.h + 24;
            const entryX = cx;
            const entryY = m.floor === 0 ? groundY : upperY;
            const insideStair =
              m.x >= st.x - 8 &&
              m.x <= st.x + st.w + 8 &&
              m.y >= st.y - 28 &&
              m.y <= st.y + st.h + 28;
            if (insideStair || (Math.abs(m.x - entryX) <= 68 && Math.abs(m.y - entryY) <= 68)) {
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
          for (const wall of this.wallsByFloor[m.floor]) {
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

    // Check Nitro collision with Figure: touching a Nitro detonates it and stuns Figure for 15s!
    if (!m.transitioning) {
      for (const item of this.pickups) {
        if (item.kind !== 'nitro' || !sameFloor(item.floor, m.floor)) continue;
        if (dist(item.x, item.y, m.x, m.y) <= m.radius + item.radius - 2) {
          this.detonatePickup(item, null);
          return;
        }
      }
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
      const exits = this.countOpenExits(px, py, floor);
      let score = nextD + (exits <= 2 ? -240 : exits * 28);
      for (const p of this.pickups) {
        if (!sameFloor(p.floor, floor)) continue;
        if (p.kind === 'tnt' && p.armed && dist(px, py, p.x, p.y) < TNT_BLAST_RADIUS + 52) {
          score -= 900;
        } else if (p.kind === 'nitro' && dist(px, py, p.x, p.y) < NITRO_RADIUS + PLAYER_RADIUS + 34) {
          score -= 700;
        }
      }
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
    mem.goalLockTimer = Math.max(0, mem.goalLockTimer - dt);
    mem.defendPillarTimer = Math.max(0, mem.defendPillarTimer - dt);
    mem.pendingShotExpire = Math.max(0, mem.pendingShotExpire - dt);
    mem.tntEscTimer = Math.max(0, mem.tntEscTimer - dt);
    mem.escapeGoalTimer = Math.max(0, mem.escapeGoalTimer - dt);
    mem.libMonsterEscTimer = Math.max(0, mem.libMonsterEscTimer - dt);
    mem.libRivalEscTimer = Math.max(0, mem.libRivalEscTimer - dt);
    if (mem.pendingShotExpire <= 0) mem.pendingShotAngle = null;

    if (bot.hp < mem.lastKnownHp || bot.hurtFlashTimer > 0 || bot.stunTimer > 0) {
      mem.defendPillarTimer = 2.6;
    }
    mem.lastKnownHp = bot.hp;

    const sameFloorMonster = sameFloor(m.floor, bFloor);
    const monsterDist = sameFloorMonster ? dist(bot.x, bot.y, m.x, m.y) : 9999;

    // 1. Fair Book Collection: Bots MUST pause & focus briefly (~0.5-0.8s) to collect a book just like humans!
    if (prog && prog.collectedCount < LIBRARY_BOOKS_PER_PLAYER) {
      const monsterImmediateThreat = m.stunTimer <= 0 && sameFloorMonster && monsterDist < 235;
      const nearbyBook = prog.books.find((b) => canCollectBookSpot(bot, b, this.map.walls));
      if (nearbyBook && !monsterImmediateThreat) {
        if (mem.collectingBookId !== nearbyBook.id) {
          mem.collectingBookId = nearbyBook.id;
          mem.bookCollectTimer = 0;
        }
        const needPause = diff === 'RUTHLESS' ? 0.52 : diff === 'TACTICAL' ? 0.68 : 0.88;
        mem.bookCollectTimer += dt;
        bot.vx *= Math.exp(-12 * dt);
        bot.vy *= Math.exp(-12 * dt);
        const aimBook = Math.atan2(nearbyBook.y - bot.y, nearbyBook.x - bot.x);
        const ad = normalizeAngle(aimBook - bot.angle);
        const maxTurn = this.getPlayerTurnSpeed() * dt;
        bot.angle = normalizeAngle(bot.angle + clamp(ad, -maxTurn, maxTurn));

        if (mem.bookCollectTimer >= needPause) {
          this.collectNearbyBook(bot.id);
          mem.collectingBookId = null;
          mem.bookCollectTimer = 0;
          mem.lockedGoalBookId = null;
          mem.goalLockTimer = 0;
          this.botPaths.delete(bot.id);
        }
        return;
      } else {
        mem.collectingBookId = null;
        mem.bookCollectTimer = 0;
      }
    }

    // 2. Central Pillar Code Filling (15-20s randomized duration, pauses & fights defensively if attacked!)
    const doorDist = door ? dist(bot.x, bot.y, door.x, door.y) : Infinity;
    if (prog && door && prog.collectedCount >= LIBRARY_BOOKS_PER_PLAYER && bFloor === 0 && doorDist <= 145 && cooldown <= 0) {
      const figureTooClose = m.stunTimer <= 0 && sameFloorMonster && monsterDist < 260;
      const armedTntNear = this.pickups.some(
        (p) => p.kind === 'tnt' && p.armed && sameFloor(p.floor, bFloor) && dist(bot.x, bot.y, p.x, p.y) < TNT_BLAST_RADIUS + 46
      );
      const incomingBullet = this.bullets.some(
        (b) =>
          sameFloor(b.floor, bFloor) &&
          !(b.ownerId === bot.id && b.age < BULLET_SELF_GRACE) &&
          dist(bot.x, bot.y, b.x, b.y) < 220
      );
      const closeThreatRival = this.players.some(
        (e) =>
          e.id !== bot.id &&
          e.alive &&
          !this.isTeammate(bot.id, e.id) &&
          this.canBotSeePoint(bot, e.x, e.y, e.floor ?? 0) &&
          dist(bot.x, bot.y, e.x, e.y) < (diff === 'CHILL' ? 190 : 340)
      );
      const underAttackAtPillar =
        mem.defendPillarTimer > 0 || closeThreatRival || incomingBullet || armedTntNear;

      if (!figureTooClose && !underAttackAtPillar) {
        const dialNeed = mem.dialTargetTime;
        mem.dialTimer += dt;
        const digitIdx = Math.min(LIBRARY_CODE_LEN - 1, Math.floor((mem.dialTimer / dialNeed) * LIBRARY_CODE_LEN));
        const solution = this.librarySolutions.get(bot.id);
        if (solution && mem.dialTimer >= dialNeed) {
          mem.dialTimer = 0;
          mem.dialTargetTime = 15 + Math.random() * 5;
          this.botCodeCooldown.set(bot.id, 1.8);
          if (diff === 'CHILL' && !mem.dialMistakeDone && Math.random() < 0.35) {
            mem.dialMistakeDone = true;
            const bad = [...solution];
            bad[0] = (bad[0] + 1) % 10;
            this.submitDoorCode(bot.id, bad);
          } else {
            this.submitDoorCode(bot.id, solution);
          }
          return;
        } else if (solution && Math.random() < dt * 0.45) {
          this.setDoorDialDigit(bot.id, digitIdx, solution[digitIdx]);
        }
        bot.vx *= Math.exp(-10 * dt);
        bot.vy *= Math.exp(-10 * dt);
        const faceDoor = Math.atan2(door.y - bot.y, door.x - bot.x);
        const fdDiff = normalizeAngle(faceDoor - bot.angle);
        const maxTurn = this.getPlayerTurnSpeed() * dt;
        bot.angle = normalizeAngle(bot.angle + clamp(fdDiff, -maxTurn, maxTurn));
        return;
      }
    } else if (doorDist > 280 || !prog || prog.collectedCount < LIBRARY_BOOKS_PER_PLAYER) {
      mem.dialTimer = Math.max(0, mem.dialTimer - dt * 0.5);
    }

    // Stuck detector (ignored while inside committed stair traversal unless genuinely wedged)
    if (dist(bot.x, bot.y, mem.lastProgressX, mem.lastProgressY) > 16) {
      mem.lastProgressX = bot.x;
      mem.lastProgressY = bot.y;
      mem.stuckTimer = 0;
    } else if (bot.aiMoveRatio > 0.25 && mem.pendingShotAngle === null) {
      mem.stuckTimer += dt;
      if (mem.stuckTimer > 0.75) {
        mem.stuckTimer = 0;
        bot.aiStrafeDir *= -1;
        mem.stairCommit = null;
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

    // 3. Evade Monster ONLY when actually threatened (not when calm Figure is behind shelves!) + bullets + explosives
    let evadeX = 0;
    let evadeY = 0;
    const figureClearLos =
      sameFloorMonster && monsterDist < 420 && this.hasLineOfSight(bot.x, bot.y, m.x, m.y, bFloor);
    const monsterBeingTargeted =
      m.stunTimer <= 0 &&
      sameFloorMonster &&
      ((m.mode === 'rage' &&
        (dist(m.targetX, m.targetY, bot.x, bot.y) < 250 || monsterDist < 340)) ||
        monsterDist < 195 ||
        (figureClearLos && monsterDist < (diff === 'RUTHLESS' ? 320 : 275)));

    if (monsterBeingTargeted && !mem.stairCommit) {
      if (mem.libMonsterEscTimer <= 0) {
        mem.libMonsterEscAngle = this.pickLibraryEscapeAngle(bot, m, bFloor);
        mem.libMonsterEscTimer = 0.12;
      }
      evadeX += Math.cos(mem.libMonsterEscAngle) * 3.8;
      evadeY += Math.sin(mem.libMonsterEscAngle) * 3.8;
    }

    const bulletEvade = this.getIncomingBulletEvade(bot, bFloor, diff);
    evadeX += bulletEvade.x * 0.85;
    evadeY += bulletEvade.y * 0.85;

    let urgentLibTntEscape = false;
    if (diff !== 'CHILL') {
      const hasArmedLibTntNear = this.pickups.some(
        (p) =>
          p.kind === 'tnt' &&
          p.armed &&
          sameFloor(p.floor, bFloor) &&
          dist(bot.x, bot.y, p.x, p.y) < TNT_BLAST_RADIUS + 95
      );
      if (hasArmedLibTntNear) {
        urgentLibTntEscape = true;
        if (mem.tntEscTimer <= 0) {
          const tntEscA = this.pickTntSafeEscapeAngle(bot, bFloor, mem.tntEscAngle);
          if (tntEscA !== null) {
            mem.tntEscAngle = tntEscA;
          }
          mem.tntEscTimer = 0.11;
        }
        evadeX += Math.cos(mem.tntEscAngle) * 4.0;
        evadeY += Math.sin(mem.tntEscAngle) * 4.0;
      } else {
        mem.tntEscTimer = 0;
      }
    }
    for (const p of this.pickups) {
      if (!sameFloor(p.floor, bFloor)) continue;
      if (p.kind === 'tnt' && p.armed && diff === 'CHILL') {
        const d = dist(bot.x, bot.y, p.x, p.y);
        if (d < 105) {
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

    const visibleRivals = this.players.filter(
      (e) =>
        e.id !== bot.id &&
        e.alive &&
        !this.isTeammate(bot.id, e.id) &&
        this.canBotSeePoint(bot, e.x, e.y, e.floor ?? 0)
    );

    if (diff === 'RUTHLESS' && visibleRivals.length > 0 && !monsterBeingTargeted) {
      const aimDodge = this.getAimThreatDodge(bot, visibleRivals, bFloor);
      evadeX += aimDodge.x * 0.85;
      evadeY += aimDodge.y * 0.85;
      if (
        (bot.postStunGraceTimer ?? 0) > 0 &&
        visibleRivals.some((e) => e.ammo > 0 && dist(bot.x, bot.y, e.x, e.y) < 235)
      ) {
        if (mem.libRivalEscTimer <= 0) {
          const prevEsc = mem.escapeGoalTimer > 0 ? { x: mem.escapeGoalX, y: mem.escapeGoalY } : null;
          const escPt = this.pickSafeEscapePoint(bot, visibleRivals, bFloor, null, null, prevEsc);
          mem.escapeGoalX = escPt.x;
          mem.escapeGoalY = escPt.y;
          mem.escapeGoalTimer = 1.1;
          mem.libRivalEscTimer = 0.14;
        }
        const escA = Math.atan2(mem.escapeGoalY - bot.y, mem.escapeGoalX - bot.x);
        evadeX += Math.cos(escA) * 1.9;
        evadeY += Math.sin(escA) * 1.9;
      }
    }

    bot.aiThinkTimer -= dt;
    bot.aiHoldShotTimer -= dt;

    // 4. Smart Explosive & Fair Combat Planning (turn-speed capped! zero instant snaps or backward pre-aim!)
    if (bot.ammo > 0 && bot.aiHoldShotTimer <= 0 && !mem.pendingShotAngle) {
      // Priority A: Shoot Nitro/TNT to STUN Figure when Figure itself is actually visible!
      if (
        diff !== 'CHILL' &&
        m.stunTimer <= 0 &&
        sameFloorMonster &&
        monsterDist < 500 &&
        this.canBotSeePoint(bot, m.x, m.y, bFloor, false)
      ) {
        for (const n of this.pickups) {
          if (!sameFloor(n.floor, bFloor)) continue;
          if (n.kind !== 'nitro' && !(n.kind === 'tnt' && !n.armed)) continue;
          const blastR = n.kind === 'tnt' ? TNT_BLAST_RADIUS : NITRO_BLAST_RADIUS;
          if (
            dist(n.x, n.y, m.x, m.y) <= blastR + m.radius - 6 &&
            dist(n.x, n.y, bot.x, bot.y) > blastR + 26 &&
            this.canBotSeePoint(bot, n.x, n.y, bFloor, true)
          ) {
            const shotA = Math.atan2(n.y - bot.y, n.x - bot.x);
            mem.pendingShotAngle = shotA;
            mem.pendingShotExpire = 0.45;
            mem.pendingShotTargetId = null;
            mem.pendingShotIsTrick = false;
            break;
          }
        }
      }

      // Priority A2: Shoot raging Figure when visible to slow it for 5s and escape cleanly
      if (
        !mem.pendingShotAngle &&
        diff !== 'CHILL' &&
        m.stunTimer <= 0 &&
        (m.slowTimer ?? 0) <= 0.45 &&
        m.mode === 'rage' &&
        sameFloorMonster &&
        monsterDist < (diff === 'RUTHLESS' ? 370 : 250) &&
        this.canBotSeePoint(bot, m.x, m.y, bFloor, false)
      ) {
        const shotA = Math.atan2(m.y - bot.y, m.x - bot.x);
        mem.pendingShotAngle = shotA;
        mem.pendingShotExpire = 0.45;
        mem.pendingShotTargetId = null;
        mem.pendingShotIsTrick = false;
      }

      // Priority B & C: Visible rivals only (strict Immersive darkness & sight parity!)
      if (!mem.pendingShotAngle && diff === 'RUTHLESS' && visibleRivals.length > 0) {
        for (const n of this.pickups) {
          if (!sameFloor(n.floor, bFloor)) continue;
          if (n.kind !== 'nitro' && !(n.kind === 'tnt' && !n.armed)) continue;
          const blastR = n.kind === 'tnt' ? TNT_BLAST_RADIUS : NITRO_BLAST_RADIUS;
          if (dist(n.x, n.y, bot.x, bot.y) <= blastR + 26) continue;
          const rivalNear = visibleRivals.some((e) => dist(n.x, n.y, e.x, e.y) <= blastR + 25);
          if (rivalNear && this.canBotSeePoint(bot, n.x, n.y, bFloor, true)) {
            const shotA = Math.atan2(n.y - bot.y, n.x - bot.x);
            mem.pendingShotAngle = shotA;
            mem.pendingShotExpire = 0.45;
            mem.pendingShotTargetId = null;
            mem.pendingShotIsTrick = false;
            break;
          }
        }
      }

      if (
        !mem.pendingShotAngle &&
        visibleRivals.length > 0 &&
        (diff !== 'RUTHLESS' ||
          mem.defendPillarTimer > 0 ||
          bot.ammo >= 2 ||
          visibleRivals.some(
            (e) =>
              dist(bot.x, bot.y, e.x, e.y) < 340 ||
              e.hp <= BULLET_DAMAGE ||
              (e.ammo > 0 && Math.abs(normalizeAngle(Math.atan2(bot.y - e.y, bot.x - e.x) - e.angle)) < 0.45)
          ))
      ) {
        let target = visibleRivals[0];
        if (visibleRivals.length > 1) {
          let bestS = -Infinity;
          for (const e of visibleRivals) {
            const shieldLeft = Math.max(e.spawnInvulnTimer, e.postStunGraceTimer ?? 0);
            const s =
              -dist(bot.x, bot.y, e.x, e.y) * 0.4 +
              (e.hp <= BULLET_DAMAGE ? 140 : 0) +
              (100 - e.hp) * 0.8 +
              (shieldLeft > 0.25 ? -120 : 0);
            if (s > bestS) {
              bestS = s;
              target = e;
            }
          }
        }
        const bSpeed = this.getBulletSpeed();
        const dT = dist(bot.x, bot.y, target.x, target.y);
        const travelT = Math.max(0, (dT - PLAYER_RADIUS - BULLET_RADIUS) / bSpeed);
        const shieldLeft = Math.max(target.spawnInvulnTimer, target.postStunGraceTimer ?? 0);
        const canTimeShot =
          target.stunTimer <= 0 &&
          (shieldLeft <= 0 || (diff === 'RUTHLESS' && shieldLeft <= travelT * 0.88));
        if (canTimeShot) {
          const aimSpread = diff === 'RUTHLESS' ? 0.018 : diff === 'TACTICAL' ? 0.11 : 0.45;
          const lead = diff === 'RUTHLESS' ? 0.94 : diff === 'TACTICAL' ? 0.72 : 0.15;
          const predX = target.x + target.vx * travelT * lead;
          const predY = target.y + target.vy * travelT * lead;
          const predSafe =
            diff === 'CHILL' || this.isDirectShotClearAndSafe(bot, predX, predY, bFloor, target.id);
          const directSafe =
            diff === 'CHILL' || this.isDirectShotClearAndSafe(bot, target.x, target.y, bFloor, target.id);
          if (predSafe || directSafe) {
            const aimX = predSafe ? predX : target.x;
            const aimY = predSafe ? predY : target.y;
            const shotA =
              Math.atan2(aimY - bot.y, aimX - bot.x) + (Math.random() - 0.5) * aimSpread;
            mem.pendingShotAngle = shotA;
            mem.pendingShotExpire = 0.45;
            mem.pendingShotTargetId = target.id;
            mem.pendingShotIsTrick = false;
          } else if (diff === 'RUTHLESS' && shieldLeft <= 0) {
            const trickA = this.findTrickshotAngle(bot, target, true);
            if (trickA !== null) {
              mem.pendingShotAngle = trickA + (Math.random() - 0.5) * aimSpread * 0.25;
              mem.pendingShotExpire = 0.45;
              mem.pendingShotTargetId = target.id;
              mem.pendingShotIsTrick = true;
            }
          }
        }
      }
    }

    const figureProfile = this.getFigureProfile();
    const stealthWalkRatio = Math.max(0.5, Math.min(0.72, figureProfile.stealthThreshold - 0.05));
    const figureChasingElsewhere =
      m.mode === 'rage' &&
      !monsterBeingTargeted &&
      monsterDist > 480 &&
      dist(m.targetX, m.targetY, bot.x, bot.y) > 420;
    const inHearing =
      m.stunTimer <= 0 &&
      (sameFloorMonster || figureProfile.hearThroughFloors) &&
      monsterDist < figureProfile.hearingRadius - 30 &&
      !figureChasingElsewhere;

    // 5. Committed Staircase Traversal — eliminates stair oscillation permanently!
    if (mem.stairCommit) {
      mem.stairCommit.timer -= dt;
      const st = (this.map.stairs ?? []).find((s) => s.id === mem.stairCommit!.stairId);
      if (!st || mem.stairCommit.timer <= 0) {
        mem.stairCommit = null;
      } else {
        const cx = st.x + st.w * 0.5;
        const groundOutY = st.upDir === 'up' ? st.y + st.h + 58 : st.y - 58;
        const upperOutY = st.upDir === 'up' ? st.y - 58 : st.y + st.h + 58;
        const targetOutY = mem.stairCommit.targetFloor === 1 ? upperOutY : groundOutY;

        if (bFloor === mem.stairCommit.targetFloor && Math.abs(bot.y - targetOutY) < 26) {
          mem.stairCommit = null;
          this.botPaths.delete(bot.id);
        } else {
          // Guide smoothly toward stair centerline X, then cleanly out to target floor mouth
          const insideStairX = Math.abs(bot.x - cx) < 16;
          const stepGoalX = cx;
          const stepGoalY = insideStairX
            ? targetOutY
            : (bFloor === 0 ? groundOutY : upperOutY);
          const ang = Math.atan2(stepGoalY - bot.y, stepGoalX - bot.x);
          bot.aiTargetAngle = ang;
          bot.aiMoveRatio = monsterBeingTargeted && monsterDist < 290 ? 0.96 : inHearing ? stealthWalkRatio : 0.88;
        }
      }
    }

    if (!mem.stairCommit) {
      if (mem.unstickTimer > 0 && !urgentLibTntEscape && !monsterBeingTargeted) {
        bot.aiTargetAngle = mem.unstickAngle;
        bot.aiMoveRatio = inHearing ? stealthWalkRatio : 0.92;
      } else if (Math.hypot(evadeX, evadeY) > 0.35) {
        const rawEvade = Math.atan2(evadeY, evadeX);
        bot.aiTargetAngle = this.pickClearMoveAngle(
          bot,
          rawEvade,
          74,
          bot.aiStrafeDir,
          diff !== 'CHILL' && !urgentLibTntEscape,
          diff === 'RUTHLESS' && !urgentLibTntEscape
        );
        // Strictly stay quiet inside Figure's hearing circle unless Figure is actively chasing close!
        const activeChase = monsterBeingTargeted && m.mode === 'rage' && monsterDist < 310;
        bot.aiMoveRatio = activeChase || urgentLibTntEscape ? 0.98 : inHearing ? stealthWalkRatio : 0.88;
      } else {
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
          safeWalkRatio = 1.0;
        } else if (inHearing) {
          safeWalkRatio = diff === 'CHILL' && Math.random() < 0.04 ? 0.98 : stealthWalkRatio;
        }

        if (bot.aiThinkTimer <= 0) {
          bot.aiThinkTimer = diff === 'RUTHLESS' ? 0.18 : 0.25;
          let goalX = this.map.width * 0.5;
          let goalY = this.map.height * 0.5;
          let goalFloor: FloorLevel = bFloor;

          const medkitMaxDist =
            diff === 'RUTHLESS'
              ? bot.hp <= 74
                ? 9999
                : bot.hp < 92
                  ? 340
                  : 0
              : diff === 'TACTICAL'
                ? bot.hp <= 64
                  ? 9999
                  : bot.hp < 86
                    ? 230
                    : 0
                : bot.hp <= 45
                  ? 9999
                  : 0;
          const medkitTarget =
            medkitMaxDist > 0
              ? this.pickups
                  .filter(
                    (p) =>
                      p.kind === 'medkit' &&
                      sameFloor(p.floor, bFloor) &&
                      dist(bot.x, bot.y, p.x, p.y) <= medkitMaxDist &&
                      this.canBotSeePoint(bot, p.x, p.y, bFloor, true) &&
                      (diff !== 'RUTHLESS' ||
                        this.evaluatePickupForRuthless(bot, p, visibleRivals, bFloor).safe)
                  )
                  .sort((a, b) => dist(bot.x, bot.y, a.x, a.y) - dist(bot.x, bot.y, b.x, b.y))[0]
              : undefined;
          const ammoWant = diff === 'RUTHLESS' ? 2 : diff === 'TACTICAL' ? 1 : 0;
          const visibleAmmoPickups =
            bot.ammo < ammoWant
              ? this.pickups
                  .filter(
                    (p) =>
                      p.kind === 'bullet' &&
                      sameFloor(p.floor, bFloor) &&
                      this.canBotSeePoint(bot, p.x, p.y, bFloor, true)
                  )
                  .sort((a, b) => dist(bot.x, bot.y, a.x, a.y) - dist(bot.x, bot.y, b.x, b.y))
              : [];
          const ammoTarget =
            diff !== 'RUTHLESS'
              ? visibleAmmoPickups[0]
              : visibleAmmoPickups.find((p) => this.evaluatePickupForRuthless(bot, p, visibleRivals, bFloor).safe);

          if (medkitTarget) {
            goalX = medkitTarget.x;
            goalY = medkitTarget.y;
            goalFloor = bFloor;
          } else if (ammoTarget && (!prog || prog.collectedCount < LIBRARY_BOOKS_PER_PLAYER)) {
            goalX = ammoTarget.x;
            goalY = ammoTarget.y;
            goalFloor = bFloor;
          } else if (prog && prog.collectedCount < LIBRARY_BOOKS_PER_PLAYER) {
            // Goal lock hysteresis: prevents flipping book targets when floor changes!
            let chosenBook = prog.books.find((b) => b.id === mem.lockedGoalBookId && !b.collected);
            if (!chosenBook || mem.goalLockTimer <= 0) {
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
              chosenBook = remaining[0];
              if (chosenBook) {
                mem.lockedGoalBookId = chosenBook.id;
                mem.goalLockTimer = 3.2;
              }
            }
            if (chosenBook) {
              const app = this.getBookApproachPoint(chosenBook);
              goalX = app.x;
              goalY = app.y;
              goalFloor = chosenBook.floor;
            }
          } else if (door) {
            const outX = door.side === 'W' ? door.x - 58 : door.side === 'E' ? door.x + 58 : door.x;
            const outY = door.side === 'N' ? door.y - 58 : door.side === 'S' ? door.y + 58 : door.y;
            goalX = outX;
            goalY = outY;
            goalFloor = 0;
          }

          // Check if stepping onto a stair heading to goalFloor !== bFloor -> lock stairCommit!
          if (goalFloor !== bFloor) {
            for (const st of this.map.stairs ?? []) {
              const cx = st.x + st.w * 0.5;
              const entryY =
                bFloor === 0
                  ? st.upDir === 'up'
                    ? st.y + st.h + 26
                    : st.y - 26
                  : st.upDir === 'up'
                    ? st.y - 26
                    : st.y + st.h + 26;
              if (dist(bot.x, bot.y, cx, entryY) < 76) {
                mem.stairCommit = { stairId: st.id, targetFloor: goalFloor, timer: 4.0 };
                break;
              }
            }
          }

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
              const libThreats: Array<{ x: number; y: number; floor: FloorLevel; radius: number; penalty: number }> = [];
              if (m.stunTimer <= 0) {
                libThreats.push({
                  x: m.x,
                  y: m.y,
                  floor: m.floor,
                  radius: 250,
                  penalty: 1200,
                });
              }
              const nodes = this.findNavPathOnGraph(this.botNavNodes, bot.x, bot.y, bFloor, goalX, goalY, goalFloor, {
                avoidHazards: diff !== 'CHILL',
                avoidThreats: libThreats,
              });
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
    }

    // Fair-play joystick coupling: Library bots also face their movement direction and flick via applyAnalogInput
    if (bot.ammo <= 0 || bot.aiHoldShotTimer > 0) {
      mem.pendingShotAngle = null;
      mem.pendingShotExpire = 0;
    } else if (mem.pendingShotAngle !== null) {
      const libFleeConflict =
        ((urgentLibTntEscape || monsterBeingTargeted) &&
          Math.abs(normalizeAngle(mem.pendingShotAngle - bot.aiTargetAngle)) > 0.85) ||
        (Math.hypot(evadeX, evadeY) > 0.9 && Math.abs(normalizeAngle(mem.pendingShotAngle - bot.angle)) > 0.45);
      if (libFleeConflict) {
        mem.pendingShotAngle = null;
        mem.pendingShotExpire = 0;
      }
    }

    let stickAngle = bot.aiTargetAngle;
    let stickMagnitude = bot.aiMoveRatio > 0.01 ? 0.08 + clamp(bot.aiMoveRatio, 0, 1) * 0.92 : 0;

    if (this.config.extraDark && mem.pendingShotAngle === null && !monsterBeingTargeted && bot.aiMoveRatio > 0.25 && diff !== 'CHILL') {
      stickAngle = normalizeAngle(stickAngle + Math.sin(mem.scanPhase) * 0.2);
    }

    if (mem.pendingShotAngle !== null) {
      stickAngle = mem.pendingShotAngle;
      const turnDelta = Math.abs(normalizeAngle(mem.pendingShotAngle - bot.aiTargetAngle));
      if (turnDelta <= 0.55 && !urgentLibTntEscape && !monsterBeingTargeted && bot.aiMoveRatio > 0.05) {
        const flickRatio = clamp(Math.min(bot.aiMoveRatio, 0.88), 0, 1);
        stickMagnitude = 0.08 + flickRatio * 0.92;
      } else {
        stickMagnitude = 0.07;
      }
    }

    this.applyAnalogInput(bot, stickMagnitude > 0, stickAngle, stickMagnitude, dt);

    // Fire ONLY when tightly aligned, visibility holds, and shot won't self-bounce/hit boxes!
    const libFireTol = diff === 'RUTHLESS' ? 0.065 : diff === 'TACTICAL' ? 0.095 : 0.14;
    if (
      mem.pendingShotAngle !== null &&
      bot.ammo > 0 &&
      bot.aiHoldShotTimer <= 0 &&
      Math.abs(normalizeAngle(mem.pendingShotAngle - bot.angle)) <= libFireTol
    ) {
      let canFireNow = true;
      if (mem.pendingShotTargetId !== null) {
        const tgt = this.players.find((pl) => pl.id === mem.pendingShotTargetId && pl.alive);
        if (!mem.pendingShotIsTrick) {
          if (!tgt || !this.canBotSeePoint(bot, tgt.x, tgt.y, tgt.floor ?? 0)) {
            canFireNow = false;
          }
        } else if (!tgt || !this.isPointWithinImmersiveBounds(bot, tgt.x, tgt.y, false, false)) {
          canFireNow = false;
        }
      }
      if (
        canFireNow &&
        diff !== 'CHILL' &&
        !this.isShotSafeAtFire(bot, bot.angle, mem.pendingShotTargetId, mem.pendingShotIsTrick)
      ) {
        canFireNow = false;
      }
      mem.pendingShotAngle = null;
      mem.pendingShotExpire = 0;
      if (canFireNow) {
        this.fireBullet(bot);
        bot.aiHoldShotTimer =
          diff === 'RUTHLESS'
            ? visibleRivals.length > 0
              ? 0.22
              : 0.34
            : diff === 'TACTICAL'
              ? 0.85
              : 1.25;
      }
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
          isHuman: this.config.local2P ? p.isHuman : p.id === localPlayerId,
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
      immersive: this.isImmersiveMode(),
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
        postStunGraceTimer: Math.round((p.postStunGraceTimer ?? 0) * 100) / 100,
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
