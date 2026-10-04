'use strict';
// Sky, sun & moon, day/night cycle, weather (clouds, rain, fog), environment reflections.
G.Env = (() => {
  const U = G.U;
  const C = (h) => new THREE.Color(h);
  const PAL = {
    dayZ: C(0x3a78c6), dayH: C(0xbcd5ea),
    setZ: C(0x2b4676), setH: C(0xf2a361),
    nightZ: C(0x03060f), nightH: C(0x0e1626),
    ovZ: C(0x7b838c), ovH: C(0xa9afb5),
    ovNightZ: C(0x05070b), ovNightH: C(0x0e1116),
  };
  const skyVS = `
    varying vec3 vDir;
    void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const skyFS = `
    uniform vec3 uSun, uMoon, uZenith, uHorizon, uSunCol, uCloudCol;
    uniform float uCloud, uTime, uNight, uOvercast;
    varying vec3 vDir;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
      col = mix(col, uHorizon * 0.8, smoothstep(0.0, -0.1, h));
      float sd = max(dot(d, uSun), 0.0);
      float vis = 1.0 - uOvercast * 0.85;
      col += uSunCol * (pow(sd, 6.0) * 0.22 + pow(sd, 90.0) * 0.6) * vis;
      col += uSunCol * smoothstep(0.99955, 0.9998, sd) * 6.0 * vis * step(-0.02, uSun.y);
      float md = max(dot(d, uMoon), 0.0);
      col += vec3(0.75, 0.8, 0.9) * smoothstep(0.99965, 0.9998, md) * uNight * vis;
      if (h > 0.0) {
        vec2 sp = d.xz / (d.y + 0.35) * 210.0;
        float st = step(0.9975, hash(floor(sp))) * (0.4 + 0.6 * hash(floor(sp) + 3.1));
        col += vec3(st) * uNight * (1.0 - uOvercast) * smoothstep(0.02, 0.25, h);
        vec2 uv = d.xz / (h + 0.11) * 1.15 + vec2(uTime * 0.0045, uTime * 0.0018);
        float n = fbm(uv);
        float c = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.33, n) * smoothstep(0.0, 0.16, h);
        float shade = fbm(uv * 1.9 + 4.0);
        vec3 cc = uCloudCol * (0.72 + 0.4 * shade) + uSunCol * pow(sd, 5.0) * 0.35 * vis;
        col = mix(col, cc, clamp(c, 0.0, 1.0) * 0.96);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

  function create(scene, renderer, Q) {
    const E = {
      time: 8 * 60, day: 1, weather: 'clear', target: { cloud: 0.25, rain: 0, fog: 0 },
      cloud: 0.25, rain: 0, fog: 0, wet: 0, night: 0, overcast: 0,
      sun: new THREE.Vector3(), moon: new THREE.Vector3(), nextChange: 8 * 60 + 180, lockWeather: null, timeScale: 15,
    };
    const uniforms = {
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uCloudCol: { value: new THREE.Color() },
      uCloud: { value: 0.3 }, uTime: { value: 0 }, uNight: { value: 0 }, uOvercast: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({ uniforms, vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat);
    envScene.add(envSky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null, envTimer = 0;

    const sunLight = new THREE.DirectionalLight(0xffffff, 3);
    sunLight.castShadow = !!Q.shadows;
    sunLight.shadow.mapSize.set(Q.shadowSize || 2048, Q.shadowSize || 2048);
    const SB = Q.shadowBox || 70;
    Object.assign(sunLight.shadow.camera, { left: -SB, right: SB, top: SB, bottom: -SB, near: 10, far: 900 });
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.05;
    scene.add(sunLight, sunLight.target);
    const hemi = new THREE.HemisphereLight(0xbcd5ea, 0x5a5a40, 0.8);
    scene.add(hemi);
    scene.fog = new THREE.Fog(0xbcd5ea, 200, Q.drawDist);

    // rain streaks around the camera
    const RN = Q.rainDrops || 2500, RB = 34;
    const rpos = new Float32Array(RN * 6);
    const rseed = new Float32Array(RN * 3);
    for (let i = 0; i < RN; i++) { rseed[i * 3] = (Math.random() - 0.5) * 2 * RB; rseed[i * 3 + 1] = Math.random() * 30; rseed[i * 3 + 2] = (Math.random() - 0.5) * 2 * RB; }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
    const rmat = new THREE.LineBasicMaterial({ color: 0xaab8c6, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const rain = new THREE.LineSegments(rgeo, rmat);
    rain.frustumCulled = false;
    scene.add(rain);

    const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
    const weathers = {
      clear: { cloud: 0.22, rain: 0, fog: 0 },
      cloudy: { cloud: 0.62, rain: 0, fog: 0 },
      rain: { cloud: 0.9, rain: 1, fog: 0.25 },
      fog: { cloud: 0.7, rain: 0, fog: 1 },
    };
    E.setWeather = (w, instant) => {
      E.weather = w;
      E.target = weathers[w];
      if (instant) { E.cloud = E.target.cloud; E.rain = E.target.rain; E.fog = E.target.fog; E.wet = E.rain; }
    };
    E.setWeather('clear', true);
    E.setTime = (mins) => { E.time = mins; envTimer = 99; };
    const _snap = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

    E.update = (dt, camera, focus, drawDist, mats) => {
      // clock
      E.time += dt * E.timeScale / 60;
      if (E.time >= 1440) { E.time -= 1440; E.day++; }
      const tAbs = E.day * 1440 + E.time;
      if (!E.lockWeather && tAbs > E.nextChange) {
        const r = Math.random();
        const cur = E.weather;
        const next = cur === 'rain' ? (r < 0.6 ? 'cloudy' : 'clear') : cur === 'fog' ? 'clear' : r < 0.42 ? 'clear' : r < 0.7 ? 'cloudy' : r < 0.9 ? 'rain' : 'fog';
        E.setWeather(next);
        E.nextChange = tAbs + 120 + Math.random() * 300;
      }
      if (E.lockWeather && E.weather !== E.lockWeather) E.setWeather(E.lockWeather);
      const k = 1 - Math.exp(-dt * 0.08);
      E.cloud += (E.target.cloud - E.cloud) * k;
      E.rain += (E.target.rain - E.rain) * k;
      E.fog += (E.target.fog - E.fog) * k;
      E.wet = E.rain > 0.3 ? Math.min(1, E.wet + dt * 0.03) : Math.max(0, E.wet - dt * 0.004);
      E.overcast = U.smoothstep(0.35, 0.85, E.cloud);

      // sun path: rises in the east (+x), crosses the south (+z), sets in the west
      // central-European summer: sunrise ~05:30, sunset ~20:30
      const hr = E.time / 60;
      const th = hr >= 5.5 && hr <= 20.5 ? ((hr - 5.5) / 15) * Math.PI : Math.PI + (((hr < 5.5 ? hr + 24 : hr) - 20.5) / 9) * Math.PI;
      E.sun.set(Math.cos(th), Math.sin(th) * 0.82, Math.sin(th) * 0.57).normalize();
      E.moon.set(-E.sun.x * 0.8, Math.abs(Math.sin(th)) * 0.6 + 0.2, -E.sun.z * 0.5 - 0.3).normalize();
      const el = E.sun.y;
      E.night = 1 - U.smoothstep(-0.12, 0.06, el);
      const sunset = U.smoothstep(0.35, 0.02, el) * (1 - U.smoothstep(0.02, -0.14, el));
      // sky palette
      const zen = uniforms.uZenith.value, hor = uniforms.uHorizon.value;
      zen.copy(PAL.dayZ).lerp(PAL.setZ, sunset).lerp(PAL.nightZ, E.night);
      hor.copy(PAL.dayH).lerp(PAL.setH, sunset).lerp(PAL.nightH, E.night);
      tmpC.copy(PAL.ovZ).lerp(PAL.ovNightZ, E.night); zen.lerp(tmpC, E.overcast * 0.85);
      tmpC.copy(PAL.ovH).lerp(PAL.ovNightH, E.night); hor.lerp(tmpC, E.overcast * 0.85);
      if (E.fog > 0.01) { tmpC.set(0xb4b8bb).lerp(PAL.ovNightH, E.night); hor.lerp(tmpC, E.fog * 0.8); zen.lerp(tmpC, E.fog * 0.6); }
      const sunCol = uniforms.uSunCol.value;
      sunCol.setRGB(1, 0.92, 0.8).lerp(tmpC2.setRGB(1, 0.5, 0.18), sunset);
      uniforms.uCloudCol.value.setRGB(0.95, 0.96, 0.98).lerp(tmpC.setRGB(0.42, 0.44, 0.47), E.overcast * 0.8).lerp(tmpC2.setRGB(0.03, 0.035, 0.05), E.night * 0.95).lerp(tmpC.setRGB(0.95, 0.6, 0.45), sunset * 0.45 * (1 - E.overcast));
      uniforms.uSun.value.copy(E.sun); uniforms.uMoon.value.copy(E.moon);
      uniforms.uCloud.value = E.cloud; uniforms.uNight.value = E.night; uniforms.uOvercast.value = E.overcast;
      uniforms.uTime.value += dt;
      sky.position.copy(camera.position);
      sky.scale.setScalar(camera.far * 0.9);

      // fog
      const ff = drawDist * (1 - 0.45 * E.rain) * (1 - 0.86 * E.fog);
      scene.fog.far = ff; scene.fog.near = ff * (0.08 + 0.1 * (1 - E.fog));
      // fog colour is applied after tone mapping, convert our linear horizon to display space
      scene.fog.color.copy(hor);

      // lights
      const dayAmt = U.smoothstep(-0.04, 0.22, el);
      const lightDir = dayAmt > 0.001 ? E.sun : E.moon;
      sunLight.color.copy(sunCol);
      if (dayAmt <= 0.001) sunLight.color.setRGB(0.6, 0.7, 0.95);
      sunLight.intensity = dayAmt > 0.001 ? 3.1 * dayAmt * (1 - 0.72 * E.overcast) : 0.12 * (1 - E.overcast * 0.8);
      hemi.color.copy(hor).lerp(tmpC.setRGB(0.6, 0.7, 0.85), 0.3);
      hemi.groundColor.setRGB(0.25, 0.24, 0.18).multiplyScalar(1 - E.night * 0.9);
      hemi.intensity = U.lerp(0.75, 0.13, E.night) * (1 + 0.25 * E.overcast);
      // shadow camera follows focus, snapped to texels to stop shimmering
      const SBX = sunLight.shadow.camera.right;
      const texel = (SBX * 2) / sunLight.shadow.mapSize.x;
      _r.crossVectors(_up, lightDir).normalize();
      _u.crossVectors(lightDir, _r).normalize();
      const pr = Math.round(focus.dot(_r) / texel) * texel, pu = Math.round(focus.dot(_u) / texel) * texel, pf = focus.dot(lightDir);
      _snap.copy(_r).multiplyScalar(pr).addScaledVector(_u, pu).addScaledVector(lightDir, pf);
      sunLight.target.position.copy(_snap);
      sunLight.position.copy(_snap).addScaledVector(lightDir, 400);
      sunLight.target.updateMatrixWorld();

      // materials reacting to wetness / night
      if (mats) {
        for (const m of mats.road) { m.roughness = U.lerp(0.9, 0.32, E.wet); m.color.setScalar(U.lerp(1, 0.62, E.wet)); }
        mats.terrain.color.setScalar(U.lerp(1, 0.82, E.wet));
        for (const m of mats.facades) m.emissiveIntensity = E.night * 1.4;
        mats.lamp.color.setScalar(U.lerp(0.55, 3.2, E.night));
        mats.pools.opacity = E.night * 0.85;
      }

      // rain
      rmat.opacity = 0.42 * E.rain;
      rain.visible = E.rain > 0.02;
      if (rain.visible) {
        const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
        const fall = uniforms.uTime.value * 13;
        for (let i = 0; i < RN; i++) {
          let y = (rseed[i * 3 + 1] - fall) % 30; if (y < 0) y += 30;
          const x = ((rseed[i * 3] - cx) % (RB * 2) + RB * 3) % (RB * 2) - RB + cx;
          const z = ((rseed[i * 3 + 2] - cz) % (RB * 2) + RB * 3) % (RB * 2) - RB + cz;
          const yy = cy - 12 + y;
          const o = i * 6;
          rpos[o] = x; rpos[o + 1] = yy; rpos[o + 2] = z;
          rpos[o + 3] = x + 0.12; rpos[o + 4] = yy - 0.75; rpos[o + 5] = z + 0.05;
        }
        rgeo.attributes.position.needsUpdate = true;
      }

      // environment map for reflections (refresh every few seconds)
      envTimer += dt;
      if (envTimer > 3) {
        envTimer = 0;
        const old = envRT;
        envRT = pmrem.fromScene(envScene, 0.04, 0.1, 1000);
        scene.environment = envRT.texture;
        if (old) old.dispose();
      }
    };
    E.forceEnv = () => { envTimer = 99; };
    E.sunLight = sunLight;
    E.hemi = hemi;
    return E;
  }
  return { create };
})();
