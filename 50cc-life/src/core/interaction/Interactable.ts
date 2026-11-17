/**
 * Objets interactifs : tout ce que le joueur peut prendre ou utiliser.
 *
 * Un objet s'enregistre avec son corps physique. Quand le rayon du regard
 * touche ce corps, le jeu sait de quoi il s'agit (nom, actions possibles).
 * Les futures pièces de moto passeront par le même registre.
 */
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';

export interface Interactable {
  /** Nom affiché sous le réticule (ex. « Caisse à outils »). */
  readonly label: string;
  /** Peut être porté à la main. */
  readonly grabbable?: boolean;
  /** Libellé de l'action « Utiliser » (touche E). */
  readonly useLabel?: string;
  use?(): void;
}

export class InteractableRegistry {
  private readonly items = new Map<PhysicsBody, Interactable>();

  /** Enregistre un objet. Retourne la fonction de désinscription. */
  register(body: PhysicsBody, item: Interactable): () => void {
    this.items.set(body, item);
    return () => this.unregister(body);
  }

  unregister(body: PhysicsBody): void {
    this.items.delete(body);
  }

  get(body: PhysicsBody | null | undefined): Interactable | undefined {
    return body ? this.items.get(body) : undefined;
  }

  has(body: PhysicsBody): boolean {
    return this.items.has(body);
  }

  get size(): number {
    return this.items.size;
  }
}
