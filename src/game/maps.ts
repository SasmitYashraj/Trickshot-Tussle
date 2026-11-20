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

function buildLibraryMap(): ArenaMap {
  const W = 3000;
  const H = 2120;
  const T = ARENA_WALL_THICKNESS; // 24

  // Mezzanine inner opening bounds (Ground-only central atrium = x: 590..2410, y: 410..1710)
  const wingX = 590;
  const wingR = W - wingX; // 2410
  const wingY = 410;
  const wingB = H - wingY; // 1710

  // 4 symmetrical stairs connecting Ground (floor 0) <-> Upper Mezzanine (floor 1)
  const stairW = 196;
  const stairH = 155;
  const stairLX = 769;
  const stairRX = W - stairLX - stairW; // 2035
  const topStairY = wingY; // 410..565
  const botStairY = wingB - stairH; // 1555..1710

  const stairs = [
    { id: 0, x: stairLX, y: topStairY, w: stairW, h: stairH, upDir: 'up' as const },
    { id: 1, x: stairRX, y: topStairY, w: stairW, h: stairH, upDir: 'up' as const },
    { id: 2, x: stairLX, y: botStairY, w: stairW, h: stairH, upDir: 'down' as const },
    { id: 3, x: stairRX, y: botStairY, w: stairW, h: stairH, upDir: 'down' as const },
  ];

  const walls: WallRect[] = [
    // Outer library perimeter (applies to BOTH floor 0 and floor 1)
    ...makeOuterWalls(W, H, 'perimeter_wood'),

    // Central dark-brown 4-door pillar monolith on Ground Floor (floor 0)
    { x: W / 2 - 110, y: H / 2 - 110, w: 220, h: 220, kind: 'library_pillar', floor: 0 },
  ];

  // Staircase side borders (balustrades blocking entry from the sides on BOTH floors)
  // Plus a Ground-floor (floor: 0) rear wall closing the back end of the staircase so you can only climb up from the open ground mouth
  const railT = 18;
  for (const st of stairs) {
    walls.push({ x: st.x - railT, y: st.y, w: railT, h: st.h, kind: 'stair_rail', floor: 0 });
    walls.push({ x: st.x + st.w, y: st.y, w: railT, h: st.h, kind: 'stair_rail', floor: 0 });
    walls.push({ x: st.x - railT, y: st.y, w: railT, h: st.h, kind: 'stair_rail', floor: 1 });
    walls.push({ x: st.x + st.w, y: st.y, w: railT, h: st.h, kind: 'stair_rail', floor: 1 });
    if (st.upDir === 'up') {
      walls.push({
        x: st.x - railT,
        y: st.y - railT,
        w: st.w + railT * 2,
        h: railT,
        kind: 'stair_rail',
        floor: 0,
      });
    } else if (st.upDir === 'down') {
      walls.push({
        x: st.x - railT,
        y: st.y + st.h,
        w: st.w + railT * 2,
        h: railT,
        kind: 'stair_rail',
        floor: 0,
      });
    }
  }

  // Upper Mezzanine inner guardrails (floor: 1) sealing the balcony except at the 4 stair tops
  walls.push(
    { x: wingX, y: wingY, w: railT, h: wingB - wingY, kind: 'mezzanine_rail', floor: 1 },
    { x: wingR - railT, y: wingY, w: railT, h: wingB - wingY, kind: 'mezzanine_rail', floor: 1 },
    // Top edge segments
    { x: wingX, y: wingY, w: stairLX - railT - wingX, h: railT, kind: 'mezzanine_rail', floor: 1 },
    {
      x: stairLX + stairW + railT,
      y: wingY,
      w: stairRX - railT - (stairLX + stairW + railT),
      h: railT,
      kind: 'mezzanine_rail',
      floor: 1,
    },
    { x: stairRX + stairW + railT, y: wingY, w: wingR - (stairRX + stairW + railT), h: railT, kind: 'mezzanine_rail', floor: 1 },
    // Bottom edge segments
    { x: wingX, y: wingB - railT, w: stairLX - railT - wingX, h: railT, kind: 'mezzanine_rail', floor: 1 },
    {
      x: stairLX + stairW + railT,
      y: wingB - railT,
      w: stairRX - railT - (stairLX + stairW + railT),
      h: railT,
      kind: 'mezzanine_rail',
      floor: 1,
    },
    { x: stairRX + stairW + railT, y: wingB - railT, w: wingR - (stairRX + stairW + railT), h: railT, kind: 'mezzanine_rail', floor: 1 }
  );

  // Helper to mirror bookshelf rects 4-ways symmetrically around (W/2, H/2)
  const addQuadShelf = (x: number, y: number, w: number, h: number, floor: 0 | 1) => {
    const mx = W - x - w;
    const my = H - y - h;
    walls.push({ x, y, w, h, kind: 'bookshelf', floor });
    walls.push({ x: mx, y, w, h, kind: 'bookshelf', floor });
    walls.push({ x, y: my, w, h, kind: 'bookshelf', floor });
    walls.push({ x: mx, y: my, w, h, kind: 'bookshelf', floor });
  };

  // Helper to mirror top-bottom only (for spans centered on X=W/2)
  const addTopBotShelf = (x: number, y: number, w: number, h: number, floor: 0 | 1) => {
    const my = H - y - h;
    walls.push({ x, y, w, h, kind: 'bookshelf', floor });
    walls.push({ x, y: my, w, h, kind: 'bookshelf', floor });
  };

  // === UPPER FLOOR BOOKSHELVES (floor: 1) ===
  // Left & Right side wing vertical shelves (2 per quadrant -> 8 total)
  addQuadShelf(185, 290, 34, 540, 1);
  addQuadShelf(380, 290, 34, 540, 1);
  // Top & Bottom wing horizontal shelves (corner-wing + center-bridge)
  addQuadShelf(670, 192, 345, 32, 1);
  addTopBotShelf(1195, 192, 610, 32, 1);

  // === GROUND FLOOR BOOKSHELVES (floor: 0) ===
  // Side wing alternating vertical shelves (interleaved horizontally with Upper shelves above)
  addQuadShelf(282, 290, 34, 540, 0);
  addQuadShelf(475, 290, 34, 540, 0);
  // Top & Bottom edge horizontal shelves
  addQuadShelf(670, 188, 345, 32, 0);
  addTopBotShelf(1195, 188, 610, 32, 0);
  // Mid-Atrium 2 horizontal shelves below stairs (4 pairs mirrored = 8 shelves)
  addQuadShelf(670, 720, 168, 32, 0);
  addQuadShelf(670, 920, 168, 32, 0);
  // Central reading-hall 3 vertical shelves north & south of central pillar (12 shelves)
  addQuadShelf(998, 570, 30, 180, 0);
  addQuadShelf(1190, 570, 30, 180, 0);
  addQuadShelf(1382, 570, 30, 180, 0);

  return {
    id: 'library',
    name: 'The Library',
    description:
      'Two-floor haunted archive with 8 hidden books, a central 4-door cipher pillar, and the sound-hunting Figure.',
    width: W,
    height: H,
    immersive: true,
    floorTheme: 'library_wood',
    walls,
    upperZones: [
      { x: T, y: T, w: wingX - T, h: H - T * 2 },
      { x: wingR, y: T, w: W - T - wingR, h: H - T * 2 },
      { x: wingX, y: T, w: wingR - wingX, h: wingY - T },
      { x: wingX, y: wingB, w: wingR - wingX, h: H - T - wingB },
    ],
    stairs,
    pillarCenter: { x: W / 2, y: H / 2 },
    spawns: [
      { x: 112, y: 1995 }, // SW upper corner
      { x: 2888, y: 125 }, // NE upper corner
      { x: 112, y: 125 },  // NW upper corner
      { x: 2888, y: 1995 }, // SE upper corner
    ],
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
  library: buildLibraryMap(),
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
  ARENA_MAPS.library,
];

export const MAP_PREVIEW_URLS: Record<MapId, string> = {
  crossroads: '/assets/maps/crossroads.png',
  pillars: '/assets/maps/pillars.png',
  bunkers: '/assets/maps/bunkers.png',
  winter_tussle: '/assets/maps/winter_tussle.png',
  immersive_mansion: '/assets/maps/immersive_mansion.jpg',
  immersive_outdoors: '/assets/maps/immersive_outdoors.jpg',
  library: '/assets/maps/library.jpg',
};

export const IMMERSIVE_DARK_PREVIEW_URLS: Partial<Record<MapId, string>> = {
  immersive_mansion: '/assets/maps/immersive_mansion_dark.jpg',
  immersive_outdoors: '/assets/maps/immersive_outdoors_dark.jpg',
  library: '/assets/maps/library_dark.jpg',
};

