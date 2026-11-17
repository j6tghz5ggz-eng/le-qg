/**
 * Registre des triches (onglet DEV du panneau de débogage).
 *
 * Chaque système ajoute ses propres triches dans `init()` via
 * `ctx.cheats.add(groupe, triche)` : l'onglet DEV n'a pas à connaître les
 * systèmes. RÈGLE DU PROJET : toute nouvelle fonctionnalité utile pour
 * tester ou tricher (argent, objets, lieux, véhicules…) ajoute ici sa triche.
 *
 * Module pur (aucune dépendance au DOM ni à Babylon) : testé dans Node.
 */
export interface CheatOption {
  readonly value: string;
  readonly label: string;
}

export type Cheat =
  | {
      readonly kind: 'action';
      readonly id: string;
      readonly label: string;
      /** Raccourci clavier (KeyboardEvent.code), ex. « KeyB ». */
      readonly code?: string;
      run(): void;
    }
  | {
      readonly kind: 'toggle';
      readonly id: string;
      readonly label: string;
      get(): boolean;
      set(on: boolean): void;
    }
  | {
      /** Liste déroulante + bouton (ex. faire apparaître une pièce du catalogue). */
      readonly kind: 'choice';
      readonly id: string;
      readonly label: string;
      readonly button: string;
      options(): readonly CheatOption[];
      run(value: string): void;
    };

export interface CheatGroup {
  readonly title: string;
  readonly cheats: readonly Cheat[];
}

/** Ordre d'affichage des groupes connus ; les autres suivent dans l'ordre d'ajout. */
const GROUP_ORDER = ['Argent', 'Téléportation', 'Moto', 'Mécanique', 'Boutique', 'Sauvegarde', 'Joueur', 'Monde'];

export class CheatRegistry {
  private readonly groups = new Map<string, Cheat[]>();
  private readonly ids = new Set<string>();
  private readonly listeners = new Set<() => void>();

  add(group: string, cheat: Cheat): void {
    if (this.ids.has(cheat.id)) throw new Error(`Triche en double : ${cheat.id}`);
    this.ids.add(cheat.id);
    const list = this.groups.get(group) ?? [];
    list.push(cheat);
    this.groups.set(group, list);
    for (const listener of this.listeners) listener();
  }

  /** Groupes triés (ordre connu d'abord). */
  list(): CheatGroup[] {
    const rank = (title: string): number => {
      const i = GROUP_ORDER.indexOf(title);
      return i < 0 ? GROUP_ORDER.length : i;
    };
    return [...this.groups.entries()]
      .map(([title, cheats], index) => ({ title, cheats, index }))
      .sort((a, b) => rank(a.title) - rank(b.title) || a.index - b.index)
      .map(({ title, cheats }) => ({ title, cheats }));
  }

  find(id: string): Cheat | undefined {
    for (const list of this.groups.values()) {
      const cheat = list.find((c) => c.id === id);
      if (cheat) return cheat;
    }
    return undefined;
  }

  /** Lance une triche « action » par son identifiant (tests, raccourcis). */
  run(id: string, value?: string): boolean {
    const cheat = this.find(id);
    if (!cheat) return false;
    if (cheat.kind === 'action') cheat.run();
    else if (cheat.kind === 'toggle') cheat.set(value === undefined ? !cheat.get() : value === '1');
    else if (value !== undefined) cheat.run(value);
    else return false;
    return true;
  }

  /** Triche associée à un raccourci clavier. */
  byCode(code: string): Cheat | undefined {
    for (const list of this.groups.values()) {
      const cheat = list.find((c) => c.kind === 'action' && c.code === code);
      if (cheat) return cheat;
    }
    return undefined;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
