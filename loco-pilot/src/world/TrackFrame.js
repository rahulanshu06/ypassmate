import * as THREE from 'three';

const _s = {};
/**
 * Local frame on a track at chainage s: origin on track centre at rail-top level,
 * with right/up rotated by cant. All results are in world space minus `origin`.
 */
export class TrackFrame {
  constructor(geo) {
    this.geo = geo;
    this.pos = new THREE.Vector3();
    this.tan = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.cant = 0;
  }
  at(offsetFn, s, origin, ds = 0.5) {
    const g = this.geo.sample(s, _s);
    const off = offsetFn(s);
    const dOff = (offsetFn(s + ds) - offsetFn(s - ds)) / (2 * ds);
    this.pos.set(g.x + g.nx * off - (origin ? origin.x : 0), g.y - (origin ? origin.y : 0), g.z + g.nz * off - (origin ? origin.z : 0));
    this.tan.set(g.tx + g.nx * dOff, g.grade, g.tz + g.nz * dOff).normalize();
    // right = tangent x up(world), flattened
    this.right.set(-this.tan.z, 0, this.tan.x).normalize();
    this.up.crossVectors(this.right, this.tan).normalize();
    const c = g.cant;
    this.cant = c;
    if (c !== 0) {
      const cc = Math.cos(c), sc = Math.sin(c);
      const rx = this.right.x * cc - this.up.x * sc, ry = this.right.y * cc - this.up.y * sc, rz = this.right.z * cc - this.up.z * sc;
      const ux = this.up.x * cc + this.right.x * sc, uy = this.up.y * cc + this.right.y * sc, uz = this.up.z * cc + this.right.z * sc;
      this.right.set(rx, ry, rz);
      this.up.set(ux, uy, uz);
    }
    return this;
  }
  /** point at lateral x (right) and vertical y (up) in this frame */
  point(x, y, out) {
    return out.copy(this.pos).addScaledVector(this.right, x).addScaledVector(this.up, y);
  }
  matrix(out = new THREE.Matrix4(), sx = 1, sy = 1, sz = 1) {
    const r = this.right, u = this.up, t = this.tan, p = this.pos;
    return out.set(
      r.x * sx, u.x * sy, t.x * sz, p.x,
      r.y * sx, u.y * sy, t.y * sz, p.y,
      r.z * sx, u.z * sy, t.z * sz, p.z,
      0, 0, 0, 1,
    );
  }
}

/**
 * Extrude a 2D profile [[x,y],...] (x = right, y = up) along a list of chainages.
 * Hard edges: each profile edge gets its own pair of vertices.
 */
export function extrudeProfile(batch, key, frame, offsetFn, sList, profile, origin, { uScale = 1, vScale = 1, color = null, closed = false, yShift = 0, uFlip = false } = {}) {
  const edges = closed ? profile.length : profile.length - 1;
  const rows = sList.length;
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const p = new THREE.Vector3();
  // profile edge normals in 2D
  const en = [];
  const elen = [];
  let acc = 0;
  for (let e = 0; e < edges; e++) {
    const a = profile[e], b = profile[(e + 1) % profile.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    en.push([-dy / l, dx / l]);
    elen.push([acc, acc + l]);
    acc += l;
  }
  for (let r = 0; r < rows; r++) {
    const s = sList[r];
    frame.at(offsetFn, s, origin);
    for (let e = 0; e < edges; e++) {
      const a = profile[e], b = profile[(e + 1) % profile.length];
      const nx = en[e][0], ny = en[e][1];
      const wn = new THREE.Vector3().addScaledVector(frame.right, nx).addScaledVector(frame.up, ny).normalize();
      frame.point(a[0], a[1] + yShift, p);
      pos.push(p.x, p.y, p.z);
      frame.point(b[0], b[1] + yShift, p);
      pos.push(p.x, p.y, p.z);
      nor.push(wn.x, wn.y, wn.z, wn.x, wn.y, wn.z);
      const u0 = uFlip ? acc - elen[e][0] : elen[e][0], u1 = uFlip ? acc - elen[e][1] : elen[e][1];
      uv.push(u0 * uScale, s * vScale, u1 * uScale, s * vScale);
      if (color) col.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }
  const stride = edges * 2;
  for (let r = 0; r < rows - 1; r++) {
    for (let e = 0; e < edges; e++) {
      const a = r * stride + e * 2, b = a + 1, c = a + stride, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  batch.addRaw(key, pos, nor, uv, color ? col : null, idx);
}

/** Chainage samples between s0 and s1, finer where the track curves or changes offset. */
export function sampleChainages(geo, track, s0, s1, coarse = 4) {
  const out = [s0];
  let s = s0;
  while (s < s1 - 1e-3) {
    const k = Math.abs(geo.curvatureAt(s));
    let step = coarse;
    if (k > 1 / 1600) step = Math.min(step, 2.5);
    if (k > 1 / 700) step = Math.min(step, 1.6);
    if (track && track.isTransition(s)) step = Math.min(step, 1.25);
    s = Math.min(s1, s + step);
    out.push(s);
  }
  return out;
}
