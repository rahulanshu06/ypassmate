import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { settings } from '../core/Settings.js';
import { bus } from '../core/EventBus.js';

// Final grading pass: vignette, gentle contrast, lightning flash, heat shimmer, film grain.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uFlash: { value: 0 },
    uHeat: { value: 0 },
    uGrain: { value: 0.025 },
    uSat: { value: 1.0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uFlash, uHeat, uGrain, uSat; uniform vec3 uTint;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uHeat > 0.0) {
        float band = smoothstep(0.62, 0.45, uv.y) * smoothstep(0.25, 0.45, uv.y);
        uv.x += sin(uv.y * 160.0 + uTime * 6.0) * 0.0012 * uHeat * band;
        uv.y += cos(uv.x * 120.0 + uTime * 4.0) * 0.0008 * uHeat * band;
      }
      vec4 c = texture2D(tDiffuse, uv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat) * uTint;
      c.rgb += uFlash * vec3(0.75, 0.8, 1.0) * (0.35 + l);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * dot(d, d) * 1.6;
      c.rgb += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
};

export class Renderer {
  constructor(container) {
    this.container = container;
    const aa = settings.get('antialias');
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'gl';
    container.prepend(this.canvas);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        preserveDrawingBuffer: false,
      });
    } catch (err) {
      throw new Error('WebGL could not be started: ' + err.message);
    }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.info.autoReset = false;
    this.msaa = aa === 'msaa4' ? 4 : aa === 'msaa2' ? 2 : 0;
    this.scale = 1;
    this.dynamicScale = 1;
    this.composer = null;
    this.usePost = true;
    this.photoDof = null;
    this.size = new THREE.Vector2();
    this.gl = renderer.getContext();
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    this.gpuName = this.detectGpu();
    window.addEventListener('resize', () => this.resize());
    bus.on('settings:changed', ({ key }) => {
      if (['renderScale', 'maxPixelRatio', 'effects', 'preset', '*'].includes(key)) this.configure();
    });
  }

  detectGpu() {
    try {
      const gl = this.gl;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch {
      return 'unknown';
    }
  }

  setup(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.configure();
  }

  configure() {
    if (!this.scene) return;
    const effects = settings.get('effects');
    this.usePost = effects !== 'low' || this.msaa > 0;
    const r = this.renderer;
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (this.usePost) {
      const rt = new THREE.WebGLRenderTarget(16, 16, {
        type: THREE.HalfFloatType,
        samples: this.msaa,
      });
      const composer = new EffectComposer(r, rt);
      this.renderPass = new RenderPass(this.scene, this.camera);
      composer.addPass(this.renderPass);
      this.bloom = null;
      if (effects !== 'low') {
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.55, 0.92);
        composer.addPass(this.bloom);
      }
      this.dof = new BokehPass(this.scene, this.camera, { focus: 30, aperture: 0.0004, maxblur: 0.008 });
      this.dof.enabled = false;
      composer.addPass(this.dof);
      this.output = new OutputPass();
      composer.addPass(this.output);
      this.grade = new ShaderPass(GradeShader);
      this.grade.uniforms.uGrain.value = effects === 'high' ? 0.022 : 0.0;
      composer.addPass(this.grade);
      this.composer = composer;
    }
    this.resize();
  }

  get pixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, settings.get('maxPixelRatio') || 1);
    return Math.max(0.35, dpr * (settings.get('renderScale') || 1) * this.dynamicScale);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const pr = this.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      if (this.bloom) this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    }
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.size.set(w, h);
  }

  setCamera(camera) {
    this.camera = camera;
    if (this.renderPass) this.renderPass.camera = camera;
    if (this.dof) this.dof.camera = camera;
  }

  setDynamicScale(s) {
    if (Math.abs(s - this.dynamicScale) < 0.02) return;
    this.dynamicScale = s;
    this.resize();
  }

  setGrade({ flash = 0, heat = 0, time = 0, saturation = 1, tint } = {}) {
    if (!this.grade) return;
    const u = this.grade.uniforms;
    u.uFlash.value = flash;
    u.uHeat.value = heat;
    u.uTime.value = time;
    u.uSat.value = saturation;
    if (tint) u.uTint.value.copy(tint);
  }

  setBloom(strength) {
    if (this.bloom) this.bloom.strength = strength;
  }

  setDof(enabled, focus = 30, aperture = 0.0004) {
    if (!this.dof) return;
    this.dof.enabled = enabled;
    this.dof.uniforms.focus.value = focus;
    this.dof.uniforms.aperture.value = aperture;
  }

  render() {
    this.renderer.info.reset();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
