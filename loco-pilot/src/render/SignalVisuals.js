import * as THREE from 'three';
import { box } from './Buildings.js';
import { Prim } from './GeoBatch.js';
import { plateMaterial } from './Signage.js';
import { fogUniforms } from './Atmosphere.js';

// Lamp order on the head, top -> bottom.
export const LAMP_ORDER = ['Y2', 'G', 'Y', 'R'];
const LAMP_SPACING = 0.42;
const HEAD_TOP = 5.55;

export const LAMP_COLORS = {
  R: new THREE.Color(5.0, 0.12, 0.04),
  Y: new THREE.Color(5.0, 2.9, 0.25),
  G: new THREE.Color(0.15, 4.2, 1.6),
  W: new THREE.Color(3.6, 3.6, 3.4),
  off: new THREE.Color(0.025, 0.025, 0.028),
};

const GLOW_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
uniform float uScale;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float dist = -mvPosition.z;
  vColor = aColor;
  vAlpha = aAlpha;
  // grows slowly with distance so far signals stay visible as points of light
  gl_PointSize = aAlpha > 0.0 ? clamp(uScale * (1.6 + 0.0028 * dist) / max(dist, 1.0) * 600.0, 3.0, 64.0) : 0.0;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const GLOW_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
uniform float uFogPierce;
#include <fog_pars_fragment>
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = smoothstep(1.0, 0.0, r);
  a = a * a * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
  #ifdef USE_FOG
    vec3 lit = gl_FragColor.rgb;
    #include <fog_fragment>
    gl_FragColor.rgb = mix(gl_FragColor.rgb, lit, uFogPierce);
  #endif
}`;

/**
 * Renders every signal: static post/head geometry is batched into world chunks by
 * `addSignalStatics`; lamps and their glow are global instanced/point buffers updated per aspect.
 */
export class SignalVisuals {
  constructor(scene, world) {
    this.world = world;
    const sigs = world.network.signals;
    this.signals = sigs;
    const lampsPer = (sg) => 4 + (sg.routeIndicator ? 5 : 0);
    let total = 0;
    for (const sg of sigs) {
      sg._lampBase = total;
      total += lampsPer(sg);
    }
    this.total = total;
    const disc = new THREE.CircleGeometry(0.105, 14);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    this.lamps = new THREE.InstancedMesh(disc, mat, total);
    this.lamps.frustumCulled = false;
    this.lamps.name = 'signalLamps';
    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const alphas = new Float32Array(total);
    const m = new THREE.Matrix4();
    const tmp = {};
    for (const sg of sigs) {
      const g = world.geo.sample(sg.s, tmp);
      const facing = Math.atan2(g.tx, g.tz) + (sg.dir > 0 ? Math.PI : 0);
      const base = new THREE.Vector3(g.x + g.nx * sg.lateral, g.y, g.z + g.nz * sg.lateral);
      const fwd = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
      const right = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));
      sg._world = base.clone();
      sg._facing = facing;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing);
      for (let i = 0; i < 4; i++) {
        const p = base.clone().addScaledVector(fwd, 0.13).setY(base.y + HEAD_TOP - 0.25 - i * LAMP_SPACING);
        m.compose(p, q, new THREE.Vector3(1, 1, 1));
        this.lamps.setMatrixAt(sg._lampBase + i, m);
        positions.set([p.x, p.y, p.z], (sg._lampBase + i) * 3);
      }
      if (sg.routeIndicator) {
        // junction-type indicator: five white lamps rising to the left at 45°
        for (let k = 0; k < 5; k++) {
          const p = base.clone().addScaledVector(fwd, 0.1).addScaledVector(right, (sg.dir > 0 ? 1 : 1) * (-0.25 - k * 0.2)).setY(base.y + HEAD_TOP + 0.35 + k * 0.2);
          m.compose(p, q, new THREE.Vector3(0.7, 0.7, 0.7));
          this.lamps.setMatrixAt(sg._lampBase + 4 + k, m);
          positions.set([p.x, p.y, p.z], (sg._lampBase + 4 + k) * 3);
        }
      }
    }
    this.lamps.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < total; i++) this.lamps.setColorAt(i, LAMP_COLORS.off);
    this.lamps.instanceColor.needsUpdate = true;
    scene.add(this.lamps);

    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.glowColor = new THREE.BufferAttribute(colors, 3);
    this.glowAlpha = new THREE.BufferAttribute(alphas, 1);
    pg.setAttribute('aColor', this.glowColor);
    pg.setAttribute('aAlpha', this.glowAlpha);
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      uniforms: { ...fogUniforms(), uScale: { value: 1 }, uFogPierce: { value: 0.55 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    this.glow = new THREE.Points(pg, this.glowMat);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 10;
    scene.add(this.glow);
    this.dirty = true;
  }

  setNight(n, fogDensity) {
    this.glowMat.uniforms.uScale.value = 0.35 + 0.9 * n + Math.min(1, fogDensity * 120) * 0.5;
  }

  /** Apply aspect: 'R' | 'Y' | 'YY' | 'G' | 'OFF'; routeOn lights the junction indicator. */
  setAspect(sg, aspect, routeOn = false, flicker = 1) {
    const key = aspect + (routeOn ? '+' : '') + flicker;
    if (sg._shown === key) return;
    sg._shown = key;
    const lit = { Y2: aspect === 'YY', G: aspect === 'G', Y: aspect === 'Y' || aspect === 'YY', R: aspect === 'R' };
    const col = { Y2: LAMP_COLORS.Y, G: LAMP_COLORS.G, Y: LAMP_COLORS.Y, R: LAMP_COLORS.R };
    for (let i = 0; i < 4; i++) {
      const name = LAMP_ORDER[i];
      const on = lit[name] && aspect !== 'OFF';
      const idx = sg._lampBase + i;
      this.lamps.setColorAt(idx, on ? col[name] : LAMP_COLORS.off);
      this.glowAlpha.array[idx] = on ? flicker : 0;
      const c = col[name];
      this.glowColor.array.set([c.r * 0.35, c.g * 0.35, c.b * 0.35], idx * 3);
    }
    if (sg.routeIndicator) {
      for (let k = 0; k < 5; k++) {
        const idx = sg._lampBase + 4 + k;
        this.lamps.setColorAt(idx, routeOn ? LAMP_COLORS.W : LAMP_COLORS.off);
        this.glowAlpha.array[idx] = routeOn ? 0.45 : 0;
        this.glowColor.array.set([1, 1, 0.95], idx * 3);
      }
    }
    this.lamps.instanceColor.needsUpdate = true;
    this.glowAlpha.needsUpdate = true;
    this.glowColor.needsUpdate = true;
  }
}

/** Static signal structures for a world chunk. */
export function addSignalStatics(ctx, s0, s1, batch, origin, chunk) {
  const tmp = {};
  for (const sg of ctx.network.signals) {
    if (sg.s < s0 || sg.s >= s1) continue;
    const g = ctx.geo.sample(sg.s, tmp);
    const facing = Math.atan2(g.tx, g.tz) + (sg.dir > 0 ? Math.PI : 0);
    const x = g.x + g.nx * sg.lateral - origin.x, z = g.z + g.nz * sg.lateral - origin.z, y = g.y - origin.y;
    const fwd = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    box(batch, 'concrete', x, y - 0.9, z, 0.7, 0.9, 0.7, facing, '#a8a39b');
    box(batch, 'galv', x, y, z, 0.17, HEAD_TOP + 0.15, 0.17, facing, '#ffffff');
    // backplate + head
    box(batch, 'steelDark', x, y + HEAD_TOP - 1.65, z, 0.62, 1.75, 0.22, facing, '#151515');
    box(batch, 'paint', x - fwd.x * 0.03, y + HEAD_TOP - 1.75, z - fwd.z * 0.03, 0.8, 1.95, 0.05, facing, '#101010');
    for (let i = 0; i < 4; i++) {
      const hy = y + HEAD_TOP - 0.25 - i * LAMP_SPACING;
      // hood
      box(batch, 'steelDark', x + fwd.x * 0.2, hy + 0.12, z + fwd.z * 0.2, 0.3, 0.04, 0.22, facing, '#111111');
    }
    if (sg.routeIndicator) {
      const right = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));
      const c = new THREE.Vector3(x, y + HEAD_TOP + 0.75, z).addScaledVector(right, -0.65);
      const m = new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, facing, Math.PI / 4)), new THREE.Vector3(1.35, 0.26, 0.12));
      batch.add('paint', Prim.box(), m, new THREE.Color('#111'));
    }
    // ladder & platform for maintenance
    box(batch, 'galv', x - fwd.x * 0.35, y + HEAD_TOP - 2.2, z - fwd.z * 0.35, 0.9, 0.05, 0.6, facing, '#cfcfcf');
    if (sg.plate) {
      const mat = plateMaterial(sg.plate);
      const plate = new THREE.Mesh(chunkPlateGeo(), mat);
      plate.position.set(x + fwd.x * 0.1, y + HEAD_TOP - 3.0, z + fwd.z * 0.1);
      plate.rotation.y = facing;
      chunk.group.add(plate);
    }
  }
}
let plateGeo = null;
function chunkPlateGeo() {
  if (!plateGeo) plateGeo = new THREE.CircleGeometry(0.22, 18);
  return plateGeo;
}
