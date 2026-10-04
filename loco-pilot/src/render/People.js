import * as THREE from 'three';
import { Rng } from '../core/Rng.js';
import { settings } from '../core/Settings.js';
import { bus } from '../core/EventBus.js';

// Low-poly person: parts 0 = torso/clothes, 1 = left leg, 2 = right leg, 3 = arms, 4 = head (skin), 5 = hair.
function buildPersonGeometry() {
  const parts = [];
  const add = (geo, part, color, x, y, z) => {
    geo.translate(x, y, z);
    const n = geo.attributes.position.count;
    geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(geo.index ? geo.toNonIndexed() : geo);
  };
  add(new THREE.CylinderGeometry(0.17, 0.2, 0.62, 7), 0, '#ffffff', 0, 1.18, 0);
  add(new THREE.CylinderGeometry(0.21, 0.24, 0.16, 7), 0, '#ffffff', 0, 0.86, 0);
  add(new THREE.BoxGeometry(0.12, 0.82, 0.13), 1, '#3a3530', -0.09, 0.41, 0);
  add(new THREE.BoxGeometry(0.12, 0.82, 0.13), 2, '#3a3530', 0.09, 0.41, 0);
  add(new THREE.BoxGeometry(0.09, 0.6, 0.1), 3, '#ffffff', -0.24, 1.15, 0);
  add(new THREE.BoxGeometry(0.09, 0.6, 0.1), 3, '#ffffff', 0.24, 1.15, 0);
  add(new THREE.SphereGeometry(0.115, 8, 6), 4, '#8d5a3b', 0, 1.62, 0);
  add(new THREE.SphereGeometry(0.118, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 5, '#141210', 0, 1.64, -0.01);
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'aPart']) {
    const size = parts[0].attributes[name].itemSize;
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const p of parts) {
      arr.set(p.attributes[name].array, o);
      o += p.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

const CLOTHES = ['#c62828', '#ad1457', '#6a1b9a', '#283593', '#1565c0', '#00838f', '#2e7d32', '#f9a825', '#ef6c00', '#f5f5f5', '#eeeeee', '#8d6e63', '#546e7a', '#d81b60', '#fdd835', '#43a047'];
const SKIN = ['#8d5a3b', '#a0694a', '#7a4a30', '#b57a55', '#6e4228'];

/**
 * Passengers, porters, vendors and staff on station platforms, plus trackside workers.
 * One instanced mesh; the walk cycle is done in the vertex shader from per-instance phase.
 */
export class Crowd {
  constructor(scene) {
    this.scene = scene;
    this.max = 700;
    const geo = buildPersonGeometry();
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPart;\nattribute vec3 aWalk;\nattribute vec3 aSkin;\nvarying vec3 vSkinMix;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = aWalk.x, amt = aWalk.y;
          float sw = sin(ph) * 0.45 * amt;
          if (aPart > 0.5 && aPart < 2.5) {
            float s = aPart < 1.5 ? sw : -sw;
            float hy = 0.82;
            float dy = transformed.y - hy;
            transformed.z += dy * sin(s);
          }
          if (aPart > 2.5 && aPart < 3.5) {
            float s = (transformed.x < 0.0 ? -sw : sw) * 0.8 + aWalk.z * 1.2;
            float dy = transformed.y - 1.42;
            transformed.z += dy * sin(s);
            transformed.y += aWalk.z * (1.42 - transformed.y) * 0.6;
          }
          transformed.y += abs(cos(ph)) * 0.025 * amt;
          vSkinMix = (aPart > 4.5) ? color : ((aPart > 3.5) ? color * aSkin : vec3(-1.0));`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkinMix;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          if (vSkinMix.x >= 0.0) diffuseColor.rgb = vSkinMix;`);
    };
    this.mat.customProgramCacheKey = () => 'crowd-v1';
    this.walkAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.skinAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3).fill(1), 3);
    geo.setAttribute('aWalk', this.walkAttr);
    geo.setAttribute('aSkin', this.skinAttr);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    // luggage (suitcases, head loads, bags)
    this.bagMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.7 }), this.max);
    this.bagMesh.count = 0;
    this.bagMesh.frustumCulled = false;
    this.bagMesh.castShadow = true;
    scene.add(this.bagMesh);
    this.people = [];
    this.station = null;
    this.rng = new Rng(77);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._c = new THREE.Color();
    this.workers = [];
    this.offs = [
      bus.on('doors', (e) => this.onDoors(e)),
    ];
    this.doorTargets = [];
  }

  /** Populate a station's platforms. */
  populate(stationGroup, world) {
    this.clear();
    if (!stationGroup) return;
    const ud = stationGroup.userData;
    this.station = ud.station;
    const density = settings.get('crowdDensity') ?? 0.7;
    const size = ud.station.size;
    const perM2 = (size === 'major' ? 0.11 : size === 'large' ? 0.08 : size === 'junction' ? 0.07 : 0.035) * density;
    const geo = world.geo;
    for (const area of ud.walkAreas) {
      const len = area.s1 - area.s0, wid = area.b - area.a;
      let n = Math.min(Math.round(len * wid * perM2), Math.floor((this.max - this.people.length) * 0.5));
      for (let i = 0; i < n; i++) {
        const role = this.rng.weighted([['passenger', 80], ['porter', 6], ['vendor', 5], ['staff', 4], ['child', 5]]);
        // people cluster near the canopy / middle of the platform
        const s = area.s0 + len * Math.min(1, Math.max(0, 0.5 + (this.rng.next() + this.rng.next() - 1) * 0.75));
        const d = area.a + wid * this.rng.next();
        const p = {
          role, s, d, area, geo, heading: this.rng.next() * Math.PI * 2, phase: this.rng.next() * 6, walk: 0,
          state: this.rng.chance(0.25) ? 'wander' : 'idle', target: null, speed: 1.0 + this.rng.next() * 0.5, timer: this.rng.next() * 10,
          clothes: role === 'porter' ? '#c62828' : role === 'staff' ? (this.rng.chance(0.5) ? '#f5f5f5' : '#b39b6b') : CLOTHES[this.rng.int(0, CLOTHES.length - 1)],
          skin: SKIN[this.rng.int(0, SKIN.length - 1)], scale: role === 'child' ? 0.62 : 0.92 + this.rng.next() * 0.16,
          bag: role === 'porter' ? 'head' : this.rng.chance(0.45) ? (this.rng.chance(0.5) ? 'case' : 'bag') : null,
          wave: 0, visible: true,
        };
        this.people.push(p);
      }
    }
  }

  /** Trackside workers at a work site (TSR). */
  addWorkers(world, s0, s1, side = -1) {
    const geo = world.geo;
    for (let i = 0; i < 8; i++) {
      const s = s0 + ((s1 - s0) * (i + 0.5)) / 8;
      const d = side * (8.5 + (i % 3) * 1.2);
      this.workers.push({ role: 'worker', s, d, geo, heading: 0, phase: i, walk: 0, state: 'work', clothes: '#ff6d00', skin: SKIN[i % SKIN.length], scale: 1, bag: null, wave: 0, visible: true, work: true });
    }
  }

  clear() {
    this.people = [];
    this.station = null;
  }

  onDoors({ open, station }) {
    if (!this.station || station.id !== this.station.id) return;
    this.doorsOpen = open;
    if (open) {
      // some passengers walk to the train to board, some alight
      for (const p of this.people) {
        if (p.role === 'passenger' || p.role === 'child') {
          if (this.rng.chance(0.55) && this.trainSide(p)) {
            p.state = 'board';
            p.target = null;
          }
        }
      }
      this.spawnAlighting = 18 + this.rng.int(0, 20);
    }
  }

  trainSide(p) {
    return this.playerTrain && Math.abs(this.playerSideDist(p)) < 14;
  }

  playerSideDist(p) {
    if (!this.playerTrain) return 99;
    const lat = this.playerTrain.path.lateralAt(p.s);
    return lat - p.d;
  }

  update(dt, ctx) {
    const { camera, player, world, night } = ctx;
    this.playerTrain = player;
    const tmp = {};
    let n = 0, nb = 0;
    const m = this._m, q = this._q, c = this._c;
    const approaching = player && this.station && Math.abs(player.v) > 0.5 && Math.abs(((this.station.platformS0 + this.station.platformS1) / 2) - player.s) < 1500;
    const all = this.people.concat(this.workers);
    for (const p of all) {
      if (!p.visible) continue;
      // behaviour
      p.timer -= dt;
      if (p.work) {
        const near = player && Math.abs(player.s - p.s) < 400;
        p.wave = near ? Math.max(0, Math.sin(performance.now() / 300 + p.phase)) : 0;
        p.walk = 0;
        if (near && player) p.heading = Math.atan2(0, (player.s - p.s) > 0 ? 1 : -1);
      } else if (p.state === 'idle') {
        p.walk = Math.max(0, p.walk - dt * 3);
        if (approaching && p.timer < 0) {
          p.timer = 3 + this.rng.next() * 4;
          // turn to watch the approaching train
          p.faceTrain = true;
        }
        if (p.timer < -12 && this.rng.chance(0.01)) {
          p.state = 'wander';
          p.target = null;
        }
      } else if (p.state === 'wander' || p.state === 'board' || p.state === 'leave') {
        if (!p.target) {
          if (p.state === 'board' && player) {
            // nearest coach door
            const doorS = this.nearestDoor(player, p.s);
            const lat = player.path.lateralAt(doorS);
            const side = lat < p.d ? 1 : -1;
            p.target = { s: doorS, d: lat + side * 1.75 };
          } else if (p.state === 'leave') {
            p.target = { s: p.area.s0 + (p.area.s1 - p.area.s0) * 0.5 + (this.rng.next() - 0.5) * 40, d: p.area.a + (p.area.b - p.area.a) * this.rng.next() };
          } else {
            p.target = { s: Math.min(p.area.s1, Math.max(p.area.s0, p.s + (this.rng.next() - 0.5) * 60)), d: p.area.a + (p.area.b - p.area.a) * this.rng.next() };
          }
        }
        const ds = p.target.s - p.s, dd = p.target.d - p.d;
        const dist = Math.hypot(ds, dd);
        if (dist < 0.4) {
          if (p.state === 'board') {
            p.visible = false; // boarded
          } else {
            p.state = 'idle';
            p.timer = 4 + this.rng.next() * 12;
          }
          p.target = null;
        } else {
          const sp = p.speed * (p.state === 'board' ? 1.25 : 1);
          p.s += (ds / dist) * sp * dt;
          p.d += (dd / dist) * sp * dt;
          p.heading = Math.atan2(dd, ds);
          p.walk = Math.min(1, p.walk + dt * 3);
          p.phase += dt * sp * 4.2;
        }
        // never step onto the track
        if (p.area) p.d = Math.min(p.area.b + 0.6, Math.max(p.area.a - 0.6, p.d));
      }
      if (n >= this.max) break;
      // world transform
      const g = p.geo.sample(p.s, tmp);
      const x = g.x + g.nx * p.d, z = g.z + g.nz * p.d;
      const y = g.y + (p.work ? -0.6 : 0.84);
      if (camera && (Math.abs(x - camera.position.x) > 600 || Math.abs(z - camera.position.z) > 600)) continue;
      let yaw = Math.atan2(g.tx, g.tz) + (p.heading - 0);
      if (p.faceTrain && player && p.state === 'idle') {
        const toTrain = player.s - p.s;
        yaw = Math.atan2(g.tx, g.tz) + (toTrain > 0 ? 0 : Math.PI) + 0.3 * Math.sin(p.phase);
      }
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
      this.mesh.setMatrixAt(n, m);
      this.mesh.setColorAt(n, c.set(p.clothes));
      const sk = c.set(p.skin);
      this.skinAttr.array.set([sk.r, sk.g, sk.b], n * 3);
      this.walkAttr.array.set([p.phase, p.walk, p.wave], n * 3);
      if (p.bag && nb < this.max) {
        if (p.bag === 'head') {
          m.compose(new THREE.Vector3(x, y + 1.82 * p.scale, z), q, new THREE.Vector3(0.5, 0.25, 0.4));
          this.bagMesh.setColorAt(nb, c.set('#7a5a3a'));
        } else if (p.bag === 'case') {
          const off = new THREE.Vector3(0.32, 0.3, 0).applyQuaternion(q);
          m.compose(new THREE.Vector3(x + off.x, y + 0.3, z + off.z), q, new THREE.Vector3(0.2, 0.55, 0.42));
          this.bagMesh.setColorAt(nb, c.set(['#263238', '#4e342e', '#1a237e', '#880e4f'][n % 4]));
        } else {
          const off = new THREE.Vector3(-0.2, 1.05, -0.12).applyQuaternion(q);
          m.compose(new THREE.Vector3(x + off.x, y + off.y, z + off.z), q, new THREE.Vector3(0.18, 0.32, 0.12));
          this.bagMesh.setColorAt(nb, c.set('#5d4037'));
        }
        this.bagMesh.setMatrixAt(nb, m);
        nb++;
      }
      n++;
    }
    // passengers alighting from the stopped train
    if (this.doorsOpen && this.spawnAlighting > 0 && player && this.people.length < this.max) {
      this.spawnAcc = (this.spawnAcc || 0) + dt;
      if (this.spawnAcc > 0.35) {
        this.spawnAcc = 0;
        this.spawnAlighting--;
        const doorS = this.nearestDoor(player, player.s - player.dir * this.rng.next() * player.length);
        const lat = player.path.lateralAt(doorS);
        const area = this.station && this.areaNear(doorS, lat);
        if (area) {
          const side = (area.a + area.b) / 2 > lat ? 1 : -1;
          this.people.push({
            role: 'passenger', s: doorS, d: lat + side * 1.75, area, geo: world.geo, heading: 0, phase: 0, walk: 1, state: 'leave', target: null,
            speed: 1.2, timer: 0, clothes: CLOTHES[this.rng.int(0, CLOTHES.length - 1)], skin: SKIN[this.rng.int(0, 4)], scale: 0.95,
            bag: this.rng.chance(0.6) ? 'case' : null, wave: 0, visible: true,
          });
        }
      }
    }
    this.mesh.count = n;
    this.bagMesh.count = nb;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.walkAttr.needsUpdate = true;
    this.skinAttr.needsUpdate = true;
    this.bagMesh.instanceMatrix.needsUpdate = true;
    if (this.bagMesh.instanceColor) this.bagMesh.instanceColor.needsUpdate = true;
    void night;
  }

  areaNear(s, lat) {
    const st = this.stationGroup;
    void st;
    let best = null, bd = Infinity;
    for (const p of this.people) {
      if (!p.area) continue;
      const a = p.area;
      if (s < a.s0 - 20 || s > a.s1 + 20) continue;
      const d = Math.min(Math.abs(a.a - lat), Math.abs(a.b - lat));
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return bd < 4 ? best : null;
  }

  nearestDoor(train, s) {
    // doors at both ends of every coach
    let best = train.s, bd = Infinity;
    for (const v of train.vehicles) {
      if (v.kind !== 'coach') continue;
      for (const o of [v.frontOffset + 1.45, v.frontOffset + v.length - 1.45]) {
        const ds = train.s - train.dir * o;
        const d = Math.abs(ds - s);
        if (d < bd) {
          bd = d;
          best = ds;
        }
      }
    }
    return best;
  }

  dispose() {
    this.offs.forEach((f) => f());
    this.scene.remove(this.mesh, this.bagMesh);
  }
}
