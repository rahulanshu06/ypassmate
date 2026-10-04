import * as THREE from 'three';
import { boardTexture, fitText, FONTS } from './TextureGen.js';
import { materials } from './Materials.js';

const matCache = new Map();

function boardMaterial(key, w, h, draw, { glow = 0.35 } = {}) {
  if (matCache.has(key)) return matCache.get(key);
  const tex = boardTexture(key, w, h, draw);
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.05, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0 });
  m.name = 'board:' + key;
  materials.nightLit.push({ m, intensity: glow });
  matCache.set(key, m);
  return m;
}

function border(ctx, w, h, color = '#111', lw = 10) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
}

/** Classic yellow station name board: Hindi on top, English below, MSL altitude. */
export function stationBoardMaterial(st, elevation) {
  return boardMaterial('stn:' + st.id, 1024, 420, (ctx, w, h) => {
    ctx.fillStyle = '#f3c614';
    ctx.fillRect(0, 0, w, h);
    border(ctx, w, h, '#1a1a1a', 14);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const hs = fitText(ctx, st.name.hi, w - 80, `700 {s}px ${FONTS.deva}`, 150);
    ctx.font = `700 ${hs}px ${FONTS.deva}`;
    ctx.fillText(st.name.hi, w / 2, h * 0.32);
    const es = fitText(ctx, st.name.en.toUpperCase(), w - 80, `700 {s}px ${FONTS.latin}`, 120);
    ctx.font = `700 ${es}px ${FONTS.latin}`;
    ctx.fillText(st.name.en.toUpperCase(), w / 2, h * 0.68);
    ctx.font = `600 30px ${FONTS.latin}`;
    ctx.fillText(`समुद्र तल से ऊँचाई ${elevation.toFixed(2)} मी.   ·   M.S.L. ${elevation.toFixed(2)} M`, w / 2, h * 0.9);
  });
}

export function platformNumberMaterial(n) {
  return boardMaterial('pf:' + n, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#123a7a';
    ctx.fillRect(0, 0, w, h);
    border(ctx, w, h, '#f5f5f5', 10);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 34px ${FONTS.deva}`;
    ctx.fillText('प्लेटफॉर्म', w / 2, 46);
    ctx.font = `700 120px ${FONTS.latin}`;
    ctx.fillText(String(n), w / 2, 140);
    ctx.font = `600 34px ${FONTS.latin}`;
    ctx.fillText('PLATFORM', w / 2, 220);
  }, { glow: 0.8 });
}

export function speedBoardMaterial(text, tsr) {
  return boardMaterial('spd:' + text + (tsr ? 't' : ''), 256, 256, (ctx, w, h) => {
    ctx.fillStyle = tsr ? '#f6d21a' : '#f3c614';
    ctx.fillRect(0, 0, w, h);
    border(ctx, w, h, '#111', 14);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${text.length > 2 ? 120 : 150}px ${FONTS.latin}`;
    ctx.fillText(text, w / 2, h / 2 + 8);
  }, { glow: 0.5 });
}

export function cautionBoardMaterial() {
  return boardMaterial('caution', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f3c614';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    for (let i = -4; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 48, 0); ctx.lineTo(i * 48 + 24, 0); ctx.lineTo(i * 48 + 24 + h, h); ctx.lineTo(i * 48 + h, h);
      ctx.fill();
    }
    ctx.fillStyle = '#f3c614';
    ctx.fillRect(40, 80, w - 80, 96);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 56px ${FONTS.latin}`;
    ctx.fillText('CAUTION', w / 2, 130);
  }, { glow: 0.5 });
}

export function termBoardMaterial(text) {
  return boardMaterial('term:' + text, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f3c614';
    ctx.fillRect(0, 0, w, h);
    border(ctx, w, h, '#111', 14);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${text.length > 1 ? 110 : 170}px ${FONTS.latin}`;
    ctx.fillText(text, w / 2, h / 2 + 8);
  }, { glow: 0.5 });
}

export function whistleBoardMaterial() {
  return boardMaterial('whistle', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f3c614';
    ctx.fillRect(0, 0, w, h);
    border(ctx, w, h, '#111', 14);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 64px ${FONTS.deva}`;
    ctx.fillText('सी / फा', w / 2, h * 0.34);
    ctx.font = `700 84px ${FONTS.latin}`;
    ctx.fillText('W / L', w / 2, h * 0.72);
  }, { glow: 0.5 });
}

export function kmPostMaterial(text) {
  return boardMaterial('km:' + text, 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f2f0ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const big = text.includes('/') ? text.split('/') : [text];
    ctx.font = `700 ${big.length > 1 ? 50 : 56}px ${FONTS.latin}`;
    ctx.fillText(big[0], w / 2, h * 0.35);
    if (big[1]) {
      ctx.fillRect(20, h * 0.5, w - 40, 5);
      ctx.fillText(big[1], w / 2, h * 0.7);
    }
  }, { glow: 0.3 });
}

export function stopBoardMaterial() {
  return boardMaterial('stopb', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c4161c';
    ctx.fillRect(0, 0, w, h);
    border(ctx, w, h, '#fff', 12);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 60px ${FONTS.deva}`;
    ctx.fillText('रुकें', w / 2, h * 0.32);
    ctx.font = `700 76px ${FONTS.latin}`;
    ctx.fillText('STOP', w / 2, h * 0.7);
  }, { glow: 0.6 });
}

export function plateMaterial(letter) {
  return boardMaterial('plate:' + letter, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 80px ${FONTS.latin}`;
    ctx.fillText(letter, w / 2, h / 2 + 4);
  }, { glow: 0.6 });
}

export function textPanelMaterial(key, lines, bg = '#123a7a', fg = '#fff', w = 512, h = 128) {
  return boardMaterial('txt:' + key, w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((ln, i) => {
      const font = /[ऀ-ॿ]/.test(ln) ? FONTS.deva : FONTS.latin;
      const size = fitText(ctx, ln, w - 24, `700 {s}px ${font}`, Math.floor((h / n) * 0.72));
      ctx.font = `700 ${size}px ${font}`;
      ctx.fillText(ln, w / 2, (h / n) * (i + 0.55));
    });
  }, { glow: 0.7 });
}

// Live station clock face (redrawn once per game minute)
export class ClockFace {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 128;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshStandardMaterial({ map: this.texture, emissiveMap: this.texture, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.5 });
    materials.nightLit.push({ m: this.material, intensity: 0.6 });
    this.lastMinute = -1;
    this.draw(10.15);
  }
  draw(hours) {
    const minute = Math.floor(hours * 60);
    if (minute === this.lastMinute) return;
    this.lastMinute = minute;
    const ctx = this.canvas.getContext('2d');
    const c = 64;
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#f7f4ea';
    ctx.beginPath(); ctx.arc(c, c, 58, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#222';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.lineWidth = i % 3 ? 2 : 4;
      ctx.beginPath(); ctx.moveTo(c + Math.sin(a) * 46, c - Math.cos(a) * 46); ctx.lineTo(c + Math.sin(a) * 54, c - Math.cos(a) * 54); ctx.stroke();
    }
    const h = ((hours % 12) + 12) % 12, m = (hours * 60) % 60;
    const hand = (a, len, w) => {
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + Math.sin(a) * len, c - Math.cos(a) * len); ctx.stroke();
    };
    hand((h / 12) * Math.PI * 2, 30, 5);
    hand((m / 60) * Math.PI * 2, 44, 3);
    this.texture.needsUpdate = true;
  }
}
