import { bus } from '../core/EventBus.js';
import { clamp } from '../core/MathUtil.js';

/**
 * Maps driver inputs (keyboard, gamepad, touch, cab clicks) onto the locomotive controls.
 * Easy difficulty adds driving assistance (auto brake release when notching up, auto reverser).
 */
export class PlayerControls {
  constructor(journey) {
    this.j = journey;
    this.repeat = { up: 0, down: 0 };
    this.assist = journey.difficulty.id === 'easy';
  }

  get train() {
    return this.j.player;
  }

  touched() {
    bus.emit('driver:input', {});
  }

  notch(delta) {
    const p = this.train;
    const tr = p.traction;
    if (this.assist && delta > 0) {
      if (tr.reverser === 0) tr.reverser = 1;
      if (tr.notch >= 0) {
        p.brakes.a9 = 0;
        p.brakes.sa9 = 0;
      }
    }
    tr.setNotch(tr.notch + delta);
    this.touched();
    bus.emit('control:notch', { notch: tr.notch });
  }

  setNotch(n) {
    const tr = this.train.traction;
    if (n !== tr.notch) {
      tr.setNotch(n);
      this.touched();
      bus.emit('control:notch', { notch: tr.notch });
    }
  }

  emergency() {
    const p = this.train;
    if (!p.brakes.emergency) {
      p.brakes.emergency = true;
      p.traction.setNotch(0);
      this.j.scoring.emergencyCount++;
      const justified = this.j.events.obstacles.length > 0 || this.j.scoring.spads > 0;
      if (!justified && Math.abs(p.v) > 3) this.j.scoring.penalize('safety', 3, 'Emergency brake used without an emergency', { severity: 'warn' });
      bus.emit('control:emergency', {});
    }
    this.touched();
  }

  releaseTrainBrake(dt) {
    const b = this.train.brakes;
    if (b.emergency) {
      if (Math.abs(this.train.v) < 0.1) {
        b.emergency = false;
        bus.emit('hud:message', { text: 'Emergency reset — brake pipe recharging.', kind: 'info' });
      }
      return;
    }
    b.a9 = clamp(b.a9 - dt * 0.7, 0, 1);
    this.touched();
  }

  applyTrainBrake(dt) {
    const b = this.train.brakes;
    b.a9 = clamp(Math.max(b.a9, 0.02) + dt * 0.55, 0, 1);
    this.touched();
  }

  setA9(v) {
    this.train.brakes.a9 = clamp(v, 0, 1);
    this.touched();
  }

  setSA9(v) {
    this.train.brakes.sa9 = clamp(v, 0, 1);
    this.touched();
  }

  reverser(dir) {
    const tr = this.train.traction;
    if (Math.abs(this.train.v) > 0.3) {
      bus.emit('hud:message', { text: 'Reverser can only be moved when the train is stationary.', kind: 'warn', cooldown: 5 });
      return;
    }
    if (tr.notch !== 0) {
      bus.emit('hud:message', { text: 'Return the controller to 0 before moving the reverser.', kind: 'warn', cooldown: 5 });
      return;
    }
    tr.reverser = clamp(tr.reverser + dir, -1, 1);
    this.touched();
  }

  toggle(id) {
    const p = this.train;
    const tr = p.traction;
    switch (id) {
      case 'headlight':
        p.headlight = (p.headlight + 1) % 3;
        bus.emit('toast', { text: `Headlight: ${['OFF', 'DIM', 'BRIGHT'][p.headlight]}` });
        break;
      case 'wiper':
        p.wiper = (p.wiper + 1) % 3;
        bus.emit('toast', { text: `Wipers: ${['OFF', 'SLOW', 'FAST'][p.wiper]}` });
        break;
      case 'cablight':
        p.cabLight = !p.cabLight;
        break;
      case 'panto': {
        const up = tr.togglePanto();
        bus.emit('toast', { text: up ? 'Raising pantograph…' : 'Lowering pantograph' });
        break;
      }
      case 'vcb':
        if (tr.vcb) {
          tr.openVcb();
          bus.emit('toast', { text: 'VCB opened' });
        } else if (tr.closeVcb()) bus.emit('toast', { text: 'VCB closed — auxiliaries running' });
        else bus.emit('toast', { text: tr.panto < 0.98 ? 'Raise the pantograph first' : 'Controller must be at 0 to close VCB' });
        break;
      case 'vcd':
        this.j.safety.acknowledgeVcd();
        break;
      default:
        break;
    }
    this.touched();
  }

  /** Per-frame: held keys / analog inputs. */
  update(dt, input, blocked) {
    const p = this.train;
    if (!p) return;
    const presses = input.takePresses();
    const handled = [];
    for (const a of presses) {
      if (blocked && blocked.has(a)) {
        handled.push(a);
        continue;
      }
      switch (a) {
        case 'throttleUp': this.notch(1); this.repeat.up = 0.38; break;
        case 'throttleDown': this.notch(-1); this.repeat.down = 0.38; break;
        case 'emergency': this.emergency(); break;
        case 'reverserFwd': this.reverser(1); break;
        case 'reverserBack': this.reverser(-1); break;
        case 'headlight': this.toggle('headlight'); break;
        case 'wiper': this.toggle('wiper'); break;
        case 'cabLight': this.toggle('cablight'); break;
        case 'pantograph': this.toggle('panto'); break;
        case 'vcb': this.toggle('vcb'); break;
        case 'vcdAck': this.toggle('vcd'); break;
        default: handled.push(a); break; // non-driving actions go back to the game
      }
    }
    // auto-repeat for held notch keys
    if (!blocked || !blocked.has('throttleUp')) {
      if (input.isDown('throttleUp')) {
        this.repeat.up -= dt;
        if (this.repeat.up <= 0) {
          this.notch(1);
          this.repeat.up = 0.22;
        }
      }
      if (input.isDown('throttleDown')) {
        this.repeat.down -= dt;
        if (this.repeat.down <= 0) {
          this.notch(-1);
          this.repeat.down = 0.22;
        }
      }
    }
    const blk = (id) => blocked && blocked.has(id);
    if (input.isDown('brakeApply') && !blk('brakeApply')) this.applyTrainBrake(dt);
    if (input.isDown('brakeRelease') && !blk('brakeRelease')) this.releaseTrainBrake(dt);
    if (input.isDown('indApply')) {
      p.brakes.sa9 = clamp(p.brakes.sa9 + dt * 0.9, 0, 1);
      this.touched();
    }
    if (input.isDown('indRelease')) {
      p.brakes.sa9 = clamp(p.brakes.sa9 - dt * 0.9, 0, 1);
      this.touched();
    }
    // analog (gamepad / touch)
    const an = input.analog;
    if (an.throttleRate) {
      this.anAcc = (this.anAcc || 0) + an.throttleRate * dt * 4;
      if (Math.abs(this.anAcc) >= 1) {
        this.notch(Math.sign(this.anAcc));
        this.anAcc = 0;
      }
    }
    if (an.brakeRate) {
      if (an.brakeRate > 0) this.applyTrainBrake(dt * an.brakeRate);
      else this.releaseTrainBrake(dt * -an.brakeRate);
    }
    if (an.touchThrottle != null) this.setNotch(Math.round(an.touchThrottle));
    if (an.touchBrake != null) this.setA9(an.touchBrake);
    // horn & sander
    const hornHigh = input.isDown('horn'), hornLow = input.isDown('hornLow');
    const prevHorn = p.horn;
    p.horn = hornHigh ? 1 : hornLow ? 2 : this.cabHorn ? 1 : 0;
    if (p.horn && !prevHorn) {
      this.touched();
      this.j.hornUses = (this.j.hornUses || 0) + 1;
    }
    p.sander = input.isDown('sander') || !!this.cabSander;
    return handled;
  }
}
