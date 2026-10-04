import * as THREE from 'three';
import { GeoBatch, Prim } from './GeoBatch.js';
import { Rng } from '../core/Rng.js';
import { settings } from '../core/Settings.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function part(b, geo, x, y, z, sx, sy, sz, color, ry = 0) {
  _q.setFromAxisAngle(UP, ry);
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  b.add('v', geo, _m, color ? _c.set(color) : null);
}
const W = () => {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  g.rotateZ(Math.PI / 2);
  return g;
};

// Vehicle geometries (+z forward). White parts get the per-instance body colour.
function vehicleGeo(type) {
  const b = new GeoBatch();
  const box = Prim.boxBase();
  const wheel = W();
  switch (type) {
    case 'car':
      part(b, box, 0, 0.35, 0, 1.7, 0.7, 4.1, '#ffffff');
      part(b, box, 0, 1.05, -0.2, 1.55, 0.55, 2.2, '#ffffff');
      part(b, box, 0, 1.08, -0.2, 1.58, 0.45, 2.0, '#20262c');
      for (const x of [-0.8, 0.8]) for (const z of [-1.3, 1.3]) part(b, wheel, x, 0.32, z, 0.22, 0.64, 0.64, '#111');
      break;
    case 'auto':
      part(b, box, 0, 0.3, 0, 1.3, 0.75, 2.6, '#2e7d32');
      part(b, box, 0, 1.05, -0.1, 1.32, 0.8, 2.1, '#fdd835');
      part(b, box, 0, 1.0, 0.3, 1.2, 0.6, 1.0, '#20262c');
      part(b, wheel, 0, 0.25, 1.05, 0.15, 0.5, 0.5, '#111');
      for (const x of [-0.6, 0.6]) part(b, wheel, x, 0.25, -0.8, 0.15, 0.5, 0.5, '#111');
      break;
    case 'truck':
      part(b, box, 0, 0.6, 2.6, 2.3, 1.9, 1.9, '#ffffff');
      part(b, box, 0, 1.6, 2.7, 2.2, 0.6, 1.5, '#20262c');
      part(b, box, 0, 0.75, -1.2, 2.4, 2.2, 5.4, '#f9a825');
      part(b, box, 0, 2.95, -1.2, 2.45, 0.12, 5.45, '#c62828');
      for (const x of [-1.05, 1.05]) for (const z of [2.4, -0.8, -2.6]) part(b, wheel, x, 0.48, z, 0.3, 0.96, 0.96, '#111');
      break;
    case 'bus':
      part(b, box, 0, 0.45, 0, 2.5, 2.6, 10.5, '#ffffff');
      part(b, box, 0, 1.75, 0, 2.52, 0.9, 10.2, '#1c2833');
      part(b, box, 0, 0.45, 0, 2.52, 0.6, 10.52, '#b71c1c');
      for (const x of [-1.1, 1.1]) for (const z of [3.6, -3.4]) part(b, wheel, x, 0.5, z, 0.3, 1.0, 1.0, '#111');
      break;
    case 'bike':
      part(b, box, 0, 0.45, 0, 0.3, 0.45, 1.6, '#ffffff');
      part(b, wheel, 0, 0.32, 0.65, 0.1, 0.64, 0.64, '#111');
      part(b, wheel, 0, 0.32, -0.65, 0.1, 0.64, 0.64, '#111');
      part(b, box, 0, 0.9, -0.1, 0.42, 0.65, 0.35, '#3949ab');
      part(b, Prim.sphere(8, 6), 0, 1.65, -0.05, 0.27, 0.27, 0.27, '#212121');
      break;
    case 'tractor':
      part(b, box, 0, 0.7, 0.6, 1.0, 0.9, 2.2, '#c62828');
      part(b, wheel, -0.85, 0.75, -0.7, 0.45, 1.5, 1.5, '#111');
      part(b, wheel, 0.85, 0.75, -0.7, 0.45, 1.5, 1.5, '#111');
      part(b, wheel, -0.65, 0.4, 1.3, 0.25, 0.8, 0.8, '#111');
      part(b, wheel, 0.65, 0.4, 1.3, 0.25, 0.8, 0.8, '#111');
      part(b, box, 0, 1.4, -0.3, 0.6, 0.7, 0.6, '#455a64');
      part(b, box, 0, 0.55, -3.3, 2.0, 1.0, 3.2, '#8d6e63');
      break;
    case 'cow':
      part(b, box, 0, 0.75, 0, 0.6, 0.75, 1.6, '#ffffff');
      part(b, box, 0, 1.1, 0.95, 0.35, 0.4, 0.55, '#ffffff');
      for (const x of [-0.2, 0.2]) for (const z of [-0.6, 0.6]) part(b, box, x, 0, z, 0.12, 0.78, 0.12, '#ffffff');
      part(b, box, 0, 1.35, 1.05, 0.5, 0.08, 0.08, '#d7ccc8');
      break;
  }
  const g = b.buildGeometry('v');
  return g;
}

const ROAD_TYPES = [['car', 34], ['auto', 22], ['bike', 26], ['truck', 9], ['bus', 5], ['tractor', 4]];
const CAR_COLORS = ['#f5f5f5', '#bdbdbd', '#c62828', '#1565c0', '#212121', '#8d6e63', '#6d4c41', '#e0e0e0', '#283593'];

/**
 * Road traffic at level crossings and road bridges; stops and queues at closed gates.
 * Also renders event obstacles (cattle, stalled tractor).
 */
export class RoadTraffic {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.meshes = {};
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
    for (const t of ['car', 'auto', 'truck', 'bus', 'bike', 'tractor', 'cow']) {
      const m = new THREE.InstancedMesh(vehicleGeo(t), mat, 64);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      this.meshes[t] = m;
    }
    this.roads = new Map(); // key -> { pts, cum, length, vehicles, lc }
    this.rng = new Rng(9);
  }

  roadFor(key, pts, lc) {
    let r = this.roads.get(key);
    if (r) return r;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    r = { key, pts, cum, length: cum[cum.length - 1], vehicles: [], lc, spawnT: 0 };
    // crossing position along the road
    if (lc) {
      let best = 0, bd = Infinity;
      const o = lc.origin;
      pts.forEach((p, i) => {
        const d = Math.hypot(p.x - o.x, p.z - o.z);
        if (d < bd) {
          bd = d;
          best = cum[i];
        }
      });
      r.cross = best;
    }
    this.roads.set(key, r);
    return r;
  }

  pointAt(r, d, out) {
    let i = 1;
    while (i < r.cum.length - 1 && r.cum[i] < d) i++;
    const t = (d - r.cum[i - 1]) / Math.max(1e-6, r.cum[i] - r.cum[i - 1]);
    out.lerpVectors(r.pts[i - 1], r.pts[i], Math.min(1, Math.max(0, t)));
    return Math.atan2(r.pts[i].x - r.pts[i - 1].x, r.pts[i].z - r.pts[i - 1].z);
  }

  update(dt, camera, obstacles = []) {
    const density = settings.get('trafficDensity') ?? 0.8;
    const counts = {};
    for (const k of Object.keys(this.meshes)) counts[k] = 0;
    const cam = camera.position;
    // level crossing roads
    for (const lc of this.world.levelCrossings) {
      if (!lc.handle) continue;
      const o = lc.handle.origin;
      if (Math.hypot(o.x - cam.x, o.z - cam.z) > 1300) continue;
      const r = this.roadFor(lc.def.id, lc.handle.roadPoints, lc.handle);
      this.simulateRoad(r, dt, density * (lc.def.kind === 'urban' ? 1 : 0.5), lc.closed);
      this.draw(r, counts);
    }
    for (const rb of this.world.roadBridges) {
      if (!rb.handle) continue;
      const p0 = rb.handle.deckPoints[0];
      if (Math.hypot(p0.x - cam.x, p0.z - cam.z) > 1500) continue;
      const r = this.roadFor('rob' + rb.def.s, rb.handle.deckPoints, null);
      this.simulateRoad(r, dt, density * 1.2, false);
      this.draw(r, counts);
    }
    // obstacles
    const tmp = {};
    for (const ob of obstacles) {
      const g = this.world.geo.sample(ob.s, tmp);
      const yaw = Math.atan2(g.tx, g.tz);
      if (ob.kind === 'cattle') {
        for (let k = 0; k < 3; k++) {
          const lat = ob.lateral + (k - 1) * 1.4 + Math.sin(ob.t + k) * 0.1;
          _q.setFromAxisAngle(UP, yaw + Math.PI / 2 + k * 0.6 + (ob.leaving ? 0.4 : 0));
          _m.compose(new THREE.Vector3(g.x + g.nx * lat, g.y - 0.1, g.z + g.nz * lat + k * 1.2), _q, new THREE.Vector3(1, 1, 1));
          const mesh = this.meshes.cow;
          if (counts.cow < 64) {
            mesh.setMatrixAt(counts.cow, _m);
            mesh.setColorAt(counts.cow, _c.set(k === 1 ? '#6d4c41' : '#efebe9'));
            counts.cow++;
          }
        }
      } else {
        _q.setFromAxisAngle(UP, yaw + Math.PI / 2);
        _m.compose(new THREE.Vector3(g.x + g.nx * ob.lateral, g.y - 0.05, g.z + g.nz * ob.lateral), _q, new THREE.Vector3(1, 1, 1));
        const mesh = this.meshes.tractor;
        if (counts.tractor < 64) {
          mesh.setMatrixAt(counts.tractor, _m);
          mesh.setColorAt(counts.tractor, _c.set('#ffffff'));
          counts.tractor++;
        }
      }
    }
    for (const [k, mesh] of Object.entries(this.meshes)) {
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  simulateRoad(r, dt, density, closed) {
    r.spawnT -= dt;
    if (r.spawnT <= 0 && r.vehicles.length < 18) {
      r.spawnT = (2 + this.rng.next() * 6) / Math.max(0.2, density);
      const dir = this.rng.chance(0.5) ? 1 : -1;
      const type = this.rng.weighted(ROAD_TYPES);
      const vmax = { car: 13, auto: 9, bike: 11, truck: 9, bus: 10, tractor: 6 }[type];
      r.vehicles.push({ type, dir, d: dir > 0 ? 0 : r.length, v: vmax * 0.8, vmax, len: { car: 4.5, auto: 3, bike: 2, truck: 9, bus: 11, tractor: 7 }[type], color: CAR_COLORS[this.rng.int(0, CAR_COLORS.length - 1)], lane: dir * 1.6 });
    }
    for (const veh of r.vehicles) {
      let limit = veh.vmax;
      // stop line before a closed crossing
      if (r.cross !== undefined && closed) {
        const stopAt = r.cross - veh.dir * 13;
        const toStop = (stopAt - veh.d) * veh.dir;
        if (toStop > -2 && toStop < 60) limit = Math.min(limit, Math.max(0, Math.sqrt(2 * 3 * Math.max(0, toStop - 0.5))));
      }
      // queue behind the vehicle ahead
      for (const o of r.vehicles) {
        if (o === veh || o.dir !== veh.dir) continue;
        const gap = (o.d - veh.d) * veh.dir - o.len - 1.5;
        if (gap > -1 && gap < 30) limit = Math.min(limit, Math.max(0, gap * 0.6));
      }
      veh.v += Math.max(-6 * dt, Math.min(2.5 * dt, limit - veh.v));
      veh.v = Math.max(0, veh.v);
      veh.d += veh.dir * veh.v * dt;
    }
    r.vehicles = r.vehicles.filter((v) => v.d >= -5 && v.d <= r.length + 5);
  }

  draw(r, counts) {
    const p = new THREE.Vector3();
    for (const veh of r.vehicles) {
      const mesh = this.meshes[veh.type];
      if (counts[veh.type] >= 64) continue;
      const yaw = this.pointAt(r, veh.d, p) + (veh.dir < 0 ? Math.PI : 0);
      const lateral = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(-1.6);
      _q.setFromAxisAngle(UP, yaw);
      _m.compose(p.clone().add(lateral), _q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(counts[veh.type], _m);
      mesh.setColorAt(counts[veh.type], _c.set(veh.color));
      counts[veh.type]++;
    }
  }
}
