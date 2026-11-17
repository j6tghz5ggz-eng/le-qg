/**
 * Son du jeu (Web Audio, tout est synthétisé : aucun fichier à télécharger).
 *
 * - Les navigateurs n'autorisent le son qu'après un geste du joueur : le
 *   contexte audio est « réveillé » au premier clic, toucher ou touche.
 * - iPhone : en mode silencieux (bouton sur le côté), Safari coupe le son
 *   Web Audio. On demande une session audio « lecture » (comme un lecteur
 *   de musique) et, sur les anciens iOS, on joue un son muet en boucle via
 *   un élément <audio>, ce qui a le même effet.
 * - Trois bus (bruitages, moteurs, ambiance) mélangés dans un volume général.
 * - Son 3D : la position et l'orientation de l'auditeur suivent la caméra.
 * - Onglet caché : le contexte est suspendu (batterie).
 */
import { readPref, writePref } from '../save/safeStorage';

const PREF = 'sound';
const MASTER_VOLUME = 0.8;

export class AudioManager {
  readonly context: AudioContext | null;
  readonly master: GainNode | null;
  /** Bruitages (pas, chocs, mécanique…). */
  readonly sfx: GainNode | null;
  /** Moteurs des véhicules. */
  readonly engines: GainNode | null;
  /** Ambiance (vent, oiseaux). */
  readonly ambient: GainNode | null;
  private muted: boolean;
  private keepAlive: HTMLAudioElement | null = null;

  constructor() {
    let context: AudioContext | null = null;
    try {
      context = new AudioContext({ latencyHint: 'interactive' });
    } catch {
      context = null; // pas de son disponible : le jeu fonctionne sans
    }
    this.context = context;
    this.muted = readPref(PREF) === 'off';
    this.master = context ? context.createGain() : null;
    this.sfx = context ? context.createGain() : null;
    this.engines = context ? context.createGain() : null;
    this.ambient = context ? context.createGain() : null;
    if (!context || !this.master || !this.sfx || !this.engines || !this.ambient) return;

    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(context.destination);
    this.sfx.gain.value = 0.9;
    this.engines.gain.value = 1;
    this.ambient.gain.value = 0.5;
    for (const bus of [this.sfx, this.engines, this.ambient]) bus.connect(this.master);

    this.requestPlaybackSession();
    const unlock = (): void => {
      void context.resume().catch(() => undefined);
      this.startKeepAlive();
    };
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'] as const) {
      window.addEventListener(type, unlock, { passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void context.suspend().catch(() => undefined);
      else void context.resume().catch(() => undefined);
    });
  }

  get enabled(): boolean {
    return !this.muted;
  }

  set enabled(on: boolean) {
    this.muted = !on;
    writePref(PREF, on ? 'on' : 'off');
    if (this.master && this.context) this.master.gain.setTargetAtTime(on ? MASTER_VOLUME : 0, this.context.currentTime, 0.05);
  }

  /** Le son joue-t-il (contexte réveillé et non coupé) ? */
  get running(): boolean {
    return this.context?.state === 'running' && !this.muted;
  }

  /**
   * Place l'auditeur (la caméra). Coordonnées du jeu (repère main gauche) ;
   * Web Audio est en repère main droite : on inverse z.
   */
  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    const ctx = this.context;
    if (!ctx) return;
    const l = ctx.listener;
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setTargetAtTime(x, t, 0.02);
      l.positionY.setTargetAtTime(y, t, 0.02);
      l.positionZ.setTargetAtTime(-z, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(fy, t, 0.02);
      l.forwardZ.setTargetAtTime(-fz, t, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      // Anciens navigateurs (Firefox, vieux Safari).
      l.setPosition(x, y, -z);
      l.setOrientation(fx, fy, -fz, 0, 1, 0);
    }
  }

  /** Session audio « lecture » (Safari 17+) : ignore le bouton silencieux de l'iPhone. */
  private requestPlaybackSession(): void {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try {
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* non disponible */
    }
  }

  /** Anciens iOS : un son muet en boucle via <audio> fait passer la session en « lecture ». */
  private startKeepAlive(): void {
    if (this.keepAlive || !/iP(hone|ad|od)|Macintosh/.test(navigator.userAgent) || !('ontouchend' in document)) return;
    try {
      const audio = document.createElement('audio');
      audio.src = silentWavUrl();
      audio.loop = true;
      audio.setAttribute('playsinline', '');
      audio.volume = 0.01;
      void audio.play().catch(() => undefined);
      this.keepAlive = audio;
    } catch {
      /* tant pis */
    }
  }
}

/** Petit fichier WAV muet (0,5 s, 8 kHz), créé en mémoire. */
function silentWavUrl(): string {
  const samples = 4000;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const text = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); // 8 bits
  text(36, 'data');
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128); // silence en 8 bits non signé
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}
