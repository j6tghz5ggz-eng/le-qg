/**
 * Vocabulaire des commandes du jeu.
 *
 * Le gameplay ne lit jamais une touche ou un bouton précis : il lit des
 * actions (« sauter », « prendre »…). Chaque appareil (clavier/souris,
 * tactile, manette) traduit ses entrées en actions. Ajouter un appareil
 * ou changer une touche ne touche donc jamais au code du gameplay.
 */
export const BUTTON_ACTIONS = ['jump', 'sprint', 'crouch', 'grab', 'throw', 'use'] as const;
export type ButtonAction = (typeof BUTTON_ACTIONS)[number];

/** Commandes analogiques (0 à 1), ex. gâchettes de manette. */
export const AXIS_ACTIONS = ['throttle', 'brake'] as const;
export type AxisAction = (typeof AXIS_ACTIONS)[number];

/** Mode de commande actif (le dernier utilisé), pour adapter l'interface. */
export type InputScheme = 'keyboardMouse' | 'touch' | 'gamepad';

export interface Vec2 {
  x: number;
  y: number;
}
