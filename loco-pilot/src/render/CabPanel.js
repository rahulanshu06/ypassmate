import * as THREE from 'three';
import { FONTS } from './TextureGen.js';
import { clamp } from '../core/MathUtil.js';

/**
 * Live instrument panel texture for the driver's desk: duplex air gauges, speedometer,
 * driver display unit (DDU) and indicator lamps. Redrawn ~15 times a second.
 */
export class CabPanel {
  constructor(theme) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 384;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.theme = theme;
    this.timer = 0;
    this.blink = 0;
  }

  update(dt, s) {
    this.timer -= dt;
    this.blink += dt;
    if (this.timer > 0) return;
    this.timer = 1 / 15;
    this.draw(s);
    this.texture.needsUpdate = true;
  }

  gauge(cx, cy, r, max, needles, label, unit, ticks = 10) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = '#16181b';
    c.beginPath(); c.arc(0, 0, r + 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f4f1e8';
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    c.strokeStyle = '#222';
    for (let i = 0; i <= ticks * 2; i++) {
      const a = a0 + (a1 - a0) * (i / (ticks * 2));
      const major = i % 2 === 0;
      c.lineWidth = major ? 3 : 1.5;
      c.beginPath();
      c.moveTo(Math.cos(a) * (r - (major ? 16 : 9)), Math.sin(a) * (r - (major ? 16 : 9)));
      c.lineTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
      c.stroke();
      if (major) {
        c.fillStyle = '#222';
        c.font = `600 ${Math.round(r * 0.2)}px ${FONTS.latin}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(String(Math.round((max * i) / (ticks * 2))), Math.cos(a) * (r - 30), Math.sin(a) * (r - 30));
      }
    }
    c.fillStyle = '#333';
    c.font = `700 ${Math.round(r * 0.17)}px ${FONTS.latin}`;
    c.fillText(label, 0, r * 0.38);
    c.font = `600 ${Math.round(r * 0.13)}px ${FONTS.latin}`;
    c.fillText(unit, 0, r * 0.58);
    for (const [v, col, w] of needles) {
      const a = a0 + (a1 - a0) * clamp(v / max, 0, 1.02);
      c.strokeStyle = col;
      c.lineWidth = w;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-Math.cos(a) * 10, -Math.sin(a) * 10);
      c.lineTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12));
      c.stroke();
    }
    c.fillStyle = '#111';
    c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  lamp(x, y, on, color, label) {
    const c = this.ctx;
    c.fillStyle = '#0b0c0e';
    c.beginPath(); c.arc(x, y, 15, 0, Math.PI * 2); c.fill();
    c.fillStyle = on ? color : '#2a2c30';
    c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.fill();
    if (on) {
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.beginPath(); c.arc(x - 3, y - 3, 3, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#d8dde3';
    c.font = `600 13px ${FONTS.latin}`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(label, x + 20, y);
  }

  draw(s) {
    const c = this.ctx;
    const W = 1024, H = 384;
    c.fillStyle = this.theme.panel;
    c.fillRect(0, 0, W, H);
    // brushed panel texture lines
    c.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
    // duplex gauges
    this.gauge(105, 105, 82, 12, [[s.mr, '#111', 4], [s.fp, '#c62828', 3]], 'MR / FP', 'kg/cm²', 6);
    this.gauge(105, 282, 82, 10, [[s.bp, '#111', 4], [s.bc, '#c62828', 3]], 'BP / BC', 'kg/cm²', 5);
    // speedometer
    this.gauge(390, 192, 150, 160, [[s.speed, '#d32f2f', 5]], 'km/h', s.locoName, 8);
    c.fillStyle = '#0c1a10';
    c.fillRect(345, 230, 90, 40);
    c.fillStyle = '#7dff9a';
    c.font = `700 34px ${FONTS.latin}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(Math.round(s.speed)).padStart(3, '0'), 390, 251);
    // permitted speed marker
    if (s.limit) {
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      const a = a0 + (a1 - a0) * clamp(s.limit / 160, 0, 1);
      c.strokeStyle = '#ffb300';
      c.lineWidth = 8;
      c.beginPath();
      c.arc(390, 192, 156, a - 0.025, a + 0.025);
      c.stroke();
    }
    // DDU screen
    const x0 = 575, y0 = 26, w = 300, h = 330;
    c.fillStyle = '#0a0f1a';
    c.fillRect(x0 - 8, y0 - 8, w + 16, h + 16);
    c.fillStyle = s.night ? '#0b1a33' : '#0d2142';
    c.fillRect(x0, y0, w, h);
    c.fillStyle = '#9fd3ff';
    c.font = `700 17px ${FONTS.latin}`;
    c.textAlign = 'left';
    c.fillText('DDU  ·  ' + s.locoName, x0 + 12, y0 + 18);
    c.fillStyle = '#e6f0ff';
    const row = (i, k, v, col = '#e6f0ff') => {
      c.fillStyle = '#8fb3d9';
      c.font = `600 17px ${FONTS.latin}`;
      c.fillText(k, x0 + 12, y0 + 52 + i * 27);
      c.fillStyle = col;
      c.font = `700 19px ${FONTS.latin}`;
      c.textAlign = 'right';
      c.fillText(v, x0 + w - 12, y0 + 52 + i * 27);
      c.textAlign = 'left';
    };
    const te = s.te / 1000;
    row(0, te >= 0 ? 'Tractive effort' : 'Regen brake', `${Math.abs(te).toFixed(0)} kN`, te >= 0 ? '#9bffb1' : '#ffcf6b');
    row(1, 'Controller', s.notch > 0 ? `T ${s.notch}` : s.notch < 0 ? `B ${-s.notch}` : '0', '#ffffff');
    row(2, 'Reverser', s.reverser > 0 ? 'FORWARD' : s.reverser < 0 ? 'REVERSE' : 'NEUTRAL');
    row(3, 'OHE voltage', `${(s.voltage / 1000).toFixed(1)} kV`, s.voltage > 20000 ? '#9bffb1' : '#ff7a7a');
    row(4, 'Primary current', `${Math.round(s.current)} A`);
    row(5, 'Pantograph', s.panto > 0.98 ? 'RAISED' : s.panto > 0.02 ? 'MOVING' : 'LOWERED', s.panto > 0.98 ? '#9bffb1' : '#ffcf6b');
    row(6, 'VCB', s.vcb ? 'CLOSED' : 'OPEN', s.vcb ? '#9bffb1' : '#ff7a7a');
    row(7, 'Brake cyl. (loco)', `${s.bcLoco.toFixed(1)} kg/cm²`);
    row(8, 'Energy / regen', `${s.kwh.toFixed(0)} / ${s.regen.toFixed(0)} kWh`);
    if (s.message) {
      c.fillStyle = Math.floor(this.blink * 2) % 2 ? '#ff5252' : '#ffd54f';
      c.font = `700 18px ${FONTS.latin}`;
      c.fillText(s.message, x0 + 12, y0 + h - 16);
    }
    // indicator lamps
    const blinkOn = Math.floor(this.blink * 3) % 2 === 0;
    this.lamp(905, 40, !s.vcb, '#ff3b30', 'VCB OPEN');
    this.lamp(905, 80, s.slip, '#ffcc00', 'WHEEL SLIP');
    this.lamp(905, 120, s.bc > 0.3 || s.bcLoco > 0.3, '#ff9500', 'BRAKE ON');
    this.lamp(905, 160, s.vcdAlarm && blinkOn, '#ff3b30', 'VCD');
    this.lamp(905, 200, s.compressor, '#34c759', 'COMPR.');
    this.lamp(905, 240, s.atp, '#0a84ff', 'ATP');
    this.lamp(905, 280, s.emergency, '#ff3b30', 'EMERG.');
    this.lamp(905, 320, s.sanding, '#ffcc00', 'SAND');
    this.lamp(905, 360, s.wsp, '#ffcc00', 'WSP');
  }
}

/** Windshield raindrops simulated on a canvas and wiped by the wiper arcs. */
export class WindshieldRain {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.drops = [];
    this.timer = 0;
    this.clean = true;
  }
  // wipers: [{ cx, cy (canvas px), angle (rad), prev }]
  update(dt, rain, speed, wipers) {
    this.timer -= dt;
    const add = rain * (18 + speed * 0.9) * dt * 6;
    for (let i = 0; i < add; i++) {
      if (this.drops.length > 650) this.drops.shift();
      this.drops.push({ x: Math.random() * 512, y: Math.random() * 256, r: 2.2 + Math.random() * 4.2 * (0.6 + rain * 0.6), vy: 0 });
    }
    for (const d of this.drops) {
      // airflow pushes drops up and outwards at speed; gravity pulls large drops down when slow
      if (speed > 8) {
        d.y -= (speed * 0.12) * dt * (d.r / 3);
        d.x += (d.x - 256) * 0.0006 * speed * dt;
      } else if (d.r > 3.2) d.y += 6 * dt;
    }
    for (const w of wipers) {
      if (w.prev === undefined) {
        w.prev = w.angle;
        continue;
      }
      const a0 = Math.min(w.prev, w.angle), a1 = Math.max(w.prev, w.angle);
      if (a1 - a0 > 1e-4) {
        this.drops = this.drops.filter((d) => {
          const dx = d.x - w.cx, dy = w.cy - d.y;
          const r = Math.hypot(dx, dy);
          if (r > w.len || r < 12) return true;
          const a = Math.atan2(dx, dy);
          return a < a0 - 0.05 || a > a1 + 0.05;
        });
      }
      w.prev = w.angle;
    }
    this.drops = this.drops.filter((d) => d.y > -5 && d.y < 261 && d.x > -5 && d.x < 517);
    if (this.timer > 0) return;
    this.timer = 1 / 24;
    const c = this.ctx;
    c.clearRect(0, 0, 512, 256);
    for (const d of this.drops) {
      const g = c.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 0, d.x, d.y, d.r);
      g.addColorStop(0, 'rgba(255,255,255,0.75)');
      g.addColorStop(0.45, 'rgba(200,210,220,0.35)');
      g.addColorStop(0.8, 'rgba(60,70,80,0.5)');
      g.addColorStop(1, 'rgba(20,25,30,0.15)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(d.x, d.y, d.r, d.r * 1.15, 0, 0, Math.PI * 2);
      c.fill();
    }
    this.texture.needsUpdate = true;
  }
}
