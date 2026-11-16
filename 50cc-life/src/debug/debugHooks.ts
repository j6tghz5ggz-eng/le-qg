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
