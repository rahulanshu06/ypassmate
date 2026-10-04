import * as THREE from 'three';
import { Renderer } from './render/Renderer.js';
import { Atmosphere } from './render/Atmosphere.js';
import { configureTextures } from './render/TextureGen.js';
import { setTrainTextureAniso } from './render/TrainTextures.js';
import { materials } from './render/Materials.js';
import { World } from './world/World.js';
import { SignalVisuals } from './render/SignalVisuals.js';
import { TrainRenderer } from './render/TrainRenderer.js';
import { CabView, CAB } from './render/CabView.js';
import { CameraRig, CAMERA_MODES } from './render/CameraRig.js';
import { WeatherFX } from './render/WeatherFX.js';
import { Crowd } from './render/People.js';
import { RoadTraffic } from './render/Vehicles.js';
import { WIND } from './render/Flora.js';
import { sharedClock } from './world/StationBuilder.js';
import { ROUTES } from './data/routes/index.js';
import { CAB_THEMES } from './data/locomotives.js';
import { Journey } from './sim/Journey.js';
import { PlayerControls } from './sim/PlayerControls.js';
import { AutoPilot } from './sim/AutoPilot.js';
import { audio } from './audio/AudioEngine.js';
import { TrainAudio } from './audio/TrainAudio.js';
import { Announcer } from './audio/Announcer.js';
import { UIManager } from './ui/UIManager.js';
import { Menus } from './ui/Menus.js';
import { settingsScreen } from './ui/SettingsScreen.js';
import { briefingScreen, pauseScreen, resultsScreen, controlsHelp } from './ui/Screens.js';
import { HUD } from './ui/HUD.js';
import { Tutorial } from './ui/Tutorial.js';
import { TouchControls } from './ui/TouchControls.js';
import { PhotoMode } from './ui/PhotoMode.js';
import { input } from './core/Input.js';
import { settings, QUALITY_PRESETS } from './core/Settings.js';
import { profile } from './core/Profile.js';
import { bus } from './core/EventBus.js';
import { clamp, smoothstep, lerp } from './core/MathUtil.js';
import { t } from './core/I18n.js';

const NON_DRIVING = new Set(['camera', 'cam1', 'cam2', 'cam3', 'cam4', 'cam5', 'cam6', 'cam7', 'cam8', 'cam9', 'pause', 'hud', 'monitor', 'help', 'photo']);

export class Game {
  constructor(app, uiRoot) {
    this.app = app;
    this.uiRoot = uiRoot;
    this.state = 'boot';
    this.journey = null;
    this.timeScale = 1;
    this.fpsAvg = 60;
    this.frameTimes = [];
    this.lastFrame = performance.now();
    this.dynTimer = 0;
  }

  // ------------------------------------------------------------------ boot
  async boot(progress) {
    progress(0.05, 'Starting renderer…');
    this.autoDetect();
    this.renderer = new Renderer(this.app);
    configureTextures({ anisotropy: Math.min(8, this.renderer.maxAnisotropy), quality: settings.get('textureQuality') });
    setTrainTextureAniso(Math.min(8, this.renderer.maxAnisotropy));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.get('fov') || 62, innerWidth / innerHeight, 0.05, 14000);
    this.renderer.setup(this.scene, this.camera);
    this.atmo = new Atmosphere(this.scene, this.renderer.renderer);
    this.atmo.setShadowQuality(settings.get('shadows'));
    this.atmo.lightningCallback = (e) => this.trainAudio && this.trainAudio.thunder(e.strength, e.distance);
    await tick();
    progress(0.15, 'Surveying the route…');
    this.world = new World(this.scene, ROUTES.ivr);
    this.world.setViewDistance(settings.get('viewDistance'));
    this.world.terrain.setQuality(settings.get('preset') === 'auto' ? settings.get('resolvedPreset') : settings.get('preset'));
    await tick();
    progress(0.25, 'Erecting signals…');
    this.signalVisuals = new SignalVisuals(this.scene, this.world);
    this.trainRenderer = new TrainRenderer(this.scene, this.world, this.camera);
    this.cab = new CabView(CAB_THEMES[profile.data.customization.cabTheme] || CAB_THEMES.standard);
    this.camRig = new CameraRig(this.camera, this.renderer.canvas, this.world.sampler);
    this.camRig.pointerOverControl = (e) => !!this.cabHit(e);
    this.weatherFX = new WeatherFX(this.scene, settings.get('weatherQuality'));
    this.crowd = new Crowd(this.scene);
    this.traffic = new RoadTraffic(this.scene, this.world);
    this.buildLights();
    this.trainAudio = new TrainAudio();
    this.announcer = new Announcer();
    // UI
    this.ui = new UIManager(this.uiRoot);
    this.menus = new Menus(this.ui, this);
    input.attach();
    this.bindCabMouse();
    this.bindEvents();
    await tick();
    progress(0.35, 'Laying track…');
    // attract journey to build the world around the start
    this.startAttract(true);
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      this.world.update(this.camera, true);
      progress(0.35 + (0.55 * (i + 1)) / steps, ['Shaping terrain…', 'Planting trees…', 'Building stations…', 'Stringing the overhead line…', 'Calling the station master…', 'Almost ready…'][i]);
      await tick();
    }
    this.updateVisuals(0.016);
    this.renderer.render();
    progress(1, 'Ready');
    this.state = 'menu';
    this.ui.show(this.menus.main());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    window.__game = this;
    this.autopilotClass = AutoPilot;
  }

  autoDetect() {
    if (settings.get('resolvedPreset')) {
      if (settings.get('preset') === 'auto') settings.applyPreset('auto');
      return;
    }
    let preset = 'medium';
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const name = gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : '';
      const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
      const cores = navigator.hardwareConcurrency || 4;
      const mem = navigator.deviceMemory || 4;
      if (/SwiftShader|llvmpipe|Software/i.test(name)) preset = 'low';
      else if (mobile || mem <= 2) preset = 'low';
      else if (/RTX|Radeon RX [6-9]|RX 7|Apple M[1-9] (Pro|Max|Ultra)|Arc A7/i.test(name) && cores >= 8) preset = 'high';
      else if (/Intel|UHD|Iris|Mali|Adreno|PowerVR/i.test(name)) preset = cores >= 8 ? 'medium' : 'low';
      else if (/NVIDIA|GeForce|Radeon|Apple/i.test(name)) preset = 'medium';
    } catch {
      preset = 'medium';
    }
    settings.data.resolvedPreset = preset;
    settings.applyPreset('auto');
  }

  runBenchmark() {
    this.benchmark = { t: 0, frames: 0 };
    this.ui.toast('Measuring performance for 5 seconds…', 3000);
  }

  buildLights() {
    // player headlight (always present; intensity 0 when off keeps shader light counts stable)
    this.headlight = new THREE.SpotLight(0xfff2dc, 0, 650, 0.15, 0.55, 1.2);
    this.headlight.castShadow = false;
    this.scene.add(this.headlight, this.headlight.target);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = uI * pow(vY, 2.2) * edge * 0.22; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const beamGeo = new THREE.CylinderGeometry(0.3, 9, 110, 24, 1, true);
    beamGeo.translate(0, -55, 0);
    beamGeo.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 15;
    this.beam.visible = false;
    this.scene.add(this.beam);
    // pooled lamp lights near the camera at night
    this.lampLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffe2b0, 0, 26, 1.8);
      this.scene.add(l);
      this.lampLights.push(l);
    }
  }

  // ------------------------------------------------------------------ journeys
  createJourney(config) {
    if (this.journey) this.disposeJourney();
    this.journey = new Journey(this.world, config);
    this.signalsBind();
    this.controls = new PlayerControls(this.journey);
    this.journeyConfig = config;
    this.crowd.clear();
    const lc = this.journey;
    if (lc.world.def.tsr) for (const tsr of lc.world.def.tsr) if (tsr.workers) this.crowd.addWorkers(this.world, tsr.s0, tsr.s1, -1);
    return this.journey;
  }

  signalsBind() {
    this.journey.signals.visuals = this.signalVisuals;
    this.journey.signals.forceUpdate();
  }

  disposeJourney() {
    if (!this.journey) return;
    this.journey.dispose();
    this.journey = null;
    this.autopilot = null;
    if (this.tutorial) {
      this.tutorial.dispose();
      this.tutorial = null;
    }
    if (this.cab.group.parent) this.cab.group.parent.remove(this.cab.group);
    for (const id of [...this.trainRenderer.locos.keys()]) this.trainRenderer.removeLoco(id);
    this.crowd.clear();
    this.crowd.workers = [];
    this.announcer.stop();
  }

  startAttract(initial = false) {
    this.state = 'menu';
    const cfg = { trainId: 'EXP18', from: 'IPT', to: 'VNJ', startHours: 17.15, weather: 'clear', difficulty: 'easy', traffic: 0.7, randomEvents: false, attract: true };
    this.createJourney(cfg);
    const j = this.journey;
    j.clock = j.departure - 0.004;
    j.start();
    this.autopilot = new AutoPilot(j);
    this.camRig.setMode('trackside');
    this.camRig.blend = 1;
    this.attractTimer = 0;
    this.attractShot = 0;
    if (!initial && this.hud) {
      this.hud.detach();
      this.hud = null;
    }
  }

  openBriefing(config) {
    audio.unlock();
    this.ui.hideScreens();
    if (this.hud) {
      this.hud.detach();
      this.hud = null;
    }
    this.createJourney({ ...config, livery: config.livery || profile.data.customization.livery });
    this.state = 'briefing';
    this.camRig.setMode('orbit');
    this.camRig.orbit = { yaw: 2.1, pitch: 0.12, dist: 34 };
    this.camRig.blend = 1;
    this.ui.show(briefingScreen(this.ui, this, this.journey));
  }

  beginJourney() {
    this.ui.hideScreens();
    const j = this.journey;
    this.state = 'driving';
    this.hud = new HUD(this.ui, this);
    this.hud.attach();
    if (TouchControls.wanted()) {
      this.touch = new TouchControls(this.ui);
      this.touch.attach();
    }
    this.camRig.setMode('cab');
    this.camRig.blend = 1;
    const night = this.atmo.sunElevation < 2;
    if (night) j.player.headlight = 2;
    else j.player.headlight = j.difficulty.autoStart ? 1 : 0;
    if (j.weather.rain > 0.2) j.player.wiper = 1;
    j.start();
    if (j.config.tutorial) {
      this.tutorial = new Tutorial(this.ui, j);
      this.tutorial.attach();
      j.player.headlight = 0;
    }
    this.hud.message(t('menu.start') + ': ' + (j.config.title || j.trainDef.name.en), 'good');
    this.hud.message(`Departure ${new Date(0, 0, 0, 0, Math.round(j.departure * 60)).toTimeString().slice(0, 5)} from platform ${j.player.startPf}. Wait for the guard’s right away.`, 'info');
  }

  pause() {
    if (this.state !== 'driving') return;
    this.state = 'paused';
    this.ui.show(pauseScreen(this.ui, this));
    audio.setMuted(true);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ui.hideScreens();
    this.state = 'driving';
    audio.setMuted(false);
  }

  restartJourney() {
    const cfg = this.journeyConfig;
    audio.setMuted(false);
    this.closeTouch();
    this.openBriefing(cfg);
  }

  quitToMenu() {
    audio.setMuted(false);
    this.closeTouch();
    if (this.photo) this.closePhotoMode(true);
    this.ui.hideScreens();
    this.disposeJourney();
    this.startAttract();
    this.ui.show(this.menus.main());
  }

  closeTouch() {
    if (this.touch) {
      this.touch.detach();
      this.touch = null;
    }
  }

  settingsScreen(inGame = false) {
    return settingsScreen(this.ui, this, { inGame, onBack: () => this.ui.back() || this.ui.show(this.menus.main()) });
  }

  openPhotoMode() {
    if (!this.journey) return;
    this.ui.hideScreens();
    this.prevState = this.state === 'paused' ? 'driving' : this.state;
    this.state = 'photo';
    audio.setMuted(false);
    this.camRig.setMode('free');
    this.photo = new PhotoMode(this.ui, this);
    this.photo.attach();
  }

  closePhotoMode(silent = false) {
    if (!this.photo) return;
    this.photo.detach();
    this.photo = null;
    this.camRig.fov = settings.get('fov') || 62;
    this.state = this.prevState || 'driving';
    this.camRig.setMode('cab');
    if (!silent && this.state === 'driving') this.pause();
  }

  onJourneyEnd(result) {
    if (!this.journey || this.journeyConfig.attract) {
      if (this.journeyConfig && this.journeyConfig.attract) setTimeout(() => this.state === 'menu' && this.startAttract(), 3000);
      return;
    }
    setTimeout(() => {
      this.state = 'results';
      if (this.hud) this.hud.el.classList.add('hidden');
      this.closeTouch();
      const before = profile.level;
      profile.recordJourney(result);
      const xpInfo = profile.addXp(result.xp);
      profile.addReputation(result.completed ? (result.total - 60) / 10 : -6);
      if (result.config.tutorial && result.completed) {
        profile.data.tutorialDone = true;
        profile.save();
      }
      void before;
      this.ui.show(resultsScreen(this.ui, this, result, xpInfo));
      this.camRig.setMode('orbit');
    }, 1200);
  }

  bindEvents() {
    bus.on('journey:end', (r) => this.onJourneyEnd(r));
    bus.on('profile:levelup', ({ level }) => this.ui.toast(`★ Promoted to level ${level}!`, 4000));
    bus.on('settings:changed', ({ key }) => this.applySetting(key));
    bus.on('profile:customization', ({ key, value }) => {
      if (key === 'cabTheme') {
        const parent = this.cab.group.parent;
        if (parent) parent.remove(this.cab.group);
        this.cab = new CabView(CAB_THEMES[value] || CAB_THEMES.standard);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'driving') this.pause();
    });
    window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
    window.addEventListener('keydown', () => audio.unlock());
  }

  applySetting(key) {
    const all = key === '*' || key === 'preset';
    if (all || key === 'shadows') this.atmo.setShadowQuality(settings.get('shadows'));
    if (all || key === 'viewDistance') this.world.setViewDistance(settings.get('viewDistance'));
    if (all || key === 'weatherQuality') this.weatherFX.build(settings.get('weatherQuality'));
    if (all || key === 'fov') this.camRig.fov = settings.get('fov');
    if (all || key === 'textureQuality') configureTextures({ anisotropy: Math.min(8, this.renderer.maxAnisotropy), quality: settings.get('textureQuality') });
    if (all) this.world.terrain.setQuality(settings.get('preset') === 'auto' ? settings.get('resolvedPreset') : settings.get('preset'));
    if (all || key === 'reflections') this.reflectionsOff = settings.get('reflections') === 'off';
  }

  // ------------------------------------------------------------------ cab mouse interaction
  cabHit(e) {
    if (!this.journey || this.state !== 'driving' || this.camRig.mode !== 'cab') return null;
    const r = this.renderer.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster = this.raycaster || new THREE.Raycaster();
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.far = 3;
    const hits = this.raycaster.intersectObjects(this.cab.controls, false);
    return hits.length ? hits[0].object.userData : null;
  }

  bindCabMouse() {
    const el = this.renderer.canvas;
    let drag = null;
    el.addEventListener('pointermove', (e) => {
      if (drag) {
        const dy = (drag.y - e.clientY) / 120;
        const c = this.controls;
        if (!c) return;
        if (drag.id === 'mc') c.setNotch(Math.round(clamp(drag.start + dy * 6, -8, 10)));
        if (drag.id === 'a9') c.setA9(clamp(drag.start + dy * 0.8, 0, 1));
        if (drag.id === 'sa9') c.setSA9(clamp(drag.start + dy * 0.8, 0, 1));
        return;
      }
      const hit = this.cabHit(e);
      this.cab.highlight(hit ? hit.control : null);
      this.ui.showTooltip(hit ? hit.tip : null, e.clientX, e.clientY);
      el.style.cursor = hit ? 'pointer' : '';
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const hit = this.cabHit(e);
      if (!hit || !this.controls) return;
      const c = this.controls;
      const p = this.journey.player;
      audio.click();
      switch (hit.control) {
        case 'mc': drag = { id: 'mc', y: e.clientY, start: p.traction.notch }; break;
        case 'a9': drag = { id: 'a9', y: e.clientY, start: p.brakes.a9 }; if (p.brakes.emergency) c.releaseTrainBrake(1); break;
        case 'sa9': drag = { id: 'sa9', y: e.clientY, start: p.brakes.sa9 }; break;
        case 'reverser': c.reverser((p.traction.reverser === 0 ? 1 : 0) - p.traction.reverser); break;
        case 'horn': c.cabHorn = true; drag = { id: 'horn' }; break;
        case 'sander': c.cabSander = true; drag = { id: 'sander' }; break;
        case 'emergency': c.emergency(); break;
        case 'vcd': c.toggle('vcd'); break;
        default: c.toggle(hit.control); break;
      }
      if (drag) el.setPointerCapture(e.pointerId);
    });
    const end = () => {
      if (drag && this.controls) {
        if (drag.id === 'horn') this.controls.cabHorn = false;
        if (drag.id === 'sander') this.controls.cabSander = false;
      }
      drag = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------------------------ main loop
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (!(dt > 0)) dt = 0.016;
    this.perf(Math.min(dt, 1)); // real frame time for the FPS meter / dynamic resolution
    dt = Math.min(dt, 0.1);
    input.pollGamepad();
    this.handleInput(dt);
    const j = this.journey;
    if (j) {
      const running = this.state === 'driving' || this.state === 'menu' || this.state === 'results';
      if (running) {
        let simDt = dt * this.timeScale;
        while (simDt > 1e-6) {
          const h = Math.min(0.1, simDt);
          if (this.autopilot) this.autopilot.update();
          j.update(h);
          simDt -= h;
        }
      }
    }
    this.updateVisuals(dt);
    this.renderer.render();
  }

  handleInput(dt) {
    const j = this.journey;
    if (this.state === 'driving' && j && this.controls) {
      const blocked = this.camRig.capturesWASD ? new Set(['throttleUp', 'throttleDown', 'brakeApply', 'brakeRelease', 'reverserFwd', 'reverserBack', 'vcdAck']) : null;
      const rest = this.controls.update(dt, input, blocked);
      for (const a of rest) this.gameAction(a);
      if (this.touch) this.touch.sync(j.player);
    } else {
      for (const a of input.takePresses()) {
        if (this.state === 'photo') {
          if (a === 'pause' || a === 'photo') this.closePhotoMode();
        } else if (a === 'pause') {
          if (this.ui.stack.length) this.ui.back();
          else if (this.state === 'paused') this.resume();
        }
      }
    }
  }

  gameAction(a) {
    if (a === 'camera') return this.camRig.cycle(1);
    if (a.startsWith('cam')) {
      const i = +a.slice(3) - 1;
      if (CAMERA_MODES[i]) {
        this.camRig.setMode(CAMERA_MODES[i].id);
        this.ui.toast(CAMERA_MODES[i].name, 1200);
      }
      return;
    }
    if (a === 'pause') return this.pause();
    if (a === 'hud') return this.hud && this.hud.toggle();
    if (a === 'monitor') return this.hud && this.hud.toggleMonitor();
    if (a === 'help') {
      this.pause();
      this.ui.show(controlsHelp(this.ui), { push: true });
      return;
    }
    if (a === 'photo') return this.openPhotoMode();
  }

  perf(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fpsAvg = 1 / avg;
    if (settings.get('dynamicResolution') && (this.state === 'driving' || this.state === 'menu')) {
      this.dynTimer += dt;
      if (this.dynTimer > 1.5) {
        this.dynTimer = 0;
        const s = this.renderer.dynamicScale;
        if (this.fpsAvg < 45 && s > 0.6) this.renderer.setDynamicScale(Math.max(0.6, s - 0.1));
        else if (this.fpsAvg > 58 && s < 1) this.renderer.setDynamicScale(Math.min(1, s + 0.05));
      }
    }
    if (this.benchmark) {
      this.benchmark.t += dt;
      this.benchmark.frames++;
      if (this.benchmark.t > 5) {
        const fps = this.benchmark.frames / this.benchmark.t;
        const order = ['low', 'medium', 'high', 'ultra'];
        let cur = settings.get('resolvedPreset') || 'medium';
        let idx = order.indexOf(cur);
        if (fps < 40 && idx > 0) idx--;
        else if (fps > 58 && idx < 3 && this.renderer.dynamicScale >= 1) idx++;
        settings.data.resolvedPreset = order[idx];
        settings.applyPreset('auto');
        this.ui.toast(`Measured ${fps.toFixed(0)} fps — recommended preset: ${order[idx].toUpperCase()}`, 4500);
        this.benchmark = null;
      }
    }
  }

  // ------------------------------------------------------------------ visuals
  updateVisuals(dt) {
    const j = this.journey;
    if (!j) return;
    const p = j.player;
    const time = performance.now() / 1000;
    // attract-mode camera director
    if (this.state === 'menu' || this.state === 'results') {
      this.attractTimer = (this.attractTimer || 0) + dt;
      if (this.state === 'menu' && this.attractTimer > 16) {
        this.attractTimer = 0;
        this.attractShot = ((this.attractShot || 0) + 1) % 4;
        const shot = ['trackside', 'orbit', 'chase', 'trackside'][this.attractShot];
        this.camRig.setMode(shot);
        if (shot === 'orbit') this.camRig.orbit = { yaw: Math.random() * 6, pitch: 0.15 + Math.random() * 0.2, dist: 30 + Math.random() * 30 };
      }
      if (this.camRig.mode === 'orbit') this.camRig.orbit.yaw += dt * 0.08;
    }
    if (this.state === 'briefing') this.camRig.orbit.yaw += dt * 0.05;
    // atmosphere
    this.atmo.setWeather(j.weather);
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const focus = this.camera.position.clone().addScaledVector(fwd, this.camRig.mode === 'cab' ? 45 : 25);
    this.atmo.update(dt, j.clock, this.camera, focus, time);
    j.isNight = this.atmo.sunElevation < -3;
    const night = 1 - smoothstep(-8, 2, this.atmo.sunElevation);
    materials.setWetness(j.wetness);
    materials.setNight(night);
    this.trainRenderer.setNight(night);
    this.signalVisuals.setNight(night, j.weather.fog);
    if (this.reflectionsOff) this.scene.environment = null;
    WIND.time.value = time;
    WIND.strength.value = 0.15 + j.weather.wind * 0.8;
    if (sharedClock.face) sharedClock.face.draw(j.clock);
    // world streaming
    this.world.update(this.camera);
    if (this.world.water && this.world.water.userData.update) this.world.water.userData.update(time);
    for (const lc of this.world.levelCrossings) if (lc.handle) lc.handle.update(dt, lc.closed);
    // trains
    this.trainRenderer.sync(j.trains, this.camera, {});
    const ph = this.trainRenderer.playerLoco;
    if (ph && this.cab.group.parent !== ph.group) ph.group.add(this.cab.group);
    this.cab.group.visible = (this.camRig.mode === 'cab' || this.camRig.mode === 'headout') && this.state !== 'menu';
    // camera
    this.camRig.enabled = this.state !== 'menu';
    this.camRig.update(dt, { train: p, renderer: this.trainRenderer, input, world: this.world });
    const inCab = this.camRig.mode === 'cab';
    // cab interior & instruments
    if (this.cab.group.visible) {
      const tr = p.traction, br = p.brakes;
      this.cab.update(dt, p, {
        night, rain: j.weather.rain, inTunnel: this.world.network.insideTunnel(p.s),
        instruments: {
          mr: br.mr, fp: Math.min(6, br.mr - 0.2), bp: br.bpFront, bc: br.bcAvg, bcLoco: br.bcLoco, speed: Math.abs(p.v) * 3.6, limit: p.currentLimit().kmh,
          te: tr.te, notch: tr.notch, reverser: tr.reverser, voltage: tr.voltage, current: tr.current, panto: tr.panto, vcb: tr.vcb,
          kwh: tr.energyUsed / 3.6e6, regen: tr.energyRegen / 3.6e6, locoName: 'EP60 30417', night,
          slip: tr.slipActive, vcdAlarm: j.safety.vcdAlarm > 0 || j.safety.vcdPenalty, compressor: br.compressorOn, atp: j.safety.atpActive,
          emergency: br.emergency, sanding: p.sander, wsp: p.wsp,
          message: !tr.powered ? (tr.panto < 0.98 ? 'PANTO LOWERED' : 'VCB OPEN') : tr.slipActive ? 'WHEEL SLIP' : br.mr < 5 ? 'LOW MR PRESSURE' : j.safety.vcdAlarm > 0 ? 'VIGILANCE' : '',
        },
      });
    }
    // headlight
    if (ph) {
      const m = ph.group.matrix;
      const hlOn = p.headlight;
      const L = ph.length;
      this.headlight.position.set(0, 4.0, L / 2 + 0.3).applyMatrix4(m);
      this.headlight.target.position.set(0, 0.5, L / 2 + 90).applyMatrix4(m);
      this.headlight.target.updateMatrixWorld();
      const nightK = clamp(night * 1.2 + (j.weather.fog > 0.004 ? 0.4 : 0), 0, 1);
      this.headlight.intensity = hlOn ? (hlOn === 2 ? 2600 : 650) * nightK : 0;
      this.beam.visible = !!hlOn && nightK > 0.1 && !inCab;
      if (this.beam.visible) {
        this.beam.position.copy(this.headlight.position);
        this.beam.lookAt(this.headlight.target.position);
        this.beam.material.uniforms.uI.value = (hlOn === 2 ? 1 : 0.4) * nightK * (0.35 + Math.min(1, j.weather.fog * 150 + j.weather.rain));
      }
    }
    // station lamps → pooled point lights
    this.updateLampLights(night);
    // crowd at the nearest built station
    this.updateCrowd(dt, p, night);
    this.traffic.update(dt, this.camera, j.events.obstacles);
    // weather particles
    const camVel = new THREE.Vector3();
    if (this.prevCam) camVel.subVectors(this.camera.position, this.prevCam).divideScalar(Math.max(dt, 1e-3));
    this.prevCam = (this.prevCam || new THREE.Vector3()).copy(this.camera.position);
    const camS = this.world.camS;
    const camInTunnel = this.world.network.insideTunnel(camS) && this.world.cameraChainage(this.camera.position).dist < 7;
    this.weatherFX.update(dt, this.camera, j.weather, camVel.clampLength(0, 60), { inTunnel: camInTunnel, daylight: this.atmo.daylight, insideCab: inCab });
    this.renderer.setGrade({
      flash: this.atmo.flash * 0.35, heat: j.weather.heat ? j.weather.heat * (1 - night) : 0, time,
      saturation: lerp(1.05, 0.82, clamp(j.weather.cloud * 0.6 + j.weather.rain * 0.4, 0, 1)),
    });
    this.renderer.setBloom(0.28 + night * 0.5 + j.weather.fog * 20);
    // audio
    if (audio.ready) this.updateAudio(dt, j, p, inCab, camInTunnel);
    // HUD & tutorial
    if (this.hud && (this.state === 'driving' || this.state === 'photo')) {
      const info = this.renderer.renderer.info.render;
      this.hud.update(dt, j, { fps: this.fpsAvg, calls: info.calls, tris: info.triangles, scale: this.renderer.dynamicScale, photo: this.state === 'photo' });
    }
    if (this.tutorial) this.tutorial.update();
  }

  updateLampLights(night) {
    if (night < 0.05) {
      for (const l of this.lampLights) l.intensity = 0;
      return;
    }
    const cam = this.camera.position;
    const cands = [];
    for (const g of this.world.stationObjects.values()) {
      for (const l of g.userData.lamps) {
        const d = l.pos.distanceToSquared(cam);
        if (d < 160 * 160) cands.push([d, l]);
      }
    }
    cands.sort((a, b) => a[0] - b[0]);
    this.lampLights.forEach((light, i) => {
      const c = cands[i * 3] || cands[i];
      if (c) {
        light.position.copy(c[1].pos);
        light.position.y -= 0.3;
        light.color.setHex(c[1].color || 0xffe2b0);
        light.intensity = 26 * night;
      } else light.intensity = 0;
    });
  }

  updateCrowd(dt, p, night) {
    const cam = this.camera.position;
    let nearest = null, best = Infinity;
    for (const g of this.world.stationObjects.values()) {
      const d = g.userData.origin.distanceTo(cam);
      if (d < best) {
        best = d;
        nearest = g;
      }
    }
    if (nearest && best < 1300) {
      if (this.crowd.station !== nearest.userData.station) this.crowd.populate(nearest, this.world);
    } else if (this.crowd.station) this.crowd.clear();
    this.crowd.update(dt, { camera: this.camera, player: p, world: this.world, night });
  }

  updateAudio(dt, j, p, inCab, inTunnel) {
    const cam = this.camera.position;
    const lp = this.trainRenderer.playerLoco;
    let nearLoco = 1, nearTrain = 1;
    if (lp) {
      const pos = new THREE.Vector3().setFromMatrixPosition(lp.group.matrix);
      const d = pos.distanceTo(cam);
      nearLoco = inCab ? 1 : clamp(1.4 - d / 120, 0, 1);
      nearTrain = inCab ? 1 : clamp(1.3 - Math.max(0, d - p.length * 0.5) / 160, 0, 1);
    }
    audio.setInterior(inCab, inTunnel);
    // AI trains near the listener
    let aiNear = 0, aiSpeed = 0, aiHornDist = 99999, aiDoppler = 1;
    for (const t of j.trains) {
      if (t.isPlayer || !t.active) continue;
      const g = this.world.geo.sample(t.s - t.dir * t.length * 0.3);
      const d = Math.hypot(g.x - cam.x, g.z - cam.z);
      const k = clamp(1 - d / 450, 0, 1) * clamp(Math.abs(t.v) / 15, 0, 1);
      if (k > aiNear) {
        aiNear = k;
        aiSpeed = Math.abs(t.v) * 3.6;
      }
      const gl = this.world.geo.sample(t.s);
      const dh = Math.hypot(gl.x - cam.x, gl.z - cam.z);
      if (dh < aiHornDist) {
        aiHornDist = dh;
        // doppler: approaching raises pitch
        const toCam = new THREE.Vector3(cam.x - gl.x, 0, cam.z - gl.z).normalize();
        const vel = new THREE.Vector3(gl.tx * t.dir * t.v, 0, gl.tz * t.dir * t.v);
        aiDoppler = clamp(343 / (343 - vel.dot(toCam)), 0.85, 1.18);
      }
    }
    let lcBell = 0;
    for (const lc of this.world.levelCrossings) {
      if (!lc.closed || !lc.handle) continue;
      const o = lc.handle.origin;
      lcBell = Math.max(lcBell, clamp(1 - Math.hypot(o.x - cam.x, o.z - cam.z) / 600, 0, 1));
    }
    let crowd = 0;
    if (this.crowd.station) {
      const st = this.crowd.station;
      const g = this.world.geo.sample((st.platformS0 + st.platformS1) / 2);
      crowd = clamp(1 - Math.hypot(g.x - cam.x, g.z - cam.z) / 450, 0, 1) * (st.size === 'small' ? 0.5 : 1);
    }
    const nearStation = j.network.stations.some((st) => p.s > st.limits[1].first - 50 && p.s < st.limits[1].last + 50);
    this.announcer.audible = clamp(crowd * 1.4, 0.15, 1);
    this.trainAudio.update(dt, {
      player: p, inCab, inTunnel, listenerNearLoco: nearLoco, listenerNearTrain: nearTrain, curvature: this.world.geo.curvatureAt(p.s),
      rain: j.weather.rain, crowd, lcBell, vcdAlarm: j.safety.vcdAlarm > 0 && !j.safety.vcdPenalty, aiNear, aiSpeed, aiHornDist, aiDoppler,
      nearStation, listenerOffset: inCab ? 2 : p.length / 2, cameraMoving: true,
    });
  }
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}
void QUALITY_PRESETS;
void CAB;
