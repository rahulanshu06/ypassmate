import { clamp } from '../core/MathUtil.js';
import { bus } from '../core/EventBus.js';

const WEIGHTS = { safety: 0.35, punctuality: 0.2, comfort: 0.18, efficiency: 0.1, stopping: 0.17 };

/**
 * Tracks driving quality and safety for the player train and produces the final report.
 */
export class Scoring {
  constructor(difficulty) {
    this.diff = difficulty;
    this.scale = difficulty.penaltyScale;
    this.safety = 100;
    this.comfort = 100;
    this.log = [];
    this.stops = []; // { station, error, score, delay }
    this.punct = []; // { station, delaySec, score }
    this.spads = 0;
    this.overspeedTime = 0;
    this.emergencyCount = 0;
    this.comfortNow = 100;
    this.jerk = 0;
    this.prevA = 0;
    this.overspeedState = 0;
    this.warnCooldown = {};
    this.powerBrakeTime = 0;
    this.failed = null;
    this.hornAtBoards = { ok: 0, missed: 0 };
  }

  penalize(category, amount, text, { severity = 'warn', once = null } = {}) {
    if (once) {
      if (this.warnCooldown[once] && this.warnCooldown[once] > 0) return;
      this.warnCooldown[once] = 20;
    }
    const pts = amount * this.scale;
    if (category === 'safety') this.safety = Math.max(0, this.safety - pts);
    if (category === 'comfort') this.comfort = Math.max(0, this.comfort - pts);
    this.log.push({ category, amount: pts, text, severity });
    bus.emit('score:penalty', { category, amount: pts, text, severity });
  }

  note(text, category = 'info') {
    this.log.push({ category, amount: 0, text, severity: 'info' });
  }

  fail(reason) {
    if (this.failed) return;
    this.failed = reason;
    bus.emit('journey:fail', { reason });
  }

  update(dt, train, limitKmh) {
    for (const k of Object.keys(this.warnCooldown)) this.warnCooldown[k] -= dt;
    const speed = Math.abs(train.v) * 3.6;
    // overspeed
    const tol = this.diff.overspeedTolerance;
    const excess = speed - limitKmh;
    if (excess > tol) {
      this.overspeedTime += dt;
      const sev = excess > 10 ? 2 : 1;
      this.safety = Math.max(0, this.safety - dt * (0.12 + excess * 0.03) * this.scale);
      if (this.overspeedState < sev) {
        this.overspeedState = sev;
        bus.emit('hud:alert', { kind: 'overspeed', text: `Overspeed: ${Math.round(speed)} km/h in ${Math.round(limitKmh)} km/h limit`, level: sev });
        this.log.push({ category: 'safety', amount: 0, text: `Overspeed ${Math.round(speed)} km/h in ${Math.round(limitKmh)} limit`, severity: 'warn' });
      }
    } else if (excess < tol - 1) this.overspeedState = 0;
    // comfort: longitudinal acceleration and jerk
    const a = train.a;
    const j = (a - this.prevA) / Math.max(dt, 1e-3);
    this.prevA = a;
    this.jerk += (j - this.jerk) * Math.min(1, dt * 3);
    const aa = Math.abs(a), jj = Math.abs(this.jerk);
    let disc = 0;
    if (aa > 0.85 && speed > 3) disc += (aa - 0.85) * 2.2;
    if (jj > 0.75 && speed > 3) disc += (jj - 0.75) * 1.4;
    // lateral (unbalanced) acceleration
    const lat = train.lateralAcc || 0;
    if (Math.abs(lat) > 0.95) disc += (Math.abs(lat) - 0.95) * 2.0;
    this.comfort = Math.max(0, this.comfort - disc * dt * 2.2 * this.scale);
    this.comfortNow += (clamp(100 - disc * 60, 0, 100) - this.comfortNow) * Math.min(1, dt * 1.5);
    if (disc > 0.6) bus.emit('hud:alert', { kind: 'comfort', text: 'Rough handling — passengers uncomfortable', level: 1, cooldown: 12 });
    // power braking (traction while brakes applied)
    if (train.traction && train.traction.te > 20e3 && train.brakes.bcAvg > 0.6) this.powerBrakeTime += dt;
  }

  recordStop(station, error, overshoot) {
    let score;
    const e = Math.abs(error);
    if (overshoot) score = 0;
    else if (e <= 2) score = 100;
    else if (e <= 5) score = 92;
    else if (e <= 10) score = 80;
    else if (e <= 20) score = 62;
    else score = 45;
    this.stops.push({ station, error, score });
    return score;
  }

  recordTiming(station, delaySec, kind = 'arr') {
    let score;
    if (kind === 'dep' && delaySec < -10) score = Math.max(0, 60 + delaySec / 2); // early departure
    else if (delaySec <= 60) score = 100;
    else score = clamp(100 - (delaySec - 60) / 60 * 9, 0, 100);
    this.punct.push({ station, delaySec, score, kind });
    return score;
  }

  efficiencyScore(train, refEnergyJ) {
    if (!train.traction) return 80;
    const used = train.traction.energyUsed - train.traction.energyRegen;
    const ratio = used / Math.max(refEnergyJ, 1);
    let s = clamp(100 - Math.max(0, ratio - 1) * 70, 25, 100);
    const regenShare = train.traction.energyRegen / Math.max(train.traction.energyUsed, 1);
    s = Math.min(100, s + regenShare * 12);
    s -= Math.min(15, this.powerBrakeTime * 0.5);
    return clamp(s, 0, 100);
  }

  report(train, refEnergyJ, extra = {}) {
    const stopping = this.stops.length ? this.stops.reduce((a, s) => a + s.score, 0) / this.stops.length : 85;
    const punctuality = this.punct.length ? this.punct.reduce((a, s) => a + s.score, 0) / this.punct.length : 85;
    const efficiency = this.efficiencyScore(train, refEnergyJ);
    const parts = {
      safety: Math.round(this.safety), punctuality: Math.round(punctuality), comfort: Math.round(this.comfort),
      efficiency: Math.round(efficiency), stopping: Math.round(stopping),
    };
    let total = 0;
    for (const k of Object.keys(WEIGHTS)) total += parts[k] * WEIGHTS[k];
    if (this.failed) total = Math.min(total, 35);
    total = Math.round(total);
    const stars = this.failed ? 0 : total >= 90 ? 3 : total >= 75 ? 2 : total >= 55 ? 1 : 0;
    return { parts, total, stars, log: this.log, stops: this.stops, punct: this.punct, spads: this.spads, failed: this.failed, ...extra };
  }
}
