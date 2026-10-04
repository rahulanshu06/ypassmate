import { h } from './dom.js';
import { input } from '../core/Input.js';
import { settings } from '../core/Settings.js';

/**
 * On-screen controls for touch devices: throttle and brake sliders plus action buttons.
 */
export class TouchControls {
  constructor(ui) {
    this.ui = ui;
    this.el = h('div.touch');
    this.throttle = this.slider('THROTTLE', '18px', (v) => {
      // top = +10 notches, middle = 0, bottom = regen B8
      const n = v > 0.5 ? (v - 0.5) * 2 * 10 : -(0.5 - v) * 2 * 8;
      input.analog.touchThrottle = Math.round(n);
    }, 0.5);
    this.brake = this.slider('BRAKE', 'calc(18px + 74px)', (v) => {
      input.analog.touchBrake = 1 - v;
    }, 1);
    const btn = (label, action, hold, cls = '') => {
      const b = h('button.tbtn' + cls, label);
      const down = (e) => {
        e.preventDefault();
        b.classList.add('on');
        if (hold) input.holdVirtual(action, true);
        else input.press(action);
      };
      const up = (e) => {
        e.preventDefault();
        b.classList.remove('on');
        if (hold) input.holdVirtual(action, false);
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      return b;
    };
    this.buttons = h('div.tbtns',
      btn('HORN', 'horn', true), btn('LIGHT', 'headlight'), btn('WIPER', 'wiper'),
      btn('CAMERA', 'camera'), btn('LOCO BRK', 'indRelease', true), btn('EMERG', 'emergency', false, '.em'),
      btn('REV F', 'reverserFwd'), btn('VCD', 'vcdAck'), btn('PAUSE', 'pause'));
    this.el.append(this.throttle.el, this.brake.el, this.buttons);
  }

  slider(label, left, onChange, initial) {
    const knob = h('div.knob');
    const el = h('div.tslider', { style: { left } }, h('div.lbl', label), knob);
    let value = initial;
    const place = () => {
      knob.style.top = `${(1 - value) * (210 - 46) + 6}px`;
    };
    place();
    const move = (e) => {
      const r = el.getBoundingClientRect();
      value = Math.min(1, Math.max(0, 1 - (e.clientY - r.top - 17) / (r.height - 46)));
      place();
      onChange(value);
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      move(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType === 'touch') move(e);
    });
    return { el, set: (v) => { value = v; place(); } };
  }

  static wanted() {
    const mode = settings.get('touchControls');
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  attach() {
    this.ui.hudLayer.append(this.el);
  }
  detach() {
    this.el.remove();
    input.analog.touchThrottle = null;
    input.analog.touchBrake = null;
  }
  sync(train) {
    // keep sliders in step with keyboard changes
    if (!train) return;
    const n = train.traction.notch;
    this.throttle.set(n >= 0 ? 0.5 + (n / 10) * 0.5 : 0.5 - (-n / 8) * 0.5);
  }
}
