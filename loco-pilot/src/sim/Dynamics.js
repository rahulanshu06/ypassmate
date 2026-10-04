import { G } from '../core/MathUtil.js';

/**
 * Longitudinal train dynamics with distributed gradient and curve resistance.
 * Positive speed = moving in the train's path direction (front first). Reverse moves are negative.
 */
export class TrainDynamics {
  constructor(consist) {
    this.vehicles = consist.vehicles;
    this.mass = consist.mass;
    this.massEff = this.vehicles.reduce((a, v) => a + v.mass * v.rotFactor, 0);
    this.length = consist.length;
    this.a = 0;
    this.lastForces = { traction: 0, brake: 0, resist: 0, grade: 0, curve: 0 };
    this.tmp = {};
  }

  /**
   * @param ctx { s, v, dir, geo, traction (signed N), regen (N), brake (Float32Array per vehicle, N),
   *              tunnel(s) -> bool, adhesionBrake (mu) }
   * @returns new speed
   */
  step(dt, ctx) {
    const { s, v, dir, geo } = ctx;
    let gradeF = 0, curveF = 0, davisA = 0, davisB = 0, davisC = 0, brakeF = 0;
    const speed = Math.abs(v);
    const vs = this.vehicles;
    let startRes = 0;
    for (let i = 0; i < vs.length; i++) {
      const veh = vs[i];
      const sc = s - dir * veh.centreOffset;
      const grade = geo.gradeAt(sc) * dir;
      gradeF -= veh.mass * G * grade;
      const k = Math.abs(geo.curvatureAt(sc));
      if (k > 1e-5) {
        const R = 1 / k;
        curveF += veh.mass * G * (0.6 / Math.max(R - 55, 120));
      }
      const t = veh.mass / 1000;
      davisA += veh.davisA * t;
      davisB += veh.davisB * t * speed;
      if (i === 0 || veh.kind === 'wagon') davisC += veh.davisC * speed * speed;
      else davisC += veh.davisC * speed * speed;
      startRes += speed < 1 ? (1 - speed) * 28 * t : 0;
      if (ctx.brake) brakeF += ctx.brake[i] || 0;
    }
    if (ctx.tunnel) davisC *= 1.9;
    const resist = davisA + davisB + davisC + curveF + startRes;
    const opposing = resist + brakeF + (ctx.regen || 0); // always opposes motion
    const drive = (ctx.traction || 0) + gradeF; // signed along path direction
    let nv;
    if (Math.abs(v) < 0.02) {
      // static friction / brakes hold the train unless the drive exceeds them
      if (Math.abs(drive) <= opposing) {
        nv = 0;
        this.a = 0;
      } else {
        const net = drive - Math.sign(drive) * opposing;
        this.a = net / this.massEff;
        nv = v + this.a * dt;
      }
    } else {
      const net = drive - Math.sign(v) * opposing;
      this.a = net / this.massEff;
      nv = v + this.a * dt;
      if (Math.sign(nv) !== Math.sign(v) && Math.abs(drive) <= opposing) {
        nv = 0;
      }
    }
    this.lastForces.traction = ctx.traction || 0;
    this.lastForces.brake = brakeF + (ctx.regen || 0);
    this.lastForces.resist = resist;
    this.lastForces.grade = gradeF;
    this.lastForces.curve = curveF;
    return nv;
  }
}
