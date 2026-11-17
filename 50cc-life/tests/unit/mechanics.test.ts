import { describe, expect, it } from 'vitest';
import { EngineAssembly, createPart, stockSm50 } from '../../src/mechanics/EngineAssembly';
import { PART_CATALOG } from '../../src/mechanics/parts';
import { SM50_SLOTS } from '../../src/mechanics/slots';

const stock = () => stockSm50(new EngineAssembly(SM50_SLOTS, PART_CATALOG));

describe('ordre de démontage', () => {
  it('le moteur d’origine tourne, CDI bridé à 8 700 tr/min, pot et cartouche bridés', () => {
    const stats = stock().stats();
    expect(stats.canRun).toBe(true);
    expect(stats.limiterRpm).toBe(8700);
    expect(stats.missing).toEqual([]);
    expect(stats.restrictions.length).toBe(3); // pot, cartouche, carburateur
  });

  it('la cartouche se monte sur le pot : on la retire avant lui', () => {
    const engine = stock();
    expect(engine.removalBlocker('exhaust')).toBe("Retirez d'abord : Cartouche");
    const silencer = engine.remove('silencer');
    expect(engine.removalBlocker('exhaust')).toBeNull();
    const chamber = engine.remove('exhaust');
    expect(engine.installBlocker('silencer', silencer)).toBe("Il faut d'abord : Pot de détente");
    engine.install('exhaust', chamber);
    engine.install('silencer', silencer);
    expect(engine.stats()).toEqual(stock().stats());
  });

  it('on ne retire pas le cylindre tant que culasse et pot sont montés', () => {
    const engine = stock();
    expect(engine.removalBlocker('cylinder')).toBe("Retirez d'abord : Culasse, Pot de détente");
    expect(engine.removalBlocker('head')).toBe("Retirez d'abord : Bougie");
    engine.remove('sparkPlug');
    engine.remove('head');
    engine.remove('silencer');
    engine.remove('exhaust');
    expect(engine.removalBlocker('cylinder')).toBeNull();
    engine.remove('cylinder');
    expect(engine.removalBlocker('piston')).toBeNull();
  });

  it('on ne remonte pas une pièce sur une pièce absente, ni au mauvais endroit', () => {
    const engine = stock();
    const plug = engine.remove('sparkPlug');
    engine.remove('head');
    expect(engine.installBlocker('sparkPlug', plug)).toBe("Il faut d'abord : Culasse");
    expect(engine.installBlocker('exhaust', plug)).toBe('Emplacement occupé');
    expect(engine.installBlocker('head', plug)).toBe('Pièce incompatible');
    expect(() => engine.install('sparkPlug', plug)).toThrow();
  });

  it('démonter puis remonter rend le même moteur', () => {
    const engine = stock();
    const before = engine.stats();
    const plug = engine.remove('sparkPlug');
    engine.install('sparkPlug', plug);
    expect(engine.stats()).toEqual(before);
  });

  it('slotsFor : emplacements compatibles', () => {
    const engine = stock();
    expect(engine.slotsFor(createPart('exhaust-racing')).map((s) => s.id)).toEqual(['exhaust']);
    expect(engine.slotsFor(createPart('silencer-racing')).map((s) => s.id)).toEqual(['silencer']);
  });
});

describe('effet des pièces sur le moteur', () => {
  it('sans bougie : ne démarre pas, et dit ce qui manque', () => {
    const engine = stock();
    engine.remove('sparkPlug');
    const stats = engine.stats();
    expect(stats.canRun).toBe(false);
    expect(stats.missing).toEqual(['Bougie']);
  });

  it('sans cartouche : tourne, un peu moins puissant, très bruyant', () => {
    const engine = stock();
    const before = engine.stats();
    engine.remove('silencer');
    const after = engine.stats();
    expect(after.canRun).toBe(true);
    expect(after.loudness).toBeGreaterThan(0.8);
    expect(after.powerFactor).toBeLessThan(before.powerFactor);
    expect(after.restrictions.length).toBe(before.restrictions.length - 1);
  });

  it('sans pot du tout : tourne quand même, à pleine voix et sans force', () => {
    const engine = stock();
    const before = engine.stats();
    engine.remove('silencer');
    engine.remove('exhaust');
    const after = engine.stats();
    expect(after.canRun).toBe(true);
    expect(after.loudness).toBe(1);
    expect(after.powerFactor).toBeLessThan(before.powerFactor * 0.7);
  });

  it('CDI débridé : rupteur à 11 800 tr/min', () => {
    const engine = stock();
    engine.remove('ignition');
    engine.install('ignition', createPart('cdi-free'));
    expect(engine.stats().limiterRpm).toBe(11800);
  });

  it('pot TURBINO : plus de puissance, plus de bruit, plus de bridage du pot', () => {
    const engine = stock();
    const before = engine.stats();
    engine.remove('silencer');
    engine.remove('exhaust');
    engine.install('exhaust', createPart('exhaust-racing'));
    engine.install('silencer', createPart('silencer-racing'));
    const after = engine.stats();
    expect(after.powerFactor).toBeCloseTo(before.powerFactor * 1.15 * 1.03);
    expect(after.loudness).toBeGreaterThan(before.loudness + 0.3);
    expect(after.restrictions.length).toBe(1); // reste le petit carburateur
  });

  it('bougie neuve : démarre bien plus facilement que la bougie usée', () => {
    const engine = stock();
    const worn = engine.stats().startChance;
    engine.remove('sparkPlug');
    engine.install('sparkPlug', createPart('plug-std', 1));
    expect(engine.stats().startChance).toBeGreaterThan(worn + 0.25);
  });

  it('piston usé : moins de puissance', () => {
    const fresh = stock();
    const worn = stock();
    worn.part('piston')!.condition = 0.2;
    expect(worn.stats().powerFactor).toBeLessThan(fresh.stats().powerFactor);
  });
});
