/**
 * Applique le profil de qualité au moteur et pilote la résolution dynamique.
 *
 * Le profil est choisi automatiquement au premier lancement, puis le joueur
 * peut le changer (choix mémorisé). Changer de profil redémarre le jeu, car
 * l'antialiasing MSAA est fixé à la création du contexte WebGL.
 */
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { PlatformInfo } from '../platform/platform';
import { readPref, writePref } from '../save/safeStorage';
import { DynamicResolution } from './DynamicResolution';
import {
  QUALITY_PROFILES,
  computeHardwareScaling,
  isQualityId,
  pickDefaultProfile,
  type QualityId,
  type QualityProfile,
} from './qualityProfiles';

const PREF_KEY = 'quality';

export class QualityManager {
  readonly profile: QualityProfile;
  /** Profil que la détection automatique choisirait sur cet appareil. */
  readonly autoProfileId: QualityId;
  /** Vrai si le profil a été choisi par le joueur (sinon : automatique). */
  readonly isUserChoice: boolean;
  private readonly dynamic: DynamicResolution;
  private engine: AbstractEngine | null = null;

  constructor(private readonly platform: PlatformInfo) {
    const saved = readPref(PREF_KEY);
    this.autoProfileId = pickDefaultProfile(platform);
    this.isUserChoice = isQualityId(saved);
    this.profile = QUALITY_PROFILES[isQualityId(saved) ? saved : this.autoProfileId];
    this.dynamic = new DynamicResolution({
      targetFrameMs: 1000 / (this.profile.targetFps ?? 60),
      minScale: this.profile.minRenderScale,
      maxScale: 1,
    });
  }

  /** Échelle de rendu courante (1 = pleine résolution du profil). */
  get renderScale(): number {
    return this.dynamic.scale;
  }

  attach(engine: AbstractEngine): void {
    this.engine = engine;
    engine.maxFPS = this.profile.targetFps ?? undefined;
    this.applyScale();
  }

  /** À appeler après chaque image rendue, avec sa durée en ms. */
  onFrame(frameMs: number): void {
    const before = this.dynamic.scale;
    if (this.dynamic.sample(frameMs) !== before) this.applyScale();
  }

  /** Ré-applique la résolution (ex. : fenêtre déplacée sur un autre écran). */
  applyScale(): void {
    if (!this.engine) return;
    const dpr = window.devicePixelRatio || this.platform.devicePixelRatio;
    this.engine.setHardwareScalingLevel(
      computeHardwareScaling(dpr, this.profile.maxPixelRatio, this.dynamic.scale),
    );
  }

  /** Mémorise le choix du joueur (null = revenir à l'automatique). */
  static saveChoice(id: QualityId | null): void {
    writePref(PREF_KEY, id);
  }
}
