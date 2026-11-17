/**
 * Objets interactifs : tout ce que le joueur peut prendre ou utiliser.
 *
 * Un objet s'enregistre avec son corps physique. Quand le rayon du regard
 * touche ce corps, le jeu sait de quoi il s'agit (nom, actions possibles).
 * Les futures pièces de moto passeront par le même registre.
 */
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';

/**
 * Action « à maintenir » (ex. dévisser une pièce) : la touche Utiliser
 * doit rester enfoncée pendant `seconds`.
 */
export interface HoldAction {
  /** Verbe affiché (« Démonter », « Remonter »…). */
  readonly label: string;
  /** Précision affichée (« 4 fixations »…). */
  readonly detail?: string;
  readonly seconds: number;
  /** Raison qui empêche l'action (null = possible). Vérifiée au début. */
  blocker(): string | null;
  complete(): void;
  /**
   * Action continue (verser de l'essence…) : appelée à chaque image tant
   * que la touche est maintenue ; retourne faux quand c'est fini (réservoir
   * plein, bidon vide). `seconds` est alors ignoré.
   */
  tick?(dt: number): boolean;
  /** Avancement affiché d'une action continue (0 à 1, ex. remplissage). */
  progress?(): number;
}

export interface Interactable {
  /** Nom affiché sous le réticule (ex. « Caisse à outils »). Peut être un accesseur (valeur qui change). */
  readonly label: string;
  /** Information affichée sous le nom (ex. niveaux d'essence et d'huile). */
  readonly detail?: string;
  /** Peut être porté à la main. */
  readonly grabbable?: boolean;
  /** Libellé de l'action « Utiliser » (touche E). */
  readonly useLabel?: string;
  use?(): void;
  /** Action à maintenir (démonter une pièce…). */
  readonly hold?: HoldAction;
  /** Pour un objet porté : action possible avec lui (ex. le remonter sur la moto). */
  installTarget?(): HoldAction | null;
}

export interface Proximity {
  readonly radius: number;
  /** Position de référence (centre de l'objet). */
  position(): { x: number; y: number; z: number };
}

export class InteractableRegistry {
  private readonly items = new Map<PhysicsBody, Interactable>();
  private readonly proximity = new Map<PhysicsBody, Proximity>();
  private readonly meshes = new Map<AbstractMesh, { item: Interactable; owner: PhysicsBody | null }>();

  /** Enregistre un objet. Retourne la fonction de désinscription. */
  register(body: PhysicsBody, item: Interactable): () => void {
    this.items.set(body, item);
    return () => this.unregister(body);
  }

  unregister(body: PhysicsBody): void {
    this.items.delete(body);
    this.proximity.delete(body);
  }

  /**
   * Rend un objet utilisable à proximité, sans le viser précisément
   * (ex. monter sur la moto) : pratique sur téléphone.
   */
  setProximity(body: PhysicsBody, proximity: Proximity): void {
    this.proximity.set(body, proximity);
  }

  /**
   * Cible visée par son modèle 3D plutôt que par la physique (ex. une pièce
   * montée sur la moto, qui fait partie du corps physique de la moto).
   */
  registerMesh(mesh: AbstractMesh, item: Interactable, owner: PhysicsBody | null = null): () => void {
    // `owner` : corps physique qui contient la pièce (la moto). Si le rayon
    // physique touche ce corps, la pièce visée est prioritaire.
    this.meshes.set(mesh, { item, owner });
    return () => this.unregisterMesh(mesh);
  }

  unregisterMesh(mesh: AbstractMesh): void {
    this.meshes.delete(mesh);
  }

  meshTargets(): IterableIterator<[AbstractMesh, { item: Interactable; owner: PhysicsBody | null }]> {
    return this.meshes.entries();
  }

  /** Objets « de proximité » enregistrés. */
  proximityEntries(): IterableIterator<[PhysicsBody, Proximity]> {
    return this.proximity.entries();
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
