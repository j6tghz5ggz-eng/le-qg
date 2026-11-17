/**
 * Économie : porte-monnaie du joueur (les achats viendront avec la
 * boutique). Annonce chaque changement de solde sur le bus d'événements.
 */
import type { GameContext, GameSystem } from '../app/GameContext';
import { Wallet } from './Wallet';

export class EconomySystem implements GameSystem {
  readonly id = 'economy';
  readonly wallet = new Wallet();

  init(ctx: GameContext): void {
    this.wallet.onChange((balance, delta) => ctx.bus.emit('money:changed', { balance, delta }));
    ctx.bus.emit('money:changed', { balance: this.wallet.balance, delta: 0 });

    for (const amount of [100, 1000, 10000]) {
      ctx.cheats.add('Argent', {
        kind: 'action',
        id: `money+${amount}`,
        label: `+${amount.toLocaleString('fr-FR')} €`,
        run: () => this.wallet.add(amount),
      });
    }
    ctx.cheats.add('Argent', { kind: 'action', id: 'money-reset', label: 'Remettre à 0 €', run: () => this.wallet.set(0) });
  }
}
