/**
 * Gestion des véhicules : apparition, monter/descendre, commandes de
 * conduite, tableau de bord.
 *
 * Commandes de conduite (réutilisent celles du joueur) :
 * - clavier : avancer = gaz, reculer = frein, gauche/droite = guidon ;
 * - tactile : joystick (haut = gaz, bas = frein, côtés = guidon) ;
 * - manette : gâchettes (gaz/frein) + stick gauche.
 * E / « Descendre » / Y pour descendre (à l'arrêt ou presque).
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import type { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import type { GameContext, GameSystem } from '../app/GameContext';
import { ALL_BUT_PLAYER } from '../core/physics/layers';
import type { PlayerController } from '../player/PlayerController';
import { PLAYER } from '../player/movement';
import { t } from '../ui/i18n';
import { Bike, PARKED, type BikeControls } from './bike/Bike';
import type { BikeSpec } from './bike/specs';

export interface ShadowHost {
  addShadowCaster(mesh: Mesh): void;
}

export interface VehicleSpawn {
  readonly spec: BikeSpec;
  readonly position: Vector3;
  readonly yaw: number;
}

/** Fréquence d'envoi du tableau de bord (Hz). */
const TELEMETRY_HZ = 10;
/** Distance pour monter sans viser la moto (m). */
const MOUNT_RADIUS = 1.7;
/** Sous cette altitude, la moto est replacée à son point de départ. */
const FALL_LIMIT = -30;

export class VehicleSystem implements GameSystem {
  readonly id = 'vehicles';
  readonly bikes: Bike[] = [];
  private ctx!: GameContext;
  private physicsEngine!: PhysicsEngine;
  private riding: Bike | null = null;
  private telemetryTimer = 0;
  private readonly ray = new PhysicsRaycastResult();
  private readonly spawns = new Map<Bike, VehicleSpawn>();

  constructor(
    private readonly player: PlayerController,
    private readonly shadows: ShadowHost,
    private readonly initialSpawns: readonly VehicleSpawn[],
  ) {}

  /** Moto actuellement conduite. */
  get current(): Bike | null {
    return this.riding;
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.physicsEngine = ctx.scene.getPhysicsEngine() as PhysicsEngine;
    for (const spawn of this.initialSpawns) this.spawn(spawn);
  }

  spawn(spawn: VehicleSpawn): Bike {
    const bike = new Bike(this.ctx.scene, spawn.spec, spawn.position, spawn.yaw);
    for (const mesh of bike.visual.meshes) {
      mesh.receiveShadows = true;
      this.shadows.addShadowCaster(mesh);
    }
    this.ctx.interactables.register(bike.body, {
      label: t('vehicle.cyclo'),
      useLabel: t('vehicle.mount'),
      use: () => this.mount(bike),
    });
    this.ctx.interactables.setProximity(bike.body, { radius: MOUNT_RADIUS, position: () => bike.position });
    this.bikes.push(bike);
    this.spawns.set(bike, spawn);
    return bike;
  }

  mount(bike: Bike): void {
    if (this.riding || bike.rider) return;
    this.riding = bike;
    bike.setRider(true);
    this.player.mount(bike.visual.eye, () => bike.leanAngle);
    this.ctx.bus.emit('vehicle:mounted', { label: t('vehicle.cyclo') });
  }

  /** Descend si la moto roule assez lentement et s'il y a la place. */
  tryDismount(): boolean {
    const bike = this.riding;
    if (!bike) return false;
    if (Math.abs(bike.forwardSpeed) > bike.spec.maxDismountSpeed) {
      this.ctx.bus.emit('ui:notice', { message: t('vehicle.slowDown') });
      return false;
    }
    const spot = this.findDismountSpot(bike);
    if (!spot) {
      this.ctx.bus.emit('ui:notice', { message: t('vehicle.noRoom') });
      return false;
    }
    this.riding = null;
    bike.setRider(false);
    this.player.dismount(spot, bike.heading);
    this.ctx.bus.emit('vehicle:dismounted', {});
    return true;
  }

  fixedUpdate(dt: number): void {
    for (const bike of this.bikes) {
      bike.fixedUpdate(dt, bike === this.riding ? this.readControls() : PARKED);
    }
  }

  lateFixedUpdate(): void {
    for (const bike of this.bikes) bike.lateFixedUpdate();
  }

  update(dt: number, alpha: number): void {
    if (this.riding && this.ctx.input.consumePress('use')) this.tryDismount();
    for (const bike of this.bikes) {
      bike.updateVisual(alpha);
      if (bike.position.y < FALL_LIMIT) this.respawn(bike);
    }
    const bike = this.riding;
    if (!bike) return;
    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 1 / TELEMETRY_HZ) {
      this.telemetryTimer = 0;
      const data = bike.telemetry();
      this.ctx.bus.emit('vehicle:telemetry', { speedKmh: data.speedKmh, rpm: data.rpm, limiterRpm: data.limiterRpm });
    }
  }

  dispose(): void {
    for (const bike of this.bikes) bike.dispose();
    this.bikes.length = 0;
  }

  private readControls(): BikeControls {
    const input = this.ctx.input;
    const move = input.getMoveAxes();
    return {
      throttle: Math.max(input.getAxis('throttle'), Math.max(0, move.y)),
      brake: Math.max(input.getAxis('brake'), Math.max(0, -move.y)),
      steer: move.x,
    };
  }

  private respawn(bike: Bike): void {
    if (bike === this.riding) this.tryDismountForced(bike);
    const spawn = this.spawns.get(bike);
    if (spawn) bike.teleport(spawn.position, spawn.yaw);
  }

  /** Chute hors du monde en conduisant : le joueur est replacé avec la moto. */
  private tryDismountForced(bike: Bike): void {
    this.riding = null;
    bike.setRider(false);
    this.player.dismount(this.spawns.get(bike)?.position.add(new Vector3(1.2, 0, 0)) ?? Vector3.Zero(), bike.heading);
    this.player.respawn();
    this.ctx.bus.emit('vehicle:dismounted', {});
  }

  /**
   * Cherche où poser les pieds : à gauche, à droite, puis derrière la moto.
   * Il faut un sol plat, aucun obstacle entre la moto et ce point, et la
   * place de se tenir debout.
   */
  private findDismountSpot(bike: Bike): Vector3 | null {
    const heading = bike.heading;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = fz;
    const rz = -fx;
    const center = bike.position;
    const candidates: Array<[number, number]> = [
      [-rx * 0.85, -rz * 0.85], // gauche (côté béquille)
      [rx * 0.85, rz * 0.85], // droite
      [-fx * 1.4, -fz * 1.4], // derrière
      [fx * 1.4, fz * 1.4], // devant
    ];
    const query = { collideWith: ALL_BUT_PLAYER, ignoreBody: bike.body };
    const from = new Vector3();
    const to = new Vector3();
    for (const [dx, dz] of candidates) {
      const x = center.x + dx;
      const z = center.z + dz;
      // 1. Sol sous le point
      from.set(x, center.y + 1.2, z);
      to.set(x, center.y - 1.5, z);
      if (!this.cast(from, to, query) || this.ray.hitNormalWorld.y < 0.7) continue;
      const groundY = this.ray.hitPointWorld.y;
      // 2. Rien entre la moto et le point (hanches et tête)
      let blocked = false;
      for (const h of [0.5, 1.4]) {
        from.set(center.x, groundY + h, center.z);
        to.set(x, groundY + h, z);
        if (this.cast(from, to, query)) blocked = true;
      }
      // 3. Place pour se tenir debout
      from.set(x, groundY + 0.1, z);
      to.set(x, groundY + PLAYER.standingHeight + 0.05, z);
      if (blocked || this.cast(from, to, query)) continue;
      return new Vector3(x, groundY, z);
    }
    return null;
  }

  private cast(from: Vector3, to: Vector3, query: { collideWith: number; ignoreBody: Bike['body'] }): boolean {
    this.ray.reset();
    this.physicsEngine.raycastToRef(from, to, this.ray, query);
    return this.ray.hasHit;
  }
}
