import { TrainDynamics } from './Dynamics.js';
import { BrakeSystem, BC_MAX, LOCO_BC_MAX } from './BrakeSystem.js';
import { Traction } from './Traction.js';
import { G, clamp } from '../core/MathUtil.js';

let nextId = 1;

/** Which stations a train stops at and on which track. */
export class TrainPlan {
  constructor({ stops = [], tracks = {}, dwell = 45, holds = {} } = {}) {
    this.stops = new Set(stops);
    this.tracks = tracks; // stationId -> trackId
    this.dwell = dwell;
    this.holds = holds; // stationId -> condition fn
  }
  stopsAt(id) {
    return this.stops.has(id);
  }
}

/**
 * A train on the network: consist, path, position (front chainage `s`), speed and physics.
 * `v` is signed along the path direction. The player train adds traction + full air brakes.
 */
export class Train {
  constructor({ id, name, number, consist, path, s, v = 0, isPlayer = false, plan, kind = 'passenger', maxSpeed = 110, livery }) {
    this.id = id || `T${nextId++}`;
    this.name = name;
    this.number = number;
    this.consist = consist;
    this.vehicles = consist.vehicles;
    this.length = consist.length;
    this.mass = consist.mass;
    this.path = path;
    this.dir = path.dir;
    this.s = s;
    this.v = v;
    this.a = 0;
    this.isPlayer = isPlayer;
    this.plan = plan || new TrainPlan();
    this.kind = kind;
    this.maxSpeed = maxSpeed / 3.6;
    this.livery = livery;
    this.active = true;
    this.dynamics = new TrainDynamics(consist);
    this.brakeForces = new Float32Array(this.vehicles.length);
    this.headlight = 2; // 0 off, 1 dim, 2 bright
    this.cabLight = false;
    this.interiorLights = true;
    this.horn = 0;
    this.distance = 0;
    this.limits = [];
    this.wsp = false;
    this.slide = false;
    this.doorsOpen = false;
    this.visible = true;
  }

  get rearS() {
    return this.s - this.dir * this.length;
  }

  vehicleCentreS(i) {
    return this.s - this.dir * this.vehicles[i].centreOffset;
  }

  /** Effective speed restriction (km/h) for the whole train, with rear-clearing. */
  currentLimit() {
    const lo = Math.min(this.s, this.rearS), hi = Math.max(this.s, this.rearS);
    let lim = this.maxSpeed * 3.6;
    let reason = 'Train max';
    for (const r of this.limits) {
      if (r.s1 < lo || r.s0 > hi) continue;
      if (r.kmh < lim) {
        lim = r.kmh;
        reason = r.label || r.kind;
      }
    }
    if (this.authorityLimit != null && this.authorityLimit < lim) {
      lim = this.authorityLimit;
      reason = 'Authority to pass signal';
    }
    return { kmh: lim, reason };
  }

  /** Upcoming restrictions within `dist` metres ahead of the front (lower than current). */
  limitsAhead(dist = 4000) {
    const out = [];
    for (const r of this.limits) {
      const start = this.dir > 0 ? r.s0 : r.s1;
      const d = (start - this.s) * this.dir;
      if (d > 0 && d < dist) out.push({ distance: d, kmh: Math.min(r.kmh, this.maxSpeed * 3.6), r });
    }
    out.sort((a, b) => a.distance - b.distance);
    return out;
  }

  move(dt) {
    const ds = this.v * dt;
    this.s += this.dir * ds;
    this.distance += Math.abs(ds);
  }
}

/**
 * Player-controlled train: electric traction + air brakes + driver controls.
 */
export class PlayerTrain extends Train {
  constructor(opts) {
    super({ ...opts, isPlayer: true });
    const coldStart = !!opts.coldStart;
    this.traction = new Traction(this.consist.loco, { coldStart });
    this.brakes = new BrakeSystem(this.vehicles.length, {
      mrStart: coldStart ? 4.2 : 9.4,
      bpStart: coldStart ? 0 : 5.0,
      bcStart: coldStart ? 3.0 : 0,
    });
    if (coldStart) {
      this.brakes.sa9 = 1;
      this.brakes.a9 = 1;
    } else {
      this.brakes.sa9 = 1; // loco brake applied while standing
    }
    this.wiper = 0;
    this.sander = false;
    this.rail = { factor: 1, wet: false, brakeMu: 0.16 };
    this.energyStart = 0;
  }

  computeBrakeForces(speed) {
    const b = this.brakes;
    const fric = speed < 5.5 ? 1.12 : 1;
    this.wsp = false;
    this.slide = false;
    for (let i = 0; i < this.vehicles.length; i++) {
      const veh = this.vehicles[i];
      const max = i === 0 ? LOCO_BC_MAX : BC_MAX;
      let f = (b.bc[i] / max) * veh.brakeRatio * veh.mass * G * fric;
      const adh = this.rail.brakeMu * veh.mass * G;
      if (f > adh) {
        if (i === 0) {
          f = adh * 0.7;
          if (speed > 0.5) this.slide = true;
        } else {
          f = adh * 0.92;
          if (speed > 0.5) this.wsp = true;
        }
      }
      this.brakeForces[i] = speed > 0.001 || f > 0 ? f : 0;
    }
  }

  step(dt, env) {
    const tr = this.traction;
    tr.sanding = this.sander;
    const out = tr.step(dt, this.v, this.rail, { time: env.time });
    this.brakes.step(dt, { powered: tr.powered });
    this.computeBrakeForces(Math.abs(this.v));
    const nv = this.dynamics.step(dt, {
      s: this.s, v: this.v, dir: this.dir, geo: env.geo,
      traction: out.traction, regen: Math.abs(this.v) > 0.05 ? out.regen : 0, brake: this.brakeForces, tunnel: env.inTunnel,
    });
    this.a = this.dynamics.a;
    this.v = clamp(nv, -8, 60);
    this.move(dt);
  }
}

/**
 * AI train: simplified traction/brake force control, same resistance physics.
 */
export class AITrain extends Train {
  constructor(opts) {
    super(opts);
    this.maxTE = opts.maxTE || 300e3;
    this.power = opts.power || 4.2e6;
    this.maxDecel = opts.kind === 'freight' ? 0.32 : 0.55;
    this.driver = null;
    this.headlight = 2;
  }
  step(dt, env, cmd) {
    const speed = Math.abs(this.v);
    let traction = 0;
    const brakeTotal = cmd.brake * this.mass * this.maxDecel;
    if (cmd.power > 0) traction = cmd.power * Math.min(this.maxTE, this.power / Math.max(speed, 1));
    const per = brakeTotal / this.vehicles.length;
    for (let i = 0; i < this.vehicles.length; i++) this.brakeForces[i] = per;
    const nv = this.dynamics.step(dt, { s: this.s, v: this.v, dir: this.dir, geo: env.geo, traction, regen: 0, brake: this.brakeForces, tunnel: env.inTunnel });
    this.a = this.dynamics.a;
    this.v = Math.max(0, nv);
    this.move(dt);
  }
}
