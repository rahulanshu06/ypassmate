import { clamp, approach } from '../core/MathUtil.js';
import { bus } from '../core/EventBus.js';

/**
 * Drives an AI train: obeys speed restrictions (braking curves), never passes a red signal,
 * stops at booked stations, waits for departure clearance and despawns at the end of its path.
 */
export class AIDriver {
  constructor(train, ctx) {
    this.train = train;
    this.ctx = ctx; // { signals, network, geo, journey }
    this.state = 'run';
    this.dwell = 0;
    this.done = new Set();
    this.power = 0;
    this.brake = 0;
    this.endTimer = 0;
    this.hornCooldown = 0;
    this.whistled = new Set();
    this.currentStop = null;
    this.waitReason = '';
  }

  nextStop() {
    const t = this.train;
    const net = this.ctx.network;
    let best = null;
    for (const st of net.stations) {
      if (!t.plan.stopsAt(st.id) || this.done.has(st.id)) continue;
      const trackId = t.path.trackAt((st.platformS0 + st.platformS1) / 2).id;
      const berth = st.berths.find((b) => b.track === trackId && b.dirs.includes(t.dir));
      if (!berth) continue;
      const stopS = berth.stop[t.dir];
      const d = (stopS - t.s) * t.dir;
      if (d < -40) {
        this.done.add(st.id);
        continue;
      }
      if (!best || d < best.distance) best = { station: st, berth, stopS, distance: d, trackId };
    }
    return best;
  }

  update(dt, env) {
    const t = this.train;
    if (!t.active) return { power: 0, brake: 1 };
    const b = t.maxDecel * 0.7;
    const v = t.v;
    let vT = Math.min(t.maxSpeed, t.currentLimit().kmh / 3.6) * 0.97;
    let stopDist = null;
    const consider = (d, why) => {
      if (stopDist === null || d < stopDist) {
        stopDist = d;
        this.waitReason = why;
      }
    };
    for (const r of t.limitsAhead(3500)) {
      const lim = (r.kmh / 3.6) * 0.97;
      const allowed = Math.sqrt(lim * lim + 2 * b * Math.max(0, r.distance - 40));
      vT = Math.min(vT, allowed);
    }
    let redSig = null;
    for (const s of this.ctx.signals.signalsAhead(t, 3, 4500)) {
      if (s.aspect === 'R') {
        redSig = s;
        break;
      }
    }
    const stop = this.nextStop();
    this.currentStop = stop;
    if (stop && this.state !== 'dwell') consider(stop.distance, 'station');
    // a red starter just beyond the booked stop does not override the platform stop
    if (redSig) {
      const isOwnStarter = stop && redSig.signal.type === 'starter' && redSig.signal.station === stop.station.id && redSig.distance - stop.distance < 60;
      if (!isOwnStarter) consider(redSig.distance - 28, 'signal');
    }
    // line-of-sight protection: never run into the rear of another train on the same track
    for (const o of env.trains || []) {
      if (o === t || !o.active) continue;
      const tail = o.dir === t.dir ? o.rearS : o.s;
      const gap = (tail - t.s) * t.dir;
      if (gap <= 0 || gap > 1800) continue;
      const myTrack = t.path.trackAt(tail).id;
      const otherTrack = o.path.trackAt(tail).id;
      if (myTrack !== otherTrack) continue;
      consider(gap - 45, 'train');
    }
    const endD = (t.path.endS - t.s) * t.dir;
    if (endD < 3000) consider(endD - 25, 'end');

    if (this.state === 'dwell') {
      this.dwell -= dt;
      t.doorsOpen = this.dwell > 4;
      const st = this.currentStopStation;
      if (this.dwell <= 0) {
        const g = this.ctx.signals.stationSignals(st.id, t.dir);
        const starter = g && g.starters.find((x) => x.track === t.path.trackAt(x.s).id);
        const ok = this.ctx.signals.requestDeparture(t, starter);
        if (ok && (!starter || this.ctx.signals.aspect(starter) !== 'R')) {
          this.state = 'run';
          this.done.add(st.id);
          t.doorsOpen = false;
          this.horn(1.2);
        }
      }
      return this.apply(dt, 0, 1);
    }
    if (stopDist !== null) {
      const vs = Math.sqrt(2 * b * Math.max(0, stopDist - 1.5));
      vT = Math.min(vT, vs);
      if (stopDist < 2.5 && Math.abs(v) < 0.4) {
        if (this.waitReason === 'station' && stop) {
          this.state = 'dwell';
          this.dwell = t.plan.dwell;
          this.currentStopStation = stop.station;
          bus.emit('ai:arrived', { train: t, station: stop.station });
        } else if (this.waitReason === 'end') {
          this.endTimer += dt;
          if (this.endTimer > 40) {
            t.active = false;
            bus.emit('ai:despawn', { train: t });
          }
        }
        return this.apply(dt, 0, 1);
      }
    }
    // horn near whistle boards and when meeting the player's train
    this.hornCooldown -= dt;
    for (const bd of this.ctx.network.boards) {
      if (bd.kind !== 'whistle' || bd.dir !== t.dir || this.whistled.has(bd)) continue;
      const d = (bd.s - t.s) * t.dir;
      if (d < 0 && d > -40) {
        this.whistled.add(bd);
        this.horn(2.2);
      }
    }
    const player = env.player;
    if (player && player !== t && this.hornCooldown <= 0) {
      const gap = Math.abs(player.s - t.s);
      if (gap < 420 && player.dir !== t.dir && (player.s - t.s) * t.dir > 0) {
        this.horn(1.6);
        this.hornCooldown = 25;
      }
    }
    // controller
    const err = vT - v;
    let aDes = clamp(err * 0.5, -t.maxDecel, 0.45);
    if (vT < 0.2 && v < 0.3) aDes = -t.maxDecel;
    const resist = t.dynamics.lastForces.resist - t.dynamics.lastForces.grade;
    const need = t.dynamics.massEff * aDes + resist;
    if (need > 0) {
      const avail = Math.min(t.maxTE, t.power / Math.max(Math.abs(v), 1));
      return this.apply(dt, clamp(need / avail, 0, 1), 0);
    }
    return this.apply(dt, 0, clamp(-need / (t.mass * t.maxDecel), 0, 1));
  }

  apply(dt, power, brake) {
    this.power = approach(this.power, power, dt * 0.5);
    this.brake = approach(this.brake, brake, dt * (brake > this.brake ? 0.8 : 0.5));
    if (brake > 0.01) this.power = Math.min(this.power, 0.02);
    return { power: this.power, brake: this.brake };
  }

  horn(duration) {
    if (this.hornCooldown > 0 && duration < 2) return;
    this.hornCooldown = Math.max(this.hornCooldown, 6);
    bus.emit('ai:horn', { train: this.train, duration });
  }
}
