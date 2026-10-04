import * as THREE from 'three';
import { buildTerrainPatch } from './TerrainPatch.js';
import { Tex } from '../render/TextureGen.js';
import { materials } from '../render/Materials.js';

const SEG = 32;

function makeTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  mat.name = 'terrain';
  const detail = Tex.detail();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFarm;\nvarying float vFarm;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFarm = aFarm;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uDetail;
varying float vFarm;
varying vec3 vWPos;
float th(vec2 p){ return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453); }
vec3 cropColor(float h){
  if (h < 0.18) return vec3(0.16, 0.24, 0.05);   // wheat (green)
  if (h < 0.30) return vec3(0.42, 0.38, 0.06);   // mustard flowering
  if (h < 0.44) return vec3(0.12, 0.26, 0.04);   // rice / young crop
  if (h < 0.56) return vec3(0.25, 0.17, 0.09);   // ploughed soil
  if (h < 0.68) return vec3(0.30, 0.26, 0.12);   // stubble / harvested
  if (h < 0.82) return vec3(0.09, 0.18, 0.03);   // sugarcane
  return vec3(0.20, 0.22, 0.08);                 // fallow grass
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 wp = vWPos.xz;
  float a = 0.42 + 0.25 * sin(floor(wp.x / 900.0) * 1.7 + floor(wp.y / 900.0) * 2.3);
  mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 r = R * wp;
  vec2 cs = vec2(42.0, 68.0);
  vec2 cid = floor(r / cs);
  vec2 f = fract(r / cs);
  float h1 = th(cid), h2 = th(cid + 17.3);
  vec3 crop = cropColor(h1);
  float dirX = step(0.5, h2);
  float furrow = 0.86 + 0.14 * sin(mix(r.y, r.x, dirX) * 6.2832 / 1.1);
  float bund = smoothstep(0.0, 0.025, f.x) * smoothstep(1.0, 0.975, f.x) * smoothstep(0.0, 0.018, f.y) * smoothstep(1.0, 0.982, f.y);
  vec3 field = mix(vec3(0.17, 0.2, 0.08), crop * furrow, bund);
  float fw = vFarm * step(0.06, h2);
  diffuseColor.rgb = mix(diffuseColor.rgb, field, fw);
  float d1 = texture2D(uDetail, wp * 0.11).r;
  float d2 = texture2D(uDetail, wp * 0.013).r;
  diffuseColor.rgb *= 0.55 + 0.55 * d1 * (0.6 + 0.6 * d2);
}`);
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
  materials.wettable.push({ m: mat, rough: 0.97, color: mat.color.clone(), gloss: 0.62 });
  return mat;
}

/**
 * Quadtree LOD terrain. Patches are generated in a Web Worker when available.
 */
export class TerrainLOD {
  constructor(sampler, routeId, parent, { center, rootSize = 49152, leafSize = 96 } = {}) {
    this.sampler = sampler;
    this.parent = parent;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    parent.add(this.group);
    this.rootSize = rootSize;
    this.leafSize = leafSize;
    this.x0 = center.x - rootSize / 2;
    this.z0 = center.z - rootSize / 2;
    this.nodes = new Map(); // key -> { mesh, level, ix, iz, size, ready, pending, used }
    this.material = makeTerrainMaterial();
    this.splitFactor = 2.0;
    this.maxDistance = 9000;
    this.pending = 0;
    this.frame = 0;
    this.worker = null;
    this.workerReady = false;
    this.waiting = new Map();
    try {
      this.worker = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.onWorker(e.data);
      this.worker.onerror = (e) => {
        console.warn('[Terrain] worker failed, using main thread', e.message);
        this.worker = null;
      };
      this.worker.postMessage({ type: 'init', routeId });
    } catch (err) {
      console.warn('[Terrain] no module worker support, using main thread');
      this.worker = null;
    }
  }

  setQuality(q) {
    this.splitFactor = q === 'low' ? 1.35 : q === 'medium' ? 1.7 : q === 'high' ? 2.1 : 2.5;
  }

  onWorker(msg) {
    if (msg.type === 'ready') {
      this.workerReady = true;
      return;
    }
    if (msg.type === 'error') {
      console.warn('[Terrain] worker error', msg.message);
      const node = this.nodes.get(msg.key);
      if (node) node.pending = false;
      this.pending--;
      return;
    }
    if (msg.type === 'patch') {
      this.pending--;
      const node = this.nodes.get(msg.key);
      if (!node) return;
      node.pending = false;
      this.attach(node, msg);
    }
  }

  key(level, ix, iz) {
    return `${level}:${ix}:${iz}`;
  }

  nodeInfo(level, ix, iz) {
    const size = this.rootSize / (1 << level);
    return { level, ix, iz, size, x0: this.x0 + ix * size, z0: this.z0 + iz * size };
  }

  attach(node, data) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setAttribute('aFarm', new THREE.BufferAttribute(data.farm, 1));
    geo.setIndex(new THREE.BufferAttribute(data.index, 1));
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, data.minH - 10, 0), new THREE.Vector3(node.size, data.maxH + 1, node.size));
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(node.x0, 0, node.z0);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    mesh.castShadow = node.size <= this.leafSize * 4;
    mesh.visible = false;
    mesh.name = 'terrain:' + node.key;
    node.mesh = mesh;
    node.ready = true;
    node.minH = data.minH;
    node.maxH = data.maxH;
    this.group.add(mesh);
  }

  request(node, sync) {
    if (node.ready || node.pending) return;
    if (!sync && this.worker && this.workerReady) {
      node.pending = true;
      this.pending++;
      this.worker.postMessage({ type: 'build', key: node.key, x0: node.x0, z0: node.z0, size: node.size, seg: SEG });
    } else if (sync || !this.worker) {
      const data = buildTerrainPatch(this.sampler, node.x0, node.z0, node.size, SEG);
      this.attach(node, data);
    }
  }

  getNode(level, ix, iz) {
    const k = this.key(level, ix, iz);
    let n = this.nodes.get(k);
    if (!n) {
      n = { key: k, ...this.nodeInfo(level, ix, iz), ready: false, pending: false, mesh: null, used: 0 };
      this.nodes.set(k, n);
    }
    return n;
  }

  select(cam) {
    const out = [];
    const maxLevel = Math.round(Math.log2(this.rootSize / this.leafSize));
    const visit = (level, ix, iz) => {
      const info = this.nodeInfo(level, ix, iz);
      const cx = Math.max(info.x0, Math.min(cam.x, info.x0 + info.size));
      const cz = Math.max(info.z0, Math.min(cam.z, info.z0 + info.size));
      const dy = Math.max(0, cam.y - 150);
      const dist = Math.hypot(cam.x - cx, cam.z - cz, dy);
      if (dist > this.maxDistance + info.size && level > 0) return;
      if (level < maxLevel && dist < info.size * this.splitFactor) {
        visit(level + 1, ix * 2, iz * 2);
        visit(level + 1, ix * 2 + 1, iz * 2);
        visit(level + 1, ix * 2, iz * 2 + 1);
        visit(level + 1, ix * 2 + 1, iz * 2 + 1);
      } else out.push({ level, ix, iz, dist });
    };
    visit(0, 0, 0);
    return out;
  }

  /** Update visible set. `sync` forces generation of everything needed (loading screen). */
  update(cam, sync = false) {
    this.frame++;
    const sel = this.select(cam);
    sel.sort((a, b) => a.dist - b.dist);
    const display = new Set();
    let syncBudget = sync ? Infinity : 0;
    for (const s of sel) {
      const node = this.getNode(s.level, s.ix, s.iz);
      node.used = this.frame;
      if (!node.ready) {
        if (syncBudget > 0) this.request(node, true);
        else if (this.pending < 6) this.request(node, false);
        else if (!this.worker) {
          // main-thread fallback: a couple per frame
          if (this._mainBudget === undefined || this._mainBudget-- > 0) this.request(node, true);
        }
      }
      if (node.ready) display.add(node);
      else {
        // fall back to nearest ready ancestor
        let l = s.level, ix = s.ix, iz = s.iz;
        while (l > 0) {
          l--; ix >>= 1; iz >>= 1;
          const a = this.nodes.get(this.key(l, ix, iz));
          if (a && a.ready) {
            a.used = this.frame;
            display.add(a);
            break;
          }
        }
      }
    }
    this._mainBudget = 2;
    // remove nodes covered by a displayed ancestor
    const shown = new Set();
    for (const n of display) {
      let covered = false;
      let l = n.level, ix = n.ix, iz = n.iz;
      while (l > 0) {
        l--; ix >>= 1; iz >>= 1;
        const a = this.nodes.get(this.key(l, ix, iz));
        if (a && display.has(a)) { covered = true; break; }
      }
      if (!covered) shown.add(n);
    }
    for (const n of this.nodes.values()) {
      if (n.mesh) n.mesh.visible = shown.has(n);
    }
    // evict stale nodes
    if (this.nodes.size > 420) {
      const stale = [...this.nodes.values()].filter((n) => n.ready && !shown.has(n) && this.frame - n.used > 120);
      stale.sort((a, b) => a.used - b.used);
      for (const n of stale.slice(0, this.nodes.size - 340)) this.dispose(n);
    }
  }

  dispose(n) {
    if (n.mesh) {
      this.group.remove(n.mesh);
      n.mesh.geometry.dispose();
    }
    this.nodes.delete(n.key);
  }

  heightAt(x, z) {
    return this.sampler.height(x, z);
  }

  get busy() {
    return this.pending > 0;
  }
}
