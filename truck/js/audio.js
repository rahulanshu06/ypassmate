'use strict';
// Synthesised sound: diesel engine, turbo, air brakes, indicator relay, horn, reverse beeper, wind, rain, crashes.
// Everything is generated with WebAudio, no sound files needed.
G.Audio = (() => {
  let ctx = null, master, cabinLP, nodes = {}, noiseBuf = null, enabled = true, vol = 0.8;

  function noise(seconds = 2) {
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = last * 0.4 + w * 0.6; d[i] = last; }
    return b;
  }
  function loopNoise() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true; s.start();
    return s;
  }
  // irregular diesel waveform: strong low harmonics, a little lumpiness
  function dieselWave() {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      const a = 1 / Math.pow(k, 1.05) * (k % 3 === 0 ? 1.4 : 1) * (k === 2 ? 1.3 : 1);
      re[k] = a * Math.cos(k * 1.7); im[k] = a * Math.sin(k * 0.9);
    }
    return ctx.createPeriodicWave(re, im);
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    noiseBuf = noise(2);
    master = ctx.createGain(); master.gain.value = vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    cabinLP = ctx.createBiquadFilter(); cabinLP.type = 'lowpass'; cabinLP.frequency.value = 20000;
    cabinLP.connect(comp); comp.connect(master); master.connect(ctx.destination);
    const bus = cabinLP;

    // engine: two detuned periodic oscillators + sub + rumble noise, through a load-dependent low-pass
    const wave = dieselWave();
    const e1 = ctx.createOscillator(); e1.setPeriodicWave(wave);
    const e2 = ctx.createOscillator(); e2.setPeriodicWave(wave); e2.detune.value = 9;
    const sub = ctx.createOscillator(); sub.type = 'triangle';
    const eg1 = ctx.createGain(), eg2 = ctx.createGain(), sg = ctx.createGain();
    eg1.gain.value = 0.5; eg2.gain.value = 0.35; sg.gain.value = 0.5;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    const elp = ctx.createBiquadFilter(); elp.type = 'lowpass'; elp.Q.value = 2.2;
    const engGain = ctx.createGain(); engGain.gain.value = 0;
    e1.connect(eg1); e2.connect(eg2); sub.connect(sg);
    eg1.connect(shaper); eg2.connect(shaper); sg.connect(elp);
    shaper.connect(elp); elp.connect(engGain); engGain.connect(bus);
    const rumble = loopNoise(), rbp = ctx.createBiquadFilter(), rg = ctx.createGain();
    rbp.type = 'bandpass'; rbp.Q.value = 1.4; rg.gain.value = 0;
    rumble.connect(rbp); rbp.connect(rg); rg.connect(bus);
    // turbo whistle + intake hiss
    const turbo = ctx.createOscillator(); turbo.type = 'sine';
    const tg = ctx.createGain(); tg.gain.value = 0;
    turbo.connect(tg); tg.connect(bus);
    // jake brake bark
    const jb = ctx.createOscillator(); jb.type = 'square';
    const jbf = ctx.createBiquadFilter(); jbf.type = 'lowpass'; jbf.frequency.value = 600;
    const jbg = ctx.createGain(); jbg.gain.value = 0;
    jb.connect(jbf); jbf.connect(jbg); jbg.connect(bus);
    // wind + tyre roar
    const wind = loopNoise(), wlp = ctx.createBiquadFilter(), wg = ctx.createGain();
    wlp.type = 'lowpass'; wg.gain.value = 0;
    wind.connect(wlp); wlp.connect(wg); wg.connect(bus);
    const road = loopNoise(), rlp = ctx.createBiquadFilter(), rdg = ctx.createGain();
    rlp.type = 'bandpass'; rlp.frequency.value = 180; rlp.Q.value = 0.8; rdg.gain.value = 0;
    road.connect(rlp); rlp.connect(rdg); rdg.connect(bus);
    // rain (on the roof when inside)
    const rain = loopNoise(), rhp = ctx.createBiquadFilter(), rng = ctx.createGain();
    rhp.type = 'highpass'; rhp.frequency.value = 900; rng.gain.value = 0;
    rain.connect(rhp); rhp.connect(rng); rng.connect(master);
    // horn
    const hornG = ctx.createGain(); hornG.gain.value = 0;
    const hornLP = ctx.createBiquadFilter(); hornLP.type = 'lowpass'; hornLP.frequency.value = 2600;
    hornLP.connect(hornG); hornG.connect(bus);
    const hornOsc = [196, 247, 294, 330].map((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(hornLP); o.start(); return o; });
    // reverse beeper
    const beep = ctx.createOscillator(); beep.type = 'square'; beep.frequency.value = 1150;
    const bg = ctx.createGain(); bg.gain.value = 0;
    beep.connect(bg); bg.connect(master);
    // tyre squeal
    const sq = loopNoise(), sqf = ctx.createBiquadFilter(), sqg = ctx.createGain();
    sqf.type = 'bandpass'; sqf.frequency.value = 1300; sqf.Q.value = 8; sqg.gain.value = 0;
    sq.connect(sqf); sqf.connect(sqg); sqg.connect(bus);

    [e1, e2, sub, turbo, jb, beep].forEach((o) => o.start());
    nodes = { e1, e2, sub, elp, engGain, rbp, rg, turbo, tg, jb, jbg, jbf, wlp, wg, rdg, rlp, rng, hornG, hornOsc, bg, sqg, prevThr: 0, prevBrake: 0, beepT: 0 };
  }

  // one-shot noise burst (air brake, blow-off, crash)
  function burst(type, freq, q, dur, gain, delay = 0, toBus = true) {
    if (!ctx || !enabled) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(toBus ? cabinLP : master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function tone(freq, dur, gain, type = 'square', delay = 0) {
    if (!ctx || !enabled) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  const fx = {
    airBrake: () => burst('highpass', 1800, 0.7, 0.9, 0.5),
    airSmall: () => burst('highpass', 2200, 0.8, 0.35, 0.25),
    blowOff: () => burst('bandpass', 2600, 1.2, 0.45, 0.18),
    tick: (hi) => tone(hi ? 1700 : 1350, 0.025, 0.12, 'square'),
    crash: (k = 1) => { burst('lowpass', 900, 0.5, 0.9, 0.9 * k); tone(55, 0.5, 0.6 * k, 'sine'); burst('bandpass', 3200, 2, 0.4, 0.3 * k, 0.05); },
    starter: () => { if (!ctx) return; for (let i = 0; i < 9; i++) tone(95 + (i % 2) * 15, 0.11, 0.18, 'sawtooth', i * 0.11); },
    click: () => tone(2400, 0.015, 0.1, 'square'),
    coupling: () => { burst('lowpass', 400, 0.7, 0.35, 0.8); tone(80, 0.25, 0.4, 'sine'); burst('highpass', 1800, 0.7, 0.6, 0.25, 0.25); },
    chime: () => { tone(880, 0.25, 0.12, 'sine'); tone(1320, 0.35, 0.1, 'sine', 0.12); },
    cash: () => { tone(1568, 0.12, 0.1, 'triangle'); tone(2093, 0.3, 0.1, 'triangle', 0.08); },
    flash: () => tone(3000, 0.08, 0.06, 'sine'),
  };

  // per-frame update from the truck state
  function update(T, view, env, dt) {
    if (!ctx || !nodes.e1) return;
    const t = ctx.currentTime, n = nodes;
    const on = enabled;
    const rpm = T.engineOn ? Math.max(T.rpm, 500) : T.starting > 0 ? 160 : 0;
    const fire = rpm / 60 * 3; // six-cylinder four-stroke firing frequency
    const load = T.engineOn ? Math.max(T.load, T.throttle * 0.6) : 0;
    const set = (p, v, k = 0.06) => p.setTargetAtTime(v, t, k);
    set(n.e1.frequency, Math.max(fire, 1));
    set(n.e2.frequency, Math.max(fire * 0.5, 1));
    set(n.sub.frequency, Math.max(fire * 0.5, 1));
    set(n.elp.frequency, 220 + rpm * 0.35 + load * 1400);
    const engV = T.engineOn || T.starting > 0 ? 0.32 + load * 0.33 + (rpm / 2200) * 0.18 : 0;
    set(n.engGain.gain, on ? engV * (view === 'cabin' ? 0.85 : 1) : 0, 0.08);
    set(n.rbp.frequency, 60 + rpm * 0.12);
    set(n.rg.gain, on ? engV * 0.35 : 0);
    // turbo spools with load and rpm
    const spool = T.engineOn ? Math.max(0, load - 0.2) * (rpm / 1800) : 0;
    set(n.turbo.frequency, 1800 + rpm * 1.6, 0.2);
    set(n.tg.gain, on ? spool * 0.022 : 0, 0.3);
    if (n.prevThr > 0.6 && T.throttle < 0.1 && T.engineOn && rpm > 1200) fx.blowOff();
    n.prevThr = T.throttle;
    // exhaust brake / retarder growl
    const eb = T.engineOn && T.throttle < 0.02 && (T.engineBrake > 0 || (T.retarder > 0 && !T.gearbox.retarder)) && rpm > 900 ? 1 : 0;
    set(n.jb.frequency, fire);
    set(n.jbf.frequency, 300 + rpm * 0.3);
    set(n.jbg.gain, on ? eb * 0.11 : 0, 0.05);
    // wind & road
    const v = Math.abs(T.v);
    set(n.wlp.frequency, 250 + v * 40);
    set(n.wg.gain, on ? Math.min(0.32, (v / 25) ** 2 * 0.22) * (view === 'cabin' ? 0.6 : 1) : 0);
    set(n.rlp.frequency, T.offRoad ? 110 : 190);
    set(n.rdg.gain, on ? Math.min(0.35, v / 25 * (T.offRoad ? 0.45 : 0.16)) : 0);
    set(n.rng.gain, on ? env.rain * (view === 'cabin' ? 0.22 : 0.12) : 0, 0.5);
    set(n.sqg.gain, on && T.slipping && v > 5 ? 0.12 : 0, 0.05);
    // horn
    set(n.hornG.gain, on && T.horn ? (T.cfg.airhorn ? 0.32 : 0.15) : 0, 0.02);
    const hf = T.cfg.airhorn ? [196, 247, 294, 330] : [392, 494, 494, 494];
    n.hornOsc.forEach((o, i) => set(o.frequency, hf[i], 0.01));
    // reverse beeper
    if (T.gear < 0 && T.engineOn) {
      n.beepT += dt;
      set(n.bg.gain, on && (n.beepT % 1) < 0.5 ? 0.05 : 0, 0.005);
    } else set(n.bg.gain, 0, 0.01);
    // cabin muffling
    set(cabinLP.frequency, view === 'cabin' ? 2300 : 20000, 0.1);
    // air brake release when stopping after braking
    if (T.brake > 0.3 && v < 0.2 && n.prevBrake <= 0.3) fx.airSmall();
    n.prevBrake = v < 0.2 ? T.brake : 0;
  }
  function setVolume(x) { vol = x; if (master) master.gain.value = x; }
  function setEnabled(e) { enabled = e; if (master) master.gain.value = e ? vol : 0; }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  return { init, update, fx, setVolume, setEnabled, suspend, resume, get ready() { return !!ctx; } };
})();
