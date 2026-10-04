import * as THREE from 'three';
import { clamp, lerp, smoothstep, DEG } from '../core/MathUtil.js';

// ---------------------------------------------------------------------------
// Height fog with sun in-scattering, patched into every built-in three.js material.
// Uniform values are shared plain objects so one update reaches every program.
export const FOG = {
  params: { x: 0.012, y: 78, z: 0.6, w: 1.0 }, // height falloff, base height, sun scatter, max opacity
  sun: { x: 0, y: 1, z: 0, w: 0 },
  sunColor: { x: 1, y: 0.8, z: 0.6 },
};
let fogInstalled = false;

export function installFog() {
  if (fogInstalled) return;
  fogInstalled = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  uniform vec4 fogParams;
  uniform vec4 fogSun;
  uniform vec3 fogSunColor;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
  {
    vec3 fogRay = vFogWorld - cameraPosition;
    float fogDist = length( fogRay );
    vec3 fogDir = fogRay / max( fogDist, 0.001 );
    #ifdef FOG_EXP2
      float fh = fogParams.x;
      float camH = clamp( cameraPosition.y - fogParams.y, -60.0, 600.0 );
      float dy = fogDir.y * fogDist * fh;
      float hterm = abs( dy ) > 0.001 ? ( 1.0 - exp( - dy ) ) / dy : 1.0;
      float fogAmount = fogDensity * exp( - camH * fh ) * fogDist * hterm;
      float fogFactor = min( 1.0 - exp( - fogAmount ), fogParams.w );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    float sunAmt = pow( max( dot( fogDir, fogSun.xyz ), 0.0 ), 6.0 ) * fogParams.z;
    vec3 fCol = mix( fogColor, fogSunColor, clamp( sunAmt, 0.0, 1.0 ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fCol, fogFactor );
  }
#endif`;
  for (const name of Object.keys(THREE.ShaderLib)) {
    const lib = THREE.ShaderLib[name];
    if (lib.uniforms && lib.uniforms.fogColor) {
      lib.uniforms.fogParams = { value: FOG.params };
      lib.uniforms.fogSun = { value: FOG.sun };
      lib.uniforms.fogSunColor = { value: FOG.sunColor };
    }
  }
}

export function fogUniforms() {
  return THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    fogParams: { value: FOG.params }, fogSun: { value: FOG.sun }, fogSunColor: { value: FOG.sunColor },
  }]);
}

// ---------------------------------------------------------------------------
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uSunColor, uGround, uCloudLit, uCloudDark;
uniform float uTime, uCloud, uNight, uSunSize, uHaze, uFogHorizon, uStorm;
varying vec3 vDir;
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float noise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), u.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), u.x ), u.y );
}
float fbm( vec2 p ) {
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < 5; i++ ) { s += a * noise( p ); p = p * 2.03 + vec2( 1.7, 9.2 ); a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize( vDir );
  float y = d.y;
  float hy = max( y, 0.0 );
  // base gradient
  float g = pow( 1.0 - hy, 3.2 );
  vec3 col = mix( uZenith, uHorizon, g );
  // below horizon: blend to ground haze
  if ( y < 0.0 ) col = mix( uHorizon, uGround, smoothstep( 0.0, -0.25, y ) );
  // sun glow (mie) and disc
  float sd = max( dot( d, uSunDir ), 0.0 );
  float sunVis = smoothstep( -0.12, 0.02, uSunDir.y );
  col += uSunColor * ( pow( sd, 7.0 ) * 0.35 + pow( sd, 60.0 ) * 0.6 ) * ( 0.4 + uHaze ) * sunVis * ( 1.0 - uCloud * 0.6 );
  float disc = smoothstep( uSunSize, uSunSize + 0.00035, sd ) * ( 1.0 - uFogHorizon ) * sunVis;
  // stars
  vec3 stars = vec3( 0.0 );
  if ( uNight > 0.01 && y > 0.0 ) {
    vec2 sp = vec2( atan( d.z, d.x ) * 140.0, asin( y ) * 140.0 );
    vec2 cell = floor( sp );
    float h = hash( cell );
    if ( h > 0.985 ) {
      vec2 f = fract( sp ) - 0.5;
      float r = length( f );
      float tw = 0.65 + 0.35 * sin( uTime * ( 1.0 + h * 5.0 ) + h * 40.0 );
      stars = vec3( 0.85, 0.9, 1.0 ) * smoothstep( 0.18, 0.0, r ) * ( h - 0.985 ) * 66.0 * tw;
    }
    stars *= uNight * smoothstep( 0.0, 0.25, y );
  }
  // moon
  float md = max( dot( d, uMoonDir ), 0.0 );
  vec3 moon = vec3( 0.75, 0.8, 0.9 ) * ( smoothstep( 0.99965, 0.9998, md ) * 1.6 + pow( md, 300.0 ) * 0.12 ) * uNight;
  // clouds on a virtual plane
  float cloudMask = 0.0;
  vec3 cloudCol = vec3( 0.0 );
  if ( y > 0.0 ) {
    vec2 cp = d.xz / ( y + 0.12 ) * 1.4 + vec2( uTime * 0.004, uTime * 0.0015 );
    float n = fbm( cp ) ;
    float n2 = fbm( cp * 2.3 + 4.0 );
    float cov = uCloud;
    cloudMask = smoothstep( 1.0 - cov * 0.95 - 0.08, 1.0 - cov * 0.95 + 0.32, n * 0.75 + n2 * 0.35 );
    cloudMask *= smoothstep( 0.0, 0.18, y );
    float lit = clamp( 0.55 + 0.6 * ( n - n2 ) + pow( sd, 4.0 ) * 0.6, 0.0, 1.4 );
    cloudCol = mix( uCloudDark, uCloudLit, lit );
    cloudCol += uSunColor * pow( sd, 10.0 ) * 0.5 * ( 1.0 - uCloud * 0.7 );
  }
  col = col + stars * ( 1.0 - cloudMask ) + moon * ( 1.0 - cloudMask * 0.9 );
  col += uSunColor * disc * 22.0 * ( 1.0 - cloudMask );
  col = mix( col, cloudCol, cloudMask * ( 0.92 + 0.08 * uStorm ) );
  // horizon fog band
  col = mix( col, uHorizon, uFogHorizon * ( 1.0 - smoothstep( 0.0, 0.55, hy ) ) );
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Sky palettes keyed by sun elevation (degrees). [elev, zenith, horizon, sunColor, light intensity]
const PALETTE = [
  [-18, '#03050c', '#0a101c', '#000000', 0],
  [-9, '#08112a', '#1d2840', '#20102a', 0],
  [-4, '#18264a', '#6a4a58', '#a04030', 0.05],
  [0, '#2e4370', '#d17a4e', '#ff7a35', 0.35],
  [4, '#3e5f95', '#efa86a', '#ff9a4c', 1.2],
  [10, '#4675b5', '#e6c9a2', '#ffc283', 2.4],
  [20, '#3f78c2', '#c4d8e8', '#ffe2b8', 3.0],
  [45, '#2f6bbf', '#b6d0e6', '#fff1dc', 3.5],
  [90, '#2a64b8', '#a9c7e2', '#fff6e8', 3.7],
];
const tmpA = new THREE.Color(), tmpB = new THREE.Color();

function samplePalette(elev, idx, out) {
  const P = PALETTE;
  if (elev <= P[0][0]) return out.set(P[0][idx]);
  for (let i = 0; i < P.length - 1; i++) {
    if (elev <= P[i + 1][0]) {
      const t = (elev - P[i][0]) / (P[i + 1][0] - P[i][0]);
      tmpA.set(P[i][idx]);
      tmpB.set(P[i + 1][idx]);
      return out.copy(tmpA).lerp(tmpB, t);
    }
  }
  return out.set(P[P.length - 1][idx]);
}
function paletteValue(elev, idx) {
  const P = PALETTE;
  if (elev <= P[0][0]) return P[0][idx];
  for (let i = 0; i < P.length - 1; i++) {
    if (elev <= P[i + 1][0]) return lerp(P[i][idx], P[i + 1][idx], (elev - P[i][0]) / (P[i + 1][0] - P[i][0]));
  }
  return P[P.length - 1][idx];
}

export class Atmosphere {
  constructor(scene, renderer) {
    installFog();
    this.scene = scene;
    this.renderer = renderer;
    this.latitude = 24;
    this.dayOfYear = 80;
    this.hours = 9;
    this.weather = { cloud: 0.1, rain: 0, fog: 0.0002, haze: 0.3, dust: 0, lightning: 0, wind: 0.2, heat: 0 };
    this.flash = 0;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, 1, 0);
    this.night = 0;
    this.daylight = 1;

    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uSunDir: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() },
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
        uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
        uTime: { value: 0 }, uCloud: { value: 0.2 }, uNight: { value: 0 }, uSunSize: { value: 0.99993 },
        uHaze: { value: 0.3 }, uFogHorizon: { value: 0 }, uStorm: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.scale.setScalar(9000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.shadowExtent = 90;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x5a4a32, 1.0);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x404a60, 0.0);
    scene.add(this.ambient);

    scene.fog = new THREE.FogExp2(0xb8c8d8, 0.0002);
    this.fogColor = scene.fog.color;

    // Environment map from the sky for PBR reflections.
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(geo, this.skyMat);
    this.envSky.scale.setScalar(100);
    this.envScene.add(this.envSky);
    this.envKey = '';
    this.envRT = null;
    this.envTimer = 0;
    this.lightningTimer = 4;
    this.lightningCallback = null;
  }

  setShadowQuality(q) {
    const map = { off: 0, low: 1024, medium: 1536, high: 2048, ultra: 4096 };
    const size = map[q] ?? 2048;
    this.sun.castShadow = size > 0;
    this.shadowExtent = q === 'ultra' ? 140 : q === 'high' ? 100 : 75;
    if (size > 0 && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    const cam = this.sun.shadow.camera;
    cam.left = -this.shadowExtent;
    cam.right = this.shadowExtent;
    cam.top = this.shadowExtent;
    cam.bottom = -this.shadowExtent;
    cam.near = 1;
    cam.far = 900;
    cam.updateProjectionMatrix();
  }

  computeSun(hours) {
    const N = this.dayOfYear;
    const lat = this.latitude * DEG;
    const decl = 23.44 * DEG * Math.sin(((2 * Math.PI) / 365) * (284 + N));
    const H = (hours - 12) * 15 * DEG;
    const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
    const el = Math.asin(clamp(sinEl, -1, 1));
    let cosAz = (Math.sin(decl) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat));
    let az = Math.acos(clamp(cosAz, -1, 1));
    if (H > 0) az = 2 * Math.PI - az;
    return { el, az };
  }

  sunTimes() {
    // sunrise/sunset hours for UI text
    let rise = 6, set = 18;
    for (let h = 3; h < 12; h += 0.02) if (this.computeSun(h).el > -0.833 * DEG) { rise = h; break; }
    for (let h = 21; h > 12; h -= 0.02) if (this.computeSun(h).el > -0.833 * DEG) { set = h; break; }
    return { rise, set };
  }

  setWeather(w) {
    Object.assign(this.weather, w);
  }

  update(dt, hours, camera, focus, time) {
    this.hours = hours;
    const { el, az } = this.computeSun(hours);
    const elDeg = el / DEG;
    this.sunElevation = elDeg;
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
    const m = this.computeSun(hours + 12.4);
    this.moonDir.set(Math.cos(m.el) * Math.sin(m.az + 0.3), Math.sin(m.el) * 0.9 + 0.1, -Math.cos(m.el) * Math.cos(m.az + 0.3)).normalize();
    const W = this.weather;
    const overcast = clamp(W.cloud, 0, 1);
    const night = 1 - smoothstep(-10, -2, elDeg);
    this.night = night;

    const zen = samplePalette(elDeg, 1, new THREE.Color());
    const hor = samplePalette(elDeg, 2, new THREE.Color());
    const sunCol = samplePalette(elDeg, 3, new THREE.Color());
    let lightI = paletteValue(elDeg, 4);
    // weather grading
    const grey = new THREE.Color().setScalar(0.5 * (zen.r + zen.g + zen.b) / 1.5);
    const greyH = new THREE.Color().setScalar((hor.r + hor.g + hor.b) / 3);
    const overcastAmt = smoothstep(0.45, 1.0, overcast);
    const dark = 1 - 0.45 * W.rain - 0.15 * overcastAmt;
    zen.lerp(grey.multiplyScalar(1.15), overcastAmt * 0.85).multiplyScalar(dark);
    hor.lerp(greyH.multiplyScalar(1.0), overcastAmt * 0.7).multiplyScalar(dark);
    if (W.dust > 0) {
      const dustC = new THREE.Color('#c9a878').multiplyScalar(0.25 + 0.75 * this.daylightFactor(elDeg));
      hor.lerp(dustC, W.dust * 0.7);
      zen.lerp(dustC.clone().multiplyScalar(0.8), W.dust * 0.45);
      sunCol.lerp(new THREE.Color('#ff9a50'), W.dust * 0.5);
    }
    const fogHeavy = smoothstep(0.002, 0.02, W.fog);
    const fogC = hor.clone().lerp(new THREE.Color('#bfc4c8').multiplyScalar(0.12 + 0.88 * this.daylightFactor(elDeg)), fogHeavy * 0.85);
    hor.lerp(fogC, fogHeavy);
    zen.lerp(fogC, fogHeavy * 0.75);

    const sunVisible = 1 - overcastAmt * 0.82 - fogHeavy * 0.6;
    lightI *= clamp(sunVisible, 0.12, 1);
    this.daylight = this.daylightFactor(elDeg) * (1 - 0.5 * overcastAmt) * (1 - 0.35 * W.rain);

    const u = this.skyMat.uniforms;
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.moonDir);
    u.uZenith.value.copy(zen);
    u.uHorizon.value.copy(hor);
    u.uSunColor.value.copy(sunCol).multiplyScalar(clamp(sunVisible, 0, 1) * (1 - overcastAmt * 0.6));
    u.uGround.value.copy(hor).multiplyScalar(0.55);
    const day = this.daylightFactor(elDeg);
    u.uCloudLit.value.copy(new THREE.Color('#f4f1ea').multiplyScalar(0.06 + 0.94 * day)).lerp(sunCol, (elDeg < 12 && elDeg > -4 ? 0.45 : 0.05) * (1 - overcastAmt * 0.75)).multiplyScalar(1 - 0.45 * W.rain);
    u.uCloudDark.value.copy(new THREE.Color('#8b93a0').multiplyScalar(0.04 + 0.7 * day)).multiplyScalar(1 - 0.5 * W.rain - 0.2 * W.lightning);
    u.uTime.value = time;
    u.uCloud.value = overcast;
    u.uNight.value = night * (1 - overcastAmt * 0.9) * (1 - fogHeavy);
    u.uHaze.value = W.haze;
    u.uFogHorizon.value = clamp(fogHeavy + W.dust * 0.4, 0, 1);
    u.uStorm.value = W.lightning;

    // lights
    const useMoon = elDeg < -4;
    const lightDir = useMoon ? this.moonDir : this.sunDir;
    const flash = this.flash;
    if (useMoon) {
      this.sun.color.set('#9fb4e6');
      this.sun.intensity = 0.32 * night * (1 - overcastAmt * 0.8) + flash * 2.5;
    } else {
      this.sun.color.copy(sunCol);
      this.sun.intensity = lightI + flash * 2.5;
    }
    this.hemi.color.copy(zen).lerp(new THREE.Color('#e8eef5'), 0.62);
    this.hemi.groundColor.set('#6a5a40').multiplyScalar(0.25 + 0.75 * day);
    this.hemi.intensity = 0.18 + 0.62 * day + flash * 1.5 + night * 0.1;
    this.ambient.intensity = night * 0.4;

    // fog
    const fogDensity = W.fog + W.rain * 0.0007 + W.dust * 0.0012;
    this.scene.fog.density = fogDensity;
    this.fogColor.copy(hor).lerp(zen, 0.28);
    if (night > 0.5) this.fogColor.lerp(new THREE.Color('#0d1320'), 0.5);
    FOG.params.x = fogHeavy > 0.3 ? 0.006 : 0.016 - 0.008 * W.rain;
    FOG.params.y = focus ? focus.y - 4 : 78;
    FOG.params.z = 0.75 * (1 - overcastAmt) * (1 - 0.6 * fogHeavy) * this.daylightFactor(elDeg);
    FOG.params.w = 1.0;
    FOG.sun.x = this.sunDir.x; FOG.sun.y = this.sunDir.y; FOG.sun.z = this.sunDir.z;
    const fsc = sunCol.clone().lerp(new THREE.Color('#e9e4dc').multiplyScalar(0.3 + 0.7 * this.daylightFactor(elDeg)), Math.max(fogHeavy, overcastAmt) * 0.8);
    FOG.sunColor.x = fsc.r; FOG.sunColor.y = fsc.g; FOG.sunColor.z = fsc.b;

    // shadow camera follows the focus point with texel snapping
    if (focus) {
      const ext = this.shadowExtent;
      const texel = (2 * ext) / this.sun.shadow.mapSize.x;
      const t = this.sun.target.position;
      t.copy(focus);
      // snap in light space
      const lightRot = new THREE.Matrix4().lookAt(new THREE.Vector3(), lightDir.clone().negate(), new THREE.Vector3(0, 1, 0));
      const inv = lightRot.clone().invert();
      const p = t.clone().applyMatrix4(inv);
      p.x = Math.round(p.x / texel) * texel;
      p.y = Math.round(p.y / texel) * texel;
      t.copy(p.applyMatrix4(lightRot));
      this.sun.position.copy(t).addScaledVector(lightDir, 400);
      this.sun.target.updateMatrixWorld();
    }
    if (camera) this.sky.position.copy(camera.position);

    // environment map refresh
    this.envTimer -= dt;
    const key = `${Math.round(elDeg * 1.5)}|${overcast.toFixed(2)}|${fogHeavy.toFixed(2)}|${W.dust.toFixed(2)}|${W.rain.toFixed(1)}`;
    if (key !== this.envKey && this.envTimer <= 0) {
      this.envKey = key;
      this.envTimer = 0.8;
      this.refreshEnv();
    }
    const envI = 0.08 + 0.42 * day;
    this.scene.environmentIntensity = envI * (1 - 0.3 * overcastAmt);

    // exposure: slightly brighter at night so headlights + lamps read well
    const exposure = lerp(0.82, 1.35, night) * (1 + 0.18 * overcastAmt);
    this.renderer.toneMappingExposure = exposure;

    // lightning
    this.flash = Math.max(0, this.flash - dt * 6);
    if (W.lightning > 0.01) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 5 + Math.random() * 14 / W.lightning;
        const strength = 0.6 + Math.random() * 0.6;
        this.flash = strength;
        const distance = 600 + Math.random() * 5000;
        setTimeout(() => (this.flash = Math.max(this.flash, strength * 0.6)), 120);
        if (this.lightningCallback) this.lightningCallback({ strength, distance });
      }
    }
  }

  daylightFactor(elDeg) {
    return smoothstep(-6, 12, elDeg);
  }

  refreshEnv() {
    const r = this.renderer;
    const prevExposure = r.toneMappingExposure;
    const prevTone = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.5, 200);
    r.toneMapping = prevTone;
    r.toneMappingExposure = prevExposure;
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }
}
