import { RouteGeometry } from './RouteGeometry.js';
import { Network } from './Network.js';
import { TerrainSampler } from './TerrainSampler.js';
import { buildTerrainPatch } from './TerrainPatch.js';
import { ROUTES } from '../data/routes/index.js';

let sampler = null;

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      const def = ROUTES[msg.routeId];
      const geo = new RouteGeometry(def);
      const net = new Network(def, geo);
      sampler = new TerrainSampler(def, geo, net);
      self.postMessage({ type: 'ready' });
    } else if (msg.type === 'build') {
      const r = buildTerrainPatch(sampler, msg.x0, msg.z0, msg.size, msg.seg);
      self.postMessage({ type: 'patch', key: msg.key, ...r }, [r.positions.buffer, r.normals.buffer, r.colors.buffer, r.farm.buffer, r.index.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', key: msg.key, message: String(err && err.message) });
  }
};
