import { h, clear, seg, range } from './dom.js';
import { t, lang } from '../core/I18n.js';
import { settings, QUALITY_PRESETS, RESTART_KEYS } from '../core/Settings.js';
import { ACTIONS, input, keyLabel } from '../core/Input.js';

function row(label, hint, control) {
  return h('div.setting-row', h('div.lbl', label, hint ? h('span.muted', hint) : null), h('div', control));
}

export function settingsScreen(ui, game, { inGame = false, onBack } = {}) {
  let tab = 'graphics';
  const body = h('div');
  const set = (k) => (v) => {
    settings.set(k, v);
    if (RESTART_KEYS.includes(k)) ui.toast(lang() === 'hi' ? 'यह बदलाव अगली बार लोड होने पर लागू होगा।' : 'This change applies after reloading the page.');
  };
  const render = () => {
    clear(body);
    body.append(h('div.tabs', { style: { marginBottom: '1em' } }, [['graphics', t('settings.graphics')], ['audio', t('settings.audio')], ['gameplay', t('settings.gameplay')], ['controls', t('settings.controls')], ['access', t('settings.access')]].map(([id, label]) =>
      h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; render(); } }, label))));
    const S = settings;
    if (tab === 'graphics') {
      const resolved = S.get('resolvedPreset');
      body.append(row('Quality preset', resolved ? `Auto picked “${resolved.toUpperCase()}” for this device${game.renderer ? ' · ' + (game.renderer.gpuName || '').slice(0, 48) : ''}` : null,
        seg(['auto', 'low', 'medium', 'high', 'ultra'].map((p) => ({ value: p, label: p.toUpperCase() })).concat(S.get('preset') === 'custom' ? [{ value: 'custom', label: 'CUSTOM', disabled: true }] : []), S.get('preset'), (v) => { S.applyPreset(v); render(); })));
      body.append(row('Resolution scale', 'Lower = faster', range(0.5, 1, 0.05, S.get('renderScale'), set('renderScale'), (v) => Math.round(v * 100) + '%')));
      body.append(row('Max pixel ratio', 'HiDPI sharpness', seg([1, 1.5, 2].map((v) => ({ value: v, label: v + '×' })), S.get('maxPixelRatio'), set('maxPixelRatio'))));
      body.append(row('Dynamic resolution', 'Keeps frame-rate steady by lowering resolution briefly', seg([{ value: true, label: 'On' }, { value: false, label: 'Off' }], S.get('dynamicResolution'), set('dynamicResolution'))));
      body.append(row('Shadows', null, seg(['off', 'low', 'medium', 'high', 'ultra'].map((v) => ({ value: v, label: v.toUpperCase() })), S.get('shadows'), set('shadows'))));
      body.append(row('Texture quality', null, seg(['low', 'medium', 'high'].map((v) => ({ value: v, label: v.toUpperCase() })), S.get('textureQuality'), set('textureQuality'))));
      body.append(row('View distance', null, range(1200, 7000, 100, S.get('viewDistance'), set('viewDistance'), (v) => (v / 1000).toFixed(1) + ' km')));
      body.append(row('Effects', 'Bloom, film grade, light glows', seg(['low', 'medium', 'high'].map((v) => ({ value: v, label: v.toUpperCase() })), S.get('effects'), set('effects'))));
      body.append(row('Anti-aliasing', 'MSAA (applies after reload)', seg([['off', 'OFF'], ['msaa2', 'MSAA 2×'], ['msaa4', 'MSAA 4×']].map(([v, l]) => ({ value: v, label: l })), S.get('antialias'), set('antialias'))));
      body.append(row('Reflections', 'Sky reflections on metal, glass, water', seg(['off', 'low', 'high'].map((v) => ({ value: v, label: v.toUpperCase() })), S.get('reflections'), set('reflections'))));
      body.append(row('Weather quality', 'Rain particle count', seg(['low', 'medium', 'high'].map((v) => ({ value: v, label: v.toUpperCase() })), S.get('weatherQuality'), set('weatherQuality'))));
      body.append(row('Vegetation density', 'Applies to newly streamed areas', range(0.2, 1, 0.05, S.get('vegetationDensity'), set('vegetationDensity'), (v) => Math.round(v * 100) + '%')));
      body.append(row('Crowd density', null, range(0, 1, 0.05, S.get('crowdDensity'), set('crowdDensity'), (v) => Math.round(v * 100) + '%')));
      body.append(row('AI traffic density', 'Road vehicles; rail traffic is set per journey', range(0, 1, 0.05, S.get('trafficDensity'), set('trafficDensity'), (v) => Math.round(v * 100) + '%')));
      body.append(row('Field of view', null, range(45, 85, 1, S.get('fov'), (v) => { S.set('fov', v); if (game.camRig) game.camRig.fov = v; }, (v) => v + '°')));
      body.append(row('Show FPS', null, seg([{ value: true, label: 'On' }, { value: false, label: 'Off' }], S.get('showFps'), set('showFps'))));
      body.append(h('div', { style: { marginTop: '1em' } }, h('button.btn.small', { onclick: () => { game.runBenchmark && game.runBenchmark(); } }, 'Re-test device & recommend settings')));
    } else if (tab === 'audio') {
      body.append(row('Master volume', null, range(0, 1, 0.05, S.get('masterVolume'), set('masterVolume'), (v) => Math.round(v * 100) + '%')));
      body.append(row('Locomotive & train', null, range(0, 1, 0.05, S.get('engineVolume'), set('engineVolume'), (v) => Math.round(v * 100) + '%')));
      body.append(row('Ambience & weather', null, range(0, 1, 0.05, S.get('ambienceVolume'), set('ambienceVolume'), (v) => Math.round(v * 100) + '%')));
      body.append(row('Announcements', null, range(0, 1, 0.05, S.get('announcementVolume'), set('announcementVolume'), (v) => Math.round(v * 100) + '%')));
      body.append(row('Spoken announcements', 'Uses your browser’s Hindi/English voices when installed', seg([{ value: true, label: 'On' }, { value: false, label: 'Subtitles only' }], S.get('voiceAnnouncements'), set('voiceAnnouncements'))));
      body.append(row('Announcement language', null, seg([['both', 'Hindi + English'], ['hi', 'हिन्दी'], ['en', 'English']].map(([v, l]) => ({ value: v, label: l })), S.get('announcementLanguage'), set('announcementLanguage'))));
    } else if (tab === 'gameplay') {
      body.append(row('Language / भाषा', null, seg([{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }], S.get('language'), set('language'))));
      body.append(row('HUD', 'Minimal hides the track monitor and gauges', seg([['full', 'Full'], ['minimal', 'Minimal'], ['off', 'Hidden']].map(([v, l]) => ({ value: v, label: l })), S.get('hudMode'), set('hudMode'))));
      body.append(row('Camera shake', null, seg([{ value: true, label: 'On' }, { value: false, label: 'Off' }], S.get('cameraShake'), set('cameraShake'))));
      body.append(row('Mouse sensitivity', null, range(0.3, 2.5, 0.05, S.get('mouseSensitivity'), set('mouseSensitivity'), (v) => v.toFixed(2))));
      body.append(row('Invert mouse Y', null, seg([{ value: false, label: 'Off' }, { value: true, label: 'On' }], S.get('invertY'), set('invertY'))));
      body.append(row('Touch controls', null, seg([['auto', 'Auto'], ['on', 'On'], ['off', 'Off']].map(([v, l]) => ({ value: v, label: l })), S.get('touchControls'), set('touchControls'))));
    } else if (tab === 'controls') {
      body.append(h('p.muted.small', 'Click a binding, then press the new key. Each action can have two keys. Gamepad: left stick = throttle, RT/LT = train brake apply/release, A = horn, B = emergency, X = wiper, Y = camera, LB/RB = loco brake, D-pad = notch / reverser, Start = pause.'));
      const groups = { driving: 'Driving', systems: 'Locomotive systems', view: 'Cameras', interface: 'Interface' };
      for (const [gid, gname] of Object.entries(groups)) {
        body.append(h('div.sect', gname));
        for (const a of ACTIONS.filter((x) => x.group === gid)) {
          const codes = input.bindings[a.id] || [];
          const slots = [0, 1].map((i) => {
            const b = h('button.btn.small', { style: { minWidth: '6em' }, onclick: () => {
              b.textContent = '…';
              input.captureNextKey((code) => {
                if (code === 'Escape') return render();
                const next = [...(input.bindings[a.id] || [])];
                next[i] = code;
                const clean = next.filter(Boolean).filter((c, k, arr) => arr.indexOf(c) === k);
                input.setBinding(a.id, clean);
                const conf = input.conflictsFor(code, a.id);
                if (conf.length) ui.toast(`Note: ${keyLabel(code)} is also bound to ${conf.join(', ')}`);
                render();
              });
            } }, codes[i] ? keyLabel(codes[i]) : '—');
            return b;
          });
          body.append(row(a.label, null, h('div.row', slots, codes[1] ? h('button.btn.small', { title: 'Remove second key', onclick: () => { input.setBinding(a.id, [codes[0]]); render(); } }, '✕') : null)));
        }
      }
      body.append(h('div', { style: { marginTop: '1em' } }, h('button.btn.small', { onclick: () => { input.resetBindings(); render(); } }, 'Reset to defaults')));
    } else {
      body.append(row('UI scale', null, range(0.75, 1.5, 0.05, S.get('uiScale'), set('uiScale'), (v) => Math.round(v * 100) + '%')));
      body.append(row('Subtitles', 'Announcements & radio messages', seg([{ value: true, label: 'On' }, { value: false, label: 'Off' }], S.get('subtitles'), set('subtitles'))));
      body.append(row('Reduced motion', 'No camera blending, shake or animated UI', seg([{ value: false, label: 'Off' }, { value: true, label: 'On' }], S.get('reducedMotion'), set('reducedMotion'))));
      body.append(row('Colour-friendly signals', 'Shows aspect shape + text (STOP / CAUTION…) beside every signal readout', seg([{ value: true, label: 'On' }, { value: false, label: 'Off' }], S.get('colorAssist'), set('colorAssist'))));
    }
  };
  render();
  const foot = [h('button.btn.small', { onclick: async () => {
    const ok = await ui.modal('Reset settings?', 'Restore every setting to its default.', [{ label: 'Cancel', value: false }, { label: 'Reset', value: true, danger: true }]);
    if (ok) {
      settings.reset();
      render();
    }
  } }, 'Reset all'), h('button.btn.primary', { onclick: onBack || (() => ui.back()) }, t('menu.back'))];
  const el = h('div.screen', h('div.screen-shade.full'),
    h('div.panel.glass', h('div.panel-head', h('div.grow', h('h2.h-title', t('menu.settings')), h('p.h-sub', inGame ? 'Changes apply immediately' : ''))), h('div.panel-body', body), h('div.panel-foot', foot)));
  void QUALITY_PRESETS;
  return { el, rerender: render };
}
