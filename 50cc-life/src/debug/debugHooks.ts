/**
 * Petite API en lecture seule exposée sur window.__50CC__, utilisée par
 * les tests automatiques (Playwright) et pratique dans la console du
 * navigateur. Elle ne permet pas de tricher sur la progression.
 */
import type { GameState } from '../app/events';

export interface DebugHooks {
  readonly state: GameState;
  readonly stepId: number;
  readonly profile: string;
  readonly crateCount: number;
  readonly scheme: string;
  readonly player: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly grounded: boolean;
    readonly crouched: boolean;
  };
  readonly holding: boolean;
  /** Nom de l'objet visé ou tenu. */
  readonly focus: string | null;
  /** Moto conduite (null à pied). */
  readonly vehicle: {
    readonly speedKmh: number;
    readonly rpm: number;
    readonly heading: number;
    readonly lean: number;
    readonly wheelsOnGround: number;
  } | null;
  /** Première moto du monde (garée ou non). */
  readonly parkedBike: { readonly x: number; readonly y: number; readonly z: number; readonly lean: number } | null;
  probeY(): number | null;
}

declare global {
  interface Window {
    __50CC__?: DebugHooks;
    /** Accès complet aux objets du jeu, en développement uniquement (console, scripts). */
    __50CC_DEV__?: Record<string, unknown>;
  }
}

export function exposeDebugHooks(hooks: DebugHooks, devObjects: Record<string, unknown> = {}): void {
  Object.defineProperty(window, '__50CC__', { value: hooks, configurable: true });
  // Retiré du build de production (import.meta.env.DEV vaut false).
  if (import.meta.env.DEV) window.__50CC_DEV__ = devObjects;
}
