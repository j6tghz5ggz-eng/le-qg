/**
 * Règles de la boutique « Bécane Shop » (nom fictif). Module pur, testé.
 * - Acheter : prix neuf du catalogue, livraison au garage.
 * - Revendre : prix selon l'état de la pièce (une pièce d'occasion vaut
 *   entre 15 % et 65 % du neuf).
 */
import type { PartCategory, PartDefinition } from '../mechanics/parts';

export const SHOP_NAME = 'Bécane Shop';

/** Délai de livraison au garage (s). */
export const DELIVERY_SECONDS = 8;

/** Rayons de la boutique, dans l'ordre d'affichage. */
export const SHOP_SECTIONS: ReadonlyArray<{ readonly title: string; readonly categories: readonly PartCategory[] }> = [
  { title: 'Échappement', categories: ['exhaust', 'silencer'] },
  { title: 'Allumage', categories: ['ignition', 'sparkPlug'] },
  { title: 'Admission', categories: ['carburetor', 'airFilter'] },
  { title: 'Haut moteur', categories: ['cylinder', 'head', 'piston'] },
];

/** Prix de rachat d'une pièce selon son état (0 à 1). */
export function sellPrice(def: PartDefinition, condition: number): number {
  const c = Math.min(Math.max(condition, 0), 1);
  return Math.max(1, Math.round(def.price * (0.15 + 0.5 * c)));
}

/** Ce que fait la pièce, en quelques mots (fiche produit). */
export function describePart(def: PartDefinition): string {
  const e = def.effects;
  const parts: string[] = [];
  if (e.restriction) parts.push("Bridé (d'origine)");
  if (e.limiterRpm) parts.push(`Coupure à ${e.limiterRpm.toLocaleString('fr-FR')} tr/min`);
  if (e.powerFactor && e.powerFactor > 1) parts.push(`+${Math.round((e.powerFactor - 1) * 100)} % de puissance`);
  if (e.loudness !== undefined && e.loudness >= 0.5) parts.push('Très sonore');
  if (parts.length === 0) parts.push("Pièce d'origine");
  return parts.join(' · ');
}

/** Libellé de l'état d'une pièce (« Neuve », « Bon état »…). */
export function conditionLabel(condition: number, feminine = true): string {
  const e = feminine ? 'e' : '';
  if (condition > 0.97) return feminine ? 'Neuve' : 'Neuf';
  if (condition >= 0.7) return 'Bon état';
  if (condition >= 0.45) return `Usé${e}`;
  return `Très usé${e}`;
}
