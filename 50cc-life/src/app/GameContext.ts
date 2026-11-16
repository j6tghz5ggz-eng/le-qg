/**
 * Contexte partagé par tous les systèmes du jeu.
 *
 * Plutôt qu'un conteneur d'injection de dépendances, un simple objet passé
 * à chaque système : explicite, typé, facile à remplacer dans les tests.
 */
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import type { Scene } from '@babylonjs/core/scene';
import type { EventBus } from '../core/events/EventBus';
import type { PlatformInfo } from '../core/platform/platform';
import type { QualityManager } from '../core/quality/QualityManager';
import type { GameEvents } from './events';

export interface GameContext {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly physics: HavokPlugin;
  readonly bus: EventBus<GameEvents>;
  readonly platform: PlatformInfo;
  readonly quality: QualityManager;
  /** Conteneur HTML de l'interface (par-dessus le canvas). */
  readonly uiRoot: HTMLElement;
}

/**
 * Un système = un morceau de jeu autonome (monde, joueur, moto, économie…).
 * Toutes les méthodes sont optionnelles.
 */
export interface GameSystem {
  readonly id: string;
  init?(ctx: GameContext): void | Promise<void>;
  /** Pas fixe (1/60 s) : simulation, physique, gameplay. */
  fixedUpdate?(dt: number): void;
  /** Une fois par image rendue : caméra, interface, effets. */
  update?(dt: number): void;
  dispose?(): void;
}
