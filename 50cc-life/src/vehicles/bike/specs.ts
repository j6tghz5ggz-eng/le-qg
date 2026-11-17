/**
 * Caractéristiques d'une moto. Données pures : une nouvelle moto = une
 * nouvelle fiche, sans toucher au code de la physique.
 *
 * Repère local de la moto : x = droite, y = haut, z = avant. L'origine est
 * entre les deux moyeux, à leur hauteur quand les suspensions sont
 * complètement détendues.
 */
import type { SlotDefinition } from '../../mechanics/slots';
import { SM50_SLOTS } from '../../mechanics/slots';
import { CYCLO_DRIVETRAIN, type DrivetrainSpec } from '../simulation/Drivetrain';
import { SM50_DRIVETRAIN, type ManualDrivetrainSpec } from '../simulation/ManualDrivetrain';

export type Vec3Tuple = readonly [number, number, number];

export type PowertrainSpec =
  | { readonly kind: 'manual'; readonly spec: ManualDrivetrainSpec }
  | { readonly kind: 'cvt'; readonly spec: DrivetrainSpec };

export interface BoxCollider {
  readonly center: Vec3Tuple;
  readonly size: Vec3Tuple;
}

export interface BikeSpec {
  readonly id: string;
  /** Nom affiché. */
  readonly label: string;
  /** Modèle 3D provisoire à utiliser. */
  readonly style: 'cyclo' | 'supermotard';
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
  readonly powertrain: PowertrainSpec;
  /** Formes de collision : châssis, butées de roue, pilote assis. */
  readonly collider: { readonly frame: BoxCollider; readonly wheelStop: number; readonly rider: BoxCollider };
  /** Emplacements des pièces démontables (null = pas de mécanique). */
  readonly engineSlots: readonly SlotDefinition[] | null;
  /** Position des yeux du pilote (repère local). */
  readonly eyeLocal: Vec3Tuple;
  /** Au-dessus de cette vitesse (m/s), on ne peut pas descendre. */
  readonly maxDismountSpeed: number;
}

export const CYCLO: BikeSpec = {
  id: 'cyclo',
  label: 'Cyclomoteur',
  style: 'cyclo',
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
  powertrain: { kind: 'cvt', spec: CYCLO_DRIVETRAIN },
  collider: {
    frame: { center: [0, 0.36, -0.04], size: [0.34, 0.46, 1.1] },
    wheelStop: 0.15,
    rider: { center: [0, 0.95, -0.25], size: [0.42, 0.75, 0.36] },
  },
  engineSlots: null,
  eyeLocal: [0, 1.22, -0.2],
  maxDismountSpeed: 2.5,
};

/**
 * Supermotard 50 à boîte 6 (style « SM 50 » des années 2020) : grandes
 * roues de 17", suspensions à long débattement, selle haute, freins à
 * disque, moteur 2T à boîte manuelle bridé à 45 km/h par le CDI.
 */
export const SM50: BikeSpec = {
  id: 'sm50',
  label: 'Supermotard 50',
  style: 'supermotard',
  mass: 98,
  riderMass: 75,
  wheelBase: 1.38,
  wheelRadius: 0.307,
  mountHeight: 0.33,
  suspension: { restLength: 0.33, travel: 0.16, stiffness: 19000, damping: 1700 },
  centerOfMass: { withRider: [0, 0.47, -0.06], alone: [0, 0.22, 0] },
  inertiaPerKg: [0.4, 0.32, 0.12],
  steer: { atRest: 0.6, atSpeed: 0.045, referenceSpeed: 14, rate: 2.6 },
  grip: 1.05,
  // Freins à disque : nettement plus mordants que des tambours.
  brake: { front: 720, rear: 460 },
  lean: { max: 0.8, frequency: 7.5, dampingRatio: 0.9, onStand: -0.12 },
  cdA: 0.55,
  rollingResistance: 0.015,
  powertrain: { kind: 'manual', spec: SM50_DRIVETRAIN },
  collider: {
    frame: { center: [0, 0.42, -0.06], size: [0.34, 0.6, 1.3] },
    wheelStop: 0.17,
    rider: { center: [0, 1.08, -0.22], size: [0.42, 0.78, 0.36] },
  },
  engineSlots: SM50_SLOTS,
  eyeLocal: [0, 1.38, -0.18],
  maxDismountSpeed: 2.5,
};
