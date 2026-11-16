/**
 * Résolution dynamique : baisse la résolution de rendu quand le jeu rame,
 * la remonte prudemment quand tout va bien.
 *
 * Difficulté : avec la synchro verticale, le temps entre deux images ne
 * descend jamais sous 16,7 ms (60 Hz) même si le GPU a de la marge. On ne
 * peut donc pas « voir » la marge : on tente une hausse après une longue
 * période stable, et si elle provoque une baisse d'images, on revient en
 * arrière et on attend deux fois plus longtemps avant de réessayer.
 *
 * On utilise la médiane d'une fenêtre d'images (insensible aux à-coups
 * ponctuels, ex. chargement d'un morceau du monde).
 *
 * Module pur (pas de Babylon).
 */
export interface DynamicResolutionOptions {
  /** Durée visée d'une image en ms (ex. 33,3 pour 30 i/s). */
  readonly targetFrameMs: number;
  readonly minScale: number;
  readonly maxScale: number;
  /** Pas de variation de l'échelle. */
  readonly step?: number;
  /** Nombre d'images par fenêtre de mesure. */
  readonly windowSize?: number;
  /** Fenêtres stables consécutives avant de tenter une hausse. */
  readonly upgradeAfterWindows?: number;
  /** Plafond de l'attente après des échecs répétés. */
  readonly maxUpgradeAfterWindows?: number;
}

const SLOW_RATIO = 1.15; // médiane > 115 % de la cible = trop lent
const OK_RATIO = 1.05; // médiane <= 105 % de la cible = stable

export class DynamicResolution {
  private _scale: number;
  private readonly step: number;
  private readonly windowSize: number;
  private readonly baseUpgradeAfter: number;
  private readonly maxUpgradeAfter: number;
  private upgradeAfter: number;
  private samples: number[] = [];
  private stableWindows = 0;
  /** Vrai juste après une hausse : la fenêtre suivante sert de test. */
  private probing = false;

  constructor(private readonly options: DynamicResolutionOptions) {
    this._scale = options.maxScale;
    this.step = options.step ?? 0.1;
    this.windowSize = options.windowSize ?? 30;
    this.baseUpgradeAfter = options.upgradeAfterWindows ?? 4;
    this.maxUpgradeAfter = options.maxUpgradeAfterWindows ?? 32;
    this.upgradeAfter = this.baseUpgradeAfter;
  }

  get scale(): number {
    return this._scale;
  }

  /** Ajoute la durée d'une image (ms). Retourne l'échelle courante. */
  sample(frameMs: number): number {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return this._scale;
    this.samples.push(frameMs);
    if (this.samples.length < this.windowSize) return this._scale;

    const median = medianOf(this.samples);
    this.samples = [];
    const { targetFrameMs, minScale, maxScale } = this.options;

    if (median > targetFrameMs * SLOW_RATIO) {
      if (this.probing) {
        // La dernière hausse était de trop : on attend plus longtemps la prochaine fois.
        this.upgradeAfter = Math.min(this.upgradeAfter * 2, this.maxUpgradeAfter);
      }
      this.probing = false;
      this.stableWindows = 0;
      this._scale = roundScale(Math.max(minScale, this._scale - this.step));
    } else if (median <= targetFrameMs * OK_RATIO) {
      if (this.probing) {
        // La hausse tient : on peut redevenir réactif.
        this.probing = false;
        this.upgradeAfter = this.baseUpgradeAfter;
      }
      this.stableWindows++;
      if (this.stableWindows >= this.upgradeAfter && this._scale < maxScale) {
        this._scale = roundScale(Math.min(maxScale, this._scale + this.step));
        this.stableWindows = 0;
        this.probing = true;
      }
    } else {
      // Zone intermédiaire : on ne touche à rien.
      this.stableWindows = 0;
    }
    return this._scale;
  }

  reset(): void {
    this._scale = this.options.maxScale;
    this.samples = [];
    this.stableWindows = 0;
    this.probing = false;
    this.upgradeAfter = this.baseUpgradeAfter;
  }
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function roundScale(value: number): number {
  return Math.round(value * 100) / 100;
}
