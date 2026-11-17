/**
 * Point d'accès unique aux commandes du joueur.
 *
 * Réunit les trois appareils, détecte celui qui est utilisé (pour afficher
 * les bons boutons et les bonnes aides) et expose l'état des actions.
 */
import type { GameEvents } from '../../app/events';
import type { EventBus } from '../events/EventBus';
import type { PlatformInfo } from '../platform/platform';
import { ActionState } from './ActionState';
import type { AxisAction, ButtonAction, InputScheme, Vec2 } from './actions';
import { GamepadDevice } from './devices/GamepadDevice';
import { KeyboardMouseDevice } from './devices/KeyboardMouseDevice';
import { TouchDevice } from './devices/TouchDevice';

export class InputManager {
  readonly state = new ActionState();
  readonly keyboardMouse: KeyboardMouseDevice;
  readonly touch: TouchDevice;
  readonly gamepad: GamepadDevice;
  private _scheme: InputScheme;
  private readonly onBlur = (): void => this.state.releaseAll();

  constructor(
    canvas: HTMLCanvasElement,
    platform: PlatformInfo,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this._scheme = platform.isMobile || (platform.hasTouch && !platform.hasFinePointer) ? 'touch' : 'keyboardMouse';
    this.keyboardMouse = new KeyboardMouseDevice(canvas, this.state, {
      onActivity: () => this.setScheme('keyboardMouse'),
      onPointerLockChange: (locked) => bus.emit('input:pointerLock', { locked }),
    });
    this.touch = new TouchDevice(canvas, this.state, () => this.setScheme('touch'));
    this.gamepad = new GamepadDevice(this.state, () => this.setScheme('gamepad'));
    window.addEventListener('blur', this.onBlur);
  }

  get scheme(): InputScheme {
    return this._scheme;
  }

  /**
   * Un écran HTML (boutique…) prend ou rend la main : commandes du jeu
   * coupées et souris libérée pour cliquer dans l'écran.
   */
  setUiCapture(on: boolean): void {
    this.state.setMuted(on);
    if (on) this.keyboardMouse.releasePointerLock();
  }

  get uiCaptured(): boolean {
    return this.state.isMuted;
  }

  /** À appeler une fois par image, avant la simulation. */
  poll(dt: number): void {
    this.state.beginFrame();
    this.gamepad.poll(dt);
  }

  isHeld(action: ButtonAction): boolean {
    return this.state.isHeld(action);
  }

  consumePress(action: ButtonAction): boolean {
    return this.state.consumePress(action);
  }

  getAxis(axis: AxisAction): number {
    return this.state.getAxis(axis);
  }

  getMove(): Vec2 {
    return this.state.getMove();
  }

  getMoveAxes(): Vec2 {
    return this.state.getMoveAxes();
  }

  consumeLook(): Vec2 {
    return this.state.consumeLook();
  }

  releaseAll(): void {
    this.state.releaseAll();
  }

  dispose(): void {
    window.removeEventListener('blur', this.onBlur);
    this.keyboardMouse.dispose();
    this.touch.dispose();
  }

  private setScheme(scheme: InputScheme): void {
    if (scheme === this._scheme) return;
    this._scheme = scheme;
    this.bus.emit('input:scheme', { scheme });
  }
}
