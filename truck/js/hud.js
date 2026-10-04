'use strict';
// Instrument cluster, GPS, world map, toasts and on-screen prompts.
G.HUD = (() => {
  const U = G.U;
  const H = {};
  const $ = (id) => document.getElementById(id);
  const MONO = '"Share Tech Mono", "Courier New", monospace';
  const COND = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

  // ---------------------------------------------------------------- instrument cluster
  function gauge(x, cx, cy, r, val, max, a0, a1, majors, minorEvery, labelEvery, label, bands, unit) {
    x.save();
    // face
    const g = x.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#1a1e24'); g.addColorStop(1, '#07090b');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#3a4048'; x.lineWidth = r * 0.04; x.stroke();
    const A = (v) => a0 + (a1 - a0) * (v / max);
    for (const [from, to, col] of bands) {
      x.beginPath(); x.arc(cx, cy, r * 0.86, A(from), A(to)); x.strokeStyle = col; x.lineWidth = r * 0.07; x.stroke();
    }
    for (let v = 0; v <= max + 0.001; v += minorEvery) {
      const a = A(v), major = Math.abs(v / majors - Math.round(v / majors)) < 0.001;
      const r1 = r * (major ? 0.74 : 0.8), r2 = r * 0.9;
      x.strokeStyle = major ? '#f4f1ea' : '#a9adb3'; x.lineWidth = major ? r * 0.03 : r * 0.014;
      x.beginPath(); x.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); x.stroke();
      if (Math.abs(v / labelEvery - Math.round(v / labelEvery)) < 0.001) {
        x.fillStyle = '#f4f1ea'; x.font = `600 ${r * 0.17}px ${COND}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(Math.round(v)), cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6);
      }
    }
    x.fillStyle = '#8b9199'; x.font = `500 ${r * 0.12}px ${COND}`; x.textAlign = 'center';
    x.fillText(label, cx, cy - r * 0.32);
    if (unit) x.fillText(unit, cx, cy + r * 0.62);
    // needle
    const a = A(U.clamp(val, 0, max));
    x.strokeStyle = '#ff3b1f'; x.lineWidth = r * 0.045; x.lineCap = 'round';
    x.shadowColor = 'rgba(255,60,30,0.6)'; x.shadowBlur = r * 0.08;
    x.beginPath(); x.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12); x.lineTo(cx + Math.cos(a) * r * 0.84, cy + Math.sin(a) * r * 0.84); x.stroke();
    x.shadowBlur = 0;
    x.fillStyle = '#2a2f36'; x.beginPath(); x.arc(cx, cy, r * 0.09, 0, Math.PI * 2); x.fill();
    x.restore();
  }
  function lamp(x, cx, cy, s, on, col, draw) {
    x.save();
    x.globalAlpha = on ? 1 : 0.13;
    x.fillStyle = col; x.strokeStyle = col; x.lineWidth = s * 0.12;
    if (on) { x.shadowColor = col; x.shadowBlur = s * 0.6; }
    draw(x, cx, cy, s);
    x.restore();
  }
  const ICON = {
    park: (x, cx, cy, s) => { x.beginPath(); x.arc(cx, cy, s * 0.42, 0, Math.PI * 2); x.stroke(); x.font = `700 ${s * 0.55}px ${COND}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('P', cx, cy + s * 0.03); },
    air: (x, cx, cy, s) => { x.font = `700 ${s * 0.42}px ${COND}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('AIR', cx, cy); },
    fuel: (x, cx, cy, s) => { x.fillRect(cx - s * 0.3, cy - s * 0.35, s * 0.4, s * 0.7); x.fillRect(cx + s * 0.14, cy - s * 0.2, s * 0.14, s * 0.4); },
    beam: (x, cx, cy, s) => { x.beginPath(); x.arc(cx - s * 0.1, cy, s * 0.3, -Math.PI / 2, Math.PI / 2); x.closePath(); x.fill(); for (let k = -1; k <= 1; k++) x.fillRect(cx + s * 0.25, cy + k * s * 0.2 - s * 0.04, s * 0.25, s * 0.08); },
    lowb: (x, cx, cy, s) => { x.beginPath(); x.arc(cx - s * 0.1, cy, s * 0.3, -Math.PI / 2, Math.PI / 2); x.closePath(); x.fill(); for (let k = -1; k <= 1; k++) { x.save(); x.translate(cx + s * 0.35, cy + k * s * 0.2); x.rotate(0.4); x.fillRect(-s * 0.12, -s * 0.04, s * 0.25, s * 0.08); x.restore(); } },
    left: (x, cx, cy, s) => { x.beginPath(); x.moveTo(cx - s * 0.45, cy); x.lineTo(cx, cy - s * 0.35); x.lineTo(cx, cy + s * 0.35); x.fill(); x.fillRect(cx, cy - s * 0.13, s * 0.4, s * 0.26); },
    right: (x, cx, cy, s) => { x.beginPath(); x.moveTo(cx + s * 0.45, cy); x.lineTo(cx, cy - s * 0.35); x.lineTo(cx, cy + s * 0.35); x.fill(); x.fillRect(cx - s * 0.4, cy - s * 0.13, s * 0.4, s * 0.26); },
    engine: (x, cx, cy, s) => { x.strokeRect(cx - s * 0.35, cy - s * 0.22, s * 0.7, s * 0.44); x.fillRect(cx - s * 0.12, cy - s * 0.38, s * 0.24, s * 0.16); },
    trailer: (x, cx, cy, s) => { x.strokeRect(cx - s * 0.45, cy - s * 0.25, s * 0.7, s * 0.4); x.beginPath(); x.arc(cx - s * 0.25, cy + s * 0.25, s * 0.1, 0, 7); x.arc(cx + s * 0.05, cy + s * 0.25, s * 0.1, 0, 7); x.fill(); },
    cruise: (x, cx, cy, s) => { x.beginPath(); x.arc(cx, cy + s * 0.1, s * 0.35, Math.PI, 0); x.stroke(); x.beginPath(); x.moveTo(cx, cy + s * 0.1); x.lineTo(cx + s * 0.22, cy - s * 0.15); x.stroke(); },
  };
  H.drawCluster = (x, w, h, T, game) => {
    x.clearRect(0, 0, w, h);
    const bg = x.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(16,19,23,0.92)'); bg.addColorStop(1, 'rgba(6,7,9,0.95)');
    x.fillStyle = bg;
    const rr = h * 0.12;
    x.beginPath(); x.roundRect ? x.roundRect(0, 0, w, h, rr) : x.rect(0, 0, w, h); x.fill();
    const r = h * 0.44, cy = h * 0.5;
    const kmh = Math.abs(T.v) * 3.6;
    gauge(x, h * 0.5, cy, r, kmh, 125, Math.PI * 0.75, Math.PI * 2.25, 20, 5, 20, 'km/h', [[0, 125, 'rgba(255,255,255,0.05)']], '');
    gauge(x, w - h * 0.5, cy, r, T.rpm / 100, 30, Math.PI * 0.75, Math.PI * 2.25, 5, 1, 5, '×100 rpm', [[10, 15.5, '#2fae5b'], [21.5, 30, '#d23a2a']], '');
    // centre panel
    const mx = w / 2, cw = w - h * 2.08;
    x.fillStyle = '#0b0d10'; x.fillRect(mx - cw / 2, h * 0.08, cw, h * 0.84);
    x.strokeStyle = '#2a3038'; x.lineWidth = 1; x.strokeRect(mx - cw / 2, h * 0.08, cw, h * 0.84);
    const gtxt = T.gear === 0 ? 'N' : T.gear < 0 ? 'R' + (-T.gear) : (T.autoMode ? 'A' : 'M') + T.gear;
    x.fillStyle = T.shift > 0 ? '#ffb02e' : '#f4f1ea'; x.font = `${h * 0.24}px ${MONO}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(gtxt, mx, h * 0.25);
    x.fillStyle = '#ffb02e'; x.font = `${h * 0.15}px ${MONO}`;
    x.fillText(Math.round(kmh) + ' km/h', mx, h * 0.45, cw * 0.9);
    // fuel + air bars
    const bar = (y, frac, col, label, val) => {
      const bw = cw * 0.78, bx = mx - bw / 2;
      x.fillStyle = '#1b2026'; x.fillRect(bx, y, bw, h * 0.05);
      x.fillStyle = col; x.fillRect(bx, y, bw * U.clamp(frac, 0, 1), h * 0.05);
      x.fillStyle = '#8b9199'; x.font = `500 ${h * 0.085}px ${COND}`; x.textAlign = 'left'; x.textBaseline = 'bottom';
      x.fillText(label, bx, y - 1);
      x.textAlign = 'right'; x.fillText(val, bx + bw, y - 1);
    };
    bar(h * 0.62, T.fuel / T.tank, T.fuel / T.tank < 0.12 ? '#ffb02e' : '#e8e4da', 'FUEL', Math.round(T.fuel) + ' L');
    bar(h * 0.79, T.air / 10, T.air < 5.2 ? '#d23a2a' : '#5aa6d6', 'AIR', T.air.toFixed(1) + ' bar');
    // warning lamps row
    const s = h * 0.13, ly = h * 0.94 - s * 0.2;
    const blink = (G.clock % 0.8) < 0.4;
    const lamps = [
      [T.indL || T.hazard ? blink : false, '#3ddc6a', ICON.left],
      [T.park, '#ff3b30', ICON.park],
      [T.air < 5.2, '#ff3b30', ICON.air],
      [T.fuel / T.tank < 0.12, '#ffb02e', ICON.fuel],
      [T.lights > 0 && !T.high, '#3ddc6a', ICON.lowb],
      [T.high && T.lights > 0, '#3d8bff', ICON.beam],
      [T.damage > 0.3 || T.stalled, '#ffb02e', ICON.engine],
      [!!T.trailer, '#3ddc6a', ICON.trailer],
      [T.cruise > 0, '#3ddc6a', ICON.cruise],
      [T.indR || T.hazard ? blink : false, '#3ddc6a', ICON.right],
    ];
    const lw = w - h * 0.2, step = lw / lamps.length;
    lamps.forEach(([on, col, fn], i) => lamp(x, h * 0.1 + step * (i + 0.5), h - s * 0.55, s, on, col, fn));
    void ly;
    // retarder / cruise text near gauges
    x.font = `${h * 0.075}px ${MONO}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (T.retarder > 0) { x.fillStyle = '#ffb02e'; x.fillText((T.gearbox.retarder ? 'RET ' : 'EBR ') + T.retarder, h * 0.5, cy + r * 0.35); }
    if (T.cruise > 0) { x.fillStyle = '#3ddc6a'; x.fillText('CC ' + Math.round(T.cruise * 3.6), w - h * 0.5, cy + r * 0.35); }
    x.fillStyle = '#8b9199';
    x.fillText(String(Math.floor(T.odo / 100) / 10).padStart(6, '0') + ' km', h * 0.5, cy + r * 0.52);
    if (G.env) x.fillText(U.fmtTime(G.env.time), w - h * 0.5, cy + r * 0.52);
  };

  // ---------------------------------------------------------------- GPS
  let roadPaths = null;
  function buildPaths(world) {
    roadPaths = { motorway: new Path2D(), road: new Path2D(), spur: new Path2D() };
    for (const e of world.edges) {
      const p = roadPaths[e.type];
      p.moveTo(e.px[0], e.pz[0]);
      for (let i = 4; i < e.n; i += 4) p.lineTo(e.px[i], e.pz[i]);
      p.lineTo(e.px[e.n - 1], e.pz[e.n - 1]);
    }
    roadPaths.yards = new Path2D();
    for (const y of world.yards) {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => world.yardToWorld(y, a * y.hw, b * y.hl));
      roadPaths.yards.moveTo(c[0].x, c[0].z);
      for (let k = 1; k < 4; k++) roadPaths.yards.lineTo(c[k].x, c[k].z);
      roadPaths.yards.closePath();
    }
  }
  H.drawGPS = (x, w, h, T, world, route, zoom, target) => {
    if (!roadPaths) buildPaths(world);
    x.save();
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#16202a'; x.fillRect(0, 0, w, h);
    const sc = zoom; // px per metre
    x.translate(w / 2, h * 0.68);
    x.rotate(-T.h + Math.PI);
    x.scale(sc, sc);
    x.translate(-T.x, -T.z);
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const c of world.cities) {
      x.fillStyle = 'rgba(80,96,110,0.35)'; x.beginPath(); x.arc(c.x, c.z, 560, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = '#2b3946'; x.fill(roadPaths.yards);
    x.strokeStyle = '#3c4e5f'; x.lineWidth = 26; x.stroke(roadPaths.motorway);
    x.strokeStyle = '#d7dee5'; x.lineWidth = 16; x.stroke(roadPaths.motorway);
    x.strokeStyle = '#c9d2da'; x.lineWidth = 10; x.stroke(roadPaths.road);
    x.strokeStyle = '#9fb0bf'; x.lineWidth = 8; x.stroke(roadPaths.spur);
    for (const c of world.cities) { x.fillStyle = '#d7dee5'; x.beginPath(); x.arc(c.x, c.z, 40, 0, Math.PI * 2); x.fill(); x.fillStyle = '#4a7a3a'; x.beginPath(); x.arc(c.x, c.z, 15, 0, Math.PI * 2); x.fill(); }
    if (route && route.path) {
      x.strokeStyle = '#ff9d2e'; x.lineWidth = 9 / Math.max(0.3, sc) * 0.35 + 6; x.stroke(route.path);
    }
    if (target) {
      x.fillStyle = '#ff9d2e';
      x.beginPath(); x.arc(target.x, target.z, 14 / sc, 0, Math.PI * 2); x.fill();
    }
    x.restore();
    // labels (unrotated)
    x.save();
    x.font = `600 13px ${COND}`; x.textAlign = 'center';
    for (const c of world.cities) {
      const dx = c.x - T.x, dz = c.z - T.z;
      const a = -T.h + Math.PI;
      const rx = (dx * Math.cos(a) - dz * Math.sin(a)) * sc + w / 2, ry = (dx * Math.sin(a) + dz * Math.cos(a)) * sc + h * 0.68;
      if (rx > -40 && rx < w + 40 && ry > -10 && ry < h + 10) {
        x.fillStyle = 'rgba(10,14,18,0.7)'; const tw = x.measureText(c.name).width + 10;
        x.fillRect(rx - tw / 2, ry - 26, tw, 17);
        x.fillStyle = '#f4f1ea'; x.fillText(c.name, rx, ry - 13);
      }
    }
    // player arrow
    x.translate(w / 2, h * 0.68);
    x.fillStyle = '#ff9d2e'; x.strokeStyle = '#111'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -12); x.lineTo(9, 10); x.lineTo(0, 5); x.lineTo(-9, 10); x.closePath(); x.fill(); x.stroke();
    x.restore();
  };

  // ---------------------------------------------------------------- world map screen
  const M = { cx: 0, cz: 0, zoom: 0.07, drag: null, open: false, sel: null };
  H.mapState = M;
  H.drawMap = (cv, world, T, game) => {
    if (!roadPaths) buildPaths(world);
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = '#0b1218'; x.fillRect(0, 0, w, h);
    const sc = M.zoom;
    x.save();
    x.translate(w / 2, h / 2); x.scale(sc, sc); x.translate(-M.cx, -M.cz);
    x.globalAlpha = 0.85;
    x.imageSmoothingEnabled = true;
    x.drawImage(world.colorMap, -world.TS, -world.TS, world.TS * 2, world.TS * 2);
    x.globalAlpha = 1;
    x.fillStyle = 'rgba(8,14,20,0.25)'; x.fillRect(-world.TS, -world.TS, world.TS * 2, world.TS * 2);
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = '#1c2630'; x.lineWidth = 6 / sc + 20; x.stroke(roadPaths.motorway);
    x.strokeStyle = '#f2c94c'; x.lineWidth = 3 / sc + 10; x.stroke(roadPaths.motorway);
    x.strokeStyle = '#f4f1ea'; x.lineWidth = 2.2 / sc + 6; x.stroke(roadPaths.road);
    x.strokeStyle = '#c9d2da'; x.lineWidth = 1.5 / sc + 4; x.stroke(roadPaths.spur);
    if (game.route && game.route.path) { x.strokeStyle = '#ff7a1a'; x.lineWidth = 4 / sc + 6; x.stroke(game.route.path); }
    x.restore();
    const S = (wx, wz) => [(wx - M.cx) * sc + w / 2, (wz - M.cz) * sc + h / 2];
    // depots
    for (const d of world.depots) {
      const [sx, sy] = S(d.yard.cx, d.yard.cz);
      x.fillStyle = d.kind === 'fuel' ? '#3d8bff' : d.company.color;
      x.strokeStyle = '#0b1218'; x.lineWidth = 2;
      x.beginPath(); x.arc(sx, sy, d.kind === 'fuel' ? 5 : 6, 0, Math.PI * 2); x.fill(); x.stroke();
      if (sc > 0.25) {
        x.fillStyle = '#f4f1ea'; x.font = `500 12px ${COND}`; x.textAlign = 'left';
        x.fillText(d.kind === 'fuel' ? 'Fuel & Service' : d.company.name, sx + 9, sy + 4);
      }
    }
    // cities
    x.textAlign = 'center';
    for (const c of world.cities) {
      const [sx, sy] = S(c.x, c.z);
      x.font = `700 ${sc > 0.12 ? 20 : 15}px ${COND}`;
      x.lineWidth = 4; x.strokeStyle = 'rgba(8,12,16,0.85)'; x.strokeText(c.name.toUpperCase(), sx, sy - 12);
      x.fillStyle = '#f4f1ea'; x.fillText(c.name.toUpperCase(), sx, sy - 12);
    }
    // job markers
    const mark = (pt, col, label) => {
      const [sx, sy] = S(pt.x, pt.z);
      x.fillStyle = col; x.strokeStyle = '#0b1218'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx - 9, sy - 18); x.lineTo(sx + 9, sy - 18); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#f4f1ea'; x.font = `600 13px ${COND}`; x.fillText(label, sx, sy - 24);
    };
    if (game.job) {
      const j = game.job;
      if (!j.picked) mark({ x: j.from.yard.cx, z: j.from.yard.cz }, '#3ddc6a', 'Pick up');
      mark({ x: j.to.yard.cx, z: j.to.yard.cz }, '#ff7a1a', 'Deliver');
    }
    if (game.waypoint && !game.job) mark(game.waypoint.pos, '#3d8bff', 'Waypoint');
    // player
    const [px, py] = S(T.x, T.z);
    x.save(); x.translate(px, py); x.rotate(-T.h + Math.PI);
    x.fillStyle = '#ff9d2e'; x.strokeStyle = '#111'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -13); x.lineTo(10, 11); x.lineTo(0, 5); x.lineTo(-10, 11); x.closePath(); x.fill(); x.stroke();
    x.restore();
    // scale bar
    const km = sc > 0.2 ? 0.5 : 2;
    x.fillStyle = '#f4f1ea'; x.fillRect(20, h - 30, km * 1000 * sc, 4);
    x.font = `500 13px ${COND}`; x.textAlign = 'left'; x.fillText(km + ' km', 20, h - 38);
  };
  H.mapPick = (world, sx, sy, w, h) => {
    const wx = (sx - w / 2) / M.zoom + M.cx, wz = (sy - h / 2) / M.zoom + M.cz;
    let best = null, bd = 30 / M.zoom;
    for (const d of world.depots) { const dd = Math.hypot(d.yard.cx - wx, d.yard.cz - wz); if (dd < bd) { bd = dd; best = d; } }
    return best;
  };

  // ---------------------------------------------------------------- toasts / prompts
  H.toast = (html, kind = 'info', ms = 3800) => {
    const box = $('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  };
  let promptKey = '';
  H.prompt = (text, action) => {
    const el = $('prompt');
    const key = text ? text + (action || '') : '';
    if (key === promptKey) return;
    promptKey = key;
    if (!text) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = text;
    el.dataset.act = action || '';
  };
  return H;
})();
