import * as THREE from 'three';
import { Rng } from '../core/Rng.js';

// Procedural canvas textures. Everything is generated at runtime — no external image assets.
const cache = new Map();
let maxAniso = 4;
let textureScale = 1; // 0.5 for low texture quality

export function configureTextures({ anisotropy, quality }) {
  maxAniso = anisotropy || 4;
  textureScale = quality === 'low' ? 0.5 : 1;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(4, Math.round(w));
  c.height = Math.max(4, Math.round(h));
  return c;
}

function finish(c, { srgb = true, repeat = true, aniso = true, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso ? maxAniso : 1;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// Periodic value noise in [0,1], size x size.
export function tileNoise(size, cells, seed = 1, octaves = 4) {
  const rng = new Rng(seed);
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const lat = new Float32Array(n * n);
    for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * n;
      const y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n;
        const x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = lat[(y0 % n) * n + (x0 % n)], b = lat[(y0 % n) * n + ((x0 + 1) % n)];
        const c = lat[((y0 + 1) % n) * n + (x0 % n)], d = lat[((y0 + 1) % n) * n + ((x0 + 1) % n)];
        out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function putGray(c, data, fn) {
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  for (let i = 0; i < data.length; i++) {
    const [r, g, b] = fn(data[i], i);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export const Tex = {
  detail() {
    return cached('detail', () => {
      const size = 256;
      const c = canvas(size, size);
      const n = tileNoise(size, 8, 11, 5);
      putGray(c, n, (v) => {
        const g = Math.round(110 + v * 145);
        return [g, g, g];
      });
      return finish(c, { srgb: false });
    });
  },

  ballast() {
    return cached('ballast', () => {
      const size = 256 * textureScale;
      const c = canvas(size, size);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#5d5a55';
      ctx.fillRect(0, 0, size, size);
      const rng = new Rng(77);
      const stones = 1800 * textureScale * textureScale;
      for (let i = 0; i < stones; i++) {
        const x = rng.next() * size, y = rng.next() * size, r = (1.5 + rng.next() * 3.5) * textureScale;
        const g = 70 + rng.next() * 80;
        const tint = rng.next() * 12;
        ctx.fillStyle = `rgb(${g + tint},${g + tint * 0.6},${g})`;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + rng.next() * 0.5;
          const rr = r * (0.7 + rng.next() * 0.5);
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x - r * 0.3, y - r * 0.5, r * 0.6, r * 0.3);
      }
      // rust / dirt staining
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = rng.chance(0.5) ? '#6b4a2e' : '#3a3632';
        ctx.beginPath();
        ctx.arc(rng.next() * size, rng.next() * size, 6 + rng.next() * 20, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return finish(c);
    });
  },

  concrete(tint = '#9a968e', key = 'concrete') {
    return cached(key + tint, () => {
      const size = 256 * textureScale;
      const c = canvas(size, size);
      const n = tileNoise(size, 6, 21, 5);
      const base = new THREE.Color(tint);
      putGray(c, n, (v) => {
        const k = 0.82 + v * 0.32;
        return [base.r * 255 * k, base.g * 255 * k, base.b * 255 * k];
      });
      const ctx = c.getContext('2d');
      const rng = new Rng(5);
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = rng.chance(0.5) ? '#000' : '#fff';
        ctx.fillRect(rng.next() * size, rng.next() * size, 1 + rng.next() * 3, 1 + rng.next() * 3);
      }
      ctx.globalAlpha = 1;
      return finish(c);
    });
  },

  platform() {
    return cached('platform', () => {
      const w = 256, h = 512;
      const c = canvas(w, h);
      const ctx = c.getContext('2d');
      // u across platform width (0 = track edge), v along platform
      const n = tileNoise(128, 4, 31, 4);
      ctx.fillStyle = '#a8a39a';
      ctx.fillRect(0, 0, w, h);
      // tiles
      ctx.strokeStyle = 'rgba(60,55,50,0.35)';
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 32) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let x = 0; x < w; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      const img = ctx.getImageData(0, 0, w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = n[(y % 128) * 128 + (x % 128)];
        const k = 0.86 + v * 0.24;
        const i = (y * w + x) * 4;
        img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
      }
      ctx.putImageData(img, 0, 0);
      return finish(c);
    });
  },

  // Platform edge: coping stone, white line, yellow tactile strip (u along the edge strip width)
  platformEdge() {
    return cached('platformEdge', () => {
      const w = 128, h = 128;
      const c = canvas(w, h);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#b5b0a6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f2f0ea';
      ctx.fillRect(0, 0, 18, h);
      ctx.fillStyle = '#e8b81c';
      ctx.fillRect(44, 0, 38, h);
      ctx.fillStyle = 'rgba(120,90,0,0.5)';
      for (let y = 4; y < h; y += 10) for (let x = 48; x < 80; x += 10) {
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      }
      return finish(c);
    });
  },

  brick() {
    return cached('brick', () => {
      const w = 256, h = 256;
      const c = canvas(w, h);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#7d5e4b';
      ctx.fillRect(0, 0, w, h);
      const rng = new Rng(9);
      const bh = 16, bw = 42;
      for (let row = 0; row < h / bh; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let x = -bw; x < w + bw; x += bw) {
          const r = 140 + rng.next() * 50, g = 60 + rng.next() * 25, b = 45 + rng.next() * 20;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x + off + 1.5, row * bh + 1.5, bw - 3, bh - 3);
        }
      }
      return finish(c);
    });
  },

  plaster() {
    return cached('plaster', () => {
      const size = 256;
      const c = canvas(size, size);
      const n = tileNoise(size, 5, 41, 5);
      putGray(c, n, (v, i) => {
        const y = Math.floor(i / size) / size;
        const stain = Math.max(0, (y - 0.7) * 1.2) * 0.25;
        const k = 0.88 + v * 0.16 - stain;
        return [235 * k, 232 * k, 226 * k];
      });
      return finish(c);
    });
  },

  roofSheet() {
    return cached('roofSheet', () => {
      const w = 128, h = 128;
      const c = canvas(w, h);
      const ctx = c.getContext('2d');
      for (let x = 0; x < w; x++) {
        const k = 0.75 + 0.25 * Math.sin((x / w) * Math.PI * 16);
        ctx.fillStyle = `rgb(${150 * k},${154 * k},${158 * k})`;
        ctx.fillRect(x, 0, 1, h);
      }
      const rng = new Rng(3);
      ctx.globalAlpha = 0.25;
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = '#6a4a30';
        ctx.fillRect(rng.next() * w, rng.next() * h, 2 + rng.next() * 8, 6 + rng.next() * 30);
      }
      ctx.globalAlpha = 1;
      return finish(c);
    });
  },

  asphalt() {
    return cached('asphalt', () => {
      const size = 256;
      const c = canvas(size, size);
      const n = tileNoise(size, 16, 51, 4);
      putGray(c, n, (v) => {
        const g = 62 + v * 40;
        return [g, g, g * 1.02];
      });
      return finish(c);
    });
  },

  // Building facade atlas: 4x4 cells of window styles. Second canvas = night emissive.
  windows() {
    return cached('windows', () => {
      const size = 512;
      const day = canvas(size, size);
      const night = canvas(size, size);
      const d = day.getContext('2d');
      const n = night.getContext('2d');
      n.fillStyle = '#000';
      n.fillRect(0, 0, size, size);
      const rng = new Rng(123);
      const cell = size / 4;
      for (let cy = 0; cy < 4; cy++) {
        for (let cx = 0; cx < 4; cx++) {
          const x0 = cx * cell, y0 = cy * cell;
          // wall
          const wallG = 200 + rng.next() * 40;
          d.fillStyle = `rgb(${wallG},${wallG - 4},${wallG - 12})`;
          d.fillRect(x0, y0, cell, cell);
          const style = (cy * 4 + cx) % 4;
          // 2x2 windows per cell (each cell = one storey, two bays)
          for (let wx = 0; wx < 2; wx++) {
            const ww = cell * (style === 2 ? 0.38 : 0.28), wh = cell * (style === 1 ? 0.5 : 0.42);
            const px = x0 + cell * (0.25 + wx * 0.5) - ww / 2, py = y0 + cell * 0.3;
            d.fillStyle = '#2a3036';
            d.fillRect(px - 3, py - 3, ww + 6, wh + 6);
            d.fillStyle = style === 3 ? '#4d6372' : '#3b4a55';
            d.fillRect(px, py, ww, wh);
            // grille / frame
            d.strokeStyle = 'rgba(30,30,30,0.8)';
            d.lineWidth = 2;
            if (style !== 2) {
              d.beginPath();
              d.moveTo(px + ww / 2, py); d.lineTo(px + ww / 2, py + wh);
              d.stroke();
            }
            if (style === 0) for (let k = 1; k < 5; k++) {
              d.beginPath(); d.moveTo(px, py + (wh * k) / 5); d.lineTo(px + ww, py + (wh * k) / 5); d.stroke();
            }
            // sunshade (chajja)
            d.fillStyle = 'rgba(0,0,0,0.35)';
            d.fillRect(px - 6, py - 10, ww + 12, 6);
            // lit at night?
            if (rng.chance(0.55)) {
              const warm = rng.chance(0.7);
              n.fillStyle = warm ? `rgb(255,${190 + rng.next() * 40},${110 + rng.next() * 50})` : 'rgb(200,230,255)';
              n.globalAlpha = 0.55 + rng.next() * 0.45;
              n.fillRect(px, py, ww, wh);
              n.globalAlpha = 1;
            }
          }
          // floor band
          d.fillStyle = 'rgba(0,0,0,0.12)';
          d.fillRect(x0, y0 + cell - 6, cell, 6);
        }
      }
      return { map: finish(day), emissive: finish(night) };
    });
  },

  // Repeatable facade tile: one storey (3.2 m) x two bays (7 m). style 0..3
  facade(style) {
    return cached('facade' + style, () => {
      const W = 256, H = 128;
      const day = canvas(W, H), night = canvas(W, H);
      const d = day.getContext('2d'), n = night.getContext('2d');
      n.fillStyle = '#000';
      n.fillRect(0, 0, W, H);
      const rng = new Rng(300 + style);
      const g = 228;
      d.fillStyle = `rgb(${g},${g - 3},${g - 10})`;
      d.fillRect(0, 0, W, H);
      // subtle grime
      const nz = tileNoise(64, 4, 70 + style, 3);
      d.globalAlpha = 0.25;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        const v = nz[((y >> 1) % 64) * 64 + ((x >> 1) % 64)];
        d.fillStyle = `rgb(${v * 120},${v * 115},${v * 100})`;
        d.fillRect(x, y, 2, 2);
      }
      d.globalAlpha = 1;
      for (let b = 0; b < 2; b++) {
        const bw = W / 2;
        const ww = style === 2 ? bw * 0.62 : style === 3 ? bw * 0.3 : bw * 0.42;
        const wh = style === 1 ? H * 0.5 : H * 0.44;
        const px = b * bw + (bw - ww) / 2, py = H * 0.26;
        d.fillStyle = '#3a3f44';
        d.fillRect(px - 3, py - 3, ww + 6, wh + 6);
        d.fillStyle = style === 2 ? '#5d7686' : '#34424c';
        d.fillRect(px, py, ww, wh);
        d.strokeStyle = 'rgba(25,25,25,0.85)';
        d.lineWidth = 2;
        d.beginPath();
        d.moveTo(px + ww / 2, py); d.lineTo(px + ww / 2, py + wh);
        if (style === 0) for (let k = 1; k < 5; k++) { d.moveTo(px, py + (wh * k) / 5); d.lineTo(px + ww, py + (wh * k) / 5); }
        d.stroke();
        // chajja sunshade
        d.fillStyle = 'rgba(0,0,0,0.38)';
        d.fillRect(px - 8, py - 12, ww + 16, 7);
        if (style === 3) {
          // balcony slab and railing
          d.fillStyle = 'rgba(60,60,60,0.55)';
          d.fillRect(b * bw + 6, py + wh + 8, bw - 12, 5);
          d.fillRect(b * bw + 6, py + wh - 12, bw - 12, 3);
        }
        if (rng.chance(0.6)) {
          const warm = rng.chance(0.72);
          n.fillStyle = warm ? `rgb(255,${200 + rng.next() * 35},${120 + rng.next() * 50})` : 'rgb(205,230,255)';
          n.fillRect(px, py, ww, wh);
        }
      }
      d.fillStyle = 'rgba(0,0,0,0.14)';
      d.fillRect(0, H - 7, W, 7);
      return { map: finish(day), emissive: finish(night) };
    });
  },

  shopfront() {
    return cached('shopfront', () => {
      const W = 512, H = 128;
      const day = canvas(W, H), night = canvas(W, H);
      const d = day.getContext('2d'), n = night.getContext('2d');
      n.fillStyle = '#000';
      n.fillRect(0, 0, W, H);
      const rng = new Rng(77);
      const cols = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#d35400', '#117a65'];
      const names = ['SHARMA STORES', 'GUPTA SWEETS', 'MEDICAL', 'TEA STALL', 'MOBILE REPAIR', 'KIRANA', 'HOTEL', 'PHOTO STUDIO'];
      for (let i = 0; i < 4; i++) {
        const x = i * 128;
        d.fillStyle = '#6d6a66';
        d.fillRect(x, 0, 128, H);
        d.fillStyle = cols[rng.int(0, cols.length - 1)];
        d.fillRect(x + 4, 6, 120, 30);
        d.fillStyle = '#fff';
        d.font = 'bold 14px "Rajdhani", sans-serif';
        d.textAlign = 'center';
        d.fillText(names[rng.int(0, names.length - 1)], x + 64, 27);
        // shutter
        const open = rng.chance(0.6);
        d.fillStyle = open ? '#2b2420' : '#8c8f92';
        d.fillRect(x + 10, 44, 108, 80);
        if (!open) for (let y = 46; y < 124; y += 5) { d.fillStyle = 'rgba(0,0,0,0.25)'; d.fillRect(x + 10, y, 108, 1.5); }
        else {
          d.fillStyle = cols[rng.int(0, cols.length - 1)];
          for (let k = 0; k < 6; k++) d.fillRect(x + 16 + k * 16, 70 + rng.next() * 20, 12, 30);
          n.fillStyle = 'rgb(255,230,170)';
          n.fillRect(x + 10, 44, 108, 80);
        }
        n.fillStyle = 'rgba(255,255,255,0.8)';
        n.fillRect(x + 4, 6, 120, 30);
      }
      return { map: finish(day), emissive: finish(night) };
    });
  },

  waterNormal() {
    return cached('waterNormal', () => {
      const size = 256;
      const c = canvas(size, size);
      const n = tileNoise(size, 8, 61, 4);
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const h = (xx, yy) => n[((yy + size) % size) * size + ((xx + size) % size)];
        const dx = (h(x + 1, y) - h(x - 1, y)) * 6, dy = (h(x, y + 1) - h(x, y - 1)) * 6;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return finish(c, { srgb: false });
    });
  },

  glow() {
    return cached('glow', () => {
      const size = 128;
      const c = canvas(size, size);
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.15, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      return finish(c, { repeat: false, srgb: true });
    });
  },

  lightPool() {
    return cached('lightPool', () => {
      const size = 128;
      const c = canvas(size, size);
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      return finish(c, { repeat: false });
    });
  },
};

/**
 * Text board texture (station names, platform numbers, speed boards...).
 * lines: [{ text, font, color, size (0..1 of height) }]
 */
export function boardTexture(key, w, h, draw) {
  return cached('board:' + key, () => {
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    return finish(c, { repeat: false });
  });
}

export function fitText(ctx, text, maxW, font, startSize) {
  let size = startSize;
  ctx.font = font.replace('{s}', size);
  while (ctx.measureText(text).width > maxW && size > 8) {
    size -= 2;
    ctx.font = font.replace('{s}', size);
  }
  return size;
}

export const FONTS = {
  latin: '"Rajdhani", "Hind", "Arial Narrow", sans-serif',
  deva: '"Noto Sans Devanagari", "Hind", "Mangal", sans-serif',
  body: '"Hind", "Segoe UI", sans-serif',
};
