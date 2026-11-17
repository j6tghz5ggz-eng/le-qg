/**
 * Station-service PÉTRO'VAL (nom fictif) au bord de la D50.
 *
 * - Auvent sur piliers, deux pompes SP95 avec afficheur, piste en béton.
 * - Pompe : garez la moto à côté, visez la pompe et maintenez Utiliser :
 *   le plein se fait et se paie au litre (1,85 €/L). On peut aussi remplir
 *   un jerrican en le tenant près de la pompe.
 * - Présentoir devant la boutique : huile 2T et jerricans pleins.
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import type { Scene } from '@babylonjs/core/scene';
import type { GameContext, GameSystem } from '../../app/GameContext';
import type { HoldAction } from '../../core/interaction/Interactable';
import type { Wallet } from '../../economy/Wallet';
import { formatMoney } from '../../economy/Wallet';
import { pipe, v3 } from '../../core/rendering/meshKit';
import { t } from '../../ui/i18n';
import type { FuelSystem } from '../../vehicles/fuel/FuelSystem';
import type { WorldEnvironment } from '../environment/environment';
import { STATION } from './mapData';

const OIL_PRICE = 13;
const JERRICAN_PRICE = 10;

export class GasStation implements GameSystem {
  readonly id = 'gas-station';
  private ctx!: GameContext;

  constructor(
    private readonly fuel: FuelSystem,
    private readonly wallet: Wallet,
    private readonly environment: () => WorldEnvironment,
  ) {}

  init(ctx: GameContext): void {
    this.ctx = ctx;
    const scene = ctx.scene;
    const pumps = STATION.pumps.map(([x, z]) => new Vector3(x, 0.9, z));
    this.fuel.attachStation({ pumps, pricePerLiter: STATION.pricePerLiter, pay: (euros) => this.wallet.spend(euros) });

    const mat = (name: string, color: Color3, roughness = 0.6, metallic = 0): PBRMaterial => {
      const m = new PBRMaterial(`station-${name}`, scene);
      m.albedoColor = color;
      m.roughness = roughness;
      m.metallic = metallic;
      return m;
    };
    const white = mat('white', new Color3(0.92, 0.92, 0.9), 0.4);
    const green = mat('green', new Color3(0.03, 0.36, 0.22), 0.45);
    const yellow = mat('yellow', new Color3(1, 0.78, 0.05), 0.45);
    const concrete = mat('concrete', new Color3(0.6, 0.6, 0.58), 0.9);
    const black = mat('black', new Color3(0.04, 0.04, 0.05), 0.6);

    // Piste en béton (visuelle, au ras du sol).
    const slab = CreateGround('station-slab', { width: 46, height: 30 }, scene);
    slab.position.set(STATION.x, 0.012, STATION.z + 4);
    slab.material = concrete;
    slab.receiveShadows = true;
    concrete.zOffset = -0.5;

    // Auvent : 4 piliers et un toit avec bandeau aux couleurs de la station.
    const cx = (STATION.pumps[0]![0] + STATION.pumps[1]![0]) / 2;
    const cz = STATION.pumps[0]![1];
    const statics: Mesh[] = [];
    for (const dx of [-7, 7]) {
      for (const dz of [-3.5, 3.5]) statics.push(this.box(`pillar`, [0.35, 4.6, 0.35], [cx + dx, 2.3, cz + dz], white, true));
    }
    this.box('canopy', [18, 0.5, 10], [cx, 4.85, cz], white, true);
    this.box('canopy-band', [18.1, 0.35, 10.1], [cx, 4.5, cz], green, false);
    this.box('canopy-stripe', [18.15, 0.08, 10.15], [cx, 4.68, cz], yellow, false);

    // Pompes : corps, afficheur, pistolet et tuyau.
    const display = displayMaterial(scene);
    STATION.pumps.forEach(([x, z], i) => {
      this.box('pump-base', [1.3, 0.2, 0.8], [x, 0.1, z], concrete, true);
      const body = this.box('pump', [0.8, 1.7, 0.5], [x, 1.05, z], white, false);
      this.box('pump-top', [0.82, 0.3, 0.52], [x, 2.05, z], green, false);
      for (const side of [-1, 1]) {
        const screen = CreatePlane('pump-display', { width: 0.6, height: 0.4 }, scene);
        screen.position.set(x, 1.5, z + side * 0.26);
        screen.rotation.y = side > 0 ? Math.PI : 0;
        screen.material = display;
      }
      const hose = pipe(scene, 'pump-hose', [v3(x + 0.42, 1.4, z), v3(x + 0.55, 0.9, z), v3(x + 0.5, 0.4, z + 0.1), v3(x + 0.45, 1.1, z + 0.12)], 0.02, 6);
      hose.material = black;
      const pumpBody = new PhysicsAggregate(body, PhysicsShapeType.BOX, { mass: 0 }, scene);
      const position = pumps[i]!;
      let cache: { action: HoldAction; key: unknown } | null = null;
      const fuel = this.fuel;
      ctx.interactables.register(pumpBody.body, {
        label: `${t('object.pump')} · ${STATION.pricePerLiter.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/L`,
        // Même action tant que la même moto est garée à côté (sinon l'appui maintenu repartirait de zéro).
        get hold(): HoldAction {
          const action = fuel.pumpAction(position);
          const key = action ? 'bike' : 'none';
          if (cache && cache.key === key) return cache.action;
          const next: HoldAction = action ?? { label: t('fuel.pourFuel'), seconds: 1, blocker: () => t('fuel.noBike'), complete: () => {} };
          cache = { action: next, key };
          return next;
        },
      });
    });

    // Présentoir devant la boutique : huile 2T et jerricans.
    const rackX = STATION.x + 5.5;
    const rackZ = STATION.z - 7.2;
    this.box('rack', [1.6, 1, 0.6], [rackX, 0.5, rackZ], green, true);
    const oilItem = this.box('rack-oil', [0.5, 0.25, 0.3], [rackX - 0.4, 1.13, rackZ], mat('blue', new Color3(0.08, 0.25, 0.7), 0.35), false);
    const canItem = this.box('rack-jerrican', [0.5, 0.35, 0.3], [rackX + 0.4, 1.18, rackZ], mat('red', new Color3(0.72, 0.06, 0.04), 0.4), false);
    this.sell(oilItem, `${t('object.rackOil')} · ${formatMoney(OIL_PRICE)}`, OIL_PRICE, 'oil', 1, new Vector3(rackX - 0.4, 1.5, rackZ + 0.55));
    this.sell(canItem, `${t('object.rackJerrican')} · ${formatMoney(JERRICAN_PRICE)}`, JERRICAN_PRICE, 'jerrican', 5, new Vector3(rackX + 0.4, 1.5, rackZ + 0.6));
    void statics;
  }

  /** Article du présentoir : acheter = un bidon apparaît devant. */
  private sell(mesh: Mesh, label: string, price: number, kind: 'oil' | 'jerrican', amount: number, spawn: Vector3): void {
    const body = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0 }, this.ctx.scene);
    this.ctx.interactables.register(body.body, {
      label,
      useLabel: `${t('object.buy')} (${formatMoney(price)})`,
      use: () => {
        if (!this.wallet.spend(price)) {
          this.ctx.bus.emit('ui:notice', { message: t('shop.tooExpensive') });
          return;
        }
        this.fuel.spawnContainer(kind, amount, spawn);
        this.ctx.bus.emit('sfx', { id: 'purchase' });
      },
    });
  }

  private box(name: string, size: readonly [number, number, number], at: readonly [number, number, number], material: PBRMaterial, solid: boolean): Mesh {
    const scene: Scene = this.ctx.scene;
    const mesh = CreateBox(`station-${name}`, { width: size[0], height: size[1], depth: size[2] }, scene);
    mesh.position.set(at[0], at[1], at[2]);
    mesh.material = material;
    mesh.receiveShadows = true;
    this.environment().addShadowCaster(mesh);
    if (solid) new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene);
    return mesh;
  }
}

/** Afficheur de pompe : carburant, prix au litre (texte fictif). */
function displayMaterial(scene: Scene): PBRMaterial {
  const tex = new DynamicTexture('station-display', { width: 256, height: 170 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#0d1a14';
  ctx.fillRect(0, 0, 256, 170);
  ctx.fillStyle = '#ffd200';
  ctx.font = '700 36px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SP95', 128, 48);
  ctx.fillStyle = '#7dff9a';
  ctx.font = '700 52px monospace';
  ctx.fillText(`${STATION.pricePerLiter.toFixed(2).replace('.', ',')}`, 128, 112);
  ctx.font = '700 22px Arial, Helvetica, sans-serif';
  ctx.fillText('€ / litre', 128, 148);
  tex.update();
  const mat = new PBRMaterial('station-display', scene);
  mat.albedoTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.6, 0.6, 0.6);
  mat.roughness = 0.3;
  mat.metallic = 0;
  return mat;
}
