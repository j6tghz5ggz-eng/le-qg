/**
 * État des actions, alimenté par tous les appareils.
 *
 * - Boutons : une action est « tenue » tant qu'au moins une source la tient
 *   (ex. Espace ET le bouton A de la manette). L'appui est mémorisé jusqu'à
 *   ce que le gameplay le consomme, pendant 200 ms maximum : un appui bref
 *   n'est jamais perdu, même si la simulation n'a pas tourné pendant
 *   l'image, et un saut demandé juste avant d'atterrir part à l'atterrissage.
 *   Sur un appareil qui rame (images de plus de 200 ms), un appui reste
 *   valable pendant la première image qui suit : il n'est jamais perdu.
 * - Déplacement : somme des sources, limitée à une longueur de 1.
 * - Regard : rotations en radians accumulées jusqu'à consommation.
 *
 * Module pur (pas de Babylon, pas de DOM) : testable dans Node.
 */
import type { AxisAction, ButtonAction, Vec2 } from './actions';

/** Durée de mémorisation d'un appui non consommé (ms). */
export const PRESS_BUFFER_MS = 200;

export class ActionState {
  private readonly holders = new Map<ButtonAction, Set<string>>();
  private readonly pressedAt = new Map<ButtonAction, { readonly time: number; readonly frame: number }>();
  /** Numéro de l'image en cours (voir beginFrame). */
  private frame = 0;
  private readonly moves = new Map<string, Vec2>();
  private readonly axes = new Map<AxisAction, Map<string, number>>();
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
      if (set.size === 0) this.pressedAt.set(action, { time: this.now(), frame: this.frame });
      set.add(source);
    } else {
      set?.delete(source);
    }
  }

  isHeld(action: ButtonAction): boolean {
    return (this.holders.get(action)?.size ?? 0) > 0;
  }

  /** À appeler au début de chaque image (avant que le gameplay lise les appuis). */
  beginFrame(): void {
    this.frame++;
  }

  /**
   * Vrai une seule fois par appui récent : moins de PRESS_BUFFER_MS, ou fait
   * pendant l'image précédente (même longue).
   */
  consumePress(action: ButtonAction): boolean {
    const at = this.pressedAt.get(action);
    if (at === undefined) return false;
    this.pressedAt.delete(action);
    return this.now() - at.time <= PRESS_BUFFER_MS || this.frame - at.frame === 1;
  }

  /** Vecteur de déplacement d'une source : x = droite, y = avant, dans [-1, 1]. */
  setMove(source: string, x: number, y: number): void {
    if (x === 0 && y === 0) this.moves.delete(source);
    else this.moves.set(source, { x, y });
  }

  /**
   * Déplacement combiné, chaque axe limité à [-1, 1] mais sans normaliser la
   * diagonale : pour un véhicule, gaz et guidon sont indépendants.
   */
  getMoveAxes(): Vec2 {
    let x = 0;
    let y = 0;
    for (const m of this.moves.values()) {
      x += m.x;
      y += m.y;
    }
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  /** Déplacement combiné, de longueur au plus 1 (marche : la diagonale n'est pas plus rapide). */
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

  /** Valeur analogique d'une source (0 à 1). */
  setAxis(axis: AxisAction, source: string, value: number): void {
    let sources = this.axes.get(axis);
    if (!sources) {
      sources = new Map();
      this.axes.set(axis, sources);
    }
    if (value > 0) sources.set(source, Math.min(value, 1));
    else sources.delete(source);
  }

  /** Valeur la plus forte parmi les sources. */
  getAxis(axis: AxisAction): number {
    let max = 0;
    for (const value of this.axes.get(axis)?.values() ?? []) max = Math.max(max, value);
    return max;
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
    for (const sources of this.axes.values()) sources.delete(source);
    this.moves.delete(source);
  }

  /** Relâche tout (fenêtre qui perd le focus, onglet caché…). */
  releaseAll(): void {
    this.holders.clear();
    this.pressedAt.clear();
    this.moves.clear();
    this.axes.clear();
    this.lookYaw = 0;
    this.lookPitch = 0;
  }
}
