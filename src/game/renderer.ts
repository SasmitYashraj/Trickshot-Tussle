import { ARENA_MAPS } from './maps';
import type {
  ArenaMap,
  Bullet,
  CardboardBox,
  ControlScheme,
  Explosion,
  FloatingText,
  IcePit,
  JoystickState,
  MapId,
  Particle,
  Pickup,
  TeamMode,
  WallRect,
} from './types';
import {
  CARDBOARD_FADE_IN,
  CARDBOARD_FADE_OUT,
  CARDBOARD_PUNCTURE_FRAME,
  IMMERSIVE_VIEW_HEIGHT,
  IMMERSIVE_VIEW_WIDTH,
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
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  angle: number;
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
  const key = `${map.id}_${map.width}x${map.height}_v5`;
  const existing = floorCache.get(key);
  if (existing) return existing;

  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const ctx = off.getContext('2d');
  if (!ctx) return off;

  if (map.floorTheme === 'grass_outdoors') {
    // Rich sunlit outdoor meadow grass
    ctx.fillStyle = '#2B723E';
    ctx.fillRect(0, 0, map.width, map.height);

    // Subtle mown grass diagonal / vertical turf bands
    const stripeW = 84;
    for (let sx = 0; sx < map.width; sx += stripeW) {
      if (Math.floor(sx / stripeW) % 2 === 0) {
        ctx.fillStyle = 'rgba(74, 222, 128, 0.065)';
        ctx.fillRect(sx, 0, stripeW, map.height);
      }
    }

    // Organic soft grass patches
    for (let i = 0; i < (map.immersive ? 110 : 65); i++) {
      const px = seededRand(i * 13 + 1) * map.width;
      const py = seededRand(i * 29 + 3) * map.height;
      const pr = 40 + seededRand(i * 41 + 7) * 90;
      ctx.fillStyle =
        i % 2 === 0 ? 'rgba(22, 101, 52, 0.22)' : 'rgba(134, 239, 172, 0.09)';
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Warm stone & earth footpaths leading toward center clearing
    ctx.save();
    ctx.strokeStyle = 'rgba(180, 146, 103, 0.42)';
    ctx.lineWidth = 64;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(map.width * 0.5, 45);
    ctx.lineTo(map.width * 0.5, map.height - 45);
    ctx.moveTo(45, map.height * 0.5);
    ctx.lineTo(map.width - 45, map.height * 0.5);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(214, 186, 145, 0.24)';
    ctx.lineWidth = 42;
    ctx.stroke();

    // Central stone patio circle
    ctx.fillStyle = 'rgba(176, 152, 118, 0.48)';
    ctx.beginPath();
    ctx.arc(map.width / 2, map.height / 2, map.immersive ? 155 : 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(226, 206, 176, 0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Delicate grass blades & wildflowers
    for (let i = 0; i < (map.immersive ? 340 : 180); i++) {
      const gx = 30 + seededRand(i * 7 + 11) * (map.width - 60);
      const gy = 30 + seededRand(i * 19 + 23) * (map.height - 60);
      if (i % 6 === 0) {
        // Tiny colorful meadow flower
        const flowerColors = ['#FDE047', '#F472B6', '#F8FAFC', '#FB923C'];
        ctx.fillStyle = flowerColors[i % flowerColors.length];
        ctx.beginPath();
        ctx.arc(gx, gy, 2.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(134, 239, 172, 0.24)';
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
    // Cool arctic twilight snowfield with rich glacial blue shade & sculpted blue-tinted drifts
    ctx.fillStyle = '#A8CDF2';
    ctx.fillRect(0, 0, map.width, map.height);

    // Cool cerulean-blue color-temperature wash across the arena
    const skyWash = ctx.createLinearGradient(0, 0, map.width, map.height);
    skyWash.addColorStop(0, 'rgba(186, 222, 255, 0.42)');
    skyWash.addColorStop(0.5, 'rgba(96, 165, 250, 0.34)');
    skyWash.addColorStop(1, 'rgba(37, 99, 235, 0.28)');
    ctx.fillStyle = skyWash;
    ctx.fillRect(0, 0, map.width, map.height);

    // Sculpted wind-carved snowdrifts (deep cobalt-blue shadow side + cool ice-blue crest)
    for (let i = 0; i < 26; i++) {
      const dx = 85 + seededRand(i * 17 + 5) * (map.width - 170);
      const dy = 70 + seededRand(i * 31 + 11) * (map.height - 140);
      const rx = 85 + seededRand(i * 43 + 3) * 115;
      const ry = 28 + seededRand(i * 59 + 7) * 38;
      const rot = (seededRand(i * 71 + 9) - 0.5) * 0.45;

      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(rot);

      ctx.fillStyle = i % 2 === 0 ? 'rgba(59, 130, 246, 0.36)' : 'rgba(56, 189, 248, 0.32)';
      ctx.beginPath();
      ctx.ellipse(6, 8, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(205, 232, 255, 0.78)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.94, ry * 0.86, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Subtle icy court framing lines & center snow-compass border
    ctx.save();
    ctx.strokeStyle = 'rgba(29, 78, 216, 0.24)';
    ctx.lineWidth = 3;
    ctx.strokeRect(56, 56, map.width - 112, map.height - 112);

    ctx.strokeStyle = 'rgba(14, 165, 233, 0.28)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(map.width * 0.5, 56);
    ctx.lineTo(map.width * 0.5, map.height - 56);
    ctx.stroke();
    ctx.restore();

    // Cool sparkling frost crystals & ice-blue snow glints
    for (let i = 0; i < 220; i++) {
      const fx = 28 + seededRand(i * 23 + 17) * (map.width - 56);
      const fy = 28 + seededRand(i * 37 + 29) * (map.height - 56);
      const r = 1.2 + seededRand(i * 53 + 3) * 1.9;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(56, 189, 248, 0.54)' : 'rgba(219, 238, 255, 0.84)';
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (map.floorTheme === 'maple_cargo') {
    // Polished High-Contrast Marble & Dark Slate Tile Floor for Cargo Deck
    ctx.fillStyle = '#0F172A';
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

        // Alternating dark obsidian-slate marble and cool silver-granite marble tiles
        const tileGrad = ctx.createLinearGradient(x, y, x + tile, y + tile);
        if (isLight) {
          tileGrad.addColorStop(0, '#3B4C63');
          tileGrad.addColorStop(0.55, '#334155');
          tileGrad.addColorStop(1, '#293548');
        } else {
          tileGrad.addColorStop(0, '#232F42');
          tileGrad.addColorStop(0.55, '#1B2536');
          tileGrad.addColorStop(1, '#141C2B');
        }
        ctx.fillStyle = tileGrad;
        ctx.fillRect(x, y, tile, tile);

        // Diagonal marble veining inside each slab
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 2, y + 2, tile - 4, tile - 4);
        ctx.clip();

        ctx.strokeStyle = isLight ? 'rgba(226, 232, 240, 0.14)' : 'rgba(148, 163, 184, 0.08)';
        ctx.lineWidth = 1.6;
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

        // Crisp subtle marble speck / secondary fracture vein on light slabs
        if (isLight) {
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 8, y + tile * 0.25);
          ctx.lineTo(x + tile * 0.65, y + tile * 0.55);
          ctx.stroke();
        }
        ctx.restore();

        // Top & left polished bevel highlight
        ctx.fillStyle = isLight ? 'rgba(248, 250, 252, 0.12)' : 'rgba(148, 163, 184, 0.07)';
        ctx.fillRect(x + 1, y + 1, tile - 2, 2);
        ctx.fillRect(x + 1, y + 1, 2, tile - 2);

        // Deep crisp tile grout seam
        ctx.strokeStyle = 'rgba(6, 10, 19, 0.72)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, tile, tile);
      }
    }

    // Crisp industrial hazard lane border & center ring
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.28)';
    ctx.lineWidth = 4;
    ctx.strokeRect(70, 70, map.width - 140, map.height - 140);
    ctx.beginPath();
    ctx.arc(map.width / 2, map.height / 2, 130, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Rich dark espresso/walnut hardwood planks for Manor Foyer & Wooden Mansion
    ctx.fillStyle = '#331A0D';
    ctx.fillRect(0, 0, map.width, map.height);

    const plankH = 34;
    const plankW = 148;
    const tones = ['#452412', '#522C17', '#3E2010', '#5C321A', '#4A2714'];

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
        ctx.strokeStyle = 'rgba(18, 8, 3, 0.36)';
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
        ctx.fillStyle = 'rgba(255, 224, 178, 0.065)';
        ctx.fillRect(x + 1, y + 1, plankW - 2, 2);

        // Crisp dark plank seam
        ctx.strokeStyle = 'rgba(15, 6, 2, 0.65)';
        ctx.lineWidth = 1.3;
        ctx.strokeRect(x, y, plankW, plankH);
      }
    }

    // Brighter jewel-toned Persian carpets creating crisp contrast against dark espresso walnut
    drawPersianRug(
      ctx,
      map.width / 2 - (map.immersive ? 260 : 190),
      map.height / 2 - (map.immersive ? 190 : 140),
      map.immersive ? 520 : 380,
      map.immersive ? 380 : 280,
      '#C81E2E',
      '#FBBF24'
    );

    if (map.immersive) {
      drawPersianRug(ctx, 290, 220, 320, 210, '#2563EB', '#FCD34D');
      drawPersianRug(ctx, map.width - 610, 220, 320, 210, '#10B981', '#FDE047');
      drawPersianRug(ctx, 290, map.height - 430, 320, 210, '#9333EA', '#FCD34D');
      drawPersianRug(ctx, map.width - 610, map.height - 430, 320, 210, '#E11D48', '#FDE047');
    }
  }

  floorCache.set(key, off);
  return off;
}

function drawObstacle(ctx: CanvasRenderingContext2D, wall: WallRect) {
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
    ctx.fillStyle = '#451A03';
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 4);
    ctx.fill();
    ctx.stroke();

    // Colorful book spines arranged neatly
    const bookColors = ['#DC2626', '#2563EB', '#059669', '#D97706', '#7C3AED', '#E11D48'];
    const vertical = wall.h > wall.w;
    if (vertical) {
      for (let by = wall.y + 8, idx = 0; by < wall.y + wall.h - 12; by += 11, idx++) {
        ctx.fillStyle = bookColors[idx % bookColors.length];
        ctx.fillRect(wall.x + 8, by, wall.w - 16, 8);
      }
    } else {
      for (let bx = wall.x + 8, idx = 0; bx < wall.x + wall.w - 12; bx += 11, idx++) {
        ctx.fillStyle = bookColors[idx % bookColors.length];
        ctx.fillRect(bx, wall.y + 8, 8, wall.h - 16);
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
    ctx.fillStyle = '#5C3A21';
    ctx.beginPath();
    ctx.arc(cx, cy + 4, r * 0.32, 0, Math.PI * 2);
    ctx.fill();

    // Deep forest canopy base
    ctx.fillStyle = '#14532D';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Leafy perimeter lobes
    ctx.fillStyle = '#15803D';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.42, cy + Math.sin(a) * r * 0.42, r * 0.54, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sunlit crown highlights
    ctx.fillStyle = '#22C55E';
    ctx.beginPath();
    ctx.arc(cx - r * 0.14, cy - r * 0.16, r * 0.52, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4ADE80';
    ctx.beginPath();
    ctx.arc(cx - r * 0.22, cy - r * 0.24, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (kind === 'rock') {
    ctx.save();
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(wall.x + 2, wall.y + 2, wall.w - 4, wall.h - 4, 20);
    ctx.fill();
    ctx.stroke();

    // Facet highlight
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.roundRect(wall.x + 8, wall.y + 8, wall.w * 0.62, wall.h * 0.54, 14);
    ctx.fill();

    // Lush moss patch
    ctx.fillStyle = '#22C55E';
    ctx.beginPath();
    ctx.arc(wall.x + wall.w * 0.7, wall.y + wall.h * 0.28, 12, 0, Math.PI * 2);
    ctx.arc(wall.x + wall.w * 0.58, wall.y + wall.h * 0.24, 8, 0, Math.PI * 2);
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
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 3, r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#E0F2FE';
    ctx.beginPath();
    ctx.arc(cx - 4, cy - 5, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F0F9FF';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 7, r * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  if (kind === 'hedge') {
    ctx.save();
    ctx.fillStyle = '#14532D';
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 12);
    ctx.fill();

    ctx.fillStyle = '#16A34A';
    ctx.beginPath();
    ctx.roundRect(wall.x + 5, wall.y + 5, wall.w - 10, wall.h - 10, 9);
    ctx.fill();

    // Berry blossoms
    ctx.fillStyle = '#FB7185';
    for (let hy = wall.y + 18; hy < wall.y + wall.h - 12; hy += 28) {
      for (let hx = wall.x + 18; hx < wall.x + wall.w - 12; hx += 28) {
        ctx.beginPath();
        ctx.arc(hx, hy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    return;
  }

  // Default: Brushed steel metal crate / safe
  const grad = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
  grad.addColorStop(0, '#64748B');
  grad.addColorStop(0.5, '#475569');
  grad.addColorStop(1, '#334155');
  ctx.fillStyle = grad;
  ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wall.x + 1, wall.y + wall.h - 1);
  ctx.lineTo(wall.x + 1, wall.y + 1);
  ctx.lineTo(wall.x + wall.w - 1, wall.y + 1);
  ctx.stroke();

  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2;
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

  const rayCount = 34;
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

function tracePoly(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>) {
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
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
  const localPlayer = world.players.find((p) => p.id === localPlayerId) ?? world.players[0];

  ctx.save();
  ctx.fillStyle = '#070B14';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const { scale, offsetX, offsetY } = getArenaViewTransform(
    map,
    isImmersive,
    canvasWidth,
    canvasHeight,
    localPlayer,
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

  // 1. Lively Wooden / Marble / Snow / Meadow Floor + Ambient Light Pools + Light-Cast Shadows + Ice/Water Pits
  const floorCanvas = getFloorCanvas(map);
  ctx.drawImage(floorCanvas, 0, 0);
  drawAmbientArenaLights(ctx, map, world);
  if (!isExtraDark) {
    drawDynamicLightShadows(ctx, map, world);
  }
  drawIcePits(ctx, world, map);

  // 2. Spawn Pads
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

  // 3. TNT blast warning zones (shown once shot & armed for 3s countdown)
  for (const item of world.pickups) {
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

  // 4. Pickups (Vibrant Arcade Bullets, Neon Green NITRO, Cherry-Red TNT & Medkits)
  for (const item of world.pickups) {
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
      // Glowing cyan-blue energy bubble orb around bright red/white shell
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

      // Tilted crisp red-and-white cartridge shell
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

      // Brass shell rim
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(-12, -5.5, 3, 11);
      ctx.restore();
    } else if (item.kind === 'nitro') {
      // Vivid toxic neon-green wooden NITRO crate (high shadow/highlight contrast, exact green hue)
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

      // Bright neon lime wooden center planks + crisp bevel contrast
      ctx.fillStyle = '#2EE86B';
      ctx.fillRect(-s + 5, -s + 5, s * 2 - 10, s * 2 - 10);
      ctx.fillStyle = '#86EFAC';
      ctx.fillRect(-s + 4, -s + 3, s * 2 - 8, 4);
      ctx.fillStyle = 'rgba(5, 46, 22, 0.45)';
      ctx.fillRect(-s + 4, s - 7, s * 2 - 8, 4);

      ctx.strokeStyle = '#14532D';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-s + 5, -s + 5, s * 2 - 10, s * 2 - 10);

      // Bold stenciled NITRO badge
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

      // Bright cherry-red wooden TNT crate (higher shadow & bevel contrast, same vibrant red)
      ctx.fillStyle = flash ? '#FCA5A5' : '#991B1B';
      ctx.strokeStyle = '#120303';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-s, -s, s * 2, s * 2, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = flash ? '#FECACA' : '#FF2E22';
      ctx.fillRect(-s + 6, -s + 6, s * 2 - 12, s * 2 - 12);

      // Plank dividers
      ctx.strokeStyle = 'rgba(105, 16, 16, 0.6)';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(-s + 6, -9);
      ctx.lineTo(s - 6, -9);
      ctx.moveTo(-s + 6, 9);
      ctx.lineTo(s - 6, 9);
      ctx.stroke();

      // Top highlight & deep bottom edge shade
      ctx.fillStyle = 'rgba(255, 235, 235, 0.38)';
      ctx.fillRect(-s + 3, -s + 2.5, s * 2 - 6, 4.5);
      ctx.fillStyle = 'rgba(40, 4, 4, 0.45)';
      ctx.fillRect(-s + 3, s - 6.5, s * 2 - 6, 4);

      // Corner nails
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
        // Countdown progress ring around armed TNT
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
        // Unlit movable TNT crate (pushable, shoot to ignite 3s countdown)
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

  // 5. Themed Obstacles + Movable Cardboard Cover Boxes
  for (const wall of map.walls) {
    drawObstacle(ctx, wall);
  }
  for (const box of world.boxes) {
    drawCardboardBox(ctx, box);
  }

  // 6. Players (drawn before Extra Dark darkness mask so distant enemies hide in darkness, then illuminated by flashlights & bullet glow!)
  for (const player of world.players) {
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
      continue;
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

    // Crisp outer hitbox ring
    ctx.fillStyle = hexWithAlpha(skinColor, 0.14);
    ctx.strokeStyle = hexWithAlpha(skinColor, 0.52);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Chunky bright candy-arcade mascot fighter + checkered tactical blaster
    const moveSpeed = Math.hypot(player.vx ?? 0, player.vy ?? 0);
    const moveBlend = Math.min(1, moveSpeed / 160);
    const stride = Math.sin(world.elapsedTime * 15 + player.id * 1.7) * moveBlend;

    ctx.save();
    ctx.rotate(player.angle);

    // 1. Animated striding boots
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

    // 2. Rounded gloves gripping forward blaster
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

    // 3. Heavy Black & Yellow-Checkered Tactical Blaster
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = '#090D16';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.roundRect(20, -8.5, 31, 17, 4.5);
    ctx.fill();
    ctx.stroke();

    // Checkered tactical grip pattern on gun barrel
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(25, -6.2, 5, 4.2);
    ctx.fillRect(35, -6.2, 5, 4.2);
    ctx.fillRect(30, 2, 5, 4.2);
    ctx.fillRect(40, 2, 5, 4.2);

    // Energized barrel core & luminous muzzle tip
    ctx.fillStyle = player.ammo > 0 ? '#FDE047' : '#64748B';
    ctx.fillRect(26, -2.2, 23, 4.4);
    if (player.ammo > 0) {
      ctx.fillStyle = '#FEF9C3';
      ctx.beginPath();
      ctx.arc(50, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Glossy Candy-Colored Character Body (3-stop spherical shading + bright specular gloss)
    const bodyR = 30.5;
    const bodyGrad = ctx.createRadialGradient(-9, -10, 4, 0, 0, bodyR);
    bodyGrad.addColorStop(0, '#FFFFFF');
    bodyGrad.addColorStop(0.24, accentColor);
    bodyGrad.addColorStop(0.7, skinColor);
    bodyGrad.addColorStop(1, '#0F172A');

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#090D16';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Crisp glossy highlight crescent on upper-left crown
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, bodyR - 6, -Math.PI * 0.85, -Math.PI * 0.35);
    ctx.stroke();
    ctx.restore();

    // 5. Slot-distinct silhouette crest
    if (player.id === 1) {
      // Viper: Bold pointed cat/oni ears
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
      // Volt: Royal golden crown on back rim
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
      // Cobalt: Sleek twin cyber fins
      ctx.fillStyle = accentColor;
      ctx.strokeStyle = '#090D16';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-21, -33, 18, 8, 4);
      ctx.roundRect(-21, 25, 18, 8, 4);
      ctx.fill();
      ctx.stroke();
    } else {
      // Jade / Slot 4: Bright emerald-or-chosen scarf tails
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

    // 6. Dark Visor + Bright Expressive Eyes
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
  }

  // 7. Compute Multi-Tier Feathered Flashlight Raycast Polygons in Extra Dark Mode
  const flashlightPolys: Array<{
    player: RenderPlayer;
    outerPoly: Array<{ x: number; y: number }>;
    midPoly: Array<{ x: number; y: number }>;
    corePoly: Array<{ x: number; y: number }>;
    range: number;
    isLocal: boolean;
  }> = [];

  if (isExtraDark) {
    const shadowWalls: WallRect[] = [
      ...map.walls,
      ...world.boxes
        .filter((b) => b.state === 'active')
        .map((b) => ({ x: b.x - b.w * 0.5, y: b.y - b.h * 0.5, w: b.w, h: b.h })),
    ];
    for (const p of world.players) {
      if (!p.alive) continue;
      const isLocal = p.id === localPlayerId;
      const range = isLocal ? 490 : 360;
      const baseFov = isLocal ? 1.32 : 1.08;
      // 3 nested cones so side edges feather smoothly instead of cutting off as a hard line
      const outerPoly = computeFlashlightPolygon(p.x, p.y, p.angle, baseFov * 1.45, range, shadowWalls);
      const midPoly = computeFlashlightPolygon(p.x, p.y, p.angle, baseFov * 0.96, range * 0.96, shadowWalls);
      const corePoly = computeFlashlightPolygon(p.x, p.y, p.angle, baseFov * 0.54, range * 0.9, shadowWalls);
      flashlightPolys.push({ player: p, outerPoly, midPoly, corePoly, range, isLocal });
    }
  }

  // 8. Cinematic Additive Light Interaction (Feathered Flashlight Floor Glow + Glowing Bullets + Object Rim Light)
  if (isImmersive) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const fl of flashlightPolys) {
      const strength = fl.isLocal ? 0.14 : 0.08;
      const layers: Array<{ poly: Array<{ x: number; y: number }>; weight: number }> = [
        { poly: fl.outerPoly, weight: 0.45 },
        { poly: fl.midPoly, weight: 0.55 },
        { poly: fl.corePoly, weight: 0.65 },
      ];
      for (const layer of layers) {
        ctx.save();
        tracePoly(ctx, layer.poly);
        ctx.clip();
        const grad = ctx.createRadialGradient(
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
        ctx.fillStyle = grad;
        ctx.fillRect(
          fl.player.x - fl.range,
          fl.player.y - fl.range,
          fl.range * 2,
          fl.range * 2
        );
        ctx.restore();
      }
    }

    // Bullet floor illumination + object rim light interaction!
    const bulletGlowRadius = isExtraDark ? 82 : 52;
    for (const b of world.bullets) {
      const grad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, bulletGlowRadius);
      grad.addColorStop(0, hexWithAlpha(b.color, isExtraDark ? 0.48 : 0.3));
      grad.addColorStop(0.45, hexWithAlpha(b.color, isExtraDark ? 0.2 : 0.12));
      grad.addColorStop(1, hexWithAlpha(b.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, bulletGlowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Brief warm muzzle flash on fresh shots
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

      // Cinematic rim-light reflection onto nearby obstacles
      for (const wall of map.walls) {
        if (wall.kind?.startsWith('perimeter')) continue;
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

    // Ticking TNT & Explosion floor light bursts
    for (const item of world.pickups) {
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

    for (const ex of world.explosions) {
      const t = ex.age / ex.duration;
      const r = ex.radius * 1.25;
      const g = ctx.createRadialGradient(ex.x, ex.y, 6, ex.x, ex.y, r);
      g.addColorStop(0, `rgba(254, 240, 138, ${0.55 * (1 - t)})`);
      g.addColorStop(0.5, hexWithAlpha(ex.color, 0.32 * (1 - t)));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
      ctx.fill();
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

      // Darker moody surroundings (~86% dark) while faint player silhouettes remain readable
      lctx.fillStyle = 'rgba(3, 6, 13, 0.86)';
      lctx.fillRect(0, 0, lw, lh);

      lctx.scale(lightScale, lightScale);
      lctx.translate(worldTx, worldTy);
      lctx.scale(scale, scale);
      lctx.globalCompositeOperation = 'destination-out';

      // Wider soft personal close-range aura around local player so nearby obstacles are navigable
      if (localPlayer && localPlayer.alive) {
        const auraR = 215;
        const aura = lctx.createRadialGradient(
          localPlayer.x,
          localPlayer.y,
          24,
          localPlayer.x,
          localPlayer.y,
          auraR
        );
        aura.addColorStop(0, 'rgba(0, 0, 0, 0.98)');
        aura.addColorStop(0.45, 'rgba(0, 0, 0, 0.65)');
        aura.addColorStop(0.8, 'rgba(0, 0, 0, 0.22)');
        aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lctx.fillStyle = aura;
        lctx.beginPath();
        lctx.arc(localPlayer.x, localPlayer.y, auraR, 0, Math.PI * 2);
        lctx.fill();
      }

      // Multi-layered feathered flashlight cones (gradual outer edge fade!)
      for (const fl of flashlightPolys) {
        const peak = fl.isLocal ? 1.0 : 0.6;
        const tiers: Array<{ poly: Array<{ x: number; y: number }>; weight: number }> = [
          { poly: fl.outerPoly, weight: 0.36 },
          { poly: fl.midPoly, weight: 0.48 },
          { poly: fl.corePoly, weight: 0.65 },
        ];
        for (const tier of tiers) {
          lctx.save();
          tracePoly(lctx, tier.poly);
          lctx.clip();
          const beam = lctx.createRadialGradient(
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
          lctx.fillStyle = beam;
          lctx.fillRect(
            fl.player.x - fl.range,
            fl.player.y - fl.range,
            fl.range * 2,
            fl.range * 2
          );
          lctx.restore();
        }
      }

      // Bullets punch subtle warning light pools through darkness
      for (const b of world.bullets) {
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

      // Subtle pickup glints so bullets, medkits & nitros are spottable without lighting up rooms
      for (const item of world.pickups) {
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

      // Explosions cut light through darkness
      for (const ex of world.explosions) {
        const t = ex.age / ex.duration;
        const r = ex.radius * 1.35;
        const eg = lctx.createRadialGradient(ex.x, ex.y, 8, ex.x, ex.y, r);
        eg.addColorStop(0, `rgba(0, 0, 0, ${0.95 * (1 - t)})`);
        eg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lctx.fillStyle = eg;
        lctx.beginPath();
        lctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
        lctx.fill();
      }

      lctx.restore();

      // Soft blur when scaling half-res lightCanvas back up for butter-smooth feathered edges
      ctx.save();
      ctx.filter = 'blur(8px)';
      ctx.drawImage(lightCanvas, -12, -12, canvasWidth + 24, canvasHeight + 24);
      ctx.restore();
    }

    // Re-enter world transform for faint dark silhouettes, glowing bullets, particles & texts
    ctx.save();
    ctx.translate(worldTx, worldTy);
    ctx.scale(scale, scale);

    // Faintly visible fighter silhouettes inside Extra Dark surroundings
    for (const player of world.players) {
      if (!player.alive || player.id === localPlayerId) continue;
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
    scale
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

  // 10. Glowing Bullets & Trails (always crisp & luminous in Immersive / Extra Dark!)
  for (const b of world.bullets) {
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

  // 11. Explosions, Particles & Floating Texts
  for (const ex of world.explosions) {
    const t = ex.age / ex.duration;
    const r = ex.radius * (0.35 + 0.65 * Math.pow(t, 0.45));
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = hexWithAlpha(ex.color, 0.34);
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ex.color;
    ctx.lineWidth = 5 * (1 - t);
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const pt of world.particles) {
    const t = pt.age / pt.duration;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.radius * (1 - t * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const ft of world.floatingTexts) {
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
      : [map.width * 0.3, map.width * 0.7];
    const botXs = map.immersive
      ? [map.width * 0.35, map.width * 0.65]
      : [map.width * 0.5];
    const lights: ConeLightSource[] = [];
    for (const x of topXs) {
      lights.push({
        x,
        y: 16,
        dirY: 1,
        range: 640,
        beamLen: 530,
        beamHalfBase: 44,
        beamHalfEnd: 300,
        coneMaxHalfAngle: Math.atan2(300, 530) + 0.18,
        colorRgb: '254, 240, 138',
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
        x: map.width * 0.32,
        y: 16,
        dirY: 1,
        range: 640,
        beamLen: 540,
        beamHalfBase: 48,
        beamHalfEnd: 290,
        coneMaxHalfAngle: Math.atan2(290, 540) + 0.18,
        colorRgb: '134, 239, 172',
      },
      {
        x: map.width * 0.68,
        y: 16,
        dirY: 1,
        range: 640,
        beamLen: 540,
        beamHalfBase: 48,
        beamHalfEnd: 290,
        coneMaxHalfAngle: Math.atan2(290, 540) + 0.18,
        colorRgb: '134, 239, 172',
      },
      {
        x: map.width * 0.68,
        y: map.height - 16,
        dirY: -1,
        range: 640,
        beamLen: 540,
        beamHalfBase: 48,
        beamHalfEnd: 290,
        coneMaxHalfAngle: Math.atan2(290, 540) + 0.18,
        colorRgb: '134, 239, 172',
      },
    ];
  }

  if (map.floorTheme === 'winter_snow') {
    return [
      {
        x: map.width * 0.28,
        y: 16,
        dirY: 1,
        range: 680,
        beamLen: 580,
        beamHalfBase: 54,
        beamHalfEnd: 340,
        coneMaxHalfAngle: Math.atan2(340, 580) + 0.2,
        colorRgb: '226, 243, 255',
      },
      {
        x: map.width * 0.72,
        y: 16,
        dirY: 1,
        range: 680,
        beamLen: 580,
        beamHalfBase: 54,
        beamHalfEnd: 340,
        coneMaxHalfAngle: Math.atan2(340, 580) + 0.2,
        colorRgb: '226, 243, 255',
      },
      {
        x: map.width * 0.5,
        y: map.height - 16,
        dirY: -1,
        range: 660,
        beamLen: 560,
        beamHalfBase: 52,
        beamHalfEnd: 330,
        coneMaxHalfAngle: Math.atan2(330, 560) + 0.2,
        colorRgb: '219, 238, 255',
      },
    ];
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
  includeWalls: boolean
): ShadowPolygon[] {
  const out: ShadowPolygon[] = [];

  for (const p of world.players) {
    if (!p.alive) continue;
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

  if (includeWalls) {
    for (const wall of map.walls) {
      if (wall.kind?.startsWith('perimeter')) continue;
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
  world: RenderableWorld
) {
  ctx.save();

  if (map.floorTheme === 'grass_outdoors') {
    // Diagonal sunbeams cast angled directional floor shadows for players, crates, TNT & Nitro
    const sunSpots = map.immersive ? [450, 1200, 1850] : [360, 980];
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
    const polys = collectLightShadowPolys(light, map, world, isWinter ? 250 : 220, true);
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
  world: RenderableWorld
) {
  ctx.save();
  if (map.floorTheme === 'mansion_wood') {
    // Warm golden floor light pools under ceiling lamps / foyer chandelier
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
  } else if (map.floorTheme === 'maple_cargo') {
    // Industrial glowing green floor grates + emerald vent glow pools
    const grates = [
      { x: map.width * 0.32, y: map.height * 0.42 },
      { x: map.width * 0.5, y: map.height * 0.5 },
      { x: map.width * 0.68, y: map.height * 0.58 },
    ];
    for (const g of grates) {
      const grad = ctx.createRadialGradient(g.x, g.y, 10, g.x, g.y, 175);
      grad.addColorStop(0, 'rgba(74, 222, 128, 0.22)');
      grad.addColorStop(1, 'rgba(34, 197, 94, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 175, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.fillRect(g.x - 42, g.y - 42, 84, 84);
      ctx.fillStyle = 'rgba(74, 222, 128, 0.48)';
      for (let gx = -32; gx <= 24; gx += 14) {
        for (let gy = -32; gy <= 24; gy += 14) {
          ctx.fillRect(g.x + gx, g.y + gy, 8, 8);
        }
      }
    }
  } else if (map.floorTheme === 'winter_snow') {
    // Cool arctic ground mist & subtle atmospheric twilight color-temperature veil
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

    // Drifting low ground-hugging fog banks
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
  scale: number
) {
  if (isExtraDark) return;
  const elapsedTime = world.elapsedTime;
  ctx.save();

  if (
    map.floorTheme === 'mansion_wood' ||
    map.floorTheme === 'maple_cargo' ||
    map.floorTheme === 'winter_snow'
  ) {
    const isWinter = map.floorTheme === 'winter_snow';
    const lights = getConeLightSources(map);

    // Render occluded volumetric beams on offscreen lightCanvas so players, TNT, Nitro, boxes & walls cut visible shadows through the light rays!
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
          // Soft feathered radial-cone beam in fog (zero hard straight trapezoid edges!)
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

      // Punch out shadow silhouettes for players, boxes, TNT, Nitro & obstacles inside the volumetric rays
      lctx.globalCompositeOperation = 'destination-out';
      for (const l of lights) {
        const polys = collectLightShadowPolys(l, map, world, l.range + 160, true);
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
        // Soft atmospheric scattering blur softens beam edges and shadow trails naturally through fog
        ctx.filter = 'blur(14px)';
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

    // Draw physical wall lamp / green vent / frost-lantern housings on top
    for (const l of lights) {
      if (map.floorTheme === 'mansion_wood') {
        ctx.fillStyle = '#78350F';
        ctx.strokeStyle = '#1C1917';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(l.x, l.y, 24, l.dirY > 0 ? 0 : Math.PI, l.dirY > 0 ? Math.PI : Math.PI * 2, false);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FEF08A';
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

        ctx.fillStyle = '#4ADE80';
        ctx.beginPath();
        ctx.arc(l.x, l.y, 17, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (map.floorTheme === 'grass_outdoors') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sunSpots = map.immersive ? [450, 1200, 1850] : [360, 980];
    for (const sx of sunSpots) {
      const sunGrad = ctx.createLinearGradient(sx, 0, sx + 280, 560);
      sunGrad.addColorStop(0, 'rgba(254, 249, 195, 0.14)');
      sunGrad.addColorStop(0.55, 'rgba(254, 249, 195, 0.05)');
      sunGrad.addColorStop(1, 'rgba(254, 249, 195, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.moveTo(sx - 70, 0);
      ctx.lineTo(sx + 70, 0);
      ctx.lineTo(sx + 340, 560);
      ctx.lineTo(sx + 90, 560);
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
      // Intact walkable frozen ice pond with cool glacier sheen & warning fracture cracks
      ctx.fillStyle = 'rgba(125, 211, 252, 0.40)';
      ctx.save();
      ctx.translate(0, 2);
      traceContour(1.07);
      ctx.fill();
      ctx.restore();

      ctx.save();
      traceContour(1);
      ctx.clip();

      const iceGrad = ctx.createLinearGradient(-pit.rx, -pit.ry, pit.rx, pit.ry);
      iceGrad.addColorStop(0, '#E0F2FE');
      iceGrad.addColorStop(0.42, '#BAE6FD');
      iceGrad.addColorStop(0.82, '#7DD3FC');
      iceGrad.addColorStop(1, '#38BDF8');
      ctx.fillStyle = iceGrad;
      ctx.fillRect(-pit.rx * 1.4, -pit.ry * 1.4, pit.rx * 2.8, pit.ry * 2.8);

      // Glossy diagonal specular ice bands
      ctx.fillStyle = 'rgba(240, 249, 255, 0.44)';
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

      // Subtle hairline cracks warning that blasts can shatter the ice
      ctx.strokeStyle = 'rgba(12, 74, 110, 0.38)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-pit.rx * 0.38, -pit.ry * 0.28);
      ctx.lineTo(0, 4);
      ctx.lineTo(pit.rx * 0.44, -pit.ry * 0.14);
      ctx.moveTo(0, 4);
      ctx.lineTo(-pit.rx * 0.14, pit.ry * 0.46);
      ctx.stroke();
      ctx.restore();

      // Crisp frosted ice border
      ctx.strokeStyle = '#E0F2FE';
      ctx.lineWidth = 2.4;
      traceContour(1);
      ctx.stroke();
    }

    ctx.restore();
  }
}
