/**
 * Catalogue des pièces. Données pures : ajouter une pièce = ajouter une
 * fiche, sans toucher au code.
 *
 * Marques : toutes FICTIVES (aucune marque réelle, aucun logo déposé).
 *   VARONE  : le constructeur de la moto (pièces d'origine) ;
 *   TURBINO : un fabricant d'échappements « course ».
 */
import type { Restriction } from '../vehicles/simulation/Powertrain';

export type PartCategory =
  | 'piston'
  | 'cylinder'
  | 'head'
  | 'sparkPlug'
  | 'exhaust'
  | 'silencer'
  | 'carburetor'
  | 'airFilter'
  | 'ignition';

export interface PartEffects {
  /** Multiplicateur de couple moteur. */
  readonly powerFactor?: number;
  /** Régime de coupure de l'allumage (CDI). */
  readonly limiterRpm?: number;
  /** Bridage à haut régime (pot d'origine, cartouche, petit carburateur…). */
  readonly restriction?: Restriction;
  /** Part du bruit de l'échappement (pot + cartouche, total plafonné à 1). */
  readonly loudness?: number;
}

type Rgb = readonly [number, number, number];

/** Autocollant (fond opaque + texte), dessiné dans une texture. */
export interface Decal {
  readonly text: string;
  readonly sub?: string;
  readonly background: string;
  readonly ink: string;
  readonly accent?: string;
}

/**
 * Forme 3D de la pièce, construite en code (modèles Blender plus tard).
 * Tailles en mètres. L'origine est le point d'ancrage de la pièce.
 */
export type PartVisual =
  | { readonly kind: 'box'; readonly size: readonly [number, number, number]; readonly color: Rgb; readonly metallic?: number }
  | { readonly kind: 'cylinder'; readonly diameter: number; readonly height: number; readonly axis: 'x' | 'y' | 'z'; readonly color: Rgb; readonly metallic?: number }
  /** Haut moteur et périphériques, modèles détaillés (voir partMeshes). */
  | { readonly kind: 'piston' }
  | { readonly kind: 'cylinderBlock' }
  | { readonly kind: 'cylinderHead' }
  | { readonly kind: 'sparkPlug' }
  | { readonly kind: 'carburetor'; readonly scale: number; readonly body: Rgb; readonly cap: Rgb }
  | { readonly kind: 'airbox' }
  | { readonly kind: 'cdi'; readonly color: Rgb }
  | {
      /** Pot de détente « passage haut » (le tracé est commun, voir exhaustGeometry). */
      readonly kind: 'chamber';
      readonly color: Rgb;
      readonly metallic: number;
      /** Rayon max du ventre (m). */
      readonly belly: number;
      readonly decal?: Decal;
    }
  | {
      /** Cartouche (silencieux) : corps, embouts, colliers. */
      readonly kind: 'silencer';
      readonly length: number;
      readonly diameter: number;
      readonly body: Rgb;
      readonly bodyMetallic: number;
      readonly caps: Rgb;
      readonly decal?: Decal;
    };

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

const ALU: Rgb = [0.68, 0.68, 0.7];
const BLACK: Rgb = [0.05, 0.05, 0.055];

export const PARTS: readonly PartDefinition[] = [
  {
    id: 'piston-40',
    name: 'Piston Ø40',
    category: 'piston',
    mass: 0.15,
    price: 25,
    effects: {},
    visual: { kind: 'piston' },
  },
  {
    id: 'cylinder-50',
    name: 'Cylindre 50 cm³',
    category: 'cylinder',
    mass: 2.2,
    price: 90,
    effects: {},
    visual: { kind: 'cylinderBlock' },
  },
  {
    id: 'head-50',
    name: 'Culasse',
    category: 'head',
    mass: 0.6,
    price: 45,
    effects: {},
    visual: { kind: 'cylinderHead' },
  },
  {
    id: 'plug-std',
    name: "Bougie d'allumage",
    category: 'sparkPlug',
    mass: 0.05,
    price: 6,
    effects: {},
    visual: { kind: 'sparkPlug' },
  },
  {
    // Pot d'origine : un restricteur soudé dans le coude étrangle le moteur
    // au-delà de 6 000 tr/min. C'est lui qui fait plafonner la moto à 50.
    id: 'exhaust-stock',
    name: "Pot d'origine passage haut VARONE (bridé)",
    category: 'exhaust',
    mass: 3.2,
    price: 120,
    effects: { restriction: { startRpm: 6000, endRpm: 8000, floor: 0.4 }, loudness: 0.05 },
    visual: {
      kind: 'chamber',
      color: [0.07, 0.07, 0.075],
      metallic: 0.35,
      belly: 0.05,
      decal: { text: 'VARONE', sub: 'ORIGINAL · 50', background: '#14161a', ink: '#f2f2f2', accent: '#f0b400' },
    },
  },
  {
    id: 'exhaust-racing',
    name: 'Pot de détente TURBINO RX',
    category: 'exhaust',
    mass: 2.6,
    price: 189,
    effects: { powerFactor: 1.15, loudness: 0.15 },
    visual: {
      kind: 'chamber',
      color: [0.6, 0.6, 0.64],
      metallic: 0.85,
      belly: 0.057,
      decal: { text: 'TURBINO', sub: 'RX · RACING', background: '#101010', ink: '#ffffff', accent: '#e8431a' },
    },
  },
  {
    id: 'silencer-stock',
    name: "Cartouche d'origine VARONE",
    category: 'silencer',
    mass: 1.1,
    price: 65,
    effects: { restriction: { startRpm: 7000, endRpm: 9000, floor: 0.9 }, loudness: 0.3 },
    visual: {
      kind: 'silencer',
      length: 0.4,
      diameter: 0.085,
      body: [0.09, 0.09, 0.1],
      bodyMetallic: 0.3,
      caps: [0.55, 0.55, 0.58],
      decal: { text: 'VARONE', sub: 'E-MARK · 50 cc', background: '#f2f2f2', ink: '#14161a', accent: '#f0b400' },
    },
  },
  {
    id: 'silencer-racing',
    name: 'Cartouche TURBINO Carbon',
    category: 'silencer',
    mass: 0.7,
    price: 95,
    effects: { powerFactor: 1.03, loudness: 0.65 },
    visual: {
      kind: 'silencer',
      length: 0.34,
      diameter: 0.08,
      body: [0.1, 0.1, 0.11],
      bodyMetallic: 0.15,
      caps: [0.72, 0.72, 0.76],
      decal: { text: 'TURBINO', sub: 'CARBON · RACING ONLY', background: '#e8431a', ink: '#ffffff', accent: '#101010' },
    },
  },
  {
    // Le petit carburateur d'origine manque d'air à très haut régime.
    id: 'carb-12',
    name: 'Carburateur 12 mm',
    category: 'carburetor',
    mass: 0.4,
    price: 40,
    effects: { restriction: { startRpm: 9000, endRpm: 12000, floor: 0.8 } },
    visual: { kind: 'carburetor', scale: 1, body: ALU, cap: [0.55, 0.55, 0.58] },
  },
  {
    id: 'carb-17',
    name: 'Carburateur 17,5 mm TURBINO',
    category: 'carburetor',
    mass: 0.45,
    price: 85,
    effects: { powerFactor: 1.06 },
    visual: { kind: 'carburetor', scale: 1.15, body: [0.82, 0.82, 0.85], cap: [0.08, 0.08, 0.09] },
  },
  {
    id: 'airfilter-std',
    name: 'Filtre à air',
    category: 'airFilter',
    mass: 0.2,
    price: 12,
    effects: {},
    visual: { kind: 'airbox' },
  },
  {
    // Coupe l'allumage à 8 700 tr/min : ≈ 60 km/h en 6e, atteints en descente.
    id: 'cdi-restricted',
    name: 'Boîtier CDI (bridé)',
    category: 'ignition',
    mass: 0.3,
    price: 35,
    effects: { limiterRpm: 8700 },
    visual: { kind: 'cdi', color: BLACK },
  },
  {
    id: 'cdi-free',
    name: 'Boîtier CDI débridé',
    category: 'ignition',
    mass: 0.3,
    price: 55,
    effects: { limiterRpm: 11800 },
    visual: { kind: 'cdi', color: [0.75, 0.12, 0.1] },
  },
];

export type PartCatalog = ReadonlyMap<string, PartDefinition>;

export const PART_CATALOG: PartCatalog = new Map(PARTS.map((part) => [part.id, part]));
