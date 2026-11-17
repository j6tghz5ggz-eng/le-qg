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
  probeY(): number | null;
}

declare global {
  interface Window {
    __50CC__?: DebugHooks;
  }
}

export function exposeDebugHooks(hooks: DebugHooks): void {
  Object.defineProperty(window, '__50CC__', { value: hooks, configurable: true });
}
