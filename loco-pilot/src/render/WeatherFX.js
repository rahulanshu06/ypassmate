import * as THREE from 'three';

const RAIN_VERT = /* glsl */ `
attribute vec3 aSeed;
attribute float aEnd;
uniform float uTime;
uniform vec3 uCam;
uniform float uBox;
uniform vec3 uFall;     // world velocity of drops (wind + gravity)
uniform vec3 uRel;      // camera velocity (streaks stretch with relative motion)
uniform float uLen;
varying float vAlpha;
void main() {
  vec3 p = aSeed * uBox + uFall * uTime;
  p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
  vec3 v = uFall - uRel;
  float l = length(v);
  vec3 dir = l > 0.0 ? v / l : vec3(0.0, -1.0, 0.0);
  p -= dir * aEnd * uLen * clamp(l / 9.0, 0.6, 3.5);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = length(p - uCam);
  vAlpha = (1.0 - aEnd * 0.85) * smoothstep(uBox * 0.5, uBox * 0.2, d) * smoothstep(0.4, 2.0, d);
  gl_Position = projectionMatrix * mv;
}`;
const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha * uOpacity);
}`;

/**
 * Precipitation & dust particles around the camera (GPU animated line streaks).
 */
export class WeatherFX {
  constructor(scene, quality = 'medium') {
    this.scene = scene;
    this.build(quality);
  }

  build(quality) {
    if (this.lines) {
      this.scene.remove(this.lines);
      this.lines.geometry.dispose();
    }
    const count = quality === 'low' ? 3500 : quality === 'high' ? 14000 : 8000;
    this.count = count;
    const seeds = new Float32Array(count * 2 * 3);
    const ends = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      for (let k = 0; k < 2; k++) {
        seeds.set([x, y, z], (i * 2 + k) * 3);
        ends[i * 2 + k] = k;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    this.uniforms = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: 44 }, uFall: { value: new THREE.Vector3(0, -9, 0) },
      uRel: { value: new THREE.Vector3() }, uLen: { value: 0.6 }, uColor: { value: new THREE.Color(0.75, 0.78, 0.82) }, uOpacity: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false });
    this.lines = new THREE.LineSegments(g, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 20;
    this.scene.add(this.lines);
  }

  update(dt, camera, weather, camVel, { inTunnel = false, daylight = 1, insideCab = false } = {}) {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uCam.value.copy(camera.position);
    const rain = inTunnel ? 0 : weather.rain || 0;
    const dust = inTunnel ? 0 : weather.dust || 0;
    if (rain > 0.02) {
      u.uFall.value.set(weather.wind * 3.5, -9.5 - rain * 3, weather.wind * 1.5);
      u.uLen.value = 0.55;
      u.uBox.value = 40;
      const lum = 0.3 + 0.65 * daylight;
      u.uColor.value.setRGB(lum, lum * 1.03, lum * 1.08);
      u.uOpacity.value = Math.min(0.55, 0.12 + rain * 0.45) * (insideCab ? 0.8 : 1);
      this.lines.geometry.setDrawRange(0, Math.floor(this.count * 2 * Math.min(1, 0.25 + rain)));
    } else if (dust > 0.05) {
      u.uFall.value.set(7 + weather.wind * 6, -0.4, 3);
      u.uLen.value = 0.25;
      u.uBox.value = 50;
      u.uColor.value.setRGB(0.62 * (0.3 + daylight), 0.5 * (0.3 + daylight), 0.36 * (0.3 + daylight));
      u.uOpacity.value = 0.25 * dust;
      this.lines.geometry.setDrawRange(0, Math.floor(this.count * 2 * 0.4));
    } else {
      u.uOpacity.value = 0;
    }
    u.uRel.value.copy(camVel);
    this.lines.visible = u.uOpacity.value > 0.001;
  }
}
