/**
 * Boucle de jeu.
 *
 * Trois rythmes :
 * - beforeFrame(dt) : une fois par image, AVANT la simulation (lecture de
 *   la manette…), pour que les pas fixes de l'image voient les entrées.
 * - fixedUpdate(dt) : à pas fixe (1/60 s), juste avant chaque pas de
 *   physique. Pour tout ce qui touche à la simulation. 0 à 4 fois par image.
 * - update(dt, alpha) : une fois par image rendue. Pour la caméra,
 *   l'interface, les effets. `alpha` sert à interpoler entre deux pas.
 *
 * Le rattrapage à pas fixe est fait par Babylon (deterministic lockstep) ;
 * la limite d'images par seconde par engine.maxFPS (voir QualityManager).
 */
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Scene } from '@babylonjs/core/scene';
import { stepAlpha } from './stepAlpha';

export interface LoopCallbacks {
  beforeFrame(dt: number): void;
  fixedUpdate(dt: number): void;
  lateFixedUpdate(dt: number): void;
  update(dt: number, alpha: number): void;
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
    const frameDt = (): number => Math.min(engine.getDeltaTime() / 1000, MAX_FRAME_DT);
    scene.onBeforeAnimationsObservable.add(() => callbacks.beforeFrame(frameDt()));
    scene.onBeforeStepObservable.add(() => callbacks.fixedUpdate(this.fixedDt));
    scene.onAfterStepObservable.add(() => callbacks.lateFixedUpdate(this.fixedDt));
    scene.onBeforeRenderObservable.add(() =>
      callbacks.update(frameDt(), stepAlpha(readAccumulatorMs(scene), engine.getTimeStep())),
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

/**
 * Temps restant (ms) non encore simulé par le lockstep de Babylon.
 * Propriété interne : si elle disparaît dans une future version, alpha
 * vaut 1 (pas d'interpolation) et le jeu reste correct.
 */
function readAccumulatorMs(scene: Scene): number {
  const value = (scene as unknown as { _timeAccumulator?: unknown })._timeAccumulator;
  return typeof value === 'number' ? value : Number.NaN;
}
