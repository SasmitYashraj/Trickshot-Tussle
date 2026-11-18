import type { FloorTheme } from './types';

interface AmbientNodes {
  master: GainNode;
  filter: BiquadFilterNode;
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  oscC: OscillatorNode;
  lfo: OscillatorNode;
  windSource: AudioBufferSourceNode;
  windGain: GainNode;
}

export interface FootstepListener {
  id: number;
  x: number;
  y: number;
}

export interface FootstepWalker {
  id: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  alive: boolean;
  stunTimer: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private ambientNodes: AmbientNodes | null = null;
  private ambientActive = false;
  private ambientExtraDark = false;
  private stepCooldowns = new Map<number, number>();
  private creakTimer = 5.0;
  private noiseBuffer: AudioBuffer | null = null;

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopAmbientImmediate();
    } else if (this.ambientActive) {
      this.setImmersiveAmbient(true, this.ambientExtraDark);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      data[i] = last * 2.4;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  public unlock() {
    this.ensureCtx();
  }

  public setImmersiveAmbient(active: boolean, extraDark: boolean) {
    this.ambientActive = active;
    this.ambientExtraDark = extraDark;

    if (!active || this.muted) {
      this.stopAmbientImmediate();
      return;
    }

    const ctx = this.ensureCtx();
    if (!ctx) return;

    const targetGain = extraDark ? 0.09 : 0.052;
    const now = ctx.currentTime;

    if (this.ambientNodes) {
      this.ambientNodes.master.gain.setTargetAtTime(targetGain, now, 0.35);
      this.ambientNodes.oscC.frequency.setTargetAtTime(extraDark ? 77.78 : 82.41, now, 0.4);
      this.ambientNodes.filter.frequency.setTargetAtTime(extraDark ? 165 : 220, now, 0.4);
      return;
    }

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(targetGain, now + 0.8);
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(extraDark ? 165 : 220, now);
    filter.Q.setValueAtTime(1.8, now);
    filter.connect(master);

    // Deep detuned horror sub-drone
    const oscA = ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.setValueAtTime(55, now);

    const oscB = ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.setValueAtTime(57.8, now);
    const oscBGain = ctx.createGain();
    oscBGain.gain.setValueAtTime(0.45, now);

    // Eerie minor/tritone upper harmonic
    const oscC = ctx.createOscillator();
    oscC.type = 'sine';
    oscC.frequency.setValueAtTime(extraDark ? 77.78 : 82.41, now);
    const oscCGain = ctx.createGain();
    oscCGain.gain.setValueAtTime(0.32, now);

    // Slow eerie filter sweep LFO
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.11, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(55, now);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    // Hollow looping wind noise
    const windSource = ctx.createBufferSource();
    windSource.buffer = this.getNoiseBuffer(ctx);
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(340, now);
    windFilter.Q.setValueAtTime(2.4, now);
    const windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0.42, now);

    oscA.connect(filter);
    oscB.connect(oscBGain);
    oscBGain.connect(filter);
    oscC.connect(oscCGain);
    oscCGain.connect(filter);
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);

    oscA.start(now);
    oscB.start(now);
    oscC.start(now);
    lfo.start(now);
    windSource.start(now);

    this.ambientNodes = {
      master,
      filter,
      oscA,
      oscB,
      oscC,
      lfo,
      windSource,
      windGain,
    };
  }

  private stopAmbientImmediate() {
    if (!this.ambientNodes) return;
    const nodes = this.ambientNodes;
    this.ambientNodes = null;
    try {
      nodes.oscA.stop();
      nodes.oscB.stop();
      nodes.oscC.stop();
      nodes.lfo.stop();
      nodes.windSource.stop();
      nodes.master.disconnect();
    } catch {
      // Ignore already stopped audio nodes
    }
  }

  private playEerieStinger(extraDark: boolean) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const base = extraDark ? 293.66 : 329.63;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.89, now + 1.4);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(extraDark ? 0.032 : 0.018, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.5);
  }

  public updateImmersiveFootsteps(
    dt: number,
    listener: FootstepListener | undefined,
    players: FootstepWalker[],
    floorTheme: FloorTheme,
    active: boolean,
    extraDark: boolean
  ) {
    if (!active || !listener || this.muted) {
      this.stepCooldowns.clear();
      return;
    }

    this.creakTimer -= dt;
    if (this.creakTimer <= 0) {
      this.creakTimer = 5.5 + Math.random() * 5.0;
      this.playEerieStinger(extraDark);
    }

    for (const p of players) {
      if (!p.alive || p.stunTimer > 0) {
        this.stepCooldowns.set(p.id, 0.08);
        continue;
      }

      const speed = Math.hypot(p.vx ?? 0, p.vy ?? 0);
      if (speed < 24) {
        this.stepCooldowns.set(p.id, 0.06);
        continue;
      }

      let cd = (this.stepCooldowns.get(p.id) ?? 0.1) - dt;
      if (cd <= 0) {
        const speedRatio = Math.min(1, speed / 205);
        cd = 0.46 - speedRatio * 0.17; // 0.46s slow creep -> 0.29s fast sprint

        const isLocal = p.id === listener.id;
        if (isLocal) {
          this.playFootstep(0.038, 0, floorTheme, true);
        } else {
          const dx = p.x - listener.x;
          const dy = p.y - listener.y;
          const d = Math.hypot(dx, dy);
          const maxHearDist = 740;
          if (d < maxHearDist) {
            const closeness = 1 - d / maxHearDist;
            // Steep proximity curve: quiet whisper far off, loud & heavy when close
            const volume = (0.012 + Math.pow(closeness, 1.75) * 0.22) * (0.6 + speedRatio * 0.4);
            const pan = Math.max(-0.85, Math.min(0.85, dx / 400));
            this.playFootstep(volume, pan, floorTheme, false);
          }
        }
      }
      this.stepCooldowns.set(p.id, cd);
    }
  }

  private playFootstep(volume: number, pan: number, floorTheme: FloorTheme, isSelf: boolean) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const outNode: AudioNode =
      typeof ctx.createStereoPanner === 'function'
        ? (() => {
            const p = ctx.createStereoPanner();
            p.pan.setValueAtTime(pan, now);
            p.connect(ctx.destination);
            return p;
          })()
        : ctx.destination;

    // Low footfall thud (deeper on wooden mansion floorboards)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    const pitchJitter = 0.92 + Math.random() * 0.16;
    const isCrunchSurface = floorTheme === 'grass_outdoors' || floorTheme === 'winter_snow';
    const startFreq = (isCrunchSurface ? 96 : 122) * pitchJitter * (isSelf ? 1.15 : 1);
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.065);

    oscGain.gain.setValueAtTime(volume, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);
    osc.connect(oscGain);
    oscGain.connect(outNode);
    osc.start(now);
    osc.stop(now + 0.08);

    // Subtle sole scuff / grass / snow crunch
    const noiseLen = Math.floor(ctx.sampleRate * 0.055);
    const buf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseLen, 2.2);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(
      floorTheme === 'winter_snow' ? 1450 : floorTheme === 'grass_outdoors' ? 950 : 580,
      now
    );
    filter.Q.setValueAtTime(1.4, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(volume * (isCrunchSurface ? 0.85 : 0.45), now);
    nGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.055);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(outNode);
    noise.start(now);
  }

  public playShoot() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.11);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playPickup() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.08);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playHeal() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      gain.gain.setValueAtTime(0.11, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.15);
    });
  }

  public playBounce() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(840, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playHit() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.16);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playTntTick(secondsLeft: number) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    const base = secondsLeft <= 1 ? 880 : secondsLeft <= 2 ? 700 : 540;
    osc.frequency.setValueAtTime(base, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playExplosion() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.35;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.8);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + 0.32);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playSplash() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * 0.28);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.4);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(920, now);
    filter.frequency.exponentialRampToValueAtTime(260, now + 0.26);
    filter.Q.setValueAtTime(1.1, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playKnockout() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [340, 220].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + i * 0.08 + 0.18);
      gain.gain.setValueAtTime(0.14, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.19);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.2);
    });
  }

  public playVictory() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);
      gain.gain.setValueAtTime(0.14, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.3);
    });
  }
}

export const sound = new SoundEngine();
