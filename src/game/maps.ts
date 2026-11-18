import {
  ARENA_WALL_THICKNESS,
  type ArenaMap,
  type MapId,
  type ObstacleKind,
  type WallRect,
} from './types.ts';

function makeOuterWalls(W: number, H: number, kind: ObstacleKind): WallRect[] {
  const T = ARENA_WALL_THICKNESS;
  return [
    { x: 0, y: 0, w: W, h: T, kind },
    { x: 0, y: H - T, w: W, h: T, kind },
    { x: 0, y: T, w: T, h: H - T * 2, kind },
    { x: W - T, y: T, w: T, h: H - T * 2, kind },
  ];
}

function prop(x: number, y: number, w: number, h: number, kind: ObstacleKind, accent?: string): WallRect {
  return { x, y, w, h, kind, accent };
}

function makeOrganicPitPoints(
  rx: number,
  ry: number,
  seed: number,
  count = 14
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const rot = (seed % 7) * 0.27;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const harmonic =
      1 +
      0.16 * Math.sin(a * 2 + seed * 1.3) +
      0.13 * Math.cos(a * 3 - seed * 0.9) +
      0.08 * Math.sin(a * 5 + seed * 2.1);
    const lx = Math.cos(a) * rx * harmonic;
    const ly = Math.sin(a) * ry * harmonic;
    pts.push({
      x: Math.round((lx * cosR - ly * sinR) * 10) / 10,
      y: Math.round((lx * sinR + ly * cosR) * 10) / 10,
    });
  }
  return pts;
}

function makeIcePit(x: number, y: number, rx: number, ry: number, seed: number) {
  return {
    x,
    y,
    rx,
    ry,
    points: makeOrganicPitPoints(rx, ry, seed),
  };
}

export const ARENA_MAPS: Record<MapId, ArenaMap> = {
  crossroads: {
    id: 'crossroads',
    name: 'Manor Foyer',
    description: 'Warm oak mansion hall with wide ricochet lanes, velvet sofas, and a central banquet table.',
    width: 1500,
    height: 1050,
    immersive: false,
    floorTheme: 'mansion_wood',
    walls: [
      ...makeOuterWalls(1500, 1050, 'perimeter_wood'),
      // 3 looping obstacles with wide open cover-crate zones
      prop(680, 470, 140, 110, 'table'),
      prop(320, 265, 165, 60, 'sofa', '#991B1B'),
      prop(1015, 725, 165, 60, 'sofa', '#1D4ED8'),
    ],
    spawns: [
      { x: 130, y: 920 },
      { x: 1370, y: 130 },
      { x: 130, y: 130 },
      { x: 1370, y: 920 },
    ],
  },
  pillars: {
    id: 'pillars',
    name: 'Meadow Clearing',
    description: 'Sunlit green lawn with three looping tree and boulder cover points.',
    width: 1500,
    height: 1050,
    immersive: false,
    floorTheme: 'grass_outdoors',
    walls: [
      ...makeOuterWalls(1500, 1050, 'perimeter_hedge'),
      // 3 triangular looping cover spots
      prop(400, 290, 108, 108, 'tree'),
      prop(992, 290, 108, 108, 'tree'),
      prop(698, 660, 104, 104, 'rock'),
    ],
    spawns: [
      { x: 135, y: 525 },
      { x: 1365, y: 525 },
      { x: 750, y: 115 },
      { x: 750, y: 935 },
    ],
  },
  bunkers: {
    id: 'bunkers',
    name: 'Cargo Deck',
    description: 'Polished marble-slate tile warehouse deck with twin steel containers for fast looping duels.',
    width: 1500,
    height: 1050,
    immersive: false,
    floorTheme: 'maple_cargo',
    walls: [
      ...makeOuterWalls(1500, 1050, 'perimeter_steel'),
      // 2 looping steel bunker walls
      prop(355, 385, 68, 280, 'metal'),
      prop(1077, 385, 68, 280, 'metal'),
    ],
    spawns: [
      { x: 130, y: 920 },
      { x: 1370, y: 130 },
      { x: 130, y: 130 },
      { x: 1370, y: 920 },
    ],
  },
  winter_tussle: {
    id: 'winter_tussle',
    name: 'Winter Tussle',
    description: 'Mist-veiled glacier snowfield with alpine pines and scattered fragile ice ponds.',
    width: 1500,
    height: 1050,
    immersive: false,
    floorTheme: 'winter_snow',
    walls: [
      ...makeOuterWalls(1500, 1050, 'perimeter_ice'),
      // 2 snow-dusted green mountain spruce trees as looping obstacles
      prop(375, 465, 118, 118, 'pine_tree'),
      prop(1007, 465, 118, 118, 'pine_tree'),
    ],
    icePits: [
      makeIcePit(545, 240, 134, 84, 1),
      makeIcePit(1110, 265, 92, 64, 2),
      makeIcePit(768, 550, 118, 80, 3),
      makeIcePit(415, 810, 74, 54, 4),
      makeIcePit(1045, 805, 126, 82, 5),
    ],
    spawns: [
      { x: 130, y: 920 },
      { x: 1370, y: 130 },
      { x: 130, y: 130 },
      { x: 1370, y: 920 },
    ],
  },

  // === IMMERSIVE MULTIPLAYER MAPS (2400 x 1680) ===
  immersive_mansion: {
    id: 'immersive_mansion',
    name: 'Wooden Mansion',
    description: 'Grand oak estate furnished with plush sofas, canopy beds, banquet tables, and safes.',
    width: 2400,
    height: 1680,
    immersive: true,
    floorTheme: 'mansion_wood',
    walls: [
      ...makeOuterWalls(2400, 1680, 'perimeter_wood'),

      // Top-left Wing (Master Bedroom - widened 150px+ gaps)
      prop(270, 225, 145, 110, 'bed', '#9F1239'),
      prop(580, 215, 165, 56, 'sofa', '#B91C1C'),
      prop(275, 495, 60, 150, 'bookshelf'),

      // Top-right Wing (Guest Suite)
      prop(1985, 225, 145, 110, 'bed', '#1E40AF'),
      prop(1655, 215, 165, 56, 'sofa', '#1D4ED8'),
      prop(2065, 495, 60, 150, 'bookshelf'),

      // Bottom-left Wing (Emerald Parlor)
      prop(270, 1345, 145, 110, 'bed', '#065F46'),
      prop(580, 1409, 165, 56, 'sofa', '#047857'),
      prop(275, 1035, 60, 150, 'bookshelf'),

      // Bottom-right Wing (Royal Study)
      prop(1985, 1345, 145, 110, 'bed', '#6B21A8'),
      prop(1655, 1409, 165, 56, 'sofa', '#7E22CE'),
      prop(2065, 1035, 60, 150, 'bookshelf'),

      // Mid Hallway Banquet Tables
      prop(895, 315, 150, 90, 'table'),
      prop(1355, 315, 150, 90, 'table'),
      prop(895, 1275, 150, 90, 'table'),
      prop(1355, 1275, 150, 90, 'table'),

      // Side Wing Lounges
      prop(325, 785, 140, 110, 'table'),
      prop(1935, 785, 140, 110, 'table'),

      // Grand Foyer Center: Long Banquet Table + Widened Corner Steel Safes
      prop(1125, 770, 150, 140, 'table'),
      prop(870, 560, 84, 84, 'metal'),
      prop(1446, 560, 84, 84, 'metal'),
      prop(870, 1036, 84, 84, 'metal'),
      prop(1446, 1036, 84, 84, 'metal'),
    ],
    spawns: [
      { x: 145, y: 1535 },
      { x: 2255, y: 145 },
      { x: 145, y: 145 },
      { x: 2255, y: 1535 },
    ],
  },
  immersive_outdoors: {
    id: 'immersive_outdoors',
    name: 'Emerald Grove',
    description: 'Sprawling grassy forest clearing with ancient trees, garden hedges, mossy rocks, and supply crates.',
    width: 2400,
    height: 1680,
    immersive: true,
    floorTheme: 'grass_outdoors',
    walls: [
      ...makeOuterWalls(2400, 1680, 'perimeter_hedge'),

      // Quadrant Tree Clusters (widened corridors)
      prop(330, 265, 120, 120, 'tree'),
      prop(1950, 265, 120, 120, 'tree'),
      prop(330, 1295, 120, 120, 'tree'),
      prop(1950, 1295, 120, 120, 'tree'),

      // Garden Hedge Walls
      prop(745, 200, 58, 230, 'hedge'),
      prop(1597, 200, 58, 230, 'hedge'),
      prop(745, 1250, 58, 230, 'hedge'),
      prop(1597, 1250, 58, 230, 'hedge'),

      // Mid-Grove Ancient Trees & Mossy Rocks
      prop(435, 780, 120, 120, 'tree'),
      prop(1845, 780, 120, 120, 'tree'),
      prop(745, 796, 88, 88, 'rock'),
      prop(1567, 796, 88, 88, 'rock'),

      // Central Clearing Trees & Steel Supply Crates
      prop(1140, 385, 120, 120, 'tree'),
      prop(1140, 1175, 120, 120, 'tree'),
      prop(1148, 788, 104, 104, 'metal'),
      prop(920, 585, 82, 82, 'rock'),
      prop(1398, 585, 82, 82, 'rock'),
      prop(920, 1013, 82, 82, 'rock'),
      prop(1398, 1013, 82, 82, 'rock'),
    ],
    spawns: [
      { x: 165, y: 840 },
      { x: 2235, y: 840 },
      { x: 1200, y: 150 },
      { x: 1200, y: 1530 },
    ],
  },
};

export const SOLO_MAP_LIST: ArenaMap[] = [
  ARENA_MAPS.crossroads,
  ARENA_MAPS.pillars,
  ARENA_MAPS.bunkers,
  ARENA_MAPS.winter_tussle,
];

export const IMMERSIVE_MAP_LIST: ArenaMap[] = [
  ARENA_MAPS.immersive_mansion,
  ARENA_MAPS.immersive_outdoors,
];
