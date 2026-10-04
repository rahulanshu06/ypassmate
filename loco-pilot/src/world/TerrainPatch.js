import { smoothstep, clamp } from '../core/MathUtil.js';

// sRGB hex -> linear rgb triple
function lin(hex) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [f(r), f(g), f(b)];
}
const C = {
  grass: lin(0x6e7f3c), dry: lin(0x948b55), forest: lin(0x3f5a26), urban: lin(0x857a68), sand: lin(0xc4b089),
  dirt: lin(0x7b6c58), rock: lin(0x7a7268), mud: lin(0x5a5040), hill: lin(0x5d6d34),
};
function mix3(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

/**
 * Build a square terrain patch. Pure data (runs in a worker or on the main thread).
 * Returns typed arrays with positions relative to (x0, z0).
 */
export function buildTerrainPatch(sampler, x0, z0, size, seg) {
  const n = seg + 1;
  const ext = seg + 3; // one extra ring for normals
  const step = size / seg;
  const H = new Float32Array(ext * ext);
  const farm = new Float32Array(n * n);
  const urban = new Float32Array(n * n);
  const forest = new Float32Array(n * n);
  const sand = new Float32Array(n * n);
  const ballast = new Float32Array(n * n);
  const hole = new Uint8Array(n * n);
  const s = {};
  for (let j = 0; j < ext; j++) {
    for (let i = 0; i < ext; i++) {
      const x = x0 + (i - 1) * step, z = z0 + (j - 1) * step;
      const inner = i >= 1 && j >= 1 && i <= n && j <= n;
      sampler.sample(x, z, s);
      H[j * ext + i] = s.h;
      if (inner) {
        const k = (j - 1) * n + (i - 1);
        farm[k] = s.farm;
        urban[k] = s.urban;
        forest[k] = s.forest;
        sand[k] = s.sand;
        ballast[k] = s.ballast;
        hole[k] = s.hole ? 1 : 0;
      }
    }
  }
  const vCount = n * n + 4 * n;
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const colors = new Float32Array(vCount * 3);
  const farmAttr = new Float32Array(vCount);
  const col = [0, 0, 0];
  let minH = Infinity, maxH = -Infinity;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const e = (j + 1) * ext + (i + 1);
      const h = H[e];
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
      positions[k * 3] = i * step;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = j * step;
      const dx = (H[e + 1] - H[e - 1]) / (2 * step);
      const dz = (H[e + ext] - H[e - ext]) / (2 * step);
      const len = Math.hypot(dx, 1, dz);
      const nx = -dx / len, ny = 1 / len, nz = -dz / len;
      normals[k * 3] = nx;
      normals[k * 3 + 1] = ny;
      normals[k * 3 + 2] = nz;
      // albedo
      const wx = x0 + i * step, wz = z0 + j * step;
      const nn = Math.sin(wx * 0.013 + Math.cos(wz * 0.011) * 2) * 0.5 + 0.5;
      mix3(C.grass, C.dry, nn * 0.55, col);
      const hillT = smoothstep(95, 170, h);
      mix3(col, C.hill, hillT * 0.6, col);
      mix3(col, C.forest, forest[k] * 0.75, col);
      mix3(col, C.urban, urban[k] * 0.8, col);
      mix3(col, C.sand, sand[k], col);
      const slope = 1 - ny;
      mix3(col, C.rock, smoothstep(0.28, 0.55, slope), col);
      mix3(col, C.dirt, ballast[k] * 0.85, col);
      if (sampler.waterLevelAt && h < sampler.base - 2.6) mix3(col, C.mud, 0.7, col);
      colors[k * 3] = col[0];
      colors[k * 3 + 1] = col[1];
      colors[k * 3 + 2] = col[2];
      farmAttr[k] = clamp(farm[k] * (1 - smoothstep(0.3, 0.5, slope)), 0, 1);
    }
  }
  // skirts
  const skirt = Math.max(2, step * 0.8);
  const edges = [];
  for (let i = 0; i < n; i++) edges.push(i); // z = 0 row
  for (let i = 0; i < n; i++) edges.push((n - 1) * n + i); // z = max row
  for (let j = 0; j < n; j++) edges.push(j * n); // x = 0 col
  for (let j = 0; j < n; j++) edges.push(j * n + n - 1); // x = max col
  for (let e = 0; e < edges.length; e++) {
    const src = edges[e], dst = n * n + e;
    positions[dst * 3] = positions[src * 3];
    positions[dst * 3 + 1] = positions[src * 3 + 1] - skirt;
    positions[dst * 3 + 2] = positions[src * 3 + 2];
    normals[dst * 3] = normals[src * 3];
    normals[dst * 3 + 1] = normals[src * 3 + 1];
    normals[dst * 3 + 2] = normals[src * 3 + 2];
    colors[dst * 3] = colors[src * 3];
    colors[dst * 3 + 1] = colors[src * 3 + 1];
    colors[dst * 3 + 2] = colors[src * 3 + 2];
    farmAttr[dst] = farmAttr[src];
  }
  const idx = [];
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      if (hole[a] || hole[b] || hole[c] || hole[d]) continue;
      // alternate diagonal for less banding
      if ((i + j) % 2) {
        idx.push(a, c, b, b, c, d);
      } else {
        idx.push(a, c, d, a, d, b);
      }
    }
  }
  const skirtStrip = (off, flip) => {
    for (let i = 0; i < n - 1; i++) {
      const top0 = edges[off + i], top1 = edges[off + i + 1];
      const bot0 = n * n + off + i, bot1 = bot0 + 1;
      if (hole[top0] || hole[top1]) continue;
      if (flip) idx.push(top0, top1, bot0, top1, bot1, bot0);
      else idx.push(top0, bot0, top1, top1, bot0, bot1);
    }
  };
  skirtStrip(0, true);
  skirtStrip(n, false);
  skirtStrip(2 * n, false);
  skirtStrip(3 * n, true);
  const index = vCount > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  return { positions, normals, colors, farm: farmAttr, index, minH, maxH };
}
