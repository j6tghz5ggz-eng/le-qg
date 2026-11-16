/**
 * Ciel, brouillard, lumière et ombres.
 *
 * - Tone mapping « Khronos PBR Neutral » : respecte les couleurs des
 *   matériaux (une peinture de cyclo doit garder sa vraie teinte).
 * - Le brouillard cache la limite de la distance de vue : c'est lui qui
 *   masquera le chargement progressif des morceaux du monde.
 * - Ombres selon le profil : aucune (Basse), nettes (Moyenne), adoucies
 *   (Haute/Ultra). Des ombres en cascade viendront avec le grand monde.
 */
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Scene } from '@babylonjs/core/scene';
import type { QualityProfile } from '../../core/quality/qualityProfiles';

export interface WorldEnvironment {
  readonly sun: DirectionalLight;
  readonly shadows: ShadowGenerator | null;
  addShadowCaster(mesh: AbstractMesh): void;
  removeShadowCaster(mesh: AbstractMesh): void;
}

const SKY = new Color3(0.66, 0.77, 0.88);

export function createEnvironment(scene: Scene, profile: QualityProfile): WorldEnvironment {
  scene.clearColor = new Color4(SKY.r, SKY.g, SKY.b, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = SKY;
  scene.fogStart = profile.viewDistance * 0.35;
  scene.fogEnd = profile.viewDistance;

  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  ip.exposure = 1;

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.55;
  ambient.diffuse = new Color3(0.85, 0.9, 1);
  ambient.groundColor = new Color3(0.35, 0.32, 0.28);

  const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, -0.35).normalize(), scene);
  sun.position = sun.direction.scale(-80);
  sun.intensity = 1.8;
  sun.diffuse = new Color3(1, 0.95, 0.88);

  let shadows: ShadowGenerator | null = null;
  if (profile.shadows) {
    shadows = new ShadowGenerator(profile.shadows.mapSize, sun);
    shadows.bias = 0.001;
    shadows.normalBias = 0.02;
    if (profile.shadows.soft) {
      shadows.usePercentageCloserFiltering = true;
      shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    }
  }

  return {
    sun,
    shadows,
    addShadowCaster: (mesh) => shadows?.addShadowCaster(mesh),
    removeShadowCaster: (mesh) => shadows?.removeShadowCaster(mesh),
  };
}
