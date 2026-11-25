import { ARENA_MAPS } from './maps';
import winterSnowTexUrl from '../assets/images/winter_snow_texture_1795248731633.jpg';
import winterIceTexUrl from '../assets/images/winter_ice_texture_1795248731782.jpg';
import meadowGrassTexUrl from '../assets/images/meadow_grass_texture_1795250465573.jpg';
import groveGrassTexUrl from '../assets/images/grove_grass_texture_1795250465761.jpg';
import manorOakTexUrl from '../assets/images/manor_oak_floor_1795254226990.jpg';
import mansionDarkWoodTexUrl from '../assets/images/mansion_dark_wood_1795254194773.jpg';
import libraryMahoganyFloorTexUrl from '../assets/images/library_mahogany_floor_1795256793301.jpg';
import libraryVelvetCarpetTexUrl from '../assets/images/library_velvet_carpet_1795256792210.jpg';
import persianWoolWeaveTexUrl from '../assets/images/persian_wool_weave_1795256793884.jpg';
import cargoDeckTexUrl from '../assets/images/cargo_deck_texture_1795250466869.jpg';
import type {
  ArenaMap,
  Bullet,
  CardboardBox,
  ControlScheme,
  Explosion,
  FloatingText,
  FloorLevel,
  IcePit,
  JoystickState,
  LibraryBookSpot,
  LibraryMatchState,
  LibraryMonsterState,
  LibraryShape,
  MapId,
  Particle,
  Pickup,
  PlayerSkinFinish,
  PracticeTarget,
  TeamMode,
  WallRect,
} from './types';
import {
  CARDBOARD_FADE_IN,
  CARDBOARD_FADE_OUT,
  CARDBOARD_PUNCTURE_FRAME,
  IMMERSIVE_VIEW_HEIGHT,
  IMMERSIVE_VIEW_WIDTH,
  MONSTER_RADIUS,
  NITRO_BLAST_RADIUS,
  PLAYER_RADIUS,
  TNT_BLAST_RADIUS,
} from './types';

export interface RenderPlayer {
  id: number;
  name: string;
  team?: number;
  color: string;
  accentColor: string;
  finish?: PlayerSkinFinish;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  angle: number;
  floor?: FloorLevel;
  stairBlend?: number;
  hp: number;
  maxHp: number;
  ammo: number;
  stunTimer: number;
  postStunGraceTimer?: number;
  hurtFlashTimer: number;
  respawnTimer: number;
  spawnInvulnTimer: number;
  alive: boolean;
}

export interface RenderableWorld {
  mapId: MapId;
  immersive: boolean;
  extraDark?: boolean;
  teamMode?: TeamMode;
  elapsedTime: number;
  screenShake: number;
  libraryState?: LibraryMatchState;
  players: RenderPlayer[];
  bullets: Bullet[];
  pickups: Pickup[];
  boxes: CardboardBox[];
  practiceTargets?: PracticeTarget[];
  icePits?: IcePit[];
  explosions: Explosion[];
  particles: Particle[];
  floatingTexts: FloatingText[];
}

export interface CameraState {
  x: number;
  y: number;
  initialized: boolean;
  scale?: number;
}

export interface CursorOverlayState {
  controlScheme?: ControlScheme;
  cursorScreen?: { x: number; y: number } | null;
  hideJoystick?: boolean;
  spectateTargetId?: number | null;
  localPlayerIds?: number[];
  dt?: number;
}

export function getArenaViewTransform(
  map: ArenaMap,
  isImmersive: boolean,
  canvasWidth: number,
  canvasHeight: number,
  localPlayer: RenderPlayer | undefined,
  camera: CameraState,
  updateCamera = false,
  dt = 1 / 60,
  sharedPlayers?: RenderPlayer[]
): { scale: number; offsetX: number; offsetY: number } {
  if (isImmersive && localPlayer) {
    const landW = Math.max(canvasWidth, canvasHeight);
    const landH = Math.min(canvasWidth, canvasHeight);
    const baseScale = Math.min(
      Math.max(landW / IMMERSIVE_VIEW_WIDTH, landH / IMMERSIVE_VIEW_HEIGHT) * 0.92,
      Math.min(landW / 760, landH / 540)
    );

    let targetCamX = localPlayer.alive
      ? localPlayer.x
      : map.spawns[localPlayer.id]?.x ?? localPlayer.x;
    let targetCamY = localPlayer.alive
      ? localPlayer.y
      : map.spawns[localPlayer.id]?.y ?? localPlayer.y;
    let targetScale = baseScale;

    if (sharedPlayers && sharedPlayers.length > 1) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const sp of sharedPlayers) {
        if (sp.x < minX) minX = sp.x;
        if (sp.x > maxX) maxX = sp.x;
        if (sp.y < minY) minY = sp.y;
        if (sp.y > maxY) maxY = sp.y;
      }
      targetCamX = (minX + maxX) * 0.5;
      targetCamY = (minY + maxY) * 0.5;
      const spanW = Math.max(1, maxX - minX + 520);
      const spanH = Math.max(1, maxY - minY + 380);
      const fitBothScale = Math.min(canvasWidth / spanW, canvasHeight / spanH);
      const minMapScale = Math.min(canvasWidth / map.width, canvasHeight / map.height);
      targetScale = Math.max(minMapScale, Math.min(baseScale, fitBothScale));
    }

    let camX = camera.x;
    let camY = camera.y;
    let scale = camera.scale ?? targetScale;
    if (!camera.initialized) {
      camX = targetCamX;
      camY = targetCamY;
      scale = targetScale;
      if (updateCamera) {
        camera.x = camX;
        camera.y = camY;
        camera.scale = scale;
        camera.initialized = true;
      }
    } else if (updateCamera) {
      const safeDt = Math.min(0.05, Math.max(0.001, dt));
      const lerpAlpha = 1 - Math.exp(-10.5 * safeDt);
      camera.x += (targetCamX - camera.x) * lerpAlpha;
      camera.y += (targetCamY - camera.y) * lerpAlpha;
      const curScale = camera.scale ?? targetScale;
      camera.scale = curScale + (targetScale - curScale) * (1 - Math.exp(-7.0 * safeDt));
      camX = camera.x;
      camY = camera.y;
      scale = camera.scale;
    }

    const visHalfW = Math.min(map.width * 0.5, (canvasWidth * 0.5) / scale);
    const visHalfH = Math.min(map.height * 0.5, (canvasHeight * 0.5) / scale);
    const clampedCamX = Math.max(visHalfW - 16, Math.min(map.width - visHalfW + 16, camX));
    const clampedCamY = Math.max(visHalfH - 16, Math.min(map.height - visHalfH + 16, camY));

    return {
      scale,
      offsetX: canvasWidth * 0.5 - clampedCamX * scale,
      offsetY: canvasHeight * 0.5 - clampedCamY * scale,
    };
  }

  const scale = Math.min(canvasWidth / map.width, canvasHeight / map.height);
  return {
    scale,
    offsetX: (canvasWidth - map.width * scale) * 0.5,
    offsetY: (canvasHeight - map.height * scale) * 0.5,
  };
}

const floorCache = new Map<string, HTMLCanvasElement>();
const libraryMergedFloorCache = new Map<string, HTMLCanvasElement>();
const intactIceCache = new Map<string, HTMLCanvasElement>();
const staticObstaclesCache = new Map<string, HTMLCanvasElement>();
const staticAmbientCache = new Map<string, HTMLCanvasElement>();
const staticWallShadowsCache = new Map<string, HTMLCanvasElement>();
const staticWallShadowPolyCache = new Map<string, ShadowPolygon[]>();
const staticStairCache = new Map<string, HTMLCanvasElement>();
const staticLibraryPillarCache = new Map<string, HTMLCanvasElement>();
const bakedVolumetricBeamCache = new Map<
  string,
  { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }
>();
const glowSpriteCache = new Map<string, HTMLCanvasElement>();
const patternCache = new WeakMap<CanvasRenderingContext2D, Map<CanvasImageSource, CanvasPattern | null>>();
let sharedLightCanvas: HTMLCanvasElement | null = null;
let sharedBeamScratchCanvas: HTMLCanvasElement | null = null;
let sharedFogCanvas: HTMLCanvasElement | null = null;
let sharedWispCanvas: HTMLCanvasElement | null = null;
let sharedWaterCanvas: HTMLCanvasElement | null = null;
let sharedCarbonCanvas: HTMLCanvasElement | null = null;
let sharedWoodCrateCanvas: HTMLCanvasElement | null = null;
let sharedTntCrateCanvas: HTMLCanvasElement | null = null;
let sharedNitroCrateCanvas: HTMLCanvasElement | null = null;
let sharedCargoArmorCanvas: HTMLCanvasElement | null = null;
let sharedStoneTexCanvas: HTMLCanvasElement | null = null;
let sharedCarpetWeaveCanvas: HTMLCanvasElement | null = null;
let sharedMahoganyGrainCanvas: HTMLCanvasElement | null = null;
let sharedBookshelfVTileCanvas: HTMLCanvasElement | null = null;
let sharedBookshelfHTileCanvas: HTMLCanvasElement | null = null;
let sharedFireflySpriteCanvas: HTMLCanvasElement | null = null;
const sharedSkinTileCache = new Map<string, HTMLCanvasElement>();

function setBoundedCache<V>(cache: Map<string, V>, key: string, value: V, maxEntries = 6): void {
  if (cache.size >= maxEntries && !cache.has(key)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, value);
}

function getGlowSprite(
  key: string,
  radius: number,
  build: (gctx: CanvasRenderingContext2D, r: number) => void
): HTMLCanvasElement {
  const existing = glowSpriteCache.get(key);
  if (existing) return existing;
  const r = Math.max(4, Math.ceil(radius));
  const off = document.createElement('canvas');
  off.width = r * 2;
  off.height = r * 2;
  const gctx = off.getContext('2d');
  if (gctx) {
    gctx.translate(r, r);
    build(gctx, r);
  }
  setBoundedCache(glowSpriteCache, key, off, 64);
  return off;
}

function getCachedPattern(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource
): CanvasPattern | null {
  let map = patternCache.get(ctx);
  if (!map) {
    map = new Map();
    patternCache.set(ctx, map);
  }
  if (map.has(source)) {
    return map.get(source) ?? null;
  }
  const pat = ctx.createPattern(source, 'repeat');
  map.set(source, pat);
  return pat;
}

const loadedImageTextures = new Map<string, { img: HTMLImageElement; ready: boolean }>();

function getLazyTexture(key: string, url: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let entry = loadedImageTextures.get(key);
  if (!entry) {
    const img = new Image();
    entry = { img, ready: false };
    loadedImageTextures.set(key, entry);
    img.onload = () => {
      if (entry) entry.ready = true;
    };
    img.src = url;
  }
  return entry.ready && entry.img.complete && entry.img.naturalWidth > 0 ? entry.img : null;
}

function getWinterSnowTexture(): HTMLImageElement | null {
  return getLazyTexture('winter_snow', winterSnowTexUrl);
}

function getWinterIceTexture(): HTMLImageElement | null {
  return getLazyTexture('winter_ice', winterIceTexUrl);
}

function getLibraryFloorTexture(): HTMLImageElement | null {
  return getLazyTexture('library_mahogany', libraryMahoganyFloorTexUrl);
}

function getLibraryCarpetTexture(): HTMLImageElement | null {
  return getLazyTexture('library_velvet', libraryVelvetCarpetTexUrl);
}

function getPersianWoolTexture(): HTMLImageElement | null {
  return getLazyTexture('persian_wool', persianWoolWeaveTexUrl);
}

function getCarbonWeaveCanvas(): HTMLCanvasElement {
  if (sharedCarbonCanvas) return sharedCarbonCanvas;
  const off = document.createElement('canvas');
  off.width = 12;
  off.height = 12;
  const c = off.getContext('2d');
  if (c) {
    c.fillStyle = '#14161B';
    c.fillRect(0, 0, 12, 12);
    // 2x2 diagonal twill weave
    for (let y = 0; y < 12; y += 3) {
      for (let x = 0; x < 12; x += 6) {
        const shift = ((y / 3) % 2) * 3;
        const px = (x + shift) % 12;
        const g = c.createLinearGradient(px, y, px + 4, y + 3);
        g.addColorStop(0, '#4B5563');
        g.addColorStop(0.45, '#27272A');
        g.addColorStop(1, '#18181B');
        c.fillStyle = g;
        c.fillRect(px, y, 4, 2.5);
        c.fillStyle = 'rgba(255,255,255,0.14)';
        c.fillRect(px, y, 3, 0.8);
      }
    }
  }
  sharedCarbonCanvas = off;
  return off;
}

function getWoodCrateCanvas(): HTMLCanvasElement {
  if (sharedWoodCrateCanvas) return sharedWoodCrateCanvas;
  const s = 96;
  const off = document.createElement('canvas');
  off.width = s;
  off.height = s;
  const c = off.getContext('2d');
  if (c) {
    // Rich realistic timber crate matching map thumbnails
    c.fillStyle = '#5B3418';
    c.fillRect(0, 0, s, s);

    // Recessed inner plank slats
    const inset = 12;
    const inner = s - inset * 2;
    const plankCount = 4;
    const plankH = inner / plankCount;
    const plankTones = ['#9B6232', '#8E5629', '#A36A37', '#864F24'];
    for (let i = 0; i < plankCount; i++) {
      const py = inset + i * plankH;
      c.fillStyle = plankTones[i % plankTones.length];
      c.fillRect(inset, py, inner, plankH);

      // Subtle woodgrain fibers
      c.strokeStyle = 'rgba(54, 25, 8, 0.34)';
      c.lineWidth = 1;
      for (let g = 0; g < 3; g++) {
        const gy = py + 3 + g * 5;
        c.beginPath();
        c.moveTo(inset, gy);
        c.bezierCurveTo(inset + inner * 0.33, gy + (g % 2 === 0 ? 1.5 : -1.5), inset + inner * 0.66, gy - 1.2, inset + inner, gy + 0.5);
        c.stroke();
      }
      // Deep plank seam
      c.fillStyle = 'rgba(24, 10, 3, 0.72)';
      c.fillRect(inset, py + plankH - 1.4, inner, 1.4);
    }

    // Inner bevel shadow around slats
    const innerShade = c.createLinearGradient(inset, inset, inset + inner, inset + inner);
    innerShade.addColorStop(0, 'rgba(0,0,0,0.28)');
    innerShade.addColorStop(0.35, 'rgba(0,0,0,0)');
    innerShade.addColorStop(1, 'rgba(255,220,175,0.12)');
    c.fillStyle = innerShade;
    c.fillRect(inset, inset, inner, inner);

    // Diagonal cross-brace timber plank
    c.save();
    c.beginPath();
    c.rect(inset, inset, inner, inner);
    c.clip();
    c.translate(s * 0.5, s * 0.5);
    c.rotate(-Math.PI / 4);
    c.fillStyle = 'rgba(20, 8, 2, 0.45)';
    c.fillRect(-inner * 0.85, -7.5, inner * 1.7, 17);
    const braceG = c.createLinearGradient(0, -7, 0, 7);
    braceG.addColorStop(0, '#C78B4E');
    braceG.addColorStop(0.5, '#A66C36');
    braceG.addColorStop(1, '#78461E');
    c.fillStyle = braceG;
    c.fillRect(-inner * 0.85, -7, inner * 1.7, 14);
    c.fillStyle = 'rgba(255, 240, 210, 0.25)';
    c.fillRect(-inner * 0.85, -7, inner * 1.7, 2);
    c.restore();

    // Raised outer wooden frame rails (top, bottom, left, right)
    const drawFrame = (x: number, y: number, w: number, h: number, vert: boolean) => {
      const fg = c.createLinearGradient(x, y, vert ? x + w : x, vert ? y : y + h);
      fg.addColorStop(0, '#BA7F45');
      fg.addColorStop(0.5, '#925B2B');
      fg.addColorStop(1, '#5D3516');
      c.fillStyle = fg;
      c.fillRect(x, y, w, h);
    };
    drawFrame(0, 0, s, inset, false);
    drawFrame(0, s - inset, s, inset, false);
    drawFrame(0, inset, inset, inner, true);
    drawFrame(s - inset, inset, inset, inner, true);

    // Frame miter seams + top highlight & bottom ambient occlusion
    c.strokeStyle = 'rgba(25, 10, 3, 0.65)';
    c.lineWidth = 1.4;
    c.strokeRect(0.7, 0.7, s - 1.4, s - 1.4);
    c.strokeRect(inset, inset, inner, inner);
    c.fillStyle = 'rgba(255, 236, 198, 0.28)';
    c.fillRect(1, 1, s - 2, 2.2);
    c.fillStyle = 'rgba(20, 8, 2, 0.42)';
    c.fillRect(1, s - 3.2, s - 2, 2.2);

    // Iron nails at corners
    c.fillStyle = '#334155';
    for (const [nx, ny] of [
      [6, 6], [s - 6, 6], [6, s - 6], [s - 6, s - 6],
      [inset * 0.5, s * 0.5], [s - inset * 0.5, s * 0.5],
    ]) {
      c.beginPath();
      c.arc(nx, ny, 2.1, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(226, 232, 240, 0.45)';
      c.beginPath();
      c.arc(nx - 0.5, ny - 0.5, 0.8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#334155';
    }
  }
  sharedWoodCrateCanvas = off;
  return off;
}

function getTntCrateCanvas(): HTMLCanvasElement {
  if (sharedTntCrateCanvas) return sharedTntCrateCanvas;
  const s = 88;
  const off = document.createElement('canvas');
  off.width = s;
  off.height = s;
  const c = off.getContext('2d');
  if (c) {
    // Classic weathered crimson-wood TNT crate with iron bands and woodgrain staves
    c.fillStyle = '#5F1310';
    c.fillRect(0, 0, s, s);

    const inset = 9;
    const inner = s - inset * 2;
    const cols = 4;
    const colW = inner / cols;
    const reds = ['#B91C1C', '#991B1B', '#C2241F', '#A31C1A'];
    for (let i = 0; i < cols; i++) {
      const px = inset + i * colW;
      c.fillStyle = reds[i % reds.length];
      c.fillRect(px, inset, colW, inner);
      c.strokeStyle = 'rgba(40, 5, 4, 0.35)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(px + colW * 0.45, inset);
      c.lineTo(px + colW * 0.55, inset + inner);
      c.stroke();
      c.fillStyle = 'rgba(25, 3, 2, 0.72)';
      c.fillRect(px + colW - 1.4, inset, 1.4, inner);
    }

    // Top/bottom/side dark mahogany-red frame rails
    c.fillStyle = '#7F1D1D';
    c.fillRect(0, 0, s, inset);
    c.fillRect(0, s - inset, s, inset);
    c.fillRect(0, inset, inset, inner);
    c.fillRect(s - inset, inset, inset, inner);

    // Dark iron corner straps & rivets
    c.fillStyle = '#292524';
    c.fillRect(0, 12, s, 5);
    c.fillRect(0, s - 17, s, 5);
    c.strokeStyle = 'rgba(15, 4, 4, 0.85)';
    c.lineWidth = 1.6;
    c.strokeRect(0.8, 0.8, s - 1.6, s - 1.6);

    // Aged cream stencil label plate across the middle
    c.fillStyle = '#F5EBDC';
    c.fillRect(inset - 2, s * 0.5 - 14, inner + 4, 28);
    c.strokeStyle = '#3B120C';
    c.lineWidth = 1.6;
    c.strokeRect(inset - 2, s * 0.5 - 14, inner + 4, 28);

    // Top bevel sheen
    c.fillStyle = 'rgba(255, 220, 220, 0.22)';
    c.fillRect(2, 1.5, s - 4, 2.5);
    c.fillStyle = 'rgba(15, 3, 3, 0.4)';
    c.fillRect(2, s - 4, s - 4, 2.5);

    // Corner brass/steel pins
    c.fillStyle = '#D6D3D1';
    for (const [nx, ny] of [[5, 5], [s - 5, 5], [5, s - 5], [s - 5, s - 5]]) {
      c.beginPath();
      c.arc(nx, ny, 1.7, 0, Math.PI * 2);
      c.fill();
    }
  }
  sharedTntCrateCanvas = off;
  return off;
}

function getNitroCrateCanvas(): HTMLCanvasElement {
  if (sharedNitroCrateCanvas) return sharedNitroCrateCanvas;
  const s = 96;
  const off = document.createElement('canvas');
  off.width = s;
  off.height = s;
  const c = off.getContext('2d');
  if (c) {
    // Solid neon-green industrial Nitro container — ZERO outer glow!
    c.fillStyle = '#14532D';
    c.fillRect(0, 0, s, s);

    const frame = 7;
    const inner = s - frame * 2;
    const bodyG = c.createLinearGradient(0, frame, 0, s - frame);
    bodyG.addColorStop(0, '#4ADE80');
    bodyG.addColorStop(0.22, '#39FF14');
    bodyG.addColorStop(0.75, '#22C55E');
    bodyG.addColorStop(1, '#16A34A');
    c.fillStyle = bodyG;
    c.fillRect(frame, frame, inner, inner);

    // Compact horizontal industrial ribs tucked near top & bottom to maximize NITRO nameplate area
    c.fillStyle = 'rgba(5, 46, 22, 0.36)';
    c.fillRect(frame + 5, frame + 3, inner - 10, 4);
    c.fillRect(frame + 5, s - frame - 7, inner - 10, 4);

    // Dark gunmetal protective corner bumpers
    c.fillStyle = '#1E293B';
    const bLen = 17;
    c.fillRect(0, 0, bLen, 7);
    c.fillRect(0, 0, 7, bLen);
    c.fillRect(s - bLen, 0, bLen, 7);
    c.fillRect(s - 7, 0, 7, bLen);
    c.fillRect(0, s - 7, bLen, 7);
    c.fillRect(0, s - bLen, 7, bLen);
    c.fillRect(s - bLen, s - 7, bLen, 7);
    c.fillRect(s - 7, s - bLen, 7, bLen);

    // Subtle crisp bevel edge
    c.fillStyle = 'rgba(240, 253, 244, 0.42)';
    c.fillRect(frame, frame, inner, 2.2);
    c.strokeStyle = 'rgba(3, 31, 14, 0.72)';
    c.lineWidth = 1.8;
    c.strokeRect(0.9, 0.9, s - 1.8, s - 1.8);

    // Large, high-contrast stenciled "NITRO" label spanning the center band
    c.font = '900 24px "Outfit", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(187, 247, 208, 0.38)';
    c.fillText('NITRO', s * 0.5, s * 0.5 + 2.4, inner - 6);
    c.fillStyle = '#032210';
    c.fillText('NITRO', s * 0.5, s * 0.5 + 1, inner - 6);
  }
  sharedNitroCrateCanvas = off;
  return off;
}

function getCargoArmorCanvas(): HTMLCanvasElement {
  if (sharedCargoArmorCanvas) return sharedCargoArmorCanvas;
  const s = 128;
  const off = document.createElement('canvas');
  off.width = s;
  off.height = s;
  const c = off.getContext('2d');
  if (c) {
    // Brushed neutral grey armored stone/steel grain matching Cargo Deck tiles
    c.fillStyle = '#525E6B';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 160; i++) {
      const x = seededRand(i * 19 + 3) * s;
      const y = seededRand(i * 37 + 7) * s;
      const w = 12 + seededRand(i * 53 + 11) * 34;
      const h = 1 + seededRand(i * 61 + 5) * 2.5;
      c.fillStyle = i % 2 === 0 ? 'rgba(203, 213, 225, 0.08)' : 'rgba(15, 23, 42, 0.14)';
      c.fillRect(x, y, w, h);
    }
    // Subtle tile seam lines
    c.strokeStyle = 'rgba(15, 23, 42, 0.24)';
    c.lineWidth = 1.2;
    c.strokeRect(0.6, 0.6, s - 1.2, s - 1.2);
    c.beginPath();
    c.moveTo(0, s * 0.5);
    c.lineTo(s, s * 0.5);
    c.moveTo(s * 0.5, 0);
    c.lineTo(s * 0.5, s);
    c.stroke();
  }
  sharedCargoArmorCanvas = off;
  return off;
}

function getStoneTexCanvas(): HTMLCanvasElement {
  if (sharedStoneTexCanvas) return sharedStoneTexCanvas;
  const s = 96;
  const off = document.createElement('canvas');
  off.width = s;
  off.height = s;
  const c = off.getContext('2d');
  if (c) {
    c.fillStyle = '#5A6572';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 120; i++) {
      const x = seededRand(i * 23 + 1) * s;
      const y = seededRand(i * 41 + 9) * s;
      const r = 1.5 + seededRand(i * 59 + 3) * 5.5;
      c.fillStyle = i % 3 === 0 ? 'rgba(226, 232, 240, 0.12)' : i % 3 === 1 ? 'rgba(15, 23, 42, 0.18)' : 'rgba(100, 116, 139, 0.15)';
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(15, 23, 42, 0.28)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(12, 24);
    c.lineTo(38, 36);
    c.lineTo(54, 28);
    c.moveTo(48, 62);
    c.lineTo(74, 72);
    c.stroke();
  }
  sharedStoneTexCanvas = off;
  return off;
}

function getCarpetWeaveCanvas(): HTMLCanvasElement {
  if (sharedCarpetWeaveCanvas) return sharedCarpetWeaveCanvas;
  const s = 48;
  const off = document.createElement('canvas');
  off.width = s;
  off.height = s;
  const c = off.getContext('2d');
  if (c) {
    c.clearRect(0, 0, s, s);
    // Distinct woven cross-yarn loom texture so carpet & velvet fabric fibers read clearly at arena zoom
    for (let y = 0; y < s; y += 6) {
      for (let x = 0; x < s; x += 6) {
        const alt = ((x / 6 + y / 6) & 1) === 0;
        c.fillStyle = alt ? 'rgba(255, 246, 224, 0.16)' : 'rgba(10, 4, 2, 0.24)';
        c.fillRect(x + 0.5, y + 0.5, 4.5, 2.2);
        c.fillStyle = alt ? 'rgba(10, 4, 2, 0.22)' : 'rgba(255, 242, 214, 0.12)';
        c.fillRect(x + 0.5, y + 3.2, 2.2, 2.4);
      }
    }
    // Fine oblique twill thread striations
    c.strokeStyle = 'rgba(20, 8, 4, 0.14)';
    c.lineWidth = 1;
    for (let d = -s; d < s * 2; d += 12) {
      c.beginPath();
      c.moveTo(d, 0);
      c.lineTo(d + s, s);
      c.stroke();
    }
  }
  sharedCarpetWeaveCanvas = off;
  return off;
}

function getWoodFurnitureCanvas(): HTMLCanvasElement {
  if (sharedMahoganyGrainCanvas) return sharedMahoganyGrainCanvas;
  const s = 64;
  const off = document.createElement('canvas');
  off.width = s;
  off.height = s;
  const c = off.getContext('2d');
  if (c) {
    c.fillStyle = 'rgba(0,0,0,0)';
    c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(24, 9, 2, 0.24)';
    c.lineWidth = 1.1;
    for (let y = 3; y < s; y += 6) {
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(s * 0.35, y + (y % 12 === 3 ? 2 : -2), s * 0.7, y - 1.5, s, y);
      c.stroke();
    }
    c.strokeStyle = 'rgba(253, 224, 150, 0.09)';
    for (let y = 5; y < s; y += 10) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(s, y + 1);
      c.stroke();
    }
  }
  sharedMahoganyGrainCanvas = off;
  return off;
}

function getSkinTextureCanvas(kind: 'fish_scale' | 'wood' | 'damascus' | 'mummy'): HTMLCanvasElement {
  const cached = sharedSkinTileCache.get(kind);
  if (cached) return cached;
  const s = 64;
  const off = document.createElement('canvas');
  off.width = s;
  off.height = s;
  const c = off.getContext('2d');
  if (c) {
    if (kind === 'fish_scale') {
      const r = 9;
      for (let row = -1; row <= 5; row++) {
        const x = row * 12;
        const yOff = (Math.abs(row) % 2) * 8;
        for (let col = -1; col <= 5; col++) {
          const y = col * 16 + yOff;
          const sg = c.createRadialGradient(x - 2, y - 1, 1, x, y, r);
          sg.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
          sg.addColorStop(0.65, 'rgba(255, 255, 255, 0.04)');
          sg.addColorStop(1, 'rgba(15, 23, 42, 0.42)');
          c.fillStyle = sg;
          c.beginPath();
          c.arc(x, y, r, -Math.PI * 0.48, Math.PI * 0.48);
          c.fill();
          c.strokeStyle = 'rgba(255, 255, 255, 0.36)';
          c.lineWidth = 1.2;
          c.stroke();
        }
      }
    } else if (kind === 'wood') {
      c.fillStyle = 'rgba(105, 44, 12, 0.24)';
      c.fillRect(0, 0, s, s);
      for (let y = 2; y < s; y += 5) {
        c.strokeStyle = y % 10 === 2 ? 'rgba(28, 10, 2, 0.48)' : 'rgba(253, 215, 130, 0.16)';
        c.lineWidth = y % 10 === 2 ? 1.5 : 1;
        c.beginPath();
        c.moveTo(0, y);
        c.bezierCurveTo(s * 0.3, y + 3, s * 0.7, y - 3, s, y);
        c.stroke();
      }
    } else if (kind === 'damascus') {
      for (let y = 0; y < s; y += 4) {
        c.strokeStyle = y % 8 === 0 ? 'rgba(15, 23, 42, 0.46)' : 'rgba(248, 250, 252, 0.28)';
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(0, y);
        c.bezierCurveTo(s * 0.28, y + 5, s * 0.72, y - 5, s, y);
        c.stroke();
      }
    } else if (kind === 'mummy') {
      c.fillStyle = '#E7E5E4';
      c.fillRect(0, 0, s, s);
      // Woven linen gauze & layered diagonal cloth strips
      c.fillStyle = 'rgba(168, 162, 158, 0.28)';
      for (let y = 0; y < s; y += 16) {
        c.fillRect(0, y, s, 7);
        c.strokeStyle = 'rgba(87, 83, 78, 0.42)';
        c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(0, y + 7);
        c.lineTo(s, y + 10);
        c.stroke();
      }
      c.strokeStyle = 'rgba(120, 113, 108, 0.16)';
      c.lineWidth = 0.8;
      for (let x = 0; x < s; x += 4) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, s);
        c.stroke();
      }
    }
  }
  sharedSkinTileCache.set(kind, off);
  return off;
}

interface SnowFootprint {
  x: number;
  y: number;
  angle: number;
  createdAt: number;
}
const snowFootprints: SnowFootprint[] = [];
const playerLastFootprintPos = new Map<number, { x: number; y: number; stepSign: number }>();
let lastSnowMapId: string | null = null;
let lastSnowElapsed = 0;

function isPointInsideAnyIcePit(x: number, y: number, pits: IcePit[]): boolean {
  for (const pit of pits) {
    const dx = (x - pit.x) / Math.max(1, pit.rx);
    const dy = (y - pit.y) / Math.max(1, pit.ry);
    if (dx * dx + dy * dy <= 1.02) return true;
  }
  return false;
}

function recordAndDrawSnowFootprints(
  ctx: CanvasRenderingContext2D,
  world: RenderableWorld,
  map: ArenaMap
) {
  if (map.floorTheme !== 'winter_snow') return;
  if (lastSnowMapId !== world.mapId || world.elapsedTime < lastSnowElapsed - 0.5) {
    snowFootprints.length = 0;
    playerLastFootprintPos.clear();
    lastSnowMapId = world.mapId;
  }
  lastSnowElapsed = world.elapsedTime;

  const pits: IcePit[] =
    world.icePits && world.icePits.length > 0
      ? world.icePits
      : (map.icePits ?? []).map((p, idx) => ({
          id: idx + 1,
          x: p.x,
          y: p.y,
          rx: p.rx,
          ry: p.ry,
          points: p.points,
          broken: false,
        }));

  for (const p of world.players) {
    if (!p.alive) {
      playerLastFootprintPos.delete(p.id);
      continue;
    }
    const prev = playerLastFootprintPos.get(p.id);
    if (!prev) {
      playerLastFootprintPos.set(p.id, { x: p.x, y: p.y, stepSign: 1 });
      continue;
    }
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    const d = Math.hypot(dx, dy);
    if (d >= 22 && !isPointInsideAnyIcePit(p.x, p.y, pits)) {
      const moveAngle = Math.atan2(dy, dx);
      const perpX = -Math.sin(moveAngle) * 8.5 * prev.stepSign;
      const perpY = Math.cos(moveAngle) * 8.5 * prev.stepSign;
      snowFootprints.push({
        x: p.x + perpX,
        y: p.y + perpY,
        angle: moveAngle,
        createdAt: world.elapsedTime,
      });
      if (snowFootprints.length > 260) {
        snowFootprints.splice(0, snowFootprints.length - 260);
      }
      prev.x = p.x;
      prev.y = p.y;
      prev.stepSign *= -1;
    } else if (d >= 22) {
      prev.x = p.x;
      prev.y = p.y;
    }
  }

  const maxAge = 4.6;
  while (snowFootprints.length > 0 && world.elapsedTime - snowFootprints[0].createdAt > maxAge) {
    snowFootprints.shift();
  }
  if (snowFootprints.length === 0) return;

  ctx.save();
  for (const fp of snowFootprints) {
    const age = Math.max(0, world.elapsedTime - fp.createdAt);
    const alpha = Math.pow(Math.max(0, 1 - age / maxAge), 1.35);
    if (alpha <= 0.02) continue;

    ctx.save();
    ctx.translate(fp.x, fp.y);
    ctx.rotate(fp.angle);

    // Sculpted ice-blue snow depression + crisp trailing rim highlight
    ctx.fillStyle = `rgba(68, 138, 212, ${0.42 * alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.2, 4.3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 255, 255, ${0.58 * alpha})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(1.1, -0.8, 6.6, 3.8, 0, -Math.PI * 0.75, Math.PI * 0.25);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function getLightCanvas(width: number, height: number): HTMLCanvasElement {
  if (!sharedLightCanvas) {
    sharedLightCanvas = document.createElement('canvas');
  }
  if (sharedLightCanvas.width !== width || sharedLightCanvas.height !== height) {
    sharedLightCanvas.width = width;
    sharedLightCanvas.height = height;
  }
  return sharedLightCanvas;
}

function getBeamScratchCanvas(width: number, height: number): HTMLCanvasElement {
  if (!sharedBeamScratchCanvas) {
    sharedBeamScratchCanvas = document.createElement('canvas');
  }
  if (sharedBeamScratchCanvas.width !== width || sharedBeamScratchCanvas.height !== height) {
    sharedBeamScratchCanvas.width = width;
    sharedBeamScratchCanvas.height = height;
  }
  return sharedBeamScratchCanvas;
}

function getFireflySpriteCanvas(): HTMLCanvasElement {
  if (sharedFireflySpriteCanvas) return sharedFireflySpriteCanvas;
  const off = document.createElement('canvas');
  off.width = 28;
  off.height = 28;
  const c = off.getContext('2d');
  if (c) {
    const g = c.createRadialGradient(14, 14, 0.5, 14, 14, 13);
    g.addColorStop(0, 'rgba(254, 240, 138, 0.92)');
    g.addColorStop(0.55, 'rgba(250, 204, 21, 0.34)');
    g.addColorStop(1, 'rgba(250, 204, 21, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(14, 14, 13, 0, Math.PI * 2);
    c.fill();
  }
  sharedFireflySpriteCanvas = off;
  return off;
}

function getWinterFogCanvas(): HTMLCanvasElement {
  if (sharedFogCanvas) return sharedFogCanvas;
  const size = 512;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d');
  if (ctx) {
    // Seamless tileable organic white fog clouds (wrapped across edges for zero seams)
    for (let i = 0; i < 68; i++) {
      const cx = seededRand(i * 17 + 5) * size;
      const cy = seededRand(i * 31 + 11) * size;
      const rx = 62 + seededRand(i * 47 + 3) * 115;
      const ry = 44 + seededRand(i * 61 + 9) * 85;
      const alpha = 0.055 + seededRand(i * 73 + 13) * 0.08;
      const isPure = i % 3 !== 0;
      const rgb = isPure ? '255, 255, 255' : '232, 245, 255';

      for (let ox = -size; ox <= size; ox += size) {
        for (let oy = -size; oy <= size; oy += size) {
          const px = cx + ox;
          const py = cy + oy;
          if (px + rx < -10 || px - rx > size + 10 || py + ry < -10 || py - ry > size + 10) {
            continue;
          }
          ctx.save();
          ctx.translate(px, py);
          ctx.scale(1, ry / rx);
          const g = ctx.createRadialGradient(0, 0, rx * 0.08, 0, 0, rx);
          g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
          g.addColorStop(0.45, `rgba(${rgb}, ${alpha * 0.55})`);
          g.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, rx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }
  sharedFogCanvas = off;
  return off;
}

function getWinterWispCanvas(): HTMLCanvasElement {
  if (sharedWispCanvas) return sharedWispCanvas;
  const size = 512;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d');
  if (ctx) {
    // Wind-sheared wispy frost mist streaks (seamless tile)
    for (let i = 0; i < 46; i++) {
      const cx = seededRand(i * 23 + 19) * size;
      const cy = seededRand(i * 41 + 7) * size;
      const rx = 85 + seededRand(i * 53 + 17) * 130;
      const ry = 18 + seededRand(i * 67 + 29) * 32;
      const rot = -0.22 + (seededRand(i * 83 + 1) - 0.5) * 0.24;
      const alpha = 0.05 + seededRand(i * 97 + 5) * 0.065;

      for (let ox = -size; ox <= size; ox += size) {
        for (let oy = -size; oy <= size; oy += size) {
          const px = cx + ox;
          const py = cy + oy;
          if (px + rx < -20 || px - rx > size + 20 || py + rx < -20 || py - rx > size + 20) {
            continue;
          }
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(rot);
          ctx.scale(1, ry / rx);
          const g = ctx.createRadialGradient(0, 0, rx * 0.05, 0, 0, rx);
          g.addColorStop(0, `rgba(248, 252, 255, ${alpha})`);
          g.addColorStop(0.55, `rgba(224, 242, 254, ${alpha * 0.45})`);
          g.addColorStop(1, 'rgba(224, 242, 254, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, rx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }
  sharedWispCanvas = off;
  return off;
}

function periodicHash(ix: number, iy: number, period: number, seed: number): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  return seededRand(px * 374.7613 + py * 668.2652 + seed * 91.17);
}

function periodicNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

  const n00 = periodicHash(ix, iy, period, seed);
  const n10 = periodicHash(ix + 1, iy, period, seed);
  const n01 = periodicHash(ix, iy + 1, period, seed);
  const n11 = periodicHash(ix + 1, iy + 1, period, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function periodicFbm(u: number, v: number, basePeriod: number, seed: number): number {
  let sum = 0;
  let amp = 0.52;
  let norm = 0;
  let period = basePeriod;
  for (let o = 0; o < 4; o++) {
    sum += amp * periodicNoise(u, v, period, seed + o * 17.3);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

/** Seamless tileable 256x256 domain-warped fractal water & caustic filament texture */
function getWinterWaterCanvas(): HTMLCanvasElement {
  if (sharedWaterCanvas) return sharedWaterCanvas;
  const size = 256;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        // Two-stage domain warp for organic fractal swirling water currents
        const qx = periodicFbm(u, v, 4, 1.1);
        const qy = periodicFbm(u + 0.37, v + 0.19, 4, 3.7);
        const rx = periodicFbm(u + 0.28 * qx, v + 0.28 * qy, 4, 7.3);
        const ry = periodicFbm(u + 0.28 * qx + 0.51, v + 0.28 * qy + 0.23, 4, 11.9);
        const f = periodicFbm(u + 0.26 * rx, v + 0.26 * ry, 5, 17.5);

        // Refracted water caustic ridges
        const causticPrimary = Math.pow(Math.max(0, 1 - Math.abs(f * 2 - 1)), 2.8);
        const causticFine = Math.pow(Math.max(0, 1 - Math.abs(ry * 2 - 1)), 3.4);
        const shimmer = Math.min(1, causticPrimary * 0.8 + causticFine * 0.4);
        const depth = 0.25 + f * 0.75;

        // Vivid hydrated copper sulphate (CuSO4·5H2O) azure-cyan palette (minimal red so never washed white!)
        const r = Math.min(255, Math.round(2 + depth * 12 + shimmer * 32));
        const g = Math.min(255, Math.round(78 + depth * 56 + shimmer * 92));
        const b = Math.min(255, Math.round(168 + depth * 56 + shimmer * 68));
        const a = Math.min(255, Math.round(165 + shimmer * 78));

        const idx = (y * size + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  sharedWaterCanvas = off;
  return off;
}

function seededRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function drawPersianRug(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  primary: string,
  border: string,
  antiqueTone = false
) {
  ctx.save();
  // Soft grounded carpet drop shadow onto oak planks
  ctx.fillStyle = antiqueTone ? 'rgba(4, 2, 1, 0.60)' : 'rgba(5, 2, 1, 0.44)';
  ctx.fillRect(x + 4, y + 6, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = primary;
  ctx.fillRect(x, y, w, h);

  // Genuine antique Persian woven wool fiber grain (AI macro weave + fallback loom tile)
  const woolImg = getPersianWoolTexture();
  if (woolImg) {
    const woolPat = getCachedPattern(ctx, woolImg);
    if (woolPat) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = antiqueTone ? 0.62 : 0.48;
      ctx.fillStyle = woolPat;
      ctx.fillRect(x, y, w, h);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = woolPat;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
  }
  const weavePat = getCachedPattern(ctx, getCarpetWeaveCanvas());
  if (weavePat) {
    ctx.save();
    ctx.globalAlpha = woolImg ? 0.34 : 0.72;
    ctx.fillStyle = weavePat;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // Aged foot-traffic patina & ambient floor shading so rugs melt naturally into wood planks
  const sheen = ctx.createRadialGradient(
    x + w * 0.5,
    y + h * 0.5,
    Math.min(w, h) * 0.14,
    x + w * 0.5,
    y + h * 0.5,
    Math.max(w, h) * 0.68
  );
  sheen.addColorStop(0, antiqueTone ? 'rgba(255, 232, 190, 0.05)' : 'rgba(255, 240, 204, 0.10)');
  sheen.addColorStop(0.65, antiqueTone ? 'rgba(20, 10, 4, 0.16)' : 'rgba(15, 8, 4, 0.06)');
  sheen.addColorStop(1, antiqueTone ? 'rgba(8, 4, 2, 0.46)' : 'rgba(10, 5, 2, 0.28)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, w, h);

  // Ornamental antique border bands & geometric guard stripes
  ctx.strokeStyle = border;
  ctx.lineWidth = 4.5;
  ctx.strokeRect(x + 11, y + 11, w - 22, h - 22);

  ctx.strokeStyle = antiqueTone ? 'rgba(218, 178, 112, 0.34)' : 'rgba(254, 249, 195, 0.44)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 18, y + 18, w - 36, h - 36);
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

  // Subtle stitched geometric diamond fretwork along outer border
  ctx.fillStyle = border;
  for (let bx = x + 28; bx < x + w - 24; bx += 28) {
    ctx.fillRect(bx - 1.5, y + 6.5, 3, 3);
    ctx.fillRect(bx - 1.5, y + h - 9.5, 3, 3);
  }
  for (let by = y + 28; by < y + h - 24; by += 28) {
    ctx.fillRect(x + 6.5, by - 1.5, 3, 3);
    ctx.fillRect(x + w - 9.5, by - 1.5, 3, 3);
  }

  // Corner floral diamond accents
  for (const [cx0, cy0] of [
    [x + 28, y + 28],
    [x + w - 28, y + 28],
    [x + 28, y + h - 28],
    [x + w - 28, y + h - 28],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx0, cy0 - 8);
    ctx.lineTo(cx0 + 8, cy0);
    ctx.lineTo(cx0, cy0 + 8);
    ctx.lineTo(cx0 - 8, cy0);
    ctx.closePath();
    ctx.fill();
  }

  // Center concentric heirloom medallion
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.min(w, h) * 0.22;
  ctx.fillStyle = border;
  ctx.beginPath();
  ctx.moveTo(cx, cy - rx);
  ctx.lineTo(cx + rx * 1.25, cy);
  ctx.lineTo(cx, cy + rx);
  ctx.lineTo(cx - rx * 1.25, cy);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = antiqueTone ? 'rgba(226, 198, 146, 0.28)' : 'rgba(255, 255, 255, 0.34)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.moveTo(cx, cy - rx * 0.56);
  ctx.lineTo(cx + rx * 0.72, cy);
  ctx.lineTo(cx, cy + rx * 0.56);
  ctx.lineTo(cx - rx * 0.72, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Weathered cream/oatmeal wool fringe tassels on short ends
  ctx.strokeStyle = antiqueTone ? 'rgba(182, 160, 122, 0.42)' : 'rgba(245, 232, 196, 0.60)';
  ctx.lineWidth = 1.4;
  for (let fy = y + 6; fy < y + h - 5; fy += 7) {
    ctx.beginPath();
    ctx.moveTo(x - 5.5, fy);
    ctx.lineTo(x, fy);
    ctx.moveTo(x + w, fy);
    ctx.lineTo(x + w + 5.5, fy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLibraryVelvetCarpet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: 'burgundy' | 'olive'
) {
  ctx.save();
  ctx.fillStyle = 'rgba(4, 2, 1, 0.58)';
  ctx.fillRect(x + 4, y + 6, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const carpetImg = getLibraryCarpetTexture();
  if (variant === 'burgundy' && carpetImg) {
    // Rich deep oxblood plush diamond-damask velvet carpet (DOORS Library photo #2)
    const pat = getCachedPattern(ctx, carpetImg);
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.fillStyle = '#4B1214';
      ctx.fillRect(x, y, w, h);
    }
  } else {
    // Deep antique moss-olive velvet runner (DOORS Library mezzanine photo #3)
    ctx.fillStyle = variant === 'olive' ? '#2F381B' : '#4B1214';
    ctx.fillRect(x, y, w, h);
    const woolImg = getPersianWoolTexture();
    if (woolImg) {
      const wp = getCachedPattern(ctx, woolImg);
      if (wp) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.58;
        ctx.fillStyle = wp;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
      }
    }
    if (carpetImg) {
      const cp = getCachedPattern(ctx, carpetImg);
      if (cp) {
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = cp;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
      }
    }
  }

  // Velvet loom cross-nap micro-texture
  const weavePat = getCachedPattern(ctx, getCarpetWeaveCanvas());
  if (weavePat) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = weavePat;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // Worn velvet edge shading & subtle antique bronze-gold stitched trim
  const edgeGrad = ctx.createRadialGradient(
    x + w * 0.5,
    y + h * 0.5,
    Math.min(w, h) * 0.16,
    x + w * 0.5,
    y + h * 0.5,
    Math.max(w, h) * 0.72
  );
  edgeGrad.addColorStop(0, 'rgba(255, 226, 185, 0.04)');
  edgeGrad.addColorStop(0.7, 'rgba(8, 3, 2, 0.18)');
  edgeGrad.addColorStop(1, 'rgba(5, 2, 1, 0.48)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = variant === 'olive' ? 'rgba(132, 146, 76, 0.42)' : 'rgba(154, 108, 52, 0.46)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
  ctx.strokeStyle = 'rgba(22, 8, 5, 0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
  ctx.restore();
}

function getFloorCanvas(map: ArenaMap): HTMLCanvasElement {
  let themeImg: HTMLImageElement | null = null;
  if (map.floorTheme === 'winter_snow') {
    themeImg = getWinterSnowTexture();
  } else if (map.floorTheme === 'grass_outdoors') {
    themeImg = map.immersive
      ? getLazyTexture('grove_grass', groveGrassTexUrl)
      : getLazyTexture('meadow_grass', meadowGrassTexUrl);
  } else if (map.floorTheme === 'mansion_wood') {
    themeImg = map.immersive
      ? getLazyTexture('mansion_dark_wood', mansionDarkWoodTexUrl)
      : getLazyTexture('manor_oak', manorOakTexUrl);
  } else if (map.floorTheme === 'library_wood') {
    themeImg = getLibraryFloorTexture();
  } else if (map.floorTheme === 'maple_cargo') {
    themeImg = getLazyTexture('cargo_deck', cargoDeckTexUrl);
  }

  const woolImg =
    map.floorTheme === 'mansion_wood' || map.floorTheme === 'library_wood'
      ? getPersianWoolTexture()
      : null;
  const carpetImg = map.floorTheme === 'library_wood' ? getLibraryCarpetTexture() : null;

  const key = `${map.id}_${map.width}x${map.height}_v10${themeImg ? '_aitex' : ''}${woolImg ? '_w' : ''}${carpetImg ? '_c' : ''}`;
  const existing = floorCache.get(key);
  if (existing) return existing;

  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const ctx = off.getContext('2d');
  if (!ctx) return off;

  if (map.floorTheme === 'grass_outdoors') {
    if (themeImg) {
      const grassPat = ctx.createPattern(themeImg, 'repeat');
      if (grassPat) {
        ctx.fillStyle = grassPat;
        ctx.fillRect(0, 0, map.width, map.height);
      }
      const tintGrad = ctx.createRadialGradient(
        map.width * 0.46,
        map.height * 0.44,
        70,
        map.width * 0.5,
        map.height * 0.5,
        Math.max(map.width, map.height) * 0.72
      );
      if (map.immersive) {
        // Deep ancient dark-emerald woodland mood for Emerald Grove
        tintGrad.addColorStop(0, 'rgba(6, 56, 26, 0.24)');
        tintGrad.addColorStop(0.55, 'rgba(4, 38, 16, 0.40)');
        tintGrad.addColorStop(1, 'rgba(2, 20, 8, 0.60)');
      } else {
        tintGrad.addColorStop(0, 'rgba(163, 230, 53, 0.14)');
        tintGrad.addColorStop(0.58, 'rgba(22, 101, 52, 0.10)');
        tintGrad.addColorStop(1, 'rgba(10, 42, 16, 0.34)');
      }
      ctx.fillStyle = tintGrad;
      ctx.fillRect(0, 0, map.width, map.height);
    } else {
      const baseGrad = ctx.createRadialGradient(
        map.width * 0.46,
        map.height * 0.44,
        70,
        map.width * 0.5,
        map.height * 0.5,
        Math.max(map.width, map.height) * 0.72
      );
      baseGrad.addColorStop(0, map.immersive ? '#1E4D2B' : '#55992D');
      baseGrad.addColorStop(0.52, map.immersive ? '#10351B' : '#316E26');
      baseGrad.addColorStop(1, map.immersive ? '#061D0D' : '#163D17');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, map.width, map.height);
    }

    if (!map.immersive) {
      const stripeW = 84;
      for (let sx = 0; sx < map.width; sx += stripeW) {
        if (Math.floor(sx / stripeW) % 2 === 0) {
          ctx.fillStyle = 'rgba(190, 242, 100, 0.05)';
          ctx.fillRect(sx, 0, stripeW, map.height);
        }
      }
    }

    for (let i = 0; i < (map.immersive ? 120 : 75); i++) {
      const px = seededRand(i * 13 + 1) * map.width;
      const py = seededRand(i * 29 + 3) * map.height;
      const pr = 36 + seededRand(i * 41 + 7) * 90;
      ctx.fillStyle = map.immersive
        ? i % 2 === 0
          ? 'rgba(3, 26, 11, 0.28)'
          : 'rgba(14, 72, 34, 0.16)'
        : i % 3 === 0
          ? 'rgba(14, 52, 20, 0.20)'
          : 'rgba(132, 204, 22, 0.11)';
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.lineCap = 'round';
    if (!map.immersive) {
      // Meadow Clearing diagonal dirt & gravel paths matching thumbnail
      ctx.strokeStyle = 'rgba(78, 56, 32, 0.66)';
      ctx.lineWidth = 88;
      ctx.beginPath();
      ctx.moveTo(45, 45);
      ctx.lineTo(map.width - 45, map.height - 45);
      ctx.moveTo(map.width - 45, 45);
      ctx.lineTo(45, map.height - 45);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(182, 146, 94, 0.72)';
      ctx.lineWidth = 54;
      ctx.stroke();

      const midG = ctx.createRadialGradient(
        map.width * 0.5,
        map.height * 0.5,
        12,
        map.width * 0.5,
        map.height * 0.5,
        142
      );
      midG.addColorStop(0, 'rgba(212, 174, 118, 0.86)');
      midG.addColorStop(0.68, 'rgba(154, 118, 72, 0.68)');
      midG.addColorStop(1, 'rgba(92, 68, 40, 0)');
      ctx.fillStyle = midG;
      ctx.beginPath();
      ctx.arc(map.width * 0.5, map.height * 0.5, 142, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 180; i++) {
        const diagA = i % 2 === 0;
        const t = 0.05 + seededRand(i * 37 + 5) * 0.90;
        const jitter = (seededRand(i * 53 + 9) - 0.5) * 58;
        const px = (diagA ? t * map.width : (1 - t) * map.width) + jitter;
        const py = t * map.height + (seededRand(i * 61 + 3) - 0.5) * 46;
        const pr = 2 + seededRand(i * 73 + 1) * 4.8;
        ctx.fillStyle =
          i % 3 === 0
            ? 'rgba(104, 78, 48, 0.55)'
            : i % 3 === 1
              ? 'rgba(218, 188, 140, 0.45)'
              : 'rgba(130, 100, 65, 0.48)';
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Emerald Grove: organic feathered woodland loam & mossy flagstones (NO flat brown vector band!)
      const drawFeatheredTrail = (x0: number, y0: number, x1: number, y1: number, steps: number, seedBase: number) => {
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const jitter = (seededRand(seedBase + s * 17) - 0.5) * 26;
          const isHoriz = Math.abs(x1 - x0) > Math.abs(y1 - y0);
          const px = x0 + (x1 - x0) * t + (isHoriz ? 0 : jitter);
          const py = y0 + (y1 - y0) * t + (isHoriz ? jitter : 0);
          const rad = 42 + seededRand(seedBase + s * 31) * 24;
          const rg = ctx.createRadialGradient(px, py, 4, px, py, rad);
          rg.addColorStop(0, 'rgba(58, 47, 32, 0.54)');
          rg.addColorStop(0.55, 'rgba(42, 46, 26, 0.34)');
          rg.addColorStop(1, 'rgba(16, 46, 22, 0)');
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();

          // Embedded weathered mossy flagstones along the center of the woodland trail
          if (s % 2 === 0) {
            const stones = 2 + (s % 2);
            for (let k = 0; k < stones; k++) {
              const ox = (seededRand(seedBase + s * 71 + k * 13) - 0.5) * 38;
              const oy = (seededRand(seedBase + s * 89 + k * 19) - 0.5) * 38;
              const rx = 8 + seededRand(seedBase + s * 43 + k) * 9;
              const ry = 6 + seededRand(seedBase + s * 59 + k) * 7;
              const rot = seededRand(seedBase + s * 97 + k) * Math.PI;
              ctx.save();
              ctx.translate(px + ox, py + oy);
              ctx.rotate(rot);
              ctx.fillStyle = (s + k) % 2 === 0 ? 'rgba(84, 92, 82, 0.42)' : 'rgba(66, 76, 62, 0.38)';
              ctx.beginPath();
              ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = 'rgba(20, 48, 22, 0.42)';
              ctx.lineWidth = 1.2;
              ctx.stroke();
              ctx.restore();
            }
          }
        }
      };

      drawFeatheredTrail(map.width * 0.5, 55, map.width * 0.5, map.height - 55, 34, 100);
      drawFeatheredTrail(55, map.height * 0.5, map.width - 55, map.height * 0.5, 48, 900);

      // Feathered mossy central clearing & circular cobblestone patio
      const clearingG = ctx.createRadialGradient(
        map.width * 0.5,
        map.height * 0.5,
        24,
        map.width * 0.5,
        map.height * 0.5,
        175
      );
      clearingG.addColorStop(0, 'rgba(66, 56, 38, 0.56)');
      clearingG.addColorStop(0.62, 'rgba(42, 48, 28, 0.36)');
      clearingG.addColorStop(1, 'rgba(12, 42, 18, 0)');
      ctx.fillStyle = clearingG;
      ctx.beginPath();
      ctx.arc(map.width * 0.5, map.height * 0.5, 175, 0, Math.PI * 2);
      ctx.fill();

      // Natural flagstone cluster scattered around clearing
      for (let i = 0; i < 42; i++) {
        const ang = seededRand(i * 23 + 3) * Math.PI * 2;
        const rad = 18 + Math.sqrt(seededRand(i * 47 + 7)) * 124;
        const sx = map.width * 0.5 + Math.cos(ang) * rad;
        const sy = map.height * 0.5 + Math.sin(ang) * rad;
        const rw = 10 + seededRand(i * 61 + 5) * 14;
        const rh = 7 + seededRand(i * 73 + 9) * 10;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(ang + 0.4);
        ctx.fillStyle = i % 3 === 0 ? 'rgba(92, 102, 92, 0.45)' : 'rgba(68, 78, 66, 0.42)';
        ctx.beginPath();
        ctx.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(18, 52, 24, 0.48)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }
    }

    const sunBeams = map.immersive ? [160, 440, 740, 1280] : [90, 270, 480];
    for (const bx of sunBeams) {
      const spanX = map.immersive ? 520 : 410;
      const spanY = map.height * 0.78;
      const rayGrad = ctx.createLinearGradient(bx, 0, bx + spanX, spanY);
      rayGrad.addColorStop(0, map.immersive ? 'rgba(254, 240, 138, 0.10)' : 'rgba(254, 240, 138, 0.22)');
      rayGrad.addColorStop(0.55, 'rgba(250, 204, 21, 0.04)');
      rayGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(bx - 55, 0);
      ctx.lineTo(bx + 115, 0);
      ctx.lineTo(bx + spanX + 100, spanY);
      ctx.lineTo(bx + spanX - 150, spanY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    for (let i = 0; i < (map.immersive ? 340 : 210); i++) {
      const gx = 30 + seededRand(i * 7 + 11) * (map.width - 60);
      const gy = 30 + seededRand(i * 19 + 23) * (map.height - 60);
      if (i % 7 === 0) {
        const flowerColors = map.immersive
          ? ['#34D399', '#A7F3D0', '#FDE047']
          : ['#FDE047', '#FB7185', '#FEF9C3', '#F59E0B'];
        ctx.fillStyle = flowerColors[i % flowerColors.length];
        ctx.beginPath();
        ctx.arc(gx, gy, map.immersive ? 1.8 : 2.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = map.immersive
          ? i % 2 === 0
            ? 'rgba(34, 197, 94, 0.20)'
            : 'rgba(16, 185, 129, 0.14)'
          : i % 2 === 0
            ? 'rgba(163, 230, 53, 0.22)'
            : 'rgba(74, 222, 128, 0.18)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx - 2, gy - 6);
        ctx.moveTo(gx + 3, gy);
        ctx.lineTo(gx + 5, gy - 5);
        ctx.stroke();
      }
    }
  } else if (map.floorTheme === 'winter_snow') {
    ctx.fillStyle = '#D9EEFF';
    ctx.fillRect(0, 0, map.width, map.height);

    if (themeImg) {
      const snowPat = ctx.createPattern(themeImg, 'repeat');
      if (snowPat) {
        ctx.save();
        ctx.globalAlpha = 0.80;
        ctx.fillStyle = snowPat;
        ctx.fillRect(0, 0, map.width, map.height);
        ctx.restore();
      }
    }

    const snowWash = ctx.createRadialGradient(
      map.width * 0.5,
      map.height * 0.48,
      60,
      map.width * 0.5,
      map.height * 0.5,
      Math.max(map.width, map.height) * 0.72
    );
    snowWash.addColorStop(0, themeImg ? 'rgba(248, 252, 255, 0.34)' : 'rgba(248, 252, 255, 0.86)');
    snowWash.addColorStop(0.55, themeImg ? 'rgba(214, 236, 255, 0.22)' : 'rgba(214, 236, 255, 0.56)');
    snowWash.addColorStop(1, themeImg ? 'rgba(110, 174, 240, 0.36)' : 'rgba(125, 185, 245, 0.52)');
    ctx.fillStyle = snowWash;
    ctx.fillRect(0, 0, map.width, map.height);

    for (let i = 0; i < 30; i++) {
      const dx = 85 + seededRand(i * 17 + 5) * (map.width - 170);
      const dy = 70 + seededRand(i * 31 + 11) * (map.height - 140);
      const rx = 85 + seededRand(i * 43 + 3) * 120;
      const ry = 26 + seededRand(i * 59 + 7) * 38;
      const rot = (seededRand(i * 71 + 9) - 0.5) * 0.55;

      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(rot);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(96, 165, 250, 0.26)' : 'rgba(56, 189, 248, 0.22)';
      ctx.beginPath();
      ctx.ellipse(7, 9, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(244, 249, 255, 0.86)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.94, ry * 0.84, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < 240; i++) {
      const fx = 28 + seededRand(i * 23 + 17) * (map.width - 56);
      const fy = 28 + seededRand(i * 37 + 29) * (map.height - 56);
      const r = 1.2 + seededRand(i * 53 + 3) * 2.0;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(56, 189, 248, 0.52)' : 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (map.floorTheme === 'maple_cargo') {
    ctx.fillStyle = '#0D1720';
    ctx.fillRect(0, 0, map.width, map.height);

    if (themeImg) {
      const cargoPat = ctx.createPattern(themeImg, 'repeat');
      if (cargoPat) {
        ctx.fillStyle = cargoPat;
        ctx.fillRect(0, 0, map.width, map.height);
      }

      // Subtle checkerboard stone-slate contrast + machined tile bevels matching Cargo Deck thumbnail
      const tile = 100;
      const cols = Math.ceil(map.width / tile);
      const rows = Math.ceil(map.height / tile);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * tile;
          const y = r * tile;
          const isDarkTile = (r + c) % 2 === 1;
          ctx.fillStyle = isDarkTile ? 'rgba(6, 11, 18, 0.34)' : 'rgba(148, 163, 184, 0.08)';
          ctx.fillRect(x, y, tile, tile);

          // Crisp machined bevel seam on each deck slab
          ctx.fillStyle = 'rgba(226, 232, 240, 0.06)';
          ctx.fillRect(x + 2, y + 2, tile - 4, 1.5);
          ctx.strokeStyle = 'rgba(4, 8, 14, 0.62)';
          ctx.lineWidth = 1.8;
          ctx.strokeRect(x, y, tile, tile);
        }
      }

      const vig = ctx.createRadialGradient(
        map.width * 0.5,
        map.height * 0.5,
        120,
        map.width * 0.5,
        map.height * 0.5,
        Math.max(map.width, map.height) * 0.72
      );
      vig.addColorStop(0, 'rgba(45, 212, 191, 0.05)');
      vig.addColorStop(0.65, 'rgba(13, 23, 32, 0.14)');
      vig.addColorStop(1, 'rgba(4, 9, 15, 0.46)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, map.width, map.height);
    } else {
      const tile = 100;
      const cols = Math.ceil(map.width / tile);
      const rows = Math.ceil(map.height / tile);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * tile;
          const y = r * tile;
          const isLight = (r + c) % 2 === 0;
          ctx.fillStyle = isLight ? '#253646' : '#16212D';
          ctx.fillRect(x, y, tile, tile);
          ctx.strokeStyle = 'rgba(4, 8, 14, 0.85)';
          ctx.lineWidth = 2.2;
          ctx.strokeRect(x, y, tile, tile);
        }
      }
    }

    ctx.strokeStyle = 'rgba(45, 212, 191, 0.24)';
    ctx.lineWidth = 3;
    ctx.strokeRect(70, 70, map.width - 140, map.height - 140);
    ctx.beginPath();
    ctx.arc(map.width / 2, map.height / 2, 130, 0, Math.PI * 2);
    ctx.stroke();
  } else if (map.floorTheme === 'library_wood') {
    ctx.fillStyle = '#231008';
    ctx.fillRect(0, 0, map.width, map.height);

    if (themeImg) {
      const libPat = ctx.createPattern(themeImg, 'repeat');
      if (libPat) {
        ctx.fillStyle = libPat;
        ctx.fillRect(0, 0, map.width, map.height);
      }
      // Rich warm dark-umber antique wood wash (NO yellow/orange saturation!)
      const libWash = ctx.createRadialGradient(
        map.width * 0.5,
        map.height * 0.5,
        90,
        map.width * 0.5,
        map.height * 0.5,
        Math.max(map.width, map.height) * 0.68
      );
      libWash.addColorStop(0, 'rgba(64, 34, 18, 0.10)');
      libWash.addColorStop(0.58, 'rgba(26, 12, 6, 0.26)');
      libWash.addColorStop(1, 'rgba(10, 4, 2, 0.52)');
      ctx.fillStyle = libWash;
      ctx.fillRect(0, 0, map.width, map.height);
    } else {
      const plankH = 34;
      const plankW = 152;
      const tones = ['#32170B', '#3E1D0D', '#281208', '#492210', '#2E1509'];
      const rows = Math.ceil(map.height / plankH);
      for (let r = 0; r < rows; r++) {
        const y = r * plankH;
        const rowOffset = (r % 2) * (plankW * 0.5) + (r % 3) * 28;
        const cols = Math.ceil((map.width + plankW) / plankW) + 1;
        for (let c = -1; c < cols; c++) {
          const x = c * plankW - rowOffset;
          ctx.fillStyle = tones[Math.floor(seededRand(r * 149 + c * 41) * tones.length)];
          ctx.fillRect(x, y, plankW, plankH);
          ctx.strokeStyle = 'rgba(10, 4, 1, 0.74)';
          ctx.lineWidth = 1.3;
          ctx.strokeRect(x, y, plankW, plankH);
        }
      }
    }

    drawLibraryVelvetCarpet(ctx, map.width / 2 - 280, map.height / 2 - 220, 560, 440, 'burgundy');
    drawLibraryVelvetCarpet(ctx, 735, 620, 260, 145, 'olive');
    drawLibraryVelvetCarpet(ctx, map.width - 995, 620, 260, 145, 'burgundy');
    drawLibraryVelvetCarpet(ctx, 735, map.height - 765, 260, 145, 'burgundy');
    drawLibraryVelvetCarpet(ctx, map.width - 995, map.height - 765, 260, 145, 'olive');

    drawLibraryVelvetCarpet(ctx, 110, map.height / 2 - 140, 260, 280, 'burgundy');
    drawLibraryVelvetCarpet(ctx, map.width - 370, map.height / 2 - 140, 260, 280, 'olive');
  } else {
    ctx.fillStyle = map.immersive ? '#2A1409' : '#B98956';
    ctx.fillRect(0, 0, map.width, map.height);

    if (themeImg) {
      const woodPat = ctx.createPattern(themeImg, 'repeat');
      if (woodPat) {
        ctx.fillStyle = woodPat;
        ctx.fillRect(0, 0, map.width, map.height);
      }
      // Lighter satin architectural finish on Manor Foyer vs moody warm estate brown on Wooden Mansion
      const sheenGrad = ctx.createRadialGradient(
        map.width * 0.5,
        map.height * 0.48,
        50,
        map.width * 0.5,
        map.height * 0.5,
        Math.max(map.width, map.height) * 0.68
      );
      if (map.immersive) {
        sheenGrad.addColorStop(0, 'rgba(180, 108, 42, 0.08)');
        sheenGrad.addColorStop(0.62, 'rgba(24, 9, 2, 0.18)');
        sheenGrad.addColorStop(1, 'rgba(10, 4, 1, 0.42)');
      } else {
        sheenGrad.addColorStop(0, 'rgba(255, 245, 224, 0.14)');
        sheenGrad.addColorStop(0.6, 'rgba(120, 72, 28, 0.06)');
        sheenGrad.addColorStop(1, 'rgba(28, 12, 4, 0.34)');
      }
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(0, 0, map.width, map.height);
    } else {
      const plankH = 34;
      const plankW = 148;
      const tones = map.immersive
        ? ['#4E2712', '#5E3017', '#42200E', '#69361A', '#542A14']
        : ['#C79862', '#BA8B56', '#CEA06B', '#B0824F', '#C1925C'];
      const rows = Math.ceil(map.height / plankH);
      for (let r = 0; r < rows; r++) {
        const y = r * plankH;
        const rowOffset = (r % 2) * (plankW * 0.5) + (r % 3) * 26;
        const cols = Math.ceil((map.width + plankW) / plankW) + 1;
        for (let c = -1; c < cols; c++) {
          const x = c * plankW - rowOffset;
          ctx.fillStyle = tones[Math.floor(seededRand(r * 131 + c * 37) * tones.length)];
          ctx.fillRect(x, y, plankW, plankH);
          ctx.strokeStyle = map.immersive ? 'rgba(14, 5, 1, 0.7)' : 'rgba(92, 54, 22, 0.38)';
          ctx.lineWidth = 1.3;
          ctx.strokeRect(x, y, plankW, plankH);
        }
      }
    }

    drawPersianRug(
      ctx,
      map.width / 2 - (map.immersive ? 260 : 190),
      map.height / 2 - (map.immersive ? 190 : 140),
      map.immersive ? 520 : 380,
      map.immersive ? 380 : 280,
      map.immersive ? '#6D1B1A' : '#9E1C1C',
      map.immersive ? '#B58234' : '#D69E2E',
      Boolean(map.immersive)
    );

    if (map.immersive) {
      drawPersianRug(ctx, 290, 220, 320, 210, '#1C3454', '#A87E36', true);
      drawPersianRug(ctx, map.width - 610, 220, 320, 210, '#184434', '#A4843E', true);
      drawPersianRug(ctx, 290, map.height - 430, 320, 210, '#45224D', '#A87E36', true);
      drawPersianRug(ctx, map.width - 610, map.height - 430, 320, 210, '#5C1B28', '#B0823A', true);
    }
  }

  floorCache.set(key, off);
  return off;
}

function getLibraryUpperFloorCanvas(map: ArenaMap): HTMLCanvasElement {
  const libImg = getLibraryFloorTexture();
  const woolImg = getPersianWoolTexture();
  const carpetImg = getLibraryCarpetTexture();
  const key = `${map.id}_upper_${map.width}x${map.height}_v5${libImg ? '_aitex' : ''}${woolImg ? '_w' : ''}${carpetImg ? '_c' : ''}`;
  const existing = floorCache.get(key);
  if (existing) return existing;

  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const ctx = off.getContext('2d');
  if (!ctx) return off;

  const zones = map.upperZones ?? [];
  ctx.save();
  ctx.beginPath();
  for (const z of zones) {
    ctx.rect(z.x, z.y, z.w, z.h);
  }
  ctx.clip();

  ctx.fillStyle = '#211007';
  ctx.fillRect(0, 0, map.width, map.height);

  if (libImg) {
    const libPat = ctx.createPattern(libImg, 'repeat');
    if (libPat) {
      ctx.fillStyle = libPat;
      ctx.fillRect(0, 0, map.width, map.height);
    }
    // Rich dark espresso/umber antique wood finish matching Ground Floor
    ctx.fillStyle = 'rgba(20, 8, 3, 0.30)';
    ctx.fillRect(0, 0, map.width, map.height);
  } else {
    const plankH = 34;
    const plankW = 152;
    const tones = ['#2B140A', '#351A0D', '#231007', '#3B1D0E', '#271208'];
    const rows = Math.ceil(map.height / plankH);
    for (let r = 0; r < rows; r++) {
      const y = r * plankH;
      const rowOffset = (r % 2) * (plankW * 0.5) + (r % 3) * 24;
      const cols = Math.ceil((map.width + plankW) / plankW) + 1;
      for (let c = -1; c < cols; c++) {
        const x = c * plankW - rowOffset;
        const seed = r * 173 + c * 53;
        ctx.fillStyle = tones[Math.floor(seededRand(seed) * tones.length)];
        ctx.fillRect(x, y, plankW, plankH);
        ctx.strokeStyle = 'rgba(10, 4, 1, 0.68)';
        ctx.lineWidth = 1.3;
        ctx.strokeRect(x, y, plankW, plankH);
      }
    }
  }

  // Deep antique perimeter wainscot & balcony fascia depth shading around the mezzanine opening
  const pad = 24;
  ctx.strokeStyle = 'rgba(6, 2, 1, 0.62)';
  ctx.lineWidth = 22;
  ctx.strokeRect(pad, pad, map.width - pad * 2, map.height - pad * 2);

  // Carved dark mahogany balcony lip framing guarded edges only (leaving 4 stair landings open)
  for (const rail of map.walls) {
    if (rail.kind !== 'mezzanine_rail') continue;
    ctx.fillStyle = 'rgba(5, 2, 1, 0.72)';
    ctx.fillRect(rail.x - 10, rail.y - 10, rail.w + 20, rail.h + 20);
    ctx.fillStyle = 'rgba(54, 24, 11, 0.56)';
    ctx.fillRect(rail.x - 3, rail.y - 3, rail.w + 6, rail.h + 6);
  }

  // Olive-moss woven mezzanine walkway runners matching DOORS Library photo #3
  drawLibraryVelvetCarpet(ctx, 1180, 72, 640, 104, 'olive');
  drawLibraryVelvetCarpet(ctx, 1180, map.height - 176, 640, 104, 'olive');
  drawLibraryVelvetCarpet(ctx, 84, map.height / 2 - 220, 74, 440, 'olive');
  drawLibraryVelvetCarpet(ctx, map.width - 158, map.height / 2 - 220, 74, 440, 'olive');

  ctx.restore();

  floorCache.set(key, off);
  return off;
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const a = hexA.replace('#', '');
  const b = hexB.replace('#', '');
  if (a.length !== 6 || b.length !== 6) return hexA;
  const ar = parseInt(a.slice(0, 2), 16);
  const ag = parseInt(a.slice(2, 4), 16);
  const ab = parseInt(a.slice(4, 6), 16);
  const br = parseInt(b.slice(0, 2), 16);
  const bg = parseInt(b.slice(2, 4), 16);
  const bb = parseInt(b.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function getBookshelfBayTileCanvas(vertical: boolean): HTMLCanvasElement {
  if (vertical && sharedBookshelfVTileCanvas) return sharedBookshelfVTileCanvas;
  if (!vertical && sharedBookshelfHTileCanvas) return sharedBookshelfHTileCanvas;

  const w = vertical ? 44 : 120;
  const h = vertical ? 120 : 44;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const c = off.getContext('2d');
  if (c) {
    c.fillStyle = '#110602';
    c.fillRect(0, 0, w, h);

    const antiqueSpines = [
      '#461915',
      '#2E1C13',
      '#1C2535',
      '#182B20',
      '#311B33',
      '#27201B',
      '#3B2013',
      '#221B17',
    ];

    if (vertical) {
      const spineW = 4;
      const spineX = (w - spineW) * 0.5;
      const sideSpace = (w - spineW) * 0.5 - 3;
      for (let by = 2, idx = 0; by < h - 4; by += 7, idx++) {
        const rndL = seededRand(idx * 17 + 5);
        const rndR = seededRand(idx * 23 + 11);
        const thickL = 5 + Math.floor(rndL * 1.8);
        const thickR = 5 + Math.floor(rndR * 1.8);
        const depthL = Math.max(6, sideSpace - Math.floor(rndL * 3));
        const depthR = Math.max(6, sideSpace - Math.floor(rndR * 3));

        const lx = spineX - depthL - (rndL > 0.85 ? 1.5 : 0);
        c.fillStyle = antiqueSpines[(idx + Math.floor(rndL * 5)) % antiqueSpines.length];
        c.fillRect(lx, by, depthL, thickL);
        c.fillStyle = 'rgba(0,0,0,0.34)';
        c.fillRect(lx, by + thickL - 1, depthL, 1);
        if (idx % 3 === 0) {
          c.fillStyle = 'rgba(180, 140, 74, 0.28)';
          c.fillRect(lx + 1.5, by + 1, 2.2, thickL - 2);
        }

        const rx = spineX + spineW + (rndR > 0.85 ? 1.5 : 0);
        c.fillStyle = antiqueSpines[(idx + 3 + Math.floor(rndR * 5)) % antiqueSpines.length];
        c.fillRect(rx, by, depthR, thickR);
        c.fillStyle = 'rgba(0,0,0,0.34)';
        c.fillRect(rx, by + thickR - 1, depthR, 1);
        if ((idx + 1) % 3 === 0) {
          c.fillStyle = 'rgba(180, 140, 74, 0.28)';
          c.fillRect(rx + depthR - 3.7, by + 1, 2.2, thickR - 2);
        }
      }
      c.fillStyle = '#2B1207';
      c.fillRect(spineX, 0, spineW, h);
      c.fillStyle = 'rgba(196, 130, 68, 0.16)';
      c.fillRect(spineX + 1, 0, 1, h);
    } else {
      const spineH = 4;
      const spineY = (h - spineH) * 0.5;
      const sideSpace = (h - spineH) * 0.5 - 3;
      for (let bx = 2, idx = 0; bx < w - 4; bx += 7, idx++) {
        const rndN = seededRand(idx * 19 + 3);
        const rndS = seededRand(idx * 29 + 9);
        const thickN = 5 + Math.floor(rndN * 1.8);
        const thickS = 5 + Math.floor(rndS * 1.8);
        const depthN = Math.max(6, sideSpace - Math.floor(rndN * 3));
        const depthS = Math.max(6, sideSpace - Math.floor(rndS * 3));

        const ny = spineY - depthN - (rndN > 0.85 ? 1.5 : 0);
        c.fillStyle = antiqueSpines[(idx + Math.floor(rndN * 5)) % antiqueSpines.length];
        c.fillRect(bx, ny, thickN, depthN);
        c.fillStyle = 'rgba(0,0,0,0.34)';
        c.fillRect(bx + thickN - 1, ny, 1, depthN);
        if (idx % 3 === 0) {
          c.fillStyle = 'rgba(180, 140, 74, 0.28)';
          c.fillRect(bx + 1, ny + 1.5, thickN - 2, 2.2);
        }

        const sy = spineY + spineH + (rndS > 0.85 ? 1.5 : 0);
        c.fillStyle = antiqueSpines[(idx + 3 + Math.floor(rndS * 5)) % antiqueSpines.length];
        c.fillRect(bx, sy, thickS, depthS);
        c.fillStyle = 'rgba(0,0,0,0.34)';
        c.fillRect(bx + thickS - 1, sy, 1, depthS);
        if ((idx + 1) % 3 === 0) {
          c.fillStyle = 'rgba(180, 140, 74, 0.28)';
          c.fillRect(bx + 1, sy + depthS - 3.7, thickS - 2, 2.2);
        }
      }
      c.fillStyle = '#2B1207';
      c.fillRect(0, spineY, w, spineH);
      c.fillStyle = 'rgba(196, 130, 68, 0.16)';
      c.fillRect(0, spineY + 1, w, 1);
    }
  }

  if (vertical) sharedBookshelfVTileCanvas = off;
  else sharedBookshelfHTileCanvas = off;
  return off;
}

function getObstacleTexVersionKey(): string {
  return `${getWinterIceTexture() ? 1 : 0}${getLibraryFloorTexture() ? 1 : 0}${getLibraryCarpetTexture() ? 1 : 0}${getPersianWoolTexture() ? 1 : 0}`;
}

function getLibraryMergedBaseCanvas(
  map: ArenaMap,
  floor: FloorLevel,
  includeStaticShadows: boolean
): HTMLCanvasElement {
  const key = `${map.id}_merged_f${floor}_s${includeStaticShadows ? 1 : 0}_${map.width}x${map.height}_${getObstacleTexVersionKey()}`;
  const existing = libraryMergedFloorCache.get(key);
  if (existing) return existing;

  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const mctx = off.getContext('2d');
  if (mctx) {
    const baseFloor = floor === 0 ? getFloorCanvas(map) : getLibraryUpperFloorCanvas(map);
    mctx.drawImage(baseFloor, 0, 0);

    if (floor === 1 && map.upperZones && map.upperZones.length > 0) {
      mctx.save();
      mctx.beginPath();
      for (const z of map.upperZones) {
        mctx.rect(z.x, z.y, z.w, z.h);
      }
      mctx.clip();
      mctx.drawImage(getStaticAmbientCanvas(map, floor), 0, 0);
      if (includeStaticShadows) {
        mctx.drawImage(getStaticWallShadowsCanvas(map, floor), 0, 0);
      }
      mctx.restore();
    } else {
      mctx.drawImage(getStaticAmbientCanvas(map, floor), 0, 0);
      if (includeStaticShadows) {
        mctx.drawImage(getStaticWallShadowsCanvas(map, floor), 0, 0);
      }
    }
  }
  setBoundedCache(libraryMergedFloorCache, key, off, 6);
  return off;
}

function getStaticObstaclesCanvas(
  map: ArenaMap,
  world: RenderableWorld,
  floorFilter?: FloorLevel
): HTMLCanvasElement {
  const key = `${map.id}_obs_${floorFilter ?? 'all'}_${map.width}x${map.height}_${getObstacleTexVersionKey()}`;
  const existing = staticObstaclesCache.get(key);
  if (existing) return existing;

  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const octx = off.getContext('2d');
  if (octx) {
    for (const wall of map.walls) {
      if (wall.kind === 'library_pillar') continue;
      if (floorFilter !== undefined && !wall.kind?.startsWith('perimeter') && (wall.floor ?? 0) !== floorFilter) {
        continue;
      }
      drawObstacle(octx, wall, world);
    }
  }
  setBoundedCache(staticObstaclesCache, key, off, 6);
  return off;
}

function blitCroppedWorldCanvas(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  map: ArenaMap,
  viewBounds?: ViewBounds
) {
  const sx = viewBounds ? Math.max(0, Math.floor(viewBounds.left)) : 0;
  const sy = viewBounds ? Math.max(0, Math.floor(viewBounds.top)) : 0;
  if (sx >= src.width || sy >= src.height) return;
  const ex = viewBounds ? Math.min(src.width, Math.ceil(viewBounds.right)) : Math.min(src.width, map.width);
  const ey = viewBounds ? Math.min(src.height, Math.ceil(viewBounds.bottom)) : Math.min(src.height, map.height);
  const sw = ex - sx;
  const sh = ey - sy;
  if (sw <= 0 || sh <= 0) return;
  ctx.drawImage(src, sx, sy, sw, sh, sx, sy, sw, sh);
}

function drawObstacle(ctx: CanvasRenderingContext2D, wall: WallRect, world?: RenderableWorld) {
  const kind = wall.kind ?? 'metal';
  const isEmeraldGrove = world?.mapId === 'immersive_outdoors';
  const isCargoDeck = world?.mapId === 'bunkers';
  const isMansion = world?.mapId === 'immersive_mansion';
  const isLibrary = world?.mapId === 'library';
  const isDarkMood = isMansion || isLibrary;

  if (
    kind === 'perimeter_wood' ||
    kind === 'perimeter_hedge' ||
    kind === 'perimeter_steel' ||
    kind === 'perimeter_ice'
  ) {
    if (kind === 'perimeter_hedge') {
      ctx.save();
      ctx.fillStyle = isEmeraldGrove ? '#052E16' : '#14532D';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      const isHoriz = wall.w > wall.h;
      const step = 22;
      if (isHoriz) {
        for (let px = wall.x + 8; px < wall.x + wall.w - 4; px += step) {
          ctx.fillStyle = isEmeraldGrove ? '#064E3B' : '#166534';
          ctx.beginPath();
          ctx.arc(px, wall.y + wall.h * 0.5, wall.h * 0.44, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = isEmeraldGrove ? '#047857' : '#22C55E';
          ctx.beginPath();
          ctx.arc(px - 2, wall.y + wall.h * 0.42, wall.h * 0.24, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (let py = wall.y + 8; py < wall.y + wall.h - 4; py += step) {
          ctx.fillStyle = isEmeraldGrove ? '#064E3B' : '#166534';
          ctx.beginPath();
          ctx.arc(wall.x + wall.w * 0.5, py, wall.w * 0.44, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = isEmeraldGrove ? '#047857' : '#22C55E';
          ctx.beginPath();
          ctx.arc(wall.x + wall.w * 0.42, py - 2, wall.w * 0.24, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = isEmeraldGrove ? '#065F46' : '#16A34A';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(wall.x + 0.8, wall.y + 0.8, wall.w - 1.6, wall.h - 1.6);
      ctx.restore();
    } else if (kind === 'perimeter_wood') {
      ctx.save();
      if (isLibrary) {
        ctx.fillStyle = '#1B0B05';
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        const libImg = getLibraryFloorTexture();
        if (libImg) {
          const lp = getCachedPattern(ctx, libImg);
          if (lp) {
            ctx.save();
            ctx.globalAlpha = 0.62;
            ctx.fillStyle = lp;
            ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
            ctx.restore();
          }
        }
        ctx.fillStyle = 'rgba(10, 4, 1, 0.45)';
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        ctx.strokeStyle = '#3D1D0E';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
      } else {
        ctx.fillStyle = '#2E1306';
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        const wg = getCachedPattern(ctx, getWoodFurnitureCanvas());
        if (wg) {
          ctx.fillStyle = wg;
          ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        }
        ctx.strokeStyle = '#7C3A16';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
      }
      ctx.restore();
    } else if (kind === 'perimeter_ice') {
      ctx.save();
      ctx.fillStyle = '#0C2548';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      const iceImg = getWinterIceTexture();
      if (iceImg) {
        const pat = getCachedPattern(ctx, iceImg);
        if (pat) {
          ctx.globalAlpha = 0.65;
          ctx.fillStyle = pat;
          ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
          ctx.globalAlpha = 1;
        }
      }
      ctx.strokeStyle = '#7DD3FC';
      ctx.lineWidth = 2;
      ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      const ap = getCachedPattern(ctx, getCargoArmorCanvas());
      if (ap) {
        ctx.fillStyle = ap;
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      }
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
      ctx.restore();
    }
    return;
  }

  // Soft realistic cast ambient shadow onto floor
  ctx.fillStyle = kind === 'pine_tree' ? 'rgba(8, 28, 66, 0.36)' : isDarkMood ? 'rgba(3, 2, 5, 0.62)' : 'rgba(4, 3, 8, 0.48)';
  ctx.beginPath();
  ctx.roundRect(
    wall.x + 9,
    wall.y + 13,
    wall.w,
    wall.h,
    kind === 'tree' || kind === 'rock' || kind === 'pine_tree' ? 24 : 7
  );
  ctx.fill();

  if (kind === 'sofa') {
    const rawFabric = wall.accent ?? '#991B1B';
    // Tone down bright saturated sofa upholstery on dark floors so furniture integrates seamlessly
    const fabric = isLibrary
      ? mixHex(rawFabric, '#3A1110', 0.48)
      : isMansion
        ? mixHex(rawFabric, '#26130B', 0.44)
        : mixHex(rawFabric, '#3B180C', 0.16);
    ctx.save();

    // Carved dark walnut wood plinth base + aged corner feet
    ctx.fillStyle = isDarkMood ? '#230D04' : '#3E1807';
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 7);
    ctx.fill();
    const wg = getCachedPattern(ctx, getWoodFurnitureCanvas());
    if (wg) {
      ctx.fillStyle = wg;
      ctx.fill();
    }

    //Clip upholstery body inside frame
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(wall.x + 4, wall.y + 4, wall.w - 8, wall.h - 8, 5);
    ctx.clip();

    ctx.fillStyle = fabric;
    ctx.fillRect(wall.x + 4, wall.y + 4, wall.w - 8, wall.h - 8);

    // Rich woven velvet / damask upholstery fiber grain (DOORS Library armchair / antique estate texture)
    const woolImg = isLibrary ? (getLibraryCarpetTexture() ?? getPersianWoolTexture()) : getPersianWoolTexture();
    if (woolImg) {
      const wp = getCachedPattern(ctx, woolImg);
      if (wp) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = isDarkMood ? 0.56 : 0.44;
        ctx.fillStyle = wp;
        ctx.fillRect(wall.x + 4, wall.y + 4, wall.w - 8, wall.h - 8);
        ctx.restore();
      }
    }
    const weave = getCachedPattern(ctx, getCarpetWeaveCanvas());
    if (weave) {
      ctx.save();
      ctx.globalAlpha = isDarkMood ? 0.58 : 0.62;
      ctx.fillStyle = weave;
      ctx.fillRect(wall.x + 4, wall.y + 4, wall.w - 8, wall.h - 8);
      ctx.restore();
    }

    // Raised thick tufted backrest ridge along top
    const backGrad = ctx.createLinearGradient(0, wall.y + 4, 0, wall.y + 20);
    backGrad.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
    backGrad.addColorStop(0.55, 'rgba(255, 224, 182, 0.08)');
    backGrad.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = backGrad;
    ctx.fillRect(wall.x + 4, wall.y + 4, wall.w - 8, 16);

    // Weathered seat depth & ambient wear shading
    const depthG = ctx.createLinearGradient(0, wall.y + 18, 0, wall.y + wall.h - 4);
    depthG.addColorStop(0, 'rgba(0, 0, 0, 0.34)');
    depthG.addColorStop(0.35, 'rgba(255, 236, 204, 0.06)');
    depthG.addColorStop(0.85, 'rgba(0, 0, 0, 0.16)');
    depthG.addColorStop(1, 'rgba(0, 0, 0, 0.48)');
    ctx.fillStyle = depthG;
    ctx.fillRect(wall.x + 4, wall.y + 18, wall.w - 8, wall.h - 22);

    // Rolled scrolled armrests with dark mahogany outer piping & worn velvet sheen (no bright white bars!)
    for (const armX of [wall.x + 4, wall.x + wall.w - 19]) {
      const armG = ctx.createLinearGradient(armX, 0, armX + 15, 0);
      armG.addColorStop(0, 'rgba(0, 0, 0, 0.38)');
      armG.addColorStop(0.45, 'rgba(255, 232, 198, 0.11)');
      armG.addColorStop(1, 'rgba(0, 0, 0, 0.44)');
      ctx.fillStyle = armG;
      ctx.beginPath();
      ctx.roundRect(armX, wall.y + 5, 15, wall.h - 10, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(18, 8, 4, 0.62)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Individual stitched cushion crevices & recessed diamond button tufts
    const cushions = wall.w > 110 ? 3 : 2;
    const innerW = wall.w - 38;
    ctx.strokeStyle = 'rgba(10, 4, 2, 0.56)';
    ctx.lineWidth = 1.6;
    for (let i = 1; i < cushions; i++) {
      const sx = wall.x + 19 + (innerW * i) / cushions;
      ctx.beginPath();
      ctx.moveTo(sx, wall.y + 18);
      ctx.lineTo(sx, wall.y + wall.h - 5);
      ctx.stroke();
    }
    for (let i = 0; i < cushions; i++) {
      const tx = wall.x + 19 + (innerW * (i + 0.5)) / cushions;
      const ty = wall.y + wall.h * 0.58;
      // Subtle radial tuft crease
      const tg = ctx.createRadialGradient(tx, ty, 0.5, tx, ty, 8);
      tg.addColorStop(0, 'rgba(8, 3, 2, 0.52)');
      tg.addColorStop(1, 'rgba(8, 3, 2, 0)');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.arc(tx, ty, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1E0D06';
      ctx.beginPath();
      ctx.arc(tx, ty, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle tarnished brass upholstery tack studs along front rail
    ctx.fillStyle = isDarkMood ? 'rgba(168, 124, 58, 0.52)' : 'rgba(212, 168, 76, 0.65)';
    for (let ax = wall.x + 10; ax <= wall.x + wall.w - 10; ax += 14) {
      ctx.fillRect(ax, wall.y + wall.h - 6.5, 2, 2);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(12, 5, 2, 0.72)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(wall.x + 0.7, wall.y + 0.7, wall.w - 1.4, wall.h - 1.4, 7);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (kind === 'bed') {
    const rawDuvet = wall.accent ?? '#9F1239';
    const duvet = isDarkMood
      ? mixHex(rawDuvet, '#24110A', 0.44)
      : mixHex(rawDuvet, '#2B140C', 0.14);
    const linenTone = isDarkMood ? '#B3A694' : '#E2DACB';
    ctx.save();

    // Carved antique walnut headboard & bedstead frame
    ctx.fillStyle = isDarkMood ? '#240E05' : '#3C1806';
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 5);
    ctx.fill();
    const wg = getCachedPattern(ctx, getWoodFurnitureCanvas());
    if (wg) {
      ctx.fillStyle = wg;
      ctx.fill();
    }

    // Thick carved headboard crown bar
    ctx.fillStyle = isDarkMood ? '#341608' : '#54240B';
    ctx.fillRect(wall.x + 2, wall.y + 2, wall.w - 4, 8);

    // Aged cotton mattress sheet (never hospital-bright white!)
    ctx.fillStyle = linenTone;
    ctx.beginPath();
    ctx.roundRect(wall.x + 7, wall.y + 10, wall.w - 14, wall.h - 17, 3);
    ctx.fill();
    const sheetWeave = getCachedPattern(ctx, getCarpetWeaveCanvas());
    if (sheetWeave) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = sheetWeave;
      ctx.fill();
      ctx.restore();
    }

    // Quilted heirloom duvet with woven wool fiber + stitched diamond seams + worn foot-throw
    const duvetX = wall.x + 7;
    const duvetY = wall.y + wall.h * 0.36;
    const duvetW = wall.w - 14;
    const duvetH = wall.h * 0.64 - 7;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(duvetX, duvetY, duvetW, duvetH, 3);
    ctx.clip();

    ctx.fillStyle = duvet;
    ctx.fillRect(duvetX, duvetY, duvetW, duvetH);

    const woolImg = getPersianWoolTexture();
    if (woolImg) {
      const wp = getCachedPattern(ctx, woolImg);
      if (wp) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = isDarkMood ? 0.56 : 0.42;
        ctx.fillStyle = wp;
        ctx.fillRect(duvetX, duvetY, duvetW, duvetH);
        ctx.restore();
      }
    }
    if (sheetWeave) {
      ctx.save();
      ctx.globalAlpha = 0.52;
      ctx.fillStyle = sheetWeave;
      ctx.fillRect(duvetX, duvetY, duvetW, duvetH);
      ctx.restore();
    }

    // Quilted diamond stitching seams across the duvet
    ctx.strokeStyle = 'rgba(12, 5, 3, 0.34)';
    ctx.lineWidth = 1;
    for (let sx = duvetX - duvetH; sx < duvetX + duvetW + duvetH; sx += 22) {
      ctx.beginPath();
      ctx.moveTo(sx, duvetY);
      ctx.lineTo(sx + duvetH, duvetY + duvetH);
      ctx.moveTo(sx + duvetH, duvetY);
      ctx.lineTo(sx, duvetY + duvetH);
      ctx.stroke();
    }

    // Folded herringbone throw blanket across bottom foot of bed
    const throwY = duvetY + duvetH * 0.66;
    ctx.fillStyle = 'rgba(18, 9, 5, 0.34)';
    ctx.fillRect(duvetX, throwY - 2, duvetW, duvetH - (throwY - duvetY) + 2);
    ctx.strokeStyle = 'rgba(204, 174, 122, 0.24)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(duvetX, throwY);
    ctx.lineTo(duvetX + duvetW, throwY);
    ctx.stroke();

    // Turned-down top cuff sheet edge & crease shadow
    ctx.fillStyle = isDarkMood ? 'rgba(196, 182, 158, 0.42)' : 'rgba(255, 248, 232, 0.46)';
    ctx.fillRect(duvetX, duvetY, duvetW, 8);
    ctx.fillStyle = 'rgba(10, 4, 2, 0.38)';
    ctx.fillRect(duvetX, duvetY + 8, duvetW, 2.5);

    const qGrad = ctx.createLinearGradient(duvetX, duvetY, duvetX + duvetW, duvetY + duvetH);
    qGrad.addColorStop(0, 'rgba(255, 240, 210, 0.08)');
    qGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
    qGrad.addColorStop(1, 'rgba(6, 3, 2, 0.44)');
    ctx.fillStyle = qGrad;
    ctx.fillRect(duvetX, duvetY, duvetW, duvetH);
    ctx.restore();

    // Twin shaded antique linen pillows with stitched welt seams
    const pw = (wall.w - 34) / 2;
    for (const px of [wall.x + 12, wall.x + 22 + pw]) {
      const pg = ctx.createRadialGradient(px + pw * 0.42, wall.y + 19, 2, px + pw * 0.5, wall.y + 23, pw * 0.72);
      pg.addColorStop(0, isDarkMood ? '#CFC2AE' : '#F4EEE2');
      pg.addColorStop(1, isDarkMood ? '#7C7060' : '#B5AA99');
      ctx.fillStyle = pg;
      ctx.strokeStyle = 'rgba(42, 24, 14, 0.52)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.roundRect(px, wall.y + 13, pw, 20, 4);
      ctx.fill();
      ctx.stroke();
      // Subtle pillow center dimple crease
      ctx.strokeStyle = 'rgba(62, 42, 28, 0.24)';
      ctx.beginPath();
      ctx.moveTo(px + pw * 0.25, wall.y + 23);
      ctx.lineTo(px + pw * 0.75, wall.y + 23);
      ctx.stroke();
    }

    // 4 Carved turned corner bedposts
    for (const [bx, by] of [
      [wall.x + 4, wall.y + 4],
      [wall.x + wall.w - 4, wall.y + 4],
      [wall.x + 4, wall.y + wall.h - 4],
      [wall.x + wall.w - 4, wall.y + wall.h - 4],
    ]) {
      ctx.fillStyle = '#4A210B';
      ctx.strokeStyle = '#180802';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(bx, by, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
    return;
  }

  if (kind === 'table') {
    ctx.save();
    if (isLibrary) {
      // Distinct antique dark mahogany Library study/reading table (DOORS Library photo #1)
      const baseG = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
      baseG.addColorStop(0, '#461E0E');
      baseG.addColorStop(0.5, '#311409');
      baseG.addColorStop(1, '#1C0A04');
      ctx.fillStyle = baseG;
      ctx.beginPath();
      ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 10);
      ctx.fill();

      const wg = getCachedPattern(ctx, getWoodFurnitureCanvas());
      if (wg) {
        ctx.fillStyle = wg;
        ctx.fill();
      }

      // Carved mahogany lip & antique bronze corners
      ctx.strokeStyle = 'rgba(18, 7, 2, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(184, 134, 72, 0.24)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(wall.x + 7, wall.y + 7, wall.w - 14, wall.h - 14, 6);
      ctx.stroke();

      // Dark oxblood leather inlaid writing blotter in center
      const padW = Math.min(wall.w - 30, Math.max(46, wall.w * 0.48));
      const padH = Math.min(wall.h - 22, Math.max(26, wall.h * 0.56));
      const padX = wall.x + (wall.w - padW) * 0.5;
      const padY = wall.y + (wall.h - padH) * 0.5;
      ctx.fillStyle = '#2B100E';
      ctx.beginPath();
      ctx.roundRect(padX, padY, padW, padH, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(166, 120, 62, 0.34)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Aged open parchment folio + antique brass inkwell
      if (wall.w >= 76 && wall.h >= 46) {
        const cx = wall.x + wall.w * 0.5;
        const cy = wall.y + wall.h * 0.5;
        ctx.fillStyle = '#3E1C0E';
        ctx.fillRect(cx - 17, cy - 11, 34, 22);
        ctx.fillStyle = '#C7B89A';
        ctx.fillRect(cx - 15, cy - 9, 14, 18);
        ctx.fillStyle = '#B8A686';
        ctx.fillRect(cx + 1, cy - 9, 14, 18);
        ctx.strokeStyle = 'rgba(66, 44, 28, 0.45)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy - 5);
        ctx.lineTo(cx - 4, cy - 5);
        ctx.moveTo(cx - 12, cy);
        ctx.lineTo(cx - 4, cy);
        ctx.moveTo(cx + 4, cy - 5);
        ctx.lineTo(cx + 12, cy - 5);
        ctx.stroke();

        // Small tarnished brass candlestick/inkwell beside folio
        ctx.fillStyle = '#9C7338';
        ctx.beginPath();
        ctx.arc(cx + 22, cy - 6, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    // Carved dark oak/walnut banquet table for Wooden Mansion & Manor Foyer
    const baseG = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
    if (isMansion) {
      baseG.addColorStop(0, '#4E240E');
      baseG.addColorStop(0.5, '#381808');
      baseG.addColorStop(1, '#210D04');
    } else {
      baseG.addColorStop(0, '#783914');
      baseG.addColorStop(0.5, '#5D290C');
      baseG.addColorStop(1, '#3D1705');
    }
    ctx.fillStyle = baseG;
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 8);
    ctx.fill();

    const wg = getCachedPattern(ctx, getWoodFurnitureCanvas());
    if (wg) {
      ctx.fillStyle = wg;
      ctx.fill();
    }

    // Recessed beveled inlaid timber molding & corner iron brackets
    ctx.fillStyle = isMansion ? 'rgba(204, 148, 86, 0.08)' : 'rgba(255, 220, 168, 0.14)';
    ctx.fillRect(wall.x + 2, wall.y + 2, wall.w - 4, 2.5);
    ctx.strokeStyle = 'rgba(22, 8, 2, 0.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(wall.x + 8, wall.y + 8, wall.w - 16, wall.h - 16);

    ctx.fillStyle = '#26211E';
    for (const [cx, cy] of [
      [wall.x + 2, wall.y + 2],
      [wall.x + wall.w - 10, wall.y + 2],
      [wall.x + 2, wall.y + wall.h - 10],
      [wall.x + wall.w - 10, wall.y + wall.h - 10],
    ]) {
      ctx.fillRect(cx, cy, 8, 8);
    }

    // Woven antique burgundy/velvet table runner with fabric weave + gold embroidered hem
    const rx = wall.x + 12;
    const ry = wall.y + wall.h * 0.34;
    const rw = wall.w - 24;
    const rh = wall.h * 0.32;
    ctx.fillStyle = isMansion ? '#5E1515' : '#851A1A';
    ctx.fillRect(rx, ry, rw, rh);
    const woolImg = getPersianWoolTexture();
    if (woolImg) {
      const wp = getCachedPattern(ctx, woolImg);
      if (wp) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = wp;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.restore();
      }
    }
    const weave = getCachedPattern(ctx, getCarpetWeaveCanvas());
    if (weave) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = weave;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.restore();
    }
    ctx.strokeStyle = isMansion ? 'rgba(182, 134, 52, 0.42)' : 'rgba(232, 182, 66, 0.56)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3);

    // Antique tarnished bronze/pewter centerpiece bowl & plate (no loud cartoon yellow!)
    const cx = wall.x + wall.w * 0.5;
    const cy = wall.y + wall.h * 0.5;
    const cpG = ctx.createRadialGradient(cx - 2.5, cy - 2.5, 1.5, cx, cy, 10);
    cpG.addColorStop(0, isMansion ? '#C9A25B' : '#E7C475');
    cpG.addColorStop(0.55, isMansion ? '#856028' : '#AD7B2C');
    cpG.addColorStop(1, '#3D260A');
    ctx.fillStyle = cpG;
    ctx.strokeStyle = 'rgba(20, 10, 4, 0.68)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isMansion ? '#D6B97A' : '#F3DC9A';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (kind === 'bookshelf') {
    ctx.save();
    // Deep dark carved mahogany bookcase matching DOORS Library photo — pre-baked cached tile blit!
    ctx.fillStyle = '#240E06';
    ctx.strokeStyle = '#4A210E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 3);
    ctx.fill();
    ctx.stroke();

    const wg = getCachedPattern(ctx, getWoodFurnitureCanvas());
    if (wg) {
      ctx.fillStyle = wg;
      ctx.fill();
    }

    const vertical = wall.h > wall.w;
    const bayTile = getBookshelfBayTileCanvas(vertical);
    const ix = wall.x + 4;
    const iy = wall.y + 4;
    const iw = Math.max(2, wall.w - 8);
    const ih = Math.max(2, wall.h - 8);

    ctx.save();
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();
    const bookPat = getCachedPattern(ctx, bayTile);
    if (bookPat) {
      const ox = Math.floor(ix);
      const oy = Math.floor(iy);
      ctx.translate(ox, oy);
      ctx.fillStyle = bookPat;
      ctx.fillRect(0, 0, iw, ih);
    }
    ctx.restore();

    // Subtle warm sconce edge highlight + shelf partition ribs + antique iron corner brackets
    ctx.fillStyle = 'rgba(196, 134, 78, 0.14)';
    ctx.fillRect(wall.x + 2, wall.y + 1.5, wall.w - 4, 2);

    ctx.fillStyle = '#2B1207';
    if (vertical) {
      for (let dy = wall.y + 88; dy < wall.y + wall.h - 28; dy += 90) {
        ctx.fillRect(wall.x + 2, dy, wall.w - 4, 4);
      }
    } else {
      for (let dx = wall.x + 88; dx < wall.x + wall.w - 28; dx += 90) {
        ctx.fillRect(dx, wall.y + 2, 4, wall.h - 4);
      }
    }
    ctx.restore();
    return;
  }

  if (kind === 'tree') {
    ctx.save();
    const cx = wall.x + wall.w / 2;
    const cy = wall.y + wall.h / 2;
    const r = Math.min(wall.w, wall.h) * 0.5;
    const tSeed = Math.round(wall.x * 7 + wall.y * 13);

    // Textured bark roots & deep canopy under-shadow
    ctx.fillStyle = '#3B2212';
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 5, r * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // Base dark foliage silhouette (deep ancient forest green on Emerald Grove vs sunlit forest on Meadow)
    ctx.fillStyle = isEmeraldGrove ? '#042512' : '#114424';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Layered multi-tier natural foliage leaf clusters
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + seededRand(tSeed + i * 11) * 0.35;
      const distR = r * (0.36 + seededRand(tSeed + i * 23) * 0.14);
      const lobeR = r * (0.44 + seededRand(tSeed + i * 31) * 0.12);
      const lx = cx + Math.cos(a) * distR;
      const ly = cy + Math.sin(a) * distR;
      const lg = ctx.createRadialGradient(lx - lobeR * 0.25, ly - lobeR * 0.25, 2, lx, ly, lobeR);
      if (isEmeraldGrove) {
        lg.addColorStop(0, i % 2 === 0 ? '#0F6B3B' : '#0B532D');
        lg.addColorStop(0.65, '#063C1F');
        lg.addColorStop(1, '#032211');
      } else {
        lg.addColorStop(0, i % 2 === 0 ? '#3E9429' : '#257B2E');
        lg.addColorStop(0.7, '#166534');
        lg.addColorStop(1, '#0F4422');
      }
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(lx, ly, lobeR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Upper sunlit bough crown
    const crownG = ctx.createRadialGradient(cx - r * 0.22, cy - r * 0.24, 3, cx - r * 0.1, cy - r * 0.12, r * 0.62);
    if (isEmeraldGrove) {
      crownG.addColorStop(0, '#1B7E46');
      crownG.addColorStop(0.55, '#0C592F');
      crownG.addColorStop(1, 'rgba(4, 44, 22, 0)');
    } else {
      crownG.addColorStop(0, '#84CC16');
      crownG.addColorStop(0.55, '#4D9B2A');
      crownG.addColorStop(1, 'rgba(22, 101, 52, 0)');
    }
    ctx.fillStyle = crownG;
    ctx.beginPath();
    ctx.arc(cx - r * 0.1, cy - r * 0.12, r * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // Fine individual organic leaf flecks
    ctx.fillStyle = isEmeraldGrove ? 'rgba(52, 211, 153, 0.22)' : 'rgba(217, 249, 157, 0.42)';
    for (let i = 0; i < 12; i++) {
      const a = seededRand(tSeed + i * 41) * Math.PI * 2;
      const lr = (0.2 + seededRand(tSeed + i * 53) * 0.56) * r;
      ctx.beginPath();
      ctx.ellipse(
        cx + Math.cos(a) * lr,
        cy + Math.sin(a) * lr,
        3.4,
        2.1,
        a,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (kind === 'rock') {
    ctx.save();
    const cx = wall.x + wall.w * 0.5;
    const cy = wall.y + wall.h * 0.5;
    const r = Math.min(wall.w, wall.h) * 0.48;
    const seed = Math.round(wall.x * 11 + wall.y * 17);

    // Organic sculpted multi-faceted boulder contour
    ctx.beginPath();
    const pts = 11;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rad = r * (0.86 + seededRand(seed + i * 19) * 0.18);
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    const g = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.3, 4, cx, cy, r * 1.05);
    g.addColorStop(0, isEmeraldGrove ? '#7B8894' : '#94A3B8');
    g.addColorStop(0.55, isEmeraldGrove ? '#475569' : '#64748B');
    g.addColorStop(1, '#263242');
    ctx.fillStyle = g;
    ctx.fill();

    // Granite mineral texture & cracks clipped to boulder silhouette
    ctx.save();
    ctx.clip();
    const stonePat = getCachedPattern(ctx, getStoneTexCanvas());
    if (stonePat) {
      ctx.globalAlpha = 0.68;
      ctx.fillStyle = stonePat;
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.globalAlpha = 1;
    }

    // Chiseled sunlit stone upper ridge
    ctx.fillStyle = 'rgba(226, 232, 240, 0.24)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.18, cy - r * 0.22, r * 0.52, r * 0.36, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Deep velvety moss cap matching map palette
    ctx.fillStyle = isEmeraldGrove ? '#0F5E32' : '#3F8F29';
    ctx.beginPath();
    ctx.arc(cx + r * 0.32, cy - r * 0.26, r * 0.32, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.08, cy - r * 0.36, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isEmeraldGrove ? '#1F7A44' : '#65A30D';
    ctx.beginPath();
    ctx.arc(cx + r * 0.26, cy - r * 0.32, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (kind === 'pine_tree') {
    ctx.save();
    const cx = wall.x + wall.w / 2;
    const cy = wall.y + wall.h / 2;
    const r = Math.min(wall.w, wall.h) * 0.5;

    // Bark trunk under boughs
    ctx.fillStyle = '#3B2010';
    ctx.beginPath();
    ctx.arc(cx, cy + 4, r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // Tier 1 outermost deep alpine evergreen needles
    const drawStarBoughs = (branches: number, outerR: number, innerR: number, rotOff: number, ox = 0, oy = 0) => {
      ctx.beginPath();
      for (let i = 0; i < branches; i++) {
        const a = (i / branches) * Math.PI * 2 + rotOff;
        const rad = i % 2 === 0 ? outerR : innerR;
        const px = cx + ox + Math.cos(a) * rad;
        const py = cy + oy + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    drawStarBoughs(20, r * 1.03, r * 0.74, 0);
    const pG1 = ctx.createRadialGradient(cx - 4, cy - 4, 4, cx, cy, r);
    pG1.addColorStop(0, '#0F6B4E');
    pG1.addColorStop(1, '#043829');
    ctx.fillStyle = pG1;
    ctx.fill();

    // Tier 2 layered mid pine boughs
    drawStarBoughs(18, r * 0.80, r * 0.54, 0.19, -2, -2);
    const pG2 = ctx.createRadialGradient(cx - 5, cy - 5, 3, cx, cy, r * 0.8);
    pG2.addColorStop(0, '#10B981');
    pG2.addColorStop(1, '#065F46');
    ctx.fillStyle = pG2;
    ctx.fill();

    // Organic sculpted glacier snow patches draped across upper boughs
    ctx.fillStyle = 'rgba(186, 230, 253, 0.92)';
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * 0.92 + i * 0.44;
      ctx.beginPath();
      ctx.ellipse(
        cx + Math.cos(a) * r * 0.56,
        cy + Math.sin(a) * r * 0.56,
        r * 0.22,
        r * 0.12,
        a + Math.PI / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Tier 3 crisp spruce crown + frosted white snow crest
    drawStarBoughs(14, r * 0.48, r * 0.34, 0.35, -3, -3);
    ctx.fillStyle = '#10B981';
    ctx.fill();

    const capG = ctx.createRadialGradient(cx - 6, cy - 6, 2, cx - 3, cy - 3, r * 0.28);
    capG.addColorStop(0, '#FFFFFF');
    capG.addColorStop(0.65, '#E0F2FE');
    capG.addColorStop(1, '#7DD3FC');
    ctx.fillStyle = capG;
    ctx.beginPath();
    ctx.arc(cx - 4, cy - 4, r * 0.27, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  if (kind === 'hedge') {
    ctx.save();
    ctx.fillStyle = isEmeraldGrove ? '#042713' : '#114424';
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 12);
    ctx.fill();

    const hg = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
    if (isEmeraldGrove) {
      hg.addColorStop(0, '#146B3A');
      hg.addColorStop(0.55, '#094E29');
      hg.addColorStop(1, '#043219');
    } else {
      hg.addColorStop(0, '#4D9B2A');
      hg.addColorStop(0.55, '#2E7D2B');
      hg.addColorStop(1, '#166534');
    }
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.roundRect(wall.x + 4, wall.y + 4, wall.w - 8, wall.h - 8, 9);
    ctx.fill();

    // Organic overlapping leaf cluster mounds + blossoms
    const seed = Math.round(wall.x * 5 + wall.y * 9);
    for (let hy = wall.y + 13; hy < wall.y + wall.h - 8; hy += 18) {
      for (let hx = wall.x + 13; hx < wall.x + wall.w - 8; hx += 18) {
        const jx = (seededRand(seed + hx * 3 + hy) - 0.5) * 6;
        const jy = (seededRand(seed + hy * 7 + hx) - 0.5) * 6;
        ctx.fillStyle = isEmeraldGrove
          ? (hx + hy) % 2 === 0
            ? 'rgba(16, 130, 68, 0.45)'
            : 'rgba(5, 58, 28, 0.48)'
          : (hx + hy) % 2 === 0
            ? 'rgba(132, 204, 22, 0.30)'
            : 'rgba(20, 83, 45, 0.30)';
        ctx.beginPath();
        ctx.arc(hx + jx, hy + jy, 9.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = isEmeraldGrove ? '#E11D48' : '#FB7185';
    for (let hy = wall.y + 18; hy < wall.y + wall.h - 12; hy += 30) {
      for (let hx = wall.x + 18; hx < wall.x + wall.w - 12; hx += 30) {
        ctx.beginPath();
        ctx.arc(hx, hy, 2.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    return;
  }

  if (kind === 'mezzanine_rail' || kind === 'stair_rail') {
    ctx.save();
    const isVert = wall.h > wall.w;

    // Grounded drop shadow cast below the dark mahogany balustrade
    ctx.fillStyle = 'rgba(4, 1, 0, 0.56)';
    ctx.beginPath();
    ctx.roundRect(wall.x + 3, wall.y + 4, wall.w, wall.h, 3);
    ctx.fill();

    // Base dark espresso-mahogany rail plinth matching Library floors & bookcases
    ctx.fillStyle = '#1A0A04';
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 2.5);
    ctx.fill();

    const libImg = getLibraryFloorTexture();
    if (libImg) {
      const lp = getCachedPattern(ctx, libImg);
      if (lp) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 2.5);
        ctx.clip();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = lp;
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        ctx.restore();
      }
    }

    // Beveled dark mahogany top handrail molding
    const railG = isVert
      ? ctx.createLinearGradient(wall.x, 0, wall.x + wall.w, 0)
      : ctx.createLinearGradient(0, wall.y, 0, wall.y + wall.h);
    railG.addColorStop(0, '#120602');
    railG.addColorStop(0.24, '#2F150A');
    railG.addColorStop(0.48, '#462111');
    railG.addColorStop(0.76, '#281108');
    railG.addColorStop(1, '#0F0502');
    ctx.fillStyle = railG;
    if (isVert) {
      ctx.fillRect(wall.x + 2, wall.y + 1, wall.w - 4, wall.h - 2);
      ctx.fillStyle = 'rgba(182, 122, 74, 0.20)';
      ctx.fillRect(wall.x + wall.w * 0.5 - 1.2, wall.y + 2, 2.4, wall.h - 4);
    } else {
      ctx.fillRect(wall.x + 1, wall.y + 2, wall.w - 2, wall.h - 4);
      ctx.fillStyle = 'rgba(182, 122, 74, 0.20)';
      ctx.fillRect(wall.x + 2, wall.y + wall.h * 0.5 - 1.2, wall.w - 4, 2.4);
    }

    // Crisp outer dark border
    ctx.strokeStyle = '#0D0402';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(wall.x + 0.5, wall.y + 0.5, wall.w - 1, wall.h - 1, 2.5);
    ctx.stroke();

    // Chamfered square walnut newel posts + subtle antique-bronze finial caps (no bright cartoon dots)
    const drawNewelPost = (cx: number, cy: number, size: number) => {
      const hs = size * 0.5;
      ctx.fillStyle = '#0D0402';
      ctx.fillRect(cx - hs - 1, cy - hs - 1, size + 2, size + 2);
      ctx.fillStyle = '#381A0D';
      ctx.fillRect(cx - hs, cy - hs, size, size);
      ctx.strokeStyle = 'rgba(192, 134, 82, 0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - hs + 0.5, cy - hs + 0.5, size - 1, size - 1);
      ctx.fillStyle = '#6E4826';
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    };

    const step = 64;
    if (isVert) {
      drawNewelPost(wall.x + wall.w * 0.5, wall.y + 6, 11);
      for (let py = wall.y + 18; py < wall.y + wall.h - 14; py += step) {
        ctx.fillStyle = 'rgba(16, 6, 2, 0.72)';
        ctx.fillRect(wall.x + 3, py, wall.w - 6, 2);
        drawNewelPost(wall.x + wall.w * 0.5, py + 10, 9);
      }
      drawNewelPost(wall.x + wall.w * 0.5, wall.y + wall.h - 6, 11);
    } else {
      drawNewelPost(wall.x + 6, wall.y + wall.h * 0.5, 11);
      for (let px = wall.x + 18; px < wall.x + wall.w - 14; px += step) {
        ctx.fillStyle = 'rgba(16, 6, 2, 0.72)';
        ctx.fillRect(px, wall.y + 3, 2, wall.h - 6);
        drawNewelPost(px + 10, wall.y + wall.h * 0.5, 9);
      }
      drawNewelPost(wall.x + wall.w - 6, wall.y + wall.h * 0.5, 11);
    }
    ctx.restore();
    return;
  }

  if (kind === 'library_pillar') {
    drawLibraryPillar(ctx, wall, world);
    return;
  }

  // Metal / Cargo Deck armored pillars (preserving grey color on Cargo Deck with matching brushed stone-metal grain!)
  ctx.save();
  const grad = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
  if (isCargoDeck) {
    grad.addColorStop(0, '#828E9B');
    grad.addColorStop(0.5, '#586370');
    grad.addColorStop(1, '#323B46');
  } else {
    grad.addColorStop(0, '#788CA3');
    grad.addColorStop(0.5, '#4B5E73');
    grad.addColorStop(1, '#2D3A4A');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 4);
  ctx.fill();

  const armorPat = getCachedPattern(ctx, getCargoArmorCanvas());
  if (armorPat) {
    ctx.save();
    ctx.globalAlpha = isCargoDeck ? 0.58 : 0.34;
    ctx.fillStyle = armorPat;
    ctx.fill();
    ctx.restore();
  }

  // Machined bevel edges
  ctx.strokeStyle = isCargoDeck ? 'rgba(226, 232, 240, 0.45)' : '#B8E6E2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wall.x + 1.5, wall.y + wall.h - 1.5);
  ctx.lineTo(wall.x + 1.5, wall.y + 1.5);
  ctx.lineTo(wall.x + wall.w - 1.5, wall.y + 1.5);
  ctx.stroke();

  ctx.strokeStyle = '#141D29';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wall.x + wall.w - 1.5, wall.y + 1.5);
  ctx.lineTo(wall.x + wall.w - 1.5, wall.y + wall.h - 1.5);
  ctx.lineTo(wall.x + 1.5, wall.y + wall.h - 1.5);
  ctx.stroke();

  if (wall.w > 34 && wall.h > 34) {
    const ix = wall.x + 8;
    const iy = wall.y + 8;
    const iw = wall.w - 16;
    const ih = wall.h - 16;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(ix, iy, iw, ih);

    // Horizontal/vertical reinforcement ribs on tall Cargo Deck pillars
    if (isCargoDeck && ih > iw * 1.8) {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 2;
      for (let ry = iy + 36; ry < iy + ih - 24; ry += 48) {
        ctx.beginPath();
        ctx.moveTo(ix, ry);
        ctx.lineTo(ix + iw, ry);
        ctx.stroke();
      }
    } else if (iw >= 28 && ih >= 28 && Math.max(iw / ih, ih / iw) < 3.2) {
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ix + 2, iy + 2);
      ctx.lineTo(ix + iw - 2, iy + ih - 2);
      ctx.moveTo(ix + iw - 2, iy + 2);
      ctx.lineTo(ix + 2, iy + ih - 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#CBD5E1';
    for (const [rx, ry] of [
      [wall.x + 4.5, wall.y + 4.5],
      [wall.x + wall.w - 4.5, wall.y + 4.5],
      [wall.x + 4.5, wall.y + wall.h - 4.5],
      [wall.x + wall.w - 4.5, wall.y + wall.h - 4.5],
    ]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Fast analytic Ray vs AABB intersection distance
function intersectRayAABB(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  rect: WallRect,
  maxDist: number
): number {
  const invDx = dx !== 0 ? 1 / dx : 1e9;
  const invDy = dy !== 0 ? 1 / dy : 1e9;

  const t1 = (rect.x - ox) * invDx;
  const t2 = (rect.x + rect.w - ox) * invDx;
  const t3 = (rect.y - oy) * invDy;
  const t4 = (rect.y + rect.h - oy) * invDy;

  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));

  if (tmax < 0 || tmin > tmax || tmin > maxDist) return maxDist;
  return tmin < 0 ? 0 : tmin;
}

function computeFlashlightPolygon(
  ox: number,
  oy: number,
  angle: number,
  fovRad: number,
  range: number,
  walls: WallRect[]
): Array<{ x: number; y: number }> {
  // Filter to only nearby obstacles for near-zero CPU cost
  const nearby: WallRect[] = [];
  const rPad = range + 20;
  for (const w of walls) {
    if (
      ox + rPad >= w.x &&
      ox - rPad <= w.x + w.w &&
      oy + rPad >= w.y &&
      oy - rPad <= w.y + w.h
    ) {
      nearby.push(w);
    }
  }

  const rayCount = 48;
  const startAngle = angle - fovRad * 0.5;
  const points: Array<{ x: number; y: number }> = [{ x: ox, y: oy }];

  for (let i = 0; i <= rayCount; i++) {
    const a = startAngle + (i / rayCount) * fovRad;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let bestT = range;
    for (const w of nearby) {
      const t = intersectRayAABB(ox, oy, dx, dy, w, bestT);
      if (t < bestT) bestT = t;
    }
    points.push({ x: ox + dx * bestT, y: oy + dy * bestT });
  }

  return points;
}

function normalizeAngleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

type ShadowWedgeQuad = [number, number, number, number, number, number, number, number];

function buildCircleFlashlightShadowWedge(
  ox: number,
  oy: number,
  aimAngle: number,
  fovHalf: number,
  range: number,
  cx: number,
  cy: number,
  r: number
): ShadowWedgeQuad | null {
  const vx = cx - ox;
  const vy = cy - oy;
  const d = Math.hypot(vx, vy);
  if (d <= r + 6 || d >= range) return null;

  const theta = Math.atan2(vy, vx);
  const alpha = Math.asin(Math.min(0.92, r / d));
  if (Math.abs(normalizeAngleDiff(theta, aimAngle)) > fovHalf + alpha + 0.14) return null;

  const a0 = theta - alpha;
  const a1 = theta + alpha;
  // Offset near boundary slightly past entity center so blocker itself stays illuminated while casting a sharp shadow trail behind it
  const nearD = d + r * 0.25;
  const farD = range + 45;
  return [
    ox + Math.cos(a0) * nearD,
    oy + Math.sin(a0) * nearD,
    ox + Math.cos(a0) * farD,
    oy + Math.sin(a0) * farD,
    ox + Math.cos(a1) * farD,
    oy + Math.sin(a1) * farD,
    ox + Math.cos(a1) * nearD,
    oy + Math.sin(a1) * nearD,
  ];
}

function buildRectFlashlightShadowWedge(
  ox: number,
  oy: number,
  aimAngle: number,
  fovHalf: number,
  range: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): ShadowWedgeQuad | null {
  const cx = rx + rw * 0.5;
  const cy = ry + rh * 0.5;
  const vx = cx - ox;
  const vy = cy - oy;
  const d = Math.hypot(vx, vy);
  if (d < 14 || d >= range) return null;

  const baseAngle = Math.atan2(vy, vx);
  const halfDiag = Math.hypot(rw, rh) * 0.5;
  if (Math.abs(normalizeAngleDiff(baseAngle, aimAngle)) > fovHalf + Math.asin(Math.min(0.95, halfDiag / d)) + 0.16) {
    return null;
  }

  const corners = [
    { x: rx, y: ry },
    { x: rx + rw, y: ry },
    { x: rx + rw, y: ry + rh },
    { x: rx, y: ry + rh },
  ];
  let minRel = Infinity;
  let maxRel = -Infinity;
  let minC = corners[0];
  let maxC = corners[0];
  for (const c of corners) {
    const rel = normalizeAngleDiff(Math.atan2(c.y - oy, c.x - ox), baseAngle);
    if (rel < minRel) {
      minRel = rel;
      minC = c;
    }
    if (rel > maxRel) {
      maxRel = rel;
      maxC = c;
    }
  }

  const a0 = Math.atan2(minC.y - oy, minC.x - ox);
  const a1 = Math.atan2(maxC.y - oy, maxC.x - ox);
  // Nudge anchor forward along ray by 10px so crate/TNT/Nitro face & top label stay clearly illuminated
  const nx0 = minC.x + Math.cos(a0) * 10;
  const ny0 = minC.y + Math.sin(a0) * 10;
  const nx1 = maxC.x + Math.cos(a1) * 10;
  const ny1 = maxC.y + Math.sin(a1) * 10;
  const farLen = range + 45;

  return [
    nx0,
    ny0,
    minC.x + Math.cos(a0) * farLen,
    minC.y + Math.sin(a0) * farLen,
    maxC.x + Math.cos(a1) * farLen,
    maxC.y + Math.sin(a1) * farLen,
    nx1,
    ny1,
  ];
}

function tracePoly(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>) {
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
}

function drawLibraryShapeGlyph(
  ctx: CanvasRenderingContext2D,
  shape: LibraryShape,
  cx: number,
  cy: number,
  r: number,
  fill: string
) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#120702';
  ctx.lineWidth = 1.6;
  ctx.beginPath();

  switch (shape) {
    case 'circle':
      ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(cx, cy - r * 0.9);
      ctx.lineTo(cx + r * 0.88, cy + r * 0.78);
      ctx.lineTo(cx - r * 0.88, cy + r * 0.78);
      ctx.closePath();
      break;
    case 'square':
      ctx.roundRect(cx - r * 0.78, cy - r * 0.78, r * 1.56, r * 1.56, 2);
      break;
    case 'diamond':
      ctx.moveTo(cx, cy - r * 0.95);
      ctx.lineTo(cx + r * 0.9, cy);
      ctx.lineTo(cx, cy + r * 0.95);
      ctx.lineTo(cx - r * 0.9, cy);
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? r * 0.96 : r * 0.44;
        const px = cx + Math.cos(a) * rad;
        const py = cy + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 'pentagon':
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const px = cx + Math.cos(a) * r * 0.92;
        const py = cy + Math.sin(a) * r * 0.92;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        const px = cx + Math.cos(a) * r * 0.9;
        const py = cy + Math.sin(a) * r * 0.9;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 'cross': {
      const a = r * 0.34;
      const b = r * 0.88;
      ctx.moveTo(cx - a, cy - b);
      ctx.lineTo(cx + a, cy - b);
      ctx.lineTo(cx + a, cy - a);
      ctx.lineTo(cx + b, cy - a);
      ctx.lineTo(cx + b, cy + a);
      ctx.lineTo(cx + a, cy + a);
      ctx.lineTo(cx + a, cy + b);
      ctx.lineTo(cx - a, cy + b);
      ctx.lineTo(cx - a, cy + a);
      ctx.lineTo(cx - b, cy + a);
      ctx.lineTo(cx - b, cy - a);
      ctx.lineTo(cx - a, cy - a);
      ctx.closePath();
      break;
    }
  }

  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function getStaticLibraryPillarCanvas(wall: WallRect, seq: LibraryShape[]): HTMLCanvasElement {
  const seqKey = seq.join(',');
  const key = `pillar_${wall.w}x${wall.h}_${seqKey}`;
  const existing = staticLibraryPillarCache.get(key);
  if (existing) return existing;

  const pad = 16;
  const off = document.createElement('canvas');
  off.width = Math.ceil(wall.w + pad * 2);
  off.height = Math.ceil(wall.h + pad * 2);
  const pctx = off.getContext('2d');
  if (pctx) {
    const ox = pad;
    const oy = pad;
    const cx = ox + wall.w * 0.5;
    const cy = oy + wall.h * 0.5;

    const bodyGrad = pctx.createLinearGradient(ox, oy, ox + wall.w, oy + wall.h);
    bodyGrad.addColorStop(0, '#36160A');
    bodyGrad.addColorStop(0.5, '#210C05');
    bodyGrad.addColorStop(1, '#120602');
    pctx.fillStyle = bodyGrad;
    pctx.strokeStyle = '#6A3A18';
    pctx.lineWidth = 3;
    pctx.beginPath();
    pctx.roundRect(ox, oy, wall.w, wall.h, 12);
    pctx.fill();
    pctx.stroke();

    const wg = getCachedPattern(pctx, getWoodFurnitureCanvas());
    if (wg) {
      pctx.save();
      pctx.fillStyle = wg;
      pctx.fill();
      pctx.restore();
    }

    pctx.fillStyle = '#2B1107';
    pctx.strokeStyle = 'rgba(182, 126, 56, 0.30)';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.roundRect(ox + 12, oy + 12, wall.w - 24, wall.h - 24, 8);
    pctx.fill();
    pctx.stroke();

    for (const [fx, fy] of [
      [ox + 16, oy + 16],
      [ox + wall.w - 16, oy + 16],
      [ox + 16, oy + wall.h - 16],
      [ox + wall.w - 16, oy + wall.h - 16],
    ]) {
      const glow = pctx.createRadialGradient(fx, fy, 1, fx, fy, 18);
      glow.addColorStop(0, 'rgba(232, 158, 86, 0.56)');
      glow.addColorStop(1, 'rgba(196, 110, 44, 0)');
      pctx.fillStyle = glow;
      pctx.beginPath();
      pctx.arc(fx, fy, 18, 0, Math.PI * 2);
      pctx.fill();

      pctx.fillStyle = '#B87A38';
      pctx.beginPath();
      pctx.arc(fx, fy, 4.6, 0, Math.PI * 2);
      pctx.fill();
    }

    pctx.fillStyle = '#140804';
    pctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
    pctx.lineWidth = 1.6;
    pctx.beginPath();
    pctx.roundRect(cx - 72, cy - 78, 144, 156, 7);
    pctx.fill();
    pctx.stroke();

    pctx.fillStyle = '#FCD34D';
    pctx.font = '800 11px "Outfit", sans-serif';
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.fillText('CIPHER', cx, cy - 64);

    for (let i = 0; i < Math.min(5, seq.length); i++) {
      const rowY = cy - 42 + i * 26;
      pctx.fillStyle = 'rgba(251, 191, 36, 0.1)';
      pctx.beginPath();
      pctx.roundRect(cx - 58, rowY - 11, 116, 22, 4);
      pctx.fill();

      pctx.fillStyle = '#FDE68A';
      pctx.font = '800 13px "JetBrains Mono", monospace';
      pctx.textAlign = 'left';
      pctx.fillText(`${i + 1}.`, cx - 44, rowY + 0.5);

      drawLibraryShapeGlyph(pctx, seq[i], cx + 22, rowY, 9.5, '#FACC15');
    }
  }
  setBoundedCache(staticLibraryPillarCache, key, off, 6);
  return off;
}

function drawLibraryPillar(ctx: CanvasRenderingContext2D, wall: WallRect, world?: RenderableWorld) {
  ctx.save();
  const cx = wall.x + wall.w * 0.5;
  const cy = wall.y + wall.h * 0.5;
  const libState = world?.libraryState;
  const seq = libState?.pillarSequence ?? ['square', 'circle', 'triangle', 'diamond', 'star'];

  // Stamp cached fluted walnut monolith, sconces, and cipher tablet in 1 drawImage
  const staticPad = 16;
  const pillarSprite = getStaticLibraryPillarCanvas(wall, seq);
  ctx.drawImage(pillarSprite, wall.x - staticPad, wall.y - staticPad);

  // 4 Player Escape Doors recessed on N, E, S, W faces of the central pillar (dynamic unlock status)
  const fallbackColors = ['#0EA5E9', '#EF4444', '#FACC15', '#22C55E'];
  const doors = libState?.doors ?? [
    { playerId: 0, side: 'W' as const, x: wall.x, y: cy },
    { playerId: 1, side: 'E' as const, x: wall.x + wall.w, y: cy },
    { playerId: 2, side: 'N' as const, x: cx, y: wall.y },
    { playerId: 3, side: 'S' as const, x: cx, y: wall.y + wall.h },
  ];

  for (const door of doors) {
    const owner = world?.players.find((p) => p.id === door.playerId);
    const prog = libState?.playerProgress.find((pp) => pp.playerId === door.playerId);
    const trimColor = owner?.color ?? fallbackColors[door.playerId % fallbackColors.length];
    const unlocked = Boolean(prog?.unlocked);

    if (door.side === 'W' || door.side === 'E') {
      const dx = door.side === 'W' ? wall.x - 4 : wall.x + wall.w - 10;
      ctx.fillStyle = unlocked ? '#10B981' : '#5C2912';
      ctx.strokeStyle = trimColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(dx, cy - 34, 14, 68, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = unlocked ? '#A7F3D0' : '#FBBF24';
      ctx.beginPath();
      ctx.arc(dx + 7, cy + 16, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const dy = door.side === 'N' ? wall.y - 4 : wall.y + wall.h - 10;
      ctx.fillStyle = unlocked ? '#10B981' : '#5C2912';
      ctx.strokeStyle = trimColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(cx - 34, dy, 68, 14, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = unlocked ? '#A7F3D0' : '#FBBF24';
      ctx.beginPath();
      ctx.arc(cx + 16, dy + 7, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (unlocked) {
      const crownX =
        door.side === 'W' ? wall.x - 24 : door.side === 'E' ? wall.x + wall.w + 24 : cx;
      const crownY =
        door.side === 'N' ? wall.y - 24 : door.side === 'S' ? wall.y + wall.h + 24 : cy;

      ctx.save();
      ctx.translate(crownX, crownY);
      const glowR = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
      glowR.addColorStop(0, 'rgba(250, 204, 21, 0.65)');
      glowR.addColorStop(1, 'rgba(250, 204, 21, 0)');
      ctx.fillStyle = glowR;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = '#451A03';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-10, 6);
      ctx.lineTo(-12, -5);
      ctx.lineTo(-5, 0);
      ctx.lineTo(0, -9);
      ctx.lineTo(5, 0);
      ctx.lineTo(12, -5);
      ctx.lineTo(10, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const rank = prog?.escapedRank ?? (libState?.escapedOrder?.indexOf(door.playerId) ?? -1) + 1;
      if (rank > 0) {
        ctx.fillStyle = '#FEF9C3';
        ctx.strokeStyle = '#140804';
        ctx.lineWidth = 2.6;
        ctx.font = '900 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(`#${rank}`, 0, 14);
        ctx.fillText(`#${rank}`, 0, 14);
      }
      ctx.restore();
    }
  }

  ctx.restore();
}

function getStaticStairCanvas(
  map: ArenaMap,
  st: NonNullable<ArenaMap['stairs']>[number],
  lookingUpFromGround: boolean,
  libFloorImg: HTMLImageElement | null
): HTMLCanvasElement {
  const key = `${map.id}_stair_${st.id}_g${lookingUpFromGround ? 1 : 0}_t${libFloorImg ? 1 : 0}`;
  const existing = staticStairCache.get(key);
  if (existing) return existing;

  const pad = 4;
  const off = document.createElement('canvas');
  off.width = Math.ceil(st.w + pad * 2);
  off.height = Math.ceil(st.h + pad * 2);
  const sctx = off.getContext('2d');
  if (sctx) {
    const ox = pad;
    const oy = pad;
    const lights = getConeLightSources(map);
    const libFloorPat = libFloorImg ? getCachedPattern(sctx, libFloorImg) : null;

    sctx.fillStyle = '#0E0502';
    sctx.strokeStyle = '#2B1308';
    sctx.lineWidth = 2;
    sctx.fillRect(ox, oy, st.w, st.h);
    sctx.strokeRect(ox, oy, st.w, st.h);

    const vertical = st.upDir === 'up' || st.upDir === 'down';
    const steps = 11;
    const railW = 8;

    if (vertical) {
      const stepH = st.h / steps;
      const sideInset = railW;
      const treadW = st.w - sideInset * 2;

      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const elev = st.upDir === 'up' ? 1 - t : t;
        const sy = oy + i * stepH;

        const sxCenter = st.x + st.w * 0.5;
        const syCenter = st.y + i * stepH + stepH * 0.5;
        let lampWarmth = 0;
        for (const l of lights) {
          const d = Math.hypot(sxCenter - l.x, syCenter - l.y);
          if (d < 520) lampWarmth = Math.max(lampWarmth, 1 - d / 520);
        }

        const lightLevel = lookingUpFromGround
          ? Math.min(1, (0.38 + elev * 0.54) * (0.78 + lampWarmth * 0.30))
          : Math.max(0.14, (0.16 + elev * 0.78) * (0.76 + lampWarmth * 0.30));

        const r = Math.round(18 + lightLevel * 44);
        const g = Math.round(9 + lightLevel * 22);
        const b = Math.round(4 + lightLevel * 11);

        const riserDark = `rgb(${Math.round(r * 0.45)}, ${Math.round(g * 0.45)}, ${Math.round(b * 0.45)})`;
        const treadMain = `rgb(${r}, ${g}, ${b})`;
        const nosingWarm = `rgb(${Math.min(255, Math.round(r * 1.24))}, ${Math.min(255, Math.round(g * 1.22))}, ${Math.min(255, Math.round(b * 1.18))})`;

        const treadGrad = sctx.createLinearGradient(0, sy, 0, sy + stepH);
        if (st.upDir === 'up') {
          treadGrad.addColorStop(0, riserDark);
          treadGrad.addColorStop(0.24, treadMain);
          treadGrad.addColorStop(0.84, treadMain);
          treadGrad.addColorStop(1, nosingWarm);
        } else {
          treadGrad.addColorStop(0, nosingWarm);
          treadGrad.addColorStop(0.16, treadMain);
          treadGrad.addColorStop(0.76, treadMain);
          treadGrad.addColorStop(1, riserDark);
        }
        sctx.fillStyle = treadGrad;
        sctx.fillRect(ox + sideInset, sy, treadW, stepH);

        if (libFloorPat) {
          sctx.save();
          sctx.globalAlpha = 0.28 + lightLevel * 0.16;
          sctx.fillStyle = libFloorPat;
          sctx.fillRect(ox + sideInset, sy, treadW, stepH);
          sctx.restore();
        }

        const lipY = st.upDir === 'up' ? sy + stepH - 2.2 : sy + 0.4;
        sctx.fillStyle = `rgba(168, 114, 72, ${0.10 + lightLevel * 0.16})`;
        sctx.fillRect(ox + sideInset + 1, lipY, treadW - 2, 1.8);

        const riserShadowY = st.upDir === 'up' ? sy : sy + stepH - 3.8;
        sctx.fillStyle = 'rgba(3, 1, 0, 0.66)';
        sctx.fillRect(ox + sideInset, riserShadowY, treadW, 3.8);
      }

      for (const rx of [ox + 1, ox + st.w - railW]) {
        const rg = sctx.createLinearGradient(rx, 0, rx + railW, 0);
        rg.addColorStop(0, '#120602');
        rg.addColorStop(0.45, '#3E1D0E');
        rg.addColorStop(1, '#100502');
        sctx.fillStyle = rg;
        sctx.fillRect(rx, oy, railW - 1, st.h);

        sctx.fillStyle = 'rgba(182, 122, 74, 0.18)';
        sctx.fillRect(rx + railW * 0.5 - 1, oy + 2, 1.5, st.h - 4);

        for (const py of [oy + 5, oy + st.h - 5]) {
          sctx.fillStyle = '#0D0402';
          sctx.fillRect(rx - 1, py - 5, railW + 1, 10);
          sctx.fillStyle = '#381A0D';
          sctx.fillRect(rx, py - 4, railW - 1, 8);
          sctx.fillStyle = '#6E4826';
          sctx.fillRect(rx + railW * 0.5 - 1.8, py - 1.5, 3, 3);
        }
      }
    } else {
      const stepW = st.w / steps;
      const treadH = st.h - railW * 2;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const elev = st.upDir === 'left' ? 1 - t : t;
        const sx = ox + i * stepW;
        const lightLevel = lookingUpFromGround
          ? Math.min(1, 0.38 + elev * 0.54)
          : Math.max(0.14, 0.16 + elev * 0.78);
        const r = Math.round(18 + lightLevel * 44);
        const g = Math.round(9 + lightLevel * 22);
        const b = Math.round(4 + lightLevel * 11);
        sctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        sctx.fillRect(sx, oy + railW, stepW, treadH);
        if (libFloorPat) {
          sctx.save();
          sctx.globalAlpha = 0.28 + lightLevel * 0.16;
          sctx.fillStyle = libFloorPat;
          sctx.fillRect(sx, oy + railW, stepW, treadH);
          sctx.restore();
        }
        const lipX = st.upDir === 'left' ? sx + stepW - 2.2 : sx + 0.4;
        sctx.fillStyle = `rgba(168, 114, 72, ${0.12 + lightLevel * 0.18})`;
        sctx.fillRect(lipX, oy + railW, 2, treadH);
        const shadowX = st.upDir === 'left' ? sx : sx + stepW - 3.6;
        sctx.fillStyle = 'rgba(3, 1, 0, 0.62)';
        sctx.fillRect(shadowX, oy + railW, 3.6, treadH);
      }
      for (const ry of [oy + 1, oy + st.h - railW]) {
        sctx.fillStyle = '#2A1207';
        sctx.fillRect(ox, ry, st.w, railW - 1);
        sctx.fillStyle = 'rgba(182, 122, 74, 0.18)';
        sctx.fillRect(ox + 2, ry + railW * 0.5 - 1, st.w - 4, 1.5);
      }
    }
  }
  setBoundedCache(staticStairCache, key, off, 16);
  return off;
}

function drawLibraryStairs(
  ctx: CanvasRenderingContext2D,
  map: ArenaMap,
  world: RenderableWorld,
  libraryBlend: number,
  viewBounds?: ViewBounds
) {
  const stairs = map.stairs ?? [];
  if (stairs.length === 0) return;

  const libFloorImg = getLibraryFloorTexture();
  const lookingUpFromGround = libraryBlend < 0.5;

  ctx.save();
  for (const st of stairs) {
    if (
      viewBounds &&
      (st.x + st.w + 24 < viewBounds.left ||
        st.x - 24 > viewBounds.right ||
        st.y + st.h + 24 < viewBounds.top ||
        st.y - 24 > viewBounds.bottom)
    ) {
      continue;
    }

    const staticStair = getStaticStairCanvas(map, st, lookingUpFromGround, libFloorImg);
    ctx.drawImage(staticStair, st.x - 4, st.y - 4);

    const vertical = st.upDir === 'up' || st.upDir === 'down';
    if (vertical) {
      for (const p of world.players) {
        if (!p.alive) continue;
        if (p.x >= st.x - 16 && p.x <= st.x + st.w + 16 && p.y >= st.y - 24 && p.y <= st.y + st.h + 24) {
          const sg = ctx.createRadialGradient(p.x, p.y + 6, 4, p.x, p.y + 6, 36);
          sg.addColorStop(0, 'rgba(0, 0, 0, 0.48)');
          sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(p.x, p.y + 6, 36, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const gY = st.upDir === 'up' ? st.y + st.h : st.y;
      const uY = st.upDir === 'up' ? st.y : st.y + st.h;
      const depthGrad = ctx.createLinearGradient(0, gY, 0, uY);
      if (lookingUpFromGround) {
        const enterOcc = Math.max(0.08, 0.34 * (1 - libraryBlend * 2));
        depthGrad.addColorStop(0, `rgba(4, 2, 1, ${enterOcc})`);
        depthGrad.addColorStop(0.42, 'rgba(4, 2, 1, 0.05)');
        depthGrad.addColorStop(0.76, 'rgba(188, 122, 68, 0.07)');
        depthGrad.addColorStop(1, 'rgba(202, 134, 78, 0.16)');
      } else {
        const downFade = Math.min(0.92, (libraryBlend - 0.45) * 1.65);
        depthGrad.addColorStop(0, `rgba(4, 2, 1, ${downFade})`);
        depthGrad.addColorStop(0.45, `rgba(4, 2, 1, ${downFade * 0.42})`);
        depthGrad.addColorStop(1, 'rgba(196, 128, 72, 0.12)');
      }
      ctx.fillStyle = depthGrad;
      ctx.fillRect(st.x + 2, st.y + 2, st.w - 4, st.h - 4);

      const midX = st.x + st.w * 0.5;
      const midY = st.y + st.h * 0.5;
      const arrowDir =
        libraryBlend >= 0.5 ? (st.upDir === 'up' ? 1 : -1) : st.upDir === 'up' ? -1 : 1;
      ctx.strokeStyle = 'rgba(182, 140, 86, 0.22)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(midX - 10, midY - arrowDir * 3);
      ctx.lineTo(midX, midY + arrowDir * 6);
      ctx.lineTo(midX + 10, midY - arrowDir * 3);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLibraryBooks(
  ctx: CanvasRenderingContext2D,
  books: LibraryBookSpot[],
  floor: FloorLevel,
  _elapsedTime: number
) {
  ctx.save();
  for (const book of books) {
    if (book.collected || book.floor !== floor) continue;
    const tilt = ((book.id % 5) - 2) * 0.11;

    ctx.save();
    ctx.translate(book.x, book.y);
    ctx.rotate(tilt);

    // Subtle ground contact shadow matching shelf edge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.fillRect(-10, -6, 21, 16);

    // Matte dark antique leather cover blending naturally with dark shelves (no glow or pulse)
    ctx.fillStyle = '#3B1510';
    ctx.strokeStyle = '#140602';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-11, -8, 22, 16, 2);
    ctx.fill();
    ctx.stroke();

    // Aged muted parchment page edge
    ctx.fillStyle = '#7C6D58';
    ctx.fillRect(-8, -6.5, 16, 2.2);

    // Tarnished dark leather spine
    ctx.fillStyle = '#532014';
    ctx.fillRect(-10.5, -8, 3.6, 16);

    // Unlit muted embossed crescent MOON emblem (subtle patina, strictly zero glow)
    ctx.fillStyle = 'rgba(176, 154, 124, 0.54)';
    ctx.beginPath();
    ctx.arc(1.5, 0.6, 4.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3B1510';
    ctx.beginPath();
    ctx.arc(3.3, -0.3, 3.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
  ctx.restore();
}

function drawLibraryMonster(
  ctx: CanvasRenderingContext2D,
  monster: LibraryMonsterState,
  elapsedTime: number
) {
  const r = monster.radius || MONSTER_RADIUS;
  const speed = Math.hypot(monster.vx, monster.vy);
  const strideFreq = monster.mode === 'rage' ? 13.5 : 7.2;
  const strideAmp = Math.min(1, speed / 95);
  const phase = elapsedTime * strideFreq;
  const strideL = Math.sin(phase) * strideAmp;
  const strideR = Math.sin(phase + Math.PI) * strideAmp;
  const liftL = Math.max(0, Math.cos(phase)) * strideAmp;
  const liftR = Math.max(0, Math.cos(phase + Math.PI)) * strideAmp;
  const stunned = monster.stunTimer > 0;
  const raging = !stunned && monster.mode === 'rage';

  // Matte bright orange sculpted flesh palette (rough, zero gloss)
  const orangeBright = stunned ? '#EA580C' : raging ? '#FF6B1A' : '#F97316';
  const orangeMid = stunned ? '#C2410C' : '#EA580C';
  const orangeDark = '#9A3412';
  const orangeDeep = '#431407';

  ctx.save();
  ctx.translate(monster.x, monster.y);

  // Heavy irregular ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.64)';
  ctx.beginPath();
  ctx.moveTo(-36, -24);
  ctx.lineTo(12, -38);
  ctx.lineTo(48, -14);
  ctx.lineTo(44, 24);
  ctx.lineTo(-10, 42);
  ctx.lineTo(-42, 22);
  ctx.closePath();
  ctx.fill();

  // Alternating foot-stomp dust impact rings when actively walking
  if (strideAmp > 0.25) {
    const drawPlantDust = (footX: number, footY: number, lift: number) => {
      if (lift > 0.22) return;
      const a = (1 - lift / 0.22) * 0.28;
      ctx.strokeStyle = `rgba(251, 146, 60, ${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(footX, footY, 16 + (0.22 - lift) * 28, 0, Math.PI * 2);
      ctx.stroke();
    };
    ctx.save();
    ctx.rotate(monster.angle);
    drawPlantDust(strideL * 28 - 4, -22, liftL);
    drawPlantDust(strideR * 28 - 4, 22, liftR);
    ctx.restore();
  }

  ctx.save();
  ctx.rotate(monster.angle);

  // Slight hunched shoulder roll synced to stride
  const torsoTwist = strideL * 0.09;

  // 1. Heavy Animated Alternating Legs & 3-Clawed Stomping Feet (clearly visible front & back!)
  const drawLegAndFoot = (stride: number, lift: number, side: -1 | 1) => {
    const hipX = -14;
    const hipY = side * 14;
    const kneeX = hipX + 6 + stride * 15;
    const kneeY = side * 22;
    const footX = hipX + 12 + stride * 30;
    const footY = side * (23 - lift * 2);
    const footScale = 1 + lift * 0.14;

    // Rough angular leg segment
    ctx.strokeStyle = '#1C0B04';
    ctx.lineWidth = 14;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();

    ctx.strokeStyle = lift > 0.25 ? orangeBright : orangeMid;
    ctx.lineWidth = 9.5;
    ctx.stroke();

    // Sculpted clawed foot silhouette extending outward cleanly
    ctx.save();
    ctx.translate(footX, footY);
    ctx.scale(footScale, footScale);
    ctx.fillStyle = orangeDark;
    ctx.strokeStyle = '#140702';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-12, side * -6);
    ctx.lineTo(4, side * -8);
    ctx.lineTo(17, side * -4);
    ctx.lineTo(13, 0);
    ctx.lineTo(19, side * 3);
    ctx.lineTo(11, side * 6);
    ctx.lineTo(16, side * 9);
    ctx.lineTo(-4, side * 8);
    ctx.lineTo(-14, side * 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rough chiseled top plane on planted foot
    ctx.fillStyle = orangeBright;
    ctx.beginPath();
    ctx.moveTo(-8, side * -3);
    ctx.lineTo(7, side * -3);
    ctx.lineTo(9, side * 3);
    ctx.lineTo(-8, side * 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  drawLegAndFoot(strideL, liftL, -1);
  drawLegAndFoot(strideR, liftR, 1);

  ctx.save();
  ctx.rotate(torsoTwist);

  // 2. Long Gangly Articulated Humanoid Arms + Jagged Claws
  const reachL = 14 + strideR * 18;
  const reachR = 14 + strideL * 18;
  for (const [side, reach] of [
    [-1, reachL],
    [1, reachR],
  ] as const) {
    const shX = 4;
    const shY = side * 34;
    const elX = -4 + reach * 0.45;
    const elY = side * 52;
    const hdX = 24 + reach;
    const hdY = side * 40;

    // Dark rough outline
    ctx.strokeStyle = '#140702';
    ctx.lineWidth = 14;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'bevel';
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(elX, elY);
    ctx.lineTo(hdX, hdY);
    ctx.stroke();

    // Matte bright-orange upper arm & darker forearm
    ctx.strokeStyle = orangeMid;
    ctx.lineWidth = 9.5;
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(elX, elY);
    ctx.stroke();

    ctx.strokeStyle = orangeBright;
    ctx.lineWidth = 8.5;
    ctx.beginPath();
    ctx.moveTo(elX, elY);
    ctx.lineTo(hdX, hdY);
    ctx.stroke();

    // Angular elbow joint cap & rough chiseled hand with 2 hooked claws
    ctx.fillStyle = orangeDark;
    ctx.strokeStyle = '#140702';
    ctx.lineWidth = 2;
    ctx.fillRect(elX - 5, elY - 5, 10, 10);

    ctx.fillStyle = '#1C0D06';
    ctx.beginPath();
    ctx.moveTo(hdX - 4, hdY - side * 5);
    ctx.lineTo(hdX + 12, hdY - side * 8);
    ctx.lineTo(hdX + 18, hdY);
    ctx.lineTo(hdX + 11, hdY + side * 12);
    ctx.lineTo(hdX + 3, hdY + side * 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 3. Top-Down Humanoid Torso (broad hunched shoulders, tapered back & waist, narrow pelvis — NOT a circle!)
  ctx.fillStyle = orangeMid;
  ctx.strokeStyle = '#140702';
  ctx.lineWidth = 3.2;
  ctx.lineJoin = 'bevel';
  ctx.beginPath();
  // Broad angular left shoulder
  ctx.moveTo(18, -38);
  ctx.lineTo(2, -41);
  // Tapers sharply inward at ribcage/waist toward back pelvis
  ctx.lineTo(-14, -24);
  ctx.lineTo(-27, -21);
  ctx.lineTo(-32, -8);
  ctx.lineTo(-32, 8);
  ctx.lineTo(-27, 21);
  ctx.lineTo(-14, 24);
  // Broad angular right shoulder
  ctx.lineTo(2, 41);
  ctx.lineTo(18, 38);
  // Hunched collar/neck bridge
  ctx.lineTo(24, 18);
  ctx.lineTo(24, -18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Rough chiseled matte bright-orange facets across shoulders, spine & lower back (matte low-poly look!)
  ctx.fillStyle = orangeBright;
  // Left deltoid/shoulder slab
  ctx.beginPath();
  ctx.moveTo(15, -34);
  ctx.lineTo(2, -36);
  ctx.lineTo(-8, -22);
  ctx.lineTo(16, -18);
  ctx.closePath();
  ctx.fill();
  // Right deltoid/shoulder slab
  ctx.beginPath();
  ctx.moveTo(15, 34);
  ctx.lineTo(2, 36);
  ctx.lineTo(-8, 22);
  ctx.lineTo(16, 18);
  ctx.closePath();
  ctx.fill();
  // Central back/trapezius wedge
  ctx.beginPath();
  ctx.moveTo(16, -15);
  ctx.lineTo(16, 15);
  ctx.lineTo(-10, 10);
  ctx.lineTo(-14, 0);
  ctx.lineTo(-10, -10);
  ctx.closePath();
  ctx.fill();

  // Darker burnt-orange shadow crevasses & rough vertebral ridge
  ctx.fillStyle = orangeDark;
  ctx.beginPath();
  ctx.moveTo(-12, -18);
  ctx.lineTo(-26, -16);
  ctx.lineTo(-28, 16);
  ctx.lineTo(-12, 18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = orangeDeep;
  for (let vx = -22; vx <= 12; vx += 8) {
    ctx.fillRect(vx, -2.5, 5, 5);
  }

  // Exposed rough bone ribcage shards jutting from sides of torso
  ctx.fillStyle = '#D6C3A5';
  ctx.strokeStyle = '#2A1810';
  ctx.lineWidth = 1.6;
  for (const rx of [-6, 4, 13]) {
    for (const sgn of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(rx - 2, sgn * 16);
      ctx.lineTo(rx + 4, sgn * 31);
      ctx.lineTo(rx + 8, sgn * 28);
      ctx.lineTo(rx + 3, sgn * 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // 4. Forward-Jutting Faceted Figure Head & Toothy Maw (angular matte octagon, no smooth orb)
  const headX = 33;
  ctx.fillStyle = orangeDark;
  ctx.strokeStyle = '#140702';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const hr = i % 2 === 0 ? 25 : 22.5;
    const hx = headX + Math.cos(a) * hr;
    const hy = Math.sin(a) * hr;
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Matte bright-orange brow crown ridge
  ctx.fillStyle = orangeBright;
  ctx.beginPath();
  ctx.moveTo(headX - 18, -14);
  ctx.lineTo(headX + 2, -20);
  ctx.lineTo(headX + 8, -12);
  ctx.lineTo(headX - 12, -4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(headX - 18, 14);
  ctx.lineTo(headX + 2, 20);
  ctx.lineTo(headX + 8, 12);
  ctx.lineTo(headX - 12, 4);
  ctx.closePath();
  ctx.fill();

  // Rough matte circular-polygon gaping mouth cavity facing forward
  const mawX = headX + 8;
  const mawR = 16;
  ctx.fillStyle = stunned ? '#7C2D12' : '#FB923C';
  ctx.strokeStyle = '#140702';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const mx = mawX + Math.cos(a) * mawR;
    const my = Math.sin(a) * mawR;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.lineTo(mx, my);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = stunned ? '#431407' : '#FDBA74';
  ctx.beginPath();
  ctx.arc(mawX, 0, 7.5, 0, Math.PI * 2);
  ctx.fill();

  // Ring of jagged sharp pale teeth lining the mouth
  ctx.fillStyle = stunned ? '#D6C7B2' : '#FFF7ED';
  const teeth = 12;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2 + (raging ? elapsedTime * 1.8 : 0);
    const outerX = mawX + Math.cos(a) * (mawR + 0.5);
    const outerY = Math.sin(a) * (mawR + 0.5);
    const sideX = mawX + Math.cos(a + 0.24) * (mawR - 1);
    const sideY = Math.sin(a + 0.24) * (mawR - 1);
    const tipX = mawX + Math.cos(a + 0.12) * (mawR * 0.45);
    const tipY = Math.sin(a + 0.12) * (mawR * 0.45);
    ctx.beginPath();
    ctx.moveTo(outerX, outerY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(sideX, sideY);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore(); // torsoTwist
  ctx.restore(); // monster.angle

  const slowed = (monster.slowTimer ?? 0) > 0 && !stunned;

  // Stun or Bullet-Slow indicator
  if (stunned) {
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.72)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let s = 0; s < 4; s++) {
      const sa = elapsedTime * 5.2 + (s * Math.PI * 2) / 4;
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(Math.cos(sa) * 34, Math.sin(sa) * 12 - (r + 12), 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (slowed) {
    const slowPulse = 0.55 + 0.3 * Math.sin(elapsedTime * 6.5);
    ctx.strokeStyle = `rgba(56, 189, 248, ${slowPulse.toFixed(2)})`;
    ctx.lineWidth = 2.8;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 9, elapsedTime * 1.4, elapsedTime * 1.4 + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Name tag
  ctx.fillStyle = stunned ? '#FEF08A' : slowed ? '#7DD3FC' : raging ? '#FB923C' : '#FDBA74';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.lineWidth = 3.2;
  ctx.font = '800 13px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  const label = stunned
    ? `THE FIGURE · STUN ${Math.ceil(monster.stunTimer)}s`
    : slowed
      ? `THE FIGURE · SLOWED ${Math.ceil(monster.slowTimer ?? 0)}s`
      : raging
        ? 'THE FIGURE · RAGE!'
        : 'THE FIGURE';
  ctx.strokeText(label, 0, -r - 16);
  ctx.fillText(label, 0, -r - 16);

  ctx.restore();
}

function drawPracticeTarget(ctx: CanvasRenderingContext2D, target: PracticeTarget, elapsedTime: number) {
  const r = target.radius;
  const popScale = Math.min(1, 0.55 + target.age * 4.5);

  ctx.save();
  ctx.translate(target.x, target.y);
  ctx.scale(popScale, popScale);

  // Soft ground shadow
  ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
  ctx.beginPath();
  ctx.arc(3, 5, r + 2, 0, Math.PI * 2);
  ctx.fill();

  // Outer red border ring
  ctx.fillStyle = '#DC2626';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Ring 2: crisp white
  ctx.fillStyle = '#F8FAFC';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.fill();

  // Ring 3: crimson red
  ctx.fillStyle = '#EF4444';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.54, 0, Math.PI * 2);
  ctx.fill();

  // Ring 4: crisp white
  ctx.fillStyle = '#F8FAFC';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
  ctx.fill();

  // Bullseye center
  ctx.fillStyle = '#B91C1C';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
  ctx.fill();

  // Subtle dark outer rim for contrast on snow/light floors
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // Subtle motion ring / direction chevron for moving targets
  if (target.moving) {
    const moveAngle = Math.atan2(target.vy, target.vx);
    const pulse = 0.55 + Math.sin(elapsedTime * 7) * 0.25;
    ctx.strokeStyle = `rgba(254, 240, 138, ${pulse.toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.rotate(moveAngle);
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.moveTo(r + 11, 0);
    ctx.lineTo(r + 4, -5);
    ctx.lineTo(r + 4, 5);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawCardboardBox(ctx: CanvasRenderingContext2D, box: CardboardBox) {
  let alpha = 1;
  let scaleX = 1;
  let scaleY = 1;

  if (box.state === 'spawning') {
    const t = Math.max(0, Math.min(1, 1 - box.stateTimer / CARDBOARD_FADE_IN));
    alpha = t;
    const s = 0.78 + 0.22 * t;
    scaleX = s;
    scaleY = s;
  } else if (box.state === 'punctured') {
    const t = Math.max(0, Math.min(1, box.stateTimer / CARDBOARD_PUNCTURE_FRAME));
    scaleX = 1 + 0.09 * t;
    scaleY = 1 - 0.07 * t;
  } else if (box.state === 'fading') {
    const t = Math.max(0, Math.min(1, box.stateTimer / CARDBOARD_FADE_OUT));
    alpha = t;
    const s = 0.85 + 0.15 * t;
    scaleX = s;
    scaleY = s;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(box.x, box.y);
  ctx.scale(scaleX, scaleY);

  const hw = box.w * 0.5;
  const hh = box.h * 0.5;

  // Soft realistic ground contact shadow
  ctx.fillStyle = 'rgba(4, 3, 8, 0.52)';
  ctx.beginPath();
  ctx.roundRect(-hw + 8, -hh + 11, box.w, box.h, 5);
  ctx.fill();

  // Stamp realistic weathered timber crate texture clipped to box bounds
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-hw, -hh, box.w, box.h, 4);
  ctx.clip();
  ctx.drawImage(getWoodCrateCanvas(), -hw, -hh, box.w, box.h);

  if (box.state === 'punctured') {
    ctx.fillStyle = 'rgba(254, 240, 138, 0.34)';
    ctx.fillRect(-hw, -hh, box.w, box.h);
  }
  ctx.restore();

  // Subtle natural edge occlusion (zero heavy black cartoon outline)
  ctx.strokeStyle = 'rgba(20, 10, 4, 0.52)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(-hw, -hh, box.w, box.h, 4);
  ctx.stroke();

  // Punctured tear & 1-frame impact burst
  if (box.state === 'punctured' || box.state === 'fading') {
    if (box.state === 'punctured') {
      ctx.fillStyle = 'rgba(254, 243, 199, 0.82)';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? hw * 0.92 : hw * 0.4;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Splintered dark puncture cavity with raw timber edges
    ctx.fillStyle = '#2B1508';
    ctx.strokeStyle = '#E6C28E';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.lineTo(-2, -11);
    ctx.lineTo(9, -6);
    ctx.lineTo(12, 5);
    ctx.lineTo(2, 11);
    ctx.lineTo(-9, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function renderArena(
  ctx: CanvasRenderingContext2D,
  world: RenderableWorld,
  joystick: JoystickState,
  canvasWidth: number,
  canvasHeight: number,
  localPlayerId: number,
  camera: CameraState,
  cursorOverlay?: CursorOverlayState
) {
  const map = ARENA_MAPS[world.mapId];
  const isImmersive = world.immersive || map.immersive;
  const isExtraDark = isImmersive && Boolean(world.extraDark);
  const isLibrary = map.id === 'library' && Boolean(world.libraryState);
  const localIds =
    cursorOverlay?.localPlayerIds && cursorOverlay.localPlayerIds.length > 0
      ? cursorOverlay.localPlayerIds
      : [localPlayerId];
  const localIdSet = new Set(localIds);
  const aliveLocalPlayers = world.players.filter((p) => localIdSet.has(p.id) && p.alive);
  const localPlayer =
    aliveLocalPlayers[0] ??
    world.players.find((p) => p.id === localPlayerId) ??
    world.players[0];
  const spectatePlayer =
    isImmersive && cursorOverlay?.spectateTargetId != null && aliveLocalPlayers.length === 0
      ? world.players.find((p) => p.id === cursorOverlay.spectateTargetId && p.alive)
      : undefined;
  const cameraPlayer = spectatePlayer ?? localPlayer;
  const localFloor: FloorLevel = isLibrary ? (cameraPlayer?.floor ?? 0) : 0;
  const libraryBlend = isLibrary
    ? Math.max(0, Math.min(1, cameraPlayer?.stairBlend ?? (localFloor === 1 ? 1 : 0)))
    : 0;

  const isWallOnFloor = (wall: WallRect, target: FloorLevel): boolean => {
    if (!isLibrary) return true;
    if (wall.kind?.startsWith('perimeter')) return true;
    return (wall.floor ?? 0) === target;
  };
  const isPlayerMidStair = (p: RenderPlayer): boolean => {
    if (!isLibrary) return false;
    const sb = p.stairBlend ?? (p.floor === 1 ? 1 : 0);
    return sb > 0.02 && sb < 0.98;
  };
  const isMonsterOnStair = (m: LibraryMonsterState): boolean => {
    for (const st of map.stairs ?? []) {
      if (m.x >= st.x && m.x <= st.x + st.w && m.y >= st.y && m.y <= st.y + st.h) {
        return true;
      }
    }
    return false;
  };

  ctx.save();
  ctx.fillStyle = '#070B14';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const { scale, offsetX, offsetY } = getArenaViewTransform(
    map,
    isImmersive,
    canvasWidth,
    canvasHeight,
    cameraPlayer,
    camera,
    true,
    cursorOverlay?.dt,
    aliveLocalPlayers.length > 1 ? aliveLocalPlayers : undefined
  );

  let shakeX = 0;
  let shakeY = 0;
  if (world.screenShake > 0.2) {
    shakeX = (Math.random() - 0.5) * world.screenShake;
    shakeY = (Math.random() - 0.5) * world.screenShake;
  }

  const worldTx = offsetX + shakeX;
  const worldTy = offsetY + shakeY;

  const invScale = scale > 0.001 ? 1 / scale : 1;
  const cullPad = 140;
  const viewLeft = Math.max(0, -worldTx * invScale - cullPad);
  const viewTop = Math.max(0, -worldTy * invScale - cullPad);
  const viewRight = Math.min(map.width, (canvasWidth - worldTx) * invScale + cullPad);
  const viewBottom = Math.min(map.height, (canvasHeight - worldTy) * invScale + cullPad);
  const viewBounds: ViewBounds = {
    left: viewLeft,
    top: viewTop,
    right: viewRight,
    bottom: viewBottom,
  };
  const inViewRect = (rx: number, ry: number, rw: number, rh: number): boolean =>
    rx + rw >= viewLeft && rx <= viewRight && ry + rh >= viewTop && ry <= viewBottom;
  const inViewCircle = (cx: number, cy: number, r: number): boolean =>
    cx + r >= viewLeft && cx - r <= viewRight && cy + r >= viewTop && cy - r <= viewBottom;
  const blitCroppedFloor = (floorCvs: HTMLCanvasElement) => {
    const sx = Math.max(0, Math.floor(viewLeft));
    const sy = Math.max(0, Math.floor(viewTop));
    const sw = Math.max(1, Math.min(floorCvs.width - sx, Math.ceil(viewRight - sx)));
    const sh = Math.max(1, Math.min(floorCvs.height - sy, Math.ceil(viewBottom - sy)));
    ctx.drawImage(floorCvs, sx, sy, sw, sh, sx, sy, sw, sh);
  };

  ctx.translate(worldTx, worldTy);
  ctx.scale(scale, scale);

  const drawSinglePlayer = (player: RenderPlayer) => {
    const isLocal = player.id === localPlayerId;
    if (!player.alive) {
      if (player.respawnTimer > 0 && player.respawnTimer < 1.0) {
        const sp = map.spawns[player.id];
        if (sp) {
          ctx.save();
          ctx.strokeStyle = player.color;
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = 1 - player.respawnTimer;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 12 + player.respawnTimer * 24, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
      return;
    }

    ctx.save();
    ctx.translate(player.x, player.y);

    const isStunned = player.stunTimer > 0;
    const inPostStunGrace = !isStunned && (player.postStunGraceTimer ?? 0) > 0;
    if (isStunned) {
      ctx.globalAlpha *= 0.52;
    } else if (inPostStunGrace) {
      const gracePulse = 0.5 + 0.16 * Math.sin(world.elapsedTime * 28);
      ctx.globalAlpha *= gracePulse;
    } else if (player.spawnInvulnTimer > 0 && Math.floor(player.spawnInvulnTimer * 18) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    ctx.fillStyle = 'rgba(6, 5, 10, 0.48)';
    ctx.beginPath();
    ctx.ellipse(6, 10, PLAYER_RADIUS * 0.94, PLAYER_RADIUS * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();

    if (world.teamMode === '2V2' && player.team !== undefined) {
      ctx.save();
      ctx.strokeStyle = player.team === 0 ? '#38BDF8' : '#FB7185';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (isLocal) {
      ctx.strokeStyle = `${player.color}70`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (player.ammo > 0 && player.stunTimer <= 0) {
      ctx.save();
      ctx.rotate(player.angle);
      ctx.strokeStyle = hexWithAlpha(player.color, isLocal ? 0.65 : 0.34);
      ctx.lineWidth = isLocal ? 2.4 : 1.8;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(PLAYER_RADIUS + 14, 0);
      ctx.lineTo(PLAYER_RADIUS + (isLocal ? 135 : 68), 0);
      ctx.stroke();
      ctx.restore();
    }

    const skinColor = player.hurtFlashTimer > 0 ? '#FFFFFF' : player.color;
    const accentColor = player.hurtFlashTimer > 0 ? '#FFFFFF' : player.accentColor;

    ctx.fillStyle = hexWithAlpha(skinColor, 0.14);
    ctx.strokeStyle = hexWithAlpha(skinColor, 0.52);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const moveSpeed = Math.hypot(player.vx ?? 0, player.vy ?? 0);
    const moveBlend = Math.min(1, moveSpeed / 160);
    const stride = Math.sin(world.elapsedTime * 15 + player.id * 1.7) * moveBlend;

    ctx.save();
    ctx.rotate(player.angle);

    // Metallic bottom locomotion pods (volumetric shaded treads, no cartoon stroke)
    for (const side of [-1, 1]) {
      const px = stride * 12 * -side;
      const py = side * 23;
      const podGrad = ctx.createRadialGradient(px - 2, py - 1.5, 1.5, px, py, 10);
      podGrad.addColorStop(0, '#475569');
      podGrad.addColorStop(0.55, '#1E293B');
      podGrad.addColorStop(1, '#090D16');
      ctx.fillStyle = podGrad;
      ctx.beginPath();
      ctx.ellipse(px, py, 9.6, 5.8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = hexWithAlpha(skinColor, 0.72);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Spherical side/front manipulator hands (realistic dome shading, zero black cartoon border)
    for (const hy of [-17.5, 17.5]) {
      const handGrad = ctx.createRadialGradient(17.5, hy - 2.5, 1.2, 20, hy, 8.2);
      handGrad.addColorStop(0, '#FFFFFF');
      handGrad.addColorStop(0.28, accentColor);
      handGrad.addColorStop(0.76, skinColor);
      handGrad.addColorStop(1, '#0F172A');
      ctx.fillStyle = handGrad;
      ctx.beginPath();
      ctx.arc(20, hy, 8.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 15, 28, 0.34)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Machined brushed-steel front cannon barrel (subtle bevel, no heavy cartoon line)
    const barrelGrad = ctx.createLinearGradient(0, -8.5, 0, 8.5);
    barrelGrad.addColorStop(0, '#64748B');
    barrelGrad.addColorStop(0.32, '#334155');
    barrelGrad.addColorStop(0.75, '#1E293B');
    barrelGrad.addColorStop(1, '#090E1A');
    ctx.fillStyle = barrelGrad;
    ctx.beginPath();
    ctx.roundRect(20, -8.5, 31, 17, 4.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 15, 28, 0.48)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // Brushed top specular edge on barrel
    ctx.fillStyle = 'rgba(241, 245, 249, 0.22)';
    ctx.fillRect(22, -7.2, 27, 2);

    ctx.fillStyle = '#FACC15';
    ctx.fillRect(25, -6.2, 5, 4.2);
    ctx.fillRect(35, -6.2, 5, 4.2);
    ctx.fillRect(30, 2, 5, 4.2);
    ctx.fillRect(40, 2, 5, 4.2);

    ctx.fillStyle = player.ammo > 0 ? '#FDE047' : '#64748B';
    ctx.fillRect(26, -2.2, 23, 4.4);
    if (player.ammo > 0) {
      ctx.fillStyle = '#FEF9C3';
      ctx.beginPath();
      ctx.arc(50, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const bodyR = 30.5;
    const finish: PlayerSkinFinish = player.finish ?? 'solid';

    if (finish === 'metal' || finish === 'damascus') {
      const shimmerAngle = Math.sin(world.elapsedTime * 1.6 + player.id) * 10;
      const metalGrad = ctx.createLinearGradient(-bodyR, -bodyR + shimmerAngle, bodyR, bodyR - shimmerAngle);
      metalGrad.addColorStop(0, '#F8FAFC');
      metalGrad.addColorStop(0.28, accentColor);
      metalGrad.addColorStop(0.52, '#475569');
      metalGrad.addColorStop(0.76, '#E2E8F0');
      metalGrad.addColorStop(1, '#1E293B');
      ctx.fillStyle = metalGrad;
    } else if (finish === 'matte') {
      const matteGrad = ctx.createRadialGradient(-8, -9, 3, 0, 0, bodyR);
      matteGrad.addColorStop(0, '#474A5A');
      matteGrad.addColorStop(0.45, skinColor);
      matteGrad.addColorStop(1, '#090A0F');
      ctx.fillStyle = matteGrad;
    } else if (finish === 'magma') {
      const magmaGrad = ctx.createLinearGradient(0, -bodyR, 0, bodyR);
      magmaGrad.addColorStop(0, '#1C1917');
      magmaGrad.addColorStop(0.38, '#7F1D1D');
      magmaGrad.addColorStop(0.74, '#EA580C');
      magmaGrad.addColorStop(1, '#FDBA74');
      ctx.fillStyle = magmaGrad;
    } else if (finish === 'synthwave') {
      const synthGrad = ctx.createLinearGradient(-bodyR * 0.5, -bodyR, bodyR * 0.5, bodyR);
      synthGrad.addColorStop(0, '#EC4899');
      synthGrad.addColorStop(0.5, '#7E22CE');
      synthGrad.addColorStop(1, '#22D3EE');
      ctx.fillStyle = synthGrad;
    } else if (finish === 'toxic_slime') {
      const toxGrad = ctx.createLinearGradient(0, -bodyR, 0, bodyR);
      toxGrad.addColorStop(0, '#D9F99D');
      toxGrad.addColorStop(0.32, '#84CC16');
      toxGrad.addColorStop(0.75, '#15803D');
      toxGrad.addColorStop(1, '#052E16');
      ctx.fillStyle = toxGrad;
    } else if (finish === 'frosted_ice') {
      const iceGrad = ctx.createRadialGradient(-9, -10, 3, 0, 0, bodyR);
      iceGrad.addColorStop(0, '#FFFFFF');
      iceGrad.addColorStop(0.3, '#E0F2FE');
      iceGrad.addColorStop(0.72, '#38BDF8');
      iceGrad.addColorStop(1, '#075985');
      ctx.fillStyle = iceGrad;
    } else if (finish === 'oil_slick') {
      const oilGrad = ctx.createRadialGradient(-8, -9, 4, 0, 0, bodyR);
      oilGrad.addColorStop(0, '#2DD4BF');
      oilGrad.addColorStop(0.34, '#6366F1');
      oilGrad.addColorStop(0.68, '#A21CAF');
      oilGrad.addColorStop(1, '#090D16');
      ctx.fillStyle = oilGrad;
    } else if (finish === 'plasma_core') {
      const pGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, bodyR);
      pGrad.addColorStop(0, '#581C87');
      pGrad.addColorStop(0.65, '#1E0B36');
      pGrad.addColorStop(1, '#090514');
      ctx.fillStyle = pGrad;
    } else if (finish === 'galaxy') {
      const gGrad = ctx.createRadialGradient(-8, -8, 3, 0, 0, bodyR);
      gGrad.addColorStop(0, '#312E81');
      gGrad.addColorStop(0.55, '#130F2E');
      gGrad.addColorStop(1, '#020617');
      ctx.fillStyle = gGrad;
    } else if (finish === 'amber_fossil') {
      const amGrad = ctx.createRadialGradient(-9, -9, 3, 0, 0, bodyR);
      amGrad.addColorStop(0, '#FEF08A');
      amGrad.addColorStop(0.35, '#F59E0B');
      amGrad.addColorStop(0.78, '#B45309');
      amGrad.addColorStop(1, '#451A03');
      ctx.fillStyle = amGrad;
    } else if (finish === 'molten_cracks') {
      ctx.fillStyle = '#1C1917';
    } else if (finish === 'cyber_matrix') {
      ctx.fillStyle = '#03150B';
    } else if (finish === 'electric_arc') {
      const eGrad = ctx.createRadialGradient(-6, -6, 4, 0, 0, bodyR);
      eGrad.addColorStop(0, '#0284C7');
      eGrad.addColorStop(0.6, '#0C4A6E');
      eGrad.addColorStop(1, '#041224');
      ctx.fillStyle = eGrad;
    } else if (finish === 'hologram') {
      const hGrad = ctx.createRadialGradient(-6, -6, 3, 0, 0, bodyR);
      hGrad.addColorStop(0, 'rgba(34, 211, 238, 0.65)');
      hGrad.addColorStop(0.65, 'rgba(8, 145, 178, 0.42)');
      hGrad.addColorStop(1, 'rgba(22, 78, 99, 0.85)');
      ctx.fillStyle = hGrad;
    } else if (finish === 'kintsugi') {
      const kGrad = ctx.createRadialGradient(-9, -10, 4, 0, 0, bodyR);
      kGrad.addColorStop(0, '#FFFFFF');
      kGrad.addColorStop(0.42, '#F5F5F4');
      kGrad.addColorStop(0.82, '#D6D3D1');
      kGrad.addColorStop(1, '#78716C');
      ctx.fillStyle = kGrad;
    } else if (finish === 'animated_sparkle') {
      const pulse = 0.5 + 0.5 * Math.sin(world.elapsedTime * 4.2);
      const sparkGrad = ctx.createRadialGradient(-8, -9, 3, 0, 0, bodyR);
      sparkGrad.addColorStop(0, '#FFFFFF');
      sparkGrad.addColorStop(0.22, pulse > 0.5 ? '#FEF9C3' : accentColor);
      sparkGrad.addColorStop(0.68, skinColor);
      sparkGrad.addColorStop(1, '#451A03');
      ctx.fillStyle = sparkGrad;
    } else {
      const bodyGrad = ctx.createRadialGradient(-9, -10, 4, 0, 0, bodyR);
      bodyGrad.addColorStop(0, finish === 'mummy' || finish === 'camo' || finish === 'hazard' ? '#F8FAFC' : '#FFFFFF');
      bodyGrad.addColorStop(0.24, accentColor);
      bodyGrad.addColorStop(0.7, skinColor);
      bodyGrad.addColorStop(1, '#0F172A');
      ctx.fillStyle = bodyGrad;
    }

    ctx.beginPath();
    ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
    ctx.fill();

    // Textured & animated surface finish overlay clipped strictly INSIDE bodyR (no exterior light/glow bleed)
    if (
      finish !== 'solid' &&
      finish !== 'matte' &&
      finish !== 'magma' &&
      finish !== 'synthwave' &&
      finish !== 'toxic_slime'
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, bodyR - 0.5, 0, Math.PI * 2);
      ctx.clip();

      if (finish === 'fish_scale') {
        const fsPat = getCachedPattern(ctx, getSkinTextureCanvas('fish_scale'));
        if (fsPat) {
          ctx.fillStyle = fsPat;
          ctx.fillRect(-bodyR, -bodyR, bodyR * 2, bodyR * 2);
        }
      } else if (finish === 'wood') {
        const wPat = getCachedPattern(ctx, getSkinTextureCanvas('wood'));
        if (wPat) {
          ctx.fillStyle = wPat;
          ctx.fillRect(-bodyR, -bodyR, bodyR * 2, bodyR * 2);
        }
      } else if (finish === 'metal') {
        const sweep = Math.sin(world.elapsedTime * 1.9 + player.id * 1.3) * 14;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-bodyR + sweep, -bodyR);
        ctx.lineTo(sweep, bodyR);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
        ctx.lineWidth = 1.1;
        for (let ly = -24; ly <= 24; ly += 6) {
          ctx.beginPath();
          ctx.moveTo(-bodyR, ly);
          ctx.lineTo(bodyR, ly);
          ctx.stroke();
        }
      } else if (finish === 'animated_sparkle') {
        for (let s = 0; s < 5; s++) {
          const phase = world.elapsedTime * 2.8 + s * 1.25;
          const tw = 0.5 + 0.5 * Math.sin(phase * 2.1);
          const dist = 10 + (s % 3) * 7.5;
          const ang = phase * 0.55 + s * 1.3;
          const sx = Math.cos(ang) * dist;
          const sy = Math.sin(ang) * dist;
          const sz = 2.4 + tw * 3.4;

          ctx.fillStyle = `rgba(255, 253, 225, ${0.42 + tw * 0.56})`;
          ctx.beginPath();
          ctx.moveTo(sx, sy - sz);
          ctx.lineTo(sx + sz * 0.28, sy - sz * 0.28);
          ctx.lineTo(sx + sz, sy);
          ctx.lineTo(sx + sz * 0.28, sy + sz * 0.28);
          ctx.lineTo(sx, sy + sz);
          ctx.lineTo(sx - sz * 0.28, sy + sz * 0.28);
          ctx.lineTo(sx - sz, sy);
          ctx.lineTo(sx - sz * 0.28, sy - sz * 0.28);
          ctx.closePath();
          ctx.fill();
        }
      } else if (finish === 'billiard_stripe') {
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(-bodyR, -bodyR, bodyR * 2, bodyR * 2);
        ctx.fillStyle = skinColor;
        ctx.fillRect(-bodyR, -13, bodyR * 2, 26);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-bodyR, -13);
        ctx.lineTo(bodyR, -13);
        ctx.moveTo(-bodyR, 13);
        ctx.lineTo(bodyR, 13);
        ctx.stroke();
      } else if (finish === 'two_tone') {
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(-bodyR, 0, bodyR * 2, bodyR);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-bodyR, 0);
        ctx.lineTo(bodyR, 0);
        ctx.stroke();
      } else if (finish === 'racing_stripe') {
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(-bodyR, -7, bodyR * 2, 14);
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-bodyR, -2, bodyR * 2, 4);
      } else if (finish === 'carbon_fiber') {
        const carbPat = getCachedPattern(ctx, getCarbonWeaveCanvas());
        if (carbPat) {
          ctx.fillStyle = carbPat;
          ctx.fillRect(-bodyR, -bodyR, bodyR * 2, bodyR * 2);
        }
      } else if (finish === 'frosted_ice') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-20, -14);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-14, 15);
        ctx.moveTo(-4, -3);
        ctx.lineTo(14, -18);
        ctx.moveTo(4, 9);
        ctx.lineTo(18, 17);
        ctx.stroke();
      } else if (finish === 'oil_slick') {
        const shift = Math.sin(world.elapsedTime * 1.4 + player.id) * 16;
        const irid = ctx.createLinearGradient(-bodyR + shift, -bodyR, bodyR - shift, bodyR);
        irid.addColorStop(0, 'rgba(45, 212, 191, 0.45)');
        irid.addColorStop(0.35, 'rgba(232, 121, 249, 0.42)');
        irid.addColorStop(0.68, 'rgba(250, 204, 21, 0.30)');
        irid.addColorStop(1, 'rgba(56, 189, 248, 0.40)');
        ctx.fillStyle = irid;
        ctx.fillRect(-bodyR, -bodyR, bodyR * 2, bodyR * 2);
      } else if (finish === 'plasma_core') {
        const pulse = 0.85 + 0.15 * Math.sin(world.elapsedTime * 5.2 + player.id);
        const core = ctx.createRadialGradient(-2, 0, 1, -2, 0, 18 * pulse);
        core.addColorStop(0, '#FFFFFF');
        core.addColorStop(0.3, '#E879F9');
        core.addColorStop(0.7, 'rgba(56, 189, 248, 0.55)');
        core.addColorStop(1, 'rgba(88, 28, 135, 0)');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(-2, 0, 19, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(232, 121, 249, 0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(-2, 0, 21, 9, world.elapsedTime * 1.8, 0, Math.PI * 2);
        ctx.stroke();
      } else if (finish === 'galaxy') {
        const neb = ctx.createRadialGradient(-6, -4, 2, -4, 0, 24);
        neb.addColorStop(0, 'rgba(192, 132, 252, 0.55)');
        neb.addColorStop(0.55, 'rgba(56, 189, 248, 0.25)');
        neb.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = neb;
        ctx.fillRect(-bodyR, -bodyR, bodyR * 2, bodyR * 2);
        const stars = [[-16, -12, 1.3], [-8, 14, 1.5], [-21, 4, 1.1], [2, -19, 1.4], [-3, -2, 1.8], [8, 18, 1.2], [-14, 20, 1.0]];
        for (let s = 0; s < stars.length; s++) {
          const [sx, sy, sr] = stars[s];
          const tw = 0.55 + 0.45 * Math.sin(world.elapsedTime * 3.2 + s * 1.7 + player.id);
          ctx.fillStyle = `rgba(255, 255, 255, ${tw})`;
          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (finish === 'amber_fossil') {
        ctx.fillStyle = 'rgba(69, 26, 3, 0.62)';
        const shards = [
          [[-14, -8], [-5, -15], [-2, -4]],
          [[-16, 10], [-7, 4], [-10, 17]],
          [[-2, 11], [6, 16], [0, 21]],
          [[-6, -18], [4, -22], [1, -13]],
        ];
        for (const tri of shards) {
          ctx.beginPath();
          ctx.moveTo(tri[0][0], tri[0][1]);
          ctx.lineTo(tri[1][0], tri[1][1]);
          ctx.lineTo(tri[2][0], tri[2][1]);
          ctx.closePath();
          ctx.fill();
        }
      } else if (finish === 'molten_cracks') {
        const scroll = (world.elapsedTime * 8 + player.id * 7) % 24;
        const glow = 0.72 + 0.28 * Math.sin(world.elapsedTime * 4.2 + player.id);
        ctx.strokeStyle = `rgba(249, 115, 22, ${glow})`;
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-26, -18 + scroll * 0.25);
        ctx.lineTo(-10, -4);
        ctx.lineTo(-18, 16);
        ctx.moveTo(-10, -4);
        ctx.lineTo(4, -14);
        ctx.moveTo(-8, 4);
        ctx.lineTo(8, 18);
        ctx.stroke();
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (finish === 'cyber_matrix') {
        const drop = (world.elapsedTime * 26) % 28;
        for (let col = -22; col <= 10; col += 8) {
          const y1 = ((col * 7 + drop) % 52) - 26;
          ctx.fillStyle = col % 16 === 0 ? '#4ADE80' : '#22D3EE';
          ctx.fillRect(col, y1, 3, 7);
          ctx.fillRect(col, ((y1 + 26 + 22) % 52) - 26, 3, 5);
        }
      } else if (finish === 'electric_arc') {
        const flicker = Math.sin(world.elapsedTime * 19 + player.id * 3);
        ctx.strokeStyle = '#7DD3FC';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-22, -12);
        ctx.lineTo(-10, -2 + flicker * 3);
        ctx.lineTo(-2, -10 - flicker * 2);
        ctx.lineTo(6, 4);
        ctx.moveTo(-18, 12);
        ctx.lineTo(-6, 5 - flicker * 3);
        ctx.lineTo(4, 15);
        ctx.stroke();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.0;
        ctx.stroke();
      } else if (finish === 'mummy') {
        const mPat = getCachedPattern(ctx, getSkinTextureCanvas('mummy'));
        if (mPat) {
          ctx.fillStyle = mPat;
          ctx.fillRect(-bodyR, -bodyR, bodyR * 2, bodyR * 2);
        }
      } else if (finish === 'camo') {
        const spots: Array<[number, number, number, string]> = [
          [-14, -12, 11, '#365314'],
          [-4, 10, 12, '#78350F'],
          [-18, 6, 9, '#A16207'],
          [3, -14, 10, '#14532D'],
          [-2, -2, 8, '#D97706'],
        ];
        for (const [cx, cy, r, col] of spots) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * 0.72, cx * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (finish === 'hazard') {
        ctx.fillStyle = '#0F172A';
        for (let sx = -56; sx <= 56; sx += 14) {
          ctx.beginPath();
          ctx.moveTo(sx, -bodyR);
          ctx.lineTo(sx + 7, -bodyR);
          ctx.lineTo(sx - 18, bodyR);
          ctx.lineTo(sx - 25, bodyR);
          ctx.closePath();
          ctx.fill();
        }
      } else if (finish === 'damascus') {
        const dPat = getCachedPattern(ctx, getSkinTextureCanvas('damascus'));
        if (dPat) {
          ctx.fillStyle = dPat;
          ctx.fillRect(-bodyR, -bodyR, bodyR * 2, bodyR * 2);
        }
      } else if (finish === 'hologram') {
        const scanY = ((world.elapsedTime * 22) % 48) - 24;
        ctx.strokeStyle = 'rgba(165, 243, 252, 0.35)';
        ctx.lineWidth = 1.0;
        for (let y = -24; y <= 24; y += 5) {
          ctx.beginPath();
          ctx.moveTo(-bodyR, y);
          ctx.lineTo(bodyR, y);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(207, 250, 254, 0.45)';
        ctx.fillRect(-bodyR, scanY, bodyR * 2, 3);
        ctx.strokeStyle = 'rgba(103, 232, 249, 0.85)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, bodyR - 2.6, 0, Math.PI * 2);
        ctx.stroke();
      } else if (finish === 'kintsugi') {
        ctx.strokeStyle = '#57534E';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-24, -14);
        ctx.lineTo(-9, -3);
        ctx.lineTo(-16, 17);
        ctx.moveTo(-9, -3);
        ctx.lineTo(6, -15);
        ctx.stroke();
        ctx.strokeStyle = '#FBBF24';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // Spherical 3D ambient lighting wrap on textured finishes so every skin sits naturally in the world
      const domeWrap = ctx.createRadialGradient(-10, -11, 2, 0, 0, bodyR);
      domeWrap.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
      domeWrap.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
      domeWrap.addColorStop(0.85, 'rgba(8, 12, 22, 0.28)');
      domeWrap.addColorStop(1, 'rgba(4, 7, 14, 0.56)');
      ctx.fillStyle = domeWrap;
      ctx.fillRect(-bodyR, -bodyR, bodyR * 2, bodyR * 2);

      ctx.restore();
    }

    // Soft natural ambient occlusion rim (replaces heavy cartoon black outline)
    ctx.strokeStyle = 'rgba(8, 12, 22, 0.36)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
    ctx.stroke();

    if (finish !== 'matte' && finish !== 'mummy' && finish !== 'camo' && finish !== 'hazard') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.lineWidth = 3.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, bodyR - 6, -Math.PI * 0.85, -Math.PI * 0.35);
      ctx.stroke();
      ctx.restore();
    }

    // Player-ID rear stabilizers / ears / wings / tail with realistic bevel shading (no black cartoon outlines)
    ctx.strokeStyle = 'rgba(10, 15, 28, 0.34)';
    ctx.lineWidth = 1.1;
    if (player.id === 1) {
      const finGrad = ctx.createLinearGradient(-22, -34, 6, 34);
      finGrad.addColorStop(0, accentColor);
      finGrad.addColorStop(0.5, skinColor);
      finGrad.addColorStop(1, '#0F172A');
      ctx.fillStyle = finGrad;
      ctx.beginPath();
      ctx.moveTo(-6, -22);
      ctx.lineTo(-22, -34);
      ctx.lineTo(6, -27);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-6, 22);
      ctx.lineTo(-22, 34);
      ctx.lineTo(6, 27);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (player.id === 2) {
      const crownGrad = ctx.createLinearGradient(-34, -24, -17, 24);
      crownGrad.addColorStop(0, '#FEF08A');
      crownGrad.addColorStop(0.6, '#FACC15');
      crownGrad.addColorStop(1, '#A16207');
      ctx.fillStyle = crownGrad;
      ctx.beginPath();
      ctx.moveTo(-17, -19);
      ctx.lineTo(-30, -24);
      ctx.lineTo(-24, -7);
      ctx.lineTo(-34, 0);
      ctx.lineTo(-24, 7);
      ctx.lineTo(-30, 24);
      ctx.lineTo(-17, 19);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (player.id === 0) {
      const podGrad = ctx.createLinearGradient(-21, -33, -3, 33);
      podGrad.addColorStop(0, accentColor);
      podGrad.addColorStop(0.6, skinColor);
      podGrad.addColorStop(1, '#1E293B');
      ctx.fillStyle = podGrad;
      ctx.beginPath();
      ctx.roundRect(-21, -33, 18, 8, 4);
      ctx.roundRect(-21, 25, 18, 8, 4);
      ctx.fill();
      ctx.stroke();
    } else {
      const tailGrad = ctx.createLinearGradient(-38, -17, -24, 17);
      tailGrad.addColorStop(0, accentColor);
      tailGrad.addColorStop(0.6, skinColor);
      tailGrad.addColorStop(1, '#0F172A');
      ctx.fillStyle = tailGrad;
      ctx.beginPath();
      ctx.moveTo(-24, -10);
      ctx.lineTo(-38, -17);
      ctx.lineTo(-32, 0);
      ctx.lineTo(-38, 17);
      ctx.lineTo(-24, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Recessed glossy dark visor cavity + brushed metallic bezel rim
    ctx.fillStyle = '#060A12';
    ctx.beginPath();
    ctx.ellipse(13, 0, 9.5, 17.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (isStunned) {
      // Visor eyes powered OFF / shut when stunned
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.34)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(12.2, -9.6);
      ctx.lineTo(16.8, -5.0);
      ctx.moveTo(16.8, -9.6);
      ctx.lineTo(12.2, -5.0);
      ctx.moveTo(12.2, 5.0);
      ctx.lineTo(16.8, 9.6);
      ctx.moveTo(16.8, 5.0);
      ctx.lineTo(12.2, 9.6);
      ctx.stroke();
    } else {
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(14.5, -7.2, 4.4, 0, Math.PI * 2);
      ctx.arc(14.5, 7.2, 4.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(16, -8.3, 1.7, 0, Math.PI * 2);
      ctx.arc(16, 6.1, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    if (player.ammo > 0) {
      for (let a = 0; a < player.ammo; a++) {
        const pipAngle = -Math.PI / 2 + (a - (player.ammo - 1) / 2) * 0.28;
        const px = Math.cos(pipAngle) * (PLAYER_RADIUS + 10);
        const py = Math.sin(pipAngle) * (PLAYER_RADIUS + 10);
        const pipGrad = ctx.createRadialGradient(px - 1.2, py - 1.2, 0.5, px, py, 4.5);
        pipGrad.addColorStop(0, '#FEF9C3');
        pipGrad.addColorStop(0.55, '#FACC15');
        pipGrad.addColorStop(1, '#B45309');
        ctx.fillStyle = pipGrad;
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    if (isStunned) {
      ctx.save();
      ctx.globalAlpha = 0.96;

      ctx.save();
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.6)';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 6, world.elapsedTime * 7, world.elapsedTime * 7 + Math.PI * 1.35);
      ctx.stroke();

      // Jagged flickering electric discharge bolts around stunned player
      for (let b = 0; b < 4; b++) {
        const flicker = Math.sin(world.elapsedTime * 42 + b * 2.1);
        if (flicker < -0.25) continue;
        const baseA = world.elapsedTime * 4.5 + (b * Math.PI) / 2 + flicker * 0.25;
        const r0 = PLAYER_RADIUS * 0.55;
        const r1 = PLAYER_RADIUS * 0.92;
        const r2 = PLAYER_RADIUS + 11;
        const zig = (b % 2 === 0 ? 1 : -1) * 0.22;
        ctx.strokeStyle = b % 2 === 0 ? '#7DD3FC' : '#FEF08A';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(Math.cos(baseA) * r0, Math.sin(baseA) * r0);
        ctx.lineTo(Math.cos(baseA + zig) * r1, Math.sin(baseA + zig) * r1);
        ctx.lineTo(Math.cos(baseA - zig * 0.6) * r2, Math.sin(baseA - zig * 0.6) * r2);
        ctx.stroke();
      }

      for (let s = 0; s < 3; s++) {
        const sa = world.elapsedTime * 6 + (s * Math.PI * 2) / 3;
        const sx = Math.cos(sa) * 24;
        const sy = Math.sin(sa) * 8 - (PLAYER_RADIUS + 12);
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (inPostStunGrace) {
      // Clear pulsing sky-blue pass-through ring during the 0.5s post-stun bullet grace window
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.strokeStyle = '#7DD3FC';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -world.elapsedTime * 45;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const hpRatio = player.hp / player.maxHp;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
    ctx.fillRect(-28, PLAYER_RADIUS + 10, 56, 6);
    ctx.fillStyle = hpRatio > 0.5 ? '#22C55E' : hpRatio > 0.25 ? '#FACC15' : '#EF4444';
    ctx.fillRect(-26.5, PLAYER_RADIUS + 11.5, 53 * hpRatio, 3);

    const labelText =
      world.teamMode === '2V2' && player.team !== undefined
        ? `[${player.team === 0 ? 'A' : 'B'}] ${player.name}`
        : player.name;
    ctx.fillStyle =
      world.teamMode === '2V2' && player.team !== undefined
        ? player.team === 0
          ? '#E0F2FE'
          : '#FFE4E6'
        : '#F8FAFC';
    ctx.strokeStyle = 'rgba(9, 13, 22, 0.9)';
    ctx.lineWidth = 3;
    ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeText(labelText, 0, -PLAYER_RADIUS - 16);
    ctx.fillText(labelText, 0, -PLAYER_RADIUS - 16);

    ctx.restore();
  };

  const drawPickupsOnFloor = (targetFloor?: FloorLevel) => {
    for (const item of world.pickups) {
      if (targetFloor !== undefined && (item.floor ?? 0) !== targetFloor) continue;
      if (item.kind === 'tnt' && item.armed && item.countdown !== undefined) {
        if (!inViewCircle(item.x, item.y, TNT_BLAST_RADIUS + 8)) continue;
        const progress = 1 - Math.max(0, item.countdown) / (item.maxCountdown || 3);
        const pulse = 0.5 + 0.5 * Math.sin(world.elapsedTime * (8 + progress * 16));
        ctx.save();
        ctx.fillStyle = `rgba(239, 68, 68, ${0.11 + progress * 0.16})`;
        ctx.beginPath();
        ctx.arc(item.x, item.y, TNT_BLAST_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(254, 202, 202, ${0.5 + pulse * 0.45})`;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(item.x, item.y, TNT_BLAST_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const item of world.pickups) {
      if (targetFloor !== undefined && (item.floor ?? 0) !== targetFloor) continue;
      if (!inViewCircle(item.x, item.y, 64)) continue;
      const isCratePickup = item.kind === 'tnt' || item.kind === 'nitro';
      const bob = isCratePickup ? 0 : Math.sin(item.age * 4.2 + item.id) * 2.5;
      ctx.save();

      if (item.kind === 'tnt') {
        const s = 29;
        ctx.fillStyle = 'rgba(4, 3, 8, 0.56)';
        ctx.beginPath();
        ctx.roundRect(item.x - s + 9, item.y - s + 13, s * 2, s * 2, 6);
        ctx.fill();
      } else if (item.kind === 'nitro') {
        const s = 24;
        ctx.fillStyle = 'rgba(4, 3, 8, 0.56)';
        ctx.beginPath();
        ctx.roundRect(item.x - s + 8, item.y - s + 12, s * 2, s * 2, 6);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(4, 3, 8, 0.48)';
        ctx.beginPath();
        ctx.ellipse(item.x + 5, item.y + 11, item.radius * 0.95, item.radius * 0.56, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.translate(item.x, item.y + bob);

      if (item.kind === 'bullet') {
        const glowR = item.radius + 7;
        const glowSprite = getGlowSprite(`pickup_bullet_${glowR}`, glowR, (gc, r) => {
          const glow = gc.createRadialGradient(0, 0, 4, 0, 0, r);
          glow.addColorStop(0, 'rgba(56, 189, 248, 0.32)');
          glow.addColorStop(0.75, 'rgba(56, 189, 248, 0.14)');
          glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
          gc.fillStyle = glow;
          gc.beginPath();
          gc.arc(0, 0, r, 0, Math.PI * 2);
          gc.fill();
        });
        ctx.drawImage(glowSprite, -glowR, -glowR, glowR * 2, glowR * 2);

        ctx.fillStyle = 'rgba(14, 165, 233, 0.16)';
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.rotate(-0.62);
        ctx.fillStyle = '#EF4444';
        ctx.strokeStyle = '#090D16';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-11, -6, 14, 12, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#F8FAFC';
        ctx.beginPath();
        ctx.roundRect(1, -5.5, 10, 11, [1, 5, 5, 1]);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FACC15';
        ctx.fillRect(-12, -5.5, 3, 11);
        ctx.restore();
      } else if (item.kind === 'nitro') {
        const s = 24;
        // Pure neon-green industrial Nitro container — strictly NO outer glow
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(-s, -s, s * 2, s * 2, 4);
        ctx.clip();
        ctx.drawImage(getNitroCrateCanvas(), -s, -s, s * 2, s * 2);
        ctx.restore();

        ctx.strokeStyle = 'rgba(3, 31, 14, 0.56)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(-s, -s, s * 2, s * 2, 4);
        ctx.stroke();
      } else if (item.kind === 'tnt') {
        const armed = Boolean(item.armed);
        const cd = Math.max(0, item.countdown ?? 3);
        const secText = Math.ceil(cd).toString();
        const flash = armed && cd < 1.0 && Math.floor(cd * 10) % 2 === 0;
        const s = 29;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(-s, -s, s * 2, s * 2, 4);
        ctx.clip();
        ctx.drawImage(getTntCrateCanvas(), -s, -s, s * 2, s * 2);
        if (flash) {
          ctx.fillStyle = 'rgba(254, 202, 202, 0.52)';
          ctx.fillRect(-s, -s, s * 2, s * 2);
        }
        ctx.restore();

        ctx.strokeStyle = 'rgba(25, 4, 4, 0.62)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(-s, -s, s * 2, s * 2, 4);
        ctx.stroke();

        // Stenciled "TNT" label directly on the aged center plate
        ctx.fillStyle = '#450A0A';
        ctx.font = armed ? '900 13.5px "Outfit", sans-serif' : '900 15.5px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TNT', 0, armed ? -4 : 1);

        if (armed) {
          ctx.strokeStyle = '#FEF08A';
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.arc(0, 0, s + 8, -Math.PI / 2, -Math.PI / 2 + (cd / 3) * Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#1C0404';
          ctx.lineWidth = 2.6;
          ctx.font = '800 12px "JetBrains Mono", monospace';
          ctx.strokeText(`${secText}s`, 0, 11);
          ctx.fillText(`${secText}s`, 0, 11);
        }
      } else if (item.kind === 'medkit') {
        const s = 20;
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, item.radius + 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#065F46';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.roundRect(-s, -s, s * 2, s * 2, 7);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#10B981';
        ctx.fillRect(-4, -12, 8, 24);
        ctx.fillRect(-12, -4, 24, 8);
      }
      ctx.restore();
    }
  };

  const drawSpawnPads = () => {
    map.spawns.forEach((sp, idx) => {
      const p = world.players.find((pl) => pl.id === idx);
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 28, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = p ? `${p.color}66` : 'rgba(248,250,252,0.28)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  };

  const activeViewId = cameraPlayer?.id ?? localPlayerId;
  const localProg = isLibrary
    ? world.libraryState?.playerProgress.find((pp) => pp.playerId === activeViewId)
    : undefined;

  if (isLibrary && world.libraryState) {
    const monster = world.libraryState.monster;
    const monsterOnStair = isMonsterOnStair(monster);

    // 1A. Ground Floor (fades smoothly to pitch black as stairBlend -> 1)
    if (libraryBlend < 0.99) {
      blitCroppedFloor(getLibraryMergedBaseCanvas(map, 0, !isExtraDark));
      if (!isExtraDark) {
        drawDynamicLightShadows(ctx, map, world, 0, viewBounds, true);
      }
      drawPickupsOnFloor(0);
      blitCroppedFloor(getStaticObstaclesCanvas(map, world, 0));
      for (const wall of map.walls) {
        if (wall.kind === 'library_pillar' && isWallOnFloor(wall, 0) && inViewRect(wall.x, wall.y, wall.w, wall.h)) {
          drawObstacle(ctx, wall, world);
        }
      }
      for (const box of world.boxes) {
        if ((box.floor ?? 0) === 0 && inViewRect(box.x - box.w * 0.5, box.y - box.h * 0.5, box.w, box.h)) {
          drawCardboardBox(ctx, box);
        }
      }
      if (localProg) {
        drawLibraryBooks(ctx, localProg.books, 0, world.elapsedTime);
      }
      for (const player of world.players) {
        if ((player.floor ?? 0) === 0 && !isPlayerMidStair(player) && inViewCircle(player.x, player.y, 90)) {
          drawSinglePlayer(player);
        }
      }
      if (!monster.transitioning && monster.floor === 0 && !monsterOnStair && inViewCircle(monster.x, monster.y, 110)) {
        drawLibraryMonster(ctx, monster, world.elapsedTime);
      }
    }

    // 1B. Smooth staircase transition darkness curtain obscuring Ground Floor up to pitch black
    if (libraryBlend > 0.01) {
      ctx.fillStyle = libraryBlend >= 0.999 ? '#000000' : `rgba(0, 0, 0, ${Math.min(1, libraryBlend * 1.05)})`;
      ctx.fillRect(viewLeft, viewTop, viewRight - viewLeft, viewBottom - viewTop);
    }

    // 1C. Staircases (viewport-culled + statically cached)
    drawLibraryStairs(ctx, map, world, libraryBlend, viewBounds);

    // 1D. Upper Mezzanine Floor (revealed cleanly; bypass offscreen globalAlpha layer when fully on Upper Floor!)
    if (libraryBlend > 0.01) {
      const needsBlend = libraryBlend < 0.999;
      if (needsBlend) {
        ctx.save();
        ctx.globalAlpha = libraryBlend;
      }
      blitCroppedFloor(getLibraryMergedBaseCanvas(map, 1, !isExtraDark));
      if (!isExtraDark) {
        drawDynamicLightShadows(ctx, map, world, 1, viewBounds, true);
      }
      drawSpawnPads();
      drawPickupsOnFloor(1);
      blitCroppedFloor(getStaticObstaclesCanvas(map, world, 1));
      for (const wall of map.walls) {
        if (wall.kind === 'library_pillar' && isWallOnFloor(wall, 1) && inViewRect(wall.x, wall.y, wall.w, wall.h)) {
          drawObstacle(ctx, wall, world);
        }
      }
      for (const box of world.boxes) {
        if ((box.floor ?? 0) === 1 && inViewRect(box.x - box.w * 0.5, box.y - box.h * 0.5, box.w, box.h)) {
          drawCardboardBox(ctx, box);
        }
      }
      if (localProg) {
        drawLibraryBooks(ctx, localProg.books, 1, world.elapsedTime);
      }
      for (const player of world.players) {
        if ((player.floor ?? 0) === 1 && !isPlayerMidStair(player) && inViewCircle(player.x, player.y, 90)) {
          drawSinglePlayer(player);
        }
      }
      if (!monster.transitioning && monster.floor === 1 && !monsterOnStair && inViewCircle(monster.x, monster.y, 110)) {
        drawLibraryMonster(ctx, monster, world.elapsedTime);
      }
      if (needsBlend) {
        ctx.restore();
      }
    }

    // 1E. Entities on Stairs (drawn AFTER both stairs & upper floor so climbers never clip under upper mezzanine,
    // and Figure smoothly fades in on arrival floor / fades out on departure floor directly along the steps!)
    for (const player of world.players) {
      if (isPlayerMidStair(player) && inViewCircle(player.x, player.y, 90)) {
        drawSinglePlayer(player);
      }
    }
    if (inViewCircle(monster.x, monster.y, 110)) {
      if (monster.transitioning) {
        const prog = Math.max(0, Math.min(1, monster.transitionProgress ?? 0));
        const w0 = monster.fromFloor === 0 ? 1 - prog : monster.toFloor === 0 ? prog : 0;
        const w1 = monster.fromFloor === 1 ? 1 - prog : monster.toFloor === 1 ? prog : 0;
        const transAlpha = w0 * (1 - libraryBlend) + w1 * libraryBlend;
        if (transAlpha > 0.01) {
          ctx.save();
          ctx.globalAlpha *= transAlpha;
          drawLibraryMonster(ctx, monster, world.elapsedTime);
          ctx.restore();
        }
      } else if (
        monsterOnStair &&
        (monster.floor === localFloor || (libraryBlend > 0.05 && libraryBlend < 0.95))
      ) {
        drawLibraryMonster(ctx, monster, world.elapsedTime);
      }
    }
  } else {
    // 1. Standard Single-Floor Rendering
    const floorCanvas = getFloorCanvas(map);
    blitCroppedFloor(floorCanvas);
    drawAmbientArenaLights(ctx, map, world, undefined, viewBounds);
    if (!isExtraDark) {
      drawDynamicLightShadows(ctx, map, world, undefined, viewBounds);
    }
    drawIcePits(ctx, world, map);
    recordAndDrawSnowFootprints(ctx, world, map);
    drawSpawnPads();
    drawPickupsOnFloor();

    blitCroppedFloor(getStaticObstaclesCanvas(map, world));
    for (const box of world.boxes) {
      if (inViewRect(box.x - box.w * 0.5, box.y - box.h * 0.5, box.w, box.h)) {
        drawCardboardBox(ctx, box);
      }
    }
    if (world.practiceTargets) {
      for (const target of world.practiceTargets) {
        if (inViewCircle(target.x, target.y, target.radius + 16)) {
          drawPracticeTarget(ctx, target, world.elapsedTime);
        }
      }
    }
    for (const player of world.players) {
      drawSinglePlayer(player);
    }
  }

  // 7. Compute Multi-Tier Feathered Flashlight Raycast Polygons & Analytic Entity Cast Shadows in Extra Dark Mode
  const flashlightPolys: Array<{
    player: RenderPlayer;
    outerPoly: Array<{ x: number; y: number }>;
    midPoly: Array<{ x: number; y: number }>;
    corePoly: Array<{ x: number; y: number }>;
    entityShadows: ShadowWedgeQuad[];
    range: number;
    isLocal: boolean;
  }> = [];

  if (isExtraDark) {
    const shadowWalls: WallRect[] = map.walls.filter((w) => isWallOnFloor(w, localFloor));
    const monster = isLibrary ? world.libraryState?.monster : undefined;

    for (const p of world.players) {
      if (!p.alive) continue;
      if (isLibrary && (p.floor ?? 0) !== localFloor && !isPlayerMidStair(p)) continue;
      const isLocal = localIdSet.has(p.id);
      const range = isLocal ? 490 : 360;
      if (!inViewCircle(p.x, p.y, range)) continue;

      const pShadowWalls = shadowWalls.filter(
        (w) => w.x <= p.x + range && w.x + w.w >= p.x - range && w.y <= p.y + range && w.y + w.h >= p.y - range
      );
      const baseFov = isLocal ? 1.32 : 1.08;
      const outerFov = baseFov * 1.45;
      const outerPoly = computeFlashlightPolygon(p.x, p.y, p.angle, outerFov, range, pShadowWalls);
      const midPoly = computeFlashlightPolygon(p.x, p.y, p.angle, baseFov * 0.96, range * 0.96, pShadowWalls);
      const corePoly = computeFlashlightPolygon(p.x, p.y, p.angle, baseFov * 0.54, range * 0.9, pShadowWalls);

      const entityShadows: ShadowWedgeQuad[] = [];
      const fovHalf = outerFov * 0.5;

      // Shadows cast by other players on the same floor
      for (const other of world.players) {
        if (!other.alive || other.id === p.id) continue;
        if (Math.abs(other.x - p.x) > range + 40 || Math.abs(other.y - p.y) > range + 40) continue;
        if (isLibrary && (other.floor ?? 0) !== localFloor && !isPlayerMidStair(other)) continue;
        const w = buildCircleFlashlightShadowWedge(
          p.x,
          p.y,
          p.angle,
          fovHalf,
          range,
          other.x,
          other.y,
          PLAYER_RADIUS * 0.86
        );
        if (w) entityShadows.push(w);
      }

      // Shadow cast by The Figure monster in The Library
      if (
        monster &&
        Math.abs(monster.x - p.x) <= range + 50 &&
        Math.abs(monster.y - p.y) <= range + 50 &&
        (!isLibrary || monster.floor === localFloor || monster.transitioning || isMonsterOnStair(monster))
      ) {
        const mw = buildCircleFlashlightShadowWedge(
          p.x,
          p.y,
          p.angle,
          fovHalf,
          range,
          monster.x,
          monster.y,
          (monster.radius || MONSTER_RADIUS) * 0.84
        );
        if (mw) entityShadows.push(mw);
      }

      // Shadows cast by Cardboard Boxes
      for (const box of world.boxes) {
        if (box.state !== 'active' && box.state !== 'spawning') continue;
        if (Math.abs(box.x - p.x) > range + box.w || Math.abs(box.y - p.y) > range + box.h) continue;
        if (isLibrary && (box.floor ?? 0) !== localFloor) continue;
        const bw = buildRectFlashlightShadowWedge(
          p.x,
          p.y,
          p.angle,
          fovHalf,
          range,
          box.x - box.w * 0.5,
          box.y - box.h * 0.5,
          box.w,
          box.h
        );
        if (bw) entityShadows.push(bw);
      }

      // Shadows cast by TNT & Nitro crates
      for (const item of world.pickups) {
        if (item.kind !== 'tnt' && item.kind !== 'nitro') continue;
        if (Math.abs(item.x - p.x) > range + 40 || Math.abs(item.y - p.y) > range + 40) continue;
        if (isLibrary && (item.floor ?? 0) !== localFloor) continue;
        const s = item.kind === 'tnt' ? 28 : 23;
        const pw = buildRectFlashlightShadowWedge(
          p.x,
          p.y,
          p.angle,
          fovHalf,
          range,
          item.x - s,
          item.y - s,
          s * 2,
          s * 2
        );
        if (pw) entityShadows.push(pw);
      }

      flashlightPolys.push({
        player: p,
        outerPoly,
        midPoly,
        corePoly,
        entityShadows,
        range,
        isLocal,
      });
    }
  }

  // 8. Cinematic Additive Light Interaction (Feathered Flashlight Floor Glow with Cast Shadows + Glowing Bullets + Object Rim Light)
  if (isImmersive) {
    // Subtle floating golden forest fireflies in Emerald Grove matching collage mood (cached sprite + culled)
    if (map.floorTheme === 'grass_outdoors') {
      const ffSprite = getFireflySpriteCanvas();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 42; i++) {
        const bx = seededRand(i * 41 + 9) * map.width;
        const by = seededRand(i * 67 + 13) * map.height;
        const fx = bx + Math.sin(world.elapsedTime * 0.7 + i) * 26;
        const fy = by + Math.cos(world.elapsedTime * 0.55 + i * 1.4) * 22;
        if (!inViewCircle(fx, fy, 16)) continue;
        const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(world.elapsedTime * 2.6 + i * 2.1));
        ctx.globalAlpha = 0.45 * twinkle;
        ctx.drawImage(ffSprite, fx - 12, fy - 12, 24, 24);
      }
      ctx.restore();
    }

    // Draw each flashlight onto a half-res scratch buffer, carve out entity shadow wedges, then composite cleanly
    if (flashlightPolys.length > 0) {
      const bScale = 0.5;
      const bw = Math.max(1, Math.ceil(canvasWidth * bScale));
      const bh = Math.max(1, Math.ceil(canvasHeight * bScale));
      const beamCanvas = getBeamScratchCanvas(bw, bh);
      const bctx = beamCanvas.getContext('2d');
      if (bctx) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'lighter';

        for (const fl of flashlightPolys) {
          bctx.save();
          bctx.clearRect(0, 0, bw, bh);
          bctx.scale(bScale, bScale);
          bctx.translate(worldTx, worldTy);
          bctx.scale(scale, scale);

          const strength = fl.isLocal ? 0.14 : 0.08;
          const layers: Array<{ poly: Array<{ x: number; y: number }>; weight: number }> = [
            { poly: fl.outerPoly, weight: 0.45 },
            { poly: fl.midPoly, weight: 0.55 },
            { poly: fl.corePoly, weight: 0.65 },
          ];
          for (const layer of layers) {
            bctx.save();
            tracePoly(bctx, layer.poly);
            bctx.clip();
            const grad = bctx.createRadialGradient(
              fl.player.x,
              fl.player.y,
              12,
              fl.player.x,
              fl.player.y,
              fl.range
            );
            const s = strength * layer.weight;
            grad.addColorStop(0, `rgba(255, 244, 204, ${s})`);
            grad.addColorStop(0.5, `rgba(255, 224, 150, ${s * 0.45})`);
            grad.addColorStop(1, 'rgba(255, 210, 120, 0)');
            bctx.fillStyle = grad;
            bctx.fillRect(
              fl.player.x - fl.range,
              fl.player.y - fl.range,
              fl.range * 2,
              fl.range * 2
            );
            bctx.restore();
          }

          if (fl.entityShadows.length > 0) {
            bctx.globalCompositeOperation = 'destination-out';
            bctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
            for (const q of fl.entityShadows) {
              bctx.beginPath();
              bctx.moveTo(q[0], q[1]);
              bctx.lineTo(q[2], q[3]);
              bctx.lineTo(q[4], q[5]);
              bctx.lineTo(q[6], q[7]);
              bctx.closePath();
              bctx.fill();
            }
          }
          bctx.restore();

          ctx.drawImage(beamCanvas, 0, 0, canvasWidth, canvasHeight);
        }
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const bulletGlowRadius = isExtraDark ? 82 : 52;
    const muzzleSprite = getGlowSprite('bullet_muzzle_95', 95, (gc, r) => {
      const mg = gc.createRadialGradient(0, 0, 2, 0, 0, r);
      mg.addColorStop(0, 'rgba(254, 240, 138, 1)');
      mg.addColorStop(1, 'rgba(254, 240, 138, 0)');
      gc.fillStyle = mg;
      gc.beginPath();
      gc.arc(0, 0, r, 0, Math.PI * 2);
      gc.fill();
    });

    for (const b of world.bullets) {
      if (isLibrary && (b.floor ?? 0) !== localFloor) continue;
      if (!inViewCircle(b.x, b.y, 120)) continue;
      const bGlowSprite = getGlowSprite(`bullet_${b.color}_${bulletGlowRadius}_${isExtraDark ? 1 : 0}`, bulletGlowRadius, (gc, r) => {
        const grad = gc.createRadialGradient(0, 0, 2, 0, 0, r);
        grad.addColorStop(0, hexWithAlpha(b.color, isExtraDark ? 0.48 : 0.3));
        grad.addColorStop(0.45, hexWithAlpha(b.color, isExtraDark ? 0.2 : 0.12));
        grad.addColorStop(1, hexWithAlpha(b.color, 0));
        gc.fillStyle = grad;
        gc.beginPath();
        gc.arc(0, 0, r, 0, Math.PI * 2);
        gc.fill();
      });
      ctx.drawImage(
        bGlowSprite,
        b.x - bulletGlowRadius,
        b.y - bulletGlowRadius,
        bulletGlowRadius * 2,
        bulletGlowRadius * 2
      );

      if (b.age < 0.2) {
        const flashA = (1 - b.age / 0.2) * 0.45;
        ctx.save();
        ctx.globalAlpha = flashA;
        ctx.drawImage(muzzleSprite, b.x - 95, b.y - 95, 190, 190);
        ctx.restore();
      }

      for (const wall of map.walls) {
        if (wall.kind?.startsWith('perimeter')) continue;
        if (wall.x > b.x + 88 || wall.x + wall.w < b.x - 88 || wall.y > b.y + 88 || wall.y + wall.h < b.y - 88) {
          continue;
        }
        if (!isWallOnFloor(wall, localFloor)) continue;
        const cx = Math.max(wall.x, Math.min(b.x, wall.x + wall.w));
        const cy = Math.max(wall.y, Math.min(b.y, wall.y + wall.h));
        const d = Math.hypot(b.x - cx, b.y - cy);
        if (d < 88) {
          const intensity = (1 - d / 88) * (isExtraDark ? 0.56 : 0.32);
          const rimGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 66);
          rimGrad.addColorStop(0, hexWithAlpha(b.color, intensity));
          rimGrad.addColorStop(1, hexWithAlpha(b.color, 0));
          ctx.fillStyle = rimGrad;
          ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        }
      }
    }

    const tntGlowSprite = getGlowSprite('tnt_armed_aura_82', 82, (gc, r) => {
      const g = gc.createRadialGradient(0, 0, 4, 0, 0, r);
      g.addColorStop(0, 'rgba(239, 68, 68, 1)');
      g.addColorStop(1, 'rgba(239, 68, 68, 0)');
      gc.fillStyle = g;
      gc.beginPath();
      gc.arc(0, 0, r, 0, Math.PI * 2);
      gc.fill();
    });
    for (const item of world.pickups) {
      if (isLibrary && (item.floor ?? 0) !== localFloor) continue;
      if (item.kind === 'tnt' && item.armed) {
        if (!inViewCircle(item.x, item.y, 96)) continue;
        const pulse = 0.5 + 0.5 * Math.sin(world.elapsedTime * 14);
        const r = 64 + pulse * 18;
        ctx.save();
        ctx.globalAlpha = isExtraDark ? 0.32 : 0.16;
        ctx.drawImage(tntGlowSprite, item.x - r, item.y - r, r * 2, r * 2);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  // 8b. Universal Split-Second Explosion Blast Light Interaction (ALL Modes & ALL Maps)
  if (world.explosions.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const ex of world.explosions) {
      if (isLibrary && (ex.floor ?? 0) !== localFloor) continue;
      const lightR = ex.radius * 1.85;
      if (!inViewCircle(ex.x, ex.y, lightR)) continue;
      const t = Math.min(1, ex.age / Math.max(0.01, ex.duration));
      // Rapid blinding peak in first 25%, warm realistic amber afterglow taper
      const flash = t < 0.18 ? t / 0.18 : Math.pow(1 - (t - 0.18) / 0.82, 1.35);

      // Ambient blast floor & air bounce illumination
      const g = ctx.createRadialGradient(ex.x, ex.y, 4, ex.x, ex.y, lightR);
      g.addColorStop(0, `rgba(255, 251, 214, ${0.86 * flash})`);
      g.addColorStop(0.28, `rgba(254, 240, 138, ${0.62 * flash})`);
      g.addColorStop(0.62, `rgba(250, 204, 21, ${0.28 * flash})`);
      g.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, lightR, 0, Math.PI * 2);
      ctx.fill();

      // Split-second blast light bouncing off nearby walls & obstacles
      for (const wall of map.walls) {
        if (wall.x > ex.x + lightR || wall.x + wall.w < ex.x - lightR || wall.y > ex.y + lightR || wall.y + wall.h < ex.y - lightR) {
          continue;
        }
        if (!isWallOnFloor(wall, localFloor)) continue;
        const cx = Math.max(wall.x, Math.min(ex.x, wall.x + wall.w));
        const cy = Math.max(wall.y, Math.min(ex.y, wall.y + wall.h));
        const dist = Math.hypot(ex.x - cx, ex.y - cy);
        if (dist < lightR) {
          const bounce = (1 - dist / lightR) * flash * 0.48;
          const rim = ctx.createRadialGradient(cx, cy, 4, cx, cy, 115);
          rim.addColorStop(0, `rgba(254, 240, 138, ${bounce})`);
          rim.addColorStop(0.55, `rgba(250, 204, 21, ${bounce * 0.45})`);
          rim.addColorStop(1, 'rgba(250, 204, 21, 0)');
          ctx.fillStyle = rim;
          ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        }
      }

      // Light bouncing off nearby cover crates
      for (const box of world.boxes) {
        if (isLibrary && (box.floor ?? 0) !== localFloor) continue;
        const dist = Math.hypot(box.x - ex.x, box.y - ex.y);
        if (dist < lightR) {
          const bounce = (1 - dist / lightR) * flash * 0.46;
          ctx.fillStyle = `rgba(254, 240, 138, ${bounce})`;
          ctx.beginPath();
          ctx.roundRect(box.x - box.w * 0.5, box.y - box.h * 0.5, box.w, box.h, 5);
          ctx.fill();
        }
      }

      // Warm golden light hitting nearby players
      for (const pl of world.players) {
        if (!pl.alive) continue;
        if (isLibrary && (pl.floor ?? 0) !== localFloor) continue;
        const dist = Math.hypot(pl.x - ex.x, pl.y - ex.y);
        if (dist < lightR) {
          const bounce = (1 - dist / lightR) * flash * 0.58;
          const pg = ctx.createRadialGradient(pl.x, pl.y, 4, pl.x, pl.y, PLAYER_RADIUS * 1.15);
          pg.addColorStop(0, `rgba(254, 249, 195, ${bounce})`);
          pg.addColorStop(1, 'rgba(250, 204, 21, 0)');
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.arc(pl.x, pl.y, PLAYER_RADIUS * 1.15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // 9. Extra Dark Lighting & Soft-Edge Shadow Mask (half-res buffer with blur for zero hard lines!)
  if (isExtraDark) {
    ctx.restore(); // Exit world transform to composite screen-aligned lightCanvas

    const lightScale = 0.28;
    const lw = Math.max(1, Math.ceil(canvasWidth * lightScale));
    const lh = Math.max(1, Math.ceil(canvasHeight * lightScale));
    const lightCanvas = getLightCanvas(lw, lh);
    const lctx = lightCanvas.getContext('2d');
    if (lctx) {
      lctx.save();
      lctx.clearRect(0, 0, lw, lh);

      lctx.fillStyle = 'rgba(3, 6, 13, 0.86)';
      lctx.fillRect(0, 0, lw, lh);

      lctx.scale(lightScale, lightScale);
      lctx.translate(worldTx, worldTy);
      lctx.scale(scale, scale);
      lctx.globalCompositeOperation = 'destination-out';

      const auraPlayers =
        aliveLocalPlayers.length > 0
          ? aliveLocalPlayers
          : cameraPlayer && cameraPlayer.alive
            ? [cameraPlayer]
            : [];
      for (const ap of auraPlayers) {
        if (isLibrary && (ap.floor ?? 0) !== localFloor && !isPlayerMidStair(ap)) continue;
        const auraR = 215;
        const aura = lctx.createRadialGradient(
          ap.x,
          ap.y,
          24,
          ap.x,
          ap.y,
          auraR
        );
        aura.addColorStop(0, 'rgba(0, 0, 0, 0.98)');
        aura.addColorStop(0.45, 'rgba(0, 0, 0, 0.65)');
        aura.addColorStop(0.8, 'rgba(0, 0, 0, 0.22)');
        aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lctx.fillStyle = aura;
        lctx.beginPath();
        lctx.arc(ap.x, ap.y, auraR, 0, Math.PI * 2);
        lctx.fill();
      }

      if (flashlightPolys.length > 0) {
        const beamCanvas = getBeamScratchCanvas(lw, lh);
        const bctx = beamCanvas.getContext('2d');
        if (bctx) {
          for (const fl of flashlightPolys) {
            bctx.save();
            bctx.clearRect(0, 0, lw, lh);
            bctx.scale(lightScale, lightScale);
            bctx.translate(worldTx, worldTy);
            bctx.scale(scale, scale);

            const peak = fl.isLocal ? 1.0 : 0.6;
            const tiers: Array<{ poly: Array<{ x: number; y: number }>; weight: number }> = [
              { poly: fl.outerPoly, weight: 0.36 },
              { poly: fl.midPoly, weight: 0.48 },
              { poly: fl.corePoly, weight: 0.65 },
            ];
            for (const tier of tiers) {
              bctx.save();
              tracePoly(bctx, tier.poly);
              bctx.clip();
              const beam = bctx.createRadialGradient(
                fl.player.x,
                fl.player.y,
                14,
                fl.player.x,
                fl.player.y,
                fl.range
              );
              const a = Math.min(1, peak * tier.weight);
              beam.addColorStop(0, `rgba(0, 0, 0, ${a})`);
              beam.addColorStop(0.62, `rgba(0, 0, 0, ${a * 0.68})`);
              beam.addColorStop(1, 'rgba(0, 0, 0, 0)');
              bctx.fillStyle = beam;
              bctx.fillRect(
                fl.player.x - fl.range,
                fl.player.y - fl.range,
                fl.range * 2,
                fl.range * 2
              );
              bctx.restore();
            }

            if (fl.entityShadows.length > 0) {
              bctx.globalCompositeOperation = 'destination-out';
              bctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
              for (const q of fl.entityShadows) {
                bctx.beginPath();
                bctx.moveTo(q[0], q[1]);
                bctx.lineTo(q[2], q[3]);
                bctx.lineTo(q[4], q[5]);
                bctx.lineTo(q[6], q[7]);
                bctx.closePath();
                bctx.fill();
              }
            }
            bctx.restore();

            lctx.save();
            lctx.setTransform(1, 0, 0, 1, 0, 0);
            lctx.drawImage(beamCanvas, 0, 0);
            lctx.restore();
          }
        }
      }

      const bulletCutSprite = getGlowSprite('dark_cut_bullet_100', 100, (gc, r) => {
        const bg = gc.createRadialGradient(0, 0, 4, 0, 0, r);
        bg.addColorStop(0, 'rgba(0, 0, 0, 0.94)');
        bg.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
        bg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        gc.fillStyle = bg;
        gc.beginPath();
        gc.arc(0, 0, r, 0, Math.PI * 2);
        gc.fill();
      });
      for (const b of world.bullets) {
        if (isLibrary && (b.floor ?? 0) !== localFloor) continue;
        const br = b.age < 0.2 ? 125 : 88;
        lctx.drawImage(bulletCutSprite, b.x - br, b.y - br, br * 2, br * 2);
      }

      const pickupCutSprite = getGlowSprite('dark_cut_pickup_84', 84, (gc, r) => {
        const pg = gc.createRadialGradient(0, 0, 2, 0, 0, r);
        pg.addColorStop(0, 'rgba(0, 0, 0, 1)');
        pg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        gc.fillStyle = pg;
        gc.beginPath();
        gc.arc(0, 0, r, 0, Math.PI * 2);
        gc.fill();
      });
      for (const item of world.pickups) {
        if (isLibrary && (item.floor ?? 0) !== localFloor) continue;
        const pr = item.kind === 'tnt' ? 84 : 44;
        const strength = item.kind === 'tnt' ? 0.88 : 0.56;
        lctx.save();
        lctx.globalAlpha = strength;
        lctx.drawImage(pickupCutSprite, item.x - pr, item.y - pr, pr * 2, pr * 2);
        lctx.restore();
      }

      for (const ex of world.explosions) {
        if (isLibrary && (ex.floor ?? 0) !== localFloor) continue;
        const t = ex.age / ex.duration;
        const r = ex.radius * 1.65;
        const eg = lctx.createRadialGradient(ex.x, ex.y, 8, ex.x, ex.y, r);
        eg.addColorStop(0, `rgba(0, 0, 0, ${0.95 * (1 - t)})`);
        eg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lctx.fillStyle = eg;
        lctx.beginPath();
        lctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
        lctx.fill();
      }

      lctx.restore();

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(lightCanvas, -12, -12, canvasWidth + 24, canvasHeight + 24);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(worldTx, worldTy);
    ctx.scale(scale, scale);

    for (const player of world.players) {
      if (!player.alive || localIdSet.has(player.id) || player.id === activeViewId) continue;
      if (isLibrary && (player.floor ?? 0) !== localFloor && !isPlayerMidStair(player)) continue;
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      ctx.rotate(player.angle);
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.roundRect(20, -8, 28, 16, 4);
      ctx.fill();
      ctx.restore();
    }

    if (isLibrary && world.libraryState) {
      const m = world.libraryState.monster;
      let monsterGlowVis = 0;
      if (m.transitioning) {
        const prog = Math.max(0, Math.min(1, m.transitionProgress ?? 0));
        const w0 = m.fromFloor === 0 ? 1 - prog : m.toFloor === 0 ? prog : 0;
        const w1 = m.fromFloor === 1 ? 1 - prog : m.toFloor === 1 ? prog : 0;
        monsterGlowVis = w0 * (1 - libraryBlend) + w1 * libraryBlend;
      } else if (m.floor === localFloor || (libraryBlend > 0.05 && libraryBlend < 0.95 && isMonsterOnStair(m))) {
        monsterGlowVis = 1;
      }
      if (monsterGlowVis > 0.01) {
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.angle);
        ctx.globalAlpha = (m.mode === 'rage' ? 0.58 : 0.34) * monsterGlowVis;
        const glow = ctx.createRadialGradient(18, 0, 2, 18, 0, 28);
        glow.addColorStop(0, m.mode === 'rage' ? '#FB923C' : '#F97316');
        glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(18, 0, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // 9b. Volumetric Light Rays & Perimeter Light Fixtures (with Real Cast Shadow Occlusion!)
  drawVolumetricArenaLights(
    ctx,
    map,
    world,
    isExtraDark,
    canvasWidth,
    canvasHeight,
    worldTx,
    worldTy,
    scale,
    isLibrary ? localFloor : undefined,
    viewBounds
  );

  // 9c. Realistic Moving White Fog & Illuminated Fog-Shadow Scattering (Winter Tussle)
  if (map.floorTheme === 'winter_snow') {
    drawWinterFogOverlay(
      ctx,
      map,
      world,
      canvasWidth,
      canvasHeight,
      worldTx,
      worldTy,
      scale,
      viewBounds
    );
  }

  // 10. Glowing Bullets & Trails (floor-filtered on Library)
  for (const b of world.bullets) {
    if (isLibrary && (b.floor ?? 0) !== localFloor) continue;
    if (b.trail && b.trail.length > 1) {
      for (let t = 0; t < b.trail.length - 1; t++) {
        const pt = b.trail[t];
        const nextPt = b.trail[t + 1];
        const alpha = ((t + 1) / b.trail.length) * (isImmersive ? 0.72 : 0.55);
        ctx.strokeStyle = hexWithAlpha(b.color, alpha);
        ctx.lineWidth = Math.max(1.5, (t / b.trail.length) * b.radius * 1.7);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(nextPt.x, nextPt.y);
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.translate(b.x, b.y);
    if (isImmersive) {
      ctx.fillStyle = hexWithAlpha(b.color, 0.32);
      ctx.beginPath();
      ctx.arc(0, 0, b.radius + 7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(0, 0, b.radius + 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, b.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 11. Realistic Incandescent Yellowish Explosions, Billowing Smoke & Floating Texts
  for (const ex of world.explosions) {
    if (isLibrary && (ex.floor ?? 0) !== localFloor) continue;
    const t = Math.min(1, ex.age / Math.max(0.01, ex.duration));
    const r = ex.radius * (0.3 + 0.72 * Math.pow(t, 0.42));
    const fade = 1 - Math.pow(t, 1.15);

    ctx.save();
    // Outer incandescent yellowish-amber fireball body
    const fire = ctx.createRadialGradient(ex.x, ex.y, r * 0.06, ex.x, ex.y, r);
    fire.addColorStop(0, `rgba(255, 255, 240, ${0.95 * fade})`);
    fire.addColorStop(0.28, `rgba(254, 240, 138, ${0.88 * fade})`);
    fire.addColorStop(0.6, `rgba(250, 204, 21, ${0.56 * fade})`);
    fire.addColorStop(0.88, `rgba(234, 88, 12, ${0.26 * fade})`);
    fire.addColorStop(1, 'rgba(234, 88, 12, 0)');
    ctx.fillStyle = fire;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Expanding yellow-white shockwave rim
    ctx.strokeStyle = `rgba(254, 240, 138, ${0.85 * (1 - t)})`;
    ctx.lineWidth = Math.max(1.5, 6 * (1 - t));
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, r * 0.96, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const pt of world.particles) {
    if (isLibrary && (pt.floor ?? 0) !== localFloor) continue;
    const t = Math.min(1, pt.age / Math.max(0.01, pt.duration));
    ctx.save();
    if (pt.isSmoke) {
      const smokeAlpha = Math.max(0, (1 - Math.pow(t, 1.35)) * 0.52);
      const sr = pt.radius * (0.85 + t * 1.15);
      const sg = ctx.createRadialGradient(pt.x, pt.y, sr * 0.12, pt.x, pt.y, sr);
      sg.addColorStop(0, `rgba(55, 65, 81, ${smokeAlpha})`);
      sg.addColorStop(0.55, `rgba(30, 41, 59, ${smokeAlpha * 0.65})`);
      sg.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, sr, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  for (const ft of world.floatingTexts) {
    if (isLibrary && (ft.floor ?? 0) !== localFloor) continue;
    const t = ft.age / ft.duration;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - Math.pow(t, 1.5));
    ctx.fillStyle = ft.color;
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore();

  // 12. Edge Vignette Overlay (soft & bright in Normal Immersive, deeper framing in Extra Dark)
  ctx.save();
  const cx = canvasWidth * 0.5;
  const cy = canvasHeight * 0.5;
  const outerR = Math.hypot(cx, cy);
  const vig = ctx.createRadialGradient(
    cx,
    cy,
    isExtraDark ? outerR * 0.28 : isImmersive ? outerR * 0.44 : outerR * 0.56,
    cx,
    cy,
    outerR * 1.02
  );
  if (isExtraDark) {
    vig.addColorStop(0, 'rgba(4, 7, 14, 0)');
    vig.addColorStop(0.6, 'rgba(4, 7, 14, 0.22)');
    vig.addColorStop(1, 'rgba(3, 5, 11, 0.72)');
  } else if (isImmersive) {
    // Normal immersive: MUCH brighter than Extra Dark! Soft atmospheric edge vignette only
    vig.addColorStop(0, 'rgba(5, 8, 15, 0)');
    vig.addColorStop(0.68, 'rgba(5, 8, 15, 0.14)');
    vig.addColorStop(1, 'rgba(4, 7, 13, 0.54)');
  } else {
    vig.addColorStop(0, 'rgba(5, 8, 15, 0)');
    vig.addColorStop(1, 'rgba(5, 8, 15, 0.22)');
  }
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();

  // 13. Virtual Joystick Overlay OR PC Cursor Steer Reticle
  if (
    cursorOverlay?.controlScheme === 'CURSOR_SPACE' &&
    cursorOverlay.cursorScreen &&
    localPlayer?.alive &&
    (!cursorOverlay.localPlayerIds || cursorOverlay.localPlayerIds.length <= 1)
  ) {
    const px = worldTx + localPlayer.x * scale;
    const py = worldTy + localPlayer.y * scale;
    const cxPt = cursorOverlay.cursorScreen.x;
    const cyPt = cursorOverlay.cursorScreen.y;
    const armed = localPlayer.ammo > 0 && localPlayer.stunTimer <= 0;

    ctx.save();
    // Soft dashed aim tether from stickman to cursor
    ctx.strokeStyle = armed ? 'rgba(250, 204, 21, 0.34)' : 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(cxPt, cyPt);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crisp cursor aim reticle
    const retColor = armed ? '#FACC15' : '#38BDF8';
    ctx.strokeStyle = retColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cxPt, cyPt, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cxPt - 15, cyPt);
    ctx.lineTo(cxPt - 6, cyPt);
    ctx.moveTo(cxPt + 6, cyPt);
    ctx.lineTo(cxPt + 15, cyPt);
    ctx.moveTo(cxPt, cyPt - 15);
    ctx.lineTo(cxPt, cyPt - 6);
    ctx.moveTo(cxPt, cyPt + 6);
    ctx.lineTo(cxPt, cyPt + 15);
    ctx.stroke();

    ctx.fillStyle = retColor;
    ctx.beginPath();
    ctx.arc(cxPt, cyPt, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (joystick.active && !cursorOverlay?.hideJoystick) {
    ctx.save();
    const pColor = localPlayer?.color ?? '#38BDF8';
    const pAccent = localPlayer?.accentColor ?? '#7DD3FC';
    const pFinish: PlayerSkinFinish = localPlayer?.finish ?? 'solid';
    const armed = localPlayer && localPlayer.ammo > 0 && localPlayer.stunTimer <= 0;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.44)';
    ctx.strokeStyle = hexWithAlpha(pColor, 0.62);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(joystick.originX, joystick.originY, joystick.maxRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = armed ? 'rgba(250, 204, 21, 0.45)' : hexWithAlpha(pAccent, 0.35);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(joystick.originX, joystick.originY, joystick.maxRadius * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (joystick.magnitude > 0.08) {
      ctx.strokeStyle = pColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(
        joystick.originX,
        joystick.originY,
        joystick.maxRadius + 5,
        joystick.angle - joystick.magnitude * 1.1,
        joystick.angle + joystick.magnitude * 1.1
      );
      ctx.stroke();
    }

    ctx.strokeStyle = hexWithAlpha(pAccent, 0.6);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(joystick.originX, joystick.originY);
    ctx.lineTo(joystick.currentX, joystick.currentY);
    ctx.stroke();

    const jx = joystick.currentX;
    const jy = joystick.currentY;
    const kr = 22;

    if (armed) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(jx, jy, kr + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (pFinish === 'metal') {
      const mGrad = ctx.createLinearGradient(jx - kr, jy - kr, jx + kr, jy + kr);
      mGrad.addColorStop(0, '#F8FAFC');
      mGrad.addColorStop(0.28, pAccent);
      mGrad.addColorStop(0.52, '#475569');
      mGrad.addColorStop(0.76, '#E2E8F0');
      mGrad.addColorStop(1, '#1E293B');
      ctx.fillStyle = mGrad;
    } else {
      const kGrad = ctx.createRadialGradient(jx - kr * 0.3, jy - kr * 0.3, 2, jx, jy, kr);
      kGrad.addColorStop(0, '#FFFFFF');
      kGrad.addColorStop(0.24, pAccent);
      kGrad.addColorStop(0.72, pColor);
      kGrad.addColorStop(1, '#0F172A');
      ctx.fillStyle = kGrad;
    }

    ctx.strokeStyle = '#090D16';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(jx, jy, kr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (pFinish !== 'solid') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(jx, jy, kr - 1.5, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(jx, jy);

      if (pFinish === 'fish_scale') {
        const scR = 6.5;
        ctx.lineWidth = 1.3;
        for (let row = -3; row <= 3; row++) {
          const sx = row * 7;
          const yOff = (Math.abs(row) % 2) * 5;
          for (let col = -3; col <= 3; col++) {
            const sy = col * 10 + yOff;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.36)';
            ctx.beginPath();
            ctx.arc(sx, sy, scR, -Math.PI * 0.45, Math.PI * 0.45);
            ctx.stroke();
          }
        }
      } else if (pFinish === 'wood') {
        ctx.fillStyle = 'rgba(120, 53, 15, 0.24)';
        ctx.fillRect(-kr, -kr, kr * 2, kr * 2);
        ctx.strokeStyle = 'rgba(28, 10, 2, 0.56)';
        ctx.lineWidth = 1.4;
        for (let gy = -18; gy <= 18; gy += 6) {
          ctx.beginPath();
          ctx.moveTo(-kr, gy);
          ctx.bezierCurveTo(-8, gy + 3, 8, gy - 3, kr, gy + 1);
          ctx.stroke();
        }
      } else if (pFinish === 'metal') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-kr + 4, -kr);
        ctx.lineTo(4, kr);
        ctx.stroke();
      } else if (pFinish === 'animated_sparkle') {
        for (let s = 0; s < 4; s++) {
          const phase = world.elapsedTime * 2.8 + s * 1.55;
          const ang = phase * 0.55 + s * 1.5;
          const sx = Math.cos(ang) * 9;
          const sy = Math.sin(ang) * 9;
          const sz = 2.2 + 2.0 * (0.5 + 0.5 * Math.sin(phase * 2));
          ctx.fillStyle = 'rgba(255, 253, 225, 0.85)';
          ctx.beginPath();
          ctx.moveTo(sx, sy - sz);
          ctx.lineTo(sx + sz * 0.3, sy - sz * 0.3);
          ctx.lineTo(sx + sz, sy);
          ctx.lineTo(sx + sz * 0.3, sy + sz * 0.3);
          ctx.lineTo(sx, sy + sz);
          ctx.lineTo(sx - sz * 0.3, sy + sz * 0.3);
          ctx.lineTo(sx - sz, sy);
          ctx.lineTo(sx - sz * 0.3, sy - sz * 0.3);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface ConeLightSource {
  x: number;
  y: number;
  dirY: number;
  range: number;
  beamLen: number;
  beamHalfBase: number;
  beamHalfEnd: number;
  coneMaxHalfAngle: number;
  colorRgb: string;
}

function getConeLightSources(map: ArenaMap): ConeLightSource[] {
  if (map.floorTheme === 'mansion_wood') {
    const topXs = map.immersive
      ? [map.width * 0.25, map.width * 0.5, map.width * 0.75]
      : [map.width * 0.18, map.width * 0.82];
    const botXs = map.immersive
      ? [map.width * 0.35, map.width * 0.65]
      : [map.width * 0.5];
    const lights: ConeLightSource[] = [];
    for (const x of topXs) {
      lights.push({
        x,
        y: 16,
        dirY: 1,
        range: map.immersive ? 640 : 690,
        beamLen: map.immersive ? 530 : 600,
        beamHalfBase: 46,
        beamHalfEnd: map.immersive ? 300 : 340,
        coneMaxHalfAngle: Math.atan2(map.immersive ? 300 : 340, map.immersive ? 530 : 600) + 0.18,
        colorRgb: map.immersive ? '254, 240, 138' : '253, 200, 92',
      });
    }
    for (const x of botXs) {
      lights.push({
        x,
        y: map.height - 16,
        dirY: -1,
        range: 590,
        beamLen: 490,
        beamHalfBase: 42,
        beamHalfEnd: 280,
        coneMaxHalfAngle: Math.atan2(280, 490) + 0.18,
        colorRgb: '254, 240, 138',
      });
    }
    return lights;
  }

  if (map.floorTheme === 'maple_cargo') {
    return [
      {
        x: map.width * 0.22,
        y: 16,
        dirY: 1,
        range: 660,
        beamLen: 560,
        beamHalfBase: 50,
        beamHalfEnd: 310,
        coneMaxHalfAngle: Math.atan2(310, 560) + 0.18,
        colorRgb: '94, 234, 212',
      },
      {
        x: map.width * 0.78,
        y: 16,
        dirY: 1,
        range: 660,
        beamLen: 560,
        beamHalfBase: 50,
        beamHalfEnd: 310,
        coneMaxHalfAngle: Math.atan2(310, 560) + 0.18,
        colorRgb: '94, 234, 212',
      },
      {
        x: map.width * 0.22,
        y: map.height - 16,
        dirY: -1,
        range: 640,
        beamLen: 540,
        beamHalfBase: 48,
        beamHalfEnd: 300,
        coneMaxHalfAngle: Math.atan2(300, 540) + 0.18,
        colorRgb: '94, 234, 212',
      },
      {
        x: map.width * 0.78,
        y: map.height - 16,
        dirY: -1,
        range: 640,
        beamLen: 540,
        beamHalfBase: 48,
        beamHalfEnd: 300,
        coneMaxHalfAngle: Math.atan2(300, 540) + 0.18,
        colorRgb: '94, 234, 212',
      },
    ];
  }

  if (map.floorTheme === 'winter_snow') {
    return [
      {
        x: map.width * 0.20,
        y: 16,
        dirY: 1,
        range: 700,
        beamLen: 600,
        beamHalfBase: 56,
        beamHalfEnd: 355,
        coneMaxHalfAngle: Math.atan2(355, 600) + 0.2,
        colorRgb: '165, 235, 255',
      },
      {
        x: map.width * 0.80,
        y: 16,
        dirY: 1,
        range: 700,
        beamLen: 600,
        beamHalfBase: 56,
        beamHalfEnd: 355,
        coneMaxHalfAngle: Math.atan2(355, 600) + 0.2,
        colorRgb: '165, 235, 255',
      },
      {
        x: map.width * 0.28,
        y: map.height - 16,
        dirY: -1,
        range: 660,
        beamLen: 560,
        beamHalfBase: 52,
        beamHalfEnd: 330,
        coneMaxHalfAngle: Math.atan2(330, 560) + 0.2,
        colorRgb: '186, 230, 253',
      },
      {
        x: map.width * 0.72,
        y: map.height - 16,
        dirY: -1,
        range: 660,
        beamLen: 560,
        beamHalfBase: 52,
        beamHalfEnd: 330,
        coneMaxHalfAngle: Math.atan2(330, 560) + 0.2,
        colorRgb: '186, 230, 253',
      },
    ];
  }

  if (map.floorTheme === 'library_wood') {
    const sconceXs = [map.width * 0.16, map.width * 0.38, map.width * 0.62, map.width * 0.84];
    const lights: ConeLightSource[] = [];
    for (const x of sconceXs) {
      lights.push({
        x,
        y: 26,
        dirY: 1,
        range: 640,
        beamLen: 520,
        beamHalfBase: 46,
        beamHalfEnd: 295,
        coneMaxHalfAngle: Math.atan2(295, 520) + 0.18,
        // Warm antique candlelit bronze-amber (zero bright yellow floor cast)
        colorRgb: '218, 144, 82',
      });
      lights.push({
        x,
        y: map.height - 26,
        dirY: -1,
        range: 640,
        beamLen: 520,
        beamHalfBase: 46,
        beamHalfEnd: 295,
        coneMaxHalfAngle: Math.atan2(295, 520) + 0.18,
        colorRgb: '218, 144, 82',
      });
    }
    return lights;
  }

  return [];
}

function getCargoVentSources(map: ArenaMap): ConeLightSource[] {
  if (map.floorTheme !== 'maple_cargo') return [];
  const pts = [
    { x: map.width * 0.14, y: map.height * 0.5 },
    { x: map.width * 0.86, y: map.height * 0.5 },
    { x: map.width * 0.5, y: map.height * 0.14 },
    { x: map.width * 0.5, y: map.height * 0.86 },
    { x: map.width * 0.5, y: map.height * 0.5 },
  ];
  return pts.map((p) => ({
    x: p.x,
    y: p.y,
    dirY: 0,
    range: 145,
    beamLen: 145,
    beamHalfBase: 40,
    beamHalfEnd: 145,
    coneMaxHalfAngle: Math.PI,
    colorRgb: '52, 211, 153',
  }));
}

interface ViewBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function isConeLightVisible(l: ConeLightSource, vb?: ViewBounds): boolean {
  if (!vb) return true;
  if (l.dirY === 0) {
    return (
      l.x + l.range >= vb.left &&
      l.x - l.range <= vb.right &&
      l.y + l.range >= vb.top &&
      l.y - l.range <= vb.bottom
    );
  }
  const minX = l.x - Math.max(l.range, l.beamHalfEnd) - 80;
  const maxX = l.x + Math.max(l.range, l.beamHalfEnd) + 80;
  const reach = l.range + 120;
  const minY = l.dirY > 0 ? l.y - 40 : l.y - reach;
  const maxY = l.dirY > 0 ? l.y + reach : l.y + 40;
  return maxX >= vb.left && minX <= vb.right && maxY >= vb.top && minY <= vb.bottom;
}

interface ShadowPolygon {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  fx1: number;
  fy1: number;
  fx0: number;
  fy0: number;
  tailX: number;
  tailY: number;
  strength: number;
}

function buildCircleShadowFromPoint(
  lx: number,
  ly: number,
  px: number,
  py: number,
  r: number,
  range: number,
  shadowLen: number,
  dirY: number,
  coneMaxHalfAngle: number
): ShadowPolygon | null {
  const vx = px - lx;
  const vy = py - ly;
  if (Math.abs(vx) >= range || Math.abs(vy) >= range) return null;
  if (dirY !== 0 && vy * dirY <= 8) return null;
  const d = Math.hypot(vx, vy);
  if (d <= r + 4 || d >= range) return null;

  let coneFade = 1;
  if (dirY !== 0) {
    if (vy * dirY <= 8) return null;
    const offAxis = Math.abs(Math.atan2(vx, vy * dirY));
    if (offAxis > coneMaxHalfAngle + 0.25) return null;
    coneFade = Math.max(0, 1 - Math.max(0, offAxis - coneMaxHalfAngle * 0.6) / (coneMaxHalfAngle * 0.65 + 0.25));
  }
  const distFade = 1 - d / range;
  const strength = Math.min(1, distFade * 1.15) * coneFade;
  if (strength <= 0.03) return null;

  const alpha = Math.asin(Math.min(0.95, r / d));
  const theta = Math.atan2(vy, vx);
  const tLen = d * Math.cos(alpha);
  const a0 = theta - alpha;
  const a1 = theta + alpha;
  const x0 = lx + Math.cos(a0) * tLen;
  const y0 = ly + Math.sin(a0) * tLen;
  const x1 = lx + Math.cos(a1) * tLen;
  const y1 = ly + Math.sin(a1) * tLen;
  const len = Math.min(shadowLen, range - d + 90);

  return {
    x0,
    y0,
    x1,
    y1,
    fx1: x1 + Math.cos(a1) * len,
    fy1: y1 + Math.sin(a1) * len,
    fx0: x0 + Math.cos(a0) * len,
    fy0: y0 + Math.sin(a0) * len,
    tailX: px + (vx / d) * len,
    tailY: py + (vy / d) * len,
    strength,
  };
}

function buildRectShadowFromPoint(
  lx: number,
  ly: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  range: number,
  shadowLen: number,
  dirY: number,
  coneMaxHalfAngle: number
): ShadowPolygon | null {
  // Fast AABB + cone-direction prune before Math.hypot/atan2 or corner allocation
  if (rx > lx + range || rx + rw < lx - range || ry > ly + range || ry + rh < ly - range) {
    return null;
  }
  if (dirY > 0 && ry + rh <= ly + 8) return null;
  if (dirY < 0 && ry >= ly - 8) return null;

  const cx = rx + rw * 0.5;
  const cy = ry + rh * 0.5;
  const vx = cx - lx;
  const vy = cy - ly;
  const d = Math.hypot(vx, vy);
  if (d < 12 || d >= range) return null;
  let coneFade = 1;
  if (dirY !== 0) {
    if (vy * dirY <= 8) return null;
    const offAxis = Math.abs(Math.atan2(vx, vy * dirY));
    if (offAxis > coneMaxHalfAngle + 0.28) return null;
    coneFade = Math.max(0, 1 - Math.max(0, offAxis - coneMaxHalfAngle * 0.6) / (coneMaxHalfAngle * 0.68 + 0.28));
  }
  const distFade = 1 - d / range;
  const strength = Math.min(1, distFade * 1.15) * coneFade;
  if (strength <= 0.03) return null;

  const baseAngle = Math.atan2(vy, vx);
  let minRel = Infinity;
  let maxRel = -Infinity;
  let minX = rx;
  let minY = ry;
  let maxX = rx;
  let maxY = ry;

  for (let i = 0; i < 4; i++) {
    const cxCorner = i === 1 || i === 2 ? rx + rw : rx;
    const cyCorner = i >= 2 ? ry + rh : ry;
    let rel = Math.atan2(cyCorner - ly, cxCorner - lx) - baseAngle;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    if (rel < minRel) {
      minRel = rel;
      minX = cxCorner;
      minY = cyCorner;
    }
    if (rel > maxRel) {
      maxRel = rel;
      maxX = cxCorner;
      maxY = cyCorner;
    }
  }

  const len = Math.min(shadowLen, range - d + 100);
  const a0 = Math.atan2(minY - ly, minX - lx);
  const a1 = Math.atan2(maxY - ly, maxX - lx);

  return {
    x0: minX,
    y0: minY,
    x1: maxX,
    y1: maxY,
    fx1: maxX + Math.cos(a1) * len,
    fy1: maxY + Math.sin(a1) * len,
    fx0: minX + Math.cos(a0) * len,
    fy0: minY + Math.sin(a0) * len,
    tailX: cx + (vx / d) * len,
    tailY: cy + (vy / d) * len,
    strength,
  };
}

function getStaticWallShadowPolys(
  light: ConeLightSource,
  map: ArenaMap,
  shadowLen: number,
  floorFilter?: FloorLevel
): ShadowPolygon[] {
  const key = `${map.id}_${Math.round(light.x)}_${Math.round(light.y)}_${light.dirY}_${shadowLen}_${floorFilter ?? 'all'}`;
  const existing = staticWallShadowPolyCache.get(key);
  if (existing) return existing;

  const polys: ShadowPolygon[] = [];
  for (const wall of map.walls) {
    if (wall.kind?.startsWith('perimeter')) continue;
    if (floorFilter !== undefined && (wall.floor ?? 0) !== floorFilter) continue;
    const poly = buildRectShadowFromPoint(
      light.x,
      light.y,
      wall.x,
      wall.y,
      wall.w,
      wall.h,
      light.range,
      shadowLen,
      light.dirY,
      light.coneMaxHalfAngle
    );
    if (poly) polys.push(poly);
  }
  setBoundedCache(staticWallShadowPolyCache, key, polys, 96);
  return polys;
}

function collectLightShadowPolys(
  light: ConeLightSource,
  map: ArenaMap,
  world: RenderableWorld,
  shadowLen: number,
  includeWalls: boolean,
  floorFilter?: FloorLevel
): ShadowPolygon[] {
  const out: ShadowPolygon[] = [];

  for (const p of world.players) {
    if (!p.alive) continue;
    if (floorFilter !== undefined && (p.floor ?? 0) !== floorFilter) continue;
    const poly = buildCircleShadowFromPoint(
      light.x,
      light.y,
      p.x,
      p.y,
      33,
      light.range,
      shadowLen,
      light.dirY,
      light.coneMaxHalfAngle
    );
    if (poly) out.push(poly);
  }

  for (const box of world.boxes) {
    if (box.state !== 'active' && box.state !== 'spawning') continue;
    if (floorFilter !== undefined && (box.floor ?? 0) !== floorFilter) continue;
    const poly = buildRectShadowFromPoint(
      light.x,
      light.y,
      box.x - box.w * 0.5,
      box.y - box.h * 0.5,
      box.w,
      box.h,
      light.range,
      shadowLen,
      light.dirY,
      light.coneMaxHalfAngle
    );
    if (poly) out.push(poly);
  }

  for (const item of world.pickups) {
    if (item.kind !== 'tnt' && item.kind !== 'nitro') continue;
    if (floorFilter !== undefined && (item.floor ?? 0) !== floorFilter) continue;
    const s = item.kind === 'tnt' ? 29 : 24;
    const poly = buildRectShadowFromPoint(
      light.x,
      light.y,
      item.x - s,
      item.y - s,
      s * 2,
      s * 2,
      light.range,
      shadowLen,
      light.dirY,
      light.coneMaxHalfAngle
    );
    if (poly) out.push(poly);
  }

  if (world.libraryState?.monster) {
    const m = world.libraryState.monster;
    if (floorFilter === undefined || m.floor === floorFilter) {
      const mPoly = buildCircleShadowFromPoint(
        light.x,
        light.y,
        m.x,
        m.y,
        (m.radius || MONSTER_RADIUS) * 0.9,
        light.range,
        shadowLen * 1.15,
        light.dirY,
        light.coneMaxHalfAngle
      );
      if (mPoly) out.push(mPoly);
    }
  }

  if (includeWalls) {
    const wallPolys = getStaticWallShadowPolys(light, map, shadowLen, floorFilter);
    for (let i = 0; i < wallPolys.length; i++) {
      out.push(wallPolys[i]);
    }
  }

  return out;
}

function getStaticWallShadowsCanvas(
  map: ArenaMap,
  floorFilter?: FloorLevel
): HTMLCanvasElement {
  const key = `${map.id}_sws_${floorFilter ?? 'all'}_${map.width}x${map.height}`;
  const existing = staticWallShadowsCache.get(key);
  if (existing) return existing;

  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const sctx = off.getContext('2d');
  if (sctx) {
    const isWinter = map.floorTheme === 'winter_snow';
    const shadowRgb = isWinter ? '11, 30, 68' : '5, 6, 12';
    const peakShadow = isWinter ? 0.34 : 0.44;
    const midShadow = isWinter ? 0.15 : 0.2;
    const lights = [...getConeLightSources(map), ...getCargoVentSources(map)];
    for (const light of lights) {
      const isVent = light.dirY === 0;
      const shadowLen = isVent ? 160 : isWinter ? 250 : 220;
      const polys = getStaticWallShadowPolys(light, map, shadowLen, floorFilter);
      const scaleAlpha = isVent ? 0.62 : 1;
      for (const poly of polys) {
        const mx = (poly.x0 + poly.x1) * 0.5;
        const my = (poly.y0 + poly.y1) * 0.5;
        const grad = sctx.createLinearGradient(mx, my, poly.tailX, poly.tailY);
        grad.addColorStop(0, `rgba(${shadowRgb}, ${peakShadow * poly.strength * scaleAlpha})`);
        grad.addColorStop(0.55, `rgba(${shadowRgb}, ${midShadow * poly.strength * scaleAlpha})`);
        grad.addColorStop(1, `rgba(${shadowRgb}, 0)`);
        sctx.fillStyle = grad;
        sctx.beginPath();
        sctx.moveTo(poly.x0, poly.y0);
        sctx.lineTo(poly.fx0, poly.fy0);
        sctx.lineTo(poly.fx1, poly.fy1);
        sctx.lineTo(poly.x1, poly.y1);
        sctx.closePath();
        sctx.fill();
      }
    }
  }
  setBoundedCache(staticWallShadowsCache, key, off, 6);
  return off;
}

function drawDynamicLightShadows(
  ctx: CanvasRenderingContext2D,
  map: ArenaMap,
  world: RenderableWorld,
  floorFilter?: FloorLevel,
  viewBounds?: ViewBounds,
  skipStaticShadows = false
) {
  ctx.save();

  if (map.floorTheme === 'grass_outdoors') {
    // Diagonal sunbeams cast angled directional floor shadows for players, crates, TNT & Nitro
    const sunSpots = map.immersive ? [450, 1200, 1850] : [220, 620];
    const dirX = 0.41;
    const dirY = 0.912;

    const castDirectional = (cx: number, cy: number, radius: number, isCircle: boolean) => {
      let bestStrength = 0;
      for (const sx of sunSpots) {
        const expectedCenterX = sx + (cy / 560) * 140;
        const distFromShaft = Math.abs(cx - expectedCenterX);
        if (distFromShaft < 210 && cy < 760) {
          const s = (1 - distFromShaft / 210) * Math.max(0, 1 - cy / 820);
          if (s > bestStrength) bestStrength = s;
        }
      }
      if (bestStrength <= 0.04) return;
      const len = 56 + bestStrength * 52;
      const grad = ctx.createLinearGradient(cx, cy, cx + dirX * len, cy + dirY * len);
      grad.addColorStop(0, `rgba(6, 18, 8, ${0.38 * bestStrength})`);
      grad.addColorStop(1, 'rgba(6, 18, 8, 0)');
      ctx.fillStyle = grad;
      if (isCircle) {
        const px = -dirY * radius;
        const py = dirX * radius;
        ctx.beginPath();
        ctx.moveTo(cx + px, cy + py);
        ctx.lineTo(cx + px + dirX * len, cy + py + dirY * len);
        ctx.lineTo(cx - px + dirX * len, cy - py + dirY * len);
        ctx.lineTo(cx - px, cy - py);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.roundRect(
          cx - radius + dirX * 14,
          cy - radius + dirY * 14,
          radius * 2 + dirX * len * 0.55,
          radius * 2 + dirY * len * 0.55,
          6
        );
        ctx.fill();
      }
    };

    for (const p of world.players) {
      if (p.alive) castDirectional(p.x, p.y, 33, true);
    }
    for (const box of world.boxes) {
      if (box.state === 'active' || box.state === 'spawning') castDirectional(box.x, box.y, box.w * 0.5, false);
    }
    for (const item of world.pickups) {
      if (item.kind === 'tnt') castDirectional(item.x, item.y, 29, false);
      else if (item.kind === 'nitro') castDirectional(item.x, item.y, 24, false);
    }
    ctx.restore();
    return;
  }

  // Blit cached static wall shadows cleanly unless merged base canvas already includes them
  if (!skipStaticShadows) {
    blitCroppedWorldCanvas(ctx, getStaticWallShadowsCanvas(map, floorFilter), map, viewBounds);
  }

  const isWinter = map.floorTheme === 'winter_snow';
  const shadowRgb = isWinter ? '11, 30, 68' : '5, 6, 12';
  const peakShadow = isWinter ? 0.34 : 0.44;
  const midShadow = isWinter ? 0.15 : 0.2;
  const lights = [...getConeLightSources(map), ...getCargoVentSources(map)];
  for (const light of lights) {
    if (!isConeLightVisible(light, viewBounds)) continue;
    const isVent = light.dirY === 0;
    const polys = collectLightShadowPolys(light, map, world, isVent ? 160 : isWinter ? 250 : 220, false, floorFilter);
    for (const poly of polys) {
      if (viewBounds) {
        const minX = Math.min(poly.x0, poly.x1, poly.fx0, poly.fx1);
        const maxX = Math.max(poly.x0, poly.x1, poly.fx0, poly.fx1);
        const minY = Math.min(poly.y0, poly.y1, poly.fy0, poly.fy1);
        const maxY = Math.max(poly.y0, poly.y1, poly.fy0, poly.fy1);
        if (maxX < viewBounds.left || minX > viewBounds.right || maxY < viewBounds.top || minY > viewBounds.bottom) {
          continue;
        }
      }
      const mx = (poly.x0 + poly.x1) * 0.5;
      const my = (poly.y0 + poly.y1) * 0.5;
      const grad = ctx.createLinearGradient(mx, my, poly.tailX, poly.tailY);
      const scaleAlpha = isVent ? 0.62 : 1;
      grad.addColorStop(0, `rgba(${shadowRgb}, ${peakShadow * poly.strength * scaleAlpha})`);
      grad.addColorStop(0.55, `rgba(${shadowRgb}, ${midShadow * poly.strength * scaleAlpha})`);
      grad.addColorStop(1, `rgba(${shadowRgb}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(poly.x0, poly.y0);
      ctx.lineTo(poly.fx0, poly.fy0);
      ctx.lineTo(poly.fx1, poly.fy1);
      ctx.lineTo(poly.x1, poly.y1);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
}

function getStaticAmbientCanvas(
  map: ArenaMap,
  floorFilter?: FloorLevel
): HTMLCanvasElement {
  const key = `${map.id}_amb_${floorFilter ?? 'all'}_${map.width}x${map.height}`;
  const existing = staticAmbientCache.get(key);
  if (existing) return existing;

  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const actx = off.getContext('2d');
  if (actx) {
    if (map.floorTheme === 'mansion_wood') {
      const lights = getConeLightSources(map);
      for (const l of lights) {
        const py = l.y + l.dirY * 145;
        const topPool = actx.createRadialGradient(l.x, l.y + l.dirY * 65, 16, l.x, py, 330);
        topPool.addColorStop(0, 'rgba(253, 224, 71, 0.24)');
        topPool.addColorStop(0.55, 'rgba(250, 204, 21, 0.1)');
        topPool.addColorStop(1, 'rgba(250, 204, 21, 0)');
        actx.fillStyle = topPool;
        actx.beginPath();
        actx.arc(l.x, py, 330, 0, Math.PI * 2);
        actx.fill();
      }
      const centerGlow = actx.createRadialGradient(
        map.width * 0.5,
        map.height * 0.5,
        20,
        map.width * 0.5,
        map.height * 0.5,
        map.immersive ? 420 : 280
      );
      centerGlow.addColorStop(0, 'rgba(254, 240, 138, 0.14)');
      centerGlow.addColorStop(1, 'rgba(254, 240, 138, 0)');
      actx.fillStyle = centerGlow;
      actx.beginPath();
      actx.arc(map.width * 0.5, map.height * 0.5, map.immersive ? 420 : 280, 0, Math.PI * 2);
      actx.fill();
    } else if (map.floorTheme === 'library_wood') {
      const lights = getConeLightSources(map);
      for (const l of lights) {
        const py = l.y + l.dirY * 140;
        const pool = actx.createRadialGradient(l.x, l.y + l.dirY * 60, 14, l.x, py, 330);
        pool.addColorStop(0, 'rgba(218, 142, 78, 0.17)');
        pool.addColorStop(0.55, 'rgba(196, 120, 62, 0.08)');
        pool.addColorStop(1, 'rgba(196, 120, 62, 0)');
        actx.fillStyle = pool;
        actx.beginPath();
        actx.arc(l.x, py, 330, 0, Math.PI * 2);
        actx.fill();
      }
      if ((floorFilter ?? 0) === 0) {
        const centerGlow = actx.createRadialGradient(map.width * 0.5, map.height * 0.5, 40, map.width * 0.5, map.height * 0.5, 520);
        centerGlow.addColorStop(0, 'rgba(210, 138, 76, 0.12)');
        centerGlow.addColorStop(1, 'rgba(196, 120, 62, 0)');
        actx.fillStyle = centerGlow;
        actx.beginPath();
        actx.arc(map.width * 0.5, map.height * 0.5, 520, 0, Math.PI * 2);
        actx.fill();
      }
      for (const st of map.stairs ?? []) {
        const sx = st.x + st.w * 0.5;
        const sy = st.upDir === 'up' ? st.y + 32 : st.y + st.h - 32;
        const sg = actx.createRadialGradient(sx, sy, 12, sx, sy, 230);
        sg.addColorStop(0, 'rgba(222, 148, 84, 0.16)');
        sg.addColorStop(1, 'rgba(196, 120, 62, 0)');
        actx.fillStyle = sg;
        actx.beginPath();
        actx.arc(sx, sy, 230, 0, Math.PI * 2);
        actx.fill();
      }
    } else if (map.floorTheme === 'winter_snow') {
      const coolWash = actx.createRadialGradient(
        map.width * 0.5,
        map.height * 0.45,
        120,
        map.width * 0.5,
        map.height * 0.5,
        map.width * 0.72
      );
      coolWash.addColorStop(0, 'rgba(186, 230, 253, 0.05)');
      coolWash.addColorStop(0.65, 'rgba(96, 165, 250, 0.09)');
      coolWash.addColorStop(1, 'rgba(15, 42, 92, 0.22)');
      actx.fillStyle = coolWash;
      actx.fillRect(0, 0, map.width, map.height);
    } else if (map.floorTheme === 'grass_outdoors') {
      const sunSpots = map.immersive ? [450, 1200, 1850] : [220, 620];
      for (const sx of sunSpots) {
        const sunGrad = actx.createLinearGradient(sx, 0, sx + 320, 620);
        sunGrad.addColorStop(0, 'rgba(254, 249, 195, 0.18)');
        sunGrad.addColorStop(0.55, 'rgba(254, 240, 138, 0.07)');
        sunGrad.addColorStop(1, 'rgba(254, 249, 195, 0)');
        actx.fillStyle = sunGrad;
        actx.beginPath();
        actx.moveTo(sx - 70, 0);
        actx.lineTo(sx + 85, 0);
        actx.lineTo(sx + 390, 620);
        actx.lineTo(sx + 110, 620);
        actx.closePath();
        actx.fill();
      }
    }
  }
  setBoundedCache(staticAmbientCache, key, off, 6);
  return off;
}

function drawAmbientArenaLights(
  ctx: CanvasRenderingContext2D,
  map: ArenaMap,
  world: RenderableWorld,
  floorFilter?: FloorLevel,
  viewBounds?: ViewBounds
) {
  ctx.save();
  if (map.floorTheme === 'mansion_wood' || map.floorTheme === 'library_wood') {
    blitCroppedWorldCanvas(ctx, getStaticAmbientCanvas(map, floorFilter), map, viewBounds);
  } else if (map.floorTheme === 'maple_cargo') {
    // Glowing emerald louvered vents matching reference: bright internal neon slats, very faint localized floor spill
    const grates = getCargoVentSources(map);
    const pulse = 0.94 + 0.06 * Math.sin(world.elapsedTime * 2.4);
    for (const g of grates) {
      if (viewBounds && (g.x + 150 < viewBounds.left || g.x - 150 > viewBounds.right || g.y + 150 < viewBounds.top || g.y - 150 > viewBounds.bottom)) {
        continue;
      }

      // Very faint, tight emerald glow escaping onto immediately surrounding floor tiles
      const spillGrad = ctx.createRadialGradient(g.x, g.y, 26, g.x, g.y, 132);
      spillGrad.addColorStop(0, `rgba(74, 222, 128, ${0.14 * pulse})`);
      spillGrad.addColorStop(0.45, `rgba(34, 197, 94, ${0.055 * pulse})`);
      spillGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = spillGrad;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 132, 0, Math.PI * 2);
      ctx.fill();

      // Brushed gunmetal-olive outer chamfered vent bezel
      ctx.fillStyle = '#2B3A37';
      ctx.strokeStyle = '#0F1817';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(g.x - 41, g.y - 41, 82, 82, 4);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(148, 176, 168, 0.28)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(g.x - 39.5, g.y - 39.5, 79, 79);

      // Deep recessed vent cavity with rich internal emerald bloom
      ctx.fillStyle = '#04120B';
      ctx.fillRect(g.x - 33, g.y - 33, 66, 66);

      const innerBloom = ctx.createRadialGradient(g.x, g.y, 4, g.x, g.y, 44);
      innerBloom.addColorStop(0, `rgba(74, 222, 128, ${0.52 * pulse})`);
      innerBloom.addColorStop(0.6, `rgba(22, 163, 74, ${0.32 * pulse})`);
      innerBloom.addColorStop(1, 'rgba(4, 24, 14, 0)');
      ctx.fillStyle = innerBloom;
      ctx.fillRect(g.x - 33, g.y - 33, 66, 66);

      // 6 clearly glowing horizontal emerald louver slats inside the vent housing
      for (let i = 0; i < 6; i++) {
        const sy = g.y - 30 + i * 10.6;
        // Soft green bloom gap around each louver bar
        ctx.fillStyle = `rgba(34, 197, 94, ${0.42 * pulse})`;
        ctx.fillRect(g.x - 31, sy - 1.5, 62, 8.5);
        // Glowing emerald louver core
        ctx.fillStyle = `rgba(74, 222, 128, ${0.92 * pulse})`;
        ctx.fillRect(g.x - 30, sy, 60, 5.2);
        // Bright mint-emerald specular center bar
        ctx.fillStyle = `rgba(187, 247, 208, ${0.78 * pulse})`;
        ctx.fillRect(g.x - 28, sy + 1.2, 56, 2.2);
      }

      // Inner bevel shadow framing the recessed glowing louvers
      ctx.strokeStyle = 'rgba(4, 12, 9, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(g.x - 33, g.y - 33, 66, 66);
    }
  } else if (map.floorTheme === 'winter_snow') {
    const t = world.elapsedTime;
    blitCroppedWorldCanvas(ctx, getStaticAmbientCanvas(map, floorFilter), map, viewBounds);

    const fogSprite = getGlowSprite('winter_fog_bank_350', 350, (gc, r) => {
      const fog = gc.createRadialGradient(0, 0, 15, 0, 0, r);
      fog.addColorStop(0, 'rgba(219, 240, 255, 0.16)');
      fog.addColorStop(0.55, 'rgba(147, 197, 253, 0.08)');
      fog.addColorStop(1, 'rgba(147, 197, 253, 0)');
      gc.fillStyle = fog;
      gc.beginPath();
      gc.arc(0, 0, r, 0, Math.PI * 2);
      gc.fill();
    });
    const fogBanks = [
      { bx: map.width * 0.28, by: map.height * 0.3, r: 320, spd: 0.28, amp: 55 },
      { bx: map.width * 0.72, by: map.height * 0.65, r: 350, spd: 0.22, amp: 65 },
      { bx: map.width * 0.5, by: map.height * 0.85, r: 300, spd: 0.34, amp: 48 },
    ];
    for (let i = 0; i < fogBanks.length; i++) {
      const f = fogBanks[i];
      const fx = f.bx + Math.sin(t * f.spd + i * 2.1) * f.amp;
      const fy = f.by + Math.cos(t * f.spd * 0.7 + i) * 22;
      if (viewBounds && (fx + f.r < viewBounds.left || fx - f.r > viewBounds.right || fy + f.r < viewBounds.top || fy - f.r > viewBounds.bottom)) {
        continue;
      }
      ctx.drawImage(fogSprite, fx - f.r, fy - f.r, f.r * 2, f.r * 2);
    }
  }
  ctx.restore();
}

function getBakedConeBeamSprite(
  map: ArenaMap,
  l: ConeLightSource,
  lightIdx: number,
  isWinter: boolean,
  floorFilter?: FloorLevel
) {
  const key = `${map.id}_beam_${lightIdx}_f${floorFilter ?? 'all'}_w${isWinter ? 1 : 0}`;
  const existing = bakedVolumetricBeamCache.get(key);
  if (existing) return existing;

  let minX: number;
  let maxX: number;
  let minY: number;
  let maxY: number;
  if (isWinter) {
    const cx = l.x;
    const cy = l.y + l.dirY * (l.beamLen * 0.45);
    const rx = l.beamHalfEnd * 0.96;
    const ry = l.beamLen * 0.62;
    minX = cx - rx - 8;
    maxX = cx + rx + 8;
    minY = cy - ry - 8;
    maxY = cy + ry + 8;
  } else {
    const startY = l.y + l.dirY * 6;
    const endY = l.y + l.beamLen * l.dirY;
    minX = l.x - l.beamHalfEnd - 8;
    maxX = l.x + l.beamHalfEnd + 8;
    minY = Math.min(startY, endY) - 8;
    maxY = Math.max(startY, endY) + 8;
  }

  const bx = Math.max(0, Math.floor(minX));
  const by = Math.max(0, Math.floor(minY));
  const ex = Math.min(map.width, Math.ceil(maxX));
  const ey = Math.min(map.height, Math.ceil(maxY));
  const bw = Math.max(1, ex - bx);
  const bh = Math.max(1, ey - by);

  const bakeScale = 0.5;
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.ceil(bw * bakeScale));
  off.height = Math.max(1, Math.ceil(bh * bakeScale));
  const bctx = off.getContext('2d');
  if (bctx) {
    bctx.save();
    bctx.scale(bakeScale, bakeScale);
    bctx.translate(-bx, -by);

    if (isWinter) {
      bctx.save();
      const cx = l.x;
      const cy = l.y + l.dirY * (l.beamLen * 0.45);
      const rx = l.beamHalfEnd * 0.96;
      const ry = l.beamLen * 0.62;
      bctx.translate(cx, cy);
      bctx.scale(1, ry / Math.max(1, rx));
      const rad = bctx.createRadialGradient(0, -rx * 0.35 * l.dirY, 16, 0, 0, rx);
      rad.addColorStop(0, `rgba(${l.colorRgb}, 0.28)`);
      rad.addColorStop(0.45, `rgba(${l.colorRgb}, 0.14)`);
      rad.addColorStop(0.8, `rgba(${l.colorRgb}, 0.045)`);
      rad.addColorStop(1, `rgba(${l.colorRgb}, 0)`);
      bctx.fillStyle = rad;
      bctx.beginPath();
      bctx.arc(0, 0, rx, 0, Math.PI * 2);
      bctx.fill();
      bctx.restore();
    } else {
      const startY = l.y + l.dirY * 6;
      const endY = l.y + l.beamLen * l.dirY;
      const beamGrad = bctx.createLinearGradient(l.x, startY, l.x, endY);
      beamGrad.addColorStop(0, `rgba(${l.colorRgb}, 0.27)`);
      beamGrad.addColorStop(0.55, `rgba(${l.colorRgb}, 0.11)`);
      beamGrad.addColorStop(1, `rgba(${l.colorRgb}, 0)`);

      bctx.fillStyle = beamGrad;
      bctx.beginPath();
      bctx.moveTo(l.x - l.beamHalfBase, startY);
      bctx.lineTo(l.x + l.beamHalfBase, startY);
      bctx.lineTo(l.x + l.beamHalfEnd, endY);
      bctx.lineTo(l.x - l.beamHalfEnd, endY);
      bctx.closePath();
      bctx.fill();
    }

    const staticWallPolys = getStaticWallShadowPolys(l, map, l.range + 160, floorFilter);
    if (staticWallPolys.length > 0) {
      bctx.globalCompositeOperation = 'destination-out';
      for (const poly of staticWallPolys) {
        bctx.fillStyle = `rgba(0, 0, 0, ${(isWinter ? 0.72 : 0.82) * Math.min(1, poly.strength + 0.18)})`;
        bctx.beginPath();
        bctx.moveTo(poly.x0, poly.y0);
        bctx.lineTo(poly.fx0, poly.fy0);
        bctx.lineTo(poly.fx1, poly.fy1);
        bctx.lineTo(poly.x1, poly.y1);
        bctx.closePath();
        bctx.fill();
      }
    }
    bctx.restore();
  }

  const entry = { canvas: off, x: bx, y: by, w: bw, h: bh };
  setBoundedCache(bakedVolumetricBeamCache, key, entry, 48);
  return entry;
}

function drawVolumetricArenaLights(
  ctx: CanvasRenderingContext2D,
  map: ArenaMap,
  world: RenderableWorld,
  isExtraDark: boolean,
  canvasWidth: number,
  canvasHeight: number,
  worldTx: number,
  worldTy: number,
  scale: number,
  floorFilter?: FloorLevel,
  viewBounds?: ViewBounds
) {
  if (isExtraDark) return;
  const elapsedTime = world.elapsedTime;
  ctx.save();

  if (
    map.floorTheme === 'mansion_wood' ||
    map.floorTheme === 'library_wood' ||
    map.floorTheme === 'maple_cargo' ||
    map.floorTheme === 'winter_snow'
  ) {
    const isWinter = map.floorTheme === 'winter_snow';
    const allLights = getConeLightSources(map);
    const visibleLights: Array<{ light: ConeLightSource; index: number }> = [];
    for (let i = 0; i < allLights.length; i++) {
      if (isConeLightVisible(allLights[i], viewBounds)) {
        visibleLights.push({ light: allLights[i], index: i });
      }
    }

    const isCargo = map.floorTheme === 'maple_cargo';
    if (visibleLights.length === 0 && !isCargo) {
      ctx.restore();
      return;
    }

    const lightScale = isWinter ? 0.24 : 0.32;
    const lw = Math.max(1, Math.ceil(canvasWidth * lightScale));
    const lh = Math.max(1, Math.ceil(canvasHeight * lightScale));
    const lightCanvas = getLightCanvas(lw, lh);
    const lctx = lightCanvas.getContext('2d');
    if (lctx && scale > 0.001) {
      lctx.save();
      lctx.clearRect(0, 0, lw, lh);
      lctx.scale(lightScale, lightScale);
      lctx.translate(worldTx, worldTy);
      lctx.scale(scale, scale);

      lctx.globalCompositeOperation = 'lighter';
      for (const { light, index } of visibleLights) {
        const shimmer = 0.91 + 0.09 * Math.sin(elapsedTime * (isWinter ? 1.6 : 2.5) + index * 1.6);
        const sprite = getBakedConeBeamSprite(map, light, index, isWinter, floorFilter);
        lctx.globalAlpha = shimmer;
        lctx.drawImage(sprite.canvas, sprite.x, sprite.y, sprite.w, sprite.h);
      }
      lctx.globalAlpha = 1;

      lctx.globalCompositeOperation = 'destination-out';
      for (const { light } of visibleLights) {
        const polys = collectLightShadowPolys(light, map, world, light.range + 160, false, floorFilter);
        for (const poly of polys) {
          lctx.fillStyle = `rgba(0, 0, 0, ${(isWinter ? 0.72 : 0.82) * Math.min(1, poly.strength + 0.18)})`;
          lctx.beginPath();
          lctx.moveTo(poly.x0, poly.y0);
          lctx.lineTo(poly.fx0, poly.fy0);
          lctx.lineTo(poly.fx1, poly.fy1);
          lctx.lineTo(poly.x1, poly.y1);
          lctx.closePath();
          lctx.fill();
        }
      }

      // Additive emerald floor vent light spill carved around obstacles/players on Cargo Deck
      if (isCargo) {
        const beamCanvas = getBeamScratchCanvas(lw, lh);
        const bctx = beamCanvas.getContext('2d');
        if (bctx) {
          const ventLights = getCargoVentSources(map).filter((v) => isConeLightVisible(v, viewBounds));
          for (const v of ventLights) {
            bctx.save();
            bctx.clearRect(0, 0, lw, lh);
            bctx.scale(lightScale, lightScale);
            bctx.translate(worldTx, worldTy);
            bctx.scale(scale, scale);

            const vg = bctx.createRadialGradient(v.x, v.y, 20, v.x, v.y, 138);
            vg.addColorStop(0, 'rgba(74, 222, 128, 0.105)');
            vg.addColorStop(0.5, 'rgba(34, 197, 94, 0.04)');
            vg.addColorStop(1, 'rgba(34, 197, 94, 0)');
            bctx.fillStyle = vg;
            bctx.beginPath();
            bctx.arc(v.x, v.y, 138, 0, Math.PI * 2);
            bctx.fill();

            bctx.globalCompositeOperation = 'destination-out';
            const vPolys = collectLightShadowPolys(v, map, world, v.range + 80, true, floorFilter);
            for (const vp of vPolys) {
              bctx.fillStyle = `rgba(0, 0, 0, ${0.8 * Math.min(1, vp.strength + 0.2)})`;
              bctx.beginPath();
              bctx.moveTo(vp.x0, vp.y0);
              bctx.lineTo(vp.fx0, vp.fy0);
              bctx.lineTo(vp.fx1, vp.fy1);
              bctx.lineTo(vp.x1, vp.y1);
              bctx.closePath();
              bctx.fill();
            }
            bctx.restore();

            lctx.save();
            lctx.setTransform(1, 0, 0, 1, 0, 0);
            lctx.globalCompositeOperation = 'lighter';
            lctx.drawImage(beamCanvas, 0, 0);
            lctx.restore();
          }
        }
      }
      lctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        lightCanvas,
        -worldTx / scale,
        -worldTy / scale,
        canvasWidth / scale,
        canvasHeight / scale
      );
      ctx.restore();
    }

    for (const { light: l } of visibleLights) {
      if (map.floorTheme === 'mansion_wood' || map.floorTheme === 'library_wood') {
        ctx.fillStyle = '#5E2D12';
        ctx.strokeStyle = '#1C1917';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(l.x, l.y, 24, l.dirY > 0 ? 0 : Math.PI, l.dirY > 0 ? Math.PI : Math.PI * 2, false);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = map.floorTheme === 'library_wood' ? '#FDBA74' : '#FEF08A';
        ctx.beginPath();
        ctx.arc(l.x, l.y + l.dirY * 4, 14, l.dirY > 0 ? 0 : Math.PI, l.dirY > 0 ? Math.PI : Math.PI * 2, false);
        ctx.fill();
      } else if (isWinter) {
        ctx.fillStyle = '#0F172A';
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(l.x, l.y, 22, l.dirY > 0 ? 0 : Math.PI, l.dirY > 0 ? Math.PI : Math.PI * 2, false);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#E0F2FE';
        ctx.beginPath();
        ctx.arc(l.x, l.y + l.dirY * 4, 13, l.dirY > 0 ? 0 : Math.PI, l.dirY > 0 ? Math.PI : Math.PI * 2, false);
        ctx.fill();
      } else {
        ctx.fillStyle = '#1E293B';
        ctx.strokeStyle = '#090D16';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(l.x, l.y, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#5EEAD4';
        ctx.beginPath();
        ctx.arc(l.x, l.y, 17, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (map.floorTheme === 'grass_outdoors') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    blitCroppedWorldCanvas(ctx, getStaticAmbientCanvas(map, floorFilter), map, viewBounds);
    ctx.restore();
  }

  ctx.restore();
}

function drawWinterFogOverlay(
  ctx: CanvasRenderingContext2D,
  map: ArenaMap,
  world: RenderableWorld,
  _canvasWidth: number,
  _canvasHeight: number,
  _worldTx: number,
  _worldTy: number,
  _scale: number,
  viewBounds?: ViewBounds
) {
  const t = world.elapsedTime;
  const fogTex = getWinterFogCanvas();
  const wispTex = getWinterWispCanvas();
  const vx0 = viewBounds ? Math.max(0, viewBounds.left) : 0;
  const vy0 = viewBounds ? Math.max(0, viewBounds.top) : 0;
  const vw = viewBounds ? Math.max(1, Math.min(map.width, viewBounds.right) - vx0) : map.width;
  const vh = viewBounds ? Math.max(1, Math.min(map.height, viewBounds.bottom) - vy0) : map.height;

  ctx.save();
  ctx.beginPath();
  ctx.rect(vx0, vy0, vw, vh);
  ctx.clip();

  // Lightweight atmospheric arctic mist veil + cached-pattern drifting cloud & wisp layers (viewport-clipped)
  ctx.fillStyle = 'rgba(226, 240, 255, 0.14)';
  ctx.fillRect(vx0, vy0, vw, vh);

  const tile = 512;
  const drawScrollingFog = (tex: HTMLCanvasElement, vx: number, vy: number, waveAmp: number, alpha: number) => {
    const pat = getCachedPattern(ctx, tex);
    if (!pat) return;
    const ox = ((t * vx) % tile + tile) % tile;
    const oy = ((t * vy + Math.sin(t * 0.35) * waveAmp) % tile + tile) % tile;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ox, oy);
    ctx.fillStyle = pat;
    ctx.fillRect(vx0 - ox - 32, vy0 - oy - 32, vw + 64, vh + 64);
    ctx.restore();
  };

  drawScrollingFog(fogTex, 24, 9, 14, 0.78);
  drawScrollingFog(wispTex, -34, 13, 10, 0.62);

  // Fine wind-blown arctic snowflakes drifting lightly across the arena
  for (let m = 0; m < 28; m++) {
    const speedX = 36 + (m % 5) * 11;
    const speedY = 14 + (m % 4) * 6;
    const px = ((seededRand(m * 19 + 3) * map.width + t * speedX) % map.width + map.width) % map.width;
    const py =
      ((seededRand(m * 37 + 11) * map.height + t * speedY + Math.sin(t * 1.4 + m) * 14) %
        map.height +
        map.height) %
      map.height;
    if (px < vx0 - 4 || px > vx0 + vw + 4 || py < vy0 - 4 || py > vy0 + vh + 4) continue;
    const alpha = 0.24 + 0.22 * Math.sin(t * 2.2 + m);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, alpha)})`;
    ctx.beginPath();
    ctx.arc(px, py, 1.4 + (m % 3) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function traceSmoothClosedPoly(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
  scale = 1
) {
  const n = pts.length;
  if (n < 3) return;
  const firstMidX = ((pts[n - 1].x + pts[0].x) * 0.5) * scale;
  const firstMidY = ((pts[n - 1].y + pts[0].y) * 0.5) * scale;
  ctx.beginPath();
  ctx.moveTo(firstMidX, firstMidY);
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const mx = ((curr.x + next.x) * 0.5) * scale;
    const my = ((curr.y + next.y) * 0.5) * scale;
    ctx.quadraticCurveTo(curr.x * scale, curr.y * scale, mx, my);
  }
  ctx.closePath();
}

function getBakedIntactIceCanvas(
  pits: IcePit[],
  map: ArenaMap,
  brokenMask: string,
  iceImg: HTMLImageElement | null
): HTMLCanvasElement {
  const key = `${map.id}_${map.width}x${map.height}_${brokenMask}${iceImg ? '_itex' : ''}`;
  const cached = intactIceCache.get(key);
  if (cached) return cached;

  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const ictx = off.getContext('2d');
  if (!ictx) return off;

  const icePat = iceImg ? ictx.createPattern(iceImg, 'repeat') : null;

  for (const pit of pits) {
    if (pit.broken) continue;
    const pts = pit.points ?? map.icePits?.[pit.id - 1]?.points;

    const trace = (scale = 1) => {
      if (pts && pts.length >= 3) {
        traceSmoothClosedPoly(ictx, pts, scale);
      } else {
        ictx.beginPath();
        ictx.ellipse(0, 0, pit.rx * scale, pit.ry * scale, 0, 0, Math.PI * 2);
      }
    };

    ictx.save();
    ictx.translate(pit.x, pit.y);

    // Outer frosted snow rim
    ictx.fillStyle = 'rgba(56, 189, 248, 0.45)';
    ictx.save();
    ictx.translate(0, 3);
    trace(1.07);
    ictx.fill();
    ictx.restore();

    ictx.save();
    trace(1);
    ictx.clip();

    const iceGrad = ictx.createRadialGradient(-pit.rx * 0.15, -pit.ry * 0.18, 8, 0, 0, Math.max(pit.rx, pit.ry) * 1.15);
    iceGrad.addColorStop(0, '#38BDF8');
    iceGrad.addColorStop(0.45, '#0284C7');
    iceGrad.addColorStop(0.82, '#0369A1');
    iceGrad.addColorStop(1, '#074B83');
    ictx.fillStyle = iceGrad;
    ictx.fillRect(-pit.rx * 1.4, -pit.ry * 1.4, pit.rx * 2.8, pit.ry * 2.8);

    if (icePat) {
      ictx.save();
      ictx.globalAlpha = 0.78;
      ictx.translate(pit.id * 41, pit.id * 29);
      ictx.fillStyle = icePat;
      ictx.fillRect(-pit.rx * 1.6 - pit.id * 41, -pit.ry * 1.6 - pit.id * 29, pit.rx * 3.2, pit.ry * 3.2);
      ictx.restore();
    }

    // Crisp static glacier prism highlight bands
    ictx.fillStyle = 'rgba(224, 242, 254, 0.14)';
    ictx.beginPath();
    ictx.moveTo(-pit.rx * 0.72, -pit.ry * 1.2);
    ictx.lineTo(-pit.rx * 0.42, -pit.ry * 1.2);
    ictx.lineTo(-pit.rx * 0.96, pit.ry * 1.2);
    ictx.lineTo(-pit.rx * 1.26, pit.ry * 1.2);
    ictx.closePath();
    ictx.fill();

    // Subtle frosted crystalline ice fracture veins
    ictx.strokeStyle = 'rgba(224, 242, 254, 0.52)';
    ictx.lineWidth = 1.5;
    ictx.beginPath();
    ictx.moveTo(-pit.rx * 0.38, -pit.ry * 0.28);
    ictx.lineTo(0, 4);
    ictx.lineTo(pit.rx * 0.44, -pit.ry * 0.14);
    ictx.moveTo(0, 4);
    ictx.lineTo(-pit.rx * 0.14, pit.ry * 0.46);
    ictx.stroke();
    ictx.restore();

    // Crisp frosted ice shoreline lip
    ictx.strokeStyle = '#F0F9FF';
    ictx.lineWidth = 2.6;
    trace(1);
    ictx.stroke();

    ictx.restore();
  }

  intactIceCache.set(key, off);
  return off;
}

function drawIcePits(ctx: CanvasRenderingContext2D, world: RenderableWorld, map: ArenaMap) {
  const pits: IcePit[] =
    world.icePits && world.icePits.length > 0
      ? world.icePits
      : (map.icePits ?? []).map((p, idx) => ({
          id: idx + 1,
          x: p.x,
          y: p.y,
          rx: p.rx,
          ry: p.ry,
          points: p.points,
          broken: false,
        }));
  if (pits.length === 0) return;

  const iceImg = getWinterIceTexture();
  let brokenMask = '';
  let hasBroken = false;
  let hasIntact = false;
  for (const pit of pits) {
    brokenMask += pit.broken ? '1' : '0';
    if (pit.broken) hasBroken = true;
    else hasIntact = true;
  }

  // Blit all unbroken glacier ponds in one cached drawImage call (zero per-frame gradient/pattern rebuild)
  if (hasIntact) {
    const baked = getBakedIntactIceCanvas(pits, map, brokenMask, iceImg);
    ctx.drawImage(baked, 0, 0);
  }
  if (!hasBroken) return;

  const waterTile = getWinterWaterCanvas();
  const waterPat = getCachedPattern(ctx, waterTile);

  for (const pit of pits) {
    if (!pit.broken) continue;
    const pts = pit.points ?? map.icePits?.[pit.id - 1]?.points;
    ctx.save();
    ctx.translate(pit.x, pit.y);

    const traceContour = (scale = 1) => {
      if (pts && pts.length >= 3) {
        traceSmoothClosedPoly(ctx, pts, scale);
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, pit.rx * scale, pit.ry * scale, 0, 0, Math.PI * 2);
      }
    };

    // Organic snowbank shelf & fractured glacier rim (no jagged sawtooth triangle polygon)
    ctx.fillStyle = 'rgba(186, 230, 253, 0.44)';
    traceContour(1.045);
    ctx.fill();

    ctx.strokeStyle = 'rgba(240, 249, 255, 0.88)';
    ctx.lineWidth = 2.6;
    traceContour(1.012);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.6;
    traceContour(1.03);
    ctx.stroke();

    ctx.save();
    traceContour(1);
    ctx.clip();

    const wallDrop = Math.min(26, Math.max(16, pit.ry * 0.34));
    const cliffGrad = ctx.createLinearGradient(0, -pit.ry, 0, pit.ry);
    cliffGrad.addColorStop(0, '#5BB4E8');
    cliffGrad.addColorStop(0.28, '#145585');
    cliffGrad.addColorStop(0.65, '#0A2E52');
    cliffGrad.addColorStop(1, '#051A33');
    ctx.fillStyle = cliffGrad;
    ctx.fillRect(-pit.rx * 1.4, -pit.ry * 1.4, pit.rx * 2.8, pit.ry * 2.8);

    ctx.save();
    ctx.translate(0, wallDrop);
    traceContour(0.97);
    ctx.clip();

    const maxR = Math.max(pit.rx, pit.ry) * 1.25;
    const waterGrad = ctx.createRadialGradient(-pit.rx * 0.1, -pit.ry * 0.12, 8, 0, 0, maxR);
    waterGrad.addColorStop(0, '#0096E6');
    waterGrad.addColorStop(0.45, '#006EC7');
    waterGrad.addColorStop(0.82, '#004A99');
    waterGrad.addColorStop(1, '#002B66');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(-pit.rx * 1.5, -pit.ry * 1.5, pit.rx * 3.0, pit.ry * 3.0);

    if (waterPat) {
      const driftX = (world.elapsedTime * 16 + pit.id * 43) % 256;
      const driftY = (world.elapsedTime * 10 + pit.id * 29) % 256;
      ctx.save();
      ctx.globalAlpha = 0.78;
      ctx.translate(driftX, driftY);
      ctx.fillStyle = waterPat;
      ctx.fillRect(-pit.rx * 1.5 - driftX, -pit.ry * 1.5 - driftY, pit.rx * 3.0, pit.ry * 3.0);
      ctx.restore();
    }

    // Crisp ripple & ambient occlusion under ice rim
    const frac = (world.elapsedTime * 0.35 + pit.id * 0.4) % 1;
    ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - frac) * 0.25})`;
    ctx.lineWidth = 1.5;
    traceContour(0.32 + frac * 0.58);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 14, 38, 0.72)';
    ctx.lineWidth = 11;
    ctx.save();
    ctx.translate(0, 3);
    traceContour(0.985);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.6;
    traceContour(0.96);
    ctx.stroke();

    ctx.restore(); // end recessed water clip

    ctx.strokeStyle = 'rgba(3, 18, 42, 0.65)';
    ctx.lineWidth = 4;
    traceContour(1.0);
    ctx.stroke();

    ctx.restore(); // end outer pit clip
    ctx.restore();
  }
}
