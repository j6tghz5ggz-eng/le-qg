/**
 * Chef d'orchestre du son.
 *
 * - Auditeur = caméra (son 3D : on entend une moto au ralenti dans le
 *   garage en s'approchant, à gauche ou à droite).
 * - Moteurs : un son par moto, placé sur la moto (et « sous » le pilote
 *   quand on roule).
 * - Pas (béton ou herbe), atterrissage, vent quand on roule, ambiance
 *   dehors (brise, oiseaux), plus calme dans le garage.
 * - Sons continus : cliquetis de la clé pendant qu'on dévisse, glouglou
 *   quand on verse l'essence ou l'huile.
 * - Bruitages ponctuels demandés par les systèmes via l'événement « sfx »,
 *   chocs physiques des objets surveillés (watch).
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsEventType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { GameContext, GameSystem } from '../app/GameContext';
import type { AudioManager } from '../core/audio/AudioManager';
import type { InteractionSystem } from '../player/interaction/InteractionSystem';
import type { PlayerController } from '../player/PlayerController';
import type { Bike } from '../vehicles/bike/Bike';
import { EngineSound } from '../vehicles/audio/EngineSound';
import type { FuelSystem } from '../vehicles/fuel/FuelSystem';
import type { VehicleSystem } from '../vehicles/VehicleSystem';
import { Sfx, type SfxId } from './Sfx';

export type ImpactMaterial = 'metal' | 'wood' | 'plastic';

/** Surveillance des chocs (fournie aux systèmes via le contexte). */
export interface ImpactSounds {
  watch(body: PhysicsBody, material: ImpactMaterial): void;
}

export type Surface = 'hard' | 'grass';

export interface SoundDeps {
  readonly player: PlayerController;
  readonly vehicles: VehicleSystem;
  readonly interaction: InteractionSystem;
  readonly fuel: FuelSystem;
  /** Sol sous ce point : dur (béton, route) ou herbe. */
  surfaceAt(x: number, z: number): Surface;
  /** Vrai dans un lieu fermé (garage) : pas d'oiseaux, moins de vent. */
  isIndoors(x: number, z: number): boolean;
}

const STEP_LENGTH = 0.8;
const IMPACT_COOLDOWN = 0.12;
const IMPACT_SOUND: Readonly<Record<ImpactMaterial, SfxId>> = { metal: 'impactMetal', wood: 'impactWood', plastic: 'impactPlastic' };

interface EngineVoice {
  readonly sound: EngineSound;
  readonly panner: PannerNode;
}

export class SoundSystem implements GameSystem, ImpactSounds {
  readonly id = 'sound';
  private deps: SoundDeps | null = null;
  private readonly sfx: Sfx | null;
  private readonly engines = new Map<Bike, EngineVoice>();
  private readonly lastImpact = new WeakMap<PhysicsBody, number>();
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private breeze: GainNode | null = null;
  private pour: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private stepDistance = 0;
  private readonly lastFoot = new Vector3();
  private airborne = 0;
  private birdTimer = 4;
  private ratchetTimer = 0;
  private readonly tmp = new Vector3();
  /** Nombre de bruitages joués (tests). */
  played = 0;

  constructor(private readonly audio: AudioManager) {
    this.sfx = audio.context && audio.sfx ? new Sfx(audio.context, audio.sfx) : null;
  }

  attach(deps: SoundDeps): void {
    this.deps = deps;
  }

  init(ctx: GameContext): void {
    ctx.bus.on('sfx', ({ id, at, volume }) => this.play(id, at, volume));
    this.createLoops();
  }

  /** Joue un bruitage (dans le monde si `at` est donné). */
  play(id: SfxId, at?: { x: number; y: number; z: number }, volume = 1): void {
    this.played++;
    if (!this.sfx || !this.audio.running) return;
    this.sfx.play(id, at, volume);
  }

  watch(body: PhysicsBody, material: ImpactMaterial): void {
    body.setCollisionCallbackEnabled(true);
    body.getCollisionObservable().add((event) => {
      if (event.type !== PhysicsEventType.COLLISION_STARTED || !event.point) return;
      const now = performance.now() / 1000;
      if (now - (this.lastImpact.get(body) ?? 0) < IMPACT_COOLDOWN) return;
      const mass = Math.max(body.getMassProperties().mass ?? 1, 0.2);
      // Impulsion ramenée à une vitesse de choc (m/s) : en dessous de ~0,6 m/s, rien.
      const speed = event.impulse / mass;
      if (speed < 0.6) return;
      this.lastImpact.set(body, now);
      this.play(IMPACT_SOUND[material], event.point, Math.min(1, (speed - 0.4) / 4));
    });
  }

  update(dt: number): void {
    const deps = this.deps;
    if (!deps || !this.audio.context) return;
    const camera = deps.player.camera;
    const eye = camera.globalPosition;
    const forward = camera.getDirection(Vector3.Forward());
    this.audio.setListener(eye.x, eye.y, eye.z, forward.x, forward.y, forward.z);

    this.updateEngines(deps, eye);
    this.updateFootsteps(deps, dt);
    this.updateAmbience(deps, dt, eye);
    this.updateWorkshop(deps, dt);
  }

  dispose(): void {
    for (const voice of this.engines.values()) voice.sound.dispose();
  }

  // --- Moteurs -------------------------------------------------------------------

  private updateEngines(deps: SoundDeps, eye: Vector3): void {
    const context = this.audio.context!;
    for (const bike of deps.vehicles.bikes) {
      let voice = this.engines.get(bike);
      if (!voice && this.audio.engines) {
        const panner = context.createPanner();
        panner.panningModel = 'equalpower';
        panner.distanceModel = 'inverse';
        panner.refDistance = 2;
        panner.rolloffFactor = 1;
        panner.maxDistance = 120;
        panner.connect(this.audio.engines);
        voice = { sound: new EngineSound(context, panner), panner };
        this.engines.set(bike, voice);
      }
      if (!voice) continue;
      const ridden = bike === deps.vehicles.current;
      const p = ridden ? this.tmp.set(eye.x, eye.y - 0.7, eye.z) : this.tmp.copyFrom(bike.position).addInPlaceFromFloats(0, 0.2, 0);
      setPannerPosition(voice.panner, p, context.currentTime);
      const pt = bike.powertrain;
      voice.sound.update({ rpm: pt.rpm, throttle: pt.throttle, running: pt.running, loudness: pt.loudness });
    }
  }

  // --- Pas ---------------------------------------------------------------------------

  private updateFootsteps(deps: SoundDeps, dt: number): void {
    const player = deps.player;
    const foot = player.footPosition;
    if (player.isRiding) {
      this.lastFoot.copyFrom(foot);
      this.stepDistance = 0;
      return;
    }
    const moved = Math.hypot(foot.x - this.lastFoot.x, foot.z - this.lastFoot.z);
    this.lastFoot.copyFrom(foot);
    if (moved > 1) return; // téléportation
    const surface = deps.surfaceAt(foot.x, foot.z);
    const at = { x: foot.x, y: foot.y + 0.05, z: foot.z };
    if (!player.isGrounded) {
      // Les micro-décollages (bosse, marche) ne coupent pas la cadence des pas.
      this.airborne += dt;
      if (this.airborne > 0.15) return;
    } else {
      if (this.airborne > 0.35) this.play('land', at, Math.min(1, this.airborne));
      this.airborne = 0;
    }
    this.stepDistance += moved;
    const length = player.isCrouched ? STEP_LENGTH * 0.6 : STEP_LENGTH;
    if (this.stepDistance >= length) {
      this.stepDistance = 0;
      this.play(surface === 'hard' ? 'stepConcrete' : 'stepGrass', at, player.isCrouched ? 0.5 : 1);
    }
  }

  // --- Ambiance -------------------------------------------------------------------

  private createLoops(): void {
    const context = this.audio.context;
    if (!context || !this.sfx || !this.audio.ambient || !this.audio.sfx) return;
    // Vent quand on roule : bruit grave qui monte avec la vitesse.
    {
      const src = this.sfx.noiseSource();
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      const gain = context.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.audio.ambient);
      src.start();
      this.wind = { gain, filter };
    }
    // Brise dehors : très léger souffle.
    {
      const src = this.sfx.noiseSource();
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 500;
      filter.Q.value = 0.4;
      const gain = context.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.audio.ambient);
      src.start();
      this.breeze = gain;
    }
    // Glouglou du versement : bruit filtré, modulé (bulles).
    {
      const src = this.sfx.noiseSource();
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 800;
      filter.Q.value = 2;
      const lfo = context.createOscillator();
      lfo.frequency.value = 7;
      const lfoGain = context.createGain();
      lfoGain.gain.value = 250;
      lfo.connect(lfoGain).connect(filter.frequency);
      const gain = context.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.audio.sfx);
      src.start();
      lfo.start();
      this.pour = { gain, filter };
    }
  }

  private updateAmbience(deps: SoundDeps, dt: number, eye: Vector3): void {
    const t = this.audio.context!.currentTime;
    const bike = deps.vehicles.current;
    const speed = bike ? Math.abs(bike.forwardSpeed) : 0;
    if (this.wind) {
      const k = Math.min(Math.max((speed - 2) / 16, 0), 1.3);
      this.wind.gain.gain.setTargetAtTime(0.5 * k * k, t, 0.2);
      this.wind.filter.frequency.setTargetAtTime(250 + speed * 45, t, 0.2);
    }
    const indoors = deps.isIndoors(eye.x, eye.z);
    this.breeze?.gain.setTargetAtTime(indoors ? 0.012 : 0.05, t, 0.6);
    // Oiseaux dehors, de temps en temps, autour du joueur.
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 3 + Math.random() * 7;
      if (!indoors && speed < 8) {
        const a = Math.random() * Math.PI * 2;
        const d = 8 + Math.random() * 14;
        this.play('bird', { x: eye.x + Math.cos(a) * d, y: eye.y + 3 + Math.random() * 5, z: eye.z + Math.sin(a) * d });
      }
    }
  }

  // --- Atelier ------------------------------------------------------------------

  private updateWorkshop(deps: SoundDeps, dt: number): void {
    const t = this.audio.context!.currentTime;
    // Clé à cliquet pendant un démontage / remontage.
    const hold = deps.interaction.activeHold;
    if (hold && !hold.continuous) {
      this.ratchetTimer -= dt;
      if (this.ratchetTimer <= 0) {
        this.ratchetTimer = 0.11 + Math.random() * 0.04;
        const eye = deps.player.camera.globalPosition;
        const f = deps.player.camera.getDirection(Vector3.Forward());
        this.play('ratchet', { x: eye.x + f.x, y: eye.y + f.y, z: eye.z + f.z }, 0.8);
      }
    } else {
      this.ratchetTimer = 0;
    }
    // Versement d'essence (plus aigu, fluide) ou d'huile (plus grave, lent).
    const kind = deps.fuel.pouringKind;
    if (this.pour) {
      this.pour.gain.gain.setTargetAtTime(kind ? 0.14 : 0, t, 0.08);
      this.pour.filter.frequency.setTargetAtTime(kind === 'oil' ? 480 : 900, t, 0.1);
    }
  }
}

function setPannerPosition(panner: PannerNode, p: Vector3, t: number): void {
  if (panner.positionX) {
    panner.positionX.setTargetAtTime(p.x, t, 0.03);
    panner.positionY.setTargetAtTime(p.y, t, 0.03);
    panner.positionZ.setTargetAtTime(-p.z, t, 0.03);
  } else {
    panner.setPosition(p.x, p.y, -p.z);
  }
}
