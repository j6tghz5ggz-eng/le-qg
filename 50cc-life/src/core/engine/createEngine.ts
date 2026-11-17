/**
 * Création du moteur de rendu Babylon (WebGL2).
 *
 * Choix importants :
 * - Pas de temps fixe (« deterministic lockstep ») : la physique et le
 *   gameplay avancent toujours par pas de 1/60 s, quel que soit le nombre
 *   d'images par seconde. Indispensable pour une moto stable et identique
 *   sur un PC à 144 Hz et un téléphone à 30 i/s.
 * - adaptToDeviceRatio désactivé : c'est QualityManager qui décide de la
 *   résolution (plafond par profil + résolution dynamique).
 * - Sur mobile, powerPreference « default » pour ménager batterie et chauffe.
 *
 * WebGPU viendra plus tard comme option PC, derrière ce même point d'entrée.
 */
import { Engine } from '@babylonjs/core/Engines/engine';
import type { PlatformInfo } from '../platform/platform';
import type { QualityProfile } from '../quality/qualityProfiles';

/** Fréquence de la simulation (physique + gameplay), en Hz. */
export const SIMULATION_HZ = 60;
/** Nombre max de pas rattrapés par image (évite la « spirale de la mort »). */
export const MAX_STEPS_PER_FRAME = 4;

export function createEngine(
  canvas: HTMLCanvasElement,
  profile: QualityProfile,
  platform: PlatformInfo,
): Engine {
  return new Engine(
    canvas,
    profile.msaa,
    {
      deterministicLockstep: true,
      lockstepMaxSteps: MAX_STEPS_PER_FRAME,
      timeStep: 1 / SIMULATION_HZ,
      adaptToDeviceRatio: false,
      powerPreference: platform.isMobile ? 'default' : 'high-performance',
      stencil: true,
      audioEngine: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    },
    false,
  );
}
