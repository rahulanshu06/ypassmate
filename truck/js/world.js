'use strict';
// World generation: terrain, road graph (motorways, roads, depot spurs), roundabouts, depots, cities,
// trees, signs and the spatial queries the physics uses (surface height, nearest road, obstacles).
G.World = (() => {
  const U = G.U;
  const HALF = 5200;          // playable area half size
  const TS = 6400;            // terrain half size (extra ring keeps the horizon filled)
  const CELL = 25, NV = Math.round((TS * 2) / CELL) + 1; // 513 vertices per side
  const CHUNKS = 8, CHV = (NV - 1) / CHUNKS;             // 64 cells per terrain chunk
  const PAD_R = 40, ISLAND_R = 14.5, APRON_R = 18, RING_R = 28.5;
  const SPUR_LEN = 235, FADE = 80, FLAT = 36;
  const tick = () => new Promise((r) => setTimeout(r, 0));

  async function build(scene, Q, progress = () => {}) {
    const W = {
      HALF, TS, PAD_R, ISLAND_R, APRON_R, RING_R,
      nodes: [], edges: [], cities: [], depots: [], yards: [], cams: [], lampPos: [], dynamic: {},
    };
    const rand = U.rng(7919);
    const n1 = U.makeNoise(11), n2 = U.makeNoise(29), n3 = U.makeNoise(53), n4 = U.makeNoise(71), n5 = U.makeNoise(97);

    // ---------------------------------------------------------------- base terrain shape
    function baseH(x, z) {
      let h = 34 + U.fbm(n1, x / 3200, z / 3200, 3) * 26;
      const amp = U.lerp(7, 85, U.smoothstep(-2600, 4300, z)) * (0.75 + 0.5 * (n4(x / 5000, z / 5000) + 0.5));
      h += U.fbm(n2, x / 1050, z / 1050, 5) * amp;
      const ox = x - 2250, oz = z - 430; // Erzgebirge between Dresden and Praha
      h += Math.exp(-(ox * ox) / (1500 * 1500) - (oz * oz) / (420 * 420)) * 60;
      const alp = U.smoothstep(4250, 5700, z); // Alps along the south edge
      if (alp > 0) {
        const r = 1 - Math.abs(U.fbm(n3, x / 900, z / 900, 4));
        h += alp * (220 + 560 * r * r);
      }
      const lk = n3(x / 1700 + 17.3, z / 1700 - 4.1);
      h -= U.smoothstep(-0.36, -0.62, lk) * 42;
      h = U.lerp(h, -22, U.smoothstep(-4300, -5000, z)); // North Sea / Baltic coast
      return h;
    }
    W.baseH = baseH;
    function nodeHeight(x, z) {
      let s = 0, c = 0;
      for (let a = 0; a < 8; a++) for (const r of [0, 140, 280]) { s += baseH(x + Math.cos(a) * r, z + Math.sin(a) * r); c++; }
      return Math.max(7, s / c);
    }
    function boxSmooth(a, r) {
      const n = a.length, out = new Float32Array(n), ps = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + a[i];
      for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - r), hi = Math.min(n - 1, i + r);
        out[i] = (ps[hi + 1] - ps[lo]) / (hi - lo + 1);
      }
      return out;
    }

    // ---------------------------------------------------------------- graph
    function addNode(o) { o.id = W.nodes.length; o.links = []; W.nodes.push(o); return o; }
    const cityById = {};
    for (const c of G.D.cities) {
      const city = { ...c, depots: [], fuel: null };
      city.node = addNode({ type: 'city', x: c.x, z: c.z, h: nodeHeight(c.x, c.z), R: PAD_R, city });
      W.cities.push(city);
      cityById[c.id] = city;
    }
    W.cityById = cityById;

    function makeEdge(a, b, type, ref, px, pz) {
      const cfg = G.D.roadTypes[type];
      const n = px.length;
      const e = { id: W.edges.length, a, b, type, cfg, ref, n, px, pz, py: new Float32Array(n), tx: new Float32Array(n), tz: new Float32Array(n) };
      let len = 0;
      for (let i = 0; i < n - 1; i++) len += Math.hypot(px[i + 1] - px[i], pz[i + 1] - pz[i]);
      e.len = len; e.step = len / (n - 1);
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
        const dx = px[i1] - px[i0], dz = pz[i1] - pz[i0], l = Math.hypot(dx, dz) || 1;
        e.tx[i] = dx / l; e.tz[i] = dz / l;
      }
      e.W = cfg.median / 2 + cfg.lanes * cfg.laneW + cfg.shoulder;
      e.edgeLine = cfg.median / 2 + cfg.lanes * cfg.laneW;
      e.laneOff = [];
      for (let k = 0; k < cfg.lanes; k++) e.laneOff.push(cfg.median / 2 + cfg.laneW * (k + 0.5));
      e.trimA = a.type === 'city' ? Math.sqrt(a.R * a.R - e.W * e.W) - 0.6 : 0;
      e.trimB = b.type === 'city' ? Math.sqrt(b.R * b.R - e.W * e.W) - 0.6 : 0;
      const angA = Math.atan2(pz[Math.min(n - 1, 30)] - pz[0], px[Math.min(n - 1, 30)] - px[0]);
      const angB = Math.atan2(pz[Math.max(0, n - 31)] - pz[n - 1], px[Math.max(0, n - 31)] - px[n - 1]);
      a.links.push({ e, dir: 1, other: b, ang: angA });
      b.links.push({ e, dir: -1, other: a, ang: angB });
      W.edges.push(e);
      return e;
    }

    for (const [fa, fb, type, ref] of G.D.links) {
      const A = cityById[fa].node, B = cityById[fb].node;
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      const nx = -uz, nz = ux;
      const K = Math.max(2, Math.round(L / 650));
      const pts = [new THREE.Vector3(A.x, 0, A.z), new THREE.Vector3(A.x + ux * 130, 0, A.z + uz * 130)];
      for (let k = 1; k < K; k++) {
        const t = k / K;
        const off = (rand() - 0.5) * 2 * L * 0.065 * Math.sin(Math.PI * t);
        pts.push(new THREE.Vector3(A.x + dx * t + nx * off, 0, A.z + dz * t + nz * off));
      }
      pts.push(new THREE.Vector3(B.x - ux * 130, 0, B.z - uz * 130), new THREE.Vector3(B.x, 0, B.z));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      curve.arcLengthDivisions = Math.ceil(L / 2);
      const clen = curve.getLength();
      const n = Math.round(clen / 2) + 1;
      const sp = curve.getSpacedPoints(n - 1);
      const px = new Float32Array(n), pz = new Float32Array(n);
      for (let i = 0; i < n; i++) { px[i] = sp[i].x; pz[i] = sp[i].z; }
      const e = makeEdge(A, B, type, ref, px, pz);
      // vertical profile: smoothed terrain, anchored to both cities, grade limited to 5 %
      const st = e.step, raw = new Float32Array(n);
      for (let i = 0; i < n; i++) raw[i] = Math.max(3.5, baseH(px[i], pz[i]));
      let h = boxSmooth(raw, Math.round(90 / st));
      // flat approach zones (pad radius + 30 m) stay at the roundabout height; the smoothing radius
      // below is smaller than the zone, so the road meets the pad without a step
      const RA = A.R + 30, RB = B.R + 30;
      for (let i = 0; i < n; i++) {
        const s = i * st, sb = e.len - s;
        h[i] = U.lerp(A.h, h[i], U.smoothstep(RA, RA + 240, s));
        h[i] = U.lerp(B.h, h[i], U.smoothstep(RB, RB + 240, sb));
      }
      const g = 0.05 * st;
      const pinA = (i) => i * st <= RA, pinB = (i) => e.len - i * st <= RB;
      for (let it = 0; it < 6; it++) {
        for (let i = 0; i < n; i++) {
          if (pinA(i)) h[i] = A.h; else if (pinB(i)) h[i] = B.h;
          else h[i] = U.clamp(h[i], h[i - 1] - g, h[i - 1] + g);
        }
        for (let i = n - 1; i >= 0; i--) {
          if (pinB(i)) h[i] = B.h; else if (pinA(i)) h[i] = A.h;
          else h[i] = U.clamp(h[i], h[i + 1] - g, h[i + 1] + g);
        }
      }
      h = boxSmooth(h, Math.round(22 / st));
      e.py.set(h);
    }
    progress(0.12, 'Roads planned');
    await tick();

    // ---------------------------------------------------------------- depots + fuel stations (spurs off each roundabout)
    const angDiff = (a, b) => Math.abs(U.wrapAngle(a - b));
    for (const city of W.cities) {
      const node = city.node;
      const comps = G.D.companies.filter((c) => c.city === city.id);
      const kinds = comps.map((c) => ({ kind: 'depot', company: c })).concat([{ kind: 'fuel' }]);
      const used = node.links.map((l) => l.ang);
      for (const k of kinds) {
        const hl = k.kind === 'fuel' ? 36 : 55, hw = k.kind === 'fuel' ? 40 : 45;
        let best = 0, bestD = -1;
        for (let deg = 0; deg < 360; deg += 3) {
          const a = (deg * Math.PI) / 180;
          let md = Math.PI;
          for (const u of used) md = Math.min(md, angDiff(a, u));
          const cxp = node.x + Math.cos(a) * (SPUR_LEN + hl), czp = node.z + Math.sin(a) * (SPUR_LEN + hl);
          if (baseH(cxp, czp) < 3 || Math.abs(cxp) > HALF - 200 || Math.abs(czp) > HALF - 200) md -= 2;
          if (md > bestD) { bestD = md; best = a; }
        }
        used.push(best);
        const ux = Math.cos(best), uz = Math.sin(best);
        const yc = { x: node.x + ux * (SPUR_LEN - 2 + hl), z: node.z + uz * (SPUR_LEN - 2 + hl) };
        const yh = node.h + U.clamp(nodeHeight(yc.x, yc.z) - node.h, -6, 6);
        const dnode = addNode({ type: k.kind, x: node.x + ux * SPUR_LEN, z: node.z + uz * SPUR_LEN, h: yh, R: 0, city });
        const n = Math.round(SPUR_LEN / 2) + 1;
        const px = new Float32Array(n), pz = new Float32Array(n);
        for (let i = 0; i < n; i++) { const s = (i / (n - 1)) * SPUR_LEN; px[i] = node.x + ux * s; pz[i] = node.z + uz * s; }
        const e = makeEdge(node, dnode, 'spur', '', px, pz);
        for (let i = 0; i < n; i++) e.py[i] = U.lerp(node.h, yh, U.smoothstep(PAD_R + 10, SPUR_LEN - 20, i * e.step));
        const yard = { cx: yc.x, cz: yc.z, h: Math.atan2(ux, uz), hw, hl, y: yh, kind: k.kind, node: dnode, city };
        yard.c = Math.cos(yard.h); yard.s = Math.sin(yard.h);
        W.yards.push(yard);
        const depot = { id: W.depots.length, kind: k.kind, city, company: k.company || null, node: dnode, yard, edge: e, bays: [] };
        dnode.depot = depot;
        if (k.kind === 'depot') {
          for (let b = 0; b < 8; b++) depot.bays.push({ lx: (b - 3.5) * 4.6, lz: 15.5, used: false });
          city.depots.push(depot);
        } else city.fuel = depot;
        W.depots.push(depot);
      }
    }
    // yard-local (lx = left, lz = into the yard) to world
    W.yardToWorld = (y, lx, lz) => ({ x: y.cx + lx * y.c + lz * y.s, z: y.cz - lx * y.s + lz * y.c });
    W.worldToYard = (y, x, z) => { const dx = x - y.cx, dz = z - y.cz; return { lx: dx * y.c - dz * y.s, lz: dx * y.s + dz * y.c }; };
    W.bayPose = (depot, b) => {
      const bay = depot.bays[b], y = depot.yard;
      const p = W.yardToWorld(y, bay.lx, 11.4); // kingpin when the trailer is reversed into the bay
      const c = W.yardToWorld(y, bay.lx, 15.5);
      return { x: p.x, z: p.z, h: U.wrapAngle(y.h + Math.PI), cx: c.x, cz: c.z, y: y.y };
    };
    progress(0.2, 'Depots placed');
    await tick();

    // ---------------------------------------------------------------- spatial hash of road segments
    const HC = 48, hash = new Map();
    const hkey = (ix, iz) => (ix + 512) * 2048 + (iz + 512);
    for (const e of W.edges) {
      for (let i = 0; i < e.n - 1; i++) {
        const mx = (e.px[i] + e.px[i + 1]) / 2, mz = (e.pz[i] + e.pz[i + 1]) / 2;
        const k = hkey(Math.floor(mx / HC), Math.floor(mz / HC));
        let arr = hash.get(k);
        if (!arr) hash.set(k, (arr = []));
        arr.push(e.id * 65536 + i);
      }
    }
    const qres = { e: null, i: 0, t: 0, d: 0, lat: 0, s: 0, h: 0 };
    // nearest road centre-line segment within ~48 m. Returns a shared object (copy if you keep it).
    function query(x, z) {
      const ix = Math.floor(x / HC), iz = Math.floor(z / HC);
      let best = 1e9, be = null, bi = 0, bt = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const arr = hash.get(hkey(ix + a, iz + b));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const v = arr[k], e = W.edges[v >>> 16], i = v & 65535;
          const ax = e.px[i], az = e.pz[i], dx = e.px[i + 1] - ax, dz = e.pz[i + 1] - az;
          const l2 = dx * dx + dz * dz;
          let t = ((x - ax) * dx + (z - az) * dz) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t - x, qz = az + dz * t - z, d2 = qx * qx + qz * qz;
          if (d2 < best) { best = d2; be = e; bi = i; bt = t; }
        }
      }
      if (!be) return null;
      const e = be, i = bi;
      const dx = e.px[i + 1] - e.px[i], dz = e.pz[i + 1] - e.pz[i], l = Math.hypot(dx, dz);
      qres.e = e; qres.i = i; qres.t = bt; qres.d = Math.sqrt(best);
      qres.lat = ((x - e.px[i]) * -dz + (z - e.pz[i]) * dx) / l;
      qres.s = (i + bt) * e.step;
      qres.h = e.py[i] + (e.py[i + 1] - e.py[i]) * bt;
      qres.tx = dx / l; qres.tz = dz / l;
      return qres;
    }
    W.query = query;
    W.edgePoint = (e, s, off, out = {}) => {
      s = U.clamp(s, 0, e.len - 0.001);
      const f = s / e.step, i = Math.min(e.n - 2, Math.floor(f)), t = f - i;
      const tx = e.tx[i] + (e.tx[i + 1] - e.tx[i]) * t, tz = e.tz[i] + (e.tz[i + 1] - e.tz[i]) * t;
      const l = Math.hypot(tx, tz) || 1;
      out.tx = tx / l; out.tz = tz / l;
      out.x = e.px[i] + (e.px[i + 1] - e.px[i]) * t - out.tz * off;
      out.z = e.pz[i] + (e.pz[i + 1] - e.pz[i]) * t + out.tx * off;
      out.y = e.py[i] + (e.py[i + 1] - e.py[i]) * t;
      return out;
    };

    // ---------------------------------------------------------------- terrain heights
    const H = new Float32Array(NV * NV);
    for (let j = 0; j < NV; j++) {
      const z = -TS + j * CELL;
      for (let i = 0; i < NV; i++) H[j * NV + i] = baseH(-TS + i * CELL, z);
    }
    progress(0.3, 'Terrain shaped');
    await tick();
    const vIdx = (x) => Math.round((x + TS) / CELL);
    function eachVertex(x0, z0, x1, z1, fn) {
      const i0 = Math.max(0, vIdx(x0) - 1), i1 = Math.min(NV - 1, vIdx(x1) + 1);
      const j0 = Math.max(0, vIdx(z0) - 1), j1 = Math.min(NV - 1, vIdx(z1) + 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * NV + i, -TS + i * CELL, -TS + j * CELL);
    }
    // city plateaus
    for (const c of W.cities) {
      const R0 = 300, R1 = 560;
      eachVertex(c.x - R1, c.z - R1, c.x + R1, c.z + R1, (k, x, z) => {
        const w = 1 - U.smoothstep(R0, R1, Math.hypot(x - c.x, z - c.z));
        if (w > 0) H[k] = U.lerp(H[k], c.node.h - 0.5, w);
      });
    }
    // roads, pads, yards: nearest feature wins
    const KEY = new Float32Array(NV * NV).fill(1e9), TGT = new Float32Array(NV * NV);
    const stamp = (k, key, tgt) => { if (key < KEY[k]) { KEY[k] = key; TGT[k] = tgt; } };
    for (const e of W.edges) {
      const inner = e.W + FLAT, reach = inner + FADE;
      for (let i = 0; i < e.n; i += 2) {
        const x = e.px[i], z = e.pz[i], t = e.py[i] - 0.5;
        eachVertex(x - reach, z - reach, x + reach, z + reach, (k, vx, vz) => stamp(k, Math.hypot(vx - x, vz - z) - inner, t));
      }
    }
    for (const nd of W.nodes) if (nd.type === 'city') {
      const inner = nd.R + FLAT, reach = inner + FADE;
      eachVertex(nd.x - reach, nd.z - reach, nd.x + reach, nd.z + reach, (k, x, z) => stamp(k, Math.hypot(x - nd.x, z - nd.z) - inner, nd.h - 0.5));
    }
    for (const y of W.yards) {
      const reach = Math.max(y.hw, y.hl) + FLAT + FADE + 10;
      eachVertex(y.cx - reach, y.cz - reach, y.cx + reach, y.cz + reach, (k, x, z) => {
        const l = W.worldToYard(y, x, z);
        const d = Math.hypot(Math.max(Math.abs(l.lx) - y.hw, 0), Math.max(Math.abs(l.lz) - y.hl, 0));
        stamp(k, d - FLAT - 6, y.y - 0.5);
      });
    }
    for (let k = 0; k < NV * NV; k++) {
      if (KEY[k] > 1e8) continue;
      const w = KEY[k] <= 0 ? 1 : 1 - U.smoothstep(0, FADE, KEY[k]);
      H[k] = U.lerp(H[k], TGT[k], w);
    }
    W.H = H;
    W.KEY = KEY;
    function terrainH(x, z) {
      const fx = (x + TS) / CELL, fz = (z + TS) / CELL;
      const i = Math.floor(fx), j = Math.floor(fz);
      if (i < 0 || j < 0 || i >= NV - 1 || j >= NV - 1) return -30;
      const u = fx - i, v = fz - j, o = j * NV + i;
      const h00 = H[o], h10 = H[o + 1], h01 = H[o + NV], h11 = H[o + NV + 1];
      if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
      return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
    }
    W.terrainH = terrainH;
    progress(0.4, 'Valleys carved');
    await tick();

    // ---------------------------------------------------------------- terrain colour map
    const CM = 1024, cmc = U.canvas(CM, CM), cctx = cmc.getContext('2d');
    const img = cctx.createImageData(CM, CM), px = img.data;
    const crops = [[196, 178, 104], [112, 142, 60], [120, 92, 62], [214, 204, 64], [128, 160, 74], [181, 165, 112], [96, 128, 52]];
    const forestAt = (x, z) => U.smoothstep(0.02, 0.26, U.fbm(n5, x / 1900 + 31, z / 1900 - 7, 3));
    W.forestAt = forestAt;
    for (let py = 0; py < CM; py++) {
      const z = -TS + ((py + 0.5) / CM) * TS * 2;
      for (let pxi = 0; pxi < CM; pxi++) {
        const x = -TS + ((pxi + 0.5) / CM) * TS * 2;
        const h = terrainH(x, z);
        const slope = Math.abs(terrainH(x + 12, z) - h) + Math.abs(terrainH(x, z + 12) - h);
        const nz = n1(x / 90, z / 90) * 0.5 + n4(x / 23, z / 23) * 0.3;
        let r = 92 + nz * 18, g = 124 + nz * 20, b = 58 + nz * 10;
        // farmland patchwork on lowland
        const farm = U.smoothstep(0.1, -0.2, n4(x / 2600 + 3, z / 2600 + 9)) * (1 - U.smoothstep(170, 260, h));
        if (farm > 0) {
          const a = 0.35 + Math.floor((x + 9000) / 2600) * 0.7;
          const ca = Math.cos(a), sa = Math.sin(a);
          const fx = (x * ca - z * sa) / 170, fz = (x * sa + z * ca) / 120;
          const ix = Math.floor(fx), iz = Math.floor(fz);
          const hsh = ((ix * 73856093) ^ (iz * 19349663)) >>> 0;
          const crop = crops[hsh % crops.length];
          const edge = Math.min(fx - ix, 1 - (fx - ix), fz - iz, 1 - (fz - iz));
          const f = farm * (edge < 0.04 ? 0.25 : 1);
          r = U.lerp(r, crop[0] + nz * 12, f); g = U.lerp(g, crop[1] + nz * 12, f); b = U.lerp(b, crop[2] + nz * 8, f);
        }
        const fo = forestAt(x, z);
        if (fo > 0) { r = U.lerp(r, 46, fo * 0.85); g = U.lerp(g, 70, fo * 0.85); b = U.lerp(b, 38, fo * 0.85); }
        const rock = Math.max(U.smoothstep(9, 20, slope), U.smoothstep(330, 430, h));
        if (rock > 0) { r = U.lerp(r, 118 + nz * 20, rock); g = U.lerp(g, 114 + nz * 20, rock); b = U.lerp(b, 106 + nz * 20, rock); }
        const snow = U.smoothstep(470, 560, h + nz * 30);
        if (snow > 0) { r = U.lerp(r, 236, snow); g = U.lerp(g, 240, snow); b = U.lerp(b, 245, snow); }
        const sand = U.smoothstep(2.5, 0.5, h);
        if (sand > 0) { r = U.lerp(r, 196, sand); g = U.lerp(g, 184, sand); b = U.lerp(b, 140, sand); }
        const wet = U.smoothstep(0, -2, h);
        if (wet > 0) { r = U.lerp(r, 38, wet); g = U.lerp(g, 74, wet); b = U.lerp(b, 98, wet); }
        let urb = 0;
        for (const c of W.cities) {
          const d = Math.hypot(x - c.x, z - c.z);
          if (d < 700) urb = Math.max(urb, 1 - U.smoothstep(250, 680, d));
        }
        if (urb > 0) { r = U.lerp(r, 112, urb * 0.55); g = U.lerp(g, 116, urb * 0.55); b = U.lerp(b, 98, urb * 0.55); }
        const o = (py * CM + pxi) * 4;
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
      }
    }
    cctx.putImageData(img, 0, 0);
    W.colorMap = cmc;
    const colorTex = U.tex(cmc, { clamp: true });
    // tiled detail texture (grass / soil grain)
    const dc = U.canvas(256, 256), dctx = dc.getContext('2d');
    const did = dctx.createImageData(256, 256);
    const dn = U.makeNoise(5);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const v = 128 + U.fbm(dn, x / 16, y / 16, 4) * 50 + (Math.random() - 0.5) * 34;
      const o = (y * 256 + x) * 4;
      did.data[o] = did.data[o + 1] = did.data[o + 2] = U.clamp(v, 0, 255); did.data[o + 3] = 255;
    }
    // make it tile: blend edges by drawing with wrap
    dctx.putImageData(did, 0, 0);
    const detailTex = U.tex(dc, { srgb: false });
    progress(0.5, 'Fields painted');
    await tick();

    // ---------------------------------------------------------------- terrain mesh (chunked for culling)
    const terrainMat = new THREE.MeshStandardMaterial({ map: colorTex, roughness: 0.96, metalness: 0 });
    terrainMat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detailTex };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;')
        .replace('#include <map_fragment>', `
          #ifdef USE_MAP
            vec4 sampledDiffuseColor = texture2D( map, vMapUv );
            float dA = texture2D( detailMap, vMapUv * 1600.0 ).r;
            float dB = texture2D( detailMap, vMapUv * 170.0 ).r;
            sampledDiffuseColor.rgb *= (0.55 + dA * 0.9) * (0.75 + dB * 0.5);
            diffuseColor *= sampledDiffuseColor;
          #endif`);
    };
    W.terrainMat = terrainMat;
    const NRM = new Float32Array(NV * NV * 3);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
      const hl = H[j * NV + Math.max(i - 1, 0)], hr = H[j * NV + Math.min(i + 1, NV - 1)];
      const hd = H[Math.max(j - 1, 0) * NV + i], hu = H[Math.min(j + 1, NV - 1) * NV + i];
      const nx = hl - hr, ny = 2 * CELL, nz = hd - hu, l = Math.hypot(nx, ny, nz);
      const o = (j * NV + i) * 3;
      NRM[o] = nx / l; NRM[o + 1] = ny / l; NRM[o + 2] = nz / l;
    }
    const tGroup = new THREE.Group();
    for (let cj = 0; cj < CHUNKS; cj++) for (let ci = 0; ci < CHUNKS; ci++) {
      const nv = CHV + 1, pos = new Float32Array(nv * nv * 3), nor = new Float32Array(nv * nv * 3), uv = new Float32Array(nv * nv * 2);
      for (let b = 0; b < nv; b++) for (let a = 0; a < nv; a++) {
        const i = ci * CHV + a, j = cj * CHV + b, k = b * nv + a, g = j * NV + i;
        pos[k * 3] = -TS + i * CELL; pos[k * 3 + 1] = H[g]; pos[k * 3 + 2] = -TS + j * CELL;
        nor[k * 3] = NRM[g * 3]; nor[k * 3 + 1] = NRM[g * 3 + 1]; nor[k * 3 + 2] = NRM[g * 3 + 2];
        uv[k * 2] = i / (NV - 1); uv[k * 2 + 1] = 1 - j / (NV - 1);
      }
      const idx = new Uint32Array(CHV * CHV * 6);
      let o = 0;
      for (let b = 0; b < CHV; b++) for (let a = 0; a < CHV; a++) {
        const A = b * nv + a, B = A + 1, C = A + nv, D = C + 1;
        idx[o++] = A; idx[o++] = C; idx[o++] = B;
        idx[o++] = B; idx[o++] = C; idx[o++] = D;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, terrainMat);
      m.receiveShadow = true;
      tGroup.add(m);
    }
    scene.add(tGroup);
    // water
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x24506a, roughness: 0.12, metalness: 0.35 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(TS * 6, TS * 6), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0;
    water.receiveShadow = true;
    scene.add(water);
    W.waterMat = waterMat;
    progress(0.58, 'Terrain built');
    await tick();

    // ---------------------------------------------------------------- road textures + meshes
    function roadTexture(type) {
      const cfg = G.D.roadTypes[type];
      const Wd = cfg.median / 2 + cfg.lanes * cfg.laneW + cfg.shoulder;
      const period = type === 'motorway' ? 18 : 12, dash = type === 'motorway' ? 6 : 4;
      const cw = 512, ch = 512, c = U.canvas(cw, ch), x = c.getContext('2d');
      const X = (off) => ((off + Wd) / (2 * Wd)) * cw, Y = (s) => (s / period) * ch;
      x.fillStyle = '#45474a'; x.fillRect(0, 0, cw, ch);
      // aggregate grain
      for (let i = 0; i < 26000; i++) {
        const v = 50 + Math.random() * 40;
        x.fillStyle = `rgba(${v},${v},${v + 2},${0.25 + Math.random() * 0.4})`;
        x.fillRect(Math.random() * cw, Math.random() * ch, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
      }
      // darker wheel tracks
      const tracks = [];
      for (const o of [...Array(cfg.lanes).keys()].map((k) => cfg.median / 2 + cfg.laneW * (k + 0.5))) tracks.push(o, -o);
      for (const o of tracks) for (const w of [-0.95, 0.95]) {
        const g = x.createLinearGradient(X(o + w - 0.45), 0, X(o + w + 0.45), 0);
        g.addColorStop(0, 'rgba(20,20,22,0)'); g.addColorStop(0.5, 'rgba(20,20,22,0.18)'); g.addColorStop(1, 'rgba(20,20,22,0)');
        x.fillStyle = g; x.fillRect(X(o + w - 0.45), 0, X(o + w + 0.45) - X(o + w - 0.45), ch);
      }
      // shoulder tone
      x.fillStyle = 'rgba(70,70,68,0.35)';
      x.fillRect(0, 0, X(-cfg.median / 2 - cfg.lanes * cfg.laneW) - 0, ch);
      x.fillRect(X(cfg.median / 2 + cfg.lanes * cfg.laneW), 0, cw, ch);
      const paint = 'rgba(236,236,228,0.92)';
      const line = (off, w, solid) => {
        x.fillStyle = paint;
        if (solid) x.fillRect(X(off - w / 2), 0, X(off + w / 2) - X(off - w / 2), ch);
        else x.fillRect(X(off - w / 2), Y(1), X(off + w / 2) - X(off - w / 2), Y(dash));
      };
      const edge = cfg.median / 2 + cfg.lanes * cfg.laneW;
      line(edge + 0.15, 0.3, true); line(-edge - 0.15, 0.3, true);
      if (type === 'motorway') {
        line(cfg.median / 2 - 0.08, 0.15, true); line(-cfg.median / 2 + 0.08, 0.15, true);
        x.fillStyle = '#5b5c5c'; x.fillRect(X(-cfg.median / 2 + 0.15), 0, X(cfg.median / 2 - 0.15) - X(-cfg.median / 2 + 0.15), ch);
        line(cfg.median / 2 + cfg.laneW, 0.15, false); line(-cfg.median / 2 - cfg.laneW, 0.15, false);
      } else line(0, 0.12, false);
      // cracks / patches
      for (let i = 0; i < 6; i++) {
        x.strokeStyle = 'rgba(25,25,25,0.35)'; x.lineWidth = 1;
        x.beginPath(); let px0 = Math.random() * cw, py0 = Math.random() * ch; x.moveTo(px0, py0);
        for (let k = 0; k < 6; k++) { px0 += (Math.random() - 0.5) * 30; py0 += Math.random() * 25; x.lineTo(px0, py0); }
        x.stroke();
      }
      const t = U.tex(c);
      t.anisotropy = G.maxAniso || 8;
      return { tex: t, period };
    }
    const roadMats = {}, roadTex = {};
    for (const type of ['motorway', 'road', 'spur']) {
      roadTex[type] = roadTexture(type);
      roadMats[type] = new THREE.MeshStandardMaterial({ map: roadTex[type].tex, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    }
    W.roadMats = roadMats;
    const roadArrays = {}, skirt = { pos: [], col: [] }, barrier = { pos: [] };
    const verge = new THREE.Color(0x6d6a5a);
    for (const e of W.edges) {
      const ra = roadArrays[e.type] || (roadArrays[e.type] = { pos: [], uv: [] });
      const i0 = Math.max(0, Math.ceil(e.trimA / e.step)), i1 = Math.min(e.n - 1, Math.floor((e.len - e.trimB) / e.step));
      const period = roadTex[e.type].period;
      for (let i = i0; i < i1; i++) {
        const P = [i, i + 1].map((k) => ({ x: e.px[k], z: e.pz[k], y: e.py[k], rx: -e.tz[k], rz: e.tx[k], v: (k * e.step) / period }));
        const at = (p, off, dy = 0) => [p.x + p.rx * off, p.y + dy, p.z + p.rz * off];
        const [p, q] = P;
        // surface quad (left edge -> right edge); winding so the face points up
        const a = at(p, -e.W), b = at(p, e.W), c = at(q, -e.W), d = at(q, e.W);
        ra.pos.push(...a, ...b, ...c, ...b, ...d, ...c);
        ra.uv.push(0, p.v, 1, p.v, 0, q.v, 1, p.v, 1, q.v, 0, q.v);
        // skirts
        for (const sg of [-1, 1]) {
          const in0 = at(p, sg * e.W), out0 = at(p, sg * (e.W + 2.6), -0.65), in1 = at(q, sg * e.W), out1 = at(q, sg * (e.W + 2.6), -0.65);
          if (sg > 0) skirt.pos.push(...in0, ...out0, ...in1, ...out0, ...out1, ...in1);
          else skirt.pos.push(...out0, ...in0, ...out1, ...in0, ...in1, ...out1);
        }
        if (e.cfg.median > 0 && i * e.step > e.trimA + 6 && i * e.step < e.len - e.trimB - 6 && i % 2 === 0) {
          const q2 = Math.min(i + 2, i1);
          const pp = P[0], qq = { x: e.px[q2], z: e.pz[q2], y: e.py[q2], rx: -e.tz[q2], rz: e.tx[q2] };
          const prof = [[-0.3, 0], [-0.19, 0.28], [-0.08, 0.86], [0.08, 0.86], [0.19, 0.28], [0.3, 0]];
          for (let k = 0; k < prof.length - 1; k++) {
            const a1 = at(pp, prof[k][0], prof[k][1]), b1 = at(pp, prof[k + 1][0], prof[k + 1][1]);
            const a2 = at(qq, prof[k][0], prof[k][1]), b2 = at(qq, prof[k + 1][0], prof[k + 1][1]);
            barrier.pos.push(...a1, ...a2, ...b1, ...b1, ...a2, ...b2);
          }
        }
      }
      e.barrierFrom = e.trimA + 6; e.barrierTo = e.len - e.trimB - 6;
    }
    // winding check helper: make sure triangles face up (flip if needed)
    function upFacing(arr) {
      for (let k = 0; k < arr.length; k += 9) {
        const ax = arr[k], az = arr[k + 2], bx = arr[k + 3], bz = arr[k + 5], cx = arr[k + 6], cz = arr[k + 8];
        const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        if (ny < 0) {
          for (let m = 0; m < 3; m++) { const t = arr[k + 3 + m]; arr[k + 3 + m] = arr[k + 6 + m]; arr[k + 6 + m] = t; }
          if (arr.uvRef) {
            const u = arr.uvRef, o = (k / 9) * 6;
            for (let m = 0; m < 2; m++) { const t = u[o + 2 + m]; u[o + 2 + m] = u[o + 4 + m]; u[o + 4 + m] = t; }
          }
        }
      }
    }
    for (const type in roadArrays) {
      const ra = roadArrays[type];
      ra.pos.uvRef = ra.uv;
      upFacing(ra.pos);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ra.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(ra.uv, 2));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, roadMats[type]);
      m.receiveShadow = true;
      m.frustumCulled = false;
      scene.add(m);
    }
    upFacing(skirt.pos);
    {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(skirt.pos, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: verge, roughness: 1 }));
      m.receiveShadow = true; m.frustumCulled = false;
      scene.add(m);
      const gb = new THREE.BufferGeometry();
      gb.setAttribute('position', new THREE.Float32BufferAttribute(barrier.pos, 3));
      gb.computeVertexNormals();
      const mb = new THREE.Mesh(gb, new THREE.MeshStandardMaterial({ color: 0xa9a59b, roughness: 0.85, side: THREE.DoubleSide }));
      mb.receiveShadow = true; mb.frustumCulled = false;
      scene.add(mb);
    }
    progress(0.66, 'Asphalt laid');
    await tick();

    // ---------------------------------------------------------------- roundabouts
    function padTexture() {
      const S = 1024, c = U.canvas(S, S), x = c.getContext('2d'), k = S / (PAD_R * 2);
      x.fillStyle = '#45474a'; x.fillRect(0, 0, S, S);
      for (let i = 0; i < 60000; i++) {
        const v = 50 + Math.random() * 40;
        x.fillStyle = `rgba(${v},${v},${v + 2},${0.25 + Math.random() * 0.4})`;
        x.fillRect(Math.random() * S, Math.random() * S, 2, 2);
      }
      const ring = (r, w, dash) => {
        x.beginPath(); x.arc(S / 2, S / 2, r * k, 0, Math.PI * 2);
        x.lineWidth = w * k; x.strokeStyle = 'rgba(236,236,228,0.9)';
        x.setLineDash(dash ? dash.map((d) => d * k) : []); x.stroke(); x.setLineDash([]);
      };
      // cobbled truck apron
      x.beginPath(); x.arc(S / 2, S / 2, APRON_R * k, 0, Math.PI * 2); x.fillStyle = '#7b6f66'; x.fill();
      for (let i = 0; i < 9000; i++) {
        const a = Math.random() * Math.PI * 2, r = (ISLAND_R + Math.random() * (APRON_R - ISLAND_R)) * k;
        const v = 95 + Math.random() * 50;
        x.fillStyle = `rgb(${v},${v - 8},${v - 14})`;
        x.fillRect(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 4, 4);
      }
      ring(APRON_R + 0.2, 0.25, null);
      ring((APRON_R + PAD_R - 1.5) / 2, 0.15, [3, 3]);
      ring(PAD_R - 1.4, 0.45, [1.2, 0.8]);
      return U.tex(c, { clamp: true });
    }
    const padMat = new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    W.padMat = padMat;
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x6d6a5a, roughness: 1 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xb8b4aa, roughness: 0.8 });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4f7a34, roughness: 1 });
    for (const nd of W.nodes) if (nd.type === 'city') {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(nd.R, 72), padMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(nd.x, nd.h + 0.02, nd.z);
      disc.receiveShadow = true;
      scene.add(disc);
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(nd.R + 0.4, nd.R + 3.5, 3, 72, 1, true), slabMat);
      slab.position.set(nd.x, nd.h - 1.5, nd.z);
      scene.add(slab);
      const isl = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R + 0.2, 0.36, 48), [curbMat, grassMat, grassMat]);
      isl.position.set(nd.x, nd.h + 0.18, nd.z);
      isl.receiveShadow = true;
      scene.add(isl);
    }

    // ---------------------------------------------------------------- obstacles (static collision)
    const OC = 64, ogrid = new Map();
    const okey = (ix, iz) => (ix + 512) * 2048 + (iz + 512);
    function addObstacle(o) {
      const r = o.r != null ? o.r : Math.hypot(o.hw, o.hl);
      const x0 = Math.floor((o.cx - r) / OC), x1 = Math.floor((o.cx + r) / OC), z0 = Math.floor((o.cz - r) / OC), z1 = Math.floor((o.cz + r) / OC);
      for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) {
        const k = okey(a, b);
        let arr = ogrid.get(k);
        if (!arr) ogrid.set(k, (arr = []));
        arr.push(o);
      }
      return o;
    }
    const addBox = (cx, cz, h, hw, hl, tag) => addObstacle({ ...U.obb(cx, cz, h, hw, hl), tag });
    const addCircle = (cx, cz, r, tag) => addObstacle({ cx, cz, r, circle: true, tag });
    W.addObstacle = addObstacle;
    W.obstaclesNear = (x, z, out) => {
      out.length = 0;
      const ix = Math.floor(x / OC), iz = Math.floor(z / OC);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const arr = ogrid.get(okey(ix + a, iz + b));
        if (arr) for (const o of arr) if (out.indexOf(o) < 0) out.push(o);
      }
      return out;
    };
    for (const nd of W.nodes) if (nd.type === 'city') addCircle(nd.x, nd.z, ISLAND_R - 0.3, 'island');

    // ---------------------------------------------------------------- shared materials for props
    const mats = {
      concrete: new THREE.MeshStandardMaterial({ color: 0xb5b0a5, roughness: 0.9 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.45, metalness: 0.7 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.5 }),
      white: new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.6 }),
      vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c9 }),
    };
    W.mats = mats;

    // ---------------------------------------------------------------- yards (depots + fuel stations)
    function yardTexture(kind) {
      const hw = kind === 'fuel' ? 40 : 45, hl = kind === 'fuel' ? 36 : 55;
      const cw = 512, ch = Math.round((512 * hl) / hw);
      const c = U.canvas(cw, ch), x = c.getContext('2d');
      const X = (lx) => ((lx + hw) / (2 * hw)) * cw, Y = (lz) => ((lz + hl) / (2 * hl)) * ch;
      x.fillStyle = '#8d8a83'; x.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 30000; i++) {
        const v = 115 + Math.random() * 40;
        x.fillStyle = `rgba(${v},${v - 2},${v - 6},0.35)`;
        x.fillRect(Math.random() * cw, Math.random() * ch, 2, 2);
      }
      x.strokeStyle = 'rgba(60,58,55,0.5)'; x.lineWidth = 1;
      for (let gx = -hw; gx <= hw; gx += 6) { x.beginPath(); x.moveTo(X(gx), 0); x.lineTo(X(gx), ch); x.stroke(); }
      for (let gz = -hl; gz <= hl; gz += 6) { x.beginPath(); x.moveTo(0, Y(gz)); x.lineTo(cw, Y(gz)); x.stroke(); }
      for (let i = 0; i < 18; i++) {
        x.fillStyle = `rgba(30,28,25,${0.12 + Math.random() * 0.15})`;
        x.beginPath(); x.ellipse(Math.random() * cw, Math.random() * ch, 6 + Math.random() * 14, 4 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2); x.fill();
      }
      x.strokeStyle = 'rgba(240,240,232,0.95)'; x.lineWidth = 3;
      if (kind === 'depot') {
        for (let b = 0; b <= 8; b++) {
          const lx = (b - 4) * 4.6;
          x.beginPath(); x.moveTo(X(lx), Y(7)); x.lineTo(X(lx), Y(24)); x.stroke();
        }
        x.beginPath(); x.moveTo(X(-18.4), Y(7)); x.lineTo(X(18.4), Y(7)); x.stroke();
        // hatched no-parking strip in front of the docks
        x.strokeStyle = 'rgba(232,190,40,0.9)'; x.lineWidth = 4;
        for (let lx = -40; lx < 40; lx += 2.5) { x.beginPath(); x.moveTo(X(lx), Y(24.3)); x.lineTo(X(lx + 1.2), Y(25)); x.stroke(); }
        // waiting bays on the left
        x.strokeStyle = 'rgba(240,240,232,0.8)'; x.lineWidth = 3;
        for (let k = 0; k <= 3; k++) { x.beginPath(); x.moveTo(X(-42), Y(-30 + k * 5)); x.lineTo(X(-25), Y(-30 + k * 5)); x.stroke(); }
      } else {
        x.fillStyle = 'rgba(240,240,232,0.85)';
        x.font = 'bold 40px sans-serif'; x.textAlign = 'center';
        x.save(); x.translate(X(0), Y(-24)); x.rotate(Math.PI); x.fillText('DIESEL · LKW', 0, 0); x.restore();
      }
      return U.tex(c, { clamp: true });
    }
    const yardTop = { depot: yardTexture('depot'), fuel: yardTexture('fuel') };
    function logoTexture(company, w = 1024, h = 256, bg = '#f4f4f0') {
      const c = U.canvas(w, h), x = c.getContext('2d');
      x.fillStyle = bg; x.fillRect(0, 0, w, h);
      x.fillStyle = company.color;
      x.fillRect(0, h * 0.78, w, h * 0.12);
      x.beginPath(); x.arc(h * 0.45, h * 0.42, h * 0.26, 0, Math.PI * 2); x.fill();
      x.fillStyle = bg; x.font = `bold ${h * 0.3}px "Barlow Condensed", Arial Narrow, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(company.name[0], h * 0.45, h * 0.44);
      x.fillStyle = company.color; x.textAlign = 'left';
      x.font = `bold ${h * 0.34}px "Barlow Condensed", Arial Narrow, sans-serif`;
      x.fillText(company.name.toUpperCase(), h * 0.85, h * 0.42, w - h);
      return U.tex(c, { clamp: true });
    }
    W.logoTexture = logoTexture;

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    function placeMesh(geo, mat, x, y, z, h, sx = 1, sy = 1, sz = 1, shadow = true) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.y = h; m.scale.set(sx, sy, sz);
      m.castShadow = shadow; m.receiveShadow = true;
      scene.add(m);
      return m;
    }
    const fenceTex = (() => {
      const c = U.canvas(128, 64), x = c.getContext('2d');
      x.clearRect(0, 0, 128, 64);
      x.strokeStyle = 'rgba(160,168,170,1)'; x.lineWidth = 1.4;
      for (let i = -64; i < 192; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke(); x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 64); x.stroke(); }
      x.fillStyle = '#6e7377'; x.fillRect(0, 0, 128, 3); x.fillRect(0, 0, 3, 64);
      return U.tex(c);
    })();
    const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 });
    function fence(y, x0, z0, x1, z1) {
      const a = W.yardToWorld(y, x0, z0), b = W.yardToWorld(y, x1, z1);
      const len = Math.hypot(b.x - a.x, b.z - a.z), h = Math.atan2(b.x - a.x, b.z - a.z);
      const g = new THREE.PlaneGeometry(len, 2.2);
      fenceTex.repeat.set(1, 1);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 4));
      const m = new THREE.Mesh(g, fenceMat);
      m.position.set((a.x + b.x) / 2, y.y + 1.1, (a.z + b.z) / 2);
      m.rotation.y = h + Math.PI / 2;
      scene.add(m);
      addBox((a.x + b.x) / 2, (a.z + b.z) / 2, h, 0.2, len / 2, 'fence');
    }
    const yardTopMats = {};
    for (const k of ['depot', 'fuel']) {
      yardTopMats[k] = new THREE.MeshStandardMaterial({ map: yardTop[k], roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    }
    W.yardTopMats = yardTopMats;
    const warehouseTex = (() => {
      const c = U.canvas(256, 128), x = c.getContext('2d');
      x.fillStyle = '#c9cbc8'; x.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 256; i += 4) { x.fillStyle = i % 8 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.15)'; x.fillRect(i, 0, 2, 128); }
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, 118, 256, 10);
      return U.tex(c);
    })();
    const warehouseMat = new THREE.MeshStandardMaterial({ map: warehouseTex, roughness: 0.7, metalness: 0.2 });
    const dockDoorMat = new THREE.MeshStandardMaterial({ color: 0x7d8a96, roughness: 0.5, metalness: 0.4 });
    const rnd = U.rng(424242);
    W.decorTrailers = [];
    for (const d of W.depots) {
      const y = d.yard;
      const top = new THREE.Mesh(new THREE.BoxGeometry(y.hw * 2, 3, y.hl * 2), [slabMat, slabMat, yardTopMats[d.kind], slabMat, slabMat, slabMat]);
      top.position.set(y.cx, y.y - 1.5 + 0.03, y.cz);
      top.rotation.y = y.h;
      top.receiveShadow = true;
      scene.add(top);
      const P = (lx, lz) => W.yardToWorld(y, lx, lz);
      // fences with an entrance gap
      fence(y, -y.hw, -y.hl, -11, -y.hl); fence(y, 11, -y.hl, y.hw, -y.hl);
      fence(y, -y.hw, -y.hl, -y.hw, y.hl); fence(y, y.hw, -y.hl, y.hw, y.hl); fence(y, -y.hw, y.hl, y.hw, y.hl);
      if (d.kind === 'depot') {
        // warehouse with docks
        const wc = P(0, 39);
        const wh = placeMesh(boxGeo, warehouseMat, wc.x, y.y + 6, wc.z, y.h, 82, 12, 27);
        wh.material = [warehouseMat, warehouseMat, mats.concrete, warehouseMat, warehouseMat, warehouseMat];
        addBox(wc.x, wc.z, y.h, 41, 13.5, 'building');
        for (let b = 0; b < 8; b++) {
          const dp = P((b - 3.5) * 4.6, 25.45);
          placeMesh(boxGeo, dockDoorMat, dp.x, y.y + 2.4, dp.z, y.h, 3.2, 3.4, 0.2, false);
        }
        // company sign on the facade
        const lt = logoTexture(d.company);
        const sp = P(0, 25.3);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.6 }));
        sign.position.set(sp.x, y.y + 9, sp.z); sign.rotation.y = y.h + Math.PI;
        scene.add(sign);
        // pylon sign at the gate
        const pg = P(14, -y.hl + 3);
        placeMesh(boxGeo, mats.steel, pg.x, y.y + 3, pg.z, y.h, 0.3, 6, 0.3);
        const ps = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 0.2), [mats.white, mats.white, mats.white, mats.white, new THREE.MeshStandardMaterial({ map: lt }), new THREE.MeshStandardMaterial({ map: lt })]);
        ps.position.set(pg.x, y.y + 6.4, pg.z); ps.rotation.y = y.h + Math.PI;
        scene.add(ps);
        addCircle(pg.x, pg.z, 0.4, 'pole');
        // office near the gate
        const oc = P(-30, -40);
        placeMesh(boxGeo, mats.white, oc.x, y.y + 3.5, oc.z, y.h, 16, 7, 10);
        addBox(oc.x, oc.z, y.h, 8, 5, 'building');
        d.decorBays = [];
        // a few parked trailers as decoration (avoid bays 3 and 4 which jobs use first)
        for (const b of [0, 1, 6, 7]) if (rnd() < 0.55) d.decorBays.push(b);
        // light masts
        for (const [lx, lz] of [[-y.hw + 2, 0], [y.hw - 2, 0], [-y.hw + 2, -y.hl + 2], [y.hw - 2, -y.hl + 2]]) {
          const lp = P(lx, lz);
          placeMesh(boxGeo, mats.steel, lp.x, y.y + 6, lp.z, 0, 0.3, 12, 0.3);
          W.lampPos.push({ x: lp.x, y: y.y + 12, z: lp.z, h: y.h, mast: true, ground: y.y });
          addCircle(lp.x, lp.z, 0.35, 'pole');
        }
      } else {
        // fuel station: canopy, pump islands, shop, service hall
        const cc = P(0, -6);
        placeMesh(boxGeo, mats.white, cc.x, y.y + 6.3, cc.z, y.h, 36, 1.1, 22);
        const band = placeMesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x1d4fa3, roughness: 0.5 }), cc.x, y.y + 6.3, cc.z, y.h, 36.2, 0.7, 22.2, false);
        band.position.y = y.y + 6.2;
        for (const lx of [-12, 0, 12]) {
          const ic = P(lx, -6);
          placeMesh(boxGeo, mats.concrete, ic.x, y.y + 0.15, ic.z, y.h, 1.4, 0.3, 11);
          addBox(ic.x, ic.z, y.h, 0.8, 5.6, 'island');
          for (const lz of [-9.5, -2.5]) {
            const pp = P(lx, lz);
            placeMesh(boxGeo, mats.white, pp.x, y.y + 1.2, pp.z, y.h, 0.9, 1.9, 0.6);
            placeMesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x1d4fa3 }), pp.x, y.y + 1.7, pp.z, y.h, 0.95, 0.5, 0.65, false);
          }
          for (const lz of [-11.5, -0.5]) {
            const pl = P(lx, lz);
            placeMesh(boxGeo, mats.steel, pl.x, y.y + 3.1, pl.z, y.h, 0.4, 6.2, 0.4);
          }
        }
        const sc = P(20, 27);
        placeMesh(boxGeo, mats.white, sc.x, y.y + 2.5, sc.z, y.h, 26, 5, 14);
        addBox(sc.x, sc.z, y.h, 13, 7, 'building');
        const gc = P(-22, 26);
        placeMesh(boxGeo, warehouseMat, gc.x, y.y + 4.5, gc.z, y.h, 28, 9, 16);
        addBox(gc.x, gc.z, y.h, 14, 8, 'building');
        for (const lx of [-31, -22, -13]) {
          const dp = P(lx, 17.9);
          placeMesh(boxGeo, dockDoorMat, dp.x, y.y + 2.6, dp.z, y.h, 6, 5.2, 0.2, false);
        }
        // price pylon
        const pyl = P(28, -y.hl + 4);
        const ptex = (() => {
          const c = U.canvas(256, 512), x = c.getContext('2d');
          x.fillStyle = '#1d4fa3'; x.fillRect(0, 0, 256, 512);
          x.fillStyle = '#fff'; x.font = 'bold 64px "Barlow Condensed", Arial Narrow, sans-serif'; x.textAlign = 'center';
          x.fillText('TRUCK', 128, 90); x.fillText('STOP', 128, 160);
          x.fillStyle = '#10161f'; x.fillRect(20, 220, 216, 250);
          x.fillStyle = '#ffd34d'; x.font = '42px "Share Tech Mono", monospace';
          x.fillText('DIESEL', 128, 280); x.font = 'bold 72px "Share Tech Mono", monospace'; x.fillText('1.69', 128, 370);
          x.font = '36px "Share Tech Mono", monospace'; x.fillText('SERVICE', 128, 440);
          return U.tex(c, { clamp: true });
        })();
        const pm = new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.5 });
        const pb = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 0.6), [mats.white, mats.white, mats.white, mats.white, pm, pm]);
        pb.position.set(pyl.x, y.y + 5, pyl.z); pb.rotation.y = y.h + Math.PI;
        pb.castShadow = true;
        scene.add(pb);
        addBox(pyl.x, pyl.z, y.h, 1.5, 0.4, 'pole');
        d.refuel = { lx0: -18, lx1: 18, lz0: -17, lz1: 5 };
        d.service = { lx0: -36, lx1: -8, lz0: 4, lz1: 18 };
        for (const [lx, lz] of [[-y.hw + 2, -y.hl + 2], [y.hw - 2, 10]]) {
          const lp = P(lx, lz);
          placeMesh(boxGeo, mats.steel, lp.x, y.y + 5, lp.z, 0, 0.25, 10, 0.25);
          W.lampPos.push({ x: lp.x, y: y.y + 10, z: lp.z, h: y.h, mast: true, ground: y.y });
          addCircle(lp.x, lp.z, 0.3, 'pole');
        }
      }
    }
    progress(0.72, 'Depots built');
    await tick();

    // ---------------------------------------------------------------- city buildings + landmarks
    const facade = (kind) => {
      const S = 256, c = U.canvas(S, S), x = c.getContext('2d'), e = U.canvas(S, S), ex = e.getContext('2d');
      const base = ['#c9c1b3', '#5d7a91', '#a0583f', '#d8d6cf'][kind];
      x.fillStyle = base; x.fillRect(0, 0, S, S);
      ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
      const cells = 8, cs = S / cells;
      for (let iy = 0; iy < cells; iy++) for (let ix = 0; ix < cells; ix++) {
        const wx = ix * cs, wy = iy * cs;
        if (kind === 1) {
          x.fillStyle = `rgba(${30 + Math.random() * 30},${60 + Math.random() * 30},${85 + Math.random() * 30},1)`;
          x.fillRect(wx + 1, wy + 2, cs - 2, cs - 4);
          x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(wx + 1, wy + 2, cs / 3, cs - 4);
        } else {
          x.fillStyle = kind === 2 ? '#efe9dc' : '#7d7a74';
          x.fillRect(wx + cs * 0.18, wy + cs * 0.2, cs * 0.64, cs * 0.58);
          x.fillStyle = `rgb(${40 + Math.random() * 25},${48 + Math.random() * 25},${58 + Math.random() * 25})`;
          x.fillRect(wx + cs * 0.24, wy + cs * 0.26, cs * 0.52, cs * 0.46);
        }
        if (Math.random() < 0.38) {
          const warm = Math.random();
          ex.fillStyle = `rgb(${255},${190 + warm * 50},${110 + warm * 70})`;
          if (kind === 1) ex.fillRect(wx + 1, wy + 2, cs - 2, cs - 4);
          else ex.fillRect(wx + cs * 0.24, wy + cs * 0.26, cs * 0.52, cs * 0.46);
        }
      }
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, S - 6, S, 6);
      return { map: U.tex(c), emissive: U.tex(e) };
    };
    const facadeMats = [0, 1, 2, 3].map((k) => {
      const f = facade(k);
      return new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: k === 1 ? 0.25 : 0.85, metalness: k === 1 ? 0.45 : 0 });
    });
    W.facadeMats = facadeMats;
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 0.95 });
    function distToYard(y, x, z) {
      const l = W.worldToYard(y, x, z);
      return Math.hypot(Math.max(Math.abs(l.lx) - y.hw, 0), Math.max(Math.abs(l.lz) - y.hl, 0));
    }
    W.distToYard = distToYard;
    const blocked = (x, z, rad) => {
      const q = query(x, z);
      if (q && q.d < q.e.W + 8 + rad) return true;
      for (const y of W.yards) if (Math.abs(y.cx - x) < 200 && Math.abs(y.cz - z) < 200 && distToYard(y, x, z) < rad + 10) return true;
      for (const c of W.cities) if (Math.hypot(c.x - x, c.z - z) < PAD_R + rad + 12) return true;
      if (terrainH(x, z) < 1.5) return true;
      return false;
    };
    W.blocked = blocked;
    const landmarkSpots = [];
    for (const city of W.cities) {
      const r = U.rng(city.name.length * 9973 + city.x);
      const grid = r() * Math.PI;
      const tall = city.landmark === 'skyline' ? 2.6 : city.id === 'b' || city.id === 'hh' ? 1.4 : 1;
      const sides = facadeMats.map(() => ({ pos: [], uv: [], nor: [] })), roofs = { pos: [], nor: [] };
      const placed = [];
      // landmark spot first
      let lm = null;
      for (let t = 0; t < 300 && !lm; t++) {
        const a = r() * Math.PI * 2, rr = 120 + r() * 160;
        const x = city.x + Math.cos(a) * rr, z = city.z + Math.sin(a) * rr;
        if (!blocked(x, z, 30)) lm = { x, z, rad: 30 };
      }
      if (lm) { placed.push(lm); landmarkSpots.push({ city, ...lm }); }
      for (let t = 0; t < 1400 && placed.length < 95; t++) {
        const rr = 95 + Math.pow(r(), 0.85) * 560, a = r() * Math.PI * 2;
        const x = city.x + Math.cos(a) * rr, z = city.z + Math.sin(a) * rr;
        const w = 12 + r() * 26, d = 12 + r() * 26, rad = Math.hypot(w, d) / 2;
        if (blocked(x, z, rad)) continue;
        if (placed.some((b) => Math.hypot(b.x - x, b.z - z) < b.rad + rad + 5)) continue;
        const centre = 1 - U.smoothstep(90, 620, rr);
        const h = 8 + Math.pow(r(), 2.3) * (12 + 62 * centre * tall) + centre * 12 * tall;
        placed.push({ x, z, rad });
        const ang = grid + (r() < 0.15 ? r() : 0);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        let base = Infinity;
        for (const [ox, oz] of [[-w, -d], [w, -d], [w, d], [-w, d]]) base = Math.min(base, terrainH(x + (ox / 2) * ca + (oz / 2) * sa, z - (ox / 2) * sa + (oz / 2) * ca));
        base -= 0.6;
        const top = base + h + 0.6;
        const mat = h > 45 && r() < 0.6 ? 1 : Math.floor(r() * 4);
        const S = sides[mat];
        const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([lx, lz]) => [x + lx * ca + lz * sa, z - lx * sa + lz * ca]);
        const uo = Math.floor(r() * 8) / 8;
        for (let k = 0; k < 4; k++) {
          const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
          const L = Math.hypot(bx - ax, bz - az);
          let nx = bz - az, nz = -(bx - ax);
          const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
          // ensure outward
          if (((ax + bx) / 2 - x) * nx + ((az + bz) / 2 - z) * nz < 0) { nx = -nx; nz = -nz; }
          const u0 = uo, u1 = uo + L / 24, v0 = 0, v1 = (top - base) / 24;
          const quad = [[ax, base, az, u0, v0], [bx, base, bz, u1, v0], [bx, top, bz, u1, v1], [ax, top, az, u0, v1]];
          // orient triangles so they face outward
          const tri = (p, q, s) => {
            const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [s[0] - p[0], s[1] - p[1], s[2] - p[2]];
            const cx = e1[1] * e2[2] - e1[2] * e2[1], cz = e1[0] * e2[1] - e1[1] * e2[0];
            const order = cx * nx + cz * nz >= 0 ? [p, q, s] : [p, s, q];
            for (const v of order) { S.pos.push(v[0], v[1], v[2]); S.uv.push(v[3], v[4]); S.nor.push(nx, 0, nz); }
          };
          tri(quad[0], quad[1], quad[2]); tri(quad[0], quad[2], quad[3]);
        }
        const [c0, c1, c2, c3] = corners;
        const roofTri = (p, q, s) => {
          const cy = (q[1] - p[1]) * (s[0] - p[0]) - (q[0] - p[0]) * (s[1] - p[1]);
          const order = cy >= 0 ? [p, q, s] : [p, s, q];
          for (const v of order) roofs.pos.push(v[0], top, v[1]), roofs.nor.push(0, 1, 0);
        };
        roofTri(c0, c1, c2); roofTri(c0, c2, c3);
        addBox(x, z, ang, w / 2, d / 2, 'building');
        // rooftop plant room
        if (h > 20 && r() < 0.7) {
          const pw = w * 0.35, pd = d * 0.3, ph = 3;
          const g = U.part(boxGeo, 0x8b8a86, x, top + ph / 2, z, 0, ang, 0, pw, ph, pd);
          const gp = g.attributes.position.array, gn = g.attributes.normal.array;
          for (let k = 0; k < gp.length; k++) roofs.pos.push(gp[k]);
          for (let k = 0; k < gn.length; k++) roofs.nor.push(gn[k]);
        }
      }
      sides.forEach((S, k) => {
        if (!S.pos.length) return;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(S.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(S.nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(S.uv, 2));
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, facadeMats[k]);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
      });
      const gr = new THREE.BufferGeometry();
      gr.setAttribute('position', new THREE.Float32BufferAttribute(roofs.pos, 3));
      gr.setAttribute('normal', new THREE.Float32BufferAttribute(roofs.nor, 3));
      gr.computeBoundingSphere();
      const mr = new THREE.Mesh(gr, roofMat);
      mr.castShadow = true; mr.receiveShadow = true;
      scene.add(mr);
      city.buildings = placed.length;
    }
    // landmarks
    W.spinners = [];
    for (const s of landmarkSpots) buildLandmark(s);
    function buildLandmark(s) {
      const { city, x, z } = s, y0 = terrainH(x, z) - 0.5;
      const parts = [];
      const P = (g, col, px, py, pz, rx, ry, rz, sx, sy, sz) => parts.push(U.part(g, col, x + px, y0 + py, z + pz, rx, ry, rz, sx, sy, sz));
      const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
      const stone = 0x8c8478, dark = 0x3d3a36, copper = 0x5f9e86, white = 0xe7e4dc;
      switch (city.landmark) {
        case 'tvtower':
          if (city.id === 'b') {
            P(cyl(3.2, 5, 205), white, 0, 102, 0); P(new THREE.SphereGeometry(16, 24, 16), 0x9aa3ab, 0, 205, 0);
            P(cyl(4.5, 4.5, 8), 0x6f7880, 0, 222, 0); P(cyl(1.2, 1.6, 70), 0xd23a2a, 0, 255, 0);
            P(cyl(14, 18, 10, 12), white, 0, 5, 0);
          } else {
            P(cyl(4, 6, 150), white, 0, 75, 0); P(cyl(9, 7, 14), 0x6f7880, 0, 150, 0); P(cyl(0.9, 1.4, 60), 0xd23a2a, 0, 185, 0);
          }
          addCircle(x, z, city.id === 'b' ? 18 : 7, 'landmark');
          break;
        case 'cathedral':
          P(boxGeo, dark, 0, 22, 25, 0, 0, 0, 34, 44, 90); P(new THREE.ConeGeometry(24, 18, 4), 0x3a3633, 0, 53, 25, 0, Math.PI / 4, 0, 1, 1, 2.6);
          for (const sx of [-10, 10]) {
            P(boxGeo, dark, sx, 40, -26, 0, 0, 0, 14, 80, 14);
            P(new THREE.ConeGeometry(8.5, 70, 8), dark, sx, 115, -26);
          }
          addBox(x, z, 0, 18, 55, 'landmark');
          break;
        case 'skyline':
          for (let k = 0; k < 7; k++) {
            const a = k * 0.9, rr = 22 + (k % 3) * 18;
            const hh = 110 + ((k * 37) % 5) * 25;
            P(boxGeo, k % 2 ? 0x41627a : 0x6b8496, Math.cos(a) * rr, hh / 2, Math.sin(a) * rr, 0, a, 0, 22, hh, 22);
            if (k % 3 === 0) P(new THREE.ConeGeometry(9, 26, 4), 0x9bb0bf, Math.cos(a) * rr, hh + 13, Math.sin(a) * rr, 0, a + Math.PI / 4, 0);
          }
          addCircle(x, z, 58, 'landmark');
          break;
        case 'cranes':
          for (let k = 0; k < 4; k++) {
            const ox = (k - 1.5) * 32;
            for (const lz of [-10, 10]) for (const lx of [-6, 6]) P(boxGeo, 0xd4561e, ox + lx, 24, lz, 0, 0, 0, 1.6, 48, 1.6);
            P(boxGeo, 0xd4561e, ox, 46, 18, 0, 0, 0, 3, 3, 90);
            P(boxGeo, 0xd4561e, ox, 50, 0, 0, 0, 0, 14, 4, 22);
          }
          for (let k = 0; k < 40; k++) {
            const cols = [0x2a6db0, 0xb23a2a, 0x2f8a4a, 0xc9a13a, 0x6a6f75, 0xe0e0dc];
            P(boxGeo, cols[k % cols.length], -50 + (k % 10) * 11, 1.3 + Math.floor(k / 20) * 2.6, -30 + (Math.floor(k / 10) % 2) * 3, 0, 0, 0, 2.44, 2.59, 12.2);
          }
          addBox(x, z, 0, 66, 34, 'landmark');
          break;
        case 'monument':
          P(boxGeo, 0x6f675c, 0, 8, 0, 0, 0, 0, 70, 16, 70); P(boxGeo, 0x6f675c, 0, 30, 0, 0, 0, 0, 44, 30, 44);
          P(new THREE.SphereGeometry(20, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x6f675c, 0, 45, 0);
          addBox(x, z, 0, 36, 36, 'landmark');
          break;
        case 'dome':
          P(boxGeo, 0xd8c9a8, 0, 18, 0, 0, 0, 0, 40, 36, 40); P(new THREE.SphereGeometry(19, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a8478, 0, 36, 0, 0, 0, 0, 1, 1.25, 1);
          P(cyl(4, 5, 14), 0xd8c9a8, 0, 66, 0); P(new THREE.ConeGeometry(3, 8, 12), 0xc2a24a, 0, 77, 0);
          for (const [a, b] of [[-17, -17], [17, -17], [17, 17], [-17, 17]]) { P(cyl(3, 3, 44), 0xd8c9a8, a, 22, b); P(new THREE.ConeGeometry(3.5, 8, 10), 0x6a9e8a, a, 48, b); }
          addBox(x, z, 0, 22, 22, 'landmark');
          break;
        case 'castle':
          P(boxGeo, 0xb9ad94, 0, 10, 0, 0, 0, 0, 80, 20, 26);
          for (const [a, b] of [[-38, -12], [38, -12], [-38, 12], [38, 12]]) { P(cyl(6, 6, 28), 0xb9ad94, a, 14, b); P(new THREE.ConeGeometry(7, 14, 12), 0x5f9e86, a, 35, b); }
          P(boxGeo, 0xa89c84, 8, 30, 0, 0, 0, 0, 14, 60, 14); P(new THREE.ConeGeometry(9, 30, 8), copper, 8, 75, 0);
          addBox(x, z, 0, 44, 18, 'landmark');
          break;
        case 'twintowers':
          P(boxGeo, 0x9c5a44, 0, 18, 30, 0, 0, 0, 34, 36, 70);
          for (const sx of [-10, 10]) {
            P(boxGeo, 0x9c5a44, sx, 42, -14, 0, 0, 0, 12, 84, 12);
            P(new THREE.SphereGeometry(7, 16, 12), copper, sx, 88, -14, 0, 0, 0, 1, 1.4, 1);
            P(cyl(0.8, 1.6, 8), copper, sx, 100, -14);
          }
          addBox(x, z, 0, 22, 50, 'landmark');
          break;
        case 'wheel': {
          for (const sz of [-4, 4]) {
            P(boxGeo, 0x2f3b33, -14, 18, sz, 0, 0, 0.45, 1.4, 40, 1.4);
            P(boxGeo, 0x2f3b33, 14, 18, sz, 0, 0, -0.45, 1.4, 40, 1.4);
          }
          const wheel = [];
          const tor = new THREE.TorusGeometry(30, 0.8, 8, 48);
          for (const sz of [-3, 3]) wheel.push(U.part(tor, 0x8a2f2a, 0, 0, sz));
          for (let k = 0; k < 15; k++) {
            const a = (k / 15) * Math.PI * 2;
            wheel.push(U.part(boxGeo, 0x8a2f2a, Math.cos(a) * 15, Math.sin(a) * 15, 0, 0, 0, a, 30, 0.4, 0.4));
            wheel.push(U.part(boxGeo, 0xb8423a, Math.cos(a) * 30, Math.sin(a) * 30 - 2.2, 0, 0, 0, 0, 3.2, 2.6, 5));
          }
          const wm = new THREE.Mesh(U.merge(wheel), mats.vc);
          wm.position.set(x, y0 + 36, z); wm.castShadow = true;
          scene.add(wm);
          W.spinners.push({ mesh: wm, axis: 'z', speed: 0.05 });
          addBox(x, z, 0, 16, 6, 'landmark');
          break;
        }
        default: break;
      }
      if (parts.length) {
        const m = new THREE.Mesh(U.merge(parts), mats.vc);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
      }
    }
    progress(0.8, 'Cities raised');
    await tick();

    // ---------------------------------------------------------------- trees (instanced, chunked)
    const trunkC = 0x5a4130;
    const conifer = U.merge([
      U.part(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6), trunkC, 0, 1.2, 0),
      U.part(new THREE.ConeGeometry(2.7, 5, 8), 0x2c4a2b, 0, 4.2, 0),
      U.part(new THREE.ConeGeometry(2.1, 4.4, 8), 0x2f5230, 0, 6.6, 0),
      U.part(new THREE.ConeGeometry(1.4, 3.8, 8), 0x345a33, 0, 8.9, 0),
    ]);
    const broad = U.merge([
      U.part(new THREE.CylinderGeometry(0.22, 0.34, 3.8, 6), trunkC, 0, 1.9, 0),
      U.part(new THREE.IcosahedronGeometry(3.1, Q.treeDetail === 0 ? 0 : 1), 0x46682d, 0, 6.1, 0, 0, 0, 0, 1, 1.05, 1),
      U.part(new THREE.IcosahedronGeometry(2.2, Q.treeDetail === 0 ? 0 : 1), 0x4f7433, 1.3, 7.6, 0.8),
      U.part(new THREE.IcosahedronGeometry(2.0, Q.treeDetail === 0 ? 0 : 1), 0x426329, -1.2, 7.0, -0.9),
    ]);
    // fake ambient occlusion: darker near the ground
    for (const g of [conifer, broad]) {
      const p = g.attributes.position, c = g.attributes.color;
      for (let i = 0; i < p.count; i++) { const k = 0.55 + 0.45 * U.clamp(p.getY(i) / 9, 0, 1); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
    }
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
    W.treeMat = treeMat;
    const TCH = 400, tchunks = new Map();
    const tr = U.rng(99);
    const treeDensity = Q.trees;
    const spacing = 12;
    const lim = TS - 100;
    const dummy = new THREE.Object3D(), tcol = new THREE.Color();
    for (let z = -lim; z < lim; z += spacing) {
      for (let x = -lim; x < lim; x += spacing) {
        const jx = x + (tr() - 0.5) * spacing * 0.9, jz = z + (tr() - 0.5) * spacing * 0.9;
        const fo = forestAt(jx, jz);
        let p = fo * 0.9 + 0.012;
        const outside = Math.max(Math.abs(jx), Math.abs(jz)) > HALF;
        // thin out far from roads where nobody looks closely
        const vi = vIdx(jx), vj = vIdx(jz);
        const key = KEY[U.clamp(vj, 0, NV - 1) * NV + U.clamp(vi, 0, NV - 1)];
        if (key > 500) p *= 0.4;
        if (outside) p *= 0.5;
        p *= treeDensity;
        if (tr() > p) continue;
        const h = terrainH(jx, jz);
        if (h < 1.2 || h > 520) continue;
        let nearCity = false;
        for (const c of W.cities) if (Math.abs(c.x - jx) < 650 && Math.abs(c.z - jz) < 650 && Math.hypot(c.x - jx, c.z - jz) < 640) { nearCity = true; break; }
        if (nearCity) continue;
        if (key < 60) {
          const q = query(jx, jz);
          if (q && q.d < q.e.W + 9) continue;
        }
        let inYard = false;
        for (const y of W.yards) if (Math.abs(y.cx - jx) < 120 && Math.abs(y.cz - jz) < 120 && distToYard(y, jx, jz) < 12) { inYard = true; break; }
        if (inYard) continue;
        const coniferP = h > 250 ? 0.95 : 0.25 + 0.5 * U.smoothstep(-0.3, 0.3, n4(jx / 1300, jz / 1300));
        const type = tr() < coniferP ? 0 : 1;
        const ck = Math.floor((jx + TS) / TCH) * 100 + Math.floor((jz + TS) / TCH);
        let ch = tchunks.get(ck);
        if (!ch) tchunks.set(ck, (ch = [[], []]));
        const sc = 0.75 + tr() * 0.6;
        ch[type].push(jx, h - 0.2, jz, sc, tr() * 6.28, 0.8 + tr() * 0.3);
        if (!outside && key < 400) addCircle(jx, jz, 0.5 * sc, 'tree');
      }
    }
    W.treeMeshes = [];
    let treeCount = 0;
    for (const ch of tchunks.values()) {
      ch.forEach((arr, type) => {
        const n = arr.length / 6;
        if (!n) return;
        const im = new THREE.InstancedMesh(type ? broad : conifer, treeMat, n);
        for (let k = 0; k < n; k++) {
          const o = k * 6;
          dummy.position.set(arr[o], arr[o + 1], arr[o + 2]);
          dummy.rotation.set(0, arr[o + 4], 0);
          dummy.scale.set(arr[o + 3], arr[o + 3] * (0.9 + (arr[o + 5] - 0.8)), arr[o + 3]);
          dummy.updateMatrix();
          im.setMatrixAt(k, dummy.matrix);
          tcol.setRGB(arr[o + 5], arr[o + 5] * (0.95 + (k % 7) * 0.012), arr[o + 5] * 0.9);
          im.setColorAt(k, tcol);
        }
        im.computeBoundingSphere();
        im.castShadow = !!Q.treeShadows;
        im.receiveShadow = false;
        scene.add(im);
        W.treeMeshes.push(im);
        treeCount += n;
      });
    }
    W.treeCount = treeCount;
    progress(0.88, 'Forests planted');
    await tick();

    // ---------------------------------------------------------------- roadside furniture: reflector posts, lights, signs, speed cameras, turbines
    const postGeo = U.merge([
      U.part(new THREE.BoxGeometry(0.12, 1.0, 0.12), 0xf2f2ee, 0, 0.5, 0),
      U.part(new THREE.BoxGeometry(0.125, 0.25, 0.125), 0x1a1a1a, 0, 0.82, 0),
      U.part(new THREE.BoxGeometry(0.05, 0.12, 0.13), 0xd8d8d8, 0, 0.82, 0),
    ]);
    const posts = [];
    for (const e of W.edges) {
      if (e.type === 'spur') continue;
      for (let s = e.trimA + 25; s < e.len - e.trimB - 25; s += 50) for (const sg of [-1, 1]) {
        const p = W.edgePoint(e, s, sg * (e.W + 0.4));
        posts.push(p.x, p.y, p.z, Math.atan2(p.tx, p.tz));
      }
    }
    {
      const im = new THREE.InstancedMesh(postGeo, mats.vc, posts.length / 4);
      for (let k = 0; k < posts.length / 4; k++) {
        dummy.position.set(posts[k * 4], posts[k * 4 + 1], posts[k * 4 + 2]);
        dummy.rotation.set(0, posts[k * 4 + 3], 0); dummy.scale.set(1, 1, 1);
        dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix);
      }
      im.computeBoundingSphere();
      scene.add(im);
    }
    // street lights along spurs and around roundabouts
    for (const e of W.edges) if (e.type === 'spur') {
      for (let s = PAD_R + 20; s < e.len - 8; s += 36) {
        const p = W.edgePoint(e, s, e.W + 1.2);
        W.lampPos.push({ x: p.x, y: p.y + 9, z: p.z, h: Math.atan2(p.tz, -p.tx), arm: true, ground: p.y });
        addCircle(p.x, p.z, 0.25, 'pole');
      }
    }
    for (const nd of W.nodes) if (nd.type === 'city') {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        let clear = true;
        for (const l of nd.links) if (angDiff(a, l.ang) < 0.42) clear = false;
        if (!clear) continue;
        const x = nd.x + Math.cos(a) * (nd.R + 3), z = nd.z + Math.sin(a) * (nd.R + 3);
        W.lampPos.push({ x, y: nd.h + 9, z, h: Math.atan2(-Math.cos(a), -Math.sin(a)), arm: true, ground: nd.h });
        addCircle(x, z, 0.25, 'pole');
      }
    }
    {
      const poleGeo = U.merge([
        U.part(new THREE.CylinderGeometry(0.08, 0.13, 9, 6), 0x7d8288, 0, -4.5, 0),
        U.part(new THREE.BoxGeometry(0.1, 0.1, 2.2), 0x7d8288, 0, 0, 1.1),
      ]);
      const headGeo = new THREE.BoxGeometry(0.45, 0.14, 0.9);
      const n = W.lampPos.length;
      const poles = new THREE.InstancedMesh(poleGeo, mats.vc, n), heads = new THREE.InstancedMesh(headGeo, mats.lamp, n);
      const poolGeo = new THREE.CircleGeometry(10, 20);
      poolGeo.rotateX(-Math.PI / 2);
      const poolTex = (() => {
        const c = U.canvas(64, 64), x = c.getContext('2d');
        const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,214,150,1)'); g.addColorStop(0.5, 'rgba(255,200,130,0.45)'); g.addColorStop(1, 'rgba(255,190,120,0)');
        x.fillStyle = g; x.fillRect(0, 0, 64, 64);
        return U.tex(c, { clamp: true });
      })();
      const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const pools = new THREE.InstancedMesh(poolGeo, poolMat, n);
      W.lampPos.forEach((l, k) => {
        dummy.position.set(l.x, l.y, l.z); dummy.rotation.set(0, l.h, 0); dummy.scale.set(1, l.mast ? 12 / 9 : 1, 1);
        if (l.mast) { dummy.scale.set(1, 1, 0.01); }
        dummy.updateMatrix(); poles.setMatrixAt(k, dummy.matrix);
        const hx = l.arm ? l.x + Math.sin(l.h) * 2.1 : l.x, hz = l.arm ? l.z + Math.cos(l.h) * 2.1 : l.z;
        dummy.position.set(hx, l.y - 0.1, hz); dummy.scale.set(l.mast ? 2 : 1, 1, l.mast ? 1.2 : 1); dummy.updateMatrix(); heads.setMatrixAt(k, dummy.matrix);
        dummy.position.set(hx, l.ground + 0.08, hz); dummy.rotation.set(0, 0, 0); dummy.scale.set(l.mast ? 2.2 : 1, 1, l.mast ? 2.2 : 1); dummy.updateMatrix(); pools.setMatrixAt(k, dummy.matrix);
      });
      for (const im of [poles, heads, pools]) { im.computeBoundingSphere(); scene.add(im); }
      W.lampHeads = heads; W.lampPools = poolMat; W.lampMat = mats.lamp;
    }

    // signs
    const signMats = {};
    function signTexture(kind, a, b) {
      const key = kind + a + (b || '');
      if (signMats[key]) return signMats[key];
      const w = kind === 'limit' ? 256 : 512, h = kind === 'limit' ? 340 : 256;
      const c = U.canvas(w, h), x = c.getContext('2d');
      const font = (s, wt = 600) => `${wt} ${s}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
      if (kind === 'dir') {
        x.fillStyle = b === 'road' ? '#f2c200' : '#1f4ea1'; x.fillRect(0, 0, w, h);
        x.strokeStyle = b === 'road' ? '#111' : '#fff'; x.lineWidth = 10; x.strokeRect(12, 12, w - 24, h - 24);
        x.fillStyle = b === 'road' ? '#111' : '#fff'; x.textBaseline = 'middle';
        a.forEach((ln, i) => {
          x.font = font(64); x.textAlign = 'left'; x.fillText(ln[0], 40, 72 + i * 92, 300);
          x.textAlign = 'right'; x.fillText(ln[1], w - 40, 72 + i * 92);
        });
      } else if (kind === 'city') {
        x.fillStyle = '#f2c200'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#111'; x.lineWidth = 12; x.strokeRect(14, 14, w - 28, h - 28);
        x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = font(110, 700); x.fillText(a, w / 2, h / 2 - 12, w - 70);
        x.font = font(40); x.fillText(b, w / 2, h - 52);
      } else if (kind === 'cityend') {
        x.fillStyle = '#f2c200'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#111'; x.lineWidth = 12; x.strokeRect(14, 14, w - 28, h - 28);
        x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = font(100, 700); x.fillText(a, w / 2, h / 2, w - 70);
        x.strokeStyle = '#c4161c'; x.lineWidth = 26; x.beginPath(); x.moveTo(40, h - 30); x.lineTo(w - 40, 30); x.stroke();
      } else if (kind === 'limit') {
        x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, 128, 120, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#c4161c'; x.lineWidth = 26; x.beginPath(); x.arc(w / 2, 128, 104, 0, Math.PI * 2); x.stroke();
        x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = font(110, 700); x.fillText(a, w / 2, 134);
        x.fillStyle = '#fff'; x.fillRect(48, 262, w - 96, 70); x.strokeStyle = '#111'; x.lineWidth = 5; x.strokeRect(48, 262, w - 96, 70);
        x.fillStyle = '#111'; x.font = font(52, 700); x.fillText('LKW', w / 2, 300);
      }
      const t = U.tex(c, { clamp: true });
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, transparent: kind === 'limit', alphaTest: 0.5 });
      signMats[key] = m;
      return m;
    }
    const backMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.6, metalness: 0.4 });
    const postGeoSign = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
    function sign(e, s, dir, kind, a, b, pw, ph, mount = 2.2) {
      const se = dir > 0 ? s : e.len - s, off = dir > 0 ? e.W + 1.6 : -(e.W + 1.6);
      const p = W.edgePoint(e, se, off);
      const tx = p.tx * dir, tz = p.tz * dir;
      const h = Math.atan2(-tx, -tz);
      const mat = signTexture(kind, a, b);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.08), [backMat, backMat, backMat, backMat, mat, backMat]);
      plate.position.set(p.x, p.y + mount + ph / 2, p.z);
      plate.rotation.y = h;
      plate.castShadow = true;
      scene.add(plate);
      for (const sx of pw > 2 ? [-pw / 3, pw / 3] : [0]) {
        const px2 = p.x + Math.cos(h) * sx - tx * 0.08, pz2 = p.z - Math.sin(h) * sx - tz * 0.08;
        placeMesh(postGeoSign, mats.steel, px2, p.y + (mount + ph) / 2, pz2, 0, 1, mount + ph, 1, false);
        addCircle(px2, pz2, 0.15, 'pole');
      }
    }
    const kmTxt = (m) => (m / 1000).toFixed(1).replace('.', ',') + ' km';
    for (const e of W.edges) {
      if (e.type === 'spur') continue;
      for (const dir of [1, -1]) {
        const from = dir > 0 ? e.a : e.b, to = dir > 0 ? e.b : e.a;
        const s0 = dir > 0 ? e.trimA : e.trimB, sEnd = e.len - (dir > 0 ? e.trimB : e.trimA);
        sign(e, s0 + 70, dir, 'cityend', from.city.name, '', 3.2, 1.6, 1.4);
        sign(e, s0 + 160, dir, 'limit', String(e.cfg.limit), '', 1.0, 1.33, 1.6);
        // distance board: next city, then the cities beyond
        const lines = [[to.city.name, kmTxt(e.len)]];
        for (const l of to.links) if (l.other !== from && l.e.type !== 'spur' && lines.length < 2) lines.push([l.other.city.name, kmTxt(e.len + l.e.len)]);
        sign(e, s0 + 280, dir, 'dir', lines, e.type, 5.2, 2.6, 2.2);
        sign(e, sEnd - 280, dir, 'city', to.city.name, to.city.country === 'DE' ? (e.ref || '') : to.city.country === 'CZ' ? 'Česko' : 'Österreich', 3.2, 1.6, 1.4);
        sign(e, sEnd - 200, dir, 'limit', '50', '', 1.0, 1.33, 1.6);
        // speed camera half way
        const sc = e.len * (0.4 + rand() * 0.2);
        const se = dir > 0 ? sc : e.len - sc;
        const p = W.edgePoint(e, se, dir * (e.W + 1.4));
        placeMesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.6 }), p.x, p.y + 1.6, p.z, Math.atan2(-p.tx * dir, -p.tz * dir), 0.5, 3.2, 0.5);
        placeMesh(boxGeo, mats.white, p.x, p.y + 2.6, p.z, Math.atan2(-p.tx * dir, -p.tz * dir), 0.55, 0.5, 0.55, false);
        addCircle(p.x, p.z, 0.35, 'pole');
        W.cams.push({ e, dir, s: sc, x: p.x, z: p.z, limit: e.cfg.limit });
      }
    }
    // wind turbines up north
    {
      const tpos = [];
      const r = U.rng(5);
      for (let t = 0; t < 600 && tpos.length < 34; t++) {
        const x = (r() - 0.5) * 2 * (HALF - 300), z = -4300 + r() * 2900;
        if (terrainH(x, z) < 3) continue;
        if (KEY[U.clamp(vIdx(z), 0, NV - 1) * NV + U.clamp(vIdx(x), 0, NV - 1)] < 130) continue;
        if (W.cities.some((c) => Math.hypot(c.x - x, c.z - z) < 900)) continue;
        if (tpos.some((p) => Math.hypot(p.x - x, p.z - z) < 260)) continue;
        tpos.push({ x, z, y: terrainH(x, z) - 0.5, a: r() * 6.28, sp: 0.9 + r() * 0.5 });
      }
      const towerGeo = U.merge([U.part(new THREE.CylinderGeometry(1.4, 2.6, 78, 10), 0xeceeef, 0, 39, 0), U.part(new THREE.BoxGeometry(2.6, 3, 8), 0xeceeef, 0, 79, -1)]);
      const bladeParts = [U.part(new THREE.SphereGeometry(1.5, 10, 8), 0xeceeef, 0, 0, 0)];
      for (let k = 0; k < 3; k++) bladeParts.push(U.part(new THREE.BoxGeometry(0.4, 36, 1.6), 0xf2f3f4, Math.sin((k * 2 * Math.PI) / 3) * 18, Math.cos((k * 2 * Math.PI) / 3) * 18, 0, 0, 0, -(k * 2 * Math.PI) / 3));
      const rotorGeo = U.merge(bladeParts);
      const towers = new THREE.InstancedMesh(towerGeo, mats.vc, tpos.length), rotors = new THREE.InstancedMesh(rotorGeo, mats.vc, tpos.length);
      tpos.forEach((p, k) => {
        dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, 0.8, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); towers.setMatrixAt(k, dummy.matrix);
        addCircle(p.x, p.z, 2.8, 'turbine');
      });
      towers.castShadow = true; rotors.castShadow = true;
      towers.computeBoundingSphere();
      scene.add(towers, rotors);
      rotors.frustumCulled = false;
      W.turbines = { mesh: rotors, list: tpos, dummy: new THREE.Object3D() };
    }
    progress(0.95, 'Signs posted');
    await tick();

    // ---------------------------------------------------------------- surface queries for physics
    const surf = { h: 0, kind: 'grass', grip: 1, roll: 0.03, edge: null, lat: 0, s: 0, node: null };
    W.surface = (x, z) => {
      surf.edge = null; surf.node = null;
      for (const y of W.yards) {
        if (Math.abs(y.cx - x) > 80 || Math.abs(y.cz - z) > 80) continue;
        const l = W.worldToYard(y, x, z);
        if (Math.abs(l.lx) <= y.hw && Math.abs(l.lz) <= y.hl) { surf.h = y.y + 0.03; surf.kind = 'yard'; surf.grip = 1; surf.roll = 0.007; surf.yard = y; return surf; }
      }
      for (const c of W.cities) {
        const nd = c.node, dx = x - nd.x, dz = z - nd.z;
        if (Math.abs(dx) > nd.R || Math.abs(dz) > nd.R) continue;
        const d = Math.hypot(dx, dz);
        if (d <= nd.R) {
          surf.node = nd;
          if (d < ISLAND_R) { surf.h = nd.h + 0.36; surf.kind = 'grass'; surf.grip = 0.7; surf.roll = 0.04; return surf; }
          surf.h = nd.h + 0.02 + (d < APRON_R ? 0.05 : 0); surf.kind = d < APRON_R ? 'apron' : 'road'; surf.grip = 1; surf.roll = d < APRON_R ? 0.012 : 0.0065; return surf;
        }
      }
      const q = query(x, z);
      if (q) {
        const a = Math.abs(q.lat);
        if (a <= q.e.W) { surf.h = q.h; surf.kind = 'road'; surf.grip = 1; surf.roll = 0.0065; surf.edge = q.e; surf.lat = q.lat; surf.s = q.s; return surf; }
        if (a <= q.e.W + 2.6) {
          const t = (a - q.e.W) / 2.6;
          const th = terrainH(x, z);
          surf.h = Math.max(U.lerp(q.h, q.h - 0.5, t), th); surf.kind = 'gravel'; surf.grip = 0.75; surf.roll = 0.02; surf.edge = q.e; surf.lat = q.lat; surf.s = q.s; return surf;
        }
      }
      surf.h = terrainH(x, z); surf.kind = surf.h < -0.6 ? 'water' : 'grass'; surf.grip = 0.62; surf.roll = 0.035;
      return surf;
    };
    W.depotAt = (x, z) => {
      for (const d of W.depots) {
        const y = d.yard;
        if (Math.abs(y.cx - x) > 90 || Math.abs(y.cz - z) > 90) continue;
        const l = W.worldToYard(y, x, z);
        if (Math.abs(l.lx) <= y.hw && Math.abs(l.lz) <= y.hl) return { depot: d, lx: l.lx, lz: l.lz };
      }
      return null;
    };
    W.nearestCity = (x, z) => {
      let best = null, bd = 1e9;
      for (const c of W.cities) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
      return { city: best, d: bd };
    };

    // ---------------------------------------------------------------- routing (A* on the road graph)
    // multi-source A*: sources = [{ node, d }] (distance already driven to reach that node)
    W.routeMulti = (sources, targetNode) => {
      const dist = new Map(), prev = new Map(), open = [];
      const hfn = (n) => Math.hypot(n.x - targetNode.x, n.z - targetNode.z);
      for (const src of sources) {
        if (!dist.has(src.node.id) || dist.get(src.node.id) > src.d) {
          dist.set(src.node.id, src.d); prev.set(src.node.id, null);
          open.push({ n: src.node, f: src.d + hfn(src.node) });
        }
      }
      const done = new Set();
      while (open.length) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
        const cur = open.splice(bi, 1)[0].n;
        if (done.has(cur.id)) continue;
        done.add(cur.id);
        if (cur === targetNode) break;
        for (const l of cur.links) {
          if (l.e.type === 'spur' && l.other !== targetNode && l.other.type !== 'city') continue;
          const nd = dist.get(cur.id) + l.e.len;
          if (nd < (dist.has(l.other.id) ? dist.get(l.other.id) : 1e12)) {
            dist.set(l.other.id, nd); prev.set(l.other.id, { node: cur, link: l });
            open.push({ n: l.other, f: nd + hfn(l.other) });
          }
        }
      }
      if (!dist.has(targetNode.id)) return null;
      const steps = [];
      let n = targetNode;
      while (prev.get(n.id)) { const p = prev.get(n.id); steps.unshift({ from: p.node, to: n, e: p.link.e, dir: p.link.dir }); n = p.node; }
      return { first: n, steps, length: dist.get(targetNode.id) };
    };
    W.routeBetween = (nodeA, nodeB) => {
      // node to node distance (used for job distances)
      const dist = new Map([[nodeA.id, 0]]), done = new Set(), open = [nodeA];
      while (open.length) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (dist.get(open[i].id) < dist.get(open[bi].id)) bi = i;
        const cur = open.splice(bi, 1)[0];
        if (done.has(cur.id)) continue;
        done.add(cur.id);
        if (cur === nodeB) return dist.get(cur.id);
        for (const l of cur.links) {
          if (l.e.type === 'spur' && l.other !== nodeB && l.other.type !== 'city') continue;
          const nd = dist.get(cur.id) + l.e.len;
          if (nd < (dist.has(l.other.id) ? dist.get(l.other.id) : 1e12)) { dist.set(l.other.id, nd); open.push(l.other); }
        }
      }
      return Infinity;
    };
    progress(1, 'Ready');
    return W;
  }
  return { build };
})();
