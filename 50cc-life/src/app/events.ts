import type { InputScheme } from '../core/input/actions';

/** États du jeu (machine à états simple, enrichie au fil des étapes). */
export type GameState = 'boot' | 'loading' | 'playing' | 'paused' | 'error';

/** Ce que le joueur vise ou tient (pour le réticule et les aides). */
export interface InteractionFocus {
  /** Nom de l'objet visé ou tenu, null si rien. */
  readonly label: string | null;
  readonly canGrab: boolean;
  readonly tooHeavy: boolean;
  readonly holding: boolean;
  /** Libellé de l'action « Utiliser », null si l'objet n'en a pas. */
  readonly useLabel: string | null;
}

export const NO_FOCUS: InteractionFocus = {
  label: null,
  canGrab: false,
  tooHeavy: false,
  holding: false,
  useLabel: null,
};

/** Catalogue des événements du jeu : nom → charge utile. */
export interface GameEvents {
  'game:state': { readonly from: GameState; readonly to: GameState };
  'input:scheme': { readonly scheme: InputScheme };
  'input:pointerLock': { readonly locked: boolean };
  'interaction:focus': InteractionFocus;
}
