/**
 * Interaction avec le monde : viser, prendre, porter, lancer, utiliser,
 * démonter / remonter (actions à maintenir).
 *
 * - Chaque image, on cherche ce que vise le centre de l'écran (portée
 *   2,2 m) : un rayon physique pour les objets, une intersection avec les
 *   modèles 3D pour les pièces montées sur une moto (elles font partie du
 *   corps physique de la moto). Le plus proche gagne.
 * - Prendre : clic gauche maintenu (PC), bouton « Prendre » (tactile),
 *   X (manette). Lancer : clic droit / F, « Lancer », RB.
 * - Utiliser : E / bouton contextuel / Y. Instantané (interrupteur, monter
 *   sur la moto) ou à maintenir (dévisser une pièce). En portant une pièce
 *   près de son emplacement libre : maintenir pour la remonter.
 * - Le réticule et les aides sont mis à jour via l'événement
 *   « interaction:focus », émis seulement quand quelque chose change.
 */
import { Ray } from '@babylonjs/core/Culling/ray';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import type { GameContext, GameSystem } from '../../app/GameContext';
import { NO_FOCUS, type InteractionFocus } from '../../app/events';
import type { HoldAction, Interactable } from '../../core/interaction/Interactable';
import { ALL_BUT_PLAYER } from '../../core/physics/layers';
import { t } from '../../ui/i18n';
import { PLAYER } from '../movement';
import type { PlayerController } from '../PlayerController';
import { CARRY, canCarry, carryVelocity, isUnderFeet, throwSpeed } from './carry';

interface Target {
  /** Corps physique (absent pour une cible visée par son modèle 3D). */
  readonly body: PhysicsBody | null;
  readonly item: Interactable;
  readonly mass: number;
}

interface Held extends Target {
  readonly body: PhysicsBody;
  readonly angularDamping: number;
}

/** Une pièce visée par son modèle peut être un peu derrière la surface physique. */
const MESH_PRIORITY_MARGIN = 0.25;
/**
 * Une pièce « dans » la moto ne gagne la visée que si elle est à moins de
 * cette distance derrière le point où le regard touche la moto : une pièce
 * de l'autre côté (le pot, vu depuis le flanc gauche…) ne vole pas la visée
 * quand on veut monter.
 */
const OWNER_DEPTH = 0.4;
/**
 * Aide à la visée : une petite pièce (bougie : 2,4 cm) compte comme visée
 * si le rayon passe à moins de cette distance de son volume (m).
 */
const AIM_ASSIST = 0.03;
/** L'aide ne concerne que les petites pièces (rayon englobant en m) : un pot fait 60 cm. */
const AIM_ASSIST_MAX_RADIUS = 0.08;

export class InteractionSystem implements GameSystem {
  readonly id = 'interaction';
  private ctx!: GameContext;
  private physicsEngine!: PhysicsEngine;
  private focus: Target | null = null;
  private held: Held | null = null;
  /** Action maintenue en cours et son avancement. */
  private holding: { action: HoldAction; progress: number } | null = null;
  private lastFocusKey = '';
  private readonly ray = new PhysicsRaycastResult();
  private readonly meshRay = new Ray(Vector3.Zero(), Vector3.Forward(), CARRY.reach);
  private readonly v = {
    origin: new Vector3(),
    end: new Vector3(),
    forward: new Vector3(),
    target: new Vector3(),
    velocity: new Vector3(),
    angular: new Vector3(),
  };

  constructor(private readonly player: PlayerController) {}

  get isHolding(): boolean {
    return this.held !== null;
  }

  /** Corps de l'objet porté (null si les mains sont vides). */
  get heldBody(): PhysicsBody | null {
    return this.held?.body ?? null;
  }

  get focusLabel(): string | null {
    return (this.held ?? this.focus)?.item.label ?? null;
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.physicsEngine = ctx.scene.getPhysicsEngine() as PhysicsEngine;
  }

  update(dt: number): void {
    const input = this.ctx.input;
    if (this.player.isRiding) {
      // En conduite, les commandes appartiennent au véhicule.
      this.focus = null;
      this.holding = null;
      if (this.held) this.release(false);
      this.publishFocus(null);
      return;
    }
    // Consommés à chaque image : un appui « dans le vide » ne doit pas
    // déclencher une action plus tard.
    const grabPressed = input.consumePress('grab');
    const throwPressed = input.consumePress('throw');
    const usePressed = input.consumePress('use');

    this.dropIfRemoved();
    let action: HoldAction | null = null;
    if (this.held) {
      action = this.held.item.installTarget?.() ?? null;
      if (throwPressed) this.release(true);
      else if (!input.isHeld('grab')) this.release(false);
    } else {
      this.updateFocus();
      const focus = this.focus;
      action = focus?.item.hold ?? null;
      if (focus?.body && grabPressed && focus.item.grabbable && canCarry(focus.mass)) this.grab(focus as Held);
      else if (focus && usePressed && focus.item.use) focus.item.use();
    }
    this.updateHold(action, usePressed, input.isHeld('use'), dt);
    this.publishFocus(action);
  }

  fixedUpdate(): void {
    // L'objet porté peut avoir été retiré du monde depuis la dernière image
    // (ex. pièce remontée sur la moto) : ne jamais toucher un corps détruit.
    this.dropIfRemoved();
    const held = this.held;
    if (!held) return;
    const v = this.v;
    const position = held.body.transformNode.position;
    this.player.getEyePosition(v.origin);
    this.player.getForward(v.forward);
    v.target.copyFrom(v.origin).addInPlace(v.forward.scaleInPlace(CARRY.holdDistance));
    v.target.y -= CARRY.holdDrop;

    if (
      Vector3.Distance(position, v.target) > CARRY.breakDistance ||
      isUnderFeet(position, this.player.footPosition, PLAYER.radius)
    ) {
      this.release(false);
      return;
    }
    held.body.setLinearVelocity(carryVelocity(position, v.target, CARRY.gain, CARRY.maxSpeed, v.velocity));
    held.body.getAngularVelocityToRef(v.angular);
    held.body.setAngularVelocity(v.angular.scaleInPlace(0.8));
  }

  dispose(): void {
    if (this.held) this.release(false);
  }

  /** Démarre, fait avancer ou annule l'action maintenue. */
  private updateHold(action: HoldAction | null, pressed: boolean, held: boolean, dt: number): void {
    if (!action || !held) {
      this.holding = null;
      return;
    }
    if (this.holding?.action !== action) {
      this.holding = null;
      if (!pressed) return; // il faut un nouvel appui pour commencer
      const blocker = action.blocker();
      if (blocker) {
        this.ctx.bus.emit('ui:notice', { message: blocker });
        return;
      }
      this.holding = { action, progress: 0 };
    }
    if (action.tick) {
      // Action continue : tant que la touche est maintenue.
      const going = action.tick(dt);
      this.holding.progress = action.progress?.() ?? 0;
      if (!going) {
        this.holding = null;
        action.complete();
      }
      return;
    }
    this.holding.progress += dt / Math.max(action.seconds, 0.05);
    if (this.holding.progress >= 1) {
      this.holding = null;
      action.complete();
    }
  }

  private updateFocus(): void {
    const v = this.v;
    v.origin.copyFrom(this.player.camera.position);
    this.player.getForward(v.forward);
    v.end.copyFrom(v.forward).scaleInPlace(CARRY.reach).addInPlace(v.origin);
    this.ray.reset();
    this.physicsEngine.raycastToRef(v.origin, v.end, this.ray, { collideWith: ALL_BUT_PLAYER });
    const physicsDistance = this.ray.hasHit ? Vector3.Distance(v.origin, this.ray.hitPointWorld) : Infinity;

    // Pièces visées par leur modèle 3D (pièces montées sur une moto).
    this.meshRay.origin.copyFrom(v.origin);
    this.meshRay.direction.copyFrom(v.forward);
    this.meshRay.length = CARRY.reach;
    let meshItem: Interactable | null = null;
    let meshOwner: PhysicsBody | null = null;
    let meshDistance = Infinity;
    for (const [mesh, target] of this.ctx.interactables.meshTargets()) {
      if (!mesh.isEnabled() || !mesh.isVisible) continue;
      const pick = this.meshRay.intersectsMesh(mesh);
      const distance = pick.hit ? pick.distance : this.nearMiss(mesh.getBoundingInfo().boundingSphere);
      if (distance < meshDistance) {
        meshDistance = distance;
        meshItem = target.item;
        meshOwner = target.owner;
      }
    }
    // La pièce gagne si elle est devant, ou si le rayon physique a touché
    // le corps qui la porte (la pièce est « dans » la forme de la moto).
    const hitOwner = meshOwner !== null && this.ray.hasHit && this.ray.body === meshOwner && meshDistance <= physicsDistance + OWNER_DEPTH;
    if (meshItem && (hitOwner || meshDistance <= physicsDistance + MESH_PRIORITY_MARGIN)) {
      if (this.focus?.item !== meshItem) this.focus = { body: null, item: meshItem, mass: 0 };
      return;
    }

    let body = this.ray.hasHit ? this.ray.body : undefined;
    if (!this.ctx.interactables.get(body)) body = this.nearestInProximity(v.forward) ?? undefined;
    const item = this.ctx.interactables.get(body);
    if (!body || !item) {
      this.focus = null;
      return;
    }
    if (this.focus?.body !== body) {
      this.focus = { body, item, mass: body.getMassProperties().mass ?? 0 };
    }
  }

  /**
   * Aide à la visée : distance le long du rayon si celui-ci frôle la sphère
   * englobante de la pièce (à AIM_ASSIST près), sinon l'infini.
   */
  private nearMiss(sphere: { centerWorld: Vector3; radiusWorld: number }): number {
    if (sphere.radiusWorld > AIM_ASSIST_MAX_RADIUS) return Infinity;
    const ray = this.meshRay;
    const v = this.v.velocity.copyFrom(sphere.centerWorld).subtractInPlace(ray.origin);
    const along = Vector3.Dot(v, ray.direction);
    if (along <= 0 || along > ray.length) return Infinity;
    const miss = Math.sqrt(Math.max(v.lengthSquared() - along * along, 0));
    // Légère pénalité : une pièce réellement touchée reste prioritaire.
    return miss <= sphere.radiusWorld + AIM_ASSIST ? along + 0.05 : Infinity;
  }

  /** Objet « de proximité » le plus proche, devant le joueur. */
  private nearestInProximity(forward: Vector3): PhysicsBody | null {
    const foot = this.player.footPosition;
    const flatLength = Math.hypot(forward.x, forward.z) || 1;
    const fx = forward.x / flatLength;
    const fz = forward.z / flatLength;
    let best: PhysicsBody | null = null;
    let bestDistance = Infinity;
    for (const [body, proximity] of this.ctx.interactables.proximityEntries()) {
      const p = proximity.position();
      const dx = p.x - foot.x;
      const dz = p.z - foot.z;
      const distance = Math.hypot(dx, dz);
      if (distance > proximity.radius || distance >= bestDistance || Math.abs(p.y - foot.y) > 1.5) continue;
      if (distance > 0.3 && (dx * fx + dz * fz) / distance < 0.2) continue; // derrière le joueur
      best = body;
      bestDistance = distance;
    }
    return best;
  }

  private grab(target: Held | Target): void {
    if (target.body) {
      const p = target.body.transformNode.getAbsolutePosition();
      this.ctx.bus.emit('sfx', { id: 'grab', at: { x: p.x, y: p.y, z: p.z } });
    }
    if (!target.body) return;
    this.held = { body: target.body, item: target.item, mass: target.mass, angularDamping: target.body.getAngularDamping() };
    target.body.setAngularDamping(CARRY.heldAngularDamping);
    this.focus = null;
  }

  /** Action maintenue en cours (pour le son : cliquet de la clé). */
  get activeHold(): { readonly continuous: boolean } | null {
    return this.holding ? { continuous: this.holding.action.tick !== undefined } : null;
  }

  /** Lâche l'objet tenu (chargement d'une sauvegarde, téléportation…). */
  dropHeld(): void {
    this.release(false);
  }

  private release(throwIt: boolean): void {
    const held = this.held;
    if (!held) return;
    this.held = null;
    held.body.setAngularDamping(held.angularDamping);
    if (throwIt) {
      this.ctx.bus.emit('sfx', { id: 'throw' });
      const direction = this.player.getForward(this.v.forward);
      held.body.setLinearVelocity(direction.scaleInPlace(throwSpeed(held.mass)));
    }
  }

  /** L'objet a été supprimé du monde (ex. pièce remontée, limite de caisses). */
  private dropIfRemoved(): void {
    if (this.held && !this.ctx.interactables.has(this.held.body)) this.held = null;
    if (this.focus?.body && !this.ctx.interactables.has(this.focus.body)) this.focus = null;
  }

  private publishFocus(action: HoldAction | null): void {
    let focus: InteractionFocus = NO_FOCUS;
    const progress = this.holding ? Math.min(this.holding.progress, 1) : 0;
    if (this.held) {
      focus = {
        ...NO_FOCUS,
        label: this.held.item.label,
        holding: true,
        useLabel: action?.label ?? null,
        hold: action !== null,
        detail: action?.detail ?? this.held.item.detail ?? null,
        progress: this.holding && action?.progress ? Math.min(action.progress(), 1) : progress,
      };
    } else if (this.focus) {
      const { item, mass, body } = this.focus;
      const grabbable = item.grabbable === true && body !== null;
      const instantUse = item.use ? (item.useLabel ?? t('interact.use')) : null;
      focus = {
        label: item.label,
        canGrab: grabbable && canCarry(mass),
        tooHeavy: grabbable && !canCarry(mass),
        holding: false,
        useLabel: action?.label ?? instantUse,
        hold: action !== null,
        detail: action?.detail ?? item.detail ?? null,
        progress: this.holding && action?.progress ? Math.min(action.progress(), 1) : progress,
      };
    }
    const key = `${focus.label}|${focus.canGrab}|${focus.tooHeavy}|${focus.holding}|${focus.useLabel}|${focus.detail}|${focus.progress.toFixed(2)}`;
    if (key === this.lastFocusKey) return;
    this.lastFocusKey = key;
    this.ctx.bus.emit('interaction:focus', focus);
  }
}
