/**
 * Panneau de débogage : statistiques de rendu, choix du profil de qualité
 * et actions de test. F3 (ou le bouton 📊) l'affiche ou le masque.
 *
 * Les statistiques sont mises à jour 4 fois par seconde seulement :
 * écrire dans le DOM à chaque image coûterait du temps sur mobile.
 */
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import type { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import type { GameContext } from '../app/GameContext';
import { QualityManager } from '../core/quality/QualityManager';
import { QUALITY_IDS, isQualityId } from '../core/quality/qualityProfiles';
import { el } from '../ui/dom';
import { t } from '../ui/i18n';

export interface DebugAction {
  readonly label: string;
  /** Touche clavier (KeyboardEvent.code), ex. « KeyC ». */
  readonly code?: string;
  run(): void;
}

const REFRESH_MS = 250;

export class DebugOverlay {
  private readonly panel: HTMLElement;
  private readonly text: HTMLElement;
  private readonly instrumentation: SceneInstrumentation;
  private lastRefresh = 0;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'F3') {
      event.preventDefault();
      this.toggle();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    for (const action of this.actions) if (action.code === event.code) action.run();
  };

  constructor(
    private readonly ctx: GameContext,
    private readonly actions: readonly DebugAction[],
    /** Lignes supplémentaires (ex. position du joueur). */
    private readonly extraLines: () => string[] = () => [],
  ) {
    this.instrumentation = new SceneInstrumentation(ctx.scene);
    this.text = el('pre', { className: 'debug__stats' });
    const actionBar = el('div', { className: 'debug__actions' });
    for (const action of actions) {
      const button = el('button', { className: 'hud-btn', text: action.label, attrs: { type: 'button' } });
      button.addEventListener('click', () => action.run());
      actionBar.appendChild(button);
    }
    this.panel = el('div', { className: 'debug', attrs: { 'aria-label': 'Statistiques' } }, [
      this.text,
      this.createQualitySelect(),
      actionBar,
    ]);
    this.panel.hidden = !import.meta.env.DEV;

    const toggle = el('button', {
      className: 'hud-btn debug__toggle',
      text: '📊',
      attrs: { type: 'button', title: t('debug.toggle'), 'aria-label': t('debug.toggle') },
    });
    toggle.addEventListener('click', () => this.toggle());

    ctx.uiRoot.append(this.panel, toggle);
    window.addEventListener('keydown', this.onKeyDown);
    ctx.scene.onAfterRenderObservable.add(() => this.refresh());
  }

  toggle(): void {
    this.panel.hidden = !this.panel.hidden;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.instrumentation.dispose();
  }

  private refresh(): void {
    const now = performance.now();
    if (this.panel.hidden || now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;

    const { engine, scene, quality, platform } = this.ctx;
    const fps = engine.getFps();
    const bodies = (scene.getPhysicsEngine() as PhysicsEngine | null)?.getBodies().length ?? 0;
    const profileName = t(`quality.${quality.profile.id}`);
    const lines = [
      `FPS         ${fps.toFixed(0).padStart(3)}  (${(1000 / Math.max(fps, 1)).toFixed(1)} ms)`,
      `Profil      ${profileName}${quality.isUserChoice ? '' : ' (auto)'}`,
      `Résolution  ${engine.getRenderWidth()}×${engine.getRenderHeight()}  (${Math.round(quality.renderScale * 100)} %)`,
      `Appels GPU  ${this.instrumentation.drawCallsCounter.current}`,
      `Objets      ${scene.getActiveMeshes().length} visibles / ${scene.meshes.length}`,
      `Triangles   ${formatCount(scene.getActiveIndices() / 3)}`,
      `Physique    ${bodies} corps  ·  pas n°${scene.getStepId()}`,
      `Appareil    ${platform.os}${platform.isMobile ? ' (mobile)' : ''}  ·  GPU ${platform.gpuTier}`,
      `            ${shorten(platform.gpuRenderer, 44)}`,
      ...this.extraLines(),
    ];
    this.text.textContent = lines.join('\n');
  }

  private createQualitySelect(): HTMLElement {
    const { quality } = this.ctx;
    const select = el('select', { attrs: { 'aria-label': t('quality.label') } });
    const autoName = t(`quality.${quality.autoProfileId}`);
    select.appendChild(el('option', { text: `${t('quality.auto')} (${autoName})`, attrs: { value: 'auto' } }));
    for (const id of QUALITY_IDS) {
      select.appendChild(el('option', { text: t(`quality.${id}`), attrs: { value: id } }));
    }
    select.value = quality.isUserChoice ? quality.profile.id : 'auto';
    select.addEventListener('change', () => {
      const value = select.value;
      QualityManager.saveChoice(isQualityId(value) ? value : null);
      select.disabled = true;
      window.setTimeout(() => window.location.reload(), 150);
    });
    return el('label', { className: 'debug__quality', attrs: { title: t('quality.restartHint') } }, [
      document.createTextNode(`${t('quality.label')} `),
      select,
    ]);
  }
}

function formatCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} k`;
  return n.toFixed(0);
}

function shorten(text: string, max: number): string {
  if (!text) return 'inconnu';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
