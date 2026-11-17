import { describe, expect, it, vi } from 'vitest';
import { CheatRegistry } from '../../src/debug/CheatRegistry';
import { Wallet, formatMoney } from '../../src/economy/Wallet';

describe('porte-monnaie', () => {
  it('commence à 500 €, ajoute, paie si possible', () => {
    const w = new Wallet();
    expect(w.balance).toBe(500);
    w.add(1000);
    expect(w.balance).toBe(1500);
    expect(w.spend(2000)).toBe(false);
    expect(w.balance).toBe(1500);
    expect(w.spend(499.6)).toBe(true);
    expect(w.balance).toBe(1000);
    w.add(-50); // un ajout négatif est ignoré
    expect(w.balance).toBe(1000);
  });

  it('prévient à chaque changement (solde, écart)', () => {
    const w = new Wallet(0);
    const listener = vi.fn();
    w.onChange(listener);
    w.add(100);
    w.set(0);
    w.set(0); // pas de changement : pas d'appel
    expect(listener.mock.calls).toEqual([
      [100, 100],
      [0, -100],
    ]);
  });

  it('format français', () => {
    expect(formatMoney(1500)).toBe('1 500 €');
    expect(formatMoney(0)).toBe('0 €');
  });
});

describe('registre des triches', () => {
  it('groupes dans l’ordre prévu, triches lancées par identifiant', () => {
    const r = new CheatRegistry();
    let money = 0;
    let fast = false;
    let spawned = '';
    r.add('Monde', { kind: 'action', id: 'crate', label: 'Caisse', code: 'KeyB', run: () => {} });
    r.add('Argent', { kind: 'action', id: 'money', label: '+100', run: () => (money += 100) });
    r.add('Joueur', { kind: 'toggle', id: 'fast', label: 'Rapide', get: () => fast, set: (on) => (fast = on) });
    r.add('Mécanique', {
      kind: 'choice',
      id: 'spawn',
      label: 'Pièce',
      button: 'OK',
      options: () => [{ value: 'a', label: 'A' }],
      run: (v) => (spawned = v),
    });
    expect(r.list().map((g) => g.title)).toEqual(['Argent', 'Mécanique', 'Joueur', 'Monde']);
    expect(r.run('money')).toBe(true);
    expect(money).toBe(100);
    r.run('fast');
    expect(fast).toBe(true);
    r.run('fast', '0');
    expect(fast).toBe(false);
    expect(r.run('spawn')).toBe(false); // il faut une valeur
    r.run('spawn', 'a');
    expect(spawned).toBe('a');
    expect(r.byCode('KeyB')?.id).toBe('crate');
    expect(r.run('inconnue')).toBe(false);
  });

  it('refuse deux triches avec le même identifiant', () => {
    const r = new CheatRegistry();
    r.add('Argent', { kind: 'action', id: 'x', label: 'x', run: () => {} });
    expect(() => r.add('Monde', { kind: 'action', id: 'x', label: 'x', run: () => {} })).toThrow();
  });
});
