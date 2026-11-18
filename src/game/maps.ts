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

export const ARENA_MAPS: Record<MapId, ArenaMap> = {
  crossroads: {
    id: 'crossroads',
    name: 'Manor Foyer',
    description: 'Warm oak mansion hall with velvet sofas, mahogany tables, and steel safes.',
    width: 1500,
    height: 1050,
    immersive: false,
    floorTheme: 'mansion_wood',
    walls: [
      ...makeOuterWalls(1500, 1050, 'perimeter_wood'),
      // Top-left bedroom & parlor furniture
      prop(280, 210, 190, 56, 'sofa', '#991B1B'),
      prop(280, 290, 68, 120, 'bookshelf'),
      // Top-right master suite
      prop(1030, 210, 190, 56, 'sofa', '#1D4ED8'),
      prop(1152, 290, 68, 120, 'bookshelf'),
      // Bottom-left study
      prop(280, 784, 190, 56, 'sofa', '#047857'),
      prop(280, 640, 68, 120, 'bookshelf'),
      // Bottom-right lounge
      prop(1030, 784, 190, 56, 'sofa', '#7E22CE'),
      prop(1152, 640, 68, 120, 'bookshelf'),
      // Center banquet table + twin steel safes
      prop(680, 470, 140, 110, 'table'),
      prop(465, 488, 72, 74, 'metal'),
      prop(963, 488, 72, 74, 'metal'),
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
    description: 'Sunlit green lawn dotted with leafy trees, mossy boulders, and garden hedges.',
    width: 1500,
    height: 1050,
    immersive: false,
    floorTheme: 'grass_outdoors',
    walls: [
      ...makeOuterWalls(1500, 1050, 'perimeter_hedge'),
      prop(310, 210, 105, 105, 'tree'),
      prop(1085, 210, 105, 105, 'tree'),
      prop(310, 735, 105, 105, 'tree'),
      prop(1085, 735, 105, 105, 'tree'),
      prop(695, 225, 110, 155, 'hedge'),
      prop(695, 670, 110, 155, 'hedge'),
      prop(500, 470, 100, 100, 'rock'),
      prop(900, 470, 100, 100, 'rock'),
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
    description: 'Bright timber warehouse deck with reinforced steel shipping containers.',
    width: 1500,
    height: 1050,
    immersive: false,
    floorTheme: 'maple_cargo',
    walls: [
      ...makeOuterWalls(1500, 1050, 'perimeter_steel'),
      prop(255, 360, 50, 330, 'metal'),
      prop(1195, 360, 50, 330, 'metal'),
      prop(510, 210, 480, 48, 'metal'),
      prop(510, 792, 480, 48, 'metal'),
      prop(560, 468, 80, 114, 'metal'),
      prop(860, 468, 80, 114, 'metal'),
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

      // Top-left Wing (Master Bedroom)
      prop(330, 260, 150, 115, 'bed', '#9F1239'),
      prop(590, 250, 180, 58, 'sofa', '#B91C1C'),
      prop(330, 485, 62, 180, 'bookshelf'),

      // Top-right Wing (Guest Suite)
      prop(1920, 260, 150, 115, 'bed', '#1E40AF'),
      prop(1630, 250, 180, 58, 'sofa', '#1D4ED8'),
      prop(2008, 485, 62, 180, 'bookshelf'),

      // Bottom-left Wing (Emerald Parlor)
      prop(330, 1305, 150, 115, 'bed', '#065F46'),
      prop(590, 1372, 180, 58, 'sofa', '#047857'),
      prop(330, 1015, 62, 180, 'bookshelf'),

      // Bottom-right Wing (Royal Study)
      prop(1920, 1305, 150, 115, 'bed', '#6B21A8'),
      prop(1630, 1372, 180, 58, 'sofa', '#7E22CE'),
      prop(2008, 1015, 62, 180, 'bookshelf'),

      // Mid Hallway Banquet Tables & Sofas
      prop(860, 340, 160, 95, 'table'),
      prop(1380, 340, 160, 95, 'table'),
      prop(860, 1245, 160, 95, 'table'),
      prop(1380, 1245, 160, 95, 'table'),

      // Side Wing Lounges
      prop(340, 760, 150, 160, 'table'),
      prop(1910, 760, 150, 160, 'table'),

      // Grand Foyer Center: Long Banquet Table + Corner Steel Safes
      prop(1115, 760, 170, 160, 'table'),
      prop(930, 595, 90, 90, 'metal'),
      prop(1380, 595, 90, 90, 'metal'),
      prop(930, 995, 90, 90, 'metal'),
      prop(1380, 995, 90, 90, 'metal'),
    ],
    spawns: [
      { x: 165, y: 1515 },
      { x: 2235, y: 165 },
      { x: 165, y: 165 },
      { x: 2235, y: 1515 },
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

      // Quadrant Tree Clusters
      prop(390, 310, 130, 130, 'tree'),
      prop(1880, 310, 130, 130, 'tree'),
      prop(390, 1240, 130, 130, 'tree'),
      prop(1880, 1240, 130, 130, 'tree'),

      // Garden Hedge Walls
      prop(760, 220, 62, 250, 'hedge'),
      prop(1578, 220, 62, 250, 'hedge'),
      prop(760, 1210, 62, 250, 'hedge'),
      prop(1578, 1210, 62, 250, 'hedge'),

      // Mid-Grove Ancient Trees & Mossy Rocks
      prop(535, 770, 130, 130, 'tree'),
      prop(1735, 770, 130, 130, 'tree'),
      prop(775, 795, 90, 90, 'rock'),
      prop(1535, 795, 90, 90, 'rock'),

      // Central Clearing Trees & Steel Supply Crates
      prop(1135, 440, 130, 130, 'tree'),
      prop(1135, 1110, 130, 130, 'tree'),
      prop(1145, 785, 110, 110, 'metal'),
      prop(950, 625, 86, 86, 'rock'),
      prop(1364, 625, 86, 86, 'rock'),
      prop(950, 969, 86, 86, 'rock'),
      prop(1364, 969, 86, 86, 'rock'),
    ],
    spawns: [
      { x: 175, y: 840 },
      { x: 2225, y: 840 },
      { x: 1200, y: 155 },
      { x: 1200, y: 1525 },
    ],
  },
};

export const SOLO_MAP_LIST: ArenaMap[] = [
  ARENA_MAPS.crossroads,
  ARENA_MAPS.pillars,
  ARENA_MAPS.bunkers,
];

export const IMMERSIVE_MAP_LIST: ArenaMap[] = [
  ARENA_MAPS.immersive_mansion,
  ARENA_MAPS.immersive_outdoors,
];
