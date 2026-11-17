/**
 * Caractéristiques d'une moto. Données pures : une nouvelle moto = une
 * nouvelle fiche, sans toucher au code de la physique.
 *
 * Repère local de la moto : x = droite, y = haut, z = avant. L'origine est
 * entre les deux moyeux, à leur hauteur quand les suspensions sont
 * complètement détendues.
 */
import { CYCLO_DRIVETRAIN, type DrivetrainSpec } from '../simulation/Drivetrain';

export type Vec3Tuple = readonly [number, number, number];

export interface BikeSpec {
  readonly id: string;
  /** Masse de la moto seule (kg). */
  readonly mass: number;
  readonly riderMass: number;
  readonly wheelBase: number;
  readonly wheelRadius: number;
  /** Hauteur (repère local) des points d'ancrage des suspensions. */
  readonly mountHeight: number;
  readonly suspension: {
    /** Longueur détendue entre l'ancrage et le moyeu (m). */
    readonly restLength: number;
    /** Débattement (m). */
    readonly travel: number;
    readonly stiffness: number;
    readonly damping: number;
  };
  /** Centre de gravité (repère local), avec et sans pilote. */
  readonly centerOfMass: { readonly withRider: Vec3Tuple; readonly alone: Vec3Tuple };
  /** Moments d'inertie par kg (x = tangage, y = lacet, z = roulis). */
  readonly inertiaPerKg: Vec3Tuple;
  readonly steer: {
    /** Braquage max à l'arrêt et à vitesse de référence (rad). */
    readonly atRest: number;
    readonly atSpeed: number;
    readonly referenceSpeed: number;
    /** Vitesse de rotation du guidon (rad/s). */
    readonly rate: number;
  };
  /** Adhérence des pneus (μ) : ~1 sur asphalte sec. */
  readonly grip: number;
  /** Force de freinage max par roue (N). */
  readonly brake: { readonly front: number; readonly rear: number };
  readonly lean: {
    readonly max: number;
    /** Pulsation (rad/s) et amortissement du « pilote » qui équilibre la moto. */
    readonly frequency: number;
    readonly dampingRatio: number;
    /** Inclinaison sur la béquille, garée (rad, négatif = à gauche). */
    readonly onStand: number;
  };
  /** Surface frontale × coefficient de traînée (m²). */
  readonly cdA: number;
  readonly rollingResistance: number;
  readonly drivetrain: DrivetrainSpec;
  /** Position des yeux du pilote (repère local). */
  readonly eyeLocal: Vec3Tuple;
  /** Au-dessus de cette vitesse (m/s), on ne peut pas descendre. */
  readonly maxDismountSpeed: number;
}

export const CYCLO: BikeSpec = {
  id: 'cyclo',
  mass: 70,
  riderMass: 75,
  wheelBase: 1.18,
  wheelRadius: 0.27,
  mountHeight: 0.3,
  suspension: { restLength: 0.3, travel: 0.1, stiffness: 22000, damping: 1800 },
  centerOfMass: { withRider: [0, 0.36, -0.08], alone: [0, 0.18, 0] },
  inertiaPerKg: [0.25, 0.18, 0.1],
  steer: { atRest: 0.6, atSpeed: 0.055, referenceSpeed: 12, rate: 2.5 },
  grip: 1.0,
  // Freins à tambour de cyclo : ≈ 6 m/s² au maximum avec les deux.
  brake: { front: 500, rear: 420 },
  lean: { max: 0.75, frequency: 8, dampingRatio: 0.9, onStand: -0.1 },
  cdA: 0.6,
  rollingResistance: 0.015,
  drivetrain: CYCLO_DRIVETRAIN,
  eyeLocal: [0, 1.22, -0.2],
  maxDismountSpeed: 2.5,
};
