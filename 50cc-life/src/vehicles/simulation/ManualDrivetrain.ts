/**
 * 50 cc à boîte : moteur 2 temps, embrayage à commande manuelle, boîte
 * séquentielle 6 vitesses. Module pur, testé.
 *
 * Point mort SOUS la 1re (N - 1 - 2 - … - 6) : sur une vraie moto il est
 * entre la 1re et la 2e (« demi-clic »), impossible à reproduire de façon
 * fiable avec des touches ; ici on rétrograde depuis la 1re pour le trouver.
 *
 * Le cœur du réalisme est l'embrayage :
 * - débrayé (levier tiré) ou point mort : le moteur tourne librement ;
 * - en patinage (zone de friction du levier) : il transmet un couple limité
 *   et le régime moteur diffère de celui de la roue — c'est ce qui permet
 *   de démarrer en montant dans les tours ;
 * - collé : le moteur est lié à la roue. Gaz coupés = frein moteur. Trop
 *   bas dans les tours = le moteur cale (comme en vrai en lâchant
 *   l'embrayage d'un coup au ralenti).
 *
 * Bridage d'usine, comme en vrai, à plusieurs étages :
 * - le pot de détente, la cartouche et le petit carburateur étranglent le
 *   moteur à haut régime : à plat, la moto plafonne vers 50 km/h ;
 * - le boîtier CDI coupe l'allumage à 8 700 tr/min (≈ 60 km/h en 6e) : en
 *   descente, la pente l'aide à monter jusque-là, pas plus.
 * Débrider = changer ces pièces (CDI, pot, cartouche…).
 */
import { sampleCurve } from './Drivetrain';
import {
  restrictionFactor,
  type EngineStats,
  type Powertrain,
  type PowertrainInput,
  type PowertrainOutput,
  type ShiftResult,
  type StartResult,
} from './Powertrain';

export interface ManualDrivetrainSpec {
  readonly idleRpm: number;
  /** Sous ce régime, un moteur entraîné par la roue cale. */
  readonly stallRpm: number;
  /** Courbe de couple plein gaz au vilebrequin : [tr/min, N·m]. */
  readonly torqueCurve: ReadonlyArray<readonly [number, number]>;
  /** Inertie du vilebrequin + volant + embrayage (kg·m²). */
  readonly inertia: number;
  /** Frottements et pompage : a + b × régime (N·m). */
  readonly friction: readonly [number, number];
  readonly primaryRatio: number;
  readonly gearRatios: readonly number[];
  readonly finalRatio: number;
  readonly efficiency: number;
  /** Couple max transmis par l'embrayage collé (N·m au vilebrequin). */
  readonly clutchCapacity: number;
  readonly wheelRadius: number;
}

/** Moteur 2T 50 cm³ à boîte 6 (type supermotard / enduro 50). */
export const SM50_DRIVETRAIN: ManualDrivetrainSpec = {
  idleRpm: 1600,
  stallRpm: 950,
  torqueCurve: [
    [800, 0.9],
    [2000, 1.8],
    [3000, 2.5],
    [4000, 3.0],
    [5000, 3.4],
    [6000, 3.8],
    [7000, 4.1],
    [8000, 4.4],
    [9000, 4.5],
    [10000, 4.2],
    [11000, 3.5],
    [12000, 2.4],
  ],
  inertia: 0.0012,
  friction: [0.25, 0.00006],
  primaryRatio: 3.65,
  gearRatios: [3.0, 1.938, 1.444, 1.2, 1.045, 0.951],
  finalRatio: 53 / 11,
  efficiency: 0.9,
  clutchCapacity: 12,
  wheelRadius: 0.307,
};

/** Ordre de la boîte séquentielle (0 = point mort). */
export const GEAR_SEQUENCE = [0, 1, 2, 3, 4, 5, 6] as const;

/** Écart de régime (rad/s) sous lequel l'embrayage se colle. */
const LOCK_EPSILON = 10;
const RPM_TO_RAD = (2 * Math.PI) / 60;
/** Levier tiré au-delà de cette valeur : on peut passer une vitesse. */
export const SHIFT_CLUTCH_THRESHOLD = 0.6;

/** Engagement de l'embrayage selon le levier (zone de friction large, au milieu). */
export function clutchEngagement(lever: number): number {
  const t = Math.min(Math.max((0.9 - lever) / 0.8, 0), 1);
  return t * t * (3 - 2 * t);
}

const DEFAULT_STATS: EngineStats = {
  canRun: true,
  missing: [],
  powerFactor: 1,
  limiterRpm: 8700,
  restrictions: [],
  startChance: 0.85,
  loudness: 0.4,
};

export class ManualDrivetrain implements Powertrain {
  readonly manual = true;
  rpm = 0;
  running = false;
  /** 0 = point mort, 1 à 6. */
  gear = 0;
  locked = false;
  private stats: EngineStats = DEFAULT_STATS;
  private stalled = false;

  constructor(readonly spec: ManualDrivetrainSpec) {}

  get gearLabel(): string {
    return this.gear === 0 ? 'N' : String(this.gear);
  }

  get limiterRpm(): number {
    return this.stats.limiterRpm;
  }

  get loudness(): number {
    return this.stats.loudness;
  }

  /** Démultiplication totale vilebrequin → roue du rapport engagé (0 au point mort). */
  get ratio(): number {
    if (this.gear === 0) return 0;
    const s = this.spec;
    return s.primaryRatio * (s.gearRatios[this.gear - 1] ?? 1) * s.finalRatio;
  }

  setEngineStats(stats: EngineStats): void {
    this.stats = stats;
    if (!stats.canRun) this.running = false;
  }

  consumeStall(): boolean {
    const stalled = this.stalled;
    this.stalled = false;
    return stalled;
  }

  /** Coup de kick. Il faut être au point mort ou embrayage tiré. */
  start(clutch = 0, random: () => number = Math.random): StartResult {
    if (this.running) return { ok: true };
    if (!this.stats.canRun) return { ok: false, reason: 'missing', missing: this.stats.missing };
    if (this.gear !== 0 && clutch < SHIFT_CLUTCH_THRESHOLD) return { ok: false, reason: 'inGear' };
    if (random() > this.stats.startChance) return { ok: false, reason: 'failed' };
    this.running = true;
    this.locked = false;
    this.rpm = this.spec.idleRpm + 600;
    return { ok: true };
  }

  stop(): void {
    this.running = false;
  }

  shiftUp(clutch: number): ShiftResult {
    return this.shift(1, clutch);
  }

  shiftDown(clutch: number): ShiftResult {
    return this.shift(-1, clutch);
  }

  update(dt: number, input: PowertrainInput, wheelSpeed: number): PowertrainOutput {
    const s = this.spec;
    const ratio = this.ratio;
    const engagement = ratio > 0 ? clutchEngagement(input.clutch) : 0;
    // Régime « côté roue » ramené au vilebrequin (rad/s).
    const wheelSide = ratio > 0 ? (Math.max(wheelSpeed, 0) / s.wheelRadius) * ratio : 0;
    let omega = this.rpm * RPM_TO_RAD;

    // Couple moteur : combustion (si allumage) − frottements/pompage.
    let combustion = 0;
    if (this.running && this.rpm < this.stats.limiterRpm) {
      const gas = Math.max(Math.min(Math.max(input.throttle, 0), 1), this.idleThrottle());
      combustion =
        sampleCurve(s.torqueCurve, this.rpm) *
        this.stats.powerFactor *
        restrictionFactor(this.stats.restrictions, this.rpm) *
        gas;
    }
    const friction = omega > 0 ? s.friction[0] + s.friction[1] * this.rpm : 0;
    const engineTorque = combustion - friction;
    // Morsure progressive : peu de couple transmis au point de patinage.
    const capacity = s.clutchCapacity * engagement * engagement;

    let transmitted = 0; // couple au vilebrequin envoyé vers la boîte
    if (engagement <= 0.001) {
      this.locked = false;
      omega += (engineTorque / s.inertia) * dt;
    } else {
      if (this.locked && Math.abs(engineTorque) > capacity) this.locked = false;
      if (this.locked) {
        omega = wheelSide;
        transmitted = engineTorque;
      } else {
        // Patinage : l'embrayage transmet sa capacité, dans le sens de l'écart.
        const slip = omega - wheelSide;
        const clutchTorque = Math.sign(slip) * capacity;
        const next = omega + ((engineTorque - clutchTorque) / s.inertia) * dt;
        const crossed = Math.sign(next - wheelSide) !== Math.sign(slip) || Math.abs(next - wheelSide) < LOCK_EPSILON;
        if (crossed) {
          omega = wheelSide;
          if (capacity >= Math.abs(engineTorque)) {
            this.locked = true;
            transmitted = engineTorque;
          } else {
            transmitted = clutchTorque;
          }
        } else {
          omega = next;
          transmitted = clutchTorque;
        }
      }
    }

    this.rpm = Math.max(0, omega) / RPM_TO_RAD;
    if (this.running && this.rpm < s.stallRpm) {
      this.running = false;
      this.stalled = true;
    }
    // Démarrage « à la poussette » : moteur entraîné par la roue, gaz ouverts.
    if (!this.running && this.locked && this.rpm > 1500 && input.throttle > 0.05 && this.stats.canRun) {
      this.running = true;
    }

    const force = (transmitted * ratio * s.efficiency) / s.wheelRadius;
    const inertiaMass = this.locked ? (s.inertia * ratio * ratio) / (s.wheelRadius * s.wheelRadius) : 0;
    return { force, inertiaMass };
  }

  /** Vis de ralenti du carburateur : un peu de gaz pour tenir le ralenti. */
  private idleThrottle(): number {
    return Math.min(Math.max(0.2 + (this.spec.idleRpm - this.rpm) * 0.001, 0), 0.45);
  }

  private shift(direction: 1 | -1, clutch: number): ShiftResult {
    if (clutch < SHIFT_CLUTCH_THRESHOLD) return { ok: false, reason: 'clutch' };
    const index = GEAR_SEQUENCE.indexOf(this.gear as (typeof GEAR_SEQUENCE)[number]);
    const next = index + direction;
    if (next < 0 || next >= GEAR_SEQUENCE.length) return { ok: false, reason: 'limit' };
    this.gear = GEAR_SEQUENCE[next]!;
    this.locked = false;
    return { ok: true, gear: this.gearLabel };
  }
}
