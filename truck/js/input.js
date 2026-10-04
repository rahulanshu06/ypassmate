'use strict';
// Keyboard, mouse, gamepad (incl. many wheels in standard mode) and touch controls.
G.Input = (() => {
  const U = G.U;
  const down = new Set();
  const queue = [];
  const I = {
    steer: 0, fwd: 0, back: 0, steerAnalog: false, handbrake: false, horn: false,
    lookDX: 0, lookDY: 0, zoom: 0, mode: 'keys', touch: { steer: 0, fwd: 0, back: 0, active: false }, mouseX: 0.5, gamepad: null,
    tilt: { enabled: false, value: 0 },
  };
  const ACT = {
    KeyE: 'engine', Space: 'park', KeyT: 'trailer', KeyL: 'lights', KeyK: 'high', KeyP: 'wipers', KeyB: 'retarder',
    KeyC: 'cruise', Equal: 'cruiseUp', NumpadAdd: 'cruiseUp', Minus: 'cruiseDown', NumpadSubtract: 'cruiseDown',
    Comma: 'indL', Period: 'indR', Slash: 'hazard', KeyR: 'gearUp', KeyF: 'gearDown', KeyV: 'camera',
    Digit1: 'cam1', Digit2: 'cam2', Digit3: 'cam3', Digit4: 'cam4', Enter: 'interact', KeyJ: 'jobs', KeyM: 'map',
    KeyN: 'navZoom', Escape: 'pause', KeyG: 'beacons', Backspace: 'rescue', KeyO: 'mirrors', F1: 'help', KeyI: 'help',
  };
  const isTyping = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');
  addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!e.repeat && ACT[e.code]) queue.push(ACT[e.code]);
    down.add(e.code);
  });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => down.clear());

  // ---------------- mouse look / mouse steering
  let dragging = false, lastX = 0, lastY = 0;
  I.attachCanvas = (canvas) => {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); return; }
      if (I.mode === 'mouse' && e.button === 0) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      I.mouseX = e.clientX / innerWidth;
      if (!dragging) return;
      I.lookDX += e.clientX - lastX; I.lookDY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
    });
    const end = () => { dragging = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('dblclick', () => queue.push('lookReset'));
    canvas.addEventListener('wheel', (e) => { I.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  // ---------------- touch controls (elements live in index.html)
  I.attachTouch = (root) => {
    const wheel = root.querySelector('#tc-wheel'), knob = root.querySelector('#tc-wheel-rim');
    let wid = null, a0 = 0, rot = 0, rot0 = 0;
    const ang = (e) => { const r = wheel.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
    wheel.addEventListener('pointerdown', (e) => { wid = e.pointerId; a0 = ang(e); rot0 = rot; wheel.setPointerCapture(e.pointerId); I.touch.active = true; e.preventDefault(); });
    wheel.addEventListener('pointermove', (e) => {
      if (e.pointerId !== wid) return;
      rot = U.clamp(rot0 + U.wrapAngle(ang(e) - a0), -2.4, 2.4);
      // unwrap large drags
      if (Math.abs(U.wrapAngle(ang(e) - a0)) > 2.6) { a0 = ang(e); rot0 = rot; }
    });
    const release = (e) => { if (e.pointerId === wid) { wid = null; } };
    wheel.addEventListener('pointerup', release); wheel.addEventListener('pointercancel', release);
    I._touchTick = (dt) => {
      if (wid === null) rot = U.damp(rot, 0, 6, dt);
      knob.style.transform = `rotate(${rot}rad)`;
      I.touch.steer = U.clamp(-rot / 2.0, -1, 1);
    };
    const pedal = (id, key) => {
      const el = root.querySelector(id);
      const set = (v) => { I.touch[key] = v; el.classList.toggle('on', v > 0); };
      el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); set(1); I.touch.active = true; e.preventDefault(); });
      el.addEventListener('pointerup', () => set(0));
      el.addEventListener('pointercancel', () => set(0));
      el.addEventListener('lostpointercapture', () => set(0));
    };
    pedal('#tc-gas', 'fwd');
    pedal('#tc-brake', 'back');
    root.querySelectorAll('[data-act]').forEach((b) => {
      const act = b.dataset.act;
      if (act === 'horn') {
        b.addEventListener('pointerdown', (e) => { I.touch.horn = true; e.preventDefault(); });
        const off = () => { I.touch.horn = false; };
        b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
      } else b.addEventListener('click', (e) => { queue.push(act); e.preventDefault(); });
    });
  };
  I.enableTilt = async () => {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return false;
      }
      addEventListener('deviceorientation', (e) => {
        const landscape = Math.abs(window.orientation || (screen.orientation && screen.orientation.angle) || 0) === 90;
        let v = landscape ? e.beta : e.gamma;
        const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
        if (ang === -90 || ang === 270) v = -v;
        I.tilt.value = U.clamp((v || 0) / 35, -1, 1);
      });
      I.tilt.enabled = true;
      return true;
    } catch (err) { return false; }
  };

  // ---------------- per-frame poll
  let gpPrev = [];
  const GP = { 0: 'interact', 1: 'park', 2: 'engine', 3: 'camera', 4: 'gearDown', 5: 'gearUp', 8: 'map', 9: 'pause', 12: 'lights', 14: 'indL', 15: 'indR', 10: 'trailer', 11: 'cruise' };
  I.poll = (dt) => {
    const k = (c) => down.has(c);
    let steerK = (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0);
    let fwd = k('KeyW') || k('ArrowUp') ? 1 : 0;
    let back = k('KeyS') || k('ArrowDown') ? 1 : 0;
    let analog = false, steer = steerK;
    I.horn = k('KeyH');
    if (I._touchTick) I._touchTick(dt);
    if (I.touch.active) {
      if (I.tilt.enabled) { steer = -I.tilt.value; analog = true; } else if (Math.abs(I.touch.steer) > 0.01) { steer = I.touch.steer; analog = true; }
      fwd = Math.max(fwd, I.touch.fwd); back = Math.max(back, I.touch.back);
      I.horn = I.horn || I.touch.horn;
    }
    if (I.mode === 'mouse' && steerK === 0) { steer = U.clamp(-(I.mouseX - 0.5) / 0.38, -1, 1); analog = true; }
    // gamepad
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
    const gp = pads && Array.from(pads).find((p) => p && p.connected);
    I.gamepad = gp ? gp.id : null;
    if (gp) {
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.06) { steer = -Math.sign(ax) * ((Math.abs(ax) - 0.06) / 0.94) ** 1.4; analog = true; }
      const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
      fwd = Math.max(fwd, rt); back = Math.max(back, lt);
      if (gp.buttons[13] && gp.buttons[13].pressed) I.horn = true;
      gp.buttons.forEach((b, i) => {
        const p = b && b.pressed;
        if (p && !gpPrev[i] && GP[i]) queue.push(GP[i]);
        gpPrev[i] = p;
      });
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      if (Math.abs(rx) > 0.15) I.lookDX += rx * 600 * dt;
      if (Math.abs(ry) > 0.15) I.lookDY += ry * 400 * dt;
    }
    I.steer = steer; I.fwd = fwd; I.back = back; I.steerAnalog = analog;
    // keyboard look-around in cabin
    if (k('KeyZ')) I.lookDX -= 500 * dt;
    if (k('KeyX')) I.lookDX += 500 * dt;
  };
  I.consume = () => queue.splice(0, queue.length);
  I.push = (a) => queue.push(a);
  return I;
})();
