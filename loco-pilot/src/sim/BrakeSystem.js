import { clamp, approach } from '../core/MathUtil.js';

// Indian-style twin-pipe graduated release air brake (pressures in kg/cm²).
export const BP_NORMAL = 5.0;
export const BC_MAX = 3.8;
export const LOCO_BC_MAX = 3.5;
export const MR_MAX = 10.0;
export const MR_CUT_IN = 8.0;

/**
 * Brake pipe charged from the main reservoir through a self-lapping automatic brake valve (A9).
 * Pressure travels down the train coach by coach; each distributor valve builds brake cylinder
 * pressure proportional to the pipe reduction. Loco also has an independent (SA9) brake.
 */
export class BrakeSystem {
  constructor(vehicleCount, { mrStart = 9.5, bpStart = BP_NORMAL, bcStart = 0 } = {}) {
    this.n = vehicleCount;
    this.mr = mrStart;
    this.bpFront = bpStart;
    this.bp = new Float32Array(vehicleCount).fill(bpStart);
    this.bc = new Float32Array(vehicleCount).fill(bcStart);
    this.a9 = 0; // 0 = release/running, 0..1 service range
    this.sa9 = 0; // independent loco brake 0..1
    this.emergency = false;
    this.penalty = false; // VCD / ATP penalty application (full service)
    this.compressorOn = false;
    this.compressorAvailable = true;
    this.exhaustRate = 0; // for audio: rate of BP exhaust
    this.chargeRate = 0;
    this.leak = 0.004; // kg/cm²/s MR leakage while idle
    this.lastBpFront = bpStart;
  }

  get bpTarget() {
    if (this.emergency) return 0;
    if (this.penalty) return BP_NORMAL - 1.6;
    if (this.a9 <= 0.02) return BP_NORMAL;
    return BP_NORMAL - (0.5 + this.a9 * 1.1);
  }

  /** Brake cylinder target for a distributor valve given local pipe pressure. */
  dvTarget(bp) {
    const red = BP_NORMAL - bp;
    if (red < 0.22) return 0;
    return clamp(red * 2.5, 0, BC_MAX);
  }

  step(dt, { powered = true } = {}) {
    // compressor governor
    if (this.compressorAvailable && powered) {
      if (this.mr < MR_CUT_IN) this.compressorOn = true;
      if (this.mr >= MR_MAX) this.compressorOn = false;
    } else this.compressorOn = false;
    if (this.compressorOn) this.mr = Math.min(MR_MAX, this.mr + 0.16 * dt);
    this.mr = Math.max(0, this.mr - this.leak * dt);

    // brake pipe at the loco
    const target = Math.min(this.bpTarget, this.mr - 0.3);
    const prev = this.bpFront;
    const lengthFactor = 1 + this.n / 14;
    if (target > this.bpFront) {
      const rate = (0.55 / lengthFactor) * clamp(this.mr - this.bpFront, 0, 2);
      const d = Math.min(target - this.bpFront, rate * dt);
      this.bpFront += d;
      this.mr -= d * 0.35 * lengthFactor;
    } else if (target < this.bpFront) {
      const rate = this.emergency ? 5.0 : 0.65;
      this.bpFront = Math.max(target, this.bpFront - rate * dt);
    }
    this.exhaustRate = Math.max(0, (prev - this.bpFront) / dt);
    this.chargeRate = Math.max(0, (this.bpFront - prev) / dt);

    // propagation along the train (emergency propagates faster)
    const tau = this.emergency ? 0.06 : 0.16;
    const k = 1 - Math.exp(-dt / tau);
    let up = this.bpFront;
    for (let i = 0; i < this.n; i++) {
      this.bp[i] += (up - this.bp[i]) * k;
      up = this.bp[i];
    }
    // distributor valves
    for (let i = 0; i < this.n; i++) {
      let t = this.dvTarget(this.bp[i]);
      if (i === 0) t = Math.min(LOCO_BC_MAX, Math.max(t, this.sa9 * LOCO_BC_MAX));
      const rateUp = this.emergency ? 1.6 : 0.95;
      const rateDown = 0.24;
      this.bc[i] = this.bc[i] < t ? approach(this.bc[i], t, rateUp * dt) : approach(this.bc[i], t, rateDown * dt);
    }
  }

  /** Average brake cylinder pressure over the coaches (excludes loco). */
  get bcAvg() {
    if (this.n <= 1) return this.bc[0];
    let s = 0;
    for (let i = 1; i < this.n; i++) s += this.bc[i];
    return s / (this.n - 1);
  }
  get bcLoco() {
    return this.bc[0];
  }
  get bpRear() {
    return this.bp[this.n - 1];
  }
  get released() {
    return this.bcAvg < 0.1 && this.bc[0] < 0.1;
  }
}
