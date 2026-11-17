/**
 * Modèle 3D provisoire d'un cyclomoteur, construit en code à partir de
 * formes simples (aucun fichier à télécharger). Il sera remplacé par un
 * modèle Blender ; seule l'organisation des nœuds compte :
 *
 *   root ─┬─ cadre (pièces fusionnées par matériau : peu d'appels GPU)
 *         ├─ steer (fourche + guidon + roue avant) → tourne avec le guidon
 *         ├─ rearWheel → tourne (rotation) et monte/descend (suspension)
 *         ├─ stand (béquille, visible garée)
 *         └─ eye (position des yeux du pilote, pour la caméra)
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { BikeSpec } from './specs';

export interface WheelVisual {
  /** Monte/descend avec la suspension. */
  readonly mount: TransformNode;
  /** Tourne autour de l'axe x. */
  readonly spin: TransformNode;
}

export interface BikeVisual {
  readonly root: TransformNode;
  readonly steer: TransformNode;
  readonly front: WheelVisual;
  readonly rear: WheelVisual;
  readonly stand: TransformNode;
  readonly eye: TransformNode;
  readonly meshes: Mesh[];
}

type Materials = Record<'paint' | 'black' | 'metal' | 'rubber' | 'chrome' | 'light', PBRMaterial>;

function material(scene: Scene, name: string, color: Color3, roughness: number, metallic = 0): PBRMaterial {
  const mat = new PBRMaterial(`bike-${name}`, scene);
  mat.albedoColor = color;
  mat.roughness = roughness;
  mat.metallic = metallic;
  return mat;
}

/** Barre (boîte allongée) entre deux points. */
function bar(scene: Scene, name: string, from: Vector3, to: Vector3, thickness: number, width = thickness): Mesh {
  const length = Vector3.Distance(from, to);
  const mesh = CreateBox(name, { width, height: thickness, depth: length }, scene);
  mesh.position = Vector3.Center(from, to);
  mesh.lookAt(to);
  return mesh;
}

/** Modèle 3D provisoire selon le style de la moto. */
export function createBikeVisual(scene: Scene, spec: BikeSpec): BikeVisual {
  return spec.style === 'supermotard' ? createSupermotardVisual(scene, spec) : createCycloVisual(scene, spec);
}

function createCycloVisual(scene: Scene, spec: BikeSpec, paint = new Color3(0.07, 0.24, 0.62)): BikeVisual {
  const m: Materials = {
    paint: material(scene, 'paint', paint, 0.35),
    black: material(scene, 'black', new Color3(0.03, 0.03, 0.035), 0.6),
    metal: material(scene, 'metal', new Color3(0.45, 0.45, 0.47), 0.4, 0.25),
    rubber: material(scene, 'rubber', new Color3(0.035, 0.035, 0.035), 0.92),
    chrome: material(scene, 'chrome', new Color3(0.75, 0.75, 0.78), 0.25, 0.3),
    light: material(scene, 'light', new Color3(1, 0.95, 0.8), 0.2),
  };
  m.light.emissiveColor = new Color3(0.5, 0.48, 0.4);

  const root = new TransformNode('bike-visual', scene);
  const half = spec.wheelBase / 2;
  const meshes: Mesh[] = [];

  // --- Cadre et carrosserie (fusionnés par matériau) ---
  const head = new Vector3(0, 0.62, half - 0.12); // tête de fourche
  const parts: Array<[Mesh, keyof Materials]> = [
    [bar(scene, 'downtube', head, new Vector3(0, 0.08, 0.02), 0.07), 'paint'],
    [bar(scene, 'tank', head.add(new Vector3(0, -0.04, -0.04)), new Vector3(0, 0.46, -0.2), 0.16, 0.2), 'paint'],
    [bar(scene, 'stay-l', new Vector3(-0.08, 0.5, -0.3), new Vector3(-0.08, 0, -half), 0.04), 'paint'],
    [bar(scene, 'stay-r', new Vector3(0.08, 0.5, -0.3), new Vector3(0.08, 0, -half), 0.04), 'paint'],
    [bar(scene, 'swing-l', new Vector3(-0.08, 0.06, -0.05), new Vector3(-0.08, 0, -half), 0.05), 'black'],
    [bar(scene, 'swing-r', new Vector3(0.08, 0.06, -0.05), new Vector3(0.08, 0, -half), 0.05), 'black'],
    [bar(scene, 'seat', new Vector3(0, 0.55, -0.12), new Vector3(0, 0.55, -0.55), 0.09, 0.25), 'black'],
    [bar(scene, 'rack', new Vector3(0, 0.52, -0.58), new Vector3(0, 0.52, -0.9), 0.03, 0.22), 'metal'],
    [bar(scene, 'fender-r', new Vector3(0, 0.33, -half + 0.05), new Vector3(0, 0.25, -half - 0.28), 0.02, 0.12), 'paint'],
    [bar(scene, 'engine', new Vector3(0, 0.1, 0.12), new Vector3(0, 0.08, -0.18), 0.24, 0.22), 'metal'],
    [bar(scene, 'cylinder', new Vector3(0, 0.18, 0.12), new Vector3(0, 0.36, 0.2), 0.13, 0.15), 'metal'],
    [bar(scene, 'exhaust', new Vector3(0.12, 0.02, 0.05), new Vector3(0.14, 0.06, -0.62), 0.07), 'black'],
    [bar(scene, 'pedal-l', new Vector3(-0.08, 0.05, -0.02), new Vector3(-0.24, 0.02, -0.02), 0.03), 'black'],
    [bar(scene, 'pedal-r', new Vector3(0.08, 0.05, -0.02), new Vector3(0.24, 0.02, -0.02), 0.03), 'black'],
  ];
  for (const [byMaterial, list] of groupBy(parts)) {
    const merged = Mesh.MergeMeshes(list, true, true);
    if (merged) {
      merged.name = `bike-frame-${byMaterial}`;
      merged.material = m[byMaterial];
      merged.parent = root;
      meshes.push(merged);
    }
  }

  // --- Avant : fourche, guidon, phare, roue (tourne avec le guidon) ---
  const steer = new TransformNode('bike-steer', scene);
  steer.parent = root;
  steer.position.copyFrom(head);
  const hubLocal = new Vector3(0, -head.y, half - head.z); // moyeu avant dans le repère de la fourche
  const forkParts: Array<[Mesh, keyof Materials]> = [
    [bar(scene, 'fork-l', new Vector3(-0.07, 0.05, 0), hubLocal.add(new Vector3(-0.07, 0, 0)), 0.04), 'chrome'],
    [bar(scene, 'fork-r', new Vector3(0.07, 0.05, 0), hubLocal.add(new Vector3(0.07, 0, 0)), 0.04), 'chrome'],
    [bar(scene, 'stem', new Vector3(0, 0, 0), new Vector3(0, 0.3, -0.05), 0.04), 'chrome'],
    [bar(scene, 'handlebar', new Vector3(-0.33, 0.32, -0.1), new Vector3(0.33, 0.32, -0.1), 0.028), 'chrome'],
    [bar(scene, 'grip-l', new Vector3(-0.36, 0.32, -0.1), new Vector3(-0.24, 0.32, -0.1), 0.04), 'black'],
    [bar(scene, 'grip-r', new Vector3(0.36, 0.32, -0.1), new Vector3(0.24, 0.32, -0.1), 0.04), 'black'],
    [bar(scene, 'fender-f', new Vector3(0, -0.28, 0.0), hubLocal.add(new Vector3(0, 0.3, 0.22)), 0.02, 0.11), 'paint'],
    [bar(scene, 'headlight-body', new Vector3(0, 0.16, 0.05), new Vector3(0, 0.16, 0.16), 0.15, 0.15), 'paint'],
  ];
  for (const [byMaterial, list] of groupBy(forkParts)) {
    // Pièces définies dans le repère du guidon : fusionnées telles quelles, puis rattachées.
    const merged = Mesh.MergeMeshes(list, true, true);
    if (merged) {
      merged.name = `bike-fork-${byMaterial}`;
      merged.material = m[byMaterial];
      merged.parent = steer;
      meshes.push(merged);
    }
  }
  const lens = CreateCylinder('bike-headlight', { diameter: 0.12, height: 0.02 }, scene);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.16, 0.17);
  lens.material = m.light;
  lens.parent = steer;
  meshes.push(lens);

  const front = createWheel(scene, 'front', spec.wheelRadius, 0.07, m, meshes);
  front.mount.parent = steer;
  front.mount.position.copyFrom(hubLocal);

  // --- Arrière ---
  const rear = createWheel(scene, 'rear', spec.wheelRadius, 0.07, m, meshes);
  rear.mount.parent = root;
  rear.mount.position.set(0, 0, -half);

  // --- Béquille (côté gauche) ---
  const stand = new TransformNode('bike-stand', scene);
  stand.parent = root;
  stand.position.set(-0.1, 0.06, -0.05);
  const standBar = bar(scene, 'stand-bar', Vector3.Zero(), new Vector3(-0.18, -0.3, -0.06), 0.03);
  standBar.material = m.metal;
  standBar.parent = stand;
  meshes.push(standBar);

  const eye = new TransformNode('bike-eye', scene);
  eye.parent = root;
  eye.position.set(...spec.eyeLocal);

  return { root, steer, front, rear, stand, eye, meshes };
}

function createWheel(scene: Scene, name: string, radius: number, tireWidth: number, m: Materials, meshes: Mesh[]): WheelVisual {
  const mount = new TransformNode(`bike-wheel-${name}`, scene);
  const spin = new TransformNode(`bike-wheel-${name}-spin`, scene);
  spin.parent = mount;
  const tire = CreateTorus(`bike-tire-${name}`, { diameter: radius * 2 - tireWidth, thickness: tireWidth, tessellation: 28 }, scene);
  tire.rotation.z = Math.PI / 2;
  tire.material = m.rubber;
  const rim = CreateCylinder(`bike-rim-${name}`, { diameter: radius * 2 - tireWidth * 1.7, height: 0.03, tessellation: 20 }, scene);
  rim.rotation.z = Math.PI / 2;
  rim.material = m.metal;
  // Une barre visible sur la jante : on voit la roue tourner.
  const spoke = CreateBox(`bike-spoke-${name}`, { width: 0.035, height: radius * 2 - tireWidth * 2, depth: 0.03 }, scene);
  spoke.material = m.black;
  for (const mesh of [tire, rim, spoke]) {
    mesh.parent = spin;
    meshes.push(mesh);
  }
  return { mount, spin };
}

function groupBy(parts: Array<[Mesh, keyof Materials]>): Map<keyof Materials, Mesh[]> {
  const map = new Map<keyof Materials, Mesh[]>();
  for (const [mesh, key] of parts) {
    const list = map.get(key) ?? [];
    list.push(mesh);
    map.set(key, list);
  }
  return map;
}

/**
 * Supermotard 50 : selle haute, plastiques, fourche inversée, bras oscillant,
 * radiateur (moteur refroidi par eau), frein à disque. Le haut moteur
 * (cylindre, culasse, pot…) n'est PAS construit ici : ce sont des pièces
 * démontables ajoutées par le système de mécanique.
 */
function createSupermotardVisual(scene: Scene, spec: BikeSpec): BikeVisual {
  const m: Materials = {
    paint: material(scene, 'sm-yellow', new Color3(0.95, 0.72, 0.05), 0.35),
    black: material(scene, 'sm-black', new Color3(0.035, 0.035, 0.04), 0.55),
    metal: material(scene, 'sm-metal', new Color3(0.42, 0.42, 0.44), 0.4, 0.25),
    rubber: material(scene, 'sm-rubber', new Color3(0.035, 0.035, 0.035), 0.92),
    chrome: material(scene, 'sm-alu', new Color3(0.7, 0.7, 0.73), 0.3, 0.3),
    light: material(scene, 'sm-light', new Color3(1, 0.95, 0.8), 0.2),
  };
  m.light.emissiveColor = new Color3(0.5, 0.48, 0.4);
  const root = new TransformNode('bike-visual', scene);
  const half = spec.wheelBase / 2;
  const meshes: Mesh[] = [];
  const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

  const head = v(0, 0.8, half - 0.2); // tête de fourche
  const pivot = v(0, 0.2, -0.13); // axe du bras oscillant
  const frameParts: Array<[Mesh, keyof Materials]> = [
    [bar(scene, 'spar', head, pivot.add(v(0, 0.1, 0)), 0.09, 0.1), 'black'],
    [bar(scene, 'downtube', head.add(v(0, -0.05, 0)), v(0, -0.04, 0.2), 0.06), 'black'],
    [bar(scene, 'cradle', v(0, -0.06, 0.2), pivot, 0.05), 'black'],
    [bar(scene, 'subframe', pivot.add(v(0, 0.35, 0)), v(0, 0.62, -0.75), 0.05, 0.16), 'black'],
    [bar(scene, 'crankcase', v(0, 0.06, 0.15), v(0, 0.06, -0.17), 0.24, 0.22), 'metal'],
    [bar(scene, 'clutch-cover', v(0.12, 0.05, 0.05), v(0.12, 0.05, -0.12), 0.18, 0.04), 'metal'],
    [bar(scene, 'radiator', v(0, 0.36, 0.35), v(0, 0.6, 0.31), 0.04, 0.24), 'black'],
    [bar(scene, 'tank', v(0, 0.7, 0.33), v(0, 0.66, -0.02), 0.17, 0.26), 'paint'],
    // Écopes de radiateur assez petites pour laisser voir la culasse et la bougie (atelier).
    [bar(scene, 'shroud-l', v(-0.15, 0.7, 0.46), v(-0.15, 0.64, 0.24), 0.13, 0.03), 'paint'],
    [bar(scene, 'shroud-r', v(0.15, 0.7, 0.46), v(0.15, 0.64, 0.24), 0.13, 0.03), 'paint'],
    [bar(scene, 'seat', v(0, 0.66, 0.12), v(0, 0.64, -0.62), 0.07, 0.22), 'black'],
    [bar(scene, 'panel-l', v(-0.13, 0.55, -0.22), v(-0.13, 0.58, -0.6), 0.16, 0.03), 'paint'],
    [bar(scene, 'panel-r', v(0.13, 0.55, -0.22), v(0.13, 0.58, -0.6), 0.16, 0.03), 'paint'],
    [bar(scene, 'tail', v(0, 0.6, -0.6), v(0, 0.74, -1.0), 0.03, 0.18), 'paint'],
    [bar(scene, 'swingarm-l', pivot.add(v(-0.09, 0, 0)), v(-0.09, 0, -half), 0.06, 0.04), 'chrome'],
    [bar(scene, 'swingarm-r', pivot.add(v(0.09, 0, 0)), v(0.09, 0, -half), 0.06, 0.04), 'chrome'],
    [bar(scene, 'shock', v(0, 0.55, -0.16), v(0, 0.22, -0.38), 0.06), 'paint'],
    [bar(scene, 'peg-l', v(-0.1, 0.07, -0.13), v(-0.24, 0.07, -0.13), 0.03), 'chrome'],
    [bar(scene, 'peg-r', v(0.1, 0.07, -0.13), v(0.24, 0.07, -0.13), 0.03), 'chrome'],
    [bar(scene, 'chain', v(-0.08, 0.06, 0.0), v(-0.08, 0.03, -half), 0.03, 0.02), 'metal'],
  ];
  mergeByMaterial(frameParts, m, root, 'bike-frame', meshes);

  // --- Avant : fourche inversée, plaque phare, guidon large, roue + disque ---
  const steer = new TransformNode('bike-steer', scene);
  steer.parent = root;
  steer.position.copyFrom(head);
  const hubLocal = new Vector3(0, -head.y, half - head.z);
  const forkParts: Array<[Mesh, keyof Materials]> = [
    [bar(scene, 'fork-l', v(-0.08, 0.06, 0), hubLocal.add(v(-0.08, 0.05, 0)), 0.05), 'black'],
    [bar(scene, 'fork-r', v(0.08, 0.06, 0), hubLocal.add(v(0.08, 0.05, 0)), 0.05), 'black'],
    [bar(scene, 'slider-l', hubLocal.add(v(-0.08, 0.33, -0.06)), hubLocal.add(v(-0.08, 0.02, 0)), 0.035), 'chrome'],
    [bar(scene, 'slider-r', hubLocal.add(v(0.08, 0.33, -0.06)), hubLocal.add(v(0.08, 0.02, 0)), 0.035), 'chrome'],
    [bar(scene, 'clamp', v(-0.11, 0.05, 0), v(0.11, 0.05, 0), 0.04, 0.06), 'chrome'],
    [bar(scene, 'handlebar', v(-0.39, 0.2, -0.08), v(0.39, 0.2, -0.08), 0.028), 'chrome'],
    [bar(scene, 'grip-l', v(-0.4, 0.2, -0.08), v(-0.28, 0.2, -0.08), 0.04), 'black'],
    [bar(scene, 'grip-r', v(0.4, 0.2, -0.08), v(0.28, 0.2, -0.08), 0.04), 'black'],
    [bar(scene, 'plate', v(0, -0.02, 0.14), v(0, 0.17, 0.11), 0.03, 0.2), 'paint'],
    [bar(scene, 'fender-f', v(0, -0.1, 0.05), v(0, -0.14, 0.42), 0.02, 0.13), 'paint'],
  ];
  mergeByMaterial(forkParts, m, steer, 'bike-fork', meshes);
  const lens = CreateCylinder('bike-headlight', { diameter: 0.1, height: 0.02 }, scene);
  lens.rotation.x = Math.PI / 2 + 0.15;
  lens.position.set(0, 0.07, 0.15);
  lens.material = m.light;
  lens.parent = steer;
  meshes.push(lens);

  const front = createWheel(scene, 'front', spec.wheelRadius, 0.09, m, meshes);
  front.mount.parent = steer;
  front.mount.position.copyFrom(hubLocal);
  const disc = CreateCylinder('bike-disc', { diameter: 0.3, height: 0.006, tessellation: 24 }, scene);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = -0.06;
  disc.material = m.chrome;
  disc.parent = front.spin;
  meshes.push(disc);

  const rear = createWheel(scene, 'rear', spec.wheelRadius, 0.12, m, meshes);
  rear.mount.parent = root;
  rear.mount.position.set(0, 0, -half);

  const stand = new TransformNode('bike-stand', scene);
  stand.parent = root;
  stand.position.set(-0.1, 0.05, -0.12);
  const standBar = bar(scene, 'stand-bar', Vector3.Zero(), v(-0.2, -0.33, -0.05), 0.03);
  standBar.material = m.metal;
  standBar.parent = stand;
  meshes.push(standBar);

  const eye = new TransformNode('bike-eye', scene);
  eye.parent = root;
  eye.position.set(...spec.eyeLocal);
  return { root, steer, front, rear, stand, eye, meshes };
}

/** Fusionne les pièces par matériau (moins d'appels GPU) et les rattache à `parent`. */
function mergeByMaterial(
  parts: Array<[Mesh, keyof Materials]>,
  m: Materials,
  parent: TransformNode,
  prefix: string,
  meshes: Mesh[],
): void {
  for (const [byMaterial, list] of groupBy(parts)) {
    const merged = Mesh.MergeMeshes(list, true, true);
    if (!merged) continue;
    merged.name = `${prefix}-${byMaterial}`;
    merged.material = m[byMaterial];
    merged.parent = parent;
    meshes.push(merged);
  }
}
