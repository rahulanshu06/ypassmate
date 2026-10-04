// Browser-safe persistence. Every access is wrapped: private windows or blocked
// storage simply fall back to in-memory values so the game keeps working.
const memory = new Map();

export const Storage = {
  available: (() => {
    try {
      const k = '__lp_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  })(),

  load(key, fallback) {
    try {
      const raw = this.available ? localStorage.getItem(key) : memory.get(key);
      if (raw == null) return structuredClone(fallback);
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[Storage] load failed', key, err);
      return structuredClone(fallback);
    }
  },

  save(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (this.available) localStorage.setItem(key, raw);
      else memory.set(key, raw);
      return true;
    } catch (err) {
      console.warn('[Storage] save failed', key, err);
      memory.set(key, raw);
      return false;
    }
  },

  remove(key) {
    try {
      if (this.available) localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    memory.delete(key);
  },
};

// Deep-merge saved data over defaults so new fields added in later versions get defaults.
export function mergeDefaults(defaults, saved) {
  if (saved == null || typeof saved !== 'object' || Array.isArray(saved)) return structuredClone(defaults);
  const out = structuredClone(defaults);
  for (const k of Object.keys(saved)) {
    const d = defaults[k];
    const v = saved[k];
    if (d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = mergeDefaults(d, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}
