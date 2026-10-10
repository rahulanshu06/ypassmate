import { h, seg, range } from './dom.js';
import { WEATHER_PRESETS } from '../data/scenarios.js';
import { tx } from '../core/I18n.js';
import { formatClock } from '../core/MathUtil.js';

/**
 * Cinematic photo mode: free camera, FOV, time of day & weather override, depth of field,
 * hidden UI and PNG capture. The simulation is paused while active.
 */
export class PhotoMode {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.state = { fov: 55, dof: false, focus: 25, aperture: 0.6 };
    this.el = h('div.photo.glass',
      h('div.h-title', { style: { fontSize: '1.2em' } }, 'Photo mode'),
      h('p.muted.small', 'WASD/QE move · drag to look · wheel zoom · Shift fast'),
      h('div.field', h('label', 'Field of view'), range(15, 100, 1, this.state.fov, (v) => { this.state.fov = v; game.camRig.fov = v; }, (v) => v + '°')),
      h('div.field', h('label', 'Time of day'), range(0, 23.9, 0.05, game.journey ? game.journey.clock % 24 : 12, (v) => { if (game.journey) game.journey.clock = v; }, (v) => formatClock(v))),
      h('div.field', h('label', 'Weather'), seg(Object.values(WEATHER_PRESETS).map((w) => ({ value: w.id, label: w.icon })), game.journey ? game.journey.config.weather : 'clear', (v) => game.journey && game.journey.setWeather(v, 1))),
      h('div.field', h('label', 'Depth of field'), seg([{ value: false, label: 'Off' }, { value: true, label: 'On' }], false, (v) => { this.state.dof = v; this.apply(); })),
      h('div.field', h('label', 'Focus distance'), range(2, 200, 1, this.state.focus, (v) => { this.state.focus = v; this.apply(); }, (v) => v + ' m')),
      h('div.field', h('label', 'Blur strength'), range(0.1, 2, 0.05, this.state.aperture, (v) => { this.state.aperture = v; this.apply(); }, (v) => v.toFixed(2))),
      h('div.row', { style: { marginTop: '8px' } },
        h('button.btn.primary.small', { onclick: () => this.capture() }, '📷 Capture'),
        h('button.btn.small', { onclick: () => this.toggleUi() }, 'Hide UI (H)'),
        h('button.btn.small', { onclick: () => game.closePhotoMode() }, 'Exit')));
    this.onKey = (e) => {
      // Escape / K are routed through Input -> Game.handleInput so they are handled exactly once.
      if (e.code === 'KeyH') this.toggleUi();
    };
  }
  apply() {
    this.game.renderer.setDof(this.state.dof, this.state.focus, this.state.aperture * 0.0004);
  }
  toggleUi() {
    this.el.style.opacity = this.el.style.opacity === '0' ? '1' : '0';
  }
  capture() {
    const r = this.game.renderer;
    const prev = this.el.style.opacity;
    this.el.style.opacity = '0';
    r.render();
    let url = null;
    try {
      url = r.canvas.toDataURL('image/png');
    } catch {
      url = null;
    }
    this.el.style.opacity = prev;
    if (!url) return this.ui.toast('Capture failed');
    this.showShot(url);
  }
  /** Show the capture in a dialog. Sandboxed hosts block scripted downloads, so saving there is via the image's own menu. */
  showShot(url) {
    if (this.shotEl) this.shotEl.remove();
    const canDownload = !window.LOCO_SANDBOXED;
    const close = () => {
      if (this.shotEl) this.shotEl.remove();
      this.shotEl = null;
    };
    const download = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `locopilot-${Date.now()}.png`;
      a.click();
    };
    this.shotEl = h('div.modal-back', { onclick: (e) => e.target === this.shotEl && close() },
      h('div.modal.glass.shot',
        h('h3', 'Screenshot'),
        h('img', { src: url, alt: 'Captured view' }),
        h('p.muted.small', canDownload ? 'Download it, or right-click / long-press the picture to save it.' : 'Right-click (or long-press) the picture and choose “Save image”.'),
        h('div.row', canDownload ? h('button.btn.primary.small', { onclick: download }, 'Download PNG') : null, h('button.btn.small', { onclick: close }, 'Close'))));
    this.ui.root.append(this.shotEl);
  }
  attach() {
    this.ui.hudLayer.append(this.el);
    window.addEventListener('keydown', this.onKey);
  }
  detach() {
    this.el.remove();
    if (this.shotEl) this.shotEl.remove();
    this.shotEl = null;
    window.removeEventListener('keydown', this.onKey);
    this.game.renderer.setDof(false);
  }
}
void tx;
