import { describe, expect, it } from 'vitest';
import { EngineAssembly, createPart, stockSm50 } from '../../src/mechanics/EngineAssembly';
import { PART_CATALOG } from '../../src/mechanics/parts';
import { SM50_SLOTS } from '../../src/mechanics/slots';
import { lubricationQuality, wearStep } from '../../src/mechanics/wear';
import { CYCLO, SM50 } from '../../src/vehicles/bike/specs';
import { FuelTank } from '../../src/vehicles/fuel/FuelTank';
import { ManualDrivetrain, SM50_DRIVETRAIN } from '../../src/vehicles/simulation/ManualDrivetrain';
import type { EngineStats } from '../../src/vehicles/simulation/Powertrain';

describe('fiches des vrais modèles', () => {
  it('supermotard type MRT 50 : 6 L, graissage séparé (huile 1,2 L, pompe 2 % à fond)', () => {
    expect(SM50.fuel.tankLiters).toBe(6);
    expect(SM50.fuel.lubrication).toMatchObject({ kind: 'injection', oilTankLiters: 1.2, fullRatio: 0.02 });
  });

  it('cyclo type MBK 51 : 3,65 L dont 0,3 L de réserve, mélange à 2 %', () => {
    expect(CYCLO.fuel).toMatchObject({ tankLiters: 3.65, reserveLiters: 0.3, lubrication: { kind: 'premix', ratio: 0.02 } });
  });
});

describe('réservoir', () => {
  it('mélange : 20 ml d’huile par litre = 2 %, reçu tel quel par le moteur', () => {
    const tank = new FuelTank(CYCLO.fuel);
    tank.addFuel(3);
    tank.addPremixOil(0.06);
    expect(tank.mixRatio).toBeCloseTo(0.02);
    const r = tank.consume(60, 1.5, 0.8);
    expect(r.starved).toBe(false);
    expect(r.lubrication).toBeCloseTo(0.02);
    expect(tank.fuel).toBeCloseTo(3 - 1.5 / 60);
  });

  it('on ne verse pas plus que la contenance', () => {
    const tank = new FuelTank(CYCLO.fuel, { fuel: 3.5, premixOil: 0.07, oilTank: 0 });
    expect(tank.addFuel(5)).toBeCloseTo(0.08);
    expect(tank.volume).toBeCloseTo(3.65);
  });

  it('graissage séparé : la pompe dose selon les gaz, et rien si le réservoir d’huile est vide', () => {
    const tank = new FuelTank(SM50.fuel, { fuel: 4, premixOil: 0, oilTank: 1 });
    expect(tank.consume(10, 1, 1).lubrication).toBeCloseTo(0.02);
    expect(tank.consume(10, 1, 0).lubrication).toBeCloseTo(0.006);
    tank.oilTank = 0;
    expect(tank.consume(10, 1, 1).lubrication).toBe(0);
  });

  it('panne sèche quand le réservoir est vide ; réserve signalée avant', () => {
    const tank = new FuelTank(CYCLO.fuel, { fuel: 0.28, premixOil: 0.006, oilTank: 0 });
    expect(tank.onReserve).toBe(true);
    let starved = false;
    for (let i = 0; i < 2000 && !starved; i++) starved = tank.consume(1, 2, 1).starved;
    expect(starved).toBe(true);
  });
});

describe('usure et serrage', () => {
  const ride = (lubrication: number, seconds: number, throttle = 0.7, rpm = 7000) => {
    let piston = 0;
    let plug = 0;
    let seize = 0;
    for (let t = 0; t < seconds; t++) {
      const w = wearStep({ dt: 1, rpm, limiterRpm: 8700, throttle, lubrication });
      piston += w.piston;
      plug += w.sparkPlug;
      seize = Math.max(0, seize + w.seize);
    }
    return { piston, plug, seize };
  };

  it('bien graissé (2 %) : usure lente, jamais de serrage', () => {
    const r = ride(0.02, 600);
    expect(r.piston).toBeLessThan(0.06);
    expect(r.seize).toBe(0);
    expect(lubricationQuality(0.02)).toBe(1);
  });

  it('mélange pauvre (1 %) : le piston s’use au moins deux fois plus vite', () => {
    expect(ride(0.01, 600).piston).toBeGreaterThan(ride(0.02, 600).piston * 2);
  });

  it('sans huile, à fond : le moteur serre en moins d’une minute', () => {
    expect(ride(0, 60, 1, 8600).seize).toBeGreaterThanOrEqual(1);
  });

  it('trop d’huile (5 %) : la bougie s’encrasse bien plus vite', () => {
    expect(ride(0.05, 600).plug).toBeGreaterThan(ride(0.02, 600).plug * 3);
  });

  it('piston grippé : le moteur ne démarre plus et le dit', () => {
    const engine = stockSm50(new EngineAssembly(SM50_SLOTS, PART_CATALOG));
    engine.part('piston')!.condition = 0;
    const stats = engine.stats();
    expect(stats.seized).toBe(true);
    expect(stats.canRun).toBe(false);
    expect(stats.missing).toContain('Piston (serré)');
    engine.remove('silencer');
    // Changer le piston (démontage complet du haut moteur) répare.
    for (const slot of ['sparkPlug', 'head', 'exhaust', 'cylinder', 'piston']) engine.remove(slot);
    engine.install('piston', createPart('piston-40'));
    expect(engine.stats().seized).toBe(false);
  });
});

describe('moteur', () => {
  const DT = 1 / 60;
  const stockStats = (): EngineStats => ({ ...stockSm50(new EngineAssembly(SM50_SLOTS, PART_CATALOG)).stats(), startChance: 1 });

  it('moteur serré, embrayage relâché : la roue arrière est freinée ; embrayage tiré : roue libre', () => {
    const d = new ManualDrivetrain(SM50_DRIVETRAIN);
    d.setEngineStats(stockStats());
    d.start(0, () => 0);
    for (let i = 0; i < 4; i++) d.shiftUp(1); // 4e
    d.setEngineStats({ ...stockStats(), seized: true, canRun: false });
    expect(d.update(DT, { throttle: 1, clutch: 0 }, 12).force).toBeLessThan(-300);
    expect(d.update(DT, { throttle: 1, clutch: 1 }, 12).force).toBeCloseTo(0);
    expect(d.running).toBe(false);
  });

  it('sans essence : le moteur s’arrête et refuse de démarrer', () => {
    const d = new ManualDrivetrain(SM50_DRIVETRAIN);
    d.setEngineStats(stockStats());
    expect(d.start(0, () => 0).ok).toBe(true);
    d.setFuelSupply(false);
    expect(d.running).toBe(false);
    expect(d.start(0, () => 0)).toEqual({ ok: false, reason: 'noFuel' });
  });

  it('consommation bridée à fond sur le plat : environ 3 L/100 km', () => {
    // Moto lancée en 6e vers 50 km/h, plein gaz pendant 2 minutes.
    const d = new ManualDrivetrain(SM50_DRIVETRAIN);
    d.setEngineStats(stockStats());
    d.start(0, () => 0);
    for (let i = 0; i < 6; i++) d.shiftUp(1);
    const mass = 173;
    let v = 13.5;
    let liters = 0;
    let meters = 0;
    for (let i = 0; i < 120 / DT; i++) {
      const out = d.update(DT, { throttle: 1, clutch: 0 }, v);
      const resist = 0.5 * 1.2 * 0.55 * v * v + 0.015 * mass * 9.81;
      v += ((out.force * mass) / (mass + out.inertiaMass) - resist) / mass * DT;
      liters += (d.fuelFlowLph * DT) / 3600;
      meters += v * DT;
    }
    const per100 = (liters / meters) * 100_000;
    expect(per100).toBeGreaterThan(2.3);
    expect(per100).toBeLessThan(3.8);
  });
});
