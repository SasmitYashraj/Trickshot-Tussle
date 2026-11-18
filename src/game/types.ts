export type GameState = 'TITLE_MENU' | 'ONLINE_LOBBY' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type MatchMode = 'ELIMINATION' | 'BRAWL';

export type BotDifficulty = 'CHILL' | 'TACTICAL' | 'RUTHLESS';

export type ControlScheme = 'CURSOR_SPACE' | 'DRAG_STICK';

export type MapId =
  | 'crossroads'
  | 'pillars'
  | 'bunkers'
  | 'immersive_mansion'
  | 'immersive_outdoors';

export type FloorTheme = 'mansion_wood' | 'grass_outdoors' | 'maple_cargo';

export type ObstacleKind =
  | 'perimeter_wood'
  | 'perimeter_hedge'
  | 'perimeter_steel'
  | 'metal'
  | 'sofa'
  | 'bed'
  | 'table'
  | 'bookshelf'
  | 'tree'
  | 'rock'
  | 'hedge';

export interface Vec2 {
  x: number;
  y: number;
}

export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: ObstacleKind;
  accent?: string;
}

export interface CardboardBox {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  age: number;
  state: 'spawning' | 'active' | 'punctured' | 'fading';
  stateTimer: number;
}

export interface ArenaMap {
  id: MapId;
  name: string;
  description: string;
  width: number;
  height: number;
  immersive: boolean;
  floorTheme: FloorTheme;
  walls: WallRect[];
  spawns: Vec2[];
}

export interface Player {
  id: number;
  name: string;
  isHuman: boolean;
  isRemote?: boolean;
  color: string;
  accentColor: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  ammo: number;
  maxAmmo: number;
  stunTimer: number;
  hurtFlashTimer: number;
  respawnTimer: number;
  spawnInvulnTimer: number;
  alive: boolean;
  kills: number;
  deaths: number;
  damageDealt: number;
  shotsFired: number;
  shotsHit: number;
  lastHitBy: number | null;
  remoteActive: boolean;
  remoteAngle: number;
  remoteMoveAngle: number;
  remoteAimActive?: boolean;
  remoteMagnitude: number;
  aiStrafeDir: number;
  aiThinkTimer: number;
  aiTargetAngle: number;
  aiMoveRatio: number;
  aiHoldShotTimer: number;
}

export interface Bullet {
  id: number;
  ownerId: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  bouncesLeft: number;
  maxBounces: number;
  age: number;
  maxAge: number;
  trail: Vec2[];
}

export type PickupKind = 'bullet' | 'nitro' | 'tnt' | 'medkit';

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  radius: number;
  age: number;
  countdown?: number;
  maxCountdown?: number;
  lastTickSecond?: number;
}

export interface Explosion {
  id: number;
  x: number;
  y: number;
  radius: number;
  age: number;
  duration: number;
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  age: number;
  duration: number;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  duration: number;
}

export type EngineEventType =
  | 'shoot'
  | 'pickup'
  | 'heal'
  | 'bounce'
  | 'hit'
  | 'explosion'
  | 'tnt_tick'
  | 'knockout'
  | 'victory';

export interface EngineEvent {
  type: EngineEventType;
  x: number;
  y: number;
  value?: number;
}

export interface JoystickState {
  active: boolean;
  pointerId: number | null;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  maxRadius: number;
  dx: number;
  dy: number;
  magnitude: number;
  angle: number;
}

export interface HudPlayerSnapshot {
  id: number;
  name: string;
  isHuman: boolean;
  color: string;
  hp: number;
  maxHp: number;
  ammo: number;
  maxAmmo: number;
  alive: boolean;
  stunTimer: number;
  respawnTimer: number;
  kills: number;
  deaths: number;
  damageDealt: number;
}

export interface MatchConfig {
  mode: MatchMode;
  mapId: MapId;
  difficulty: BotDifficulty;
  targetKills: number;
  immersive: boolean;
  extraDark?: boolean;
  fillBots?: boolean;
}

export interface GameSnapshot {
  players: HudPlayerSnapshot[];
  elapsedTime: number;
  activeBullets: number;
  winnerId: number | null;
  winnerReason: string;
}

export interface OnlineLobbySlot {
  slot: number;
  name: string;
  color: string;
  occupied: boolean;
  isBot: boolean;
  isHost: boolean;
}

export interface OnlineRoomState {
  code: string;
  phase: 'LOBBY' | 'PLAYING' | 'GAME_OVER';
  mySlot: number;
  hostSlot: number;
  config: MatchConfig;
  slots: OnlineLobbySlot[];
}

export interface WorldSyncState {
  mapId: MapId;
  immersive: boolean;
  extraDark: boolean;
  elapsedTime: number;
  screenShake: number;
  winnerId: number | null;
  winnerReason: string;
  players: Array<{
    id: number;
    name: string;
    color: string;
    accentColor: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    hp: number;
    maxHp: number;
    ammo: number;
    maxAmmo: number;
    stunTimer: number;
    hurtFlashTimer: number;
    respawnTimer: number;
    spawnInvulnTimer: number;
    alive: boolean;
    kills: number;
    deaths: number;
    damageDealt: number;
  }>;
  bullets: Bullet[];
  pickups: Pickup[];
  boxes: CardboardBox[];
  explosions: Explosion[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  events: EngineEvent[];
}

export const ARENA_WALL_THICKNESS = 24;

export const IMMERSIVE_VIEW_WIDTH = 1060;
export const IMMERSIVE_VIEW_HEIGHT = 740;

export const PLAYER_RADIUS = 42;
export const PLAYER_MAX_SPEED = 245;
export const PLAYER_MAX_ACCEL = 1950;
export const PLAYER_MAX_HP = 100;
export const PLAYER_MAX_AMMO = 5;

export const BULLET_SPEED = 860;
export const BULLET_RADIUS = 10;
export const BULLET_DAMAGE = 33;
export const BULLET_MAX_BOUNCES = 5;
export const BULLET_MAX_AGE = 5.0;
export const BULLET_SELF_GRACE = 0.14;

export const NITRO_RADIUS = 26;
export const NITRO_BLAST_RADIUS = 135;
export const NITRO_DAMAGE = 33;

export const TNT_RADIUS = 32;
export const TNT_BLAST_RADIUS = 170;
export const TNT_COUNTDOWN = 3.0;
export const TNT_DAMAGE = 45;

export const MEDKIT_RADIUS = 22;
export const MEDKIT_HEAL = 35;

export const PICKUP_BULLET_RADIUS = 20;

export const CARDBOARD_SIZE = 74;
export const CARDBOARD_FADE_IN = 0.36;
export const CARDBOARD_PUNCTURE_FRAME = 0.11;
export const CARDBOARD_FADE_OUT = 0.34;

export const STUN_DURATION = 0.85;
export const RESPAWN_DELAY = 2.6;
export const SPAWN_INVULN_DURATION = 0.85;
