import { bus } from '../core/EventBus.js';
import { clamp } from '../core/MathUtil.js';

/**
 * Safety supervision of the player's train: SPAD, permission to pass automatic signals at
 * danger after waiting, vigilance control (VCD), ATP auto-braking (Easy), buffer/overrun,
 * curve overspeed derailment risk, rollback, doors, headlights and whistle boards.
 */
export class Safety {
  constructor(journey) {
    this.j = journey;
    this.diff = journey.difficulty;
    this.vcdTimer = 0;
    this.vcdAlarm = 0;
    this.vcdPenalty = false;
    this.waitAtSignal = null; // { signal, t }
    this.authority = null; // { signal }
    this.atpActive = false;
    this.atpReason = '';
    this.whistleWindows = [];
    this.rollbackWarned = false;
    this.headlightWarned = false;
    this.offs = [
      bus.on('signal:passed', (e) => this.onSignalPassed(e)),
      bus.on('driver:input', () => this.resetVcd()),
    ];
  }

  dispose() {
    this.offs.forEach((f) => f());
  }

  resetVcd() {
    this.vcdTimer = 0;
    if (this.vcdAlarm > 0) {
      this.vcdAlarm = 0;
      bus.emit('vcd:ack', {});
    }
  }

  acknowledgeVcd() {
    this.resetVcd();
    if (this.vcdPenalty && Math.abs(this.j.player.v) < 0.05) {
      this.vcdPenalty = false;
      this.j.player.brakes.penalty = false;
      bus.emit('hud:message', { text: 'VCD penalty brake reset.', kind: 'info' });
    }
  }

  onSignalPassed({ train, signal, aspect }) {
    if (!train.isPlayer) return;
    const j = this.j;
    if (this.authority && this.authority.signal === signal) {
      bus.emit('hud:message', { text: `Passing ${signal.name} at danger on authority — keep below 10 km/h until the next signal.`, kind: 'info' });
      return;
    }
    if (this.authority && this.authority.signal !== signal) {
      // reached the next signal: authority ends
      this.authority = null;
      j.player.authorityLimit = null;
    }
    if (aspect === 'R') {
      j.scoring.spads++;
      j.scoring.penalize('safety', 38, `SPAD — signal ${signal.name} passed at danger`, { severity: 'critical' });
      bus.emit('spad', { signal });
      bus.emit('hud:alert', { kind: 'spad', text: `SPAD! ${signal.name} passed at danger`, level: 3 });
      if (this.diff.spadEmergency) j.player.brakes.emergency = true;
      if (this.diff.spadEnds) j.scoring.fail(`Signal ${signal.name} passed at danger (SPAD)`);
    }
    if (aspect === 'Y' || aspect === 'YY') j.lastCaution = { aspect, signal };
  }

  update(dt) {
    const j = this.j;
    const p = j.player;
    const speed = Math.abs(p.v);
    // ---------------------------------------------------------- vigilance control
    if (this.diff.vcd && speed > 1.2) {
      this.vcdTimer += dt;
      if (this.vcdTimer > 60 && this.vcdAlarm === 0) {
        this.vcdAlarm = 0.001;
        bus.emit('vcd:alarm', {});
        bus.emit('hud:alert', { kind: 'vcd', text: 'VIGILANCE — press Q (VCD) to acknowledge', level: 2 });
      }
      if (this.vcdAlarm > 0) {
        this.vcdAlarm += dt;
        if (this.vcdAlarm > 8 && !this.vcdPenalty) {
          this.vcdPenalty = true;
          p.brakes.penalty = true;
          j.scoring.penalize('safety', 10, 'Vigilance not acknowledged — penalty brake applied', { severity: 'critical' });
          bus.emit('hud:alert', { kind: 'vcd', text: 'VCD PENALTY BRAKE — stop, then press Q to reset', level: 3 });
        }
      }
    } else if (!this.vcdPenalty) {
      this.vcdTimer = 0;
      this.vcdAlarm = 0;
    }
    // ---------------------------------------------------------- waiting at a red automatic signal
    const ahead = j.signals.signalsAhead(p, 1, 160)[0];
    if (ahead && ahead.aspect === 'R' && ahead.signal.type === 'auto' && speed < 0.05 && ahead.distance < 150) {
      if (!this.waitAtSignal || this.waitAtSignal.signal !== ahead.signal) this.waitAtSignal = { signal: ahead.signal, t: 0 };
      this.waitAtSignal.t += dt;
      const need = j.isNight ? 120 : 60;
      if (this.waitAtSignal.t >= need && !this.authority) {
        this.authority = { signal: ahead.signal };
        p.authorityLimit = 10;
        bus.emit('hud:message', { text: `Waited ${need / 60} min at ${ahead.signal.name}. You may now pass it at danger, max 10 km/h, prepared to stop short of any obstruction.`, kind: 'good' });
      } else if (this.waitAtSignal.t > 2 && Math.floor(this.waitAtSignal.t) % 15 === 0 && Math.floor(this.waitAtSignal.t - dt) % 15 !== 0) {
        bus.emit('hud:message', { text: `Stopped at automatic signal ${ahead.signal.name} (red). Waiting ${Math.ceil(need - this.waitAtSignal.t)} s before you may proceed with caution.`, kind: 'info' });
      }
    } else if (speed > 0.3 && this.waitAtSignal && !this.authority) this.waitAtSignal = null;
    // ---------------------------------------------------------- ATP (Easy difficulty)
    this.atpActive = false;
    if (this.diff.atp) {
      const lim = p.currentLimit().kmh / 3.6;
      let permit = lim + 5 / 3.6;
      const red = j.signals.signalsAhead(p, 3, 3000).find((s) => s.aspect === 'R');
      if (red && !(this.authority && this.authority.signal === red.signal)) {
        const vp = Math.sqrt(2 * 0.5 * Math.max(0, red.distance - 45));
        if (vp < permit) {
          permit = vp + 1.5;
          this.atpReason = 'Red signal ahead';
        }
      }
      for (const r of p.limitsAhead(2500)) {
        const vp = Math.sqrt((r.kmh / 3.6) ** 2 + 2 * 0.45 * Math.max(0, r.distance - 30)) + 3 / 3.6;
        if (vp < permit) {
          permit = vp;
          this.atpReason = `Speed restriction ${r.kmh} km/h`;
        }
      }
      if (speed > permit) {
        this.atpActive = true;
        if (!this.atpHold) this.atpHold = { driverA9: p.brakes.a9, a9: 0 };
        p.brakes.a9 = Math.max(p.brakes.a9, clamp((speed - permit) * 1.2 + 0.3, 0.3, 1));
        this.atpHold.a9 = p.brakes.a9;
        if (p.traction.notch > 0) p.traction.setNotch(0);
        bus.emit('hud:alert', { kind: 'atp', text: `ATP braking — ${this.atpReason}`, level: 1, cooldown: 8 });
      } else if (this.atpHold && speed < permit - 1.5) {
        // like a real ATP, the intervention is released once the train is back under the permitted curve
        if (p.brakes.a9 <= this.atpHold.a9 + 0.01) p.brakes.a9 = this.atpHold.driverA9;
        this.atpHold = null;
        bus.emit('hud:message', { text: 'ATP brake released — you have control.', kind: 'info', cooldown: 6 });
      }
    }
    // ---------------------------------------------------------- curve overspeed (derailment risk)
    const curveV = j.world.geo.curveSpeedLimit(p.s);
    if (speed > 16 && speed > curveV * 1.42) {
      j.scoring.penalize('safety', 60, 'Excessive speed on a curve — derailment risk', { severity: 'critical' });
      p.brakes.emergency = true;
      j.scoring.fail('Severe overspeed on a curve (derailment risk)');
    }
    // ---------------------------------------------------------- rollback
    if (p.v < -0.4 && p.traction.reverser >= 0 && !this.rollbackWarned) {
      this.rollbackWarned = true;
      j.scoring.penalize('safety', 6, 'Train rolled back — hold it with the loco brake before releasing', { severity: 'warn' });
      bus.emit('hud:alert', { kind: 'rollback', text: 'ROLLBACK — apply brakes!', level: 2 });
    }
    if (p.v > 0.5) this.rollbackWarned = false;
    // ---------------------------------------------------------- headlight at night
    if (j.isNight && speed > 5 && p.headlight === 0 && !this.headlightWarned) {
      this.headlightWarned = true;
      j.scoring.penalize('safety', 4, 'Running at night without the headlight', { severity: 'warn' });
      bus.emit('hud:alert', { kind: 'headlight', text: 'Headlight off at night — press L', level: 1 });
    }
    // ---------------------------------------------------------- whistle boards (Hard / Simulation)
    if (this.diff.id === 'hard' || this.diff.id === 'sim') {
      for (const b of j.world.network.boards) {
        if (b.kind !== 'whistle' || b.dir !== p.dir) continue;
        const d = (p.s - b.s) * p.dir;
        if (d > 0 && d < speed * dt + 1 && !this.whistleWindows.find((w) => w.board === b)) this.whistleWindows.push({ board: b, horn: false, until: b.s + p.dir * 600 });
      }
      for (const w of this.whistleWindows) {
        if (w.done) continue;
        if (p.horn > 0) w.horn = true;
        if ((p.s - w.until) * p.dir > 0) {
          w.done = true;
          if (w.horn) j.scoring.hornAtBoards.ok++;
          else {
            j.scoring.hornAtBoards.missed++;
            j.scoring.penalize('safety', 2, 'Whistle board passed without sounding the horn', { severity: 'warn' });
          }
        }
      }
    }
  }
}
