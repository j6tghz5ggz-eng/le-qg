/**
 * Moteur 2 temps 50 cc + variateur automatique + embrayage centrifuge,
 * comme sur un cyclomoteur ou un scooter. Module pur (testé dans Node).
 *
 * Modèle quasi statique, volontairement simple pour cette étape (la vraie
 * simulation moteur — carburation, allumage, pièces — viendra à l'étape 5) :
 * - le couple dépend du régime (courbe) et de l'ouverture des gaz ;
 * - l'embrayage centrifuge mord progressivement entre deux régimes ;
 * - le variateur fait varier le rapport pour garder le moteur vers son
 *   régime de puissance, entre un rapport court (départ) et un rapport long ;
 * - le rapport long est limité (bridage) : à 45 km/h le moteur atteint le
 *   rupteur. Le débridage sera une amélioration mécanique !
 */
export interface DrivetrainSpec {
  readonly idleRpm: number;
  /** L'embrayage commence à mordre. */
  readonly clutchEngageRpm: number;
  /** L'embrayage transmet tout le couple. */
  readonly clutchLockRpm: number;
  /** Rupteur : coupure de l'allumage. */
  readonly limiterRpm: number;
  /** Courbe de couple plein gaz : [tr/min, N·m], régimes croissants. */
  readonly torqueCurve: ReadonlyArray<readonly [number, number]>;
  /** Démultiplication totale moteur → roue, variateur au plus court. */
  readonly lowRatio: number;
  /** Démultiplication au plus long (bridage). */
  readonly highRatio: number;
  /** Régime visé par le variateur à gaz nuls et à plein gaz. */
  readonly variatorRpm: readonly [number, number];
  readonly efficiency: number;
  /** Frein moteur au rupteur (N·m, couple résistant). */
  readonly engineBrakeTorque: number;
  readonly wheelRadius: number;
}

export const CYCLO_DRIVETRAIN: DrivetrainSpec = {
  idleRpm: 1800,
  clutchEngageRpm: 3400,
  clutchLockRpm: 5200,
  limiterRpm: 9000,
  torqueCurve: [
    [1000, 0.8],
    [2000, 1.6],
    [3000, 2.4],
    [4500, 3.1],
    [6000, 3.5],
    [7000, 3.6],
    [8000, 3.3],
    [9000, 2.6],
    [10000, 1.2],
  ],
  lowRatio: 40,
  highRatio: 20.4,
  variatorRpm: [4500, 7000],
  efficiency: 0.85,
  engineBrakeTorque: 0.8,
  wheelRadius: 0.27,
};

/** Interpolation linéaire dans une courbe [x, y] triée. */
export function sampleCurve(curve: ReadonlyArray<readonly [number, number]>, x: number): number {
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (!first || !last) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i]!;
    const [x0, y0] = curve[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

const TWO_PI = Math.PI * 2;
/** Vitesse de réaction du régime moteur (1/s). */
const RPM_RESPONSE = 10;

export class Drivetrain {
  /** Régime moteur (tr/min). 0 = moteur arrêté. */
  rpm = 0;
  /** Rapport de démultiplication courant. */
  ratio: number;
  /** Engagement de l'embrayage (0 à 1). */
  clutch = 0;
  running = false;

  constructor(readonly spec: DrivetrainSpec) {
    this.ratio = spec.lowRatio;
  }

  start(): void {
    this.running = true;
    this.rpm = Math.max(this.rpm, this.spec.idleRpm);
  }

  stop(): void {
    this.running = false;
  }

  /**
   * Avance d'un pas et retourne la force motrice au sol (N, négative en
   * frein moteur).
   * @param throttle ouverture des gaz (0 à 1)
   * @param wheelSpeed vitesse de la roue arrière au sol (m/s)
   */
  update(dt: number, throttle: number, wheelSpeed: number): number {
    const s = this.spec;
    const gas = this.running ? Math.min(Math.max(throttle, 0), 1) : 0;
    const wheelRpm = (Math.max(wheelSpeed, 0) / (TWO_PI * s.wheelRadius)) * 60;

    // Variateur : rapport qui ramène le moteur vers son régime cible.
    const variatorTarget = s.variatorRpm[0] + gas * (s.variatorRpm[1] - s.variatorRpm[0]);
    this.ratio = wheelRpm > 1 ? Math.min(s.lowRatio, Math.max(s.highRatio, variatorTarget / wheelRpm)) : s.lowRatio;
    const coupledRpm = wheelRpm * this.ratio;

    // Régime moteur : libre (embrayage ouvert) ou entraîné par la roue.
    let target: number;
    if (!this.running) {
      target = 0;
    } else {
      const freeRpm = s.idleRpm + gas * (s.clutchLockRpm - s.idleRpm);
      target = Math.max(freeRpm, coupledRpm);
    }
    this.rpm += (target - this.rpm) * (1 - Math.exp(-RPM_RESPONSE * dt));
    this.rpm = Math.min(this.rpm, s.limiterRpm + 300);
    this.clutch = this.running ? smoothstep(s.clutchEngageRpm, s.clutchLockRpm, this.rpm) : 0;
    if (!this.running || this.clutch === 0) return 0;

    let torque = this.rpm >= s.limiterRpm ? 0 : sampleCurve(s.torqueCurve, this.rpm) * gas;
    if (gas < 0.05) torque -= s.engineBrakeTorque * (this.rpm / s.limiterRpm);
    return (torque * this.clutch * this.ratio * s.efficiency) / s.wheelRadius;
  }
}
