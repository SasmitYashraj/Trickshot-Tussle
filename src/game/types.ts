export type GameState = 'TITLE_MENU' | 'ONLINE_LOBBY' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type MatchMode = 'ELIMINATION' | 'BRAWL';

export type TeamMode = 'FFA' | '2V2';

export type BotDifficulty = 'CHILL' | 'TACTICAL' | 'RUTHLESS';

export type ControlScheme = 'CURSOR_SPACE' | 'DRAG_STICK';

export type MapId =
  | 'crossroads'
  | 'pillars'
  | 'bunkers'
  | 'winter_tussle'
  | 'immersive_mansion'
  | 'immersive_outdoors'
  | 'library';

export type FloorTheme =
  | 'mansion_wood'
  | 'grass_outdoors'
  | 'maple_cargo'
  | 'winter_snow'
  | 'library_wood';

export type ObstacleKind =
  | 'perimeter_wood'
  | 'perimeter_hedge'
  | 'perimeter_steel'
  | 'perimeter_ice'
  | 'metal'
  | 'sofa'
  | 'bed'
  | 'table'
  | 'bookshelf'
  | 'tree'
  | 'pine_tree'
  | 'rock'
  | 'hedge'
  | 'library_pillar'
  | 'mezzanine_rail'
  | 'stair_rail';

export interface Vec2 {
  x: number;
  y: number;
}

export type FloorLevel = 0 | 1;

export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: ObstacleKind;
  accent?: string;
  floor?: FloorLevel;
}

export type LibraryShape =
  | 'circle'
  | 'triangle'
  | 'square'
  | 'diamond'
  | 'star'
  | 'pentagon'
  | 'hexagon'
  | 'cross';

export interface LibraryStair {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Direction going UP from Ground (floor 0) to Upper Mezzanine (floor 1) */
  upDir: 'up' | 'down' | 'left' | 'right';
}

export interface LibraryZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LibraryDoor {
  playerId: number;
  side: 'N' | 'E' | 'S' | 'W';
  x: number;
  y: number;
}

export interface LibraryClue {
  shape: LibraryShape;
  digit: number;
}

export interface LibraryBookSpot {
  id: number;
  x: number;
  y: number;
  floor: FloorLevel;
  collected: boolean;
}

export interface LibraryMonsterState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  floor: FloorLevel;
  radius: number;
  mode: 'calm' | 'rage';
  stunTimer: number;
  rageTimer: number;
  rageFadeTimer: number;
  reachedHoldTimer: number;
  targetX: number;
  targetY: number;
  targetFloor: FloorLevel;
}

export interface LibraryPlayerProgress {
  playerId: number;
  collectedCount: number;
  books: LibraryBookSpot[];
  clues: LibraryClue[];
  codeDigits: number[];
  unlocked: boolean;
}

export interface LibraryMatchState {
  pillarSequence: LibraryShape[];
  totalCollectedAll: number;
  introTimer: number;
  monster: LibraryMonsterState;
  playerProgress: LibraryPlayerProgress[];
  doors: LibraryDoor[];
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
  floor?: FloorLevel;
  lastPusherId?: number | null;
  state: 'spawning' | 'active' | 'punctured' | 'fading';
  stateTimer: number;
}

export interface IcePit {
  id: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  points?: Vec2[];
  broken: boolean;
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
  icePits?: Array<{ x: number; y: number; rx: number; ry: number; points?: Vec2[] }>;
  upperZones?: LibraryZone[];
  stairs?: LibraryStair[];
  pillarCenter?: Vec2;
}

export interface PlayerColorOption {
  id: string;
  name: string;
  color: string;
  accentColor: string;
}

export const PLAYER_COLOR_PALETTE: PlayerColorOption[] = [
  { id: 'cobalt', name: 'Cobalt', color: '#0EA5E9', accentColor: '#7DD3FC' },
  { id: 'crimson', name: 'Crimson', color: '#EF4444', accentColor: '#FCA5A5' },
  { id: 'volt', name: 'Volt', color: '#FACC15', accentColor: '#FEF08A' },
  { id: 'jade', name: 'Jade', color: '#22C55E', accentColor: '#86EFAC' },
  { id: 'violet', name: 'Violet', color: '#A855F7', accentColor: '#D8B4FE' },
  { id: 'orange', name: 'Blaze', color: '#F97316', accentColor: '#FDBA74' },
  { id: 'magenta', name: 'Nova', color: '#EC4899', accentColor: '#F9A8D4' },
];

export interface Player {
  id: number;
  name: string;
  team?: number;
  isHuman: boolean;
  isRemote?: boolean;
  color: string;
  accentColor: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  floor?: FloorLevel;
  stairBlend?: number;
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
  floor?: FloorLevel;
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
  floor?: FloorLevel;
  vx?: number;
  vy?: number;
  armed?: boolean;
  ownerId?: number | null;
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
  floor?: FloorLevel;
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
  floor?: FloorLevel;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  duration: number;
  floor?: FloorLevel;
}

export type EngineEventType =
  | 'shoot'
  | 'pickup'
  | 'heal'
  | 'bounce'
  | 'hit'
  | 'explosion'
  | 'tnt_tick'
  | 'splash'
  | 'knockout'
  | 'killstreak'
  | 'self_kill'
  | 'victory'
  | 'book_collect'
  | 'monster_step'
  | 'monster_roar'
  | 'monster_stun'
  | 'monster_kill'
  | 'lock_dial'
  | 'lock_error'
  | 'door_unlock';

export interface EngineEvent {
  type: EngineEventType;
  x: number;
  y: number;
  value?: number;
  playerId?: number;
  floor?: FloorLevel;
  mode?: MatchMode;
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
  team?: number;
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
  teamMode?: TeamMode;
  mapId: MapId;
  difficulty: BotDifficulty;
  targetKills: number;
  immersive: boolean;
  extraDark?: boolean;
  fillBots?: boolean;
  playerColorId?: string;
}

export interface GameSnapshot {
  players: HudPlayerSnapshot[];
  elapsedTime: number;
  activeBullets: number;
  teamMode?: TeamMode;
  winnerId: number | null;
  winnerTeam?: number | null;
  winnerReason: string;
}

export interface OnlineLobbySlot {
  slot: number;
  name: string;
  color: string;
  colorId: string;
  team: number;
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
  teamMode?: TeamMode;
  elapsedTime: number;
  screenShake: number;
  winnerId: number | null;
  winnerTeam?: number | null;
  winnerReason: string;
  libraryState?: LibraryMatchState;
  players: Array<{
    id: number;
    name: string;
    team?: number;
    color: string;
    accentColor: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    floor?: FloorLevel;
    stairBlend?: number;
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
  icePits: IcePit[];
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
export const PLAYER_TURN_SPEED = 17;
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

export const CARDBOARD_SIZE = 64;
export const CARDBOARD_FADE_IN = 0.36;
export const CARDBOARD_PUNCTURE_FRAME = 0.11;
export const CARDBOARD_FADE_OUT = 0.34;

export const STUN_DURATION = 0.85;
export const RESPAWN_DELAY = 2.6;
export const SPAWN_INVULN_DURATION = 0.85;
export const KILL_STREAK_WINDOW = 3.0;

export const MONSTER_RADIUS = PLAYER_RADIUS * 1.5;
export const MONSTER_STUN_DURATION = 15.0;
export const LIBRARY_HEARING_RADIUS = 900;
export const LIBRARY_BOOKS_PER_PLAYER = 8;
export const LIBRARY_CODE_LEN = 5;
export const LIBRARY_INTRO_DURATION = 5.0;
export const LIBRARY_SHAPES: LibraryShape[] = [
  'circle',
  'triangle',
  'square',
  'diamond',
  'star',
  'pentagon',
  'hexagon',
  'cross',
];
