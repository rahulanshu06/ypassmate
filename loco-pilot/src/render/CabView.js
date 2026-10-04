import * as THREE from 'three';
import { GeoBatch, Prim } from './GeoBatch.js';
import { CabPanel, WindshieldRain } from './CabPanel.js';
import { FONTS } from './TextureGen.js';
import { clamp, lerp } from '../core/MathUtil.js';

// Cab interior in locomotive-local coordinates (+z = front, origin = loco centre at rail level).
export const CAB = {
  floor: 1.95, ceil: 4.02, back: 7.55, front: 10.12, halfW: 1.44,
  eye: new THREE.Vector3(0.64, 3.22, 8.72), // driver sits on the left (+x is the loco's left)
  winY0: 2.86, winY1: 3.83, slope: 0.21, // windscreen lean (rad)
};

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function add(batch, key, geo, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  batch.add(key, geo, _m, color ? _c.set(color) : null);
}

function labelTexture(text, w = 256, h = 64, bg = '#1b1d20', fg = '#e8e8e8') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.fillStyle = fg;
  x.font = `700 ${Math.round(h * 0.55)}px ${FONTS.latin}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Interactive first-person cab: desk with live instruments, master controller (TE/BE),
 * reverser, A9 / SA9 brake valves, switch panel, horn, emergency button, ceiling fan,
 * cab light, wipers and windscreen rain.
 */
export class CabView {
  constructor(theme) {
    this.group = new THREE.Group();
    this.group.name = 'cab';
    this.theme = theme;
    this.controls = []; // interactive meshes
    this.panel = new CabPanel(theme);
    this.rain = new WindshieldRain();
    this.wiperAngle = [0, 0];
    this.wiperDir = 1;
    this.wiperPhase = 0;
    this.fanAngle = 0;
    this.build();
  }

  build() {
    const T = this.theme;
    const b = new GeoBatch();
    const box = Prim.box();
    const { floor, ceil, back, front, halfW } = CAB;
    const wall = T.walls, desk = T.desk;
    // floor, ceiling, back wall with machine-room door
    add(b, 'cab', box, 0, floor - 0.03, (back + front) / 2, halfW * 2, 0.06, front - back, '#3c3f43');
    add(b, 'cab', box, 0, ceil + 0.03, (back + front) / 2, halfW * 2, 0.06, front - back + 0.2, '#d8dad6');
    add(b, 'cab', box, 0, (floor + ceil) / 2, back - 0.03, halfW * 2, ceil - floor, 0.06, wall);
    add(b, 'cab', box, 0, floor + 1.0, back + 0.01, 0.8, 1.95, 0.04, '#5d6469');
    add(b, 'cab', box, 0.3, floor + 1.0, back + 0.04, 0.05, 0.08, 0.06, '#c0c0c0');
    // side walls with window openings (z 8.45..9.65, y 2.85..3.62)
    for (const side of [-1, 1]) {
      const x = side * (halfW + 0.03);
      add(b, 'cab', box, x, (floor + 2.85) / 2, (back + front) / 2, 0.06, 2.85 - floor, front - back, wall);
      add(b, 'cab', box, x, (3.62 + ceil) / 2, (back + front) / 2, 0.06, ceil - 3.62, front - back, wall);
      add(b, 'cab', box, x, 3.235, (back + 8.45) / 2, 0.06, 0.77, 8.45 - back, wall);
      add(b, 'cab', box, x, 3.235, (9.65 + front) / 2, 0.06, 0.77, front - 9.65, wall);
      // window frame lip
      add(b, 'cab', box, x - side * 0.04, 2.84, 9.05, 0.1, 0.04, 1.24, '#2b2d30');
    }
    // front wall below the windscreen
    add(b, 'cab', box, 0, (floor + CAB.winY0) / 2, front + 0.02, halfW * 2, CAB.winY0 - floor, 0.06, wall);
    // windscreen frame (leaning back by CAB.slope about x)
    const frameZ = front - 0.05;
    const lean = (y) => frameZ - (y - CAB.winY0) * Math.tan(CAB.slope);
    const midY = (CAB.winY0 + CAB.winY1) / 2, h = (CAB.winY1 - CAB.winY0) / Math.cos(CAB.slope);
    add(b, 'cab', box, 0, midY, lean(midY), 0.16, h, 0.08, '#222427', -CAB.slope);
    for (const side of [-1, 1]) add(b, 'cab', box, side * 1.4, midY, lean(midY), 0.12, h, 0.08, '#222427', -CAB.slope);
    add(b, 'cab', box, 0, CAB.winY1 + 0.1, lean(CAB.winY1 + 0.1), halfW * 2, 0.22, 0.08, '#2a2c2f', -CAB.slope);
    add(b, 'cab', box, 0, CAB.winY0 - 0.02, lean(CAB.winY0), halfW * 2, 0.05, 0.12, '#1f2123');
    // sun visors
    for (const side of [-1, 1]) add(b, 'visor', box, side * 0.72, CAB.winY1 - 0.06, lean(CAB.winY1) - 0.12, 1.1, 0.012, 0.32, '#2c2a26', 0.35);
    // desk body
    add(b, 'cab', box, 0, (floor + 2.72) / 2, 9.66, halfW * 2 - 0.04, 2.72 - floor, 0.92, desk);
    add(b, 'cab', box, 0, 2.74, 9.62, halfW * 2 - 0.04, 0.04, 1.0, '#2a2d31');
    // console top lip near the glass
    add(b, 'cab', box, 0, 2.8, 10.02, halfW * 2 - 0.04, 0.1, 0.16, '#26282b');
    // driver seat
    add(b, 'seat', box, -0.66, 2.42, 8.55, 0.55, 0.12, 0.5, '#26323d');
    add(b, 'seat', box, -0.66, 2.85, 8.28, 0.52, 0.75, 0.1, '#26323d', -0.15);
    add(b, 'cab', Prim.cyl(10), -0.66, floor, 8.55, 0.12, 0.4, 0.12, '#444');
    add(b, 'seat', box, 0.66, 2.42, 8.55, 0.55, 0.12, 0.5, '#26323d');
    add(b, 'seat', box, 0.66, 2.85, 8.28, 0.52, 0.75, 0.1, '#26323d', -0.15);
    add(b, 'cab', Prim.cyl(10), 0.66, floor, 8.55, 0.12, 0.4, 0.12, '#444');
    // fire extinguisher, first-aid box, speed recorder
    add(b, 'cab', Prim.cyl(12), -1.3, floor, 7.75, 0.16, 0.6, 0.16, '#c62828');
    add(b, 'cab', box, 1.3, 3.2, 7.7, 0.22, 0.3, 0.12, '#f5f5f5');
    add(b, 'cab', box, 1.36, 3.21, 7.64, 0.04, 0.12, 0.04, '#c62828');
    add(b, 'cab', box, -1.25, 2.9, 9.0, 0.3, 0.36, 0.3, '#3a3d41');
    // ceiling light housing & fan mount
    add(b, 'cab', box, 0.55, ceil - 0.03, 8.4, 0.5, 0.05, 0.25, '#e6e6e6');
    add(b, 'cab', Prim.cyl(10), 0, ceil - 0.18, 8.75, 0.05, 0.18, 0.05, '#555');
    // co-pilot gauges recess
    add(b, 'cab', box, -0.66, 2.86, 9.76, 1.08, 0.4, 0.05, '#1a1c1f', Math.PI / 2 - 0.873);
    const mats = {
      cab: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.08 }),
      seat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
      visor: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, transparent: true, opacity: 0.85 }),
    };
    this.materials = mats;
    for (const mesh of b.build((k) => mats[k], this.group, { castShadow: false })) {
      mesh.receiveShadow = true;
      mesh.castShadow = true;
    }
    // ---------------------------------------------------------------- instrument panel (driver)
    const pmat = new THREE.MeshStandardMaterial({ map: this.panel.texture, emissiveMap: this.panel.texture, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.55 });
    this.panelMat = pmat;
    // panel rises at 50 deg from the desk top towards the windscreen
    const pw = 0.98, ph = 0.37, tilt = 0.873;
    const pc = new THREE.Vector3(0.62, 2.74 + Math.sin(tilt) * ph / 2, 9.6 + Math.cos(tilt) * ph / 2);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), pmat);
    panel.position.copy(pc);
    this.group.add(panel);
    this.panelMesh = panel;
    panel.lookAt(pc.clone().add(new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt))));
    // panel housing (slightly behind the face)
    const hb = new GeoBatch();
    const hc = pc.clone().add(new THREE.Vector3(0, -Math.cos(tilt) * 0.03, Math.sin(tilt) * 0.03));
    add(hb, 'cab', box, hc.x, hc.y, hc.z, pw + 0.08, ph + 0.06, 0.05, '#202225', Math.PI / 2 - tilt);
        hb.build((k) => mats[k], this.group);

    // ---------------------------------------------------------------- windscreen glass, rain layer
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe8ee, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.08, envMapIntensity: 0.6 });
    const rainMat = new THREE.MeshBasicMaterial({ map: this.rain.texture, transparent: true, opacity: 0, depthWrite: false });
    this.rainMat = rainMat;
    const rainGeo = new THREE.PlaneGeometry(2.7, h);
    // UVs already 0..1 across both panes
    const rainPlane = new THREE.Mesh(rainGeo, rainMat);
    rainPlane.position.set(0, midY, lean(midY) + 0.02);
    rainPlane.rotation.set(CAB.slope, Math.PI, 0, 'YXZ');
    rainPlane.renderOrder = 5;
    this.group.add(rainPlane);
    for (const side of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(1.24, h), glassMat);
      g.position.set(side * 0.72, midY, lean(midY) - 0.01);
      g.rotation.set(CAB.slope, Math.PI, 0, 'YXZ');
      g.renderOrder = 4;
      this.group.add(g);
    }
    // wipers (outside the glass)
    this.wipers = [];
    const wiperMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6, metalness: 0.4 });
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.72, CAB.winY0 + 0.02, lean(CAB.winY0) + 0.06);
      pivot.rotation.set(-CAB.slope, 0, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.85, 0.015), wiperMat);
      arm.geometry.translate(0, 0.425, 0);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.78, 0.02), wiperMat);
      blade.geometry.translate(0, 0.45, 0.012);
      const spin = new THREE.Group();
      spin.add(arm, blade);
      pivot.add(spin);
      this.group.add(pivot);
      this.wipers.push({ pivot, spin, side });
    }

    // ---------------------------------------------------------------- controls
    const ctrlMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.4, emissive: 0x000000 });
    // master controller (TE/BE)
    const mcBase = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.26), ctrlMat(0x2a2c30));
    mcBase.position.set(0.16, 2.79, 9.4);
    this.group.add(mcBase);
    this.mc = new THREE.Group();
    this.mc.position.set(0.16, 2.83, 9.4);
    const mcLever = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.2, 10), ctrlMat(0x8b9198));
    mcLever.geometry.translate(0, 0.1, 0);
    const mcKnob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), ctrlMat(0x1565c0));
    mcKnob.position.y = 0.21;
    this.mc.add(mcLever, mcKnob);
    this.group.add(this.mc);
    this.registerControl([mcBase, mcLever, mcKnob], 'mc', 'Master controller TE/BE — drag up/down (W/S)');
    // reverser
    this.rev = new THREE.Group();
    this.rev.position.set(-0.04, 2.8, 9.34);
    const revHandle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), ctrlMat(0xd4a017));
    revHandle.geometry.translate(0, 0.02, 0.05);
    this.rev.add(revHandle);
    this.group.add(this.rev);
    this.registerControl([revHandle], 'reverser', 'Reverser F / N / R — click (R / F keys)');
    // A9 automatic brake valve
    this.a9 = new THREE.Group();
    this.a9.position.set(1.14, 2.8, 9.34);
    const a9Body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 16), ctrlMat(0x3c4046));
    const a9Handle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.024, 0.26), ctrlMat(0xb0b4b8));
    a9Handle.geometry.translate(0, 0.07, 0.12);
    const a9Knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), ctrlMat(0x111111));
    a9Knob.position.set(0, 0.07, 0.25);
    this.a9Lever = new THREE.Group();
    this.a9Lever.add(a9Handle, a9Knob);
    this.a9.add(a9Body, this.a9Lever);
    this.group.add(this.a9);
    this.registerControl([a9Body, a9Handle, a9Knob], 'a9', 'A9 automatic train brake — drag (D apply / A release)');
    // SA9 independent brake
    this.sa9 = new THREE.Group();
    this.sa9.position.set(1.14, 2.8, 9.62);
    const sa9Body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.09, 16), ctrlMat(0x3c4046));
    const sa9Handle = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.02, 0.2), ctrlMat(0xb0b4b8));
    sa9Handle.geometry.translate(0, 0.06, 0.09);
    const sa9Knob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), ctrlMat(0xb71c1c));
    sa9Knob.position.set(0, 0.06, 0.19);
    this.sa9Lever = new THREE.Group();
    this.sa9Lever.add(sa9Handle, sa9Knob);
    this.sa9.add(sa9Body, this.sa9Lever);
    this.group.add(this.sa9);
    this.registerControl([sa9Body, sa9Handle, sa9Knob], 'sa9', 'SA9 loco (independent) brake — drag ([ / ])');
    // emergency mushroom & horn & VCD buttons
    const mkButton = (x, z, color, r, id, tip, labelText) => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.02, 16), ctrlMat(0x1b1c1e));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 0.035, 18), ctrlMat(color));
      cap.position.y = 0.025;
      g.add(base, cap);
      g.position.set(x, 2.77, z);
      this.group.add(g);
      this.registerControl([base, cap], id, tip);
      if (labelText) this.addLabel(labelText, x, 2.765, z - r - 0.04, 0.12, 0.03);
      return cap;
    };
    this.emBtn = mkButton(0.42, 9.3, 0xd32f2f, 0.04, 'emergency', 'EMERGENCY BRAKE (Space)', 'EMERG');
    this.hornBtn = mkButton(0.86, 9.3, 0xf9a825, 0.03, 'horn', 'Horn — hold (H high / J low)', 'HORN');
    this.vcdBtn = mkButton(0.64, 9.28, 0x1e88e5, 0.035, 'vcd', 'VCD acknowledge (Q)', 'VCD');
    // toggle switches row on the driver's desk, below the windscreen
    this.switches = {};
    const sw = [
      ['panto', 'PANTO', 'Pantograph raise/lower (O)'], ['vcb', 'VCB', 'Main circuit breaker (M)'], ['headlight', 'H/LIGHT', 'Headlight off/dim/bright (L)'],
      ['wiper', 'WIPER', 'Wipers off/slow/fast (V)'], ['cablight', 'CAB LT', 'Cab light (I)'], ['sander', 'SAND', 'Sander — hold (X)'],
    ];
    sw.forEach(([id, label, tip], i) => {
      const x = 1.0 - i * 0.12, z = 9.52;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.06), ctrlMat(0x1b1c1e));
      base.position.set(x, 2.77, z);
      const lever = new THREE.Group();
      lever.position.set(x, 2.78, z);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.06, 8), ctrlMat(0xd8d8d8));
      stick.geometry.translate(0, 0.03, 0);
      lever.add(stick);
      this.group.add(base, lever);
      this.registerControl([base, stick], id, tip);
      this.switches[id] = lever;
      this.addLabel(label, x, 2.765, z - 0.06, 0.12, 0.03);
    });
    // ceiling fan
    this.fan = new THREE.Group();
    this.fan.position.set(0, CAB.ceil - 0.2, 8.75);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xcfd2d4, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.01, 0.08), bladeMat);
      bl.position.x = 0.22;
      const holder = new THREE.Group();
      holder.rotation.y = (i / 3) * Math.PI * 2;
      holder.add(bl);
      this.fan.add(holder);
    }
    this.fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x8a8d90 })));
    this.group.add(this.fan);
    // cab light (point light)
    this.cabLight = new THREE.PointLight(0xfff1dc, 0, 5, 2);
    this.cabLight.position.set(0.3, CAB.ceil - 0.15, 8.5);
    this.group.add(this.cabLight);
    this.cabLightLens = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1dc, emissiveIntensity: 0 }));
    this.cabLightLens.position.set(0.55, CAB.ceil - 0.06, 8.4);
    this.group.add(this.cabLightLens);
    // co-pilot static gauges
    const cp = document.createElement('canvas');
    cp.width = 512;
    cp.height = 140;
    const cx = cp.getContext('2d');
    cx.fillStyle = '#1a1c1f';
    cx.fillRect(0, 0, 512, 140);
    cx.fillStyle = '#e8e8e8';
    cx.font = `700 22px ${FONTS.latin}`;
    cx.fillText('ASSISTANT LOCO PILOT', 20, 30);
    cx.font = `600 18px ${FONTS.latin}`;
    cx.fillText('Fire / Smoke detector: NORMAL', 20, 70);
    cx.fillText('Flasher: OFF     Hooter test: OK', 20, 100);
    const cpt = new THREE.CanvasTexture(cp);
    cpt.colorSpace = THREE.SRGBColorSpace;
    const cpMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.25), new THREE.MeshStandardMaterial({ map: cpt, emissiveMap: cpt, emissive: 0xffffff, emissiveIntensity: 0.15 }));
    cpMesh.position.set(-0.66, 2.74 + Math.sin(0.873) * 0.16, 9.6 + Math.cos(0.873) * 0.16);
    cpMesh.lookAt(cpMesh.position.clone().add(new THREE.Vector3(0, Math.cos(0.873), -Math.sin(0.873))));
    this.group.add(cpMesh);
    this.group.traverse((o) => {
      if (o.isMesh && o.castShadow === false) o.castShadow = true;
    });
  }

  addLabel(text, x, y, z, w, h) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: labelTexture(text), toneMapped: true }));
    m.position.set(x, y + 0.001, z);
    m.rotation.set(-Math.PI / 2, 0, Math.PI); // text reads left-to-right, top away from the driver
    this.group.add(m);
  }

  registerControl(meshes, id, tip) {
    for (const m of meshes) {
      m.userData.control = id;
      m.userData.tip = tip;
      this.controls.push(m);
    }
  }

  highlight(id) {
    if (this._hl === id) return;
    this._hl = id;
    for (const m of this.controls) {
      if (m.material && m.material.emissive) m.material.emissive.setHex(m.userData.control === id ? 0x2a3a4a : 0x000000);
    }
  }

  /** Animate controls & displays from the train state. */
  update(dt, train, extra) {
    const tr = train.traction, br = train.brakes;
    // master controller: -8..+10 -> -0.55..+0.75 rad
    const n = tr.notch;
    const mcTarget = n >= 0 ? (n / 10) * 0.75 : (n / 8) * 0.55;
    this.mc.rotation.x = lerp(this.mc.rotation.x, mcTarget, Math.min(1, dt * 14));
    this.rev.rotation.y = -tr.reverser * 0.55;
    const a9 = br.emergency ? 1.35 : br.a9 > 0.02 ? 0.25 + br.a9 * 0.85 : -0.25;
    this.a9Lever.rotation.y = lerp(this.a9Lever.rotation.y, -a9, Math.min(1, dt * 12));
    this.sa9Lever.rotation.y = lerp(this.sa9Lever.rotation.y, -(br.sa9 * 1.0 - 0.3), Math.min(1, dt * 12));
    const swState = {
      panto: tr.pantoCmd, vcb: tr.vcb, headlight: train.headlight > 0, wiper: train.wiper > 0, cablight: train.cabLight, sander: train.sander,
    };
    for (const [id, lever] of Object.entries(this.switches)) lever.rotation.x = swState[id] ? 0.45 : -0.45;
    this.hornBtn.position.y = 0.025 - (train.horn ? 0.012 : 0);
    this.emBtn.position.y = 0.025 - (br.emergency ? 0.015 : 0);
    // fan & light
    this.fanAngle += dt * (tr.auxOn ? 14 : 0);
    this.fan.rotation.y = this.fanAngle;
    this.cabLight.intensity = train.cabLight ? 2.2 : 0;
    this.cabLightLens.material.emissiveIntensity = train.cabLight ? 3 : 0;
    this.panelMat.emissiveIntensity = 0.12 + extra.night * 0.55;
    // wipers
    const speedW = train.wiper === 2 ? 4.2 : train.wiper === 1 ? 2.2 : 0;
    if (speedW > 0 || Math.abs(this.wiperPhase % Math.PI) > 0.05) {
      this.wiperPhase += dt * (speedW || 3);
      if (!speedW && Math.abs(Math.sin(this.wiperPhase)) < 0.06) this.wiperPhase = 0;
    }
    // parked lying along the bottom of the pane, sweeping up past vertical
    const sweep = (1 - Math.cos(this.wiperPhase)) / 2; // 0..1..0
    const ang = -1.45 + sweep * 1.75;
    for (const w of this.wipers) w.spin.rotation.z = ang * w.side;
    // rain on the windscreen
    const rain = extra.rain || 0;
    this.rainMat.opacity = clamp(rain * 3 + (this.rain.drops.length ? 0.6 : 0), 0, 1);
    this.rain.update(dt, extra.inTunnel ? 0 : rain, Math.abs(train.v) * 3.6, [
      { cx: 384, cy: 252, angle: ang, len: 235, prev: this._wp0 },
      { cx: 128, cy: 252, angle: -ang, len: 235, prev: this._wp1 },
    ].map((w, i) => {
      const key = i ? '_wp1' : '_wp0';
      const out = { ...w, prev: this[key] };
      this[key] = w.angle;
      return out;
    }));
    // instruments
    const s = extra.instruments;
    if (s) this.panel.update(dt, s);
  }
}
