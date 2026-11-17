/**
 * Panneau de débogage, F3 (ou le bouton 📊) l'affiche ou le masque. Deux onglets :
 * - Infos : statistiques de rendu, profil de qualité, réglages ;
 * - DEV : les triches (argent, téléportation, moto, pièces…), fournies par
 *   les systèmes via `ctx.cheats` (voir CheatRegistry).
 *
 * Les statistiques sont mises à jour 4 fois par seconde seulement :
 * écrire dans le DOM à chaque image coûterait du temps sur mobile.
 */
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import type { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import type { GameContext } from '../app/GameContext';
import { QualityManager } from '../core/quality/QualityManager';
import { QUALITY_IDS, isQualityId } from '../core/quality/qualityProfiles';
import { readPref, writePref } from '../core/save/safeStorage';
import { el } from '../ui/dom';
import { t } from '../ui/i18n';
import type { Cheat } from './CheatRegistry';

export interface DebugToggle {
  readonly label: string;
  get(): boolean;
  set(value: boolean): void;
}

type Tab = 'info' | 'dev';
const TAB_PREF = 'debugTab';

const REFRESH_MS = 250;

export class DebugOverlay {
  private readonly panel: HTMLElement;
  private readonly text: HTMLElement;
  private readonly infoPage: HTMLElement;
  private readonly devPage: HTMLElement;
  private readonly tabButtons = new Map<Tab, HTMLButtonElement>();
  private readonly instrumentation: SceneInstrumentation;
  private readonly devToggles: Array<{ input: HTMLInputElement; cheat: Extract<Cheat, { kind: 'toggle' }> }> = [];
  private tab: Tab;
  private lastRefresh = 0;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'F3') {
      event.preventDefault();
      this.toggle();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    const cheat = this.ctx.cheats.byCode(event.code);
    if (cheat?.kind === 'action') cheat.run();
  };

  constructor(
    private readonly ctx: GameContext,
    /** Lignes supplémentaires (ex. position du joueur). */
    private readonly extraLines: () => string[] = () => [],
    toggles: readonly DebugToggle[] = [],
  ) {
    this.instrumentation = new SceneInstrumentation(ctx.scene);
    this.text = el('pre', { className: 'debug__stats' });
    const toggleList = el('div', { className: 'debug__toggles' });
    toggles.forEach((toggle, index) => {
      const input = el('input', { attrs: { type: 'checkbox', id: `debug-toggle-${index}` } });
      input.checked = toggle.get();
      input.addEventListener('change', () => toggle.set(input.checked));
      toggleList.appendChild(el('label', { className: 'debug__toggle-row', attrs: { for: input.id } }, [input, document.createTextNode(` ${toggle.label}`)]));
    });
    this.infoPage = el('div', { className: 'debug__page' }, [this.text, this.createQualitySelect(), toggleList]);
    this.devPage = el('div', { className: 'debug__page debug__dev' });
    this.renderDev();
    ctx.cheats.onChange(() => this.renderDev());

    const tabs = el('div', { className: 'debug__tabs', attrs: { role: 'tablist' } });
    for (const [id, label] of [['info', t('debug.tabInfo')], ['dev', t('debug.tabDev')]] as const) {
      const button = el('button', { className: 'debug__tab', text: label, attrs: { type: 'button', role: 'tab', 'data-tab': id } });
      button.addEventListener('click', () => this.showTab(id));
      this.tabButtons.set(id, button);
      tabs.appendChild(button);
    }
    this.panel = el('div', { className: 'debug', attrs: { 'aria-label': 'Panneau de débogage' } }, [tabs, this.infoPage, this.devPage]);
    this.panel.hidden = !import.meta.env.DEV;
    this.tab = readPref(TAB_PREF) === 'dev' ? 'dev' : 'info';
    this.showTab(this.tab);

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

  showTab(tab: Tab): void {
    this.tab = tab;
    writePref(TAB_PREF, tab);
    this.infoPage.hidden = tab !== 'info';
    this.devPage.hidden = tab !== 'dev';
    for (const [id, button] of this.tabButtons) {
      button.classList.toggle('is-active', id === tab);
      button.setAttribute('aria-selected', String(id === tab));
    }
    if (tab === 'dev') this.syncDevToggles();
  }

  /** Onglet DEV : un bloc par groupe de triches. */
  private renderDev(): void {
    this.devPage.replaceChildren(el('p', { className: 'debug__hint', text: t('debug.devHint') }));
    this.devToggles.length = 0;
    for (const group of this.ctx.cheats.list()) {
      const body = el('div', { className: 'debug__cheats' });
      for (const cheat of group.cheats) body.appendChild(this.renderCheat(cheat));
      this.devPage.appendChild(el('section', { className: 'debug__group' }, [el('h3', { text: group.title }), body]));
    }
  }

  private renderCheat(cheat: Cheat): HTMLElement {
    switch (cheat.kind) {
      case 'action': {
        const label = cheat.code ? `${cheat.label} (${cheat.code.replace(/^Key/, '')})` : cheat.label;
        const button = el('button', { className: 'hud-btn', text: label, attrs: { type: 'button', 'data-cheat': cheat.id } });
        button.addEventListener('click', () => cheat.run());
        return button;
      }
      case 'toggle': {
        const input = el('input', { attrs: { type: 'checkbox', 'data-cheat': cheat.id } });
        input.checked = cheat.get();
        input.addEventListener('change', () => cheat.set(input.checked));
        this.devToggles.push({ input, cheat });
        return el('label', { className: 'debug__toggle-row debug__cheat-toggle' }, [input, document.createTextNode(` ${cheat.label}`)]);
      }
      case 'choice': {
        const select = el('select', { attrs: { 'aria-label': cheat.label, 'data-cheat': cheat.id } });
        for (const option of cheat.options()) select.appendChild(el('option', { text: option.label, attrs: { value: option.value } }));
        const button = el('button', { className: 'hud-btn', text: cheat.button, attrs: { type: 'button' } });
        button.addEventListener('click', () => cheat.run(select.value));
        return el('div', { className: 'debug__choice' }, [select, button]);
      }
    }
  }

  private syncDevToggles(): void {
    for (const { input, cheat } of this.devToggles) input.checked = cheat.get();
  }

  toggle(): void {
    this.panel.hidden = !this.panel.hidden;
    if (!this.panel.hidden && this.tab === 'dev') this.syncDevToggles();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.instrumentation.dispose();
  }

  private refresh(): void {
    const now = performance.now();
    if (this.panel.hidden || this.tab !== 'info' || now - this.lastRefresh < REFRESH_MS) return;
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
