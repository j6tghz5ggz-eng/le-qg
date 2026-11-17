/** Solde du porte-monnaie, en haut à droite (anime brièvement les gains et dépenses). */
import type { GameEvents } from '../../app/events';
import type { EventBus } from '../../core/events/EventBus';
import { formatMoney } from '../../economy/Wallet';
import { el } from '../dom';

export class MoneyHud {
  private readonly root: HTMLElement;
  private readonly delta: HTMLElement;
  private timer = 0;

  constructor(uiRoot: HTMLElement, bus: EventBus<GameEvents>) {
    const amount = el('span', { className: 'money__amount', text: formatMoney(0) });
    this.delta = el('span', { className: 'money__delta' });
    this.root = el('div', { className: 'money', attrs: { 'aria-label': 'Argent', role: 'status' } }, [amount, this.delta]);
    uiRoot.appendChild(this.root);
    bus.on('money:changed', ({ balance, delta }) => {
      amount.textContent = formatMoney(balance);
      if (delta === 0) return;
      this.delta.textContent = `${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta))}`;
      this.delta.classList.toggle('is-loss', delta < 0);
      this.root.classList.add('is-changed');
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.root.classList.remove('is-changed'), 1600);
    });
  }
}
