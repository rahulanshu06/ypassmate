import * as THREE from 'three';
import { RouteGeometry } from './RouteGeometry.js';
import { Network } from './Network.js';
import { TerrainSampler } from './TerrainSampler.js';
import { TerrainLOD } from './TerrainLOD.js';
import { buildTrackChunk } from './TrackBuilder.js';
import { buildOHEChunk } from './OHEBuilder.js';
import { GeoBatch, Prim } from '../render/GeoBatch.js';
import { TrackFrame } from './TrackFrame.js';
import { materials } from '../render/Materials.js';
import { settings } from '../core/Settings.js';
import { buildSceneryChunk, updateChunkTrees } from './Scenery.js';
import { FloraLib } from '../render/Flora.js';
import { buildStation } from './StationBuilder.js';
import { addBoardsChunk, buildBridge, buildTunnel, buildLevelCrossing, buildRoadBridge, buildWater } from './Trackside.js';
import { addSignalStatics } from '../render/SignalVisuals.js';

export const CHUNK = 200;

/**
 * Owns the static world: route geometry, track network, terrain and streamed
 * chunks of trackside + scenery geometry.
 */
export class World {
  constructor(scene, def, opts = {}) {
    this.scene = scene;
    this.def = def;
    this.geo = new RouteGeometry(def);
    this.network = new Network(def, this.geo);
    this.sampler = new TerrainSampler(def, this.geo, this.network);
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    // terrain quadtree centred on the route bounding box
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.geo.n; i += 50) {
      minX = Math.min(minX, this.geo.x[i]); maxX = Math.max(maxX, this.geo.x[i]);
      minZ = Math.min(minZ, this.geo.z[i]); maxZ = Math.max(maxZ, this.geo.z[i]);
    }
    this.bounds = { minX, maxX, minZ, maxZ };
    this.terrain = new TerrainLOD(this.sampler, def.id, this.root, { center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 } });
    this.chunks = new Map();
    this.chunkBuilders = []; // extra builders: fn(ctx, s0, s1, batch, origin, chunk)
    this.featureBuilders = []; // objects that build their own groups: { s0, s1, build(ctx) -> Object3D, obj }
    this.flora = new FloraLib();
    this.ctx = { geo: this.geo, network: this.network, def, sampler: this.sampler, world: this, flora: this.flora };
    this.chunkBuilders.push(buildSceneryChunk, addSignalStatics, addBoardsChunk);
    this.stationObjects = new Map();
    for (const st of this.network.stations) {
      const lo = Math.min(st.limits[1].first, st.limits[-1].last, st.platformS0) - 500;
      const hi = Math.max(st.limits[1].last, st.limits[-1].first, st.platformS1) + 500;
      this.addFeature({
        s0: lo, s1: hi, kind: 'station', id: st.id,
        build: (ctx) => {
          const g = buildStation(ctx, st);
          this.stationObjects.set(st.id, g);
          return g;
        },
        dispose: (obj) => {
          this.stationObjects.delete(st.id);
          obj.traverse((o) => o.geometry && !o.userData.sharedGeometry && o.geometry.dispose());
        },
      });
    }
    for (const br of def.bridges || []) this.addFeature({ s0: br.s0, s1: br.s1, kind: 'bridge', build: (ctx) => buildBridge(ctx, br) });
    for (const tn of def.tunnels || []) this.addFeature({ s0: tn.s0, s1: tn.s1, kind: 'tunnel', build: (ctx) => buildTunnel(ctx, tn) });
    if (def.endTunnel) this.addFeature({ s0: def.endTunnel.s, s1: def.endTunnel.s + 200, kind: 'tunnel', build: (ctx) => buildTunnel(ctx, { s0: def.endTunnel.s }, true) });
    this.levelCrossings = [];
    for (const lc of def.levelCrossings || []) {
      const entry = { def: lc, handle: null, closed: false };
      this.levelCrossings.push(entry);
      this.addFeature({
        s0: lc.s - 300, s1: lc.s + 300, kind: 'lc',
        build: (ctx) => {
          entry.handle = buildLevelCrossing(ctx, lc);
          return entry.handle.group;
        },
        dispose: (obj) => {
          entry.handle = null;
          obj.traverse((o) => o.geometry && !o.userData.sharedGeometry && o.geometry.dispose());
        },
      });
    }
    this.roadBridges = [];
    for (const rb of def.roadBridges || []) {
      const entry = { def: rb, handle: null };
      this.roadBridges.push(entry);
      this.addFeature({
        s0: rb.s - 250, s1: rb.s + 250, kind: 'rob',
        build: (ctx) => {
          entry.handle = buildRoadBridge(ctx, rb);
          return entry.handle.group;
        },
        dispose: (obj) => {
          entry.handle = null;
          obj.traverse((o) => o.geometry && !o.userData.sharedGeometry && o.geometry.dispose());
        },
      });
    }
    this.water = buildWater(this.ctx);
    this.root.add(this.water);
    this.viewDistance = settings.get('viewDistance') || 3000;
    this.detailDistance = 650;
    this.camS = 0;
    this.near = {};
    this.buildMsBudget = 6;
    this.stats = { chunks: 0, built: 0 };
  }

  addChunkBuilder(fn) {
    this.chunkBuilders.push(fn);
  }

  addFeature(feature) {
    this.featureBuilders.push(feature);
  }

  chunkMaterials(key) {
    return materials.get(key);
  }

  buildChunk(index) {
    const s0 = index * CHUNK, s1 = s0 + CHUNK;
    const g = this.geo.sample(Math.min(Math.max(s0 + CHUNK / 2, 0), this.geo.length));
    const origin = new THREE.Vector3(g.x, g.y, g.z);
    const group = new THREE.Group();
    group.name = 'chunk' + index;
    group.position.copy(origin);
    const chunk = { index, s0, s1, group, origin, detail: null, far: null, dynamic: [] };
    const batch = new GeoBatch();
    const detail = new GeoBatch();
    if (s1 > 0 && s0 < this.geo.length) {
      buildTrackChunk(this.ctx, Math.max(0, s0), Math.min(this.geo.length, s1), batch, origin, { sleepers: false });
      buildSleepers(this.ctx, Math.max(0, s0), Math.min(this.geo.length, s1), detail, origin);
      buildOHEChunk(this.ctx, Math.max(0, s0), Math.min(this.geo.length, s1), batch, origin);
    }
    for (const fn of this.chunkBuilders) fn(this.ctx, s0, s1, batch, origin, chunk, detail);
    const noShadow = new Set(['ballast', 'wire', 'railHead']);
    const meshes = batch.build((k) => this.chunkMaterials(k), group, { castShadow: { has: (k) => !noShadow.has(k) } });
    chunk.detail = new THREE.Group();
    chunk.detail.name = 'detail';
    detail.build((k) => this.chunkMaterials(k), chunk.detail, { castShadow: false });
    group.add(chunk.detail);
    group.updateMatrixWorld(true);
    this.root.add(group);
    this.chunks.set(index, chunk);
    this.stats.built++;
    return chunk;
  }

  disposeChunk(chunk) {
    this.root.remove(chunk.group);
    chunk.group.traverse((o) => {
      if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
    });
    for (const d of chunk.dynamic) if (d.dispose) d.dispose();
    this.chunks.delete(chunk.index);
  }

  cameraChainage(pos) {
    const n = this.sampler.index.nearest(pos.x, pos.z, this.near);
    return { s: n.s + n.along, dist: n.dist };
  }

  update(camera, sync = false) {
    const pos = camera.position;
    const { s, dist } = this.cameraChainage(pos);
    this.camS = s;
    this.terrain.update(pos, sync);
    const vd = this.viewDistance;
    const reach = Math.max(300, vd - dist);
    const lo = Math.floor((s - reach) / CHUNK), hi = Math.floor((s + reach) / CHUNK);
    const minIdx = Math.floor(-1200 / CHUNK), maxIdx = Math.floor((this.geo.length + 1200) / CHUNK);
    const wanted = [];
    for (let i = Math.max(lo, minIdx); i <= Math.min(hi, maxIdx); i++) wanted.push(i);
    wanted.sort((a, b) => Math.abs(a * CHUNK + CHUNK / 2 - s) - Math.abs(b * CHUNK + CHUNK / 2 - s));
    const t0 = performance.now();
    for (const i of wanted) {
      if (this.chunks.has(i)) continue;
      if (!sync && performance.now() - t0 > this.buildMsBudget) break;
      this.buildChunk(i);
    }
    // features (stations, bridges...) by range
    for (const f of this.featureBuilders) {
      const d = s < f.s0 ? f.s0 - s : s > f.s1 ? s - f.s1 : 0;
      const want = d < vd + 400;
      if (want && !f.obj) {
        if (!sync && performance.now() - t0 > this.buildMsBudget * 2) continue;
        f.obj = f.build(this.ctx);
        if (f.obj) this.root.add(f.obj);
      } else if (!want && f.obj && d > vd + 900) {
        this.root.remove(f.obj);
        if (f.dispose) f.dispose(f.obj);
        else f.obj.traverse((o) => o.geometry && !o.userData.sharedGeometry && o.geometry.dispose());
        f.obj = null;
      }
    }
    // dispose far chunks, toggle detail
    for (const c of [...this.chunks.values()]) {
      const mid = c.s0 + CHUNK / 2;
      const d = Math.abs(mid - s);
      if (d > reach + CHUNK * 3) this.disposeChunk(c);
      else {
        if (c.detail) c.detail.visible = d < this.detailDistance + dist;
        updateChunkTrees(c, d + dist);
      }
    }
    this.stats.chunks = this.chunks.size;
  }

  setViewDistance(v) {
    this.viewDistance = v;
    this.terrain.maxDistance = Math.max(6000, v * 2.2);
  }
}

function buildSleepers(ctx, s0, s1, batch, origin) {
  // Sleepers live in a separate detail group so far chunks can hide them.
  const { geo, network, def } = ctx;
  const frame = new TrackFrame(geo);
  const m = new THREE.Matrix4();
  const bridges = def.bridges || [];
  const box = Prim.box();
  for (const tr of network.tracks.values()) {
    const a = Math.max(s0, tr.sA), b = Math.min(s1, tr.sB);
    if (b - a < 0.2) continue;
    const off = (s) => tr.offsetAt(s);
    const baseOff = tr.kind === 'main' ? null : network.lineOffset[tr.line];
    const first = Math.ceil(a / 0.6) * 0.6;
    for (let s = first; s < b; s += 0.6) {
      const bridge = bridges.find((br) => s > br.s0 + 2 && s < br.s1 - 2);
      let lower = 0;
      if (baseOff !== null) {
        const dd = Math.abs(off(s) - baseOff);
        if (dd < 0.45) continue;
        if (dd < 3.2) lower = -0.012;
      }
      frame.at(off, s, origin);
      const wood = !!bridge;
      frame.matrix(m, wood ? 2.5 : 2.75, wood ? 0.2 : 0.21, 0.25);
      const y = (wood ? -0.272 : -0.289) + lower;
      m.elements[12] += frame.up.x * y;
      m.elements[13] += frame.up.y * y;
      m.elements[14] += frame.up.z * y;
      batch.add(wood ? 'sleeperWood' : 'sleeper', box, m);
    }
  }
}
