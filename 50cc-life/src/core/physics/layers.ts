/**
 * Couches de collision (masques de bits Havok).
 *
 * Exemple : le rayon « qu'est-ce que je regarde ? » part de l'intérieur de
 * la capsule du joueur ; il doit l'ignorer.
 */
export const Layer = {
  PLAYER: 1 << 1,
} as const;

/** Tout sauf le joueur. */
export const ALL_BUT_PLAYER = ~Layer.PLAYER >>> 0;
