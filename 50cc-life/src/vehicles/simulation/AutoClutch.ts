/**
 * Aide à la conduite : embrayage automatique (optionnel, activé par défaut
 * sur écran tactile). Module pur.
 *
 * Il se comporte comme un embrayage centrifuge : il patine au démarrage
 * pendant que le moteur monte dans les tours, se colle ensuite, débraye
 * quand le régime tombe trop bas (pas de calage) et pendant un passage de
 * vitesse.
 */
export interface AutoClutchInput {
  readonly rpm: number;
  readonly gear: number;
  readonly throttle: number;
  /** Régime qu'aurait le moteur s'il était collé à la roue. */
  readonly wheelRpm: number;
  readonly running: boolean;
}

const SHIFT_TIME = 0.22;
const ENGAGE_RATE = 3; // levier relâché en ~0,3 s
const RELEASE_RATE = 14; // levier tiré quasi instantanément

export class AutoClutch {
  /** Position du levier (0 = embrayé, 1 = débrayé). */
  lever = 1;
  private shiftTimer = 0;

  /** À appeler juste avant un passage de vitesse. */
  notifyShift(): void {
    this.shiftTimer = SHIFT_TIME;
    this.lever = 1;
  }

  update(dt: number, input: AutoClutchInput): number {
    let target: number;
    if (!input.running || input.gear === 0) {
      target = 1;
    } else if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      target = 1;
    } else if (input.wheelRpm > 3200 && input.rpm > 2400) {
      target = 0; // roule assez vite : embrayage collé
    } else if (input.throttle < 0.05 || input.rpm < 2200) {
      target = 1; // ralenti ou régime trop bas : débraye (pas de calage)
    } else {
      // Démarrage : patine de plus en plus à mesure que le moteur monte.
      const t = Math.min(Math.max((input.rpm - 2600) / 2800, 0), 1);
      target = 0.85 - 0.6 * t;
    }
    const rate = target < this.lever ? ENGAGE_RATE : RELEASE_RATE;
    const step = rate * dt;
    this.lever = target < this.lever ? Math.max(target, this.lever - step) : Math.min(target, this.lever + step);
    return this.lever;
  }
}
