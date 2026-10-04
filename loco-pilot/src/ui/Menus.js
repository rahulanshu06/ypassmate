import { h, clear, seg, range, stars } from './dom.js';
import { t, tx, lang } from '../core/I18n.js';
import { settings } from '../core/Settings.js';
import { profile, LEVELS } from '../core/Profile.js';
import { TRAINS } from '../data/trains.js';
import { LOCOMOTIVES, LIVERIES, CAB_THEMES } from '../data/locomotives.js';
import { COACH_TYPES } from '../data/rollingStock.js';
import { ROUTES, FUTURE_ROUTES } from '../data/routes/index.js';
import { SCENARIOS, CAREER_DUTIES, WEATHER_PRESETS, DIFFICULTIES } from '../data/scenarios.js';
import { formatClock } from '../core/MathUtil.js';
import { trainLock, locoLock, liveryLock, cabThemeLock, scenarioLock, dutyLock, difficultyLock } from './unlocks.js';

const TIME_PRESETS = [
  [5.9, 'Dawn', 'भोर'], [8.5, 'Morning', 'सुबह'], [12.5, 'Noon', 'दोपहर'], [17.4, 'Golden hour', 'सुनहरी शाम'],
  [18.7, 'Dusk', 'सांझ'], [21.5, 'Night', 'रात'], [0.6, 'Midnight', 'आधी रात'],
];

function panel(title, sub, body, foot, onBack) {
  const el = h('div.screen',
    h('div.screen-shade.full'),
    h('div.panel.glass',
      h('div.panel-head', h('div.grow', h('h2.h-title', title), sub ? h('p.h-sub', sub) : null),
        onBack ? h('button.btn.small', { onclick: onBack }, '← ' + t('menu.back')) : null),
      h('div.panel-body', body),
      foot ? h('div.panel-foot', foot) : null));
  return el;
}

function lockPill(reason) {
  return reason ? h('span.pill.lock', '🔒 ' + reason) : null;
}

export class Menus {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
  }

  // ------------------------------------------------------------------ main menu
  main() {
    const g = this.game;
    const info = profile.levelInfo;
    const nextDuty = this.nextDuty();
    const items = [
      ['play', '▶', t('menu.play'), nextDuty ? tx(nextDuty.title) : t('menu.playSub'), () => this.playNext(), true],
      ['career', '★', t('menu.career'), `${lang() === 'hi' ? info.titleHi : info.title}`, () => this.ui.show(this.career(), { push: true })],
      ['quick', '⚡', t('menu.quick'), lang() === 'hi' ? 'अपनी गाड़ी, मौसम, समय चुनें' : 'Choose train, weather and time', () => this.ui.show(this.quickDrive(), { push: true })],
      ['scenarios', '◆', t('menu.scenarios'), lang() === 'hi' ? 'मिशन और चुनौतियाँ' : 'Missions & challenges', () => this.ui.show(this.scenarios(), { push: true })],
      ['training', '🎓', t('menu.training'), lang() === 'hi' ? 'चरण-दर-चरण प्रशिक्षण' : 'Step-by-step driver course', () => this.startTraining()],
      ['routes', '🗺', t('menu.routes'), '', () => this.ui.show(this.routes(), { push: true })],
      ['trains', '🚆', t('menu.trains'), '', () => this.ui.show(this.trains(), { push: true })],
      ['settings', '⚙', t('menu.settings'), '', () => this.ui.show(g.settingsScreen(), { push: true })],
      ['profile', '👤', t('menu.profile'), '', () => this.ui.show(this.profileScreen(), { push: true })],
    ];
    const tips = lang() === 'hi' ? [
      'भारी गाड़ी तुरंत नहीं रुकती — 110 किमी/घंटा से पूरी सर्विस ब्रेक में लगभग 700 मीटर लगते हैं।',
      'डबल पीला सिग्नल: अगला सिग्नल पीला होगा। पीला: अगले सिग्नल पर रुकने के लिए तैयार रहें।',
      'रीजेनरेटिव ब्रेक (S दबाकर थ्रॉटल शून्य से नीचे) ऊर्जा बचाता है और पहियों को घिसने से बचाता है।',
      'स्वचालित सिग्नल लाल हो तो रुकें, 1 मिनट (रात में 2 मिनट) प्रतीक्षा करें, फिर 10 किमी/घंटा से आगे बढ़ें।',
    ] : [
      'A heavy train does not stop like a car — from 110 km/h a full service application takes about 700 m.',
      'Double yellow: the next signal is at caution. Single yellow: be prepared to stop at the next signal.',
      'Regenerative braking (press S below notch 0) saves energy and spares the brake discs.',
      'An automatic signal at danger may be passed after stopping for 1 minute (2 at night), at 10 km/h max.',
      'Whistle boards (W/L, सी/फा) warn of a level crossing ahead — sound the horn.',
    ];
    const tip = tips[Math.floor(Math.random() * tips.length)];
    const el = h('div.screen',
      h('div.screen-shade'),
      h('div.menu-col',
        h('div.logo', h('div.l1', 'LOCO ', h('b', 'PILOT')), h('div.l2', t('menu.tagline')), h('div.l3', 'लोको पायलट')),
        h('nav.menu-list', items.map(([id, ico, label, sub, fn, primary]) => h('button.menu-item' + (primary ? '.primary' : ''), { onclick: fn, dataset: { id } },
          h('span.ico', ico), h('span', label, sub ? h('span.sub', sub) : null)))),
        h('div.menu-foot',
          h('div.row', { style: { gap: '.5em', marginBottom: '.6em' } },
            seg([{ value: 'en', label: 'EN' }, { value: 'hi', label: 'हिं' }], settings.get('language'), (v) => settings.set('language', v))),
          'Phase 1 · Vertical slice v0.1 — Indrapuri–Vindhyanagar route', h('br'),
          'All names, routes and liveries are fictional. Built with three.js.')),
      h('div.profile-card.glass',
        h('div.row', h('div.grow', h('div.name', profile.data.name), h('div.muted.small', `${t('menu.career')} · L${info.level} — ${lang() === 'hi' ? info.titleHi : info.title}`)),
          h('div', { style: { fontFamily: 'var(--f-head)', fontSize: '1.8em', fontWeight: 700, color: 'var(--accent)' } }, 'L' + info.level)),
        h('div.xpbar', h('i', { style: { width: Math.round(info.progress * 100) + '%' } })),
        h('div.row.small.muted', h('span.grow', `${profile.data.xp} XP`), info.next ? `${info.next.xp - profile.data.xp} XP → L${info.next.level}` : 'MAX'),
        h('div.row.small', { style: { marginTop: '.5em' } }, h('span.muted.grow', lang() === 'hi' ? 'प्रतिष्ठा' : 'Reputation'), `${profile.data.reputation}/100`),
        h('div.row.small', h('span.muted.grow', lang() === 'hi' ? 'यात्राएँ' : 'Journeys'), String(profile.data.stats.completed)),
        h('div.row.small', h('span.muted.grow', lang() === 'hi' ? 'दूरी' : 'Distance'), `${profile.data.stats.distanceKm.toFixed(1)} km`)),
      h('div.tip-card.glass', h('b', lang() === 'hi' ? 'सुझाव' : 'Loco pilot tip'), h('div', tip)));
    return { el, rerender: () => this.ui.show(this.main()) };
  }

  nextDuty() {
    if (!profile.data.tutorialDone) return CAREER_DUTIES[0];
    return CAREER_DUTIES.find((d) => !dutyLock(d) && !profile.data.duties[d.id] && d.kind !== 'training') || CAREER_DUTIES.filter((d) => !dutyLock(d) && d.train).pop();
  }

  playNext() {
    const d = this.nextDuty();
    if (!d || d.kind === 'training') return this.startTraining();
    this.game.openBriefing(this.dutyConfig(d));
  }

  dutyConfig(d) {
    return {
      trainId: d.train, from: d.from, to: d.to, startHours: d.time, weather: d.weather, difficulty: d.difficulty, traffic: 0.85,
      randomEvents: d.level >= 2, xp: d.xp, dutyId: d.id, title: tx(d.title), livery: profile.data.customization.livery,
    };
  }

  startTraining() {
    this.game.openBriefing({
      trainId: 'PASS12', from: 'IPT', to: 'SNP', startHours: 9.2, weather: 'clear', difficulty: 'easy', traffic: 0.4, randomEvents: false,
      tutorial: true, xp: 220, dutyId: 'c1-train', title: lang() === 'hi' ? 'चालक प्रशिक्षण' : 'Driver training', livery: profile.data.customization.livery,
    });
  }

  // ------------------------------------------------------------------ quick drive
  quickDrive() {
    const st = this.qd || (this.qd = {
      trainId: 'PASS12', loco: 'EP60', route: 'ivr', from: 'IPT', to: 'VNJ', startHours: 9, weather: 'clear', difficulty: 'normal',
      traffic: 0.8, randomEvents: true, livery: profile.data.customization.livery,
    });
    if (trainLock(TRAINS[st.trainId])) st.trainId = 'PASS12';
    const body = h('div');
    const render = () => {
      clear(body);
      // trains
      body.append(h('div.sect', t('qd.train')));
      const tg = h('div.grid.c4');
      for (const tr of Object.values(TRAINS)) {
        const lock = trainLock(tr);
        const card = h('button.card' + (st.trainId === tr.id ? '.sel' : '') + (lock ? '.locked' : ''), {
          onclick: () => {
            if (lock) return this.ui.toast(lock);
            st.trainId = tr.id;
            render();
          },
        }, h('div.t', `${tr.number} ${tx(tr.name)}`), h('div.d', tx(tr.description)),
        h('div.meta', h('span.pill', lang() === 'hi' ? tr.categoryHi : tr.category), tr.coaches ? h('span.pill', `${tr.coaches.length} coaches`) : null, tr.maxSpeed ? h('span.pill', `${tr.maxSpeed} km/h`) : null, lockPill(lock)));
        tg.append(card);
      }
      body.append(tg);
      // locomotive
      body.append(h('div.sect', t('qd.loco')));
      const lg = h('div.grid.c4');
      for (const l of Object.values(LOCOMOTIVES)) {
        const lock = locoLock(l);
        lg.append(h('button.card' + (st.loco === l.id ? '.sel' : '') + (lock ? '.locked' : ''), { onclick: () => (lock ? this.ui.toast(lock) : ((st.loco = l.id), render())) },
          h('div.t', lang() === 'hi' ? l.nameHi : l.name), h('div.d', lang() === 'hi' ? l.roleHi : l.role), h('div.meta', lockPill(lock))));
      }
      body.append(lg);
      // route + journey
      body.append(h('div.sect', `${t('qd.route')} · ${t('qd.journey')}`));
      const route = ROUTES.ivr;
      const stations = route.stations;
      const fromSel = h('select', stations.slice(0, -1).map((s) => h('option', { value: s.id, selected: s.id === st.from }, tx(s.name))));
      const toSel = h('select', stations.slice(1).map((s) => h('option', { value: s.id, selected: s.id === st.to }, tx(s.name))));
      const fix = () => {
        const ids = stations.map((s) => s.id);
        if (ids.indexOf(st.to) <= ids.indexOf(st.from)) st.to = ids[ids.indexOf(st.from) + 1];
      };
      fromSel.addEventListener('change', () => { st.from = fromSel.value; fix(); render(); });
      toSel.addEventListener('change', () => { st.to = toSel.value; fix(); render(); });
      const rg = h('div.grid.c3');
      rg.append(h('div.card.sel', h('div.t', tx(route.name)), h('div.d', tx(route.region)), h('div.meta', h('span.pill', '33.5 km'), h('span.pill', '5 stations'), h('span.pill.ok', 'Electrified'))));
      rg.append(h('div.card', { style: { cursor: 'default' } }, h('div.field', h('label', t('qd.from')), fromSel), h('div.field', h('label', t('qd.to')), toSel),
        h('div.d', lang() === 'hi' ? 'डाउन दिशा (इन्द्रपुरी → विंध्यनगर)' : 'Down direction (towards Vindhyanagar)')));
      for (const fr of FUTURE_ROUTES.slice(0, 1)) rg.append(h('div.card.locked', h('div.t', tx(fr.name)), h('div.d', tx(fr.region)), h('div.meta', lockPill('Coming in ' + fr.lockedReason))));
      body.append(rg);
      // weather & time
      body.append(h('div.sect', `${t('qd.weather')} · ${t('qd.time')}`));
      const wg = h('div.row', { style: { flexWrap: 'wrap', gap: '.6em' } });
      wg.append(seg(Object.values(WEATHER_PRESETS).map((w) => ({ value: w.id, label: `${w.icon} ${tx(w.name)}` })), st.weather, (v) => (st.weather = v)));
      body.append(wg);
      const timeRow = h('div.row', { style: { marginTop: '.7em', flexWrap: 'wrap' } });
      timeRow.append(seg(TIME_PRESETS.map(([hv, en, hi]) => ({ value: hv, label: lang() === 'hi' ? hi : en })), TIME_PRESETS.find((p) => Math.abs(p[0] - st.startHours) < 0.01)?.[0], (v) => { st.startHours = v; render(); }));
      timeRow.append(h('div', { style: { minWidth: '260px', flex: 1 } }, range(0, 23.75, 0.25, st.startHours, (v) => (st.startHours = v), (v) => formatClock(v))));
      body.append(timeRow);
      // difficulty
      body.append(h('div.sect', t('qd.difficulty')));
      body.append(seg(Object.keys(DIFFICULTIES).map((id) => ({ value: id, label: t('diff.' + id) + (difficultyLock(id) ? ' 🔒' : ''), disabled: !!difficultyLock(id), title: difficultyLock(id) || '' })), st.difficulty, (v) => { st.difficulty = v; render(); }));
      body.append(h('p.muted.small', tx(DIFFICULTIES[st.difficulty].desc)));
      // traffic & events & livery
      body.append(h('div.sect', `${t('qd.traffic')} · ${t('qd.events')}`));
      body.append(h('div.grid.c2',
        h('div.field', h('label', t('qd.traffic')), range(0, 1, 0.05, st.traffic, (v) => (st.traffic = v), (v) => (v < 0.25 ? 'Light' : v < 0.7 ? 'Normal' : 'Busy'))),
        h('div.field', h('label', t('qd.events')), seg([{ value: true, label: 'On' }, { value: false, label: 'Off' }], st.randomEvents, (v) => (st.randomEvents = v)))));
      body.append(h('div.sect', lang() === 'hi' ? 'इंजन लिवरी' : 'Locomotive livery'));
      const lv = h('div.grid.c3');
      for (const l of Object.values(LIVERIES)) {
        const lock = liveryLock(l);
        lv.append(h('button.card' + (st.livery === l.id ? '.sel' : '') + (lock ? '.locked' : ''), { onclick: () => (lock ? this.ui.toast(lock) : ((st.livery = l.id), render())) },
          h('div.row', h('span', { style: { width: '42px', height: '22px', borderRadius: '4px', background: `linear-gradient(90deg, ${l.body} 0 40%, ${l.band} 40% 75%, ${l.stripe} 75%)` } }), h('div.t', lang() === 'hi' ? l.nameHi : l.name)), h('div.meta', lockPill(lock))));
      }
      body.append(lv);
    };
    render();
    const startBtn = h('button.btn.primary', { onclick: () => {
      const tr = TRAINS[st.trainId];
      this.game.openBriefing({ ...st, title: `${tr.number} ${tx(tr.name)}`, xp: null });
    } }, t('menu.start') + ' →');
    const el = panel(t('qd.title'), lang() === 'hi' ? 'अपनी यात्रा स्वयं बनाइए' : 'Build your own journey', body, [startBtn], () => this.ui.back());
    return { el, rerender: render };
  }

  // ------------------------------------------------------------------ career
  career() {
    const info = profile.levelInfo;
    const body = h('div');
    body.append(h('div.row', { style: { alignItems: 'stretch', gap: '1em', flexWrap: 'wrap' } },
      h('div.card', { style: { flex: '1 1 260px', cursor: 'default' } },
        h('div.muted.small', lang() === 'hi' ? 'वर्तमान पद' : 'Current grade'),
        h('div.t', { style: { fontSize: '1.5em' } }, `L${info.level} · ${lang() === 'hi' ? info.titleHi : info.title}`),
        h('div.xpbar', h('i', { style: { width: Math.round(info.progress * 100) + '%' } })),
        h('div.small.muted', `${profile.data.xp} XP${info.next ? ` · next: ${info.next.xp} XP` : ''} · Reputation ${profile.data.reputation}`)),
      h('div.card', { style: { flex: '2 1 380px', cursor: 'default' } },
        h('div.muted.small', lang() === 'hi' ? 'पदोन्नति मार्ग' : 'Progression'),
        h('div.grid.c3', { style: { marginTop: '.4em' } }, LEVELS.map((l) => h('div.small', { style: { opacity: l.level <= info.level ? 1 : 0.55 } },
          h('b', `L${l.level} `), lang() === 'hi' ? l.titleHi : l.title, h('div.muted', l.focus)))))));
    for (const lvl of [1, 2, 3, 4, 5, 6]) {
      const duties = CAREER_DUTIES.filter((d) => d.level === lvl);
      if (!duties.length) continue;
      body.append(h('div.sect', `Level ${lvl} — ${LEVELS[lvl - 1].focus}`));
      const g = h('div.grid.c3');
      for (const d of duties) {
        const lock = dutyLock(d);
        const done = profile.data.duties[d.id] || (d.kind === 'training' && profile.data.tutorialDone ? { stars: 1 } : null);
        const tr = d.train ? TRAINS[d.train] : null;
        g.append(h('button.card' + (lock ? '.locked' : ''), { onclick: () => {
          if (lock) return this.ui.toast(lock);
          if (d.kind === 'training') return this.startTraining();
          this.game.openBriefing(this.dutyConfig(d));
        } }, done ? h('span.stars', stars(done.stars || 0)) : null,
        h('div.t', tx(d.title)),
        tr ? h('div.d', `${tr.number} ${tx(tr.name)} · ${d.from} → ${d.to} · ${formatClock(d.time)} · ${tx(WEATHER_PRESETS[d.weather].name)}`) : h('div.d', lang() === 'hi' ? 'स्टार्ट-अप, सिग्नल, ब्रेकिंग, स्टेशन पर रुकना' : 'Start-up, signals, braking, station stops'),
        h('div.meta', h('span.pill', `+${d.xp || 0} XP`), d.difficulty ? h('span.pill', t('diff.' + d.difficulty)) : null, done ? h('span.pill.ok', '✓') : null, lockPill(lock))));
      }
      body.append(g);
    }
    const el = panel(t('menu.career'), lang() === 'hi' ? 'सहायक लोको पायलट से मुख्य लोको निरीक्षक तक' : 'From assistant loco pilot to chief loco inspector', body, null, () => this.ui.back());
    return { el, rerender: () => {} };
  }

  // ------------------------------------------------------------------ scenarios
  scenarios() {
    const body = h('div.grid.c3');
    for (const s of SCENARIOS) {
      const lock = scenarioLock(s);
      const rec = profile.data.scenarios[s.id];
      const tr = s.train ? TRAINS[s.train] : null;
      body.append(h('button.card' + (lock ? '.locked' : ''), { onclick: () => {
        if (lock) return this.ui.toast(lock);
        this.game.openBriefing({ trainId: s.train, from: s.from, to: s.to, startHours: s.time, weather: s.weather, difficulty: s.difficulty, traffic: s.traffic, randomEvents: false, events: s.events || [], scenarioId: s.id, xp: s.xp, title: tx(s.title), brief: tx(s.brief), goal: s.goal, livery: profile.data.customization.livery });
      } }, rec ? h('span.stars', stars(rec.stars)) : null,
      h('div.t', tx(s.title)), h('div.d', tx(s.brief)),
      h('div.meta', (s.tags || []).map((tg) => h('span.pill', tg)), tr ? h('span.pill', tr.number) : null, s.xp ? h('span.pill', `+${s.xp} XP`) : null, lockPill(lock))));
    }
    const el = panel(t('menu.scenarios'), lang() === 'hi' ? 'विशेष परिस्थितियाँ — बारिश, कोहरा, खराबी, आपातकाल' : 'Special situations — rain, fog, failures, emergencies', body, null, () => this.ui.back());
    return { el };
  }

  // ------------------------------------------------------------------ routes
  routes() {
    const r = ROUTES.ivr;
    const body = h('div');
    const canvas = h('canvas', { width: 1000, height: 170, style: { width: '100%', height: '170px', background: 'rgba(0,0,0,.25)', borderRadius: '8px' } });
    body.append(h('div.row', { style: { alignItems: 'flex-start', gap: '1.2em', flexWrap: 'wrap' } },
      h('div', { style: { flex: '1 1 420px' } }, h('h3.h-title', { style: { fontSize: '1.5em' } }, tx(r.name)), h('p.muted', tx(r.description)),
        h('div.spec', h('span', 'Length'), h('span', '33.5 km double line, 25 kV AC electrified'), h('span', 'Max speed'), h('span', '120 km/h (100 in the ghat)'),
          h('span', 'Ruling gradient'), h('span', '1 in 150 rising to Basantgarh'), h('span', 'Features'), h('span', '6-span Sona river truss bridge, Kalikhoh tunnel, 4 level crossings, 2 road over-bridges'),
          h('span', 'Signalling'), h('span', '4-aspect automatic block, station home/starter/advanced starter, junction route indicators'))),
      h('div', { style: { flex: '1 1 320px' } }, h('div.sect', 'Stations'), h('table.tt', h('tr', h('th', 'Code'), h('th', 'Station'), h('th', 'km'), h('th', 'Type')),
        r.stations.map((s) => h('tr', h('td.num', s.code), h('td', tx(s.name)), h('td', (r.kmOffset + s.sCenter / 1000).toFixed(1)), h('td', s.size)))))));
    body.append(h('div.sect', lang() === 'hi' ? 'ढाल प्रोफ़ाइल' : 'Gradient profile'), canvas);
    setTimeout(() => {
      const ctx = canvas.getContext('2d');
      const pts = r.profile;
      const maxS = pts[pts.length - 1][0];
      const minE = 70, maxE = 140;
      ctx.strokeStyle = '#ff9a2e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      pts.forEach(([s, e], i) => {
        const x = (s / maxS) * 980 + 10, y = 160 - ((e - minE) / (maxE - minE)) * 140;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = '#cfd8e3';
      ctx.font = '600 14px Rajdhani, sans-serif';
      for (const s of r.stations) {
        const x = (s.sCenter / maxS) * 980 + 10;
        ctx.fillRect(x - 1, 10, 2, 150);
        ctx.fillText(s.code, x + 4, 24);
      }
      for (const tn of r.tunnels) ctx.fillText('Tunnel', (tn.s0 / maxS) * 980 + 10, 150);
      ctx.fillText('Sona bridge', (5200 / maxS) * 980 + 10, 150);
    }, 30);
    body.append(h('div.sect', lang() === 'hi' ? 'आगामी मार्ग' : 'Upcoming routes'));
    body.append(h('div.grid.c4', FUTURE_ROUTES.map((fr) => h('div.card.locked', h('div.t', tx(fr.name)), h('div.d', tx(fr.region)), h('div.meta', lockPill('Coming in ' + fr.lockedReason))))));
    const el = panel(t('menu.routes'), null, body, null, () => this.ui.back());
    return { el };
  }

  // ------------------------------------------------------------------ trains
  trains() {
    const body = h('div');
    let tab = 'locos';
    const render = () => {
      clear(body);
      body.append(h('div.tabs', { style: { marginBottom: '1em' } }, [['locos', 'Locomotives'], ['coaches', 'Rolling stock'], ['services', 'Train services']].map(([id, label]) =>
        h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; render(); } }, label))));
      if (tab === 'locos') {
        body.append(h('div.grid.c2', Object.values(LOCOMOTIVES).map((l) => {
          const lock = locoLock(l);
          return h('div.card' + (lock ? '.locked' : ''), { style: { cursor: 'default' } }, h('div.t', lang() === 'hi' ? l.nameHi : l.name), h('div.d', lang() === 'hi' ? l.roleHi : l.role),
            h('div.spec', { style: { marginTop: '.4em' } }, (l.specs || []).flat().map((x) => h('span', x))), h('div.meta', lockPill(lock), l.available ? h('span.pill.ok', 'Drivable') : null));
        })));
      } else if (tab === 'coaches') {
        body.append(h('div.grid.c4', Object.values(COACH_TYPES).map((c) => h('div.card', { style: { cursor: 'default' } }, h('div.t', `${c.code} — ${c.name}`), h('div.d', c.labelHi || ''),
          h('div.meta', h('span.pill', `${((c.tare + c.load) / 1000).toFixed(0)} t loaded`), h('span.pill', c.wagon ? `${c.length} m` : '23.5 m'), c.ac ? h('span.pill.ok', 'AC') : null)))));
      } else {
        body.append(h('div.grid.c2', Object.values(TRAINS).map((tr) => {
          const lock = trainLock(tr);
          return h('div.card' + (lock ? '.locked' : ''), { style: { cursor: 'default' } }, h('div.t', `${tr.number} ${tx(tr.name)}`), h('div.d', tx(tr.description)),
            tr.coaches ? h('div.row', { style: { flexWrap: 'wrap', gap: '3px', marginTop: '.4em' } }, h('span.pill', 'LOCO'), tr.coaches.map((c) => h('span.pill', COACH_TYPES[c].code))) : null,
            h('div.meta', tr.stops ? h('span.pill', `Stops: ${tr.stops.join(', ')}`) : null, lockPill(lock)));
        })));
      }
    };
    render();
    const el = panel(t('menu.trains'), lang() === 'hi' ? 'इंजन, डिब्बे और गाड़ियाँ' : 'Locomotives, coaches and services', body, null, () => this.ui.back());
    return { el, rerender: render };
  }

  // ------------------------------------------------------------------ profile
  profileScreen() {
    const body = h('div');
    const render = () => {
      clear(body);
      const d = profile.data, s = d.stats, info = profile.levelInfo;
      const name = h('input', { type: 'text', value: d.name, maxlength: 24 });
      name.addEventListener('change', () => profile.rename(name.value));
      body.append(h('div.grid.c2',
        h('div.card', { style: { cursor: 'default' } }, h('div.field', h('label', 'Name'), name),
          h('div.t', { style: { marginTop: '.5em' } }, `L${info.level} · ${lang() === 'hi' ? info.titleHi : info.title}`),
          h('div.xpbar', h('i', { style: { width: Math.round(info.progress * 100) + '%' } })), h('div.small.muted', `${d.xp} XP · Reputation ${d.reputation}/100`)),
        h('div.card', { style: { cursor: 'default' } }, h('div.spec',
          h('span', 'Journeys completed'), h('span', `${s.completed} / ${s.journeys}`), h('span', 'Distance driven'), h('span', `${s.distanceKm.toFixed(1)} km`),
          h('span', 'Driving time'), h('span', `${Math.round(s.drivingTimeSec / 60)} min`), h('span', 'Perfect stops'), h('span', `${s.perfectStops} / ${s.stops}`),
          h('span', 'On-time arrivals'), h('span', String(s.onTimeArrivals)), h('span', 'SPADs'), h('span', String(s.spads)), h('span', 'Best score'), h('span', String(s.bestScore))))));
      body.append(h('div.sect', lang() === 'hi' ? 'अनुकूलन' : 'Customisation'));
      const lv = h('div.grid.c3');
      for (const l of Object.values(LIVERIES)) {
        const lock = liveryLock(l);
        lv.append(h('button.card' + (d.customization.livery === l.id ? '.sel' : '') + (lock ? '.locked' : ''), { onclick: () => (lock ? this.ui.toast(lock) : (profile.setCustomization('livery', l.id), render())) },
          h('div.row', h('span', { style: { width: '42px', height: '22px', borderRadius: '4px', background: `linear-gradient(90deg, ${l.body} 0 40%, ${l.band} 40% 75%, ${l.stripe} 75%)` } }), h('div.t', 'Livery: ' + (lang() === 'hi' ? l.nameHi : l.name))), h('div.meta', lockPill(lock))));
      }
      for (const c of Object.values(CAB_THEMES)) {
        const lock = cabThemeLock(c);
        lv.append(h('button.card' + (d.customization.cabTheme === c.id ? '.sel' : '') + (lock ? '.locked' : ''), { onclick: () => (lock ? this.ui.toast(lock) : (profile.setCustomization('cabTheme', c.id), render())) },
          h('div.row', h('span', { style: { width: '42px', height: '22px', borderRadius: '4px', background: `linear-gradient(90deg, ${c.walls} 0 50%, ${c.desk} 50%)` } }), h('div.t', 'Cab: ' + (lang() === 'hi' ? c.nameHi : c.name))), h('div.meta', lockPill(lock))));
      }
      body.append(lv);
      body.append(h('div.sect', lang() === 'hi' ? 'हाल की यात्राएँ' : 'Recent journeys'));
      body.append(d.history.length ? h('table.tt', h('tr', h('th', 'When'), h('th', 'Journey'), h('th', 'Score'), h('th', 'Result')),
        d.history.map((r) => h('tr', h('td', new Date(r.at).toLocaleString()), h('td', r.title), h('td.num', String(r.total)), h('td', r.completed ? stars(r.stars) : 'Failed')))) : h('p.muted', '—'));
      body.append(h('div', { style: { marginTop: '1.2em' } }, h('button.btn.danger.small', { onclick: async () => {
        const ok = await this.ui.modal('Reset profile?', 'This permanently erases XP, unlocks and statistics stored in this browser.', [{ label: 'Cancel', value: false }, { label: 'Reset', value: true, danger: true }]);
        if (ok) {
          profile.reset();
          render();
        }
      } }, 'Reset profile')));
    };
    render();
    const el = panel(t('menu.profile'), null, body, null, () => this.ui.back());
    return { el, rerender: render };
  }
}
