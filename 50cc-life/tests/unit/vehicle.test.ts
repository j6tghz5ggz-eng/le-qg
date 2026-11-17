import { describe, expect, it } from 'vitest';
import {
  aeroDrag,
  approach,
  frictionScale,
  maxSteerAngle,
  splitGrip,
  suspensionForce,
  targetLeanAngle,
  tireRollTorque,
} from '../../src/vehicles/bike/bikeMath';
import { CYCLO_DRIVETRAIN, Drivetrain, sampleCurve } from '../../src/vehicles/simulation/Drivetrain';

const MASS = 155; // moto + pilote (kg)
const CDA = 0.6;
const ROLLING = 0.015;
const DT = 1 / 60;

/** Ligne droite simplifiée : renvoie la vitesse au cours du temps. */
function straightLine(seconds: number, throttle: (t: number) => number, startSpeed = 0) {
  const drivetrain = new Drivetrain(CYCLO_DRIVETRAIN);
  drivetrain.start();
  let v = startSpeed;
  const samples: Array<{ t: number; v: number; rpm: number }> = [];
  for (let i = 0; i < seconds / DT; i++) {
    const t = i * DT;
    const drive = drivetrain.update(DT, throttle(t), v);
    const resist = aeroDrag(v, CDA) - (v > 0.05 ? ROLLING * MASS * 9.81 : 0);
    v = Math.max(0, v + ((drive + resist) / MASS) * DT);
    samples.push({ t, v, rpm: drivetrain.rpm });
  }
  return samples;
}

describe('moteur 50 cc et variateur', () => {
  it('courbe de couple : interpolation et bornes', () => {
    expect(sampleCurve(CYCLO_DRIVETRAIN.torqueCurve, 7000)).toBeCloseTo(3.6);
    expect(sampleCurve(CYCLO_DRIVETRAIN.torqueCurve, 6500)).toBeCloseTo(3.55);
    expect(sampleCurve(CYCLO_DRIVETRAIN.torqueCurve, 0)).toBeCloseTo(0.8);
    expect(sampleCurve(CYCLO_DRIVETRAIN.torqueCurve, 20000)).toBeCloseTo(1.2);
  });

  it('au ralenti et à l’arrêt : embrayage ouvert, aucune force', () => {
    const d = new Drivetrain(CYCLO_DRIVETRAIN);
    d.start();
    let force = 0;
    for (let i = 0; i < 120; i++) force = d.update(DT, 0, 0);
    expect(d.rpm).toBeCloseTo(CYCLO_DRIVETRAIN.idleRpm, -1);
    expect(d.clutch).toBe(0);
    expect(force).toBe(0);
  });

  it('moteur arrêté : aucune force même plein gaz', () => {
    const d = new Drivetrain(CYCLO_DRIVETRAIN);
    expect(d.update(DT, 1, 0)).toBe(0);
  });

  it('bridé à 45 km/h : vitesse max entre 43 et 46 km/h', () => {
    const samples = straightLine(40, () => 1);
    const top = Math.max(...samples.map((s) => s.v)) * 3.6;
    expect(top).toBeGreaterThan(43);
    expect(top).toBeLessThan(46);
  });

  it('0 à 30 km/h entre 3 et 8 secondes (cyclomoteur)', () => {
    const samples = straightLine(15, () => 1);
    const reached = samples.find((s) => s.v * 3.6 >= 30);
    expect(reached).toBeDefined();
    expect(reached!.t).toBeGreaterThan(3);
    expect(reached!.t).toBeLessThan(8);
  });

  it('le régime ne dépasse jamais le rupteur de plus de 300 tr/min', () => {
    const samples = straightLine(30, () => 1);
    expect(Math.max(...samples.map((s) => s.rpm))).toBeLessThanOrEqual(CYCLO_DRIVETRAIN.limiterRpm + 300);
  });

  it('gaz coupés à 40 km/h : frein moteur, puis roue libre à basse vitesse', () => {
    const d = new Drivetrain(CYCLO_DRIVETRAIN);
    d.start();
    for (let i = 0; i < 60; i++) d.update(DT, 1, 11);
    let force = 0;
    for (let i = 0; i < 30; i++) force = d.update(DT, 0, 11);
    expect(force).toBeLessThan(0);
    for (let i = 0; i < 120; i++) force = d.update(DT, 0, 0.5);
    expect(force).toBeCloseTo(0, 1);
  });
});

describe('calculs de la moto', () => {
  it('braquage : grand à l’arrêt, faible à pleine vitesse', () => {
    expect(maxSteerAngle(0, 0.6, 0.06, 12)).toBeCloseTo(0.6);
    expect(maxSteerAngle(12, 0.6, 0.06, 12)).toBeCloseTo(0.06);
    expect(maxSteerAngle(30, 0.6, 0.06, 12)).toBeCloseTo(0.06);
    expect(maxSteerAngle(6, 0.6, 0.06, 12)).toBeLessThan(0.6);
  });

  it('inclinaison d’équilibre : tan φ = v·ω / g, signe du virage, limitée', () => {
    expect(targetLeanAngle(10, 0.5, 1)).toBeCloseTo(Math.atan(5 / 9.81));
    expect(targetLeanAngle(10, -0.5, 1)).toBeCloseTo(-Math.atan(5 / 9.81));
    expect(targetLeanAngle(30, 2, 0.8)).toBeCloseTo(0.8);
    expect(targetLeanAngle(0, 2, 0.8)).toBe(0);
  });

  it('couple des pneus : redresse vers l’extérieur du virage, nul en ligne droite', () => {
    expect(tireRollTorque(155, 0.6, 5, 0.3)).toBeLessThan(0); // virage à droite → pousse à gauche
    expect(tireRollTorque(155, 0.6, -5, -0.3)).toBeGreaterThan(0);
    expect(tireRollTorque(155, 0.6, 0, 0.2)).toBeCloseTo(0);
    expect(tireRollTorque(155, 0.6, 5, 0)).toBeCloseTo(-155 * 0.6 * 5);
  });

  it('amortisseur : ressort + amortissement, jamais négatif', () => {
    expect(suspensionForce(0.05, 0, 20000, 1500)).toBeCloseTo(1000);
    expect(suspensionForce(0.05, 0.2, 20000, 1500)).toBeCloseTo(1300);
    expect(suspensionForce(0.01, -1, 20000, 1500)).toBe(0);
  });

  it('cercle de friction', () => {
    expect(frictionScale(300, 400, 1000)).toBe(1);
    expect(frictionScale(600, 800, 500)).toBeCloseTo(0.5);
    expect(frictionScale(0, 0, 0)).toBe(1);
  });

  it('adhérence : priorité au latéral, le freinage prend le reste', () => {
    expect(splitGrip(300, 400, 1000)).toEqual([300, 400]);
    const [lat, long] = splitGrip(600, -1000, 1000);
    expect(lat).toBe(600);
    expect(long).toBeCloseTo(-800);
    expect(splitGrip(1500, 200, 1000)).toEqual([1000, 0]);
    expect(splitGrip(100, 100, 0)).toEqual([0, 0]);
  });

  it('approach et traînée', () => {
    expect(approach(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(approach(1, 0, 0.3)).toBeCloseTo(0.7);
    expect(approach(0.9, 1, 0.3)).toBe(1);
    expect(aeroDrag(10, 0.6)).toBeCloseTo(-36);
    expect(aeroDrag(-10, 0.6)).toBeCloseTo(36);
  });
});
