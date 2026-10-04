'use strict';
// Player truck: tractor + trailer meshes, interior, drivetrain and articulated kinematics.
// Tractor origin = rear axle centre on the ground, +Z forward, +X left.
G.Vehicle = (() => {
  const U = G.U;
  const WB = 3.8, WR = 0.52, FW = 0.35, FD = 2.85, GRAV = 9.81;
  const TRAILER_LT = 9.21; // kingpin to axle-group centre

  // ------------------------------------------------------------------ shared materials
  function makeMats(paint) {
    const m = {
      paint: new THREE.MeshStandardMaterial({ color: paint, roughness: 0.28, metalness: 0.35 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xd7dce1, roughness: 0.12, metalness: 1 }),
      alu: new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.3, metalness: 0.85 }),
      plastic: new THREE.MeshStandardMaterial({ color: 0x232629, roughness: 0.75 }),
      chassis: new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.7, metalness: 0.3 }),
      tyre: new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.92 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.3, metalness: 0.8 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x0f161b, roughness: 0.05, metalness: 0.7 }),
      interior: new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.85 }),
      interiorLight: new THREE.MeshStandardMaterial({ color: 0x6b6f75, roughness: 0.8 }),
      fabric: new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 1 }),
      head: new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.15, metalness: 0.4 }),
      tail: new THREE.MeshStandardMaterial({ color: 0x5a0a0a, emissive: 0xff1a10, emissiveIntensity: 0, roughness: 0.3 }),
      reverse: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3 }),
      indL: new THREE.MeshStandardMaterial({ color: 0x6a4a10, emissive: 0xff9a10, emissiveIntensity: 0, roughness: 0.3 }),
      indR: new THREE.MeshStandardMaterial({ color: 0x6a4a10, emissive: 0xff9a10, emissiveIntensity: 0, roughness: 0.3 }),
      marker: new THREE.MeshStandardMaterial({ color: 0x6a4a10, emissive: 0xffa020, emissiveIntensity: 0, roughness: 0.3 }),
      beacon: new THREE.MeshStandardMaterial({ color: 0x8a5a10, emissive: 0xffa020, emissiveIntensity: 0, roughness: 0.3, transparent: true, opacity: 0.9 }),
      dash: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    };
    return m;
  }

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function add(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    parent.add(m);
    return m;
  }
  function wheel(mats, r, w, dual) {
    const g = new THREE.Group();
    const tyre = new THREE.CylinderGeometry(r, r, w, 28);
    tyre.rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 20);
    rim.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(r * 0.22, r * 0.26, w + 0.08, 10);
    hub.rotateZ(Math.PI / 2);
    const offs = dual ? [-w / 2 - 0.01, w / 2 + 0.01] : [0];
    for (const o of offs) {
      add(g, tyre, mats.tyre, o, 0, 0);
      add(g, rim, mats.rim, o, 0, 0, 0, 0, 0, false);
    }
    add(g, hub, mats.chrome, 0, 0, 0, 0, 0, 0, false);
    // lug pattern so rotation is visible
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      add(g, box(w + (dual ? w : 0) + 0.06, 0.05, 0.05), mats.plastic, 0, Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, 0, 0, 0, false);
    }
    return g;
  }

  function badgeTexture(text) {
    const c = U.canvas(256, 64), x = c.getContext('2d');
    x.fillStyle = '#1b1d20'; x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#d9dde2'; x.font = 'bold 44px "Barlow Condensed", Arial Narrow, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 34);
    return U.tex(c, { clamp: true });
  }
  function grilleTexture() {
    const c = U.canvas(256, 128), x = c.getContext('2d');
    x.fillStyle = '#121416'; x.fillRect(0, 0, 256, 128);
    for (let y = 6; y < 128; y += 14) {
      const g = x.createLinearGradient(0, y, 0, y + 7);
      g.addColorStop(0, '#9aa1a8'); g.addColorStop(1, '#3a3f44');
      x.fillStyle = g; x.fillRect(8, y, 240, 6);
    }
    return U.tex(c, { clamp: true });
  }

  // ------------------------------------------------------------------ tractor model
  function buildTractor(opts) {
    const mats = makeMats(opts.paint);
    const root = new THREE.Group();
    const chassis = new THREE.Group(); root.add(chassis);
    const cab = new THREE.Group(); cab.position.set(0, 1.25, 3.05); chassis.add(cab); // cab pivot (cab suspension)
    const P = {};

    // frame rails, crossmembers
    for (const sx of [-0.43, 0.43]) add(chassis, box(0.1, 0.3, 6.3), mats.chassis, sx, 1.0, 1.85);
    for (const z of [-1.0, 0.9, 2.4, 4.4]) add(chassis, box(0.86, 0.12, 0.12), mats.chassis, 0, 0.95, z);
    // fifth wheel
    add(chassis, new THREE.CylinderGeometry(0.48, 0.5, 0.1, 24), mats.chassis, 0, 1.2, FW);
    add(chassis, box(1.0, 0.12, 0.7), mats.chassis, 0, 1.12, FW);
    // rear mudguards + light bar
    for (const sx of [-1, 1]) {
      add(chassis, box(0.62, 0.05, 1.3), mats.plastic, sx * 0.98, 1.12, 0);
      add(chassis, box(0.62, 0.55, 0.05), mats.plastic, sx * 0.98, 0.85, -0.66);
      add(chassis, box(0.36, 0.14, 0.06), mats.tail, sx * 0.86, 0.95, -1.18, 0, 0, 0, false);
      add(chassis, box(0.12, 0.14, 0.06), mats[sx > 0 ? 'indL' : 'indR'], sx * 1.1, 0.95, -1.18, 0, 0, 0, false);
      add(chassis, box(0.1, 0.1, 0.06), mats.reverse, sx * 0.6, 0.95, -1.18, 0, 0, 0, false);
    }
    add(chassis, box(2.3, 0.12, 0.1), mats.chassis, 0, 0.95, -1.15);
    // fuel tank (left) + battery/air tanks (right)
    add(chassis, new THREE.CylinderGeometry(0.33, 0.33, 1.7, 20).rotateX(Math.PI / 2), mats.alu, 0.92, 0.82, 1.65);
    add(chassis, box(0.55, 0.55, 0.9), mats.plastic, -0.88, 0.85, 1.8);
    for (const z of [1.0, 2.6]) add(chassis, new THREE.CylinderGeometry(0.16, 0.16, 0.7, 12).rotateZ(Math.PI / 2), mats.alu, -0.85, 0.55, z);
    // side skirts between axles
    for (const sx of [-1, 1]) add(chassis, box(0.04, 0.4, 1.0), mats.paint, sx * 1.22, 0.75, 2.75);
    // air & electric coils behind cab
    for (const [sx, col] of [[-0.25, 0xc22b22], [0.0, 0xe2b81b], [0.25, 0x1d4fa3]]) {
      add(chassis, new THREE.TorusGeometry(0.22, 0.025, 6, 18), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }), sx, 1.95, 2.85, 0, Math.PI / 2, 0, false);
    }
    add(chassis, box(1.6, 0.06, 0.6), mats.chassis, 0, 1.25, 2.7);

    // cab body (local to cab pivot: x, y from cab floor (y=1.25 world), z from back of cab)
    const CW = 2.5, CH = 2.7, CD = 2.2;
    add(cab, box(CW, CH, CD), mats.paint, 0, CH / 2, CD / 2);
    // windscreen and side windows (exterior glass)
    add(cab, new THREE.PlaneGeometry(2.26, 1.05), mats.glass, 0, 1.62, CD + 0.012, -0.04, 0, 0, false);
    for (const sx of [-1, 1]) {
      add(cab, new THREE.PlaneGeometry(1.2, 0.95), mats.glass, sx * (CW / 2 + 0.006), 1.6, CD - 0.75, 0, sx * Math.PI / 2, 0, false);
      add(cab, new THREE.PlaneGeometry(0.4, 0.5), mats.glass, sx * (CW / 2 + 0.006), 1.35, CD - 1.6, 0, sx * Math.PI / 2, 0, false);
      // door handle + step
      add(cab, box(0.04, 0.05, 0.3), mats.chrome, sx * (CW / 2 + 0.02), 1.02, CD - 1.2, 0, 0, 0, false);
      add(chassis, box(0.45, 0.06, 0.6), mats.alu, sx * 1.05, 0.62, 4.5);
      add(chassis, box(0.45, 0.06, 0.6), mats.alu, sx * 1.05, 0.98, 4.45);
      // front mudguard
      add(chassis, box(0.5, 0.06, 1.2), mats.plastic, sx * 1.02, 1.12, WB);
    }
    // grille, badge, bumper, headlights
    const grille = new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.4, metalness: 0.5 });
    add(cab, new THREE.PlaneGeometry(1.7, 0.8), grille, 0, 0.62, CD + 0.012, 0, 0, 0, false);
    add(cab, new THREE.PlaneGeometry(0.62, 0.15), new THREE.MeshStandardMaterial({ map: badgeTexture('HAULER'), roughness: 0.3, metalness: 0.6 }), 0, 1.07, CD + 0.016, 0, 0, 0, false);
    add(chassis, box(2.5, 0.62, 0.32), mats.plastic, 0, 0.82, 5.32);
    add(chassis, box(2.3, 0.1, 0.36), mats.chassis, 0, 0.48, 5.3);
    P.heads = [];
    for (const sx of [-1, 1]) {
      add(chassis, box(0.5, 0.2, 0.06), mats.head, sx * 0.88, 1.0, 5.49, 0, 0, 0, false);
      add(chassis, box(0.16, 0.12, 0.06), mats[sx > 0 ? 'indL' : 'indR'], sx * 1.18, 1.0, 5.47, 0, 0, 0, false);
      add(chassis, box(0.3, 0.08, 0.05), mats.head, sx * 0.85, 0.66, 5.49, 0, 0, 0, false);
      // side repeater
      add(cab, box(0.03, 0.06, 0.16), mats[sx > 0 ? 'indL' : 'indR'], sx * (CW / 2 + 0.02), 0.25, CD - 0.25, 0, 0, 0, false);
    }
    // sun visor + roof marker lights
    add(cab, box(2.4, 0.08, 0.35), mats.paint, 0, 2.3, CD + 0.15, 0.25, 0, 0);
    for (let k = -2; k <= 2; k++) add(cab, box(0.12, 0.06, 0.06), mats.marker, k * 0.35, 2.38, CD + 0.32, 0, 0, 0, false);
    // roof spoiler/air deflector edge
    add(cab, box(2.5, 0.12, 0.8), mats.paint, 0, CH + 0.05, CD - 0.6);
    // mirrors
    P.mirrors = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * (CW / 2 + 0.3), 1.35, CD + 0.12);
      cab.add(g);
      for (const yy of [0.25, -0.3]) add(g, box(0.05, 0.05, 0.5), mats.plastic, -sx * 0.22, yy, -0.25, 0, -sx * 0.55, 0, false);
      add(g, box(0.3, 0.72, 0.12), mats.plastic, 0, 0, 0);
      add(g, box(0.26, 0.28, 0.1), mats.plastic, 0, -0.52, 0);
      const glass = add(g, new THREE.PlaneGeometry(0.25, 0.66), mats.glass, 0, 0, -0.065, 0, Math.PI, 0, false);
      g.rotation.y = sx * 0.12;
      P.mirrors.push({ group: g, glass, side: sx });
    }
    // extras: light bar + beacons
    P.lightbar = new THREE.Group();
    add(P.lightbar, box(1.9, 0.12, 0.12), mats.chrome, 0, 0, 0);
    for (let k = 0; k < 4; k++) add(P.lightbar, new THREE.CylinderGeometry(0.11, 0.11, 0.1, 16).rotateX(Math.PI / 2), mats.head, -0.75 + k * 0.5, 0.14, 0.03, 0, 0, 0, false);
    P.lightbar.position.set(0, CH + 0.18, CD - 0.1);
    cab.add(P.lightbar);
    P.beacons = new THREE.Group();
    for (const sx of [-0.85, 0.85]) add(P.beacons, new THREE.CylinderGeometry(0.09, 0.11, 0.2, 14), mats.beacon, sx, 0, 0, 0, 0, 0, false);
    P.beacons.position.set(0, CH + 0.22, CD - 0.9);
    cab.add(P.beacons);

    // wheels
    P.wheelsF = []; P.wheelsR = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 1.03, WR, WB);
      const w = wheel(mats, WR, 0.32, false);
      pivot.add(w);
      chassis.add(pivot);
      P.wheelsF.push({ pivot, w });
      const r = wheel(mats, WR, 0.28, true);
      r.position.set(sx * 0.97, WR, 0);
      chassis.add(r);
      P.wheelsR.push(r);
    }

    // ---------------- interior (driver sits on the left, +X)
    const inter = new THREE.Group();
    cab.add(inter);
    const ix = 0.55; // driver lateral position
    // eye at (ix, 1.62, 1.15): gauges sit ~25 degrees below the line of sight, road visible from ~13 m ahead
    add(inter, box(2.36, 0.5, 0.62), mats.interior, 0, 0.82, CD - 0.31, 0, 0, 0, false);
    add(inter, box(2.36, 0.07, 0.46), mats.interiorLight, 0, 1.1, CD - 0.25, -0.12, 0, 0, false);
    // driver binnacle: two cheeks + a visor over the gauges
    add(inter, box(0.84, 0.3, 0.36), mats.interior, ix, 1.18, CD - 0.24, 0, 0, 0, false);
    add(inter, box(0.8, 0.04, 0.2), mats.interior, ix, 1.47, CD - 0.3, -0.3, 0, 0, false);
    for (const sx of [-0.4, 0.4]) add(inter, box(0.04, 0.2, 0.22), mats.interior, ix + sx, 1.38, CD - 0.3, 0, 0, 0, false);
    // gauge screen (canvas texture updated by the HUD)
    const gc = U.canvas(510, 170);
    const gtex = U.tex(gc, { clamp: true });
    P.gaugeCanvas = gc; P.gaugeTex = gtex;
    const gaugeMat = new THREE.MeshBasicMaterial({ map: gtex, toneMapped: false });
    add(inter, new THREE.PlaneGeometry(0.66, 0.22), gaugeMat, ix, 1.35, CD - 0.39, 0, 0, 0, false).rotation.set(0.38, Math.PI, 0, 'YXZ');
    // centre stack with the navigation screen
    add(inter, box(0.5, 0.42, 0.3), mats.interior, -0.15, 1.08, CD - 0.42, -0.3, 0, 0, false);
    const nc = U.canvas(256, 160), ntex = U.tex(nc, { clamp: true });
    P.navCanvas = nc; P.navTex = ntex;
    add(inter, new THREE.PlaneGeometry(0.38, 0.24), new THREE.MeshBasicMaterial({ map: ntex, toneMapped: false }), -0.15, 1.2, CD - 0.575, 0, 0, 0, false).rotation.set(0.4, Math.PI, 0, 'YXZ');
    // steering wheel (flat, bus-like truck wheel)
    const sw = new THREE.Group();
    sw.position.set(ix, 1.13, CD - 0.62);
    sw.rotation.set(-0.85, Math.PI, 0, 'YXZ');
    inter.add(sw);
    const swInner = new THREE.Group();
    sw.add(swInner);
    add(swInner, new THREE.TorusGeometry(0.24, 0.026, 10, 40), mats.plastic, 0, 0, 0, 0, 0, 0, false);
    add(swInner, new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16).rotateX(Math.PI / 2), mats.plastic, 0, 0, 0, 0, 0, 0, false);
    add(swInner, new THREE.PlaneGeometry(0.1, 0.035), new THREE.MeshBasicMaterial({ color: 0xb8bcc2 }), 0, 0.02, 0.03, 0, 0, 0, false);
    for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI]) add(swInner, box(0.035, 0.18, 0.02), mats.plastic, Math.sin(a) * 0.12, -Math.cos(a) * 0.12, 0, 0, 0, -a, false);
    add(inter, new THREE.CylinderGeometry(0.045, 0.06, 0.55, 10), mats.plastic, ix, 0.92, CD - 0.42, -0.72, 0, 0, false);
    P.steeringWheel = swInner;
    // pillars, roof liner, doors, rear wall
    for (const sx of [-1, 1]) {
      add(inter, box(0.09, 1.12, 0.08), mats.interior, sx * 1.17, 1.63, CD - 0.07, 0.02, 0, sx * 0.04, false);
      add(inter, box(0.06, 0.92, 2.1), mats.interiorLight, sx * 1.2, 0.58, CD - 1.05, 0, 0, 0, false);
      add(inter, box(0.12, 0.08, 2.1), mats.interior, sx * 1.17, 1.06, CD - 1.05, 0, 0, 0, false);
      add(inter, box(0.1, 1.1, 0.1), mats.interior, sx * 1.18, 1.62, CD - 1.5, 0, 0, 0, false);
    }
    add(inter, box(2.36, 0.1, 2.1), mats.fabric, 0, 2.42, CD / 2, 0, 0, 0, false);
    add(inter, box(2.3, 0.26, 0.14), mats.interior, 0, 2.25, CD - 0.06, 0, 0, 0, false); // header above windscreen
    add(inter, box(2.36, 2.5, 0.06), mats.fabric, 0, 1.25, 0.06, 0, 0, 0, false);
    add(inter, box(2.36, 0.06, 2.1), mats.interior, 0, 0.03, CD / 2, 0, 0, 0, false);
    // sun visors (inside)
    for (const sx of [-1, 1]) add(inter, box(0.8, 0.03, 0.26), mats.interiorLight, sx * 0.55, 2.1, CD - 0.22, 0.45, 0, 0, false);
    // seats
    for (const sx of [-1, 1]) {
      add(inter, box(0.55, 0.12, 0.55), mats.fabric, sx * 0.55, 0.62, CD - 1.4, 0, 0, 0, false);
      add(inter, box(0.55, 0.85, 0.12), mats.fabric, sx * 0.55, 1.05, CD - 1.72, -0.12, 0, 0, false);
    }
    // gear stalk + bunk curtain
    add(inter, box(0.03, 0.03, 0.18), mats.plastic, ix - 0.25, 1.02, CD - 0.75, 0, 0, 0, false);
    // wipers (pivot at the base of the windscreen)
    P.wipers = [];
    for (const sx of [0.62, -0.42]) {
      const wp = new THREE.Group();
      wp.position.set(sx, 1.12, CD + 0.03);
      add(wp, box(0.025, 0.9, 0.02), mats.plastic, 0, 0.45, 0, 0, 0, 0, false);
      wp.rotation.z = 1.35;
      cab.add(wp);
      P.wipers.push(wp);
    }
    // camera anchor for cabin view (driver's eyes)
    P.eye = new THREE.Object3D();
    P.eye.position.set(ix, 1.62, CD - 1.05);
    cab.add(P.eye);
    P.interior = inter;

    // ---------------- lights that actually illuminate
    P.spots = [];
    for (const sx of [-1, 1]) {
      const s = new THREE.SpotLight(0xfff4e0, 0, 240, 0.42, 0.6, 1.0);
      s.position.set(sx * 0.88, 1.0, 5.5);
      s.target.position.set(sx * 1.5, -0.8, 60);
      chassis.add(s, s.target);
      P.spots.push(s);
    }
    // interior/dash glow so the cockpit isn't pitch black at night
    P.dashLight = new THREE.PointLight(0xffc89a, 0, 2.2, 2);
    P.dashLight.position.set(ix, 1.2, CD - 0.8);
    cab.add(P.dashLight);

    root.userData = { mats, P, chassis, cab };
    return { root, mats, P, chassis, cab };
  }

  // ------------------------------------------------------------------ trailer models
  function corrugated(color, w = 512, h = 128, logoCompany) {
    const c = U.canvas(w, h), x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 8) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(i, 0, 3, h); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(i + 4, 0, 2, h); }
    if (logoCompany) {
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = `bold ${h * 0.3}px "Barlow Condensed", Arial Narrow, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(logoCompany.toUpperCase(), w / 2, h / 2, w * 0.9);
    }
    return U.tex(c, { clamp: true });
  }
  function sideTexture(company, base) {
    const w = 1024, h = 220, c = U.canvas(w, h), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    // panel seams
    for (let i = 0; i < w; i += 64) { x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(i, 0, 2, h); }
    x.fillStyle = company.color; x.fillRect(0, h - 34, w, 22);
    x.beginPath(); x.arc(160, 92, 54, 0, Math.PI * 2); x.fill();
    x.fillStyle = base; x.font = 'bold 66px "Barlow Condensed", Arial Narrow, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(company.name[0], 160, 96);
    x.fillStyle = company.color; x.textAlign = 'left'; x.font = 'bold 76px "Barlow Condensed", Arial Narrow, sans-serif';
    x.fillText(company.name.toUpperCase(), 240, 96, w - 280);
    // reflective contour marking
    for (let i = 0; i < w; i += 40) { x.fillStyle = i % 80 ? '#e8e8e8' : '#c4161c'; x.fillRect(i, h - 10, 36, 8); }
    return U.tex(c, { clamp: true });
  }
  function adrTexture(code) {
    const c = U.canvas(128, 96), x = c.getContext('2d');
    x.fillStyle = '#f07a00'; x.fillRect(0, 0, 128, 96);
    x.strokeStyle = '#111'; x.lineWidth = 5; x.strokeRect(3, 3, 122, 90);
    x.beginPath(); x.moveTo(3, 48); x.lineTo(125, 48); x.stroke();
    x.fillStyle = '#111'; x.font = 'bold 34px "Share Tech Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(code[0], 64, 27); x.fillText(code[1], 64, 72);
    return U.tex(c, { clamp: true });
  }

  function buildTrailer(spec) {
    // spec: { kind, company, cargoKey, adr }
    const mats = makeMats('#d9dcdf');
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const L = 13.6, FRONT = 1.25, REAR = FRONT - L, CX = (FRONT + REAR) / 2;
    const company = spec.company || { name: 'Hauler', color: '#1d4fa3' };
    // chassis + landing gear + underrun
    for (const sx of [-0.45, 0.45]) add(body, box(0.12, 0.32, L - 0.6), mats.chassis, sx, 1.0, CX - 0.2);
    const legs = new THREE.Group(); body.add(legs);
    for (const sx of [-0.9, 0.9]) {
      add(legs, box(0.12, 1.2, 0.12), mats.chassis, sx, 0.75, -0.7);
      add(legs, box(0.3, 0.05, 0.3), mats.chassis, sx, 0.17, -0.7);
    }
    add(body, box(2.4, 0.15, 0.15), mats.chassis, 0, 0.55, REAR + 0.35);
    for (const sx of [-1, 1]) add(body, box(0.05, 0.3, 4.5), mats.alu, sx * 1.2, 0.75, -4.6);
    // tail lights + plate
    for (const sx of [-1, 1]) {
      add(body, box(0.42, 0.16, 0.06), mats.tail, sx * 0.9, 0.85, REAR + 0.02, 0, 0, 0, false);
      add(body, box(0.12, 0.16, 0.06), mats[sx > 0 ? 'indL' : 'indR'], sx * 1.18, 0.85, REAR + 0.02, 0, 0, 0, false);
      add(body, box(0.12, 0.1, 0.06), mats.reverse, sx * 0.6, 0.85, REAR + 0.02, 0, 0, 0, false);
      for (let k = 0; k < 4; k++) add(body, box(0.03, 0.06, 0.08), mats.marker, sx * 1.27, 1.15, -1 - k * 3.4, 0, 0, 0, false);
    }
    // wheels on three axles
    const wheels = [];
    for (const z of [-7.9, -9.21, -10.52]) for (const sx of [-1, 1]) {
      const w = wheel(mats, 0.5, 0.36, false);
      w.position.set(sx * 0.98, 0.5, z);
      body.add(w);
      wheels.push(w);
      add(body, box(0.5, 0.05, 1.05), mats.plastic, sx * 0.98, 1.08, z);
    }
    let topY = 4.0;
    const kind = spec.kind;
    if (kind === 'box' || kind === 'reefer') {
      const base = kind === 'reefer' ? '#eef0f0' : '#f1f1ee';
      const side = new THREE.MeshStandardMaterial({ map: sideTexture(company, base), roughness: 0.55 });
      const plain = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55 });
      const rearT = corrugated('#cfd2d4', 256, 256);
      const rear = new THREE.MeshStandardMaterial({ map: rearT, roughness: 0.5, metalness: 0.2 });
      const b = new THREE.Mesh(box(2.55, 2.8, L), [side, side, plain, plain, plain, rear]);
      // flip the right side so text reads correctly
      b.position.set(0, 1.25 + 1.4, CX);
      b.castShadow = true; b.receiveShadow = true;
      body.add(b);
      if (kind === 'reefer') {
        add(body, box(2.0, 1.5, 0.45), mats.plastic, 0, 3.0, FRONT + 0.22);
        add(body, box(1.6, 1.1, 0.02), new THREE.MeshStandardMaterial({ map: corrugated('#3a3d40', 128, 128), roughness: 0.6 }), 0, 3.0, FRONT + 0.46, 0, 0, 0, false);
      }
      // rear door hardware
      for (const sx of [-0.62, -0.2, 0.2, 0.62]) add(body, box(0.04, 2.6, 0.05), mats.alu, sx, 2.65, REAR - 0.02, 0, 0, 0, false);
    } else if (kind === 'tanker') {
      const tankMat = spec.cargoKey === 'grain' ? new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.35, metalness: 0.6 }) : mats.chrome;
      add(body, new THREE.CylinderGeometry(1.18, 1.18, L - 1.0, 32).rotateX(Math.PI / 2), tankMat, 0, 2.45, CX);
      for (const z of [FRONT - 0.5, REAR + 0.5]) add(body, new THREE.SphereGeometry(1.18, 24, 12), tankMat, 0, 2.45, z, 0, 0, 0).scale.set(1, 1, 0.25);
      add(body, box(0.6, 0.08, L - 2), mats.alu, 0, 3.66, CX);
      add(body, box(0.5, 1.6, 0.06), mats.alu, 0.7, 2.6, REAR + 0.1);
      for (let k = 0; k < 4; k++) add(body, new THREE.CylinderGeometry(0.28, 0.28, 0.12, 16), mats.alu, 0, 3.63, FRONT - 2 - k * 3);
      add(body, box(2.3, 0.2, L - 1.2), mats.chassis, 0, 1.3, CX);
      topY = 3.7;
      // company band
      const band = new THREE.MeshStandardMaterial({ color: company.color, roughness: 0.4 });
      add(body, new THREE.CylinderGeometry(1.19, 1.19, 0.4, 32, 1, true).rotateX(Math.PI / 2), band, 0, 2.45, CX);
    } else {
      // flatbed family
      add(body, box(2.5, 0.22, L), new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.9 }), 0, 1.36, CX);
      add(body, box(2.55, 0.18, L), mats.chassis, 0, 1.18, CX);
      if (kind === 'logs') {
        for (let k = 0; k < 4; k++) for (const sx of [-1.2, 1.2]) add(body, box(0.1, 2.0, 0.1), mats.chassis, sx, 2.45, FRONT - 1.2 - k * 3.6);
        const logMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.95 });
        const endMat = new THREE.MeshStandardMaterial({ color: 0xc9a46c, roughness: 0.95 });
        for (let row = 0; row < 3; row++) for (let k = 0; k < 5 - row; k++) {
          const r = 0.26 + ((k * 7 + row * 3) % 4) * 0.025;
          add(body, new THREE.CylinderGeometry(r, r, L - 1.2, 10).rotateX(Math.PI / 2), [logMat, endMat, endMat], -0.95 + k * 0.48 + row * 0.24, 1.75 + row * 0.44, CX);
        }
        topY = 3.2;
      } else if (kind === 'coils') {
        const coil = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.85 });
        for (let k = 0; k < 3; k++) {
          add(body, new THREE.CylinderGeometry(0.85, 0.85, 1.5, 28).rotateZ(Math.PI / 2), coil, 0, 2.35, FRONT - 3.2 - k * 3.6);
          add(body, box(1.8, 0.3, 1.6), mats.chassis, 0, 1.6, FRONT - 3.2 - k * 3.6);
        }
        topY = 3.3;
      } else if (kind === 'container') {
        const ct = new THREE.MeshStandardMaterial({ map: corrugated(company.color, 1024, 256, company.name), roughness: 0.6, metalness: 0.3 });
        const plain = new THREE.MeshStandardMaterial({ map: corrugated(company.color, 256, 256), roughness: 0.6, metalness: 0.3 });
        const c = new THREE.Mesh(box(2.44, 2.59, 12.19), [ct, ct, plain, plain, plain, plain]);
        c.position.set(0, 1.5 + 1.3, CX);
        c.castShadow = true; c.receiveShadow = true;
        body.add(c);
        topY = 4.1;
      } else {
        // flatbed cargo variations
        if (spec.cargoKey === 'machinery') {
          const yel = new THREE.MeshStandardMaterial({ color: 0xe0a21a, roughness: 0.5 });
          add(body, box(2.3, 1.2, 6), yel, 0, 2.1, CX + 1);
          add(body, box(1.6, 1.4, 1.8), yel, 0.2, 3.3, CX + 2.4);
          add(body, box(1.4, 1.1, 0.06), mats.glass, 0.2, 3.4, CX + 3.31, 0, 0, 0, false);
          add(body, box(0.5, 0.5, 5), yel, -0.5, 3.0, CX - 2.5, 0.35, 0, 0);
          for (const sx of [-1, 1]) add(body, box(0.5, 0.7, 6.5), mats.chassis, sx * 0.95, 1.82, CX + 1);
          topY = 4.0;
        } else if (spec.cargoKey === 'lumber') {
          const wood = new THREE.MeshStandardMaterial({ color: 0xc8a372, roughness: 0.9 });
          for (let k = 0; k < 3; k++) for (const sx of [-0.62, 0.62]) add(body, box(1.15, 1.1, 4.2), wood, sx, 2.05, FRONT - 2.4 - k * 4.4);
          topY = 2.7;
        } else {
          const steel = new THREE.MeshStandardMaterial({ color: 0x6d737a, roughness: 0.5, metalness: 0.7 });
          for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) add(body, box(0.32, 0.36, L - 1), steel, -0.95 + k * 0.38, 1.66 + row * 0.38, CX);
          topY = 2.8;
        }
        // straps
        for (let k = 0; k < 5; k++) add(body, box(2.58, 0.04, 0.05), new THREE.MeshStandardMaterial({ color: 0xe0b020 }), 0, topY - 0.05, FRONT - 1.5 - k * 2.8, 0, 0, 0, false);
      }
    }
    if (spec.adr) {
      const codes = { 3: ['33', '1203'], 8: ['80', '1830'], 5: ['50', '2067'] }[spec.adr] || ['30', '1993'];
      const am = new THREE.MeshStandardMaterial({ map: adrTexture(codes), roughness: 0.5 });
      add(body, new THREE.PlaneGeometry(0.4, 0.3), am, 0, 1.45, REAR - 0.03, 0, Math.PI, 0, false);
    }
    return { root, body, mats, wheels, legs, topY };
  }

  // ------------------------------------------------------------------ physics
  function torqueCurve(rpm) {
    // normalised torque: plateau 1000-1400 rpm
    if (rpm < 600) return 0.55 * (rpm / 600);
    if (rpm < 1000) return 0.55 + 0.45 * ((rpm - 600) / 400);
    if (rpm < 1400) return 1;
    if (rpm < 2100) return 1 - 0.35 * ((rpm - 1400) / 700);
    return Math.max(0, 0.65 - (rpm - 2100) / 250);
  }

  function createTruck(scene, cfg) {
    const T = {
      x: 0, z: 0, h: 0, y: 0, v: 0, steer: 0, rpm: 0, gear: 0, shift: 0, shiftTo: 0, engineOn: false, starting: 0,
      fuel: 250, damage: 0, park: true, air: 4.5, retarder: 0, cruise: 0, lights: 0, high: false, indL: false, indR: false, hazard: false,
      wipers: 0, horn: false, trailer: null, odo: 0, accel: 0, yawRate: 0, pitch: 0, roll: 0, bodyRoll: 0, bodyRollV: 0, bodyPitch: 0, bodyPitchV: 0,
      wheelRot: 0, brake: 0, throttle: 0, slip: 0, surface: 'road', revTimer: 0, autoMode: true, lastShiftDir: 0, limiter: 90,
      wiperPhase: 0, offRoad: false, inWater: false, load: 0, engineBrake: 0, fuelRate: 0, stalled: false,
    };
    T.cfg = cfg;
    const model = buildTractor({ paint: cfg.paint });
    T.model = model;
    scene.add(model.root);
    T.mats = model.mats;
    T.applyConfig = (c) => {
      T.cfg = c;
      model.mats.paint.color.set(c.paint);
      model.P.lightbar.visible = !!c.lightbar;
      model.P.beacons.visible = !!c.beacons;
      T.gearbox = G.D.gearboxes.find((g) => g.id === c.gearbox) || G.D.gearboxes[0];
      T.engine = G.D.engines.find((e) => e.id === c.engine) || G.D.engines[0];
      T.tank = (G.D.tanks.find((t) => t.id === c.tank) || G.D.tanks[0]).litres;
      T.grip = (G.D.tyres.find((t) => t.id === c.tyres) || G.D.tyres[0]).grip;
      if (T.gear > T.gearbox.ratios.length) T.gear = T.gearbox.ratios.length;
      if (T.fuel > T.tank) T.fuel = T.tank;
    };
    T.applyConfig(cfg);

    T.mass = () => 8200 + (T.trailer ? T.trailer.empty + T.trailer.cargoKg : 0);
    T.obb = U.obb(0, 0, 0, 1.27, 3.33);
    T.updateObb = () => {
      const c = 2.08;
      U.setObb(T.obb, T.x + Math.sin(T.h) * c, T.z + Math.cos(T.h) * c, T.h, 1.27, 3.33);
      if (T.trailer) T.trailer.updateObb();
    };
    T.kingpin = () => ({ x: T.x + Math.sin(T.h) * FW, z: T.z + Math.cos(T.h) * FW });
    T.ratio = (g) => (g > 0 ? T.gearbox.ratios[g - 1] : g < 0 ? T.gearbox.rev[-g - 1] : 0);
    T.launchGear = () => {
      const r = T.gearbox.ratios;
      const m = T.mass();
      // pick the gear whose ratio is closest to what this weight needs to pull away
      const want = m > 32000 ? 14 : m > 20000 ? 11.5 : 9;
      let best = 1, bd = 1e9;
      r.forEach((x, i) => { const d = Math.abs(x - want); if (d < bd) { bd = d; best = i + 1; } });
      return best;
    };
    T.startEngine = () => {
      if (T.engineOn || T.starting > 0) { T.engineOn = false; T.starting = 0; return 'off'; }
      if (T.fuel <= 0) return 'nofuel';
      T.starting = 1.1; return 'start';
    };

    const tmpV = new THREE.Vector3();
    // one physics step. input: {steer -1..1 (+left), throttle 0..1, brake 0..1, steerAnalog}
    T.step = (dt, inp, world) => {
      const m = T.mass();
      const vAbs = Math.abs(T.v);
      // ---------- engine start / stop
      if (T.starting > 0) {
        T.starting -= dt;
        T.rpm = 160 + Math.sin(T.starting * 60) * 30;
        if (T.starting <= 0) { T.engineOn = true; T.rpm = 750; }
      }
      // ---------- air system
      if (T.engineOn) T.air = Math.min(8.5, T.air + dt * 0.55 * (T.rpm / 1200));
      if (inp.brake > 0.2) T.air = Math.max(0, T.air - dt * inp.brake * 0.12);
      const airOk = T.air > 5.2;
      // ---------- steering (speed sensitive, rate limited)
      const maxSteer = 0.62 / (1 + Math.pow(vAbs / 12, 2) * 0.85);
      const target = U.clamp(inp.steer, -1, 1) * maxSteer;
      const rate = inp.steerAnalog ? 6 : 1.25 + 0.6 / (1 + vAbs / 8);
      const ds = U.clamp(target - T.steer, -rate * dt, rate * dt);
      T.steer += inp.steerAnalog ? (target - T.steer) * Math.min(1, dt * 10) : ds;

      // ---------- pedal mapping (auto: S brakes, then selects reverse once stopped)
      let pedalT = inp.fwd, pedalB = inp.back;
      if (T.autoMode) {
        if (T.gear < 0) { pedalT = inp.back; pedalB = inp.fwd; }
        const wantFlip = T.gear >= 0 ? inp.back > 0.5 && inp.fwd < 0.1 : inp.fwd > 0.5 && inp.back < 0.1;
        if (vAbs < 0.25 && wantFlip && T.engineOn && T.shift <= 0) T.revTimer += dt; else T.revTimer = 0;
        if (T.revTimer > 0.4) { T.revTimer = 0; T.gear = T.gear >= 0 ? -1 : T.launchGear(); T.v = 0; }
        if (T.gear === 0 && pedalT > 0.05 && T.engineOn) T.gear = T.launchGear();
      }
      inp.throttle = pedalT; inp.brake = Math.max(pedalB, inp.handbrake ? 1 : 0);
      // ---------- throttle shaping: cruise + limiter
      let thr = inp.throttle;
      if (T.cruise > 0) {
        if (inp.brake > 0.05) T.cruise = 0;
        else {
          const err = T.cruise - T.v;
          thr = Math.max(thr, U.clamp(err * 0.6 + 0.25, 0, 1));
          if (err < -1.2 && T.retarder === 0) T.engineBrake = U.clamp(-err / 4, 0, 1); else T.engineBrake = 0;
        }
      } else T.engineBrake = 0;
      const kmh = vAbs * 3.6;
      if (T.gear > 0 && kmh > T.limiter - 1.5) thr *= U.clamp((T.limiter + 0.5 - kmh) / 2, 0, 1);
      if (!T.engineOn) thr = 0;
      T.throttle = thr;

      // ---------- drivetrain
      const nG = T.gearbox.ratios.length;
      if (T.shift > 0) {
        T.shift -= dt;
        if (T.shift <= 0) T.gear = T.shiftTo;
      }
      const ratio = T.ratio(T.gear);
      const tot = ratio * FD;
      const wheelRpm = (vAbs / WR) * 60 / (2 * Math.PI);
      const dirGear = Math.sign(T.gear);
      const movingWithGear = T.v * dirGear >= -0.05;
      const coupled = movingWithGear ? wheelRpm * tot : 0;
      const dmgK = T.damage > 0.3 ? 1 - (T.damage - 0.3) * 0.7 : 1;
      const peak = T.engine.nm * dmgK;
      let engT = 0, drive = 0;
      if (!T.engineOn) {
        if (T.starting <= 0) T.rpm = Math.max(0, T.rpm - dt * 900);
      } else if (T.gear === 0 || T.shift > 0) {
        const tgt = T.shift > 0 ? Math.max(650, coupled * (T.ratio(T.shiftTo) / Math.max(ratio, 0.01))) : 650 + thr * 1500;
        T.rpm = U.damp(T.rpm, Math.min(tgt, 2200), T.shift > 0 ? 9 : 5, dt);
        engT = 0;
      } else {
        if (coupled < 880) {
          // auto clutch slipping (pulling away / creeping)
          const tgtRpm = Math.max(650 + thr * 560, coupled);
          T.rpm = U.damp(T.rpm, tgtRpm, 6, dt);
          const creep = inp.brake < 0.05 && !T.park && thr < 0.05 ? 0.12 : 0;
          engT = peak * torqueCurve(T.rpm) * Math.max(thr, creep);
          T.slip = 1;
        } else {
          T.slip = 0;
          T.rpm = coupled;
          if (T.rpm > 2250) engT = -peak * 0.12;
          else if (thr > 0.01) engT = peak * torqueCurve(T.rpm) * thr;
          else {
            const drag = 0.06 + 0.06 * (T.rpm / 2000);
            const eb = (T.engineBrake + (!T.gearbox.retarder ? T.retarder / 3 : 0)) * 0.75 * U.clamp((T.rpm - 800) / 1100, 0, 1);
            engT = -peak * (drag + eb);
          }
        }
        drive = (engT * tot * 0.94) / WR * dirGear;
      }
      if (T.engineOn) T.rpm = Math.max(T.rpm, T.gear === 0 || T.shift > 0 || T.slip ? 600 : 0);
      T.load = engT > 0 ? engT / Math.max(1, peak) : 0;
      // fuel: BSFC ~ 0.24 L/kWh, scaled x12 so the tank matters on a compressed map
      const powerKW = Math.max(0, engT) * T.rpm * 2 * Math.PI / 60 / 1000;
      T.fuelRate = T.engineOn ? (powerKW * 0.24 / 3600 + 0.0007) * 12 : 0;
      T.fuel = Math.max(0, T.fuel - T.fuelRate * dt);
      if (T.fuel <= 0 && T.engineOn) { T.engineOn = false; T.stalled = true; }

      // ---------- auto gearbox
      if (T.autoMode && T.engineOn && T.shift <= 0 && T.gear > 0) {
        const rpm = T.rpm;
        const upAt = 1300 + 520 * thr;
        if (vAbs < 0.6 && T.gear > T.launchGear()) T.gear = T.launchGear();
        else if (T.gear < nG && !T.slip && rpm > upAt && thr > 0.02 || (T.gear < nG && rpm > 1950)) {
          let ng = T.gear + 1;
          for (let g = Math.min(nG, T.gear + 3); g > T.gear + 1; g--) if (coupled * (T.ratio(g) / ratio) > 1080 + 300 * thr) { ng = g; break; }
          if (coupled * (T.ratio(ng) / ratio) > 820) { T.shift = 0.42; T.shiftTo = ng; T.lastShiftDir = 1; }
        } else if (T.gear > 1 && (rpm < 900 && !T.slip || (thr > 0.85 && rpm < 1050 && vAbs > 3))) {
          let ng = T.gear - 1;
          while (ng > 1 && coupled * (T.ratio(ng) / ratio) < 1150) ng--;
          if (coupled * (T.ratio(ng) / ratio) < 1900) { T.shift = 0.38; T.shiftTo = ng; T.lastShiftDir = -1; }
        }
      }

      // ---------- longitudinal forces
      const surf = world.surface(T.x + Math.sin(T.h) * 1.9, T.z + Math.cos(T.h) * 1.9);
      T.surface = surf.kind;
      T.offRoad = surf.kind === 'grass' || surf.kind === 'gravel';
      const grip = surf.grip * T.grip * (1 - 0.3 * (G.env ? G.env.wet : 0) * (surf.kind === 'road' || surf.kind === 'yard' ? 1 : 0.4));
      const slope = Math.sin(T.pitchTotal || 0);
      const Fg = -m * GRAV * slope;
      let Fres = surf.roll * m * GRAV + 0.5 * 1.2 * (T.trailer ? 6.2 : 4.6) * T.v * T.v;
      const brakeMax = (airOk ? 0.62 : 0.25) * m * GRAV * Math.min(1, grip + 0.15);
      Fres += inp.brake * brakeMax;
      if (T.park || !airOk) Fres += 0.45 * m * GRAV;
      if (T.gearbox.retarder && T.retarder > 0) Fres += (T.retarder / 3) * 30000 * U.smoothstep(1.5, 9, vAbs);
      // traction limit on the drive axle
      const tracMax = grip * 0.85 * (7000 + (T.trailer ? (T.trailer.empty + T.trailer.cargoKg) * 0.3 : 0)) * GRAV;
      if (Math.abs(drive) > tracMax) { drive = Math.sign(drive) * tracMax; T.wheelspin = 1; } else T.wheelspin = 0;
      const mEff = m * 1.06;
      const Fnet = drive + Fg;
      const prevV = T.v;
      if (Math.abs(T.v) < 0.05) {
        if (Math.abs(Fnet) <= Fres) T.v = 0;
        else T.v += ((Fnet - Math.sign(Fnet) * Fres) / mEff) * dt;
      } else {
        T.v += ((Fnet - Math.sign(T.v) * Fres) / mEff) * dt;
        if (Math.sign(T.v) !== Math.sign(prevV) && Math.sign(Fnet) !== Math.sign(T.v)) T.v = 0;
      }
      if ((T.park || !airOk) && Math.abs(T.v) < 0.4) T.v = 0;
      T.accel = (T.v - prevV) / dt;
      T.brake = inp.brake;

      // ---------- lateral: curvature limited by grip (understeer)
      let k = Math.tan(T.steer) / WB;
      const latMax = grip * 0.78 * GRAV;
      if (T.v * T.v * Math.abs(k) > latMax) { k = Math.sign(k) * latMax / (T.v * T.v); T.slipping = true; } else T.slipping = false;
      T.yawRate = T.v * k;
      T.h = U.wrapAngle(T.h + T.yawRate * dt);
      T.x += Math.sin(T.h) * T.v * dt;
      T.z += Math.cos(T.h) * T.v * dt;
      T.odo += Math.abs(T.v) * dt;
      T.wheelRot += (T.v / WR) * dt;

      // ---------- trailer follows the kingpin
      if (T.trailer) {
        const tr = T.trailer;
        const kp = T.kingpin();
        let dx = kp.x - tr.x, dz = kp.z - tr.z;
        const l = Math.hypot(dx, dz) || 1;
        tr.x = kp.x - (dx / l) * TRAILER_LT;
        tr.z = kp.z - (dz / l) * TRAILER_LT;
        tr.h = Math.atan2(kp.x - tr.x, kp.z - tr.z);
        let art = U.wrapAngle(T.h - tr.h);
        const lim = 1.4;
        if (Math.abs(art) > lim) {
          art = Math.sign(art) * lim;
          tr.h = U.wrapAngle(T.h - art);
          tr.x = kp.x - Math.sin(tr.h) * TRAILER_LT;
          tr.z = kp.z - Math.cos(tr.h) * TRAILER_LT;
          T.jackknife = true;
        } else T.jackknife = false;
        tr.kx = kp.x; tr.kz = kp.z;
        tr.wheelRot += (T.v / 0.5) * dt;
      }
    };

    // visual pose + suspension, called once per frame
    T.pose = (dt, world) => {
      const s = Math.sin(T.h), c = Math.cos(T.h);
      const at = (lx, lz) => world.surface(T.x + lz * s + lx * c, T.z + lz * c - lx * s).h;
      const hRL = at(1.0, 0), hRR = at(-1.0, 0), hFL = at(1.0, WB), hFR = at(-1.0, WB);
      const yR = (hRL + hRR) / 2, yF = (hFL + hFR) / 2;
      const pitch = Math.atan2(yF - yR, WB);
      const roll = Math.atan2((hRL + hFL) - (hRR + hFR), 4.0);
      T.y = yR;
      T.pitch = pitch; T.roll = roll;
      T.pitchTotal = pitch;
      const surf = world.surface(T.x, T.z);
      T.inWater = surf.kind === 'water' && surf.h < -1.0;
      const root = model.root;
      root.position.set(T.x, T.y, T.z);
      root.rotation.set(-pitch, T.h, roll, 'YXZ');
      // cab suspension: roll from lateral g, pitch from longitudinal g
      const aLat = T.v * T.yawRate;
      const rough = T.offRoad ? (Math.random() - 0.5) * Math.min(1, Math.abs(T.v) / 8) * 0.02 : 0;
      const rTarget = U.clamp(aLat * 0.0075, -0.06, 0.06) + rough;
      const pTarget = U.clamp(-T.accel * 0.006, -0.04, 0.04);
      const om = 7, ze = 0.35;
      T.bodyRollV += (-om * om * (T.bodyRoll - rTarget) - 2 * ze * om * T.bodyRollV) * dt;
      T.bodyRoll += T.bodyRollV * dt;
      T.bodyPitchV += (-om * om * (T.bodyPitch - pTarget) - 2 * ze * om * T.bodyPitchV) * dt;
      T.bodyPitch += T.bodyPitchV * dt;
      model.cab.rotation.set(T.bodyPitch, 0, T.bodyRoll);
      // wheels
      for (const f of model.P.wheelsF) { f.pivot.rotation.y = T.steer; f.w.rotation.x = T.wheelRot; }
      for (const r of model.P.wheelsR) r.rotation.x = T.wheelRot;
      model.P.steeringWheel.rotation.z = -T.steer * 13;
      // wipers
      if (T.wipers > 0) T.wiperPhase += dt * (T.wipers === 1 ? 2.2 : 3.6);
      else if (Math.cos(T.wiperPhase) < 0.995) T.wiperPhase += dt * 2.2;
      else T.wiperPhase = 0;
      const wa = 1.35 - ((1 - Math.cos(T.wiperPhase)) / 2) * 1.55;
      for (const w of model.P.wipers) w.rotation.z = wa;

      if (T.trailer) {
        const tr = T.trailer;
        root.updateMatrixWorld(true);
        const kp = model.chassis.localToWorld(tmpV.set(0, 1.25, FW));
        const ts = Math.sin(tr.h), tc = Math.cos(tr.h);
        const aL = world.surface(tr.x + tc * 0.98, tr.z - ts * 0.98).h, aR = world.surface(tr.x - tc * 0.98, tr.z + ts * 0.98).h;
        const ay = (aL + aR) / 2;
        // kingpin plate sits ~1.25 m above the trailer's own ground reference
        const ky = kp.y - 1.25;
        const tp = Math.atan2(ky - ay, TRAILER_LT);
        tr.pitch = tp;
        tr.root.position.set(tr.kx, ky, tr.kz);
        tr.root.rotation.set(-tp, tr.h, Math.atan2(aL - aR, 2) * 0.6, 'YXZ');
        for (const w of tr.model.wheels) w.rotation.x = tr.wheelRot;
        tr.model.legs.position.y = 0.38;
        T.pitchTotal = (pitch + tp * 2) / 3;
      }
      // lights
      const M = model.mats, blink = (G.clock % 0.8) < 0.4;
      const lo = T.lights > 0;
      M.head.emissiveIntensity = lo ? (T.high ? 3 : 1.8) : 0;
      M.tail.emissiveIntensity = (lo ? 0.9 : 0.05) + (T.brake > 0.05 || (T.retarder > 0 && Math.abs(T.v) > 1) ? 3.2 : 0);
      M.reverse.emissiveIntensity = T.gear < 0 ? 2.5 : 0;
      const il = (T.indL || T.hazard) && blink, ir = (T.indR || T.hazard) && blink;
      M.indL.emissiveIntensity = il ? 3 : 0;
      M.indR.emissiveIntensity = ir ? 3 : 0;
      M.marker.emissiveIntensity = lo ? 1.6 : 0;
      M.beacon.emissiveIntensity = T.cfg.beacons && T.beaconsOn ? ((G.clock * 3) % 1 < 0.5 ? 4 : 0.3) : 0;
      const night = G.env ? G.env.night : 0;
      for (const sp of model.P.spots) {
        sp.intensity = lo ? (T.high ? 520 : 260) * (T.cfg.lightbar && T.high ? 1.35 : 1) : 0;
        sp.angle = T.high ? 0.5 : 0.42;
        sp.target.position.y = T.high ? 0.6 : -0.8;
      }
      model.P.dashLight.intensity = night * 0.07;
      if (T.trailer) {
        const tm = T.trailer.model.mats;
        tm.tail.emissiveIntensity = M.tail.emissiveIntensity;
        tm.indL.emissiveIntensity = M.indL.emissiveIntensity; tm.indR.emissiveIntensity = M.indR.emissiveIntensity;
        tm.reverse.emissiveIntensity = M.reverse.emissiveIntensity; tm.marker.emissiveIntensity = M.marker.emissiveIntensity;
      }
      T.updateObb();
    };
    return T;
  }

  // a trailer object that can sit in the world on its own or be pulled
  function createTrailer(scene, spec) {
    const model = buildTrailer(spec);
    scene.add(model.root);
    const tr = {
      spec, model, root: model.root, x: 0, z: 0, h: 0, kx: 0, kz: 0, wheelRot: 0, pitch: 0, damage: 0,
      empty: spec.kind === 'tanker' ? 7200 : spec.kind === 'reefer' ? 8200 : 6800, cargoKg: spec.cargoKg || 0,
    };
    tr.obb = U.obb(0, 0, 0, 1.28, 6.8);
    tr.updateObb = () => {
      const c = 1.25 - 6.8;
      U.setObb(tr.obb, tr.kx + Math.sin(tr.h) * c, tr.kz + Math.cos(tr.h) * c, tr.h, 1.28, 6.8);
    };
    // park the trailer: kingpin at (x,z) facing heading h
    tr.place = (x, z, h, world) => {
      tr.kx = x; tr.kz = z; tr.h = h;
      tr.x = x - Math.sin(h) * TRAILER_LT; tr.z = z - Math.cos(h) * TRAILER_LT;
      const ay = world.surface(tr.x, tr.z).h, ky = world.surface(x, z).h;
      model.root.position.set(x, ky, z);
      model.root.rotation.set(-Math.atan2(ky - ay, TRAILER_LT), h, 0, 'YXZ');
      model.legs.position.y = -0.08;
      tr.updateObb();
    };
    tr.dispose = () => {
      scene.remove(model.root);
      model.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    };
    return tr;
  }

  return { createTruck, createTrailer, buildTrailer, WB, WR, FW, TRAILER_LT, torqueCurve };
})();
