import { ARENA_MAPS } from './maps';
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
  icePits?: IcePit[];
  explosions: Explosion[];
  particles: Particle[];
  floatingTexts: FloatingText[];
}

export interface CameraState {
  x: number;
  y: number;
  initialized: boolean;
}

export interface CursorOverlayState {
  controlScheme?: ControlScheme;
  cursorScreen?: { x: number; y: number } | null;
  hideJoystick?: boolean;
  spectateTargetId?: number | null;
}

export function getArenaViewTransform(
  map: ArenaMap,
  isImmersive: boolean,
  canvasWidth: number,
  canvasHeight: number,
  localPlayer: RenderPlayer | undefined,
  camera: CameraState,
  updateCamera = false
): { scale: number; offsetX: number; offsetY: number } {
  if (isImmersive && localPlayer) {
    const targetCamX = localPlayer.alive
      ? localPlayer.x
      : map.spawns[localPlayer.id]?.x ?? localPlayer.x;
    const targetCamY = localPlayer.alive
      ? localPlayer.y
      : map.spawns[localPlayer.id]?.y ?? localPlayer.y;

    let camX = camera.x;
    let camY = camera.y;
    if (!camera.initialized) {
      camX = targetCamX;
      camY = targetCamY;
      if (updateCamera) {
        camera.x = camX;
        camera.y = camY;
        camera.initialized = true;
      }
    } else if (updateCamera) {
      camera.x += (targetCamX - camera.x) * 0.16;
      camera.y += (targetCamY - camera.y) * 0.16;
      camX = camera.x;
      camY = camera.y;
    }

    const scale = Math.min(
      Math.max(canvasWidth / IMMERSIVE_VIEW_WIDTH, canvasHeight / IMMERSIVE_VIEW_HEIGHT) * 0.92,
      Math.min(canvasWidth / 760, canvasHeight / 540)
    );

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
let sharedLightCanvas: HTMLCanvasElement | null = null;
let sharedBeamScratchCanvas: HTMLCanvasElement | null = null;
let sharedFogCanvas: HTMLCanvasElement | null = null;
let sharedWispCanvas: HTMLCanvasElement | null = null;
let sharedWaterCanvas: HTMLCanvasElement | null = null;

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
  border: string
) {
  ctx.save();
  // Deep contrast rug drop shadow against rich walnut floor
  ctx.fillStyle = 'rgba(5, 2, 1, 0.48)';
  ctx.fillRect(x + 4, y + 6, w, h);

  ctx.fillStyle = primary;
  ctx.fillRect(x, y, w, h);

  // Subtle woven center sheen for jewel-tone depth
  const sheen = ctx.createLinearGradient(x, y, x, y + h);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
  sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, w, h);

  // Ornamental double border
  ctx.strokeStyle = border;
  ctx.lineWidth = 4.5;
  ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);

  ctx.strokeStyle = 'rgba(254, 249, 195, 0.52)';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x + 18, y + 18, w - 36, h - 36);

  // Center diamond medallion
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

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.36)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Fringe tassels on short ends
  ctx.strokeStyle = 'rgba(254, 243, 199, 0.68)';
  ctx.lineWidth = 1.6;
  for (let fy = y + 8; fy < y + h - 6; fy += 8) {
    ctx.beginPath();
    ctx.moveTo(x - 6, fy);
    ctx.lineTo(x, fy);
    ctx.moveTo(x + w, fy);
    ctx.lineTo(x + w + 6, fy);
    ctx.stroke();
  }
  ctx.restore();
}

function getFloorCanvas(map: ArenaMap): HTMLCanvasElement {
  const key = `${map.id}_${map.width}x${map.height}_v7`;
  const existing = floorCache.get(key);
  if (existing) return existing;

  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const ctx = off.getContext('2d');
  if (!ctx) return off;

  if (map.floorTheme === 'grass_outdoors') {
    // Rich sunlit emerald-to-olive woodland clearing matching Emerald Grove & Meadow Clearing thumbnails
    const baseGrad = ctx.createRadialGradient(
      map.width * 0.46,
      map.height * 0.44,
      70,
      map.width * 0.5,
      map.height * 0.5,
      Math.max(map.width, map.height) * 0.72
    );
    baseGrad.addColorStop(0, '#55992D');
    baseGrad.addColorStop(0.52, '#316E26');
    baseGrad.addColorStop(1, '#163D17');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, map.width, map.height);

    // Subtle mown grass turf bands
    const stripeW = 84;
    for (let sx = 0; sx < map.width; sx += stripeW) {
      if (Math.floor(sx / stripeW) % 2 === 0) {
        ctx.fillStyle = 'rgba(132, 204, 22, 0.055)';
        ctx.fillRect(sx, 0, stripeW, map.height);
      }
    }

    // Organic lush moss & sunlit clover variation patches
    for (let i = 0; i < (map.immersive ? 130 : 90); i++) {
      const px = seededRand(i * 13 + 1) * map.width;
      const py = seededRand(i * 29 + 3) * map.height;
      const pr = 36 + seededRand(i * 41 + 7) * 95;
      ctx.fillStyle =
        i % 3 === 0
          ? 'rgba(14, 52, 20, 0.30)'
          : i % 3 === 1
            ? 'rgba(132, 204, 22, 0.12)'
            : 'rgba(34, 139, 58, 0.18)';
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Footpaths: diagonal X stony dirt trails for Meadow Clearing, cardinal clearing paths for Emerald Grove
    ctx.save();
    ctx.lineCap = 'round';
    if (!map.immersive) {
      // Dark earth verge under diagonal X dirt paths
      ctx.strokeStyle = 'rgba(78, 56, 32, 0.72)';
      ctx.lineWidth = 86;
      ctx.beginPath();
      ctx.moveTo(45, 45);
      ctx.lineTo(map.width - 45, map.height - 45);
      ctx.moveTo(map.width - 45, 45);
      ctx.lineTo(45, map.height - 45);
      ctx.stroke();

      // Sunlit sandy-ochre footpath center
      ctx.strokeStyle = 'rgba(176, 140, 90, 0.74)';
      ctx.lineWidth = 56;
      ctx.stroke();

      // Central circular earth junction matching top-right thumbnail
      const midG = ctx.createRadialGradient(
        map.width * 0.5,
        map.height * 0.5,
        12,
        map.width * 0.5,
        map.height * 0.5,
        142
      );
      midG.addColorStop(0, 'rgba(205, 168, 112, 0.85)');
      midG.addColorStop(0.68, 'rgba(154, 118, 72, 0.68)');
      midG.addColorStop(1, 'rgba(92, 68, 40, 0)');
      ctx.fillStyle = midG;
      ctx.beginPath();
      ctx.arc(map.width * 0.5, map.height * 0.5, 142, 0, Math.PI * 2);
      ctx.fill();

      // Natural textured pebbles scattered along the X trails
      for (let i = 0; i < 160; i++) {
        const diagA = i % 2 === 0;
        const t = 0.06 + seededRand(i * 37 + 5) * 0.88;
        const jitter = (seededRand(i * 53 + 9) - 0.5) * 52;
        const px = (diagA ? t * map.width : (1 - t) * map.width) + jitter;
        const py = t * map.height + (seededRand(i * 61 + 3) - 0.5) * 42;
        const pr = 2 + seededRand(i * 73 + 1) * 4.2;
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
      ctx.strokeStyle = 'rgba(122, 92, 58, 0.48)';
      ctx.lineWidth = 68;
      ctx.beginPath();
      ctx.moveTo(map.width * 0.5, 45);
      ctx.lineTo(map.width * 0.5, map.height - 45);
      ctx.moveTo(45, map.height * 0.5);
      ctx.lineTo(map.width - 45, map.height * 0.5);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(196, 162, 114, 0.24)';
      ctx.lineWidth = 40;
      ctx.stroke();

      ctx.fillStyle = 'rgba(148, 122, 86, 0.44)';
      ctx.beginPath();
      ctx.arc(map.width / 2, map.height / 2, 155, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(218, 194, 152, 0.32)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Diagonal golden morning sun-rays filtering from top-left across both Meadow Clearing & Emerald Grove
    const sunBeams = map.immersive ? [160, 440, 740, 1280] : [90, 270, 480];
    for (const bx of sunBeams) {
      const spanX = map.immersive ? 520 : 410;
      const spanY = map.height * 0.78;
      const rayGrad = ctx.createLinearGradient(bx, 0, bx + spanX, spanY);
      rayGrad.addColorStop(0, 'rgba(254, 240, 138, 0.20)');
      rayGrad.addColorStop(0.55, 'rgba(250, 204, 21, 0.07)');
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

    // Delicate grass blades, moss specks & wildflowers
    for (let i = 0; i < (map.immersive ? 420 : 240); i++) {
      const gx = 30 + seededRand(i * 7 + 11) * (map.width - 60);
      const gy = 30 + seededRand(i * 19 + 23) * (map.height - 60);
      if (i % 6 === 0) {
        const flowerColors = ['#FDE047', '#FB7185', '#FEF9C3', '#F59E0B'];
        ctx.fillStyle = flowerColors[i % flowerColors.length];
        ctx.beginPath();
        ctx.arc(gx, gy, 2.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(163, 230, 53, 0.26)' : 'rgba(74, 222, 128, 0.22)';
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
    // Crisp bright glacier white-to-ice-blue snowfield matching Winter Tussle thumbnail
    ctx.fillStyle = '#D9EEFF';
    ctx.fillRect(0, 0, map.width, map.height);

    // Sunlit glacier-white center fading to cool powder-blue corners
    const snowWash = ctx.createRadialGradient(
      map.width * 0.5,
      map.height * 0.48,
      60,
      map.width * 0.5,
      map.height * 0.5,
      Math.max(map.width, map.height) * 0.72
    );
    snowWash.addColorStop(0, 'rgba(248, 252, 255, 0.86)');
    snowWash.addColorStop(0.55, 'rgba(214, 236, 255, 0.56)');
    snowWash.addColorStop(1, 'rgba(125, 185, 245, 0.52)');
    ctx.fillStyle = snowWash;
    ctx.fillRect(0, 0, map.width, map.height);

    // Sculpted wind-carved snowdrifts (crisp sky-blue shadow trough + luminous snow ridge)
    for (let i = 0; i < 30; i++) {
      const dx = 85 + seededRand(i * 17 + 5) * (map.width - 170);
      const dy = 70 + seededRand(i * 31 + 11) * (map.height - 140);
      const rx = 85 + seededRand(i * 43 + 3) * 120;
      const ry = 26 + seededRand(i * 59 + 7) * 38;
      const rot = (seededRand(i * 71 + 9) - 0.5) * 0.55;

      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(rot);

      ctx.fillStyle = i % 2 === 0 ? 'rgba(96, 165, 250, 0.28)' : 'rgba(56, 189, 248, 0.24)';
      ctx.beginPath();
      ctx.ellipse(7, 9, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(244, 249, 255, 0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.94, ry * 0.84, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Cool sparkling frost crystals & ice-blue snow glints
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
    // Rich Teal-Slate Armored Metal & Stone Tiles matching Cargo Deck thumbnail
    ctx.fillStyle = '#0D1720';
    ctx.fillRect(0, 0, map.width, map.height);

    const tile = 100;
    const cols = Math.ceil(map.width / tile);
    const rows = Math.ceil(map.height / tile);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * tile;
        const y = r * tile;
        const seed = r * 97 + c * 43;
        const isLight = (r + c) % 2 === 0;

        // Alternating cool dark teal-slate & steel-graphite slabs
        const tileGrad = ctx.createLinearGradient(x, y, x + tile, y + tile);
        if (isLight) {
          tileGrad.addColorStop(0, '#304556');
          tileGrad.addColorStop(0.55, '#253646');
          tileGrad.addColorStop(1, '#1C2A38');
        } else {
          tileGrad.addColorStop(0, '#1D2B38');
          tileGrad.addColorStop(0.55, '#16212D');
          tileGrad.addColorStop(1, '#101822');
        }
        ctx.fillStyle = tileGrad;
        ctx.fillRect(x, y, tile, tile);

        // Brushed stone/metal micro-veining & subtle teal reflection
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 2, y + 2, tile - 4, tile - 4);
        ctx.clip();

        ctx.strokeStyle = isLight ? 'rgba(153, 246, 228, 0.10)' : 'rgba(148, 163, 184, 0.06)';
        ctx.lineWidth = 1.5;
        for (let v = 0; v < 2; v++) {
          const offset = seededRand(seed + v * 19) * tile * 0.65;
          ctx.beginPath();
          ctx.moveTo(x - 10 + offset, y + tile + 8);
          ctx.bezierCurveTo(
            x + tile * 0.3 + (seededRand(seed + v + 3) - 0.5) * 28,
            y + tile * 0.65,
            x + tile * 0.65,
            y + tile * 0.35 + (seededRand(seed + v + 7) - 0.5) * 28,
            x + tile + 8,
            y - 8 + offset * 0.5
          );
          ctx.stroke();
        }
        ctx.restore();

        // Crisp cool-steel top & left bevel rim
        ctx.fillStyle = isLight ? 'rgba(165, 243, 252, 0.14)' : 'rgba(148, 163, 184, 0.07)';
        ctx.fillRect(x + 1, y + 1, tile - 2, 2);
        ctx.fillRect(x + 1, y + 1, 2, tile - 2);

        // Deep crisp recessed tile grout seam
        ctx.strokeStyle = 'rgba(4, 8, 14, 0.85)';
        ctx.lineWidth = 2.2;
        ctx.strokeRect(x, y, tile, tile);
      }
    }

    // Subtle cool cyan tactical deck framing & center dock ring
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.24)';
    ctx.lineWidth = 3;
    ctx.strokeRect(70, 70, map.width - 140, map.height - 140);
    ctx.beginPath();
    ctx.arc(map.width / 2, map.height / 2, 130, 0, Math.PI * 2);
    ctx.stroke();
  } else if (map.floorTheme === 'library_wood') {
    // Rich burnished mahogany & walnut planks + ornate crimson-gold & olive-gold rugs
    ctx.fillStyle = '#261107';
    ctx.fillRect(0, 0, map.width, map.height);

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
        const seed = r * 149 + c * 41;
        const toneIdx = Math.floor(seededRand(seed) * tones.length);
        ctx.fillStyle = tones[toneIdx];
        ctx.fillRect(x, y, plankW, plankH);

        // Deep mahogany grain
        ctx.strokeStyle = 'rgba(12, 4, 1, 0.48)';
        ctx.lineWidth = 1.1;
        for (let g = 0; g < 3; g++) {
          const gy = y + 6 + g * 9 + seededRand(seed + g) * 4;
          ctx.beginPath();
          ctx.moveTo(x + 4, gy);
          ctx.bezierCurveTo(
            x + plankW * 0.35,
            gy + (seededRand(seed + g + 10) - 0.5) * 3,
            x + plankW * 0.7,
            gy + (seededRand(seed + g + 20) - 0.5) * 3,
            x + plankW - 4,
            gy
          );
          ctx.stroke();
        }

        // Warm amber wood sheen highlight
        ctx.fillStyle = 'rgba(251, 191, 36, 0.065)';
        ctx.fillRect(x + 1, y + 1, plankW - 2, 2);

        ctx.strokeStyle = 'rgba(10, 4, 1, 0.74)';
        ctx.lineWidth = 1.3;
        ctx.strokeRect(x, y, plankW, plankH);
      }
    }

    // Ornate Library Persian rugs (deep burgundy/ochre atrium + olive-gold alcove runners matching collage)
    drawPersianRug(ctx, map.width / 2 - 280, map.height / 2 - 220, 560, 440, '#6B1D1A', '#D4A853');
    drawPersianRug(ctx, 735, 620, 260, 145, '#4A562B', '#C7B062');
    drawPersianRug(ctx, map.width - 995, 620, 260, 145, '#6B1D1A', '#D4A853');
    drawPersianRug(ctx, 735, map.height - 765, 260, 145, '#6B1D1A', '#D4A853');
    drawPersianRug(ctx, map.width - 995, map.height - 765, 260, 145, '#4A562B', '#C7B062');

    // Side hall woven rugs on Ground Floor
    drawPersianRug(ctx, 110, map.height / 2 - 140, 260, 280, '#582019', '#C9A154');
    drawPersianRug(ctx, map.width - 370, map.height / 2 - 140, 260, 280, '#4A562B', '#B8A85A');
  } else {
    // Rich honey-oak to roasted-walnut hardwood planks for Manor Foyer & Wooden Mansion collage
    ctx.fillStyle = '#381B0C';
    ctx.fillRect(0, 0, map.width, map.height);

    const plankH = 34;
    const plankW = 148;
    const tones = ['#4E2712', '#5E3017', '#42200E', '#69361A', '#542A14'];

    const rows = Math.ceil(map.height / plankH);
    for (let r = 0; r < rows; r++) {
      const y = r * plankH;
      const rowOffset = (r % 2) * (plankW * 0.5) + (r % 3) * 26;
      const cols = Math.ceil((map.width + plankW) / plankW) + 1;

      for (let c = -1; c < cols; c++) {
        const x = c * plankW - rowOffset;
        const seed = r * 131 + c * 37;
        const toneIdx = Math.floor(seededRand(seed) * tones.length);
        ctx.fillStyle = tones[toneIdx];
        ctx.fillRect(x, y, plankW, plankH);

        // Deep dark walnut wood grain
        ctx.strokeStyle = 'rgba(18, 7, 2, 0.42)';
        ctx.lineWidth = 1.1;
        for (let g = 0; g < 3; g++) {
          const gy = y + 6 + g * 9 + seededRand(seed + g) * 4;
          ctx.beginPath();
          ctx.moveTo(x + 4, gy);
          ctx.bezierCurveTo(
            x + plankW * 0.35,
            gy + (seededRand(seed + g + 10) - 0.5) * 3,
            x + plankW * 0.7,
            gy + (seededRand(seed + g + 20) - 0.5) * 3,
            x + plankW - 4,
            gy
          );
          ctx.stroke();
        }

        // Subtle lacquered varnish sheen highlight
        ctx.fillStyle = 'rgba(254, 215, 140, 0.08)';
        ctx.fillRect(x + 1, y + 1, plankW - 2, 2);

        // Crisp dark plank seam
        ctx.strokeStyle = 'rgba(14, 5, 1, 0.7)';
        ctx.lineWidth = 1.3;
        ctx.strokeRect(x, y, plankW, plankH);
      }
    }

    // Jewel-toned Persian carpets matching Wooden Mansion reference collage (Crimson, Royal Blue, Plum Purple, Emerald)
    drawPersianRug(
      ctx,
      map.width / 2 - (map.immersive ? 260 : 190),
      map.height / 2 - (map.immersive ? 190 : 140),
      map.immersive ? 520 : 380,
      map.immersive ? 380 : 280,
      '#B91C1C',
      '#F59E0B'
    );

    if (map.immersive) {
      drawPersianRug(ctx, 290, 220, 320, 210, '#1D4ED8', '#FBBF24');
      drawPersianRug(ctx, map.width - 610, 220, 320, 210, '#047857', '#FCD34D');
      drawPersianRug(ctx, 290, map.height - 430, 320, 210, '#7E22CE', '#FBBF24');
      drawPersianRug(ctx, map.width - 610, map.height - 430, 320, 210, '#BE123C', '#FDE047');
    } else {
      // Rich warm radial vignette on Manor Foyer so center carpet and twin spotlights pop like thumbnail
      const vig = ctx.createRadialGradient(
        map.width * 0.5,
        map.height * 0.48,
        map.height * 0.24,
        map.width * 0.5,
        map.height * 0.5,
        map.width * 0.66
      );
      vig.addColorStop(0, 'rgba(18, 6, 1, 0)');
      vig.addColorStop(1, 'rgba(12, 4, 1, 0.48)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, map.width, map.height);
    }
  }

  floorCache.set(key, off);
  return off;
}

function getLibraryUpperFloorCanvas(map: ArenaMap): HTMLCanvasElement {
  const key = `${map.id}_upper_${map.width}x${map.height}_v1`;
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

  // Slightly warmer lit mahogany balcony boards for Upper Mezzanine
  ctx.fillStyle = '#2B150A';
  ctx.fillRect(0, 0, map.width, map.height);

  const plankH = 34;
  const plankW = 152;
  const tones = ['#361B0D', '#412110', '#2E170B', '#482513', '#32190D'];
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

      ctx.strokeStyle = 'rgba(14, 5, 2, 0.42)';
      ctx.lineWidth = 1.1;
      for (let g = 0; g < 2; g++) {
        const gy = y + 9 + g * 12;
        ctx.beginPath();
        ctx.moveTo(x + 4, gy);
        ctx.lineTo(x + plankW - 4, gy);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(253, 224, 71, 0.05)';
      ctx.fillRect(x + 1, y + 1, plankW - 2, 2);

      ctx.strokeStyle = 'rgba(10, 4, 1, 0.68)';
      ctx.lineWidth = 1.3;
      ctx.strokeRect(x, y, plankW, plankH);
    }
  }

  // Olive-moss gallery runners along the top/bottom upper bridges & side mezzanine galleries
  drawPersianRug(ctx, 1180, 72, 640, 104, '#4A562B', '#8E9C52');
  drawPersianRug(ctx, 1180, map.height - 176, 640, 104, '#4A562B', '#8E9C52');
  drawPersianRug(ctx, 84, map.height / 2 - 220, 74, 440, '#434F27', '#82904A');
  drawPersianRug(ctx, map.width - 158, map.height / 2 - 220, 74, 440, '#434F27', '#82904A');

  ctx.restore();

  floorCache.set(key, off);
  return off;
}

function drawObstacle(ctx: CanvasRenderingContext2D, wall: WallRect, world?: RenderableWorld) {
  const kind = wall.kind ?? 'metal';

  if (
    kind === 'perimeter_wood' ||
    kind === 'perimeter_hedge' ||
    kind === 'perimeter_steel' ||
    kind === 'perimeter_ice'
  ) {
    if (kind === 'perimeter_hedge') {
      ctx.fillStyle = '#14532D';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 2;
      ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
    } else if (kind === 'perimeter_wood') {
      ctx.fillStyle = '#2E1306';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = '#92400E';
      ctx.lineWidth = 2;
      ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
    } else if (kind === 'perimeter_ice') {
      ctx.fillStyle = '#0A1E3D';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2.4;
      ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
    } else {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 2;
      ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
    }
    return;
  }

  // Deep cinematic cast shadow onto floor away from upper lights
  ctx.fillStyle = kind === 'pine_tree' ? 'rgba(8, 28, 66, 0.38)' : 'rgba(4, 3, 8, 0.56)';
  ctx.beginPath();
  ctx.roundRect(
    wall.x + 10,
    wall.y + 15,
    wall.w,
    wall.h,
    kind === 'tree' || kind === 'rock' || kind === 'pine_tree' ? 22 : 7
  );
  ctx.fill();

  if (kind === 'sofa') {
    const fabric = wall.accent ?? '#B91C1C';
    ctx.save();
    // Wooden base trim
    ctx.fillStyle = '#451A03';
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 8);
    ctx.fill();

    // Velvet sofa body
    ctx.fillStyle = fabric;
    ctx.beginPath();
    ctx.roundRect(wall.x + 3, wall.y + 3, wall.w - 6, wall.h - 6, 6);
    ctx.fill();

    // Backrest cushion ridge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.fillRect(wall.x + 10, wall.y + 5, wall.w - 20, 12);

    // Side armrests
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.roundRect(wall.x + 4, wall.y + 5, 14, wall.h - 10, 4);
    ctx.roundRect(wall.x + wall.w - 18, wall.y + 5, 14, wall.h - 10, 4);
    ctx.fill();

    // Seat cushion seams
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1.5;
    const cushions = 3;
    const innerW = wall.w - 38;
    for (let i = 1; i < cushions; i++) {
      const sx = wall.x + 19 + (innerW * i) / cushions;
      ctx.beginPath();
      ctx.moveTo(sx, wall.y + 18);
      ctx.lineTo(sx, wall.y + wall.h - 6);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (kind === 'bed') {
    const duvet = wall.accent ?? '#9F1239';
    ctx.save();
    // Mahogany bed frame
    ctx.fillStyle = '#451A03';
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 6);
    ctx.fill();

    // Crisp ivory sheet
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.roundRect(wall.x + 6, wall.y + 6, wall.w - 12, wall.h - 12, 4);
    ctx.fill();

    // Colored plush duvet covering lower 68%
    const duvetX = wall.x + 6;
    const duvetY = wall.y + wall.h * 0.34;
    const duvetW = wall.w - 12;
    const duvetH = wall.h * 0.66 - 6;
    ctx.fillStyle = duvet;
    ctx.beginPath();
    ctx.roundRect(duvetX, duvetY, duvetW, duvetH, 4);
    ctx.fill();

    // Folded blanket cuff
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(duvetX, duvetY, duvetW, 9);

    // Twin pillows at headboard
    ctx.fillStyle = '#E2E8F0';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    const pw = (wall.w - 34) / 2;
    ctx.beginPath();
    ctx.roundRect(wall.x + 12, wall.y + 11, pw, 22, 5);
    ctx.roundRect(wall.x + 22 + pw, wall.y + 11, pw, 22, 5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (kind === 'table') {
    ctx.save();
    // Carved mahogany tabletop
    ctx.fillStyle = '#78350F';
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 8);
    ctx.fill();
    ctx.stroke();

    // Inner bevel & golden cloth runner
    ctx.fillStyle = '#92400E';
    ctx.fillRect(wall.x + 8, wall.y + 8, wall.w - 16, wall.h - 16);

    ctx.fillStyle = '#B91C1C';
    ctx.fillRect(wall.x + 14, wall.y + wall.h * 0.35, wall.w - 28, wall.h * 0.3);

    // Center golden centerpiece
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(wall.x + wall.w / 2, wall.y + wall.h / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (kind === 'bookshelf') {
    ctx.save();
    // Deep dark mahogany carved bookcase matching DOORS Library mood
    ctx.fillStyle = '#1E0C05';
    ctx.strokeStyle = '#3F1B0B';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 3);
    ctx.fill();
    ctx.stroke();

    // Recessed dark shadow interior well
    ctx.fillStyle = '#110602';
    ctx.fillRect(wall.x + 4, wall.y + 4, wall.w - 8, wall.h - 8);

    // Subtle warm sconce edge catch on top-left mahogany moulding
    ctx.fillStyle = 'rgba(217, 119, 6, 0.14)';
    ctx.fillRect(wall.x + 2, wall.y + 1.5, wall.w - 4, 2);

    // Dark antique leather & cloth book spines (low-contrast, atmospheric)
    const darkBooks = [
      '#3D1614',
      '#2C1C14',
      '#1C2536',
      '#1B2D22',
      '#2C192E',
      '#25201D',
      '#351D13',
      '#1E1A18',
    ];
    const vertical = wall.h > wall.w;
    const shelfSeed = Math.round(wall.x * 13 + wall.y * 29);

    if (vertical) {
      const spineW = 4;
      const spineX = wall.x + (wall.w - spineW) * 0.5;
      const sideSpace = Math.max(4, (wall.w - spineW) * 0.5 - 3);

      // Left face & Right face book rows facing cleanly outward on each side of the divider
      for (let by = wall.y + 6, idx = 0; by < wall.y + wall.h - 10; by += 8, idx++) {
        const rndL = seededRand(shelfSeed + idx * 17);
        const rndR = seededRand(shelfSeed + idx * 23 + 7);
        const thickL = 5 + Math.floor(rndL * 2.5);
        const thickR = 5 + Math.floor(rndR * 2.5);
        const depthL = Math.max(4, sideSpace - Math.floor(rndL * 3));
        const depthR = Math.max(4, sideSpace - Math.floor(rndR * 3));
        const protL = rndL > 0.88 ? -2 : 0;
        const protR = rndR > 0.88 ? 2 : 0;

        // Left-facing row (spines flush to spineX on right, jutting left)
        const lx = spineX - depthL + protL;
        ctx.fillStyle = darkBooks[(idx + Math.floor(rndL * 5)) % darkBooks.length];
        ctx.fillRect(lx, by, depthL, thickL);
        if (idx % 4 === 0) {
          ctx.fillStyle = 'rgba(217, 179, 108, 0.16)';
          ctx.fillRect(lx + 1, by + 1, 2, thickL - 2);
        }

        // Right-facing row (spines flush to spineX + spineW on left, jutting right)
        const rx = spineX + spineW + protR;
        ctx.fillStyle = darkBooks[(idx + 3 + Math.floor(rndR * 5)) % darkBooks.length];
        ctx.fillRect(rx, by, depthR, thickR);
        if ((idx + 2) % 4 === 0) {
          ctx.fillStyle = 'rgba(217, 179, 108, 0.16)';
          ctx.fillRect(rx + depthR - 3, by + 1, 2, thickR - 2);
        }
      }

      // Central solid dark mahogany partition wall (~4px) separating both faces
      ctx.fillStyle = '#2B1207';
      ctx.fillRect(spineX, wall.y + 2, spineW, wall.h - 4);
      ctx.fillStyle = 'rgba(217, 119, 6, 0.18)';
      ctx.fillRect(spineX + 1, wall.y + 2, 1, wall.h - 4);

      // Carved horizontal bay dividers
      ctx.fillStyle = '#2B1207';
      for (let dy = wall.y + 88; dy < wall.y + wall.h - 28; dy += 90) {
        ctx.fillRect(wall.x + 2, dy, wall.w - 4, 4);
      }
    } else {
      const spineH = 4;
      const spineY = wall.y + (wall.h - spineH) * 0.5;
      const sideSpace = Math.max(4, (wall.h - spineH) * 0.5 - 3);

      // North face & South face book rows facing cleanly outward on each side of the divider
      for (let bx = wall.x + 6, idx = 0; bx < wall.x + wall.w - 10; bx += 8, idx++) {
        const rndN = seededRand(shelfSeed + idx * 19);
        const rndS = seededRand(shelfSeed + idx * 29 + 11);
        const thickN = 5 + Math.floor(rndN * 2.5);
        const thickS = 5 + Math.floor(rndS * 2.5);
        const depthN = Math.max(4, sideSpace - Math.floor(rndN * 3));
        const depthS = Math.max(4, sideSpace - Math.floor(rndS * 3));
        const protN = rndN > 0.88 ? -2 : 0;
        const protS = rndS > 0.88 ? 2 : 0;

        // North-facing row
        const ny = spineY - depthN + protN;
        ctx.fillStyle = darkBooks[(idx + Math.floor(rndN * 5)) % darkBooks.length];
        ctx.fillRect(bx, ny, thickN, depthN);
        if (idx % 4 === 0) {
          ctx.fillStyle = 'rgba(217, 179, 108, 0.16)';
          ctx.fillRect(bx + 1, ny + 1, thickN - 2, 2);
        }

        // South-facing row
        const sy = spineY + spineH + protS;
        ctx.fillStyle = darkBooks[(idx + 3 + Math.floor(rndS * 5)) % darkBooks.length];
        ctx.fillRect(bx, sy, thickS, depthS);
        if ((idx + 2) % 4 === 0) {
          ctx.fillStyle = 'rgba(217, 179, 108, 0.16)';
          ctx.fillRect(bx + 1, sy + depthS - 3, thickS - 2, 2);
        }
      }

      // Central solid dark mahogany partition wall (~4px) separating North & South faces
      ctx.fillStyle = '#2B1207';
      ctx.fillRect(wall.x + 2, spineY, wall.w - 4, spineH);
      ctx.fillStyle = 'rgba(217, 119, 6, 0.18)';
      ctx.fillRect(wall.x + 2, spineY + 1, wall.w - 4, 1);

      // Carved vertical bay dividers
      ctx.fillStyle = '#2B1207';
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

    // Trunk base peeking slightly
    ctx.fillStyle = '#4A2B14';
    ctx.beginPath();
    ctx.arc(cx, cy + 4, r * 0.32, 0, Math.PI * 2);
    ctx.fill();

    // Deep forest canopy base
    ctx.fillStyle = '#114424';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Leafy perimeter clusters matching Emerald Grove reference
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.25;
      ctx.fillStyle = i % 2 === 0 ? '#166534' : '#15803D';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.44, cy + Math.sin(a) * r * 0.44, r * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sunlit crown highlights
    ctx.fillStyle = '#4D9B2A';
    ctx.beginPath();
    ctx.arc(cx - r * 0.14, cy - r * 0.16, r * 0.52, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#84CC16';
    ctx.beginPath();
    ctx.arc(cx - r * 0.22, cy - r * 0.24, r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // Crisp individual sunlit leaf flecks
    ctx.fillStyle = 'rgba(217, 249, 157, 0.48)';
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 - 0.7;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.46, cy + Math.sin(a) * r * 0.46, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (kind === 'rock') {
    ctx.save();
    const g = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
    g.addColorStop(0, '#64748B');
    g.addColorStop(0.55, '#475569');
    g.addColorStop(1, '#334155');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(wall.x + 2, wall.y + 2, wall.w - 4, wall.h - 4, 22);
    ctx.fill();
    ctx.stroke();

    // Sunlit warm grey ridge facet
    ctx.fillStyle = 'rgba(203, 213, 225, 0.36)';
    ctx.beginPath();
    ctx.roundRect(wall.x + 8, wall.y + 8, wall.w * 0.58, wall.h * 0.5, 14);
    ctx.fill();

    // Rich velvety emerald moss cap
    ctx.fillStyle = '#3F8F29';
    ctx.beginPath();
    ctx.arc(wall.x + wall.w * 0.68, wall.y + wall.h * 0.3, 13, 0, Math.PI * 2);
    ctx.arc(wall.x + wall.w * 0.55, wall.y + wall.h * 0.24, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#84CC16';
    ctx.beginPath();
    ctx.arc(wall.x + wall.w * 0.66, wall.y + wall.h * 0.27, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (kind === 'pine_tree') {
    ctx.save();
    const cx = wall.x + wall.w / 2;
    const cy = wall.y + wall.h / 2;
    const r = Math.min(wall.w, wall.h) * 0.5;

    // Dark bark base
    ctx.fillStyle = '#3F2312';
    ctx.beginPath();
    ctx.arc(cx, cy + 5, r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // Tier 1 (outermost dark mountain evergreen needles)
    ctx.fillStyle = '#064E3B';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rad = i % 2 === 0 ? r * 1.02 : r * 0.78;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Tier 2 (mid rich pine green boughs)
    ctx.fillStyle = '#047857';
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.22;
      const rad = i % 2 === 0 ? r * 0.78 : r * 0.56;
      const px = cx - 2 + Math.cos(a) * rad;
      const py = cy - 2 + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Cool glacier-tinted snow patches draped along upper boughs
    ctx.fillStyle = '#BAE6FD';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.88 + i * 0.48;
      ctx.beginPath();
      ctx.ellipse(
        cx + Math.cos(a) * r * 0.58,
        cy + Math.sin(a) * r * 0.58,
        r * 0.22,
        r * 0.13,
        a + Math.PI / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Tier 3 (inner bright spruce crown + cool frost-capped peak)
    ctx.fillStyle = '#34D399';
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 3, r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#E0F2FE';
    ctx.beginPath();
    ctx.arc(cx - 4, cy - 5, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 7, r * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  if (kind === 'hedge') {
    ctx.save();
    ctx.fillStyle = '#114424';
    ctx.strokeStyle = '#092B15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 12);
    ctx.fill();
    ctx.stroke();

    const hg = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
    hg.addColorStop(0, '#4D9B2A');
    hg.addColorStop(0.55, '#2E7D2B');
    hg.addColorStop(1, '#166534');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.roundRect(wall.x + 5, wall.y + 5, wall.w - 10, wall.h - 10, 9);
    ctx.fill();

    // Crisp leaf flecks + berry blossoms matching reference thumbnail
    ctx.fillStyle = 'rgba(190, 242, 100, 0.35)';
    for (let hy = wall.y + 12; hy < wall.y + wall.h - 10; hy += 20) {
      for (let hx = wall.x + 12; hx < wall.x + wall.w - 10; hx += 20) {
        ctx.beginPath();
        ctx.arc(hx + ((hx + hy) % 5), hy + 2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#FB7185';
    for (let hy = wall.y + 18; hy < wall.y + wall.h - 12; hy += 28) {
      for (let hx = wall.x + 18; hx < wall.x + wall.w - 12; hx += 28) {
        ctx.beginPath();
        ctx.arc(hx, hy, 3.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    return;
  }

  if (kind === 'mezzanine_rail' || kind === 'stair_rail') {
    ctx.save();
    // Carved mahogany balustrade matching DOORS Library photo
    const isVert = wall.h > wall.w;
    ctx.fillStyle = '#2B1206';
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 3);
    ctx.fill();
    ctx.stroke();

    // Brass / warm wood top handrail highlight
    ctx.fillStyle = '#9A5423';
    if (isVert) {
      ctx.fillRect(wall.x + 4, wall.y + 3, wall.w - 8, wall.h - 6);
    } else {
      ctx.fillRect(wall.x + 3, wall.y + 4, wall.w - 6, wall.h - 8);
    }

    // Carved wooden newel posts spaced neatly along rail
    ctx.fillStyle = '#D97706';
    ctx.strokeStyle = '#1E0B03';
    ctx.lineWidth = 1.2;
    const step = 46;
    if (isVert) {
      for (let py = wall.y + 8; py <= wall.y + wall.h - 6; py += step) {
        ctx.beginPath();
        ctx.arc(wall.x + wall.w * 0.5, py, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      for (let px = wall.x + 8; px <= wall.x + wall.w - 6; px += step) {
        ctx.beginPath();
        ctx.arc(px, wall.y + wall.h * 0.5, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  if (kind === 'library_pillar') {
    drawLibraryPillar(ctx, wall, world);
    return;
  }

  // Default: Brushed steel metal crate / machined Cargo Deck barrier
  const grad = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
  grad.addColorStop(0, '#788CA3');
  grad.addColorStop(0.5, '#4B5E73');
  grad.addColorStop(1, '#2D3A4A');
  ctx.fillStyle = grad;
  ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

  ctx.strokeStyle = '#B8E6E2';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(wall.x + 1, wall.y + wall.h - 1);
  ctx.lineTo(wall.x + 1, wall.y + 1);
  ctx.lineTo(wall.x + wall.w - 1, wall.y + 1);
  ctx.stroke();

  ctx.strokeStyle = '#141D29';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(wall.x + wall.w - 1, wall.y + 1);
  ctx.lineTo(wall.x + wall.w - 1, wall.y + wall.h - 1);
  ctx.lineTo(wall.x + 1, wall.y + wall.h - 1);
  ctx.stroke();

  if (wall.w > 34 && wall.h > 34) {
    const ix = wall.x + 7;
    const iy = wall.y + 7;
    const iw = wall.w - 14;
    const ih = wall.h - 14;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ix, iy, iw, ih);

    if (iw >= 28 && ih >= 28 && Math.max(iw / ih, ih / iw) < 3.2) {
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

function drawLibraryPillar(ctx: CanvasRenderingContext2D, wall: WallRect, world?: RenderableWorld) {
  ctx.save();
  const cx = wall.x + wall.w * 0.5;
  const cy = wall.y + wall.h * 0.5;

  // Heavy mahogany architectural stone-trimmed monolith
  const bodyGrad = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
  bodyGrad.addColorStop(0, '#4A1E0D');
  bodyGrad.addColorStop(0.5, '#2E1107');
  bodyGrad.addColorStop(1, '#1A0803');
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#9A5B25';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 12);
  ctx.fill();
  ctx.stroke();

  // Molded cornice ledge
  ctx.fillStyle = '#3B180A';
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(wall.x + 12, wall.y + 12, wall.w - 24, wall.h - 24, 8);
  ctx.fill();
  ctx.stroke();

  // Warm brass corner finials
  for (const [fx, fy] of [
    [wall.x + 16, wall.y + 16],
    [wall.x + wall.w - 16, wall.y + 16],
    [wall.x + 16, wall.y + wall.h - 16],
    [wall.x + wall.w - 16, wall.y + wall.h - 16],
  ]) {
    const glow = ctx.createRadialGradient(fx, fy, 1, fx, fy, 16);
    glow.addColorStop(0, 'rgba(253, 224, 71, 0.7)');
    glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(fx, fy, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(fx, fy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4 Player Escape Doors recessed on N, E, S, W faces of the central pillar
  const libState = world?.libraryState;
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

    ctx.save();
    if (door.side === 'W' || door.side === 'E') {
      const dx = door.side === 'W' ? wall.x - 4 : wall.x + wall.w - 10;
      ctx.fillStyle = unlocked ? '#10B981' : '#5C2912';
      ctx.strokeStyle = trimColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(dx, cy - 34, 14, 68, 3);
      ctx.fill();
      ctx.stroke();

      // Door brass lock plate
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
      // Golden Escape Crown + Finisher Rank beside the unlocked gate
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
    ctx.restore();
  }

  // Top Parchment Tablet displaying the 1..5 Cipher Sequence visible from all sides
  ctx.fillStyle = '#140804';
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(cx - 72, cy - 78, 144, 156, 7);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FCD34D';
  ctx.font = '800 11px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CIPHER', cx, cy - 64);

  const seq = libState?.pillarSequence ?? ['square', 'circle', 'triangle', 'diamond', 'star'];
  for (let i = 0; i < Math.min(5, seq.length); i++) {
    const rowY = cy - 42 + i * 26;
    ctx.fillStyle = 'rgba(251, 191, 36, 0.1)';
    ctx.beginPath();
    ctx.roundRect(cx - 58, rowY - 11, 116, 22, 4);
    ctx.fill();

    ctx.fillStyle = '#FDE68A';
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}.`, cx - 44, rowY + 0.5);

    drawLibraryShapeGlyph(ctx, seq[i], cx + 22, rowY, 9.5, '#FACC15');
  }

  ctx.restore();
}

function drawLibraryStairs(
  ctx: CanvasRenderingContext2D,
  map: ArenaMap,
  world: RenderableWorld,
  libraryBlend: number
) {
  const stairs = map.stairs ?? [];
  if (stairs.length === 0) return;

  const lights = getConeLightSources(map);

  ctx.save();
  for (const st of stairs) {
    // Deep recessed stairwell pit backdrop
    ctx.fillStyle = '#070302';
    ctx.strokeStyle = '#4F240D';
    ctx.lineWidth = 2.6;
    ctx.fillRect(st.x, st.y, st.w, st.h);
    ctx.strokeRect(st.x, st.y, st.w, st.h);

    const vertical = st.upDir === 'up' || st.upDir === 'down';
    const steps = 11;

    if (vertical) {
      const stepH = st.h / steps;
      for (let i = 0; i < steps; i++) {
        // elev = 0 at Ground Floor, 1 at Upper Mezzanine
        const t = (i + 0.5) / steps;
        const elev = st.upDir === 'up' ? 1 - t : t;
        // Perspective depth: steps farther from viewer's current floor appear narrower & recessed
        const depthFromViewer = Math.abs(elev - libraryBlend);
        const sideInset = 6 + depthFromViewer * 14;
        const sy = st.y + i * stepH;

        // Sconce lighting intensity on this step
        const sxCenter = st.x + st.w * 0.5;
        const syCenter = sy + stepH * 0.5;
        let lampWarmth = 0;
        for (const l of lights) {
          const d = Math.hypot(sxCenter - l.x, syCenter - l.y);
          if (d < 520) lampWarmth = Math.max(lampWarmth, 1 - d / 520);
        }

        const lightLevel = Math.max(0.08, (1 - depthFromViewer * 0.86) * (0.68 + lampWarmth * 0.45));
        const r = Math.round(14 + lightLevel * 86);
        const g = Math.round(6 + lightLevel * 44);
        const b = Math.round(3 + lightLevel * 18);

        // Recessed side shadow walls (staircase cheeks)
        ctx.fillStyle = '#0C0502';
        ctx.fillRect(st.x + 2, sy, sideInset - 2, stepH + 0.5);
        ctx.fillRect(st.x + st.w - sideInset, sy, sideInset - 2, stepH + 0.5);

        // Step wooden tread with subtle gradient across tread depth
        const treadW = st.w - sideInset * 2;
        const treadGrad = ctx.createLinearGradient(0, sy, 0, sy + stepH);
        const riserTopDark = `rgb(${Math.round(r * 0.45)}, ${Math.round(g * 0.45)}, ${Math.round(b * 0.45)})`;
        const treadMain = `rgb(${r}, ${g}, ${b})`;
        if (st.upDir === 'up') {
          treadGrad.addColorStop(0, riserTopDark);
          treadGrad.addColorStop(0.28, treadMain);
          treadGrad.addColorStop(1, treadMain);
        } else {
          treadGrad.addColorStop(0, treadMain);
          treadGrad.addColorStop(0.72, treadMain);
          treadGrad.addColorStop(1, riserTopDark);
        }
        ctx.fillStyle = treadGrad;
        ctx.fillRect(st.x + sideInset, sy, treadW, stepH);

        // Riser shadow cast from step above downward + warm nosing highlight
        const lipY = st.upDir === 'up' ? sy + stepH - 2.6 : sy + 0.6;
        ctx.fillStyle = `rgba(245, 178, 95, ${0.06 + lightLevel * 0.24})`;
        ctx.fillRect(st.x + sideInset + 1, lipY, treadW - 2, 2.2);

        const riserShadowY = st.upDir === 'up' ? sy : sy + stepH - 3.8;
        ctx.fillStyle = `rgba(0, 0, 0, ${0.42 + depthFromViewer * 0.35})`;
        ctx.fillRect(st.x + sideInset, riserShadowY, treadW, 3.8);
      }

      // Dynamic cast shadow on steps if any entity stands on or right above this stairwell
      for (const p of world.players) {
        if (!p.alive) continue;
        if (p.x >= st.x - 16 && p.x <= st.x + st.w + 16 && p.y >= st.y - 24 && p.y <= st.y + st.h + 24) {
          const sg = ctx.createRadialGradient(p.x, p.y + 6, 4, p.x, p.y + 6, 36);
          sg.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
          sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(p.x, p.y + 6, 36, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Directional floor depth darkness curtain:
      // On Ground (blend=0): top/upper end fades into deep darkness
      // On Upper (blend=1): bottom/ground end fades steeply into pitch black chasm
      const gY = st.upDir === 'up' ? st.y + st.h : st.y;
      const uY = st.upDir === 'up' ? st.y : st.y + st.h;
      const depthGrad = ctx.createLinearGradient(0, gY, 0, uY);
      const groundAlpha = Math.max(0.02, libraryBlend * 0.94);
      const upperAlpha = Math.max(0.02, (1 - libraryBlend) * 0.88);
      depthGrad.addColorStop(0, `rgba(4, 2, 1, ${groundAlpha})`);
      depthGrad.addColorStop(0.42, `rgba(4, 2, 1, ${groundAlpha * 0.45 + upperAlpha * 0.16})`);
      depthGrad.addColorStop(0.62, `rgba(4, 2, 1, ${upperAlpha * 0.48 + groundAlpha * 0.12})`);
      depthGrad.addColorStop(1, `rgba(4, 2, 1, ${upperAlpha})`);
      ctx.fillStyle = depthGrad;
      ctx.fillRect(st.x + 2, st.y + 2, st.w - 4, st.h - 4);

      // Faint carved chevron arrow toward destination floor
      const midX = st.x + st.w * 0.5;
      const midY = st.y + st.h * 0.5;
      const arrowDir =
        libraryBlend >= 0.5 ? (st.upDir === 'up' ? 1 : -1) : st.upDir === 'up' ? -1 : 1;
      ctx.strokeStyle = 'rgba(245, 194, 112, 0.28)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(midX - 14, midY - arrowDir * 5);
      ctx.lineTo(midX, midY + arrowDir * 8);
      ctx.lineTo(midX + 14, midY - arrowDir * 5);
      ctx.stroke();
    } else {
      const stepW = st.w / steps;
      for (let i = 0; i < steps; i++) {
        const elev = st.upDir === 'left' ? 1 - (i + 0.5) / steps : (i + 0.5) / steps;
        const depthFromViewer = Math.abs(elev - libraryBlend);
        const lightLevel = Math.max(0.1, 1 - depthFromViewer * 0.85);
        const sx = st.x + i * stepW;
        ctx.fillStyle = `rgb(${Math.round(18 + lightLevel * 76)}, ${Math.round(8 + lightLevel * 38)}, ${Math.round(4 + lightLevel * 16)})`;
        ctx.fillRect(sx + 1, st.y + 6, stepW - 2, st.h - 12);
      }
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

  // Stun indicator when hit by Nitro/TNT blast
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
  }

  // Name tag
  ctx.fillStyle = stunned ? '#FEF08A' : raging ? '#FB923C' : '#FDBA74';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.lineWidth = 3.2;
  ctx.font = '800 13px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  const label = stunned ? `THE FIGURE · STUN ${Math.ceil(monster.stunTimer)}s` : raging ? 'THE FIGURE · RAGE!' : 'THE FIGURE';
  ctx.strokeText(label, 0, -r - 16);
  ctx.fillText(label, 0, -r - 16);

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
    // Crisp 1-frame puncture squash/pop impact
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

  // Deep cinematic directional floor drop shadow
  ctx.fillStyle = 'rgba(4, 3, 8, 0.56)';
  ctx.beginPath();
  ctx.roundRect(-hw + 9, -hh + 12, box.w, box.h, 6);
  ctx.fill();

  // Warm wooden cover crate base (same hue, higher shadow/highlight contrast)
  ctx.fillStyle = box.state === 'punctured' ? '#FDE68A' : '#C2762B';
  ctx.strokeStyle = '#140B04';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.roundRect(-hw, -hh, box.w, box.h, 5);
  ctx.fill();
  ctx.stroke();

  // Inner slatted wooden panel
  const inset = 9;
  ctx.fillStyle = box.state === 'punctured' ? '#FEF08A' : '#EAB875';
  ctx.strokeStyle = '#6B2D08';
  ctx.lineWidth = 2;
  ctx.fillRect(-hw + inset, -hh + inset, box.w - inset * 2, box.h - inset * 2);
  ctx.strokeRect(-hw + inset, -hh + inset, box.w - inset * 2, box.h - inset * 2);

  // Horizontal wooden plank seams + top/bottom bevel contrast
  ctx.strokeStyle = 'rgba(92, 38, 9, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-hw + inset, -box.h * 0.14);
  ctx.lineTo(hw - inset, -box.h * 0.14);
  ctx.moveTo(-hw + inset, box.h * 0.14);
  ctx.lineTo(hw - inset, box.h * 0.14);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 250, 230, 0.38)';
  ctx.fillRect(-hw + 3, -hh + 2.5, box.w - 6, 4.5);
  ctx.fillStyle = 'rgba(45, 20, 5, 0.35)';
  ctx.fillRect(-hw + 3, hh - 6.5, box.w - 6, 4);

  // Diagonal timber brace
  ctx.strokeStyle = 'rgba(120, 50, 10, 0.42)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-hw + inset + 2, hh - inset - 2);
  ctx.lineTo(hw - inset - 2, -hh + inset + 2);
  ctx.stroke();

  // Corner steel rivets
  ctx.fillStyle = '#CBD5E1';
  for (const [rx, ry] of [
    [-hw + 4.5, -hh + 4.5],
    [hw - 4.5, -hh + 4.5],
    [-hw + 4.5, hh - 4.5],
    [hw - 4.5, hh - 4.5],
  ]) {
    ctx.beginPath();
    ctx.arc(rx, ry, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Punctured tear & 1-frame impact burst
  if (box.state === 'punctured' || box.state === 'fading') {
    if (box.state === 'punctured') {
      // Bright single-frame muzzle/splinter burst
      ctx.fillStyle = 'rgba(254, 243, 199, 0.85)';
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

    // Jagged dark puncture hole & torn cardboard flaps
    ctx.fillStyle = '#3B2311';
    ctx.strokeStyle = '#F5DEB3';
    ctx.lineWidth = 1.6;
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
  const localPlayer = world.players.find((p) => p.id === localPlayerId) ?? world.players[0];
  const spectatePlayer =
    isImmersive && cursorOverlay?.spectateTargetId != null && !localPlayer?.alive
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
    true
  );

  let shakeX = 0;
  let shakeY = 0;
  if (world.screenShake > 0.2) {
    shakeX = (Math.random() - 0.5) * world.screenShake;
    shakeY = (Math.random() - 0.5) * world.screenShake;
  }

  const worldTx = offsetX + shakeX;
  const worldTy = offsetY + shakeY;

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

    if (player.spawnInvulnTimer > 0 && Math.floor(player.spawnInvulnTimer * 18) % 2 === 0) {
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

    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = skinColor;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(stride * 12, -23, 9.5, 5.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-stride * 12, 23, 9.5, 5.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = skinColor;
    ctx.strokeStyle = '#090D16';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(20, -17.5, 8.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(20, 17.5, 8.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = '#090D16';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.roundRect(20, -8.5, 31, 17, 4.5);
    ctx.fill();
    ctx.stroke();

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

    if (finish === 'metal') {
      const shimmerAngle = Math.sin(world.elapsedTime * 1.6 + player.id) * 10;
      const metalGrad = ctx.createLinearGradient(-bodyR, -bodyR + shimmerAngle, bodyR, bodyR - shimmerAngle);
      metalGrad.addColorStop(0, '#F8FAFC');
      metalGrad.addColorStop(0.28, accentColor);
      metalGrad.addColorStop(0.52, '#475569');
      metalGrad.addColorStop(0.76, '#E2E8F0');
      metalGrad.addColorStop(1, '#1E293B');
      ctx.fillStyle = metalGrad;
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
      bodyGrad.addColorStop(0, '#FFFFFF');
      bodyGrad.addColorStop(0.24, accentColor);
      bodyGrad.addColorStop(0.7, skinColor);
      bodyGrad.addColorStop(1, '#0F172A');
      ctx.fillStyle = bodyGrad;
    }

    ctx.strokeStyle = '#090D16';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Textured & animated surface finish overlay clipped to player sphere
    if (finish !== 'solid') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, bodyR - 1.5, 0, Math.PI * 2);
      ctx.clip();

      if (finish === 'fish_scale') {
        const scR = 8.5;
        ctx.lineWidth = 1.6;
        for (let row = -3; row <= 3; row++) {
          const sx = row * 9;
          const yOff = (Math.abs(row) % 2) * 7;
          for (let col = -3; col <= 3; col++) {
            const sy = col * 14 + yOff;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
            ctx.beginPath();
            ctx.arc(sx, sy, scR, -Math.PI * 0.45, Math.PI * 0.45);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.38)';
            ctx.beginPath();
            ctx.arc(sx + 1.4, sy, scR, -Math.PI * 0.42, Math.PI * 0.42);
            ctx.stroke();
          }
        }
      } else if (finish === 'wood') {
        ctx.fillStyle = 'rgba(120, 53, 15, 0.24)';
        ctx.fillRect(-bodyR, -bodyR, bodyR * 2, bodyR * 2);
        ctx.strokeStyle = 'rgba(28, 10, 2, 0.56)';
        ctx.lineWidth = 1.6;
        for (let gy = -24; gy <= 24; gy += 8) {
          ctx.beginPath();
          ctx.moveTo(-bodyR, gy);
          ctx.bezierCurveTo(-10, gy + ((gy % 16 === 0) ? 4 : -4), 10, gy - ((gy % 16 === 0) ? 3 : -3), bodyR, gy + 1);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.18)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(-6, -4, 7, 4, 0.2, 0, Math.PI * 2);
        ctx.stroke();
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
      }
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, bodyR - 6, -Math.PI * 0.85, -Math.PI * 0.35);
    ctx.stroke();
    ctx.restore();

    if (player.id === 1) {
      ctx.fillStyle = skinColor;
      ctx.strokeStyle = '#090D16';
      ctx.lineWidth = 2.8;
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
      ctx.fillStyle = '#FDE047';
      ctx.strokeStyle = '#090D16';
      ctx.lineWidth = 2.5;
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
      ctx.fillStyle = accentColor;
      ctx.strokeStyle = '#090D16';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-21, -33, 18, 8, 4);
      ctx.roundRect(-21, 25, 18, 8, 4);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = skinColor;
      ctx.strokeStyle = '#090D16';
      ctx.lineWidth = 2.5;
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

    ctx.fillStyle = '#090D16';
    ctx.beginPath();
    ctx.ellipse(13, 0, 9.5, 17.5, 0, 0, Math.PI * 2);
    ctx.fill();

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

    ctx.restore();

    if (player.ammo > 0) {
      for (let a = 0; a < player.ammo; a++) {
        const pipAngle = -Math.PI / 2 + (a - (player.ammo - 1) / 2) * 0.28;
        const px = Math.cos(pipAngle) * (PLAYER_RADIUS + 10);
        const py = Math.sin(pipAngle) * (PLAYER_RADIUS + 10);
        ctx.fillStyle = '#FACC15';
        ctx.strokeStyle = '#090D16';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    if (player.stunTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.5)';
      ctx.lineWidth = 2.5;
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

      for (let s = 0; s < 3; s++) {
        const sa = world.elapsedTime * 6 + (s * Math.PI * 2) / 3;
        const sx = Math.cos(sa) * 24;
        const sy = Math.sin(sa) * 8 - (PLAYER_RADIUS + 12);
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
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
        const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, item.radius + 7);
        glow.addColorStop(0, 'rgba(56, 189, 248, 0.32)');
        glow.addColorStop(0.75, 'rgba(56, 189, 248, 0.14)');
        glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, item.radius + 7, 0, Math.PI * 2);
        ctx.fill();

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
        const pulse = 0.5 + 0.5 * Math.sin(world.elapsedTime * 5 + item.id);
        const aura = ctx.createRadialGradient(0, 0, 12, 0, 0, 48);
        aura.addColorStop(0, `rgba(74, 222, 128, ${0.38 + pulse * 0.18})`);
        aura.addColorStop(1, 'rgba(34, 197, 94, 0)');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, 0, 48, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#15803D';
        ctx.strokeStyle = '#031F0E';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.roundRect(-s, -s, s * 2, s * 2, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#2EE86B';
        ctx.fillRect(-s + 5, -s + 5, s * 2 - 10, s * 2 - 10);
        ctx.fillStyle = '#86EFAC';
        ctx.fillRect(-s + 4, -s + 3, s * 2 - 8, 4);
        ctx.fillStyle = 'rgba(5, 46, 22, 0.45)';
        ctx.fillRect(-s + 4, s - 7, s * 2 - 8, 4);

        ctx.strokeStyle = '#14532D';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(-s + 5, -s + 5, s * 2 - 10, s * 2 - 10);

        ctx.fillStyle = '#F0FDF4';
        ctx.strokeStyle = '#031F0E';
        ctx.lineWidth = 2.8;
        ctx.font = '900 12px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText('NITRO', 0, 1);
        ctx.fillText('NITRO', 0, 1);
      } else if (item.kind === 'tnt') {
        const armed = Boolean(item.armed);
        const cd = Math.max(0, item.countdown ?? 3);
        const secText = Math.ceil(cd).toString();
        const flash = armed && cd < 1.0 && Math.floor(cd * 10) % 2 === 0;
        const s = 29;

        ctx.fillStyle = flash ? '#FCA5A5' : '#991B1B';
        ctx.strokeStyle = '#120303';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-s, -s, s * 2, s * 2, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = flash ? '#FECACA' : '#FF2E22';
        ctx.fillRect(-s + 6, -s + 6, s * 2 - 12, s * 2 - 12);

        ctx.strokeStyle = 'rgba(105, 16, 16, 0.6)';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(-s + 6, -9);
        ctx.lineTo(s - 6, -9);
        ctx.moveTo(-s + 6, 9);
        ctx.lineTo(s - 6, 9);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 235, 235, 0.38)';
        ctx.fillRect(-s + 3, -s + 2.5, s * 2 - 6, 4.5);
        ctx.fillStyle = 'rgba(40, 4, 4, 0.45)';
        ctx.fillRect(-s + 3, s - 6.5, s * 2 - 6, 4);

        ctx.fillStyle = '#FECACA';
        for (const [rx, ry] of [
          [-s + 4, -s + 4],
          [s - 4, -s + 4],
          [-s + 4, s - 4],
          [s - 4, s - 4],
        ]) {
          ctx.beginPath();
          ctx.arc(rx, ry, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }

        if (armed) {
          ctx.strokeStyle = '#FEF08A';
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.arc(0, 0, s + 8, -Math.PI / 2, -Math.PI / 2 + (cd / 3) * Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = flash ? '#7F1D1D' : '#FEF08A';
          ctx.strokeStyle = '#450A0A';
          ctx.lineWidth = 3;
          ctx.font = '900 16px "Outfit", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeText('TNT', 0, -4);
          ctx.fillText('TNT', 0, -4);

          ctx.fillStyle = '#FFFFFF';
          ctx.font = '800 12px "JetBrains Mono", monospace';
          ctx.strokeText(`${secText}s`, 0, 12);
          ctx.fillText(`${secText}s`, 0, 12);
        } else {
          ctx.fillStyle = '#FEF08A';
          ctx.strokeStyle = '#450A0A';
          ctx.lineWidth = 3.2;
          ctx.font = '900 18px "Outfit", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeText('TNT', 0, 1);
          ctx.fillText('TNT', 0, 1);
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
      const floorCanvas = getFloorCanvas(map);
      ctx.drawImage(floorCanvas, 0, 0);
      drawAmbientArenaLights(ctx, map, world, 0);
      if (!isExtraDark) {
        drawDynamicLightShadows(ctx, map, world, 0);
      }
      drawPickupsOnFloor(0);
      for (const wall of map.walls) {
        if (isWallOnFloor(wall, 0)) drawObstacle(ctx, wall, world);
      }
      for (const box of world.boxes) {
        if ((box.floor ?? 0) === 0) drawCardboardBox(ctx, box);
      }
      if (localProg) {
        drawLibraryBooks(ctx, localProg.books, 0, world.elapsedTime);
      }
      for (const player of world.players) {
        if ((player.floor ?? 0) === 0 && !isPlayerMidStair(player)) {
          drawSinglePlayer(player);
        }
      }
      if (monster.transitioning) {
        if (monster.fromFloor === 0) {
          ctx.save();
          ctx.globalAlpha *= 1 - Math.max(0, Math.min(1, monster.transitionProgress ?? 0));
          drawLibraryMonster(ctx, monster, world.elapsedTime);
          ctx.restore();
        } else if (monster.toFloor === 0) {
          ctx.save();
          ctx.globalAlpha *= Math.max(0, Math.min(1, monster.transitionProgress ?? 0));
          drawLibraryMonster(ctx, monster, world.elapsedTime);
          ctx.restore();
        }
      } else if (monster.floor === 0 && !monsterOnStair) {
        drawLibraryMonster(ctx, monster, world.elapsedTime);
      }
    }

    // 1B. Smooth staircase transition darkness curtain obscuring Ground Floor up to pitch black
    if (libraryBlend > 0.01) {
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, libraryBlend * 1.05)})`;
      ctx.fillRect(0, 0, map.width, map.height);
    }

    // 1C. Staircases + any entities currently walking on stairs
    drawLibraryStairs(ctx, map, world, libraryBlend);
    for (const player of world.players) {
      if (isPlayerMidStair(player)) {
        drawSinglePlayer(player);
      }
    }
    if (
      monsterOnStair &&
      !monster.transitioning &&
      (monster.floor === localFloor || (libraryBlend > 0.05 && libraryBlend < 0.95))
    ) {
      drawLibraryMonster(ctx, monster, world.elapsedTime);
    }

    // 1D. Upper Mezzanine Floor (revealed smoothly only while on/past stairs)
    if (libraryBlend > 0.01) {
      ctx.save();
      ctx.globalAlpha = libraryBlend;
      const upperFloorCanvas = getLibraryUpperFloorCanvas(map);
      ctx.drawImage(upperFloorCanvas, 0, 0);
      drawAmbientArenaLights(ctx, map, world, 1);
      if (!isExtraDark) {
        drawDynamicLightShadows(ctx, map, world, 1);
      }
      drawSpawnPads();
      drawPickupsOnFloor(1);
      for (const wall of map.walls) {
        if (isWallOnFloor(wall, 1)) drawObstacle(ctx, wall, world);
      }
      for (const box of world.boxes) {
        if ((box.floor ?? 0) === 1) drawCardboardBox(ctx, box);
      }
      if (localProg) {
        drawLibraryBooks(ctx, localProg.books, 1, world.elapsedTime);
      }
      for (const player of world.players) {
        if ((player.floor ?? 0) === 1 && !isPlayerMidStair(player)) {
          drawSinglePlayer(player);
        }
      }
      if (monster.transitioning) {
        if (monster.fromFloor === 1) {
          ctx.save();
          ctx.globalAlpha *= 1 - Math.max(0, Math.min(1, monster.transitionProgress ?? 0));
          drawLibraryMonster(ctx, monster, world.elapsedTime);
          ctx.restore();
        } else if (monster.toFloor === 1) {
          ctx.save();
          ctx.globalAlpha *= Math.max(0, Math.min(1, monster.transitionProgress ?? 0));
          drawLibraryMonster(ctx, monster, world.elapsedTime);
          ctx.restore();
        }
      } else if (monster.floor === 1 && !monsterOnStair) {
        drawLibraryMonster(ctx, monster, world.elapsedTime);
      }
      ctx.restore();
    }
  } else {
    // 1. Standard Single-Floor Rendering
    const floorCanvas = getFloorCanvas(map);
    ctx.drawImage(floorCanvas, 0, 0);
    drawAmbientArenaLights(ctx, map, world);
    if (!isExtraDark) {
      drawDynamicLightShadows(ctx, map, world);
    }
    drawIcePits(ctx, world, map);
    drawSpawnPads();
    drawPickupsOnFloor();

    for (const wall of map.walls) {
      drawObstacle(ctx, wall, world);
    }
    for (const box of world.boxes) {
      drawCardboardBox(ctx, box);
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
      const isLocal = p.id === activeViewId;
      const range = isLocal ? 490 : 360;
      const baseFov = isLocal ? 1.32 : 1.08;
      const outerFov = baseFov * 1.45;
      const outerPoly = computeFlashlightPolygon(p.x, p.y, p.angle, outerFov, range, shadowWalls);
      const midPoly = computeFlashlightPolygon(p.x, p.y, p.angle, baseFov * 0.96, range * 0.96, shadowWalls);
      const corePoly = computeFlashlightPolygon(p.x, p.y, p.angle, baseFov * 0.54, range * 0.9, shadowWalls);

      const entityShadows: ShadowWedgeQuad[] = [];
      const fovHalf = outerFov * 0.5;

      // Shadows cast by other players on the same floor
      for (const other of world.players) {
        if (!other.alive || other.id === p.id) continue;
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
      if (monster && (!isLibrary || monster.floor === localFloor || isMonsterOnStair(monster))) {
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
    // Subtle floating golden forest fireflies in Emerald Grove matching collage mood
    if (map.floorTheme === 'grass_outdoors') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 42; i++) {
        const bx = seededRand(i * 41 + 9) * map.width;
        const by = seededRand(i * 67 + 13) * map.height;
        const fx = bx + Math.sin(world.elapsedTime * 0.7 + i) * 26;
        const fy = by + Math.cos(world.elapsedTime * 0.55 + i * 1.4) * 22;
        const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(world.elapsedTime * 2.6 + i * 2.1));
        const g = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, 11);
        g.addColorStop(0, `rgba(254, 240, 138, ${0.42 * twinkle})`);
        g.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(fx, fy, 11, 0, Math.PI * 2);
        ctx.fill();
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
    for (const b of world.bullets) {
      if (isLibrary && (b.floor ?? 0) !== localFloor) continue;
      const grad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, bulletGlowRadius);
      grad.addColorStop(0, hexWithAlpha(b.color, isExtraDark ? 0.48 : 0.3));
      grad.addColorStop(0.45, hexWithAlpha(b.color, isExtraDark ? 0.2 : 0.12));
      grad.addColorStop(1, hexWithAlpha(b.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, bulletGlowRadius, 0, Math.PI * 2);
      ctx.fill();

      if (b.age < 0.2) {
        const flashA = (1 - b.age / 0.2) * 0.45;
        const mg = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, 95);
        mg.addColorStop(0, `rgba(254, 240, 138, ${flashA})`);
        mg.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 95, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const wall of map.walls) {
        if (wall.kind?.startsWith('perimeter')) continue;
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

    for (const item of world.pickups) {
      if (isLibrary && (item.floor ?? 0) !== localFloor) continue;
      if (item.kind === 'tnt' && item.armed) {
        const pulse = 0.5 + 0.5 * Math.sin(world.elapsedTime * 14);
        const r = 64 + pulse * 18;
        const g = ctx.createRadialGradient(item.x, item.y, 4, item.x, item.y, r);
        g.addColorStop(0, `rgba(239, 68, 68, ${isExtraDark ? 0.32 : 0.16})`);
        g.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(item.x, item.y, r, 0, Math.PI * 2);
        ctx.fill();
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
      const t = Math.min(1, ex.age / Math.max(0.01, ex.duration));
      // Rapid blinding peak in first 25%, warm realistic amber afterglow taper
      const flash = t < 0.18 ? t / 0.18 : Math.pow(1 - (t - 0.18) / 0.82, 1.35);
      const lightR = ex.radius * 1.85;

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

    const lightScale = 0.5;
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

      if (cameraPlayer && cameraPlayer.alive) {
        const auraR = 215;
        const aura = lctx.createRadialGradient(
          cameraPlayer.x,
          cameraPlayer.y,
          24,
          cameraPlayer.x,
          cameraPlayer.y,
          auraR
        );
        aura.addColorStop(0, 'rgba(0, 0, 0, 0.98)');
        aura.addColorStop(0.45, 'rgba(0, 0, 0, 0.65)');
        aura.addColorStop(0.8, 'rgba(0, 0, 0, 0.22)');
        aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lctx.fillStyle = aura;
        lctx.beginPath();
        lctx.arc(cameraPlayer.x, cameraPlayer.y, auraR, 0, Math.PI * 2);
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

      for (const b of world.bullets) {
        if (isLibrary && (b.floor ?? 0) !== localFloor) continue;
        const br = b.age < 0.2 ? 125 : 88;
        const bg = lctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, br);
        bg.addColorStop(0, 'rgba(0, 0, 0, 0.94)');
        bg.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
        bg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lctx.fillStyle = bg;
        lctx.beginPath();
        lctx.arc(b.x, b.y, br, 0, Math.PI * 2);
        lctx.fill();
      }

      for (const item of world.pickups) {
        if (isLibrary && (item.floor ?? 0) !== localFloor) continue;
        const pr = item.kind === 'tnt' ? 84 : 44;
        const strength = item.kind === 'tnt' ? 0.88 : 0.56;
        const pg = lctx.createRadialGradient(item.x, item.y, 2, item.x, item.y, pr);
        pg.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
        pg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lctx.fillStyle = pg;
        lctx.beginPath();
        lctx.arc(item.x, item.y, pr, 0, Math.PI * 2);
        lctx.fill();
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
      ctx.filter = 'blur(8px)';
      ctx.drawImage(lightCanvas, -12, -12, canvasWidth + 24, canvasHeight + 24);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(worldTx, worldTy);
    ctx.scale(scale, scale);

    for (const player of world.players) {
      if (!player.alive || player.id === activeViewId) continue;
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
      if (m.floor === localFloor || (libraryBlend > 0.05 && libraryBlend < 0.95 && isMonsterOnStair(m))) {
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.angle);
        ctx.globalAlpha = m.mode === 'rage' ? 0.58 : 0.34;
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
    isLibrary ? localFloor : undefined
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
      scale
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
  if (cursorOverlay?.controlScheme === 'CURSOR_SPACE' && cursorOverlay.cursorScreen && localPlayer?.alive) {
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

    ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(joystick.originX, joystick.originY, joystick.maxRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(joystick.originX, joystick.originY, joystick.maxRadius * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (joystick.magnitude > 0.08) {
      ctx.strokeStyle = '#38BDF8';
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

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(joystick.originX, joystick.originY);
    ctx.lineTo(joystick.currentX, joystick.currentY);
    ctx.stroke();

    const armed = localPlayer && localPlayer.ammo > 0 && localPlayer.stunTimer <= 0;
    ctx.fillStyle = armed ? '#FACC15' : '#38BDF8';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(joystick.currentX, joystick.currentY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

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
        colorRgb: '251, 191, 36',
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
        colorRgb: '251, 191, 36',
      });
    }
    return lights;
  }

  return [];
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
  const d = Math.hypot(vx, vy);
  if (d <= r + 4 || d >= range) return null;

  if (dirY !== 0) {
    if (vy * dirY <= 8) return null;
    const offAxis = Math.abs(Math.atan2(vx, vy * dirY));
    if (offAxis > coneMaxHalfAngle + 0.25) return null;
    const coneFade = Math.max(0, 1 - Math.max(0, offAxis - coneMaxHalfAngle * 0.6) / (coneMaxHalfAngle * 0.65 + 0.25));
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
  return null;
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
  const cx = rx + rw * 0.5;
  const cy = ry + rh * 0.5;
  const vx = cx - lx;
  const vy = cy - ly;
  const d = Math.hypot(vx, vy);
  if (d < 12 || d >= range) return null;
  if (dirY !== 0 && vy * dirY <= 8) return null;

  const offAxis = Math.abs(Math.atan2(vx, vy * dirY));
  if (offAxis > coneMaxHalfAngle + 0.28) return null;
  const coneFade = Math.max(0, 1 - Math.max(0, offAxis - coneMaxHalfAngle * 0.6) / (coneMaxHalfAngle * 0.68 + 0.28));
  const distFade = 1 - d / range;
  const strength = Math.min(1, distFade * 1.15) * coneFade;
  if (strength <= 0.03) return null;

  const corners = [
    { x: rx, y: ry },
    { x: rx + rw, y: ry },
    { x: rx + rw, y: ry + rh },
    { x: rx, y: ry + rh },
  ];
  const baseAngle = Math.atan2(vy, vx);
  let minRel = Infinity;
  let maxRel = -Infinity;
  let minC = corners[0];
  let maxC = corners[0];

  for (const c of corners) {
    let rel = Math.atan2(c.y - ly, c.x - lx) - baseAngle;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    if (rel < minRel) {
      minRel = rel;
      minC = c;
    }
    if (rel > maxRel) {
      maxRel = rel;
      maxC = c;
    }
  }

  const len = Math.min(shadowLen, range - d + 100);
  const a0 = Math.atan2(minC.y - ly, minC.x - lx);
  const a1 = Math.atan2(maxC.y - ly, maxC.x - lx);

  return {
    x0: minC.x,
    y0: minC.y,
    x1: maxC.x,
    y1: maxC.y,
    fx1: maxC.x + Math.cos(a1) * len,
    fy1: maxC.y + Math.sin(a1) * len,
    fx0: minC.x + Math.cos(a0) * len,
    fy0: minC.y + Math.sin(a0) * len,
    tailX: cx + (vx / d) * len,
    tailY: cy + (vy / d) * len,
    strength,
  };
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
      if (poly) out.push(poly);
    }
  }

  return out;
}

function drawDynamicLightShadows(
  ctx: CanvasRenderingContext2D,
  map: ArenaMap,
  world: RenderableWorld,
  floorFilter?: FloorLevel
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

  const isWinter = map.floorTheme === 'winter_snow';
  const shadowRgb = isWinter ? '11, 30, 68' : '5, 6, 12';
  const peakShadow = isWinter ? 0.34 : 0.44;
  const midShadow = isWinter ? 0.15 : 0.2;
  const lights = getConeLightSources(map);
  for (const light of lights) {
    const polys = collectLightShadowPolys(light, map, world, isWinter ? 250 : 220, true, floorFilter);
    for (const poly of polys) {
      const mx = (poly.x0 + poly.x1) * 0.5;
      const my = (poly.y0 + poly.y1) * 0.5;
      const grad = ctx.createLinearGradient(mx, my, poly.tailX, poly.tailY);
      grad.addColorStop(0, `rgba(${shadowRgb}, ${peakShadow * poly.strength})`);
      grad.addColorStop(0.55, `rgba(${shadowRgb}, ${midShadow * poly.strength})`);
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

function drawAmbientArenaLights(
  ctx: CanvasRenderingContext2D,
  map: ArenaMap,
  world: RenderableWorld,
  floorFilter?: FloorLevel
) {
  ctx.save();
  if (map.floorTheme === 'mansion_wood') {
    const lights = getConeLightSources(map);
    for (const l of lights) {
      const py = l.y + l.dirY * 145;
      const topPool = ctx.createRadialGradient(l.x, l.y + l.dirY * 65, 16, l.x, py, 330);
      topPool.addColorStop(0, 'rgba(253, 224, 71, 0.24)');
      topPool.addColorStop(0.55, 'rgba(250, 204, 21, 0.1)');
      topPool.addColorStop(1, 'rgba(250, 204, 21, 0)');
      ctx.fillStyle = topPool;
      ctx.beginPath();
      ctx.arc(l.x, py, 330, 0, Math.PI * 2);
      ctx.fill();
    }

    const centerGlow = ctx.createRadialGradient(
      map.width * 0.5,
      map.height * 0.5,
      20,
      map.width * 0.5,
      map.height * 0.5,
      map.immersive ? 420 : 280
    );
    centerGlow.addColorStop(0, 'rgba(254, 240, 138, 0.14)');
    centerGlow.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = centerGlow;
    ctx.beginPath();
    ctx.arc(map.width * 0.5, map.height * 0.5, map.immersive ? 420 : 280, 0, Math.PI * 2);
    ctx.fill();
  } else if (map.floorTheme === 'library_wood') {
    // Warm amber wall-sconce pools + candlelit atrium/staircase glow matching DOORS Library photo
    const lights = getConeLightSources(map);
    for (const l of lights) {
      const py = l.y + l.dirY * 140;
      const pool = ctx.createRadialGradient(l.x, l.y + l.dirY * 60, 14, l.x, py, 340);
      pool.addColorStop(0, 'rgba(251, 191, 36, 0.25)');
      pool.addColorStop(0.55, 'rgba(245, 158, 11, 0.10)');
      pool.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(l.x, py, 340, 0, Math.PI * 2);
      ctx.fill();
    }

    if ((floorFilter ?? 0) === 0) {
      const centerGlow = ctx.createRadialGradient(map.width * 0.5, map.height * 0.5, 40, map.width * 0.5, map.height * 0.5, 520);
      centerGlow.addColorStop(0, 'rgba(251, 191, 36, 0.18)');
      centerGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = centerGlow;
      ctx.beginPath();
      ctx.arc(map.width * 0.5, map.height * 0.5, 520, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const st of map.stairs ?? []) {
      const sx = st.x + st.w * 0.5;
      const sy = st.upDir === 'up' ? st.y + 32 : st.y + st.h - 32;
      const sg = ctx.createRadialGradient(sx, sy, 12, sx, sy, 230);
      sg.addColorStop(0, 'rgba(253, 224, 71, 0.22)');
      sg.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, sy, 230, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (map.floorTheme === 'maple_cargo') {
    // Glowing emerald-green louvered floor vents matching Cargo Deck thumbnail
    const grates = [
      { x: map.width * 0.14, y: map.height * 0.5 },
      { x: map.width * 0.86, y: map.height * 0.5 },
      { x: map.width * 0.5, y: map.height * 0.14 },
      { x: map.width * 0.5, y: map.height * 0.86 },
      { x: map.width * 0.5, y: map.height * 0.5 },
    ];
    for (const g of grates) {
      const grad = ctx.createRadialGradient(g.x, g.y, 12, g.x, g.y, 195);
      grad.addColorStop(0, 'rgba(74, 222, 128, 0.30)');
      grad.addColorStop(0.5, 'rgba(34, 197, 94, 0.12)');
      grad.addColorStop(1, 'rgba(34, 197, 94, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 195, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#09151B';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(g.x - 40, g.y - 40, 80, 80, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(74, 222, 128, 0.68)';
      for (let gy = -28; gy <= 24; gy += 11) {
        ctx.fillRect(g.x - 28, g.y + gy, 56, 5);
      }
    }
  } else if (map.floorTheme === 'winter_snow') {
    const t = world.elapsedTime;
    const coolWash = ctx.createRadialGradient(
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
    ctx.fillStyle = coolWash;
    ctx.fillRect(0, 0, map.width, map.height);

    const fogBanks = [
      { bx: map.width * 0.28, by: map.height * 0.3, r: 320, spd: 0.28, amp: 55 },
      { bx: map.width * 0.72, by: map.height * 0.65, r: 350, spd: 0.22, amp: 65 },
      { bx: map.width * 0.5, by: map.height * 0.85, r: 300, spd: 0.34, amp: 48 },
    ];
    for (let i = 0; i < fogBanks.length; i++) {
      const f = fogBanks[i];
      const fx = f.bx + Math.sin(t * f.spd + i * 2.1) * f.amp;
      const fy = f.by + Math.cos(t * f.spd * 0.7 + i) * 22;
      const fog = ctx.createRadialGradient(fx, fy, 15, fx, fy, f.r);
      fog.addColorStop(0, 'rgba(219, 240, 255, 0.16)');
      fog.addColorStop(0.55, 'rgba(147, 197, 253, 0.08)');
      fog.addColorStop(1, 'rgba(147, 197, 253, 0)');
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.arc(fx, fy, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
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
  floorFilter?: FloorLevel
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
    const lights = getConeLightSources(map);

    const lightScale = 0.5;
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

      for (let i = 0; i < lights.length; i++) {
        const l = lights[i];
        const shimmer = 0.91 + 0.09 * Math.sin(elapsedTime * (isWinter ? 1.6 : 2.5) + i * 1.6);

        if (isWinter) {
          lctx.save();
          const cx = l.x;
          const cy = l.y + l.dirY * (l.beamLen * 0.45);
          const rx = l.beamHalfEnd * 0.96;
          const ry = l.beamLen * 0.62;
          lctx.translate(cx, cy);
          lctx.scale(1, ry / Math.max(1, rx));
          const rad = lctx.createRadialGradient(0, -rx * 0.35 * l.dirY, 16, 0, 0, rx);
          rad.addColorStop(0, `rgba(${l.colorRgb}, ${0.28 * shimmer})`);
          rad.addColorStop(0.45, `rgba(${l.colorRgb}, ${0.14 * shimmer})`);
          rad.addColorStop(0.8, `rgba(${l.colorRgb}, ${0.045 * shimmer})`);
          rad.addColorStop(1, `rgba(${l.colorRgb}, 0)`);
          lctx.fillStyle = rad;
          lctx.beginPath();
          lctx.arc(0, 0, rx, 0, Math.PI * 2);
          lctx.fill();
          lctx.restore();
        } else {
          const startY = l.y + l.dirY * 6;
          const endY = l.y + l.beamLen * l.dirY;
          const beamGrad = lctx.createLinearGradient(l.x, startY, l.x, endY);
          beamGrad.addColorStop(0, `rgba(${l.colorRgb}, ${0.27 * shimmer})`);
          beamGrad.addColorStop(0.55, `rgba(${l.colorRgb}, ${0.11 * shimmer})`);
          beamGrad.addColorStop(1, `rgba(${l.colorRgb}, 0)`);

          lctx.fillStyle = beamGrad;
          lctx.beginPath();
          lctx.moveTo(l.x - l.beamHalfBase, startY);
          lctx.lineTo(l.x + l.beamHalfBase, startY);
          lctx.lineTo(l.x + l.beamHalfEnd, endY);
          lctx.lineTo(l.x - l.beamHalfEnd, endY);
          lctx.closePath();
          lctx.fill();
        }
      }

      lctx.globalCompositeOperation = 'destination-out';
      for (const l of lights) {
        const polys = collectLightShadowPolys(l, map, world, l.range + 160, true, floorFilter);
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
      lctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (isWinter) {
        ctx.filter = 'blur(14px)';
      } else if (map.floorTheme === 'library_wood') {
        ctx.filter = 'blur(5px)';
      }
      ctx.drawImage(
        lightCanvas,
        -worldTx / scale,
        -worldTy / scale,
        canvasWidth / scale,
        canvasHeight / scale
      );
      ctx.restore();
    }

    for (const l of lights) {
      if (map.floorTheme === 'mansion_wood' || map.floorTheme === 'library_wood') {
        ctx.fillStyle = '#78350F';
        ctx.strokeStyle = '#1C1917';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(l.x, l.y, 24, l.dirY > 0 ? 0 : Math.PI, l.dirY > 0 ? Math.PI : Math.PI * 2, false);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = map.floorTheme === 'library_wood' ? '#FDE047' : '#FEF08A';
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
    const sunSpots = map.immersive ? [450, 1200, 1850] : [220, 620];
    for (const sx of sunSpots) {
      const sunGrad = ctx.createLinearGradient(sx, 0, sx + 320, 620);
      sunGrad.addColorStop(0, 'rgba(254, 249, 195, 0.18)');
      sunGrad.addColorStop(0.55, 'rgba(254, 240, 138, 0.07)');
      sunGrad.addColorStop(1, 'rgba(254, 249, 195, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.moveTo(sx - 70, 0);
      ctx.lineTo(sx + 85, 0);
      ctx.lineTo(sx + 390, 620);
      ctx.lineTo(sx + 110, 620);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
}

function drawWinterFogOverlay(
  ctx: CanvasRenderingContext2D,
  map: ArenaMap,
  world: RenderableWorld,
  canvasWidth: number,
  canvasHeight: number,
  worldTx: number,
  worldTy: number,
  scale: number
) {
  const t = world.elapsedTime;
  const fogTex = getWinterFogCanvas();
  const wispTex = getWinterWispCanvas();
  const lights = getConeLightSources(map);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, map.width, map.height);
  ctx.clip();

  // 1. Subtle cool arctic fog haze that softens & slightly lowers visibility across the arena
  ctx.fillStyle = 'rgba(226, 240, 255, 0.11)';
  ctx.fillRect(0, 0, map.width, map.height);

  // 2. Drifting organic white fog clouds Layer A & Layer B (seamless pattern scroll)
  const tile = 512;
  const drawScrollingFog = (tex: HTMLCanvasElement, vx: number, vy: number, waveAmp: number, alpha: number) => {
    const pat = ctx.createPattern(tex, 'repeat');
    if (!pat) return;
    const ox = ((t * vx) % tile + tile) % tile;
    const oy = ((t * vy + Math.sin(t * 0.35) * waveAmp) % tile + tile) % tile;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ox, oy);
    ctx.fillStyle = pat;
    ctx.fillRect(-ox - 32, -oy - 32, map.width + 64, map.height + 64);
    ctx.restore();
  };

  drawScrollingFog(fogTex, 26, 9, 16, 0.72);
  drawScrollingFog(wispTex, -38, 14, 12, 0.54);

  // 3. Light-Fog Tyndall Scattering: lit white mist pools inside light cones, carved by real object shadows!
  if (lights.length > 0 && scale > 0.001) {
    const lightScale = 0.5;
    const lw = Math.max(1, Math.ceil(canvasWidth * lightScale));
    const lh = Math.max(1, Math.ceil(canvasHeight * lightScale));
    const lightCanvas = getLightCanvas(lw, lh);
    const lctx = lightCanvas.getContext('2d');
    if (lctx) {
      lctx.save();
      lctx.clearRect(0, 0, lw, lh);
      lctx.scale(lightScale, lightScale);
      lctx.translate(worldTx, worldTy);
      lctx.scale(scale, scale);

      for (let i = 0; i < lights.length; i++) {
        const l = lights[i];
        const pulse = 0.88 + 0.12 * Math.sin(t * 1.4 + i * 2.0);
        const cx = l.x + Math.sin(t * 0.4 + i) * 14;
        const cy = l.y + l.dirY * (l.beamLen * 0.42);
        const rx = l.beamHalfEnd * 0.94;
        const ry = l.beamLen * 0.58;

        lctx.save();
        lctx.translate(cx, cy);
        lctx.scale(1, ry / Math.max(1, rx));
        const g = lctx.createRadialGradient(0, -rx * 0.25 * l.dirY, 18, 0, 0, rx);
        g.addColorStop(0, `rgba(255, 255, 255, ${0.44 * pulse})`);
        g.addColorStop(0.5, `rgba(232, 246, 255, ${0.22 * pulse})`);
        g.addColorStop(1, 'rgba(224, 242, 254, 0)');
        lctx.fillStyle = g;
        lctx.beginPath();
        lctx.arc(0, 0, rx, 0, Math.PI * 2);
        lctx.fill();
        lctx.restore();
      }

      // Carve soft shadow corridors behind players, pine trees, crates, TNT & Nitro inside the lit fog
      lctx.globalCompositeOperation = 'destination-out';
      for (const l of lights) {
        const polys = collectLightShadowPolys(l, map, world, l.range + 140, true);
        for (const poly of polys) {
          lctx.fillStyle = `rgba(0, 0, 0, ${0.86 * Math.min(1, poly.strength + 0.2)})`;
          lctx.beginPath();
          lctx.moveTo(poly.x0, poly.y0);
          lctx.lineTo(poly.fx0, poly.fy0);
          lctx.lineTo(poly.fx1, poly.fy1);
          lctx.lineTo(poly.x1, poly.y1);
          lctx.closePath();
          lctx.fill();
        }
      }

      // Modulate the entire lit beam in one pattern pass so drifting fog visibly swirls inside the light!
      const fogPat = lctx.createPattern(fogTex, 'repeat');
      if (fogPat) {
        const fox = ((t * 32) % tile + tile) % tile;
        const foy = ((t * 11) % tile + tile) % tile;
        lctx.save();
        lctx.globalCompositeOperation = 'destination-in';
        lctx.translate(fox, foy);
        lctx.fillStyle = fogPat;
        lctx.fillRect(-fox - 64, -foy - 64, map.width + 128, map.height + 128);
        lctx.restore();
      }
      lctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'blur(10px)';
      ctx.drawImage(
        lightCanvas,
        -worldTx / scale,
        -worldTy / scale,
        canvasWidth / scale,
        canvasHeight / scale
      );
      ctx.restore();
    }
  }

  // 4. Fine wind-blown arctic snowflakes & frost motes drifting across the fog
  for (let m = 0; m < 44; m++) {
    const speedX = 36 + (m % 5) * 11;
    const speedY = 14 + (m % 4) * 6;
    const px = ((seededRand(m * 19 + 3) * map.width + t * speedX) % map.width + map.width) % map.width;
    const py =
      ((seededRand(m * 37 + 11) * map.height + t * speedY + Math.sin(t * 1.4 + m) * 14) %
        map.height +
        map.height) %
      map.height;
    const alpha = 0.26 + 0.26 * Math.sin(t * 2.2 + m);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, alpha)})`;
    ctx.beginPath();
    ctx.arc(px, py, 1.4 + (m % 3) * 0.65, 0, Math.PI * 2);
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

  for (const pit of pits) {
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

    if (pit.broken) {
      // 1. Jagged shattered snowy/icy lip overhanging the deep pit opening
      ctx.fillStyle = '#9ECAFA';
      ctx.beginPath();
      if (pts && pts.length >= 3) {
        const n = pts.length;
        for (let i = 0; i < n * 2; i++) {
          const base = pts[Math.floor(i / 2)];
          const next = pts[(Math.floor(i / 2) + 1) % n];
          const px = i % 2 === 0 ? base.x * 1.1 : ((base.x + next.x) * 0.5) * 1.01;
          const py = i % 2 === 0 ? base.y * 1.1 : ((base.y + next.y) * 0.5) * 1.01;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      } else {
        const shards = 24;
        for (let i = 0; i < shards; i++) {
          const a = (i / shards) * Math.PI * 2;
          const jag = i % 2 === 0 ? 1.08 : 0.99;
          const px = Math.cos(a) * pit.rx * jag;
          const py = Math.sin(a) * pit.ry * jag;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      // 2. Deep pit interior: first draw sheer vertical ice cliff walls descending down into the chasm!
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

      // Vertical sheared ice striations along the exposed inner chasm wall (gives true depth perception)
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.24)';
      ctx.lineWidth = 1.6;
      const wallCols = 22;
      for (let c = 0; c < wallCols; c++) {
        const frac = (c + 0.5) / wallCols;
        const wx = -pit.rx * 1.05 + frac * pit.rx * 2.1;
        const jitter = (seededRand(pit.id * 41 + c * 17) - 0.5) * 8;
        ctx.beginPath();
        ctx.moveTo(wx + jitter, -pit.ry * 1.05);
        ctx.lineTo(wx + jitter * 0.6, -pit.ry * 1.05 + wallDrop * 2.2);
        ctx.stroke();
      }
      // Subtle dark rocky/frozen strata band just above the recessed waterline
      ctx.strokeStyle = 'rgba(2, 16, 38, 0.72)';
      ctx.lineWidth = 6;
      ctx.save();
      ctx.translate(0, wallDrop * 0.55);
      traceContour(0.98);
      ctx.stroke();
      ctx.restore();

      // 3. Recessed Water Surface sitting DOWN inside the pit (copper sulphate blue!)
      ctx.save();
      ctx.translate(0, wallDrop);
      traceContour(0.97);
      ctx.clip();

      const maxR = Math.max(pit.rx, pit.ry) * 1.25;
      // Rich hydrated copper sulphate (CuSO4·5H2O) radial depth: vibrant azure center -> deep cobalt edge
      const waterGrad = ctx.createRadialGradient(-pit.rx * 0.1, -pit.ry * 0.12, 8, 0, 0, maxR);
      waterGrad.addColorStop(0, '#0096E6');
      waterGrad.addColorStop(0.45, '#006EC7');
      waterGrad.addColorStop(0.82, '#004A99');
      waterGrad.addColorStop(1, '#002B66');
      ctx.fillStyle = waterGrad;
      ctx.fillRect(-pit.rx * 1.5, -pit.ry * 1.5, pit.rx * 3.0, pit.ry * 3.0);

      // Submerged underwater chasm wall rings hinting at deep water below the surface
      ctx.strokeStyle = 'rgba(0, 22, 58, 0.42)';
      ctx.lineWidth = 10;
      traceContour(0.76);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0, 16, 44, 0.48)';
      ctx.lineWidth = 12;
      traceContour(0.5);
      ctx.stroke();

      // Dual counter-drifting domain-warped fractal CuSO4 caustic layers
      const waterTile = getWinterWaterCanvas();
      const pattern = ctx.createPattern(waterTile, 'repeat');
      if (pattern) {
        const driftA_X = (world.elapsedTime * 16 + pit.id * 43) % 256;
        const driftA_Y = (world.elapsedTime * 10 + pit.id * 29) % 256;
        ctx.save();
        ctx.globalAlpha = 0.78;
        ctx.translate(driftA_X, driftA_Y);
        ctx.fillStyle = pattern;
        ctx.fillRect(
          -pit.rx * 1.5 - driftA_X,
          -pit.ry * 1.5 - driftA_Y,
          pit.rx * 3.0,
          pit.ry * 3.0
        );
        ctx.restore();

        const driftB_X = (-world.elapsedTime * 13 + pit.id * 67) % 256;
        const driftB_Y = (world.elapsedTime * 14 - pit.id * 19) % 256;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.24;
        ctx.translate(driftB_X, driftB_Y);
        ctx.rotate(0.28);
        ctx.fillStyle = pattern;
        ctx.fillRect(-maxR * 2, -maxR * 2, maxR * 4, maxR * 4);
        ctx.restore();
      }

      // Light-reactive frost lantern reflections (vivid azure-cyan sheen, not whitewash)
      const lights = getConeLightSources(map);
      for (const l of lights) {
        const dx = pit.x - l.x;
        const dy = pit.y - l.y;
        const distToLight = Math.hypot(dx, dy);
        if (distToLight > l.range * 1.15) continue;
        const forwardDot = (dy / Math.max(1, distToLight)) * l.dirY;
        if (forwardDot <= 0.15) continue;
        const strength = Math.max(0, 1 - distToLight / (l.range * 1.15)) * forwardDot;
        const lx = (-dx / Math.max(1, distToLight)) * pit.rx * 0.3;
        const ly = (-dy / Math.max(1, distToLight)) * pit.ry * 0.3;
        const specGrad = ctx.createRadialGradient(lx, ly, 4, lx, ly, maxR * 0.8);
        specGrad.addColorStop(0, `rgba(56, 189, 248, ${0.34 * strength})`);
        specGrad.addColorStop(0.55, `rgba(14, 165, 233, ${0.18 * strength})`);
        specGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = specGrad;
        ctx.fillRect(-pit.rx * 1.4, -pit.ry * 1.4, pit.rx * 2.8, pit.ry * 2.8);
        ctx.restore();
      }

      // Subtle copper-cyan surface ripples & crisp azure-tinted sparkles
      const phase = world.elapsedTime * 1.35 + pit.id * 1.4;
      for (let r = 0; r < 2; r++) {
        const frac = (phase * 0.28 + r / 2) % 1;
        const alpha = (1 - frac) * 0.24;
        ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
        ctx.lineWidth = 1.5;
        traceContour(0.3 + frac * 0.6);
        ctx.stroke();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let s = 0; s < 12; s++) {
        const seed = pit.id * 131 + s * 29;
        const sx = (seededRand(seed + 1) - 0.5) * pit.rx * 1.35;
        const sy = (seededRand(seed + 2) - 0.5) * pit.ry * 1.35;
        const twinkle = Math.pow(
          Math.max(0, Math.sin(world.elapsedTime * (2.6 + seededRand(seed + 3) * 2.4) + s * 1.9)),
          3.4
        );
        if (twinkle < 0.18) continue;
        const arm = (2.6 + seededRand(seed + 4) * 3.0) * twinkle;
        ctx.fillStyle = `rgba(125, 211, 252, ${0.85 * twinkle})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy - arm);
        ctx.lineTo(sx + arm * 0.26, sy - arm * 0.26);
        ctx.lineTo(sx + arm, sy);
        ctx.lineTo(sx + arm * 0.26, sy + arm * 0.26);
        ctx.lineTo(sx, sy + arm);
        ctx.lineTo(sx - arm * 0.26, sy + arm * 0.26);
        ctx.lineTo(sx - arm, sy);
        ctx.lineTo(sx - arm * 0.26, sy - arm * 0.26);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Deep ambient occlusion shadow cast by the vertical ice cliff onto the water surface
      ctx.strokeStyle = 'rgba(0, 14, 38, 0.72)';
      ctx.lineWidth = 11;
      ctx.save();
      ctx.translate(0, 3);
      traceContour(0.985);
      ctx.stroke();
      ctx.restore();

      // Crisp turquoise waterline contact foam/glint around the recessed wall
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 1.6;
      traceContour(0.96);
      ctx.stroke();

      ctx.restore(); // end recessed water clip

      // Sharp inner shadow edge right under the top snow/ice rim
      ctx.strokeStyle = 'rgba(3, 18, 42, 0.65)';
      ctx.lineWidth = 4;
      traceContour(1.0);
      ctx.stroke();

      ctx.restore(); // end outer pit clip
    } else {
      // Intact walkable frozen sapphire-blue ice pond matching Winter Tussle thumbnail
      ctx.fillStyle = 'rgba(56, 189, 248, 0.48)';
      ctx.save();
      ctx.translate(0, 3);
      traceContour(1.07);
      ctx.fill();
      ctx.restore();

      ctx.save();
      traceContour(1);
      ctx.clip();

      const iceGrad = ctx.createRadialGradient(-pit.rx * 0.15, -pit.ry * 0.18, 8, 0, 0, Math.max(pit.rx, pit.ry) * 1.15);
      iceGrad.addColorStop(0, '#38BDF8');
      iceGrad.addColorStop(0.45, '#0284C7');
      iceGrad.addColorStop(0.82, '#0369A1');
      iceGrad.addColorStop(1, '#074B83');
      ctx.fillStyle = iceGrad;
      ctx.fillRect(-pit.rx * 1.4, -pit.ry * 1.4, pit.rx * 2.8, pit.ry * 2.8);

      // Glossy diagonal glacial specular highlights
      ctx.fillStyle = 'rgba(224, 242, 254, 0.34)';
      ctx.beginPath();
      ctx.moveTo(-pit.rx * 0.75, -pit.ry * 1.2);
      ctx.lineTo(-pit.rx * 0.4, -pit.ry * 1.2);
      ctx.lineTo(-pit.rx * 0.95, pit.ry * 1.2);
      ctx.lineTo(-pit.rx * 1.3, pit.ry * 1.2);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pit.rx * 0.15, -pit.ry * 1.2);
      ctx.lineTo(pit.rx * 0.34, -pit.ry * 1.2);
      ctx.lineTo(-pit.rx * 0.24, pit.ry * 1.2);
      ctx.lineTo(-pit.rx * 0.42, pit.ry * 1.2);
      ctx.closePath();
      ctx.fill();

      // Subtle frosted crystalline ice veins
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.62)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-pit.rx * 0.38, -pit.ry * 0.28);
      ctx.lineTo(0, 4);
      ctx.lineTo(pit.rx * 0.44, -pit.ry * 0.14);
      ctx.moveTo(0, 4);
      ctx.lineTo(-pit.rx * 0.14, pit.ry * 0.46);
      ctx.stroke();
      ctx.restore();

      // Crisp frosted ice shoreline lip
      ctx.strokeStyle = '#F0F9FF';
      ctx.lineWidth = 2.6;
      traceContour(1);
      ctx.stroke();
    }

    ctx.restore();
  }
}
