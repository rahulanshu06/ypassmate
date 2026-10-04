'use strict';
// AI traffic: cars, vans, buses and articulated trucks that follow lanes, keep their distance (IDM),
// overtake on motorways, give way at roundabouts and react to the player.
G.Traffic = (() => {
  const U = G.U;
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const PAINT = 0xffffff, GLASS = 0x10161b, TYRE = 0x0d0d0e, TRIM = 0x26282b, CHROME = 0x9ea4aa;

  function wheels(parts, len, w, r, axles) {
    const g = new THREE.CylinderGeometry(r, r, 0.24, 14);
    g.rotateZ(Math.PI / 2);
    for (const z of axles) for (const sx of [-1, 1]) parts.push(U.part(g, TYRE, sx * (w / 2 - 0.12), r, z));
  }
  function carModel(kind) {
    const body = [], head = [], tail = [];
    let len, w, h;
    if (kind === 'sedan' || kind === 'hatch' || kind === 'suv' || kind === 'wagon') {
      len = { sedan: 4.75, hatch: 4.1, suv: 4.7, wagon: 4.85 }[kind];
      w = kind === 'suv' ? 1.92 : 1.8;
      const lowH = kind === 'suv' ? 0.85 : 0.62, base = kind === 'suv' ? 0.42 : 0.3;
      const cabH = kind === 'suv' ? 0.62 : 0.52;
      const cabLen = kind === 'hatch' ? len * 0.55 : kind === 'wagon' ? len * 0.62 : len * 0.48;
      const cabZ = kind === 'hatch' ? -len * 0.12 : kind === 'wagon' ? -len * 0.1 : -len * 0.04;
      body.push(U.part(box(w, lowH, len), PAINT, 0, base + lowH / 2, 0));
      body.push(U.part(box(w - 0.12, cabH, cabLen), GLASS, 0, base + lowH + cabH / 2, cabZ));
      body.push(U.part(box(w - 0.2, 0.07, cabLen - 0.35), PAINT, 0, base + lowH + cabH + 0.02, cabZ));
      body.push(U.part(box(w + 0.02, 0.2, 0.18), TRIM, 0, base + 0.12, len / 2 - 0.06));
      body.push(U.part(box(w + 0.02, 0.2, 0.18), TRIM, 0, base + 0.12, -len / 2 + 0.06));
      body.push(U.part(box(w * 0.5, 0.14, 0.05), TRIM, 0, base + lowH * 0.55, len / 2 + 0.01));
      wheels(body, len, w, kind === 'suv' ? 0.38 : 0.32, [len * 0.32, -len * 0.3]);
      for (const sx of [-1, 1]) {
        head.push(U.part(box(0.42, 0.13, 0.06), 0xffffff, sx * (w / 2 - 0.3), base + lowH * 0.7, len / 2 + 0.01));
        tail.push(U.part(box(0.42, 0.14, 0.06), 0xffffff, sx * (w / 2 - 0.3), base + lowH * 0.75, -len / 2 - 0.01));
        body.push(U.part(box(0.12, 0.1, 0.18), PAINT, sx * (w / 2 + 0.05), base + lowH + 0.08, cabZ + cabLen / 2 - 0.2));
      }
      h = base + lowH + cabH;
    } else if (kind === 'van') {
      len = 5.95; w = 2.02; h = 2.55;
      body.push(U.part(box(w, 1.95, len - 1.1), PAINT, 0, 0.35 + 0.97, -0.55));
      body.push(U.part(box(w, 0.75, 1.1), PAINT, 0, 0.35 + 0.37, len / 2 - 0.55));
      body.push(U.part(box(w - 0.08, 0.7, 0.9), GLASS, 0, 1.45, len / 2 - 0.75));
      body.push(U.part(box(w + 0.02, 0.22, 0.16), TRIM, 0, 0.42, len / 2 - 0.05));
      wheels(body, len, w, 0.36, [len * 0.3, -len * 0.3]);
      for (const sx of [-1, 1]) {
        head.push(U.part(box(0.3, 0.16, 0.06), 0xffffff, sx * 0.72, 0.95, len / 2 + 0.01));
        tail.push(U.part(box(0.12, 0.5, 0.06), 0xffffff, sx * 0.92, 1.0, -len / 2 - 0.01));
      }
    } else if (kind === 'bus') {
      len = 12.0; w = 2.55; h = 3.2;
      body.push(U.part(box(w, 2.9, len), PAINT, 0, 0.3 + 1.45, 0));
      for (const sx of [-1, 1]) body.push(U.part(box(0.03, 1.0, len - 1.5), GLASS, sx * (w / 2 + 0.005), 2.15, -0.3));
      body.push(U.part(box(w - 0.1, 1.5, 0.03), GLASS, 0, 1.95, len / 2 + 0.01));
      wheels(body, len, w, 0.5, [len * 0.32, -len * 0.25]);
      for (const sx of [-1, 1]) {
        head.push(U.part(box(0.4, 0.2, 0.05), 0xffffff, sx * 0.9, 0.75, len / 2 + 0.02));
        tail.push(U.part(box(0.25, 0.5, 0.05), 0xffffff, sx * 1.05, 0.9, -len / 2 - 0.02));
      }
    } else if (kind === 'tractor') {
      len = 6.0; w = 2.5; h = 3.9;
      body.push(U.part(box(w, 2.6, 2.2), PAINT, 0, 1.25 + 1.3, len / 2 - 1.1));
      body.push(U.part(box(w - 0.12, 0.95, 0.04), GLASS, 0, 2.95, len / 2 + 0.005));
      body.push(U.part(box(w, 0.6, 0.3), TRIM, 0, 0.85, len / 2 - 0.12));
      body.push(U.part(box(0.9, 0.3, len - 0.5), TRIM, 0, 1.0, -0.2));
      body.push(U.part(box(1.0, 0.1, 0.9), TRIM, 0, 1.2, -1.6));
      wheels(body, len, w, 0.52, [len / 2 - 1.3, -1.9]);
      for (const sx of [-1, 1]) {
        head.push(U.part(box(0.48, 0.18, 0.06), 0xffffff, sx * 0.88, 1.0, len / 2 + 0.01));
        body.push(U.part(box(0.1, 0.6, 0.3), TRIM, sx * 1.5, 2.6, len / 2 - 0.3));
      }
    } else if (kind === 'trailer') {
      len = 13.6; w = 2.55; h = 4.0;
      body.push(U.part(box(w, 2.75, len), PAINT, 0, 1.25 + 1.38, 0));
      body.push(U.part(box(0.9, 0.3, len - 1), TRIM, 0, 1.0, 0));
      body.push(U.part(box(2.3, 0.12, 0.12), TRIM, 0, 0.55, -len / 2 + 0.3));
      wheels(body, len, w, 0.5, [-len / 2 + 2.0, -len / 2 + 3.3, -len / 2 + 4.6]);
      for (const sx of [-1, 1]) tail.push(U.part(box(0.4, 0.15, 0.05), 0xffffff, sx * 0.9, 0.85, -len / 2 - 0.02));
    }
    return { body: U.merge(body), head: head.length ? U.merge(head) : null, tail: tail.length ? U.merge(tail) : null, len, w, h };
  }

  const TYPES = [
    { kind: 'sedan', weight: 26, a: 1.6, speedK: [0.88, 1.06] },
    { kind: 'hatch', weight: 22, a: 1.5, speedK: [0.82, 1.0] },
    { kind: 'wagon', weight: 14, a: 1.5, speedK: [0.88, 1.05] },
    { kind: 'suv', weight: 14, a: 1.6, speedK: [0.88, 1.04] },
    { kind: 'van', weight: 10, a: 1.1, speedK: [0.78, 0.9] },
    { kind: 'bus', weight: 3, a: 0.8, speedK: [0.72, 0.8] },
    { kind: 'tractor', weight: 13, a: 0.65, speedK: [0.66, 0.68], truck: true },
  ];
  const PAINTS = [0xd8dadc, 0x1b1d20, 0x8d939a, 0x5d6168, 0x9c1b1b, 0x1d3f7a, 0x2f5e8f, 0xe6e6e1, 0x3b4a36, 0xb39b72, 0x6b2b2b, 0xd2a21a, 0x2e2f33, 0xf2f2f0, 0x4a6c8c];
  const TRUCK_PAINTS = [0xe8ecef, 0xb3191b, 0x1d4fa3, 0x15171b, 0x1d5a35, 0xe46b0f, 0x8d949c, 0xc9a227];

  function create(scene, world, count) {
    const TR = { cars: [], all: [] };
    const models = {};
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    headMat.color.setRGB(3, 2.9, 2.6);
    tailMat.color.setRGB(3.2, 0.12, 0.08);
    const counts = {};
    // decide car mix
    const totalW = TYPES.reduce((s, t) => s + t.weight, 0);
    const rnd = U.rng(31337);
    const plan = [];
    for (let i = 0; i < count; i++) {
      let r = rnd() * totalW, t = TYPES[0];
      for (const ty of TYPES) { if ((r -= ty.weight) <= 0) { t = ty; break; } }
      plan.push(t);
      counts[t.kind] = (counts[t.kind] || 0) + 1;
    }
    counts.trailer = counts.tractor || 0;
    const inst = {};
    for (const kind in counts) {
      const mdl = carModel(kind);
      models[kind] = mdl;
      const n = counts[kind];
      const bm = new THREE.InstancedMesh(mdl.body, bodyMat, n);
      bm.castShadow = true; bm.receiveShadow = true; bm.frustumCulled = false;
      bm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(bm);
      const im = { body: bm, n: 0 };
      if (mdl.head) { im.head = new THREE.InstancedMesh(mdl.head, headMat, n); im.head.frustumCulled = false; scene.add(im.head); }
      if (mdl.tail) { im.tail = new THREE.InstancedMesh(mdl.tail, tailMat, n); im.tail.frustumCulled = false; scene.add(im.tail); }
      inst[kind] = im;
    }
    const col = new THREE.Color();
    for (const t of plan) {
      const im = inst[t.kind];
      const c = {
        type: t, kind: t.kind, mdl: models[t.kind], im, k: im.n++, x: 0, z: 0, y: 0, h: 0, pitch: 0, v: 0, vMax: 30,
        mode: 'edge', e: null, dir: 1, s: 0, lat: 0, latTarget: 0, lane: 0, jp: null, js: 0, brake: 0, hit: 0, ind: 0,
        speedK: U.lerp(t.speedK[0], t.speedK[1], rnd()), obb: U.obb(0, 0, 0, 1, 2), laneTimer: rnd() * 2,
        lastLead: 999, leadV: 0,
      };
      c.obb.hw = models[t.kind].w / 2; c.obb.hl = models[t.kind].len / 2;
      col.setHex(t.truck ? TRUCK_PAINTS[Math.floor(rnd() * TRUCK_PAINTS.length)] : PAINTS[Math.floor(rnd() * PAINTS.length)]);
      im.body.setColorAt(c.k, col);
      if (t.truck) {
        const tim = inst.trailer;
        c.trailer = { k: tim.n++, x: 0, z: 0, h: 0, obb: U.obb(0, 0, 0, 1.28, 6.8) };
        col.setHex([0xf1f1ee, 0xe9ecee, 0x2a6db0, 0xb23a2a, 0x2f8a4a, 0xc9a13a, 0xdadad4][Math.floor(rnd() * 7)]);
        tim.body.setColorAt(c.trailer.k, col);
      }
      TR.cars.push(c);
    }
    for (const kind in inst) if (inst[kind].body.instanceColor) inst[kind].body.instanceColor.needsUpdate = true;

    const roads = world.edges.filter((e) => e.type !== 'spur');
    const totalLen = roads.reduce((s, e) => s + e.len, 0);
    const P = {};
    const node = (e, dir) => (dir > 0 ? e.b : e.a);
    const startTrim = (e, dir) => (dir > 0 ? e.trimA : e.trimB);
    const endS = (e, dir) => e.len - (dir > 0 ? e.trimB : e.trimA);
    const sForward = (e, dir, s) => (dir > 0 ? s : e.len - s);
    const laneOff = (c, e, lane) => e.laneOff[Math.min(lane, e.laneOff.length - 1)];
    function limitFor(c, e) {
      return (c.type.truck ? Math.min(e.cfg.limit + 5, 85) : e.cfg.carLimit * c.speedK) / 3.6;
    }

    // ---------------------------------------------------------------- spawning
    function freeAt(e, dir, s, lat, gap) {
      const p = world.edgePoint(e, sForward(e, dir, s), dir * lat, P);
      for (const o of TR.cars) if (o.e && Math.abs(o.x - p.x) < gap && Math.abs(o.z - p.z) < gap && Math.hypot(o.x - p.x, o.z - p.z) < gap) return false;
      return true;
    }
    function spawn(c, px, pz, rMin, rMax) {
      for (let t = 0; t < 60; t++) {
        let r = Math.random() * totalLen, e = roads[0];
        for (const ed of roads) { if ((r -= ed.len) <= 0) { e = ed; break; } }
        const dir = Math.random() < 0.5 ? 1 : -1;
        const s0 = startTrim(e, dir) + 20, s1 = endS(e, dir) - 30;
        if (s1 <= s0) continue;
        const s = s0 + Math.random() * (s1 - s0);
        const lanes = e.laneOff.length;
        const lane = lanes > 1 && !c.type.truck && Math.random() < 0.3 ? 0 : lanes - 1;
        const lat = e.laneOff[lane];
        const p = world.edgePoint(e, sForward(e, dir, s), dir * lat, P);
        const d = Math.hypot(p.x - px, p.z - pz);
        if (px != null && (d < rMin || d > rMax)) continue;
        if (!freeAt(e, dir, s, lat, c.type.truck ? 40 : 22)) continue;
        Object.assign(c, { e, dir, s, lane, lat, latTarget: lat, mode: 'edge', jp: null, hit: 0, ind: 0 });
        c.vMax = limitFor(c, e);
        c.v = c.vMax * 0.85;
        place(c, 0);
        if (c.trailer) {
          c.trailer.h = c.h;
          c.trailer.x = c.x - Math.sin(c.h) * (1.0 + 9.2);
          c.trailer.z = c.z - Math.cos(c.h) * (1.0 + 9.2);
        }
        return true;
      }
      return false;
    }

    // ---------------------------------------------------------------- junction paths (roundabouts)
    const jcache = new Map();
    function junctionPath(nd, inLink, inLat, outLink, outLat) {
      const key = nd.id + ':' + inLink.e.id + ':' + inLink.dir + ':' + inLat + ':' + outLink.e.id + ':' + outLat;
      let jp = jcache.get(key);
      if (jp) return jp;
      // entry: end of the incoming edge (travelling towards nd)
      const ie = inLink.e, idir = -inLink.dir; // we travel towards nd: on edge ie in direction idir
      const sIn = endS(ie, idir);
      const E = world.edgePoint(ie, sForward(ie, idir, sIn), idir * inLat, {});
      const oe = outLink.e, odir = outLink.dir;
      const sOut = startTrim(oe, odir);
      const X = world.edgePoint(oe, sForward(oe, odir, sOut), odir * outLat, {});
      const rr = world.RING_R + 1.5;
      const aE = Math.atan2(E.z - nd.z, E.x - nd.x), aX = Math.atan2(X.z - nd.z, X.x - nd.x);
      let sweep = aE - aX;
      while (sweep < 0.6) sweep += Math.PI * 2;
      const pts = [new THREE.Vector3(E.x, 0, E.z)];
      const a0 = aE - 0.28, a1 = aX + 0.28;
      const span = sweep - 0.56;
      const nArc = Math.max(2, Math.ceil(span / 0.25));
      for (let k = 0; k <= nArc; k++) {
        const a = a0 - (span * k) / nArc;
        pts.push(new THREE.Vector3(nd.x + Math.cos(a) * rr, 0, nd.z + Math.sin(a) * rr));
      }
      pts.push(new THREE.Vector3(X.x, 0, X.z));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const L = curve.getLength();
      const n = Math.max(4, Math.ceil(L / 1.5));
      const sp = curve.getSpacedPoints(n);
      const px = new Float32Array(n + 1), pz = new Float32Array(n + 1);
      sp.forEach((p, i) => { px[i] = p.x; pz[i] = p.z; });
      jp = { px, pz, n: n + 1, len: L, step: L / n, y: nd.h + 0.02, node: nd, aE, sweep, outLink, outLat };
      jcache.set(key, jp);
      return jp;
    }
    function jPoint(jp, s, out) {
      s = U.clamp(s, 0, jp.len - 0.001);
      const f = s / jp.step, i = Math.min(jp.n - 2, Math.floor(f)), t = f - i;
      out.x = jp.px[i] + (jp.px[i + 1] - jp.px[i]) * t;
      out.z = jp.pz[i] + (jp.pz[i + 1] - jp.pz[i]) * t;
      const dx = jp.px[i + 1] - jp.px[i], dz = jp.pz[i + 1] - jp.pz[i], l = Math.hypot(dx, dz) || 1;
      out.tx = dx / l; out.tz = dz / l; out.y = jp.y;
      return out;
    }
    function chooseExit(c, nd, inLink) {
      const opts = nd.links.filter((l) => l.e.type !== 'spur' && l.e !== c.e);
      const l = opts.length ? opts[Math.floor(Math.random() * opts.length)] : nd.links.find((x) => x.e === c.e);
      return l;
    }

    // a point `d` metres ahead of the car along its planned path
    function ahead(c, d, out) {
      if (c.mode === 'edge') {
        const sEnd = endS(c.e, c.dir);
        if (c.s + d <= sEnd || !c.next) {
          const lat = d > 10 ? c.latTarget : U.lerp(c.lat, c.latTarget, d / 10);
          return world.edgePoint(c.e, sForward(c.e, c.dir, Math.min(c.s + d, sEnd)), c.dir * lat, out);
        }
        const rem = d - (sEnd - c.s);
        if (rem <= c.next.jp.len) return jPoint(c.next.jp, rem, out);
        const ol = c.next.jp.outLink;
        return world.edgePoint(ol.e, sForward(ol.e, ol.dir, startTrim(ol.e, ol.dir) + rem - c.next.jp.len), ol.dir * c.next.jp.outLat, out);
      }
      if (c.js + d <= c.jp.len) return jPoint(c.jp, c.js + d, out);
      const ol = c.jp.outLink;
      return world.edgePoint(ol.e, sForward(ol.e, ol.dir, startTrim(ol.e, ol.dir) + c.js + d - c.jp.len), ol.dir * c.jp.outLat, out);
    }
    function place(c) {
      const p = c.mode === 'edge' ? world.edgePoint(c.e, sForward(c.e, c.dir, c.s), c.dir * c.lat, P) : jPoint(c.jp, c.js, P);
      c.x = p.x; c.z = p.z;
      const hl = c.mdl.len / 2;
      // look slightly ahead and behind for heading & pitch
      const f = ahead(c, Math.min(hl, 2.5), {});
      const tx = c.mode === 'edge' ? p.tx * c.dir : p.tx, tz = c.mode === 'edge' ? p.tz * c.dir : p.tz;
      c.h = Math.atan2(f.x - c.x, f.z - c.z);
      if (!(Math.abs(f.x - c.x) + Math.abs(f.z - c.z) > 0.01)) c.h = Math.atan2(tx, tz);
      const yr = c.mode === 'edge' ? p.y : c.jp.y;
      c.y = yr;
      c.pitch = Math.atan2((f.y != null ? f.y : yr) - yr, Math.max(0.5, Math.min(hl, 2.5)));
      U.setObb(c.obb, c.x, c.z, c.h, c.mdl.w / 2, c.mdl.len / 2);
    }

    // ---------------------------------------------------------------- spatial grid of all vehicles (AI + player)
    const GC = 24;
    const grid = new Map();
    const gk = (x, z) => (Math.floor(x / GC) + 1024) * 4096 + (Math.floor(z / GC) + 1024);
    function gridAdd(o) {
      const r = o.obb.hl + 1;
      const x0 = Math.floor((o.obb.cx - r) / GC), x1 = Math.floor((o.obb.cx + r) / GC);
      const z0 = Math.floor((o.obb.cz - r) / GC), z1 = Math.floor((o.obb.cz + r) / GC);
      for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) {
        const k = (a + 1024) * 4096 + (b + 1024);
        let arr = grid.get(k);
        if (!arr) grid.set(k, (arr = []));
        arr.push(o);
      }
    }
    function probe(x, z, self, margin) {
      const arr = grid.get(gk(x, z));
      if (!arr) return null;
      for (const o of arr) {
        if (o.owner === self) continue;
        if (U.pointInObb(o.obb, x, z, margin)) return o;
      }
      return null;
    }
    function laneFree(c, lat, back, fwd) {
      for (let d = -back; d <= fwd; d += 4) {
        const sF = sForward(c.e, c.dir, U.clamp(c.s + d, 0, c.e.len));
        const p = world.edgePoint(c.e, sF, c.dir * lat, P);
        const o = probe(p.x, p.z, c, 1.2);
        if (o) return false;
      }
      return true;
    }

    // ---------------------------------------------------------------- update
    const A = {};
    TR.update = (dt, player) => {
      // rebuild grid
      grid.clear();
      for (const c of TR.cars) {
        c.ent = c.ent || { obb: c.obb, owner: c, car: c };
        gridAdd(c.ent);
        if (c.trailer) { c.trailer.ent = c.trailer.ent || { obb: c.trailer.obb, owner: c, car: c }; gridAdd(c.trailer.ent); }
      }
      const pEnts = [];
      if (player) {
        pEnts.push({ obb: player.obb, owner: player, player: true, v: player.v });
        if (player.trailer) pEnts.push({ obb: player.trailer.obb, owner: player, player: true, v: player.v });
        // a parked trailer (not attached) also blocks
        for (const e of pEnts) gridAdd(e);
      }
      for (const t of TR.extraObstacles || []) gridAdd(t);
      const px = player ? player.x : 0, pz = player ? player.z : 0;

      for (const c of TR.cars) {
        // recycle far away cars near the player
        if (player && Math.hypot(c.x - px, c.z - pz) > 2300) {
          if (spawn(c, px, pz, 700, 1900)) continue;
        }
        if (c.hit > 0) { c.hit -= dt; c.v = Math.max(0, c.v - 8 * dt); c.brake = 1; draw(c); continue; }

        // target speed
        let vDes = c.vMax;
        let stopDist = 1e9;
        if (c.mode === 'edge') {
          const sEnd = endS(c.e, c.dir);
          const toEnd = sEnd - c.s;
          const nd = node(c.e, c.dir);
          // city speed limit
          if (toEnd < 380 || c.s - startTrim(c.e, c.dir) < 250) vDes = Math.min(vDes, (c.type.truck ? 48 : 52) / 3.6);
          // plan the next junction
          if (!c.next && toEnd < 160) {
            const inLink = nd.links.find((l) => l.e === c.e && l.dir === -c.dir) || nd.links.find((l) => l.e === c.e);
            const out = chooseExit(c, nd, inLink);
            const oLane = out.e.laneOff.length - 1;
            c.next = { jp: junctionPath(nd, inLink, c.latTarget, out, out.e.laneOff[oLane]), out, lane: oLane };
            // indicate: right if the sweep is short, left if long
            const sw = c.next.jp.sweep;
            c.ind = sw < 2.2 ? 1 : sw > 3.9 ? -1 : 0;
            // a car in the inner lane should merge right before the roundabout
            if (c.e.laneOff.length > 1 && c.lane === 0 && laneFree(c, c.e.laneOff[1], 12, 25)) { c.lane = 1; c.latTarget = c.e.laneOff[1]; }
          }
          // approach speed for the roundabout
          const vj = (c.type.truck ? 22 : 28) / 3.6;
          vDes = Math.min(vDes, Math.sqrt(vj * vj + 2 * 1.6 * Math.max(0, toEnd - 4)));
          // give way to traffic already on the roundabout
          if (toEnd < 14 && c.next) {
            let yieldTo = false;
            const aE = c.next.jp.aE;
            const chk = (x, z, moving) => {
              const dx = x - nd.x, dz = z - nd.z, d = Math.hypot(dx, dz);
              if (d > nd.R + 2 || d < world.ISLAND_R) return false;
              const a = Math.atan2(dz, dx);
              const up = U.wrapAngle(a - aE);
              return up > -0.25 && up < 1.3 && moving;
            };
            for (const o of TR.cars) if (o !== c && o.mode === 'junc' && o.jp.node === nd && chk(o.x, o.z, true)) { yieldTo = true; break; }
            if (!yieldTo && player) {
              for (const e of pEnts) {
                const cr = U.obbCorners(e.obb, CORN);
                for (let k = 0; k < 8; k += 2) if (chk(cr[k], cr[k + 1], true)) yieldTo = true;
              }
            }
            if (yieldTo) stopDist = Math.min(stopDist, toEnd - 1.5);
          }
        } else {
          vDes = Math.min(vDes, (c.type.truck ? 22 : 30) / 3.6);
        }
        // lane changes on multi-lane roads
        if (c.mode === 'edge' && c.e.laneOff.length > 1) {
          c.laneTimer -= dt;
          if (c.laneTimer <= 0) {
            c.laneTimer = 1.2 + Math.random();
            const toEnd = endS(c.e, c.dir) - c.s;
            if (toEnd > 400) {
              if (c.lane === 1 && !c.type.truck && c.lastLead < 60 && c.leadV < c.vMax - 3 && laneFree(c, c.e.laneOff[0], 30, 45)) { c.lane = 0; c.latTarget = c.e.laneOff[0]; c.ind = -1; c.indT = 3; }
              else if (c.lane === 0 && laneFree(c, c.e.laneOff[1], 16, 70)) { c.lane = 1; c.latTarget = c.e.laneOff[1]; c.ind = 1; c.indT = 3; }
            }
          }
        }
        if (c.indT > 0) { c.indT -= dt; if (c.indT <= 0 && c.mode === 'edge' && !c.next) c.ind = 0; }
        if (c.lat !== c.latTarget) {
          const d = c.latTarget - c.lat, st = 1.0 * dt;
          c.lat = Math.abs(d) < st ? c.latTarget : c.lat + Math.sign(d) * st;
        }

        // car following via look-ahead probes
        const look = Math.max(18, c.v * 3.2 + 14);
        let gap = 1e9, leadV = 0;
        const hl = c.mdl.len / 2;
        for (let d = hl + 1.5; d < look; d += 3) {
          const p = ahead(c, d, A);
          const o = probe(p.x, p.z, c, c.mode === 'junc' ? 0.6 : 0.25);
          if (o) {
            gap = d - hl;
            leadV = o.player ? Math.max(0, o.v) : o.car ? o.car.v : 0;
            break;
          }
        }
        c.lastLead = gap; c.leadV = leadV;
        if (stopDist < 1e8) { if (stopDist < gap) { gap = Math.max(0.1, stopDist); leadV = 0; } }
        // IDM
        const a0 = c.type.a, b = 2.6, T = c.type.truck ? 1.8 : 1.3, s0 = c.type.truck ? 4 : 2.6;
        const v = c.v;
        const sStar = s0 + Math.max(0, v * T + (v * (v - leadV)) / (2 * Math.sqrt(a0 * b)));
        let acc = a0 * (1 - Math.pow(v / Math.max(vDes, 0.1), 4) - (gap < 1e8 ? (sStar / Math.max(gap, 0.1)) ** 2 : 0));
        acc = U.clamp(acc, -9, a0);
        c.brake = acc < -0.6 ? 1 : 0;
        c.v = Math.max(0, c.v + acc * dt);
        if (gap < 0.6) c.v = 0;

        // advance
        let ds = c.v * dt;
        if (c.mode === 'edge') {
          c.s += ds;
          const sEnd = endS(c.e, c.dir);
          if (c.s >= sEnd) {
            if (!c.next) {
              const nd = node(c.e, c.dir);
              const inLink = nd.links.find((l) => l.e === c.e);
              const out = chooseExit(c, nd, inLink);
              c.next = { jp: junctionPath(nd, inLink, c.latTarget, out, out.e.laneOff[out.e.laneOff.length - 1]), out, lane: out.e.laneOff.length - 1 };
            }
            c.mode = 'junc'; c.jp = c.next.jp; c.js = c.s - sEnd; c.next = null;
          }
        } else {
          c.js += ds;
          if (c.js >= c.jp.len) {
            const ol = c.jp.outLink;
            const lane = ol.e.laneOff.length - 1;
            c.e = ol.e; c.dir = ol.dir; c.s = startTrim(ol.e, ol.dir) + (c.js - c.jp.len);
            c.lane = lane; c.lat = c.latTarget = c.jp.outLat;
            c.mode = 'edge'; c.jp = null; c.ind = 0;
            c.vMax = limitFor(c, c.e);
          }
        }
        place(c);
        // trailer kinematics
        if (c.trailer) {
          const t = c.trailer;
          const kx = c.x - Math.sin(c.h) * 1.0, kz = c.z - Math.cos(c.h) * 1.0;
          const dx = kx - t.x, dz = kz - t.z, l = Math.hypot(dx, dz) || 1;
          t.x = kx - (dx / l) * 9.2; t.z = kz - (dz / l) * 9.2;
          t.h = Math.atan2(kx - t.x, kz - t.z);
          t.kx = kx; t.kz = kz;
          const cx = kx - Math.sin(t.h) * 5.55, cz = kz - Math.cos(t.h) * 5.55;
          U.setObb(t.obb, cx, cz, t.h, 1.28, 6.8);
        }
        draw(c);
      }
      for (const kind in inst) {
        const im = inst[kind];
        im.body.instanceMatrix.needsUpdate = true;
        if (im.head) im.head.instanceMatrix.needsUpdate = true;
        if (im.tail) { im.tail.instanceMatrix.needsUpdate = true; if (im.tail.instanceColor) im.tail.instanceColor.needsUpdate = true; }
        if (im.head && im.head.instanceColor) im.head.instanceColor.needsUpdate = true;
      }
    };
    const CORN = new Array(8);
    const dummy = new THREE.Object3D(), lc = new THREE.Color();
    function draw(c) {
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(-c.pitch, c.h, 0, 'YXZ');
      dummy.updateMatrix();
      const im = c.im;
      im.body.setMatrixAt(c.k, dummy.matrix);
      const night = G.env ? Math.max(G.env.night, G.env.rain * 0.8, G.env.fog * 0.8) : 0;
      if (im.head) { im.head.setMatrixAt(c.k, dummy.matrix); im.head.setColorAt(c.k, lc.setScalar(0.12 + night * 0.88)); }
      const blink = (G.clock % 0.8) < 0.4;
      const tailK = U.clamp((night > 0.3 ? 0.32 : 0.06) + (c.brake ? 0.68 : 0) + (c.hit > 0 && blink ? 0.6 : 0), 0, 1);
      if (c.trailer) {
        const t = c.trailer, tim = inst.trailer;
        dummy.position.set(t.kx - Math.sin(t.h) * 5.55, c.y, t.kz - Math.cos(t.h) * 5.55);
        dummy.rotation.set(0, t.h, 0);
        dummy.updateMatrix();
        tim.body.setMatrixAt(t.k, dummy.matrix);
        tim.tail.setMatrixAt(t.k, dummy.matrix); tim.tail.setColorAt(t.k, lc.setScalar(tailK));
      } else if (im.tail) {
        im.tail.setMatrixAt(c.k, dummy.matrix); im.tail.setColorAt(c.k, lc.setScalar(tailK));
      }
    }
    TR.hitCar = (c) => { c.hit = 6; c.v = 0; };
    TR.extraObstacles = [];
    TR.reset = (px, pz) => { for (const c of TR.cars) spawn(c, px, pz, 120, 1800) || spawn(c, null, null, 0, 1e9); };
    TR.nearPlayer = (x, z, r, out) => {
      out.length = 0;
      for (const c of TR.cars) {
        if (Math.abs(c.x - x) < r && Math.abs(c.z - z) < r) out.push(c.ent || { obb: c.obb, car: c });
        if (c.trailer && Math.abs(c.trailer.x - x) < r && Math.abs(c.trailer.z - z) < r) out.push(c.trailer.ent || { obb: c.trailer.obb, car: c });
      }
      return out;
    };
    // initial placement
    for (const c of TR.cars) spawn(c, null, null, 0, 1e9);
    return TR;
  }
  return { create };
})();
