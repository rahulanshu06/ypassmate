import * as THREE from 'three';
import { GeoBatch, Prim } from '../render/GeoBatch.js';
import { materials } from '../render/Materials.js';
import { box, cyl, addElectricPole } from '../render/Buildings.js';
import { speedBoardMaterial, cautionBoardMaterial, termBoardMaterial, whistleBoardMaterial, kmPostMaterial, stopBoardMaterial } from '../render/Signage.js';
import { extrudeProfile, TrackFrame } from './TrackFrame.js';
import { strut } from './OHEBuilder.js';
import { Tex } from '../render/TextureGen.js';
import { DEG } from '../core/MathUtil.js';

const boardGeo = new THREE.PlaneGeometry(0.75, 0.75);
const kmGeo = new THREE.PlaneGeometry(0.34, 0.68);

/** Speed, caution, termination, whistle, stop boards and km posts for a chunk. */
export function addBoardsChunk(ctx, s0, s1, batch, origin, chunk) {
  const tmp = {};
  for (const b of ctx.network.boards) {
    if (b.s < s0 || b.s >= s1) continue;
    const g = ctx.geo.sample(b.s, tmp);
    const facing = Math.atan2(g.tx, g.tz) + (b.dir > 0 ? Math.PI : 0);
    const x = g.x + g.nx * b.lateral - origin.x, z = g.z + g.nz * b.lateral - origin.z, y = g.y - origin.y;
    let mat, h = 2.3, geo = boardGeo;
    switch (b.kind) {
      case 'speed': mat = speedBoardMaterial(b.text, b.tsr); break;
      case 'caution': mat = cautionBoardMaterial(); break;
      case 'term': mat = termBoardMaterial(b.text); break;
      case 'whistle': mat = whistleBoardMaterial(); break;
      case 'stop': mat = stopBoardMaterial(); h = 2.0; break;
      case 'km': mat = kmPostMaterial(b.text); h = 0.55; geo = kmGeo; break;
      case 'halfkm': mat = kmPostMaterial(b.text); h = 0.4; geo = kmGeo; break;
      default: continue;
    }
    const isPost = b.kind === 'km' || b.kind === 'halfkm';
    if (isPost) {
      box(batch, 'concrete', x, y - 0.75, z, 0.38, h + 0.75 - 0.05, 0.16, facing, '#e8e4dc');
    } else {
      box(batch, 'galv', x, y - 0.6, z, 0.07, h + 0.6, 0.07, facing, '#ffffff');
      box(batch, 'steelDark', x, y + h - 0.39, z, 0.8, 0.8, 0.03, facing, '#222');
    }
    const m = new THREE.Mesh(geo, mat);
    const fwd = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    m.position.set(x + fwd.x * (isPost ? 0.085 : 0.02), y + h + (isPost ? -0.3 : 0), z + fwd.z * (isPost ? 0.085 : 0.02));
    m.rotation.y = facing;
    m.userData.sharedGeometry = true;
    chunk.group.add(m);
  }
}

// ------------------------------------------------------------------------------------------
/** Steel through-truss / plate-girder bridge with piers. */
export function buildBridge(ctx, br) {
  const { geo, sampler } = ctx;
  const g0 = geo.sample((br.s0 + br.s1) / 2);
  const origin = new THREE.Vector3(g0.x, g0.y, g0.z);
  const group = new THREE.Group();
  group.position.copy(origin);
  group.name = 'bridge:' + br.id;
  const batch = new GeoBatch();
  const tmp = {};
  const P = (s, d, y) => {
    const g = geo.sample(s, tmp);
    return new THREE.Vector3(g.x + g.nx * d - origin.x, g.y + y - origin.y, g.z + g.nz * d - origin.z);
  };
  const spanLen = (br.s1 - br.s0) / br.spans;
  const steel = new THREE.Color(br.type === 'truss' ? '#5f6f7a' : '#6b6f74');
  const truss = br.type === 'truss';
  const tracks = [-2.5, 2.5];
  for (let i = 0; i <= br.spans; i++) {
    const s = br.s0 + i * spanLen;
    // piers / abutments down to the riverbed
    const p = P(s, 0, 0);
    const ground = sampler.height(p.x + origin.x, p.z + origin.z) - origin.y;
    const top = -1.1;
    const hgt = top - ground + 2;
    const yaw = Math.atan2(geo.sample(s, tmp).tx, tmp.tz);
    if (i === 0 || i === br.spans) box(batch, 'stone', p.x, ground - 1, p.z, 13, hgt + 1, 7, yaw, '#b5a68c');
    else {
      box(batch, 'stone', p.x, ground - 1, p.z, 11, hgt + 1, 4.2, yaw, '#a99a80');
      cyl(batch, 'stone', p.x + Math.sin(yaw + Math.PI / 2) * 5.5, ground - 1, p.z + Math.cos(yaw + Math.PI / 2) * 5.5, 2.1, hgt + 1, '#a99a80', 12);
      cyl(batch, 'stone', p.x - Math.sin(yaw + Math.PI / 2) * 5.5, ground - 1, p.z - Math.cos(yaw + Math.PI / 2) * 5.5, 2.1, hgt + 1, '#a99a80', 12);
    }
    box(batch, 'concrete', p.x, top - 0.2, p.z, 12, 0.5, 2.5, yaw, '#bdb7ab');
    if (i === br.spans) continue;
    const sN = s + spanLen;
    for (const lat of tracks) {
      // bottom chords / girders
      for (const side of [-1, 1]) {
        const d = lat + side * (truss ? 2.9 : 1.1);
        const a = P(s + 0.5, d, -0.6), b = P(sN - 0.5, d, -0.6);
        strut(batch, 'steel', a, b, truss ? 0.45 : 0.4, truss ? 0.9 : 1.4, steel);
        if (!truss) continue;
        // top chord (Warren truss with sloped end posts)
        const H = 7.2;
        const n = 6;
        const ta = P(s + spanLen / n, d, H), tb = P(sN - spanLen / n, d, H);
        strut(batch, 'steel', ta, tb, 0.5, 0.6, steel);
        strut(batch, 'steel', a, ta, 0.45, 0.45, steel);
        strut(batch, 'steel', b, tb, 0.45, 0.45, steel);
        for (let k = 1; k < n; k++) {
          const sb = s + (k * spanLen) / n;
          const bot = P(sb, d, -0.6), topP = P(sb, d, H);
          strut(batch, 'steel', bot, topP, 0.22, 0.3, steel);
          const nextTop = P(s + ((k + 1) * spanLen) / n, d, H);
          if (k < n - 1) strut(batch, 'steel', bot, nextTop, 0.22, 0.22, steel);
          const prevTop = P(s + ((k - 1) * spanLen) / n, d, H);
          if (k > 1) strut(batch, 'steel', bot, prevTop, 0.22, 0.22, steel);
        }
      }
      if (truss) {
        // top lateral bracing / portals
        for (let k = 1; k < 6; k++) {
          const sb = s + (k * spanLen) / 6;
          strut(batch, 'steel', P(sb, lat - 2.9, 7.2), P(sb, lat + 2.9, 7.2), 0.25, 0.35, steel);
          if (k < 5) strut(batch, 'steel', P(sb, lat - 2.9, 7.2), P(sb + spanLen / 6, lat + 2.9, 7.2), 0.12, 0.12, steel);
        }
        // cross girders & stringers
        for (let k = 0; k <= 12; k++) {
          const sb = s + (k * spanLen) / 12;
          strut(batch, 'steel', P(sb, lat - 2.9, -0.75), P(sb, lat + 2.9, -0.75), 0.25, 0.5, steel);
        }
      } else {
        for (let k = 0; k <= 8; k++) {
          const sb = s + (k * spanLen) / 8;
          strut(batch, 'steel', P(sb, lat - 1.1, -0.9), P(sb, lat + 1.1, -0.9), 0.15, 0.3, steel);
        }
      }
      // walkway + handrail on the outer side
      const outer = lat + (lat < 0 ? -1 : 1) * (truss ? 3.6 : 2.3);
      strut(batch, 'steel', P(s, outer, -0.45), P(sN, outer, -0.45), 0.9, 0.06, new THREE.Color('#6d6d6d'));
      strut(batch, 'steel', P(s, outer + (lat < 0 ? -0.4 : 0.4), 0.6), P(sN, outer + (lat < 0 ? -0.4 : 0.4), 0.6), 0.05, 0.05, new THREE.Color('#c8c8c8'));
    }
  }
  batch.build((k) => materials.get(k), group);
  group.updateMatrixWorld(true);
  return group;
}

// ------------------------------------------------------------------------------------------
export function buildTunnel(ctx, tn, isEnd = false) {
  const { geo } = ctx;
  const s0 = tn.s0, s1 = isEnd ? Math.min(geo.length + 30, tn.s0 + 220) : tn.s1;
  const g0 = geo.sample(s0);
  const origin = new THREE.Vector3(g0.x, g0.y, g0.z);
  const group = new THREE.Group();
  group.position.copy(origin);
  group.name = 'tunnel';
  const batch = new GeoBatch();
  const frame = new TrackFrame(geo);
  // horseshoe profile for a double-line tunnel (inner surface, normals facing in)
  const half = 6.2, wallH = 4.2, crown = 8.6;
  const prof = [];
  prof.push([half, -0.8]);
  prof.push([half, wallH]);
  for (let i = 1; i < 12; i++) {
    const a = (i / 12) * Math.PI;
    prof.push([Math.cos(a) * half, wallH + Math.sin(a) * (crown - wallH)]);
  }
  prof.push([-half, wallH]);
  prof.push([-half, -0.8]);
  const sl = [];
  for (let s = s0; s <= s1; s += 6) sl.push(Math.min(s, geo.length));
  extrudeProfile(batch, 'tunnel', frame, () => 0, sl, prof, origin, { uScale: 0.2, vScale: 0.2, color: new THREE.Color('#9a958c') });
  // portal facades (stone) with wing walls
  const portals = isEnd ? [[s0, -1]] : [[s0, -1], [s1, 1]];
  const lamps = [];
  for (const [sp, dir] of portals) {
    const g = geo.sample(sp);
    const yaw = Math.atan2(g.tx, g.tz);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const c = new THREE.Vector3(g.x - origin.x, g.y - origin.y, g.z - origin.z);
    const facePos = c.clone().addScaledVector(fwd, dir * -0.6);
    // portal wall around the opening: left, right and top blocks
    for (const side of [-1, 1]) {
      const p = facePos.clone().addScaledVector(right, side * (half + 7.5));
      box(batch, 'stone', p.x, p.y - 4, p.z, 15, 22, 2.4, yaw, '#8f8576');
    }
    const top = facePos.clone();
    box(batch, 'stone', top.x, top.y + crown - 0.6, top.z, 2 * half + 1, 13, 2.4, yaw, '#8f8576');
    // arch ring blocks
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      const p = facePos.clone().addScaledVector(right, Math.cos(a) * (half + 0.4)).addScaledVector(fwd, dir * -0.2);
      p.y += wallH + Math.sin(a) * (crown - wallH + 0.4);
      box(batch, 'stone', p.x, p.y - 0.35, p.z, 0.9, 0.7, 2.8, yaw + a, '#a09482', false);
    }
    // wing walls angled outwards
    for (const side of [-1, 1]) {
      const p = facePos.clone().addScaledVector(right, side * (half + 15)).addScaledVector(fwd, dir * -6);
      box(batch, 'stone', p.x, p.y - 4, p.z, 1.6, 14, 14, yaw + side * dir * 0.5, '#8f8576');
    }
    // nameplate stripe
    const np = facePos.clone().addScaledVector(fwd, dir * -1.25);
    box(batch, 'paint', np.x, np.y + crown + 1.6, np.z, 8, 1.1, 0.1, yaw, '#e8e0cf');
  }
  // tunnel lamps every 50 m
  for (let s = s0 + 25; s < s1 - 10; s += 50) {
    for (const side of [-1, 1]) {
      frame.at(() => 0, s, origin);
      const p = frame.point(side * (half - 0.2), 4.5, new THREE.Vector3());
      box(batch, 'lamp', p.x, p.y, p.z, 0.25, 0.3, 0.6, 0, null, false);
      lamps.push(p.clone().add(origin));
    }
  }
  batch.build((k) => materials.get(k), group);
  group.updateMatrixWorld(true);
  group.userData.lamps = lamps;
  return group;
}

// ------------------------------------------------------------------------------------------
const _v = new THREE.Vector3();
/** Road strip helper conforming to terrain, optionally ramping to rail level near a crossing. */
function roadStrip(batch, sampler, origin, pts, width, railY, rampAt, key = 'asphalt') {
  const pos = [], nor = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)];
    const dx = q.x - r.x, dz = q.z - r.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    if (i > 0) acc += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    let y = sampler.height(p.x, p.z) + 0.08;
    if (rampAt) {
      const d = Math.hypot(p.x - rampAt.x, p.z - rampAt.z);
      const ramp = railY + 0.02 - Math.max(0, d - 6) * 0.07;
      y = Math.max(y, ramp);
    }
    for (const side of [-1, 1]) {
      pos.push(p.x + nx * side * width / 2 - origin.x, y - origin.y, p.z + nz * side * width / 2 - origin.z);
      nor.push(0, 1, 0);
      uv.push((side + 1) * 0.5 * width / 6, acc / 6);
    }
    if (i > 0) {
      const b = (i - 1) * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  batch.addRaw(key, pos, nor, uv, null, idx);
}

/**
 * Level crossing: road with ramps, check-rail deck, gate lodge, lifting barriers (animated).
 * Returns { group, update(dt, closed) , barriers, roadPoints }.
 */
export function buildLevelCrossing(ctx, lc) {
  const { geo, sampler } = ctx;
  const g = geo.sample(lc.s);
  const origin = new THREE.Vector3(g.x, g.y, g.z);
  const group = new THREE.Group();
  group.position.copy(origin);
  group.name = 'lc:' + lc.id;
  const batch = new GeoBatch();
  const heading = g.h + lc.angle * DEG;
  const dir = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
  const pts = [];
  const L = lc.kind === 'urban' ? 600 : 900;
  for (let t = -L; t <= L; t += 8) pts.push(new THREE.Vector3(g.x + dir.x * t, 0, g.z + dir.z * t));
  roadStrip(batch, sampler, origin, pts, lc.roadWidth, g.y, new THREE.Vector3(g.x, 0, g.z));
  // concrete deck between the rails
  const yaw = Math.atan2(g.tx, g.tz);
  for (const lat of [-2.5, 2.5]) {
    const p = new THREE.Vector3(g.nx * lat, -0.06, g.nz * lat);
    box(batch, 'concrete', p.x, p.y - 0.3, p.z, 1.5, 0.32, lc.roadWidth / Math.abs(Math.sin(lc.angle * DEG)) + 1, yaw, '#8d8a84');
    for (const side of [-1, 1]) {
      const q = p.clone().add(new THREE.Vector3(g.nx * side * 1.45, 0, g.nz * side * 1.45));
      box(batch, 'concrete', q.x, q.y - 0.3, q.z, 1.1, 0.32, lc.roadWidth / Math.abs(Math.sin(lc.angle * DEG)) + 1, yaw, '#8d8a84');
    }
  }
  // gate lodge + gate posts
  const lodge = new THREE.Vector3(g.nx * 13 + dir.x * (lc.roadWidth + 4), 0, g.nz * 13 + dir.z * (lc.roadWidth + 4));
  const ly = sampler.height(lodge.x + origin.x, lodge.z + origin.z) - origin.y;
  box(batch, 'plaster', lodge.x, ly - 0.3, lodge.z, 3.5, 3.0, 3.5, yaw, '#f0e2c0');
  box(batch, 'paint', lodge.x, ly + 2.7, lodge.z, 4.2, 0.25, 4.2, yaw, '#b03a2e');
  const barriers = [];
  const barrierGeo = new THREE.BoxGeometry(0.16, 0.16, 1);
  barrierGeo.translate(0, 0, 0.5);
  const stripes = stripeMaterial();
  for (const side of [-1, 1]) {
    // posts on each side of the track along the road
    const pp = new THREE.Vector3(dir.x * side * 9.5, 0, dir.z * side * 9.5);
    const across = new THREE.Vector3(-dir.z, 0, dir.x);
    const base = pp.clone().addScaledVector(across, -side * (lc.roadWidth / 2 + 0.6));
    const by = Math.max(sampler.height(base.x + origin.x, base.z + origin.z) - origin.y, -0.8);
    box(batch, 'paint', base.x, by, base.z, 0.35, 1.3, 0.35, 0, '#d8d8d8');
    const pivot = new THREE.Group();
    pivot.position.set(base.x, by + 1.1, base.z);
    const arm = new THREE.Mesh(barrierGeo, stripes);
    arm.scale.set(1, 1, lc.roadWidth + 0.6);
    arm.castShadow = true;
    pivot.add(arm);
    pivot.rotation.y = Math.atan2(across.x * side, across.z * side);
    group.add(pivot);
    barriers.push({ pivot, arm });
    // bell + warning lamp box
    box(batch, 'paint', base.x, by + 1.3, base.z, 0.25, 0.35, 0.18, 0, '#1a1a1a');
  }
  // electric poles along the road
  for (let t = 30; t < L; t += 45) {
    for (const sd of [-1, 1]) {
      const p = new THREE.Vector3(dir.x * t * sd, 0, dir.z * t * sd).addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), lc.roadWidth / 2 + 2.5);
      const py = sampler.height(p.x + origin.x, p.z + origin.z) - origin.y;
      addElectricPole(batch, p.x, py, p.z, heading);
    }
  }
  batch.build((k) => materials.get(k), group);
  group.updateMatrixWorld(true);
  let angle = Math.PI / 2 - 0.05; // raised
  const update = (dt, closed) => {
    const target = closed ? 0 : Math.PI / 2 - 0.05;
    const speed = 0.5;
    angle += Math.sign(target - angle) * Math.min(Math.abs(target - angle), speed * dt);
    for (const b of barriers) b.arm.rotation.x = -angle;
  };
  update(0, false);
  const roadPts = pts.map((p) => {
    const y = Math.max(sampler.height(p.x, p.z) + 0.08, g.y + 0.02 - Math.max(0, Math.hypot(p.x - g.x, p.z - g.z) - 6) * 0.07);
    return new THREE.Vector3(p.x, y, p.z);
  });
  return { group, update, roadPoints: roadPts, dir, origin, lc, heading };
}

function stripeMaterial() {
  if (stripeMaterial.m) return stripeMaterial.m;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#d22' : '#f4f4f4';
    x.fillRect(0, i * 16, 16, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  stripeMaterial.m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  return stripeMaterial.m;
}

/** Road over-bridge spanning the line with embankment ramps. */
export function buildRoadBridge(ctx, rb) {
  const { geo, sampler } = ctx;
  const g = geo.sample(rb.s);
  const origin = new THREE.Vector3(g.x, g.y, g.z);
  const group = new THREE.Group();
  group.position.copy(origin);
  const batch = new GeoBatch();
  const heading = g.h + rb.angle * DEG;
  const dir = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
  const across = new THREE.Vector3(-dir.z, 0, dir.x);
  const deckY = 8.2;
  const span = 26;
  const pts = [];
  for (let t = -220; t <= 220; t += 6) pts.push(t);
  const pos = [], nor = [], uv = [], idx = [];
  const deckPts = [];
  pts.forEach((t, i) => {
    const wx = g.x + dir.x * t, wz = g.z + dir.z * t;
    const ground = sampler.height(wx, wz) - origin.y + 0.1;
    const y = Math.max(ground, deckY - Math.max(0, Math.abs(t) - span) * 0.045);
    deckPts.push(new THREE.Vector3(wx, y + origin.y, wz));
    for (const side of [-1, 1]) {
      pos.push(dir.x * t + across.x * side * rb.width / 2, y, dir.z * t + across.z * side * rb.width / 2);
      nor.push(0, 1, 0);
      uv.push((side + 1) * rb.width / 12, t / 6);
    }
    if (i > 0) {
      const b = (i - 1) * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    // embankment walls under the ramp
    if (Math.abs(t) > span && y > ground + 0.3) {
      for (const side of [-1, 1]) {
        const p = new THREE.Vector3(dir.x * t + across.x * side * (rb.width / 2 + 0.2), ground - 0.5, dir.z * t + across.z * side * (rb.width / 2 + 0.2));
        box(batch, 'stone', p.x, p.y, p.z, 0.5, y - ground + 0.5, 6.2, -heading + Math.PI / 2, '#b9ae98');
      }
    }
  });
  batch.addRaw('asphalt', pos, nor, uv, null, idx);
  // deck girder and parapets over the railway
  const a = new THREE.Vector3(-dir.x * span, deckY - 0.6, -dir.z * span), b = new THREE.Vector3(dir.x * span, deckY - 0.6, dir.z * span);
  strut(batch, 'concrete', a, b, rb.width, 1.1, new THREE.Color('#b3ada2'));
  for (const side of [-1, 1]) {
    const off = across.clone().multiplyScalar(side * (rb.width / 2 - 0.15));
    strut(batch, 'concrete', a.clone().add(off).setY(deckY + 0.5), b.clone().add(off).setY(deckY + 0.5), 0.3, 1.1, new THREE.Color('#c9c3b7'));
  }
  // piers between and beside the tracks
  for (const lat of [-9, 0, 9]) {
    const p = new THREE.Vector3(g.nx * lat, -0.8, g.nz * lat);
    box(batch, 'concrete', p.x, p.y, p.z, rb.width * 0.7, deckY - 0.3, 1.0, -heading + Math.PI / 2, '#aaa49a');
  }
  batch.build((k) => materials.get(k), group);
  group.updateMatrixWorld(true);
  return { group, deckPoints: deckPts, dir, heading };
}

// ------------------------------------------------------------------------------------------
/** Water surfaces: river, streams and ponds. */
export function buildWater(ctx) {
  const { sampler } = ctx;
  const group = new THREE.Group();
  group.name = 'water';
  const base = Tex.waterNormal();
  const textures = [];
  const makeMat = (rx, ry) => {
    const n = base.clone();
    n.wrapS = n.wrapT = THREE.RepeatWrapping;
    n.repeat.set(rx, ry);
    n.needsUpdate = true;
    textures.push(n);
    const m = new THREE.MeshStandardMaterial({ color: 0x34504f, roughness: 0.06, metalness: 0.2, normalMap: n, normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 1.3 });
    m.name = 'water';
    return m;
  };
  const waters = [];
  for (const w of sampler.waters) {
    const len = w.isRiver ? 9000 : 1400;
    const geo = new THREE.PlaneGeometry(w.width * 0.98, len, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, makeMat(w.width / 14, len / 14));
    m.position.set(w.x, w.level, w.z);
    m.rotation.y = -Math.atan2(w.dz, w.dx) + Math.PI / 2;
    m.receiveShadow = true;
    group.add(m);
    waters.push(m);
  }
  for (const p of sampler.ponds) {
    const geo = new THREE.CircleGeometry(p.r * 1.05, 32);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, makeMat(p.r / 10, p.r / 10));
    m.position.set(p.x, sampler.base - 1.4, p.z);
    group.add(m);
  }
  group.userData.update = (t) => {
    for (const n of textures) n.offset.set(t * 0.01, t * 0.018);
  };
  return group;
}
