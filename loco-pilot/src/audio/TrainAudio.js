import { audio } from './AudioEngine.js';
import { bus } from '../core/EventBus.js';
import { clamp, smoothstep } from '../core/MathUtil.js';

/**
 * Sound of the player's locomotive and train plus the surrounding environment.
 * Everything is driven from simulation state each frame.
 */
export class TrainAudio {
  constructor() {
    this.built = false;
    this.jointNext = null;
    this.lastHorn = 0;
    this.offs = [];
    this.thunderQueue = [];
  }

  build() {
    if (this.built || !audio.ready) return;
    this.built = true;
    const A = audio, E = A.engineBus, X = A.exterior;
    // traction motors & inverter
    this.motorA = A.osc('sawtooth', 60, this.mkFilter(E, 'lowpass', 1800), 0);
    this.motorB = A.osc('triangle', 120, E, 0);
    this.pwm = A.osc('square', 400, this.mkFilter(E, 'bandpass', 900, 6), 0);
    this.hum = A.osc('sine', 100, E, 0);
    this.hum2 = A.osc('sine', 200, E, 0);
    this.blower = A.noiseLoop('pink', 'bandpass', 700, 0.9, E, 0);
    this.compressor = A.noiseLoop('brown', 'lowpass', 260, 1, E, 0);
    this.compLfo = A.ctx.createOscillator();
    this.compLfo.frequency.value = 11;
    this.compLfoGain = A.ctx.createGain();
    this.compLfoGain.gain.value = 0;
    this.compLfo.connect(this.compLfoGain);
    this.compLfoGain.connect(this.compressor.gain.gain);
    this.compLfo.start();
    // rolling noise, wind, flange squeal (exterior bus → muffled in cab)
    this.roll = A.noiseLoop('pink', 'bandpass', 300, 0.8, X, 0);
    this.rumble = A.noiseLoop('brown', 'lowpass', 120, 0.7, E, 0);
    this.wind = A.noiseLoop('pink', 'lowpass', 600, 0.5, E, 0);
    this.squeal = A.noiseLoop('white', 'bandpass', 3200, 22, X, 0);
    // air brake sounds (in cab)
    this.exhaust = A.noiseLoop('white', 'highpass', 2200, 0.6, E, 0);
    this.charge = A.noiseLoop('white', 'bandpass', 1500, 0.8, E, 0);
    this.brakeSqueal = A.noiseLoop('white', 'bandpass', 2600, 14, X, 0);
    // horns: two dual-tone air horns
    this.horns = [this.mkHorn(466.2, 554.4), this.mkHorn(349.2, 415.3)];
    // weather
    this.rain = A.noiseLoop('white', 'lowpass', 5000, 0.4, A.ambBus, 0);
    this.rainRoof = A.noiseLoop('pink', 'bandpass', 1800, 0.6, A.ambBus, 0);
    // station ambience
    this.crowd = A.noiseLoop('pink', 'bandpass', 700, 1.4, A.exterior, 0);
    this.crowd2 = A.noiseLoop('pink', 'bandpass', 1300, 2.2, A.exterior, 0);
    // level crossing bell
    this.bell = A.osc('square', 1180, this.mkFilter(A.exterior, 'bandpass', 1180, 8), 0);
    this.bellLfo = A.ctx.createOscillator();
    this.bellLfo.frequency.value = 14;
    this.bellLfoGain = A.ctx.createGain();
    this.bellLfoGain.gain.value = 0;
    this.bellLfo.connect(this.bellLfoGain);
    this.bellLfoGain.connect(this.bell.gain.gain);
    this.bellLfo.start();
    // VCD buzzer
    this.buzzer = A.osc('square', 760, A.uiBus, 0);
    // AI train passing rumble & horn (simple distance model)
    this.aiRumble = A.noiseLoop('brown', 'lowpass', 220, 0.8, A.exterior, 0);
    this.aiRoll = A.noiseLoop('pink', 'bandpass', 500, 0.8, A.exterior, 0);
    this.aiHorn = this.mkHorn(415.3, 493.9, A.exterior);
    this.offs.push(
      bus.on('guard:whistle', () => this.whistle()),
      bus.on('ai:horn', (e) => this.aiHornBlast(e)),
      bus.on('spad', () => this.alarm()),
      bus.on('collision', () => this.crash()),
      bus.on('ui:click', () => audio.click()),
    );
  }

  mkFilter(out, type, freq, q = 0.7) {
    const f = audio.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(out);
    return f;
  }

  mkHorn(f1, f2, out = audio.engineBus) {
    const c = audio.ctx;
    const g = c.createGain();
    g.gain.value = 0;
    const body = c.createBiquadFilter();
    body.type = 'bandpass';
    body.frequency.value = 900;
    body.Q.value = 0.8;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    body.connect(lp);
    lp.connect(g);
    g.connect(out);
    const oscs = [];
    for (const f of [f1, f2, f1 * 2.01, f2 * 1.5]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const og = c.createGain();
      og.gain.value = f > f2 * 1.2 ? 0.18 : 0.45;
      o.connect(og);
      og.connect(body);
      o.start();
      oscs.push(o);
    }
    const vib = c.createOscillator();
    vib.frequency.value = 5.5;
    const vg = c.createGain();
    vg.gain.value = 2.5;
    vib.connect(vg);
    for (const o of oscs) vg.connect(o.frequency);
    vib.start();
    const air = audio.noiseLoop('white', 'bandpass', 2500, 0.8, g, 0.12);
    return { gain: g, oscs, air, base: [f1, f2, f1 * 2.01, f2 * 1.5] };
  }

  whistle() {
    if (!audio.ready) return;
    for (let i = 0; i < 2; i++) {
      audio.tone({ freq: 2900, type: 'sine', gain: 0.08, attack: 0.02, hold: 0.28, release: 0.08, delay: i * 0.42, out: audio.exterior, glide: 120 });
      audio.tone({ freq: 3100, type: 'sine', gain: 0.05, attack: 0.02, hold: 0.28, release: 0.08, delay: i * 0.42, out: audio.exterior });
    }
  }

  alarm() {
    for (let i = 0; i < 6; i++) audio.tone({ freq: i % 2 ? 880 : 660, type: 'square', gain: 0.07, attack: 0.005, hold: 0.16, release: 0.04, delay: i * 0.22 });
  }

  crash() {
    audio.burst({ type: 'brown', filter: 'lowpass', freq: 300, gain: 1.0, decay: 1.6 });
    audio.burst({ type: 'white', filter: 'bandpass', freq: 1800, q: 0.6, gain: 0.5, decay: 0.9 });
  }

  aiHornBlast(e) {
    if (!audio.ready || !this.listenerPos) return;
    this.pendingAiHorn = { train: e.train, until: audio.time + e.duration };
  }

  thunder(strength, distance) {
    if (!audio.ready) return;
    const delay = distance / 343;
    const g = Math.min(1, strength * 1.3 * (1200 / (distance + 600)));
    audio.burst({ type: 'brown', filter: 'lowpass', freq: 160, q: 0.5, gain: g, attack: 0.3, decay: 3.5 + Math.random() * 2, delay, out: audio.ambBus });
    audio.burst({ type: 'brown', filter: 'lowpass', freq: 90, q: 0.5, gain: g * 0.8, attack: 0.05, decay: 1.5, delay: delay + 0.15, out: audio.ambBus });
    if (distance < 1500) audio.burst({ type: 'white', filter: 'lowpass', freq: 2200, gain: g * 0.4, attack: 0.002, decay: 0.4, delay, out: audio.ambBus });
  }

  /** Per-frame update. s: aggregated state from the game. */
  update(dt, s) {
    if (!audio.ready) return;
    if (!this.built) this.build();
    const A = audio;
    const p = s.player;
    const tr = p.traction, br = p.brakes;
    const kmh = Math.abs(p.v) * 3.6;
    const speed = Math.abs(p.v);
    const inCab = s.inCab;
    const near = s.listenerNearLoco; // 0..1 how close the listener is to the loco
    const nearTrain = s.listenerNearTrain;
    // ---- traction
    const load = clamp(Math.abs(tr.te) / tr.spec.maxTE, 0, 1);
    const motorHz = 18 + kmh * 2.6;
    A.set(this.motorA.osc.frequency, motorHz);
    A.set(this.motorB.osc.frequency, motorHz * 2.02);
    A.set(this.motorA.gain.gain, (0.025 + 0.11 * load) * near * (tr.powered ? 1 : 0) * smoothstep(0, 6, kmh + 2));
    A.set(this.motorB.gain.gain, 0.05 * load * near);
    // inverter carrier "singing" in steps at low speed
    const carrier = kmh < 12 ? 420 + kmh * 32 : kmh < 30 ? 610 + (kmh - 12) * 22 : 980 + (kmh - 30) * 4;
    A.set(this.pwm.osc.frequency, carrier, 0.12);
    A.set(this.pwm.gain.gain, 0.03 * load * near * (kmh < 70 ? 1 : 0.35));
    A.set(this.hum.gain.gain, tr.powered ? (0.025 + 0.03 * load) * near : 0);
    A.set(this.hum2.gain.gain, tr.powered ? 0.012 * near : 0);
    A.set(this.blower.gain.gain, tr.auxOn ? (0.05 + 0.04 * load) * near : 0, 0.8);
    A.set(this.blower.filter.frequency, 600 + load * 500, 0.5);
    // compressor
    const comp = br.compressorOn ? 1 : 0;
    A.set(this.compressor.gain.gain, comp * 0.12 * near, 0.4);
    A.set(this.compLfoGain.gain, comp * 0.1 * near, 0.4);
    // ---- wheels & track
    A.set(this.roll.gain.gain, clamp(speed / 30, 0, 1) ** 0.8 * 0.22 * nearTrain);
    A.set(this.roll.filter.frequency, 180 + kmh * 9);
    A.set(this.rumble.gain.gain, clamp(speed / 25, 0, 1) * 0.35 * nearTrain);
    const windG = clamp((speed / 35) ** 2, 0, 1.4) * (inCab ? 0.08 : 0.2) * (s.inTunnel ? 2 : 1);
    A.set(this.wind.gain.gain, windG * (s.cameraMoving ? 1 : 0.6));
    A.set(this.wind.filter.frequency, 400 + kmh * 6);
    const k = Math.abs(s.curvature || 0);
    const squeal = k > 1 / 750 && kmh > 15 && kmh < 90 ? clamp((k - 1 / 750) * 900, 0, 1) * 0.06 : 0;
    A.set(this.squeal.gain.gain, squeal * nearTrain * (0.6 + 0.4 * Math.sin(A.time * 3.1)), 0.2);
    A.set(this.squeal.filter.frequency, 2800 + Math.sin(A.time * 1.7) * 600, 0.1);
    // ---- air brakes
    A.set(this.exhaust.gain.gain, clamp(br.exhaustRate * (br.emergency ? 0.18 : 0.22), 0, 0.45) * near, 0.05);
    A.set(this.charge.gain.gain, clamp(br.chargeRate * 0.12, 0, 0.12) * near, 0.15);
    const brakeSq = br.bcAvg > 0.6 && kmh > 1 && kmh < 22 ? (1 - kmh / 22) * 0.07 : 0;
    A.set(this.brakeSqueal.gain.gain, brakeSq * nearTrain, 0.1);
    if (this.prevSa9 !== undefined && br.sa9 < this.prevSa9 - 0.15 && br.bcLoco > 0.6) {
      A.burst({ type: 'white', filter: 'highpass', freq: 1500, gain: 0.25 * near, attack: 0.01, decay: 1.2 });
    }
    this.prevSa9 = br.sa9;
    // ---- rail joints (welded rail with periodic joints, turnouts at stations)
    this.updateJoints(p, s, near, nearTrain);
    // ---- horn
    const horn = p.horn;
    const hG = horn ? 0.32 : 0;
    A.set(this.horns[0].gain.gain, horn === 1 ? hG * (inCab ? 0.75 : 1) : 0, horn ? 0.03 : 0.12);
    A.set(this.horns[1].gain.gain, horn === 2 ? hG * (inCab ? 0.75 : 1) : 0, horn ? 0.03 : 0.12);
    // ---- weather
    const rain = s.rain;
    A.set(this.rain.gain.gain, rain * (inCab ? 0.07 : 0.16) * (s.inTunnel ? 0 : 1), 0.5);
    A.set(this.rainRoof.gain.gain, rain * (inCab ? 0.12 : 0.04) * (s.inTunnel ? 0 : 1), 0.5);
    if (rain > 0.2 && inCab && Math.random() < rain * dt * 18) A.burst({ type: 'white', filter: 'bandpass', freq: 2500 + Math.random() * 2000, q: 2, gain: 0.04 * rain, decay: 0.03, out: A.ambBus });
    // ---- station crowd
    A.set(this.crowd.gain.gain, s.crowd * 0.1 * (0.7 + 0.3 * Math.sin(A.time * 0.7)), 0.6);
    A.set(this.crowd2.gain.gain, s.crowd * 0.05 * (0.6 + 0.4 * Math.sin(A.time * 1.3 + 1)), 0.4);
    // ---- level crossing bells
    A.set(this.bellLfoGain.gain, s.lcBell * 0.05, 0.1);
    // ---- VCD buzzer
    A.set(this.buzzer.gain.gain, s.vcdAlarm && Math.floor(A.time * 3) % 2 === 0 ? 0.06 : 0, 0.01);
    // ---- AI trains
    A.set(this.aiRumble.gain.gain, s.aiNear * 0.5, 0.15);
    A.set(this.aiRoll.gain.gain, s.aiNear * 0.25, 0.15);
    A.set(this.aiRoll.filter.frequency, 250 + s.aiSpeed * 8, 0.2);
    let aiHornG = 0;
    if (this.pendingAiHorn && A.time < this.pendingAiHorn.until) aiHornG = 0.3 * clamp(1 - s.aiHornDist / 1500, 0, 1);
    A.set(this.aiHorn.gain.gain, aiHornG, 0.04);
    if (s.aiDoppler) for (let i = 0; i < this.aiHorn.oscs.length; i++) A.set(this.aiHorn.oscs[i].frequency, this.aiHorn.base[i] * s.aiDoppler, 0.05);
    this.listenerPos = true;
  }

  updateJoints(p, s, near, nearTrain) {
    const A = audio;
    const speed = Math.abs(p.v);
    if (speed < 0.8) return;
    // joints every 26 m near stations/turnouts, every 260 m elsewhere (welded rail with SEJs)
    const spacing = s.nearStation ? 26 : 260;
    const pos = p.s * p.dir;
    const idx = Math.floor(pos / spacing);
    if (this.jointNext === null || Math.abs(idx - this.jointIdx) > 3) {
      this.jointIdx = idx;
      this.jointNext = idx;
      return;
    }
    if (idx !== this.jointIdx) {
      this.jointIdx = idx;
      // schedule axle clicks: loco bogies (3 axles each) then the first coaches
      const axles = [];
      for (const off of [3.4, 5.35, 7.3, 14.3, 16.25, 18.2]) axles.push(off);
      for (let c = 1; c < Math.min(5, p.vehicles.length); c++) {
        const v = p.vehicles[c];
        const b0 = v.centreOffset - 7.45, b1 = v.centreOffset + 7.45;
        axles.push(b0 - 1.28, b0 + 1.28, b1 - 1.28, b1 + 1.28);
      }
      const camOff = s.listenerOffset || 2;
      for (const a of axles) {
        const dt = (a - 0) / speed;
        if (dt > 3) continue;
        const dist = Math.abs(a - camOff);
        const g = clamp(0.32 / (1 + dist * 0.12), 0, 0.32) * (0.4 + 0.6 * clamp(speed / 25, 0, 1)) * nearTrain;
        A.burst({ type: 'white', filter: 'bandpass', freq: 1700, q: 1.2, gain: g * 0.6, decay: 0.035, delay: dt, out: A.exterior });
        A.burst({ type: 'brown', filter: 'lowpass', freq: 160, q: 0.8, gain: g * 1.4, decay: 0.12, delay: dt + 0.005, out: A.engineBus });
      }
    }
  }

  dispose() {
    this.offs.forEach((f) => f());
    if (!this.built) return;
    const A = audio;
    const kill = (n) => {
      try {
        if (n.osc) n.osc.stop();
        if (n.src) n.src.stop();
      } catch {
        /* already stopped */
      }
    };
    [this.motorA, this.motorB, this.pwm, this.hum, this.hum2, this.blower, this.compressor, this.roll, this.rumble, this.wind, this.squeal, this.exhaust, this.charge, this.brakeSqueal, this.rain, this.rainRoof, this.crowd, this.crowd2, this.bell, this.buzzer, this.aiRumble, this.aiRoll].forEach(kill);
    for (const h of [...this.horns, this.aiHorn]) {
      h.oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* ignore */
        }
      });
      kill(h.air);
    }
    try {
      this.compLfo.stop();
      this.bellLfo.stop();
    } catch {
      /* ignore */
    }
    void A;
    this.built = false;
  }
}
