/**
 * Joueur en vue à la première personne.
 *
 * Physique : contrôleur de personnage Havok (capsule) fourni par Babylon.
 * Il gère les pentes (45° max), les marches (35 cm : seuils, trottoirs),
 * la poussée des objets et l'accroupissement (la capsule rétrécit vraiment,
 * on peut passer sous un obstacle bas).
 *
 * Rythmes :
 * - fixedUpdate (1/60 s) : déplacement physique.
 * - update (chaque image) : rotation du regard (immédiate, sans latence)
 *   et position de la caméra interpolée entre deux pas (fluide à 144 Hz).
 */
import { Camera } from '@babylonjs/core/Cameras/camera';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import {
  CharacterSupportedState,
  PhysicsCharacterController,
  type CharacterSurfaceInfo,
} from '@babylonjs/core/Physics/v2/characterController';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import type { GameContext, GameSystem } from '../app/GameContext';
import { ALL_BUT_PLAYER, Layer } from '../core/physics/layers';
import { GRAVITY } from '../core/physics/initPhysics';
import { createPostProcesses } from '../core/rendering/postProcesses';
import {
  PLAYER,
  clampPitch,
  groundSpeed,
  jumpVelocity,
  lookDirection,
  moveDirection,
  nextMoveState,
  smoothTowards,
  stepUpHeight,
  type MoveState,
} from './movement';

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
/** Champ de vision vertical en paysage (≈ 62°) et horizontal en portrait (≈ 60°). */
const FOV_LANDSCAPE = 1.08;
const FOV_PORTRAIT = 1.05;
const EYE_SMOOTHING = 14;
/** Regard libre du pilote autour de l'axe de la moto (rad). */
const RIDER_YAW_LIMIT = 2.0;
const RIDER_PITCH_LIMITS = [-1.0, 1.1] as const;
/** Part de l'inclinaison de la moto annulée pour la caméra (confort, mal des transports). */
const RIDER_ROLL_COMPENSATION = 0.5;
/** Hauteur des yeux d'un pilote assis au-dessus du sol (m), pour placer la capsule. */
const RIDER_EYE_HEIGHT = 1.45;
/** Vitesse à laquelle la caméra rattrape une montée de marche. */
const STEP_SMOOTHING = 18;
/** En dessous de cette part de la vitesse voulue, le joueur est considéré bloqué. */
const BLOCKED_RATIO = 0.35;

export class PlayerController implements GameSystem {
  readonly id = 'player';
  camera!: FreeCamera;
  private ctx!: GameContext;
  private physicsEngine!: PhysicsEngine;
  private controller!: PhysicsCharacterController;
  private yaw: number;
  private pitch: number;
  private moveState: MoveState = 'inAir';
  private crouched = false;
  private eyeHeight: number = PLAYER.eyeStanding;
  /** Décalage visuel de la caméra après une montée de marche (m, ≤ 0). */
  private stepOffset = 0;
  /** Temps (s) pendant lequel le placage au sol est suspendu après une marche. */
  private snapCooldown = 0;
  /** Siège occupé (null = à pied). */
  private seat: { readonly eye: TransformNode; readonly lean: () => number } | null = null;
  private riderYaw = 0;
  private riderPitch = 0;
  private savedCollideMask = 0;
  private portrait: boolean | null = null;
  private readonly prevFoot = new Vector3();
  private readonly currFoot = new Vector3();
  private readonly support: CharacterSurfaceInfo = {
    isSurfaceDynamic: false,
    supportedState: CharacterSupportedState.UNSUPPORTED,
    averageSurfaceNormal: new Vector3(),
    averageSurfaceVelocity: new Vector3(),
    averageAngularSurfaceVelocity: new Vector3(),
  };
  private readonly ray = new PhysicsRaycastResult();
  private readonly tmp = {
    desired: new Vector3(),
    forward: new Vector3(),
    out: new Vector3(),
    a: new Vector3(),
    b: new Vector3(),
  };

  constructor(
    private readonly spawn: Vector3,
    private readonly spawnYaw = 0,
    private readonly spawnPitch = 0,
  ) {
    this.yaw = spawnYaw;
    this.pitch = spawnPitch;
  }

  get isGrounded(): boolean {
    return this.moveState === 'onGround';
  }

  get isCrouched(): boolean {
    return this.crouched;
  }

  get isRiding(): boolean {
    return this.seat !== null;
  }

  /** Position des pieds au dernier pas de simulation. */
  get footPosition(): Vector3 {
    return this.currFoot;
  }

  /** Position des yeux au dernier pas de simulation (non interpolée). */
  getEyePosition(out: Vector3): Vector3 {
    return out.set(this.currFoot.x, this.currFoot.y + this.eyeHeight, this.currFoot.z);
  }

  getForward(out: Vector3): Vector3 {
    lookDirection(this.yaw, this.pitch, out);
    return out;
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    const scene = ctx.scene;
    this.physicsEngine = scene.getPhysicsEngine() as PhysicsEngine;

    const center = this.spawn.add(new Vector3(0, PLAYER.standingHeight / 2, 0));
    const c = new PhysicsCharacterController(
      center,
      { capsuleHeight: PLAYER.standingHeight, capsuleRadius: PLAYER.radius },
      scene,
    );
    c.maxStepHeight = PLAYER.maxStepHeight;
    c.keepDistance = PLAYER.keepDistance;
    c.keepContactTolerance = PLAYER.keepContactTolerance;
    c.maxSlopeCosine = Math.cos((PLAYER.maxSlopeDegrees * Math.PI) / 180);
    c.characterMass = PLAYER.mass;
    c.characterStrength = PLAYER.pushStrength;
    c.acceleration = PLAYER.acceleration;
    c.maxCharacterSpeedForSolver = PLAYER.sprintSpeed * 2;
    c.shape.filterMembershipMask = Layer.PLAYER;
    this.controller = c;
    this.readFoot(this.currFoot);
    this.prevFoot.copyFrom(this.currFoot);

    const camera = new FreeCamera('player-camera', this.getEyePosition(new Vector3()), scene);
    camera.inputs.clear(); // la caméra est pilotée par le joueur, pas par Babylon
    camera.minZ = 0.05; // voir de près une pièce de moteur
    camera.maxZ = ctx.quality.profile.viewDistance * 1.1;
    camera.rotation.set(this.pitch, this.yaw, 0);
    scene.activeCamera = camera;
    this.camera = camera;
    this.updateFov();
    createPostProcesses(camera, ctx.quality.profile);
  }

  fixedUpdate(dt: number): void {
    if (this.seat) {
      this.followSeat();
      return;
    }
    const c = this.controller;
    const input = this.ctx.input;
    c.checkSupportToRef(dt, DOWN, this.support);
    const supported = this.support.supportedState === CharacterSupportedState.SUPPORTED;

    this.updateCrouch(input.isHeld('crouch'));

    const current = c.getVelocity();
    const verticalSpeed = current.dot(UP);
    const wantsJump = supported && this.moveState === 'onGround' && !this.crouched && input.consumePress('jump');
    this.moveState = nextMoveState(this.moveState, supported, wantsJump, verticalSpeed);

    const move = input.getMove();
    const speed = groundSpeed({ sprint: input.isHeld('sprint'), crouched: this.crouched });
    const desired = moveDirection(move.x, move.y, this.yaw, this.tmp.desired);
    desired.scaleInPlace(speed);
    const forward = this.tmp.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    const velocity = this.tmp.out;
    switch (this.moveState) {
      case 'startJump': {
        const boost = jumpVelocity(GRAVITY.y, PLAYER.jumpHeight) - verticalSpeed;
        velocity.copyFrom(current).addInPlace(this.tmp.a.copyFrom(UP).scaleInPlace(boost));
        break;
      }
      case 'inAir':
        this.airVelocity(current, desired, speed, dt, velocity);
        break;
      case 'onGround':
        this.groundVelocity(dt, forward, current, desired, velocity);
        break;
    }

    c.setVelocity(velocity);
    c.integrate(dt, this.support, GRAVITY);

    this.prevFoot.copyFrom(this.currFoot);
    this.readFoot(this.currFoot);
    if (this.moveState === 'onGround') this.assistStep(desired, dt);
    if (this.currFoot.y < PLAYER.fallLimit) this.respawn();
  }

  update(dt: number, alpha: number): void {
    const look = this.ctx.input.consumeLook();
    if (this.seat) {
      // Regard libre autour de l'axe de la moto ; la caméra suit la moto.
      this.riderYaw = Math.max(-RIDER_YAW_LIMIT, Math.min(RIDER_YAW_LIMIT, this.riderYaw + look.x));
      this.riderPitch = Math.max(RIDER_PITCH_LIMITS[0], Math.min(RIDER_PITCH_LIMITS[1], this.riderPitch + look.y));
      this.camera.rotation.set(this.riderPitch, this.riderYaw, this.seat.lean() * RIDER_ROLL_COMPENSATION);
      this.updateFov();
      return;
    }
    this.yaw += look.x;
    this.pitch = clampPitch(this.pitch + look.y);

    const targetEye = this.crouched ? PLAYER.eyeCrouch : PLAYER.eyeStanding;
    this.eyeHeight = smoothTowards(this.eyeHeight, targetEye, EYE_SMOOTHING, dt);

    this.stepOffset = smoothTowards(this.stepOffset, 0, STEP_SMOOTHING, dt);
    const foot = Vector3.LerpToRef(this.prevFoot, this.currFoot, alpha, this.tmp.a);
    this.camera.position.set(foot.x, foot.y + this.eyeHeight + this.stepOffset, foot.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.updateFov();
  }

  /**
   * Monte sur un véhicule : la caméra est rattachée aux yeux du pilote et la
   * capsule du joueur ne touche plus rien (elle suit la moto).
   */
  mount(eye: TransformNode, lean: () => number): void {
    if (this.seat) return;
    if (this.crouched) {
      this.crouched = false;
      this.controller.setShapeOptions({ capsuleHeight: PLAYER.standingHeight, capsuleRadius: PLAYER.radius }, true);
      this.controller.shape.filterMembershipMask = Layer.PLAYER;
    }
    this.seat = { eye, lean };
    this.savedCollideMask = this.controller.shape.filterCollideMask;
    this.controller.shape.filterCollideMask = 0;
    this.controller.setVelocity(Vector3.Zero());
    this.riderYaw = 0;
    this.riderPitch = 0.12;
    this.camera.parent = eye;
    this.camera.position.setAll(0);
  }

  /** Descend du véhicule : pieds posés en `foot`, regard vers `heading` (+ regard libre). */
  dismount(foot: Vector3, heading: number): void {
    if (!this.seat) return;
    this.seat = null;
    this.camera.parent = null;
    this.controller.shape.filterCollideMask = this.savedCollideMask;
    this.controller.setPosition(new Vector3(foot.x, foot.y + this.controller.footOffset + 0.02, foot.z));
    this.controller.setVelocity(Vector3.Zero());
    this.yaw = heading + this.riderYaw;
    this.pitch = clampPitch(this.riderPitch);
    this.moveState = 'inAir';
    this.readFoot(this.currFoot);
    this.prevFoot.copyFrom(this.currFoot);
    this.eyeHeight = PLAYER.eyeStanding;
  }

  /** En conduite, la capsule suit la moto (sa position sert au streaming du monde, etc.). */
  private followSeat(): void {
    if (!this.seat) return;
    const eye = this.seat.eye.getAbsolutePosition();
    this.controller.setPosition(this.tmp.a.set(eye.x, eye.y - RIDER_EYE_HEIGHT + this.controller.footOffset, eye.z));
    this.prevFoot.copyFrom(this.currFoot);
    this.readFoot(this.currFoot);
  }

  /** Replace le joueur au point de départ (chute hors du monde…). */
  respawn(): void {
    this.controller.setPosition(this.spawn.add(new Vector3(0, this.capsuleHeight() / 2, 0)));
    this.controller.setVelocity(Vector3.Zero());
    this.yaw = this.spawnYaw;
    this.pitch = this.spawnPitch;
    this.moveState = 'inAir';
    this.readFoot(this.currFoot);
    this.prevFoot.copyFrom(this.currFoot);
  }

  dispose(): void {
    this.controller.dispose();
    this.camera.dispose();
  }

  /** Au sol : suit la surface (pentes, plateformes mobiles), d'après l'exemple officiel Babylon. */
  private groundVelocity(dt: number, forward: Vector3, current: Vector3, desired: Vector3, out: Vector3): void {
    const s = this.support;
    // Contre l'arête d'une marche, la normale moyenne penche fortement : on
    // garde alors la verticale, sinon la vitesse s'effondre et le contrôleur
    // ne tente plus de monter la marche.
    const normal = s.averageSurfaceNormal.y >= this.controller.maxSlopeCosine ? s.averageSurfaceNormal : UP;
    this.controller.calculateMovementToRef(
      dt,
      forward,
      normal,
      current,
      s.averageSurfaceVelocity,
      desired,
      UP,
      out,
    );
    out.subtractInPlace(s.averageSurfaceVelocity);
    if (out.dot(UP) > 1e-3) {
      // Reprojette la vitesse sur l'horizontale pour ne pas « décoller » en montée.
      const length = out.length();
      out.normalizeFromLength(length);
      const horizontal = length / normal.dot(UP);
      const side = Vector3.CrossToRef(normal, out, this.tmp.b);
      Vector3.CrossToRef(side, UP, out);
      out.scaleInPlace(horizontal);
    }
    out.addInPlace(s.averageSurfaceVelocity);
    // Plaque au sol (le solveur arrête la capsule à la surface), seulement sur
    // un sol presque plat : sur l'arête d'une marche, cela ferait redescendre.
    this.snapCooldown = Math.max(0, this.snapCooldown - dt);
    if (this.snapCooldown === 0 && s.averageSurfaceNormal.y > 0.9) out.y -= PLAYER.groundSnapSpeed;
  }

  /** En l'air : l'élan est conservé, la commande n'agit qu'en partie. */
  private airVelocity(current: Vector3, desired: Vector3, speed: number, dt: number, out: Vector3): void {
    const vertical = current.y;
    out.set(current.x, 0, current.z);
    const horizontalSpeed = Math.hypot(out.x, out.z);
    out.addInPlace(this.tmp.b.copyFrom(desired).scaleInPlace(PLAYER.airControl * dt * 4));
    const max = Math.max(speed, horizontalSpeed);
    const length = Math.hypot(out.x, out.z);
    if (length > max) out.scaleInPlace(max / length);
    out.y = vertical + GRAVITY.y * dt;
  }

  /**
   * Aide à la montée de marche (seuil, trottoir…). Le contrôleur Havok de
   * Babylon ne monte les marches qu'à vitesse élevée ; ici, si le joueur est
   * bloqué, on sonde devant ses pieds : un dessus plat, plus bas que
   * maxStepHeight, avec la place de se tenir debout au-dessus → on le pose
   * dessus. La caméra lisse la montée.
   */
  private assistStep(desired: Vector3, dt: number): void {
    const desiredSpeed = Math.hypot(desired.x, desired.z);
    if (desiredSpeed < 0.3) return;
    const moved = Math.hypot(this.currFoot.x - this.prevFoot.x, this.currFoot.z - this.prevFoot.z);
    if (moved > desiredSpeed * dt * BLOCKED_RATIO) return;

    const dirX = desired.x / desiredSpeed;
    const dirZ = desired.z / desiredSpeed;
    const foot = this.currFoot;
    const reach = PLAYER.radius + 0.12;
    const from = this.tmp.a;
    const to = this.tmp.b;

    // 1. Rayon vertical devant les pieds : y a-t-il un dessus de marche ?
    from.set(foot.x + dirX * reach, foot.y + PLAYER.maxStepHeight + 0.05, foot.z + dirZ * reach);
    to.set(from.x, foot.y - 0.05, from.z);
    if (!this.cast(from, to) || this.ray.body?.getMotionType() === PhysicsMotionType.DYNAMIC) return;
    const height = stepUpHeight(foot.y, this.ray.hitPointWorld.y, this.ray.hitNormalWorld.y, PLAYER.maxStepHeight);
    if (height === null) return;
    const top = foot.y + height;

    // 2. Place pour la tête au-dessus de la marche ?
    from.set(foot.x + dirX * reach, top + 0.05, foot.z + dirZ * reach);
    to.set(from.x, top + this.capsuleHeight(), from.z);
    if (this.cast(from, to)) return;

    // 3. Pas de mur juste derrière l'arête (au niveau de la marche) ?
    from.set(foot.x, top + 0.08, foot.z);
    to.set(foot.x + dirX * reach, top + 0.08, foot.z + dirZ * reach);
    if (this.cast(from, to)) return;

    const position = this.controller.getPosition();
    this.controller.setPosition(
      this.tmp.desired.set(position.x + dirX * 0.04, position.y + height + 0.01, position.z + dirZ * 0.04),
    );
    this.readFoot(this.currFoot);
    this.prevFoot.y = this.currFoot.y; // pas d'interpolation verticale : c'est stepOffset qui lisse
    this.stepOffset -= height;
    this.snapCooldown = 0.25;
  }

  /** Rayon physique qui ignore le joueur. Le résultat est dans `this.ray`. */
  private cast(from: Vector3, to: Vector3): boolean {
    this.ray.reset();
    this.physicsEngine.raycastToRef(from, to, this.ray, { collideWith: ALL_BUT_PLAYER });
    return this.ray.hasHit;
  }

  private updateCrouch(wantsCrouch: boolean): void {
    if (wantsCrouch === this.crouched) return;
    if (!wantsCrouch && !this.hasHeadroom()) return; // plafond trop bas pour se relever
    this.crouched = wantsCrouch;
    this.controller.setShapeOptions(
      { capsuleHeight: this.capsuleHeight(), capsuleRadius: PLAYER.radius },
      true,
    );
    this.controller.shape.filterMembershipMask = Layer.PLAYER;
  }

  private capsuleHeight(): number {
    return this.crouched ? PLAYER.crouchHeight : PLAYER.standingHeight;
  }

  /** Vérifie (5 rayons) qu'il y a la place de se relever. */
  private hasHeadroom(): boolean {
    const foot = this.currFoot;
    const from = this.tmp.a;
    const to = this.tmp.b;
    const r = PLAYER.radius * 0.7;
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      from.set(foot.x + ox, foot.y + PLAYER.crouchHeight - 0.05, foot.z + oz);
      to.set(foot.x + ox, foot.y + PLAYER.standingHeight + 0.05, foot.z + oz);
      if (this.cast(from, to)) return false;
    }
    return true;
  }

  private readFoot(out: Vector3): void {
    const position = this.controller.getPosition();
    out.set(position.x, position.y - this.controller.footOffset, position.z);
  }

  private updateFov(): void {
    const engine = this.ctx.engine;
    const portrait = engine.getRenderHeight() > engine.getRenderWidth();
    if (portrait === this.portrait) return;
    this.portrait = portrait;
    this.camera.fovMode = portrait ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
    this.camera.fov = portrait ? FOV_PORTRAIT : FOV_LANDSCAPE;
  }
}
