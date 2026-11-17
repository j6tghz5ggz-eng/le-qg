/**
 * Modèles 3D provisoires des pièces, construits à partir de leur fiche
 * (forme, taille, couleur). Le même modèle sert pour la pièce montée sur la
 * moto, la pièce posée dans le monde et le « fantôme » de remontage.
 * L'origine du modèle est le point d'ancrage de la pièce.
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { PartDefinition } from './parts';

const materials = new Map<string, PBRMaterial>();

/** Matériaux partagés par couleur (peu de shaders différents). */
function materialFor(scene: Scene, color: readonly [number, number, number], metallic = 0): PBRMaterial {
  const key = `${color.join(',')}|${metallic}`;
  let mat = materials.get(key);
  if (!mat || mat.getScene() !== scene) {
    mat = new PBRMaterial(`part-${materials.size}`, scene);
    mat.albedoColor = new Color3(...color);
    mat.metallic = metallic;
    mat.roughness = metallic > 0 ? 0.4 : 0.6;
    materials.set(key, mat);
  }
  return mat;
}

let ghostMaterial: PBRMaterial | null = null;

/** Matériau translucide du fantôme (« pose la pièce ici »). */
export function getGhostMaterial(scene: Scene): PBRMaterial {
  if (!ghostMaterial || ghostMaterial.getScene() !== scene) {
    ghostMaterial = new PBRMaterial('part-ghost', scene);
    ghostMaterial.albedoColor = new Color3(1, 0.7, 0.15);
    ghostMaterial.emissiveColor = new Color3(0.6, 0.38, 0.05);
    ghostMaterial.alpha = 0.4;
    ghostMaterial.metallic = 0;
    ghostMaterial.roughness = 1;
  }
  return ghostMaterial;
}

function tube(scene: Scene, name: string, from: Vector3, to: Vector3, diameter: number): Mesh {
  const mesh = CreateCylinder(name, { diameter, height: Vector3.Distance(from, to), tessellation: 12 }, scene);
  mesh.position = Vector3.Center(from, to);
  // Le cylindre est construit le long de y : on l'oriente de `from` vers `to`.
  const direction = to.subtract(from).normalize();
  mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, new Quaternion());
  return mesh;
}

/** Pot de détente : coude, ventre, cône, puis silencieux remontant sous la selle (côté droit). */
function createExhaust(scene: Scene, def: PartDefinition, color: readonly number[], silencer: readonly number[]): Mesh {
  const p = [
    new Vector3(0, 0, 0),
    new Vector3(0.03, -0.1, 0.1),
    new Vector3(0.07, -0.28, 0.06),
    new Vector3(0.12, -0.33, -0.2),
    new Vector3(0.15, -0.22, -0.5),
    new Vector3(0.16, 0.08, -0.76),
    new Vector3(0.17, 0.2, -1.0),
  ];
  const diameters = [0.045, 0.06, 0.1, 0.09, 0.05, 0.085];
  const pipe: Mesh[] = [];
  for (let i = 0; i < 5; i++) pipe.push(tube(scene, `${def.id}-${i}`, p[i]!, p[i + 1]!, diameters[i]!));
  const can = tube(scene, `${def.id}-silencer`, p[5]!, p[6]!, diameters[5]!);
  const pipeMesh = Mesh.MergeMeshes(pipe, true, true)!;
  pipeMesh.material = materialFor(scene, color as [number, number, number], 0.2);
  can.material = materialFor(scene, silencer as [number, number, number], 0.2);
  const merged = Mesh.MergeMeshes([pipeMesh, can], true, true, undefined, false, true)!;
  merged.name = def.id;
  return merged;
}

/** Crée le modèle d'une pièce (origine = point d'ancrage). */
export function createPartMesh(scene: Scene, def: PartDefinition): Mesh {
  const v = def.visual;
  let mesh: Mesh;
  switch (v.kind) {
    case 'box':
      mesh = CreateBox(def.id, { width: v.size[0], height: v.size[1], depth: v.size[2] }, scene);
      mesh.material = materialFor(scene, v.color, v.metallic ?? 0);
      break;
    case 'cylinder':
      mesh = CreateCylinder(def.id, { diameter: v.diameter, height: v.height, tessellation: 16 }, scene);
      if (v.axis === 'x') mesh.rotation.z = Math.PI / 2;
      if (v.axis === 'z') mesh.rotation.x = Math.PI / 2;
      mesh.material = materialFor(scene, v.color, v.metallic ?? 0);
      // Fige la rotation dans la géométrie : la pièce garde son orientation partout.
      mesh.bakeCurrentTransformIntoVertices();
      break;
    case 'exhaust':
      mesh = createExhaust(scene, def, v.color, v.silencerColor);
      break;
  }
  mesh.receiveShadows = true;
  return mesh;
}
