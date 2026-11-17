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
  /** L'action Utiliser doit être maintenue (dévisser…). */
  readonly hold: boolean;
  /** Précision de l'action (« 4 fixations »…). */
  readonly detail: string | null;
  /** Avancement de l'action maintenue (0 à 1). */
  readonly progress: number;
}

export const NO_FOCUS: InteractionFocus = {
  label: null,
  canGrab: false,
  tooHeavy: false,
  holding: false,
  useLabel: null,
  hold: false,
  detail: null,
  progress: 0,
};

/** Catalogue des événements du jeu : nom → charge utile. */
export interface GameEvents {
  'game:state': { readonly from: GameState; readonly to: GameState };
  'input:scheme': { readonly scheme: InputScheme };
  'input:pointerLock': { readonly locked: boolean };
  'interaction:focus': InteractionFocus;
  'vehicle:mounted': { readonly label: string; readonly manual: boolean };
  'vehicle:dismounted': Record<string, never>;
  /** Tableau de bord (≈ 10 fois par seconde pendant la conduite). */
  'vehicle:telemetry': {
    readonly speedKmh: number;
    readonly rpm: number;
    readonly limiterRpm: number;
    readonly gear: string;
    readonly running: boolean;
    readonly manual: boolean;
    readonly autoClutch: boolean;
  };
  /** Message court à afficher (ex. « Ralentissez pour descendre »). */
  'ui:notice': { readonly message: string };
}
