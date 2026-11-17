/**
 * Scène de test (provisoire, remplacée plus tard par le vrai monde).
 *
 * Étape 1 : de quoi tester le joueur à pied.
 * - un garage en « blocs gris » : murs, toit bas, seuil de 15 cm à franchir ;
 * - un établi avec une caisse à outils à prendre, juste devant le départ ;
 * - une rampe (pente), une pyramide de caisses à pousser ou à porter.
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import type { Scene } from '@babylonjs/core/scene';
import type { GameContext, GameSystem } from '../app/GameContext';
import type { Interactable } from '../core/interaction/Interactable';
import { t } from '../ui/i18n';
import { createEnvironment, type WorldEnvironment } from './environment/environment';

const GROUND_SIZE = 200;
const CRATE_SIZE = 0.8;
/** Au-delà, les plus anciennes caisses sont supprimées (mémoire maîtrisée). */
const MAX_CRATES = 60;

/** Point de départ du joueur : face à l'établi, regard légèrement baissé. */
export const PLAYER_SPAWN = { position: new Vector3(0, 0, -6), yaw: 0, pitch: 0.3 } as const;

interface DynamicProp {
  readonly mesh: Mesh;
  readonly body: PhysicsAggregate;
}

interface BoxSpec {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly material: PBRMaterial;
  /** Inclinaison autour de l'axe x (radians), appliquée avant la physique. */
  readonly tiltX?: number;
}

export class TestWorld implements GameSystem {
  readonly id = 'test-world';
  private ctx!: GameContext;
  private scene!: Scene;
  private env!: WorldEnvironment;
  private materials!: Record<'concrete' | 'darkConcrete' | 'wood' | 'crate' | 'toolbox', PBRMaterial>;
  private readonly crates: DynamicProp[] = [];
  private probe: Mesh | null = null;
  private counter = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.env = createEnvironment(this.scene, ctx.quality.profile);
    this.materials = {
      concrete: pbr(this.scene, 'concrete', new Color3(0.42, 0.41, 0.39), 0.9),
      darkConcrete: pbr(this.scene, 'dark-concrete', new Color3(0.26, 0.26, 0.27), 0.95),
      wood: pbr(this.scene, 'wood', new Color3(0.42, 0.28, 0.16), 0.7),
      crate: pbr(this.scene, 'crate', new Color3(0.55, 0.36, 0.18), 0.75),
      toolbox: pbr(this.scene, 'toolbox', new Color3(0.62, 0.07, 0.05), 0.35, 0.6),
    };

    this.createGround();
    this.createRamp();
    this.createGarage();
    this.createWorkbench();

    // Pyramide de caisses : 4 + 3 + 2 + 1
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 4 - row; i++) {
        const x = (i - (3 - row) / 2) * (CRATE_SIZE + 0.02);
        this.addCrate(new Vector3(x - 4.5, CRATE_SIZE / 2 + row * CRATE_SIZE, 1));
      }
    }
    // Caisse « témoin » lâchée de haut : sert aux tests automatiques.
    this.probe = this.addCrate(new Vector3(3.5, 20, 2)).mesh;
  }

  get crateCount(): number {
    return this.crates.length;
  }

  /** Hauteur de la caisse témoin (tests de fumée). */
  probeY(): number | null {
    return this.probe && !this.probe.isDisposed() ? this.probe.position.y : null;
  }

  /** Lâche une caisse à la position donnée. */
  spawnCrate(position: Vector3): void {
    const n = this.counter;
    const crate = this.addCrate(position);
    crate.mesh.rotation.set(n * 0.7, n * 1.3, 0);
  }

  dispose(): void {
    for (const crate of this.crates.splice(0)) this.disposeProp(crate);
  }

  private createGround(): void {
    const ground = CreateGround('ground', { width: GROUND_SIZE, height: GROUND_SIZE }, this.scene);
    const mat = new PBRMaterial('ground', this.scene);
    mat.albedoTexture = createCheckerTexture(this.scene, GROUND_SIZE / 4);
    mat.metallic = 0;
    mat.roughness = 0.95;
    const profile = this.ctx.quality.profile.id;
    if (profile === 'high' || profile === 'ultra') mat.albedoTexture.anisotropicFilteringLevel = 8;
    ground.material = mat;
    ground.receiveShadows = true;
    ground.freezeWorldMatrix(); // objet statique : Babylon ne recalcule plus sa matrice
    new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, this.scene);
  }

  private createRamp(): void {
    this.staticBox({
      name: 'ramp',
      size: [5, 0.4, 12],
      position: [9, 1.0, -4],
      material: this.materials.concrete,
      tiltX: -0.2, // ≈ 11° : une pente de rue
    });
  }

  /** Garage 8 × 6 m, hauteur 2,9 m, porte de 3 m, dalle surélevée de 15 cm. */
  private createGarage(): void {
    const { concrete, darkConcrete } = this.materials;
    const cx = 0;
    const cz = 12;
    const h = 2.9;
    const wall = 0.2;
    const specs: BoxSpec[] = [
      { name: 'garage-slab', size: [8, 0.15, 6], position: [cx, 0.075, cz], material: darkConcrete },
      { name: 'garage-back', size: [8, h, wall], position: [cx, h / 2, cz + 3 - wall / 2], material: concrete },
      { name: 'garage-left', size: [wall, h, 6], position: [cx - 4 + wall / 2, h / 2, cz], material: concrete },
      { name: 'garage-right', size: [wall, h, 6], position: [cx + 4 - wall / 2, h / 2, cz], material: concrete },
      { name: 'garage-front-l', size: [2.5, h, wall], position: [cx - 2.75, h / 2, cz - 3 + wall / 2], material: concrete },
      { name: 'garage-front-r', size: [2.5, h, wall], position: [cx + 2.75, h / 2, cz - 3 + wall / 2], material: concrete },
      { name: 'garage-lintel', size: [3, 0.6, wall], position: [cx, h - 0.3, cz - 3 + wall / 2], material: concrete },
      { name: 'garage-roof', size: [8.4, 0.15, 6.4], position: [cx, h + 0.075, cz], material: darkConcrete },
      // Étagère basse au fond : pour tester l'accroupissement (passage de 1,3 m).
      { name: 'garage-shelf', size: [2.4, 0.08, 1.2], position: [cx + 2.4, 1.3, cz + 1.8], material: this.materials.wood },
    ];
    for (const spec of specs) this.staticBox(spec);
  }

  /** Établi à tiroirs (0,92 m) et caisse à outils posée dessus. */
  private createWorkbench(): void {
    const { wood, toolbox } = this.materials;
    this.staticBox({ name: 'bench-body', size: [1.8, 0.86, 0.7], position: [0, 0.43, -4], material: wood });
    this.staticBox({ name: 'bench-top', size: [1.9, 0.06, 0.8], position: [0, 0.89, -4], material: wood });

    const box = CreateBox('toolbox', { width: 0.5, height: 0.3, depth: 0.25 }, this.scene);
    box.position.set(0, 0.92 + 0.15 + 0.01, -4);
    box.material = toolbox;
    this.env.addShadowCaster(box);
    const body = new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 8, friction: 0.6, restitution: 0.05 }, this.scene);
    this.register(body, { label: t('object.toolbox'), grabbable: true });
  }

  private staticBox(spec: BoxSpec): Mesh {
    const [w, h, d] = spec.size;
    const mesh = CreateBox(spec.name, { width: w, height: h, depth: d }, this.scene);
    mesh.position.set(...spec.position);
    if (spec.tiltX) mesh.rotation.x = spec.tiltX;
    mesh.material = spec.material;
    mesh.receiveShadows = true;
    this.env.addShadowCaster(mesh);
    new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, this.scene);
    return mesh;
  }

  private addCrate(position: Vector3): DynamicProp {
    if (this.crates.length >= MAX_CRATES) {
      const oldest = this.crates.shift();
      if (oldest) this.disposeProp(oldest);
    }
    const mesh = CreateBox(`crate-${this.counter++}`, { size: CRATE_SIZE }, this.scene);
    mesh.position.copyFrom(position);
    mesh.material = this.materials.crate;
    mesh.receiveShadows = true;
    this.env.addShadowCaster(mesh);
    const body = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.BOX,
      { mass: 12, friction: 0.7, restitution: 0.15 },
      this.scene,
    );
    this.register(body, { label: t('object.crate'), grabbable: true });
    const crate = { mesh, body };
    this.crates.push(crate);
    return crate;
  }

  private register(aggregate: PhysicsAggregate, item: Interactable): void {
    this.ctx.interactables.register(aggregate.body, item);
  }

  private disposeProp(prop: DynamicProp): void {
    this.ctx.interactables.unregister(prop.body.body);
    this.env.removeShadowCaster(prop.mesh);
    prop.body.dispose();
    prop.mesh.dispose();
    if (prop.mesh === this.probe) this.probe = null;
  }
}

function pbr(scene: Scene, name: string, color: Color3, roughness: number, metallic = 0): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = color;
  mat.metallic = metallic;
  mat.roughness = roughness;
  return mat;
}

/** Damier généré en mémoire (aucun fichier à télécharger). */
function createCheckerTexture(scene: Scene, repeat: number): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('checker', { width: size, height: size }, scene, true);
  const ctx = tex.getContext();
  const half = size / 2;
  ctx.fillStyle = '#5d6b4c';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#56644a';
  ctx.fillRect(0, 0, half, half);
  ctx.fillRect(half, half, half, half);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  tex.update();
  tex.uScale = repeat;
  tex.vScale = repeat;
  return tex;
}
