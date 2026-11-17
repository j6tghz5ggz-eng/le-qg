/**
 * Porte-monnaie du joueur (en euros entiers). Module pur, testé.
 * La sauvegarde viendra avec le système de sauvegarde.
 */
export const STARTING_MONEY = 500;

export class Wallet {
  private amount: number;
  private readonly listeners = new Set<(balance: number, delta: number) => void>();

  constructor(initial = STARTING_MONEY) {
    this.amount = Math.max(0, Math.round(initial));
  }

  get balance(): number {
    return this.amount;
  }

  /** Ajoute de l'argent (gains, triche). */
  add(amount: number): void {
    this.change(Math.max(0, Math.round(amount)));
  }

  /** Paie si possible ; faux si le solde est insuffisant (rien n'est débité). */
  spend(amount: number): boolean {
    const cost = Math.max(0, Math.round(amount));
    if (cost > this.amount) return false;
    this.change(-cost);
    return true;
  }

  canAfford(amount: number): boolean {
    return Math.round(amount) <= this.amount;
  }

  set(amount: number): void {
    this.change(Math.max(0, Math.round(amount)) - this.amount);
  }

  onChange(listener: (balance: number, delta: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private change(delta: number): void {
    if (delta === 0) return;
    this.amount += delta;
    for (const listener of this.listeners) listener(this.amount, delta);
  }
}

/** « 1 500 € » (espaces insécables, format français). */
export function formatMoney(amount: number): string {
  return `${Math.round(amount).toLocaleString('fr-FR').replace(/\s/g, ' ')} €`;
}
