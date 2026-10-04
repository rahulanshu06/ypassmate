import * as THREE from 'three';
import { coachModel, buildLocoModel } from './TrainModels.js';
import { coachTextures, locoTextures, wagonTexture } from './TrainTextures.js';
import { COACH_TYPES } from '../data/rollingStock.js';
import { Tex } from './TextureGen.js';
import { fogUniforms } from './Atmosphere.js';

const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _s = {};
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Keeps 3D vehicles in sync with simulated trains. Coaches/wagons are drawn with per-type
 * InstancedMeshes (two LODs, CPU frustum culling); locomotives are individual groups.
 */
export class TrainRenderer {
  constructor(scene, world, camera) {
    this.scene = scene;
    this.world = world;
    this.camera = camera;
    this.geo = world.geo;
    this.root = new THREE.Group();
    this.root.name = 'trains';
    scene.add(this.root);
    this.buckets = new Map();
    this.locos = new Map(); // train id -> loco handle
    this.frustum = new THREE.Frustum();
    this.projScreen = new THREE.Matrix4();
    this.frameMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.45 });
    this.frameMat.name = 'trainFrame';
    this.nightFactor = 0;
    this.lodDistance = 260;
    this.maxDistance = 3200;
    this.materials = {
      frame: this.frameMat,
      glass: new THREE.MeshStandardMaterial({ color: 0x0d1418, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.6 }),
      panto: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.8 }),
      locoBody: (t) => {
        const m = new THREE.MeshStandardMaterial({ map: t.map, roughness: 0.42, metalness: 0.25 });
        return m;
      },
      locoFront: (t) => new THREE.MeshStandardMaterial({ map: t.front, roughness: 0.4, metalness: 0.25 }),
    };
    this.coachMats = new Map();
    // glow points for headlights and tail lamps
    this.maxGlows = 64;
    const pg = new THREE.BufferGeometry();
    this.glowPos = new THREE.BufferAttribute(new Float32Array(this.maxGlows * 3), 3);
    this.glowCol = new THREE.BufferAttribute(new Float32Array(this.maxGlows * 3), 3);
    this.glowSize = new THREE.BufferAttribute(new Float32Array(this.maxGlows), 1);
    this.glowDir = new THREE.BufferAttribute(new Float32Array(this.maxGlows * 3), 3);
    pg.setAttribute('position', this.glowPos);
    pg.setAttribute('aColor', this.glowCol);
    pg.setAttribute('aSize', this.glowSize);
    pg.setAttribute('aDir', this.glowDir);
    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { ...fogUniforms(), uMap: { value: Tex.glow() } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute vec3 aDir;
        varying vec3 vColor; varying float vVis;
        #include <fog_pars_vertex>
        void main(){
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vec3 toCam = normalize(cameraPosition - position);
          float facing = length(aDir) > 0.0 ? smoothstep(-0.1, 0.6, dot(normalize(aDir), toCam)) : 1.0;
          vColor = aColor * facing;
          vVis = facing;
          float dist = -mvPosition.z;
          gl_PointSize = aSize > 0.0 ? clamp(aSize * 900.0 / max(dist, 1.0) * (1.0 + dist * 0.0015), 2.0, 160.0) * facing : 0.0;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying vec3 vColor; varying float vVis;
        #include <fog_pars_fragment>
        void main(){
          float a = texture2D(uMap, gl_PointCoord).a;
          gl_FragColor = vec4(vColor * a, a);
          vec3 lit = gl_FragColor.rgb;
          #include <fog_fragment>
          gl_FragColor.rgb = mix(gl_FragColor.rgb, lit, 0.5);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    this.glows = new THREE.Points(pg, this.glowMat);
    this.glows.frustumCulled = false;
    this.glows.renderOrder = 12;
    scene.add(this.glows);
    // tail lamp "LV" board
    this.lvGeo = new THREE.PlaneGeometry(0.42, 0.42);
    this.lvMat = new THREE.MeshStandardMaterial({ map: lvTexture(), roughness: 0.6, emissiveMap: lvTexture(), emissive: 0xffffff, emissiveIntensity: 0 });
    this.lvMeshes = [];
    this.playerLoco = null;
  }

  coachMaterial(typeId) {
    if (this.coachMats.has(typeId)) return this.coachMats.get(typeId);
    const def = COACH_TYPES[typeId];
    let m;
    if (def.wagon) {
      const t = wagonTexture(typeId);
      m = new THREE.MeshStandardMaterial({ map: t.map, roughness: 0.85, metalness: 0.3, side: THREE.DoubleSide });
    } else {
      const t = coachTextures(typeId);
      m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: def.ac ? 0xdfeaff : 0xffe2b0, emissiveIntensity: 0, roughness: 0.32, metalness: 0.35 });
      m.userData.night = true;
    }
    m.name = 'coach:' + typeId;
    this.coachMats.set(typeId, m);
    return m;
  }

  bucket(typeId) {
    let b = this.buckets.get(typeId);
    if (b) return b;
    const model = coachModel(COACH_TYPES[typeId]);
    const cap = 96;
    const mk = (geo, mat, cast) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = cast;
      m.receiveShadow = true;
      this.root.add(m);
      return m;
    };
    const bodyMat = this.coachMaterial(typeId);
    b = {
      model, cap,
      hiBody: mk(model.body, bodyMat, true), hiFrame: mk(model.frame, this.frameMat, true),
      loBody: mk(model.lowBody, bodyMat, false), loFrame: mk(model.lowFrame, this.frameMat, false),
      hi: 0, lo: 0,
    };
    this.buckets.set(typeId, b);
    return b;
  }

  ensureLoco(train) {
    let h = this.locos.get(train.id);
    if (h) return h;
    const v0 = train.vehicles[0];
    const classCode = v0.type === 'EF90' ? 'EF90' : 'EP60';
    const livery = train.isPlayer ? train.livery || 'saffron' : v0.type === 'EF90' ? 'ocean' : train.livery || 'maroon';
    const tex = locoTextures(livery, train.isPlayer ? '30417' : String(30100 + (hashId(train.id) % 800)), classCode);
    h = buildLocoModel(tex, this.materials);
    h.train = train;
    this.root.add(h.group);
    this.locos.set(train.id, h);
    if (train.isPlayer) this.playerLoco = h;
    return h;
  }

  removeLoco(id) {
    const h = this.locos.get(id);
    if (!h) return;
    this.root.remove(h.group);
    h.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.locos.delete(id);
  }

  /** Compute a vehicle transform from its two bogie positions on the train's path. */
  vehicleMatrix(train, veh, out) {
    const dir = train.dir;
    const sc = train.s - dir * veh.centreOffset;
    const half = veh.bogieCentres / 2;
    const sF = sc + dir * half, sR = sc - dir * half;
    this.pointOnPath(train, sF, _f);
    this.pointOnPath(train, sR, _r);
    _p.addVectors(_f, _r).multiplyScalar(0.5);
    const fwd = _f.sub(_r).normalize();
    const cant = this.geo.cantAt(sc) * dir;
    // proper rotation basis: local +x = vehicle's left side, +y = up, +z = leading end
    const left = new THREE.Vector3().crossVectors(UP, fwd).normalize();
    const up = new THREE.Vector3().crossVectors(fwd, left).normalize();
    if (cant !== 0) {
      // positive cant banks the vehicle towards its right (left side rises)
      const c = Math.cos(cant), s = Math.sin(cant);
      const lx = left.x * c + up.x * s, ly = left.y * c + up.y * s, lz = left.z * c + up.z * s;
      up.set(up.x * c - left.x * s, up.y * c - left.y * s, up.z * c - left.z * s);
      left.set(lx, ly, lz);
    }
    out.set(left.x, up.x, fwd.x, _p.x, left.y, up.y, fwd.y, _p.y, left.z, up.z, fwd.z, _p.z, 0, 0, 0, 1);
    return out;
  }

  pointOnPath(train, s, out) {
    const g = this.geo.sample(s, _s);
    const lat = train.path.lateralAt(s);
    return out.set(g.x + g.nx * lat, g.y, g.z + g.nz * lat);
  }

  sync(trains, camera, opts = {}) {
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const camPos = camera.position;
    for (const b of this.buckets.values()) {
      b.hi = 0;
      b.lo = 0;
    }
    let glow = 0;
    const gp = this.glowPos.array, gc = this.glowCol.array, gs = this.glowSize.array, gd = this.glowDir.array;
    const addGlow = (pos, color, size, dirv) => {
      if (glow >= this.maxGlows) return;
      gp[glow * 3] = pos.x; gp[glow * 3 + 1] = pos.y; gp[glow * 3 + 2] = pos.z;
      gc[glow * 3] = color[0]; gc[glow * 3 + 1] = color[1]; gc[glow * 3 + 2] = color[2];
      gs[glow] = size;
      gd[glow * 3] = dirv ? dirv.x : 0; gd[glow * 3 + 1] = dirv ? dirv.y : 0; gd[glow * 3 + 2] = dirv ? dirv.z : 0;
      glow++;
    };
    const sphere = new THREE.Sphere();
    const seen = new Set();
    let lv = 0;
    for (const t of trains) {
      const visibleTrain = t.active || t.stabled;
      if (!visibleTrain) continue;
      const midS = t.s - t.dir * t.length * 0.5;
      const g = this.geo.sample(midS, _s);
      const dist = Math.hypot(g.x - camPos.x, g.z - camPos.z);
      if (dist > this.maxDistance + t.length) continue;
      seen.add(t.id);
      for (let i = 0; i < t.vehicles.length; i++) {
        const veh = t.vehicles[i];
        this.vehicleMatrix(t, veh, _m);
        const px = _m.elements[12], py = _m.elements[13], pz = _m.elements[14];
        if (veh.kind === 'loco') {
          const h = this.ensureLoco(t);
          h.group.matrixAutoUpdate = false;
          h.group.matrix.copy(_m);
          h.group.matrixWorldNeedsUpdate = true;
          h.group.visible = !(t.isPlayer && opts.hidePlayerLoco);
          // headlight & markers
          const fwd = new THREE.Vector3(_m.elements[8], _m.elements[9], _m.elements[10]);
          const hl = t.headlight;
          for (let k = 0; k < h.lenses.length; k++) {
            const lead = k === 1; // +z end leads
            h.lenses[k].material.emissiveIntensity = lead && hl ? (hl === 2 ? 8 : 2.5) : 0;
          }
          for (let k = 0; k < h.markers.length; k++) {
            const lead = k >= 2;
            const mat = h.markers[k].material;
            mat.emissive.set(lead ? 0xfff1d8 : 0xff2a10);
            mat.emissiveIntensity = lead ? (hl ? 3 : 0.6) : 0;
          }
          if (hl) {
            const lp = new THREE.Vector3(0, 4.05, veh.length / 2 + 0.05).applyMatrix4(_m);
            addGlow(lp, hl === 2 ? [2.2, 2.1, 1.9] : [0.9, 0.85, 0.75], hl === 2 ? 1.6 : 0.8, fwd);
            for (const x of [-1.15, 1.15]) addGlow(new THREE.Vector3(x, 1.62, veh.length / 2 + 0.05).applyMatrix4(_m), [0.7, 0.65, 0.55], 0.35, fwd);
          }
          if (t.isPlayer && t.traction) {
            const ext = t.traction.panto;
            h.pantos[0].set(ext * (t.traction.pantoCmd || ext > 0.01 ? 1 : 0));
            h.pantos[1].set(0);
          } else {
            h.pantos[0].set(t.stabled ? 0 : 1);
            h.pantos[1].set(0);
          }
          continue;
        }
        sphere.center.set(px, py + 2, pz);
        sphere.radius = veh.length * 0.6;
        if (!this.frustum.intersectsSphere(sphere)) continue;
        const d = Math.hypot(px - camPos.x, pz - camPos.z);
        const b = this.bucket(veh.type);
        if (d < this.lodDistance) {
          if (b.hi < b.cap) {
            b.hiBody.setMatrixAt(b.hi, _m);
            b.hiFrame.setMatrixAt(b.hi, _m);
            b.hi++;
          }
        } else if (b.lo < b.cap) {
          b.loBody.setMatrixAt(b.lo, _m);
          b.loFrame.setMatrixAt(b.lo, _m);
          b.lo++;
        }
      }
      // tail lamp + LV board on the last vehicle
      const last = t.vehicles[t.vehicles.length - 1];
      if (last.kind !== 'loco' && !t.stabled) {
        this.vehicleMatrix(t, last, _m);
        const back = new THREE.Vector3(-_m.elements[8], -_m.elements[9], -_m.elements[10]);
        const pos = new THREE.Vector3(0.9, 1.5, -last.length / 2 - 0.1).applyMatrix4(_m);
        const blink = Math.sin(performance.now() * 0.006 + hashId(t.id)) > 0 ? 1 : 0.15;
        addGlow(pos, [1.6 * blink, 0.08 * blink, 0.03 * blink], 0.45, back);
        if (lv < 24) {
          let mesh = this.lvMeshes[lv];
          if (!mesh) {
            mesh = new THREE.Mesh(this.lvGeo, this.lvMat);
            mesh.matrixAutoUpdate = false;
            this.root.add(mesh);
            this.lvMeshes[lv] = mesh;
          }
          mesh.visible = true;
          const q = new THREE.Matrix4().makeRotationY(Math.PI);
          q.setPosition(-0.7, 1.75, -last.length / 2 - 0.16);
          mesh.matrix.multiplyMatrices(_m, q);
          lv++;
        }
      }
    }
    for (let i = lv; i < this.lvMeshes.length; i++) this.lvMeshes[i].visible = false;
    for (const id of [...this.locos.keys()]) {
      if (!seen.has(id)) {
        const h = this.locos.get(id);
        if (h.train.active || h.train.stabled) h.group.visible = false;
        else this.removeLoco(id);
      }
    }
    for (const b of this.buckets.values()) {
      for (const [mesh, n] of [[b.hiBody, b.hi], [b.hiFrame, b.hi], [b.loBody, b.lo], [b.loFrame, b.lo]]) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    for (let i = glow; i < this.maxGlows; i++) gs[i] = 0;
    this.glowPos.needsUpdate = this.glowCol.needsUpdate = this.glowSize.needsUpdate = this.glowDir.needsUpdate = true;
    this.glows.geometry.setDrawRange(0, Math.max(glow, 1));
  }

  setNight(n) {
    if (Math.abs(n - this.nightFactor) < 0.01) return;
    this.nightFactor = n;
    for (const m of this.coachMats.values()) if (m.userData.night) m.emissiveIntensity = 1.4 * n;
    this.lvMat.emissiveIntensity = 0.3 * n;
  }

  dispose() {
    for (const id of [...this.locos.keys()]) this.removeLoco(id);
    this.scene.remove(this.root);
    this.scene.remove(this.glows);
  }
}

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function lvTexture() {
  if (lvTexture.t) return lvTexture.t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#111';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#f2c400';
  x.fillRect(6, 6, 116, 116);
  x.fillStyle = '#111';
  x.font = '700 64px "Rajdhani", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('LV', 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  lvTexture.t = t;
  return t;
}
