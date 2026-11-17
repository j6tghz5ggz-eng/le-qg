/**
 * Tableau de bord du cyclomoteur : vitesse, compte-tours, rappel des
 * commandes (PC). Visible seulement en conduite.
 */
import type { GameEvents } from '../../app/events';
import type { EventBus } from '../../core/events/EventBus';
import type { InputScheme } from '../../core/input/actions';
import { KeyboardMouseDevice } from '../../core/input/devices/KeyboardMouseDevice';
import { el } from '../dom';
import { t } from '../i18n';
import { showToast } from '../screens/Toast';

export class VehicleHud {
  private readonly root: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly rpmFill: HTMLElement;
  private readonly rpmText: HTMLElement;
  private readonly keys: HTMLElement;
  private scheme: InputScheme;

  constructor(uiRoot: HTMLElement, bus: EventBus<GameEvents>, scheme: InputScheme) {
    this.scheme = scheme;
    this.speed = el('span', { className: 'dash__speed', text: '0' });
    this.rpmFill = el('div', { className: 'dash__rpm-fill' });
    this.rpmText = el('span', { className: 'dash__rpm-text', text: '0 tr/min' });
    this.keys = el('p', { className: 'dash__keys' });
    this.root = el('div', { className: 'dash', attrs: { 'aria-label': 'Tableau de bord' } }, [
      el('div', { className: 'dash__main' }, [this.speed, el('span', { className: 'dash__unit', text: 'km/h' })]),
      el('div', { className: 'dash__rpm' }, [this.rpmFill]),
      el('div', { className: 'dash__meta' }, [this.rpmText, el('span', { text: t('vehicle.auto') })]),
      this.keys,
    ]);
    this.root.hidden = true;
    uiRoot.appendChild(this.root);

    bus.on('vehicle:mounted', () => {
      this.root.hidden = false;
      this.renderKeys();
    });
    bus.on('vehicle:dismounted', () => (this.root.hidden = true));
    bus.on('vehicle:telemetry', ({ speedKmh, rpm, limiterRpm }) => {
      this.speed.textContent = speedKmh.toFixed(0);
      const ratio = Math.min(rpm / limiterRpm, 1);
      this.rpmFill.style.transform = `scaleX(${ratio})`;
      this.rpmFill.classList.toggle('is-red', ratio > 0.92);
      this.rpmText.textContent = `${(Math.round(rpm / 100) * 100).toLocaleString('fr-FR')} tr/min`;
    });
    bus.on('input:scheme', ({ scheme: next }) => {
      this.scheme = next;
      this.renderKeys();
    });
    bus.on('ui:notice', ({ message }) => showToast(uiRoot, message, 2200));
  }

  private renderKeys(): void {
    this.keys.hidden = this.scheme !== 'keyboardMouse';
    void KeyboardMouseDevice.keyLabels().then((k) => {
      this.keys.textContent = t('vehicle.keys')
        .replace('{forward}', k.forward)
        .replace('{back}', k.back)
        .replace('{left}', k.left)
        .replace('{right}', k.right);
    });
  }
}
