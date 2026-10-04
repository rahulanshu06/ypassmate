import { h, clear, stars } from './dom.js';
import { t, tx, lang } from '../core/I18n.js';
import { formatClock, formatDuration } from '../core/MathUtil.js';
import { profile } from '../core/Profile.js';
import { TRAINS } from '../data/trains.js';
import { WEATHER_PRESETS, DIFFICULTIES } from '../data/scenarios.js';
import { COACH_TYPES } from '../data/rollingStock.js';
import { ACTIONS, input, keyLabel } from '../core/Input.js';

/** Pre-journey briefing with timetable, consist and procedure checklist. */
export function briefingScreen(ui, game, journey) {
  const c = journey.config;
  const tr = journey.trainDef;
  const p = journey.player;
  const diff = journey.difficulty;
  const w = WEATHER_PRESETS[c.weather];
  const rows = journey.timetable.rows;
  const coaches = tr.coaches.reduce((m, id) => ((m[id] = (m[id] || 0) + 1), m), {});
  const checklist = diff.autoStart ? (lang() === 'hi' ? [
    'गार्ड की “राइट अवे” (हरी झंडी) और स्टार्टर सिग्नल हरा/पीला होने की प्रतीक्षा करें।',
    'इंजन ब्रेक (SA9) छोड़ें — ] / [ कुंजियाँ, ट्रेन ब्रेक A9 को रिलीज़ (A) करें।',
    'थ्रॉटल धीरे बढ़ाएँ (W) — पहले 30 किमी/घंटा यार्ड प्रतिबंध का पालन करें।',
  ] : [
    'Wait for the guard’s right away and the starter signal to clear (yellow/green).',
    'Release the loco brake (SA9: [ ) and the train brake (A9: A).',
    'Open the throttle gently (W). Observe the 30 km/h yard limit until clear of the points.',
  ]) : [
    'Battery on → raise pantograph (O) and wait for OHE voltage on the DDU.',
    'Close the VCB (M) with the controller at 0. Compressors start: build MR to 8 kg/cm².',
    'Move A9 to release/running (A) and charge the brake pipe to 5 kg/cm².',
    'Reverser forward (R). Hold the train on SA9 until the guard gives right away.',
    'Vigilance control is active: acknowledge with Q at least every minute while moving.',
  ];
  const el = h('div.screen', h('div.screen-shade.full'),
    h('div.panel.glass',
      h('div.panel-head', h('div.grow', h('div.muted.small', c.scenarioId ? 'SCENARIO' : c.dutyId ? 'CAREER DUTY' : c.tutorial ? 'TRAINING' : 'QUICK DRIVE'),
        h('h2.h-title', c.title || `${tr.number} ${tx(tr.name)}`), h('p.h-sub', `${formatClock(c.startHours)} · ${w.icon} ${tx(w.name)} · ${t('diff.' + diff.id)}`))),
      h('div.panel-body',
        c.brief ? h('p', { style: { fontSize: '1.05em', lineHeight: 1.5, marginTop: 0 } }, c.brief) : null,
        h('div.brief',
          h('div',
            h('div.sect', lang() === 'hi' ? 'कार्यकारी समय सारणी' : 'Working timetable'),
            h('table.tt', h('tr', h('th', 'Station'), h('th', 'PF'), h('th', 'Arr'), h('th', 'Dep'), h('th', '')),
              rows.map((r) => h('tr',
                h('td', tx(r.station.name)), h('td.num', r.pf ? String(r.pf) : '—'),
                h('td.num', r.arr != null ? formatClock(r.arr) : r.pass != null ? '' : '—'),
                h('td.num', r.kind === 'dep' ? formatClock(r.sched) : r.dep != null ? formatClock(r.dep) : r.pass != null ? formatClock(r.pass) : '—'),
                h('td.small.muted', r.kind === 'pass' ? 'pass' : r.kind === 'arr' ? 'terminates' : r.kind === 'dep' ? 'start' : 'stop')))),
            h('div.sect', lang() === 'hi' ? 'प्रक्रिया' : 'Procedure'),
            h('ol.checklist.small', checklist.map((x) => h('li', x)))),
          h('div',
            h('div.sect', lang() === 'hi' ? 'गाड़ी' : 'Consist'),
            h('div.spec',
              h('span', 'Locomotive'), h('span', `${p.consist.loco.name} #30417`),
              h('span', 'Coaches'), h('span', `${tr.coaches.length} (${Object.entries(coaches).map(([k, n]) => `${n}×${COACH_TYPES[k].code}`).join(', ')})`),
              h('span', 'Trailing load'), h('span', `${Math.round((p.mass - p.consist.loco.mass) / 1000)} t (total ${Math.round(p.mass / 1000)} t)`),
              h('span', 'Length'), h('span', `${Math.round(p.length)} m`),
              h('span', 'Max permitted'), h('span', `${tr.maxSpeed} km/h`),
              h('span', 'Brakes'), h('span', 'Twin-pipe air, disc brakes, regen'),
              h('span', 'Rail'), h('span', journey.wetness > 0.3 ? 'Wet — reduced adhesion' : 'Dry')),
            h('div.sect', lang() === 'hi' ? 'नियम' : 'Rules for this duty'),
            h('div.spec.small',
              h('span', 'ATP auto-brake'), h('span', diff.atp ? 'On' : 'Off'),
              h('span', 'Signal warnings'), h('span', diff.signalWarnings ? 'On' : 'Off'),
              h('span', 'Vigilance (VCD)'), h('span', diff.vcd ? 'Active (Q)' : 'Off'),
              h('span', 'SPAD'), h('span', diff.spadEnds ? 'Ends the journey' : 'Heavy penalty'),
              h('span', 'Cold start'), h('span', diff.autoStart ? 'No' : 'Yes')),
            h('div.sect', lang() === 'hi' ? 'मुख्य नियंत्रण' : 'Key controls'),
            h('div.spec.small', ['throttleUp', 'throttleDown', 'brakeApply', 'brakeRelease', 'indRelease', 'emergency', 'horn', 'headlight', 'camera', 'pause'].map((id) => {
              const a = ACTIONS.find((x) => x.id === id);
              return [h('span', h('span.kbd', keyLabel((input.bindings[id] || [])[0]))), h('span', a.label)];
            }))))),
      h('div.panel-foot',
        h('button.btn', { onclick: () => game.quitToMenu() }, t('menu.back')),
        h('button.btn.primary', { autofocus: true, onclick: () => game.beginJourney() }, (lang() === 'hi' ? 'ड्यूटी शुरू करें' : 'Start duty') + ' →'))));
  return { el };
}

export function pauseScreen(ui, game) {
  const el = h('div.screen.center', h('div.screen-shade.full'),
    h('div.glass', { style: { position: 'relative', zIndex: 1, width: 'min(380px, 90vw)', padding: '1.4em' } },
      h('h2.h-title', t('pause.title')),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '.5em', marginTop: '1em' } },
        h('button.btn.primary', { autofocus: true, onclick: () => game.resume() }, t('pause.resume')),
        h('button.btn', { onclick: () => ui.show(game.settingsScreen(true), { push: true }) }, t('pause.settings')),
        h('button.btn', { onclick: () => ui.show(controlsHelp(ui), { push: true }) }, t('pause.controls')),
        h('button.btn', { onclick: () => game.openPhotoMode() }, t('pause.photo')),
        h('button.btn', { onclick: () => game.restartJourney() }, t('pause.restart')),
        h('button.btn.danger', { onclick: async () => {
          const ok = await ui.modal(lang() === 'hi' ? 'मुख्य मेनू पर जाएँ?' : 'Quit to main menu?', lang() === 'hi' ? 'इस यात्रा की प्रगति सहेजी नहीं जाएगी।' : 'Progress on this journey will not be saved.', [{ label: 'Cancel', value: false }, { label: 'Quit', value: true, danger: true }]);
          if (ok) game.quitToMenu();
        } }, t('pause.quit')))));
  return { el };
}

export function controlsHelp(ui) {
  const groups = { driving: 'Driving', systems: 'Locomotive systems', view: 'Cameras', interface: 'Interface' };
  const body = h('div.grid.c2');
  for (const [gid, gname] of Object.entries(groups)) {
    body.append(h('div', h('div.sect', gname), h('div.spec.small', ACTIONS.filter((a) => a.group === gid).map((a) => [h('span', (input.bindings[a.id] || []).map((c) => h('span.kbd', { style: { marginRight: '3px' } }, keyLabel(c)))), h('span', a.label)]))));
  }
  body.append(h('div', h('div.sect', 'Mouse'), h('div.spec.small',
    h('span', 'Drag'), h('span', 'Look around / orbit the train'), h('span', 'Wheel'), h('span', 'Zoom'), h('span', 'Click cab controls'), h('span', 'Levers: drag up/down · switches: click'),
    h('span', 'Free camera'), h('span', 'WASD move, Q/E down/up, Shift fast'))));
  const el = h('div.screen', h('div.screen-shade.full'),
    h('div.panel.glass', h('div.panel-head', h('div.grow', h('h2.h-title', t('pause.controls')))), h('div.panel-body', body), h('div.panel-foot', h('button.btn.primary', { onclick: () => ui.back() }, t('menu.back')))));
  return { el };
}

/** Journey report: scores, XP, events. */
export function resultsScreen(ui, game, result, xpInfo) {
  const r = result.report;
  const parts = [['safety', t('res.safety')], ['punctuality', t('res.punctuality')], ['comfort', t('res.comfort')], ['efficiency', t('res.efficiency')], ['stopping', t('res.stopping')]];
  const bar = (v) => h('div.bar' + (v >= 85 ? '.good' : v < 55 ? '.bad' : ''), h('i', { style: { width: v + '%' } }));
  const info = profile.levelInfo;
  const el = h('div.screen', h('div.screen-shade.full'),
    h('div.panel.glass',
      h('div.panel-head', h('div.grow', h('div.muted.small', result.completed ? t('res.complete') : t('res.failed')), h('h2.h-title', result.title),
        h('p.h-sub', `${result.distanceKm.toFixed(1)} km · ${formatDuration(result.durationSec)} · ${result.energyKWh.toFixed(0)} kWh (${result.regenKWh.toFixed(0)} regenerated)`))),
      h('div.panel-body',
        result.failed ? h('div.glass', { style: { padding: '.8em 1em', borderColor: 'rgba(239,75,75,.5)', marginBottom: '1em' } }, h('b', 'Journey failed: '), result.failed) : null,
        h('div.res-hero', h('div.res-total', String(r.total)), h('div', h('div.res-stars', stars(r.stars)), h('div.muted', t('res.total')))),
        h('div.grid.c2', { style: { marginTop: '1.2em', alignItems: 'start' } },
          h('div.bars', parts.map(([k, label]) => h('div.bar-row', h('span', label), bar(r.parts[k]), h('b', String(r.parts[k]))))),
          h('div',
            h('div.card', { style: { cursor: 'default' } }, h('div.t', `${t('res.xp')}: +${result.xp}`),
              h('div.xpbar', h('i', { style: { width: Math.round(info.progress * 100) + '%' } })),
              h('div.small.muted', `L${info.level} · ${profile.data.xp} XP${xpInfo && xpInfo.after > xpInfo.before ? ` — PROMOTED to level ${xpInfo.after}!` : ''}`)),
            r.stops.length ? h('table.tt', { style: { marginTop: '.8em' } }, h('tr', h('th', 'Stop'), h('th', 'Error'), h('th', 'Score')),
              r.stops.map((s) => h('tr', h('td', s.station), h('td.num', `${s.error > 0 ? '+' : ''}${s.error.toFixed(1)} m`), h('td.num', String(Math.round(s.score)))))) : null)),
        h('div.sect', lang() === 'hi' ? 'घटनाएँ' : 'Events & penalties'),
        h('div.log', r.log.length ? r.log.map((l) => h('div', { class: l.severity }, `${l.amount ? `−${l.amount.toFixed(1)} ` : ''}${l.text}`)) : h('div.muted', 'Clean run — no penalties.'))),
      h('div.panel-foot',
        h('button.btn', { onclick: () => game.quitToMenu() }, t('res.menu')),
        h('button.btn.primary', { autofocus: true, onclick: () => game.restartJourney() }, t('res.retry')))));
  return { el };
}

export function loadingOverlay(text) {
  const el = h('div.screen.center', h('div.screen-shade.full'), h('div.glass', { style: { position: 'relative', zIndex: 1, padding: '1.2em 1.6em', textAlign: 'center' } }, h('div.h-title', { style: { fontSize: '1.3em' } }, text), h('div.boot-bar', h('i', { style: { width: '60%' } }))));
  return { el };
}
void TRAINS;
void DIFFICULTIES;
void clear;
