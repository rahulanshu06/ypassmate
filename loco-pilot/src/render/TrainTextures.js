import * as THREE from 'three';
import { FONTS } from './TextureGen.js';
import { COACH_TYPES } from '../data/rollingStock.js';
import { LIVERIES } from '../data/locomotives.js';

const cache = new Map();
let aniso = 4;
export function setTrainTextureAniso(a) {
  aniso = a;
}

function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Coach side texture: u spans the body length, v spans the side height (bottom->top).
// The top 12% of the canvas is the roof colour strip.
export const COACH_SIDE_H = 2.45; // metres of side mapped to v 0..0.88
export function coachTextures(typeId) {
  const key = 'coach:' + typeId;
  if (cache.has(key)) return cache.get(key);
  const t = COACH_TYPES[typeId];
  const W = 2048, H = 320;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const e = document.createElement('canvas');
  e.width = W / 2;
  e.height = H / 2;
  const ctx = c.getContext('2d');
  const ex = e.getContext('2d');
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, e.width, e.height);
  const L = 23.54;
  const sideTop = H * 0.12; // y of side top
  const sy = (h) => H - ((h / COACH_SIDE_H) * (H - sideTop)); // h metres above body bottom -> canvas y
  const sx = (m) => (m / L) * W;
  const ac = t.ac;
  // liveries: AC = crimson band over slate; non-AC = deep red band over grey; general = blue band
  const lower = '#545a63';
  const band = ac ? '#a0181e' : t.id === 'GS' || t.id === 'SLR' ? '#1f4f9a' : '#b3261e';
  const upper = '#e9e6df';
  ctx.fillStyle = '#9ea3a8';
  ctx.fillRect(0, 0, W, sideTop); // roof strip
  ctx.fillStyle = upper;
  ctx.fillRect(0, sideTop, W, H - sideTop);
  ctx.fillStyle = band;
  ctx.fillRect(0, sy(2.05), W, sy(0.95) - sy(2.05));
  ctx.fillStyle = lower;
  ctx.fillRect(0, sy(0.62), W, H - sy(0.62));
  ctx.fillStyle = '#d9b44a';
  ctx.fillRect(0, sy(0.66), W, 3);
  ctx.fillRect(0, sy(2.08), W, 3);
  // doors near both ends
  const doors = [1.0, L - 1.0 - 0.9];
  for (const dz of doors) {
    ctx.fillStyle = '#3d4248';
    ctx.fillRect(sx(dz), sy(2.2), sx(0.9), sy(0.05) - sy(2.2));
    ctx.fillStyle = '#1b2026';
    ctx.fillRect(sx(dz + 0.2), sy(1.95), sx(0.5), sy(1.45) - sy(1.95));
    ex.fillStyle = '#7a6a50';
    ex.fillRect(sx(dz + 0.2) / 2, sy(1.95) / 2, sx(0.5) / 2, (sy(1.45) - sy(1.95)) / 2);
    ctx.strokeStyle = '#2a2e33';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx(dz), sy(2.2), sx(0.9), sy(0.05) - sy(2.2));
  }
  // windows
  const winTop = 2.0, winBot = t.windows === 'barred' ? 1.05 : 1.12;
  const span0 = 2.3, span1 = L - 2.3;
  let pitch = 1.92, ww = 1.15;
  if (t.windows === 'sealed') { pitch = 2.3; ww = 1.75; }
  if (t.windows === 'sealed-wide') { pitch = 3.3; ww = 2.6; }
  if (t.windows === 'pantry') { pitch = 3.4; ww = 0.9; }
  if (t.windows === 'mixed') { pitch = 2.2; ww = 1.1; }
  const n = Math.floor((span1 - span0) / pitch);
  const start = span0 + ((span1 - span0) - n * pitch) / 2;
  for (let i = 0; i < n; i++) {
    if (t.guard && i < 3) continue; // luggage section without windows
    const x0 = start + i * pitch + (pitch - ww) / 2;
    ctx.fillStyle = '#2a3036';
    ctx.fillRect(sx(x0) - 3, sy(winTop) - 3, sx(ww) + 6, sy(winBot) - sy(winTop) + 6);
    const g = ctx.createLinearGradient(0, sy(winTop), 0, sy(winBot));
    g.addColorStop(0, ac ? '#1a2a33' : '#26333c');
    g.addColorStop(1, ac ? '#3c5664' : '#3e4c55');
    ctx.fillStyle = g;
    ctx.fillRect(sx(x0), sy(winTop), sx(ww), sy(winBot) - sy(winTop));
    if (t.windows === 'barred' || t.windows === 'mixed') {
      ctx.fillStyle = '#9da4aa';
      const bars = 6;
      for (let b = 1; b < bars; b++) ctx.fillRect(sx(x0), sy(winTop) + ((sy(winBot) - sy(winTop)) * b) / bars, sx(ww), 2.2);
      ctx.fillRect(sx(x0 + ww / 2) - 1, sy(winTop), 2.5, sy(winBot) - sy(winTop));
    }
    ex.fillStyle = ac ? '#cfe2ff' : '#ffe1a8';
    ex.fillRect(sx(x0) / 2, sy(winTop) / 2, sx(ww) / 2, (sy(winBot) - sy(winTop)) / 2);
  }
  if (t.guard) {
    // luggage roller door
    ctx.fillStyle = '#5e646b';
    ctx.fillRect(sx(3.2), sy(2.05), sx(1.8), sy(0.1) - sy(2.05));
    for (let y = sy(2.05); y < sy(0.1); y += 5) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(sx(3.2), y, sx(1.8), 1.5);
    }
  }
  // labels
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 26px ${FONTS.latin}`;
  ctx.fillText(t.label, sx(L * 0.5), sy(0.36));
  ctx.font = `700 22px ${FONTS.deva}`;
  ctx.fillText(t.labelHi || '', sx(L * 0.28), sy(0.36));
  ctx.font = `700 22px ${FONTS.latin}`;
  ctx.fillText('DESH RAIL  ·  देश रेल', sx(L * 0.73), sy(0.36));
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 34px ${FONTS.latin}`;
  ctx.fillText(t.code + (t.code.length < 3 ? '1' : ''), sx(1.65), sy(2.32));
  ctx.fillText(t.code + (t.code.length < 3 ? '1' : ''), sx(L - 1.65), sy(2.32));
  // route board
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(sx(L * 0.42), sy(2.38), sx(3.2), sy(2.2) - sy(2.38));
  ctx.fillStyle = '#1c2a55';
  ctx.font = `700 16px ${FONTS.latin}`;
  ctx.fillText('INDRAPURI - VINDHYANAGAR', sx(L * 0.42 + 1.6), sy(2.29));
  // dirt gradient near the bottom
  const dg = ctx.createLinearGradient(0, sy(0.4), 0, H);
  dg.addColorStop(0, 'rgba(60,45,30,0)');
  dg.addColorStop(1, 'rgba(60,45,30,0.35)');
  ctx.fillStyle = dg;
  ctx.fillRect(0, sy(0.4), W, H - sy(0.4));
  const out = { map: tex(c), emissive: tex(e), band };
  cache.set(key, out);
  return out;
}

// Locomotive side: u = body length (20.56 m), v = side height (bottom 1.15 m -> roof 4.15 m).
export const LOCO_SIDE_H = 2.95;
export function locoTextures(liveryId, number = '30417', classCode = 'EP60') {
  const key = `loco:${liveryId}:${number}:${classCode}`;
  if (cache.has(key)) return cache.get(key);
  const lv = LIVERIES[liveryId] || LIVERIES.saffron;
  const W = 2048, H = 320;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const L = 20.56;
  const roofH = H * 0.1;
  const sx = (m) => (m / L) * W;
  const sy = (h) => H - (h / LOCO_SIDE_H) * (H - roofH);
  ctx.fillStyle = lv.roof;
  ctx.fillRect(0, 0, W, roofH);
  ctx.fillStyle = lv.body;
  ctx.fillRect(0, roofH, W, H);
  ctx.fillStyle = lv.band;
  ctx.fillRect(0, sy(1.25), W, sy(0.0) - sy(1.25));
  ctx.fillStyle = lv.stripe;
  ctx.fillRect(0, sy(1.42), W, sy(1.25) - sy(1.42));
  ctx.fillRect(0, sy(2.62), W, 6);
  // louvres in the machine room
  for (let i = 0; i < 7; i++) {
    const x0 = 4.6 + i * 1.62;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(sx(x0) - 2, sy(2.45) - 2, sx(1.25) + 4, sy(1.6) - sy(2.45) + 4);
    ctx.fillStyle = '#8d9399';
    ctx.fillRect(sx(x0), sy(2.45), sx(1.25), sy(1.6) - sy(2.45));
    for (let k = 0; k < 14; k++) {
      const y = sy(2.45) + k * ((sy(1.6) - sy(2.45)) / 14);
      ctx.fillStyle = 'rgba(25,25,28,0.75)';
      ctx.fillRect(sx(x0) + 3, y + 2, sx(1.25) - 6, 2.2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(sx(x0) + 3, y + 4.2, sx(1.25) - 6, 1);
    }
  }
  // cab doors and windows at both ends
  for (const end of [0, 1]) {
    const dz = end ? L - 2.75 : 1.85;
    ctx.strokeStyle = 'rgba(20,20,20,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(sx(dz), sy(2.55), sx(0.85), sy(0.05) - sy(2.55));
    ctx.fillStyle = '#1d2329';
    ctx.fillRect(sx(dz + 0.12), sy(2.4), sx(0.6), sy(1.75) - sy(2.4));
    // side cab window
    const wz = end ? L - 1.55 : 0.55;
    ctx.fillStyle = '#1d2329';
    ctx.fillRect(sx(wz), sy(2.45), sx(1.0), sy(1.75) - sy(2.45));
    // handrails
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(sx(dz - 0.12), sy(2.2), 3, sy(0.2) - sy(2.2));
    ctx.fillRect(sx(dz + 0.97), sy(2.2), 3, sy(0.2) - sy(2.2));
  }
  ctx.fillStyle = lv.id === 'saffron' ? '#1c2a55' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 54px ${FONTS.latin}`;
  ctx.fillText(number, sx(L * 0.5), sy(0.85));
  ctx.font = `700 30px ${FONTS.latin}`;
  ctx.fillText(`${classCode}  ·  DESH RAIL`, sx(L * 0.5), sy(2.85) + 10);
  ctx.font = `700 30px ${FONTS.deva}`;
  ctx.fillText('देश रेल', sx(L * 0.2), sy(0.85));
  ctx.fillText('शक्ति', sx(L * 0.8), sy(0.85));
  const map = tex(c);
  // front face: u = width (3.15), v = height bottom 1.15 -> 4.15
  const F = document.createElement('canvas');
  F.width = 512;
  F.height = 512;
  const f = F.getContext('2d');
  f.fillStyle = lv.front;
  f.fillRect(0, 0, 512, 512);
  f.fillStyle = lv.body;
  f.fillRect(0, 0, 512, 150);
  // chevron warning stripes on the lower nose
  f.fillStyle = lv.stripe;
  f.beginPath();
  f.moveTo(0, 360); f.lineTo(256, 300); f.lineTo(512, 360); f.lineTo(512, 395); f.lineTo(256, 335); f.lineTo(0, 395);
  f.fill();
  f.fillStyle = '#f2c400';
  f.fillRect(0, 470, 512, 42);
  f.fillStyle = '#111';
  for (let i = -2; i < 14; i++) {
    f.beginPath();
    f.moveTo(i * 40, 512); f.lineTo(i * 40 + 20, 512); f.lineTo(i * 40 + 62, 470); f.lineTo(i * 40 + 42, 470);
    f.fill();
  }
  f.fillStyle = '#fff';
  f.font = `700 46px ${FONTS.latin}`;
  f.textAlign = 'center';
  f.fillText(number, 256, 268);
  const front = tex(F);
  const out = { map, front, livery: lv };
  cache.set(key, out);
  return out;
}

export function wagonTexture(typeId) {
  const key = 'wagon:' + typeId;
  if (cache.has(key)) return cache.get(key);
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a3524';
  ctx.fillRect(0, 0, W, H);
  // rust & grime
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(${90 + Math.random() * 60},${50 + Math.random() * 30},${30},${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 4 + Math.random() * 30, 2 + Math.random() * 20);
  }
  // stanchions
  for (let i = 0; i <= 8; i++) {
    const x = (i / 8) * W;
    ctx.fillStyle = '#3e2418';
    ctx.fillRect(x - 6, 0, 12, H);
  }
  ctx.fillStyle = '#3e2418';
  ctx.fillRect(0, 0, W, 14);
  ctx.fillRect(0, H - 18, W, 18);
  ctx.fillStyle = '#e8e2d0';
  ctx.font = `700 34px ${FONTS.latin}`;
  ctx.textAlign = 'left';
  ctx.fillText(typeId === 'BVZC' ? 'BVZC  DR 98211' : 'BOXN  DR 21 15', 40, H / 2 + 12);
  const out = { map: tex(c) };
  cache.set(key, out);
  return out;
}
