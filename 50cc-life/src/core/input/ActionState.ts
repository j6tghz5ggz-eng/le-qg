/**
 * État des actions, alimenté par tous les appareils.
 *
 * - Boutons : une action est « tenue » tant qu'au moins une source la tient
 *   (ex. Espace ET le bouton A de la manette). L'appui est mémorisé jusqu'à
 *   ce que le gameplay le consomme, pendant 200 ms maximum : un appui bref
 *   n'est jamais perdu, même si la simulation n'a pas tourné pendant
 *   l'image, et un saut demandé juste avant d'atterrir part à l'atterrissage.
 * - Déplacement : somme des sources, limitée à une longueur de 1.
 * - Regard : rotations en radians accumulées jusqu'à consommation.
 *
 * Module pur (pas de Babylon, pas de DOM) : testable dans Node.
 */
import type { ButtonAction, Vec2 } from './actions';

/** Durée de mémorisation d'un appui non consommé (ms). */
export const PRESS_BUFFER_MS = 200;

export class ActionState {
  private readonly holders = new Map<ButtonAction, Set<string>>();
  private readonly pressedAt = new Map<ButtonAction, number>();
  private readonly moves = new Map<string, Vec2>();
  private lookYaw = 0;
  private lookPitch = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Une source (ex. « kb:Space ») tient ou relâche une action. */
  setButton(action: ButtonAction, source: string, down: boolean): void {
    let set = this.holders.get(action);
    if (down) {
      if (!set) {
        set = new Set();
        this.holders.set(action, set);
      }
      if (set.size === 0) this.pressedAt.set(action, this.now());
      set.add(source);
    } else {
      set?.delete(source);
    }
  }

  isHeld(action: ButtonAction): boolean {
    return (this.holders.get(action)?.size ?? 0) > 0;
  }

  /** Vrai une seule fois par appui récent (moins de PRESS_BUFFER_MS). */
  consumePress(action: ButtonAction): boolean {
    const at = this.pressedAt.get(action);
    if (at === undefined) return false;
    this.pressedAt.delete(action);
    return this.now() - at <= PRESS_BUFFER_MS;
  }

  /** Vecteur de déplacement d'une source : x = droite, y = avant, dans [-1, 1]. */
  setMove(source: string, x: number, y: number): void {
    if (x === 0 && y === 0) this.moves.delete(source);
    else this.moves.set(source, { x, y });
  }

  /** Déplacement combiné, de longueur au plus 1. */
  getMove(): Vec2 {
    let x = 0;
    let y = 0;
    for (const m of this.moves.values()) {
      x += m.x;
      y += m.y;
    }
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  /** Ajoute une rotation du regard (radians ; yaw > 0 = droite, pitch > 0 = bas). */
  addLook(yaw: number, pitch: number): void {
    this.lookYaw += yaw;
    this.lookPitch += pitch;
  }

  /** Rotation accumulée depuis le dernier appel (x = yaw, y = pitch). */
  consumeLook(): Vec2 {
    const look = { x: this.lookYaw, y: this.lookPitch };
    this.lookYaw = 0;
    this.lookPitch = 0;
    return look;
  }

  /** Relâche tout ce que tient une source (ex. manette débranchée). */
  releaseSource(source: string): void {
    for (const set of this.holders.values()) set.delete(source);
    this.moves.delete(source);
  }

  /** Relâche tout (fenêtre qui perd le focus, onglet caché…). */
  releaseAll(): void {
    this.holders.clear();
    this.pressedAt.clear();
    this.moves.clear();
    this.lookYaw = 0;
    this.lookPitch = 0;
  }
}
