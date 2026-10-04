import { SimplexNoise } from '../core/Noise.js';
import { RouteIndex } from './RouteGeometry.js';
import { clamp, smoothstep, lerp, DEG } from '../core/MathUtil.js';

export const FORMATION_DROP = 0.72; // terrain below rail top under the track bed

/**
 * Procedural height + biome field for the whole map. Shapes natural terrain (plains, hills,
 * river valley) and then carves/fills a corridor for the railway formation, station yards,
 * cuttings and embankments.
 */
export class TerrainSampler {
  constructor(def, geo, network) {
    this.def = def;
    this.geo = geo;
    this.network = network;
    this.noise = new SimplexNoise(def.seed);
    this.noise2 = new SimplexNoise(def.seed * 7 + 3);
    this.index = new RouteIndex(geo);
    this.base = def.terrain.baseHeight;
    this.tmp = {};
    // station yard flattening zones
    this.yards = network.stations.map((st) => {
      let lo = -7.5, hi = 7.5;
      for (const t of st.tracks || []) {
        lo = Math.min(lo, t.offset - 6);
        hi = Math.max(hi, t.offset + 6);
      }
      for (const sd of st.sidings || []) {
        lo = Math.min(lo, sd.offset - 6);
        hi = Math.max(hi, sd.offset + 6);
      }
      for (const p of st.platforms) {
        lo = Math.min(lo, p.a - 4);
        hi = Math.max(hi, p.b + 4);
      }
      const b = st.building;
      if (b) {
        if (b.lateral < 0) lo = Math.min(lo, b.lateral - 34);
        else hi = Math.max(hi, b.lateral + 34);
      }
      if (st.goodsShed) lo = Math.min(lo, st.goodsShed.lateral - 22);
      const s0 = Math.min(st.limits[1].first, st.limits[-1].last) - 160;
      const s1 = Math.max(st.limits[1].last, st.limits[-1].first) + 160;
      return { s0: st.terminus === 'start' ? -400 : s0, s1, lo, hi, elev: geo.elevationAt(st.sCenter) };
    });
    // features that suspend the corridor flattening
    this.bridges = (def.bridges || []).map((b) => ({ s0: b.s0 + 4, s1: b.s1 - 4 }));
    this.tunnels = [...(def.tunnels || []).map((t) => ({ s0: t.s0, s1: t.s1 }))];
    if (def.endTunnel) this.tunnels.push({ s0: def.endTunnel.s, s1: geo.length + 4000 });
    this.holes = [];
    for (const t of this.tunnels) {
      this.holes.push({ s0: t.s0 - 2, s1: t.s0 + 26, w: 9 });
      if (t.s1 < geo.length) this.holes.push({ s0: t.s1 - 26, s1: t.s1 + 2, w: 9 });
    }
    // rivers / streams as straight lines crossing the route
    this.waters = [];
    const addWater = (w, isRiver) => {
      const p = geo.sample(w.s);
      const a = p.h + w.angle * DEG;
      this.waters.push({
        ...w, isRiver, x: p.x, z: p.z, dx: Math.cos(a), dz: Math.sin(a), level: this.base - (isRiver ? 3.5 : 1.2),
      });
    };
    if (def.river) addWater(def.river, true);
    for (const st of def.streams || []) addWater(st, false);
    this.ponds = (def.ponds || []).map((p) => {
      const q = geo.sample(p.s);
      const d = p.side * p.dist;
      return { ...p, x: q.x + q.nx * d, z: q.z + q.nz * d };
    });
    this.villageSpots = (def.villages || []).map((v) => {
      const q = geo.sample(v.s);
      const d = v.side * v.dist;
      return { ...v, x: q.x + q.nx * d, z: q.z + q.nz * d };
    });
  }

  hillStrength(s) {
    const H = this.def.terrain.hills;
    if (s <= H[0][0]) return H[0][1];
    for (let i = 0; i < H.length - 1; i++) {
      if (s <= H[i + 1][0]) {
        const t = smoothstep(H[i][0], H[i + 1][0], s);
        return lerp(H[i][1], H[i + 1][1], t);
      }
    }
    return H[H.length - 1][1];
  }

  regionWeights(s, out) {
    out.city = 0; out.suburb = 0; out.river = 0; out.farmland = 0; out.town = 0; out.forest = 0;
    for (const r of this.def.regions) {
      const w = smoothstep(r.s0 - 250, r.s0 + 250, s) * (1 - smoothstep(r.s1 - 250, r.s1 + 250, s));
      if (w > 0) out[r.kind] += w * r.density;
    }
    return out;
  }

  inRanges(list, s) {
    for (const r of list) if (s >= r.s0 && s <= r.s1) return r;
    return null;
  }

  /** Natural ground before the railway corridor is cut in. */
  natural(x, z, near) {
    const n = this.noise;
    const s = near.s + near.along;
    let h = this.base;
    h += n.fbm(x * 0.0016, z * 0.0016, 3) * 3.2 + n.noise2D(x * 0.011, z * 0.011) * 0.45;
    const hs = this.hillStrength(s);
    if (hs > 0.02) {
      const ridge = n.ridged(x * 0.00052 + 11.3, z * 0.00052 - 4.1, 5);
      const roll = n.fbm(x * 0.0011 + 3.1, z * 0.0011 + 7.7, 4) * 0.5 + 0.5;
      const away = smoothstep(40, 900, near.dist);
      const valley = 0.35 + 0.65 * away;
      h += hs * valley * (ridge * 170 + roll * 55);
    }
    // gentle distant hills everywhere so the horizon is never flat
    const far = smoothstep(1500, 5000, near.dist);
    if (far > 0) h += far * (this.noise2.ridged(x * 0.00035, z * 0.00035, 4) * 140 + 10);
    for (const b of this.def.terrain.bumps) {
      const ds = (s - b.s) / b.along, dd = (near.d - b.lateral) / b.across;
      const q = ds * ds + dd * dd;
      if (q < 9) h += b.height * Math.exp(-q);
    }
    // rivers & streams
    for (const w of this.waters) {
      const rx = x - w.x, rz = z - w.z;
      const dist = Math.abs(rx * -w.dz + rz * w.dx);
      const half = w.width / 2;
      if (dist < half + 120) {
        const bank = w.isRiver ? 90 : 14;
        const t = 1 - smoothstep(half * 0.55, half + bank, dist);
        const bed = this.base - w.depth;
        h = lerp(h, bed, t);
      }
    }
    for (const p of this.ponds) {
      const dd = Math.hypot(x - p.x, z - p.z);
      if (dd < p.r * 1.6) h = lerp(h, this.base - 2.2, 1 - smoothstep(p.r * 0.6, p.r * 1.6, dd));
    }
    return h;
  }

  /** Full sample. out: { h, s, d, dist, hole, farm, urban, forest, sand, rock } */
  sample(x, z, out = {}) {
    const near = this.index.nearest(x, z, this.tmp);
    const s = near.s;
    let h = this.natural(x, z, near);
    out.s = s;
    out.d = near.d;
    out.dist = near.dist;
    out.hole = false;
    const geo = this.geo;
    const rail = geo.elevationAt(s);
    const formation = rail - FORMATION_DROP;
    const tunnel = near.along === 0 || s >= geo.length - 1 ? this.inRanges(this.tunnels, s) : this.inRanges(this.tunnels, s);
    const bridge = near.along === 0 ? this.inRanges(this.bridges, s) : null;
    // corridor bounds (station yards widen it)
    let lo = -7.5, hi = 7.5;
    let yardElev = null;
    for (const y of this.yards) {
      const sAlong = s + near.along;
      if (sAlong >= y.s0 && sAlong <= y.s1) {
        lo = Math.min(lo, y.lo);
        hi = Math.max(hi, y.hi);
        yardElev = y.elev;
      }
    }
    const d = near.d;
    let e = d < lo ? lo - d : d > hi ? d - hi : 0;
    if (near.along !== 0) e = Math.hypot(e, Math.abs(near.along) > 0 && !yardElev ? near.along : 0);
    let corridorW = 1;
    if (bridge) corridorW = 0;
    if (tunnel) {
      const roof = rail + 13;
      const inside = Math.min(s - tunnel.s0, tunnel.s1 - s);
      if (inside > 28) {
        corridorW = 0;
        h = Math.max(h, roof + 4 * smoothstep(28, 60, inside));
      }
    }
    for (const hl of this.holes) {
      if (s >= hl.s0 && s <= hl.s1 && Math.abs(d) < hl.w && near.along === 0) out.hole = true;
    }
    if (corridorW > 0) {
      const target = formation;
      const diff = h - target;
      // fill slopes 1:1.6, cut slopes 1:0.9 (steeper cuttings)
      const lim = diff > 0 ? e * 1.1 : e / 1.6;
      const shaped = target + clamp(diff, -lim, lim);
      h = lerp(h, shaped, corridorW);
    }
    out.h = h;
    // ----- biome weights
    const rw = this.regionWeights(s + near.along, this._rw || (this._rw = {}));
    const distT = near.dist;
    const n = this.noise2.fbm(x * 0.004, z * 0.004, 2) * 0.5 + 0.5;
    out.urban = clamp(rw.city * (1 - smoothstep(500, 1100, distT)) + rw.town * (1 - smoothstep(180, 520, distT)) + rw.suburb * 0.5 * (1 - smoothstep(150, 500, distT)), 0, 1);
    out.farm = clamp((rw.farmland + rw.suburb * 0.4 + rw.town * 0.4 + rw.river * 0.3) * smoothstep(22, 45, distT) * (1 - out.urban) * smoothstep(0.2, 0.42, n), 0, 1);
    out.forest = clamp(rw.forest * (0.55 + 0.45 * n) + rw.farmland * 0.12 * smoothstep(0.6, 0.8, n), 0, 1);
    let sand = 0;
    for (const w of this.waters) {
      const dist = Math.abs((x - w.x) * -w.dz + (z - w.z) * w.dx);
      sand = Math.max(sand, 1 - smoothstep(w.width / 2 - 10, w.width / 2 + (w.isRiver ? 70 : 6), dist));
    }
    out.sand = sand;
    out.ballast = e < 1.5 && corridorW > 0 ? 1 - smoothstep(0, 1.5, e) : 0;
    return out;
  }

  height(x, z) {
    return this.sample(x, z, this._hs || (this._hs = {})).h;
  }

  waterLevelAt(x, z) {
    for (const w of this.waters) {
      const dist = Math.abs((x - w.x) * -w.dz + (z - w.z) * w.dx);
      if (dist < w.width / 2) return w.level;
    }
    return null;
  }
}
