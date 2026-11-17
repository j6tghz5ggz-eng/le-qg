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
  /** Probabilité qu'un coup de kick démarre le moteur. */
  readonly startChance: number;
  /** Bruit de l'échappement (0 à 1), pour le son. */
  readonly loudness: number;
}

export type StartResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'missing'; readonly missing: readonly string[] }
  | { readonly ok: false; readonly reason: 'inGear' | 'failed' };

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
  /** Vrai si le moteur vient de caler (remis à faux après lecture). */
  consumeStall(): boolean;
  update(dt: number, input: PowertrainInput, wheelSpeed: number): PowertrainOutput;
  /** Démarrage (kick, démarreur…). `clutch` : position du levier d'embrayage. */
  start(clutch: number, random?: () => number): StartResult;
  stop(): void;
  shiftUp(clutch: number): ShiftResult;
  shiftDown(clutch: number): ShiftResult;
  setEngineStats(stats: EngineStats): void;
}
