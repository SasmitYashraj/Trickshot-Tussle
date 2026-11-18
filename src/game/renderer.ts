import { ARENA_MAPS } from './maps';
import type {
  ArenaMap,
  Bullet,
  CardboardBox,
  ControlScheme,
  Explosion,
  FloatingText,
  JoystickState,
  MapId,
  Particle,
  Pickup,
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
  elapsedTime: number;
  screenShake: number;
  players: RenderPlayer[];
  bullets: Bullet[];
  pickups: Pickup[];
  boxes: CardboardBox[];
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

    const halfViewW = IMMERSIVE_VIEW_WIDTH * 0.5;
    const halfViewH = IMMERSIVE_VIEW_HEIGHT * 0.5;
    const clampedCamX = Math.max(halfViewW - 32, Math.min(map.width - halfViewW + 32, camX));
    const clampedCamY = Math.max(halfViewH - 32, Math.min(map.height - halfViewH + 32, camY));

    const scale = Math.min(
      Math.max(canvasWidth / IMMERSIVE_VIEW_WIDTH, canvasHeight / IMMERSIVE_VIEW_HEIGHT) * 0.92,
      Math.min(canvasWidth / 640, canvasHeight / 480)
    );

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
  // Subtle rug shadow
  ctx.fillStyle = 'rgba(20, 10, 4, 0.22)';
  ctx.fillRect(x + 3, y + 4, w, h);

  ctx.fillStyle = primary;
  ctx.fillRect(x, y, w, h);

  // Ornamental double border
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);

  ctx.strokeStyle = 'rgba(254, 243, 199, 0.35)';
  ctx.lineWidth = 1.5;
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

  // Fringe tassels on short ends
  ctx.strokeStyle = 'rgba(245, 235, 215, 0.55)';
  ctx.lineWidth = 1.5;
  for (let fy = y + 8; fy < y + h - 6; fy += 8) {
    ctx.beginPath();
    ctx.moveTo(x - 5, fy);
    ctx.lineTo(x, fy);
    ctx.moveTo(x + w, fy);
    ctx.lineTo(x + w + 5, fy);
    ctx.stroke();
  }
  ctx.restore();
}

function getFloorCanvas(map: ArenaMap): HTMLCanvasElement {
  const key = `${map.id}_${map.width}x${map.height}_v2`;
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
  } else {
    // Rich warm honey-oak / golden walnut hardwood planks
    const isCargo = map.floorTheme === 'maple_cargo';
    ctx.fillStyle = isCargo ? '#7E5A38' : '#7D4E2B';
    ctx.fillRect(0, 0, map.width, map.height);

    const plankH = 34;
    const plankW = 148;
    const tones = isCargo
      ? ['#9E744B', '#A87D52', '#946B43', '#B0855A', '#9A7148']
      : ['#9C653A', '#A66D40', '#8F5B33', '#AE7446', '#966037'];

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

        // Warm wood grain
        ctx.strokeStyle = 'rgba(72, 36, 14, 0.18)';
        ctx.lineWidth = 1;
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

        // Subtle golden plank highlight
        ctx.fillStyle = 'rgba(255, 236, 200, 0.08)';
        ctx.fillRect(x + 1, y + 1, plankW - 2, 2);

        // Plank seam
        ctx.strokeStyle = 'rgba(54, 27, 10, 0.36)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x, y, plankW, plankH);
      }
    }

    if (map.floorTheme === 'mansion_wood') {
      // Ornate colorful Persian carpets in the Mansion
      drawPersianRug(
        ctx,
        map.width / 2 - (map.immersive ? 260 : 190),
        map.height / 2 - (map.immersive ? 190 : 140),
        map.immersive ? 520 : 380,
        map.immersive ? 380 : 280,
        '#7F1D1D',
        '#D97706'
      );

      if (map.immersive) {
        drawPersianRug(ctx, 290, 220, 320, 210, '#1E3A8A', '#F59E0B');
        drawPersianRug(ctx, map.width - 610, 220, 320, 210, '#065F46', '#FBBF24');
        drawPersianRug(ctx, 290, map.height - 430, 320, 210, '#581C87', '#F59E0B');
        drawPersianRug(ctx, map.width - 610, map.height - 430, 320, 210, '#991B1B', '#FBBF24');
      }
    } else {
      // Industrial Cargo lane markings
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.22)';
      ctx.lineWidth = 4;
      ctx.strokeRect(70, 70, map.width - 140, map.height - 140);
      ctx.beginPath();
      ctx.arc(map.width / 2, map.height / 2, 130, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  floorCache.set(key, off);
  return off;
}

function drawObstacle(ctx: CanvasRenderingContext2D, wall: WallRect) {
  const kind = wall.kind ?? 'metal';

  if (kind === 'perimeter_wood' || kind === 'perimeter_hedge' || kind === 'perimeter_steel') {
    if (kind === 'perimeter_hedge') {
      ctx.fillStyle = '#14532D';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 2;
      ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
    } else if (kind === 'perimeter_wood') {
      ctx.fillStyle = '#451A03';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = '#92400E';
      ctx.lineWidth = 2;
      ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
    } else {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
    }
    return;
  }

  // Cast shadow onto floor
  ctx.fillStyle = 'rgba(10, 6, 4, 0.42)';
  ctx.beginPath();
  ctx.roundRect(wall.x + 6, wall.y + 8, wall.w, wall.h, kind === 'tree' || kind === 'rock' ? 18 : 6);
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

  // Soft floor drop shadow
  ctx.fillStyle = 'rgba(10, 6, 4, 0.36)';
  ctx.beginPath();
  ctx.roundRect(-hw + 4, -hh + 6, box.w, box.h, 5);
  ctx.fill();

  // Corrugated kraft cardboard base
  ctx.fillStyle = box.state === 'punctured' ? '#EAB676' : '#C89B62';
  ctx.strokeStyle = '#784E24';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-hw, -hh, box.w, box.h, 4);
  ctx.fill();
  ctx.stroke();

  // Inner flap highlight
  ctx.fillStyle = 'rgba(255, 240, 214, 0.18)';
  ctx.fillRect(-hw + 3, -hh + 3, box.w - 6, 4);

  // Center packing tape strip
  ctx.fillStyle = 'rgba(245, 224, 181, 0.78)';
  ctx.fillRect(-7, -hh + 1, 14, box.h - 2);

  // Box flap seam
  ctx.strokeStyle = 'rgba(120, 78, 36, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -hh + 2);
  ctx.lineTo(0, hh - 2);
  ctx.stroke();

  // Subtle corrugated lines on corner
  ctx.strokeStyle = 'rgba(120, 78, 36, 0.35)';
  ctx.beginPath();
  ctx.moveTo(-hw + 6, hh - 8);
  ctx.lineTo(-hw + 14, hh - 8);
  ctx.moveTo(-hw + 6, hh - 12);
  ctx.lineTo(-hw + 12, hh - 12);
  ctx.stroke();

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

  // 1. Lively Wooden / Meadow Grass Floor
  const floorCanvas = getFloorCanvas(map);
  ctx.drawImage(floorCanvas, 0, 0);

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

  // 3. TNT blast warning zones
  for (const item of world.pickups) {
    if (item.kind === 'tnt' && item.countdown !== undefined) {
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

  // 4. Pickups
  for (const item of world.pickups) {
    const bob = Math.sin(item.age * 4.2 + item.id) * 2.2;
    ctx.save();

    ctx.fillStyle = 'rgba(12, 7, 4, 0.36)';
    ctx.beginPath();
    ctx.ellipse(item.x + 2, item.y + 8, item.radius * 0.9, item.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(item.x, item.y + bob);

    if (item.kind === 'bullet') {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, item.radius + 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = '#FEF9C3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, item.radius - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === 'nitro') {
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.34)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, NITRO_BLAST_RADIUS * 0.34, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#EA580C';
      ctx.strokeStyle = '#FED7AA';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-13, -13, 26, 26, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFF7ED';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N₂', 0, 1);
    } else if (item.kind === 'tnt') {
      const cd = Math.max(0, item.countdown ?? 3);
      const secText = Math.ceil(cd).toString();
      const flash = cd < 1.0 && Math.floor(cd * 10) % 2 === 0;

      ctx.fillStyle = flash ? '#FCA5A5' : '#DC2626';
      ctx.strokeStyle = '#FEE2E2';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-20, -20, 40, 40, 6);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + (cd / 3) * Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = flash ? '#7F1D1D' : '#FFFFFF';
      ctx.font = '800 20px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(secText, 0, 1);
    } else if (item.kind === 'medkit') {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, item.radius + 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-13, -13, 26, 26, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#10B981';
      ctx.fillRect(-2.5, -7.5, 5, 15);
      ctx.fillRect(-7.5, -2.5, 15, 5);
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

    ctx.fillStyle = 'rgba(10, 6, 4, 0.45)';
    ctx.beginPath();
    ctx.arc(3, 5, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    if (isLocal) {
      ctx.strokeStyle = `${player.color}77`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (player.ammo > 0 && player.stunTimer <= 0) {
      ctx.save();
      ctx.rotate(player.angle);
      ctx.strokeStyle = hexWithAlpha(player.color, isLocal ? 0.65 : 0.25);
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(PLAYER_RADIUS + 6, 0);
      ctx.lineTo(PLAYER_RADIUS + (isLocal ? 68 : 36), 0);
      ctx.stroke();
      ctx.restore();
    }

    const skinColor = player.hurtFlashTimer > 0 ? '#FFFFFF' : player.color;

    // Keep the crisp circle hitbox base & team ring
    ctx.fillStyle = hexWithAlpha(skinColor, 0.17);
    ctx.strokeStyle = hexWithAlpha(skinColor, 0.82);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Top-down humanoid stickman body + small handgun rotated in facing direction
    const moveSpeed = Math.hypot(player.vx ?? 0, player.vy ?? 0);
    const moveBlend = Math.min(1, moveSpeed / 145);
    const stride = Math.sin(world.elapsedTime * 15 + player.id * 1.7) * moveBlend;

    ctx.save();
    ctx.rotate(player.angle);

    // 1. Animated striding stickman feet peeking beneath shoulders
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = skinColor;
    ctx.lineWidth = 1.2;
    const leftFootX = stride * 6.5;
    const rightFootX = -stride * 6.5;
    ctx.beginPath();
    ctx.ellipse(leftFootX, -5.5, 4.2, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(rightFootX, 5.5, 4.2, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 2. Stickman arms reaching forward to hold the small handgun
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Dark arm outline
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5.4;
    ctx.beginPath();
    ctx.moveTo(0, -10.5);
    ctx.quadraticCurveTo(9, -9.5, 13.5, -1.8);
    ctx.moveTo(0, 10.5);
    ctx.quadraticCurveTo(9, 9.5, 13.5, 1.8);
    ctx.stroke();
    // Colored stickman arm skin
    ctx.strokeStyle = skinColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -10.5);
    ctx.quadraticCurveTo(9, -9.5, 13.5, -1.8);
    ctx.moveTo(0, 10.5);
    ctx.quadraticCurveTo(9, 9.5, 13.5, 1.8);
    ctx.stroke();

    // 3. Top-down stickman shoulders / torso capsule
    ctx.fillStyle = skinColor;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-4.8, -11.8, 9.6, 23.6, 4.8);
    ctx.fill();
    ctx.stroke();

    // 4. Small top-down handgun held in both hands
    // Gun grip / receiver
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(11, -2.5, 13.5, 5, 1.5);
    ctx.fill();
    ctx.stroke();

    // Metallic pistol slide & armed chamber glow
    ctx.fillStyle = player.ammo > 0 ? '#FACC15' : '#94A3B8';
    ctx.fillRect(13.5, -1.3, 9.5, 2.6);
    if (player.ammo > 0) {
      ctx.fillStyle = '#FEF9C3';
      ctx.fillRect(22, -1.1, 2.5, 2.2);
    }

    // 5. Stickman head (top-down sphere with highlight & subtle directional eyes)
    ctx.fillStyle = skinColor;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(1.5, 0, 7.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Crown highlight
    ctx.save();
    ctx.fillStyle = player.hurtFlashTimer > 0 ? '#FFFFFF' : player.accentColor;
    ctx.globalAlpha *= 0.55;
    ctx.beginPath();
    ctx.arc(0.2, -1.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tiny forward-facing stickman eyes
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(6.3, -2.4, 1.35, 0, Math.PI * 2);
    ctx.arc(6.3, 2.4, 1.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (player.ammo > 0) {
      for (let a = 0; a < player.ammo; a++) {
        const pipAngle = -Math.PI / 2 + (a - (player.ammo - 1) / 2) * 0.42;
        const px = Math.cos(pipAngle) * (PLAYER_RADIUS + 9);
        const py = Math.sin(pipAngle) * (PLAYER_RADIUS + 9);
        ctx.fillStyle = '#FACC15';
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    if (player.stunTimer > 0) {
      // Stunned players are temporarily protected until they get back up
      ctx.save();
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 5, world.elapsedTime * 7, world.elapsedTime * 7 + Math.PI * 1.35);
      ctx.stroke();

      for (let s = 0; s < 3; s++) {
        const sa = world.elapsedTime * 6 + (s * Math.PI * 2) / 3;
        const sx = Math.cos(sa) * 14;
        const sy = Math.sin(sa) * 6 - 24;
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const hpRatio = player.hp / player.maxHp;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(-18, PLAYER_RADIUS + 10, 36, 5);
    ctx.fillStyle = hpRatio > 0.5 ? '#34D399' : hpRatio > 0.25 ? '#FBBF24' : '#F43F5E';
    ctx.fillRect(-17, PLAYER_RADIUS + 11, 34 * hpRatio, 3);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, 0, -PLAYER_RADIUS - 13);

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
      if (item.kind === 'tnt') {
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

    // Faintly visible stickman silhouettes & circle outline even inside dark surroundings!
    for (const player of world.players) {
      if (!player.alive || player.id === localPlayerId) continue;
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      ctx.rotate(player.angle);
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.roundRect(-4.5, -11, 9, 22, 4.5);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(1.5, 0, 7.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(11, -2, 12, 4);
      ctx.restore();
    }
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
  } else if (joystick.active) {
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
