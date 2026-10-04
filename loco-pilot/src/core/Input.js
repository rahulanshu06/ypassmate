import { settings } from './Settings.js';
import { bus } from './EventBus.js';

// Every rebindable action. `hold` actions are polled each frame, others fire once per press.
export const ACTIONS = [
  { id: 'throttleUp', group: 'driving', label: 'Throttle up (notch +)', keys: ['KeyW'], hold: true },
  { id: 'throttleDown', group: 'driving', label: 'Throttle down / regenerative brake', keys: ['KeyS'], hold: true },
  { id: 'brakeApply', group: 'driving', label: 'Train brake apply (A9)', keys: ['KeyD', 'KeyB'], hold: true },
  { id: 'brakeRelease', group: 'driving', label: 'Train brake release (A9)', keys: ['KeyA'], hold: true },
  { id: 'indApply', group: 'driving', label: 'Loco brake apply (SA9)', keys: ['BracketRight'], hold: true },
  { id: 'indRelease', group: 'driving', label: 'Loco brake release (SA9)', keys: ['BracketLeft'], hold: true },
  { id: 'emergency', group: 'driving', label: 'Emergency brake', keys: ['Space'] },
  { id: 'reverserFwd', group: 'driving', label: 'Reverser forward', keys: ['KeyR'] },
  { id: 'reverserBack', group: 'driving', label: 'Reverser backward', keys: ['KeyF'] },
  { id: 'horn', group: 'driving', label: 'Horn — high tone', keys: ['KeyH'], hold: true },
  { id: 'hornLow', group: 'driving', label: 'Horn — low tone', keys: ['KeyJ'], hold: true },
  { id: 'sander', group: 'driving', label: 'Sander', keys: ['KeyX'], hold: true },
  { id: 'vcdAck', group: 'driving', label: 'Vigilance (VCD) acknowledge', keys: ['KeyQ'] },
  { id: 'pantograph', group: 'systems', label: 'Pantograph raise / lower', keys: ['KeyO'] },
  { id: 'vcb', group: 'systems', label: 'Main circuit breaker (VCB)', keys: ['KeyM'] },
  { id: 'headlight', group: 'systems', label: 'Headlight off / dim / bright', keys: ['KeyL'] },
  { id: 'wiper', group: 'systems', label: 'Wipers off / slow / fast', keys: ['KeyV'] },
  { id: 'cabLight', group: 'systems', label: 'Cab light', keys: ['KeyI'] },
  { id: 'camera', group: 'view', label: 'Next camera', keys: ['KeyC'] },
  { id: 'cam1', group: 'view', label: 'Camera: driver cab', keys: ['Digit1'] },
  { id: 'cam2', group: 'view', label: 'Camera: head-out (first person)', keys: ['Digit2'] },
  { id: 'cam3', group: 'view', label: 'Camera: third person orbit', keys: ['Digit3'] },
  { id: 'cam4', group: 'view', label: 'Camera: chase', keys: ['Digit4'] },
  { id: 'cam5', group: 'view', label: 'Camera: side', keys: ['Digit5'] },
  { id: 'cam6', group: 'view', label: 'Camera: front locomotive', keys: ['Digit6'] },
  { id: 'cam7', group: 'view', label: 'Camera: rear of train', keys: ['Digit7'] },
  { id: 'cam8', group: 'view', label: 'Camera: free', keys: ['Digit8'] },
  { id: 'cam9', group: 'view', label: 'Camera: trackside cinematic', keys: ['Digit9'] },
  { id: 'pause', group: 'interface', label: 'Pause menu', keys: ['KeyP', 'Escape'] },
  { id: 'hud', group: 'interface', label: 'Hide / show HUD', keys: ['KeyU'] },
  { id: 'monitor', group: 'interface', label: 'Track monitor', keys: ['KeyT'] },
  { id: 'help', group: 'interface', label: 'Controls help', keys: ['F1', 'Slash'] },
  { id: 'photo', group: 'interface', label: 'Photo mode', keys: ['KeyK'] },
];

const ACTION_MAP = new Map(ACTIONS.map((a) => [a.id, a]));

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    Space: 'Space', Escape: 'Esc', BracketLeft: '[', BracketRight: ']', Slash: '/', Semicolon: ';',
    Quote: "'", Comma: ',', Period: '.', Minus: '-', Equal: '=', Backquote: '`', ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Tab: 'Tab', Backspace: 'Bksp',
  };
  return map[code] || code;
}

class InputManager {
  constructor() {
    this.down = new Set();
    this.presses = [];
    this.virtualHeld = new Map(); // action -> count (touch / gamepad / on-screen)
    this.analog = { throttle: null, brake: null, lookX: 0, lookY: 0 };
    this.bindings = {};
    this.captureCallback = null;
    this.enabled = true;
    this.gamepadIndex = null;
    this.prevPadButtons = [];
    this.loadBindings();
    bus.on('settings:changed', ({ key }) => {
      if (key === 'keymap' || key === '*') this.loadBindings();
    });
  }

  loadBindings() {
    const custom = settings.get('keymap') || {};
    for (const a of ACTIONS) this.bindings[a.id] = Array.isArray(custom[a.id]) ? [...custom[a.id]] : [...a.keys];
  }

  setBinding(actionId, codes) {
    const custom = { ...(settings.get('keymap') || {}) };
    custom[actionId] = codes;
    this.bindings[actionId] = [...codes];
    settings.set('keymap', custom);
  }

  resetBindings() {
    settings.set('keymap', {});
    this.loadBindings();
  }

  conflictsFor(code, exceptAction) {
    return ACTIONS.filter((a) => a.id !== exceptAction && (this.bindings[a.id] || []).includes(code)).map((a) => a.id);
  }

  attach() {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.virtualHeld.clear();
    });
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
      bus.emit('toast', { text: `Gamepad connected: ${e.gamepad.id.slice(0, 40)}` });
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadIndex = null;
      this.analog.throttle = null;
      this.analog.brake = null;
    });
  }

  onKey(e, isDown) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (this.captureCallback && isDown) {
      e.preventDefault();
      const cb = this.captureCallback;
      this.captureCallback = null;
      cb(e.code);
      return;
    }
    if (isDown) {
      if (!this.down.has(e.code) && this.enabled) {
        for (const a of ACTIONS) {
          if ((this.bindings[a.id] || []).includes(e.code)) this.presses.push(a.id);
        }
      }
      this.down.add(e.code);
      if (this.isGameKey(e.code)) e.preventDefault();
    } else {
      this.down.delete(e.code);
    }
  }

  isGameKey(code) {
    if (code === 'F5' || code === 'F12' || code === 'F11') return false;
    if (code === 'Space' || code === 'F1' || code === 'Slash') return true;
    return ACTIONS.some((a) => (this.bindings[a.id] || []).includes(code));
  }

  captureNextKey(cb) {
    this.captureCallback = cb;
  }

  isDown(actionId) {
    if (!this.enabled) return false;
    if ((this.virtualHeld.get(actionId) || 0) > 0) return true;
    const codes = this.bindings[actionId];
    if (!codes) return false;
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  rawDown(code) {
    return this.enabled && this.down.has(code);
  }

  // Touch / on-screen buttons
  press(actionId) {
    if (ACTION_MAP.has(actionId)) this.presses.push(actionId);
  }
  holdVirtual(actionId, on) {
    const n = this.virtualHeld.get(actionId) || 0;
    this.virtualHeld.set(actionId, Math.max(0, n + (on ? 1 : -1)));
  }

  takePresses() {
    const p = this.presses;
    this.presses = [];
    return this.enabled ? p : [];
  }

  pollGamepad() {
    if (this.gamepadIndex == null || !navigator.getGamepads) return;
    const gp = navigator.getGamepads()[this.gamepadIndex];
    if (!gp) return;
    const dead = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    const btn = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const pressedNow = (i) => btn(i) > 0.5 && !(this.prevPadButtons[i] > 0.5);
    // Left stick Y: push forward to notch up, pull back to notch down (rate based).
    const ly = dead(gp.axes[1] || 0);
    this.analog.throttleRate = -ly;
    // Triggers: RT applies train brake, LT releases.
    this.analog.brakeRate = btn(7) - btn(6);
    this.analog.lookX = dead(gp.axes[2] || 0);
    this.analog.lookY = dead(gp.axes[3] || 0);
    const map = [
      [0, 'horn', true], [1, 'emergency'], [2, 'wiper'], [3, 'camera'], [4, 'indRelease', true], [5, 'indApply', true],
      [8, 'hud'], [9, 'pause'], [12, 'throttleUp', true], [13, 'throttleDown', true], [14, 'reverserBack'],
      [15, 'reverserFwd'], [10, 'headlight'], [11, 'vcdAck'],
    ];
    for (const [i, action, hold] of map) {
      if (hold) {
        const was = this.prevPadButtons[i] > 0.5;
        const is = btn(i) > 0.5;
        if (is !== was) this.holdVirtual(action, is);
      } else if (pressedNow(i)) this.presses.push(action);
    }
    this.prevPadButtons = gp.buttons.map((b) => b.value);
  }
}

export const input = new InputManager();
