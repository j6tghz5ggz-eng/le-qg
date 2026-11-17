/**
 * Tableau de bord : vitesse, rapport engagé, compte-tours (zone rouge au
 * rupteur), état du moteur, rappel des commandes (PC). Visible en conduite.
 */
import type { GameEvents } from '../../app/events';
import type { EventBus } from '../../core/events/EventBus';
import type { InputScheme } from '../../core/input/actions';
import { KeyboardMouseDevice } from '../../core/input/devices/KeyboardMouseDevice';
import { el } from '../dom';
import { t } from '../i18n';
import { showToast } from '../screens/Toast';

type Telemetry = GameEvents['vehicle:telemetry'];

export class VehicleHud {
  private readonly root: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly gear: HTMLElement;
  private readonly rpmFill: HTMLElement;
  private readonly rpmText: HTMLElement;
  private readonly status: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly keysExtra: HTMLElement;
  private scheme: InputScheme;
  private last: Telemetry | null = null;
  private closeToast: (() => void) | null = null;

  constructor(uiRoot: HTMLElement, bus: EventBus<GameEvents>, scheme: InputScheme) {
    this.scheme = scheme;
    this.speed = el('span', { className: 'dash__speed', text: '0' });
    this.gear = el('span', { className: 'dash__gear', text: 'N', attrs: { 'aria-label': 'Rapport engagé' } });
    this.rpmFill = el('div', { className: 'dash__rpm-fill' });
    this.rpmText = el('span', { className: 'dash__rpm-text', text: '0 tr/min' });
    this.status = el('span', { className: 'dash__status' });
    this.keys = el('p', { className: 'dash__keys' });
    this.keysExtra = el('p', { className: 'dash__keys' });
    this.root = el('div', { className: 'dash', attrs: { 'aria-label': 'Tableau de bord' } }, [
      el('div', { className: 'dash__main' }, [
        this.gear,
        el('div', { className: 'dash__speed-block' }, [this.speed, el('span', { className: 'dash__unit', text: 'km/h' })]),
      ]),
      el('div', { className: 'dash__rpm' }, [this.rpmFill]),
      el('div', { className: 'dash__meta' }, [this.rpmText, this.status]),
      this.keys,
      this.keysExtra,
    ]);
    this.root.hidden = true;
    uiRoot.appendChild(this.root);

    bus.on('vehicle:mounted', () => {
      this.root.hidden = false;
      this.renderKeys();
    });
    bus.on('vehicle:dismounted', () => (this.root.hidden = true));
    bus.on('vehicle:telemetry', (data) => this.render(data));
    bus.on('input:scheme', ({ scheme: next }) => {
      this.scheme = next;
      this.renderKeys();
    });
    bus.on('ui:notice', ({ message }) => {
      this.closeToast?.();
      this.closeToast = showToast(uiRoot, message, 2200);
    });
  }

  private render(data: Telemetry): void {
    const changedMode = this.last?.manual !== data.manual || this.last?.autoClutch !== data.autoClutch;
    this.last = data;
    this.speed.textContent = data.speedKmh.toFixed(0);
    this.gear.textContent = data.gear;
    this.gear.classList.toggle('is-neutral', data.gear === 'N');
    // Échelle du compte-tours : un peu au-delà du rupteur.
    const scale = Math.max(data.limiterRpm + 1500, 8000);
    this.rpmFill.style.transform = `scaleX(${Math.min(data.rpm / scale, 1)})`;
    this.rpmFill.classList.toggle('is-red', data.rpm > data.limiterRpm - 400);
    this.rpmText.textContent = `${(Math.round(data.rpm / 100) * 100).toLocaleString('fr-FR')} tr/min`;
    this.status.textContent = data.running ? (data.manual ? '' : t('vehicle.auto')) : t('vehicle.engineStopped');
    this.status.classList.toggle('is-off', !data.running);
    if (changedMode) this.renderKeys();
  }

  private renderKeys(): void {
    const pc = this.scheme === 'keyboardMouse';
    this.keys.hidden = !pc;
    const manual = this.last?.manual ?? true;
    this.keysExtra.hidden = !pc || !manual;
    this.keysExtra.textContent = this.last?.autoClutch ? t('vehicle.keysAuto') : t('vehicle.keysManual');
    void KeyboardMouseDevice.keyLabels().then((k) => {
      this.keys.textContent = t('vehicle.keys')
        .replace('{forward}', k.forward)
        .replace('{back}', k.back)
        .replace('{left}', k.left)
        .replace('{right}', k.right);
    });
  }
}
