import * as THREE from 'three';
import { Tex } from './TextureGen.js';
import { lerp } from '../core/MathUtil.js';

/**
 * Shared material library. Materials flagged `wet` darken and gain gloss as rain wetness rises.
 */
export class MaterialLib {
  constructor() {
    this.cache = new Map();
    this.wettable = [];
    this.nightLit = []; // { mat, intensity } emissive that turns on at night
    this.wetness = 0;
    this.nightFactor = 0;
  }

  std(key, params, { wet = false, wetGloss = 0.35, night = 0 } = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    const m = new THREE.MeshStandardMaterial(params);
    m.name = key;
    this.cache.set(key, m);
    if (wet) this.wettable.push({ m, rough: m.roughness, color: m.color.clone(), gloss: wetGloss });
    if (night) this.nightLit.push({ m, intensity: night });
    return m;
  }

  get(key) {
    const c = this.cache.get(key);
    if (c) return c;
    const T = Tex;
    switch (key) {
      case 'ballast': {
        return this.std(key, { map: T.ballast(), roughness: 0.96, color: 0xb0aaa2 }, { wet: true, wetGloss: 0.5 });
      }
      case 'sleeper':
        return this.std(key, { map: T.concrete('#b9b4aa', 'sleeper'), roughness: 0.88, color: 0xffffff }, { wet: true });
      case 'railHead':
        return this.std(key, { color: 0xd4d6d8, metalness: 0.9, roughness: 0.26 }, { wet: true, wetGloss: 0.6 });
      case 'rail':
        return this.std(key, { color: 0x5b4535, metalness: 0.35, roughness: 0.78 }, { wet: true });
      case 'sleeperWood':
        return this.std(key, { color: 0x4a3626, roughness: 0.95 }, { wet: true });
      case 'concrete':
        return this.std(key, { map: T.concrete('#a39f97'), roughness: 0.9, vertexColors: true }, { wet: true });
      case 'concreteDark':
        return this.std(key, { map: T.concrete('#7c7a75', 'concDark'), roughness: 0.92, vertexColors: true }, { wet: true });
      case 'platform':
        return this.std(key, { map: T.platform(), roughness: 0.82, vertexColors: true }, { wet: true, wetGloss: 0.25 });
      case 'platformEdge':
        return this.std(key, { map: T.platformEdge(), roughness: 0.78 }, { wet: true, wetGloss: 0.3 });
      case 'steel':
        return this.std(key, { color: 0x8a9096, metalness: 0.65, roughness: 0.48, vertexColors: true }, { wet: true });
      case 'steelDark':
        return this.std(key, { color: 0x3c4046, metalness: 0.6, roughness: 0.55, vertexColors: true }, { wet: true });
      case 'galv':
        return this.std(key, { color: 0xa9aeb2, metalness: 0.75, roughness: 0.42 });
      case 'paint':
        return this.std(key, { color: 0xffffff, roughness: 0.75, vertexColors: true }, { wet: true });
      case 'paintGloss':
        return this.std(key, { color: 0xffffff, roughness: 0.4, metalness: 0.1, vertexColors: true }, { wet: true });
      case 'plaster':
        return this.std(key, { map: T.plaster(), roughness: 0.92, vertexColors: true }, { wet: true });
      case 'brick':
        return this.std(key, { map: T.brick(), roughness: 0.9, vertexColors: true }, { wet: true });
      case 'roof':
        return this.std(key, { map: T.roofSheet(), roughness: 0.6, metalness: 0.35, vertexColors: true, side: THREE.DoubleSide }, { wet: true, wetGloss: 0.5 });
      case 'thatch':
        return this.std(key, { color: 0x9c8455, roughness: 1, vertexColors: true, flatShading: true }, { wet: true });
      case 'asphalt':
        return this.std(key, { map: T.asphalt(), roughness: 0.9, vertexColors: true }, { wet: true, wetGloss: 0.3 });
      case 'wood':
        return this.std(key, { color: 0x6e5038, roughness: 0.85, vertexColors: true }, { wet: true });
      case 'glass':
        return this.std(key, { color: 0x24323c, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.4 });
      case 'insulator':
        return this.std(key, { color: 0x6b3a2a, roughness: 0.3, metalness: 0.05 });
      case 'wire':
        return this.std(key, { color: 0x4a3f34, metalness: 0.8, roughness: 0.45 });
      case 'foliage':
        return this.std(key, { color: 0xffffff, roughness: 0.92, vertexColors: true, flatShading: false }, { wet: true });
      case 'bark':
        return this.std(key, { color: 0xffffff, roughness: 1, vertexColors: true });
      case 'rock':
        return this.std(key, { map: T.concrete('#8a8073', 'rock'), roughness: 0.95, vertexColors: true, flatShading: true }, { wet: true });
      case 'facade0':
      case 'facade1':
      case 'facade2':
      case 'facade3': {
        const w = T.facade(+key.slice(-1));
        return this.std(key, { map: w.map, emissiveMap: w.emissive, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.85, vertexColors: true }, { wet: true, night: 1.4 });
      }
      case 'shopfront': {
        const w = T.shopfront();
        return this.std(key, { map: w.map, emissiveMap: w.emissive, emissive: 0xffe0b0, emissiveIntensity: 0, roughness: 0.8, vertexColors: true }, { wet: true, night: 1.2 });
      }
      case 'lamp':
        return this.std(key, { color: 0x222222, emissive: 0xffe2b0, emissiveIntensity: 0, roughness: 0.5 }, { night: 6 });
      case 'lampCool':
        return this.std(key, { color: 0x222222, emissive: 0xe6f2ff, emissiveIntensity: 0, roughness: 0.5 }, { night: 6 });
      case 'tunnel':
        return this.std(key, { map: T.concrete('#6f6a62', 'tunnel'), roughness: 0.95, vertexColors: true, side: THREE.DoubleSide }, {});
      case 'stone':
        return this.std(key, { map: T.concrete('#9b8f7c', 'stone'), roughness: 0.92, vertexColors: true }, { wet: true });
      case 'dark':
        return this.std(key, { color: 0x101114, roughness: 1 });
      default:
        console.warn('[Materials] unknown key', key);
        return this.std(key, { color: 0xff00ff });
    }
  }

  setWetness(w) {
    if (Math.abs(w - this.wetness) < 0.01) return;
    this.wetness = w;
    for (const e of this.wettable) {
      e.m.roughness = lerp(e.rough, e.rough * e.gloss, w);
      e.m.color.copy(e.color).multiplyScalar(1 - 0.28 * w);
    }
  }

  setNight(n) {
    if (Math.abs(n - this.nightFactor) < 0.01) return;
    this.nightFactor = n;
    for (const e of this.nightLit) e.m.emissiveIntensity = e.intensity * n;
  }
}

export const materials = new MaterialLib();
