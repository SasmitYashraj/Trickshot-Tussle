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

export type ModifierLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface MatchModifiers {
  bulletSpawn: ModifierLevel;
  nitroSpawn: ModifierLevel;
  tntSpawn: ModifierLevel;
  medkitSpawn: ModifierLevel;
  playerSpeed: ModifierLevel;
  turnSpeed: ModifierLevel;
  bulletSpeed: ModifierLevel;
  bulletCapacity: ModifierLevel;
  stunTime: ModifierLevel;
  spawnProtection: ModifierLevel;
  keepBulletsOnStun: boolean;
  postStunGrace: boolean;
}

export const DEFAULT_MATCH_MODIFIERS: MatchModifiers = {
  bulletSpawn: 'MEDIUM',
  nitroSpawn: 'MEDIUM',
  tntSpawn: 'MEDIUM',
  medkitSpawn: 'MEDIUM',
  playerSpeed: 'MEDIUM',
  turnSpeed: 'MEDIUM',
  bulletSpeed: 'MEDIUM',
  bulletCapacity: 'MEDIUM',
  stunTime: 'MEDIUM',
  spawnProtection: 'MEDIUM',
  keepBulletsOnStun: true,
  postStunGrace: true,
};

export type PlayerSkinFinish =
  | 'solid'
  | 'matte'
  | 'fish_scale'
  | 'wood'
  | 'metal'
  | 'animated_sparkle'
  | 'magma'
  | 'synthwave'
  | 'toxic_slime'
  | 'billiard_stripe'
  | 'two_tone'
  | 'racing_stripe'
  | 'carbon_fiber'
  | 'frosted_ice'
  | 'oil_slick'
  | 'plasma_core'
  | 'galaxy'
  | 'amber_fossil'
  | 'molten_cracks'
  | 'cyber_matrix'
  | 'electric_arc'
  | 'mummy'
  | 'camo'
  | 'hazard'
  | 'damascus'
  | 'hologram'
  | 'kintsugi';

export type LibraryBookFace = 'N' | 'S' | 'E' | 'W';

export interface LibraryBookSpot {
  id: number;
  x: number;
  y: number;
  floor: FloorLevel;
  face?: LibraryBookFace;
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
  slowTimer?: number;
  speedRatio?: number;
  rageTimer: number;
  rageFadeTimer: number;
  reachedHoldTimer: number;
  targetX: number;
  targetY: number;
  targetFloor: FloorLevel;
  transitioning?: boolean;
  fromFloor?: FloorLevel;
  toFloor?: FloorLevel;
  transitionProgress?: number;
}

export interface LibraryPlayerProgress {
  playerId: number;
  collectedCount: number;
  books: LibraryBookSpot[];
  clues: LibraryClue[];
  codeDigits: number[];
  unlocked: boolean;
  escapedRank?: number | null;
  hearts?: number;
  eliminated?: boolean;
}

export interface LibraryMatchState {
  pillarSequence: LibraryShape[];
  totalCollectedAll: number;
  introTimer: number;
  escapedOrder: number[];
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
  finish?: PlayerSkinFinish;
}

export const PLAYER_COLOR_PALETTE: PlayerColorOption[] = [
  { id: 'cobalt', name: 'Cobalt', color: '#0EA5E9', accentColor: '#7DD3FC', finish: 'solid' },
  { id: 'crimson', name: 'Crimson', color: '#EF4444', accentColor: '#FCA5A5', finish: 'solid' },
  { id: 'volt', name: 'Volt', color: '#FACC15', accentColor: '#FEF08A', finish: 'solid' },
  { id: 'jade', name: 'Jade', color: '#22C55E', accentColor: '#86EFAC', finish: 'solid' },
  { id: 'violet', name: 'Violet', color: '#A855F7', accentColor: '#D8B4FE', finish: 'solid' },
  { id: 'orange', name: 'Blaze', color: '#F97316', accentColor: '#FDBA74', finish: 'solid' },
  { id: 'magenta', name: 'Nova', color: '#EC4899', accentColor: '#F9A8D4', finish: 'solid' },
  { id: 'cyan', name: 'Glacier', color: '#06B6D4', accentColor: '#A5F3FC', finish: 'solid' },
  { id: 'coral', name: 'Coral', color: '#FB7185', accentColor: '#FECDD3', finish: 'solid' },
  { id: 'lime', name: 'Acid Lime', color: '#84CC16', accentColor: '#D9F99D', finish: 'solid' },
  { id: 'matte_obsidian', name: 'Matte Obsidian', color: '#1F2028', accentColor: '#38BDF8', finish: 'matte' },
  { id: 'deep_crimson', name: 'Deep Crimson', color: '#881337', accentColor: '#FDA4AF', finish: 'solid' },
  { id: 'midnight_indigo', name: 'Midnight Indigo', color: '#1E1B4B', accentColor: '#FDE047', finish: 'solid' },
  { id: 'grad_magma', name: 'Magma', color: '#EA580C', accentColor: '#FDBA74', finish: 'magma' },
  { id: 'grad_synthwave', name: 'Synthwave', color: '#EC4899', accentColor: '#22D3EE', finish: 'synthwave' },
  { id: 'grad_toxic', name: 'Toxic Slime', color: '#65A30D', accentColor: '#BEF264', finish: 'toxic_slime' },
  { id: 'scale_crimson', name: 'Crimson Scales', color: '#DC2626', accentColor: '#FCA5A5', finish: 'fish_scale' },
  { id: 'scale_cobalt', name: 'Cobalt Scales', color: '#0284C7', accentColor: '#7DD3FC', finish: 'fish_scale' },
  { id: 'scale_jade', name: 'Jade Scales', color: '#16A34A', accentColor: '#86EFAC', finish: 'fish_scale' },
  { id: 'scale_gold', name: 'Gold Scales', color: '#D97706', accentColor: '#FDE047', finish: 'fish_scale' },
  { id: 'wood_oak', name: 'Timber Oak', color: '#92400E', accentColor: '#F59E0B', finish: 'wood' },
  { id: 'metal_chrome', name: 'Brushed Chrome', color: '#94A3B8', accentColor: '#F1F5F9', finish: 'metal' },
  { id: 'sparkle_gold', name: 'Starlight Gold', color: '#F59E0B', accentColor: '#FEF08A', finish: 'animated_sparkle' },
  { id: 'pat_billiard', name: 'Billiard Stripe', color: '#2563EB', accentColor: '#FEF08A', finish: 'billiard_stripe' },
  { id: 'pat_twotone', name: 'Two-Tone Split', color: '#0284C7', accentColor: '#BAE6FD', finish: 'two_tone' },
  { id: 'pat_racing', name: 'Racing Stripe', color: '#DC2626', accentColor: '#F8FAFC', finish: 'racing_stripe' },
  { id: 'pat_carbon', name: 'Carbon Fiber', color: '#27272A', accentColor: '#38BDF8', finish: 'carbon_fiber' },
  { id: 'pat_frosted', name: 'Frosted Ice', color: '#7DD3FC', accentColor: '#E0F2FE', finish: 'frosted_ice' },
  { id: 'pat_oil_slick', name: 'Oil Slick', color: '#312E81', accentColor: '#2DD4BF', finish: 'oil_slick' },
  { id: 'pat_plasma', name: 'Plasma Core', color: '#3B0764', accentColor: '#E879F9', finish: 'plasma_core' },
  { id: 'pat_galaxy', name: 'Galaxy Nebula', color: '#1E1B4B', accentColor: '#C084FC', finish: 'galaxy' },
  { id: 'pat_amber', name: 'Amber Fossil', color: '#D97706', accentColor: '#FEF08A', finish: 'amber_fossil' },
  { id: 'shader_molten', name: 'Molten Cracks', color: '#292524', accentColor: '#FB923C', finish: 'molten_cracks' },
  { id: 'shader_cyber', name: 'Cyber Matrix', color: '#052E16', accentColor: '#4ADE80', finish: 'cyber_matrix' },
  { id: 'shader_electric', name: 'Electric Arc', color: '#0C4A6E', accentColor: '#7DD3FC', finish: 'electric_arc' },
  { id: 'mashup_mummy', name: 'Mummy Wraps', color: '#D6D3D1', accentColor: '#FDE047', finish: 'mummy' },
  { id: 'mashup_camo', name: 'Camo Tactical', color: '#3F6212', accentColor: '#BEF264', finish: 'camo' },
  { id: 'mashup_hazard', name: 'Hazard Test', color: '#EAB308', accentColor: '#FEF08A', finish: 'hazard' },
  { id: 'mat_damascus', name: 'Damascus Steel', color: '#64748B', accentColor: '#E2E8F0', finish: 'damascus' },
  { id: 'mat_hologram', name: 'Hologram', color: '#06B6D4', accentColor: '#A5F3FC', finish: 'hologram' },
  { id: 'mat_kintsugi', name: 'Kintsugi Porcelain', color: '#E7E5E4', accentColor: '#F59E0B', finish: 'kintsugi' },
];

export interface Player {
  id: number;
  name: string;
  team?: number;
  isHuman: boolean;
  isRemote?: boolean;
  color: string;
  accentColor: string;
  finish?: PlayerSkinFinish;
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
  postStunGraceTimer?: number;
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
  kind?: 'nitro' | 'tnt';
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
  isSmoke?: boolean;
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
  accentColor?: string;
  finish?: PlayerSkinFinish;
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
  hearts?: number;
  escapedRank?: number | null;
  eliminated?: boolean;
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
  modifiers?: MatchModifiers;
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
  finish?: PlayerSkinFinish;
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
  modifiers?: MatchModifiers;
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
    finish?: PlayerSkinFinish;
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
    postStunGraceTimer?: number;
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
export const PLAYER_TURN_SPEED = 10.0;
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
export const POST_STUN_GRACE_DURATION = 0.5;
export const RESPAWN_DELAY = 2.6;
export const SPAWN_INVULN_DURATION = 1.5;
export const KILL_STREAK_WINDOW = 3.0;

export const MONSTER_RADIUS = PLAYER_RADIUS * 1.5;
export const MONSTER_STUN_DURATION = 15.0;
export const MONSTER_SLOW_DURATION = 5.0;
export const LIBRARY_BRAWL_MAX_HEARTS = 8;
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
