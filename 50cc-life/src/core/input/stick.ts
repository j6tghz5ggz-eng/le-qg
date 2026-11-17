/**
 * Calculs des sticks (joystick tactile et manette). Module pur.
 */
import type { Vec2 } from './actions';

/**
 * Zone morte radiale : sous `deadZone` la sortie vaut 0, puis elle croît
 * progressivement jusqu'à 1 au bord (pas de « saut » à la sortie de la zone).
 */
export function radialDeadZone(x: number, y: number, deadZone: number): Vec2 {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadZone) return { x: 0, y: 0 };
  const clamped = Math.min(magnitude, 1);
  const scaled = (clamped - deadZone) / (1 - deadZone);
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled };
}

/**
 * Joystick tactile : convertit un glissement (px, axe y de l'écran vers le
 * bas) en vecteur de déplacement (y > 0 = avant).
 */
export function stickFromDrag(
  dx: number,
  dy: number,
  radius: number,
  deadZone: number,
): Vec2 & { magnitude: number } {
  const v = radialDeadZone(dx / radius, dy / radius, deadZone);
  return { x: v.x, y: -v.y, magnitude: Math.hypot(v.x, v.y) };
}

/** Courbe de réponse : plus de précision près du centre du stick. */
export function responseCurve(value: number, exponent = 2): number {
  return Math.sign(value) * Math.abs(value) ** exponent;
}

/** Position du bouton du joystick, limitée au cercle de rayon `radius`. */
export function clampToRadius(dx: number, dy: number, radius: number): Vec2 {
  const length = Math.hypot(dx, dy);
  if (length <= radius) return { x: dx, y: dy };
  return { x: (dx / length) * radius, y: (dy / length) * radius };
}
