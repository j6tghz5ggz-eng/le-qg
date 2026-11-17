/**
 * Son du jeu (Web Audio, aucun fichier à télécharger pour l'instant).
 *
 * Les navigateurs n'autorisent le son qu'après un geste du joueur : le
 * contexte audio est « réveillé » au premier clic, toucher ou touche.
 */
import { readPref, writePref } from '../save/safeStorage';

const PREF = 'sound';

export class AudioManager {
  readonly context: AudioContext | null;
  readonly master: GainNode | null;
  private muted: boolean;

  constructor() {
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
    } catch {
      context = null; // pas de son disponible : le jeu fonctionne sans
    }
    this.context = context;
    this.muted = readPref(PREF) === 'off';
    this.master = context ? context.createGain() : null;
    if (context && this.master) {
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(context.destination);
      const unlock = (): void => {
        void context.resume().catch(() => undefined);
      };
      for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
        window.addEventListener(type, unlock, { passive: true });
      }
    }
  }

  get enabled(): boolean {
    return !this.muted;
  }

  set enabled(on: boolean) {
    this.muted = !on;
    writePref(PREF, on ? 'on' : 'off');
    if (this.master && this.context) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.context.currentTime, 0.05);
  }
}
