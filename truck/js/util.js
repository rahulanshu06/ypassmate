'use strict';
// Shared namespace + small math / noise / geometry helpers.
// Conventions: world units are metres, Y is up, a vehicle's local +Z is forward and local +X is its LEFT.
// 2D positions are (x, z). Heading h means forward = (sin h, cos h).
window.G = window.G || {};

G.U = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Classic 2D Perlin noise, output roughly -1..1
  function makeNoise(seed) {
    const r = rng(seed);
    const perm = [];
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    const p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const gx = [1, -1, 1, -1, 1.4142, -1.4142, 0, 0];
    const gz = [1, 1, -1, -1, 0, 0, 1.4142, -1.4142];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    return function (x, y) {
      const X = Math.floor(x), Y = Math.floor(y);
      x -= X; y -= Y;
      const xi = X & 255, yi = Y & 255;
      const u = fade(x), v = fade(y);
      const aa = p[p[xi] + yi] & 7, ab = p[p[xi] + yi + 1] & 7;
      const ba = p[p[xi + 1] + yi] & 7, bb = p[p[xi + 1] + yi + 1] & 7;
      const n00 = gx[aa] * x + gz[aa] * y;
      const n10 = gx[ba] * (x - 1) + gz[ba] * y;
      const n01 = gx[ab] * x + gz[ab] * (y - 1);
      const n11 = gx[bb] * (x - 1) + gz[bb] * (y - 1);
      return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 0.85;
    };
  }
  function fbm(n, x, y, oct, lac = 2, gain = 0.5) {
    let s = 0, a = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += n(x * f, y * f) * a;
      norm += a; a *= gain; f *= lac;
    }
    return s / norm;
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function tex(c, opts = {}) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = G.maxAniso || 4;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    return t;
  }

  // Bake a primitive into a non-indexed geometry with a vertex colour, transformed by position/rotation/scale.
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function part(geom, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return g;
  }
  function merge(list) {
    let n = 0;
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    let o = 0;
    for (let g of list) {
      if (g.index) g = g.toNonIndexed();
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (!g.attributes.normal) g.computeVertexNormals();
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
      else col.fill(1, o * 3, (o + c) * 3);
      o += c;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }

  // Oriented box in the XZ plane, used for all collision tests.
  function obb(cx, cz, ang, hw, hl) {
    return { cx, cz, s: Math.sin(ang), c: Math.cos(ang), hw, hl, ang };
  }
  function setObb(o, cx, cz, ang, hw, hl) {
    o.cx = cx; o.cz = cz; o.s = Math.sin(ang); o.c = Math.cos(ang); o.hw = hw; o.hl = hl; o.ang = ang;
    return o;
  }
  // local axes: forward f = (s, c), left l = (c, -s)
  function obbOverlap(a, b) {
    const axes = [[a.s, a.c], [a.c, -a.s], [b.s, b.c], [b.c, -b.s]];
    const dx = b.cx - a.cx, dz = b.cz - a.cz;
    for (const [ax, az] of axes) {
      const ra = a.hl * Math.abs(a.s * ax + a.c * az) + a.hw * Math.abs(a.c * ax - a.s * az);
      const rb = b.hl * Math.abs(b.s * ax + b.c * az) + b.hw * Math.abs(b.c * ax - b.s * az);
      if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
    }
    return true;
  }
  function obbCircle(a, cx, cz, r) {
    const dx = cx - a.cx, dz = cz - a.cz;
    const lf = dx * a.s + dz * a.c, ll = dx * a.c - dz * a.s;
    const qf = clamp(lf, -a.hl, a.hl), ql = clamp(ll, -a.hw, a.hw);
    return (lf - qf) ** 2 + (ll - ql) ** 2 < r * r;
  }
  function pointInObb(a, x, z, m = 0) {
    const dx = x - a.cx, dz = z - a.cz;
    return Math.abs(dx * a.s + dz * a.c) < a.hl + m && Math.abs(dx * a.c - dz * a.s) < a.hw + m;
  }
  function obbCorners(a, out) {
    const fx = a.s * a.hl, fz = a.c * a.hl, lx = a.c * a.hw, lz = -a.s * a.hw;
    out[0] = a.cx + fx + lx; out[1] = a.cz + fz + lz;
    out[2] = a.cx + fx - lx; out[3] = a.cz + fz - lz;
    out[4] = a.cx - fx - lx; out[5] = a.cz - fz - lz;
    out[6] = a.cx - fx + lx; out[7] = a.cz - fz + lz;
    return out;
  }

  const fmtMoney = (v) => (v < 0 ? '−' : '') + '€' + Math.round(Math.abs(v)).toLocaleString('de-DE');
  const fmtTime = (mins) => {
    const m = ((Math.floor(mins) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  const fmtDur = (mins) => {
    mins = Math.max(0, Math.round(mins));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
  };

  return {
    clamp, lerp, smoothstep, wrapAngle, damp, rng, makeNoise, fbm, canvas, tex, part, merge,
    obb, setObb, obbOverlap, obbCircle, pointInObb, obbCorners, fmtMoney, fmtTime, fmtDur,
  };
})();
