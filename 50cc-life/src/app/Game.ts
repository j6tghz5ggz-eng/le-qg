/**
 * Point central du jeu : démarrage, systèmes, boucle, cycle de vie.
 *
 * Ordre de démarrage :
 *   appareil → profil de qualité → moteur 3D → physique → monde → shaders prêts → jeu
 * Chaque étape met à jour l'écran de chargement ; toute erreur affiche un
 * écran explicite au lieu d'une page blanche.
 */
import type { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { createEngine } from '../core/engine/createEngine';
import { EventBus } from '../core/events/EventBus';
import { GameLoop } from '../core/loop/GameLoop';
import { initPhysics } from '../core/physics/initPhysics';
import { detectPlatform } from '../core/platform/platform';
import { QualityManager } from '../core/quality/QualityManager';
import { DebugOverlay } from '../debug/DebugOverlay';
import { exposeDebugHooks } from '../debug/debugHooks';
import { t } from '../ui/i18n';
import { showFatalError } from '../ui/screens/ErrorScreen';
import { LoadingScreen } from '../ui/screens/LoadingScreen';
import { showToast } from '../ui/screens/Toast';
import { TestWorld } from '../world/TestWorld';
import type { GameEvents, GameState } from './events';
import type { GameContext, GameSystem } from './GameContext';

export class Game {
  readonly bus = new EventBus<GameEvents>();
  private state: GameState = 'boot';
  private readonly systems: GameSystem[] = [];
  private loop: GameLoop | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
  ) {}

  get currentState(): GameState {
    return this.state;
  }

  async start(): Promise<void> {
    const loading = new LoadingScreen(this.uiRoot);
    try {
      this.setState('loading');

      loading.setProgress(0.05, t('loading.platform'));
      const platform = detectPlatform();
      if (!platform.webgl2) {
        loading.remove();
        this.fail(t('error.noWebgl2'));
        return;
      }
      const quality = new QualityManager(platform);

      loading.setProgress(0.15, t('loading.engine'));
      const engine = createEngine(this.canvas, quality.profile, platform);
      quality.attach(engine);
      const scene = new Scene(engine);
      // Le pointeur ne sert pas encore à sélectionner des objets : inutile
      // de lancer un rayon à chaque mouvement de souris.
      scene.skipPointerMovePicking = true;

      loading.setProgress(0.3, t('loading.physics'));
      const physics = await initPhysics(scene);

      const ctx: GameContext = { engine, scene, physics, bus: this.bus, platform, quality, uiRoot: this.uiRoot };

      loading.setProgress(0.6, t('loading.world'));
      const world = new TestWorld();
      await this.addSystem(world, ctx);

      new DebugOverlay(ctx, [{ label: `📦 ${t('debug.spawnCrate')}`, code: 'KeyC', run: () => world.spawnCrate() }]);

      loading.setProgress(0.85, t('loading.shaders'));
      // Compile les shaders avant d'afficher la scène (évite les saccades au démarrage).
      await scene.whenReadyAsync();

      this.loop = new GameLoop(engine, scene, {
        fixedUpdate: (dt) => {
          for (const s of this.systems) s.fixedUpdate?.(dt);
        },
        update: (dt) => {
          for (const s of this.systems) s.update?.(dt);
        },
        afterRender: (frameMs) => quality.onFrame(frameMs),
        onError: (error) => this.fail(t('error.generic'), error),
      });

      this.watchViewport(engine, quality);
      this.watchLifecycle(engine);
      const game = this;
      exposeDebugHooks({
        get state() {
          return game.state;
        },
        get stepId() {
          return scene.getStepId();
        },
        profile: quality.profile.id,
        get crateCount() {
          return world.crateCount;
        },
        probeY: () => world.probeY(),
      });

      this.loop.start();
      this.setState('playing');
      await loading.hide();
    } catch (error) {
      loading.remove();
      this.fail(t('error.generic'), error);
    }
  }

  private async addSystem(system: GameSystem, ctx: GameContext): Promise<void> {
    await system.init?.(ctx);
    this.systems.push(system);
  }

  private setState(to: GameState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this.bus.emit('game:state', { from, to });
  }

  private fail(message: string, error?: unknown): void {
    console.error('[50cc LIFE]', message, error);
    this.loop?.stop();
    this.setState('error');
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : error ? String(error) : undefined;
    showFatalError(this.uiRoot, message, detail);
  }

  /** Taille du canvas, rotation de l'écran, changement d'écran (devicePixelRatio). */
  private watchViewport(engine: Engine, quality: QualityManager): void {
    this.resizeObserver = new ResizeObserver(() => engine.resize());
    this.resizeObserver.observe(this.canvas);
    const watchDpr = (): void => {
      const media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      media.addEventListener(
        'change',
        () => {
          quality.applyScale();
          watchDpr();
        },
        { once: true },
      );
    };
    watchDpr();
  }

  /** Pause quand l'onglet est caché ; message si le GPU est réinitialisé. */
  private watchLifecycle(engine: Engine): void {
    document.addEventListener('visibilitychange', () => {
      if (this.state === 'error') return;
      if (document.hidden) {
        this.loop?.stop();
        this.setState('paused');
      } else {
        this.loop?.start();
        this.setState('playing');
      }
    });
    let closeToast: (() => void) | null = null;
    engine.onContextLostObservable.add(() => {
      closeToast = showToast(this.uiRoot, t('error.contextLost'), 0);
    });
    engine.onContextRestoredObservable.add(() => closeToast?.());
  }
}
