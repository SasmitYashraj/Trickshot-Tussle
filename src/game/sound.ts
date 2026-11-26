import type { FloorTheme, MatchMode } from './types';

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

interface NormalMusicNodes {
  master: GainNode;
}

export interface FootstepListener {
  id: number;
  x: number;
  y: number;
  floor?: number;
}

export interface FootstepWalker {
  id: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  floor?: number;
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
  private musicEnabled = true;
  private appBackgrounded = false;
  private ambientNodes: AmbientNodes | null = null;
  private ambientActive = false;
  private ambientExtraDark = false;
  private normalMusicNodes: NormalMusicNodes | null = null;
  private normalMusicActive = false;
  private normalMusicTension = 0;
  private normalMusicTheme: FloorTheme = 'mansion_wood';
  private musicStepTimer = 0.06;
  private musicStepIndex = 0;
  private stepCooldowns = new Map<number, number>();
  private creakTimer = 5.0;
  private brownNoiseBuffer: AudioBuffer | null = null;
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private libraryMusicBuffer: AudioBuffer | null = null;
  private monsterStepBuffer: AudioBuffer | null = null;
  private monsterRoarBuffer: AudioBuffer | null = null;
  private monsterJumpscareBuffer: AudioBuffer | null = null;
  private libraryPreloadStarted = false;
  private libraryRawCache = new Map<string, ArrayBuffer>();
  private libraryDecodeInFlight = new Set<string>();
  private iceSlipBuffer: AudioBuffer | null = null;
  private iceSlipRaw: ArrayBuffer | null = null;
  private iceSlipLoading = false;
  private iceSlipDecoding = false;
  private activeRoarSource: AudioBufferSourceNode | null = null;
  private activeStepSources = new Set<AudioBufferSourceNode>();
  private activeStepOscs = new Set<OscillatorNode>();
  private monsterStepSilenceUntil = 0;
  private libraryMusicActive = false;
  private libraryMusicProgress = 0;
  private libraryMusicInRage = false;
  private libraryMusicNodes: {
    source: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    gain: GainNode;
  } | null = null;
  private immersiveTrackBuffers = new Map<'grass_outdoors' | 'mansion_stage1' | 'mansion_final', AudioBuffer>();
  private immersiveTrackBounds = new Map<'grass_outdoors' | 'mansion_stage1' | 'mansion_final', { start: number; end: number }>();
  private immersiveTrackRaw = new Map<'grass_outdoors' | 'mansion_stage1' | 'mansion_final', ArrayBuffer>();
  private immersiveTrackLoading = new Set<'grass_outdoors' | 'mansion_stage1' | 'mansion_final'>();
  private immersiveTrackDecoding = new Set<'grass_outdoors' | 'mansion_stage1' | 'mansion_final'>();
  private immersiveMapMusicActive = false;
  private immersiveMapMusicTheme: 'grass_outdoors' | 'mansion_wood' | null = null;
  private immersiveMapMusicProgress = 0;
  private immersiveMapMusicFinalStage = false;
  private mapTheme: FloorTheme = 'mansion_wood';
  private mapIsImmersive = false;
  private reverbCtx: AudioContext | null = null;
  private reverbSendNode: GainNode | null = null;
  private cricketTimer = 1.6;
  private immersiveTrackNodes: {
    theme: 'grass_outdoors' | 'mansion_wood';
    trackKey: 'grass_outdoors' | 'mansion_stage1' | 'mansion_final';
    stage: 1 | 2;
    filter: BiquadFilterNode;
    master: GainNode;
    activeSources: Set<AudioBufferSourceNode>;
    currentSource: AudioBufferSourceNode | null;
    currentGain: GainNode | null;
    estOffset: number;
    lastCtxTime: number;
    currentRate: number;
    scheduledHandoffAt: number;
  } | null = null;

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopAmbientImmediate();
      this.stopNormalMusicImmediate();
      this.stopLibraryMusicImmediate();
      this.stopImmersiveMapMusicImmediate();
    } else if (this.musicEnabled) {
      if (this.ambientActive) {
        this.setImmersiveAmbient(true, this.ambientExtraDark);
      }
      if (this.normalMusicActive) {
        this.updateNormalMusic(0, true, this.normalMusicTension, this.normalMusicTheme);
      }
      if (this.libraryMusicActive) {
        this.updateLibraryMusic(0, true, this.libraryMusicProgress, this.libraryMusicInRage);
      }
      if (this.immersiveMapMusicActive && this.immersiveMapMusicTheme) {
        this.updateImmersiveMapMusic(
          0,
          true,
          this.immersiveMapMusicTheme,
          this.immersiveMapMusicProgress,
          this.immersiveMapMusicFinalStage
        );
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMusicEnabled(enabled: boolean) {
    if (this.musicEnabled === enabled) return;
    this.musicEnabled = enabled;
    if (!enabled) {
      this.stopAmbientImmediate();
      this.stopNormalMusicImmediate();
      this.stopLibraryMusicImmediate();
      this.stopImmersiveMapMusicImmediate();
    } else if (!this.muted) {
      if (this.ambientActive) {
        this.setImmersiveAmbient(true, this.ambientExtraDark);
      }
      if (this.normalMusicActive) {
        this.updateNormalMusic(0, true, this.normalMusicTension, this.normalMusicTheme);
      }
      if (this.libraryMusicActive) {
        this.updateLibraryMusic(0, true, this.libraryMusicProgress, this.libraryMusicInRage);
      }
      if (this.immersiveMapMusicActive && this.immersiveMapMusicTheme) {
        this.updateImmersiveMapMusic(
          0,
          true,
          this.immersiveMapMusicTheme,
          this.immersiveMapMusicProgress,
          this.immersiveMapMusicFinalStage
        );
      }
    }
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public setAppBackgrounded(backgrounded: boolean) {
    if (this.appBackgrounded === backgrounded) return;
    this.appBackgrounded = backgrounded;
    if (!this.ctx) return;

    if (backgrounded) {
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else if (!this.muted) {
      if (this.immersiveTrackNodes) {
        this.immersiveTrackNodes.lastCtxTime = this.ctx.currentTime;
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }
  }

  private ensureCtx(): AudioContext | null {
    if (this.muted || this.appBackgrounded) return null;
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

  public setMapEnvironment(theme: FloorTheme, isImmersive: boolean) {
    this.mapTheme = theme;
    this.mapIsImmersive = isImmersive;
  }

  private getMansionReverbSend(ctx: AudioContext): GainNode | null {
    if (!(this.mapTheme === 'mansion_wood' && this.mapIsImmersive)) return null;
    if (this.reverbSendNode && this.reverbCtx === ctx) {
      return this.reverbSendNode;
    }
    try {
      const dur = 0.92;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const t = i / ctx.sampleRate;
          const white = Math.random() * 2 - 1;
          lp = lp * 0.72 + white * 0.28;
          data[i] = lp * Math.exp(-t * 4.9) * 0.65;
        }
        // Subtle wooden hall early reflections
        const taps = [0.017, 0.031, 0.052, 0.079];
        taps.forEach((tapSec, idx) => {
          const sIdx = Math.min(len - 1, Math.floor((tapSec + ch * 0.003) * ctx.sampleRate));
          data[sIdx] += (idx % 2 === 0 ? 1 : -1) * (0.28 / (idx + 1));
        });
      }

      const send = ctx.createGain();
      send.gain.setValueAtTime(0.3, ctx.currentTime);

      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.setValueAtTime(2550, ctx.currentTime);

      const convolver = ctx.createConvolver();
      convolver.buffer = ir;

      send.connect(tone);
      tone.connect(convolver);
      convolver.connect(ctx.destination);

      this.reverbCtx = ctx;
      this.reverbSendNode = send;
      return send;
    } catch {
      return null;
    }
  }

  private createOutputNode(ctx: AudioContext, opts?: SpatialAudioOpts): { node: AudioNode; vol: number } {
    const vol = Math.max(0.05, Math.min(1.2, opts?.volume ?? 1));
    const pan = Math.max(-0.9, Math.min(0.9, opts?.pan ?? 0));

    const master = ctx.createGain();
    master.gain.setValueAtTime(vol, ctx.currentTime);

    const reverbSend = this.getMansionReverbSend(ctx);
    if (Math.abs(pan) > 0.02 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, ctx.currentTime);
      master.connect(panner);
      panner.connect(ctx.destination);
      if (reverbSend) panner.connect(reverbSend);
    } else {
      master.connect(ctx.destination);
      if (reverbSend) master.connect(reverbSend);
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
    this.preloadLibraryAudio();
    this.preloadIceSlipAudio();
  }

  public setImmersiveAmbient(active: boolean, extraDark: boolean) {
    this.ambientActive = active;
    this.ambientExtraDark = extraDark;

    if (!active || this.muted || !this.musicEnabled) {
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

  /**
   * Map-themed procedural orchestral/atmospheric suspense score for all Normal modes:
   * Shares the same thrilling ramp in tempo, loudness, and tension across matches while
   * crafting distinct instrumentation per map:
   * - winter_snow (Winter Tussle): Santa sleigh bells, frosty celesta, shivering strings & F#m timpani
   * - mansion_wood (Manor Foyer): Baroque harpsichord, manor clock chimes, cello & violin in Cm
   * - grass_outdoors (Meadow Clearing): Celtic plucked harp, airy woodland flute, bodhrán & horns in Em
   * - maple_cargo (Cargo Deck): Industrial sub-bass pulse, metallic hi-hat/anvil ticks & spy brass in Dm
   */
  public updateNormalMusic(
    dt: number,
    active: boolean,
    tensionRaw: number,
    floorTheme: FloorTheme = this.normalMusicTheme
  ) {
    this.normalMusicActive = active;
    const tension = Math.max(0, Math.min(1, tensionRaw));
    this.normalMusicTension = tension;

    if (floorTheme !== this.normalMusicTheme) {
      this.normalMusicTheme = floorTheme;
      this.stopNormalMusicImmediate();
    }

    if (!active || this.muted || !this.musicEnabled) {
      this.stopNormalMusicImmediate();
      return;
    }

    const ctx = this.ensureCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterLevel = 0.115 + tension * 0.08;

    if (!this.normalMusicNodes) {
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0005, now);
      master.gain.linearRampToValueAtTime(masterLevel, now + 0.35);
      master.connect(ctx.destination);

      this.normalMusicNodes = { master };
      this.musicStepTimer = 0.04;
      this.musicStepIndex = 0;
    } else {
      this.normalMusicNodes.master.gain.setTargetAtTime(masterLevel, now, 0.25);
    }

    if (dt <= 0) return;

    this.musicStepTimer -= dt;
    if (this.musicStepTimer <= 0) {
      // Structurally distinct meters, step counts, and tempo curves per map!
      let stepSec = 0.25;
      let cycleLen = 16;
      if (floorTheme === 'mansion_wood') {
        // 3/4 Haunted Baroque Waltz (12 steps = 2 bars of 6 eighth notes, 74 -> 132 BPM)
        const waltzBpm = 74 + tension * 58;
        stepSec = 60 / waltzBpm / 2;
        cycleLen = 12;
      } else if (floorTheme === 'grass_outdoors') {
        // 6/8 Celtic Woodland Hunt Gallop (12 compound eighth steps, 84 -> 138 BPM)
        const jigBpm = 84 + tension * 54;
        stepSec = 60 / jigBpm / 2;
        cycleLen = 12;
      } else if (floorTheme === 'maple_cargo') {
        // 4/4 Syncopated Industrial Cyber-Heist (16 16th/8th groove steps, 96 -> 146 BPM)
        const heistBpm = 96 + tension * 50;
        stepSec = 60 / heistBpm / 2;
        cycleLen = 16;
      } else {
        // Winter Tussle: 4/4 Arctic Sleigh-Bell Chase (16 steps, 88 -> 146 BPM)
        const winterBpm = 88 + tension * 58;
        stepSec = 60 / winterBpm / 2;
        cycleLen = 16;
      }

      this.musicStepTimer = Math.max(0.13, stepSec);
      this.triggerNormalMusicStep(
        ctx,
        this.normalMusicNodes.master,
        this.musicStepIndex % cycleLen,
        stepSec,
        tension,
        floorTheme
      );
      this.musicStepIndex = (this.musicStepIndex + 1) % cycleLen;
    }
  }

  /** Santa sleigh-bell shake: crisp shimmering jingle burst + high metallic partials */
  private spawnSleighBells(ctx: AudioContext, dest: AudioNode, t0: number, intensity: number) {
    // Crisp leather-strap & brass jingle shake burst
    this.spawnNoiseBurst(ctx, dest, t0, 0.075, 'bandpass', 6400, 4200, 1.8, 0.095 * intensity, 2.0);
    // Double subtle tail shake 45ms later
    this.spawnNoiseBurst(ctx, dest, t0 + 0.042, 0.06, 'highpass', 5200, 3800, 1.4, 0.055 * intensity, 2.2);

    // Individual bright spherical jingle partials
    const bellPartials = [2960, 4186, 5580];
    for (let i = 0; i < bellPartials.length; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const jitter = 0.97 + Math.random() * 0.06;
      const startT = t0 + i * 0.008;
      osc.frequency.setValueAtTime(bellPartials[i] * jitter, startT);
      g.gain.setValueAtTime(0.0005, startT);
      g.gain.linearRampToValueAtTime(0.032 * intensity, startT + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0005, startT + 0.085);
      osc.connect(g);
      g.connect(dest);
      osc.start(startT);
      osc.stop(startT + 0.095);
    }
  }

  /** Shimmering music-box / celesta note (used in Winter Tussle) or Manor Clock Chime */
  private spawnBellTone(
    ctx: AudioContext,
    dest: AudioNode,
    t0: number,
    freq: number,
    dur: number,
    peak: number,
    harmonicRatio = 2.0
  ) {
    const fund = ctx.createOscillator();
    const over = ctx.createOscillator();
    const fg = ctx.createGain();
    const og = ctx.createGain();
    fund.type = 'sine';
    over.type = 'triangle';
    fund.frequency.setValueAtTime(freq, t0);
    over.frequency.setValueAtTime(freq * harmonicRatio, t0);

    fg.gain.setValueAtTime(0.0005, t0);
    fg.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    fg.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);

    og.gain.setValueAtTime(0.0005, t0);
    og.gain.linearRampToValueAtTime(peak * 0.35, t0 + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0005, t0 + dur * 0.45);

    fund.connect(fg);
    over.connect(og);
    fg.connect(dest);
    og.connect(dest);
    fund.start(t0);
    over.start(t0);
    fund.stop(t0 + dur + 0.02);
    over.stop(t0 + dur * 0.46 + 0.02);
  }

  private triggerNormalMusicStep(
    ctx: AudioContext,
    dest: AudioNode,
    step: number,
    stepDur: number,
    tension: number,
    floorTheme: FloorTheme
  ) {
    const t0 = ctx.currentTime + 0.015;

    if (floorTheme === 'winter_snow') {
      // === WINTER TUSSLE (16-step Arctic Sleigh-Bell & Celesta Chase) ===
      // Distinct 2-bar crystalline winter theme in F# minor with frosty pizzicato & accelerating Santa sleigh bells
      const winterBass = [
        185.0, 0, 277.18, 185.0, // F#3 - C#4 F#3
        220.0, 0, 293.66, 277.18, // A3 - D4 C#4
        185.0, 220.0, 277.18, 293.66, // F#3 A3 C#4 D4
        246.94, 220.0, 196.0, 174.61, // B3 A3 G3 E#3
      ];
      const bassHz = winterBass[step];
      if (bassHz > 0 && (step % 2 === 0 || tension > 0.3)) {
        // Icy staccato pizzicato glass-strings (tight pluck, NOT long orchestral sawtooths)
        const pFilter = ctx.createBiquadFilter();
        pFilter.type = 'bandpass';
        pFilter.frequency.setValueAtTime(540 + tension * 1100, t0);
        pFilter.Q.setValueAtTime(1.1, t0);
        pFilter.connect(dest);

        const pOsc = ctx.createOscillator();
        const pg = ctx.createGain();
        pOsc.type = 'triangle';
        pOsc.frequency.setValueAtTime(bassHz, t0);
        const len = Math.min(0.18, stepDur * 0.72);
        pg.gain.setValueAtTime(0.0005, t0);
        pg.gain.linearRampToValueAtTime((step % 4 === 0 ? 0.34 : 0.22) * (0.76 + tension * 0.44), t0 + 0.008);
        pg.gain.exponentialRampToValueAtTime(0.0008, t0 + len);
        pOsc.connect(pg);
        pg.connect(pFilter);
        pOsc.start(t0);
        pOsc.stop(t0 + len + 0.02);
      }

      // Santa Sleigh Bells: gentle snowflake sparkle early -> relentless rapid sleigh-chase shakes!
      const sleighHit =
        step === 2 ||
        step === 6 ||
        step === 10 ||
        step === 14 ||
        (tension > 0.35 && (step === 0 || step === 8)) ||
        (tension > 0.65 && step % 2 === 1);
      if (sleighHit) {
        const bellPower = (step % 4 === 2 ? 1.05 : 0.75) * (0.7 + tension * 0.7);
        this.spawnSleighBells(ctx, dest, t0, bellPower);
        if (tension > 0.78 && step % 4 === 2) {
          this.spawnSleighBells(ctx, dest, t0 + stepDur * 0.5, 0.55);
        }
      }

      // Main Frost Celesta / Glockenspiel Tune (very bright, wintry, distinct melody)
      const winterMelody: Record<number, number> = {
        0: 739.99, // F#5
        2: 1108.73, // C#6
        3: 987.77, // B5
        4: 880.0, // A5
        6: 830.61, // G#5
        8: 739.99, // F#5
        10: 659.25, // E5
        12: 587.33, // D5
        14: 698.46, // E#5
        15: 739.99, // F#5 pickup (enters when tension > 0.4)
      };
      const melHz = winterMelody[step];
      if (melHz && (step !== 15 || tension > 0.4)) {
        this.spawnBellTone(ctx, dest, t0, melHz, Math.min(0.62, stepDur * 2.4), 0.14 + tension * 0.08, 2.0);
        // Winter ramp-up layer: octave crystalline chime harmony (unique to Winter Tussle!)
        if (tension > 0.45 && step % 4 === 0) {
          this.spawnBellTone(ctx, dest, t0 + 0.025, melHz * 0.5, stepDur * 2.8, 0.12 * tension, 3.0);
        }
      }

      // Winter Ramp-Up Percussion: crisp frost-snare rim clicks & deep snow drum on downbeats only
      if (step === 0 || step === 8) {
        this.spawnTimpani(ctx, dest, t0, 96, 38, 0.28 + tension * 0.18);
      }
      if (tension > 0.28 && (step === 4 || step === 12 || (tension > 0.62 && step % 2 === 0))) {
        this.spawnNoiseBurst(ctx, dest, t0, 0.04, 'highpass', 3600, 5200, 1.8, 0.055 + tension * 0.08, 2.5);
      }
      return;
    }

    if (floorTheme === 'mansion_wood') {
      // === MANOR FOYER (3/4 Gothic Haunted Waltz - 12 steps: Bar1 0..5, Bar2 6..11) ===
      // Beat positions: 0 (ONE), 2 (two), 4 (three) | 6 (ONE), 8 (two), 10 (three)
      const isWaltzDownbeat = step === 0 || step === 6;
      const isWaltzChordBeat = step === 2 || step === 4 || step === 8 || step === 10;

      if (isWaltzDownbeat) {
        // Deep resonant Baroque Pipe-Organ + Cello waltz downbeat ("OOM")
        const rootHz = step === 0 ? 130.81 : 116.54; // C3 -> Bb2/Ab2 progression
        this.spawnTimpani(ctx, dest, t0, rootHz * 0.72, 34, 0.3 + tension * 0.16);
        this.spawnBellTone(
          ctx,
          dest,
          t0,
          step === 0 ? 261.63 : 196.0, // Manor grandfather-clock chime on waltz beat 1
          stepDur * 4.5,
          0.11 + tension * 0.07,
          2.41
        );
      }

      // Plucked Harpsichord Waltz Accompaniment ("pah-pah") + rapid 16th-note Baroque ramp runs!
      const harpChordNotes: Record<number, number[]> = {
        0: [130.81],
        1: [196.0], // fast baroque fill when tension > 0.45
        2: [311.13, 392.0], // Eb4 + G4 (Cm)
        3: [392.0],
        4: [311.13, 392.0],
        5: [349.23],
        6: [174.61],
        7: [261.63],
        8: [349.23, 415.3], // F4 + Ab4 (Fm)
        9: [415.3],
        10: [293.66, 392.0], // D4 + G4 (G7 tension!)
        11: [493.88], // B4 leading tone!
      };
      const notes = harpChordNotes[step] ?? [];
      const playThisStep =
        isWaltzDownbeat || isWaltzChordBeat || (tension > 0.38 && step % 2 === 1);

      if (playThisStep && notes.length > 0) {
        const harpF = ctx.createBiquadFilter();
        harpF.type = 'lowpass';
        harpF.frequency.setValueAtTime(1600 + tension * 1700, t0);
        harpF.frequency.exponentialRampToValueAtTime(360, t0 + Math.min(0.22, stepDur * 0.9));
        harpF.Q.setValueAtTime(2.1, t0);
        harpF.connect(dest);

        for (const fHz of notes) {
          const hOsc = ctx.createOscillator();
          const hg = ctx.createGain();
          hOsc.type = 'sawtooth';
          hOsc.frequency.setValueAtTime(fHz, t0);
          const dur = Math.min(0.24, stepDur * 0.9);
          const pk = (isWaltzChordBeat ? 0.16 : 0.11) * (0.8 + tension * 0.45);
          hg.gain.setValueAtTime(0.0005, t0);
          hg.gain.linearRampToValueAtTime(pk, t0 + 0.005);
          hg.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
          hOsc.connect(hg);
          hg.connect(harpF);
          hOsc.start(t0);
          hOsc.stop(t0 + dur + 0.02);
        }
      }

      // Sweeping Gothic Solo Violin / Organ Waltz Melody (distinct 3/4 haunted ballroom theme)
      const waltzMelody: Record<number, { hz: number; durSteps: number }> = {
        0: { hz: 523.25, durSteps: 2 }, // C5
        2: { hz: 622.25, durSteps: 2 }, // Eb5
        4: { hz: 587.33, durSteps: 2 }, // D5
        6: { hz: 493.88, durSteps: 2 }, // B4
        8: { hz: 523.25, durSteps: 2 }, // C5
        10: { hz: 392.0, durSteps: 2 }, // G4
      };
      const wMel = waltzMelody[step];
      if (wMel) {
        this.spawnStringSwell(ctx, dest, t0, wMel.hz, stepDur * wMel.durSteps * 0.95, 0.25 + tension * 0.75);
        // Manor ramp-up: Cathedral Organ high octave layer enters above 50% tension
        if (tension > 0.5 && isWaltzDownbeat) {
          this.spawnStringSwell(ctx, dest, t0, wMel.hz * 2, stepDur * 2.4, tension * 0.85);
        }
      }
      return;
    }

    if (floorTheme === 'grass_outdoors') {
      // === MEADOW CLEARING (6/8 Compound Celtic Hunt - 12 steps: Triplets ONE-2-3 FOUR-5-6) ===
      // Distinct rolling 6/8 gallop, Celtic Harp + Breath Woodland Flute + Bodhrán Battle Rolls
      const isCompoundPulse = step === 0 || step === 3 || step === 6 || step === 9;
      const harpGallop = [
        164.81, 246.94, 329.63, // E3 B3 E4
        196.0, 293.66, 392.0, // G3 D4 G4
        220.0, 277.18, 329.63, // A3 C#4 E4 (bright Dorian twist)
        246.94, 196.0, 146.83, // B3 G3 D3
      ];
      const harpHz = harpGallop[step];

      // Rolling 6/8 Celtic Harp arpeggio
      if (isCompoundPulse || tension > 0.18 || step % 3 !== 2) {
        const harpF = ctx.createBiquadFilter();
        harpF.type = 'lowpass';
        harpF.frequency.setValueAtTime(980 + tension * 1150, t0);
        harpF.connect(dest);

        const hOsc = ctx.createOscillator();
        const hg = ctx.createGain();
        hOsc.type = 'triangle';
        hOsc.frequency.setValueAtTime(harpHz, t0);
        const hLen = Math.min(0.24, stepDur * 0.88);
        hg.gain.setValueAtTime(0.0005, t0);
        hg.gain.linearRampToValueAtTime((isCompoundPulse ? 0.34 : 0.2) * (0.78 + tension * 0.44), t0 + 0.008);
        hg.gain.exponentialRampToValueAtTime(0.0008, t0 + hLen);
        hOsc.connect(hg);
        hg.connect(harpF);
        hOsc.start(t0);
        hOsc.stop(t0 + hLen + 0.02);
      }

      // Expressive Woodland Celtic Flute Main Tune (6/8 lilt!)
      const fluteLine: Record<number, { hz: number; steps: number }> = {
        0: { hz: 659.25, steps: 2 }, // E5
        2: { hz: 587.33, steps: 1 }, // D5
        3: { hz: 493.88, steps: 2.5 }, // B4
        6: { hz: 554.37, steps: 2 }, // C#5
        8: { hz: 587.33, steps: 1 }, // D5
        9: { hz: 783.99, steps: 1.5 }, // G5 soaring peak!
        11: { hz: 659.25, steps: 1 }, // E5
      };
      const fl = fluteLine[step];
      if (fl) {
        const dur = stepDur * fl.steps * 0.95;
        const osc = ctx.createOscillator();
        const fg = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(fl.hz * 0.985, t0);
        osc.frequency.linearRampToValueAtTime(fl.hz, t0 + 0.035);
        fg.gain.setValueAtTime(0.0005, t0);
        fg.gain.linearRampToValueAtTime(0.105 + tension * 0.085, t0 + 0.03);
        fg.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
        osc.connect(fg);
        fg.connect(dest);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
        this.spawnNoiseBurst(ctx, dest, t0, 0.05, 'bandpass', fl.hz * 1.4, fl.hz, 2.2, 0.03 + tension * 0.025, 1.8);
      }

      // Meadow Ramp-Up: Bodhrán triplet war-drum rolls + Hunting Horn fifths (no standard 4/4 timpani/saw!)
      if (isCompoundPulse || (tension > 0.45 && (step === 2 || step === 8)) || (tension > 0.72 && step % 3 === 2)) {
        this.spawnTimpani(ctx, dest, t0, isCompoundPulse ? 116 : 92, 48, (isCompoundPulse ? 0.34 : 0.2) * (0.6 + tension * 0.55));
      }
      if (tension > 0.3 && (step === 0 || step === 6)) {
        // Warm brass hunting horn call (pure fifth dyad E4+B4 -> G4+D5)
        const hornHz = step === 0 ? 329.63 : 392.0;
        const hFilter = ctx.createBiquadFilter();
        hFilter.type = 'lowpass';
        hFilter.frequency.setValueAtTime(620 + tension * 900, t0);
        hFilter.connect(dest);
        for (const ratio of [1, 1.5]) {
          const ho = ctx.createOscillator();
          const hgn = ctx.createGain();
          ho.type = 'triangle';
          ho.frequency.setValueAtTime(hornHz * ratio, t0);
          const hd = stepDur * 2.6;
          hgn.gain.setValueAtTime(0.0005, t0);
          hgn.gain.linearRampToValueAtTime(0.095 * tension, t0 + 0.06);
          hgn.gain.exponentialRampToValueAtTime(0.0008, t0 + hd);
          ho.connect(hgn);
          hgn.connect(hFilter);
          ho.start(t0);
          ho.stop(t0 + hd + 0.02);
        }
      }
      return;
    }

    // === CARGO DECK (16-step Syncopated Industrial Cyber-Heist Groove) ===
    // Completely electronic/tactical espionage structure (NO classical orchestral swells!):
    // Syncopated sub-bass funk-thriller riff + radar pings + crisp snare/shaker ramp + acid synth stabs
    const bassPattern = [
      146.83, 0, 146.83, 155.56, // D3 - D3 Eb3
      0, 220.0, 0, 196.0, // - A3 - G3
      146.83, 0, 174.61, 155.56, // D3 - F3 Eb3
      146.83, 0, 138.59, 164.81, // D3 - C#3 E3
    ];
    const bassHz = bassPattern[step];
    if (bassHz > 0) {
      const acidFilter = ctx.createBiquadFilter();
      acidFilter.type = 'lowpass';
      const cutoff = 380 + tension * 1950;
      acidFilter.frequency.setValueAtTime(cutoff, t0);
      acidFilter.frequency.exponentialRampToValueAtTime(Math.max(180, cutoff * 0.42), t0 + stepDur * 0.85);
      acidFilter.Q.setValueAtTime(3.2 + tension * 3.5, t0);
      acidFilter.connect(dest);

      const bOsc = ctx.createOscillator();
      const bSub = ctx.createOscillator();
      const bg = ctx.createGain();
      bOsc.type = 'sawtooth';
      bSub.type = 'sine';
      bOsc.frequency.setValueAtTime(bassHz, t0);
      bSub.frequency.setValueAtTime(bassHz * 0.5, t0);
      const bLen = Math.min(0.24, stepDur * 0.85);
      bg.gain.setValueAtTime(0.0005, t0);
      bg.gain.linearRampToValueAtTime(0.28 + tension * 0.14, t0 + 0.008);
      bg.gain.exponentialRampToValueAtTime(0.0008, t0 + bLen);
      bOsc.connect(bg);
      bSub.connect(bg);
      bg.connect(acidFilter);
      bOsc.start(t0);
      bSub.start(t0);
      bOsc.stop(t0 + bLen + 0.02);
      bSub.stop(t0 + bLen + 0.02);
    }

    // Main Tactical Heist Melody: Sonar Radar Pings + Urgent Staccato Cyber-Brass Riff
    const radarPing: Record<number, number> = {
      0: 1174.66, // D6 radar ping
      6: 1396.91, // F6
      10: 1318.51, // E6
      14: 1108.73, // C#6
    };
    if (radarPing[step]) {
      this.spawnBellTone(ctx, dest, t0, radarPing[step], stepDur * 1.6, 0.075 + tension * 0.055, 1.0);
    }

    const cyberRiff: Record<number, number> = {
      0: 293.66, // D4
      3: 349.23, // F4
      6: 329.63, // E4
      8: 293.66, // D4
      11: 440.0, // A4
      13: 392.0, // G4
      15: 466.16, // Bb4
    };
    if (cyberRiff[step] && (tension > 0.18 || step % 4 === 0)) {
      const synthF = ctx.createBiquadFilter();
      synthF.type = 'bandpass';
      synthF.frequency.setValueAtTime(900 + tension * 1800, t0);
      synthF.Q.setValueAtTime(1.5, t0);
      synthF.connect(dest);

      const sOsc = ctx.createOscillator();
      const sg = ctx.createGain();
      sOsc.type = 'square';
      sOsc.frequency.setValueAtTime(cyberRiff[step], t0);
      const sd = Math.min(0.22, stepDur * 1.1);
      sg.gain.setValueAtTime(0.0005, t0);
      sg.gain.linearRampToValueAtTime(0.085 + tension * 0.085, t0 + 0.01);
      sg.gain.exponentialRampToValueAtTime(0.0008, t0 + sd);
      sOsc.connect(sg);
      sg.connect(synthF);
      sOsc.start(t0);
      sOsc.stop(t0 + sd + 0.02);
    }

    // Electronic Kick (0, 6, 10), Sharp Industrial Snare (4, 12), & Escalating 16th Hi-Hats!
    if (step === 0 || step === 6 || step === 10 || (tension > 0.65 && step === 14)) {
      this.spawnTimpani(ctx, dest, t0, 128, 36, 0.34 + tension * 0.14);
    }
    if (step === 4 || step === 12 || (tension > 0.78 && step === 15)) {
      this.spawnNoiseBurst(ctx, dest, t0, 0.085, 'bandpass', 1850, 650, 0.9, 0.16 + tension * 0.12, 2.2);
    }
    if (step % 2 === 1 || tension > 0.35) {
      this.spawnNoiseBurst(
        ctx,
        dest,
        t0,
        0.028,
        'highpass',
        5200,
        7400,
        1.8,
        (step % 4 === 2 ? 0.075 : 0.04) * (0.6 + tension * 0.75),
        2.6
      );
    }
  }

  private spawnTimpani(
    ctx: AudioContext,
    dest: AudioNode,
    t0: number,
    startHz: number,
    endHz: number,
    peak: number
  ) {
    const timp = ctx.createOscillator();
    const tg = ctx.createGain();
    timp.type = 'sine';
    timp.frequency.setValueAtTime(startHz, t0);
    timp.frequency.exponentialRampToValueAtTime(Math.max(24, endHz), t0 + 0.16);
    tg.gain.setValueAtTime(0.0008, t0);
    tg.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    tg.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.17);
    timp.connect(tg);
    tg.connect(dest);
    timp.start(t0);
    timp.stop(t0 + 0.18);
  }

  private spawnStringSwell(
    ctx: AudioContext,
    dest: AudioNode,
    t0: number,
    melHz: number,
    dur: number,
    tension: number
  ) {
    const melStrength = Math.min(1, Math.max(0.05, (tension - 0.08) / 0.92));
    const strFilter = ctx.createBiquadFilter();
    strFilter.type = 'lowpass';
    strFilter.frequency.setValueAtTime(680 + melStrength * 1650, t0);
    strFilter.connect(dest);

    for (const detune of [-6, 6]) {
      const sOsc = ctx.createOscillator();
      const sg = ctx.createGain();
      sOsc.type = 'sawtooth';
      sOsc.frequency.setValueAtTime(melHz, t0);
      sOsc.detune.setValueAtTime(detune, t0);
      sg.gain.setValueAtTime(0.0005, t0);
      sg.gain.linearRampToValueAtTime(0.055 + melStrength * 0.085, t0 + Math.min(0.18, dur * 0.35));
      sg.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      sOsc.connect(sg);
      sg.connect(strFilter);
      sOsc.start(t0);
      sOsc.stop(t0 + dur + 0.02);
    }
  }

  private stopNormalMusicImmediate() {
    this.musicStepTimer = 0.04;
    this.musicStepIndex = 0;
    if (!this.normalMusicNodes) return;
    const nodes = this.normalMusicNodes;
    this.normalMusicNodes = null;
    try {
      nodes.master.disconnect();
    } catch {
      // Ignore already disconnected audio nodes
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
          const sameFloor = (p.floor ?? 0) === (listener.floor ?? 0);
          if (d < maxHearDist) {
            const closeness = 1 - d / maxHearDist;
            const floorAtten = sameFloor ? 1 : 0.25;
            const volume =
              (0.012 + Math.pow(closeness, 1.75) * 0.22) * (0.6 + speedRatio * 0.4) * floorAtten;
            const pan = Math.max(-0.85, Math.min(0.85, dx / 400));
            this.playFootstep(volume, pan, floorTheme, false);
          }
        }
      }
      this.stepCooldowns.set(p.id, cd);
    }
  }

  public updateAmbientCritters(dt: number, active: boolean) {
    if (!active || this.muted || dt <= 0) {
      if (!active) this.cricketTimer = 1.4;
      return;
    }
    this.cricketTimer -= dt;
    if (this.cricketTimer <= 0) {
      this.cricketTimer = 1.8 + Math.random() * 2.6;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const pan = (Math.random() - 0.5) * 1.4;
      const { node: out } = this.createOutputNode(ctx, { volume: 1.0, pan });
      const pulses = 3 + (Math.random() < 0.45 ? 1 : 0);
      const baseHz = 4150 + Math.random() * 480;
      const peak = 0.013 + Math.random() * 0.008;

      for (let i = 0; i < pulses; i++) {
        const t0 = now + i * 0.042;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseHz, t0);
        osc.frequency.exponentialRampToValueAtTime(baseHz * 0.96, t0 + 0.022);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.024);
        osc.connect(g);
        g.connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.028);
      }
    }
  }

  private playFootstep(volume: number, pan: number, floorTheme: FloorTheme, isSelf: boolean) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const reverbSend = this.getMansionReverbSend(ctx);

    const outNode: AudioNode =
      typeof ctx.createStereoPanner === 'function'
        ? (() => {
            const p = ctx.createStereoPanner();
            p.pan.setValueAtTime(pan, now);
            p.connect(ctx.destination);
            if (reverbSend) p.connect(reverbSend);
            return p;
          })()
        : (() => {
            if (!reverbSend) return ctx.destination;
            const g = ctx.createGain();
            g.gain.setValueAtTime(1, now);
            g.connect(ctx.destination);
            g.connect(reverbSend);
            return g;
          })();

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

  /** Distinct material bullet ricochet (wood, metal, stone, foliage, ice, monster) */
  public playBounce(
    opts?: SpatialAudioOpts,
    surface: 'wood' | 'metal' | 'stone' | 'foliage' | 'ice' | 'monster' | 'solid' = 'wood'
  ) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);
    const jitter = 0.9 + Math.random() * 0.2;
    const kind = surface === 'solid' ? 'wood' : surface;

    if (kind === 'metal') {
      // Sharp bright steel ping + metallic overtone ring
      this.spawnNoiseBurst(ctx, out, now, 0.024, 'bandpass', 4600, 1400, 1.8, 0.2, 2.5);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(3400 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(1550 * jitter, now + 0.11);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.115);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.12);

      const ping = ctx.createOscillator();
      const pingGain = ctx.createGain();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(4450 * jitter, now);
      pingGain.gain.setValueAtTime(0.055, now);
      pingGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.085);
      ping.connect(pingGain);
      pingGain.connect(out);
      ping.start(now);
      ping.stop(now + 0.09);
      return;
    }

    if (kind === 'stone') {
      // Crisp dry masonry clack + dense mineral thud
      this.spawnNoiseBurst(ctx, out, now, 0.032, 'bandpass', 2100, 750, 2.1, 0.24, 2.4);
      const clack = ctx.createOscillator();
      const g = ctx.createGain();
      clack.type = 'square';
      clack.frequency.setValueAtTime(640 * jitter, now);
      clack.frequency.exponentialRampToValueAtTime(210 * jitter, now + 0.055);
      g.gain.setValueAtTime(0.07, now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.06);
      clack.connect(g);
      g.connect(out);
      clack.start(now);
      clack.stop(now + 0.065);
      return;
    }

    if (kind === 'foliage') {
      // Muffled hedge/branch brush snap & soft leaf rustle
      this.spawnNoiseBurst(ctx, out, now, 0.055, 'bandpass', 1450, 620, 0.9, 0.2, 1.9);
      const thud = ctx.createOscillator();
      const g = ctx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(310 * jitter, now);
      thud.frequency.exponentialRampToValueAtTime(110 * jitter, now + 0.048);
      g.gain.setValueAtTime(0.095, now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.052);
      thud.connect(g);
      g.connect(out);
      thud.start(now);
      thud.stop(now + 0.055);
      return;
    }

    if (kind === 'ice') {
      // Crystalline glacier chime + crisp frost fracture zing
      this.spawnNoiseBurst(ctx, out, now, 0.03, 'highpass', 3600, 5200, 1.5, 0.14, 2.2);
      [2950, 4280].forEach((hz, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(hz * jitter, now);
        osc.frequency.exponentialRampToValueAtTime(hz * 0.78 * jitter, now + 0.11);
        g.gain.setValueAtTime(idx === 0 ? 0.09 : 0.045, now);
        g.gain.exponentialRampToValueAtTime(0.0008, now + 0.115);
        osc.connect(g);
        g.connect(out);
        osc.start(now);
        osc.stop(now + 0.12);
      });
      return;
    }

    if (kind === 'monster') {
      // Heavy armored flesh/bone deflect + eerie low slow resonance
      this.spawnNoiseBurst(ctx, out, now, 0.048, 'lowpass', 1200, 340, 1.4, 0.28, 2.2);
      const thump = ctx.createOscillator();
      const tg = ctx.createGain();
      thump.type = 'sawtooth';
      thump.frequency.setValueAtTime(420 * jitter, now);
      thump.frequency.exponentialRampToValueAtTime(135 * jitter, now + 0.13);
      tg.gain.setValueAtTime(0.11, now);
      tg.gain.exponentialRampToValueAtTime(0.0008, now + 0.135);
      thump.connect(tg);
      tg.connect(out);
      thump.start(now);
      thump.stop(now + 0.14);
      return;
    }

    // Default: Wood (resonant hollow timber knock + short dry crack)
    this.spawnNoiseBurst(ctx, out, now, 0.028, 'bandpass', 1650, 680, 1.7, 0.21, 2.4);
    const wood = ctx.createOscillator();
    const wg = ctx.createGain();
    wood.type = 'triangle';
    wood.frequency.setValueAtTime(920 * jitter, now);
    wood.frequency.exponentialRampToValueAtTime(340 * jitter, now + 0.055);
    wg.gain.setValueAtTime(0.12, now);
    wg.gain.exponentialRampToValueAtTime(0.0008, now + 0.06);
    wood.connect(wg);
    wg.connect(out);
    wood.start(now);
    wood.stop(now + 0.065);
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

  /**
   * Dramatic ramping orchestral cue for:
   * - BRAWL: rapid consecutive kills under 3s (2x..6x+)
   * - ELIMINATION (Last Standing): non-time-dependent kill progression (1=Kill, 2=Rampage, 3=Solo Ace Climax)
   * - PRACTICE / DODGE_PRACTICE: 10-step ramping progression for consecutive target hits / dodged waves (1x..10x+)
   */
  public playKillStreak(
    streak: number,
    mode: MatchMode | 'PRACTICE' | 'DODGE_PRACTICE' = 'BRAWL',
    closeDodge = false
  ) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const isPractice = mode === 'PRACTICE' || mode === 'DODGE_PRACTICE';
    const isDodge = mode === 'DODGE_PRACTICE';
    const practiceTier = isPractice ? Math.max(1, Math.min(10, streak)) : 0;
    const tier = isPractice
      ? 0.85 + ((practiceTier - 1) / 9) * 4.65 + (closeDodge ? 0.35 : 0)
      : mode === 'ELIMINATION'
        ? streak >= 3
          ? 5
          : streak === 2
            ? 3
            : 1
        : Math.max(1, Math.min(5, streak - 1)); // 1=2x, 2=3x, 3=4x, 4=5x, 5=6x+
    const { node: out } = this.createOutputNode(ctx, { volume: Math.min(1.16, 0.82 + tier * 0.058) });

    // 1. Orchestral Timpani Impact (+ dramatic double/triple pre-roll at higher streaks)
    const hitOffsets = isPractice
      ? practiceTier >= 7 || (isDodge && closeDodge && practiceTier >= 4)
        ? [0, 0.07, 0.14]
        : practiceTier >= 3
          ? [0, 0.08]
          : [0]
      : tier >= 4
        ? [0, 0.075, 0.15]
        : tier >= 2
          ? [0, 0.08]
          : [0];
    hitOffsets.forEach((offset, idx) => {
      const t0 = now + offset;
      const isMain = idx === hitOffsets.length - 1;
      const timp = ctx.createOscillator();
      const timpGain = ctx.createGain();
      timp.type = 'sine';
      const baseHz = 94 + tier * 4.4;
      timp.frequency.setValueAtTime(isMain ? baseHz : baseHz * 0.9, t0);
      timp.frequency.exponentialRampToValueAtTime(42, t0 + (isMain ? 0.36 : 0.14));
      const peak = (isMain ? 0.33 : 0.15) + tier * 0.024;
      timpGain.gain.setValueAtTime(0.001, t0);
      timpGain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
      timpGain.gain.exponentialRampToValueAtTime(0.0008, t0 + (isMain ? 0.38 : 0.16));
      timp.connect(timpGain);
      timpGain.connect(out);
      timp.start(t0);
      timp.stop(t0 + (isMain ? 0.4 : 0.17));

      // Mallet skin transient
      this.spawnNoiseBurst(
        ctx,
        out,
        t0,
        isMain ? 0.065 : 0.035,
        'lowpass',
        420 + tier * 65,
        110,
        1.1,
        isMain ? 0.15 : 0.08,
        1.8
      );
    });

    // 2. Symphonic String Ensemble Chord Swell (climbs in pitch & harmonic density with streak)
    const practiceChordVoicings: number[][] = [
      [261.63, 392.0, 523.25], // 1x: C4 - G4 - C5
      [293.66, 440.0, 587.33], // 2x: D4 - A4 - D5
      [329.63, 493.88, 659.25, 783.99], // 3x: E4 - B4 - E5 - G5
      [349.23, 523.25, 698.46, 880.0], // 4x: F4 - C5 - F5 - A5
      [392.0, 587.33, 783.99, 987.77], // 5x: G4 - D5 - G5 - B5
      [440.0, 659.25, 880.0, 1046.5], // 6x: A4 - E5 - A5 - C6
      [493.88, 739.99, 987.77, 1174.66], // 7x: B4 - F#5 - B5 - D6
      [523.25, 783.99, 1046.5, 1318.51], // 8x: C5 - G5 - C6 - E6
      [587.33, 880.0, 1174.66, 1479.98, 1760.0], // 9x: D5 - A5 - D6 - F#6 - A6
      [659.25, 987.77, 1318.51, 1661.22, 1975.53], // 10x+: E5 - B5 - E6 - G#6 - B6
    ];
    const chordVoicings: number[][] = [
      [293.66, 440.0, 587.33], // 2x: D4 - A4 - D5 (tense power fourth/fifth)
      [349.23, 523.25, 698.46, 880.0], // 3x: F4 - C5 - F5 - A5 (rising heroic swell)
      [440.0, 659.25, 880.0, 1046.5], // 4x: A4 - E5 - A5 - C6 (urgent dramatic climb)
      [523.25, 783.99, 1046.5, 1318.51], // 5x: C5 - G5 - C6 - E6 (triumphant climax)
      [587.33, 880.0, 1174.66, 1479.98, 1760.0], // 6x+: D5 - A5 - D6 - F#6 - A6
    ];
    const chord = isPractice
      ? practiceChordVoicings[practiceTier - 1]
      : chordVoicings[Math.max(0, Math.min(4, Math.round(tier) - 1))];

    const stringFilter = ctx.createBiquadFilter();
    stringFilter.type = 'lowpass';
    stringFilter.Q.setValueAtTime(1.4, now);
    stringFilter.frequency.setValueAtTime(340, now);
    stringFilter.frequency.exponentialRampToValueAtTime(2050 + tier * 540, now + 0.34);
    stringFilter.frequency.exponentialRampToValueAtTime(880, now + 0.85);
    stringFilter.connect(out);

    const swellDur = 0.68 + tier * 0.065;
    const detunes = [-7, 0, 7];
    for (const freq of chord) {
      for (const cents of detunes) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + 0.02);
        osc.detune.setValueAtTime(cents, now + 0.02);

        const voicePeak = (0.04 + tier * 0.0055) / chord.length;
        g.gain.setValueAtTime(0.0005, now + 0.02);
        g.gain.linearRampToValueAtTime(voicePeak, now + 0.16);
        g.gain.exponentialRampToValueAtTime(0.0005, now + swellDur);

        osc.connect(g);
        g.connect(stringFilter);
        osc.start(now + 0.02);
        osc.stop(now + swellDur + 0.02);
      }
    }

    // 3. Heroic Brass / French Horn Fanfare Motif
    const hornFilter = ctx.createBiquadFilter();
    hornFilter.type = 'bandpass';
    hornFilter.Q.setValueAtTime(1.1, now);
    hornFilter.frequency.setValueAtTime(680, now + 0.04);
    hornFilter.frequency.exponentialRampToValueAtTime(1550 + tier * 260, now + 0.35);
    hornFilter.connect(out);

    const root = chord[0] * 0.5;
    const fifth = chord[1] * 0.5;
    const thirdOrOctave = (chord[3] ?? chord[2]) * 0.5;
    const fanfareNotes = isPractice
      ? practiceTier >= 8
        ? [
            { f: root, t: 0.03, d: 0.15 },
            { f: fifth, t: 0.13, d: 0.16 },
            { f: root * 2, t: 0.24, d: 0.2 },
            { f: thirdOrOctave * 2, t: 0.38, d: 0.46 },
          ]
        : practiceTier >= 4
          ? [
              { f: root, t: 0.04, d: 0.17 },
              { f: fifth, t: 0.15, d: 0.21 },
              { f: root * 2, t: 0.28, d: 0.45 },
            ]
          : [
              { f: root, t: 0.04, d: 0.18 },
              { f: fifth, t: 0.17, d: 0.38 },
            ]
      : tier >= 3
        ? [
            { f: root, t: 0.04, d: 0.18 },
            { f: fifth, t: 0.16, d: 0.22 },
            { f: root * 2, t: 0.3, d: 0.48 },
          ]
        : [
            { f: root, t: 0.04, d: 0.2 },
            { f: fifth, t: 0.19, d: 0.42 },
          ];

    for (const note of fanfareNotes) {
      const t0 = now + note.t;
      const hornA = ctx.createOscillator();
      const hornB = ctx.createOscillator();
      const hg = ctx.createGain();
      hornA.type = 'sawtooth';
      hornB.type = 'triangle';
      hornA.frequency.setValueAtTime(note.f, t0);
      hornB.frequency.setValueAtTime(note.f * 1.003, t0);
      const hornPeak = 0.09 + tier * 0.014;
      hg.gain.setValueAtTime(0.0008, t0);
      hg.gain.linearRampToValueAtTime(hornPeak, t0 + 0.035);
      hg.gain.exponentialRampToValueAtTime(0.0008, t0 + note.d);

      hornA.connect(hg);
      hornB.connect(hg);
      hg.connect(hornFilter);
      hornA.start(t0);
      hornB.start(t0);
      hornA.stop(t0 + note.d + 0.02);
      hornB.stop(t0 + note.d + 0.02);
    }

    // Extra crisp celesta/bell arpeggio glint on Close Dodge!
    if (isDodge && closeDodge) {
      const glintNotes = [chord[1] * 2, (chord[2] ?? chord[1]) * 2];
      glintNotes.forEach((hz, gi) => {
        const gt = now + 0.08 + gi * 0.075;
        const bell = ctx.createOscillator();
        const bg = ctx.createGain();
        bell.type = 'triangle';
        bell.frequency.setValueAtTime(hz, gt);
        bg.gain.setValueAtTime(0.0006, gt);
        bg.gain.linearRampToValueAtTime(0.095, gt + 0.01);
        bg.gain.exponentialRampToValueAtTime(0.0006, gt + 0.28);
        bell.connect(bg);
        bg.connect(out);
        bell.start(gt);
        bell.stop(gt + 0.3);
      });
    }

    // 4. Orchestral Suspended Cymbal Shimmer (scales sharply with streak tension)
    this.spawnNoiseBurst(
      ctx,
      out,
      now + (tier >= 3 ? 0.12 : 0.06),
      0.38 + tier * 0.09,
      'highpass',
      3100,
      5400,
      1.1,
      0.055 + tier * 0.026,
      1.4
    );
  }

  /** Funny cartoon blunder cue when a player kills themself with their own bullet */
  public playSelfKill() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, { volume: 1.0 });

    // 1. Rubbery spring "BOING!" bounce
    const boing = ctx.createOscillator();
    const boingG = ctx.createGain();
    boing.type = 'sine';
    boing.frequency.setValueAtTime(240, now);
    boing.frequency.exponentialRampToValueAtTime(590, now + 0.075);
    boing.frequency.exponentialRampToValueAtTime(210, now + 0.18);
    boingG.gain.setValueAtTime(0.001, now);
    boingG.gain.linearRampToValueAtTime(0.24, now + 0.012);
    boingG.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    boing.connect(boingG);
    boingG.connect(out);
    boing.start(now);
    boing.stop(now + 0.2);

    // 2. Comical sad-trombone "Wah-Wah-Waaah" descending steps + droop
    const wahNotes = [
      { f0: 311.13, f1: 293.66, t: 0.14, d: 0.17 },
      { f0: 293.66, f1: 277.18, t: 0.32, d: 0.17 },
      { f0: 277.18, f1: 261.63, t: 0.5, d: 0.17 },
      { f0: 261.63, f1: 185.0, t: 0.68, d: 0.52 },
    ];
    for (const w of wahNotes) {
      const t0 = now + w.t;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(980, t0);
      filter.frequency.exponentialRampToValueAtTime(420, t0 + w.d);
      filter.Q.setValueAtTime(1.9, t0);
      filter.connect(out);

      const osc = ctx.createOscillator();
      const wg = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(w.f0, t0);
      osc.frequency.exponentialRampToValueAtTime(w.f1, t0 + w.d);
      wg.gain.setValueAtTime(0.001, t0);
      wg.gain.linearRampToValueAtTime(0.18, t0 + 0.025);
      wg.gain.exponentialRampToValueAtTime(0.001, t0 + w.d);
      osc.connect(wg);
      wg.connect(filter);
      osc.start(t0);
      osc.stop(t0 + w.d + 0.02);
    }

    // 3. Tiny comedic slide-whistle droop at the very start
    const whistle = ctx.createOscillator();
    const whistleG = ctx.createGain();
    whistle.type = 'triangle';
    whistle.frequency.setValueAtTime(1180, now + 0.02);
    whistle.frequency.exponentialRampToValueAtTime(340, now + 0.24);
    whistleG.gain.setValueAtTime(0.001, now + 0.02);
    whistleG.gain.linearRampToValueAtTime(0.085, now + 0.04);
    whistleG.gain.exponentialRampToValueAtTime(0.0008, now + 0.25);
    whistle.connect(whistleG);
    whistleG.connect(out);
    whistle.start(now + 0.02);
    whistle.stop(now + 0.26);
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

  // ==================== THE LIBRARY AUDIO ASSETS & SCARY SFX ====================

  private static readonly LIBRARY_AUDIO_URLS = {
    unhinged: '/assets/aistudio/03._Unhinged_02544cf6.mp3',
    step: '/assets/aistudio/figure-footstep-1-_doors_-made-with-Voicemod_ed473e71.mp3',
    roar: '/assets/aistudio/figure-roar-sound-roblox-doors_ab8d6800.mp3',
    jumpscare: '/assets/aistudio/doors-figure-jumpscare-sound-effect-made-with-Voicemod_74ffc718.mp3',
  } as const;

  public preloadLibraryAudio() {
    if (typeof window === 'undefined') return;
    if (!this.libraryPreloadStarted) {
      this.libraryPreloadStarted = true;
      for (const [key, url] of Object.entries(SoundEngine.LIBRARY_AUDIO_URLS)) {
        fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.arrayBuffer();
          })
          .then((buf) => {
            this.libraryRawCache.set(key, buf);
            this.decodeCachedTrack(key as keyof typeof SoundEngine.LIBRARY_AUDIO_URLS);
          })
          .catch(() => {
            // Ignore offline fetch failures silently
          });
      }
    } else {
      for (const key of Object.keys(SoundEngine.LIBRARY_AUDIO_URLS)) {
        this.decodeCachedTrack(key as keyof typeof SoundEngine.LIBRARY_AUDIO_URLS);
      }
    }
  }

  private decodeCachedTrack(key: keyof typeof SoundEngine.LIBRARY_AUDIO_URLS) {
    if (key === 'unhinged' && this.libraryMusicBuffer) return;
    if (key === 'step' && this.monsterStepBuffer) return;
    if (key === 'roar' && this.monsterRoarBuffer) return;
    if (key === 'jumpscare' && this.monsterJumpscareBuffer) return;

    const raw = this.libraryRawCache.get(key);
    if (!raw || this.libraryDecodeInFlight.has(key)) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;

    this.libraryDecodeInFlight.add(key);
    ctx
      .decodeAudioData(raw.slice(0))
      .then((decoded) => {
        if (key === 'unhinged') {
          this.libraryMusicBuffer = decoded;
          if (this.libraryMusicActive && !this.muted && this.musicEnabled) {
            this.updateLibraryMusic(0, true, this.libraryMusicProgress, this.libraryMusicInRage);
          }
        } else if (key === 'step') {
          this.monsterStepBuffer = decoded;
        } else if (key === 'roar') {
          this.monsterRoarBuffer = decoded;
        } else if (key === 'jumpscare') {
          this.monsterJumpscareBuffer = decoded;
        }
      })
      .catch(() => {})
      .finally(() => {
        this.libraryDecodeInFlight.delete(key);
      });
  }

  /**
   * Loops & ramps DOORS "Unhinged" (03._Unhinged_02544cf6.mp3) cleanly with book progress (0..1)
   * and Monster Rage state. Plays atmospheric intro once, then loops main pulsing body seamlessly.
   */
  public updateLibraryMusic(_dt: number, active: boolean, progressRaw: number, inRage: boolean) {
    this.libraryMusicActive = active;
    const progress = Math.max(0, Math.min(1, progressRaw));
    this.libraryMusicProgress = progress;
    this.libraryMusicInRage = inRage;

    if (!active || this.muted || !this.musicEnabled) {
      this.stopLibraryMusicImmediate();
      return;
    }

    this.preloadLibraryAudio();
    if (!this.libraryMusicBuffer) {
      return;
    }

    const ctx = this.ensureCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const targetRate = 0.98 + progress * 0.18 + (inRage ? 0.05 : 0);
    const targetCutoff = 2400 + progress * 15500 + (inRage ? 2800 : 0);
    const targetGain = 0.30 + progress * 0.28 + (inRage ? 0.12 : 0);

    if (!this.libraryMusicNodes) {
      const source = ctx.createBufferSource();
      source.buffer = this.libraryMusicBuffer;
      source.loop = true;
      // Start at 0s (eerie whoosh intro), then seamlessly loop main pulsing body (~7.18s -> ~174.8s)
      if (this.libraryMusicBuffer.duration > 30) {
        source.loopStart = 7.18;
        source.loopEnd = Math.min(this.libraryMusicBuffer.duration - 0.1, 174.8);
      }
      source.playbackRate.setValueAtTime(targetRate, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(targetCutoff, now);
      filter.Q.setValueAtTime(0.85, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0008, now);
      gain.gain.linearRampToValueAtTime(targetGain, now + 0.55);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(now, 0);

      this.libraryMusicNodes = { source, filter, gain };
    } else {
      this.libraryMusicNodes.source.playbackRate.setTargetAtTime(targetRate, now, 0.35);
      this.libraryMusicNodes.filter.frequency.setTargetAtTime(targetCutoff, now, 0.35);
      this.libraryMusicNodes.gain.gain.setTargetAtTime(targetGain, now, 0.3);
    }
  }

  private stopLibraryMusicImmediate() {
    if (!this.libraryMusicNodes) return;
    const nodes = this.libraryMusicNodes;
    this.libraryMusicNodes = null;
    try {
      nodes.source.stop();
      nodes.gain.disconnect();
    } catch {
      // Ignore already stopped buffer source
    }
  }

  // ==================== EMERALD GROVE & WOODEN MANSION SEAMLESS MUSIC ====================

  private static readonly IMMERSIVE_TRACK_URLS: Record<
    'grass_outdoors' | 'mansion_stage1' | 'mansion_final',
    string
  > = {
    grass_outdoors: '/assets/aistudio/01._The_Great_Outdoors_fe2d151f.mp3',
    mansion_stage1: '/assets/aistudio/sonican-tense-orchestral-loop-sneaky-mystery-269059_3bb798ee.mp3',
    mansion_final: '/assets/aistudio/sonican-enchanted-pizzicato-sneaky-mystery-loop-289640_l2v1KCzK_6790cb26.mp3',
  };

  private static createEqualPowerFadeIn(steps = 64): Float32Array {
    const arr = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      arr[i] = Math.sin((i / (steps - 1)) * Math.PI * 0.5);
    }
    return arr;
  }

  private static createEqualPowerFadeOut(steps = 64): Float32Array {
    const arr = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      arr[i] = Math.cos((i / (steps - 1)) * Math.PI * 0.5);
    }
    return arr;
  }

  private static readonly EQ_FADE_IN = SoundEngine.createEqualPowerFadeIn(64);
  private static readonly EQ_FADE_OUT = SoundEngine.createEqualPowerFadeOut(64);

  private static detectAudioTrimBounds(buffer: AudioBuffer, threshold = 0.0028): { start: number; end: number } {
    const sr = buffer.sampleRate;
    const len = buffer.length;
    const chCount = buffer.numberOfChannels;
    let firstIdx = 0;
    let lastIdx = len - 1;

    outerStart: for (let i = 0; i < len; i += 4) {
      for (let ch = 0; ch < chCount; ch++) {
        if (Math.abs(buffer.getChannelData(ch)[i]) > threshold) {
          firstIdx = Math.max(0, i - Math.floor(sr * 0.006));
          break outerStart;
        }
      }
    }

    outerEnd: for (let i = len - 1; i >= firstIdx; i -= 4) {
      for (let ch = 0; ch < chCount; ch++) {
        if (Math.abs(buffer.getChannelData(ch)[i]) > threshold) {
          lastIdx = Math.min(len - 1, i + Math.floor(sr * 0.006));
          break outerEnd;
        }
      }
    }

    const start = firstIdx / sr;
    const end = Math.max(start + 1.5, lastIdx / sr);
    return { start, end: Math.min(buffer.duration, end) };
  }

  public preloadImmersiveTrack(theme: FloorTheme) {
    if (theme !== 'grass_outdoors' && theme !== 'mansion_wood') return;
    if (typeof window === 'undefined') return;

    const keys: Array<'grass_outdoors' | 'mansion_stage1' | 'mansion_final'> =
      theme === 'grass_outdoors' ? ['grass_outdoors'] : ['mansion_stage1', 'mansion_final'];

    for (const trackKey of keys) {
      if (!this.immersiveTrackRaw.has(trackKey) && !this.immersiveTrackLoading.has(trackKey)) {
        this.immersiveTrackLoading.add(trackKey);
        fetch(SoundEngine.IMMERSIVE_TRACK_URLS[trackKey])
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.arrayBuffer();
          })
          .then((buf) => {
            this.immersiveTrackRaw.set(trackKey, buf);
            this.decodeImmersiveTrackKey(trackKey);
          })
          .catch(() => {})
          .finally(() => {
            this.immersiveTrackLoading.delete(trackKey);
          });
      } else {
        this.decodeImmersiveTrackKey(trackKey);
      }
    }
  }

  private decodeImmersiveTrackKey(trackKey: 'grass_outdoors' | 'mansion_stage1' | 'mansion_final') {
    if (this.immersiveTrackBuffers.has(trackKey)) return;
    const raw = this.immersiveTrackRaw.get(trackKey);
    if (!raw || this.immersiveTrackDecoding.has(trackKey)) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;

    this.immersiveTrackDecoding.add(trackKey);
    ctx
      .decodeAudioData(raw.slice(0))
      .then((decoded) => {
        this.immersiveTrackBuffers.set(trackKey, decoded);
        this.immersiveTrackBounds.set(trackKey, SoundEngine.detectAudioTrimBounds(decoded));
        if (
          this.immersiveMapMusicActive &&
          this.immersiveMapMusicTheme &&
          !this.muted &&
          this.musicEnabled
        ) {
          this.updateImmersiveMapMusic(
            0,
            true,
            this.immersiveMapMusicTheme,
            this.immersiveMapMusicProgress,
            this.immersiveMapMusicFinalStage
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        this.immersiveTrackDecoding.delete(trackKey);
      });
  }

  private spawnSeamGlueChord(
    ctx: AudioContext,
    dest: AudioNode,
    handoffTime: number,
    dur: number,
    isFinal: boolean
  ) {
    // Soft chamber string/harp pedal swelling smoothly over the seam to mask any loop cut
    const notes = isFinal ? [293.66, 440.0, 523.25] : [146.83, 220.0, 293.66];
    const peak = isFinal ? 0.032 : 0.026;
    const mid = handoffTime + dur * 0.45;
    for (const hz of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(hz, handoffTime);
      g.gain.setValueAtTime(0.0001, handoffTime);
      g.gain.linearRampToValueAtTime(peak, mid);
      g.gain.exponentialRampToValueAtTime(0.0001, handoffTime + dur);
      osc.connect(g);
      g.connect(dest);
      osc.start(handoffTime);
      osc.stop(handoffTime + dur + 0.04);
    }
  }

  private spawnTrackSegmentSource(
    ctx: AudioContext,
    buffer: AudioBuffer,
    nodes: NonNullable<SoundEngine['immersiveTrackNodes']>,
    startAtCtxTime: number,
    bufferOffset: number,
    segEnd: number,
    fadeInDur: number,
    rate: number
  ): { source: AudioBufferSourceNode; gain: GainNode } {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(rate, startAtCtxTime);

    const g = ctx.createGain();
    if (fadeInDur > 0.015) {
      g.gain.setValueAtTime(0.0001, startAtCtxTime);
      g.gain.setValueCurveAtTime(SoundEngine.EQ_FADE_IN, startAtCtxTime, fadeInDur);
    } else {
      g.gain.setValueAtTime(1, startAtCtxTime);
    }

    source.connect(g);
    g.connect(nodes.filter);
    nodes.activeSources.add(source);
    source.onended = () => {
      nodes.activeSources.delete(source);
      try {
        source.disconnect();
        g.disconnect();
      } catch {
        // Ignore already cleaned nodes
      }
    };

    const maxPlayLen = Math.max(0.25, buffer.duration - Math.max(0, bufferOffset));
    const playLen = Math.min(maxPlayLen, segEnd - Math.max(0, bufferOffset) + 1.8);
    source.start(startAtCtxTime, Math.max(0, bufferOffset), playLen);
    return { source, gain: g };
  }

  /**
   * Seamless looping soundtrack:
   * - Emerald Grove: starts from 0.00s, loops 12.0s..36.0s, crossfades into 37.74s..64.65s at climax.
   * - Wooden Mansion:
   *   Stages 1–3: Loops entire trimmed Track 1, starts softer & ramps volume + speed up to ~1.44x.
   *   Final Stage: Crossfades smoothly into Track 2 starting directly at 1.50x speed and louder, with seamless loop crossfading + subtle string seam glue.
   */
  public updateImmersiveMapMusic(
    dt: number,
    active: boolean,
    theme: FloorTheme,
    progressRaw: number,
    finalStage: boolean
  ) {
    if (theme !== 'grass_outdoors' && theme !== 'mansion_wood') {
      this.immersiveMapMusicActive = false;
      this.immersiveMapMusicTheme = null;
      this.stopImmersiveMapMusicImmediate();
      return;
    }

    this.immersiveMapMusicActive = active;
    this.immersiveMapMusicTheme = theme;
    const progress = Math.max(0, Math.min(1, progressRaw));
    this.immersiveMapMusicProgress = progress;
    this.immersiveMapMusicFinalStage = finalStage;

    if (!active || this.muted || !this.musicEnabled) {
      this.stopImmersiveMapMusicImmediate();
      return;
    }

    this.preloadImmersiveTrack(theme);
    const desiredTrackKey: 'grass_outdoors' | 'mansion_stage1' | 'mansion_final' =
      theme === 'grass_outdoors' ? 'grass_outdoors' : finalStage ? 'mansion_final' : 'mansion_stage1';

    const buffer =
      this.immersiveTrackBuffers.get(desiredTrackKey) ??
      (theme === 'mansion_wood' ? this.immersiveTrackBuffers.get('mansion_stage1') : undefined);
    if (!buffer) return;

    const ctx = this.ensureCtx();
    if (!ctx) return;

    if (this.immersiveTrackNodes && this.immersiveTrackNodes.theme !== theme) {
      this.stopImmersiveMapMusicImmediate();
    }

    const now = ctx.currentTime;
    const getMixParams = (tKey: 'grass_outdoors' | 'mansion_stage1' | 'mansion_final', prog: number, isFinal: boolean) => {
      if (tKey === 'grass_outdoors') {
        return {
          targetRate: 1.0 + prog * 0.045 + (isFinal ? 0.015 : 0),
          targetCutoff: 3400 + prog * 14500 + (isFinal ? 2200 : 0),
          targetGain: 0.30 + prog * 0.20 + (isFinal ? 0.06 : 0),
        };
      }
      if (tKey === 'mansion_final') {
        return {
          targetRate: 1.50 + Math.max(0, prog - 0.65) * 0.14,
          targetCutoff: 9500 + prog * 9500,
          targetGain: 0.50 + prog * 0.10,
        };
      }
      // Wooden Mansion Stages 1–3: start softer than normal & ramp cleanly to ~1.44x (<1.5x) before Final Stage!
      const stageFrac = Math.min(1, prog / 0.66);
      return {
        targetRate: 1.0 + stageFrac * 0.44,
        targetCutoff: 3400 + stageFrac * 12500,
        targetGain: 0.16 + stageFrac * 0.28,
      };
    };

    const getSegmentBounds = (
      tKey: 'grass_outdoors' | 'mansion_stage1' | 'mansion_final',
      buf: AudioBuffer,
      stageNum: 1 | 2
    ) => {
      if (tKey === 'grass_outdoors') {
        const s1 = { start: 12.0, end: Math.min(buf.duration - 0.15, 36.0), loopXfade: 1.25 };
        const s2 = { start: 37.74, end: Math.min(buf.duration - 0.15, 64.65), loopXfade: 1.25 };
        return stageNum === 2 ? s2 : s1;
      }
      const trim = this.immersiveTrackBounds.get(tKey) ?? { start: 0.02, end: buf.duration - 0.04 };
      const span = Math.max(1.2, trim.end - trim.start);
      return {
        start: trim.start,
        end: trim.end,
        loopXfade: Math.min(0.68, span * 0.16),
      };
    };

    const activeTrackKey = this.immersiveTrackNodes?.trackKey ?? desiredTrackKey;
    const { targetRate, targetCutoff, targetGain } = getMixParams(activeTrackKey, progress, finalStage);

    if (!this.immersiveTrackNodes) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(targetCutoff, now);
      filter.Q.setValueAtTime(0.75, now);

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0005, now);
      master.gain.linearRampToValueAtTime(targetGain, now + 0.45);
      filter.connect(master);
      master.connect(ctx.destination);

      const initialStage: 1 | 2 = finalStage ? 2 : 1;
      const seg = getSegmentBounds(desiredTrackKey, buffer, initialStage);
      const initialStart = desiredTrackKey === 'grass_outdoors' && initialStage === 1 ? 0.0 : seg.start;

      const nodes: NonNullable<SoundEngine['immersiveTrackNodes']> = {
        theme,
        trackKey: desiredTrackKey,
        stage: initialStage,
        filter,
        master,
        activeSources: new Set(),
        currentSource: null,
        currentGain: null,
        estOffset: initialStart,
        lastCtxTime: now,
        currentRate: targetRate,
        scheduledHandoffAt: 0,
      };
      const spawned = this.spawnTrackSegmentSource(
        ctx,
        buffer,
        nodes,
        now,
        initialStart,
        seg.end,
        initialStage === 2 ? 0.9 : 0.06,
        targetRate
      );
      nodes.currentSource = spawned.source;
      nodes.currentGain = spawned.gain;
      this.immersiveTrackNodes = nodes;
      return;
    }

    const nodes = this.immersiveTrackNodes;
    const elapsedCtx = Math.max(0, now - nodes.lastCtxTime);
    nodes.lastCtxTime = now;
    if (elapsedCtx > 0) {
      nodes.estOffset += elapsedCtx * nodes.currentRate;
    } else if (dt > 0) {
      nodes.estOffset += dt * nodes.currentRate;
    }

    // Smoothly crossfade Stage 1 -> Stage 2 when Final Stage hits (and Track 2 is decoded!)
    if (nodes.stage === 1 && finalStage) {
      const finalBuf =
        theme === 'mansion_wood' ? this.immersiveTrackBuffers.get('mansion_final') : buffer;
      if (finalBuf) {
        const nextTrackKey: 'grass_outdoors' | 'mansion_stage1' | 'mansion_final' =
          theme === 'mansion_wood' ? 'mansion_final' : 'grass_outdoors';
        const nextMix = getMixParams(nextTrackKey, progress, true);
        const stage2Seg = getSegmentBounds(nextTrackKey, finalBuf, 2);
        const xfadeDur = theme === 'mansion_wood' ? 1.1 : 1.45;

        nodes.filter.frequency.setTargetAtTime(nextMix.targetCutoff, now, 0.25);
        nodes.master.gain.setTargetAtTime(nextMix.targetGain, now, 0.22);

        if (nodes.currentGain && nodes.currentSource) {
          try {
            nodes.currentGain.gain.cancelScheduledValues(now);
            nodes.currentGain.gain.setValueCurveAtTime(SoundEngine.EQ_FADE_OUT, now, xfadeDur);
            nodes.currentSource.stop(now + xfadeDur + 0.08);
          } catch {
            // Ignore already stopped source
          }
        }
        const next = this.spawnTrackSegmentSource(
          ctx,
          finalBuf,
          nodes,
          now,
          stage2Seg.start,
          stage2Seg.end,
          xfadeDur,
          nextMix.targetRate
        );
        if (theme === 'mansion_wood') {
          this.spawnSeamGlueChord(ctx, nodes.filter, now, xfadeDur + 0.5, true);
        }
        nodes.stage = 2;
        nodes.trackKey = nextTrackKey;
        nodes.currentSource = next.source;
        nodes.currentGain = next.gain;
        nodes.estOffset = stage2Seg.start;
        nodes.currentRate = nextMix.targetRate;
        nodes.scheduledHandoffAt = 0;
        return;
      }
    }

    nodes.filter.frequency.setTargetAtTime(targetCutoff, now, 0.3);
    nodes.master.gain.setTargetAtTime(targetGain, now, 0.25);

    if (nodes.currentSource) {
      nodes.currentSource.playbackRate.setTargetAtTime(targetRate, now, 0.2);
    }
    nodes.currentRate += (targetRate - nodes.currentRate) * (1 - Math.exp(-Math.max(0.016, elapsedCtx) * 5));

    const activeBuf = this.immersiveTrackBuffers.get(nodes.trackKey);
    if (!activeBuf) return;

    const activeSeg = getSegmentBounds(nodes.trackKey, activeBuf, nodes.stage);
    const loopXfade = activeSeg.loopXfade;

    // Schedule seamless overlap crossfade right before segment boundary using exact AudioContext clock!
    if (now >= nodes.scheduledHandoffAt && nodes.estOffset >= activeSeg.end - loopXfade - 0.35) {
      const remBuffer = Math.max(0.01, activeSeg.end - loopXfade - nodes.estOffset);
      const handoff = now + remBuffer / Math.max(0.5, nodes.currentRate);

      if (nodes.currentGain && nodes.currentSource) {
        try {
          nodes.currentGain.gain.setValueCurveAtTime(SoundEngine.EQ_FADE_OUT, handoff, loopXfade);
          nodes.currentSource.stop(handoff + loopXfade + 0.08);
        } catch {
          // Ignore scheduling races
        }
      }

      const next = this.spawnTrackSegmentSource(
        ctx,
        activeBuf,
        nodes,
        handoff,
        activeSeg.start,
        activeSeg.end,
        loopXfade,
        targetRate
      );
      if (theme === 'mansion_wood') {
        this.spawnSeamGlueChord(ctx, nodes.filter, Math.max(now, handoff - 0.22), loopXfade + 0.65, nodes.stage === 2);
      }
      nodes.currentSource = next.source;
      nodes.currentGain = next.gain;
      nodes.estOffset = activeSeg.start - remBuffer;
      nodes.scheduledHandoffAt = handoff + 0.15;
    }
  }

  private stopImmersiveMapMusicImmediate() {
    if (!this.immersiveTrackNodes) return;
    const nodes = this.immersiveTrackNodes;
    this.immersiveTrackNodes = null;
    for (const src of nodes.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped source
      }
    }
    nodes.activeSources.clear();
    try {
      nodes.filter.disconnect();
      nodes.master.disconnect();
    } catch {
      // Ignore already disconnected graph
    }
  }

  /** Crisp parchment page turn + wooden tome snap + mysterious chime on Book Collect */
  public playBookCollect(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);

    this.spawnNoiseBurst(ctx, out, now, 0.075, 'bandpass', 2400, 1100, 1.4, 0.24, 2.0);
    const snap = ctx.createOscillator();
    const sg = ctx.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(210, now + 0.045);
    snap.frequency.exponentialRampToValueAtTime(72, now + 0.11);
    sg.gain.setValueAtTime(0.18, now + 0.045);
    sg.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);
    snap.connect(sg);
    sg.connect(out);
    snap.start(now + 0.045);
    snap.stop(now + 0.13);

    [659.25, 830.61, 987.77].forEach((freq, idx) => {
      const t0 = now + 0.06 + idx * 0.045;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0008, t0);
      g.gain.linearRampToValueAtTime(0.085, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.28);
      osc.connect(g);
      g.connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  }

  /** Isolate Figure jumpscare kill audio by halting any overlapping footstep thuds briefly */
  public silenceMonsterSteps(ms = 1400) {
    this.monsterStepSilenceUntil = Math.max(
      this.monsterStepSilenceUntil,
      performance.now() + ms
    );
    for (const src of this.activeStepSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already finished sources
      }
    }
    this.activeStepSources.clear();
    for (const osc of this.activeStepOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Ignore already finished oscillators
      }
    }
    this.activeStepOscs.clear();
  }

  /** Heavy monstrous Figure footstep using uploaded DOORS thud + chest-shaking sub-bass weight */
  public playMonsterStep(opts?: SpatialAudioOpts, rage = false) {
    if (performance.now() < this.monsterStepSilenceUntil) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.preloadLibraryAudio();
    const now = ctx.currentTime;
    const stepVol = Math.max(0.04, Math.min(1.45, (opts?.volume ?? 1) * (rage ? 1.32 : 1.05)));
    const { node: out } = this.createOutputNode(ctx, { volume: stepVol, pan: opts?.pan ?? 0 });
    const jitter = 0.94 + Math.random() * 0.12;

    if (this.monsterStepBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.monsterStepBuffer;
      // Slow & ultra heavy in Calm mode, frantic heavy slam in Rage mode
      src.playbackRate.setValueAtTime((rage ? 1.14 : 0.88) * jitter, now);

      const bassBoost = ctx.createBiquadFilter();
      bassBoost.type = 'lowshelf';
      bassBoost.frequency.setValueAtTime(160, now);
      bassBoost.gain.setValueAtTime(rage ? 8.5 : 6.5, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(rage ? 1.18 : 0.96, now);

      src.connect(bassBoost);
      bassBoost.connect(gain);
      gain.connect(out);
      this.activeStepSources.add(src);
      src.onended = () => {
        this.activeStepSources.delete(src);
      };
      src.start(now);
    }

    // Physical sub-bass floor tremor layer so every step feels massive & terrifying when close
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime((rage ? 68 : 54) * jitter, now);
    sub.frequency.exponentialRampToValueAtTime(21, now + (rage ? 0.18 : 0.24));
    sg.gain.setValueAtTime(0.001, now);
    sg.gain.linearRampToValueAtTime(rage ? 0.42 : 0.34, now + 0.008);
    sg.gain.exponentialRampToValueAtTime(0.0008, now + (rage ? 0.2 : 0.26));
    sub.connect(sg);
    sg.connect(out);
    this.activeStepOscs.add(sub);
    sub.onended = () => {
      this.activeStepOscs.delete(sub);
    };
    sub.start(now);
    sub.stop(now + 0.27);
  }

  /** Real uploaded DOORS Figure terrifying roar when entering Rage mode */
  public playMonsterRoar(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.preloadLibraryAudio();
    const now = ctx.currentTime;
    const roarVol = Math.max(0.08, Math.min(1.4, (opts?.volume ?? 1) * 1.15));
    const { node: out } = this.createOutputNode(ctx, {
      volume: roarVol,
      pan: opts?.pan ?? 0,
    });

    if (this.activeRoarSource) {
      try {
        this.activeRoarSource.stop();
      } catch {
        // Ignore already finished source
      }
      this.activeRoarSource = null;
    }

    if (this.monsterRoarBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.monsterRoarBuffer;
      src.playbackRate.setValueAtTime(1.0 + Math.random() * 0.05, now);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(1.05, now + 0.05);
      g.gain.setValueAtTime(1.05, now + Math.max(0.1, this.monsterRoarBuffer.duration - 0.5));
      g.gain.exponentialRampToValueAtTime(0.001, now + this.monsterRoarBuffer.duration);

      src.connect(g);
      g.connect(out);
      src.start(now, 0.04);
      this.activeRoarSource = src;
      src.onended = () => {
        if (this.activeRoarSource === src) this.activeRoarSource = null;
      };
      return;
    }

    // Fallback roar if still decoding on ultra-slow connection
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'bandpass';
    roarFilter.frequency.setValueAtTime(640, now);
    roarFilter.frequency.exponentialRampToValueAtTime(190, now + 0.95);
    roarFilter.Q.setValueAtTime(2.4, now);
    roarFilter.connect(out);

    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.95);
    og.gain.setValueAtTime(0.001, now);
    og.gain.linearRampToValueAtTime(0.32, now + 0.07);
    og.gain.exponentialRampToValueAtTime(0.0008, now + 0.96);
    osc.connect(og);
    og.connect(roarFilter);
    osc.start(now);
    osc.stop(now + 0.98);
  }

  /** Terrifying Figure jumpscare sound when catching and killing the local player */
  public playMonsterJumpscare() {
    this.silenceMonsterSteps(1400);
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.preloadLibraryAudio();
    const now = ctx.currentTime;

    if (this.activeRoarSource) {
      try {
        this.activeRoarSource.stop();
      } catch {
        // Ignore
      }
      this.activeRoarSource = null;
    }

    if (this.monsterJumpscareBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.monsterJumpscareBuffer;
      src.playbackRate.setValueAtTime(1.0, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.95, now);

      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(now, 0);
      return;
    }

    // Emergency fallback shriek + bass slam
    this.playMonsterRoar({ volume: 1.25 });
  }

  /** Heavy blast stun recoil + groggy descending Figure groan */
  public playMonsterStun(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);

    const groan = ctx.createOscillator();
    const g = ctx.createGain();
    groan.type = 'sawtooth';
    groan.frequency.setValueAtTime(140, now);
    groan.frequency.exponentialRampToValueAtTime(42, now + 0.65);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.65);

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.26, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.68);
    groan.connect(filter);
    filter.connect(g);
    g.connect(out);
    groan.start(now);
    groan.stop(now + 0.7);
  }

  /** Heavy brass rotating padlock dial click */
  public playLockDial(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);

    this.spawnNoiseBurst(ctx, out, now, 0.022, 'bandpass', 3200, 1800, 3.0, 0.18, 2.5);
    const click = ctx.createOscillator();
    const g = ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(1320, now);
    click.frequency.exponentialRampToValueAtTime(640, now + 0.024);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.028);
    click.connect(g);
    g.connect(out);
    click.start(now);
    click.stop(now + 0.032);
  }

  /** Dull iron padlock rejection clunk & buzz */
  public playLockError(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);

    [155, 118].forEach((freq, i) => {
      const t0 = now + i * 0.11;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t0 + 0.12);
      g.gain.setValueAtTime(0.14, t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.13);
      osc.connect(g);
      g.connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.14);
    });
  }

  /** Heavy deadbolt unlatch + oak door swing + escape chord */
  public playDoorUnlock(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, opts);

    // Metallic bolt slide clunk
    this.spawnNoiseBurst(ctx, out, now, 0.08, 'bandpass', 1800, 720, 2.2, 0.28, 2.0);
    // Warm triumphant escape fanfare
    [293.66, 440.0, 587.33, 880.0].forEach((freq, i) => {
      const t0 = now + 0.09 + i * 0.07;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.001, t0);
      g.gain.linearRampToValueAtTime(0.14, t0 + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.55);
      osc.connect(g);
      g.connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.58);
    });
  }

  /** Preload & decode downloaded realistic ice-slipping SFX (/assets/sfx/ice_slip.mp3) */
  public preloadIceSlipAudio() {
    if (typeof window === 'undefined') return;
    if (this.iceSlipBuffer) return;
    const decodeRaw = () => {
      if (this.iceSlipBuffer || !this.iceSlipRaw || this.iceSlipDecoding) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      this.iceSlipDecoding = true;
      ctx
        .decodeAudioData(this.iceSlipRaw.slice(0))
        .then((decoded) => {
          this.iceSlipBuffer = decoded;
        })
        .catch(() => {})
        .finally(() => {
          this.iceSlipDecoding = false;
        });
    };

    if (this.iceSlipRaw) {
      decodeRaw();
      return;
    }
    if (this.iceSlipLoading) return;
    this.iceSlipLoading = true;
    fetch('/assets/sfx/ice_slip.mp3')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        this.iceSlipRaw = buf;
        decodeRaw();
      })
      .catch(() => {})
      .finally(() => {
        this.iceSlipLoading = false;
      });
  }

  /** Realistic ice blade / foot slip & frost skid sound on Winter Tussle ice */
  public playIceSlip(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.preloadIceSlipAudio();
    if (!this.iceSlipBuffer) return;

    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, {
      volume: Math.min(1.15, (opts?.volume ?? 1) * 0.85),
      pan: opts?.pan ?? 0,
    });
    const src = ctx.createBufferSource();
    src.buffer = this.iceSlipBuffer;
    src.playbackRate.setValueAtTime(0.94 + Math.random() * 0.14, now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.9, now + 0.025);
    g.gain.setValueAtTime(0.9, now + Math.max(0.06, this.iceSlipBuffer.duration - 0.28));
    g.gain.exponentialRampToValueAtTime(0.001, now + this.iceSlipBuffer.duration);

    src.connect(g);
    g.connect(out);
    src.start(now);
  }

  /** 3-second central pillar security klaxon alarm when a door is shot & jammed */
  public playDoorAlarm(opts?: SpatialAudioOpts) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const { node: out } = this.createOutputNode(ctx, {
      volume: Math.min(1.25, (opts?.volume ?? 1) * 0.92),
      pan: opts?.pan ?? 0,
    });

    // Metallic bullet ricochet clang on the brass lock + 6 alternating alarm chirps over 3 seconds
    this.spawnNoiseBurst(ctx, out, now, 0.065, 'bandpass', 2600, 1250, 2.4, 0.25, 2.0);
    for (let i = 0; i < 6; i++) {
      const t0 = now + i * 0.48;
      const hi = i % 2 === 0 ? 960 : 720;
      const lo = i % 2 === 0 ? 740 : 560;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hi, t0);
      osc.frequency.exponentialRampToValueAtTime(lo, t0 + 0.24);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1250, t0);
      filter.Q.setValueAtTime(1.6, t0);

      const peak = 0.16 * (1 - i * 0.06);
      g.gain.setValueAtTime(0.001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.28);

      osc.connect(filter);
      filter.connect(g);
      g.connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    }
  }
}

export const sound = new SoundEngine();
