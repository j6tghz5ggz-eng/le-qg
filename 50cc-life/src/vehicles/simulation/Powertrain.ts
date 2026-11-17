/**
 * Interface commune des chaînes de traction : boîte manuelle (50 à boîte),
 * variateur automatique (scooter, mobylette)… La moto ne connaît que ça.
 */
export interface PowertrainInput {
  /** Ouverture des gaz (0 à 1). */
  readonly throttle: number;
  /** Levier d'embrayage : 0 = relâché (embrayé), 1 = tiré (débrayé). */
  readonly clutch: number;
}

export interface PowertrainOutput {
  /** Force motrice au sol (N), négative en frein moteur. */
  readonly force: number;
  /**
   * Masse équivalente des pièces en rotation entraînées par la roue
   * (vilebrequin, embrayage…) : elle s'ajoute à la masse de la moto quand
   * l'embrayage est collé. Énorme en 1re, faible en 6e.
   */
  readonly inertiaMass: number;
}

/**
 * Bridage par une pièce (pot, cartouche, carburateur…) : au-delà de
 * `startRpm`, le couple est progressivement étranglé jusqu'à `floor`
 * (fraction conservée) à `endRpm`.
 */
export interface Restriction {
  readonly startRpm: number;
  readonly endRpm: number;
  readonly floor: number;
}

/** Fraction de couple conservée à ce régime par un ensemble de bridages. */
export function restrictionFactor(restrictions: readonly Restriction[], rpm: number): number {
  let factor = 1;
  for (const r of restrictions) {
    if (rpm <= r.startRpm) continue;
    const t = Math.min((rpm - r.startRpm) / (r.endRpm - r.startRpm), 1);
    factor *= 1 - t * (1 - r.floor);
  }
  return factor;
}

/** Ce que les pièces installées permettent au moteur (voir mechanics/). */
export interface EngineStats {
  /** Toutes les pièces indispensables sont là. */
  readonly canRun: boolean;
  /** Noms des pièces manquantes (pour expliquer au joueur). */
  readonly missing: readonly string[];
  /** Multiplicateur de couple (pot, usure du piston…). */
  readonly powerFactor: number;
  /** Régime de coupure de l'allumage (CDI bridé ou non). */
  readonly limiterRpm: number;
  /** Bridages qui étranglent le moteur à haut régime (pot, carbu…). */
  readonly restrictions: readonly Restriction[];
  /** Probabilité qu'un coup de kick démarre le moteur. */
  readonly startChance: number;
  /** Bruit de l'échappement (0 à 1), pour le son. */
  readonly loudness: number;
  /**
   * Moteur serré (piston grippé faute d'huile) : il ne tourne plus et
   * bloque la roue arrière tant que l'embrayage n'est pas tiré.
   */
  readonly seized: boolean;
}

export type StartResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'missing'; readonly missing: readonly string[] }
  | { readonly ok: false; readonly reason: 'inGear' | 'failed' | 'noFuel' };

export type ShiftResult = { readonly ok: true; readonly gear: string } | { readonly ok: false; readonly reason: 'clutch' | 'limit' };

export interface Powertrain {
  readonly rpm: number;
  readonly running: boolean;
  /** « N », « 1 »… « 6 », ou « Auto ». */
  readonly gearLabel: string;
  /** Vrai si la boîte est manuelle (embrayage, vitesses, kick). */
  readonly manual: boolean;
  readonly limiterRpm: number;
  /** Bruit de l'échappement (0 à 1), pour le son. */
  readonly loudness: number;
  /** Ouverture des gaz effective au dernier pas (ralenti compris, 0 à 1). */
  readonly throttle: number;
  /** Débit d'essence au dernier pas (L/h), 0 moteur arrêté. */
  readonly fuelFlowLph: number;
  /** Vrai si le moteur vient de caler (remis à faux après lecture). */
  consumeStall(): boolean;
  update(dt: number, input: PowertrainInput, wheelSpeed: number): PowertrainOutput;
  /** Démarrage (kick, démarreur…). `clutch` : position du levier d'embrayage. */
  start(clutch: number, random?: () => number): StartResult;
  stop(): void;
  shiftUp(clutch: number): ShiftResult;
  shiftDown(clutch: number): ShiftResult;
  setEngineStats(stats: EngineStats): void;
  /** Arrivée d'essence : sans essence, le moteur s'arrête et ne redémarre pas. */
  setFuelSupply(ok: boolean): void;
}

/**
 * Consommation d'un petit 2 temps : ≈ 0,75 L d'essence par kWh de
 * combustion (≈ 550 g/kWh, rendement médiocre d'un 50 à lumières), plus un
 * filet au ralenti. Donne ≈ 3 L/100 km bridé à 50 km/h, comme un vrai 50
 * (≈ 3 L/100 km relevés sur un MBK 51, 2,9 sur une Simson S51).
 */
export const FUEL_LITERS_PER_KWH = 0.75;
export const IDLE_FUEL_LPH = 0.12;

export function fuelFlow(running: boolean, combustionTorque: number, rpm: number): number {
  if (!running) return 0;
  const kw = (Math.max(combustionTorque, 0) * rpm * ((2 * Math.PI) / 60)) / 1000;
  return IDLE_FUEL_LPH + FUEL_LITERS_PER_KWH * kw;
}
