import * as THREE from 'three';
import { Prim } from './GeoBatch.js';

// Procedural Indian building pieces appended into a GeoBatch.
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

export const HOUSE_COLORS = ['#f2d7a6', '#f4b9a5', '#a9d2e8', '#c6e0b4', '#f6e27a', '#f5f2ea', '#d9cbb8', '#b9ada0', '#e9c3e0', '#ffcf8a'];
export const CITY_COLORS = ['#e9e1d3', '#d8cdbd', '#efe3c4', '#cfd8dc', '#f0d9c2', '#d9c5a7', '#e6d2d2', '#c8c2b8'];

/** Box with base at (x,y,z) rotated by yaw. */
export function box(batch, key, x, y, z, sx, sy, sz, yaw, color, base = true) {
  _q.setFromAxisAngle(_yAxis, yaw);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  batch.add(key, base ? Prim.boxBase() : Prim.box(), _m, color ? _c.set(color) : null);
}

export function cyl(batch, key, x, y, z, r, h, color, seg = 8) {
  _m.makeScale(r * 2, h, r * 2);
  _m.setPosition(x, y, z);
  batch.add(key, Prim.cyl(seg), _m, color ? _c.set(color) : null);
}

export function cone(batch, key, x, y, z, r, h, color, seg = 8, yaw = 0) {
  _q.setFromAxisAngle(_yAxis, yaw);
  _p.set(x, y, z);
  _s.set(r * 2, h, r * 2);
  _m.compose(_p, _q, _s);
  batch.add(key, Prim.cone(seg), _m, color ? _c.set(color) : null);
}

/** Local -> world helper for a building frame. */
function frame(x, y, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
}

/**
 * Box whose side faces carry repeating UVs in metres / tile size (for facade textures).
 * Adds 4 walls (no top/bottom) to `key`, and a flat roof slab to `roofKey`.
 */
export function facadeBox(batch, key, x, y, z, w, h, d, yaw, tileW, tileH, color, roofKey = 'concrete', roofColor = '#9a948a') {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const hw = w / 2, hd = d / 2;
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const cc = new THREE.Color(color);
  for (let f = 0; f < 4; f++) {
    const a = corners[f], b = corners[(f + 1) % 4];
    const ax = x + a[0] * c + a[1] * s, az = z - a[0] * s + a[1] * c;
    const bx = x + b[0] * c + b[1] * s, bz = z - b[0] * s + b[1] * c;
    const len = Math.hypot(bx - ax, bz - az);
    const nx = (bz - az) / len, nz = -(bx - ax) / len;
    const base = pos.length / 3;
    pos.push(ax, y, az, bx, y, bz, bx, y + h, bz, ax, y + h, az);
    for (let k = 0; k < 4; k++) {
      nor.push(nx, 0, nz);
      col.push(cc.r, cc.g, cc.b);
    }
    const u1 = Math.max(1, Math.round(len / tileW));
    const v1 = Math.max(1, Math.round(h / tileH));
    uv.push(0, 0, u1, 0, u1, v1, 0, v1);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  batch.addRaw(key, pos, nor, uv, col, idx);
  box(batch, roofKey, x, y + h - 0.05, z, w + 0.3, 0.25, d + 0.3, yaw, roofColor);
}

export function addHouse(batch, x, y, z, yaw, w, d, floors, color, rng) {
  const H = 3.1 * floors;
  const key = rng.chance(0.18) ? 'brick' : 'plaster';
  const col = key === 'brick' ? '#d9c0b0' : color;
  box(batch, key, x, y - 0.5, z, w, H + 0.5, d, yaw, col);
  // parapet
  const L = frame(x, y, z, yaw);
  box(batch, key, x, y + H, z, w + 0.1, 0.7, d + 0.1, yaw, col);
  box(batch, 'concrete', x, y + H + 0.05, z, w - 0.3, 0.68, d - 0.3, yaw, '#8d877d');
  // door & windows on front (+z local)
  const [dx, dz] = L(-w * 0.2, d / 2 + 0.02);
  box(batch, 'wood', dx, y, dz, 1.0, 2.1, 0.06, yaw, rng.chance(0.5) ? '#3d5a80' : '#6b4226');
  for (let f = 0; f < floors; f++) {
    const [wx, wz] = L(w * 0.22, d / 2 + 0.02);
    box(batch, 'dark', wx, y + 1.0 + f * 3.1, wz, 1.0, 1.1, 0.06, yaw);
    const [w2x, w2z] = L(-w * 0.25, -d / 2 - 0.02);
    box(batch, 'dark', w2x, y + 1.0 + f * 3.1, w2z, 1.0, 1.1, 0.06, yaw);
    // chajja
    const [cx, cz] = L(w * 0.22, d / 2 + 0.35);
    box(batch, 'concrete', cx, y + 2.25 + f * 3.1, cz, 1.4, 0.08, 0.7, yaw, '#a8a39a');
  }
  // rooftop: water tank + stair room
  if (rng.chance(0.75)) {
    const [tx, tz] = L(w * 0.25 * (rng.next() - 0.5) * 2, -d * 0.2);
    cyl(batch, 'paint', tx, y + H, tz, 0.55, 1.2, rng.chance(0.8) ? '#1c1c1c' : '#2a4d8f', 10);
  }
  if (floors > 1 || rng.chance(0.4)) {
    const [sx, sz] = L(-w * 0.25, -d * 0.2);
    box(batch, key, sx, y + H, sz, 2.2, 2.4, 2.4, yaw, col);
  }
  // clothes line / dish
  if (rng.chance(0.25)) {
    const [ax, az] = L(w * 0.3, d * 0.3);
    box(batch, 'steel', ax, y + H + 0.6, az, 0.6, 0.6, 0.05, yaw + 0.5, '#d0d0d0');
  }
}

export function addHut(batch, x, y, z, yaw, w, d, rng) {
  const H = 2.4;
  box(batch, 'plaster', x, y - 0.4, z, w, H + 0.4, d, yaw, rng.chance(0.5) ? '#b88f62' : '#c9a57a');
  const tiles = rng.chance(0.45);
  // pitched roof as a squashed 4-sided cone
  _q.setFromAxisAngle(_yAxis, yaw + Math.PI / 4);
  _p.set(x, y + H, z);
  _s.set(Math.hypot(w, d) * 1.08, 1.8, Math.hypot(w, d) * 1.08 * (d / w));
  _m.compose(_p, _q, _s);
  batch.add(tiles ? 'paint' : 'thatch', Prim.cone(4), _m, _c.set(tiles ? '#9c4a2f' : '#a38b5a'));
  const L = frame(x, y, z, yaw);
  const [dx, dz] = L(0, d / 2 + 0.02);
  box(batch, 'dark', dx, y, dz, 0.9, 1.8, 0.05, yaw);
}

export function addCityBuilding(batch, x, y, z, yaw, w, d, floors, rng, opts = {}) {
  const style = rng.int(0, 3);
  const color = opts.color || CITY_COLORS[rng.int(0, CITY_COLORS.length - 1)];
  const H = floors * 3.2;
  const shops = opts.shops && floors > 1;
  if (shops) {
    facadeBox(batch, 'shopfront', x, y - 0.4, z, w, 3.6, d, yaw, 7, 3.6, '#ffffff', 'concrete');
    facadeBox(batch, 'facade' + style, x, y + 3.2, z, w, H - 3.2, d, yaw, 7, 3.2, color);
  } else {
    facadeBox(batch, 'facade' + style, x, y - 0.4, z, w, H + 0.4, d, yaw, 7, 3.2, color);
  }
  // parapet + rooftop clutter
  box(batch, 'plaster', x, y + H, z, w + 0.1, 0.9, d + 0.1, yaw, color);
  box(batch, 'concrete', x, y + H + 0.05, z, w - 0.35, 0.9, d - 0.35, yaw, '#8c867c');
  const L = frame(x, y, z, yaw);
  const tanks = Math.max(1, Math.round((w * d) / 120));
  for (let i = 0; i < tanks; i++) {
    const [tx, tz] = L((rng.next() - 0.5) * w * 0.7, (rng.next() - 0.5) * d * 0.7);
    cyl(batch, 'paint', tx, y + H, tz, 0.6, 1.3, '#202020', 10);
  }
  if (rng.chance(0.5)) {
    const [sx, sz] = L(w * 0.25, d * 0.2);
    box(batch, 'plaster', sx, y + H, sz, 3, 2.6, 3, yaw, color);
  }
  if (opts.billboard && rng.chance(0.35)) {
    const [bx, bz] = L(0, 0);
    box(batch, 'steelDark', bx, y + H + 0.5, bz, 0.15, 2.5, 0.15, yaw);
    box(batch, 'paint', bx, y + H + 3, bz, 7, 3, 0.2, yaw, ['#e94f37', '#f6c90e', '#3f88c5', '#44bba4'][rng.int(0, 3)]);
  }
}

export function addTemple(batch, x, y, z, yaw, scale, rng) {
  const s = scale;
  const col = rng.chance(0.5) ? '#f5efe6' : '#f2b25c';
  box(batch, 'stone', x, y - 0.4, z, 6 * s, 1.2, 6 * s, yaw, '#c9bba3');
  box(batch, 'plaster', x, y + 0.8, z, 4 * s, 3.2 * s, 4 * s, yaw, col);
  // shikhara: stacked tapering tiers
  let h = y + 0.8 + 3.2 * s;
  for (let i = 0; i < 4; i++) {
    const r = (2.1 - i * 0.42) * s;
    _q.setFromAxisAngle(_yAxis, yaw + Math.PI / 4);
    _p.set(x, h, z);
    _s.set(r * 2, 1.5 * s, r * 2);
    _m.compose(_p, _q, _s);
    batch.add('plaster', Prim.cone(4), _m, _c.set(col));
    h += 1.1 * s;
  }
  cyl(batch, 'paint', x, h + 0.3, z, 0.25 * s, 0.6 * s, '#d4a017', 8);
  box(batch, 'steelDark', x + 0.3, h, z, 0.05, 2.2 * s, 0.05, yaw);
  box(batch, 'paint', x + 0.6, h + 1.7 * s, z, 0.7, 0.45, 0.03, yaw, '#ff7f1a');
}

export function addWaterTankTower(batch, x, y, z, rng) {
  const H = 14 + rng.next() * 6;
  for (const [dx, dz] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) box(batch, 'concrete', x + dx, y, z + dz, 0.5, H, 0.5, 0, '#b3ada3');
  box(batch, 'concrete', x, y + H * 0.5, z, 4.6, 0.3, 0.3, 0, '#b3ada3');
  box(batch, 'concrete', x, y + H * 0.5, z, 0.3, 0.3, 4.6, 0, '#b3ada3');
  cyl(batch, 'concrete', x, y + H, z, 3.6, 4.5, '#cfc8bb', 16);
  cone(batch, 'concrete', x, y + H + 4.5, z, 3.7, 1.2, '#b8b1a5', 16);
}

export function addHaystack(batch, x, y, z, rng) {
  const r = 1.2 + rng.next() * 0.8;
  cyl(batch, 'thatch', x, y - 0.2, z, r, 1.2, '#c9a95c', 9);
  cone(batch, 'thatch', x, y + 1.0, z, r * 1.05, 1.6 + rng.next(), '#b8984f', 9);
}

export function addChimney(batch, x, y, z, h) {
  _m.makeScale(3.2, h, 3.2);
  _m.setPosition(x, y, z);
  const g = Prim.cyl(10);
  batch.add('brick', g, _m, _c.set('#e0c8b8'));
  cyl(batch, 'dark', x, y + h, z, 1.3, 0.3);
  // kiln mound
  box(batch, 'brick', x, y - 0.5, z + 10, 26, 3, 14, 0, '#c9a090');
}

export function addMobileTower(batch, x, y, z, h) {
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const w = 2.6 * (1 - t) + 0.6;
    box(batch, 'paint', x, y + t * h, z, w, h / 6, w, 0.3, i % 2 ? '#d13b2b' : '#f2f2f2');
  }
  box(batch, 'steelDark', x, y + h, z, 1.6, 2.5, 1.6, 0.3);
}

export function addShed(batch, x, y, z, yaw, w, d, h, color) {
  box(batch, 'plaster', x, y - 0.3, z, w, h + 0.3, d, yaw, color);
  _q.setFromAxisAngle(_yAxis, yaw);
  _p.set(x, y + h, z);
  _s.set(w * 1.04, 0.35, d * 1.06);
  _m.compose(_p, _q, _s);
  batch.add('roof', Prim.boxBase(), _m, _c.set('#9aa0a6'));
}

export function addElectricPole(batch, x, y, z, yaw) {
  box(batch, 'concrete', x, y - 0.5, z, 0.22, 9.5, 0.22, yaw, '#bdb8ae');
  box(batch, 'steelDark', x, y + 8.4, z, 1.8, 0.12, 0.12, yaw);
}

export function addBoulder(batch, x, y, z, r, rng) {
  _q.setFromEuler(new THREE.Euler(rng.next(), rng.next() * 6, rng.next()));
  _p.set(x, y - r * 0.3, z);
  _s.set(r * 2, r * 1.3, r * 1.7);
  _m.compose(_p, _q, _s);
  batch.add('rock', Prim.ico(1), _m, _c.set('#9a9186'));
}
