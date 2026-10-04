import { clamp, approach } from '../core/MathUtil.js';

/**
 * Electric locomotive systems: pantograph, main circuit breaker (VCB), reverser,
 * TE/BE master controller with 3-phase style tractive effort ramping, regenerative braking,
 * adhesion and wheel slip with optional slip control.
 */
export class Traction {
  constructor(spec, { coldStart = false } = {}) {
    this.spec = spec;
    this.panto = coldStart ? 0 : 1; // 0 down .. 1 up (animated)
    this.pantoCmd = !coldStart;
    this.vcb = !coldStart;
    this.ohe = true; // live overhead line
    this.reverser = coldStart ? 0 : 1;
    this.notch = 0; // -brakeNotches .. +notches
    this.te = 0; // actual tractive effort N (+) or regen (-)
    this.slip = 0; // wheel slip severity 0..1
    this.slipActive = false;
    this.sanding = false;
    this.slipControl = true;
    this.voltage = 0;
    this.current = 0;
    this.energyUsed = 0; // J from OHE
    this.energyRegen = 0; // J returned
    this.vcbTripped = false;
    this.wheelSpeedExcess = 0;
    this.auxOn = false;
    this.stateMsg = '';
  }

  get powered() {
    return this.panto > 0.98 && this.vcb && this.ohe;
  }

  setNotch(n) {
    this.notch = clamp(Math.round(n), -this.spec.brakeNotches, this.spec.notches);
  }

  adhesion(v, rail) {
    const kmh = Math.abs(v) * 3.6;
    let mu = 0.161 + 7.5 / (kmh + 44);
    mu *= rail.factor;
    if (this.sanding) mu += rail.wet ? 0.07 : 0.03;
    return mu;
  }

  /**
   * Returns { traction (N, + forward along reverser), regen (N, opposing motion magnitude) }.
   * v = signed speed along the train's travel direction.
   */
  step(dt, v, rail, opts = {}) {
    const s = this.spec;
    // pantograph animation
    const panTarget = this.pantoCmd ? 1 : 0;
    this.panto = approach(this.panto, panTarget, dt / (this.pantoCmd ? 6 : 2.5));
    if (!this.pantoCmd || this.panto < 0.98) {
      if (this.vcb && this.panto < 0.5) {
        this.vcb = false;
        this.vcbTripped = true;
      }
    }
    this.voltage = this.panto > 0.98 && this.ohe ? 25000 + Math.sin(opts.time * 0.3 || 0) * 300 : 0;
    this.auxOn = this.powered;
    const speed = Math.abs(v);
    let teTarget = 0;
    if (this.powered && this.reverser !== 0) {
      if (this.notch > 0) {
        const frac = this.notch / s.notches;
        const avail = Math.min(s.maxTE, s.power / Math.max(speed, 0.5));
        teTarget = frac * avail;
        if (speed > s.maxSpeed) teTarget = 0;
      } else if (this.notch < 0) {
        const frac = -this.notch / s.brakeNotches;
        let avail = Math.min(s.maxBE, s.regenPower / Math.max(speed, 0.5));
        avail *= clamp((speed * 3.6 - 3) / 7, 0, 1); // fades out below ~10 km/h
        teTarget = -frac * avail;
      }
    }
    // adhesion limit (loco weight)
    const adhesionLimit = this.adhesion(v, rail) * s.mass * 9.81;
    if (teTarget > 0 && teTarget > adhesionLimit * 0.98) {
      if (this.slipControl) {
        teTarget = adhesionLimit * 0.95;
        this.slipActive = true;
        this.slip = approach(this.slip, 0.35, dt * 2);
      } else {
        this.slip = approach(this.slip, 1, dt * 1.5);
        this.slipActive = true;
      }
    } else {
      this.slip = approach(this.slip, 0, dt * 1.2);
      if (this.slip < 0.05) this.slipActive = false;
    }
    if (!this.slipControl && this.slip > 0.3) teTarget = Math.min(teTarget, adhesionLimit * (1 - 0.45 * this.slip));
    const rate = teTarget >= this.te ? (this.te >= 0 ? s.teRate : s.beRate) : (this.te > 0 ? s.teRate * 1.8 : s.beRate);
    this.te = approach(this.te, teTarget, rate * dt);
    if (!this.powered) this.te = approach(this.te, 0, 200e3 * dt);
    // electrical figures
    const mech = this.te * speed;
    let pElec = 0;
    if (mech > 0) {
      pElec = mech / s.efficiency + (this.auxOn ? s.auxPower : 0);
      this.energyUsed += pElec * dt;
    } else if (mech < 0) {
      const back = -mech * s.efficiency;
      this.energyRegen += back * dt;
      pElec = -back + (this.auxOn ? s.auxPower : 0);
      this.energyUsed += (this.auxOn ? s.auxPower : 0) * dt;
    } else if (this.auxOn) {
      pElec = s.auxPower;
      this.energyUsed += pElec * dt;
    }
    this.current = this.voltage > 0 ? pElec / this.voltage : 0;
    this.wheelSpeedExcess = this.slip * 6;
    const dirSign = this.reverser === 0 ? 0 : this.reverser;
    if (this.te >= 0) return { traction: this.te * dirSign, regen: 0 };
    return { traction: 0, regen: -this.te };
  }

  togglePanto() {
    this.pantoCmd = !this.pantoCmd;
    return this.pantoCmd;
  }
  closeVcb() {
    if (this.panto < 0.98 || !this.ohe) return false;
    if (this.notch !== 0) return false; // interlock: controller must be at zero
    this.vcb = true;
    this.vcbTripped = false;
    return true;
  }
  openVcb() {
    this.vcb = false;
  }
}
