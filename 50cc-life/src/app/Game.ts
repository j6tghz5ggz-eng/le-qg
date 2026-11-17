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
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AudioManager } from '../core/audio/AudioManager';
import { createEngine } from '../core/engine/createEngine';
import { EventBus } from '../core/events/EventBus';
import { InputManager } from '../core/input/InputManager';
import { InteractableRegistry } from '../core/interaction/Interactable';
import { GameLoop } from '../core/loop/GameLoop';
import { initPhysics } from '../core/physics/initPhysics';
import { detectPlatform } from '../core/platform/platform';
import { QualityManager } from '../core/quality/QualityManager';
import { DebugOverlay } from '../debug/DebugOverlay';
import { exposeDebugHooks } from '../debug/debugHooks';
import { InteractionSystem } from '../player/interaction/InteractionSystem';
import { PlayerController } from '../player/PlayerController';
import { Hud } from '../ui/hud/Hud';
import { PointerLockHint } from '../ui/hud/PointerLockHint';
import { TouchControls } from '../ui/hud/TouchControls';
import { t } from '../ui/i18n';
import { showFatalError } from '../ui/screens/ErrorScreen';
import { LoadingScreen } from '../ui/screens/LoadingScreen';
import { showToast } from '../ui/screens/Toast';
import { BIKE_SPAWN, PLAYER_SPAWN, SPARE_PART_SPOTS, TELEPORT_POINTS, TestWorld } from '../world/TestWorld';
import { CheatRegistry } from '../debug/CheatRegistry';
import { EconomySystem } from '../economy/EconomySystem';
import { MoneyHud } from '../ui/hud/MoneyHud';
import { MechanicsSystem } from '../mechanics/MechanicsSystem';
import { SM50 } from '../vehicles/bike/specs';
import { VehicleSystem } from '../vehicles/VehicleSystem';
import { VehicleHud } from '../ui/hud/VehicleHud';
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

      const input = new InputManager(this.canvas, platform, this.bus);
      const audio = new AudioManager();
      const ctx: GameContext = {
        engine,
        scene,
        physics,
        bus: this.bus,
        platform,
        quality,
        input,
        audio,
        interactables: new InteractableRegistry(),
        uiRoot: this.uiRoot,
        cheats: new CheatRegistry(),
      };

      loading.setProgress(0.6, t('loading.world'));
      const world = new TestWorld();
      const economy = new EconomySystem();
      const player = new PlayerController(PLAYER_SPAWN.position, PLAYER_SPAWN.yaw, PLAYER_SPAWN.pitch);
      const interaction = new InteractionSystem(player);
      const vehicles = new VehicleSystem(player, { addShadowCaster: (m) => world.environment.addShadowCaster(m) }, [
        { spec: SM50, position: BIKE_SPAWN.position, yaw: BIKE_SPAWN.yaw },
      ]);
      const shadows = { addShadowCaster: (m: Parameters<typeof world.environment.addShadowCaster>[0]) => world.environment.addShadowCaster(m) };
      const mechanics = new MechanicsSystem(vehicles, interaction, player, shadows, [
        { defId: 'cdi-free', condition: 1, position: SPARE_PART_SPOTS[0] },
        { defId: 'plug-std', condition: 1, position: SPARE_PART_SPOTS[1] },
        { defId: 'exhaust-racing', condition: 1, position: SPARE_PART_SPOTS[2] },
        { defId: 'silencer-racing', condition: 1, position: SPARE_PART_SPOTS[3] },
      ]);
      // Ordre important : le monde, le joueur (caméra), les véhicules, la
      // mécanique (fantôme de remontage), puis l'interaction (rayon depuis
      // la caméra, désactivée en conduite).
      // Le HUD de l'argent écoute avant que l'économie annonce le solde de départ.
      new MoneyHud(this.uiRoot, this.bus);
      await this.addSystem(world, ctx);
      await this.addSystem(economy, ctx);
      await this.addSystem(player, ctx);
      await this.addSystem(vehicles, ctx);
      await this.addSystem(mechanics, ctx);
      await this.addSystem(interaction, ctx);

      new Hud(this.uiRoot, this.bus, input.scheme);
      new TouchControls(this.uiRoot, input, this.bus);
      new PointerLockHint(this.uiRoot, input, this.bus);
      new VehicleHud(this.uiRoot, this.bus, input.scheme);
      const crateSpawn = new Vector3();
      ctx.cheats.add('Monde', {
        kind: 'action',
        id: 'crate',
        label: `📦 ${t('debug.spawnCrate')}`,
        code: 'KeyB',
        run: () => {
          // 3 m devant le joueur, 3 m au-dessus des yeux
          player.getForward(crateSpawn).scaleInPlace(3);
          crateSpawn.y = 0;
          crateSpawn.addInPlace(player.getEyePosition(new Vector3())).addInPlaceFromFloats(0, 3, 0);
          world.spawnCrate(crateSpawn);
        },
      });
      for (const point of TELEPORT_POINTS) {
        ctx.cheats.add('Téléportation', {
          kind: 'action',
          id: `tp-${point.id}`,
          label: point.label,
          run: () => {
            // En conduite, la moto est téléportée avec son pilote.
            const bike = vehicles.current;
            if (bike) vehicles.place(bike, point.position, point.yaw);
            else player.teleport(point.position, point.yaw);
            this.bus.emit('ui:notice', { message: `${t('cheat.teleported')} : ${point.label}` });
          },
        });
      }
      new DebugOverlay(
        ctx,
        () => {
          const p = player.footPosition;
          const state = player.isRiding ? 'en moto' : player.isGrounded ? 'au sol' : 'en l’air';
          const lines = [`Joueur      ${p.x.toFixed(1)} ${p.y.toFixed(2)} ${p.z.toFixed(1)}  ·  ${state}${player.isCrouched ? ' · accroupi' : ''}`];
          const bike = vehicles.current;
          if (bike) {
            const d = bike.telemetry();
            lines.push(
              `Moto        ${d.speedKmh.toFixed(1)} km/h · rapport ${d.gear} · ${Math.round(d.rpm)} tr/min · ${d.running ? 'moteur en marche' : 'moteur coupé'}`,
              `            gaz ${d.throttle.toFixed(2)} · embrayage ${d.clutch.toFixed(2)} · frein ${d.brake.toFixed(2)} · guidon ${d.steerDeg.toFixed(1)}° · angle ${d.leanDeg.toFixed(1)}° · roues ${d.wheelsOnGround}`,
            );
          }
          return lines;
        },
        [
          {
            label: t('vehicle.autoClutch'),
            get: () => vehicles.autoClutchEnabled,
            set: (on) => (vehicles.autoClutchEnabled = on),
          },
          { label: t('settings.sound'), get: () => audio.enabled, set: (on) => (audio.enabled = on) },
        ],
      );

      loading.setProgress(0.85, t('loading.shaders'));
      // Compile les shaders avant d'afficher la scène (évite les saccades au démarrage).
      await scene.whenReadyAsync();

      this.loop = new GameLoop(engine, scene, {
        beforeFrame: (dt) => input.poll(dt),
        fixedUpdate: (dt) => {
          for (const s of this.systems) s.fixedUpdate?.(dt);
        },
        lateFixedUpdate: (dt) => {
          for (const s of this.systems) s.lateFixedUpdate?.(dt);
        },
        update: (dt, alpha) => {
          for (const s of this.systems) s.update?.(dt, alpha);
        },
        afterRender: (frameMs) => quality.onFrame(frameMs),
        onError: (error) => this.fail(t('error.generic'), error),
      });

      this.watchViewport(engine, quality);
      this.watchLifecycle(engine, input);
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
        get scheme() {
          return input.scheme;
        },
        get player() {
          const p = player.footPosition;
          return { x: p.x, y: p.y, z: p.z, grounded: player.isGrounded, crouched: player.isCrouched };
        },
        get holding() {
          return interaction.isHolding;
        },
        get focus() {
          return interaction.focusLabel;
        },
        get vehicle() {
          const bike = vehicles.current;
          if (!bike) return null;
          const d = bike.telemetry();
          return {
            speedKmh: d.speedKmh,
            rpm: d.rpm,
            heading: d.heading,
            lean: d.leanDeg,
            wheelsOnGround: d.wheelsOnGround,
            gear: d.gear,
            running: d.running,
          };
        },
        get bikeParts() {
          return mechanics.installedSlots();
        },
        get money() {
          return economy.wallet.balance;
        },
        slotPosition: (slot: string) => {
          const p = mechanics.slotWorldPosition(slot);
          return p ? { x: p.x, y: p.y, z: p.z } : null;
        },
        looseParts: () => mechanics.looseParts().map((l) => ({ name: l.name, x: l.position.x, y: l.position.y, z: l.position.z })),
        lookAt: (x: number, y: number, z: number) => player.lookAt({ x, y, z }),
        get parkedBike() {
          const bike = vehicles.bikes[0];
          return bike ? { x: bike.position.x, y: bike.position.y, z: bike.position.z, lean: bike.leanAngle } : null;
        },
        probeY: () => world.probeY(),
      }, { scene, engine, player, vehicles, interaction, world, input, mechanics, economy, cheats: ctx.cheats });

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
  private watchLifecycle(engine: Engine, input: InputManager): void {
    document.addEventListener('visibilitychange', () => {
      if (this.state === 'error') return;
      if (document.hidden) {
        input.releaseAll();
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
