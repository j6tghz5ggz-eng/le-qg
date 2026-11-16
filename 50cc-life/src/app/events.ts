/** États du jeu (machine à états simple, enrichie au fil des étapes). */
export type GameState = 'boot' | 'loading' | 'playing' | 'paused' | 'error';

/** Catalogue des événements du jeu : nom → charge utile. */
export interface GameEvents {
  'game:state': { readonly from: GameState; readonly to: GameState };
}
