export type SfxName =
  | 'hover'
  | 'click'
  | 'open'
  | 'close'
  | 'error'
  | 'confirm'
  | 'pop'
  | 'shuffle'
  | 'cardDeal'
  | 'cardFlip'
  | 'chip'
  | 'chipStack'
  | 'check'
  | 'fold'
  | 'allIn'
  | 'reveal'
  | 'win'
  | 'lose'
  | 'bust'
  | 'augment'
  | 'augmentRare'
  | 'turn'
  | 'coin';

interface ToneVoice {
  kind?: 'tone';
  freq: number;
  endFreq?: number;
  duration: number;
  gain: number;
  type: OscillatorType;
  delay?: number;
  attack?: number;
  vibrato?: { rate: number; depth: number };
  /** 저역 통과 필터 컷오프를 from → to로 움직인다 (와와 효과) */
  lowpass?: { from: number; to: number; q?: number };
}

interface NoiseVoice {
  kind: 'noise';
  duration: number;
  gain: number;
  delay?: number;
  filter: BiquadFilterType;
  freq: number;
  endFreq?: number;
  q?: number;
}

type Voice = ToneVoice | NoiseVoice;

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

function clacks(count: number, spacing: number, base = 0): Voice[] {
  const out: Voice[] = [];
  for (let i = 0; i < count; i++) {
    const d = base + i * spacing + (i % 2) * spacing * 0.3;
    out.push({ kind: 'noise', duration: 0.035, gain: 0.32 - i * 0.015, delay: d, filter: 'bandpass', freq: 4200 + (i % 3) * 600, q: 6 });
    out.push({ freq: 3100 + (i % 4) * 180, duration: 0.03, gain: 0.05, type: 'sine', delay: d });
  }
  return out;
}

const SFX: Record<SfxName, Voice[]> = {
  hover: [{ freq: 1300, endFreq: 1700, duration: 0.04, gain: 0.04, type: 'sine' }],
  click: [
    { freq: 520, endFreq: 980, duration: 0.07, gain: 0.16, type: 'sine' },
    { kind: 'noise', duration: 0.02, gain: 0.08, filter: 'highpass', freq: 3000 },
  ],
  pop: [{ freq: 420, endFreq: 1250, duration: 0.06, gain: 0.16, type: 'sine' }],
  open: [
    { kind: 'noise', duration: 0.2, gain: 0.08, filter: 'bandpass', freq: 500, endFreq: 2600, q: 1.5 },
    { freq: 620, endFreq: 940, duration: 0.12, gain: 0.1, type: 'sine', delay: 0.05 },
  ],
  close: [
    { kind: 'noise', duration: 0.18, gain: 0.07, filter: 'bandpass', freq: 2200, endFreq: 500, q: 1.5 },
    { freq: 760, endFreq: 420, duration: 0.1, gain: 0.08, type: 'sine' },
  ],
  error: [
    { freq: 220, endFreq: 160, duration: 0.11, gain: 0.12, type: 'square', lowpass: { from: 1200, to: 400 } },
    { freq: 180, endFreq: 120, duration: 0.14, gain: 0.1, type: 'square', delay: 0.12, lowpass: { from: 1000, to: 300 } },
  ],
  confirm: [
    { freq: NOTE(76), duration: 0.1, gain: 0.1, type: 'triangle' },
    { freq: NOTE(83), duration: 0.18, gain: 0.1, type: 'triangle', delay: 0.07 },
  ],
  shuffle: Array.from({ length: 12 }, (_, i) => ({
    kind: 'noise' as const,
    duration: 0.025,
    gain: 0.12 + (i % 3) * 0.02,
    delay: i * 0.028,
    filter: 'highpass' as const,
    freq: 2600 + (i % 4) * 300,
  })),
  cardDeal: [
    { kind: 'noise', duration: 0.07, gain: 0.18, filter: 'bandpass', freq: 2400, endFreq: 5200, q: 2 },
    { kind: 'noise', duration: 0.03, gain: 0.12, delay: 0.06, filter: 'highpass', freq: 4000 },
  ],
  cardFlip: [
    { kind: 'noise', duration: 0.06, gain: 0.18, filter: 'bandpass', freq: 1800, endFreq: 4500, q: 2 },
    { freq: 1400, endFreq: 2100, duration: 0.05, gain: 0.05, type: 'triangle', delay: 0.03 },
  ],
  chip: clacks(2, 0.045),
  chipStack: clacks(7, 0.04),
  check: [
    { freq: 190, endFreq: 110, duration: 0.07, gain: 0.3, type: 'sine' },
    { kind: 'noise', duration: 0.04, gain: 0.08, filter: 'lowpass', freq: 900 },
    { freq: 190, endFreq: 110, duration: 0.07, gain: 0.28, type: 'sine', delay: 0.11 },
    { kind: 'noise', duration: 0.04, gain: 0.07, delay: 0.11, filter: 'lowpass', freq: 900 },
  ],
  fold: [{ kind: 'noise', duration: 0.24, gain: 0.12, filter: 'lowpass', freq: 2400, endFreq: 300 }],
  allIn: [
    { kind: 'noise', duration: 0.6, gain: 0.18, filter: 'lowpass', freq: 300, endFreq: 1400 },
    { freq: 98, endFreq: 196, duration: 0.55, gain: 0.12, type: 'sawtooth', lowpass: { from: 400, to: 2200 } },
    ...clacks(9, 0.035, 0.12),
  ],
  reveal: [NOTE(84), NOTE(88), NOTE(91)].map((f, i) => ({ freq: f, duration: 0.16, gain: 0.07, type: 'triangle' as const, delay: i * 0.05 })),
  win: [
    ...[72, 76, 79, 84].map((n, i) => ({ freq: NOTE(n), duration: 0.16, gain: 0.12, type: 'triangle' as const, delay: i * 0.09 })),
    { freq: NOTE(84), duration: 0.6, gain: 0.08, type: 'square', delay: 0.36, lowpass: { from: 3000, to: 1200 } },
    { freq: NOTE(88), duration: 0.6, gain: 0.06, type: 'triangle', delay: 0.36 },
    { freq: NOTE(91), duration: 0.6, gain: 0.06, type: 'triangle', delay: 0.36 },
    ...[0.5, 0.58, 0.66, 0.78].map((d, i) => ({ freq: 2100 + i * 260, duration: 0.08, gain: 0.05, type: 'sine' as const, delay: d })),
  ],
  lose: [
    { freq: NOTE(67), duration: 0.18, gain: 0.1, type: 'triangle' },
    { freq: NOTE(63), duration: 0.34, gain: 0.1, type: 'triangle', delay: 0.16 },
  ],
  bust: [
    { freq: NOTE(58), duration: 0.32, gain: 0.13, type: 'sawtooth', lowpass: { from: 400, to: 1600, q: 6 } },
    { freq: NOTE(57), duration: 0.32, gain: 0.13, type: 'sawtooth', delay: 0.34, lowpass: { from: 400, to: 1600, q: 6 } },
    { freq: NOTE(56), duration: 0.32, gain: 0.13, type: 'sawtooth', delay: 0.68, lowpass: { from: 400, to: 1600, q: 6 } },
    {
      freq: NOTE(55),
      endFreq: NOTE(54),
      duration: 1.0,
      gain: 0.14,
      type: 'sawtooth',
      delay: 1.02,
      vibrato: { rate: 6, depth: 9 },
      lowpass: { from: 1600, to: 300, q: 6 },
    },
  ],
  augment: [
    { freq: 600, endFreq: 1800, duration: 0.35, gain: 0.08, type: 'sine' },
    ...[88, 91, 95].map((n, i) => ({ freq: NOTE(n), duration: 0.18, gain: 0.07, type: 'triangle' as const, delay: 0.18 + i * 0.07 })),
  ],
  augmentRare: [
    { freq: 400, endFreq: 2400, duration: 0.5, gain: 0.1, type: 'sine' },
    { kind: 'noise', duration: 0.6, gain: 0.05, filter: 'highpass', freq: 6000 },
    ...[84, 88, 91, 96, 100].map((n, i) => ({ freq: NOTE(n), duration: 0.24, gain: 0.07, type: 'triangle' as const, delay: 0.2 + i * 0.07 })),
    { freq: NOTE(84), duration: 0.8, gain: 0.05, type: 'square', delay: 0.55, lowpass: { from: 3000, to: 900 } },
  ],
  turn: [
    { freq: NOTE(81), duration: 0.14, gain: 0.1, type: 'sine' },
    { freq: NOTE(76), duration: 0.22, gain: 0.1, type: 'sine', delay: 0.12 },
  ],
  coin: [0, 0.06, 0.13].map((d, i) => ({ freq: 1900 + i * 420, duration: 0.09, gain: 0.07, type: 'sine' as const, delay: d })),
};

/**
 * 마스터 → (BGM/앰비언스, 효과음) 2단 볼륨 버스. 모든 소리는 WebAudio로 합성한다(음원 파일 없음).
 * 브라우저 정책상 첫 사용자 입력 이후에만 소리가 나므로 AudioContext는 처음 재생할 때 만든다.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volumes = { master: 0.8, music: 0.6, sfx: 0.8 };
  private ambience: { stop: () => void } | null = null;

  setVolumes(master: number, music: number, sfx: number) {
    this.volumes = { master: master / 100, music: music / 100, sfx: sfx / 100 };
    this.applyVolumes();
  }

  get musicBus(): GainNode | null {
    return this.ensure() ? this.music : null;
  }

  play(name: SfxName) {
    if (this.volumes.master <= 0 || this.volumes.sfx <= 0) return;
    const ctx = this.ensure();
    if (!ctx || !this.sfx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const v of SFX[name]) {
      if (v.kind === 'noise') this.noiseVoice(ctx, v, now, this.sfx);
      else this.toneVoice(ctx, v, now, this.sfx);
    }
  }

  /** 카지노 실내 소리(웅성거림·칩 소리·슬롯머신). 배경음악 볼륨 버스로 나간다 */
  setAmbience(on: boolean) {
    if (!on) {
      this.ambience?.stop();
      this.ambience = null;
      return;
    }
    if (this.ambience) return;
    const ctx = this.ensure();
    if (!ctx || !this.music || !this.noise) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    out.connect(this.music);

    // 낮은 실내 울림
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const room = ctx.createGain();
    room.gain.value = 0.09;
    src.connect(lp).connect(room).connect(out);

    // 멀리서 웅성거리는 사람들: 말소리 대역 노이즈의 크기와 음색이 천천히 출렁인다
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noise;
    src2.loop = true;
    src2.playbackRate.value = 0.8;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 1.4;
    const crowd = ctx.createGain();
    crowd.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(crowd.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.13;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 180;
    lfo2.connect(lfo2Gain).connect(bp.frequency);
    src2.connect(bp).connect(crowd).connect(out);

    src.start();
    src2.start();
    lfo.start();
    lfo2.start();

    const panned = () => {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      pan.connect(out);
      return pan;
    };

    // 다른 테이블의 칩 부딪히는 소리
    let chipTimer = 0;
    const clink = () => {
      const t = ctx.currentTime + 0.05;
      const pan = panned();
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        this.toneVoice(ctx, { freq: 3200 + Math.random() * 1600, duration: 0.05, gain: 0.012, type: 'sine', delay: i * (0.04 + Math.random() * 0.05) }, t, pan);
      }
      chipTimer = window.setTimeout(clink, 2500 + Math.random() * 6000);
    };
    chipTimer = window.setTimeout(clink, 1500);

    // 가끔 멀리서 들리는 슬롯머신 멜로디
    let slotTimer = 0;
    const jingle = () => {
      const t = ctx.currentTime + 0.05;
      const pan = panned();
      const base = [523, 659, 784, 1047][Math.floor(Math.random() * 4)];
      [1, 1.25, 1.5, 2, 1.5, 2].forEach((m, i) => {
        this.toneVoice(ctx, { freq: base * m, duration: 0.09, gain: 0.008, type: 'square', delay: i * 0.08 }, t, pan);
      });
      slotTimer = window.setTimeout(jingle, 14000 + Math.random() * 20000);
    };
    slotTimer = window.setTimeout(jingle, 7000);

    this.ambience = {
      stop: () => {
        window.clearTimeout(chipTimer);
        window.clearTimeout(slotTimer);
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + 0.8);
        setTimeout(() => {
          src.stop();
          src2.stop();
          lfo.stop();
          lfo2.stop();
          out.disconnect();
        }, 900);
      },
    };
  }

  private toneVoice(ctx: AudioContext, v: ToneVoice, now: number, dest: AudioNode) {
    const start = now + (v.delay ?? 0);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = v.type;
    osc.frequency.setValueAtTime(v.freq, start);
    if (v.endFreq) osc.frequency.exponentialRampToValueAtTime(v.endFreq, start + v.duration);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(v.gain, start + (v.attack ?? 0.006));
    env.gain.exponentialRampToValueAtTime(0.0001, start + v.duration);
    let node: AudioNode = osc;
    if (v.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = v.lowpass.q ?? 1;
      f.frequency.setValueAtTime(v.lowpass.from, start);
      f.frequency.exponentialRampToValueAtTime(v.lowpass.to, start + v.duration);
      node = node.connect(f);
    }
    if (v.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = v.vibrato.rate;
      depth.gain.value = v.vibrato.depth;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + v.duration + 0.02);
    }
    node.connect(env).connect(dest);
    osc.start(start);
    osc.stop(start + v.duration + 0.02);
  }

  private noiseVoice(ctx: AudioContext, v: NoiseVoice, now: number, dest: AudioNode) {
    if (!this.noise) return;
    const start = now + (v.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = v.filter;
    f.Q.value = v.q ?? 1;
    f.frequency.setValueAtTime(v.freq, start);
    if (v.endFreq) f.frequency.exponentialRampToValueAtTime(v.endFreq, start + v.duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(v.gain, start + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, start + v.duration);
    src.connect(f).connect(env).connect(dest);
    src.start(start, Math.random() * 1.5);
    src.stop(start + v.duration + 0.02);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === 'undefined') return null;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    return this.ctx;
  }

  private applyVolumes() {
    if (!this.master || !this.music || !this.sfx) return;
    this.master.gain.value = this.volumes.master;
    this.music.gain.value = this.volumes.music;
    this.sfx.gain.value = this.volumes.sfx;
  }
}

export const audio = new AudioEngine();
