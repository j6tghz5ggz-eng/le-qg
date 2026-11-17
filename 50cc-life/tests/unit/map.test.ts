import { describe, expect, it } from 'vitest';
import { TELEPORT_POINTS } from '../../src/world/TestWorld';
import {
  BUILDINGS,
  CHUNK_SIZE,
  ROADS,
  SQUARE_RADIUS,
  STATION,
  VILLAGE_SQUARE,
  chunkOf,
  chunksAround,
  distanceToRoadEdge,
  roadLength,
  seededRandom,
  treesInChunk,
} from '../../src/world/map/mapData';

describe('carte du monde ouvert', () => {
  it('routes : départementale, chemin du garage, boucle de campagne de plusieurs km', () => {
    const loop = ROADS.find((r) => r.id === 'loop')!;
    expect(roadLength(loop)).toBeGreaterThan(2300);
    expect(ROADS.find((r) => r.id === 'd50')).toBeDefined();
    // Le chemin part de la rampe du garage et rejoint la D50.
    const drive = ROADS.find((r) => r.id === 'driveway')!;
    expect(distanceToRoadEdge(drive.points.at(-1)![0], drive.points.at(-1)![1] - 3, [ROADS[0]!])).toBeLessThan(1);
  });

  it('le village a des maisons, une église, et aucune n’est sur une route', () => {
    expect(BUILDINGS.filter((b) => b.kind === 'house').length).toBeGreaterThan(25);
    expect(BUILDINGS.some((b) => b.kind === 'church')).toBe(true);
    for (const b of BUILDINGS) expect(distanceToRoadEdge(b.x, b.z)).toBeGreaterThan(Math.max(b.w, b.d) / 2 - 1.01);
  });

  it('la station est au bord de la D50, ses pompes à portée de la route', () => {
    for (const [x, z] of STATION.pumps) {
      const d = distanceToRoadEdge(x, z, [ROADS[0]!]);
      expect(d).toBeGreaterThan(3);
      expect(d).toBeLessThan(20);
    }
  });

  it('arbres : reproductibles, jamais sur la route ni près du garage', () => {
    const a = treesInChunk(-3, 3);
    const b = treesInChunk(-3, 3);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(20); // en forêt
    for (let cx = -4; cx <= 4; cx++) {
      for (let cz = -2; cz <= 2; cz++) {
        for (const t of treesInChunk(cx, cz)) {
          expect(distanceToRoadEdge(t.x, t.z)).toBeGreaterThanOrEqual(4);
          expect(t.x > -40 && t.x < 45 && t.z > -40 && t.z < 40).toBe(false);
        }
      }
    }
  });

  it('morceaux autour du joueur : les plus proches d’abord, dans le rayon', () => {
    expect(chunkOf(10, -10)).toEqual([0, -1]);
    const list = chunksAround(0, 0, 250);
    expect(list.length).toBeGreaterThan(10);
    expect(list.length).toBeLessThan(40);
    const near = list[0]!;
    expect(Math.abs((near[0] + 0.5) * CHUNK_SIZE)).toBeLessThanOrEqual(CHUNK_SIZE);
  });

  it('la place du village est dégagée (aucune maison dessus)', () => {
    for (const b of BUILDINGS) {
      expect(Math.hypot(b.x - VILLAGE_SQUARE[0], b.z - VILLAGE_SQUARE[1])).toBeGreaterThanOrEqual(SQUARE_RADIUS + Math.max(b.w, b.d) / 2);
    }
  });

  it('chaque téléportation tombe sur un sol libre (ni maison, ni arbre, ni fontaine)', () => {
    for (const point of TELEPORT_POINTS) {
      const { x, z } = point.position;
      for (const b of BUILDINGS) {
        // Coordonnées dans le repère du bâtiment (rotation de yaw autour de y).
        const dx = x - b.x;
        const dz = z - b.z;
        const lx = dx * Math.cos(b.yaw) - dz * Math.sin(b.yaw);
        const lz = dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw);
        const inside = Math.abs(lx) < b.w / 2 + 1 && Math.abs(lz) < b.d / 2 + 1;
        expect(inside, `${point.id} dans un bâtiment`).toBe(false);
      }
      const [cx, cz] = chunkOf(x, z);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          for (const t of treesInChunk(ix, iz)) expect(Math.hypot(t.x - x, t.z - z), `${point.id} contre un arbre`).toBeGreaterThan(2);
        }
      }
      expect(Math.hypot(x - VILLAGE_SQUARE[0], z - VILLAGE_SQUARE[1]), `${point.id} dans la fontaine`).toBeGreaterThan(2.5);
    }
  });

  it('hasard à graine : même graine, même suite', () => {
    const r1 = seededRandom(42);
    const r2 = seededRandom(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});
