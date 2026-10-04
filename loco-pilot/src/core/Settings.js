import { Storage, mergeDefaults } from './Storage.js';
import { bus } from './EventBus.js';

const KEY = 'locopilot.settings.v1';

export const QUALITY_PRESETS = {
  low: {
    renderScale: 0.75, maxPixelRatio: 1, shadows: 'off', textureQuality: 'low', viewDistance: 1800,
    effects: 'low', antialias: 'off', reflections: 'off', weatherQuality: 'low',
    crowdDensity: 0.35, trafficDensity: 0.5, vegetationDensity: 0.45,
  },
  medium: {
    renderScale: 1, maxPixelRatio: 1, shadows: 'medium', textureQuality: 'medium', viewDistance: 2800,
    effects: 'medium', antialias: 'msaa2', reflections: 'low', weatherQuality: 'medium',
    crowdDensity: 0.6, trafficDensity: 0.8, vegetationDensity: 0.7,
  },
  high: {
    renderScale: 1, maxPixelRatio: 1.5, shadows: 'high', textureQuality: 'high', viewDistance: 4200,
    effects: 'high', antialias: 'msaa4', reflections: 'high', weatherQuality: 'high',
    crowdDensity: 0.85, trafficDensity: 1, vegetationDensity: 0.9,
  },
  ultra: {
    renderScale: 1, maxPixelRatio: 2, shadows: 'ultra', textureQuality: 'high', viewDistance: 6000,
    effects: 'high', antialias: 'msaa4', reflections: 'high', weatherQuality: 'high',
    crowdDensity: 1, trafficDensity: 1, vegetationDensity: 1,
  },
};

export const GRAPHICS_KEYS = Object.keys(QUALITY_PRESETS.low);

// Settings that only take effect after the renderer is recreated (page reload).
export const RESTART_KEYS = ['antialias'];

const DEFAULTS = {
  preset: 'auto',
  resolvedPreset: null, // what "auto" picked on this device
  ...QUALITY_PRESETS.medium,
  dynamicResolution: true,
  showFps: false,
  fov: 62,
  // audio
  masterVolume: 0.8,
  engineVolume: 0.9,
  ambienceVolume: 0.8,
  announcementVolume: 0.9,
  voiceAnnouncements: true,
  // gameplay / accessibility
  language: 'en',
  announcementLanguage: 'both',
  uiScale: 1,
  subtitles: true,
  reducedMotion: false,
  cameraShake: true,
  colorAssist: true,
  mouseSensitivity: 1,
  invertY: false,
  touchControls: 'auto',
  hudMode: 'full',
  keymap: {},
};

class SettingsStore {
  constructor() {
    this.data = mergeDefaults(DEFAULTS, Storage.load(KEY, {}));
  }
  get(key) {
    return this.data[key];
  }
  set(key, value, { silent = false } = {}) {
    if (this.data[key] === value) return;
    this.data[key] = value;
    if (GRAPHICS_KEYS.includes(key) && this.data.preset !== 'custom') this.data.preset = 'custom';
    this.save();
    if (!silent) bus.emit('settings:changed', { key, value });
  }
  applyPreset(name) {
    const preset = QUALITY_PRESETS[name === 'auto' ? this.data.resolvedPreset || 'medium' : name];
    if (!preset) return;
    Object.assign(this.data, preset);
    this.data.preset = name;
    this.save();
    bus.emit('settings:changed', { key: 'preset', value: name });
  }
  save() {
    Storage.save(KEY, this.data);
  }
  reset() {
    const keep = { resolvedPreset: this.data.resolvedPreset };
    this.data = { ...structuredClone(DEFAULTS), ...keep };
    this.applyPreset('auto');
    bus.emit('settings:changed', { key: '*', value: null });
  }
}

export const settings = new SettingsStore();
