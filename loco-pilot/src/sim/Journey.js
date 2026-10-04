import { bus } from '../core/EventBus.js';
import { clamp, lerp, formatClock } from '../core/MathUtil.js';
import { TRAINS, AI_SERVICES } from '../data/trains.js';
import { DIFFICULTIES, WEATHER_PRESETS } from '../data/scenarios.js';
import { buildConsist } from './Consist.js';
import { PlayerTrain, AITrain, Train, TrainPlan } from './Train.js';
import { SignalSystem } from './SignalSystem.js';
import { buildTimetable } from './Timetable.js';
import { Scoring } from './Scoring.js';
import { Safety } from './Safety.js';
import { StationOps } from './StationOps.js';
import { EventDirector } from './EventDirector.js';
import { AIDriver } from './AIDriver.js';
import { Rng } from '../core/Rng.js';

const DEFAULT_TRACK = { IPT: 'IPT-2' };
const COACH_MIX = {
  express: (n) => ['SLR', 'GS', 'GS', ...Array(Math.max(0, n - 9)).fill('SL').map((x, i) => (i % 4 === 3 ? '3A' : x)), 'PC', '3A', '2A', '1A', 'SLR'].slice(0, n),
  passenger: (n) => ['SLR', ...Array(n - 2).fill('GS').map((x, i) => (i % 3 === 2 ? 'SL' : x)), 'SLR'],
  freight: (n) => [...Array(n).fill('BOXN'), 'BVZC'],
};

/**
 * One driving session: builds the player train, AI traffic, timetable and all operational
 * systems, then advances the simulation every frame.
 */
export class Journey {
  constructor(world, config) {
    this.world = world;
    this.config = config;
    this.network = world.network;
    this.geo = world.geo;
    this.trainDef = TRAINS[config.trainId];
    this.difficulty = DIFFICULTIES[config.difficulty] || DIFFICULTIES.normal;
    this.weatherDef = WEATHER_PRESETS[config.weather] || WEATHER_PRESETS.clear;
    this.weather = { ...this.weatherDef };
    this.weatherTarget = { ...this.weatherDef };
    this.weatherBlend = 1;
    this.wetness = this.weatherDef.rain > 0 ? 0.75 : 0;
    this.time = 0;
    this.state = 'ready';
    this.isNight = false;
    this.perfectStops = 0;
    this.onTimeArrivals = 0;
    this.trains = [];
    this.signals = new SignalSystem(this.network);
    this.endTimer = 0;
    this.offs = [];
    this.build();
  }

  build() {
    const c = this.config;
    const net = this.network;
    const def = this.trainDef;
    const startTrack = c.startTrack || DEFAULT_TRACK[c.from] || 'DN';
    const choices = { [c.from]: startTrack };
    if (c.toTrack) choices[c.to] = c.toTrack;
    this.choices = choices;
    const path = net.buildPath(1, startTrack, choices);
    const berth = net.berthFor(c.from, startTrack);
    const consist = buildConsist(def.loco, def.coaches);
    const stopsBetween = this.stationsBetween(c.from, c.to);
    const plan = new TrainPlan({ stops: def.stops.filter((id) => stopsBetween.includes(id) || id === c.to), tracks: choices, dwell: def.dwell });
    plan.stops.add(c.to);
    const startup = this.difficulty.autoStart ? (c.tutorial ? 6 : 2) : 5;
    this.clock = c.startHours;
    const player = new PlayerTrain({
      id: 'PLAYER', name: def.name.en, number: def.number, consist, path, s: berth.stop[1], plan, kind: def.category,
      maxSpeed: def.maxSpeed, coldStart: !this.difficulty.autoStart, livery: c.livery,
    });
    player.startPf = berth.pf;
    player.limits = net.limitsForPath(path);
    player.traction.slipControl = this.difficulty.slipControl;
    player.doorsOpen = true;
    // trainees and cold-start crews switch the headlight on themselves
    if (c.tutorial || !this.difficulty.autoStart) player.headlight = 0;
    this.player = player;
    this.trains.push(player);
    this.departure = c.startHours + startup / 60;
    this.timetable = buildTimetable({ train: player, network: net, geo: this.geo, startHours: this.departure, fromStation: c.from, toStation: c.to, dwell: def.dwell });
    this.signals.setTrains(this.trains);
    this.scoring = new Scoring(this.difficulty);
    this.safety = new Safety(this);
    this.ops = new StationOps(this);
    this.buildTraffic();
    this.events = new EventDirector(this, c.events || [], !!c.randomEvents);
    this.signals.forceUpdate();
    this.offs.push(bus.on('journey:fail', () => (this.endTimer = 5)));
    this.offs.push(bus.on('journey:arrived', () => (this.endTimer = 7)));
  }

  stationsBetween(from, to) {
    const ids = this.network.stations.map((s) => s.id);
    const a = ids.indexOf(from), b = ids.indexOf(to);
    return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
  }

  // ---------------------------------------------------------------- AI traffic
  buildTraffic() {
    const density = this.config.traffic ?? 0.8;
    const net = this.network;
    const L = this.geo.length;
    const rng = new Rng(Math.floor(this.config.startHours * 100) + 7);
    this.pendingAI = [];
    const liveries = ['saffron', 'maroon', 'ocean'];
    let upBerth = 0;
    for (const svc of AI_SERVICES) {
      if (svc.density > density + 1e-6) continue;
      const kind = svc.kind;
      const coaches = COACH_MIX[kind](svc.coaches);
      const consist = buildConsist('EP60', coaches, { aiLoco: kind === 'freight' ? 'EF90' : 'EP60' });
      let path, s, stops;
      if (svc.dir < 0) {
        const endBerth = 'IPT-3';
        upBerth++;
        path = net.buildPath(-1, 'UP', { IPT: endBerth });
        s = L - 40;
        stops = kind === 'passenger' ? ['VNJ', 'BSG', 'CDJ', 'SNP', 'IPT'] : ['VNJ', 'CDJ', 'IPT'];
      } else {
        const choices = svc.loopAt ? { [svc.loopAt]: 'CDJ-L2' } : {};
        path = net.buildPath(1, 'DN', choices);
        s = 2600;
        stops = svc.loopAt ? [svc.loopAt] : [];
      }
      const train = new AITrain({
        id: svc.id, name: svc.name, number: svc.number, consist, path, s, kind, maxSpeed: svc.maxSpeed,
        plan: new TrainPlan({ stops, dwell: kind === 'passenger' ? 40 : 55 }), livery: liveries[rng.int(0, 2)],
        maxTE: kind === 'freight' ? 460e3 : 300e3, power: kind === 'freight' ? 6.0e6 : 4.4e6,
      });
      train.limits = net.limitsForPath(path);
      train.driver = new AIDriver(train, { signals: this.signals, network: net, geo: this.geo, journey: this });
      train.spawnAt = svc.depart;
      train.pending = true;
      train.active = false;
      this.pendingAI.push(train);
      if (svc.loopAt) {
        const g = this.signals.stationSignals(svc.loopAt, 1);
        const starter = g && g.starters.find((x) => x.track === 'CDJ-L2');
        const adv = g && g.adv;
        if (starter) {
          this.signals.holds.set(starter.id, () => {
            const p = this.player;
            if (!p) return false;
            const passed = (p.rearS - (adv ? adv.s : starter.s + 600)) * p.dir > 50;
            return !passed && this.playerWillPass(svc.loopAt);
          });
        }
      }
    }
    // stabled rakes for atmosphere
    this.addStabled('IPT-4', COACH_MIX.express(16), 'EP60', -1);
    this.addStabled('CDJ-S1', COACH_MIX.freight(22).slice(0, 22), null, 1);
    // pre-simulate trains that were already running when the journey begins
    const pre = this.pendingAI.filter((t) => t.spawnAt < 0).sort((a, b) => a.spawnAt - b.spawnAt);
    if (pre.length) {
      const startT = pre[0].spawnAt;
      const env = { geo: this.geo, time: 0, player: this.player, trains: this.trains };
      for (let tt = startT; tt < 0; tt += 0.5) {
        for (const t of this.pendingAI) if (t.pending && t.spawnAt <= tt && this.spawnClear(t)) this.activateAI(t);
        for (const t of this.trains) {
          if (t.isPlayer || !t.active || !t.driver) continue;
          const cmd = t.driver.update(0.5, env);
          t.step(0.5, env, cmd);
        }
        this.signals.update(0.5);
      }
    }
  }

  playerWillPass(stationId) {
    const st = this.network.station(stationId);
    const p = this.player;
    const endRow = this.timetable.rows[this.timetable.rows.length - 1];
    return (endRow.s - st.platformS1) * p.dir > 0;
  }

  addStabled(trackId, coaches, loco, facing) {
    const tr = this.network.tracks.get(trackId);
    if (!tr) return;
    const consist = buildConsist(loco || 'EP60', coaches);
    if (!loco) {
      consist.vehicles.shift();
      let off = 0;
      for (const v of consist.vehicles) {
        v.frontOffset = off;
        v.centreOffset = off + v.length / 2;
        off += v.length + 0.3;
      }
      consist.length = off - 0.3;
    }
    const dir = facing;
    const path = this.network.buildPath(dir, trackId, {});
    path.legs = [{ track: tr, a: tr.sA, b: tr.sB }];
    const s = dir > 0 ? tr.sA + 15 + consist.length : tr.sA + 30;
    const t = new Train({ id: 'STB-' + trackId, name: 'Stabled rake', number: '', consist, path, s, kind: loco ? 'passenger' : 'freight', livery: 'maroon' });
    t.stabled = true;
    t.headlight = 0;
    t.interiorLights = false;
    this.trains.push(t);
  }

  activateAI(t) {
    t.pending = false;
    t.active = true;
    if (!this.trains.includes(t)) this.trains.push(t);
    bus.emit('ai:spawn', { train: t });
  }

  /** Re-route the player to a different berth at a station (platform change). */
  changeBerth(stationId, trackId) {
    const p = this.player;
    const net = this.network;
    const st = net.station(stationId);
    const berth = st && st.berths.find((b) => b.track === trackId && b.dirs.includes(p.dir));
    if (!berth) return false;
    // only if the home route has not been set yet
    const g = this.signals.stationSignals(stationId, p.dir);
    if (g && g.home && this.signals.routes.get(g.home.id)) return false;
    this.choices[stationId] = trackId;
    const path = net.buildPath(p.dir, Object.keys(this.choices).length ? this.choices[this.config.from] : 'DN', this.choices);
    p.path = path;
    p.limits = net.limitsForPath(path);
    p.plan.tracks[stationId] = trackId;
    for (const r of this.timetable.rows) {
      if (r.station.id === stationId) {
        r.s = berth.stop[p.dir];
        r.pf = berth.pf;
        r.track = trackId;
        r.berth = berth;
      }
    }
    return true;
  }

  /** Bring the booked departure forward so it falls `minutes` from now (training: no long idle wait). */
  advanceDeparture(minutes) {
    if (this.ops.state !== 'origin' || this.ops.originRA) return;
    const delta = this.clock + minutes / 60 - this.departure;
    if (delta >= 0) return;
    this.departure += delta;
    for (const r of this.timetable.rows) {
      for (const k of ['sched', 'arr', 'dep', 'pass']) if (typeof r[k] === 'number') r[k] += delta;
    }
  }

  setWeather(id, seconds = 60) {
    const w = WEATHER_PRESETS[id];
    if (!w) return;
    this.weatherFrom = { ...this.weather };
    this.weatherTarget = { ...w };
    this.weatherBlend = 0;
    this.weatherDuration = seconds;
    this.weatherId = id;
  }

  // ---------------------------------------------------------------- main update
  start() {
    this.state = 'running';
    bus.emit('journey:start', { journey: this });
  }

  update(dt) {
    if (this.state !== 'running') return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.clock += dt / 3600;
    // weather transition and rail condition
    if (this.weatherBlend < 1) {
      this.weatherBlend = Math.min(1, this.weatherBlend + dt / (this.weatherDuration || 60));
      for (const k of Object.keys(this.weatherTarget)) {
        if (typeof this.weatherTarget[k] === 'number') this.weather[k] = lerp(this.weatherFrom[k] ?? 0, this.weatherTarget[k], this.weatherBlend);
      }
    }
    if (this.weather.rain > 0.05) this.wetness = Math.min(1, this.wetness + dt * this.weather.rain / 90);
    else this.wetness = Math.max(0, this.wetness - dt / 900);
    const w = this.wetness;
    this.player.rail = { factor: lerp(1, 0.58, w), wet: w > 0.25, brakeMu: lerp(0.16, 0.082, w) };

    const env = { geo: this.geo, time: this.time, player: this.player, inTunnel: false, trains: this.trains };
    // player physics with sub-steps
    const p = this.player;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    env.inTunnel = this.network.insideTunnel(p.s);
    for (let i = 0; i < n; i++) p.step(h, env);
    // lateral acceleration for comfort
    const k = this.geo.curvatureAt(p.s), cant = this.geo.cantAt(p.s);
    p.lateralAcc = p.v * p.v * k - 9.81 * Math.sin(cant);
    // AI traffic
    for (const t of this.pendingAI) if (t.pending && this.time >= t.spawnAt && this.spawnClear(t)) this.activateAI(t);
    for (const t of this.trains) {
      if (t.isPlayer || !t.active || !t.driver) continue;
      env.inTunnel = this.network.insideTunnel(t.s);
      const cmd = t.driver.update(dt, env);
      const steps = dt > 1 / 30 ? 2 : 1;
      for (let i = 0; i < steps; i++) t.step(dt / steps, env, cmd);
    }
    // collision between player and other trains (same track overlap)
    this.checkCollisions();
    this.signals.update(dt);
    this.safety.update(dt);
    this.ops.update(dt);
    this.events.update(dt);
    this.scoring.update(dt, p, p.currentLimit().kmh);
    this.updateLevelCrossings();
    // path end overrun
    if ((p.s - p.path.endS) * p.dir > -30) {
      this.scoring.fail('Ran off the end of the line');
      p.brakes.emergency = true;
    }
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish();
    }
  }

  spawnClear(t) {
    // the stretch from the spawn point to the first signal ahead must be empty
    const first = this.signals.signalsAhead(t, 1, 5000)[0];
    const ahead = first ? first.signal.s : t.s + t.dir * 1500;
    const pieces = t.path.pieces(t.rearS, ahead);
    this.signals.computeOccupancy();
    return !this.signals.occupied(pieces, t);
  }

  checkCollisions() {
    const p = this.player;
    for (const t of this.trains) {
      if (t === p || !t.active) continue;
      const pp = p.path.pieces(p.s, p.rearS);
      const tp = t.path.pieces(t.s, t.rearS);
      let hit = false;
      for (const a of pp) for (const b of tp) if (a.track === b.track && a.b > b.a && a.a < b.b) hit = true;
      if (hit && !this.collided) {
        this.collided = true;
        const rel = Math.abs(p.v * p.dir - t.v * t.dir) * 3.6;
        p.v = 0;
        t.v = 0;
        this.scoring.penalize('safety', 100, `Collision with train ${t.number || t.name} at ${Math.round(rel)} km/h`, { severity: 'critical' });
        this.scoring.fail('Collision with another train');
        bus.emit('collision', { kind: 'train' });
      }
    }
  }

  updateLevelCrossings() {
    for (const lc of this.world.levelCrossings) {
      let closed = false;
      for (const t of this.trains) {
        if (!t.active) continue;
        const dFront = (lc.def.s - t.s) * t.dir;
        const dRear = (lc.def.s - t.rearS) * t.dir;
        if ((dFront > -2 && dFront < 1500) || (dFront <= 0 && dRear > -25)) closed = true;
      }
      if (closed !== lc.closed) bus.emit('lc:state', { lc: lc.def, closed });
      lc.closed = closed;
    }
  }

  // ---------------------------------------------------------------- end of journey
  finish() {
    if (this.state === 'complete' || this.state === 'failed') return;
    const failed = !!this.scoring.failed;
    this.state = failed ? 'failed' : 'complete';
    const p = this.player;
    const report = this.scoring.report(p, this.timetable.refEnergy || 1e9, {});
    const diffMult = { easy: 0.8, normal: 1, hard: 1.25, sim: 1.5 }[this.difficulty.id] || 1;
    const baseXp = this.config.xp || Math.round(120 + (p.distance / 1000) * 14);
    const xp = failed ? Math.round(baseXp * 0.1) : Math.round(baseXp * diffMult * (0.35 + 0.65 * report.total / 100) + this.perfectStops * 25);
    const result = {
      title: this.config.title || `${this.trainDef.number} ${this.trainDef.name.en}`,
      completed: !failed, failed: this.scoring.failed, report, total: report.total, stars: report.stars, xp,
      distanceKm: p.distance / 1000, durationSec: this.time, spads: this.scoring.spads, perfectStops: this.perfectStops,
      stops: report.stops.length, onTimeArrivals: this.onTimeArrivals, emergencyBrakes: this.scoring.emergencyCount,
      scenarioId: this.config.scenarioId, dutyId: this.config.dutyId, config: this.config,
      energyKWh: p.traction ? (p.traction.energyUsed - p.traction.energyRegen) / 3.6e6 : 0,
      regenKWh: p.traction ? p.traction.energyRegen / 3.6e6 : 0,
    };
    this.result = result;
    bus.emit('journey:end', result);
  }

  abort() {
    this.state = 'aborted';
    this.dispose();
  }

  dispose() {
    this.safety.dispose();
    this.offs.forEach((f) => f());
  }

  // ---------------------------------------------------------------- HUD helpers
  nextStopInfo() {
    const r = this.ops.next;
    if (!r) return null;
    const d = Math.max(0, this.ops.distanceToNext());
    const rows = this.timetable.rows;
    const i = rows.indexOf(r);
    // previous timing point (departure) and the booked running time of this leg
    let prev = rows[0];
    for (let k = i - 1; k >= 0; k--) if (rows[k].kind !== 'pass') { prev = rows[k]; break; }
    const prevDep = prev.kind === 'dep' ? prev.sched : prev.dep;
    const segLen = Math.max(1, Math.abs(r.s - prev.s));
    const segRun = Math.max(60, (r.arr - prevDep) * 3600);
    const waiting = ['origin', 'doors', 'dwell', 'waitTime', 'waitSignal', 'rightAway'].includes(this.ops.state);
    const start = waiting ? Math.max(this.clock, prevDep) : this.clock;
    const etaH = start + (segRun * Math.min(1, d / segLen)) / 3600;
    return { row: r, station: r.station, distance: d, sched: r.arr, eta: etaH, delayMin: (etaH - r.arr) * 60, pf: r.pf };
  }

  describeTime() {
    return formatClock(this.clock, true);
  }
}
