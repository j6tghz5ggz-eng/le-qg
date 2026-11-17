/**
 * Interaction avec le monde : viser, prendre, porter, lancer, utiliser.
 *
 * - Chaque image, un rayon physique part des yeux vers le centre de l'écran
 *   (portée 2,2 m) et regarde si l'objet touché est enregistré comme
 *   interactif.
 * - Prendre : clic gauche maintenu (PC), bouton « Prendre » (tactile),
 *   X (manette). Lancer : clic droit / F, « Lancer », RB.
 * - Le réticule et les aides sont mis à jour via l'événement
 *   « interaction:focus », émis seulement quand quelque chose change.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import type { GameContext, GameSystem } from '../../app/GameContext';
import { NO_FOCUS, type InteractionFocus } from '../../app/events';
import type { Interactable } from '../../core/interaction/Interactable';
import { ALL_BUT_PLAYER } from '../../core/physics/layers';
import { t } from '../../ui/i18n';
import { PLAYER } from '../movement';
import type { PlayerController } from '../PlayerController';
import { CARRY, canCarry, carryVelocity, isUnderFeet, throwSpeed } from './carry';

interface Target {
  readonly body: PhysicsBody;
  readonly item: Interactable;
  readonly mass: number;
}

interface Held extends Target {
  readonly angularDamping: number;
}

export class InteractionSystem implements GameSystem {
  readonly id = 'interaction';
  private ctx!: GameContext;
  private physicsEngine!: PhysicsEngine;
  private focus: Target | null = null;
  private held: Held | null = null;
  private lastFocusKey = '';
  private readonly ray = new PhysicsRaycastResult();
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

  get focusLabel(): string | null {
    return (this.held ?? this.focus)?.item.label ?? null;
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.physicsEngine = ctx.scene.getPhysicsEngine() as PhysicsEngine;
  }

  update(): void {
    const input = this.ctx.input;
    // Consommés à chaque image : un appui « dans le vide » ne doit pas
    // déclencher une action plus tard.
    const grabPressed = input.consumePress('grab');
    const throwPressed = input.consumePress('throw');
    const usePressed = input.consumePress('use');

    this.dropIfRemoved();
    if (this.held) {
      if (throwPressed) this.release(true);
      else if (!input.isHeld('grab')) this.release(false);
    } else {
      this.updateFocus();
      const focus = this.focus;
      if (focus && grabPressed && focus.item.grabbable && canCarry(focus.mass)) this.grab(focus);
      else if (focus && usePressed && focus.item.use) focus.item.use();
    }
    this.publishFocus();
  }

  fixedUpdate(): void {
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

  private updateFocus(): void {
    const v = this.v;
    v.origin.copyFrom(this.player.camera.position);
    this.player.getForward(v.forward);
    v.end.copyFrom(v.origin).addInPlace(v.forward.scaleInPlace(CARRY.reach));
    this.ray.reset();
    this.physicsEngine.raycastToRef(v.origin, v.end, this.ray, { collideWith: ALL_BUT_PLAYER });
    const body = this.ray.hasHit ? this.ray.body : undefined;
    const item = this.ctx.interactables.get(body);
    if (!body || !item) {
      this.focus = null;
      return;
    }
    if (this.focus?.body !== body) {
      this.focus = { body, item, mass: body.getMassProperties().mass ?? 0 };
    }
  }

  private grab(target: Target): void {
    this.held = { ...target, angularDamping: target.body.getAngularDamping() };
    target.body.setAngularDamping(CARRY.heldAngularDamping);
    this.focus = null;
  }

  private release(throwIt: boolean): void {
    const held = this.held;
    if (!held) return;
    this.held = null;
    held.body.setAngularDamping(held.angularDamping);
    if (throwIt) {
      const direction = this.player.getForward(this.v.forward);
      held.body.setLinearVelocity(direction.scaleInPlace(throwSpeed(held.mass)));
    }
  }

  /** L'objet a été supprimé du monde (ex. limite de caisses atteinte). */
  private dropIfRemoved(): void {
    if (this.held && !this.ctx.interactables.has(this.held.body)) this.held = null;
    if (this.focus && !this.ctx.interactables.has(this.focus.body)) this.focus = null;
  }

  private publishFocus(): void {
    let focus: InteractionFocus = NO_FOCUS;
    if (this.held) {
      focus = { ...NO_FOCUS, label: this.held.item.label, holding: true };
    } else if (this.focus) {
      const { item, mass } = this.focus;
      const grabbable = item.grabbable === true;
      focus = {
        label: item.label,
        canGrab: grabbable && canCarry(mass),
        tooHeavy: grabbable && !canCarry(mass),
        holding: false,
        useLabel: item.use ? (item.useLabel ?? t('interact.use')) : null,
      };
    }
    const key = `${focus.label}|${focus.canGrab}|${focus.tooHeavy}|${focus.holding}|${focus.useLabel}`;
    if (key === this.lastFocusKey) return;
    this.lastFocusKey = key;
    this.ctx.bus.emit('interaction:focus', focus);
  }
}
