/**
 * Écran de la boutique en ligne (ouvert depuis l'ordinateur du garage).
 * HTML/CSS, utilisable à la souris, au doigt et au clavier (Échap ferme).
 * Pendant qu'il est ouvert, les commandes du jeu sont coupées.
 */
import type { GameEvents } from '../../app/events';
import type { EventBus } from '../../core/events/EventBus';
import type { InputManager } from '../../core/input/InputManager';
import type { ShopSystem } from '../../economy/ShopSystem';
import { SHOP_NAME, conditionLabel } from '../../economy/shop';
import { formatMoney, type Wallet } from '../../economy/Wallet';
import { isFeminine } from '../../mechanics/parts';
import { el } from '../dom';
import { t } from '../i18n';

type Tab = 'buy' | 'sell';

/**
 * Au tactile, le doigt qui ouvre la boutique produit aussi un « clic » sur
 * l'élément qui apparaît dessous (souvent un bouton Acheter) : on ignore les
 * clics pendant ce court délai après l'ouverture.
 */
const GHOST_CLICK_MS = 450;

export class ShopScreen {
  private readonly root: HTMLElement;
  private readonly balance: HTMLElement;
  private readonly list: HTMLElement;
  private readonly tabs = new Map<Tab, HTMLButtonElement>();
  private tab: Tab = 'buy';
  private openedAt = 0;
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };

  constructor(
    uiRoot: HTMLElement,
    private readonly bus: EventBus<GameEvents>,
    private readonly shop: ShopSystem,
    private readonly wallet: Wallet,
    private readonly input: InputManager,
  ) {
    this.balance = el('span', { className: 'shop__balance' });
    const close = el('button', { className: 'shop__close', text: '✕', attrs: { type: 'button', 'aria-label': t('shop.close') } });
    close.addEventListener('click', () => this.close());
    const tabBar = el('div', { className: 'shop__tabs', attrs: { role: 'tablist' } });
    for (const [id, label] of [['buy', t('shop.buy')], ['sell', t('shop.sell')]] as const) {
      const button = el('button', { className: 'shop__tab', text: label, attrs: { type: 'button', role: 'tab', 'data-tab': id } });
      button.addEventListener('click', () => {
        this.bus.emit('sfx', { id: 'uiClick' });
        this.show(id);
      });
      this.tabs.set(id, button);
      tabBar.appendChild(button);
    }
    this.list = el('div', { className: 'shop__list' });
    const panel = el('div', { className: 'shop__panel' }, [
      el('header', { className: 'shop__header' }, [
        el('span', { className: 'shop__logo', text: SHOP_NAME.toUpperCase() }),
        el('span', { className: 'shop__wallet' }, [document.createTextNode(`${t('shop.balance')} `), this.balance]),
        close,
      ]),
      tabBar,
      this.list,
    ]);
    this.root = el('div', { className: 'shop', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': SHOP_NAME } }, [panel]);
    this.root.hidden = true;
    // Clics fantômes juste après l'ouverture : bloqués avant d'atteindre les boutons.
    this.root.addEventListener(
      'click',
      (event) => {
        if (performance.now() - this.openedAt < GHOST_CLICK_MS) {
          event.stopPropagation();
          event.preventDefault();
        }
      },
      true,
    );
    // Clic sur le fond sombre : ferme.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });
    uiRoot.appendChild(this.root);
    bus.on('money:changed', () => {
      if (!this.root.hidden) this.render();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    this.input.setUiCapture(true);
    this.openedAt = performance.now();
    this.root.hidden = false;
    window.addEventListener('keydown', this.onKey);
    this.show(this.tab);
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey);
    this.input.setUiCapture(false);
  }

  private show(tab: Tab): void {
    this.tab = tab;
    for (const [id, button] of this.tabs) {
      button.classList.toggle('is-active', id === tab);
      button.setAttribute('aria-selected', String(id === tab));
    }
    this.render();
  }

  private render(): void {
    this.balance.textContent = formatMoney(this.wallet.balance);
    this.list.replaceChildren();
    if (this.tab === 'buy') this.renderBuy();
    else this.renderSell();
  }

  private renderBuy(): void {
    for (const section of this.shop.sections()) {
      this.list.appendChild(el('h3', { className: 'shop__section', text: section.title }));
      for (const def of section.items) {
        const affordable = this.wallet.canAfford(def.price);
        const button = el('button', {
          className: 'shop__action',
          text: affordable ? t('shop.buy') : t('shop.tooExpensive'),
          attrs: { type: 'button', 'data-buy': def.id },
        });
        button.disabled = !affordable;
        button.addEventListener('click', () => {
          if (this.shop.buy(def.id) === 'ok') this.render();
        });
        this.list.appendChild(this.row(def.name, def.detail, formatMoney(def.price), button));
      }
    }
  }

  private renderSell(): void {
    this.list.appendChild(el('p', { className: 'shop__hint', text: t('shop.sellHint') }));
    const items = this.shop.sellables();
    if (items.length === 0) {
      this.list.appendChild(el('p', { className: 'shop__empty', text: t('shop.nothingToSell') }));
      return;
    }
    for (const item of items) {
      const button = el('button', {
        className: 'shop__action',
        text: item.held ? t('shop.holding') : t('shop.sell'),
        attrs: { type: 'button', 'data-sell': item.uid },
      });
      button.disabled = item.held;
      button.addEventListener('click', () => {
        if (this.shop.sell(item.uid) !== null) this.render();
      });
      this.list.appendChild(this.row(item.def.name, `${conditionLabel(item.condition, isFeminine(item.def))} (${Math.round(item.condition * 100)} %)`, formatMoney(item.price), button));
    }
  }

  private row(name: string, detail: string, price: string, action: HTMLElement): HTMLElement {
    return el('div', { className: 'shop__row' }, [
      el('div', { className: 'shop__info' }, [el('strong', { text: name }), el('span', { className: 'shop__detail', text: detail })]),
      el('span', { className: 'shop__price', text: price }),
      action,
    ]);
  }
}
