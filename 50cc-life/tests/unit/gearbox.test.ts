import { describe, expect, it } from 'vitest';
import { EngineAssembly, createPart, stockSm50 } from '../../src/mechanics/EngineAssembly';
import { PART_CATALOG } from '../../src/mechanics/parts';
import { SM50_SLOTS } from '../../src/mechanics/slots';
import { AutoClutch } from '../../src/vehicles/simulation/AutoClutch';
import { ManualDrivetrain, SM50_DRIVETRAIN, clutchEngagement } from '../../src/vehicles/simulation/ManualDrivetrain';
import { restrictionFactor, type EngineStats } from '../../src/vehicles/simulation/Powertrain';

const DT = 1 / 60;
const MASS = 98 + 75; // supermotard + pilote
const CDA = 0.55;
const ROLLING = 0.015;

const G = 9.81;

/** Moteur d'origine tel qu'il sort de l'usine (bridé), avec les vraies pièces. */
function stockEngine(): EngineAssembly {
  return stockSm50(new EngineAssembly(SM50_SLOTS, PART_CATALOG));
}

/** Kit de débridage : CDI, pot et cartouche « course ». */
function freeEngine(): EngineAssembly {
  const engine = stockEngine();
  engine.remove('silencer');
  engine.remove('exhaust');
  engine.remove('ignition');
  engine.install('ignition', createPart('cdi-free'));
  engine.install('exhaust', createPart('exhaust-racing'));
  engine.install('silencer', createPart('silencer-racing'));
  return engine;
}

const RESTRICTED: EngineStats = { ...stockEngine().stats(), startChance: 1 };
const FREE: EngineStats = { ...freeEngine().stats(), startChance: 1 };

function running(stats = RESTRICTED): ManualDrivetrain {
  const d = new ManualDrivetrain(SM50_DRIVETRAIN);
  d.setEngineStats(stats);
  expect(d.start(0, () => 0).ok).toBe(true);
  return d;
}

/**
 * Avance d'un pas en ligne droite (modèle 1D). `slope` : pente en fraction
 * (0,06 = 6 %), positive en montée, négative en descente.
 */
function step(d: ManualDrivetrain, v: number, throttle: number, clutch: number, slope = 0): number {
  const out = d.update(DT, { throttle, clutch }, v);
  const drive = (out.force * MASS) / (MASS + out.inertiaMass);
  const angle = Math.atan(slope);
  const resist =
    -0.5 * 1.2 * CDA * v * Math.abs(v) - (v > 0.05 ? ROLLING * MASS * G * Math.cos(angle) : 0) - MASS * G * Math.sin(angle);
  return Math.max(0, v + ((drive + resist) / MASS) * DT);
}

/**
 * Pilote virtuel : démarre en 1re, passe les vitesses vers `shiftRpm` (ou
 * juste sous le rupteur s'il est plus bas), plein gaz tout du long.
 */
function fullThrottleRun(d: ManualDrivetrain, seconds: number, slope = 0, shiftRpm = 9800) {
  let v = 0;
  let lever = 1;
  let shiftTimer = 0;
  // Départ arrêté : embrayage relâché en 1,5 s ; ensuite 0,5 s à chaque vitesse.
  let release = 1.5;
  d.shiftUp(1); // N → 1re
  const speeds: number[] = [];
  let stalled = false;
  for (let i = 0; i < seconds / DT; i++) {
    if (shiftTimer > 0) {
      shiftTimer -= DT;
      lever = 1;
      if (shiftTimer <= 0) {
        d.shiftUp(1);
        release = 0.5;
      }
    } else {
      lever = Math.max(0, lever - DT / release);
      // Passe la vitesse au rupteur, ou vers le pic de puissance s'il est plus bas.
      if (d.gear < 6 && d.locked && d.rpm > Math.min(d.limiterRpm - 250, shiftRpm)) shiftTimer = 0.15;
    }
    v = step(d, v, 1, lever, slope);
    if (d.consumeStall()) stalled = true;
    speeds.push(v);
  }
  return { speeds, stalled, top: Math.max(...speeds) * 3.6 };
}

describe('boîte 6 vitesses : embrayage, démarrage, calage', () => {
  it('engagement : nul levier tiré, total levier relâché, progressif entre les deux', () => {
    expect(clutchEngagement(1)).toBe(0);
    expect(clutchEngagement(0)).toBe(1);
    expect(clutchEngagement(0.55)).toBeGreaterThan(0.2);
    expect(clutchEngagement(0.55)).toBeLessThan(0.8);
  });

  it('au point mort, le ralenti se stabilise vers 1 600 tr/min', () => {
    const d = running();
    for (let i = 0; i < 180; i++) d.update(DT, { throttle: 0, clutch: 0 }, 0);
    expect(d.rpm).toBeGreaterThan(1400);
    expect(d.rpm).toBeLessThan(1800);
    expect(d.running).toBe(true);
  });

  it('kick : refusé en vitesse embrayage relâché, accepté au point mort ou embrayage tiré', () => {
    const d = new ManualDrivetrain(SM50_DRIVETRAIN);
    d.setEngineStats(RESTRICTED);
    d.shiftUp(1); // 1re
    expect(d.start(0, () => 0)).toEqual({ ok: false, reason: 'inGear' });
    expect(d.start(1, () => 0).ok).toBe(true);
  });

  it('kick : peut échouer (bougie usée), impossible s’il manque une pièce', () => {
    const d = new ManualDrivetrain(SM50_DRIVETRAIN);
    d.setEngineStats({ ...RESTRICTED, startChance: 0.5 });
    expect(d.start(0, () => 0.9)).toEqual({ ok: false, reason: 'failed' });
    d.setEngineStats({ ...RESTRICTED, canRun: false, missing: ['Bougie'] });
    expect(d.start(0, () => 0)).toEqual({ ok: false, reason: 'missing', missing: ['Bougie'] });
  });

  it('lâcher l’embrayage d’un coup au ralenti en 1re : le moteur cale', () => {
    const d = running();
    d.shiftUp(1);
    let v = 0;
    let stalled = false;
    for (let i = 0; i < 90; i++) {
      v = step(d, v, 0, 0);
      if (d.consumeStall()) stalled = true;
    }
    expect(stalled).toBe(true);
    expect(d.running).toBe(false);
  });

  it('démarrage en montant dans les tours et en relâchant doucement : pas de calage', () => {
    const d = running();
    d.shiftUp(1);
    let v = 0;
    for (let i = 0; i < 180; i++) v = step(d, v, 1, Math.max(0, 1 - (i * DT) / 1.2));
    expect(d.running).toBe(true);
    expect(v).toBeGreaterThan(3);
  });

  it('passages : embrayage obligatoire, ordre N - 1 - 2 - 3…', () => {
    const d = running();
    expect(d.shiftUp(0)).toEqual({ ok: false, reason: 'clutch' });
    expect(d.shiftDown(1)).toEqual({ ok: false, reason: 'limit' });
    expect(d.shiftUp(1)).toEqual({ ok: true, gear: '1' });
    expect(d.shiftDown(1)).toEqual({ ok: true, gear: 'N' });
    expect(d.shiftUp(1)).toEqual({ ok: true, gear: '1' });
    expect(d.shiftUp(1)).toEqual({ ok: true, gear: '2' });
    for (let i = 0; i < 4; i++) d.shiftUp(1);
    expect(d.gearLabel).toBe('6');
    expect(d.shiftUp(1)).toEqual({ ok: false, reason: 'limit' });
  });
});

describe('performances (ligne droite simulée)', () => {
  it('les pièces d’origine étranglent le moteur à haut régime', () => {
    expect(restrictionFactor(RESTRICTED.restrictions, 4000)).toBe(1);
    expect(restrictionFactor(RESTRICTED.restrictions, 7500)).toBeLessThan(0.6);
    expect(restrictionFactor(RESTRICTED.restrictions, 8500)).toBeLessThan(0.42);
    expect(restrictionFactor(FREE.restrictions, 8500)).toBe(1);
    expect(RESTRICTED.limiterRpm).toBe(8700);
  });

  it('d’origine (bridée), à plat : plafonne vers 50 km/h, sans caler', () => {
    const run = fullThrottleRun(running(RESTRICTED), 50, 0, 7000);
    expect(run.stalled).toBe(false);
    expect(run.top).toBeGreaterThan(48);
    expect(run.top).toBeLessThan(52);
  });

  it('d’origine, en descente à 6 % : 55 à 60 km/h (le CDI coupe vers 60)', () => {
    const run = fullThrottleRun(running(RESTRICTED), 60, -0.06, 7000);
    expect(run.top).toBeGreaterThan(55);
    expect(run.top).toBeLessThan(61.5);
  });

  it('d’origine, en montée à 6 % : nettement plus lente qu’à plat', () => {
    const flat = fullThrottleRun(running(RESTRICTED), 50, 0, 7000).top;
    const climb = fullThrottleRun(running(RESTRICTED), 50, 0.06, 7000).top;
    expect(climb).toBeLessThan(flat - 8);
    expect(climb).toBeGreaterThan(28);
  });

  it('débridée (CDI, pot et cartouche course) : environ 70 km/h', () => {
    const run = fullThrottleRun(running(FREE), 60);
    expect(run.stalled).toBe(false);
    expect(run.top).toBeGreaterThan(68);
    expect(run.top).toBeLessThan(80);
  });

  it('avec en plus le carburateur 17,5 : encore plus vite', () => {
    const engine = freeEngine();
    engine.remove('carburetor');
    engine.install('carburetor', createPart('carb-17'));
    const kit = fullThrottleRun(running({ ...engine.stats(), startChance: 1 }), 60).top;
    expect(kit).toBeGreaterThan(fullThrottleRun(running(FREE), 60).top + 3);
    expect(kit).toBeLessThan(90);
  });

  it('un pot plus puissant fait gagner en accélération', () => {
    const stock = fullThrottleRun(running(FREE), 8).speeds.at(-1)!;
    const racing = fullThrottleRun(running({ ...FREE, powerFactor: FREE.powerFactor * 1.15 }), 8).speeds.at(-1)!;
    expect(racing).toBeGreaterThan(stock);
  });

  it('frein moteur : gaz coupés en 3e à 25 km/h, force négative', () => {
    const d = running();
    d.shiftUp(1);
    d.shiftUp(1);
    d.shiftUp(1); // 3e
    let force = 0;
    for (let i = 0; i < 30; i++) force = d.update(DT, { throttle: 0, clutch: 0 }, 25 / 3.6).force;
    expect(d.locked).toBe(true);
    expect(force).toBeLessThan(0);
  });

  it('démarrage à la poussette : moteur coupé, en 2e, roue qui tourne, gaz ouverts', () => {
    const d = new ManualDrivetrain(SM50_DRIVETRAIN);
    d.setEngineStats(RESTRICTED);
    d.shiftUp(1);
    d.shiftUp(1); // 2e
    for (let i = 0; i < 30; i++) d.update(DT, { throttle: 0.3, clutch: 0 }, 5);
    expect(d.running).toBe(true);
  });

  it('l’inertie du moteur pèse plus en 1re qu’en 6e', () => {
    const d = running();
    d.shiftUp(1);
    let first = 0;
    for (let i = 0; i < 30; i++) first = d.update(DT, { throttle: 0.5, clutch: 0 }, 3).inertiaMass;
    for (let i = 0; i < 5; i++) d.shiftUp(1);
    let sixth = 0;
    for (let i = 0; i < 30; i++) sixth = d.update(DT, { throttle: 0.5, clutch: 0 }, 11).inertiaMass;
    expect(first).toBeGreaterThan(sixth * 5);
  });
});

describe('embrayage automatique', () => {
  it('démarre en 1re sans caler et accélère', () => {
    const d = running();
    d.shiftUp(1);
    const auto = new AutoClutch();
    let v = 0;
    let stalled = false;
    for (let i = 0; i < 240; i++) {
      const wheelRpm = (v / SM50_DRIVETRAIN.wheelRadius) * d.ratio * (60 / (2 * Math.PI));
      const lever = auto.update(DT, { rpm: d.rpm, gear: d.gear, throttle: 1, wheelRpm, running: d.running });
      v = step(d, v, 1, lever);
      if (d.consumeStall()) stalled = true;
    }
    expect(stalled).toBe(false);
    expect(v * 3.6).toBeGreaterThan(10);
  });

  it('au ralenti en vitesse, débraye (pas de calage)', () => {
    const d = running();
    d.shiftUp(1);
    const auto = new AutoClutch();
    for (let i = 0; i < 180; i++) {
      const lever = auto.update(DT, { rpm: d.rpm, gear: d.gear, throttle: 0, wheelRpm: 0, running: d.running });
      d.update(DT, { throttle: 0, clutch: lever }, 0);
    }
    expect(d.running).toBe(true);
    expect(auto.lever).toBeGreaterThan(0.9);
  });
});
