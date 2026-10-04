import * as THREE from 'three';
import { GeoBatch, Prim } from './GeoBatch.js';
import { COACH_SIDE_H, LOCO_SIDE_H } from './TrainTextures.js';

// Vehicle models are built with +z pointing to the vehicle's leading end, origin at rail level
// midway along the body.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

function part(batch, key, geo, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  batch.add(key, geo, _m, color ? _c.set(color) : null);
}
const B = () => Prim.box();
const CYLX = (() => {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1);
  g.rotateZ(Math.PI / 2);
  return g;
})();
const CYLZ = (() => {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1);
  g.rotateX(Math.PI / 2);
  return g;
})();

/**
 * Body shell: sides + rounded roof + end caps. Side UVs follow the livery texture layout
 * (u along length, v up the side, top strip = roof). frontSlope recesses the upper end faces.
 */
export function bodyShell({ length, width, yb, ys, yTop, sideH, roofSeg = 8, frontSlope = 0, slopeFrom = 2.6 }) {
  const hw = width / 2;
  const prof = [[-hw, yb], [-hw, ys]];
  for (let i = 1; i < roofSeg; i++) {
    const a = Math.PI - (i / roofSeg) * Math.PI;
    prof.push([Math.cos(a) * hw, ys + Math.sin(a) * (yTop - ys)]);
  }
  prof.push([hw, ys], [hw, yb]);
  const pos = [], nor = [], uv = [], idx = [];
  const z0 = -length / 2, z1 = length / 2;
  const recess = (y) => (frontSlope > 0 && y > slopeFrom ? ((y - slopeFrom) / (yTop - slopeFrom)) * frontSlope : 0);
  const vOf = (y, x, i) => {
    if (y <= ys + 1e-3 && (i <= 1 || i >= prof.length - 2)) return ((y - yb) / sideH) * 0.88;
    return 0.9 + 0.08 * (x / width + 0.5);
  };
  for (let i = 0; i < prof.length - 1; i++) {
    const [ax, ay] = prof[i], [bx, by] = prof[i + 1];
    const nx = by - ay, ny = -(bx - ax);
    const l = Math.hypot(nx, ny);
    // outward normal for a counter-clockwise walk around the top: flip
    const onx = -nx / l, ony = -ny / l;
    const base = pos.length / 3;
    const flipU = ax > 0 && bx > 0; // right side reads front->back
    const u = (z) => {
      const t = (z - z0) / length;
      return flipU ? 1 - t : t;
    };
    const az0 = z0 + recess(ay), az1 = z1 - recess(ay), bz0 = z0 + recess(by), bz1 = z1 - recess(by);
    pos.push(ax, ay, az0, bx, by, bz0, bx, by, bz1, ax, ay, az1);
    for (let k = 0; k < 4; k++) nor.push(onx, ony, 0);
    uv.push(u(az0), vOf(ay, ax, i), u(bz0), vOf(by, bx, i + 1), u(bz1), vOf(by, bx, i + 1), u(az1), vOf(ay, ax, i));
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  // end caps (fan from centre) — separate group 1 so the loco can use a front texture
  const capStart = idx.length;
  for (const end of [-1, 1]) {
    const base = pos.length / 3;
    const cy = (yb + ys) / 2;
    const zc = end < 0 ? z0 + recess(cy) : z1 - recess(cy);
    pos.push(0, cy, zc);
    nor.push(0, 0, end);
    uv.push(0.5, (cy - yb) / (yTop - yb));
    for (const [x, y] of prof) {
      const z = end < 0 ? z0 + recess(y) : z1 - recess(y);
      pos.push(x, y, z);
      nor.push(0, frontSlope > 0 && y > slopeFrom ? 0.25 : 0, end);
      uv.push(end > 0 ? x / width + 0.5 : 0.5 - x / width, (y - yb) / (yTop - yb));
    }
    for (let i = 0; i < prof.length - 1; i++) {
      // counter-clockwise as seen from outside the vehicle
      if (end > 0) idx.push(base, base + 2 + i, base + 1 + i);
      else idx.push(base, base + 1 + i, base + 2 + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, capStart, 0);
  g.addGroup(capStart, idx.length - capStart, 1);
  g.computeBoundingSphere();
  return g;
}

function wheelset(batch, z, r, gauge = 0.78, discs = false) {
  for (const x of [-gauge, gauge]) {
    part(batch, 'frame', CYLX, x, r, z, 0.13, r * 2, r * 2, '#2f3134');
    part(batch, 'frame', CYLX, x * 1.04, r, z, 0.02, r * 1.2, r * 1.2, '#8a8d90');
  }
  part(batch, 'frame', CYLX, 0, r, z, gauge * 2, 0.16, 0.16, '#3a3c3f');
  if (discs) for (const x of [-0.35, 0.35]) part(batch, 'frame', CYLX, x, r, z, 0.09, 0.62, 0.62, '#6d7175');
}

function coachBogie(batch, zc) {
  wheelset(batch, zc - 1.28, 0.457, 0.78, true);
  wheelset(batch, zc + 1.28, 0.457, 0.78, true);
  for (const x of [-1.0, 1.0]) {
    part(batch, 'frame', B(), x, 0.62, zc, 0.22, 0.32, 3.4, '#2b2d30');
    part(batch, 'frame', B(), x * 1.12, 0.62, zc - 1.28, 0.3, 0.26, 0.42, '#3b3e42');
    part(batch, 'frame', B(), x * 1.12, 0.62, zc + 1.28, 0.3, 0.26, 0.42, '#3b3e42');
    part(batch, 'frame', CYLZ, x * 1.05, 0.95, zc, 0.24, 0.24, 0.5, '#7a2a1a');
    part(batch, 'frame', B(), x * 1.32, 1.0, zc + 0.6, 0.08, 0.08, 1.4, '#c49a12', 0.2, 0, 0);
  }
  part(batch, 'frame', B(), 0, 0.72, zc, 2.2, 0.22, 0.5, '#2b2d30');
}

const coachCache = new Map();
/** Coach / wagon model geometry for instancing. Returns { body, frame, lowBody, lowFrame, height }. */
export function coachModel(typeDef, length = 23.54) {
  const key = typeDef.id;
  if (coachCache.has(key)) return coachCache.get(key);
  let out;
  if (typeDef.wagon) out = wagonModel(typeDef);
  else {
    const width = 3.24, yb = 1.12, ys = yb + COACH_SIDE_H, yTop = 4.04;
    const body = bodyShell({ length: length - 0.3, width, yb, ys, yTop, sideH: COACH_SIDE_H });
    const fb = new GeoBatch();
    const L = length - 0.3;
    // underframe & skirt
    part(fb, 'frame', B(), 0, 0.98, 0, 2.95, 0.3, L - 1.2, '#2a2c2f');
    for (const z of [-4.5, -1.2, 2.4, 5.5]) part(fb, 'frame', B(), 0.25 * (z > 0 ? 1 : -1), 0.72, z, 1.6, 0.42, 1.8, '#34373b');
    part(fb, 'frame', CYLZ, -0.9, 0.78, 1.0, 0.45, 0.45, 2.6, '#4b4e52');
    coachBogie(fb, -7.45);
    coachBogie(fb, 7.45);
    // gangways and couplers
    for (const end of [-1, 1]) {
      part(fb, 'frame', B(), 0, 2.3, end * (L / 2 + 0.12), 1.25, 2.2, 0.28, '#1b1c1e');
      part(fb, 'frame', B(), 0, 1.02, end * (L / 2 + 0.25), 0.32, 0.26, 0.5, '#2d2f32');
      // footsteps under doors
      for (const x of [-1, 1]) part(fb, 'frame', B(), x * 1.5, 0.82, end * (L / 2 - 1.45), 0.25, 0.06, 0.8, '#55595e');
    }
    // roof equipment
    if (typeDef.ac) {
      for (const z of [-8.6, 8.6]) part(fb, 'frame', B(), 0, 4.0, z, 2.3, 0.5, 3.1, '#b9bdc1');
    } else {
      for (let i = 0; i < 6; i++) part(fb, 'frame', Prim.sphere(8, 4), 0, 4.0, -9 + i * 3.6, 0.6, 0.3, 0.6, '#8c9196');
    }
    if (typeDef.id === 'PC') part(fb, 'frame', B(), 0.6, 4.05, 3, 0.4, 0.5, 0.4, '#777');
    const frame = fb.buildGeometry('frame');
    const lb = new GeoBatch();
    part(lb, 'frame', B(), 0, 0.75, -7.45, 2.6, 0.8, 3.4, '#262729');
    part(lb, 'frame', B(), 0, 0.75, 7.45, 2.6, 0.8, 3.4, '#262729');
    part(lb, 'frame', B(), 0, 1.0, 0, 2.9, 0.3, L - 1.2, '#2a2c2f');
    out = { body, frame, lowBody: bodyShell({ length: L, width, yb, ys, yTop, sideH: COACH_SIDE_H, roofSeg: 3 }), lowFrame: lb.buildGeometry('frame'), length };
  }
  coachCache.set(key, out);
  return out;
}

function wagonModel(t) {
  const L = t.length - 0.3;
  const W = 3.15;
  const fb = new GeoBatch();
  let body;
  if (t.brakeVan) {
    body = bodyShell({ length: 4.6, width: 2.9, yb: 1.25, ys: 3.4, yTop: 3.7, sideH: 2.15, roofSeg: 4 });
    part(fb, 'frame', B(), 0, 1.15, 0, W, 0.25, L, '#3a2a20');
    for (const end of [-1, 1]) part(fb, 'frame', B(), 0, 1.6, end * (L / 2 - 1.2), W, 0.9, 0.08, '#4a3428');
  } else {
    // open box: four walls built as thin boxes into the body geometry via a batch
    const bb = new GeoBatch();
    const H0 = 1.25, H1 = 3.25;
    const wall = (x, z, sx, sz) => part(bb, 'body', B(), x, (H0 + H1) / 2, z, sx, H1 - H0, sz);
    wall(-W / 2, 0, 0.08, L);
    wall(W / 2, 0, 0.08, L);
    wall(0, -L / 2, W, 0.08);
    wall(0, L / 2, W, 0.08);
    body = bb.buildGeometry('body');
    // coal heap
    const heap = new THREE.PlaneGeometry(W - 0.15, L - 0.15, 6, 10);
    heap.rotateX(-Math.PI / 2);
    const p = heap.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const hump = Math.cos((x / W) * Math.PI) * 0.35 + Math.sin(z * 1.7 + x * 3.1) * 0.06;
      p.setY(i, 3.0 + hump);
    }
    heap.computeVertexNormals();
    fb.add('frame', heap, null, new THREE.Color('#121212'));
    part(fb, 'frame', B(), 0, 1.15, 0, W, 0.2, L, '#2a1d16');
    for (let i = 0; i <= 8; i++) {
      const z = -L / 2 + (i / 8) * L;
      for (const x of [-1, 1]) part(fb, 'frame', B(), x * (W / 2 + 0.05), 2.25, z, 0.1, 2.0, 0.14, '#3c2418');
    }
  }
  for (const zc of [-t.bogieCentres / 2, t.bogieCentres / 2]) {
    wheelset(fb, zc - 1.0, 0.5);
    wheelset(fb, zc + 1.0, 0.5);
    for (const x of [-1, 1]) part(fb, 'frame', B(), x * 1.0, 0.6, zc, 0.25, 0.42, 2.8, '#2a2b2d');
  }
  for (const end of [-1, 1]) part(fb, 'frame', B(), 0, 1.02, end * (L / 2 + 0.25), 0.32, 0.26, 0.5, '#2d2f32');
  const frame = fb.buildGeometry('frame');
  const lb = new GeoBatch();
  for (const zc of [-t.bogieCentres / 2, t.bogieCentres / 2]) part(lb, 'frame', B(), 0, 0.7, zc, 2.4, 0.8, 2.6, '#262729');
  const lowFrame = lb.buildGeometry('frame');
  return { body, frame, lowBody: body, lowFrame, length: t.length, wagon: true };
}

// ------------------------------------------------------------------------------------------
/**
 * Locomotive: body + front/rear faces, glass, roof gear, bogies; pantographs are separate
 * animated objects. Returns a Group plus handles for lights and pantographs.
 */
export function buildLocoModel(textures, materials, opts = {}) {
  const L = 20.56, width = 3.15, yb = 1.15, ys = yb + LOCO_SIDE_H, yTop = 4.28;
  const group = new THREE.Group();
  group.name = 'loco';
  const body = bodyShell({ length: L, width, yb, ys, yTop, sideH: LOCO_SIDE_H, roofSeg: 6, frontSlope: 0.32, slopeFrom: 2.75 });
  const bodyMesh = new THREE.Mesh(body, [materials.locoBody(textures), materials.locoFront(textures)]);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.name = 'locoBody';
  group.add(bodyMesh);
  const fb = new GeoBatch();
  // windscreens (two panes per end), recessed slope 2.75 -> 3.9
  const glassGeo = new THREE.PlaneGeometry(1.25, 0.95);
  const glassMeshes = [];
  for (const end of [-1, 1]) {
    for (const x of [-0.72, 0.72]) {
      const g = new THREE.Mesh(glassGeo, materials.glass);
      const yC = 3.35;
      const rec = ((yC - 2.75) / (yTop - 2.75)) * 0.32;
      g.position.set(x, yC, end * (L / 2 - rec + 0.012));
      g.rotation.set(-end * Math.atan2(0.32, yTop - 2.75) * 0.95, end < 0 ? Math.PI : 0, 0);
      group.add(g);
      glassMeshes.push(g);
    }
    // headlight housing on the roof dome + marker lamps
    part(fb, 'frame', CYLZ, 0, 4.05, end * (L / 2 - 0.42), 0.6, 0.6, 0.35, '#2a2a2a');
    part(fb, 'frame', B(), 0, 1.55, end * (L / 2 + 0.06), 2.6, 0.12, 0.1, '#222');
    // buffers and coupler
    for (const x of [-0.98, 0.98]) {
      part(fb, 'frame', CYLZ, x, 1.06, end * (L / 2 + 0.25), 0.36, 0.36, 0.5, '#2e3033');
      part(fb, 'frame', CYLZ, x, 1.06, end * (L / 2 + 0.52), 0.55, 0.55, 0.06, '#3a3c3f');
    }
    part(fb, 'frame', B(), 0, 1.0, end * (L / 2 + 0.3), 0.34, 0.28, 0.6, '#2d2f32');
    // cattle guard
    part(fb, 'frame', B(), 0, 0.42, end * (L / 2 + 0.05), 2.7, 0.55, 0.12, '#1d1f22', end * 0.25, 0, 0);
    // footsteps & handrails by cab doors
    for (const x of [-1, 1]) {
      const zd = end * (L / 2 - 2.3);
      part(fb, 'frame', B(), x * 1.62, 0.8, zd, 0.3, 0.06, 0.7, '#5a5d61');
      part(fb, 'frame', B(), x * 1.62, 0.45, zd, 0.3, 0.06, 0.7, '#5a5d61');
      // wipers (parked)
      part(fb, 'frame', B(), x * 0.72, 2.88, end * (L / 2 - 0.015), 0.9, 0.03, 0.02, '#111', 0, 0, x * 0.1);
    }
  }
  // roof: walkway, insulators, VCB, roof bus bar
  part(fb, 'frame', B(), 0, 4.27, 0, 0.7, 0.04, L - 5, '#4b4d50');
  for (const z of [-6.2, 6.2]) {
    for (const x of [-0.45, 0.45]) for (const zz of [-0.5, 0.5]) part(fb, 'frame', Prim.cyl(8), x, 4.22, z + zz, 0.16, 0.22, 0.16, '#7a3b2a');
  }
  part(fb, 'frame', CYLZ, 0, 4.48, 0, 0.08, 0.08, 12.4, '#b0b3b6');
  part(fb, 'frame', B(), 0.5, 4.3, 0, 0.6, 0.45, 1.0, '#9a9da1');
  for (const z of [-1.5, 1.5]) part(fb, 'frame', Prim.cyl(8), 0.5, 4.25, z, 0.14, 0.3, 0.14, '#7a3b2a');
  // underframe: transformer tank, reservoirs, battery boxes
  part(fb, 'frame', B(), 0, 1.0, 0, 3.0, 0.3, L - 1.0, '#26282b');
  part(fb, 'frame', B(), 0, 0.68, 0, 2.6, 0.62, 4.2, '#2f3236');
  for (const x of [-1, 1]) part(fb, 'frame', CYLZ, x * 0.95, 0.72, -1.4 * x, 0.5, 0.5, 2.4, '#3a3d40');
  // side handrails along the body
  for (const x of [-1, 1]) part(fb, 'frame', B(), x * 1.6, 1.32, 0, 0.04, 0.04, L - 6, '#c8c8c8');
  // bogies (Co-Co): 3 axles, 1092 mm wheels
  const wheelGroups = [];
  for (const zc of [-5.45, 5.45]) {
    for (const dz of [-1.95, 0, 1.95]) wheelset(fb, zc + dz, 0.546, 0.78, false);
    for (const x of [-1, 1]) {
      part(fb, 'frame', B(), x * 1.12, 0.72, zc, 0.24, 0.52, 5.0, '#262729');
      for (const dz of [-1.95, 0, 1.95]) {
        part(fb, 'frame', Prim.cyl(10), x * 1.12, 0.95, zc + dz - 0.45, 0.28, 0.32, 0.28, '#7a6a2a');
        part(fb, 'frame', B(), x * 1.15, 0.55, zc + dz, 0.34, 0.34, 0.44, '#3a3d40');
      }
      part(fb, 'frame', B(), x * 1.25, 1.02, zc - 2.5 * Math.sign(zc), 0.4, 0.5, 0.5, '#33363a');
    }
    for (const dz of [-1.0, 1.0]) part(fb, 'frame', B(), 0, 0.62, zc + dz, 1.3, 0.55, 0.8, '#2b2d30');
  }
  const frame = new THREE.Mesh(fb.buildGeometry('frame'), materials.frame);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);
  // headlight lenses (emissive, toggled)
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff4e0, emissiveIntensity: 0, roughness: 0.2 });
  const markerMat = new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0xfff1d8, emissiveIntensity: 0, roughness: 0.3 });
  const lenses = [], markers = [];
  for (const end of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), lensMat.clone());
    lens.position.set(0, 4.05, end * (L / 2 - 0.24));
    lens.rotation.y = end < 0 ? Math.PI : 0;
    group.add(lens);
    lenses.push(lens);
    for (const x of [-1.15, 1.15]) {
      const mk = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), markerMat.clone());
      mk.position.set(x, 1.62, end * (L / 2 + 0.005));
      mk.rotation.y = end < 0 ? Math.PI : 0;
      group.add(mk);
      markers.push(mk);
    }
  }
  // pantographs
  const pantos = [new Pantograph(materials), new Pantograph(materials)];
  pantos[0].group.position.set(0, 4.3, -6.2);
  pantos[1].group.position.set(0, 4.3, 6.2);
  pantos[1].group.rotation.y = Math.PI;
  for (const p of pantos) group.add(p.group);
  return { group, bodyMesh, lenses, markers, pantos, glass: glassMeshes, length: L };
}

/** Single-arm pantograph with knee joint, animated by extension 0..1. */
export class Pantograph {
  constructor(materials) {
    this.group = new THREE.Group();
    const mat = materials.panto;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 1.5), materials.frame);
    base.position.y = 0.04;
    this.group.add(base);
    const arm = (len, w) => {
      const g = new THREE.BoxGeometry(w, 0.06, len);
      g.translate(0, 0, len / 2);
      return new THREE.Mesh(g, mat);
    };
    this.L = 1.3;
    this.lower = new THREE.Group();
    this.lower.position.set(0, 0.12, -0.55);
    const la = arm(this.L, 0.12);
    this.lower.add(la);
    this.group.add(this.lower);
    this.upper = new THREE.Group();
    this.lower.add(this.upper);
    this.upper.position.set(0, 0, this.L);
    const ua = arm(this.L, 0.06);
    this.upper.add(ua);
    this.head = new THREE.Group();
    this.upper.add(this.head);
    this.head.position.set(0, 0, this.L);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.08), mat);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.32), materials.frame);
    strip.position.y = 0.04;
    this.head.add(bow, strip);
    for (const x of [-0.95, 0.95]) {
      const horn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.25), mat);
      horn.position.set(x, -0.08, 0);
      horn.rotation.z = x > 0 ? -0.6 : 0.6;
      this.head.add(horn);
    }
    this.group.traverse((o) => (o.castShadow = true));
    this.set(1, 1.15);
  }
  /** ext 0 = folded, 1 = raised to `reach` metres of head height above the base. */
  set(ext, reach = 1.15) {
    const H = 0.14 + (reach - 0.14) * ext;
    const a = Math.asin(Math.min(0.98, H / (2 * this.L)));
    this.lower.rotation.x = -a;
    // knee: upper arm folds back over the lower arm so the head stays above the pivot
    this.upper.rotation.x = Math.PI + 2 * a;
    this.head.rotation.x = -(Math.PI + a);
    this.ext = ext;
  }
}
