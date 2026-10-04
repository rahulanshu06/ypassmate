import { settings } from '../core/Settings.js';
import { bus } from '../core/EventBus.js';
import { clamp } from '../core/MathUtil.js';

/**
 * Web Audio graph: master limiter, buses (engine / ambience / voice / ui), exterior muffling
 * filter for cab views and a generated tunnel reverb. All sounds are synthesised.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.noise = {};
    bus.on('settings:changed', ({ key }) => {
      if (this.ready && (key.endsWith('Volume') || key === '*')) this.applyVolumes();
    });
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.2;
    this.master.connect(this.limiter);
    this.limiter.connect(c.destination);
    // buses
    this.engineBus = c.createGain();
    this.ambBus = c.createGain();
    this.voiceBus = c.createGain();
    this.uiBus = c.createGain();
    // exterior sounds pass through a lowpass that closes when the listener is inside the cab
    this.exterior = c.createGain();
    this.extFilter = c.createBiquadFilter();
    this.extFilter.type = 'lowpass';
    this.extFilter.frequency.value = 18000;
    this.exterior.connect(this.extFilter);
    this.extFilter.connect(this.ambBus);
    // tunnel reverb
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.6);
    this.reverbSend = c.createGain();
    this.reverbSend.gain.value = 0;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    for (const b of [this.engineBus, this.ambBus, this.voiceBus, this.uiBus]) b.connect(this.master);
    this.engineBus.connect(this.reverbSend);
    this.ambBus.connect(this.reverbSend);
    this.makeNoise();
    this.ready = true;
    this.applyVolumes();
    bus.emit('audio:ready', { ctx: c });
  }

  applyVolumes() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : settings.get('masterVolume') ?? 0.8, t, 0.05);
    this.engineBus.gain.setTargetAtTime(settings.get('engineVolume') ?? 0.9, t, 0.05);
    this.ambBus.gain.setTargetAtTime(settings.get('ambienceVolume') ?? 0.8, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(settings.get('announcementVolume') ?? 0.9, t, 0.05);
    this.uiBus.gain.setTargetAtTime(0.6, t, 0.05);
  }

  setMuted(m) {
    this.muted = m;
    this.applyVolumes();
    if (this.ctx) {
      if (m) this.ctx.suspend?.();
      else this.ctx.resume?.();
    }
  }

  impulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  makeNoise() {
    const c = this.ctx;
    const len = c.sampleRate * 3;
    const mk = (fn) => {
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      fn(d);
      return buf;
    };
    this.noise.white = mk((d) => {
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    });
    this.noise.pink = mk((d) => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    });
    this.noise.brown = mk((d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    });
  }

  /** Looping noise source -> filter -> gain. Returns handles. */
  noiseLoop(type, filterType, freq, q, out, gain = 0) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise[type];
    src.loop = true;
    src.loopStart = Math.random();
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(0, Math.random() * 2);
    return { src, filter: f, gain: g };
  }

  osc(type, freq, out, gain = 0) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    o.connect(g);
    g.connect(out);
    o.start();
    return { osc: o, gain: g };
  }

  set(param, value, tc = 0.06) {
    if (!this.ready) return;
    param.setTargetAtTime(value, this.ctx.currentTime, tc);
  }

  /** One-shot filtered noise burst (clicks, hisses, thumps). */
  burst({ type = 'white', filter = 'bandpass', freq = 1000, q = 1, gain = 0.3, attack = 0.002, decay = 0.08, delay = 0, out, rate = 1 }) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise[type];
    src.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + attack + decay);
    src.connect(f);
    f.connect(g);
    g.connect(out || this.engineBus);
    src.start(t, Math.random() * 2);
    src.stop(t + attack + decay + 0.05);
  }

  tone({ freq = 880, type = 'sine', gain = 0.2, attack = 0.01, hold = 0.1, release = 0.1, delay = 0, out, glide = 0 }) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.linearRampToValueAtTime(freq + glide, t + attack + hold);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0005, t + attack + hold + release);
    o.connect(g);
    g.connect(out || this.uiBus);
    o.start(t);
    o.stop(t + attack + hold + release + 0.05);
  }

  setInterior(inside, inTunnel) {
    if (!this.ready) return;
    this.set(this.extFilter.frequency, inside ? 1400 : 18000, 0.25);
    this.set(this.reverbSend.gain, inTunnel ? 0.55 : 0, 0.4);
  }

  get time() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  click() {
    this.tone({ freq: 1200, type: 'square', gain: 0.03, attack: 0.001, hold: 0.01, release: 0.03 });
  }
}

export const audio = new AudioEngine();
export { clamp };
