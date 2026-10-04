import { bus } from '../core/EventBus.js';
import { formatClock } from '../core/MathUtil.js';

/**
 * Handles the player's booked stops: stop acceptance and accuracy, doors, dwell, waiting for the
 * booked departure time, guard's "right away", starter clearance and punctuality records.
 */
export class StationOps {
  constructor(journey) {
    this.j = journey;
    this.rows = journey.timetable.rows.filter((r) => r.kind === 'stop' || r.kind === 'arr');
    this.passRows = journey.timetable.rows.filter((r) => r.kind === 'pass');
    this.index = 0;
    this.origin = journey.timetable.rows[0];
    this.state = 'origin'; // origin | running | doors | dwell | waitTime | waitSignal | rightAway | complete
    this.timer = 0;
    this.stoppedFor = 0;
    this.current = null;
    this.departureRequested = false;
    this.passed = new Set();
    this.announced = new Set();
  }

  get next() {
    return this.rows[this.index] || null;
  }

  /** Distance from the train front to the stop position of the next booked stop. */
  distanceToNext() {
    const r = this.next;
    if (!r) return null;
    return (r.s - this.j.player.s) * this.j.player.dir;
  }

  update(dt) {
    const j = this.j;
    const p = j.player;
    const r = this.next;
    const speed = Math.abs(p.v);
    // passing times at non-stop stations
    for (const pr of this.passRows) {
      if (this.passed.has(pr)) continue;
      if ((p.s - pr.s) * p.dir > 0) {
        this.passed.add(pr);
        const delay = (j.clock - pr.pass) * 3600;
        bus.emit('hud:message', { text: `Passed ${pr.station.name.en} at ${formatClock(j.clock)} (booked ${formatClock(pr.pass)}${delay > 60 ? `, ${Math.round(delay / 60)} min late` : ''}).`, kind: 'info' });
      }
    }
    if (!r) return;
    const st = r.station;
    const d = (r.s - p.s) * p.dir;
    // approach announcement trigger
    if (d < 2500 && !this.announced.has(st.id + 'arr')) {
      this.announced.add(st.id + 'arr');
      bus.emit('station:approach', { station: st, row: r, train: p });
    }
    switch (this.state) {
      case 'origin': {
        const o = this.origin;
        if (speed > 0.3) {
          if (!this.originLeft) {
            this.originLeft = true;
            if (j.clock < o.sched - 0.2 / 60 || !this.originRA) {
              j.scoring.penalize('safety', 10, `Started from ${o.station.name.en} before the guard's right away`, { severity: 'critical' });
              bus.emit('hud:alert', { kind: 'early', text: 'Departed without authority!', level: 2 });
            }
            const delay = (j.clock - o.sched) * 3600;
            j.scoring.recordTiming(o.station.id, delay, 'dep');
            this.state = 'running';
            this.stoppedFor = 0;
          }
          break;
        }
        if (j.clock >= o.sched && !this.originRA) {
          const starter = this.starterFor({ station: o.station });
          if (!this.departureRequested) this.departureRequested = j.signals.requestDeparture(p, starter);
          if (this.departureRequested && (!starter || j.signals.aspect(starter) !== 'R')) {
            this.originRA = true;
            bus.emit('guard:whistle', {});
            bus.emit('hud:message', { text: `Guard: “Right away!” — starter is OFF. Release brakes and depart ${o.station.name.en}.`, kind: 'good' });
            bus.emit('doors', { open: false, station: o.station });
            p.doorsOpen = false;
          }
        }
        break;
      }
      case 'running': {
        if (speed < 0.05 && d < 150 && d > -60) {
          this.stoppedFor += dt;
          if (this.stoppedFor > 1.5) this.tryAccept(r, d);
        } else this.stoppedFor = 0;
        if (d < -80 && speed > 0.5 && !r.missed) {
          r.missed = true;
          j.scoring.penalize('safety', 8, `Failed to stop at ${st.name.en}`, { severity: 'critical' });
          j.scoring.recordStop(st.id, d, true);
          bus.emit('hud:alert', { kind: 'missed', text: `Booked stop at ${st.name.en} missed!`, level: 2 });
          if (r.kind === 'arr') j.scoring.fail(`Overran the destination ${st.name.en}`);
          else this.index++;
        }
        break;
      }
      case 'doors': {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'dwell';
          this.timer = r.kind === 'arr' ? 6 : j.trainDef.dwell;
          p.doorsOpen = true;
          bus.emit('doors', { open: true, station: st });
          if (r.kind === 'arr') {
            this.state = 'complete';
            bus.emit('journey:arrived', { station: st });
          }
        }
        break;
      }
      case 'dwell': {
        this.timer -= dt;
        if (speed > 0.3) this.departedEarly(r);
        if (this.timer <= 0) {
          this.state = 'waitTime';
        }
        break;
      }
      case 'waitTime': {
        if (speed > 0.3) this.departedEarly(r);
        const remaining = (r.dep - j.clock) * 3600;
        if (remaining <= 0) {
          this.state = 'waitSignal';
          this.departureRequested = false;
        } else if (!this.waitMsg) {
          this.waitMsg = true;
          bus.emit('hud:message', { text: `Dwell complete. Booked departure ${formatClock(r.dep)} — wait for the guard.`, kind: 'info' });
        }
        break;
      }
      case 'waitSignal': {
        if (speed > 0.3) this.departedEarly(r);
        const starter = this.starterFor(r);
        if (!this.departureRequested) {
          this.departureRequested = j.signals.requestDeparture(p, starter);
          if (!this.departureRequested) bus.emit('hud:message', { text: 'Starter at danger — waiting for line clear.', kind: 'info', cooldown: 20 });
        }
        if (this.departureRequested && (!starter || j.signals.aspect(starter) !== 'R')) {
          this.state = 'rightAway';
          this.timer = 4;
          bus.emit('guard:whistle', {});
          bus.emit('hud:message', { text: `Guard: “Right away!” — green flag shown. Doors closing. Starter ${starter ? 'is OFF' : ''}.`, kind: 'good' });
          bus.emit('doors', { open: false, station: st });
        }
        break;
      }
      case 'rightAway': {
        this.timer -= dt;
        if (this.timer <= 1) p.doorsOpen = false;
        if (this.timer <= 0 || speed > 0.3) {
          if (speed > 0.3 && this.timer > 1) {
            j.scoring.penalize('safety', 6, 'Started before the doors were closed', { severity: 'warn' });
          }
          const delay = (j.clock - r.dep) * 3600;
          j.scoring.recordTiming(st.id, delay, 'dep');
          this.state = 'running';
          this.index++;
          this.waitMsg = false;
          this.stoppedFor = 0;
          p.doorsOpen = false;
        }
        break;
      }
      default:
        break;
    }
  }

  starterFor(r) {
    const g = this.j.signals.stationSignals(r.station.id, this.j.player.dir);
    if (!g) return null;
    return g.starters.find((s) => s.track === this.j.player.path.trackAt(s.s).id) || null;
  }

  tryAccept(r, d) {
    const j = this.j;
    const p = j.player;
    const st = r.station;
    const rearOk = (p.rearS - st.platformS0) * p.dir > -5 || p.length > st.platformS1 - st.platformS0;
    const overshoot = (p.s - st.platformS1) * p.dir > 6;
    if (d > 35 && !overshoot) {
      bus.emit('hud:message', { text: `Stopped ${Math.round(d)} m short of the STOP board — draw forward slowly.`, kind: 'warn', cooldown: 10 });
      this.stoppedFor = -6;
      return;
    }
    if (!rearOk && !overshoot) {
      bus.emit('hud:message', { text: 'Rear coaches are off the platform — draw forward.', kind: 'warn', cooldown: 10 });
      this.stoppedFor = -6;
      return;
    }
    const err = -d; // + = past the board
    const sc = j.scoring.recordStop(st.id, err, overshoot);
    if (sc >= 100) j.perfectStops++;
    const delay = (j.clock - r.arr) * 3600;
    j.scoring.recordTiming(st.id, delay, 'arr');
    if (Math.abs(delay) <= 60) j.onTimeArrivals++;
    bus.emit('station:stopped', { station: st, error: err, score: sc, delay, overshoot, row: r });
    const msg = overshoot ? `Overshot the platform at ${st.name.en}!` : Math.abs(err) <= 2 ? `Perfect stop at ${st.name.en} (${err.toFixed(1)} m)` : `Stopped at ${st.name.en}: ${Math.abs(err).toFixed(1)} m ${err > 0 ? 'past' : 'short of'} the mark`;
    bus.emit('hud:message', { text: `${msg}. ${delay > 60 ? `${Math.round(delay / 60)} min late.` : delay < -60 ? 'Early.' : 'On time.'}`, kind: overshoot ? 'bad' : Math.abs(err) <= 5 ? 'good' : 'info' });
    this.state = 'doors';
    this.timer = 2.5;
    this.current = r;
  }

  departedEarly(r) {
    if (this.earlyWarned === r) return;
    this.earlyWarned = r;
    const j = this.j;
    j.scoring.penalize('safety', 10, `Started from ${r.station.name.en} without the guard's right away`, { severity: 'critical' });
    bus.emit('hud:alert', { kind: 'early', text: 'Departed without authority!', level: 2 });
    this.state = 'running';
    this.index++;
    j.player.doorsOpen = false;
  }
}
