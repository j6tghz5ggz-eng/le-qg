/**
 * Réservoir d'essence (et réservoir d'huile du graissage séparé). Module
 * pur, testé.
 *
 * - Mélange : l'huile versée dans le réservoir se dissout dans l'essence ;
 *   le moteur reçoit les deux dans la même proportion.
 * - Graissage séparé : la pompe prélève l'huile dans son réservoir, selon
 *   l'ouverture des gaz (peu au ralenti, ~2 % à fond).
 * - Le « graissage » vu par le moteur est le rapport huile / essence reçu
 *   (0,02 = 2 %). Il commande l'usure et le risque de serrage (voir wear.ts).
 */
import type { FuelSpec } from '../bike/specs';

export interface FuelLevels {
  /** Essence (L, sans l'huile). */
  readonly fuel: number;
  /** Huile mélangée dans le réservoir d'essence (L). */
  readonly premixOil: number;
  /** Huile du réservoir séparé (L, 0 sans graissage séparé). */
  readonly oilTank: number;
}

export interface ConsumeResult {
  /** Rapport huile / essence reçu par le moteur pendant ce pas. */
  readonly lubrication: number;
  /** Plus d'essence : le moteur s'arrête. */
  readonly starved: boolean;
}

/** Sous ce niveau (L), la pompe à essence (ou la cuve) se désamorce : panne sèche. */
export const EMPTY_LITERS = 0.01;

export class FuelTank {
  fuel: number;
  premixOil: number;
  oilTank: number;
  private lastLubrication: number;

  constructor(
    readonly spec: FuelSpec,
    levels: FuelLevels = { fuel: 0, premixOil: 0, oilTank: 0 },
  ) {
    this.fuel = Math.max(0, levels.fuel);
    this.premixOil = Math.max(0, levels.premixOil);
    this.oilTank = Math.max(0, levels.oilTank);
    this.clamp();
    this.lastLubrication = this.nominalRatio;
  }

  get injection(): boolean {
    return this.spec.lubrication.kind === 'injection';
  }

  /** Dosage conseillé (mélange) ou dosage à fond de la pompe. */
  get nominalRatio(): number {
    const l = this.spec.lubrication;
    return l.kind === 'premix' ? l.ratio : l.fullRatio;
  }

  get oilTankCapacity(): number {
    const l = this.spec.lubrication;
    return l.kind === 'injection' ? l.oilTankLiters : 0;
  }

  /** Pourcentage d'huile dans l'essence du réservoir (0,02 = 2 %). */
  get mixRatio(): number {
    return this.fuel > 1e-6 ? this.premixOil / this.fuel : 0;
  }

  /** Volume occupé dans le réservoir d'essence (L). */
  get volume(): number {
    return this.fuel + this.premixOil;
  }

  get space(): number {
    return Math.max(0, this.spec.tankLiters - this.volume);
  }

  get onReserve(): boolean {
    return this.volume <= this.spec.reserveLiters;
  }

  get levels(): FuelLevels {
    return { fuel: this.fuel, premixOil: this.premixOil, oilTank: this.oilTank };
  }

  /** Graissage reçu au dernier pas (rapport huile / essence). */
  get lubrication(): number {
    return this.lastLubrication;
  }

  /** Verse de l'essence ; retourne la quantité acceptée (L). */
  addFuel(liters: number): number {
    const accepted = Math.min(Math.max(liters, 0), this.space);
    this.fuel += accepted;
    return accepted;
  }

  /** Verse de l'huile dans le réservoir d'essence (mélange) ; retourne la quantité acceptée. */
  addPremixOil(liters: number): number {
    const accepted = Math.min(Math.max(liters, 0), this.space);
    this.premixOil += accepted;
    return accepted;
  }

  /** Verse de l'huile dans le réservoir séparé ; retourne la quantité acceptée. */
  addOil(liters: number): number {
    const accepted = Math.min(Math.max(liters, 0), Math.max(0, this.oilTankCapacity - this.oilTank));
    this.oilTank += accepted;
    return accepted;
  }

  /** Dosage de la pompe à huile selon l'ouverture des gaz. */
  pumpRatio(throttle: number): number {
    const l = this.spec.lubrication;
    if (l.kind !== 'injection') return 0;
    const t = Math.min(Math.max(throttle, 0), 1);
    return l.idleRatio + (l.fullRatio - l.idleRatio) * t;
  }

  /**
   * Fait tourner le moteur `dt` secondes au débit `fuelLph` (L/h d'essence).
   */
  consume(dt: number, fuelLph: number, throttle: number): ConsumeResult {
    const want = Math.max(0, (fuelLph * dt) / 3600);
    if (want <= 0) return { lubrication: this.lastLubrication, starved: this.fuel <= EMPTY_LITERS };
    if (this.fuel - want <= EMPTY_LITERS) {
      // Les dernières gouttes : panne sèche.
      this.premixOil = Math.max(0, this.premixOil - this.premixOil * Math.min(1, want / Math.max(this.fuel, 1e-6)));
      this.fuel = Math.max(0, this.fuel - want);
      return { lubrication: this.lastLubrication, starved: true };
    }
    const mix = this.mixRatio;
    this.fuel -= want;
    const premix = Math.min(this.premixOil, want * mix);
    this.premixOil -= premix;
    let pumped = 0;
    if (this.injection) {
      pumped = Math.min(this.oilTank, want * this.pumpRatio(throttle));
      this.oilTank -= pumped;
    }
    this.lastLubrication = (premix + pumped) / want;
    return { lubrication: this.lastLubrication, starved: false };
  }

  private clamp(): void {
    const over = this.volume - this.spec.tankLiters;
    if (over > 0) this.fuel = Math.max(0, this.fuel - over);
    this.oilTank = Math.min(this.oilTank, this.oilTankCapacity);
  }
}
