import * as THREE from 'three';
import { Rng, hash2 } from '../core/Rng.js';
import { settings } from '../core/Settings.js';
import { smoothstep } from '../core/MathUtil.js';
import {
  addHouse, addHut, addCityBuilding, addTemple, addWaterTankTower, addHaystack, addChimney, addMobileTower,
  addShed, addBoulder, box, HOUSE_COLORS,
} from '../render/Buildings.js';
import { extrudeProfile, sampleChainages, TrackFrame } from './TrackFrame.js';

const TREE_MIX = {
  farmland: [['neem', 30], ['mango', 18], ['babool', 14], ['eucalyptus', 10], ['palm', 9], ['banyan', 5], ['bush', 14]],
  river: [['palm', 35], ['neem', 20], ['banyan', 10], ['bush', 25], ['mango', 10]],
  forest: [['sal', 46], ['neem', 14], ['mango', 10], ['bush', 22], ['eucalyptus', 8]],
  town: [['neem', 40], ['palm', 15], ['banyan', 10], ['eucalyptus', 20], ['mango', 15]],
};

const _w = {};

/**
 * Scatter scenery (trees, villages, city blocks, boundary walls, kilns) along a chunk.
 * Placement is deterministic per chunk and avoids the railway corridor, roads and water.
 */
export function buildSceneryChunk(ctx, s0, s1, batch, origin, chunk) {
  const { geo, sampler, def, network } = ctx;
  const flora = ctx.flora;
  const rng = new Rng(def.seed * 31 + chunk.index * 7919);
  const veg = settings.get('vegetationDensity') ?? 0.8;
  const trees = { near: [], far: [] };
  const occupied = new Set(); // coarse 6 m grid cells used by buildings
  const occKey = (x, z) => `${Math.floor(x / 6)}:${Math.floor(z / 6)}`;
  const markBox = (x, z, r) => {
    for (let dx = -r; dx <= r; dx += 6) for (let dz = -r; dz <= r; dz += 6) occupied.add(occKey(x + dx, z + dz));
  };
  const isFree = (x, z, r) => {
    for (let dx = -r; dx <= r; dx += 6) for (let dz = -r; dz <= r; dz += 6) if (occupied.has(occKey(x + dx, z + dz))) return false;
    return true;
  };
  const lcs = def.levelCrossings || [];
  const nearRoad = (s, d) => lcs.some((lc) => Math.abs(s - lc.s) < 14 + Math.abs(d) * Math.abs(Math.cos((lc.angle * Math.PI) / 180)));
  const roadBridges = def.roadBridges || [];
  const nearRoadBridge = (s) => roadBridges.some((rb) => Math.abs(s - rb.s) < rb.width / 2 + 12);
  const yards = sampler.yards;
  const inYard = (s, d, margin = 6) => yards.some((y) => s > y.s0 - 40 && s < y.s1 + 40 && d > y.lo - margin && d < y.hi + margin);
  const g = {};
  const world = (s, d) => {
    geo.sample(s, g);
    return [g.x + g.nx * d, g.z + g.nz * d, g.h];
  };
  const sample = (x, z) => sampler.sample(x, z, _w);

  const sMid = (s0 + s1) / 2;
  const rw = sampler.regionWeights(sMid, {});
  const cityW = rw.city, townW = rw.town, suburbW = rw.suburb;

  // ---------------------------------------------------------------- city / town blocks
  const urban = Math.max(cityW, townW * 0.85, suburbW * 0.6);
  if (urban > 0.08 && s1 > -600) {
    const maxD = cityW > 0.3 ? 560 : townW > 0.3 ? 300 : 200;
    for (const side of [-1, 1]) {
      let d = 24 + rng.next() * 6;
      let row = 0;
      while (d < maxD) {
        const rowDepth = 16 + rng.next() * 12;
        row++;
        const street = row % 4 === 0;
        if (!street) {
          let s = s0 + rng.next() * 8;
          while (s < s1 - 6) {
            const plotW = 12 + rng.next() * 14;
            const sc = s + plotW / 2;
            const dc = side * (d + rowDepth / 2);
            s += plotW + (rng.chance(0.12) ? 10 : 2.5);
            if (sc > s1) break;
            if (inYard(sc, dc, 12) || nearRoad(sc, dc) || nearRoadBridge(sc)) continue;
            const density = urban * (1 - smoothstep(maxD * 0.6, maxD, d));
            if (!rng.chance(0.25 + 0.75 * density)) continue;
            const [x, z, heading] = world(sc, dc);
            const smp = sample(x, z);
            if (smp.h < sampler.base - 2) continue;
            const yaw = (side > 0 ? Math.PI - heading : -heading) + (rng.next() - 0.5) * 0.08;
            const w = plotW - 2, dep = rowDepth - 3;
            const lx = x - origin.x, lz = z - origin.z, ly = smp.h - origin.y;
            if (cityW > 0.4) {
              const centre = 1 - smoothstep(0, 4000, Math.abs(sc - 400));
              const floors = Math.max(2, Math.round(2 + rng.next() * 4 + centre * rng.next() * 6 - d / 160));
              addCityBuilding(batch, lx, ly, lz, yaw, w, dep, floors, rng, { shops: row === 1 || rng.chance(0.25), billboard: d < 80 });
            } else if (townW > 0.3 || cityW > 0.15) {
              const floors = 1 + rng.int(0, 2) + (rng.chance(0.2) ? 1 : 0);
              if (rng.chance(0.55)) addCityBuilding(batch, lx, ly, lz, yaw, w, dep, floors, rng, { shops: row === 1 && rng.chance(0.7) });
              else addHouse(batch, lx, ly, lz, yaw, Math.min(w, 9), Math.min(dep, 9), Math.min(floors, 2), HOUSE_COLORS[rng.int(0, HOUSE_COLORS.length - 1)], rng);
            } else {
              addHouse(batch, lx, ly, lz, yaw, Math.min(w, 8), Math.min(dep, 8), rng.int(1, 2), HOUSE_COLORS[rng.int(0, HOUSE_COLORS.length - 1)], rng);
            }
            markBox(x, z, Math.max(w, dep) / 2);
          }
        }
        d += rowDepth + (street ? 10 : 0);
      }
    }
    // industrial edge of the city
    if (cityW > 0.3 && s0 > 3000 && s0 < 4300 && chunk.index % 2 === 0) {
      const side = chunk.index % 4 === 0 ? 1 : -1;
      const [x, z] = world(sMid, side * 220);
      const smp = sample(x, z);
      addShed(batch, x - origin.x, smp.h - origin.y, z - origin.z, -(g.h + Math.PI / 2), 60, 28, 11, '#c8c1b4');
      addChimney(batch, x - origin.x + 25, smp.h - origin.y, z - origin.z - 20, 38);
      markBox(x, z, 40);
    }
    if (rng.chance(0.35)) {
      const side = rng.chance(0.5) ? 1 : -1;
      const [x, z] = world(sMid + rng.range(-80, 80), side * rng.range(60, 260));
      if (isFree(x, z, 4)) {
        const smp = sample(x, z);
        addMobileTower(batch, x - origin.x, smp.h - origin.y, z - origin.z, 32 + rng.next() * 10);
      }
    }
    // boundary walls beside the line in cities (outside station yards)
    if (cityW > 0.35) buildBoundaryWalls(ctx, s0, s1, batch, origin, inYard, nearRoad, nearRoadBridge);
  }

  // ---------------------------------------------------------------- villages
  for (const v of sampler.villageSpots) {
    if (v.s < s0 || v.s >= s1) continue;
    const vr = new Rng(Math.round(v.s));
    const R = 14 + Math.sqrt(v.size) * 10;
    let placed = 0;
    for (let attempt = 0; attempt < v.size * 6 && placed < v.size; attempt++) {
      const a = vr.next() * Math.PI * 2, r = Math.sqrt(vr.next()) * R;
      const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
      const smp = sample(x, z);
      if (Math.abs(smp.d) < 22 || inYard(smp.s, smp.d, 10) || nearRoad(smp.s, smp.d)) continue;
      if (smp.h < sampler.base - 2) continue;
      const w = 5 + vr.next() * 4, dep = 5 + vr.next() * 4;
      if (!isFree(x, z, Math.max(w, dep) / 2 + 2)) continue;
      markBox(x, z, Math.max(w, dep) / 2 + 1);
      const yaw = vr.next() * Math.PI * 2;
      const lx = x - origin.x, ly = smp.h - origin.y, lz = z - origin.z;
      if (vr.chance(v.hill ? 0.45 : 0.3)) addHut(batch, lx, ly, lz, yaw, w * 0.8, dep * 0.8, vr);
      else addHouse(batch, lx, ly, lz, yaw, w, dep, vr.chance(0.3) ? 2 : 1, HOUSE_COLORS[vr.int(0, HOUSE_COLORS.length - 1)], vr);
      placed++;
    }
    const extras = [];
    if (v.size > 14) extras.push('temple');
    if (v.size > 20) extras.push('tank');
    for (const kind of extras) {
      for (let k = 0; k < 10; k++) {
        const a = vr.next() * Math.PI * 2, r = R * (0.5 + vr.next() * 0.6);
        const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
        const smp = sample(x, z);
        if (Math.abs(smp.d) < 30 || !isFree(x, z, 6)) continue;
        markBox(x, z, 6);
        if (kind === 'temple') addTemple(batch, x - origin.x, smp.h - origin.y, z - origin.z, vr.next() * 6, 1 + vr.next() * 0.4, vr);
        else addWaterTankTower(batch, x - origin.x, smp.h - origin.y, z - origin.z, vr);
        break;
      }
    }
    for (let k = 0; k < v.size / 2; k++) {
      const a = vr.next() * Math.PI * 2, r = R * (0.9 + vr.next() * 0.8);
      const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
      const smp = sample(x, z);
      if (Math.abs(smp.d) < 25 || !isFree(x, z, 3)) continue;
      addHaystack(batch, x - origin.x, smp.h - origin.y, z - origin.z, vr);
    }
    // village trees
    for (let k = 0; k < v.size * 1.5 * veg; k++) {
      const a = vr.next() * Math.PI * 2, r = Math.sqrt(vr.next()) * R * 1.4;
      const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
      const smp = sample(x, z);
      if (Math.abs(smp.d) < 16 || !isFree(x, z, 2)) continue;
      pushTree(trees, x, smp.h, z, vr.weighted(TREE_MIX.town), vr, Math.abs(smp.d));
    }
  }

  // ---------------------------------------------------------------- brick kilns & farm sheds
  const kilns = [9850, 16550, 21800];
  for (const ks of kilns) {
    if (ks < s0 || ks >= s1) continue;
    const side = ks % 2 ? 1 : -1;
    const [x, z] = world(ks, side * (380 + (ks % 7) * 20));
    const smp = sample(x, z);
    addChimney(batch, x - origin.x, smp.h - origin.y, z - origin.z, 32);
    markBox(x, z, 20);
  }

  // ---------------------------------------------------------------- trees
  const spacing = 23;
  const reach = 680;
  for (let s = Math.floor(s0 / spacing) * spacing; s < s1; s += spacing) {
    for (let d = -reach; d <= reach; d += spacing) {
      const js = s + (hash2(s, d, 1) - 0.5) * spacing * 0.9;
      const jd = d + (hash2(s, d, 2) - 0.5) * spacing * 0.9;
      if (js < s0 || js >= s1) continue;
      const ad = Math.abs(jd);
      if (ad < 13) continue;
      const p = hash2(s, d, 3);
      if (p > 0.85 * veg) continue; // quick reject before sampling
      const [x, z] = world(js, jd);
      const smp = sample(x, z);
      if (smp.h < sampler.base - 2.2) continue;
      if (inYard(smp.s, smp.d, 4) || nearRoad(smp.s, smp.d) || !isFree(x, z, 2)) continue;
      const regW = sampler.regionWeights(js, {});
      let prob = 0.06 + 0.25 * (1 - smp.farm) + 0.55 * smp.forest - 0.3 * smp.urban;
      if (smp.farm > 0.5) prob = 0.05;
      prob *= veg;
      if (p > prob) continue;
      const mix = smp.forest > 0.4 ? TREE_MIX.forest : regW.river > 0.3 ? TREE_MIX.river : smp.urban > 0.3 ? TREE_MIX.town : TREE_MIX.farmland;
      pushTree(trees, x, smp.h, z, rng.weighted(mix), rng, ad);
    }
  }
  // dense forest near the line in the hills
  if (rw.forest > 0.3) {
    const fs = 11;
    for (let s = Math.floor(s0 / fs) * fs; s < s1; s += fs) {
      for (let d = -260; d <= 260; d += fs) {
        if (Math.abs(d) < 14) continue;
        const hv = hash2(s, d, 9);
        if (hv > 0.62 * veg * rw.forest) continue;
        const js = s + (hash2(s, d, 10) - 0.5) * fs, jd = d + (hash2(s, d, 11) - 0.5) * fs;
        if (js < s0 || js >= s1 || Math.abs(jd) < 13) continue;
        const [x, z] = world(js, jd);
        const smp = sample(x, z);
        if (smp.forest < 0.35 || smp.h < sampler.base - 2 || inYard(smp.s, smp.d, 4) || nearRoad(smp.s, smp.d)) continue;
        pushTree(trees, x, smp.h, z, rng.weighted(TREE_MIX.forest), rng, Math.abs(jd));
        if (rng.chance(0.06) && Math.abs(jd) < 60) addBoulder(batch, x - origin.x + 3, smp.h - origin.y, z - origin.z, 0.8 + rng.next() * 1.6, rng);
      }
    }
    // far hillside forest as billboards
    const ff = 26;
    for (let s = Math.floor(s0 / ff) * ff; s < s1; s += ff) {
      for (const side of [-1, 1]) {
        for (let d = 270; d < 1500; d += ff) {
          const hv = hash2(s, d * side, 12);
          if (hv > 0.5 * veg) continue;
          const js = s + (hash2(s, d, 13) - 0.5) * ff, jd = side * (d + (hash2(s, d, 14) - 0.5) * ff);
          if (js < s0 || js >= s1) continue;
          const [x, z] = world(js, jd);
          const smp = sample(x, z);
          if (smp.forest < 0.4) continue;
          trees.far.push({ x, y: smp.h, z, type: rng.chance(0.7) ? 'sal' : 'neem', s: 0.8 + rng.next() * 0.6, r: rng.next() * 6.28, c: 0.8 + rng.next() * 0.35 });
        }
      }
    }
  }
  emitTrees(ctx, chunk, trees, origin);
}

function pushTree(trees, x, y, z, type, rng, distFromTrack) {
  const t = { x, y, z, type, s: 0.75 + rng.next() * 0.55, r: rng.next() * Math.PI * 2, c: 0.82 + rng.next() * 0.3 };
  if (distFromTrack < 170) trees.near.push(t);
  else trees.far.push(t);
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _col = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

function makeInstanced(geo, mat, list, origin, castShadow) {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((t, i) => {
    _q.setFromAxisAngle(_up, t.r);
    _p.set(t.x - origin.x, t.y - origin.y - 0.15, t.z - origin.z);
    _s.setScalar(t.s);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
    _col.setRGB(t.c * (0.95 + (i % 3) * 0.04), t.c, t.c * (0.92 + (i % 5) * 0.03));
    mesh.setColorAt(i, _col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.userData.sharedGeometry = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function emitTrees(ctx, chunk, trees, origin) {
  const flora = ctx.flora;
  if (!flora) return;
  const byType = (list) => {
    const m = new Map();
    for (const t of list) {
      if (!m.has(t.type)) m.set(t.type, []);
      m.get(t.type).push(t);
    }
    return m;
  };
  const near = new THREE.Group(), nearBB = new THREE.Group(), far = new THREE.Group();
  near.name = 'treesNear';
  nearBB.name = 'treesNearBB';
  far.name = 'treesFar';
  for (const [type, list] of byType(trees.near)) {
    near.add(makeInstanced(flora.geos[type], flora.material, list, origin, true));
    nearBB.add(makeInstanced(flora.bbGeos[type], flora.bbMaterial, list, origin, false));
  }
  for (const [type, list] of byType(trees.far)) far.add(makeInstanced(flora.bbGeos[type], flora.bbMaterial, list, origin, false));
  nearBB.visible = false;
  chunk.group.add(near, nearBB, far);
  chunk.trees = { near, nearBB, far };
  chunk.dynamic.push({ dispose: () => [near, nearBB, far].forEach((g) => g.children.forEach((m) => m.dispose())) });
}

function buildBoundaryWalls(ctx, s0, s1, batch, origin, inYard, nearRoad, nearRoadBridge) {
  const { geo } = ctx;
  const frame = new TrackFrame(geo);
  const profile = [[-0.08, -1.2], [-0.08, 1.55], [0.08, 1.55], [0.08, -1.2]];
  for (const side of [-1, 1]) {
    const off = side * 15.5;
    let run = [];
    const flush = () => {
      if (run.length > 1) extrudeProfile(batch, 'concrete', frame, () => off, run, profile, origin, { uScale: 0.4, vScale: 0.25, color: new THREE.Color('#d6d0c4') });
      run = [];
    };
    for (const s of sampleChainages(geo, null, s0, s1, 6)) {
      if (s < 0 || inYard(s, off, 2) || nearRoad(s, off) || nearRoadBridge(s)) flush();
      else run.push(s);
    }
    flush();
    // posts every 3 m
    for (let s = Math.ceil(s0 / 3) * 3; s < s1; s += 3) {
      if (s < 0 || inYard(s, off, 2) || nearRoad(s, off) || nearRoadBridge(s)) continue;
      const g = geo.sample(s);
      box(batch, 'concrete', g.x + g.nx * off - origin.x, g.y - 1.2 - origin.y, g.z + g.nz * off - origin.z, 0.28, 2.85, 0.28, -g.h, '#c9c3b6');
    }
  }
}

/** LOD toggling for tree groups (called each frame by the world). */
export function updateChunkTrees(chunk, distance) {
  if (!chunk.trees) return;
  const near = distance < 520;
  chunk.trees.near.visible = near;
  chunk.trees.nearBB.visible = !near;
}
