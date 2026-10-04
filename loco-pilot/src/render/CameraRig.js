import * as THREE from 'three';
import { clamp, lerp, damp, wrapAngle } from '../core/MathUtil.js';
import { settings } from '../core/Settings.js';
import { CAB } from './CabView.js';

export const CAMERA_MODES = [
  { id: 'cab', name: 'Driver cab', nameHi: 'चालक केबिन' },
  { id: 'headout', name: 'Head-out (first person)', nameHi: 'खिड़की से' },
  { id: 'orbit', name: 'Third person', nameHi: 'थर्ड पर्सन' },
  { id: 'chase', name: 'Chase', nameHi: 'पीछा' },
  { id: 'side', name: 'Side', nameHi: 'साइड' },
  { id: 'front', name: 'Front loco', nameHi: 'इंजन के आगे' },
  { id: 'rear', name: 'Rear of train', nameHi: 'गाड़ी के पीछे' },
  { id: 'free', name: 'Free camera', nameHi: 'फ्री कैमरा' },
  { id: 'trackside', name: 'Trackside cinematic', nameHi: 'ट्रैक किनारे' },
];

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

/**
 * All camera modes with smooth blending between them. Input: mouse drag to look/orbit,
 * wheel to zoom, WASD/QE in free camera. Cab view adds subtle motion (sway, bounce, surge).
 */
export class CameraRig {
  constructor(camera, dom, sampler) {
    this.camera = camera;
    this.dom = dom;
    this.sampler = sampler;
    this.mode = 'cab';
    this.look = { yaw: 0, pitch: -0.05 };
    this.orbit = { yaw: 2.4, pitch: 0.18, dist: 28 };
    this.free = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
    this.fov = settings.get('fov') || 62;
    this.zoom = 1;
    this.blend = 1;
    this.fromPos = new THREE.Vector3();
    this.fromQuat = new THREE.Quaternion();
    this.dragging = false;
    this.dragButton = 0;
    this.last = { x: 0, y: 0 };
    this.shake = new THREE.Vector3();
    this.surge = 0;
    this.trackside = null;
    this.capturesWASD = false;
    this.headoutSide = 1;
    this.enabled = true;
    this.pointerOverControl = () => false;
    this.bindEvents();
  }

  bindEvents() {
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0 && this.pointerOverControl(e)) return;
      this.dragging = true;
      this.dragButton = e.button;
      this.last.x = e.clientX;
      this.last.y = e.clientY;
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging || !this.enabled) return;
      const sens = 0.0042 * (settings.get('mouseSensitivity') || 1) * (this.fov / 62);
      const dx = e.clientX - this.last.x, dy = (e.clientY - this.last.y) * (settings.get('invertY') ? -1 : 1);
      this.last.x = e.clientX;
      this.last.y = e.clientY;
      this.applyLook(dx * sens, dy * sens);
    });
    const end = (e) => {
      this.dragging = false;
      try {
        el.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const k = Math.sign(e.deltaY);
      if (this.mode === 'orbit' || this.mode === 'chase') this.orbit.dist = clamp(this.orbit.dist * (1 + k * 0.1), 8, 160);
      else this.zoom = clamp(this.zoom * (1 - k * 0.08), 1, 3.2);
    }, { passive: false });
  }

  applyLook(dx, dy) {
    if (this.mode === 'orbit' || this.mode === 'chase') {
      this.orbit.yaw -= dx;
      this.orbit.pitch = clamp(this.orbit.pitch + dy, -0.15, 1.35);
    } else if (this.mode === 'free') {
      this.free.yaw -= dx;
      this.free.pitch = clamp(this.free.pitch - dy, -1.5, 1.5);
    } else {
      this.look.yaw -= dx;
      this.look.pitch = clamp(this.look.pitch - dy, -1.1, 1.0);
      if (this.mode === 'cab') this.look.yaw = clamp(this.look.yaw, -2.2, 2.2);
    }
  }

  setMode(mode) {
    if (mode === this.mode) {
      if (mode === 'headout') this.headoutSide *= -1;
      return;
    }
    this.fromPos.copy(this.camera.position);
    this.fromQuat.copy(this.camera.quaternion);
    this.blend = settings.get('reducedMotion') ? 1 : 0;
    const prev = this.mode;
    this.mode = mode;
    this.zoom = 1;
    this.capturesWASD = mode === 'free';
    if (mode === 'free') {
      this.free.pos.copy(this.camera.position);
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.free.yaw = e.y;
      this.free.pitch = e.x;
    }
    if (mode === 'cab') this.look = { yaw: 0, pitch: -0.06 };
    if (mode === 'headout') this.look = { yaw: 0, pitch: -0.05 };
    if (mode === 'trackside') this.trackside = null;
    void prev;
  }

  cycle(dir = 1) {
    const ids = CAMERA_MODES.map((m) => m.id);
    const i = ids.indexOf(this.mode);
    this.setMode(ids[(i + dir + ids.length) % ids.length]);
  }

  /** Train frame helper: world transform of the lead loco. */
  locoMatrix(rend, train) {
    rend.vehicleMatrix(train, train.vehicles[0], _m);
    return _m;
  }

  update(dt, ctx) {
    const { train, renderer, input, world } = ctx;
    const cam = this.camera;
    if (!train) return;
    const loco = this.locoMatrix(renderer, train).clone();
    const fwd = new THREE.Vector3().setFromMatrixColumn(loco, 2);
    const left = new THREE.Vector3().setFromMatrixColumn(loco, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(loco, 1);
    const origin = new THREE.Vector3().setFromMatrixPosition(loco);
    const speed = Math.abs(train.v);
    const motion = settings.get('reducedMotion') ? 0 : settings.get('cameraShake') ? 1 : 0.35;
    const targetPos = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();
    let fov = this.fov;
    // gamepad right stick look
    if (input && (input.analog.lookX || input.analog.lookY)) this.applyLook(input.analog.lookX * dt * 2.2, input.analog.lookY * dt * 1.6);

    switch (this.mode) {
      case 'cab': {
        // subtle cab motion: lateral sway on curves, vertical bounce with speed, surge with accel
        const t = performance.now() / 1000;
        const sway = (Math.sin(t * 1.7) * 0.006 + Math.sin(t * 3.9) * 0.003) * Math.min(1, speed / 20) * motion;
        const bounce = (Math.sin(t * 9.3) * 0.0025 + Math.sin(t * 15.1) * 0.0015) * Math.min(1, speed / 25) * motion;
        this.surge = damp(this.surge, -clamp(train.a, -1.2, 1.2) * 0.03 * motion, 3, dt);
        const lat = (train.lateralAcc || 0) * 0.012 * motion;
        const eye = CAB.eye.clone().add(new THREE.Vector3(sway + lat, bounce, this.surge));
        targetPos.copy(eye).applyMatrix4(loco);
        const base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(loco));
        // camera looks along -z: rotate so it faces the loco's +z
        const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.pitch, Math.PI + this.look.yaw, 0, 'YXZ'));
        targetQuat.copy(base).multiply(look);
        fov = this.fov / this.zoom;
        break;
      }
      case 'headout': {
        const side = this.headoutSide;
        const eye = new THREE.Vector3(side * 1.78, 3.25, 8.6).applyMatrix4(loco);
        targetPos.copy(eye);
        const base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(loco));
        const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.pitch, Math.PI + this.look.yaw + side * 0.06, 0, 'YXZ'));
        targetQuat.copy(base).multiply(look);
        fov = this.fov / this.zoom;
        break;
      }
      case 'orbit':
      case 'chase': {
        const centre = this.mode === 'orbit' ? origin.clone().addScaledVector(up, 2.4) : origin.clone().addScaledVector(fwd, 12).addScaledVector(up, 2.5);
        const heading = Math.atan2(fwd.x, fwd.z);
        const yaw = this.mode === 'chase' ? heading + Math.PI + clamp(this.orbit.yaw - 2.4, -1.2, 1.2) * 0.5 : this.orbit.yaw + heading;
        const pitch = this.mode === 'chase' ? clamp(0.16 + (this.orbit.pitch - 0.18), 0.02, 1.0) : this.orbit.pitch;
        const d = this.orbit.dist * (this.mode === 'chase' ? 1.35 : 1);
        targetPos.set(centre.x + Math.sin(yaw) * Math.cos(pitch) * d, centre.y + Math.sin(pitch) * d, centre.z + Math.cos(yaw) * Math.cos(pitch) * d);
        this.clampGround(targetPos, 1.6);
        _m.lookAt(targetPos, centre, new THREE.Vector3(0, 1, 0));
        targetQuat.setFromRotationMatrix(_m);
        break;
      }
      case 'side': {
        const p = origin.clone().addScaledVector(left, train.dir > 0 ? 13 : -13).addScaledVector(up, 3.2).addScaledVector(fwd, -6);
        targetPos.copy(p);
        this.clampGround(targetPos, 1.2);
        const at = origin.clone().addScaledVector(up, 2.4).addScaledVector(fwd, -4);
        _m.lookAt(targetPos, at, new THREE.Vector3(0, 1, 0));
        targetQuat.setFromRotationMatrix(_m);
        break;
      }
      case 'front': {
        targetPos.copy(new THREE.Vector3(0, 1.5, train.vehicles[0].length / 2 + 0.9).applyMatrix4(loco));
        const base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(loco));
        const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.pitch * 0.5 - 0.02, Math.PI + this.look.yaw * 0.5, 0, 'YXZ'));
        targetQuat.copy(base).multiply(look);
        fov = 70 / this.zoom;
        break;
      }
      case 'rear': {
        const last = train.vehicles[train.vehicles.length - 1];
        renderer.vehicleMatrix(train, last, _m);
        targetPos.copy(new THREE.Vector3(0, 3.6, -last.length / 2 - 0.8).applyMatrix4(_m));
        const base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(_m));
        const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08 + this.look.pitch * 0.5, this.look.yaw * 0.5, 0, 'YXZ'));
        targetQuat.copy(base).multiply(look);
        fov = 64 / this.zoom;
        break;
      }
      case 'free': {
        const k = input;
        const fast = k && (k.rawDown('ShiftLeft') || k.rawDown('ShiftRight')) ? 60 : 14;
        const f = new THREE.Vector3(-Math.sin(this.free.yaw) * Math.cos(this.free.pitch), Math.sin(this.free.pitch), -Math.cos(this.free.yaw) * Math.cos(this.free.pitch));
        const r = new THREE.Vector3(Math.cos(this.free.yaw), 0, -Math.sin(this.free.yaw));
        if (k) {
          if (k.rawDown('KeyW') || k.rawDown('ArrowUp')) this.free.pos.addScaledVector(f, fast * dt);
          if (k.rawDown('KeyS') || k.rawDown('ArrowDown')) this.free.pos.addScaledVector(f, -fast * dt);
          if (k.rawDown('KeyD') || k.rawDown('ArrowRight')) this.free.pos.addScaledVector(r, fast * dt);
          if (k.rawDown('KeyA') || k.rawDown('ArrowLeft')) this.free.pos.addScaledVector(r, -fast * dt);
          if (k.rawDown('KeyE') || k.rawDown('PageUp')) this.free.pos.y += fast * dt;
          if (k.rawDown('KeyQ') || k.rawDown('PageDown')) this.free.pos.y -= fast * dt;
        }
        this.clampGround(this.free.pos, 0.8);
        targetPos.copy(this.free.pos);
        targetQuat.setFromEuler(new THREE.Euler(this.free.pitch, this.free.yaw, 0, 'YXZ'));
        fov = this.fov / this.zoom;
        break;
      }
      case 'trackside': {
        const geo = world.geo;
        const ts = this.trackside;
        const ahead = (s) => (s - train.s) * train.dir;
        if (!ts || ahead(ts.s) < -train.length - 120 || ahead(ts.s) > 1600) {
          const s = train.s + train.dir * (260 + Math.min(500, speed * 14));
          const g = geo.sample(Math.max(5, Math.min(geo.length - 5, s)));
          const side = Math.random() < 0.5 ? -1 : 1;
          const lat = side * (14 + Math.random() * 10);
          const pos = new THREE.Vector3(g.x + g.nx * lat, 0, g.z + g.nz * lat);
          pos.y = (this.sampler ? this.sampler.height(pos.x, pos.z) : g.y) + 1.7 + Math.random() * 2;
          this.trackside = { s, pos };
        }
        targetPos.copy(this.trackside.pos);
        const at = origin.clone().addScaledVector(up, 2.2);
        _m.lookAt(targetPos, at, new THREE.Vector3(0, 1, 0));
        targetQuat.setFromRotationMatrix(_m);
        const dist = targetPos.distanceTo(at);
        fov = clamp(1400 / Math.max(dist, 1), 18, 70);
        break;
      }
      default:
        break;
    }
    // blending between modes
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.7);
      const t = this.blend * this.blend * (3 - 2 * this.blend);
      cam.position.copy(this.fromPos).lerp(targetPos, t);
      cam.quaternion.copy(this.fromQuat).slerp(targetQuat, t);
    } else {
      cam.position.copy(targetPos);
      cam.quaternion.copy(targetQuat);
    }
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = damp(cam.fov, fov, 10, dt);
      cam.updateProjectionMatrix();
    }
    cam.near = this.mode === 'cab' || this.mode === 'headout' ? 0.05 : 0.3;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  clampGround(p, min) {
    if (!this.sampler) return;
    const h = this.sampler.height(p.x, p.z);
    if (p.y < h + min) p.y = h + min;
  }

  get isInterior() {
    return this.mode === 'cab';
  }
}
