/**
 * Carte « Cliquez pour jouer » (PC) : rappelle les commandes et capture la
 * souris au clic. Réapparaît quand la souris est libérée (Échap).
 */
import type { GameEvents } from '../../app/events';
import type { EventBus } from '../../core/events/EventBus';
import { KeyboardMouseDevice } from '../../core/input/devices/KeyboardMouseDevice';
import type { InputManager } from '../../core/input/InputManager';
import { el } from '../dom';
import { t, type StringKey } from '../i18n';

export class PointerLockHint {
  private readonly root: HTMLElement;
  private readonly moveKeys: HTMLElement;
  private readonly fallback: HTMLElement;
  private locked = false;

  constructor(
    uiRoot: HTMLElement,
    private readonly input: InputManager,
    bus: EventBus<GameEvents>,
  ) {
    this.moveKeys = el('kbd', { text: 'ZQSD / WASD' });
    this.fallback = el('p', { className: 'lock-hint__fallback', text: t('lock.fallback') });
    this.fallback.hidden = true;
    const rows: Array<[Node, StringKey]> = [
      [this.moveKeys, 'lock.move'],
      [el('kbd', { text: t('lock.mouse') }), 'lock.look'],
      [el('kbd', { text: 'Maj' }), 'lock.sprint'],
      [el('kbd', { text: 'Espace' }), 'lock.jump'],
      [el('kbd', { text: 'C' }), 'lock.crouch'],
      [el('kbd', { text: t('keys.leftClick') }), 'lock.grab'],
      [el('kbd', { text: `${t('keys.rightClick')} / F` }), 'lock.throw'],
      [el('kbd', { text: 'Échap' }), 'lock.release'],
    ];
    const list = el(
      'dl',
      { className: 'lock-hint__keys' },
      rows.flatMap(([key, label]) => [el('dt', {}, [key]), el('dd', { text: t(label) })]),
    );
    this.root = el(
      'div',
      { className: 'lock-hint', attrs: { role: 'button', tabindex: '0', 'aria-label': t('lock.title') } },
      [el('p', { className: 'lock-hint__title', text: t('lock.title') }), list, this.fallback],
    );
    const activate = (): void => {
      input.keyboardMouse.requestLock();
      // Le refus de capture n'est connu qu'après coup.
      window.setTimeout(() => this.render(), 300);
    };
    this.root.addEventListener('click', activate);
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
    uiRoot.appendChild(this.root);

    bus.on('input:scheme', () => this.render());
    bus.on('input:pointerLock', ({ locked }) => {
      this.locked = locked;
      this.render();
    });
    void KeyboardMouseDevice.moveKeysLabel().then((label) => (this.moveKeys.textContent = label));
    this.render();
  }

  private render(): void {
    const unavailable = this.input.keyboardMouse.lockUnavailable;
    this.fallback.hidden = !unavailable;
    this.root.hidden = this.input.scheme !== 'keyboardMouse' || this.locked;
    this.root.classList.toggle('is-compact', unavailable);
  }
}
