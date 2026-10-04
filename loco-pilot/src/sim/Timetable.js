import { clamp } from '../core/MathUtil.js';
import { formatClock } from '../core/MathUtil.js';

/**
 * Builds a working timetable for the player's journey using a fast "ideal driver" reference run
 * over the same path, limits and consist, then adds recovery allowance and rounds to the minute.
 */
export function buildTimetable({ train, network, geo, startHours, fromStation, toStation, dwell }) {
  const stops = [];
  const passes = [];
  const dir = train.dir;
  for (const st of network.stations) {
    if (st.id === fromStation) continue;
    const trackId = train.path.trackAt((st.platformS0 + st.platformS1) / 2).id;
    const berth = st.berths.find((b) => b.track === trackId && b.dirs.includes(dir));
    if (!berth) continue;
    const stopS = berth.stop[dir];
    const ahead = (stopS - train.s) * dir;
    if (ahead < -5) continue;
    const isEnd = st.id === toStation;
    const isStop = train.plan.stopsAt(st.id) || isEnd;
    const entry = { station: st, berth, stopS, pf: berth.pf, track: trackId, isStop, isEnd };
    if (isStop) stops.push(entry);
    else passes.push(entry);
    if (isEnd) break;
  }
  // reference run
  const limits = train.limits;
  const mass = train.mass;
  const maxV = train.maxSpeed;
  const loco = train.consist.loco;
  const TE = loco.maxTE * 0.85, P = loco.power * 0.9;
  const decel = 0.42;
  const L = train.length;
  let s = train.s, v = 0, t = 0;
  const events = [...stops, ...passes].sort((a, b) => (a.stopS - b.stopS) * dir);
  const timeAt = new Map();
  const limitAt = (front) => {
    const lo = Math.min(front, front - dir * L), hi = Math.max(front, front - dir * L);
    let lim = maxV;
    for (const r of limits) if (!(r.s1 < lo || r.s0 > hi)) lim = Math.min(lim, r.kmh / 3.6);
    return lim * 0.96;
  };
  const dt = 0.5;
  let evIdx = 0;
  let guard = 0;
  let energy = 0;
  while (evIdx < events.length && guard++ < 40000) {
    const ev = events[evIdx];
    const distToEv = (ev.stopS - s) * dir;
    let vT = limitAt(s);
    for (const r of limits) {
      const start = dir > 0 ? r.s0 : r.s1;
      const d = (start - s) * dir;
      if (d > 0 && d < 3000) vT = Math.min(vT, Math.sqrt((r.kmh / 3.6) ** 2 * 0.92 + 2 * decel * Math.max(0, d - 60)));
    }
    if (ev.isStop) vT = Math.min(vT, Math.sqrt(2 * decel * Math.max(0, distToEv - 1)));
    const resist = (mass / 1000) * (16 + 0.16 * v) + 0.62 * 18 * v * v + mass * 9.81 * geo.gradeAt(s) * dir;
    let F;
    if (v < vT - 0.3) {
      const te = Math.min(TE, P / Math.max(v, 1));
      F = te - resist;
      energy += (te * v * dt) / 0.86;
    } else if (v > vT + 0.3) F = -decel * mass;
    else {
      F = 0;
      if (resist > 0) energy += (resist * v * dt) / 0.86;
    }
    v = clamp(v + (F / (mass * 1.07)) * dt, 0, 60);
    s += dir * v * dt;
    t += dt;
    if ((ev.stopS - s) * dir <= (ev.isStop ? 2 : 0) && (!ev.isStop || v < 0.5)) {
      timeAt.set(ev, t);
      evIdx++;
      if (ev.isStop && !ev.isEnd) t += dwell;
      v = ev.isStop ? 0 : v;
    }
  }
  const allowance = 1.07;
  const rows = [];
  rows.push({ station: network.station(fromStation), kind: 'dep', sched: startHours, pf: train.startPf, s: train.s });
  let lastDep = 0;
  for (const ev of events) {
    const tRun = timeAt.get(ev) ?? 0;
    if (ev.isStop) {
      const arr = Math.ceil((tRun * allowance + 30) / 60) * 60;
      const arrH = startHours + arr / 3600;
      const depH = ev.isEnd ? null : startHours + (Math.ceil((arr + dwell) / 60) * 60) / 3600;
      rows.push({ station: ev.station, kind: ev.isEnd ? 'arr' : 'stop', arr: arrH, dep: depH, pf: ev.pf, s: ev.stopS, track: ev.track, berth: ev.berth });
      lastDep = depH;
    } else {
      const pass = startHours + Math.round(tRun * allowance) / 3600;
      rows.push({ station: ev.station, kind: 'pass', pass, s: ev.stopS, track: ev.track, pf: ev.pf });
    }
  }
  void lastDep;
  return { rows, stops, passes, refEnergy: energy * 1.12 + 160e3 * t, runTime: t, describe: () => rows.map((r) => `${r.station.code} ${r.kind} ${formatClock(r.arr ?? r.pass ?? r.sched)}`) };
}
