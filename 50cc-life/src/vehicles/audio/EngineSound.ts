/**
 * Son d'un moteur 2 temps monocylindre, synthétisé en temps réel.
 *
 * Un 2 temps allume une fois par tour : fréquence de base = régime / 60
 * (27 Hz au ralenti, 150 Hz à 9 000 tr/min). Deux oscillateurs riches en
 * harmoniques + un bruit filtré (le « grésillement »), saturés puis passés
 * dans un filtre qui s'ouvre avec les gaz et le régime. Le volume dépend
 * de l'échappement (plus fort sans pot ou avec un pot course).
 */
export interface EngineSoundState {
  readonly rpm: number;
  readonly throttle: number;
  readonly running: boolean;
  readonly loudness: number;
}

export class EngineSound {
  private readonly saw: OscillatorNode;
  private readonly square: OscillatorNode;
  private readonly noise: AudioBufferSourceNode;
  private readonly noiseFilter: BiquadFilterNode;
  private readonly tone: BiquadFilterNode;
  private readonly output: GainNode;

  constructor(private readonly context: AudioContext, destination: AudioNode) {
    this.saw = context.createOscillator();
    this.saw.type = 'sawtooth';
    this.square = context.createOscillator();
    this.square.type = 'square';
    this.square.detune.value = 9;

    const length = context.sampleRate;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = context.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;
    this.noiseFilter = context.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.Q.value = 1.2;

    const sawGain = context.createGain();
    sawGain.gain.value = 0.55;
    const squareGain = context.createGain();
    squareGain.gain.value = 0.25;
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.35;

    const shaper = context.createWaveShaper();
    shaper.curve = softClipCurve(2.5);
    this.tone = context.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.Q.value = 0.8;
    this.output = context.createGain();
    this.output.gain.value = 0;

    this.saw.connect(sawGain).connect(shaper);
    this.square.connect(squareGain).connect(shaper);
    this.noise.connect(this.noiseFilter).connect(noiseGain).connect(shaper);
    shaper.connect(this.tone).connect(this.output).connect(destination);
    this.saw.start();
    this.square.start();
    this.noise.start();
  }

  update(state: EngineSoundState): void {
    const now = this.context.currentTime;
    const rpm = Math.max(state.rpm, 300);
    const firing = rpm / 60;
    this.saw.frequency.setTargetAtTime(firing, now, 0.03);
    this.square.frequency.setTargetAtTime(firing * 2, now, 0.03);
    this.noiseFilter.frequency.setTargetAtTime(firing * 7, now, 0.05);
    const cutoff = 450 + rpm * 0.22 + state.throttle * 1600 + state.loudness * 1400;
    this.tone.frequency.setTargetAtTime(Math.min(cutoff, 9000), now, 0.05);
    const volume = state.running ? (0.05 + 0.1 * state.throttle + 0.06 * Math.min(rpm / 9000, 1)) * (0.5 + state.loudness) : 0;
    this.output.gain.setTargetAtTime(volume, now, state.running ? 0.05 : 0.25);
  }

  dispose(): void {
    for (const node of [this.saw, this.square, this.noise]) node.stop();
    this.output.disconnect();
  }
}

function softClipCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}
