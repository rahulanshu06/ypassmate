import { clamp } from '../core/MathUtil.js';

/**
 * Simple automatic driver for the player's train (menu attract mode and testing):
 * follows braking curves for limits, red signals and booked stops.
 */
export class AutoPilot {
  constructor(journey) {
    this.j = journey;
  }
  update() {
    const j = this.j;
    const p = j.player;
    if (!p || j.state !== 'running') return;
    const decel = 0.42;
    let target = (p.currentLimit().kmh / 3.6) * 0.95;
    for (const r of p.limitsAhead(3000)) target = Math.min(target, Math.sqrt(((r.kmh / 3.6) * 0.95) ** 2 + 2 * decel * Math.max(0, r.distance - 80)));
    const red = j.signals.signalsAhead(p, 2, 3000).find((s) => s.aspect === 'R');
    if (red) target = Math.min(target, Math.sqrt(2 * decel * Math.max(0, red.distance - 40)));
    const st = j.ops.state;
    if (j.ops.next) {
      const d = j.ops.distanceToNext();
      if (d > -10) target = Math.min(target, Math.sqrt(2 * decel * Math.max(0, d - 0.5)));
    }
    if ((st === 'origin' && !j.ops.originRA) || ['doors', 'dwell', 'waitTime', 'waitSignal', 'rightAway', 'complete'].includes(st)) target = 0;
    for (const ob of j.events.obstacles) {
      const d = (ob.s - p.s) * p.dir;
      if (d > 0) target = Math.min(target, Math.sqrt(2 * 0.6 * Math.max(0, d - 60)));
    }
    p.horn = j.events.obstacles.length ? 1 : 0;
    const v = p.v;
    p.brakes.sa9 = 0;
    if (p.traction.reverser === 0) p.traction.reverser = 1;
    if (target < 0.3 && v < 0.4) {
      p.traction.setNotch(0);
      p.brakes.a9 = 0.5;
    } else if (v < target - 0.8) {
      p.brakes.a9 = 0;
      p.traction.setNotch(Math.min(10, Math.ceil((target - v) * 2.5)));
    } else if (v > target + 0.5) {
      p.traction.setNotch(-Math.min(8, Math.ceil((v - target) * 3)));
      p.brakes.a9 = v > target + 2 ? clamp((v - target) * 0.25, 0, 1) : 0;
    } else {
      p.traction.setNotch(v < target ? 2 : 0);
      p.brakes.a9 = 0;
    }
  }
}
