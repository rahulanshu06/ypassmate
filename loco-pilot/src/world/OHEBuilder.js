import * as THREE from 'three';
import { TrackFrame } from './TrackFrame.js';
import { Prim } from '../render/GeoBatch.js';

export const CONTACT_H = 5.55;
const SYSTEM_H = 1.35;
const SPAN = 58;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();
const _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(), _z = new THREE.Vector3();

/** Thin box between two points (for wires, tubes, struts). */
export function strut(batch, key, a, b, w, h = w, color) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 1e-4) return;
  _dir.divideScalar(len);
  const ref = Math.abs(_dir.y) > 0.95 ? _x.set(1, 0, 0) : _up;
  _z.crossVectors(ref, _dir).normalize(); // side
  const yv = new THREE.Vector3().crossVectors(_dir, _z).normalize();
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, cz = (a.z + b.z) / 2;
  _m.set(
    _z.x * w, yv.x * h, _dir.x * len, cx,
    _z.y * w, yv.y * h, _dir.y * len, cy,
    _z.z * w, yv.z * h, _dir.z * len, cz,
    0, 0, 0, 1,
  );
  batch.add(key, Prim.box(), _m, color);
}

/** Electrified tracks at chainage s (mains, loops, berths). */
function liveTracks(network, s) {
  const out = [];
  for (const t of network.tracks.values()) {
    if (t.kind === 'siding') continue;
    if (s >= t.sA && s <= t.sB) out.push(t);
  }
  return out;
}

export function mastPositions(def, s0, s1) {
  const out = [];
  const first = Math.ceil(s0 / SPAN) * SPAN;
  for (let s = first; s < s1; s += SPAN) out.push(s);
  return out;
}

/**
 * Overhead equipment for [s0,s1): masts / portals, cantilevers, catenary, contact wire, droppers.
 */
export function buildOHEChunk(ctx, s0, s1, batch, origin) {
  const { geo, network, def } = ctx;
  const frame = new TrackFrame(geo);
  const tunnels = [...(def.tunnels || [])];
  if (def.endTunnel) tunnels.push({ s0: def.endTunnel.s, s1: geo.length + 100 });
  const inTunnel = (s) => tunnels.some((t) => s > t.s0 + 3 && s < t.s1 - 3);
  const onBridge = (s) => (def.bridges || []).some((b) => b.type === 'truss' && s > b.s0 + 3 && s < b.s1 - 3);
  const galv = new THREE.Color('#9aa0a5');
  const conc = new THREE.Color('#a9a59c');
  // masts from the span before s0 to after s1 so wires connect across chunk edges
  const masts = [];
  for (let s = Math.floor(s0 / SPAN) * SPAN; s <= s1 + SPAN; s += SPAN) masts.push(s);
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let mi = 0; mi < masts.length; mi++) {
    const s = masts[mi];
    if (s < 0 || s > geo.length) continue;
    const tracks = liveTracks(network, s);
    if (!tracks.length) continue;
    const own = s >= s0 && s < s1; // structures only once
    const tunnel = inTunnel(s);
    const bridge = onBridge(s);
    const k = Math.round(s / SPAN);
    const stagger = k % 2 ? 0.2 : -0.2;
    if (own) {
      if (tunnel) {
        for (const tr of tracks) {
          frame.at((x) => tr.offsetAt(x), s, origin);
          frame.point(0, CONTACT_H + SYSTEM_H, p);
          frame.point(0, 7.6, q);
          strut(batch, 'galv', p, q, 0.08);
        }
      } else if (!bridge) {
        const offs = tracks.map((t) => t.offsetAt(s)).sort((a, b) => a - b);
        const lo = offs[0], hi = offs[offs.length - 1];
        const g = geo.sample(s);
        const flat = (lat, y) => new THREE.Vector3(g.x + g.nx * lat - origin.x, g.y + y - origin.y, g.z + g.nz * lat - origin.z);
        const yaw = Math.atan2(g.tx, g.tz);
        const mast = (lat, height) => {
          const base = flat(lat, -0.75);
          _m.makeRotationY(yaw);
          _m.scale(new THREE.Vector3(0.6, 0.9, 0.6));
          _m.setPosition(base);
          batch.add('concrete', Prim.boxBase(), _m, conc);
          _m.makeRotationY(yaw);
          _m.scale(new THREE.Vector3(0.22, height, 0.16));
          _m.setPosition(flat(lat, 0.1));
          batch.add('galv', Prim.boxBase(), _m, galv);
        };
        if (tracks.length <= 2 && hi - lo < 6) {
          // individual masts with cantilevers outside each line
          for (const tr of tracks) {
            const o = tr.offsetAt(s);
            const side = o < 0 ? -1 : 1;
            const mastLat = o + side * 3.1;
            mast(mastLat, 8.4);
            frame.at((x) => tr.offsetAt(x), s, origin);
            // bracket tube (horizontal) and stay tube (inclined)
            const top = flat(mastLat, 7.15), mid = flat(mastLat, 5.95);
            frame.point(stagger * side, CONTACT_H + SYSTEM_H, p);
            strut(batch, 'galv', top, p, 0.07);
            frame.point(stagger * side - side * 0.6, CONTACT_H + 0.25, q);
            strut(batch, 'galv', mid, q, 0.06);
            // registration arm
            frame.point(stagger, CONTACT_H, p);
            strut(batch, 'galv', q, p, 0.035);
            // insulators near the mast
            const ins1 = flat(mastLat - side * 0.45, 7.1), ins2 = flat(mastLat - side * 0.45, 5.95);
            _m.makeTranslation(ins1.x, ins1.y - 0.25, ins1.z);
            _m.scale(new THREE.Vector3(0.16, 0.5, 0.16));
            batch.add('insulator', Prim.cyl(8), _m);
            _m.makeTranslation(ins2.x, ins2.y - 0.25, ins2.z);
            _m.scale(new THREE.Vector3(0.16, 0.5, 0.16));
            batch.add('insulator', Prim.cyl(8), _m);
            // balance weights every ~1.5 km
            if (k % 26 === 0) {
              const w = flat(mastLat + side * 0.35, 2.2);
              _m.makeTranslation(w.x, w.y, w.z);
              _m.scale(new THREE.Vector3(0.35, 2.4, 0.35));
              batch.add('steelDark', Prim.cyl(10), _m);
            }
          }
        } else {
          // portal structure spanning all tracks
          const L = lo - 3.4, R = hi + 3.4;
          mast(L, 9.2);
          mast(R, 9.2);
          const a = flat(L, 8.6), b = flat(R, 8.6);
          strut(batch, 'galv', a, b, 0.45, 0.6);
          for (const tr of tracks) {
            const o = tr.offsetAt(s);
            frame.at((x) => tr.offsetAt(x), s, origin);
            const top = flat(o, 8.3);
            frame.point(stagger, CONTACT_H + SYSTEM_H, p);
            strut(batch, 'galv', top, p, 0.06);
            frame.point(stagger, CONTACT_H, q);
            strut(batch, 'galv', p, q, 0.03);
          }
        }
      }
    }
    // wires for the span s -> next mast
    const sN = masts[mi + 1];
    if (sN === undefined || !own) continue;
    for (const tr of tracks) {
      if (sN > tr.sB + 0.1 || s < tr.sA - 0.1) continue;
      const off = (x) => tr.offsetAt(x);
      const stagN = (Math.round(sN / SPAN) % 2 ? 0.2 : -0.2);
      const segs = 6;
      let prevC = null, prevM = null;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const sx = s + (sN - s) * t;
        frame.at(off, sx, origin);
        const lat = stagger + (stagN - stagger) * t;
        const sag = 4 * t * (1 - t);
        const c = frame.point(lat, CONTACT_H, new THREE.Vector3());
        const mm = frame.point(lat, CONTACT_H + SYSTEM_H - sag * (SYSTEM_H - 0.18), new THREE.Vector3());
        if (prevC) {
          strut(batch, 'wire', prevC, c, 0.022);
          strut(batch, 'wire', prevM, mm, 0.018);
        }
        if (i > 0 && i < segs) strut(batch, 'wire', c, mm, 0.008);
        prevC = c;
        prevM = mm;
      }
    }
  }
}
