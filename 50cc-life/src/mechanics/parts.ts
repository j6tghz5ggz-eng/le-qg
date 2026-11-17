/**
 * Catalogue des pièces. Données pures : ajouter une pièce = ajouter une
 * fiche, sans toucher au code. Les noms de marques réelles sont évités.
 */
export type PartCategory =
  | 'piston'
  | 'cylinder'
  | 'head'
  | 'sparkPlug'
  | 'exhaust'
  | 'carburetor'
  | 'airFilter'
  | 'ignition';

export interface PartEffects {
  /** Multiplicateur de couple moteur. */
  readonly powerFactor?: number;
  /** Régime de coupure de l'allumage (CDI). */
  readonly limiterRpm?: number;
  /** Bruit de l'échappement (0 à 1). */
  readonly loudness?: number;
}

/** Forme provisoire (avant les modèles Blender). Tailles en mètres. */
export type PartVisual =
  | { readonly kind: 'box'; readonly size: readonly [number, number, number]; readonly color: readonly [number, number, number]; readonly metallic?: number }
  | { readonly kind: 'cylinder'; readonly diameter: number; readonly height: number; readonly axis: 'x' | 'y' | 'z'; readonly color: readonly [number, number, number]; readonly metallic?: number }
  | { readonly kind: 'exhaust'; readonly color: readonly [number, number, number]; readonly silencerColor: readonly [number, number, number] };

export interface PartDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: PartCategory;
  /** kg */
  readonly mass: number;
  /** € (pour l'économie, plus tard) */
  readonly price: number;
  readonly effects: PartEffects;
  readonly visual: PartVisual;
}

const ALU: readonly [number, number, number] = [0.68, 0.68, 0.7];
const BLACK: readonly [number, number, number] = [0.05, 0.05, 0.055];

export const PARTS: readonly PartDefinition[] = [
  {
    id: 'piston-40',
    name: 'Piston Ø40',
    category: 'piston',
    mass: 0.15,
    price: 25,
    effects: {},
    visual: { kind: 'cylinder', diameter: 0.045, height: 0.04, axis: 'y', color: ALU, metallic: 0.3 },
  },
  {
    id: 'cylinder-50',
    name: 'Cylindre 50 cm³',
    category: 'cylinder',
    mass: 2.2,
    price: 90,
    effects: {},
    visual: { kind: 'box', size: [0.13, 0.15, 0.13], color: [0.22, 0.22, 0.23], metallic: 0.2 },
  },
  {
    id: 'head-50',
    name: 'Culasse',
    category: 'head',
    mass: 0.6,
    price: 45,
    effects: {},
    visual: { kind: 'box', size: [0.135, 0.05, 0.135], color: ALU, metallic: 0.3 },
  },
  {
    id: 'plug-std',
    name: "Bougie d'allumage",
    category: 'sparkPlug',
    mass: 0.05,
    price: 6,
    effects: {},
    visual: { kind: 'cylinder', diameter: 0.024, height: 0.06, axis: 'y', color: [0.92, 0.9, 0.86] },
  },
  {
    id: 'exhaust-stock',
    name: "Pot d'origine (bridé)",
    category: 'exhaust',
    mass: 3.5,
    price: 120,
    effects: { powerFactor: 1, loudness: 0.4 },
    visual: { kind: 'exhaust', color: [0.1, 0.1, 0.11], silencerColor: [0.12, 0.12, 0.13] },
  },
  {
    id: 'exhaust-racing',
    name: 'Pot de détente « course »',
    category: 'exhaust',
    mass: 3.0,
    price: 190,
    effects: { powerFactor: 1.15, loudness: 0.75 },
    visual: { kind: 'exhaust', color: [0.62, 0.62, 0.66], silencerColor: [0.85, 0.35, 0.08] },
  },
  {
    id: 'carb-12',
    name: 'Carburateur 12 mm',
    category: 'carburetor',
    mass: 0.4,
    price: 40,
    effects: {},
    visual: { kind: 'box', size: [0.07, 0.07, 0.09], color: ALU, metallic: 0.3 },
  },
  {
    id: 'airfilter-std',
    name: 'Filtre à air',
    category: 'airFilter',
    mass: 0.2,
    price: 12,
    effects: {},
    visual: { kind: 'cylinder', diameter: 0.11, height: 0.14, axis: 'x', color: BLACK },
  },
  {
    id: 'cdi-restricted',
    name: 'Boîtier CDI (bridé)',
    category: 'ignition',
    mass: 0.3,
    price: 35,
    effects: { limiterRpm: 6500 },
    visual: { kind: 'box', size: [0.07, 0.035, 0.09], color: BLACK },
  },
  {
    id: 'cdi-free',
    name: 'Boîtier CDI débridé',
    category: 'ignition',
    mass: 0.3,
    price: 55,
    effects: { limiterRpm: 11500 },
    visual: { kind: 'box', size: [0.07, 0.035, 0.09], color: [0.75, 0.12, 0.1] },
  },
];

export type PartCatalog = ReadonlyMap<string, PartDefinition>;

export const PART_CATALOG: PartCatalog = new Map(PARTS.map((part) => [part.id, part]));

