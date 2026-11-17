/**
 * Physique d'une moto : « véhicule à rayons » adapté au deux-roues.
 *
 * - Le châssis est un corps rigide Havok (moto + pilote), avec un centre de
 *   gravité réaliste.
 * - Chaque roue = un rayon lancé depuis l'ancrage de la suspension. La
 *   compression donne la force du ressort/amortisseur… et la charge sur
 *   le pneu.
 * - Pneus : impulsions qui annulent le glissement latéral et transmettent
 *   moteur/freins, limitées par le cercle de friction (μ × charge). Au-delà,
 *   la roue glisse.
 * - Équilibre : un vrai deux-roues tient debout grâce au pilote et à la
 *   géométrie de la direction, très difficile à simuler de façon stable à
 *   60 Hz. On simule le résultat : un « pilote » applique un couple pour
 *   amener la moto à l'inclinaison d'équilibre du virage (tan φ = v·ω/g),
 *   en compensant le basculement naturel (gravité / force centrifuge).
 *
 * Rendu : le corps physique est invisible ; le modèle 3D est interpolé
 * entre les deux derniers pas (fluide à 144 Hz, caméra comprise).
 */
import { Quaternion, Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import { PhysicsShapeBox, PhysicsShapeContainer, PhysicsShapeSphere } from '@babylonjs/core/Physics/v2/physicsShape';
import type { Scene } from '@babylonjs/core/scene';
import { ALL_BUT_PLAYER, Layer } from '../../core/physics/layers';
import { AutomaticPowertrain } from '../simulation/Drivetrain';
import { ManualDrivetrain } from '../simulation/ManualDrivetrain';
import type { Powertrain } from '../simulation/Powertrain';
import {
  GRAVITY_ACCEL,
  aeroDrag,
  approach,
  maxSteerAngle,
  splitGrip,
  suspensionForce,
  targetLeanAngle,
  tireRollTorque,
} from './bikeMath';
import { createBikeVisual, type BikeVisual } from './BikeVisual';
import type { BikeSpec } from './specs';

export interface BikeControls {
  /** 0 à 1 */
  readonly throttle: number;
  /** Frein avant + arrière couplés, 0 à 1. */
  readonly brake: number;
  /** Frein arrière seul (pédale), 0 à 1. */
  readonly rearBrake: number;
  /** -1 (gauche) à 1 (droite) */
  readonly steer: number;
  /** Levier d'embrayage : 0 = embrayé, 1 = débrayé. */
  readonly clutch: number;
}

/** Moto garée : freins serrés, embrayage tiré (une vitesse engagée ne la bloque pas). */
export const PARKED: BikeControls = { throttle: 0, brake: 1, rearBrake: 1, steer: 0, clutch: 1 };

/** Crée la chaîne de traction décrite par la fiche. */
function createPowertrain(spec: BikeSpec): Powertrain {
  return spec.powertrain.kind === 'manual'
    ? new ManualDrivetrain(spec.powertrain.spec)
    : new AutomaticPowertrain(spec.powertrain.spec);
}

export interface BikeTelemetry {
  readonly speedKmh: number;
  readonly rpm: number;
  readonly limiterRpm: number;
  readonly gear: string;
  readonly running: boolean;
  readonly clutch: number;
  readonly throttle: number;
  readonly brake: number;
  readonly steerDeg: number;
  readonly leanDeg: number;
  readonly wheelsOnGround: number;
  /** Cap (rad) : 0 = +z, positif vers la droite. */
  readonly heading: number;
}

interface WheelState {
  readonly front: boolean;
  readonly mountLocal: Vector3;
  compression: number;
  grounded: boolean;
  /** Vitesse au sol (m/s). */
  speed: number;
  spin: number;
  // Contact du pas courant (valide si grounded)
  readonly point: Vector3;
  readonly r: Vector3;
  readonly fwd: Vector3;
  readonly lat: Vector3;
  load: number;
  massLat: number;
  massLong: number;
  hitBody: PhysicsBody | null;
  /** Impulsions accumulées pendant la résolution. */
  accLat: number;
  accLong: number;
  accBrake: number;
}

const UP = new Vector3(0, 1, 0);
/** Part du glissement latéral annulée à chaque pas (1 = adhérence parfaite). */
const LATERAL_STIFFNESS = 0.9;
/** Itérations de résolution des pneus (les deux roues s'influencent). */
const TIRE_ITERATIONS = 4;
/** Vitesse en dessous de laquelle le « pilote » pose les pieds (moto droite). */
const FEET_DOWN_SPEED = 1.2;
/** Recul aux pieds quand on freine à l'arrêt. */
const PADDLE_SPEED = 1.0;
const PADDLE_FORCE = 300;
const PADDLE_DELAY = 0.4;
/** Vitesse max de variation de l'inclinaison visée (rad/s) : pas de coup de raquette. */
const LEAN_TARGET_RATE = 1.6;
/** Accélération latérale max prise en compte (glissade = valeurs aberrantes). */
const MAX_LATERAL_ACCEL = 9;

export class Bike {
  readonly visual: BikeVisual;
  readonly body: PhysicsBody;
  readonly powertrain: Powertrain;
  private readonly bodyNode: TransformNode;
  private readonly physicsEngine: PhysicsEngine;
  private readonly shapeAlone: PhysicsShapeContainer;
  private readonly shapeRidden: PhysicsShapeContainer;
  private readonly wheels: WheelState[];
  private hasRider = false;
  private steerAngle = 0;
  private lean = 0;
  private leanTarget = 0;
  private parkedDamping = false;
  private controls: BikeControls = PARKED;
  private paddleTimer = 0;
  private teleportPending = 0;
  // Interpolation du rendu
  private readonly prevPosition = new Vector3();
  private readonly currPosition = new Vector3();
  private readonly prevRotation = new Quaternion();
  private readonly currRotation = new Quaternion();
  // Temporaires (aucune allocation par pas)
  private readonly ray = new PhysicsRaycastResult();
  private readonly t = {
    matrix: new Matrix(),
    right: new Vector3(),
    up: new Vector3(),
    forward: new Vector3(),
    flatForward: new Vector3(),
    flatRight: new Vector3(),
    uprightUp: new Vector3(),
    com: new Vector3(),
    v: new Vector3(),
    w: new Vector3(),
    mount: new Vector3(),
    end: new Vector3(),
    heading: new Vector3(),
    vp: new Vector3(),
    impulse: new Vector3(),
    tmp: new Vector3(),
    rxd: new Vector3(),
    invI: new Vector3(),
    part: new Vector3(),
    cross: new Vector3(),
    axis: new Vector3(),
    lv: new Vector3(),
    lw: new Vector3(),
  };

  constructor(
    private readonly scene: Scene,
    readonly spec: BikeSpec,
    position: Vector3,
    yaw: number,
  ) {
    this.physicsEngine = scene.getPhysicsEngine() as PhysicsEngine;
    this.powertrain = createPowertrain(spec);
    this.visual = createBikeVisual(scene, spec);

    const restHeight = spec.wheelRadius + spec.suspension.restLength - spec.mountHeight - 0.03;
    this.bodyNode = new TransformNode(`bike-body-${spec.id}`, scene);
    this.bodyNode.position.set(position.x, position.y + restHeight, position.z);
    this.bodyNode.rotationQuaternion = Quaternion.FromEulerAngles(0, yaw, 0);

    this.shapeAlone = this.createShape(false);
    this.shapeRidden = this.createShape(true);
    this.body = new PhysicsBody(this.bodyNode, PhysicsMotionType.DYNAMIC, false, scene);
    this.body.shape = this.shapeAlone;
    this.body.setAngularDamping(0.3);
    this.body.setLinearDamping(0.02);
    this.applyMass();

    const half = spec.wheelBase / 2;
    const wheel = (front: boolean): WheelState => ({
      front,
      mountLocal: new Vector3(0, spec.mountHeight, front ? half : -half),
      compression: 0,
      grounded: false,
      speed: 0,
      spin: 0,
      point: new Vector3(),
      r: new Vector3(),
      fwd: new Vector3(),
      lat: new Vector3(),
      load: 0,
      massLat: 0,
      massLong: 0,
      hitBody: null,
      accLat: 0,
      accLong: 0,
      accBrake: 0,
    });
    this.wheels = [wheel(true), wheel(false)];

    this.currPosition.copyFrom(this.bodyNode.position);
    this.prevPosition.copyFrom(this.currPosition);
    this.currRotation.copyFrom(this.bodyNode.rotationQuaternion);
    this.prevRotation.copyFrom(this.currRotation);
    this.updateVisual(1);
  }

  get rider(): boolean {
    return this.hasRider;
  }

  /** Vitesse vers l'avant (m/s). */
  get forwardSpeed(): number {
    this.body.getLinearVelocityToRef(this.t.v);
    this.readAxes();
    return Vector3.Dot(this.t.v, this.t.flatForward);
  }

  /** Inclinaison actuelle (rad, positive = à droite). */
  get leanAngle(): number {
    return this.lean;
  }

  /** Cap (rad) du dernier pas. */
  get heading(): number {
    this.readAxes();
    return Math.atan2(this.t.flatForward.x, this.t.flatForward.z);
  }

  /** Position du châssis (dernier pas). */
  get position(): Vector3 {
    return this.currPosition;
  }

  /** Monte ou descend le pilote : masse, centre de gravité et forme changent. */
  setRider(present: boolean): void {
    if (present === this.hasRider) return;
    this.hasRider = present;
    this.body.shape = present ? this.shapeRidden : this.shapeAlone;
    this.applyMass();
    // Boîte automatique : contact mis en montant. Boîte manuelle : il faut kicker.
    if (present && !this.powertrain.manual) this.powertrain.start(1);
    if (!present) this.powertrain.stop();
    this.visual.stand.setEnabled(!present);
  }

  /** Pas fixe : forces des roues, moteur, freins, équilibre. */
  fixedUpdate(dt: number, controls: BikeControls): void {
    if (this.teleportPending > 0 && --this.teleportPending === 0) this.body.disablePreStep = true;
    this.controls = controls;
    const t = this.t;
    const spec = this.spec;
    this.readAxes();
    this.body.getLinearVelocityToRef(t.v);
    this.body.getAngularVelocityToRef(t.w);
    const mass = this.currentMass();
    const speed = Vector3.Dot(t.v, t.flatForward);

    // Guidon : braquage limité selon la vitesse, tourné progressivement.
    const steerTarget = controls.steer * maxSteerAngle(speed, spec.steer.atRest, spec.steer.atSpeed, spec.steer.referenceSpeed);
    this.steerAngle = approach(this.steerAngle, steerTarget, spec.steer.rate * dt);

    // Moteur (force calculée avec la vitesse de roue du pas précédent).
    // L'inertie des pièces en rotation (énorme en 1re) réduit l'accélération.
    const rear = this.wheels[1]!;
    const output = this.powertrain.update(dt, { throttle: controls.throttle, clutch: controls.clutch }, rear.grounded ? rear.speed : 0);
    let drive = (output.force * mass) / (mass + output.inertiaMass);
    let brake = controls.brake;
    let rearBrake = Math.max(controls.brake * 0.7, controls.rearBrake);
    // Recul « aux pieds » : frein maintenu à l'arrêt.
    if (this.hasRider && controls.brake > 0.5 && controls.throttle < 0.05 && Math.abs(speed) < 0.3) this.paddleTimer += dt;
    else if (speed > -0.05 || controls.brake < 0.5) this.paddleTimer = 0;
    if (this.paddleTimer > PADDLE_DELAY) {
      brake = 0;
      rearBrake = 0;
      drive = speed > -PADDLE_SPEED ? -PADDLE_FORCE : 0;
    }

    let grounded = 0;
    for (const wheel of this.wheels) {
      if (this.probeWheel(wheel, dt, mass)) grounded++;
    }
    this.solveTires(dt, mass, drive, brake, rearBrake);

    // Traînée aérodynamique au centre de gravité (aeroDrag est négative : opposée à la vitesse).
    if (t.v.lengthSquared() > 1e-4) {
      const drag = aeroDrag(t.v.length(), spec.cdA);
      t.impulse.copyFrom(t.v).normalize().scaleInPlace(drag * dt);
      this.body.applyImpulse(t.impulse, t.com);
    }

    this.balance(dt, mass, speed, grounded > 0);
  }

  /** Après le pas physique : mémorise la pose pour l'interpolation. */
  lateFixedUpdate(): void {
    this.prevPosition.copyFrom(this.currPosition);
    this.prevRotation.copyFrom(this.currRotation);
    this.currPosition.copyFrom(this.bodyNode.position);
    if (this.bodyNode.rotationQuaternion) this.currRotation.copyFrom(this.bodyNode.rotationQuaternion);
  }

  /** Chaque image : modèle 3D interpolé, roues, guidon. */
  updateVisual(alpha: number): void {
    const v = this.visual;
    Vector3.LerpToRef(this.prevPosition, this.currPosition, alpha, v.root.position);
    v.root.rotationQuaternion ??= new Quaternion();
    Quaternion.SlerpToRef(this.prevRotation, this.currRotation, alpha, v.root.rotationQuaternion);
    v.steer.rotation.y = this.steerAngle;
    for (const wheel of this.wheels) {
      const visual = wheel.front ? v.front : v.rear;
      visual.spin.rotation.x = wheel.spin;
      const lift = Math.min(wheel.compression, this.spec.suspension.travel);
      if (wheel.front && visual.rest && visual.axis) {
        // Fourche inclinée : la roue s'enfonce le long des tubes.
        const k = lift / visual.axis.y;
        visual.mount.position.set(visual.rest.x + visual.axis.x * k, visual.rest.y + visual.axis.y * k, visual.rest.z + visual.axis.z * k);
      } else if (wheel.front) {
        visual.mount.position.y = -this.visual.steer.position.y + lift;
      } else {
        visual.mount.position.y = lift;
        const arm = v.swingarm;
        if (arm) arm.node.rotation.x = Math.atan2(arm.drop, arm.length) - Math.atan2(arm.drop - lift, arm.length);
      }
    }
  }

  telemetry(): BikeTelemetry {
    const c = this.controls;
    return {
      speedKmh: Math.abs(this.forwardSpeed) * 3.6,
      rpm: this.powertrain.rpm,
      limiterRpm: this.powertrain.limiterRpm,
      gear: this.powertrain.gearLabel,
      running: this.powertrain.running,
      clutch: c.clutch,
      throttle: c.throttle,
      brake: c.brake,
      steerDeg: (this.steerAngle * 180) / Math.PI,
      leanDeg: (this.lean * 180) / Math.PI,
      wheelsOnGround: this.wheels.filter((w) => w.grounded).length,
      heading: this.heading,
    };
  }

  /** Replace la moto (respawn), droite et immobile. */
  teleport(position: Vector3, yaw: number): void {
    this.body.disablePreStep = false;
    this.teleportPending = 2;
    const height = this.spec.wheelRadius + this.spec.suspension.restLength - this.spec.mountHeight;
    this.bodyNode.position.set(position.x, position.y + height, position.z);
    this.bodyNode.rotationQuaternion = Quaternion.FromEulerAngles(0, yaw, 0);
    this.body.setLinearVelocity(Vector3.Zero());
    this.body.setAngularVelocity(Vector3.Zero());
    this.lateFixedUpdate();
    this.lateFixedUpdate();
  }

  dispose(): void {
    this.body.dispose();
    this.shapeAlone.dispose();
    this.shapeRidden.dispose();
    this.bodyNode.dispose();
    this.visual.root.dispose(false, true);
  }

  /**
   * Une roue : rayon, suspension (appliquée tout de suite) et préparation du
   * contact pneu/sol. Retourne vrai si elle touche le sol.
   */
  private probeWheel(wheel: WheelState, dt: number, mass: number): boolean {
    const t = this.t;
    const spec = this.spec;
    const s = spec.suspension;
    const rayLength = s.restLength + spec.wheelRadius;

    Vector3.TransformCoordinatesToRef(wheel.mountLocal, t.matrix, t.mount);
    t.end.copyFrom(t.uprightUp).scaleInPlace(-rayLength).addInPlace(t.mount);
    this.ray.reset();
    this.physicsEngine.raycastToRef(t.mount, t.end, this.ray, { collideWith: ALL_BUT_PLAYER, ignoreBody: this.body });

    if (!this.ray.hasHit) {
      wheel.grounded = false;
      wheel.compression = 0;
      wheel.speed *= 0.99; // roue en l'air : continue de tourner
      wheel.spin += (wheel.speed / spec.wheelRadius) * dt;
      return false;
    }

    // --- Suspension ---
    const distance = Vector3.Distance(t.mount, this.ray.hitPointWorld);
    const compression = Math.min(Math.max(rayLength - distance, 0), s.travel + 0.05);
    const compressionSpeed = (compression - wheel.compression) / dt;
    wheel.compression = compression;
    let load = suspensionForce(compression, compressionSpeed, s.stiffness, s.damping);
    if (compression > s.travel) load += s.stiffness * 8 * (compression - s.travel); // butée
    t.impulse.copyFrom(t.uprightUp).scaleInPlace(load * dt);
    this.body.applyImpulse(t.impulse, t.mount);
    const hitBody = this.ray.body;
    wheel.hitBody = hitBody !== undefined && hitBody.getMotionType() === PhysicsMotionType.DYNAMIC ? hitBody : null;
    wheel.hitBody?.applyImpulse(t.impulse.scaleInPlace(-1), this.ray.hitPointWorld);

    // --- Repère du pneu sur le sol ---
    const n = this.ray.hitNormalWorld;
    if (wheel.front) {
      // Cap de la roue avant = cap de la moto tourné du braquage.
      const c = Math.cos(this.steerAngle);
      const sn = Math.sin(this.steerAngle);
      t.heading.copyFrom(t.flatForward).scaleInPlace(c).addInPlace(t.tmp.copyFrom(t.flatRight).scaleInPlace(sn));
    } else {
      t.heading.copyFrom(t.flatForward);
    }
    wheel.fwd.copyFrom(n).scaleInPlace(-Vector3.Dot(t.heading, n)).addInPlace(t.heading).normalize();
    Vector3.CrossToRef(n, wheel.fwd, wheel.lat).normalize();
    wheel.point.copyFrom(this.ray.hitPointWorld);
    wheel.point.subtractToRef(t.com, wheel.r);
    wheel.load = load;
    wheel.massLat = this.effectiveMass(wheel.r, wheel.lat, mass);
    wheel.massLong = this.effectiveMass(wheel.r, wheel.fwd, mass);
    wheel.accLat = 0;
    wheel.accLong = 0;
    wheel.accBrake = 0;

    Vector3.CrossToRef(t.w, wheel.r, t.vp).addInPlace(t.v);
    wheel.speed = Vector3.Dot(t.vp, wheel.fwd);
    wheel.spin += (wheel.speed / spec.wheelRadius) * dt;
    wheel.grounded = true;
    return true;
  }

  /**
   * Forces des pneus, résolues ensemble en plusieurs itérations (« impulsions
   * séquentielles ») : chaque roue tient compte de ce que l'autre vient de
   * faire. Sans cela, la roue arrière défait en partie la rotation amorcée
   * par la roue avant et la moto tourne mal à basse vitesse.
   */
  private solveTires(dt: number, mass: number, drive: number, frontBrake: number, rearBrake: number): void {
    const t = this.t;
    const spec = this.spec;
    // Copie locale des vitesses, mise à jour à chaque impulsion.
    t.lv.copyFrom(t.v);
    t.lw.copyFrom(t.w);
    for (let iteration = 0; iteration < TIRE_ITERATIONS; iteration++) {
      for (const wheel of this.wheels) {
        if (!wheel.grounded) continue;
        Vector3.CrossToRef(t.lw, wheel.r, t.vp).addInPlace(t.lv);
        const vLong = Vector3.Dot(t.vp, wheel.fwd);
        const vLat = Vector3.Dot(t.vp, wheel.lat);
        // Latéral : annule le glissement ; adhérence totale à très basse vitesse (moto garée).
        const stiffness = Math.abs(wheel.speed) < 0.5 ? 1 : LATERAL_STIFFNESS;
        const wantedLat = wheel.accLat - vLat * wheel.massLat * stiffness;
        // Frein : arrête la roue sans jamais la faire repartir en arrière.
        const brakeCap = (wheel.front ? spec.brake.front * frontBrake : spec.brake.rear * rearBrake) * dt;
        const totalBrake = Math.max(-brakeCap, Math.min(brakeCap, wheel.accBrake - vLong * wheel.massLong));
        // Moteur (roue arrière) + résistance au roulement : fixes pour ce pas.
        const roll = -Math.sign(wheel.speed) * Math.min(Math.abs(wheel.speed) * wheel.massLong, spec.rollingResistance * wheel.load * dt);
        const fixed = (wheel.front ? 0 : drive * dt) + roll;
        const [lat, long] = splitGrip(wantedLat, fixed + totalBrake, spec.grip * wheel.load * dt);
        const dLat = lat - wheel.accLat;
        const dLong = long - wheel.accLong;
        wheel.accLat = lat;
        wheel.accLong = long;
        wheel.accBrake = long - fixed;
        t.impulse.copyFrom(wheel.lat).scaleInPlace(dLat).addInPlace(t.tmp.copyFrom(wheel.fwd).scaleInPlace(dLong));
        this.applyLocalImpulse(t.impulse, wheel.r, mass);
      }
    }
    // Application réelle au corps Havok (et réaction sur les objets roulés).
    for (const wheel of this.wheels) {
      if (!wheel.grounded) continue;
      t.impulse.copyFrom(wheel.lat).scaleInPlace(wheel.accLat).addInPlace(t.tmp.copyFrom(wheel.fwd).scaleInPlace(wheel.accLong));
      this.body.applyImpulse(t.impulse, wheel.point);
      wheel.hitBody?.applyImpulse(t.impulse.scaleInPlace(-1), wheel.point);
    }
  }

  /** Effet d'une impulsion sur la copie locale des vitesses (v += J/m, ω += I⁻¹ (r × J)). */
  private applyLocalImpulse(impulse: Vector3, r: Vector3, mass: number): void {
    const t = this.t;
    t.lv.addInPlace(t.part.copyFrom(impulse).scaleInPlace(1 / mass));
    const torque = Vector3.CrossToRef(r, impulse, t.cross);
    this.applyInverseInertia(torque, mass, t.invI);
    t.lw.addInPlace(t.invI);
  }

  /** out = I⁻¹ · x (dans le monde, via les axes principaux de la moto). */
  private applyInverseInertia(x: Vector3, mass: number, out: Vector3): Vector3 {
    const t = this.t;
    const [ix, iy, iz] = this.spec.inertiaPerKg;
    const a = Vector3.Dot(x, t.right) / (ix * mass);
    const b = Vector3.Dot(x, t.up) / (iy * mass);
    const c = Vector3.Dot(x, t.forward) / (iz * mass);
    out.copyFrom(t.right).scaleInPlace(a);
    out.addInPlace(t.axis.copyFrom(t.up).scaleInPlace(b));
    out.addInPlace(t.axis.copyFrom(t.forward).scaleInPlace(c));
    return out;
  }

  /** « Pilote » virtuel : amène la moto à l'inclinaison d'équilibre. */
  private balance(dt: number, mass: number, speed: number, grounded: boolean): void {
    const t = this.t;
    const spec = this.spec;
    this.lean = Math.atan2(Vector3.Dot(t.up, t.flatRight), Vector3.Dot(t.up, t.uprightUp));
    const yawRate = Vector3.Dot(t.w, UP);
    const lateralAccel = Math.max(-MAX_LATERAL_ACCEL, Math.min(MAX_LATERAL_ACCEL, speed * yawRate));
    let target: number;
    if (!this.hasRider && Math.abs(speed) < 0.5) target = spec.lean.onStand;
    else if (Math.abs(speed) < FEET_DOWN_SPEED || !grounded) target = 0;
    else target = targetLeanAngle(speed, lateralAccel / Math.max(Math.abs(speed), 0.1) * Math.sign(speed), spec.lean.max);
    this.leanTarget = approach(this.leanTarget, target, LEAN_TARGET_RATE * dt);

    const rollInertia = spec.inertiaPerKg[2] * mass;
    const omega = spec.lean.frequency;
    const gain = grounded ? 1 : 0.3;
    const kp = rollInertia * omega * omega * gain;
    const kd = 2 * spec.lean.dampingRatio * omega * rollInertia * gain;
    const rollRateRight = -Vector3.Dot(t.w, t.forward);
    let torque = kp * (this.leanTarget - this.lean) - kd * rollRateRight;
    // Annule le couple des pneus (qui redresse la moto vers l'extérieur du virage).
    if (grounded) torque -= tireRollTorque(mass, this.comHeight(), lateralAccel, this.lean);
    const maxTorque = 2.5 * mass * GRAVITY_ACCEL * this.comHeight();
    torque = Math.max(-maxTorque, Math.min(maxTorque, torque));
    // Un couple positif penche à droite : rotation négative autour de l'axe avant.
    t.impulse.copyFrom(t.flatForward).scaleInPlace(-torque * dt);
    this.body.applyAngularImpulse(t.impulse);

    // Garée et immobile : fort amortissement (pas de lente dérive).
    const parked = !this.hasRider && Math.abs(speed) < 0.2;
    if (parked !== this.parkedDamping) {
      this.parkedDamping = parked;
      this.body.setLinearDamping(parked ? 4 : 0.02);
      this.body.setAngularDamping(parked ? 4 : 0.3);
    }
  }

  /** Axes de la moto dans le monde, avec et sans l'inclinaison. */
  private readAxes(): void {
    const t = this.t;
    this.bodyNode.computeWorldMatrix(true);
    t.matrix.copyFrom(this.bodyNode.getWorldMatrix());
    Vector3.TransformNormalFromFloatsToRef(1, 0, 0, t.matrix, t.right);
    Vector3.TransformNormalFromFloatsToRef(0, 1, 0, t.matrix, t.up);
    Vector3.TransformNormalFromFloatsToRef(0, 0, 1, t.matrix, t.forward);
    t.right.normalize();
    t.up.normalize();
    t.forward.normalize();
    t.flatForward.set(t.forward.x, 0, t.forward.z);
    if (t.flatForward.lengthSquared() < 1e-6) t.flatForward.set(0, 0, 1);
    t.flatForward.normalize();
    Vector3.CrossToRef(UP, t.flatForward, t.flatRight);
    // « Haut » de la moto sans son inclinaison : axe des suspensions.
    t.uprightUp.copyFrom(t.flatRight).scaleInPlace(-Vector3.Dot(t.up, t.flatRight)).addInPlace(t.up).normalize();
    const com = this.hasRider ? this.spec.centerOfMass.withRider : this.spec.centerOfMass.alone;
    Vector3.TransformCoordinatesFromFloatsToRef(com[0], com[1], com[2], t.matrix, t.com);
  }

  /**
   * Masse « vue » par un point du corps dans une direction (tient compte de
   * la rotation) : permet de calculer l'impulsion exacte qui annule une vitesse.
   */
  private effectiveMass(r: Vector3, direction: Vector3, mass: number): number {
    const t = this.t;
    const rxd = Vector3.CrossToRef(r, direction, t.rxd);
    const invI = this.applyInverseInertia(rxd, mass, t.invI);
    const angular = Vector3.Dot(Vector3.CrossToRef(invI, r, t.cross), direction);
    return 1 / (1 / mass + angular);
  }

  private currentMass(): number {
    return this.spec.mass + (this.hasRider ? this.spec.riderMass : 0);
  }

  private comHeight(): number {
    const com = this.hasRider ? this.spec.centerOfMass.withRider : this.spec.centerOfMass.alone;
    const restHeight = this.spec.wheelRadius + this.spec.suspension.restLength - this.spec.mountHeight;
    return com[1] + restHeight;
  }

  private applyMass(): void {
    const com = this.hasRider ? this.spec.centerOfMass.withRider : this.spec.centerOfMass.alone;
    this.body.setMassProperties({
      mass: this.currentMass(),
      centerOfMass: new Vector3(com[0], com[1], com[2]),
      inertia: new Vector3(...this.spec.inertiaPerKg),
      inertiaOrientation: Quaternion.Identity(),
    });
  }

  /** Châssis + sphères de roue (butées) [+ pilote assis]. */
  private createShape(withRider: boolean): PhysicsShapeContainer {
    const scene = this.scene;
    const half = this.spec.wheelBase / 2;
    const c = this.spec.collider;
    const box = (b: { center: readonly number[]; size: readonly number[] }): PhysicsShapeBox =>
      new PhysicsShapeBox(Vector3.FromArray(b.center), Quaternion.Identity(), Vector3.FromArray(b.size), scene);
    const container = new PhysicsShapeContainer(scene);
    container.addChild(box(c.frame));
    for (const z of [half, -half]) container.addChild(new PhysicsShapeSphere(new Vector3(0, 0, z), c.wheelStop, scene));
    if (withRider) container.addChild(box(c.rider));
    container.material = { friction: 0.35, restitution: 0.05 };
    container.filterMembershipMask = Layer.VEHICLE;
    return container;
  }
}
