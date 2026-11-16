/**
 * Scène de test de l'étape 0 (provisoire).
 *
 * Elle valide la chaîne complète : rendu PBR, ombres, brouillard, physique
 * Havok, caméra souris/tactile, nettoyage des ressources. Elle sera
 * remplacée par le vrai monde (streaming par morceaux) aux étapes suivantes.
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { FxaaPostProcess } from '@babylonjs/core/PostProcesses/fxaaPostProcess';
import type { Scene } from '@babylonjs/core/scene';
import type { GameContext, GameSystem } from '../app/GameContext';
import { createEnvironment, type WorldEnvironment } from './environment/environment';

const GROUND_SIZE = 200;
const CRATE_SIZE = 1;
/** Au-delà, les plus anciennes caisses sont supprimées (mémoire maîtrisée). */
const MAX_CRATES = 60;

interface Crate {
  readonly mesh: Mesh;
  readonly body: PhysicsAggregate;
}

export class TestWorld implements GameSystem {
  readonly id = 'test-world';
  private scene!: Scene;
  private env!: WorldEnvironment;
  private camera!: ArcRotateCamera;
  private crateMaterial!: PBRMaterial;
  private readonly crates: Crate[] = [];
  private probe: Mesh | null = null;
  private spawnCounter = 0;

  init(ctx: GameContext): void {
    this.scene = ctx.scene;
    const profile = ctx.quality.profile;
    this.env = createEnvironment(this.scene, profile);

    // Caméra orbitale provisoire (souris : clic-glisser + molette ;
    // tactile : un doigt pour tourner, deux pour zoomer).
    this.camera = new ArcRotateCamera('camera', -Math.PI / 2.6, 1.15, 24, new Vector3(0, 1, 0), this.scene);
    this.camera.lowerRadiusLimit = 4;
    this.camera.upperRadiusLimit = 90;
    this.camera.upperBetaLimit = Math.PI / 2.05;
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.pinchDeltaPercentage = 0.004;
    this.camera.minZ = 0.1;
    this.camera.maxZ = profile.viewDistance * 1.1;
    this.camera.attachControl(true);

    if (profile.fxaa) new FxaaPostProcess('fxaa', 1, this.camera);

    this.createGround(ctx);
    this.createRamp();

    this.crateMaterial = new PBRMaterial('crate', this.scene);
    this.crateMaterial.albedoColor = new Color3(0.55, 0.36, 0.18);
    this.crateMaterial.metallic = 0;
    this.crateMaterial.roughness = 0.75;

    // Pyramide de caisses : 4 + 3 + 2 + 1
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 4 - row; i++) {
        const x = (i - (3 - row) / 2) * (CRATE_SIZE + 0.02);
        this.addCrate(new Vector3(x - 4, 0.5 + row * CRATE_SIZE, 2));
      }
    }
    // Caisse « témoin » lâchée de haut : sert aux tests automatiques.
    this.probe = this.addCrate(new Vector3(3, 20, 3)).mesh;
  }

  get crateCount(): number {
    return this.crates.length;
  }

  /** Hauteur de la caisse témoin (tests de fumée). */
  probeY(): number | null {
    return this.probe && !this.probe.isDisposed() ? this.probe.position.y : null;
  }

  /** Lâche une caisse au-dessus du point visé par la caméra. */
  spawnCrate(): void {
    const n = this.spawnCounter++;
    const offset = new Vector3(Math.sin(n * 2.4) * 1.5, 0, Math.cos(n * 2.4) * 1.5);
    const crate = this.addCrate(this.camera.target.add(offset).add(new Vector3(0, 10, 0)));
    crate.mesh.rotation.set(n * 0.7, n * 1.3, 0);
  }

  dispose(): void {
    for (const crate of this.crates.splice(0)) this.disposeCrate(crate);
  }

  private createGround(ctx: GameContext): void {
    const ground = CreateGround('ground', { width: GROUND_SIZE, height: GROUND_SIZE }, this.scene);
    const mat = new PBRMaterial('ground', this.scene);
    mat.albedoTexture = createCheckerTexture(this.scene, GROUND_SIZE / 4);
    mat.metallic = 0;
    mat.roughness = 0.95;
    if (ctx.quality.profile.id === 'high' || ctx.quality.profile.id === 'ultra') {
      mat.albedoTexture.anisotropicFilteringLevel = 8;
    }
    ground.material = mat;
    ground.receiveShadows = true;
    ground.freezeWorldMatrix(); // objet statique : Babylon ne recalcule plus sa matrice
    new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, this.scene);
  }

  private createRamp(): void {
    const ramp = CreateBox('ramp', { width: 6, height: 0.4, depth: 14 }, this.scene);
    ramp.position.set(8, 1.2, -4);
    ramp.rotation.x = -0.18;
    const mat = new PBRMaterial('concrete', this.scene);
    mat.albedoColor = new Color3(0.42, 0.41, 0.39);
    mat.metallic = 0;
    mat.roughness = 0.9;
    ramp.material = mat;
    ramp.receiveShadows = true;
    this.env.addShadowCaster(ramp);
    new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, this.scene);
  }

  private addCrate(position: Vector3): Crate {
    if (this.crates.length >= MAX_CRATES) {
      const oldest = this.crates.shift();
      if (oldest) this.disposeCrate(oldest);
    }
    const mesh = CreateBox(`crate-${this.spawnCounter}-${this.crates.length}`, { size: CRATE_SIZE }, this.scene);
    mesh.position.copyFrom(position);
    mesh.material = this.crateMaterial;
    mesh.receiveShadows = true;
    this.env.addShadowCaster(mesh);
    const body = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.BOX,
      { mass: 12, friction: 0.7, restitution: 0.15 },
      this.scene,
    );
    const crate = { mesh, body };
    this.crates.push(crate);
    return crate;
  }

  private disposeCrate(crate: Crate): void {
    this.env.removeShadowCaster(crate.mesh);
    crate.body.dispose();
    crate.mesh.dispose();
    if (crate.mesh === this.probe) this.probe = null;
  }
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
