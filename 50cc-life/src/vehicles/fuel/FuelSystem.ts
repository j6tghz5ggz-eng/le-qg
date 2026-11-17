/**
 * Carburant des motos : réservoirs, jerricans et bidons d'huile.
 *
 * - Chaque moto a son réservoir (fiche du modèle : contenance, réserve,
 *   mélange ou graissage séparé). Le moteur y puise selon son débit ; sans
 *   essence, il s'arrête (panne sèche).
 * - Jerrican (5 L d'essence) et bidon d'huile 2T (1 L) sont des objets
 *   physiques : on les porte jusqu'au bouchon et on maintient Utiliser
 *   pour verser. Le niveau et le pourcentage du mélange s'affichent en
 *   direct : au joueur de doser (2 % = 20 ml d'huile par litre).
 * - Le graissage reçu par le moteur sert à l'usure (voir mechanics/wear.ts).
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { Scene } from '@babylonjs/core/scene';
import type { GameContext, GameSystem } from '../../app/GameContext';
import type { HoldAction } from '../../core/interaction/Interactable';
import type { ShopSystem } from '../../economy/ShopSystem';
import type { InteractionSystem } from '../../player/interaction/InteractionSystem';
import type { PlayerController } from '../../player/PlayerController';
import { t } from '../../ui/i18n';
import type { Bike } from '../bike/Bike';
import type { ShadowHost, VehicleSystem } from '../VehicleSystem';
import { FuelTank, type FuelLevels } from './FuelTank';

export type ContainerKind = 'jerrican' | 'oil';

export interface SavedContainer {
  readonly kind: ContainerKind;
  /** Contenu (L). */
  readonly amount: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface Container {
  readonly kind: ContainerKind;
  amount: number;
  readonly mesh: Mesh;
  readonly aggregate: PhysicsAggregate;
}

/** Contenance des contenants (L). */
export const CONTAINER_CAPACITY: Readonly<Record<ContainerKind, number>> = { jerrican: 5, oil: 1 };
/** Débits de remplissage (L/s) : un jerrican coule vite, l'huile se dose. */
const POUR_FUEL = 0.6;
const POUR_OIL_PREMIX = 0.025;
const POUR_OIL_TANK = 0.06;
/** Distance max entre le contenant porté et le bouchon (m). */
const POUR_DISTANCE = 0.6;
const HUD_HZ = 4;

/** Produits de la boutique (identifiants). */
export const FUEL_PRODUCTS = {
  jerrican: 'jerrican-5l',
  oil: 'oil-2t-1l',
} as const;

const liters = (l: number): string => `${l.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} L`;
const percent = (r: number): string => `${(r * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

export class FuelSystem implements GameSystem {
  readonly id = 'fuel';
  private ctx!: GameContext;
  private readonly tanks = new Map<Bike, FuelTank>();
  private readonly containers = new Map<PhysicsBody, Container>();
  private hudTimer = 0;
  /** Dernier versement (pour le son « glouglou »). */
  private lastPour: { kind: ContainerKind; at: number } | null = null;
  /**
   * Action « verser » en cours : la même instance tant que le même bidon
   * vise le même bouchon (sinon l'action maintenue repartirait de zéro).
   */
  private pourCache: { readonly container: Container; readonly key: string; readonly action: HoldAction } | null = null;
  private readonly materials = new Map<string, PBRMaterial>();

  constructor(
    private readonly vehicles: VehicleSystem,
    private readonly interaction: InteractionSystem,
    private readonly player: PlayerController,
    private readonly shadows: ShadowHost,
    private readonly starting: ReadonlyArray<{ kind: ContainerKind; amount: number; position: Vector3 }>,
  ) {}

  init(ctx: GameContext): void {
    this.ctx = ctx;
    for (const bike of this.vehicles.bikes) {
      const spec = bike.spec.fuel;
      // Nouvelle partie : un fond de réservoir (et d'huile), au bon dosage.
      const fuel = spec.tankLiters * 0.4;
      const premix = spec.lubrication.kind === 'premix' ? fuel * spec.lubrication.ratio : 0;
      const oil = spec.lubrication.kind === 'injection' ? spec.lubrication.oilTankLiters * 0.6 : 0;
      this.tanks.set(bike, new FuelTank(spec, { fuel, premixOil: premix, oilTank: oil }));
    }
    this.vehicles.detailProvider = (bike) => this.summary(bike);
    for (const c of this.starting) this.spawnContainer(c.kind, c.amount, c.position);
    this.registerCheats();
  }

  /** Branche les produits sur la boutique (jerrican, huile). */
  attachShop(shop: ShopSystem): void {
    shop.addProduct({
      id: FUEL_PRODUCTS.jerrican,
      section: 'Carburant et huile',
      name: 'Jerrican d’essence SP95 (5 L)',
      detail: 'Plein, livré avec le bec verseur',
      price: 10,
      deliver: (position) => this.spawnContainer('jerrican', CONTAINER_CAPACITY.jerrican, position),
    });
    shop.addProduct({
      id: FUEL_PRODUCTS.oil,
      section: 'Carburant et huile',
      name: 'Huile 2T synthèse OLÉO (1 L)',
      detail: 'Mélange : 2 % = 20 ml par litre d’essence',
      price: 13,
      deliver: (position) => this.spawnContainer('oil', CONTAINER_CAPACITY.oil, position),
    });
  }

  /** Ce qu'on est en train de verser (null sinon), pour le son. */
  get pouringKind(): ContainerKind | null {
    return this.lastPour && performance.now() - this.lastPour.at < 150 ? this.lastPour.kind : null;
  }

  tankOf(bike: Bike): FuelTank | undefined {
    return this.tanks.get(bike);
  }

  /** Graissage reçu par le moteur de cette moto (rapport huile / essence). */
  lubricationOf(bike: Bike): number {
    return this.tanks.get(bike)?.lubrication ?? 0.02;
  }

  fixedUpdate(dt: number): void {
    for (const [bike, tank] of this.tanks) {
      const pt = bike.powertrain;
      if (pt.running) {
        const result = tank.consume(dt, pt.fuelFlowLph, pt.throttle);
        if (result.starved) {
          pt.setFuelSupply(false);
          if (bike === this.vehicles.current) this.ctx.bus.emit('ui:notice', { message: t('fuel.empty') });
        }
      } else {
        pt.setFuelSupply(tank.fuel > 0.02);
      }
    }
  }

  update(dt: number): void {
    const bike = this.vehicles.current;
    if (!bike) return;
    this.hudTimer += dt;
    if (this.hudTimer < 1 / HUD_HZ) return;
    this.hudTimer = 0;
    const tank = this.tanks.get(bike);
    if (!tank) return;
    this.ctx.bus.emit('vehicle:fuel', {
      fraction: tank.volume / tank.spec.tankLiters,
      reserve: tank.onReserve,
      oilLow: tank.injection ? tank.oilTank < 0.15 : null,
    });
  }

  // --- Sauvegarde ----------------------------------------------------------

  exportState(): { fluids: FuelLevels | null; containers: SavedContainer[] } {
    const bike = this.vehicles.bikes[0];
    const tank = bike ? this.tanks.get(bike) : undefined;
    const containers = [...this.containers.values()].map((c) => {
      const p = c.mesh.getAbsolutePosition();
      return { kind: c.kind, amount: c.amount, x: p.x, y: p.y, z: p.z };
    });
    return { fluids: tank ? tank.levels : null, containers };
  }

  importState(fluids: FuelLevels | null, containers: readonly SavedContainer[]): void {
    const bike = this.vehicles.bikes[0];
    if (bike && fluids) this.tanks.set(bike, new FuelTank(bike.spec.fuel, fluids));
    if (this.interaction.isHolding) this.interaction.dropHeld();
    for (const c of [...this.containers.values()]) this.disposeContainer(c);
    for (const c of containers) this.spawnContainer(c.kind, c.amount, new Vector3(c.x, c.y + 0.03, c.z));
  }

  /** Colis en route vers la palette, pour la sauvegarde. */
  savedDelivery(productId: string, position: Vector3): SavedContainer | null {
    if (productId === FUEL_PRODUCTS.jerrican) return { kind: 'jerrican', amount: CONTAINER_CAPACITY.jerrican, x: position.x, y: position.y, z: position.z };
    if (productId === FUEL_PRODUCTS.oil) return { kind: 'oil', amount: CONTAINER_CAPACITY.oil, x: position.x, y: position.y, z: position.z };
    return null;
  }

  // --- Niveaux (textes) -----------------------------------------------------

  /** Résumé affiché en visant la moto : niveaux d'essence et d'huile. */
  private summary(bike: Bike): string | null {
    const tank = this.tanks.get(bike);
    if (!tank) return null;
    const fuel = `${t('fuel.fuel')} ${liters(tank.volume)} / ${liters(tank.spec.tankLiters)}`;
    if (tank.injection) return `${fuel} · ${t('fuel.oil')} ${liters(tank.oilTank)} / ${liters(tank.oilTankCapacity)}`;
    return `${fuel} · ${t('fuel.mix')} ${percent(tank.mixRatio)}`;
  }

  // --- Contenants --------------------------------------------------------------

  spawnContainer(kind: ContainerKind, amount: number, position: Vector3): void {
    const mesh = kind === 'jerrican' ? this.jerricanMesh() : this.oilMesh();
    mesh.position.copyFrom(position);
    mesh.receiveShadows = true;
    this.shadows.addShadowCaster(mesh);
    const bounds = mesh.getBoundingInfo().boundingBox;
    const mass = kind === 'jerrican' ? 0.9 + 0.74 * amount : 0.12 + 0.88 * amount;
    const aggregate = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.BOX,
      { mass: Math.max(mass, 0.25), friction: 0.8, restitution: 0.05, center: bounds.center.clone(), extents: bounds.extendSize.scale(2) },
      this.ctx.scene,
    );
    const container: Container = { kind, amount: Math.min(Math.max(amount, 0), CONTAINER_CAPACITY[kind]), mesh, aggregate };
    this.ctx.impacts.watch(aggregate.body, 'plastic');
    this.containers.set(aggregate.body, container);
    this.ctx.interactables.register(aggregate.body, {
      get label() {
        const name = kind === 'jerrican' ? t('fuel.jerrican') : t('fuel.oilBottle');
        return `${name} (${liters(container.amount)})`;
      },
      grabbable: true,
      installTarget: () => this.pourAction(container),
    });
  }

  private disposeContainer(c: Container): void {
    this.ctx.interactables.unregister(c.aggregate.body);
    this.containers.delete(c.aggregate.body);
    c.aggregate.dispose();
    c.mesh.dispose();
  }

  /** Action « verser » si le contenant porté est près d'un bouchon de moto. */
  private pourAction(c: Container): HoldAction | null {
    const found = this.findPour(c);
    if (!found) {
      this.pourCache = null;
      return null;
    }
    if (this.pourCache?.container === c && this.pourCache.key === found.key) return this.pourCache.action;
    const action = found.create();
    this.pourCache = { container: c, key: found.key, action };
    return action;
  }

  private findPour(c: Container): { key: string; create: () => HoldAction } | null {
    const position = c.mesh.getAbsolutePosition();
    let index = 0;
    for (const [bike, tank] of this.tanks) {
      index++;
      const spec = bike.spec.fuel;
      if (Vector3.Distance(position, this.capWorld(bike, spec.fuelCap)) < POUR_DISTANCE) {
        // Le réservoir peut avoir été remplacé (triche, chargement) : on lit toujours le courant.
        const current = (): FuelTank => this.tanks.get(bike) ?? tank;
        if (c.kind === 'jerrican') {
          return {
            key: `${index}|fuel`,
            create: () => this.pour(c, t('fuel.pourFuel'), POUR_FUEL, (l) => current().addFuel(l), () => current().volume / current().spec.tankLiters, () => this.fuelDetail(current())),
          };
        }
        return {
          key: `${index}|premix`,
          create: () => this.pour(c, t('fuel.pourPremix'), POUR_OIL_PREMIX, (l) => current().addPremixOil(l), () => current().volume / current().spec.tankLiters, () => this.fuelDetail(current())),
        };
      }
      if (spec.oilCap && c.kind === 'oil' && Vector3.Distance(position, this.capWorld(bike, spec.oilCap)) < POUR_DISTANCE) {
        return { key: `${index}|oil`, create: () => this.pour(
          c,
          t('fuel.pourOilTank'),
          POUR_OIL_TANK,
          (l) => tank.addOil(l),
          () => tank.oilTank / tank.oilTankCapacity,
          () => `${t('fuel.oilTank')} ${liters(tank.oilTank)} / ${liters(tank.oilTankCapacity)}`,
        ) };
      }
    }
    return null;
  }

  private fuelDetail(tank: FuelTank): string {
    const level = `${t('fuel.tank')} ${liters(tank.volume)} / ${liters(tank.spec.tankLiters)}`;
    if (tank.injection) return `${level} · ${tank.premixOil > 0.001 ? `${t('fuel.mix')} ${percent(tank.mixRatio)} (${t('fuel.separateNotNeeded')})` : t('fuel.noOilNeeded')}`;
    return `${level} · ${t('fuel.mix')} ${percent(tank.mixRatio)} (${t('fuel.advised')} ${percent(tank.nominalRatio)})`;
  }

  private pour(
    c: Container,
    label: string,
    rate: number,
    add: (liters: number) => number,
    fill: () => number,
    detail: () => string,
  ): HoldAction {
    return {
      label,
      get detail() {
        return `${detail()} · ${c.kind === 'jerrican' ? t('fuel.jerrican') : t('fuel.oilBottle')} ${liters(c.amount)}`;
      },
      seconds: 1,
      blocker: () => (c.amount <= 0.001 ? t('fuel.containerEmpty') : null),
      tick: (dt) => {
        const accepted = add(Math.min(rate * dt, c.amount));
        c.amount = Math.max(0, c.amount - accepted);
        if (accepted > 0) this.lastPour = { kind: c.kind, at: performance.now() };
        return accepted > 1e-7 && c.amount > 0.001;
      },
      progress: fill,
      complete: () => {},
    };
  }

  private capWorld(bike: Bike, local: readonly [number, number, number]): Vector3 {
    const root = bike.visual.root;
    root.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(Vector3.FromArray(local), root.getWorldMatrix());
  }

  private registerCheats(): void {
    const cheats = this.ctx.cheats;
    const target = (): Bike | undefined => this.vehicles.current ?? this.vehicles.bikes[0];
    cheats.add('Carburant', {
      kind: 'action',
      id: 'fuel-fill',
      label: 'Plein (huile au bon dosage)',
      run: () => {
        const bike = target();
        const tank = bike && this.tanks.get(bike);
        if (!bike || !tank) return;
        const l = bike.spec.fuel.lubrication;
        const fuel = l.kind === 'premix' ? bike.spec.fuel.tankLiters / (1 + l.ratio) : bike.spec.fuel.tankLiters;
        this.tanks.set(bike, new FuelTank(bike.spec.fuel, { fuel, premixOil: l.kind === 'premix' ? fuel * l.ratio : 0, oilTank: l.kind === 'injection' ? l.oilTankLiters : 0 }));
      },
    });
    cheats.add('Carburant', {
      kind: 'action',
      id: 'fuel-empty',
      label: 'Vider le réservoir',
      run: () => {
        const bike = target();
        const tank = bike && this.tanks.get(bike);
        if (!bike || !tank) return;
        this.tanks.set(bike, new FuelTank(bike.spec.fuel, { fuel: 0, premixOil: 0, oilTank: tank.oilTank }));
        bike.powertrain.setFuelSupply(false);
      },
    });
    for (const kind of ['jerrican', 'oil'] as const) {
      cheats.add('Carburant', {
        kind: 'action',
        id: `spawn-${kind}`,
        label: kind === 'jerrican' ? 'Jerrican plein devant moi' : 'Huile 2T devant moi',
        run: () => {
          const eye = this.player.getEyePosition(new Vector3());
          const forward = this.player.getForward(new Vector3());
          forward.y = 0;
          if (forward.lengthSquared() < 1e-4) forward.set(0, 0, 1);
          forward.normalize();
          this.spawnContainer(kind, CONTAINER_CAPACITY[kind], eye.addInPlace(forward.scaleInPlace(1.1)).addInPlaceFromFloats(0, -0.5, 0));
        },
      });
    }
  }

  // --- Modèles 3D ----------------------------------------------------------------

  private material(name: string, color: Color3, roughness: number, metallic = 0): PBRMaterial {
    let mat = this.materials.get(name);
    if (!mat) {
      mat = new PBRMaterial(`fuel-${name}`, this.ctx.scene);
      mat.albedoColor = color;
      mat.roughness = roughness;
      mat.metallic = metallic;
      this.materials.set(name, mat);
    }
    return mat;
  }

  /** Jerrican rouge 5 L : corps, poignée, bec verseur jaune. */
  private jerricanMesh(): Mesh {
    const scene: Scene = this.ctx.scene;
    const red = this.material('red', new Color3(0.72, 0.06, 0.04), 0.4);
    const yellow = this.material('yellow', new Color3(0.95, 0.75, 0.1), 0.5);
    const body = CreateBox('jerrican-body', { width: 0.13, height: 0.3, depth: 0.25 }, scene);
    const handle = CreateBox('jerrican-handle', { width: 0.03, height: 0.03, depth: 0.14 }, scene);
    handle.position.set(0, 0.17, -0.03);
    const neck = CreateCylinder('jerrican-neck', { diameter: 0.045, height: 0.05, tessellation: 12 }, scene);
    neck.position.set(0, 0.165, 0.085);
    neck.rotation.x = 0.4;
    const parts = [body, handle];
    const redMesh = Mesh.MergeMeshes(parts, true, true)!;
    redMesh.material = red;
    neck.material = yellow;
    const mesh = Mesh.MergeMeshes([redMesh, neck], true, true, undefined, false, true)!;
    mesh.name = 'jerrican';
    return mesh;
  }

  /** Bidon d'huile 2T 1 L : corps bleu, bouchon blanc. */
  private oilMesh(): Mesh {
    const scene: Scene = this.ctx.scene;
    const blue = this.material('blue', new Color3(0.08, 0.25, 0.7), 0.35);
    const white = this.material('white', new Color3(0.92, 0.92, 0.9), 0.5);
    const body = CreateBox('oil-body', { width: 0.065, height: 0.19, depth: 0.1 }, scene);
    const cap = CreateCylinder('oil-cap', { diameter: 0.032, height: 0.03, tessellation: 12 }, scene);
    cap.position.set(0, 0.11, 0.02);
    body.material = blue;
    cap.material = white;
    const mesh = Mesh.MergeMeshes([body, cap], true, true, undefined, false, true)!;
    mesh.name = 'oil-bottle';
    return mesh;
  }
}
