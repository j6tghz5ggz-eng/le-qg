import { describe, expect, it } from 'vitest';
import { conditionLabel, describePart, sellPrice } from '../../src/economy/shop';
import { PART_CATALOG } from '../../src/mechanics/parts';
import { SAVE_VERSION, parseSave, serializeSave, type SaveData } from '../../src/save/saveData';

const def = (id: string) => PART_CATALOG.get(id)!;

describe('boutique', () => {
  it('revente : une pièce neuve vaut 65 % du neuf, une épave 15 %', () => {
    expect(sellPrice(def('exhaust-racing'), 1)).toBe(Math.round(189 * 0.65));
    expect(sellPrice(def('exhaust-racing'), 0)).toBe(Math.round(189 * 0.15));
    expect(sellPrice(def('plug-std'), 0)).toBeGreaterThanOrEqual(1);
    expect(sellPrice(def('cdi-free'), 0.5)).toBeLessThan(sellPrice(def('cdi-free'), 1));
  });

  it('fiche produit : ce que fait la pièce', () => {
    expect(describePart(def('cdi-free'))).toMatch(/11\s800/);
    expect(describePart(def('exhaust-racing'))).toContain('+15 %');
    expect(describePart(def('exhaust-stock'))).toContain('Bridé');
    expect(describePart(def('head-50'))).toBe("Pièce d'origine");
  });

  it('état d’une pièce', () => {
    expect(conditionLabel(1)).toBe('Neuve');
    expect(conditionLabel(0.8)).toBe('Bon état');
    expect(conditionLabel(0.3)).toBe('Très usée');
  });
});

describe('sauvegarde', () => {
  const sample: SaveData = {
    version: SAVE_VERSION,
    savedAt: 1_700_000_000_000,
    money: 1234,
    player: { x: 1, y: 0.2, z: -3, yaw: 0.5 },
    bike: {
      x: 0.95,
      y: 0.15,
      z: 12.4,
      yaw: Math.PI,
      parts: { sparkPlug: { defId: 'plug-std', condition: 0.3 } },
      fluids: { fuel: 2.4, premixOil: 0, oilTank: 0.8 },
    },
    loose: [{ defId: 'cdi-free', condition: 1, x: -3.4, y: 1.1, z: 11 }],
    containers: [{ kind: 'jerrican', amount: 3.2, x: -3.3, y: 0.35, z: 14.3 }],
  };

  it('aller-retour sans perte', () => {
    expect(parseSave(serializeSave(sample), PART_CATALOG)).toEqual(sample);
  });

  it('absente, illisible ou d’une autre version : nouvelle partie', () => {
    expect(parseSave(null, PART_CATALOG)).toBeNull();
    expect(parseSave('{pas du json', PART_CATALOG)).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample, version: 99 }), PART_CATALOG)).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample, money: 'beaucoup' }), PART_CATALOG)).toBeNull();
  });

  it('ignore ce qui est invalide sans tout jeter', () => {
    const raw = JSON.stringify({
      ...sample,
      money: -50,
      bike: { ...sample.bike, parts: { sparkPlug: { defId: 'plug-std', condition: 7 }, exhaust: { defId: 'pot-inconnu', condition: 1 } } },
      loose: [{ defId: 'cdi-free', condition: 1, x: 'ici', y: 0, z: 0 }, { defId: 'carb-17', condition: 0.5, x: 1, y: 2, z: 3 }],
    });
    const save = parseSave(raw, PART_CATALOG)!;
    expect(save.money).toBe(0);
    expect(save.bike!.parts).toEqual({ sparkPlug: { defId: 'plug-std', condition: 1 } });
    expect(save.loose).toEqual([{ defId: 'carb-17', condition: 0.5, x: 1, y: 2, z: 3 }]);
  });

  it('relit une sauvegarde de version 1 (sans niveaux ni bidons)', () => {
    const v1 = { ...sample, version: 1, bike: { ...sample.bike, fluids: undefined }, containers: undefined };
    const save = parseSave(JSON.stringify(v1), PART_CATALOG)!;
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.bike!.fluids).toBeNull();
    expect(save.containers).toEqual([]);
    expect(save.money).toBe(1234);
  });
});
