import { bus } from '../core/EventBus.js';

const NEXT = { R: 'Y', Y: 'YY', YY: 'G', G: 'G' };

/**
 * Runtime signalling: track-circuit occupancy (with fouling at turnouts), station interlocking
 * (route setting at home signals, departure clearance at starters) and 4-aspect automatic
 * block signalling. Aspects are recomputed several times a second.
 */
export class SignalSystem {
  constructor(network) {
    this.network = network;
    this.signals = network.signals;
    this.byId = new Map(this.signals.map((s) => [s.id, s]));
    this.trains = [];
    this.routes = new Map(); // home id -> { train, target (starter signal or berth track), track }
    this.clearance = new Map(); // starter id -> train id
    this.failed = new Set();
    this.overrides = new Map(); // signal id -> { aspect, until }
    this.occ = [];
    this.timer = 0;
    this.aspects = new Map();
    this.time = 0;
    this.visuals = null;
    this.holds = new Map(); // starter id -> fn(train) => bool (true = keep red)
    for (const sg of this.signals) this.aspects.set(sg.id, 'R');
  }

  setTrains(list) {
    this.trains = list;
  }

  aspect(sg) {
    return this.aspects.get(sg.id) || 'R';
  }

  routeIndicator(sg) {
    const r = this.routes.get(sg.id);
    return !!(r && r.diverging);
  }

  // ------------------------------------------------------------------ occupancy
  computeOccupancy() {
    const occ = [];
    const fz = this.network.foulingZones;
    for (const t of this.trains) {
      if (!t.active) continue;
      const pieces = t.path.pieces(t.s, t.rearS);
      for (const p of pieces) {
        p.train = t;
        occ.push(p);
        for (const z of fz) {
          if (!z.tracks.includes(p.track)) continue;
          const a = Math.max(p.a, z.a), b = Math.min(p.b, z.b);
          if (b > a) for (const other of z.tracks) if (other !== p.track) occ.push({ track: other, a, b, train: t });
        }
      }
    }
    this.occ = occ;
  }

  occupied(pieces, ignoreTrain = null) {
    for (const q of pieces) {
      for (const o of this.occ) {
        if (o.track !== q.track || o.train === ignoreTrain) continue;
        if (o.b > q.a + 0.5 && o.a < q.b - 0.5) return o.train;
      }
    }
    return null;
  }

  /** Track pieces between two points, possibly crossing from a loop/berth to its main line. */
  blockPieces(fromTrack, fromS, toTrack, toS, dir) {
    const net = this.network;
    if (fromTrack === toTrack) return [{ track: fromTrack, a: Math.min(fromS, toS), b: Math.max(fromS, toS) }];
    const ft = net.tracks.get(fromTrack), tt = net.tracks.get(toTrack);
    let joint;
    if (ft.kind !== 'main') joint = dir > 0 ? ft.sB : ft.sA; // leaving a loop/berth
    else joint = dir > 0 ? tt.sA : tt.sB; // entering a loop/berth
    if (tt.kind === 'berth' && dir < 0) joint = tt.sB;
    if (ft.kind === 'berth' && dir > 0) joint = ft.sB;
    return [
      { track: fromTrack, a: Math.min(fromS, joint), b: Math.max(fromS, joint) },
      { track: toTrack, a: Math.min(joint, toS), b: Math.max(joint, toS) },
    ];
  }

  // ------------------------------------------------------------------ interlocking
  stationSignals(stationId, dir) {
    const st = this.network.station(stationId);
    return st && st.signals ? st.signals[dir] : null;
  }

  /** Track a train will use at a station, from its path. */
  trainTrackAt(train, st) {
    const probe = (st.platformS0 + st.platformS1) / 2;
    return train.path.trackAt(probe).id;
  }

  updateRoutes() {
    for (const st of this.network.stations) {
      for (const dir of [1, -1]) {
        const g = st.signals && st.signals[dir];
        if (!g || !g.home) continue;
        const home = g.home;
        const cur = this.routes.get(home.id);
        if (cur) {
          // release when the train has fully passed the home signal
          const t = cur.train;
          if (!t.active || (t.rearS - home.s) * dir > 15) this.routes.delete(home.id);
          continue;
        }
        // nearest approaching train of this direction
        let best = null, bestD = Infinity;
        for (const t of this.trains) {
          if (!t.active || t.dir !== dir) continue;
          const d = (home.s - t.s) * dir;
          if (d < -2 || d > 4200) continue;
          if (t.path.trackAt(home.s).id !== home.track) continue;
          if (d < bestD) {
            bestD = d;
            best = t;
          }
        }
        if (!best) continue;
        const trackId = this.trainTrackAt(best, st);
        let target = g.starters.find((s) => s.track === trackId) || null;
        let pieces;
        if (target) pieces = this.blockPieces(home.track, home.s, target.track, target.s, dir);
        else {
          const tr = this.network.tracks.get(trackId);
          if (!tr || tr.kind !== 'berth') continue;
          pieces = this.blockPieces(home.track, home.s, trackId, tr.sA, dir);
        }
        if (this.occupied(pieces, best)) continue;
        const tr = this.network.tracks.get(trackId);
        const diverging = tr && tr.kind !== 'main';
        this.routes.set(home.id, { train: best, target, track: trackId, pieces, diverging });
        bus.emit('signal:route', { station: st.id, train: best.id, track: trackId });
        // through trains get the starter cleared at once
        if (target && best.plan && !best.plan.stopsAt(st.id)) this.clearance.set(target.id, best.id);
      }
    }
  }

  /** A train asks for departure from a starter (after dwell). Returns true if cleared. */
  requestDeparture(train, starter) {
    if (!starter) return true;
    const hold = this.holds.get(starter.id);
    if (hold && hold(train)) return false;
    this.clearance.set(starter.id, train.id);
    return true;
  }

  // ------------------------------------------------------------------ aspects
  evaluate() {
    const memo = new Map();
    const visit = (sg, depth = 0) => {
      if (!sg) return 'G';
      if (memo.has(sg.id)) return memo.get(sg.id);
      memo.set(sg.id, 'R'); // cycle guard
      let a = this.computeAspect(sg, visit, depth);
      const ov = this.overrides.get(sg.id);
      if (ov) {
        if (ov.until && this.time > ov.until) this.overrides.delete(sg.id);
        else a = ov.aspect;
      }
      if (this.failed.has(sg.id)) a = 'R';
      memo.set(sg.id, a);
      return a;
    };
    for (const sg of this.signals) {
      const a = visit(sg);
      const prev = this.aspects.get(sg.id);
      this.aspects.set(sg.id, a);
      if (prev !== a) bus.emit('signal:aspect', { signal: sg, aspect: a, prev });
    }
  }

  computeAspect(sg, visit, depth) {
    const dir = sg.dir;
    if (sg.type === 'home') {
      const r = this.routes.get(sg.id);
      if (!r) return 'R';
      if (this.occupied(r.pieces, null)) return 'R';
      if (!r.target) return 'Y'; // into a terminus berth: prepare to stop at the buffer
      const na = visit(r.target, depth + 1);
      const a = NEXT[na];
      return r.diverging ? 'Y' : a;
    }
    let next = sg.nextOnLine;
    let pieces;
    if (sg.type === 'starter') {
      const allowed = this.clearance.get(sg.id);
      if (!allowed) return 'R';
      const t = this.trains.find((x) => x.id === allowed);
      if (!t || !t.active) {
        this.clearance.delete(sg.id);
        return 'R';
      }
      const targetTrack = next ? next.track : sg.track;
      const toS = next ? next.s : sg.s + dir * 400;
      pieces = this.blockPieces(sg.track, sg.s, targetTrack, toS, dir);
    } else {
      const toS = next ? next.s : sg.s + dir * 600;
      pieces = [{ track: sg.track, a: Math.min(sg.s, toS), b: Math.max(sg.s, toS) }];
    }
    if (this.occupied(pieces, null)) return 'R';
    if (!next) return 'G';
    return NEXT[visit(next, depth + 1)];
  }

  // ------------------------------------------------------------------ queries
  /** Next signals along a train's path, nearest first. */
  signalsAhead(train, maxCount = 3, maxDist = 6000) {
    const out = [];
    const dir = train.dir;
    for (const sg of this.signals) {
      if (sg.dir !== dir) continue;
      const d = (sg.s - train.s) * dir;
      if (d < 0.3 || d > maxDist) continue;
      if (train.path.trackAt(sg.s).id !== sg.track) continue;
      out.push({ signal: sg, distance: d, aspect: this.aspect(sg) });
    }
    out.sort((a, b) => a.distance - b.distance);
    return out.slice(0, maxCount);
  }

  update(dt) {
    this.time += dt;
    this.timer -= dt;
    // SPAD / passing detection every frame
    for (const t of this.trains) {
      if (!t.active) continue;
      const prev = t._lastSigS ?? t.s;
      if (prev !== t.s) {
        const lo = Math.min(prev, t.s), hi = Math.max(prev, t.s);
        for (const sg of this.signals) {
          if (sg.dir !== t.dir || sg.s <= lo || sg.s > hi) continue;
          if (t.path.trackAt(sg.s).id !== sg.track) continue;
          const movingForward = (t.s - prev) * t.dir > 0;
          if (!movingForward) continue;
          const asp = this.aspect(sg);
          bus.emit('signal:passed', { train: t, signal: sg, aspect: asp });
          if (sg.type === 'starter') this.clearance.delete(sg.id);
        }
      }
      t._lastSigS = t.s;
    }
    if (this.timer > 0) return;
    this.timer = 0.2;
    this.computeOccupancy();
    this.updateRoutes();
    this.evaluate();
    if (this.visuals) {
      for (const sg of this.signals) this.visuals.setAspect(sg, this.aspect(sg), this.routeIndicator(sg));
    }
  }

  forceUpdate() {
    this.timer = 0;
    this.update(0);
  }
}
