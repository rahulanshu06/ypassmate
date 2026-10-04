import * as THREE from 'three';
import { GeoBatch, Prim } from '../render/GeoBatch.js';
import { materials } from '../render/Materials.js';
import { extrudeProfile, TrackFrame } from './TrackFrame.js';
import { facadeBox, box, cyl, addCityBuilding } from '../render/Buildings.js';
import { stationBoardMaterial, platformNumberMaterial, textPanelMaterial, ClockFace } from '../render/Signage.js';
import { strut } from './OHEBuilder.js';
import { PLATFORM_GAP, PLATFORM_HEIGHT } from './Network.js';
import { Rng } from '../core/Rng.js';

const PH = PLATFORM_HEIGHT;
export const sharedClock = { face: null };

/**
 * Builds a complete station: platforms with coping & tactile strips, canopies, station building,
 * foot over bridges, name boards, furniture, lamps; terminus train shed for the start station.
 * Returns a Group with userData { lamps, walkAreas, station }.
 */
export function buildStation(ctx, st) {
  const { geo, network } = ctx;
  const rng = new Rng(st.sCenter);
  const g0 = geo.sample(st.sCenter);
  const origin = new THREE.Vector3(g0.x, g0.y, g0.z);
  const group = new THREE.Group();
  group.name = 'station:' + st.id;
  group.position.copy(origin);
  const batch = new GeoBatch();
  const frame = new TrackFrame(geo);
  const lamps = [];
  const walkAreas = [];
  const special = []; // meshes with unique materials
  const tmp = {};
  const P = (s, d, y = 0) => {
    const g = geo.sample(s, tmp);
    return new THREE.Vector3(g.x + g.nx * d - origin.x, g.y + y - origin.y, g.z + g.nz * d - origin.z);
  };
  const yawAt = (s) => {
    const g = geo.sample(s, tmp);
    return Math.atan2(g.tx, g.tz); // local +z along track
  };
  const sList = (a, b, step = 6) => {
    const out = [];
    for (let s = a; s < b; s += step) out.push(s);
    out.push(b);
    return out;
  };
  const tracksAt = (s) => [...network.tracks.values()].filter((t) => s >= t.sA && s <= t.sB).map((t) => t.offsetAt(s));
  const s0 = st.platformS0, s1 = st.platformS1, sc = (s0 + s1) / 2;
  const offsetsMid = tracksAt(st.sCenter);
  const hasTrack = (lat) => offsetsMid.some((o) => Math.abs(o - lat) < 0.35);
  const canopyColor = st.hill ? '#7a5a3a' : st.size === 'small' ? '#4e7a52' : '#4f5d75';

  // ------------------------------------------------------------ platforms
  st.platforms.forEach((pf, idx) => {
    const w = pf.b - pf.a, c = (pf.a + pf.b) / 2, hw = w / 2;
    const off = () => c;
    const sl = sList(s0, s1, 8);
    const leftEdge = hasTrack(pf.a - PLATFORM_GAP), rightEdge = hasTrack(pf.b + PLATFORM_GAP);
    extrudeProfile(batch, 'concreteDark', frame, off, sl, [[-hw, -0.8], [-hw, PH - 0.12]], origin, { uScale: 0.5, vScale: 0.2, color: new THREE.Color('#b0aaa0') });
    extrudeProfile(batch, 'concreteDark', frame, off, sl, [[hw, PH - 0.12], [hw, -0.8]], origin, { uScale: 0.5, vScale: 0.2, color: new THREE.Color('#b0aaa0') });
    // coping lip
    extrudeProfile(batch, 'concrete', frame, off, sl, [[-hw - 0.05, PH - 0.14], [-hw - 0.05, PH]], origin, { uScale: 1, vScale: 0.2, color: new THREE.Color('#d8d4cc') });
    extrudeProfile(batch, 'concrete', frame, off, sl, [[hw + 0.05, PH], [hw + 0.05, PH - 0.14]], origin, { uScale: 1, vScale: 0.2, color: new THREE.Color('#d8d4cc') });
    const inL = leftEdge ? 0.95 : 0, inR = rightEdge ? 0.95 : 0;
    if (leftEdge) extrudeProfile(batch, 'platformEdge', frame, off, sl, [[-hw - 0.05, PH], [-hw + inL, PH]], origin, { uScale: 1 / 0.95, vScale: 0.25 });
    if (rightEdge) extrudeProfile(batch, 'platformEdge', frame, off, sl, [[hw - inR, PH], [hw + 0.05, PH]], origin, { uScale: 1 / 0.95, vScale: 0.25, uFlip: true });
    extrudeProfile(batch, 'platform', frame, off, sl, [[-hw + inL, PH], [hw - inR, PH]], origin, { uScale: 0.25, vScale: 0.125, color: new THREE.Color('#ffffff') });
    // end ramps
    for (const [sEnd, dir] of [[s0, -1], [s1, 1]]) {
      const len = 9;
      const a = P(sEnd, c, PH), b = P(sEnd + dir * len, c, -0.7);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const yaw = yawAt(sEnd);
      const pitch = Math.atan2(PH + 0.7, len) * dir;
      const m = new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')), new THREE.Vector3(w * 0.7, 0.3, Math.hypot(len, PH + 0.7)));
      batch.add('concrete', Prim.box(), m, new THREE.Color('#a8a296'));
    }
    // back railing where no track
    for (const [side, edge] of [[-1, leftEdge], [1, rightEdge]]) {
      if (edge) continue;
      const lat = side < 0 ? -hw + 0.1 : hw - 0.1;
      extrudeProfile(batch, 'steel', frame, off, sl, side < 0 ? [[lat, PH], [lat, PH + 1.1]] : [[lat, PH + 1.1], [lat, PH]], origin, { color: new THREE.Color('#5e6e60') });
      for (let s = s0; s < s1; s += 3) {
        const p = P(s, c + lat, PH);
        box(batch, 'steel', p.x, p.y, p.z, 0.06, 1.15, 0.06, 0, '#4a5a4c');
      }
    }
    walkAreas.push({ s0: s0 + 12, s1: s1 - 12, a: pf.a + (leftEdge ? 1.6 : 0.8), b: pf.b - (rightEdge ? 1.6 : 0.8), platform: idx, edges: { left: leftEdge, right: rightEdge } });

    // ------------------------------------------------------------ canopy
    if (pf.canopy) {
      const half = pf.canopy === 'short' ? 45 : (s1 - s0) * 0.36;
      const centre = st.building ? Math.min(Math.max(st.building.s, s0 + half + 10), s1 - half - 10) : sc;
      const ca = centre - half, cb = centre + half;
      const W = hw + 0.4;
      const roofProfile = [[-W, 4.65], [0, 4.25], [W, 4.65], [W, 4.55], [0, 4.15], [-W, 4.55]];
      extrudeProfile(batch, 'roof', frame, off, sList(ca, cb, 9), roofProfile, origin, { closed: true, uScale: 0.5, vScale: 0.5, color: new THREE.Color(canopyColor).lerp(new THREE.Color('#b8bcc0'), 0.5) });
      // fascia boards
      extrudeProfile(batch, 'paint', frame, off, sList(ca, cb, 9), [[-W - 0.02, 4.3], [-W - 0.02, 4.7]], origin, { color: new THREE.Color(canopyColor) });
      extrudeProfile(batch, 'paint', frame, off, sList(ca, cb, 9), [[W + 0.02, 4.7], [W + 0.02, 4.3]], origin, { color: new THREE.Color(canopyColor) });
      for (let s = ca + 4; s < cb; s += 9) {
        const p = P(s, c, PH);
        cyl(batch, 'paint', p.x, p.y, p.z, 0.16, 4.25 - PH + 0.1 + 0.84, canopyColor, 10);
        // arms
        const top = P(s, c, 4.2);
        strut(batch, 'paint', top, P(s, c - W + 0.3, 4.55), 0.12, 0.12, new THREE.Color(canopyColor));
        strut(batch, 'paint', top, P(s, c + W - 0.3, 4.55), 0.12, 0.12, new THREE.Color(canopyColor));
        // tube lights under the roof
        for (const lat of [-hw * 0.5, hw * 0.5]) {
          const l = P(s + 4.5, c + lat, 4.05);
          box(batch, 'lampCool', l.x, l.y, l.z, 0.12, 0.06, 1.2, yawAt(s), null, false);
          lamps.push({ pos: l.clone(), color: 0xe6f2ff, kind: 'tube' });
        }
        // hanging coach indicator boards every few columns
        if (Math.round((s - ca) / 9) % 3 === 1 && w > 6) {
          const b = P(s, c, 3.35);
          box(batch, 'dark', b.x, b.y, b.z, 0.12, 0.42, 3.2, yawAt(s), null, false);
        }
      }
    } else {
      // open platform: lamp posts
      for (let s = s0 + 15; s < s1; s += 30) {
        const p = P(s, c, PH);
        cyl(batch, 'steel', p.x, p.y, p.z, 0.08, 6, '#7b8188', 8);
        const l = P(s, c, PH + 6);
        box(batch, 'lampCool', l.x, l.y, l.z, 0.3, 0.12, 0.6, yawAt(s), null, false);
        lamps.push({ pos: l.clone(), color: 0xffe2b0, kind: 'post' });
      }
    }

    // ------------------------------------------------------------ furniture
    for (let s = s0 + 30; s < s1 - 30; s += 22 + rng.next() * 12) {
      const kind = rng.next();
      const lat = c + (rng.next() - 0.5) * Math.max(0, w - 4.5);
      const p = P(s, lat, PH);
      const yaw = yawAt(s);
      if (kind < 0.5) {
        // steel bench
        box(batch, 'steel', p.x, p.y + 0.42, p.z, 0.5, 0.06, 1.9, yaw, '#8c949c');
        box(batch, 'steel', p.x - 0.2, p.y + 0.42, p.z, 0.06, 0.45, 1.9, yaw, '#8c949c');
        box(batch, 'steelDark', p.x, p.y, p.z, 0.4, 0.42, 0.06, yaw);
      } else if (kind < 0.68 && w > 6) {
        // tea stall / book stall kiosk
        const col = rng.chance(0.5) ? '#c0392b' : '#1f6fb2';
        box(batch, 'plaster', p.x, p.y, p.z, 2.2, 2.4, 3.2, yaw, '#e9e2d0');
        box(batch, 'paint', p.x, p.y + 2.4, p.z, 2.6, 0.45, 3.6, yaw, col);
        box(batch, 'dark', p.x, p.y + 0.9, p.z, 2.25, 1.0, 2.6, yaw);
      } else if (kind < 0.8) {
        // water booth
        box(batch, 'paint', p.x, p.y, p.z, 0.8, 1.3, 1.6, yaw, '#2f6db5');
        box(batch, 'steel', p.x, p.y + 1.3, p.z, 0.9, 0.1, 1.7, yaw, '#c0c4c8');
      } else {
        // dustbin
        cyl(batch, 'paint', p.x, p.y, p.z, 0.25, 0.8, rng.chance(0.5) ? '#2e8b57' : '#1f5fa8', 10);
      }
    }
  });

  // ------------------------------------------------------------ station name boards
  const elev = geo.elevationAt(st.sCenter) + 0;
  const boardMat = stationBoardMaterial(st, elev);
  const boardGeo = new THREE.PlaneGeometry(4.2, 1.72);
  const addBoard = (s, lat, perpendicular) => {
    const p = P(s, lat, PH);
    const yaw = yawAt(s) + (perpendicular ? 0 : Math.PI / 2);
    for (const k of [0, Math.PI]) {
      const m = new THREE.Mesh(boardGeo, boardMat);
      m.position.set(p.x, p.y + 2.9, p.z);
      m.rotation.set(0, yaw + k, 0);
      m.translateZ(0.04);
      m.castShadow = true;
      special.push(m);
    }
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const sgn of [-1, 1]) {
      const q = p.clone().addScaledVector(right, sgn * 1.9);
      box(batch, 'steel', q.x, q.y, q.z, 0.1, 3.8, 0.1, yaw, '#2a2a2a');
    }
  };
  st.platforms.forEach((pf) => {
    const c = (pf.a + pf.b) / 2;
    addBoard(s0 + 22, c, true);
    addBoard(s1 - 22, c, true);
    addBoard(sc + 30, c, false);
  });
  // platform numbers on hanging boards near both ends
  const berths = network.station(st.id).berths.filter((b) => b.pf);
  for (const b of berths) {
    const tr = network.tracks.get(b.track);
    const o = tr.offsetAt(sc);
    const side = st.platforms.find((pf) => Math.abs(pf.a - PLATFORM_GAP - o) < 0.4 || Math.abs(pf.b + PLATFORM_GAP - o) < 0.4);
    if (!side) continue;
    const lat = Math.abs(side.a - PLATFORM_GAP - o) < 0.4 ? side.a + 1.4 : side.b - 1.4;
    for (const s of [s0 + 60, s1 - 60, sc - 10]) {
      const p = P(s, lat, PH);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), platformNumberMaterial(b.pf));
      m.position.set(p.x, p.y + 3.0, p.z);
      m.rotation.y = yawAt(s);
      special.push(m);
      const m2 = m.clone();
      m2.rotation.y += Math.PI;
      special.push(m2);
      box(batch, 'steel', p.x, p.y, p.z, 0.08, 2.6, 0.08, 0, '#333');
    }
  }

  // ------------------------------------------------------------ station building
  if (st.building) buildStationBuilding(ctx, st, batch, P, yawAt, special, lamps, rng);

  // ------------------------------------------------------------ foot over bridges
  for (const fs of st.fob || []) {
    const lo = Math.min(...st.platforms.map((p) => p.a)) - 2, hi = Math.max(...st.platforms.map((p) => p.b)) + 2;
    const deckH = 7.6;
    const yaw = yawAt(fs);
    const a = P(fs, lo, deckH), b = P(fs, hi, deckH);
    const along = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    for (const k of [-1.8, 1.8]) {
      const aa = a.clone().addScaledVector(along, k), bb = b.clone().addScaledVector(along, k);
      strut(batch, 'steel', aa, bb, 0.25, 0.3, new THREE.Color('#5d6d7e'));
      strut(batch, 'steel', aa.clone().setY(aa.y + 1.4), bb.clone().setY(bb.y + 1.4), 0.2, 0.2, new THREE.Color('#5d6d7e'));
      // lattice web
      const n = Math.round((hi - lo) / 2.5);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const p0 = aa.clone().lerp(bb, t0), p1 = aa.clone().lerp(bb, t1).setY(aa.y + 1.4);
        strut(batch, 'steel', p0, p1, 0.08, 0.08, new THREE.Color('#5d6d7e'));
      }
    }
    // deck & roof
    strut(batch, 'concrete', a.clone().setY(a.y - 0.1), b.clone().setY(b.y - 0.1), 3.6, 0.25, new THREE.Color('#9e998f'));
    strut(batch, 'roof', a.clone().setY(a.y + 3.2), b.clone().setY(b.y + 3.2), 4.4, 0.12, new THREE.Color('#9aa4ad'));
    // stairs down to each platform
    st.platforms.forEach((pf) => {
      const c = (pf.a + pf.b) / 2;
      const top = P(fs + 2.5, c, deckH - 0.1), bot = P(fs + 2.5 + 13, c, PH);
      strut(batch, 'concrete', top, bot, 2.6, 0.3, new THREE.Color('#a39e93'));
      for (const side of [-1.35, 1.35]) {
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        strut(batch, 'steel', top.clone().addScaledVector(right, side).setY(top.y + 1), bot.clone().addScaledVector(right, side).setY(bot.y + 1), 0.06, 0.06, new THREE.Color('#5d6d7e'));
      }
      const col = P(fs, c, PH);
      box(batch, 'steel', col.x, col.y, col.z, 0.4, deckH - PH, 0.4, yaw, '#5d6d7e');
    });
  }

  // ------------------------------------------------------------ terminus train shed and head house
  if (st.kind === 'terminus') buildTrainShed(ctx, st, batch, P, yawAt, lamps, special, origin);

  // ------------------------------------------------------------ goods shed
  if (st.goodsShed) {
    const gsd = st.goodsShed;
    const p = P(gsd.s, gsd.lateral, 0);
    box(batch, 'concrete', p.x, p.y - 0.7, p.z, 14, 1.8, 120, yawAt(gsd.s), '#9c968a');
    box(batch, 'plaster', p.x, p.y + 1.1, p.z, 10, 6, 100, yawAt(gsd.s), '#d7c9a8');
    const roofM = new THREE.Matrix4().compose(p.clone().setY(p.y + 7.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawAt(gsd.s), 0)), new THREE.Vector3(15, 0.3, 104));
    batch.add('roof', Prim.boxBase(), roofM, new THREE.Color('#8f979e'));
  }

  // signal cabin near the home end of the station
  {
    const sCab = st.kind === 'terminus' ? 900 : s0 - 45;
    const lat = st.kind === 'terminus' ? 32 : (st.building && st.building.side > 0 ? 14 : -14);
    const p = P(sCab, lat, 0);
    const yaw = yawAt(sCab) + (lat > 0 ? Math.PI / 2 : -Math.PI / 2);
    box(batch, 'brick', p.x, p.y - 0.7, p.z, 6, 3.8, 5, yaw, '#e0c9b6');
    box(batch, 'plaster', p.x, p.y + 3.1, p.z, 6.4, 2.6, 5.4, yaw, '#efe6d2');
    box(batch, 'glass', p.x, p.y + 3.6, p.z, 6.45, 1.3, 5.45, yaw);
    box(batch, 'paint', p.x, p.y + 5.7, p.z, 7, 0.3, 6, yaw, '#8a2b2b');
    const pnl = textPanelMaterial('cabin' + st.id, [`${st.code} 'A' CABIN`], '#f3c614', '#111', 512, 96);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.7), pnl);
    const fr = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    m.position.copy(p).addScaledVector(fr, 2.76).setY(p.y + 2.65);
    m.rotation.y = yaw;
    special.push(m);
  }

  const shadowKeys = new Set(['platform', 'platformEdge']);
  batch.build((k) => materials.get(k), group, { castShadow: { has: (k) => !shadowKeys.has(k) } });
  for (const m of special) group.add(m);
  group.updateMatrixWorld(true);
  for (const l of lamps) l.pos.add(origin);
  group.userData = { lamps, walkAreas, station: st, origin };
  return group;
}

function buildStationBuilding(ctx, st, batch, P, yawAt, special, lamps, rng) {
  const b = st.building;
  const yaw = yawAt(b.s) + (b.side > 0 ? Math.PI / 2 : -Math.PI / 2); // local +z faces the tracks
  const depth = b.style === 'grand' ? 22 : b.style === 'junction' ? 16 : 11;
  const lat = b.lateral + b.side * (depth / 2 - 6);
  const centre = P(b.s, lat, 0);
  const wall = b.style === 'hill' ? '#d8cfc0' : '#eadcb8';
  const trim = b.style === 'hill' ? '#6b4a32' : '#8f2b25';
  const storeyH = 4.2;
  const H = storeyH * b.storeys;
  const key = b.style === 'hill' ? 'stone' : 'plaster';
  // main block (facade with windows on upper floors)
  const fx = centre.x, fz = centre.z, fy = centre.y - 0.6;
  box(batch, key, fx, fy, fz, b.length, H + 0.6, depth, yaw, wall);
  // cornice and parapet with trim colour
  for (let f = 1; f <= b.storeys; f++) box(batch, 'paint', fx, fy + 0.6 + f * storeyH - 0.25, fz, b.length + 0.4, 0.35, depth + 0.4, yaw, trim);
  box(batch, key, fx, fy + 0.6 + H, fz, b.length + 0.2, 1.1, depth + 0.2, yaw, wall);
  // plinth band
  box(batch, 'paint', fx, fy, fz, b.length + 0.15, 1.2, depth + 0.15, yaw, trim);
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const front = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const fp = new THREE.Vector3(fx, fy + 0.6, fz).addScaledVector(front, depth / 2);
  // veranda with arched bays toward the platform
  const bays = Math.max(3, Math.floor(b.length / 4.5));
  const vd = 3.6;
  for (let i = 0; i <= bays; i++) {
    const t = (i / bays - 0.5) * (b.length - 1);
    const q = fp.clone().addScaledVector(right, t).addScaledVector(front, vd);
    box(batch, key, q.x, q.y - 0.6, q.z, 0.55, storeyH + 0.6, 0.55, yaw, wall);
  }
  const vq = fp.clone().addScaledVector(front, vd / 2);
  box(batch, 'paint', vq.x, vq.y + storeyH - 0.5, vq.z, b.length, 0.5, vd + 0.6, yaw, trim);
  box(batch, 'concrete', vq.x, vq.y - 0.6, vq.z, b.length, 0.6 + 0.84, vd + 0.6, yaw, '#bdb6a8');
  // doors and windows on the facade
  for (let i = 0; i < bays; i++) {
    const t = ((i + 0.5) / bays - 0.5) * (b.length - 1);
    for (let f = 0; f < b.storeys; f++) {
      const q = fp.clone().addScaledVector(right, t).addScaledVector(front, 0.03);
      const isDoor = f === 0 && i % 2 === 0;
      box(batch, isDoor ? 'wood' : 'dark', q.x, q.y + f * storeyH + (isDoor ? 0.2 : 1.2), q.z, isDoor ? 1.6 : 1.4, isDoor ? 2.6 : 1.7, 0.08, yaw, isDoor ? '#5b3a22' : null);
      if (f === 0 && i % 2 === 1) lamps.push({ pos: q.clone().addScaledVector(front, 1.5).setY(q.y + 3.3), color: 0xffd9a0, kind: 'wall' });
    }
  }
  // roof: tiled pitched roof for small/hill stations
  if (b.style === 'small' || b.style === 'hill') {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(fx, fy + 0.6 + H + 0.9, fz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + Math.PI / 4, 0)), new THREE.Vector3(Math.hypot(b.length, depth) * 0.8, 3, Math.hypot(b.length, depth) * 0.8 * (depth / b.length)));
    batch.add('paint', Prim.cone(4), m, new THREE.Color('#9c4a2f'));
  }
  // central tower with clock for grand stations
  const boardMat = stationBoardMaterial(st, 0);
  if (b.style === 'grand' || b.style === 'junction') {
    const towerH = b.style === 'grand' ? H + 10 : H + 4;
    const tq = new THREE.Vector3(fx, fy, fz).addScaledVector(front, depth / 2 - 3);
    box(batch, key, tq.x, tq.y, tq.z, 9, towerH, 7, yaw, wall);
    box(batch, 'paint', tq.x, tq.y + towerH, tq.z, 10, 0.6, 8, yaw, trim);
    if (b.style === 'grand') {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(tq.x, tq.y + towerH + 0.6, tq.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + Math.PI / 4, 0)), new THREE.Vector3(9, 6, 9));
      batch.add('paint', Prim.cone(4), m, new THREE.Color('#8f2b25'));
    }
    if (!sharedClock.face) sharedClock.face = new ClockFace();
    const clock = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), sharedClock.face.material);
    clock.position.copy(tq).addScaledVector(front, 3.55).setY(tq.y + towerH - 2.6);
    clock.rotation.y = yaw;
    special.push(clock);
  }
  // big name board on the parapet facing the tracks
  const nb = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(18, b.length * 0.5), Math.min(18, b.length * 0.5) * 0.41), boardMat);
  nb.position.copy(fp).addScaledVector(front, vd + 0.45).setY(fp.y + storeyH + 0.9);
  if (b.style === 'grand' || b.style === 'junction') nb.position.addScaledVector(right, b.length * 0.28);
  nb.rotation.y = yaw;
  special.push(nb);
  // forecourt on the road side
  const back = new THREE.Vector3(fx, fy + 0.55, fz).addScaledVector(front, -depth / 2 - 14);
  box(batch, 'asphalt', back.x, back.y - 0.3, back.z, b.length + 30, 0.35, 26, yaw, '#ffffff');
  // town buildings behind the forecourt for big stations
  if (st.size === 'major' || st.size === 'large' || st.size === 'junction') {
    for (let i = -2; i <= 2; i++) {
      const q = back.clone().addScaledVector(right, i * 34).addScaledVector(front, -30);
      addCityBuilding(batch, q.x, q.y - 0.5, q.z, yaw, 26, 18, 3 + ((i + 5) % 3), rng, { shops: true, billboard: true });
    }
  }
}

function buildTrainShed(ctx, st, batch, P, yawAt, lamps, special, origin) {
  const { geo } = ctx;
  const frame = new TrackFrame(geo);
  const lo = Math.min(...st.platforms.map((p) => p.a)) - 3, hi = Math.max(...st.platforms.map((p) => p.b)) + 3;
  const c = (lo + hi) / 2, half = (hi - lo) / 2;
  const sa = st.buffer - 10, sb = st.platformS0 + 260;
  // arch profile (band)
  const arch = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = -half + 2 * half * t;
    const y = 10.5 + 9.5 * Math.sin(Math.PI * t);
    arch.push([x, y]);
  }
  const outer = arch;
  const inner = arch.slice().reverse().map(([x, y]) => [x, y - 0.25]);
  const shedS = [];
  for (let s = sa; s <= sb; s += 12) shedS.push(s);
  extrudeProfile(batch, 'roof', frame, () => c, shedS, [...outer, ...inner], origin, { closed: true, uScale: 0.15, vScale: 0.15, color: new THREE.Color('#b9c0c6') });
  // columns and arch ribs every 12 m
  for (let s = sa; s <= sb; s += 12) {
    for (const lat of [lo, hi]) {
      const p = P(s, c + (lat - c), 0);
      box(batch, 'steel', p.x, p.y - 0.7, p.z, 0.7, 11.2, 0.7, yawAt(s), '#6c757d');
    }
    for (let i = 0; i < N; i++) {
      const a = P(s, c + arch[i][0], arch[i][1] - 0.4), b = P(s, c + arch[i + 1][0], arch[i + 1][1] - 0.4);
      strut(batch, 'steel', a, b, 0.25, 0.5, new THREE.Color('#6c757d'));
    }
    for (let k = 2; k < N - 1; k += 4) {
      const l = P(s + 6, c + arch[k][0], arch[k][1] - 1.5);
      box(batch, 'lampCool', l.x, l.y, l.z, 0.5, 0.2, 0.5, 0, null, false);
      lamps.push({ pos: l.clone(), color: 0xfff1d6, kind: 'shed' });
    }
  }
  // head house (concourse) across the buffer end
  const hp = P(st.buffer - 32, c, 0);
  const yaw = yawAt(st.buffer);
  box(batch, 'plaster', hp.x, hp.y - 0.7, hp.z, hi - lo + 24, 16, 30, yaw, '#eadcb8');
  box(batch, 'paint', hp.x, hp.y + 15.3, hp.z, hi - lo + 25, 0.8, 31, yaw, '#8f2b25');
  const front = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const fpos = hp.clone().addScaledVector(front, 15.05);
  for (let i = -6; i <= 6; i++) {
    const q = fpos.clone().addScaledVector(right, i * ((hi - lo) / 13));
    box(batch, 'dark', q.x, q.y + 6.5, q.z, 2.4, 3.2, 0.1, yaw);
    box(batch, 'wood', q.x, q.y - 0.1, q.z, 3, 4.2, 0.1, yaw, '#4a3426');
  }
  const nb = new THREE.Mesh(new THREE.PlaneGeometry(26, 10.6), stationBoardMaterial(st, geo.elevationAt(0)));
  nb.position.copy(fpos).addScaledVector(front, 0.1).setY(fpos.y + 11.6);
  nb.rotation.y = yaw;
  special.push(nb);
}
