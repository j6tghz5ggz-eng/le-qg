/**
 * Commandes tactiles affichées à l'écran : joystick (dessin), boutons
 * Sauter / Prendre-Lâcher / Lancer / Accroupir. Visibles uniquement quand
 * le joueur utilise l'écran tactile.
 *
 * « Prendre » et « Accroupir » sont des bascules (un appui pour prendre,
 * un autre pour lâcher) : maintenir un doigt appuyé longtemps est pénible.
 */
import { NO_FOCUS, type GameEvents, type InteractionFocus } from '../../app/events';
import type { EventBus } from '../../core/events/EventBus';
import type { ButtonAction } from '../../core/input/actions';
import type { InputManager } from '../../core/input/InputManager';
import { JOYSTICK_RADIUS, type JoystickView } from '../../core/input/devices/TouchDevice';
import { el } from '../dom';
import { t } from '../i18n';

export class TouchControls {
  private readonly root: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly grabButton: HTMLButtonElement;
  private readonly throwButton: HTMLButtonElement;
  private readonly crouchButton: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private focus: InteractionFocus = NO_FOCUS;
  private grabOn = false;
  private crouchOn = false;

  constructor(
    uiRoot: HTMLElement,
    private readonly input: InputManager,
    bus: EventBus<GameEvents>,
  ) {
    this.knob = el('div', { className: 'stick__knob' });
    this.base = el('div', { className: 'stick', attrs: { 'aria-hidden': 'true' } }, [this.knob]);
    this.base.style.setProperty('--stick-radius', `${JOYSTICK_RADIUS}px`);
    this.base.hidden = true;

    const jump = this.button(t('touch.jump'), 'touch-btn--jump');
    this.bindHold(jump, 'jump');
    this.throwButton = this.button(t('touch.throw'), 'touch-btn--throw');
    this.bindHold(this.throwButton, 'throw');
    this.throwButton.hidden = true;
    this.grabButton = this.button(t('touch.grab'), 'touch-btn--grab');
    this.bindTap(this.grabButton, () => this.toggleGrab());
    this.crouchButton = this.button(t('touch.crouch'), 'touch-btn--crouch');
    this.bindTap(this.crouchButton, () => this.toggleCrouch());

    this.hint = el('p', { className: 'touch-hint', text: t('touch.hint') });
    const cluster = el('div', { className: 'touch-buttons' }, [
      this.crouchButton,
      this.grabButton,
      this.throwButton,
      jump,
    ]);
    this.root = el('div', { className: 'ui-layer touch' }, [this.base, cluster, this.hint]);
    uiRoot.appendChild(this.root);

    this.root.hidden = input.scheme !== 'touch';
    window.setTimeout(() => (this.hint.hidden = true), 8000);
    bus.on('input:scheme', ({ scheme }) => (this.root.hidden = scheme !== 'touch'));
    bus.on('interaction:focus', (focus) => this.onFocus(focus));
    input.touch.onStick = (view) => this.renderStick(view);
    this.renderGrab();
  }

  private onFocus(focus: InteractionFocus): void {
    this.focus = focus;
    // L'objet a été lâché par le jeu (coincé, lancé…) : on remet la bascule à zéro.
    if (!focus.holding && this.grabOn) {
      this.grabOn = false;
      this.input.touch.setButton('grab', false);
    }
    this.renderGrab();
  }

  private toggleGrab(): void {
    if (this.grabOn) {
      this.grabOn = false;
      this.input.touch.setButton('grab', false);
    } else if (this.focus.canGrab) {
      this.grabOn = true;
      this.input.touch.setButton('grab', true);
    }
    this.renderGrab();
  }

  private toggleCrouch(): void {
    this.crouchOn = !this.crouchOn;
    this.input.touch.setButton('crouch', this.crouchOn);
    this.crouchButton.textContent = this.crouchOn ? t('touch.stand') : t('touch.crouch');
    this.crouchButton.setAttribute('aria-pressed', String(this.crouchOn));
  }

  private renderGrab(): void {
    const holding = this.focus.holding;
    this.grabButton.textContent = holding ? t('touch.drop') : t('touch.grab');
    this.grabButton.classList.toggle('is-available', this.focus.canGrab || holding);
    this.grabButton.setAttribute('aria-disabled', String(!(this.focus.canGrab || holding)));
    this.throwButton.hidden = !holding;
  }

  private renderStick(view: JoystickView): void {
    this.base.hidden = !view.active;
    if (!view.active) return;
    this.hint.hidden = true; // l'aide disparaît dès la première utilisation
    this.base.style.transform = `translate(${view.originX}px, ${view.originY}px)`;
    this.knob.style.transform = `translate(${view.knobX}px, ${view.knobY}px)`;
  }

  private button(label: string, modifier: string): HTMLButtonElement {
    return el('button', { className: `touch-btn ${modifier}`, text: label, attrs: { type: 'button' } });
  }

  /** Bouton maintenu : l'action est tenue tant que le doigt est posé. */
  private bindHold(button: HTMLElement, action: ButtonAction): void {
    const up = (): void => {
      button.classList.remove('is-pressed');
      this.input.touch.setButton(action, false);
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.classList.add('is-pressed');
      this.input.touch.setButton(action, true);
    });
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  }

  private bindTap(button: HTMLElement, onTap: () => void): void {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      onTap();
    });
  }
}
