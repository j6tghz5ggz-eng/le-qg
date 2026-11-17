/**
 * Règles pour porter et lancer des objets. Module pur (testé dans Node).
 *
 * L'objet porté n'est pas « collé » à la caméra : on lui donne chaque pas
 * une vitesse qui le ramène vers un point devant les yeux (ressort). Il
 * garde donc ses collisions : il ne traverse pas les murs et bute sur les
 * obstacles, comme dans My Summer Car.
 */
import type { XYZ } from '../movement';

export const CARRY = {
  /** Portée du regard pour interagir (m). */
  reach: 2.2,
  /** Distance du point de maintien devant les yeux (m). */
  holdDistance: 1.3,
  /** Abaisse légèrement l'objet sous la ligne des yeux (m). */
  holdDrop: 0.15,
  /** Au-delà, l'objet est trop lourd pour être porté (kg). */
  maxMass: 40,
  /** Raideur du « ressort » de maintien (1/s). */
  gain: 14,
  /** Vitesse max de l'objet porté (m/s). */
  maxSpeed: 12,
  /**
   * Objet coincé trop loin du point de maintien : on le lâche (m). Plus que
   * le diamètre du cercle décrit par la main (2 × 1,3 m) : un demi-tour
   * rapide de la souris ne fait pas tomber l'objet.
   */
  breakDistance: 2.8,
  /** Freinage de la rotation de l'objet porté. */
  heldAngularDamping: 6,
  /** Impulsion du lancer (N·s) : un objet léger part plus vite. */
  throwImpulse: 80,
  minThrowSpeed: 2,
  maxThrowSpeed: 9,
} as const;

/** Vitesse à donner à l'objet pour rejoindre le point de maintien. */
export function carryVelocity<T extends XYZ>(object: XYZ, target: XYZ, gain: number, maxSpeed: number, out: T): T {
  out.x = (target.x - object.x) * gain;
  out.y = (target.y - object.y) * gain;
  out.z = (target.z - object.z) * gain;
  const speed = Math.hypot(out.x, out.y, out.z);
  if (speed > maxSpeed) {
    const k = maxSpeed / speed;
    out.x *= k;
    out.y *= k;
    out.z *= k;
  }
  return out;
}

export function throwSpeed(mass: number): number {
  if (mass <= 0) return CARRY.maxThrowSpeed;
  return Math.min(CARRY.maxThrowSpeed, Math.max(CARRY.minThrowSpeed, CARRY.throwImpulse / mass));
}

/**
 * Vrai si l'objet est sous les pieds du joueur : on le lâche, sinon le
 * joueur pourrait se soulever lui-même en montant dessus.
 */
export function isUnderFeet(object: XYZ, foot: XYZ, playerRadius: number): boolean {
  const horizontal = Math.hypot(object.x - foot.x, object.z - foot.z);
  return horizontal < playerRadius + 0.35 && object.y < foot.y + 0.4;
}

export function canCarry(mass: number): boolean {
  return mass <= CARRY.maxMass;
}
