/**
 * Boucle de jeu.
 *
 * Deux rythmes :
 * - fixedUpdate(dt) : appelé à pas fixe (1/60 s) juste avant chaque pas de
 *   physique. Pour tout ce qui touche à la simulation (forces sur la moto,
 *   moteur, gameplay). Peut être appelé 0 à 4 fois par image.
 * - update(dt) : appelé une fois par image rendue. Pour la caméra,
 *   l'interface, les effets visuels.
 *
 * Le rattrapage à pas fixe est fait par Babylon (deterministic lockstep) ;
 * la limite d'images par seconde par engine.maxFPS (voir QualityManager).
 */
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Scene } from '@babylonjs/core/scene';

export interface LoopCallbacks {
  fixedUpdate(dt: number): void;
  update(dt: number): void;
  /** Après chaque image rendue, avec la durée de l'image en ms. */
  afterRender(frameMs: number): void;
  onError(error: unknown): void;
}

/** Au-delà, une image est considérée comme un à-coup (onglet en pause…). */
const MAX_FRAME_DT = 0.1;

export class GameLoop {
  readonly fixedDt: number;
  private running = false;

  constructor(
    private readonly engine: Engine,
    private readonly scene: Scene,
    private readonly callbacks: LoopCallbacks,
  ) {
    this.fixedDt = engine.getTimeStep() / 1000;
    scene.onBeforeStepObservable.add(() => callbacks.fixedUpdate(this.fixedDt));
    scene.onBeforeRenderObservable.add(() =>
      callbacks.update(Math.min(engine.getDeltaTime() / 1000, MAX_FRAME_DT)),
    );
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Nombre de pas fixes effectués depuis le début. */
  get stepId(): number {
    return this.scene.getStepId();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.engine.runRenderLoop(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.engine.stopRenderLoop(this.frame);
  }

  private readonly frame = (): void => {
    try {
      this.scene.render();
      this.callbacks.afterRender(this.engine.getDeltaTime());
    } catch (error) {
      this.stop();
      this.callbacks.onError(error);
    }
  };
}
