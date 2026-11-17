/**
 * Usure du moteur en roulant. Module pur, testé.
 *
 * Calibrage (jeu, pas simulation au kilomètre près) : avec un bon
 * graissage, un piston passe de neuf à « usé » en quelques heures de
 * conduite variée ; sans huile, le moteur serre en moins d'une minute à
 * fond. Le temps de jeu est compressé par rapport à la réalité (un vrai
 * piston de 50 dure plusieurs milliers de kilomètres).
 *
 * - Graissage idéal : de 1,8 % à 3 %. En dessous, le piston et le cylindre
 *   s'usent plus vite ; sous ~0,6 %, ils chauffent et peuvent serrer.
 * - Trop d'huile (au-delà de 3 %) : la bougie s'encrasse, fumée.
 * - Ralenti prolongé : la bougie s'encrasse aussi.
 * - Le filtre à air s'encrasse avec les heures.
 */
export interface WearInput {
  readonly dt: number;
  readonly rpm: number;
  readonly limiterRpm: number;
  /** Ouverture des gaz (0 à 1). */
  readonly throttle: number;
  /** Rapport huile / essence reçu par le moteur (0,02 = 2 %). */
  readonly lubrication: number;
  /** Multiplicateur (triche « usure accélérée »). */
  readonly rate?: number;
}

export interface WearDelta {
  /** Perte d'état (à soustraire) de chaque pièce. */
  readonly piston: number;
  readonly cylinder: number;
  readonly sparkPlug: number;
  readonly airFilter: number;
  /** Variation de la jauge de serrage (0 à 1 ; 1 = moteur serré). */
  readonly seize: number;
}

const HOUR = 3600;
/** Durée de vie d'un piston à pleine charge et bien graissé (s de jeu). */
const PISTON_LIFE = 2.5 * HOUR;
const PLUG_LIFE = 10 * HOUR;
const FILTER_LIFE = 15 * HOUR;
/** Sous cette qualité de graissage, le moteur chauffe et peut serrer. */
const SEIZE_BELOW = 0.35;
/** Temps pour serrer à pleine charge, sans aucune huile (s). */
const SEIZE_TIME = 25;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Qualité du graissage : 0 sans huile, 1 dès ~1,8 %. */
export function lubricationQuality(ratio: number): number {
  return smoothstep(0, 0.018, ratio);
}

/** Charge du moteur (0 à 1) : régime et ouverture des gaz. */
export function engineStress(rpm: number, limiterRpm: number, throttle: number): number {
  const r = Math.min(Math.max(rpm / Math.max(limiterRpm, 1), 0), 1.1);
  return r * r * (0.3 + 0.7 * Math.min(Math.max(throttle, 0), 1));
}

export function wearStep(input: WearInput): WearDelta {
  const dt = input.dt * (input.rate ?? 1);
  const stress = engineStress(input.rpm, input.limiterRpm, input.throttle);
  const q = lubricationQuality(input.lubrication);
  const piston = (dt / PISTON_LIFE) * (0.15 + stress) * (1 + 4 * (1 - q));
  const rich = Math.max(0, input.lubrication - 0.03);
  const idle = input.rpm < 2500 ? 1 : 0;
  const sparkPlug = (dt / PLUG_LIFE) * (1 + rich * 300 + idle * 1.5);
  const airFilter = (dt / FILTER_LIFE) * (0.5 + stress);
  const seize = q < SEIZE_BELOW ? (dt / SEIZE_TIME) * stress * ((SEIZE_BELOW - q) / SEIZE_BELOW) : -(input.dt / 60) * (q > 0.6 ? 1 : 0);
  return { piston, cylinder: piston * 0.4, sparkPlug, airFilter, seize };
}
