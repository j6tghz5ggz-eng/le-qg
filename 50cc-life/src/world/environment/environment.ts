/**
 * Ciel, brouillard, lumière et ombres.
 *
 * - Tone mapping « Khronos PBR Neutral » : respecte les couleurs des
 *   matériaux (une peinture de cyclo doit garder sa vraie teinte).
 * - Le brouillard cache la limite de la distance de vue : c'est lui qui
 *   masquera le chargement progressif des morceaux du monde.
 * - Ombres selon le profil : aucune (Basse), nettes (Moyenne), adoucies
 *   (Haute/Ultra). La zone d'ombre (± 24 m) suit le joueur : la carte
 *   d'ombre garde la même finesse partout. Des ombres en cascade viendront
 *   avec le grand monde.
 * - Reflets et ambiance : ciel généré en code (skyReflection.ts).
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
import { createSkyReflection } from './skyReflection';

export interface WorldEnvironment {
  readonly sun: DirectionalLight;
  readonly shadows: ShadowGenerator | null;
  addShadowCaster(mesh: AbstractMesh): void;
  removeShadowCaster(mesh: AbstractMesh): void;
  /** Recentre la zone d'ombre sur ce point (le joueur), à chaque image. */
  follow(center: Vector3): void;
}

/** Demi-largeur de la zone couverte par la carte d'ombre (m). */
const SHADOW_RANGE = 24;

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

  // Avec les reflets, le ciel éclaire déjà les ombres : lumière hémisphérique réduite.
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = profile.reflections ? 0.25 : 0.55;
  ambient.diffuse = new Color3(0.85, 0.9, 1);
  ambient.groundColor = new Color3(0.35, 0.32, 0.28);

  const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, -0.35).normalize(), scene);
  sun.position = sun.direction.scale(-80);
  sun.intensity = 1.8;
  sun.diffuse = new Color3(1, 0.95, 0.88);
  if (profile.reflections) {
    scene.environmentTexture = createSkyReflection(scene, sun.direction);
    scene.environmentIntensity = 0.85;
  }

  let shadows: ShadowGenerator | null = null;
  // Zone d'ombre fixe (orthographique) que l'on déplace avec le joueur.
  sun.autoUpdateExtends = false;
  sun.autoCalcShadowZBounds = false;
  sun.orthoLeft = -SHADOW_RANGE;
  sun.orthoRight = SHADOW_RANGE;
  sun.orthoTop = SHADOW_RANGE;
  sun.orthoBottom = -SHADOW_RANGE;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 160;
  if (profile.shadows) {
    shadows = new ShadowGenerator(profile.shadows.mapSize, sun);
    shadows.bias = 0.001;
    shadows.normalBias = 0.02;
    if (profile.shadows.soft) {
      shadows.usePercentageCloserFiltering = true;
      shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    }
  }

  const texel = (2 * SHADOW_RANGE) / (profile.shadows?.mapSize ?? 1024);
  const target = new Vector3();
  return {
    sun,
    shadows,
    addShadowCaster: (mesh) => shadows?.addShadowCaster(mesh),
    removeShadowCaster: (mesh) => shadows?.removeShadowCaster(mesh),
    follow: (center) => {
      if (!shadows) return;
      // Calé sur la grille des texels : évite le scintillement des bords d'ombre.
      target.set(Math.round(center.x / texel) * texel, Math.round(center.y / texel) * texel, Math.round(center.z / texel) * texel);
      sun.position.copyFrom(target).subtractInPlace(sun.direction.scale(80));
    },
  };
}
