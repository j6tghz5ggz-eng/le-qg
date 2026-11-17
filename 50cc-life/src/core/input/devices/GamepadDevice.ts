/**
 * Manette (API Gamepad, disposition « standard » : Xbox, PlayStation…).
 *
 * Stick gauche : se déplacer · stick droit : regarder · A : sauter ·
 * B : s'accroupir · X : prendre · Y : utiliser · RB : lancer ·
 * clic du stick gauche : courir.
 */
import type { ActionState } from '../ActionState';
import type { ButtonAction } from '../actions';
import { radialDeadZone, responseCurve } from '../stick';

const BUTTON_MAP: ReadonlyArray<readonly [number, ButtonAction]> = [
  [0, 'jump'],
  [1, 'crouch'],
  [2, 'grab'],
  [3, 'use'],
  [5, 'throw'],
  [10, 'sprint'],
];
const MOVE_DEAD_ZONE = 0.18;
const LOOK_DEAD_ZONE = 0.15;

export class GamepadDevice {
  /** Vitesse de rotation au maximum du stick (radians/s). */
  yawSpeed = 2.8;
  pitchSpeed = 2.0;
  invertY = false;
  private connected = false;

  constructor(
    private readonly state: ActionState,
    private readonly onActivity: () => void,
  ) {}

  /** Lit la manette (à appeler une fois par image). */
  poll(dt: number): void {
    const pad = findGamepad();
    if (!pad) {
      if (this.connected) this.release();
      return;
    }
    this.connected = true;
    let active = false;

    const move = radialDeadZone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, MOVE_DEAD_ZONE);
    this.state.setMove('pad', move.x, -move.y);
    if (move.x || move.y) active = true;

    const look = radialDeadZone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, LOOK_DEAD_ZONE);
    if (look.x || look.y) {
      active = true;
      this.state.addLook(
        responseCurve(look.x) * this.yawSpeed * dt,
        responseCurve(look.y) * this.pitchSpeed * dt * (this.invertY ? -1 : 1),
      );
    }

    for (const [index, action] of BUTTON_MAP) {
      const pressed = pad.buttons[index]?.pressed ?? false;
      if (pressed) active = true;
      this.state.setButton(action, `pad:${index}`, pressed);
    }
    if (active) this.onActivity();
  }

  private release(): void {
    this.connected = false;
    this.state.releaseSource('pad');
    for (const [index] of BUTTON_MAP) this.state.releaseSource(`pad:${index}`);
  }
}

function findGamepad(): Gamepad | null {
  let pads: ReadonlyArray<Gamepad | null> = [];
  try {
    pads = navigator.getGamepads?.() ?? [];
  } catch {
    return null; // API bloquée (fenêtre intégrée, permissions)
  }
  let fallback: Gamepad | null = null;
  for (const pad of pads) {
    if (!pad?.connected) continue;
    if (pad.mapping === 'standard') return pad;
    fallback ??= pad;
  }
  return fallback;
}
