import { bus } from '../core/EventBus.js';
import { Rng } from '../core/Rng.js';

/**
 * Scripted and random operational events. Random events are spaced out, never placed in the
 * first or last 2.5 km, and red-signal / obstruction events only trigger beyond the train's
 * current braking distance so they are always survivable.
 */
export class EventDirector {
  constructor(journey, scripted = [], random = false) {
    this.j = journey;
    this.events = [];
    this.obstacles = [];
    const p = journey.player;
    const startS = p.s;
    const endRow = journey.timetable.rows[journey.timetable.rows.length - 1];
    const endS = endRow ? endRow.s : startS + 20000;
    const dir = p.dir;
    for (const e of scripted) this.events.push({ ...e, done: false, state: 'pending' });
    if (random) {
      const rng = new Rng(Math.floor(Math.random() * 1e9));
      const span = (endS - startS) * dir;
      const pool = ['unexpectedRed', 'tsr', 'aiDelay'];
      const vis = journey.weatherDef.fog < 0.004;
      if (vis) pool.push('animal', 'vehicleAtLC');
      if (journey.weatherDef.rain === 0 && journey.weatherDef.fog < 0.004) pool.push('weather');
      const count = span > 14000 ? 2 : 1;
      const used = [];
      for (let k = 0; k < count && pool.length; k++) {
        const type = pool.splice(rng.int(0, pool.length - 1), 1)[0];
        let s = startS + dir * rng.range(2500, Math.max(2600, span - 2500));
        if (used.some((u) => Math.abs(u - s) < 4000)) s = startS + dir * Math.min(span - 2500, Math.abs(used[0] - startS) + 5000);
        used.push(s);
        const ev = { type, s, done: false, state: 'pending', random: true };
        if (type === 'vehicleAtLC') {
          const lc = journey.world.def.levelCrossings.find((l) => (l.s - startS) * dir > 3000 && (endS - l.s) * dir > 1000);
          if (!lc) continue;
          ev.s = lc.s;
          ev.lc = lc;
        }
        this.events.push(ev);
      }
    }
  }

  brakingDistance(v) {
    return (v * v) / (2 * 0.45) + v * 4;
  }

  update(dt) {
    const j = this.j;
    const p = j.player;
    for (const ev of this.events) {
      if (ev.done) continue;
      const handler = this[ev.type];
      if (handler) handler.call(this, ev, dt, p, j);
      else ev.done = true;
    }
    for (const ob of this.obstacles) this.updateObstacle(ob, dt, p, j);
    this.obstacles = this.obstacles.filter((o) => !o.gone);
  }

  // ---------------------------------------------------------------- event handlers
  signalFailure(ev, dt, p, j) {
    if (ev.state === 'pending') {
      const after = typeof ev.after === 'number' ? ev.after : p.s + p.dir * 3000;
      const cands = j.world.network.signals.filter((sg) => sg.type === 'auto' && sg.dir === p.dir && (sg.s - after) * p.dir > 0 && p.path.trackAt(sg.s).id === sg.track);
      cands.sort((a, b) => (a.s - b.s) * p.dir);
      const sg = cands.find((c) => (c.s - p.s) * p.dir > this.brakingDistance(Math.abs(p.v)) + 900);
      if (!sg) return;
      ev.signal = sg;
      ev.state = 'armed';
    }
    if (ev.state === 'armed') {
      const d = (ev.signal.s - p.s) * p.dir;
      if (d < this.brakingDistance(Math.abs(p.v)) + 1600) {
        j.signals.failed.add(ev.signal.id);
        ev.state = 'active';
        bus.emit('hud:message', { text: `Control: automatic signal ${ev.signal.name} has failed and will show danger. Stop at it, wait 1 min (2 min at night), then pass it at max 10 km/h.`, kind: 'warn' });
        bus.emit('radio', { text: 'Signal failure reported ahead.' });
      }
    } else if (ev.state === 'active') {
      if ((p.rearS - ev.signal.s) * p.dir > 30) {
        j.signals.failed.delete(ev.signal.id);
        ev.done = true;
        bus.emit('hud:message', { text: `Signal ${ev.signal.name} restored by the signal maintainer.`, kind: 'info' });
      }
    }
  }

  unexpectedRed(ev, dt, p, j) {
    if (ev.state === 'pending') {
      if ((ev.s - p.s) * p.dir > 4000) return;
      const sg = j.signals.signalsAhead(p, 4, 5000).map((x) => x.signal).find((sig) => sig.type === 'auto' && (sig.s - p.s) * p.dir > this.brakingDistance(Math.abs(p.v)) * 1.3 + 400);
      if (!sg) {
        ev.done = true;
        return;
      }
      j.signals.overrides.set(sg.id, { aspect: 'R', until: j.signals.time + 70 + Math.random() * 40 });
      ev.state = 'active';
      ev.signal = sg;
      bus.emit('hud:message', { text: 'Control: track circuit fault reported ahead — expect a signal at danger.', kind: 'warn' });
    } else if (!j.signals.overrides.has(ev.signal.id)) {
      ev.done = true;
      bus.emit('hud:message', { text: 'Control: track circuit fault cleared.', kind: 'info' });
    }
  }

  tsr(ev, dt, p, j) {
    if ((ev.s - p.s) * p.dir > 5500) return;
    const s0 = ev.s, s1 = ev.s + p.dir * 400;
    const kmh = [30, 45, 50][Math.floor(Math.random() * 3)];
    const r = { s0: Math.min(s0, s1), s1: Math.max(s0, s1), kmh, kind: 'tsr', label: 'Caution order (bad track)' };
    p.limits.push(r);
    p.limits.sort((a, b) => (p.dir > 0 ? a.s0 - b.s0 : b.s1 - a.s1));
    const km = (s) => `${Math.floor(j.world.def.kmOffset + s / 1000)}/${Math.floor((s % 1000) / 100)}`;
    bus.emit('hud:message', { text: `Caution order: ${kmh} km/h between km ${km(r.s0)} and ${km(r.s1)} (bad track reported by the keyman).`, kind: 'warn' });
    bus.emit('radio', { text: `Caution order ${kmh} kilometres per hour.` });
    ev.done = true;
  }

  aiDelay(ev, dt, p, j) {
    const ai = j.trains.find((t) => !t.isPlayer && t.pending);
    if (ai) {
      ai.spawnAt += 300;
      bus.emit('hud:message', { text: `Control: ${ai.number} is running 5 minutes late.`, kind: 'info' });
    }
    ev.done = true;
  }

  weather(ev, dt, p, j) {
    if ((ev.s - p.s) * p.dir > 1500) return;
    j.setWeather('rain', 90);
    bus.emit('hud:message', { text: 'Rain approaching — rail adhesion will drop. Brake earlier.', kind: 'warn' });
    ev.done = true;
  }

  platformChange(ev, dt, p, j) {
    const st = j.world.network.station(ev.station);
    if (!st) return (ev.done = true);
    const d = (st.platformS0 - p.s) * p.dir;
    if (d > 5200 || d < 1500) {
      if (d < 1500) ev.done = true;
      return;
    }
    const ok = j.changeBerth(ev.station, ev.to);
    ev.done = true;
    if (ok) {
      const berth = st.berths.find((b) => b.track === ev.to);
      bus.emit('hud:message', { text: `Control: platform change — ${p.number} will be received on platform ${berth.pf} at ${st.name.en}. Expect the route indicator and 30 km/h over the turnout.`, kind: 'warn' });
      bus.emit('announce:platformChange', { station: st, pf: berth.pf, train: p });
    }
  }

  animal(ev, dt, p, j) {
    if ((ev.s - p.s) * p.dir > 2200) return;
    if ((ev.s - p.s) * p.dir < this.brakingDistance(Math.abs(p.v)) + 200) {
      ev.s = p.s + p.dir * (this.brakingDistance(Math.abs(p.v)) + 650);
    }
    this.obstacles.push({ kind: 'cattle', s: ev.s, track: p.path.trackAt(ev.s).id, lateral: p.path.lateralAt(ev.s), t: 0, leaving: 0, hit: false });
    bus.emit('obstacle:spawn', { kind: 'cattle', s: ev.s });
    ev.done = true;
  }

  vehicleAtLC(ev, dt, p, j) {
    if ((ev.s - p.s) * p.dir > 2600) return;
    if ((ev.s - p.s) * p.dir < this.brakingDistance(Math.abs(p.v)) + 250) {
      ev.done = true;
      return;
    }
    this.obstacles.push({ kind: 'tractor', s: ev.s, track: p.path.trackAt(ev.s).id, lateral: p.path.lateralAt(ev.s), t: 0, leaving: 0, hit: false });
    bus.emit('hud:message', { text: `Gateman ${ev.lc.id}: a tractor has stalled on the level crossing!`, kind: 'warn' });
    bus.emit('radio', { text: 'Obstruction at level crossing.' });
    ev.done = true;
  }

  updateObstacle(ob, dt, p, j) {
    ob.t += dt;
    const d = (ob.s - p.s) * p.dir;
    const speed = Math.abs(p.v);
    if (!ob.leaving) {
      const honked = p.horn > 0 && d < 500;
      const stopped = speed < 0.1 && d < 400;
      if (honked) ob.honk = (ob.honk || 0) + dt;
      if ((ob.kind === 'cattle' && ob.honk > 1.5 && d < 350) || (stopped && ob.t > 8)) {
        ob.leaving = 0.001;
        bus.emit('hud:message', { text: ob.kind === 'cattle' ? 'The cattle are moving off the track.' : 'The tractor has been pushed clear.', kind: 'good' });
      }
    } else {
      ob.leaving += dt;
      ob.lateral += (ob.kind === 'cattle' ? 1.3 : 0.8) * dt * Math.sign(ob.lateral || 1);
      if (ob.leaving > 9) ob.gone = true;
    }
    if (!ob.hit && d < 2 && d > -40) {
      const onTrack = Math.abs(ob.lateral - p.path.lateralAt(ob.s)) < 2.4;
      if (onTrack && speed > 2.2) {
        ob.hit = true;
        ob.gone = true;
        j.scoring.penalize('safety', ob.kind === 'tractor' ? 70 : 30, ob.kind === 'tractor' ? 'Collision with a vehicle at a level crossing' : 'Train struck cattle on the line', { severity: 'critical' });
        p.brakes.emergency = true;
        bus.emit('collision', { kind: ob.kind });
        if (ob.kind === 'tractor') j.scoring.fail('Collision at a level crossing');
      }
    }
  }
}
