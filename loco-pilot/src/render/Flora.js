import * as THREE from 'three';
import { Rng } from '../core/Rng.js';
import { SimplexNoise } from '../core/Noise.js';

export const WIND = { time: { value: 0 }, strength: { value: 0.3 } };

const noise = new SimplexNoise(99);

function colorize(geo, fn) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function blob(r, x, y, z, sx = 1, sy = 0.8, sz = 1, detail = 1, seed = 0) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const n = 1 + 0.22 * noise.noise2D(px * 1.3 + seed, pz * 1.3 + py * 0.7 + seed * 3.1);
    pos.setXYZ(i, px * n * sx + x, py * n * sy + y, pz * n * sz + z);
  }
  g.computeVertexNormals();
  // bias normals upwards: softer, more "foliage" lighting
  const nor = g.attributes.normal;
  for (let i = 0; i < nor.count; i++) {
    const nx = nor.getX(i), ny = nor.getY(i) * 0.6 + 0.55, nz = nor.getZ(i);
    const l = Math.hypot(nx, ny, nz);
    nor.setXYZ(i, nx / l, ny / l, nz / l);
  }
  return g;
}

function trunk(h, r0, r1, bend = 0, seg = 6) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 4, true);
  g.translate(0, h / 2, 0);
  if (bend) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setX(i, pos.getX(i) + bend * (y / h) * (y / h));
    }
    g.computeVertexNormals();
  }
  return g;
}

function merge(parts) {
  // all parts non-indexed for simplicity
  const list = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let n = 0;
  for (const p of list) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of list) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const bark = (c) => (x, y, z, out) => out.set(c).multiplyScalar(0.8 + 0.2 * Math.sin(y * 3));
function leafColor(base, light, cy, spread) {
  const a = new THREE.Color(base), b = new THREE.Color(light);
  return (x, y, z, out) => {
    const t = THREE.MathUtils.clamp((y - cy) / spread * 0.5 + 0.5, 0, 1);
    out.copy(a).lerp(b, t * t);
    out.multiplyScalar(0.85 + 0.25 * (noise.noise2D(x * 0.9, z * 0.9 + y) * 0.5 + 0.5));
  };
}

export const TREE_TYPES = {
  neem: { h: 9, r: 4, far: 0 },
  mango: { h: 8, r: 5, far: 1 },
  banyan: { h: 11, r: 8, far: 2 },
  palm: { h: 12, r: 3.5, far: 3 },
  eucalyptus: { h: 16, r: 3, far: 4 },
  bush: { h: 2.2, r: 1.6, far: 5 },
  babool: { h: 6, r: 4.5, far: 6 },
  sal: { h: 14, r: 4, far: 7 },
};

function buildTree(type) {
  const rng = new Rng(type.length * 977 + 13);
  const parts = [];
  const brown = new THREE.Color('#5b4636');
  switch (type) {
    case 'neem': {
      parts.push(colorize(trunk(3.6, 0.32, 0.18), bark(brown)));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push(colorize(blob(2.0 + rng.next(), Math.cos(a) * 1.8, 5.6 + rng.range(-0.6, 0.8), Math.sin(a) * 1.8, 1, 0.75, 1, 1, i), leafColor('#2b4a1a', '#6e9a3c', 5.5, 3)));
      }
      parts.push(colorize(blob(2.6, 0, 6.8, 0, 1, 0.8, 1, 1, 9), leafColor('#2b4a1a', '#7aa543', 5.5, 3)));
      break;
    }
    case 'mango': {
      parts.push(colorize(trunk(2.4, 0.4, 0.26), bark(brown)));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        parts.push(colorize(blob(2.4 + rng.next() * 0.8, Math.cos(a) * 2.6, 4.6 + rng.range(-0.4, 0.8), Math.sin(a) * 2.6, 1, 0.7, 1, 1, i + 20), leafColor('#18300f', '#3f6a24', 4.5, 3)));
      }
      parts.push(colorize(blob(3.2, 0, 6.0, 0, 1, 0.7, 1, 1, 33), leafColor('#18300f', '#4b7a2a', 4.5, 3)));
      break;
    }
    case 'banyan': {
      parts.push(colorize(trunk(4, 0.9, 0.6), bark(new THREE.Color('#6a5a4a'))));
      for (let i = 0; i < 6; i++) {
        const a = rng.next() * Math.PI * 2, d = 3 + rng.next() * 3;
        const root = trunk(5.5, 0.06, 0.05);
        root.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
        parts.push(colorize(root, bark(new THREE.Color('#7a6a58'))));
      }
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, d = 3.5 + rng.next() * 2.5;
        parts.push(colorize(blob(2.8 + rng.next(), Math.cos(a) * d, 6.8 + rng.range(-0.5, 1.2), Math.sin(a) * d, 1, 0.6, 1, 1, i + 40), leafColor('#1f3b14', '#58823a', 7, 3)));
      }
      parts.push(colorize(blob(3.6, 0, 8.6, 0, 1.2, 0.6, 1.2, 1, 51), leafColor('#1f3b14', '#62903e', 7, 3)));
      break;
    }
    case 'palm': {
      const h = 11;
      parts.push(colorize(trunk(h, 0.22, 0.16, 1.2, 6), bark(new THREE.Color('#7a6650'))));
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + rng.next() * 0.3;
        const len = 3.6 + rng.next();
        const g = new THREE.PlaneGeometry(0.9, len, 1, 5);
        const pos = g.attributes.position;
        for (let k = 0; k < pos.count; k++) {
          const y = pos.getY(k) + len / 2; // 0..len
          const t = y / len;
          pos.setXYZ(k, pos.getX(k) * (1 - t * 0.7), y * 0.9, -t * t * 1.8);
        }
        g.rotateX(-0.5 - rng.next() * 0.5);
        g.rotateY(a);
        g.translate(1.2, h, 0);
        g.computeVertexNormals();
        const nor = g.attributes.normal;
        for (let k = 0; k < nor.count; k++) nor.setXYZ(k, 0, 1, 0);
        parts.push(colorize(g, leafColor('#2e4a1c', '#7a9a3a', h, 2)));
      }
      break;
    }
    case 'eucalyptus': {
      parts.push(colorize(trunk(13, 0.22, 0.1, 0.6), (x, y, z, o) => o.set('#c9c3b4').multiplyScalar(0.8 + 0.2 * Math.sin(y * 2.0))));
      for (let i = 0; i < 6; i++) {
        const y = 9 + i * 1.3;
        parts.push(colorize(blob(1.2 + rng.next() * 0.6, rng.range(-1.2, 1.2) + 0.5, y, rng.range(-1.2, 1.2), 1, 1.3, 1, 1, i + 60), leafColor('#3c5a2c', '#7f9a5c', 12, 4)));
      }
      break;
    }
    case 'bush': {
      for (let i = 0; i < 3; i++) parts.push(colorize(blob(0.9 + rng.next() * 0.4, rng.range(-0.8, 0.8), 0.7, rng.range(-0.8, 0.8), 1, 0.8, 1, 1, i + 70), leafColor('#2e4a1c', '#6f8f3a', 0.6, 1)));
      break;
    }
    case 'babool': {
      parts.push(colorize(trunk(3.2, 0.2, 0.12, 0.8), bark(brown)));
      parts.push(colorize(blob(3.4, 0.6, 4.2, 0, 1.3, 0.32, 1.3, 1, 80), leafColor('#3b4e22', '#87924c', 4.1, 1)));
      parts.push(colorize(blob(2.2, -1.6, 3.7, 1.2, 1.2, 0.3, 1.2, 1, 81), leafColor('#3b4e22', '#87924c', 3.6, 1)));
      break;
    }
    case 'sal': {
      parts.push(colorize(trunk(8, 0.3, 0.18), bark(brown)));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push(colorize(blob(1.8 + rng.next(), Math.cos(a) * 1.3, 9.5 + rng.range(-1, 2.5), Math.sin(a) * 1.3, 1, 1.1, 1, 1, i + 90), leafColor('#1e3a16', '#4f7a30', 10, 4)));
      }
      break;
    }
  }
  return merge(parts);
}

function billboardAtlas() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const cell = 128;
  const rng = new Rng(4242);
  const types = Object.keys(TREE_TYPES);
  types.forEach((t, i) => {
    const x0 = (i % 8) * cell, y0 = Math.floor(i / 8) * cell;
    const T = TREE_TYPES[t];
    const scale = cell / Math.max(T.h * 1.1, T.r * 2.3);
    const cx = x0 + cell / 2, base = y0 + cell - 2;
    ctx.fillStyle = t === 'eucalyptus' ? '#c9c3b4' : '#4b3a2c';
    const trunkH = t === 'palm' ? T.h * 0.85 : t === 'eucalyptus' ? T.h * 0.6 : T.h * 0.4;
    ctx.fillRect(cx - 2, base - trunkH * scale, 4, trunkH * scale);
    const blobs = t === 'palm' ? 0 : 60;
    const cyTop = base - T.h * scale * 0.68;
    for (let k = 0; k < blobs; k++) {
      const a = rng.next() * Math.PI * 2, rr = Math.sqrt(rng.next());
      const w = T.r * scale * (t === 'babool' ? 1.2 : 0.9), hgt = T.h * scale * (t === 'babool' ? 0.12 : t === 'eucalyptus' ? 0.35 : 0.3);
      const x = cx + Math.cos(a) * rr * w, y = cyTop + Math.sin(a) * rr * hgt;
      const shade = 0.55 + 0.45 * (1 - (y - (cyTop - hgt)) / (2 * hgt));
      const g = t === 'mango' ? [30, 58, 20] : t === 'babool' ? [80, 95, 50] : t === 'eucalyptus' ? [85, 110, 70] : [55, 90, 35];
      ctx.fillStyle = `rgb(${g[0] * shade},${g[1] * shade},${g[2] * shade})`;
      ctx.beginPath();
      ctx.arc(x, y, (6 + rng.next() * 8) * (scale / 9), 0, Math.PI * 2);
      ctx.fill();
    }
    if (t === 'palm') {
      ctx.strokeStyle = '#4a6a2a';
      ctx.lineWidth = 3;
      const top = base - T.h * scale * 0.85;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, top);
        ctx.quadraticCurveTo(cx + Math.cos(a) * 14, top - 8, cx + Math.cos(a) * 26, top + 10 + Math.abs(Math.sin(a)) * 6);
        ctx.stroke();
      }
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, types };
}

function billboardGeometry(index, T) {
  const cell = 1 / 8;
  const u0 = (index % 8) * cell, u1 = u0 + cell;
  const v1 = 1 - Math.floor(index / 8) * 0.5, v0 = v1 - 0.5;
  const size = Math.max(T.h * 1.1, T.r * 2.3);
  const positions = [], normals = [], uvs = [], idx = [];
  for (let q = 0; q < 2; q++) {
    const a = q * Math.PI / 2;
    const dx = Math.cos(a) * size / 2, dz = Math.sin(a) * size / 2;
    const base = positions.length / 3;
    positions.push(-dx, 0, -dz, dx, 0, dz, dx, size, dz, -dx, size, -dz);
    for (let k = 0; k < 4; k++) normals.push(0, 1, 0);
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function windPatch(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WIND.time;
    shader.uniforms.uWind = WIND.strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        float h = max(position.y - 1.2, 0.0);
        float sw = sin(uTime * 1.4 + ip.x * 0.05 + ip.z * 0.07) * 0.6 + sin(uTime * 2.7 + ip.x * 0.13) * 0.25;
        transformed.x += sw * uWind * h * 0.025;
        transformed.z += cos(uTime * 1.1 + ip.z * 0.05) * uWind * h * 0.018;
      }`);
  };
  mat.customProgramCacheKey = () => 'wind-' + mat.name;
}

export class FloraLib {
  constructor() {
    this.geos = {};
    for (const t of Object.keys(TREE_TYPES)) this.geos[t] = buildTree(t);
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    this.material.name = 'tree';
    this.material.side = THREE.DoubleSide;
    windPatch(this.material);
    const atlas = billboardAtlas();
    this.bbGeos = {};
    atlas.types.forEach((t, i) => (this.bbGeos[t] = billboardGeometry(i, TREE_TYPES[t])));
    this.bbMaterial = new THREE.MeshStandardMaterial({ map: atlas.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
    this.bbMaterial.name = 'treeBB';
    windPatch(this.bbMaterial);
  }
}
