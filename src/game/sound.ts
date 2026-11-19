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

export interface SpatialAudioOpts {
  volume?: number;
  pan?: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private ambientNodes: AmbientNodes | null = null;
  private ambientActive = false;
  private ambientExtraDark = false;
  private stepCooldowns = new Map<number, number>();
  private creakTimer = 5.0;
  private brownNoiseBuffer: AudioBuffer | null = null;
  private whiteNoiseBuffer: AudioBuffer | null = null;

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
    if (this.brownNoiseBuffer && this.brownNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.brownNoiseBuffer;
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
    this.brownNoiseBuffer = buf;
    return buf;
  }

  private getWhiteNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.whiteNoiseBuffer && this.whiteNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.whiteNoiseBuffer;
    }
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.whiteNoiseBuffer = buf;
    return buf;
  }

  private createOutputNode(ctx: AudioContext, opts?: SpatialAudioOpts): { node: AudioNode; vol: number } {
    const vol = Math.max(0.05, Math.min(1.2, opts?.volume ?? 1));
    const pan = Math.max(-0.9, Math.min(0.9, opts?.pan ?? 0));

    const master = ctx.createGain();
    master.gain.setValueAtTime(vol, ctx.currentTime);

    if (Math.abs(pan) > 0.02 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, ctx.currentTime);
      master.connect(panner);
      panner.connect(ctx.destination);
    } else {
      master.connect(ctx.destination);
    }

    return { node: master, vol };
  }

  private spawnNoiseBurst(
    ctx: AudioContext,
    dest: AudioNode,
    startTime: number,
    duration: number,
    filterType: BiquadFilterType,
    startFreq: number,
    endFreq: number,
    q: number,
    peakGain: number,
    decayPow = 1.6
  ) {
    const safeStart = Math.max(ctx.currentTime, startTime);
    const safeDur = Math.max(0.012, duration);

    const src = ctx.createBufferSource();
    src.buffer = this.getWhiteNoiseBuffer(ctx);
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(Math.max(30, startFreq), safeStart);
    if (endFreq !== startFreq) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), safeStart + safeDur);
    }
    filter.Q.setValueAtTime(q, safeStart);

    const gain = ctx.createGain();
    const safePeak = Math.max(0.0005, peakGain);
    const attackEnd = safeStart + Math.min(0.004, safeDur * 0.15);
    const decaySpan = Math.max(0.004, safeStart + safeDur - attackEnd);
    const midTime = attackEnd + decaySpan * 0.35;
    const midGain = Math.max(0.0005, safePeak * Math.pow(0.55, decayPow));

    gain.gain.setValueAtTime(0.0001, safeStart);
    gain.gain.linearRampToValueAtTime(safePeak, attackEnd);
    gain.gain.exponentialRampToValueAtTime(midGain, midTime);
    gain.gain.exponentialRampToValueAtTime(0.0005, attackEnd + decaySpan);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    const offset = Math.random() * 0.7;
    src.start(safeStart, offset);
    src.stop(safeStart + safeDur + 0.02);
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

    const oscA = ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.setValueAtTime(55, now);

    const oscB = ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.setValueAtTime(57.8, now);
    const oscBGain = ctx.createGain();
    oscBGain.gain.setValueAtTime(0.45, now);

    const oscC = ctx.createOscillator();
    oscC.type = 'sine';
    oscC.frequency.setValueAtTime(extraDark ? 77.78 : 82.41, now);
    const oscCGain = ctx.createGain();
    oscCGain.gain.setValueAtTime(0.32, now);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.11, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(55, now);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

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
        cd = 0.46 - speedRatio * 0.17;

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

  /** Crisp tactical semi-auto firearm shot: gunpowder crack + low punch + slide snap + room tail */
  public playShoot(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);
    const pitchJitter = 0.94 + Math.random() * 0.12;

    // 1. Sharp gunpowder muzzle crack
    this.spawnNoiseBurst(ctx, out, now, 0.11, 'bandpass', 2400 * pitchJitter, 420, 0.85, 0.42, 2.4);

    // 2. Crisp high-frequency supersonic snap transient
    this.spawnNoiseBurst(ctx, out, now, 0.028, 'highpass', 3200, 1400, 0.7, 0.28, 2.6);

    // 3. Chest-punch chamber thump
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(175 * pitchJitter, now);
    body.frequency.exponentialRampToValueAtTime(46, now + 0.085);
    bodyGain.gain.setValueAtTime(0.32, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    body.connect(bodyGain);
    bodyGain.connect(out);
    body.start(now);
    body.stop(now + 0.095);

    // 4. Quick mechanical bolt/slide return click + subtle arena echo tail
    this.spawnNoiseBurst(ctx, out, now + 0.025, 0.17, 'lowpass', 950, 260, 0.7, 0.09, 2.0);
  }

  /** Realistic mechanical reload ("chk-clack") when picking up / chambering bullet */
  public playPickup(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);

    // Stage 1: Magazine / shell snap into receiver
    this.spawnNoiseBurst(ctx, out, now, 0.032, 'bandpass', 2600, 1800, 2.8, 0.22, 2.5);
    const clickA = ctx.createOscillator();
    const gainA = ctx.createGain();
    clickA.type = 'triangle';
    clickA.frequency.setValueAtTime(1450, now);
    clickA.frequency.exponentialRampToValueAtTime(620, now + 0.022);
    gainA.gain.setValueAtTime(0.14, now);
    gainA.gain.exponentialRampToValueAtTime(0.001, now + 0.024);
    clickA.connect(gainA);
    gainA.connect(out);
    clickA.start(now);
    clickA.stop(now + 0.026);

    // Stage 2: Metallic bolt rack pull-back (t + 75ms)
    this.spawnNoiseBurst(ctx, out, now + 0.075, 0.042, 'bandpass', 3600, 2200, 3.2, 0.24, 2.0);
    const rack = ctx.createOscillator();
    const rackGain = ctx.createGain();
    rack.type = 'square';
    rack.frequency.setValueAtTime(2150, now + 0.076);
    rack.frequency.exponentialRampToValueAtTime(1180, now + 0.105);
    rackGain.gain.setValueAtTime(0.045, now + 0.076);
    rackGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.108);
    rack.connect(rackGain);
    rackGain.connect(out);
    rack.start(now + 0.076);
    rack.stop(now + 0.11);

    // Stage 3: Slide lock / chamber clack (t + 140ms)
    this.spawnNoiseBurst(ctx, out, now + 0.14, 0.038, 'bandpass', 2900, 1200, 2.6, 0.28, 2.4);
    const lockOsc = ctx.createOscillator();
    const lockGain = ctx.createGain();
    lockOsc.type = 'triangle';
    lockOsc.frequency.setValueAtTime(1720, now + 0.14);
    lockOsc.frequency.exponentialRampToValueAtTime(740, now + 0.175);
    lockGain.gain.setValueAtTime(0.16, now + 0.14);
    lockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    lockOsc.connect(lockGain);
    lockGain.connect(out);
    lockOsc.start(now + 0.14);
    lockOsc.stop(now + 0.185);
  }

  /** Tactical medkit / stim-pack latch & pressurized heal hiss */
  public playHeal(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);

    // Latch pop + pressurized injector hiss
    this.spawnNoiseBurst(ctx, out, now, 0.025, 'bandpass', 1800, 900, 2.4, 0.18, 2.2);
    this.spawnNoiseBurst(ctx, out, now + 0.035, 0.22, 'bandpass', 4200, 2400, 1.8, 0.16, 1.5);

    // Clean warm tactical HUD confirmation chime
    [659.25, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + 0.06 + i * 0.065);
      g.gain.setValueAtTime(0.075, now + 0.06 + i * 0.065);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.06 + i * 0.065 + 0.16);
      osc.connect(g);
      g.connect(out);
      osc.start(now + 0.06 + i * 0.065);
      osc.stop(now + 0.06 + i * 0.065 + 0.17);
    });
  }

  /** Realistic high-velocity bullet ricochet ("crack + metallic/stone zing") */
  public playBounce(opts?: SpatialAudioOpts, surface: 'metal' | 'solid' = 'solid') {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);
    const jitter = 0.88 + Math.random() * 0.26;

    // 1. Crisp micro-impact debris/spark crack
    this.spawnNoiseBurst(
      ctx,
      out,
      now,
      0.028,
      'bandpass',
      surface === 'metal' ? 4200 : 2800,
      950,
      1.6,
      0.2,
      2.6
    );

    // 2. High-velocity spinning bullet ricochet whine
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = surface === 'metal' ? 'triangle' : 'sine';
    const startHz = (surface === 'metal' ? 3200 : 2350) * jitter;
    const endHz = (surface === 'metal' ? 1450 : 880) * jitter;
    osc.frequency.setValueAtTime(startHz, now);
    osc.frequency.exponentialRampToValueAtTime(endHz, now + 0.095);

    gain.gain.setValueAtTime(surface === 'metal' ? 0.11 : 0.085, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.1);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.105);

    if (surface === 'metal') {
      const ping = ctx.createOscillator();
      const pingGain = ctx.createGain();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(4100 * jitter, now);
      pingGain.gain.setValueAtTime(0.045, now);
      pingGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);
      ping.connect(pingGain);
      pingGain.connect(out);
      ping.start(now);
      ping.stop(now + 0.08);
    }
  }

  /** Ballistic impact / cover splinter sound (1 = wood crate, 2 = heavy TNT crate, 3 = player body/armor hit) */
  public playHit(opts?: SpatialAudioOpts, hitKind: 'wood' | 'crate' | 'body' = 'body') {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);

    if (hitKind === 'wood') {
      // Cardboard / wooden crate splintering crack
      this.spawnNoiseBurst(ctx, out, now, 0.085, 'bandpass', 1350, 420, 1.2, 0.28, 2.1);
      const thud = ctx.createOscillator();
      const g = ctx.createGain();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(240, now);
      thud.frequency.exponentialRampToValueAtTime(85, now + 0.065);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      thud.connect(g);
      g.connect(out);
      thud.start(now);
      thud.stop(now + 0.075);
      return;
    }

    if (hitKind === 'crate') {
      // Heavy TNT crate impact + fuse ignition spark
      this.spawnNoiseBurst(ctx, out, now, 0.09, 'lowpass', 1100, 260, 1.0, 0.26, 2.0);
      this.spawnNoiseBurst(ctx, out, now + 0.02, 0.14, 'highpass', 3600, 5200, 1.4, 0.12, 1.6);
      return;
    }

    // Player armor/flesh ballistic punch + sharp hit-marker tick
    this.spawnNoiseBurst(ctx, out, now, 0.055, 'lowpass', 1600, 320, 0.9, 0.3, 2.2);
    const punch = ctx.createOscillator();
    const punchGain = ctx.createGain();
    punch.type = 'sine';
    punch.frequency.setValueAtTime(160, now);
    punch.frequency.exponentialRampToValueAtTime(48, now + 0.11);
    punchGain.gain.setValueAtTime(0.28, now);
    punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.115);
    punch.connect(punchGain);
    punchGain.connect(out);
    punch.start(now);
    punch.stop(now + 0.12);

    // Subtle crisp hitmarker tick
    const marker = ctx.createOscillator();
    const markerGain = ctx.createGain();
    marker.type = 'triangle';
    marker.frequency.setValueAtTime(1850, now);
    marker.frequency.exponentialRampToValueAtTime(980, now + 0.022);
    markerGain.gain.setValueAtTime(0.11, now);
    markerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    marker.connect(markerGain);
    markerGain.connect(out);
    marker.start(now);
    marker.stop(now + 0.03);
  }

  /** Tactical C4 / fuse countdown beep + spark hiss */
  public playTntTick(secondsLeft: number, opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const base = secondsLeft <= 1 ? 1560 : secondsLeft <= 2 ? 1240 : 980;
    osc.frequency.setValueAtTime(base, now);
    gain.gain.setValueAtTime(0.095, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.07);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.075);

    this.spawnNoiseBurst(ctx, out, now, 0.06, 'highpass', 3800, 2600, 1.2, 0.055, 1.8);
  }

  /** Heavy multi-layered Nitro / TNT detonation (sub-bass shockwave + mid blast crack + debris rumble) */
  public playExplosion(kind: 'nitro' | 'tnt' = 'nitro', opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);
    const isTnt = kind === 'tnt';

    // 1. Sub-bass shockwave punch
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(isTnt ? 115 : 138, now);
    sub.frequency.exponentialRampToValueAtTime(isTnt ? 24 : 30, now + (isTnt ? 0.52 : 0.4));
    subGain.gain.setValueAtTime(isTnt ? 0.48 : 0.4, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + (isTnt ? 0.55 : 0.42));
    sub.connect(subGain);
    subGain.connect(out);
    sub.start(now);
    sub.stop(now + (isTnt ? 0.56 : 0.43));

    // 2. Concussive high-pressure initial blast crack
    this.spawnNoiseBurst(
      ctx,
      out,
      now,
      isTnt ? 0.22 : 0.18,
      'bandpass',
      isTnt ? 1900 : 2600,
      360,
      0.7,
      isTnt ? 0.46 : 0.44,
      2.1
    );

    // 3. Rolling low-end explosion roar & rumble tail
    this.spawnNoiseBurst(
      ctx,
      out,
      now + 0.02,
      isTnt ? 0.72 : 0.55,
      'lowpass',
      isTnt ? 680 : 820,
      75,
      0.8,
      isTnt ? 0.44 : 0.36,
      1.7
    );

    // 4. Flying shrapnel / wood debris scatter
    this.spawnNoiseBurst(
      ctx,
      out,
      now + 0.04,
      isTnt ? 0.38 : 0.28,
      'highpass',
      2400,
      1100,
      0.9,
      0.16,
      2.2
    );
  }

  public playSplash(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);

    this.spawnNoiseBurst(ctx, out, now, 0.3, 'bandpass', 1100, 280, 1.0, 0.28, 1.5);
    const plunge = ctx.createOscillator();
    const g = ctx.createGain();
    plunge.type = 'sine';
    plunge.frequency.setValueAtTime(220, now);
    plunge.frequency.exponentialRampToValueAtTime(68, now + 0.16);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    plunge.connect(g);
    g.connect(out);
    plunge.start(now);
    plunge.stop(now + 0.18);
  }

  /** Player elimination / death sound: heavy fatal impact + armor crunch + tactical down flatline cue */
  public playKnockout(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);

    // 1. Heavy lethal body impact / armor shatter
    this.spawnNoiseBurst(ctx, out, now, 0.16, 'bandpass', 1500, 260, 0.9, 0.34, 2.0);
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(140, now);
    thump.frequency.exponentialRampToValueAtTime(34, now + 0.22);
    thumpGain.gain.setValueAtTime(0.36, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    thump.connect(thumpGain);
    thumpGain.connect(out);
    thump.start(now);
    thump.stop(now + 0.25);

    // 2. Sharp tactical kill-confirmed chime + comms squelch drop
    const confirm = ctx.createOscillator();
    const confirmGain = ctx.createGain();
    confirm.type = 'triangle';
    confirm.frequency.setValueAtTime(520, now + 0.04);
    confirm.frequency.exponentialRampToValueAtTime(190, now + 0.26);
    confirmGain.gain.setValueAtTime(0.14, now + 0.04);
    confirmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
    confirm.connect(confirmGain);
    confirmGain.connect(out);
    confirm.start(now + 0.04);
    confirm.stop(now + 0.28);

    // Subtle comms static burst ("player down")
    this.spawnNoiseBurst(ctx, out, now + 0.11, 0.14, 'bandpass', 2200, 1400, 2.2, 0.085, 1.8);
  }

  /** Clean modern tactical match victory chord */
  public playVictory() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [392.0, 493.88, 587.33, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 0 ? 'triangle' : 'sine';
      const t0 = now + i * 0.085;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.11, t0 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.46);
    });
  }
}

export const sound = new SoundEngine();
