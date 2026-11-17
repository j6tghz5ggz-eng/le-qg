/**
 * Carte du monde ouvert (données pures, testées).
 *
 * 2,4 km × 2,4 km autour de la maison du joueur (garage en 0, 12) :
 * - route départementale D50 (est-ouest), chemin du garage, grande boucle
 *   de campagne (≈ 3 km) ;
 * - village fictif de Villebois (maisons, église, rues), station-service ;
 * - arbres générés par morceau de carte (graine fixe : toujours les mêmes),
 *   jamais sur une route, une maison ou une zone d'essai.
 *
 * Les noms (Villebois, station PÉTRO'VAL) sont inventés.
 */

export const MAP_HALF = 1200;
/** Côté d'un morceau de carte chargé à la demande (m). */
export const CHUNK_SIZE = 128;
export const VILLAGE_NAME = 'VILLEBOIS';

export type Vec2 = readonly [number, number];

export interface Road {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly points: readonly Vec2[];
}

/** Routes (axe central, du début à la fin). */
export const ROADS: readonly Road[] = [
  {
    id: 'd50',
    name: 'D50',
    width: 7,
    points: [
      [-1150, -20],
      [-650, -20],
      [-14, -20],
      [300, -25],
      [450, -40],
      [600, -60],
      [1150, -60],
    ],
  },
  {
    id: 'driveway',
    name: 'Chemin du garage',
    width: 4,
    points: [
      [0, 7.4],
      [0.8, 5],
      [3, 1],
      [3, -17],
    ],
  },
  {
    id: 'loop',
    name: 'Route des Bois',
    width: 6,
    points: [
      [600, -60],
      [620, 200],
      [580, 500],
      [300, 700],
      [-100, 720],
      [-500, 600],
      [-700, 300],
      [-650, 0],
      [-650, -20],
    ],
  },
  {
    id: 'church-street',
    name: "Rue de l'Église",
    width: 6,
    points: [
      [450, -40],
      [452, 40],
      [455, 130],
    ],
  },
  {
    id: 'mill-street',
    name: 'Rue du Moulin',
    width: 6,
    points: [
      [380, -32],
      [378, -110],
      [376, -190],
    ],
  },
  {
    id: 'cross-street',
    name: 'Rue des Écoles',
    width: 5,
    points: [
      [378, -110],
      [450, -112],
      [530, -115],
    ],
  },
];

export type BuildingKind = 'house' | 'church' | 'shop' | 'barn';

export interface Building {
  readonly kind: BuildingKind;
  readonly x: number;
  readonly z: number;
  /** Largeur (x local), profondeur (z local), hauteur des murs (m). */
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** Rotation (rad) : la façade (z local +) regarde la rue. */
  readonly yaw: number;
  /** Teinte des murs (0 à 1, pour varier les couleurs). */
  readonly tint: number;
}

export interface Sign {
  readonly kind: 'villageEntry' | 'speed50' | 'station';
  readonly x: number;
  readonly z: number;
  /** Rotation (rad) : la face avant regarde vers z local -. */
  readonly yaw: number;
}

/** Station-service PÉTRO'VAL, au bord de la D50 avant le village. */
export const STATION = {
  x: 230,
  z: -46,
  /** Pompes (sous l'auvent), entre la route et la boutique. */
  pumps: [
    [222, -38],
    [238, -38],
  ] as readonly Vec2[],
  /** Prix du litre de SP95 (€). */
  pricePerLiter: 1.85,
} as const;

/** Place du village (pavée, fontaine au centre), en face de l'église, de l'autre côté de la rue. */
export const VILLAGE_SQUARE: Vec2 = [434, 30];
/** Rayon de la place (m) : aucune maison dessus. */
export const SQUARE_RADIUS = 12;

// --- Géométrie ----------------------------------------------------------------

/** Distance d'un point à un segment [a, b]. */
export function distanceToSegment(x: number, z: number, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(Math.max(((x - a[0]) * dx + (z - a[1]) * dz) / len2, 0), 1) : 0;
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

/** Distance au bord de la route la plus proche (négative = sur la route). */
export function distanceToRoadEdge(x: number, z: number, roads: readonly Road[] = ROADS): number {
  let best = Infinity;
  for (const road of roads) {
    for (let i = 1; i < road.points.length; i++) {
      best = Math.min(best, distanceToSegment(x, z, road.points[i - 1]!, road.points[i]!) - road.width / 2);
    }
  }
  return best;
}

/** Point et direction le long d'une route, à une distance donnée de son début. */
export function pointAlong(road: Road, distance: number): { x: number; z: number; dirX: number; dirZ: number } {
  let walked = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1]!;
    const b = road.points[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (walked + seg >= distance || i === road.points.length - 1) {
      const t = seg > 0 ? Math.min((distance - walked) / seg, 1) : 0;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dirX: (b[0] - a[0]) / seg, dirZ: (b[1] - a[1]) / seg };
    }
    walked += seg;
  }
  const p = road.points[0]!;
  return { x: p[0], z: p[1], dirX: 1, dirZ: 0 };
}

export function roadLength(road: Road): number {
  let total = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1]!;
    const b = road.points[i]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

// --- Hasard reproductible --------------------------------------------------------

/** Générateur pseudo-aléatoire à graine (mulberry32) : même graine, même suite. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkSeed(cx: number, cz: number, salt: number): number {
  return (Math.imul(cx + 1000, 73856093) ^ Math.imul(cz + 1000, 19349663) ^ salt) >>> 0;
}

// --- Village ------------------------------------------------------------------------

/** Maisons le long des rues du village, de part et d'autre (façade vers la rue). */
function buildVillage(): Building[] {
  // L'église (sur la place) et une grange d'abord : les maisons s'écartent d'elles.
  const out: Building[] = [
    { kind: 'church', x: 474, z: 30, w: 10, d: 20, h: 9, yaw: -Math.PI / 2, tint: 0.2 },
    { kind: 'barn', x: 560, z: -150, w: 16, d: 11, h: 6, yaw: 0.1, tint: 0.5 },
  ];
  const along = (roadId: string, from: number, to: number, spacing: number, setback: number, seed: number): void => {
    const road = ROADS.find((r) => r.id === roadId)!;
    const rnd = seededRandom(seed);
    for (let s = from; s <= to; s += spacing) {
      const p = pointAlong(road, s);
      for (const side of [-1, 1]) {
        if (rnd() < 0.15) continue; // quelques terrains vides
        // Normale à la route (vers la gauche puis la droite).
        const nx = -p.dirZ * side;
        const nz = p.dirX * side;
        const w = 8 + rnd() * 5;
        const d = 7 + rnd() * 4;
        const h = 4.5 + rnd() * 2.5;
        const x = p.x + nx * (setback + d / 2);
        const z = p.z + nz * (setback + d / 2);
        // Façade (z local +) tournée vers la route : direction (-nx, -nz).
        out.push({ kind: 'house', x, z, w, d, h, yaw: Math.atan2(-nx, -nz), tint: rnd() });
      }
    }
  };
  const d50 = ROADS.find((r) => r.id === 'd50')!;
  /** Distance le long de la D50 jusqu'à l'abscisse x (ses points vont d'ouest en est). */
  const d50Village = (x: number): number => {
    let walked = 0;
    for (let i = 1; i < d50.points.length; i++) {
      const a = d50.points[i - 1]!;
      const b = d50.points[i]!;
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (x <= b[0]) return walked + seg * ((x - a[0]) / (b[0] - a[0]));
      walked += seg;
    }
    return walked;
  };
  // Le long de la D50, en évitant le débouché des rues.
  for (const [x0, x1] of [
    [312, 370],
    [392, 440],
    [462, 590],
  ] as const) {
    alongD50(out, d50, d50Village(x0), d50Village(x1));
  }
  along('church-street', 18, 120, 15, 7, 11);
  along('mill-street', 16, 150, 15, 7, 12);
  along('cross-street', 12, 140, 16, 6.5, 13);
  // Pas de maison sur une route, ni deux maisons l'une dans l'autre (carrefours).
  const kept: Building[] = [];
  for (const b of out) {
    if (distanceToRoadEdge(b.x, b.z) <= Math.max(b.w, b.d) / 2 - 1) continue;
    if (Math.hypot(b.x - VILLAGE_SQUARE[0], b.z - VILLAGE_SQUARE[1]) < SQUARE_RADIUS + Math.max(b.w, b.d) / 2) continue;
    if (kept.some((k) => Math.hypot(k.x - b.x, k.z - b.z) < (Math.max(k.w, k.d) + Math.max(b.w, b.d)) / 2)) continue;
    kept.push(b);
  }
  return kept;
}

function alongD50(out: Building[], road: Road, from: number, to: number): void {
  const rnd = seededRandom(Math.round(from * 7));
  for (let s = from; s <= to; s += 15) {
    const p = pointAlong(road, s);
    for (const side of [-1, 1]) {
      if (rnd() < 0.12) continue;
      const nx = -p.dirZ * side;
      const nz = p.dirX * side;
      const w = 8 + rnd() * 5;
      const d = 7 + rnd() * 4;
      const h = 4.5 + rnd() * 3;
      const setback = 8.5;
      out.push({ kind: 'house', x: p.x + nx * (setback + d / 2), z: p.z + nz * (setback + d / 2), w, d, h, yaw: Math.atan2(-nx, -nz), tint: rnd() });
    }
  }
}

/** Bâtiments du village (et la boutique de la station). */
export const BUILDINGS: readonly Building[] = [
  ...buildVillage(),
  { kind: 'shop', x: STATION.x, z: STATION.z - 12, w: 14, d: 8, h: 4, yaw: 0, tint: 0.9 },
];

/** Panneaux : entrées du village (avec limitation à 50) et station. */
export const SIGNS: readonly Sign[] = [
  // Côté ouest : face aux véhicules qui arrivent de l'ouest (face avant vers -x).
  { kind: 'villageEntry', x: 296, z: -30.5, yaw: Math.PI / 2 },
  { kind: 'speed50', x: 292, z: -30.5, yaw: Math.PI / 2 },
  // Côté est : face aux véhicules qui arrivent de l'est.
  { kind: 'villageEntry', x: 606, z: -53.5, yaw: -Math.PI / 2 },
  { kind: 'speed50', x: 610, z: -53.5, yaw: -Math.PI / 2 },
  { kind: 'station', x: 205, z: -30, yaw: Math.PI / 2 },
];

// --- Arbres --------------------------------------------------------------------------

export interface Tree {
  readonly x: number;
  readonly z: number;
  /** Échelle (1 = arbre moyen). */
  readonly scale: number;
  readonly kind: 'broadleaf' | 'conifer';
  readonly yaw: number;
}

/** Zones sans arbres : maison et garage, zones d'essai, village, station. */
const NO_TREE_ZONES: ReadonlyArray<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [
  { minX: -40, maxX: 45, minZ: -40, maxZ: 40 }, // maison, garage, établi, rampe
  { minX: -22, maxX: 40, minZ: -25, maxZ: 190 }, // route d'essai et colline
  { minX: 300, maxX: 620, minZ: -205, maxZ: 145 }, // village
  { minX: 195, maxX: 265, minZ: -75, maxZ: -15 }, // station
];

/** Forêts (denses) ; ailleurs, arbres isolés dans les champs. */
const FORESTS: ReadonlyArray<{ x: number; z: number; r: number }> = [
  { x: -380, z: 380, r: 260 },
  { x: 250, z: 420, r: 170 },
  { x: 820, z: 300, r: 200 },
  { x: -850, z: -350, r: 220 },
];

export function chunkOf(x: number, z: number): [number, number] {
  return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
}

/** Arbres d'un morceau de carte : toujours les mêmes pour un morceau donné. */
export function treesInChunk(cx: number, cz: number): Tree[] {
  const rnd = seededRandom(chunkSeed(cx, cz, 0x7ee));
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  const centerX = x0 + CHUNK_SIZE / 2;
  const centerZ = z0 + CHUNK_SIZE / 2;
  let density = 0.25; // arbres par 1 000 m² hors forêt
  for (const f of FORESTS) {
    const d = Math.hypot(centerX - f.x, centerZ - f.z);
    if (d < f.r) density = Math.max(density, 4.5 * (1 - (d / f.r) ** 2) + 0.6);
  }
  const count = Math.round((density * CHUNK_SIZE * CHUNK_SIZE) / 1000);
  const trees: Tree[] = [];
  for (let i = 0; i < count; i++) {
    const x = x0 + rnd() * CHUNK_SIZE;
    const z = z0 + rnd() * CHUNK_SIZE;
    const scale = 0.75 + rnd() * 0.6;
    const conifer = rnd() < (density > 1 ? 0.45 : 0.15);
    const yaw = rnd() * Math.PI * 2;
    if (Math.abs(x) > MAP_HALF - 5 || Math.abs(z) > MAP_HALF - 5) continue;
    if (NO_TREE_ZONES.some((zone) => x > zone.minX && x < zone.maxX && z > zone.minZ && z < zone.maxZ)) continue;
    if (distanceToRoadEdge(x, z) < 4) continue;
    trees.push({ x, z, scale, kind: conifer ? 'conifer' : 'broadleaf', yaw });
  }
  return trees;
}

/** Bâtiments dont le centre est dans ce morceau. */
export function buildingsInChunk(cx: number, cz: number): Building[] {
  return BUILDINGS.filter((b) => {
    const [bx, bz] = chunkOf(b.x, b.z);
    return bx === cx && bz === cz;
  });
}

/** Morceaux à charger autour d'un point (rayon en m). */
export function chunksAround(x: number, z: number, radius: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const min = chunkOf(x - radius, z - radius);
  const max = chunkOf(x + radius, z + radius);
  for (let cx = min[0]; cx <= max[0]; cx++) {
    for (let cz = min[1]; cz <= max[1]; cz++) {
      // Distance du point au morceau (0 si dedans).
      const dx = Math.max(cx * CHUNK_SIZE - x, 0, x - (cx + 1) * CHUNK_SIZE);
      const dz = Math.max(cz * CHUNK_SIZE - z, 0, z - (cz + 1) * CHUNK_SIZE);
      if (Math.hypot(dx, dz) <= radius && Math.abs(cx * CHUNK_SIZE) <= MAP_HALF + CHUNK_SIZE && Math.abs(cz * CHUNK_SIZE) <= MAP_HALF + CHUNK_SIZE) out.push([cx, cz]);
    }
  }
  // Les plus proches d'abord (chargement progressif).
  return out.sort((a, b) => chunkDistance(a, x, z) - chunkDistance(b, x, z));
}

function chunkDistance([cx, cz]: readonly [number, number], x: number, z: number): number {
  return Math.hypot((cx + 0.5) * CHUNK_SIZE - x, (cz + 0.5) * CHUNK_SIZE - z);
}
