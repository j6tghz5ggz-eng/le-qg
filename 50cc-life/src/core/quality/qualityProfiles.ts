/**
 * Profils de qualité graphique.
 *
 * Un seul jeu, plusieurs réglages : le PC garde la qualité maximale,
 * les téléphones désactivent ce qui coûte cher. Les valeurs ci-dessous
 * sont un point de départ, à calibrer sur de vrais appareils.
 *
 * Module pur (pas de Babylon).
 */
import type { PlatformInfo } from '../platform/platform';

export type QualityId = 'low' | 'medium' | 'high' | 'ultra';
export const QUALITY_IDS: readonly QualityId[] = ['low', 'medium', 'high', 'ultra'];

export interface ShadowSettings {
  /** Taille de la texture d'ombre (px). */
  readonly mapSize: number;
  /** Ombres adoucies (PCF) : plus jolies, plus coûteuses. */
  readonly soft: boolean;
}

export interface QualityProfile {
  readonly id: QualityId;
  /** Plafond du devicePixelRatio (un écran x3 rendu en x3 tue un téléphone). */
  readonly maxPixelRatio: number;
  /** Antialiasing matériel MSAA (fixé à la création du moteur). */
  readonly msaa: boolean;
  /** Antialiasing en post-traitement, moins cher que le MSAA sur mobile. */
  readonly fxaa: boolean;
  readonly shadows: ShadowSettings | null;
  /** Distance de vue en mètres (brouillard, puis streaming du monde). */
  readonly viewDistance: number;
  /** Images par seconde visées ; null = pas de limite. */
  readonly targetFps: number | null;
  /** Plancher de la résolution dynamique (0.6 = 60 % de la résolution). */
  readonly minRenderScale: number;
  /**
   * Reflets du ciel sur les matériaux (environnement PBR). Coûteux par
   * pixel : coupé en Basse (petits mobiles), remplacé par plus de lumière
   * d'ambiance.
   */
  readonly reflections: boolean;
}

export const QUALITY_PROFILES: Readonly<Record<QualityId, QualityProfile>> = {
  low: {
    id: 'low',
    maxPixelRatio: 1,
    msaa: false,
    fxaa: false,
    shadows: null,
    viewDistance: 120,
    targetFps: 30,
    minRenderScale: 0.6,
    reflections: false,
  },
  medium: {
    id: 'medium',
    maxPixelRatio: 1.5,
    msaa: false,
    fxaa: true,
    shadows: { mapSize: 1024, soft: false },
    viewDistance: 250,
    targetFps: 60,
    minRenderScale: 0.6,
    reflections: true,
  },
  high: {
    id: 'high',
    maxPixelRatio: 2,
    msaa: true,
    fxaa: false,
    shadows: { mapSize: 2048, soft: true },
    viewDistance: 500,
    targetFps: null,
    minRenderScale: 0.7,
    reflections: true,
  },
  ultra: {
    id: 'ultra',
    maxPixelRatio: 3,
    msaa: true,
    fxaa: false,
    shadows: { mapSize: 4096, soft: true },
    viewDistance: 900,
    targetFps: null,
    minRenderScale: 0.85,
    reflections: true,
  },
};

export function isQualityId(value: unknown): value is QualityId {
  return typeof value === 'string' && (QUALITY_IDS as readonly string[]).includes(value);
}

/**
 * Choix automatique du profil au premier lancement.
 * « ultra » n'est jamais choisi automatiquement : c'est un choix du joueur.
 */
export function pickDefaultProfile(p: PlatformInfo): QualityId {
  if (!p.webgl2) return 'low';
  if (p.isMobile) {
    if (p.memoryGb !== null && p.memoryGb <= 4) return 'low';
    return p.gpuTier === 'high' ? 'medium' : 'low';
  }
  switch (p.gpuTier) {
    case 'high':
      return 'high';
    case 'mid':
    case 'unknown':
      return 'medium';
    case 'low':
    case 'software':
      return 'low';
  }
}

/**
 * Niveau de « hardware scaling » Babylon : 1 = 1 pixel rendu par pixel CSS,
 * 0.5 = 2 pixels rendus par pixel CSS (écran Retina), 2 = moitié de résolution.
 */
export function computeHardwareScaling(
  devicePixelRatio: number,
  maxPixelRatio: number,
  renderScale: number,
): number {
  const pixelRatio = Math.min(Math.max(devicePixelRatio, 1), maxPixelRatio) * renderScale;
  return 1 / Math.max(pixelRatio, 0.25);
}
