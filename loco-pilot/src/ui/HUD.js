import { h, clear } from './dom.js';
import { t, tx, lang } from '../core/I18n.js';
import { bus } from '../core/EventBus.js';
import { settings } from '../core/Settings.js';
import { formatClock, formatDistance, clamp } from '../core/MathUtil.js';

const ASPECT_TEXT = { R: 'sig.R', Y: 'sig.Y', YY: 'sig.YY', G: 'sig.G' };

/**
 * In-game heads-up display: clock & next stop, speedometer with limits, controller/brake levers,
 * signal readout, air gauges, indicator lamps, track monitor, messages, alerts and subtitles.
 */
export class HUD {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.el = h('div.hud');
    this.visible = true;
    // small screens start with the track monitor folded away (T / MAP brings it back)
    this.monitorOn = !matchMedia('(max-width: 960px), (max-height: 560px)').matches;
    this.timer = 0;
    this.alerts = new Map();
    this.msgCooldown = new Map();
    this.build();
    this.offs = [
      bus.on('hud:message', (m) => this.message(m.text, m.kind, m.cooldown)),
      bus.on('hud:alert', (a) => this.alert(a)),
      bus.on('subtitle', (s) => this.subtitle(s)),
      bus.on('radio', (r) => this.message('📻 ' + r.text, 'info')),
    ];
  }

  build() {
    const chip = (k, cls = '') => {
      const v = h('div.v');
      const el = h('div.chip' + cls, h('div.k', k), v);
      return { el, v };
    };
    this.clock = chip('TIME');
    this.next = chip('NEXT STOP');
    this.delay = chip('TIMETABLE');
    this.weather = chip('WEATHER');
    this.top = h('div.hud-top', this.clock.el, this.next.el, this.delay.el, this.weather.el);
    // left: train & status
    this.trainName = h('div.v', { style: { fontSize: '16px' } });
    this.status = h('div.small', { style: { fontFamily: 'var(--f-body)', color: 'var(--muted)', fontSize: '13px' } });
    this.left = h('div.hud-left', h('div.chip', h('div.k', 'TRAIN'), this.trainName, this.status));
    // dash
    this.speedBig = h('div.big', '0');
    this.limitSign = h('span.limit-sign', '—');
    this.nextLimit = h('span.small', '');
    this.speedo = h('div.speedo.chip', this.speedBig, h('div.unit', 'KM/H'), h('div.lim', this.limitSign, this.nextLimit));
    const lever = (label, kind) => {
      const fill = h('div.fill.' + kind);
      const val = h('div.val', '0');
      const el = h('div.lever.chip', h('div.k', label), h('div.track', fill, kind === 't' ? h('div.mid') : null), val);
      return { el, fill, val };
    };
    this.lvT = lever('TE/BE', 't');
    this.lvB = lever('A9', 'b');
    this.lvI = lever('SA9', 'b');
    this.sigHead = h('div.sig-head', h('i'), h('i'), h('i'), h('i'));
    this.sigAsp = h('div.asp', '—');
    this.sigDist = h('div.dist', '');
    this.sigName = h('div.dist', '');
    this.sigBox = h('div.sigbox.chip', this.sigHead, h('div.sig-text', h('div.k', 'SIGNAL'), this.sigAsp, this.sigDist, this.sigName));
    this.gauges = h('div.gauges.chip');
    this.dash = h('div.hud-dash', this.sigBox, this.speedo, h('div.levers', this.lvT.el, this.lvB.el, this.lvI.el), this.gauges);
    // indicators
    this.inds = {};
    const indDefs = [['slip', 'WHEEL SLIP', 'yellow'], ['wsp', 'WSP', 'yellow'], ['vcb', 'VCB OPEN', 'red'], ['panto', 'PANTO DOWN', 'red'], ['atp', 'ATP', 'blue'], ['vcd', 'VCD', 'red'], ['emerg', 'EMERGENCY', 'red'], ['doors', 'DOORS OPEN', 'yellow'], ['sand', 'SAND', 'yellow'], ['comp', 'COMPRESSOR', 'green'], ['hl', 'HEADLIGHT', 'green']];
    this.indWrap = h('div.indicators');
    for (const [id, label, col] of indDefs) {
      const el = h('div.ind.' + col, label);
      this.inds[id] = el;
      this.indWrap.append(el);
    }
    // monitor
    this.monCanvas = h('canvas', { width: 500, height: 660 });
    this.monitor = h('div.monitor.chip', h('div.mt', h('span', 'TRACK MONITOR'), h('span', 'T')), this.monCanvas);
    this.messages = h('div.messages');
    this.alertEl = h('div', { style: { display: 'none' } });
    this.subEl = h('div.subtitle', { style: { display: 'none' } });
    this.fps = h('div.fps');
    this.help = h('div.hud-help', '');
    this.comfort = h('div.small');
    this.el.append(this.top, this.left, this.dash, this.indWrap, this.monitor, this.messages, this.alertEl, this.subEl, this.fps);
  }

  attach() {
    this.ui.hudLayer.append(this.el);
  }
  detach() {
    this.el.remove();
    this.offs.forEach((f) => f());
  }

  toggle() {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
  }

  toggleMonitor() {
    this.monitorOn = !this.monitorOn;
  }

  message(text, kind = 'info', cooldown = 0) {
    if (cooldown) {
      const last = this.msgCooldown.get(text) || 0;
      if (performance.now() - last < cooldown * 1000) return;
      this.msgCooldown.set(text, performance.now());
    }
    const m = h('div.msg.' + kind, text);
    this.messages.append(m);
    while (this.messages.children.length > 5) this.messages.firstChild.remove();
    setTimeout(() => m.remove(), kind === 'info' ? 9000 : 12000);
  }

  alert({ kind, text, level = 1, cooldown = 0 }) {
    const now = performance.now();
    const last = this.alerts.get(kind) || 0;
    if (cooldown && now - last < cooldown * 1000) return;
    this.alerts.set(kind, now);
    this.alertEl.className = 'alert l' + Math.min(level, 2);
    this.alertEl.textContent = text;
    this.alertEl.style.display = 'block';
    clearTimeout(this._alertT);
    this._alertT = setTimeout(() => (this.alertEl.style.display = 'none'), level >= 3 ? 5000 : 3200);
  }

  subtitle({ text, lang: l, duration }) {
    if (!settings.get('subtitles')) return;
    clear(this.subEl);
    this.subEl.append(h('span.lang', l === 'hi' ? 'उद्घोषणा · ANNOUNCEMENT' : 'ANNOUNCEMENT · उद्घोषणा'), text);
    this.subEl.style.display = 'block';
    clearTimeout(this._subT);
    this._subT = setTimeout(() => (this.subEl.style.display = 'none'), duration * 1000);
  }

  update(dt, j, extra) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.08;
    const p = j.player;
    const mode = settings.get('hudMode') === 'off' ? 'off' : j.difficulty.hud === 'minimal' || settings.get('hudMode') === 'minimal' ? 'minimal' : 'full';
    this.el.classList.toggle('hidden', !this.visible || mode === 'off' || extra.photo);
    const minimal = mode === 'minimal';
    const kmh = Math.abs(p.v) * 3.6;
    const lim = p.currentLimit();
    // top
    this.clock.v.textContent = formatClock(j.clock, true);
    const ns = j.nextStopInfo();
    if (ns) {
      clear(this.next.v);
      this.next.v.append(tx(ns.station.name), h('small', ` PF ${ns.pf || '—'} · ${formatDistance(ns.distance)}`));
      clear(this.delay.v);
      const dl = ns.delayMin;
      const cls = dl > 1.5 ? 'late' : dl < -1.5 ? 'early' : 'ontime';
      this.delay.v.append(h('span', `${formatClock(ns.sched)} `), h('small', `ETA ${formatClock(ns.eta)} `), h('span.' + cls, dl > 1.5 ? `+${Math.round(dl)}′` : dl < -1.5 ? `${Math.round(dl)}′` : '✓'));
    } else {
      this.next.v.textContent = '—';
      this.delay.v.textContent = '—';
    }
    const w = j.weather;
    this.weather.v.textContent = `${j.weatherDef.icon} ${tx(j.weatherDef.name)}${j.wetness > 0.3 ? ' · wet rail' : ''}`;
    this.trainName.textContent = `${p.number} ${j.trainDef.name[lang()] || j.trainDef.name.en}`;
    this.status.textContent = this.statusText(j);
    // speedometer
    this.speedBig.textContent = String(Math.round(kmh));
    this.speedo.classList.toggle('over', kmh > lim.kmh + 1);
    this.limitSign.textContent = String(Math.round(lim.kmh));
    const nl = p.limitsAhead(3000).find((r) => r.kmh < lim.kmh - 0.5 || r.kmh > lim.kmh + 0.5);
    this.nextLimit.textContent = minimal ? '' : nl ? `→ ${Math.round(nl.kmh)} in ${formatDistance(nl.distance)}` : '';
    // levers
    const tr = p.traction, br = p.brakes;
    const n = tr.notch;
    if (n >= 0) {
      this.lvT.fill.className = 'fill t';
      this.lvT.fill.style.height = `${(n / tr.spec.notches) * 50}%`;
      this.lvT.fill.style.top = 'auto';
      this.lvT.fill.style.bottom = '50%';
      this.lvT.val.textContent = n ? `T${n}` : '0';
    } else {
      this.lvT.fill.className = 'fill r';
      this.lvT.fill.style.height = `${(-n / tr.spec.brakeNotches) * 50}%`;
      this.lvT.fill.style.bottom = 'auto';
      this.lvT.fill.style.top = '50%';
      this.lvT.val.textContent = `B${-n}`;
    }
    this.lvB.fill.style.height = `${br.emergency ? 100 : br.a9 * 90}%`;
    this.lvB.val.textContent = br.emergency ? 'EMG' : br.a9 > 0.02 ? `${Math.round(br.a9 * 100)}%` : 'REL';
    this.lvI.fill.style.height = `${br.sa9 * 100}%`;
    this.lvI.val.textContent = br.sa9 > 0.02 ? `${Math.round(br.sa9 * 100)}%` : 'REL';
    // signal
    const showSig = j.difficulty.signalWarnings || !minimal;
    this.sigBox.style.display = showSig ? '' : 'none';
    const sa = j.signals.signalsAhead(p, 1, 4000)[0];
    const lamps = this.sigHead.children;
    for (const l of lamps) l.className = '';
    if (sa) {
      const a = sa.aspect;
      if (a === 'R') lamps[3].className = 'R';
      if (a === 'Y' || a === 'YY') lamps[2].className = 'Y';
      if (a === 'YY') lamps[0].className = 'Y';
      if (a === 'G') lamps[1].className = 'G';
      this.sigAsp.className = 'asp asp-' + a;
      this.sigAsp.textContent = settings.get('colorAssist') ? `${a === 'YY' ? 'YY' : a} · ${t(ASPECT_TEXT[a])}` : t(ASPECT_TEXT[a]);
      this.sigDist.textContent = formatDistance(sa.distance);
      this.sigName.textContent = sa.signal.name + (j.signals.routeIndicator(sa.signal) ? ' · ROUTE ⟋' : '');
    } else {
      this.sigAsp.textContent = '—';
      this.sigDist.textContent = '';
      this.sigName.textContent = '';
    }
    // gauges
    clear(this.gauges);
    const g = (k, v) => this.gauges.append(h('span.k', k), h('span.v', v));
    g('BP', `${br.bpFront.toFixed(1)}`);
    g('BC', `${br.bcAvg.toFixed(1)}`);
    g('MR', `${br.mr.toFixed(1)}`);
    g(tr.te >= 0 ? 'TE' : 'BE', `${Math.abs(tr.te / 1000).toFixed(0)} kN`);
    g('kV', (tr.voltage / 1000).toFixed(1));
    g(t('hud.comfort').toUpperCase(), `${Math.round(j.scoring.comfortNow)}%`);
    this.gauges.style.display = minimal ? 'none' : '';
    // indicators
    const blink = Math.floor(performance.now() / 350) % 2 === 0;
    const set = (id, on, blinkIt = false) => {
      this.inds[id].classList.toggle('on', !!on);
      this.inds[id].classList.toggle('blink', !!(on && blinkIt));
    };
    set('slip', tr.slipActive, true);
    set('wsp', p.wsp || p.slide);
    set('vcb', !tr.vcb);
    set('panto', tr.panto < 0.98);
    set('atp', j.safety.atpActive, true);
    set('vcd', j.safety.vcdAlarm > 0 || j.safety.vcdPenalty, true);
    set('emerg', br.emergency);
    set('doors', p.doorsOpen);
    set('sand', p.sander);
    set('comp', br.compressorOn);
    set('hl', p.headlight > 0);
    void blink;
    // monitor
    this.monitor.style.display = this.monitorOn && !minimal ? '' : 'none';
    if (this.monitorOn && !minimal) this.drawMonitor(j);
    // fps
    this.fps.textContent = settings.get('showFps') ? `${extra.fps.toFixed(0)} fps · ${extra.calls} calls · ${(extra.tris / 1000).toFixed(0)}k tris · ${extra.scale < 0.99 ? 'res ' + Math.round(extra.scale * 100) + '%' : ''}` : '';
    void w;
  }

  statusText(j) {
    const o = j.ops;
    const p = j.player;
    const hi = lang() === 'hi';
    if (j.state === 'complete') return hi ? 'यात्रा पूर्ण' : 'Journey complete';
    if (j.scoring.failed) return (hi ? 'विफल: ' : 'Failed: ') + j.scoring.failed;
    if (!p.traction.powered) return hi ? 'इंजन बंद — पैंटोग्राफ (O) और VCB (M)' : 'Loco not powered — raise pantograph (O), close VCB (M)';
    if (p.traction.reverser === 0) return hi ? 'रिवर्सर न्यूट्रल — R दबाएँ' : 'Reverser in neutral — press R';
    switch (o.state) {
      case 'origin': return o.originRA ? (hi ? 'राइट अवे — प्रस्थान करें' : 'Right away — depart') : (hi ? `प्रस्थान ${formatClock(j.departure)} — गार्ड की प्रतीक्षा` : `Departure ${formatClock(j.departure)} — waiting for guard`);
      case 'doors': case 'dwell': return hi ? 'दरवाज़े खुले — यात्री चढ़ उतर रहे हैं' : 'Doors open — passengers boarding';
      case 'waitTime': return hi ? 'निर्धारित प्रस्थान समय की प्रतीक्षा' : 'Waiting for booked departure time';
      case 'waitSignal': return hi ? 'स्टार्टर सिग्नल की प्रतीक्षा' : 'Waiting for the starter signal';
      case 'rightAway': return hi ? 'राइट अवे — दरवाज़े बंद हो रहे हैं' : 'Right away — doors closing';
      case 'complete': return hi ? 'गंतव्य पर पहुँचे' : 'Arrived at destination';
      default: break;
    }
    if (p.brakes.emergency) return hi ? 'आपात ब्रेक लगा — रुकने के बाद A से रिलीज़' : 'Emergency brake applied — release with A once stopped';
    return Math.abs(p.v) < 0.1 ? (hi ? 'रुकी हुई' : 'Standing') : (hi ? 'चल रही है' : 'Running');
  }

  drawMonitor(j) {
    const c = this.monCanvas.getContext('2d');
    const W = 500, H = 660;
    const p = j.player;
    const range = 3000;
    c.clearRect(0, 0, W, H);
    const y = (d) => H - 40 - (d / range) * (H - 70);
    const cx = 250;
    // distance grid
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.font = '600 20px Rajdhani, sans-serif';
    c.textAlign = 'left';
    for (let d = 0; d <= range; d += 500) {
      c.beginPath(); c.moveTo(20, y(d)); c.lineTo(W - 20, y(d)); c.stroke();
      if (d) c.fillText(`${d / 1000} km`, 6, y(d) - 4);
    }
    // track line (shifted for loops/turnouts)
    c.strokeStyle = '#9aa8b8';
    c.lineWidth = 6;
    c.beginPath();
    for (let d = 0; d <= range; d += 25) {
      const s = p.s + p.dir * d;
      const lat = p.path.lateralAt(s) - (p.dir > 0 ? -2.5 : 2.5);
      const x = cx - lat * 6 * p.dir;
      d ? c.lineTo(x, y(d)) : c.moveTo(x, y(d));
    }
    c.stroke();
    // stations
    for (const st of j.network.stations) {
      const d0 = (st.platformS0 - p.s) * p.dir, d1 = (st.platformS1 - p.s) * p.dir;
      const a = Math.min(d0, d1), b = Math.max(d0, d1);
      if (b < 0 || a > range) continue;
      c.fillStyle = 'rgba(255,154,46,0.25)';
      c.fillRect(cx + 30, y(Math.min(b, range)), 18, y(Math.max(a, 0)) - y(Math.min(b, range)));
      c.fillStyle = '#ffb35c';
      c.font = '700 22px Rajdhani, sans-serif';
      c.fillText(st.code, cx + 56, y(Math.max(a, 0)) - 6);
    }
    // speed limits
    c.textAlign = 'right';
    const lim = p.currentLimit().kmh;
    c.fillStyle = '#fff';
    c.font = '700 26px Rajdhani, sans-serif';
    let lastK = lim;
    for (const r of p.limitsAhead(range)) {
      if (Math.abs(r.kmh - lastK) < 0.5) continue;
      lastK = r.kmh;
      const yy = y(r.distance);
      c.fillStyle = r.r.kind === 'tsr' ? '#ffd54f' : '#ffffff';
      c.fillRect(cx - 120, yy - 2, 60, 4);
      c.fillText(String(Math.round(r.kmh)), cx - 130, yy + 9);
    }
    // signals
    for (const sa of j.signals.signalsAhead(p, 6, range)) {
      const yy = y(sa.distance);
      const col = sa.aspect === 'R' ? '#ff3b30' : sa.aspect === 'G' ? '#30d158' : '#ffcc00';
      c.fillStyle = '#111';
      c.fillRect(cx - 44, yy - 14, 28, sa.aspect === 'YY' ? 36 : 28);
      c.fillStyle = col;
      c.beginPath(); c.arc(cx - 30, yy, 9, 0, Math.PI * 2); c.fill();
      if (sa.aspect === 'YY') { c.beginPath(); c.arc(cx - 30, yy + 16, 7, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = col;
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx - 16, yy); c.lineTo(cx - 6, yy); c.stroke();
    }
    // level crossings
    for (const lc of j.world.def.levelCrossings) {
      const d = (lc.s - p.s) * p.dir;
      if (d < 0 || d > range) continue;
      c.strokeStyle = '#e57373';
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx - 14, y(d) - 8); c.lineTo(cx + 14, y(d) + 8); c.moveTo(cx - 14, y(d) + 8); c.lineTo(cx + 14, y(d) - 8); c.stroke();
    }
    // obstacles reported
    for (const ob of j.events.obstacles) {
      const d = (ob.s - p.s) * p.dir;
      if (d < 0 || d > range) continue;
      c.fillStyle = '#ff5252';
      c.font = '700 22px Rajdhani, sans-serif';
      c.textAlign = 'left';
      c.fillText('⚠', cx + 18, y(d) + 8);
    }
    // train
    c.fillStyle = '#3ba7f6';
    c.fillRect(cx - 12, y(0) - 4, 24, Math.min(36, (p.length / range) * (H - 70)) + 4);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.font = '700 24px Rajdhani, sans-serif';
    c.fillText(`${Math.round(Math.abs(p.v) * 3.6)} / ${Math.round(lim)}`, cx, H - 6);
    void clamp;
  }
}
