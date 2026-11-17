/**
 * Post-traitements attachés à la caméra active, selon le profil de qualité.
 */
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { FxaaPostProcess } from '@babylonjs/core/PostProcesses/fxaaPostProcess';
import type { QualityProfile } from '../quality/qualityProfiles';

export function createPostProcesses(camera: Camera, profile: QualityProfile): void {
  if (profile.fxaa) new FxaaPostProcess('fxaa', 1, camera);
}
