/**
 * Bus d'événements typé.
 *
 * Permet aux modules de communiquer sans se connaître (ex. : l'économie
 * réagit à « pièce vendue » sans importer le module garage). Le type
 * `Events` associe chaque nom d'événement au type de sa charge utile,
 * donc une faute de frappe ou une mauvaise charge est une erreur de compilation.
 *
 * Module pur : aucune dépendance à Babylon, testable dans Node.
 */
export type Handler<T> = (payload: T) => void;

export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  /** Abonne un gestionnaire. Retourne une fonction de désabonnement. */
  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  /** Abonne un gestionnaire appelé une seule fois. */
  once<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
    const set = this.handlers.get(type);
    if (!set) return;
    set.delete(handler as Handler<never>);
    if (set.size === 0) this.handlers.delete(type);
  }

  /**
   * Émet un événement. Une erreur dans un gestionnaire est journalisée
   * mais n'empêche pas les autres d'être appelés.
   */
  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copie : un gestionnaire peut se désabonner pendant l'émission.
    for (const handler of [...set]) {
      try {
        (handler as Handler<Events[K]>)(payload);
      } catch (error) {
        console.error(`[EventBus] erreur dans un gestionnaire de « ${String(type)} »`, error);
      }
    }
  }

  listenerCount<K extends keyof Events>(type: K): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}
