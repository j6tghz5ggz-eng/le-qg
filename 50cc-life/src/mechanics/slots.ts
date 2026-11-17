/**
 * Emplacements des pièces sur un modèle de moto.
 *
 * `requires` : pièces sur lesquelles celle-ci se monte (la culasse se monte
 * sur le cylindre…). L'ordre de démontage en découle : on ne peut pas
 * retirer une pièce tant qu'une autre est montée dessus.
 */
import type { PartCategory } from './parts';

export interface SlotDefinition {
  readonly id: string;
  readonly name: string;
  readonly accepts: PartCategory;
  readonly requires: readonly string[];
  /** Indispensable pour que le moteur tourne. */
  readonly required: boolean;
  /** Nombre de fixations (vis, écrous, colliers…) : durée du démontage. */
  readonly fasteners: number;
  /** Position sur la moto (repère local de la moto). */
  readonly anchor: readonly [number, number, number];
}

/** Moteur 2T 50 cm³ à boîte du supermotard. */
export const SM50_SLOTS: readonly SlotDefinition[] = [
  { id: 'piston', name: 'Piston', accepts: 'piston', requires: [], required: true, fasteners: 2, anchor: [0, 0.29, 0.13] },
  { id: 'cylinder', name: 'Cylindre', accepts: 'cylinder', requires: ['piston'], required: true, fasteners: 4, anchor: [0, 0.3, 0.13] },
  { id: 'head', name: 'Culasse', accepts: 'head', requires: ['cylinder'], required: true, fasteners: 4, anchor: [0, 0.4, 0.13] },
  { id: 'sparkPlug', name: 'Bougie', accepts: 'sparkPlug', requires: ['head'], required: true, fasteners: 1, anchor: [0, 0.45, 0.13] },
  { id: 'exhaust', name: 'Échappement', accepts: 'exhaust', requires: ['cylinder'], required: false, fasteners: 3, anchor: [0, 0.27, 0.2] },
  { id: 'carburetor', name: 'Carburateur', accepts: 'carburetor', requires: [], required: true, fasteners: 2, anchor: [-0.03, 0.25, -0.11] },
  { id: 'airFilter', name: 'Filtre à air', accepts: 'airFilter', requires: [], required: false, fasteners: 1, anchor: [0, 0.43, -0.27] },
  { id: 'ignition', name: 'Allumage (CDI)', accepts: 'ignition', requires: [], required: true, fasteners: 2, anchor: [0.13, 0.5, -0.42] },
];
