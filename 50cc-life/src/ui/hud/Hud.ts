/**
 * Réticule et aide contextuelle (« Clic gauche : Prendre »).
 * Les aides s'adaptent au mode de commande (clavier/souris, manette, tactile).
 */
import { NO_FOCUS, type GameEvents, type InteractionFocus } from '../../app/events';
import type { EventBus } from '../../core/events/EventBus';
import type { InputScheme } from '../../core/input/actions';
import { el } from '../dom';
import { t } from '../i18n';

/** Une aide : texte simple ou touche (affichée comme une touche de clavier). */
type HintPart = string | { key: string };

export class Hud {
  private readonly crosshair: HTMLElement;
  private readonly label: HTMLElement;
  private readonly hint: HTMLElement;
  private focus: InteractionFocus = NO_FOCUS;

  constructor(
    uiRoot: HTMLElement,
    bus: EventBus<GameEvents>,
    private scheme: InputScheme,
  ) {
    this.crosshair = el('div', { className: 'crosshair', attrs: { 'aria-hidden': 'true' } });
    this.label = el('div', { className: 'prompt__label' });
    this.hint = el('div', { className: 'prompt__hint' });
    const prompt = el('div', { className: 'prompt', attrs: { 'aria-live': 'polite' } }, [this.label, this.hint]);
    uiRoot.appendChild(el('div', { className: 'ui-layer hud' }, [this.crosshair, prompt]));
    bus.on('interaction:focus', (focus) => {
      this.focus = focus;
      this.render();
    });
    bus.on('input:scheme', ({ scheme }) => {
      this.scheme = scheme;
      this.render();
    });
    this.render();
  }

  private render(): void {
    const f = this.focus;
    this.crosshair.classList.toggle('is-active', f.canGrab || f.useLabel !== null);
    this.crosshair.classList.toggle('is-holding', f.holding);
    this.label.textContent = f.label ?? '';
    this.hint.replaceChildren(...this.hintParts().map(renderPart));
  }

  private hintParts(): HintPart[] {
    const f = this.focus;
    if (!f.label) return [];
    if (f.tooHeavy) return [t('interact.tooHeavy')];
    if (this.scheme === 'touch') return []; // les boutons tactiles affichent déjà les actions
    const pad = this.scheme === 'gamepad';
    if (f.holding) {
      return [
        pad ? t('interact.releaseX') : t('interact.releaseClick'),
        ` : ${t('interact.drop')}   `,
        { key: pad ? 'RB' : t('keys.rightClick') },
        ` ${t('interact.throw')}`,
      ];
    }
    const parts: HintPart[] = [];
    if (f.canGrab) parts.push({ key: pad ? 'X' : t('keys.leftClick') }, ` ${t('interact.grab')}`);
    if (f.useLabel) {
      if (parts.length) parts.push('   ');
      parts.push({ key: pad ? 'Y' : 'E' }, ` ${f.useLabel}`);
    }
    return parts;
  }
}

function renderPart(part: HintPart): Node {
  return typeof part === 'string' ? document.createTextNode(part) : el('kbd', { text: part.key });
}
