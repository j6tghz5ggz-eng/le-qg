/**
 * Scène de test (provisoire, remplacée plus tard par le vrai monde).
 *
 * Étape 1 : de quoi tester le joueur à pied.
 * - un garage en « blocs gris » : murs, toit bas, seuil de 15 cm à franchir ;
 * - un établi avec une caisse à outils à prendre, juste devant le départ ;
 * - une rampe (pente), une pyramide de caisses à pousser ou à porter.
 * Étapes 2 à 4 : un garage avec la moto et un établi, une route d'essai, et
 * une colline (montée et descente à 6,25 %) pour vérifier les vitesses.
 */
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShapeBox } from '@babylonjs/core/Physics/v2/physicsShape';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PhysicsMotionType, PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import type { Scene } from '@babylonjs/core/scene';
import type { GameContext, GameSystem } from '../app/GameContext';
import type { Interactable } from '../core/interaction/Interactable';
import { t } from '../ui/i18n';
import { createEnvironment, type WorldEnvironment } from './environment/environment';

const GROUND_SIZE = 400;
const CRATE_SIZE = 0.8;
/** Au-delà, les plus anciennes caisses sont supprimées (mémoire maîtrisée). */
const MAX_CRATES = 60;

/** Point de départ du joueur : face à l'établi, regard légèrement baissé. */
export const PLAYER_SPAWN = { position: new Vector3(0, 0, -6), yaw: 0, pitch: 0.3 } as const;

/** Le supermotard, garé dans le garage (sur la dalle), face à la porte. */
export const BIKE_SPAWN = { position: new Vector3(0.95, 0.15, 12.4), yaw: Math.PI } as const;

/** Garage : centre, porte (largeur 3,4 m) côté -z. */
export const GARAGE = { x: 0, z: 12, doorWidth: 3.4, height: 2.9 } as const;

/** Emplacements des pièces de rechange posées sur l'établi du garage. */
export const SPARE_PART_SPOTS = [
  new Vector3(-3.42, 1.2, 10.95),
  new Vector3(-3.42, 1.2, 11.5),
  // Le pot (80 cm) s'étend vers -z et vers +x depuis sa bride.
  new Vector3(-3.62, 1.22, 13.2),
  // La cartouche (45 cm) s'étend vers -z depuis son entrée.
  new Vector3(-3.42, 1.16, 12.35),
] as const;

/** Bureau avec l'ordinateur (boutique en ligne), contre le mur droit du garage. */
export const COMPUTER_DESK = { x: 3.5, z: 11.3, height: 0.75 } as const;

/** Jerrican et bidon d'huile de départ : au fond du garage, et sur l'étagère. */
export const CONTAINER_SPOTS = {
  jerrican: new Vector3(-3.3, 0.35, 14.2),
  oil: new Vector3(2.55, 1.45, 13.9),
} as const;

/** Palette où arrivent les colis (pièces achetées), près de la porte. */
export const DELIVERY_SPOT = new Vector3(2.55, 0.15 + 0.12, 9.85);

/** Intérieur du garage (pour la revente des pièces qui y traînent). */
export const GARAGE_BOUNDS = { minX: -4, maxX: 4, minZ: 9, maxZ: 15 } as const;

/** Colline d'essai, axe z en x = 30 : montée de 80 m (+5 m), plateau de 20 m, descente de 80 m. */
export const HILL = { x: 30, width: 8, zStart: 0, rampLength: 80, plateau: 20, height: 5 } as const;

/** Lieux de téléportation (onglet DEV). `position` = pieds au sol. */
export const TELEPORT_POINTS: ReadonlyArray<{ readonly id: string; readonly label: string; readonly position: Vector3; readonly yaw: number }> = [
  { id: 'start', label: 'Départ', position: PLAYER_SPAWN.position, yaw: 0 },
  { id: 'garage', label: 'Garage (moto)', position: new Vector3(-0.8, 0.15, 11.0), yaw: 0.9 },
  { id: 'bench', label: 'Établi du garage', position: new Vector3(-2.4, 0.15, 12.0), yaw: -Math.PI / 2 },
  { id: 'computer', label: 'Ordinateur (boutique)', position: new Vector3(2.5, 0.15, 11.3), yaw: Math.PI / 2 },
  { id: 'road', label: "Route d'essai", position: new Vector3(-14, 0, -12), yaw: 0 },
  { id: 'hill-foot', label: 'Pied de la colline', position: new Vector3(HILL.x, 0, -12), yaw: 0 },
  { id: 'hill-top', label: 'Sommet de la colline', position: new Vector3(HILL.x, HILL.height, HILL.zStart + HILL.rampLength + 4), yaw: 0 },
];

/** Route d'essai : axe x, de z = -20 à z = 180. */
const ROAD = { x: -14, width: 7, zStart: -20, zEnd: 180 } as const;

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
  private materials!: Record<'concrete' | 'darkConcrete' | 'wood' | 'crate' | 'toolbox' | 'cone', PBRMaterial>;
  private readonly crates: DynamicProp[] = [];
  private probe: Mesh | null = null;
  private counter = 0;
  /** Appelé quand le joueur utilise l'ordinateur du garage (ouvre la boutique). */
  onComputer: (() => void) | null = null;

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
      cone: pbr(this.scene, 'cone', new Color3(0.95, 0.32, 0.05), 0.6),
    };

    this.createGround();
    this.createRamp();
    this.createGarage();
    this.createWorkbench();
    this.createRoad();
    this.createHill();

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

  /** La zone d'ombre suit la caméra. */
  update(): void {
    const camera = this.scene.activeCamera;
    if (camera) this.env.follow(camera.globalPosition);
  }

  /** Ombres : utilisé par les véhicules. */
  get environment(): WorldEnvironment {
    return this.env;
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
    // Collision : un bloc épais (1 m) sous le sol plutôt qu'un plan sans
    // épaisseur, que les petits objets rapides pourraient traverser.
    // (Volume physique seul, sans modèle 3D.)
    const collider = new TransformNode('ground-collider', this.scene);
    collider.position.y = -0.5;
    const body = new PhysicsBody(collider, PhysicsMotionType.STATIC, false, this.scene);
    body.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(GROUND_SIZE, 1, GROUND_SIZE), this.scene);
    body.shape.material = { friction: 0.9, restitution: 0 };
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

  /** Garage 8 × 6 m, hauteur 2,9 m, porte de 3,4 m, dalle surélevée de 15 cm. */
  private createGarage(): void {
    const { concrete, darkConcrete, wood } = this.materials;
    const cx = GARAGE.x;
    const cz = GARAGE.z;
    const h = GARAGE.height;
    const wall = 0.2;
    const door = GARAGE.doorWidth;
    const side = (8 - door) / 2; // largeur de chaque pan de façade
    const specs: BoxSpec[] = [
      { name: 'garage-slab', size: [8, 0.15, 6], position: [cx, 0.075, cz], material: darkConcrete },
      { name: 'garage-back', size: [8, h, wall], position: [cx, h / 2, cz + 3 - wall / 2], material: concrete },
      { name: 'garage-left', size: [wall, h, 6], position: [cx - 4 + wall / 2, h / 2, cz], material: concrete },
      { name: 'garage-right', size: [wall, h, 6], position: [cx + 4 - wall / 2, h / 2, cz], material: concrete },
      { name: 'garage-front-l', size: [side, h, wall], position: [cx - 4 + side / 2, h / 2, cz - 3 + wall / 2], material: concrete },
      { name: 'garage-front-r', size: [side, h, wall], position: [cx + 4 - side / 2, h / 2, cz - 3 + wall / 2], material: concrete },
      { name: 'garage-lintel', size: [door, 0.6, wall], position: [cx, h - 0.3, cz - 3 + wall / 2], material: concrete },
      { name: 'garage-roof', size: [8.4, 0.15, 6.4], position: [cx, h + 0.075, cz], material: darkConcrete },
      // Étagère basse au fond à droite : passage de 1,3 m (accroupi).
      { name: 'garage-shelf', size: [1.8, 0.08, 1.0], position: [cx + 2.9, 1.3, cz + 1.9], material: wood },
      // Établi le long du mur gauche (pièces de rechange posées dessus).
      { name: 'garage-bench', size: [0.7, 0.86, 2.6], position: [cx - 3.45, 0.15 + 0.43, cz], material: wood },
      { name: 'garage-bench-top', size: [0.8, 0.05, 2.7], position: [cx - 3.42, 0.15 + 0.885, cz], material: darkConcrete },
    ];
    for (const spec of specs) this.staticBox(spec);
    this.createGarageLight();
    this.createComputerDesk();
    this.createDeliveryPallet();
  }

  /** Bureau, ordinateur portable allumé (écran « Bécane Shop »), chaise. */
  private createComputerDesk(): void {
    const { x, z, height } = COMPUTER_DESK;
    const floor = 0.15;
    const { wood } = this.materials;
    this.staticBox({ name: 'desk-top', size: [0.6, 0.04, 1.1], position: [x, floor + height, z], material: wood });
    for (const dz of [-0.5, 0.5]) {
      this.staticBox({ name: 'desk-leg', size: [0.56, height - 0.02, 0.04], position: [x, floor + (height - 0.02) / 2, z + dz], material: wood });
    }
    const top = floor + height + 0.02;
    // Ordinateur portable : base + écran incliné tourné vers l'intérieur du garage (-x).
    const base = CreateBox('laptop-base', { width: 0.24, height: 0.018, depth: 0.34 }, this.scene);
    base.position.set(x - 0.05, top + 0.009, z);
    base.material = pbr(this.scene, 'laptop', new Color3(0.12, 0.12, 0.13), 0.4, 0.6);
    const screen = CreateBox('laptop-screen', { width: 0.012, height: 0.22, depth: 0.34 }, this.scene);
    screen.position.set(x + 0.07, top + 0.12, z);
    screen.rotation.z = -0.2; // l'écran penche vers l'arrière (loin de l'utilisateur)
    screen.material = base.material;
    // Écran : plan tourné vers l'intérieur du garage, incliné comme l'écran.
    const display = CreatePlane('laptop-display', { width: 0.31, height: 0.19 }, this.scene);
    display.position.set(x + 0.062, top + 0.12, z);
    display.rotation.set(0.2, Math.PI / 2, 0);
    display.material = shopScreenMaterial(this.scene);
    for (const mesh of [base, screen, display]) {
      mesh.receiveShadows = true;
      this.env.addShadowCaster(mesh);
    }
    // Volume cliquable couvrant tout l'ordinateur.
    const hit = new TransformNode('laptop-hit', this.scene);
    hit.position.set(x, top + 0.11, z);
    const body = new PhysicsBody(hit, PhysicsMotionType.STATIC, false, this.scene);
    body.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.3, 0.24, 0.38), this.scene);
    this.ctx.interactables.register(body, {
      label: t('object.computer'),
      useLabel: t('object.openShop'),
      use: () => this.onComputer?.(),
    });
  }

  /** Palette de livraison (les colis arrivent dessus). */
  private createDeliveryPallet(): void {
    const { wood } = this.materials;
    const p = DELIVERY_SPOT;
    for (const dx of [-0.32, 0, 0.32]) {
      this.staticBox({ name: 'pallet-board', size: [0.12, 0.025, 0.8], position: [p.x + dx, 0.15 + 0.11, p.z], material: wood });
    }
    for (const dz of [-0.34, 0, 0.34]) {
      this.staticBox({ name: 'pallet-block', size: [0.8, 0.09, 0.1], position: [p.x, 0.15 + 0.045, p.z + dz], material: wood });
    }
  }

  /** Plafonnier (point lumineux) et interrupteur à côté de la porte. */
  private createGarageLight(): void {
    const light = new PointLight('garage-light', new Vector3(GARAGE.x, GARAGE.height - 0.25, GARAGE.z), this.scene);
    light.intensity = 14;
    light.range = 10;
    light.diffuse = new Color3(1, 0.93, 0.8);
    const fixture = CreateBox('garage-lamp', { width: 1.2, height: 0.05, depth: 0.12 }, this.scene);
    fixture.position.set(GARAGE.x, GARAGE.height - 0.05, GARAGE.z);
    const glow = new PBRMaterial('lamp-glow', this.scene);
    glow.albedoColor = new Color3(1, 1, 1);
    glow.emissiveColor = new Color3(1, 0.95, 0.85);
    fixture.material = glow;

    const sw = CreateBox('garage-switch', { width: 0.09, height: 0.13, depth: 0.03 }, this.scene);
    sw.position.set(GARAGE.x - GARAGE.doorWidth / 2 - 0.3, 1.35, GARAGE.z - 3 + 0.22);
    sw.material = pbr(this.scene, 'switch', new Color3(0.85, 0.84, 0.8), 0.5);
    const body = new PhysicsAggregate(sw, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
    let on = true;
    this.register(body, {
      label: t('object.lightSwitch'),
      useLabel: t('object.lightOff'),
      use: () => {
        on = !on;
        // Intensité à 0 plutôt que désactiver la lampe : pas de recompilation des shaders.
        light.intensity = on ? 14 : 0;
        glow.emissiveColor = on ? new Color3(1, 0.95, 0.85) : new Color3(0.05, 0.05, 0.05);
      },
    });
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

  /** Route d'essai avec marquage et slalom de plots renversables. */
  private createRoad(): void {
    const length = ROAD.zEnd - ROAD.zStart;
    const road = CreateGround('road', { width: ROAD.width, height: length }, this.scene);
    road.position.set(ROAD.x, 0.01, (ROAD.zStart + ROAD.zEnd) / 2);
    const mat = new PBRMaterial('asphalt', this.scene);
    mat.albedoTexture = createRoadTexture(this.scene, length / 8);
    mat.metallic = 0;
    mat.roughness = 0.85;
    road.material = mat;
    road.receiveShadows = true;
    road.freezeWorldMatrix();
    road.isPickable = false;

    for (let i = 0; i < 10; i++) {
      const cone = CreateCylinder(`cone-${i}`, { diameterTop: 0.04, diameterBottom: 0.3, height: 0.5, tessellation: 12 }, this.scene);
      cone.position.set(ROAD.x + (i % 2 === 0 ? -0.9 : 0.9), 0.25, 15 + i * 9);
      cone.material = this.materials.cone;
      this.env.addShadowCaster(cone);
      const body = new PhysicsAggregate(cone, PhysicsShapeType.CYLINDER, { mass: 1.5, friction: 0.7, restitution: 0.2 }, this.scene);
      this.register(body, { label: t('object.cone'), grabbable: true });
    }
  }

  /** Colline : deux pentes et un plateau (boîtes inclinées, 1 m d'épaisseur). */
  private createHill(): void {
    const { x, width, zStart, rampLength, plateau, height } = HILL;
    const slope = Math.atan2(height, rampLength);
    const length = Math.hypot(rampLength, height);
    const thick = 1;
    const material = this.materials.darkConcrete;
    const down = zStart + rampLength + plateau;
    // Centre de la boîte = milieu de la face du dessus, reculé d'une demi-épaisseur le long de la normale.
    this.staticBox({
      name: 'hill-up',
      size: [width, thick, length],
      position: [x, height / 2 - (thick / 2) * Math.cos(slope), zStart + rampLength / 2 + (thick / 2) * Math.sin(slope)],
      material,
      tiltX: -slope,
    });
    this.staticBox({ name: 'hill-top', size: [width, thick, plateau], position: [x, height - thick / 2, zStart + rampLength + plateau / 2], material });
    this.staticBox({
      name: 'hill-down',
      size: [width, thick, length],
      position: [x, height / 2 - (thick / 2) * Math.cos(slope), down + rampLength / 2 - (thick / 2) * Math.sin(slope)],
      material,
      tiltX: slope,
    });
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

/** Asphalte avec ligne centrale discontinue, généré en mémoire. */
function createRoadTexture(scene: Scene, repeat: number): DynamicTexture {
  const w = 128;
  const h = 256;
  const tex = new DynamicTexture('road', { width: w, height: h }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = '#2b2c2e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d8d6cf';
  ctx.fillRect(w / 2 - 2, 0, 4, h / 2); // pointillé central
  ctx.fillRect(4, 0, 3, h); // bords
  ctx.fillRect(w - 7, 0, 3, h);
  tex.update();
  tex.vScale = repeat;
  return tex;
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

/** Écran de l'ordinateur : page d'accueil de la boutique (texture dessinée). */
function shopScreenMaterial(scene: Scene): PBRMaterial {
  const tex = new DynamicTexture('shop-screen', { width: 256, height: 160 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#10151d';
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = '#ffb020';
  ctx.fillRect(0, 0, 256, 34);
  ctx.fillStyle = '#111';
  ctx.font = 'italic 900 24px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BÉCANE SHOP', 128, 25);
  ctx.fillStyle = '#e8eaed';
  ctx.font = '700 15px Arial, sans-serif';
  ctx.fillText('Pièces 50 cm³', 128, 66);
  ctx.fillStyle = '#9aa4b2';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText('Livraison au garage', 128, 92);
  ctx.fillStyle = '#ffb020';
  ctx.fillRect(78, 112, 100, 28);
  ctx.fillStyle = '#111';
  ctx.font = '700 14px Arial, sans-serif';
  ctx.fillText('Commander', 128, 131);
  tex.update();
  const mat = new PBRMaterial('shop-screen', scene);
  mat.albedoTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.9, 0.9, 0.9);
  mat.metallic = 0;
  mat.roughness = 0.2;
  return mat;
}
