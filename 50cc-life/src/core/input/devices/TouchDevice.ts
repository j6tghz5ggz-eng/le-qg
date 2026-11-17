/**
 * Commandes tactiles.
 *
 * - Moitié gauche de l'écran : joystick virtuel qui apparaît là où le pouce
 *   se pose. Poussé à fond = courir (pas besoin de bouton « courir »).
 * - Reste de l'écran : glisser le doigt pour regarder.
 * - Les boutons (sauter, prendre…) sont créés par l'interface
 *   (ui/hud/TouchControls) et appellent `setButton`.
 */
import type { ActionState } from '../ActionState';
import type { ButtonAction } from '../actions';
import { clampToRadius, stickFromDrag } from '../stick';

/** Rayon du joystick en pixels CSS. */
export const JOYSTICK_RADIUS = 56;
const DEAD_ZONE = 0.12;
const SPRINT_THRESHOLD = 0.92;
/** Part de la largeur d'écran réservée au joystick. */
const STICK_ZONE = 0.45;
export const DEFAULT_TOUCH_SENSITIVITY = 0.0055;

export interface JoystickView {
  readonly active: boolean;
  readonly originX: number;
  readonly originY: number;
  readonly knobX: number;
  readonly knobY: number;
}

export class TouchDevice {
  sensitivity = DEFAULT_TOUCH_SENSITIVITY;
  /** Appelé quand le joystick bouge (pour l'affichage). */
  onStick: ((view: JoystickView) => void) | null = null;
  private stickId: number | null = null;
  private originX = 0;
  private originY = 0;
  private lookId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly state: ActionState,
    private readonly onActivity: () => void,
  ) {
    const opts = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', this.onDown, opts);
    canvas.addEventListener('pointermove', this.onMove, opts);
    canvas.addEventListener('pointerup', this.onUp, opts);
    canvas.addEventListener('pointercancel', this.onUp, opts);
    canvas.addEventListener('lostpointercapture', this.onUp, opts);
  }

  /** Utilisé par les boutons tactiles de l'interface. */
  setButton(action: ButtonAction, down: boolean): void {
    if (down) this.onActivity();
    this.state.setButton(action, `touch:${action}`, down);
  }

  dispose(): void {
    this.abort.abort();
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    // Empêche les clics « souris » émulés après un toucher.
    event.preventDefault();
    this.onActivity();
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* déjà relâché */
    }
    if (this.stickId === null && event.clientX < window.innerWidth * STICK_ZONE) {
      this.stickId = event.pointerId;
      this.originX = event.clientX;
      this.originY = event.clientY;
      this.updateStick(event.clientX, event.clientY);
    } else if (this.lookId === null) {
      this.lookId = event.pointerId;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    }
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId === this.stickId) {
      this.updateStick(event.clientX, event.clientY);
    } else if (event.pointerId === this.lookId) {
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.state.addLook(dx * this.sensitivity, dy * this.sensitivity);
    }
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId === this.stickId) {
      this.stickId = null;
      this.state.setMove('touch', 0, 0);
      this.state.setButton('sprint', 'touch:stick', false);
      this.onStick?.({ active: false, originX: 0, originY: 0, knobX: 0, knobY: 0 });
    } else if (event.pointerId === this.lookId) {
      this.lookId = null;
    }
  };

  private updateStick(x: number, y: number): void {
    const dx = x - this.originX;
    const dy = y - this.originY;
    const stick = stickFromDrag(dx, dy, JOYSTICK_RADIUS, DEAD_ZONE);
    this.state.setMove('touch', stick.x, stick.y);
    this.state.setButton('sprint', 'touch:stick', stick.magnitude >= SPRINT_THRESHOLD);
    const knob = clampToRadius(dx, dy, JOYSTICK_RADIUS);
    this.onStick?.({ active: true, originX: this.originX, originY: this.originY, knobX: knob.x, knobY: knob.y });
  }
}
