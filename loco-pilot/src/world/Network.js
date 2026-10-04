import { clamp } from '../core/MathUtil.js';

// Lateral clearance from track centre to platform edge (coach half-width + gap).
export const PLATFORM_GAP = 1.68;
export const PLATFORM_HEIGHT = 0.84;
export const TURNOUT_SPEED = 30; // km/h for loop lines and turnouts

/** A single running line, loop, berth or siding. Geometry = route centreline + lateral offset(s). */
export class Track {
  constructor(o) {
    Object.assign(this, o);
    this.pieces.sort((a, b) => a.s0 - b.s0);
  }
  offsetAt(s) {
    const p = this.pieces;
    if (s <= p[0].s0) return p[0].o0;
    for (let i = 0; i < p.length; i++) {
      const q = p[i];
      if (s <= q.s1) {
        if (q.o0 === q.o1) return q.o0;
        const t = clamp((s - q.s0) / (q.s1 - q.s0), 0, 1);
        return q.o0 + (q.o1 - q.o0) * (0.5 - 0.5 * Math.cos(Math.PI * t));
      }
    }
    return p[p.length - 1].o1;
  }
  isTransition(s) {
    for (const q of this.pieces) if (s >= q.s0 && s <= q.s1) return q.o0 !== q.o1;
    return false;
  }
  contains(s) {
    return s >= this.sA - 1e-6 && s <= this.sB + 1e-6;
  }
}

/** Ordered list of legs a train follows. Legs are s-ranges on tracks; order = travel order. */
export class Path {
  constructor(legs, dir) {
    this.legs = legs; // [{ track, a, b }]
    this.dir = dir;
    this.version = 0;
    this._last = 0;
  }
  legAt(s) {
    const L = this.legs;
    const c = L[this._last];
    if (c && s >= c.a - 1e-6 && s <= c.b + 1e-6) return c;
    for (let i = 0; i < L.length; i++) {
      if (s >= L[i].a - 1e-6 && s <= L[i].b + 1e-6) {
        this._last = i;
        return L[i];
      }
    }
    // Outside: clamp to the nearest end leg (vehicles overhanging a buffer etc.)
    return this.dir > 0 ? (s < L[0].a ? L[0] : L[L.length - 1]) : s > L[0].b ? L[0] : L[L.length - 1];
  }
  lateralAt(s) {
    return this.legAt(s).track.offsetAt(s);
  }
  trackAt(s) {
    return this.legAt(s).track;
  }
  get startS() {
    return this.dir > 0 ? this.legs[0].a : this.legs[0].b;
  }
  get endS() {
    const l = this.legs[this.legs.length - 1];
    return this.dir > 0 ? l.b : l.a;
  }
  /** Occupied pieces for the stretch between two chainages. */
  pieces(s0, s1, out = []) {
    const a = Math.min(s0, s1), b = Math.max(s0, s1);
    for (const leg of this.legs) {
      const lo = Math.max(a, leg.a), hi = Math.min(b, leg.b);
      if (hi > lo) out.push({ track: leg.track.id, a: lo, b: hi });
    }
    return out;
  }
}

export class Network {
  constructor(def, geo) {
    this.def = def;
    this.geo = geo;
    this.tracks = new Map();
    this.stations = [];
    this.signals = [];
    this.boards = [];
    this.foulingZones = [];
    const half = (def.trackCentres || 5) / 2;
    this.lineOffset = { DN: -half, UP: half };
    const mainsStart = def.stations[0].mainsStart || 0;
    const L = geo.length;
    this.addTrack({ id: 'DN', kind: 'main', line: 'DN', sA: mainsStart, sB: L, pieces: [{ s0: mainsStart, s1: L, o0: -half, o1: -half }] });
    this.addTrack({ id: 'UP', kind: 'main', line: 'UP', sA: mainsStart, sB: L, pieces: [{ s0: mainsStart, s1: L, o0: half, o1: half }] });
    for (const st of def.stations) this.buildStation(st);
    this.buildSignals();
    this.buildLimits();
    this.buildBoards();
  }

  addTrack(o) {
    const t = new Track(o);
    this.tracks.set(t.id, t);
    return t;
  }

  buildStation(st) {
    const station = {
      ...st,
      berths: [], // { track, pf, dirs: [1,-1], stop: { 1: s, -1: s } }
      sFirst: { 1: Infinity, [-1]: -Infinity },
    };
    const off = this.lineOffset;
    for (const t of st.tracks || []) {
      if (t.merge && t.joins && !t.diverge) {
        // terminus berth: buffer -> merge into a main line
        const mo = off[t.joins];
        this.addTrack({
          id: t.id, kind: 'berth', line: t.joins, station: st.id, pf: t.pf, sA: st.buffer, sB: t.merge[1],
          pieces: [
            { s0: st.buffer, s1: t.merge[0], o0: t.offset, o1: t.offset },
            { s0: t.merge[0], s1: t.merge[1], o0: t.offset, o1: mo },
          ],
          bufferA: true, constOffset: t.offset,
        });
        this.foulingZones.push({ a: t.merge[1] - 60, b: t.merge[1], tracks: [t.id, t.joins] });
      } else if (t.diverge && t.merge) {
        const mo = off[t.base];
        this.addTrack({
          id: t.id, kind: 'loop', line: t.base, station: st.id, pf: t.pf || null, goods: !!t.goods,
          sA: t.diverge[0], sB: t.merge[1],
          pieces: [
            { s0: t.diverge[0], s1: t.diverge[1], o0: mo, o1: t.offset },
            { s0: t.diverge[1], s1: t.merge[0], o0: t.offset, o1: t.offset },
            { s0: t.merge[0], s1: t.merge[1], o0: t.offset, o1: mo },
          ],
          constOffset: t.offset, diverge: t.diverge, merge: t.merge,
        });
        this.foulingZones.push({ a: t.diverge[0], b: t.diverge[0] + 70, tracks: [t.id, t.base] });
        this.foulingZones.push({ a: t.merge[1] - 70, b: t.merge[1], tracks: [t.id, t.base] });
      }
    }
    for (const sd of st.sidings || []) {
      const from = this.tracks.get(sd.from);
      const fo = from ? from.offsetAt(sd.s0) : off.DN;
      this.addTrack({
        id: sd.id, kind: 'siding', line: from ? from.line : 'DN', station: st.id, sA: sd.s0, sB: sd.s1,
        pieces: [
          { s0: sd.s0, s1: sd.s0 + 110, o0: fo, o1: sd.offset },
          { s0: sd.s0 + 110, s1: sd.s1, o0: sd.offset, o1: sd.offset },
        ],
        bufferB: true, constOffset: sd.offset, from: sd.from,
      });
    }
    // Berths with platforms and stopping positions
    const pS0 = st.platformS0, pS1 = st.platformS1;
    const stopDn = pS1 - 14, stopUp = pS0 + 14;
    if (st.kind === 'terminus') {
      for (const t of st.tracks) {
        const dirs = t.joins === 'DN' ? [1] : [-1];
        station.berths.push({ track: t.id, pf: t.pf, dirs, stop: { 1: stopDn, [-1]: st.buffer + 18 } });
      }
    } else {
      station.berths.push({ track: 'DN', pf: st.mainPf ? st.mainPf.DN : null, dirs: [1], stop: { 1: stopDn } });
      station.berths.push({ track: 'UP', pf: st.mainPf ? st.mainPf.UP : null, dirs: [-1], stop: { [-1]: stopUp } });
      for (const t of st.tracks || []) {
        if (!t.diverge) continue;
        const d = t.base === 'DN' ? 1 : -1;
        const stop = t.pf ? (d > 0 ? stopDn : stopUp) : d > 0 ? t.merge[0] - 40 : t.diverge[1] + 40;
        station.berths.push({ track: t.id, pf: t.pf || null, dirs: [d], stop: { [d]: stop }, goods: !!t.goods });
      }
    }
    // station limits (first/last turnouts) per direction
    const dnLoops = (st.tracks || []).filter((t) => t.diverge && t.base === 'DN');
    const upLoops = (st.tracks || []).filter((t) => t.diverge && t.base === 'UP');
    station.limits = {
      1: {
        first: dnLoops.length ? Math.min(...dnLoops.map((t) => t.diverge[0])) : pS0 - 220,
        last: dnLoops.length ? Math.max(...dnLoops.map((t) => t.merge[1])) : pS1 + 220,
      },
      [-1]: {
        first: upLoops.length ? Math.max(...upLoops.map((t) => t.merge[1])) : pS1 + 220,
        last: upLoops.length ? Math.min(...upLoops.map((t) => t.diverge[0])) : pS0 - 220,
      },
    };
    if (st.kind === 'terminus') {
      const dnB = st.tracks.filter((t) => t.joins === 'DN');
      const upB = st.tracks.filter((t) => t.joins === 'UP');
      station.limits[1] = { first: st.buffer, last: Math.max(...dnB.map((t) => t.merge[1])) };
      station.limits[-1] = { first: Math.max(...upB.map((t) => t.merge[1])), last: st.buffer };
    }
    this.stations.push(station);
  }

  station(id) {
    return this.stations.find((s) => s.id === id);
  }

  berthFor(stationId, trackId) {
    const st = this.station(stationId);
    return st && st.berths.find((b) => b.track === trackId);
  }

  // ------------------------------------------------------------------ signals
  buildSignals() {
    const L = this.geo.length;
    const sigs = [];
    let n = 0;
    const km = (s) => Math.floor(this.def.kmOffset + s / 1000);
    const add = (o) => {
      const sig = { id: `SG${++n}`, aspect: 'R', ...o };
      sig.lateral = this.trackOffsetAt(sig.track, sig.s) - sig.dir * 2.75;
      sigs.push(sig);
      return sig;
    };
    for (const dir of [1, -1]) {
      const line = dir > 0 ? 'DN' : 'UP';
      const stations = dir > 0 ? [...this.stations] : [...this.stations].reverse();
      const anchors = []; // ordered list of [entry, exit] chainages per station, travel order
      for (const st of stations) {
        const lim = st.limits[dir];
        const isStart = (dir > 0 && st.terminus === 'start') || (dir < 0 && st.terminus === 'end');
        const isTerminusEnd = dir < 0 && st.terminus === 'start';
        let home = null, distant = null, adv = null;
        const starters = [];
        if (!isStart) {
          const homeS = lim.first - dir * 180;
          if (homeS > 0 && homeS < L - 20) {
            home = add({ type: 'home', line, track: line, s: homeS, dir, station: st.id, name: `${st.code} Home`, plate: null, routeIndicator: true });
            const dS = homeS - dir * 1150;
            if (dS > 0 && dS < L - 20) distant = add({ type: 'distant', line, track: line, s: dS, dir, station: st.id, name: `${st.code} Distant`, plate: 'P' });
          }
        }
        if (!isTerminusEnd) {
          for (const b of st.berths) {
            if (!b.dirs.includes(dir)) continue;
            const tr = this.tracks.get(b.track);
            let sS;
            if (b.pf || st.kind === 'terminus') sS = dir > 0 ? st.platformS1 + 12 : st.platformS0 - 12;
            else sS = dir > 0 ? tr.merge[0] - 18 : tr.diverge[1] + 18;
            starters.push(add({ type: 'starter', line, track: b.track, s: sS, dir, station: st.id, name: `${st.code} Starter ${b.pf ? 'PF' + b.pf : b.track}`, plate: null }));
          }
          const advS = lim.last + dir * 230;
          if (advS > 0 && advS < L - 20) adv = add({ type: 'advStarter', line, track: line, s: advS, dir, station: st.id, name: `${st.code} Adv. Starter`, plate: null });
        }
        st.signals = st.signals || {};
        st.signals[dir] = { home, distant, starters, adv };
        anchors.push({ st, entry: distant ? distant.s : home ? home.s : null, exit: adv ? adv.s : null });
      }
      // automatic signals between stations
      for (let i = 0; i < anchors.length - 1; i++) {
        const from = anchors[i].exit, to = anchors[i + 1].entry;
        if (from == null || to == null) continue;
        const gap = Math.abs(to - from);
        const count = Math.max(0, Math.floor(gap / 1250));
        const spacing = gap / (count + 1);
        for (let k = 1; k <= count; k++) {
          const s = from + dir * spacing * k;
          add({ type: 'auto', line, track: line, s, dir, name: `A ${km(s)}/${k}`, plate: 'A' });
        }
      }
      // automatic signals from the last station to the end of the line (Down) / from start (Up)
      const last = anchors[anchors.length - 1];
      if (last && last.exit != null) {
        const endS = dir > 0 ? L - 120 : 120;
        const gap = Math.abs(endS - last.exit);
        const count = Math.floor(gap / 1250);
        for (let k = 1; k <= count; k++) {
          const s = last.exit + dir * (gap / (count + 1)) * k;
          add({ type: 'auto', line, track: line, s, dir, name: `A ${km(s)}/${k}`, plate: 'A' });
        }
      }
    }
    // Sort per line in travel order and link static successors
    this.signals = sigs;
    for (const dir of [1, -1]) {
      const line = sigs.filter((s) => s.dir === dir && s.track === (dir > 0 ? 'DN' : 'UP'));
      line.sort((a, b) => (a.s - b.s) * dir);
      for (let i = 0; i < line.length; i++) line[i].nextOnLine = line[i + 1] || null;
    }
    // starters on berths/loops: successor is the station's advanced starter
    for (const st of this.stations) {
      for (const dir of [1, -1]) {
        const g = st.signals && st.signals[dir];
        if (!g) continue;
        for (const s of g.starters) s.nextOnLine = g.adv || this.nextLineSignalAfter(dir, s.s);
        if (g.home) g.home.routeTargets = g.starters;
      }
    }
  }

  nextLineSignalAfter(dir, s) {
    const line = dir > 0 ? 'DN' : 'UP';
    let best = null;
    for (const sg of this.signals) {
      if (sg.dir !== dir || sg.track !== line) continue;
      if ((sg.s - s) * dir > 1 && (!best || (sg.s - best.s) * dir < 0)) best = sg;
    }
    return best;
  }

  trackOffsetAt(trackId, s) {
    const t = this.tracks.get(trackId);
    return t ? t.offsetAt(s) : 0;
  }

  // ------------------------------------------------------------------ speed limits
  buildLimits() {
    const geo = this.geo;
    const curves = [];
    for (const e of geo.elements) {
      if (e.type !== 'curve') continue;
      let vmin = Infinity;
      for (let s = e.s0; s <= e.s1; s += 5) vmin = Math.min(vmin, geo.curveSpeedLimit(s));
      const kmh = Math.floor((vmin * 3.6) / 5) * 5;
      if (kmh < 120) curves.push({ s0: e.s0 - 20, s1: e.s1 + 20, kmh, kind: 'psr', label: `Curve R${e.R}` });
    }
    this.curveLimits = curves;
    this.sectional = this.def.lineSpeed.map((l) => ({ s0: l.s0, s1: l.s1, kmh: l.kmh, kind: 'line', label: l.reason }));
    this.tsr = (this.def.tsr || []).map((t) => ({ s0: t.s0, s1: t.s1, kmh: t.kmh, kind: 'tsr', label: t.reason, line: t.line }));
  }

  /** All restrictions that apply along a path, sorted in travel order. */
  limitsForPath(path) {
    const out = [];
    const lineOf = (tr) => tr.line;
    for (const leg of path.legs) {
      const tr = leg.track;
      const clip = (r, extra = {}) => {
        const a = Math.max(r.s0, leg.a), b = Math.min(r.s1, leg.b);
        if (b > a) out.push({ ...r, s0: a, s1: b, ...extra });
      };
      for (const r of this.sectional) clip(r);
      for (const r of this.curveLimits) clip(r);
      for (const r of this.tsr) if (r.line === 'both' || r.line === lineOf(tr)) clip(r);
      if (tr.kind !== 'main') clip({ s0: tr.sA, s1: tr.sB, kmh: TURNOUT_SPEED, kind: 'turnout', label: tr.kind === 'berth' ? 'Platform line' : 'Loop line' });
    }
    out.sort((a, b) => (path.dir > 0 ? a.s0 - b.s0 : b.s1 - a.s1));
    return out;
  }

  // ------------------------------------------------------------------ path building
  /**
   * Build a path. `start` = { track, s }. `choices` = { stationId: trackId } loops/berths to use.
   */
  buildPath(dir, startTrackId, choices = {}) {
    const L = this.geo.length;
    const line = dir > 0 ? 'DN' : 'UP';
    const legs = [];
    const startTrack = this.tracks.get(startTrackId);
    const loops = [];
    for (const [stId, trId] of Object.entries(choices)) {
      const tr = this.tracks.get(trId);
      if (tr && tr.kind === 'loop' && tr.line === line) loops.push(tr);
    }
    loops.sort((a, b) => (a.sA - b.sA) * dir);
    // optional destination berth at the terminus for Up trains
    let endBerth = null;
    for (const trId of Object.values(choices)) {
      const tr = this.tracks.get(trId);
      if (tr && tr.kind === 'berth' && tr !== startTrack) endBerth = tr;
    }
    if (dir > 0) {
      let cur;
      if (startTrack.kind === 'berth') {
        legs.push({ track: startTrack, a: startTrack.sA, b: startTrack.sB });
        cur = startTrack.sB;
      } else if (startTrack.kind === 'loop') {
        legs.push({ track: startTrack, a: startTrack.sA, b: startTrack.sB });
        cur = startTrack.sB;
      } else cur = this.tracks.get(line).sA;
      const main = this.tracks.get(line);
      for (const lp of loops) {
        if (lp.sA < cur) continue;
        legs.push({ track: main, a: cur, b: lp.sA });
        legs.push({ track: lp, a: lp.sA, b: lp.sB });
        cur = lp.sB;
      }
      legs.push({ track: main, a: cur, b: L });
    } else {
      let cur;
      if (startTrack.kind === 'loop') {
        legs.push({ track: startTrack, a: startTrack.sA, b: startTrack.sB });
        cur = startTrack.sA;
      } else cur = L;
      const main = this.tracks.get(line);
      for (const lp of loops) {
        if (lp.sB > cur) continue;
        legs.push({ track: main, a: lp.sB, b: cur });
        legs.push({ track: lp, a: lp.sA, b: lp.sB });
        cur = lp.sA;
      }
      if (endBerth) {
        legs.push({ track: main, a: endBerth.sB, b: cur });
        legs.push({ track: endBerth, a: endBerth.sA, b: endBerth.sB });
      } else legs.push({ track: main, a: main.sA, b: cur });
    }
    return new Path(legs.filter((l) => l.b - l.a > 0.01), dir);
  }

  // ------------------------------------------------------------------ trackside boards
  buildBoards() {
    const boards = [];
    const L = this.geo.length;
    const leftOf = (line, s, dir, extra = 3.1) => this.trackOffsetAt(line, s) - dir * extra;
    // speed boards for sectional changes, curve PSRs and TSRs, per direction
    for (const dir of [1, -1]) {
      const line = dir > 0 ? 'DN' : 'UP';
      const startOf = (r) => (dir > 0 ? r.s0 : r.s1);
      const endOf = (r) => (dir > 0 ? r.s1 : r.s0);
      for (const r of this.sectional) {
        const s = startOf(r);
        if (s <= 5 || s >= L - 5) continue;
        boards.push({ kind: 'speed', s, dir, lateral: leftOf(line, s, dir), text: String(r.kmh) });
      }
      for (const r of this.curveLimits) {
        const s = startOf(r);
        boards.push({ kind: 'speed', s, dir, lateral: leftOf(line, s, dir), text: String(r.kmh) });
        const e = endOf(r);
        boards.push({ kind: 'term', s: e, dir, lateral: leftOf(line, e, dir), text: 'T' });
      }
      for (const r of this.tsr) {
        if (!(r.line === 'both' || r.line === line)) continue;
        const s = startOf(r);
        const c = s - dir * 1000;
        boards.push({ kind: 'caution', s: c, dir, lateral: leftOf(line, c, dir), text: String(r.kmh) });
        boards.push({ kind: 'speed', s, dir, lateral: leftOf(line, s, dir), text: String(r.kmh), tsr: true });
        const e = endOf(r);
        boards.push({ kind: 'term', s: e, dir, lateral: leftOf(line, e, dir), text: 'T/P' });
      }
      for (const lc of this.def.levelCrossings) {
        const s = lc.s - dir * 600;
        boards.push({ kind: 'whistle', s, dir, lateral: leftOf(line, s, dir), text: 'W/L', lc: lc.id });
      }
      for (const st of this.stations) {
        for (const b of st.berths) {
          if (!b.dirs.includes(dir) || b.stop[dir] == null) continue;
          const tr = this.tracks.get(b.track);
          const s = b.stop[dir];
          boards.push({ kind: 'stop', s: s + dir * 2, dir, lateral: tr.offsetAt(s) - dir * 2.2, text: 'STOP', station: st.id, track: b.track });
        }
      }
    }
    // kilometre posts beside the Down line
    for (let s = 1000; s < L; s += 1000) {
      boards.push({ kind: 'km', s, dir: 1, lateral: this.lineOffset.DN - 4.2, text: String(Math.round(this.def.kmOffset + s / 1000)) });
    }
    for (let s = 500; s < L; s += 1000) {
      boards.push({ kind: 'halfkm', s, dir: 1, lateral: this.lineOffset.DN - 4.2, text: `${Math.floor(this.def.kmOffset + s / 1000)}/5` });
    }
    this.boards = boards.filter((b) => b.s > 2 && b.s < L - 2 && !this.insideTunnel(b.s));
  }

  insideTunnel(s) {
    for (const t of this.def.tunnels || []) if (s > t.s0 - 5 && s < t.s1 + 5) return true;
    if (this.def.endTunnel && s > this.def.endTunnel.s - 5) return true;
    return false;
  }

  sectionalAt(s) {
    for (const r of this.sectional) if (s >= r.s0 && s < r.s1) return r.kmh;
    return 100;
  }
}
