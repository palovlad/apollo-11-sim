/**
 * Procedural Web Audio API sound synthesizer for Apollo 11 Lunar Flight Simulator.
 * Zero external audio assets — all sounds generated live via oscillators and noise buffers.
 */
class ApolloSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Continuous engine nodes
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineSubGain: GainNode | null = null;

  // Continuous RCS nodes
  private rcsGain: GainNode | null = null;

  private muted = false;
  private initialized = false;
  private lastAlarmTime = 0;

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.65;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Build looped noise buffers
      const bufferSize = ctx.sampleRate * 2;
      const pinkBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const pinkData = pinkBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.09;
        b6 = white * 0.115926;
      }

      const whiteBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const whiteData = whiteBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        whiteData[i] = Math.random() * 2 - 1;
      }

      // Main rocket engine: filtered pink noise + low rumble oscillator
      const engineNoise = ctx.createBufferSource();
      engineNoise.buffer = pinkBuffer;
      engineNoise.loop = true;

      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 340;
      engineFilter.Q.value = 1.2;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0.0001;

      engineNoise.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineNoise.start();

      const subOsc = ctx.createOscillator();
      subOsc.type = 'triangle';
      subOsc.frequency.value = 58;

      const subGain = ctx.createGain();
      subGain.gain.value = 0.0001;

      subOsc.connect(subGain);
      subGain.connect(master);
      subOsc.start();

      this.engineFilter = engineFilter;
      this.engineGain = engineGain;
      this.engineSubOsc = subOsc;
      this.engineSubGain = subGain;

      // RCS thruster hiss: bandpass white noise
      const rcsNoise = ctx.createBufferSource();
      rcsNoise.buffer = whiteBuffer;
      rcsNoise.loop = true;

      const rcsFilter = ctx.createBiquadFilter();
      rcsFilter.type = 'bandpass';
      rcsFilter.frequency.value = 2600;
      rcsFilter.Q.value = 1.8;

      const rcsGain = ctx.createGain();
      rcsGain.gain.value = 0.0001;

      rcsNoise.connect(rcsFilter);
      rcsFilter.connect(rcsGain);
      rcsGain.connect(master);
      rcsNoise.start();

      this.rcsGain = rcsGain;
      this.initialized = true;
    } catch {
      // AudioContext unavailable or blocked; gracefully remain silent
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.65, now, 0.03);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public updateThrusters(mainThrottle: number, rcsActive: boolean): void {
    if (!this.initialized || !this.ctx || !this.engineGain || !this.engineFilter || !this.engineSubGain || !this.engineSubOsc || !this.rcsGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, mainThrottle));

    const targetNoiseGain = clamped > 0.01 ? 0.08 + clamped * 0.34 : 0.0001;
    const targetFilterFreq = 220 + clamped * 560;
    const targetSubGain = clamped > 0.01 ? 0.04 + clamped * 0.14 : 0.0001;
    const targetSubFreq = 46 + clamped * 28;

    this.engineGain.gain.setTargetAtTime(targetNoiseGain, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(targetFilterFreq, now, 0.06);
    this.engineSubGain.gain.setTargetAtTime(targetSubGain, now, 0.04);
    this.engineSubOsc.frequency.setTargetAtTime(targetSubFreq, now, 0.05);

    const targetRcsGain = rcsActive ? 0.12 : 0.0001;
    this.rcsGain.gain.setTargetAtTime(targetRcsGain, now, 0.02);
  }

  public silenceThrusters(): void {
    this.updateThrusters(0, false);
  }

  /**
   * Classic NASA Apollo Quindar tone:
   * Intro tone = 2525 Hz (220ms), Outro tone = 2475 Hz (220ms).
   */
  public playQuindar(type: 'intro' | 'outro' = 'intro'): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = type === 'intro' ? 2525 : 2475;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.012);
    gain.gain.setValueAtTime(0.11, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.24);
  }

  /**
   * Plays a full Houston radio beep pair (intro + delayed outro).
   */
  public playRadioCallout(): void {
    this.playQuindar('intro');
    window.setTimeout(() => {
      if (!this.muted) {
        this.playQuindar('outro');
      }
    }, 680);
  }

  /**
   * Low fuel / AGC Master Alarm beep (rate-limited).
   */
  public triggerAlarmPulse(): void {
    if (this.muted) return;
    if (!this.initialized || !this.ctx || !this.masterGain) return;

    const nowMs = performance.now();
    if (nowMs - this.lastAlarmTime < 950) return;
    this.lastAlarmTime = nowMs;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(660, now + 0.11);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.065, now + 0.01);
    gain.gain.setValueAtTime(0.065, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  /**
   * Stage completion / Lunar touchdown triumphant retro confirmation chord.
   */
  public playSuccessFanfare(): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = now + idx * 0.11;

      osc.type = 'triangle';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.58);
    });
  }

  /**
   * Crash / stage failure sound effect.
   */
  public playFailureImpact(): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    // Low thud
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.45);

    oscGain.gain.setValueAtTime(0.24, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.52);

    // Filtered noise burst
    const len = Math.floor(this.ctx.sampleRate * 0.45);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.45);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.22, now);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now);
  }
}

export const soundEngine = new ApolloSoundEngine();
