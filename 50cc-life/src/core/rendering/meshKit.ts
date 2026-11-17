/**
 * Boîte à outils pour construire des modèles 3D détaillés en code (sans
 * fichier à télécharger) : tubes courbes, pièces tournées (pneus, jantes),
 * profilés balayés (selle, réservoir), plaques découpées (plastiques avec
 * leur déco), ressorts… Tout finit fusionné par matériau : beaucoup de
 * détails, peu d'appels GPU.
 */
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Color3 } from '@babylonjs/core/Maths/math.color';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Curve3 } from '@babylonjs/core/Maths/math.path';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder';
import { CreateRibbon } from '@babylonjs/core/Meshes/Builders/ribbonBuilder';
import { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';

export const v3 = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

/** Oriente un maillage construit le long de y vers `direction`. */
function alignY(mesh: Mesh, direction: Vector3): void {
  const d = direction.normalizeToNew();
  mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), d, new Quaternion());
}

/** Cylindre (ou cône) entre deux points. */
export function rod(scene: Scene, name: string, from: Vector3, to: Vector3, diameter: number, tessellation = 10, diameterTo = diameter): Mesh {
  const mesh = CreateCylinder(name, { diameterBottom: diameter, diameterTop: diameterTo, height: Vector3.Distance(from, to), tessellation }, scene);
  mesh.position = Vector3.Center(from, to);
  alignY(mesh, to.subtract(from));
  return mesh;
}

/** Pavé entre deux points (section largeur × épaisseur), tourné pour que « haut » reste vers le haut. */
export function block(scene: Scene, name: string, from: Vector3, to: Vector3, width: number, height: number): Mesh {
  const mesh = CreateBox(name, { width, height, depth: Vector3.Distance(from, to) }, scene);
  mesh.position = Vector3.Center(from, to);
  mesh.lookAt(to);
  return mesh;
}

/** Pavé simple centré en `at`. */
export function box(scene: Scene, name: string, at: Vector3, w: number, h: number, d: number, rotX = 0, rotY = 0, rotZ = 0): Mesh {
  const mesh = CreateBox(name, { width: w, height: h, depth: d }, scene);
  mesh.position.copyFrom(at);
  mesh.rotation.set(rotX, rotY, rotZ);
  return mesh;
}

/** Tube lissé passant par des points (cadre, cintre, durites…). */
export function pipe(scene: Scene, name: string, points: Vector3[], radius: number, tessellation = 8, smooth = 5): Mesh {
  const path = smooth > 0 && points.length > 2 ? Curve3.CreateCatmullRomSpline(points, smooth).getPoints() : points;
  return CreateTube(name, { path, radius, tessellation, cap: Mesh.CAP_ALL }, scene);
}

/**
 * Pièce de révolution autour de l'axe x (pneu, jante, disque, moyeu…).
 * `profile` : liste de [rayon, position sur l'axe x].
 */
export function latheX(scene: Scene, name: string, profile: ReadonlyArray<readonly [number, number]>, tessellation = 32, doubleSided = false): Mesh {
  const shape = profile.map(([r, a]) => new Vector3(r, -a, 0));
  const mesh = CreateLathe(name, { shape, tessellation, sideOrientation: doubleSided ? Mesh.DOUBLESIDE : Mesh.DEFAULTSIDE }, scene);
  mesh.rotation.z = Math.PI / 2;
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}

/**
 * Profilé balayé : la section `shape` ([x, y], x = vers la droite, y = vers
 * le haut) suit le chemin `path`, mise à l'échelle par `scale(t)` (t de 0 à
 * 1). Les extrémités sont fermées.
 */
export function sweep(
  scene: Scene,
  name: string,
  shape: ReadonlyArray<readonly [number, number]>,
  points: Vector3[],
  scale: (t: number) => readonly [number, number] = () => [1, 1],
  smooth = 6,
): Mesh {
  const path = points.length > 2 ? Curve3.CreateCatmullRomSpline(points, smooth).getPoints() : points;
  const rings: Vector3[][] = [];
  const up = Vector3.Up();
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const p = path[i]!;
    const tangent = path[Math.min(i + 1, n - 1)]!.subtract(path[Math.max(i - 1, 0)]!).normalize();
    const side = Vector3.Cross(up, tangent).normalize();
    const lift = Vector3.Cross(tangent, side).normalize();
    const [sx, sy] = scale(n > 1 ? i / (n - 1) : 0);
    const ring = shape.map(([x, y]) => p.add(side.scale(x * sx)).addInPlace(lift.scale(y * sy)));
    ring.push(ring[0]!.clone());
    rings.push(ring);
  }
  // Extrémités : anneaux réduits au centre (ferme le profilé).
  const centerOf = (ring: Vector3[]): Vector3 => ring.slice(0, -1).reduce((a, b) => a.add(b), Vector3.Zero()).scale(1 / (ring.length - 1));
  const first = centerOf(rings[0]!);
  const last = centerOf(rings[rings.length - 1]!);
  rings.unshift(rings[0]!.map(() => first.clone()));
  rings.push(rings[rings.length - 1]!.map(() => last.clone()));
  return CreateRibbon(name, { pathArray: rings, sideOrientation: Mesh.DEFAULTSIDE }, scene);
}

/**
 * Plaque découpée vue de profil (plastiques de carrosserie, plaque…).
 * `outline` : contour [z, y] (polygone étoilé autour de son centre), posé
 * dans le plan x = `x`. Coordonnées de texture : u le long de z (inversé
 * côté gauche pour que la déco se lise de gauche à droite des deux côtés),
 * v le long de y. Matériau à afficher des deux côtés (voir plasticMaterial).
 */
export function plate(scene: Scene, name: string, outline: ReadonlyArray<readonly [number, number]>, x: number, tiltOut = 0): Mesh {
  const zs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const cz = zs.reduce((a, b) => a + b, 0) / zs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  const left = x < 0;
  const positions: number[] = [];
  const uvs: number[] = [];
  const push = (z: number, y: number): void => {
    // Légère inclinaison : le haut de la plaque rentre vers la moto.
    const px = x - Math.sign(x) * (y - yMin) * tiltOut;
    positions.push(px, y, z);
    const u = (z - zMin) / (zMax - zMin);
    uvs.push(left ? 1 - u : u, (y - yMin) / (yMax - yMin));
  };
  push(cz, cy);
  for (const [z, y] of outline) push(z, y);
  const indices: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % outline.length);
    indices.push(0, a, b);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}

/**
 * Plaque vue de face (masque de phare…) : contour [x, y] dans le plan
 * z = `z`, légèrement galbée (`curve` : recul des bords) et inclinée (`tilt` :
 * recul par mètre de hauteur). Texture lisible depuis l'avant.
 */
export function facePlate(scene: Scene, name: string, outline: ReadonlyArray<readonly [number, number]>, z: number, curve = 0, tilt = 0): Mesh {
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const push = (x: number, y: number): void => {
    positions.push(x, y, z - curve * x * x - tilt * y);
    // Vu de face, la droite du spectateur est vers -x.
    uvs.push((xMax - x) / (xMax - xMin), (y - yMin) / (yMax - yMin));
  };
  push(cx, cy);
  for (const [x, y] of outline) push(x, y);
  const indices: number[] = [];
  for (let i = 0; i < outline.length; i++) indices.push(0, 1 + i, 1 + ((i + 1) % outline.length));
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}

/**
 * Disque de frein « pétale » (bord ondulé), dans le plan x = `x` : anneau
 * entre `inner` et `outer`, `waves` ondulations de profondeur `depth`.
 */
export function waveDisc(scene: Scene, name: string, x: number, inner: number, outer: number, waves: number, depth: number): Mesh {
  const steps = waves * 8;
  const ringIn: Vector3[] = [];
  const ringOut: Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = outer - depth * (0.5 + 0.5 * Math.cos(waves * a));
    const ri = inner + depth * 0.4 * (0.5 + 0.5 * Math.cos(waves * a + Math.PI));
    ringIn.push(new Vector3(x, ri * Math.cos(a), ri * Math.sin(a)));
    ringOut.push(new Vector3(x, r * Math.cos(a), r * Math.sin(a)));
  }
  return CreateRibbon(name, { pathArray: [ringIn, ringOut], sideOrientation: Mesh.DOUBLESIDE }, scene);
}

/** Ressort hélicoïdal le long de y (de 0 à `length`). */
export function coil(scene: Scene, name: string, radius: number, wire: number, length: number, turns: number): Mesh {
  const points: Vector3[] = [];
  const steps = Math.round(turns * 14);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * turns * Math.PI * 2;
    points.push(new Vector3(Math.cos(a) * radius, (i / steps) * length, Math.sin(a) * radius));
  }
  return CreateTube(name, { path: points, radius: wire, tessellation: 6, cap: Mesh.NO_CAP }, scene);
}

/** Place un maillage construit le long de y entre deux points (ressort…). */
export function between(mesh: Mesh, from: Vector3, to: Vector3): Mesh {
  mesh.position.copyFrom(from);
  alignY(mesh, to.subtract(from));
  return mesh;
}

/**
 * Aspect d'une surface :
 * - `material` : matériau propre (texture de déco…) ;
 * - `shared` + `color` : matériau partagé par toute une famille (métal,
 *   chrome, plastique…), la couleur étant portée par les sommets. Dix
 *   teintes de métal = un seul appel GPU au lieu de dix.
 */
export type Surface = { readonly material: PBRMaterial } | { readonly shared: PBRMaterial; readonly color: Color3 };

function paintVertices(mesh: Mesh, color: Color3): void {
  const count = mesh.getTotalVertices();
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b, 1], i * 4);
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

/**
 * Collecte les morceaux d'un modèle par surface, puis les fusionne : un
 * maillage par matériau (réel) et par nœud parent.
 */
export class MeshBin<K extends string> {
  private readonly pieces = new Map<K, Mesh[]>();

  add(surface: K, ...meshes: Mesh[]): void {
    const list = this.pieces.get(surface) ?? [];
    list.push(...meshes);
    this.pieces.set(surface, list);
  }

  /** Fusionne et rattache à `parent`. Retourne les maillages créés. */
  merge(prefix: string, parent: TransformNode, palette: Record<K, Surface>): Mesh[] {
    const byMaterial = new Map<PBRMaterial, { name: string; meshes: Mesh[] }>();
    for (const [key, list] of this.pieces) {
      const surface = palette[key];
      const material = 'material' in surface ? surface.material : surface.shared;
      if (!('material' in surface)) for (const mesh of list) paintVertices(mesh, surface.color);
      const group = byMaterial.get(material) ?? { name: 'material' in surface ? key : material.name, meshes: [] };
      group.meshes.push(...list);
      byMaterial.set(material, group);
    }
    const out: Mesh[] = [];
    for (const [material, group] of byMaterial) {
      const merged = group.meshes.length > 1 ? Mesh.MergeMeshes(group.meshes, true, true) : group.meshes[0];
      if (!merged) continue;
      merged.name = `${prefix}-${group.name}`;
      merged.material = material;
      merged.parent = parent;
      out.push(merged);
    }
    this.pieces.clear();
    return out;
  }
}
