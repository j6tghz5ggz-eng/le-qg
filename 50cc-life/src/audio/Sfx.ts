/**
 * Bruitages synthétisés (Web Audio) : aucun fichier, quelques nœuds par son.
 *
 * Chaque son est une petite recette : rafale de bruit filtré, tonalité qui
 * glisse, enveloppe percussive. Les sons « dans le monde » passent par un
 * panoramique 3D (atténués avec la distance, à gauche ou à droite).
 */
export type SfxId =
  | 'stepConcrete'
  | 'stepGrass'
  | 'land'
  | 'grab'
  | 'throw'
  | 'ratchet'
  | 'partRemove'
  | 'partInstall'
  | 'impactMetal'
  | 'impactWood'
  | 'impactPlastic'
  | 'kick'
  | 'enginePop'
  | 'engineCough'
  | 'gearShift'
  | 'gearGrind'
  | 'stall'
  | 'seize'
  | 'purchase'
  | 'sale'
  | 'uiClick'
  | 'switch'
  | 'doorbell'
  | 'bird';

export interface SfxPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class Sfx {
  private readonly noise: AudioBuffer;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {
    const length = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Nœud de sortie : direct, ou panoramique 3D à cette position. */
  output(position?: SfxPosition, refDistance = 1.5): AudioNode {
    if (!position) return this.out;
    const panner = this.ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.rolloffFactor = 1.1;
    panner.maxDistance = 60;
    // Repère main gauche (jeu) → main droite (Web Audio) : z inversé.
    if (panner.positionX) {
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = -position.z;
    } else {
      panner.setPosition(position.x, position.y, -position.z);
    }
    panner.connect(this.out);
    return panner;
  }

  /** Source de bruit en boucle (pour les sons continus : vent, versement). */
  noiseSource(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random() * 0.5;
    return src;
  }

  play(id: SfxId, position?: SfxPosition, volume = 1): void {
    const t = this.ctx.currentTime + 0.005;
    const out = this.output(position);
    const v = volume;
    const r = (spread: number): number => 1 + (Math.random() * 2 - 1) * spread; // variation naturelle
    switch (id) {
      case 'stepConcrete':
        this.burst(out, t, { type: 'lowpass', freq: 1700 * r(0.15), q: 0.7, attack: 0.002, decay: 0.07, gain: 0.22 * v });
        this.tone(out, t, { type: 'sine', from: 85 * r(0.1), to: 50, decay: 0.07, gain: 0.25 * v });
        break;
      case 'stepGrass':
        this.burst(out, t, { type: 'bandpass', freq: 2800 * r(0.2), q: 0.6, attack: 0.006, decay: 0.12, gain: 0.13 * v });
        this.burst(out, t, { type: 'lowpass', freq: 600, q: 0.7, attack: 0.004, decay: 0.08, gain: 0.1 * v });
        break;
      case 'land':
        this.tone(out, t, { type: 'sine', from: 75, to: 38, decay: 0.14, gain: 0.45 * v });
        this.burst(out, t, { type: 'lowpass', freq: 1000, q: 0.7, attack: 0.002, decay: 0.1, gain: 0.25 * v });
        break;
      case 'grab':
        this.burst(out, t, { type: 'highpass', freq: 1800, q: 0.7, attack: 0.001, decay: 0.035, gain: 0.12 * v });
        this.tone(out, t, { type: 'triangle', from: 520 * r(0.1), to: 380, decay: 0.05, gain: 0.08 * v });
        break;
      case 'throw':
        this.sweep(out, t, { from: 450, to: 1700, q: 1.2, duration: 0.2, gain: 0.14 * v });
        break;
      case 'ratchet':
        this.burst(out, t, { type: 'highpass', freq: 3200 * r(0.1), q: 1, attack: 0.0005, decay: 0.014, gain: 0.18 * v });
        this.tone(out, t, { type: 'square', from: 2300 * r(0.05), to: 2100, decay: 0.008, gain: 0.03 * v });
        break;
      case 'partRemove':
        this.clank(out, t, 1 * r(0.05), 0.16 * v);
        break;
      case 'partInstall':
        this.clank(out, t, 0.8 * r(0.05), 0.14 * v);
        this.burst(out, t + 0.05, { type: 'highpass', freq: 2500, q: 1, attack: 0.001, decay: 0.02, gain: 0.12 * v });
        break;
      case 'impactMetal':
        this.clank(out, t, 1.15 * r(0.12), 0.18 * v);
        break;
      case 'impactWood':
        this.tone(out, t, { type: 'sine', from: 190 * r(0.15), to: 120, decay: 0.09, gain: 0.3 * v });
        this.burst(out, t, { type: 'bandpass', freq: 650 * r(0.2), q: 1.5, attack: 0.001, decay: 0.06, gain: 0.25 * v });
        break;
      case 'impactPlastic':
        this.tone(out, t, { type: 'sine', from: 320 * r(0.15), to: 210, decay: 0.07, gain: 0.25 * v });
        this.burst(out, t, { type: 'bandpass', freq: 1500 * r(0.2), q: 1.2, attack: 0.001, decay: 0.04, gain: 0.16 * v });
        break;
      case 'kick':
        // Pédale de kick : déclic, puis le vilebrequin qu'on entraîne.
        this.burst(out, t, { type: 'highpass', freq: 2600, q: 1, attack: 0.001, decay: 0.02, gain: 0.16 * v });
        this.burst(out, t + 0.02, { type: 'lowpass', freq: 900, q: 0.8, attack: 0.01, decay: 0.16, gain: 0.3 * v });
        this.tone(out, t + 0.02, { type: 'sawtooth', from: 55, to: 30, decay: 0.2, gain: 0.12 * v });
        break;
      case 'enginePop':
        this.burst(out, t, { type: 'bandpass', freq: 380, q: 1.4, attack: 0.002, decay: 0.09, gain: 0.45 * v });
        break;
      case 'engineCough':
        for (const dt of [0, 0.13, 0.22]) this.burst(out, t + dt, { type: 'bandpass', freq: 330 * r(0.15), q: 1.4, attack: 0.002, decay: 0.08, gain: 0.32 * v });
        break;
      case 'gearShift':
        this.tone(out, t, { type: 'sine', from: 290 * r(0.06), to: 170, decay: 0.06, gain: 0.32 * v });
        this.burst(out, t, { type: 'bandpass', freq: 1900, q: 2, attack: 0.001, decay: 0.03, gain: 0.18 * v });
        break;
      case 'gearGrind':
        this.grind(out, t, 0.35, 0.22 * v);
        break;
      case 'stall':
        this.tone(out, t, { type: 'sawtooth', from: 70, to: 25, decay: 0.3, gain: 0.18 * v });
        this.burst(out, t, { type: 'lowpass', freq: 500, q: 0.7, attack: 0.002, decay: 0.15, gain: 0.25 * v });
        break;
      case 'seize':
        // Piston qui grippe : crissement métallique qui s'effondre, puis choc.
        this.sweep(out, t, { from: 3200, to: 700, q: 6, duration: 0.9, gain: 0.32 * v });
        this.grind(out, t, 0.6, 0.18 * v);
        this.clank(out, t + 0.75, 0.6, 0.22 * v);
        break;
      case 'purchase':
        this.bell(out, t, 1318.5, 0.16 * v);
        this.bell(out, t + 0.09, 1760, 0.16 * v);
        break;
      case 'sale':
        this.bell(out, t, 2093, 0.1 * v, 0.18);
        this.bell(out, t + 0.06, 2637, 0.1 * v, 0.18);
        this.bell(out, t + 0.12, 3136, 0.1 * v, 0.25);
        break;
      case 'uiClick':
        this.tone(out, t, { type: 'square', from: 950, to: 900, decay: 0.018, gain: 0.04 * v });
        break;
      case 'switch':
        this.burst(out, t, { type: 'highpass', freq: 2400, q: 1, attack: 0.0005, decay: 0.012, gain: 0.25 * v });
        this.tone(out, t, { type: 'sine', from: 1500, to: 1200, decay: 0.012, gain: 0.08 * v });
        break;
      case 'doorbell':
        this.bell(out, t, 659.3, 0.18 * v, 0.7);
        this.bell(out, t + 0.45, 523.3, 0.18 * v, 0.9);
        break;
      case 'bird':
        this.chirp(out, t, 0.06 * v);
        break;
    }
  }

  // --- Recettes de base -------------------------------------------------------

  private envelope(t: number, attack: number, decay: number, gain: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(gain, 0.0001), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /** Rafale de bruit filtré. */
  private burst(out: AudioNode, t: number, o: { type: BiquadFilterType; freq: number; q: number; attack: number; decay: number; gain: number }): void {
    const src = this.noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.value = o.freq;
    filter.Q.value = o.q;
    src.connect(filter).connect(this.envelope(t, o.attack, o.decay, o.gain)).connect(out);
    src.start(t);
    src.stop(t + o.attack + o.decay + 0.05);
  }

  /** Tonalité qui glisse d'une fréquence à l'autre. */
  private tone(out: AudioNode, t: number, o: { type: OscillatorType; from: number; to: number; decay: number; gain: number }): void {
    const osc = this.ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(o.to, 1), t + o.decay);
    osc.connect(this.envelope(t, 0.002, o.decay, o.gain)).connect(out);
    osc.start(t);
    osc.stop(t + o.decay + 0.05);
  }

  /** Bruit dont le filtre balaie les fréquences (souffle, crissement). */
  private sweep(out: AudioNode, t: number, o: { from: number; to: number; q: number; duration: number; gain: number }): void {
    const src = this.noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = o.q;
    filter.frequency.setValueAtTime(o.from, t);
    filter.frequency.exponentialRampToValueAtTime(o.to, t + o.duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + o.duration * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.duration);
    src.connect(filter).connect(g).connect(out);
    src.start(t);
    src.stop(t + o.duration + 0.05);
  }

  /** Choc métallique : partiels inharmoniques qui s'éteignent vite. */
  private clank(out: AudioNode, t: number, pitch: number, gain: number): void {
    const partials: Array<[number, number, number]> = [
      [520, 0.25, 1],
      [1340, 0.16, 0.6],
      [2210, 0.1, 0.45],
      [3470, 0.06, 0.3],
    ];
    for (const [f, decay, g] of partials) this.tone(out, t, { type: 'sine', from: f * pitch, to: f * pitch * 0.98, decay, gain: gain * g });
    this.burst(out, t, { type: 'highpass', freq: 2000, q: 0.7, attack: 0.001, decay: 0.03, gain: gain * 0.8 });
  }

  /** Grincement de pignons : bruit aigu haché. */
  private grind(out: AudioNode, t: number, duration: number, gain: number): void {
    const src = this.noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 2.5;
    const chop = this.ctx.createGain();
    chop.gain.value = 0;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 55;
    lfo.connect(chop.gain);
    const env = this.envelope(t, 0.01, duration, gain);
    src.connect(filter).connect(chop).connect(env).connect(out);
    src.start(t);
    lfo.start(t);
    src.stop(t + duration + 0.05);
    lfo.stop(t + duration + 0.05);
  }

  /** Cloche / carillon (caisse enregistreuse, sonnette). */
  private bell(out: AudioNode, t: number, freq: number, gain: number, decay = 0.45): void {
    this.tone(out, t, { type: 'sine', from: freq, to: freq * 0.999, decay, gain });
    this.tone(out, t, { type: 'sine', from: freq * 2.76, to: freq * 2.75, decay: decay * 0.4, gain: gain * 0.25 });
  }

  /** Gazouillis d'oiseau : quelques notes qui montent et descendent vite. */
  private chirp(out: AudioNode, t: number, gain: number): void {
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1600;
    for (let i = 0; i < notes; i++) {
      const start = t + i * (0.07 + Math.random() * 0.05);
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), start);
      osc.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), start + 0.03);
      osc.frequency.exponentialRampToValueAtTime(base * 0.85, start + 0.06);
      osc.connect(this.envelope(start, 0.005, 0.06, gain)).connect(out);
      osc.start(start);
      osc.stop(start + 0.1);
    }
  }
}
