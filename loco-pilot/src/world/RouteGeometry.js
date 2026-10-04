import { clamp, G, DEG } from '../core/MathUtil.js';

// Rail head spacing used for cant (superelevation) on Indian broad gauge.
export const CANT_BASE = 1.75;
export const MAX_CANT = 0.165; // 165 mm, the usual broad-gauge ceiling
export const CANT_DEFICIENCY = 0.075; // 75 mm

/**
 * Horizontal + vertical alignment of a route centreline, sampled every metre.
 * Heading h: tangent = (cos h, sin h) in the XZ plane. Right-hand normal = (-sin h, cos h).
 * Positive curvature turns to the right (towards +normal).
 */
export class RouteGeometry {
  constructor(def) {
    this.step = 1;
    const elements = this.expandElements(def.alignment, def.designSpeed || 90);
    this.elements = elements;
    const L = elements.length ? elements[elements.length - 1].s1 : 1000;
    this.length = L;
    const N = Math.ceil(L / this.step) + 2;
    this.n = N;
    this.x = new Float64Array(N);
    this.z = new Float64Array(N);
    this.h = new Float64Array(N);
    this.k = new Float64Array(N);
    this.elev = new Float64Array(N);
    this.grade = new Float32Array(N);
    this.cant = new Float32Array(N); // cant angle in radians, + banks to the right
    this.cantSpeed = new Float32Array(N);

    let x = def.start.x, z = def.start.z, h = def.start.heading * DEG;
    let ei = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.step;
      while (ei < elements.length - 1 && s > elements[ei].s1) ei++;
      const k = this.curvatureIn(elements[ei], s);
      this.x[i] = x;
      this.z[i] = z;
      this.h[i] = h;
      this.k[i] = k;
      this.cantSpeed[i] = elements[ei].cantSpeed;
      // midpoint integration
      const sMid = s + this.step * 0.5;
      let ej = ei;
      while (ej < elements.length - 1 && sMid > elements[ej].s1) ej++;
      const kMid = this.curvatureIn(elements[ej], sMid);
      const hMid = h + kMid * this.step * 0.5;
      x += Math.cos(hMid) * this.step;
      z += Math.sin(hMid) * this.step;
      h += kMid * this.step;
    }

    // Cant from curvature and the element's design speed.
    for (let i = 0; i < N; i++) {
      const k = this.k[i];
      const v = this.cantSpeed[i] / 3.6;
      const c = Math.min(MAX_CANT, (CANT_BASE * v * v * Math.abs(k)) / G);
      this.cant[i] = Math.sign(k) * Math.asin(c / CANT_BASE);
    }

    this.buildProfile(def.profile || [[0, 0], [L, 0]]);
  }

  expandElements(list, designSpeed) {
    const out = [];
    let s = 0;
    for (const e of list) {
      if (e.type === 'straight') {
        out.push({ type: 'straight', s0: s, s1: s + e.length, cantSpeed: designSpeed });
        s += e.length;
      } else if (e.type === 'curve') {
        const R = e.radius;
        const A = Math.abs(e.angle) * DEG;
        const Lt = Math.min(e.transition ?? 60, A * R * 0.98);
        const Lc = Math.max(0, A * R - Lt);
        const sign = e.dir === 'L' ? -1 : 1;
        out.push({
          type: 'curve', s0: s, s1: s + Lc + 2 * Lt, R, Lt, Lc, kMax: sign / R,
          cantSpeed: e.cantSpeed || designSpeed, name: e.name,
        });
        s += Lc + 2 * Lt;
      }
    }
    return out;
  }

  curvatureIn(e, s) {
    if (!e || e.type !== 'curve') return 0;
    const u = s - e.s0;
    if (u < 0) return 0;
    if (u < e.Lt) return e.kMax * (u / e.Lt);
    if (u < e.Lt + e.Lc) return e.kMax;
    const w = u - e.Lt - e.Lc;
    if (w < e.Lt) return e.kMax * (1 - w / e.Lt);
    return 0;
  }

  buildProfile(points) {
    const N = this.n;
    const raw = new Float64Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.step;
      while (j < points.length - 2 && s > points[j + 1][0]) j++;
      const [s0, e0] = points[j];
      const [s1, e1] = points[Math.min(j + 1, points.length - 1)];
      const t = s1 === s0 ? 0 : clamp((s - s0) / (s1 - s0), 0, 1);
      raw[i] = e0 + (e1 - e0) * t;
    }
    // Two box-filter passes approximate parabolic vertical curves (~300 m).
    const smooth = (src, half) => {
      const dst = new Float64Array(N);
      let acc = 0;
      const get = (i) => src[clamp(i, 0, N - 1)];
      for (let i = -half; i <= half; i++) acc += get(i);
      for (let i = 0; i < N; i++) {
        dst[i] = acc / (2 * half + 1);
        acc += get(i + half + 1) - get(i - half);
      }
      return dst;
    };
    const e = smooth(smooth(raw, 90), 90);
    this.elev.set(e);
    for (let i = 0; i < N; i++) {
      const a = e[Math.max(0, i - 1)], b = e[Math.min(N - 1, i + 1)];
      this.grade[i] = (b - a) / (2 * this.step);
    }
  }

  index(s) {
    const f = clamp(s / this.step, 0, this.n - 1.001);
    const i = Math.floor(f);
    return [i, f - i];
  }

  sample(s, out = {}) {
    const [i, t] = this.index(s);
    const j = i + 1;
    const h = this.h[i] + (this.h[j] - this.h[i]) * t;
    out.s = s;
    out.x = this.x[i] + (this.x[j] - this.x[i]) * t;
    out.z = this.z[i] + (this.z[j] - this.z[i]) * t;
    out.y = this.elev[i] + (this.elev[j] - this.elev[i]) * t;
    out.h = h;
    out.tx = Math.cos(h);
    out.tz = Math.sin(h);
    out.nx = -out.tz;
    out.nz = out.tx;
    out.k = this.k[i] + (this.k[j] - this.k[i]) * t;
    out.grade = this.grade[i] + (this.grade[j] - this.grade[i]) * t;
    out.cant = this.cant[i] + (this.cant[j] - this.cant[i]) * t;
    // Extrapolate beyond the ends along the end tangent so vehicles can overhang.
    if (s < 0) {
      out.x += out.tx * s;
      out.z += out.tz * s;
    } else if (s > this.length) {
      const d = s - this.length;
      out.x += out.tx * d;
      out.z += out.tz * d;
    }
    return out;
  }

  elevationAt(s) {
    const [i, t] = this.index(s);
    return this.elev[i] + (this.elev[i + 1] - this.elev[i]) * t;
  }
  gradeAt(s) {
    const [i, t] = this.index(s);
    return this.grade[i] + (this.grade[i + 1] - this.grade[i]) * t;
  }
  curvatureAt(s) {
    const [i, t] = this.index(s);
    return this.k[i] + (this.k[i + 1] - this.k[i]) * t;
  }
  cantAt(s) {
    const [i, t] = this.index(s);
    return this.cant[i] + (this.cant[i + 1] - this.cant[i]) * t;
  }

  // Maximum comfortable speed (m/s) on a curve given cant + allowed deficiency.
  curveSpeedLimit(s) {
    const k = Math.abs(this.curvatureAt(s));
    if (k < 1e-6) return Infinity;
    const c = Math.abs(Math.sin(this.cantAt(s))) * CANT_BASE;
    return Math.sqrt(((c + CANT_DEFICIENCY) * G) / (CANT_BASE * k));
  }
}

/** Spatial index of centreline samples for nearest-point queries (terrain, scenery). */
export class RouteIndex {
  constructor(geo) {
    this.geo = geo;
    this.fine = this.buildGrid(4, 64);
    this.mid = this.buildGrid(25, 512);
    this.coarse = [];
    for (let s = 0; s <= geo.length; s += 50) this.coarse.push(s);
  }
  buildGrid(step, cell) {
    const geo = this.geo;
    const map = new Map();
    for (let s = 0; s <= geo.length; s += step) {
      const i = Math.round(s);
      const key = this.key(Math.floor(geo.x[i] / cell), Math.floor(geo.z[i] / cell));
      let arr = map.get(key);
      if (!arr) map.set(key, (arr = []));
      arr.push(i);
    }
    return { map, cell };
  }
  key(cx, cz) {
    return (cx * 73856093) ^ (cz * 19349663);
  }
  searchGrid(grid, x, z, rings) {
    const geo = this.geo;
    const cx = Math.floor(x / grid.cell), cz = Math.floor(z / grid.cell);
    let best = -1, bestD = Infinity;
    for (let dx = -rings; dx <= rings; dx++) {
      for (let dz = -rings; dz <= rings; dz++) {
        const arr = grid.map.get(this.key(cx + dx, cz + dz));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const i = arr[k];
          const ddx = geo.x[i] - x, ddz = geo.z[i] - z;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < bestD) {
            bestD = d2;
            best = i;
          }
        }
      }
    }
    // Only trust the result if it lies within the searched radius.
    if (best >= 0 && Math.sqrt(bestD) <= grid.cell * rings) return best;
    return -1;
  }
  /** Nearest centreline point: { s, d (signed lateral, + = right), dist, along (beyond ends) }. */
  nearest(x, z, out = {}) {
    const geo = this.geo;
    let best = this.searchGrid(this.fine, x, z, 1);
    if (best < 0) best = this.searchGrid(this.mid, x, z, 1);
    if (best < 0) best = this.searchGrid(this.mid, x, z, 3);
    if (best < 0) {
      let bestD = Infinity;
      for (const s of this.coarse) {
        const i = Math.round(s);
        const ddx = geo.x[i] - x, ddz = geo.z[i] - z;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < bestD) {
          bestD = d2;
          best = i;
        }
      }
    }
    let s = best;
    let along = 0;
    for (let it = 0; it < 3; it++) {
      const i = Math.round(clamp(s, 0, geo.length));
      const h = geo.h[i];
      const a = (x - geo.x[i]) * Math.cos(h) + (z - geo.z[i]) * Math.sin(h);
      const ns = i + a;
      along = ns < 0 ? ns : ns > geo.length ? ns - geo.length : 0;
      s = clamp(ns, 0, geo.length);
    }
    const i = Math.round(s);
    const h = geo.h[i];
    const lx = x - geo.x[i], lz = z - geo.z[i];
    out.s = s;
    out.d = -lx * Math.sin(h) + lz * Math.cos(h);
    out.along = along;
    out.dist = Math.hypot(out.d, along);
    return out;
  }
}
