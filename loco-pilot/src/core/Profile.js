import { Storage, mergeDefaults } from './Storage.js';
import { bus } from './EventBus.js';

const KEY = 'locopilot.profile.v1';

export const LEVELS = [
  { level: 1, xp: 0, title: 'Assistant Loco Pilot', titleHi: 'सहायक लोको पायलट', focus: 'Basic passenger trains' },
  { level: 2, xp: 700, title: 'Loco Pilot (Passenger)', titleHi: 'लोको पायलट (सवारी)', focus: 'Express trains' },
  { level: 3, xp: 1800, title: 'Loco Pilot (Mail/Express)', titleHi: 'लोको पायलट (मेल/एक्सप्रेस)', focus: 'Superfast trains' },
  { level: 4, xp: 3400, title: 'Senior Loco Pilot', titleHi: 'वरिष्ठ लोको पायलट', focus: 'Long-distance trains' },
  { level: 5, xp: 5600, title: 'Loco Pilot (Goods Heavy)', titleHi: 'लोको पायलट (मालगाड़ी)', focus: 'Heavy freight' },
  { level: 6, xp: 8500, title: 'Chief Loco Inspector', titleHi: 'मुख्य लोको निरीक्षक', focus: 'Advanced locomotives' },
];

const DEFAULTS = {
  name: 'Loco Pilot',
  xp: 0,
  reputation: 50,
  createdAt: 0,
  tutorialDone: false,
  stats: {
    journeys: 0,
    completed: 0,
    distanceKm: 0,
    drivingTimeSec: 0,
    spads: 0,
    perfectStops: 0,
    stops: 0,
    onTimeArrivals: 0,
    hornUses: 0,
    bestScore: 0,
    emergencyBrakes: 0,
  },
  scenarios: {}, // id -> { best, stars, completedAt }
  duties: {}, // career duty id -> { best, stars }
  customization: { livery: 'saffron', cabTheme: 'standard' },
  history: [], // last journeys (trimmed)
};

export function levelForXp(xp) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  const next = LEVELS.find((l) => l.level === cur.level + 1) || null;
  const progress = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1;
  return { ...cur, next, progress };
}

class ProfileStore {
  constructor() {
    this.data = mergeDefaults(DEFAULTS, Storage.load(KEY, {}));
    if (!this.data.createdAt) {
      this.data.createdAt = Date.now();
      this.save();
    }
  }
  get level() {
    return levelForXp(this.data.xp).level;
  }
  get levelInfo() {
    return levelForXp(this.data.xp);
  }
  addXp(amount) {
    const before = this.level;
    this.data.xp = Math.max(0, Math.round(this.data.xp + amount));
    const after = this.level;
    this.save();
    if (after > before) bus.emit('profile:levelup', { level: after });
    return { before, after };
  }
  addReputation(delta) {
    this.data.reputation = Math.max(0, Math.min(100, Math.round(this.data.reputation + delta)));
    this.save();
  }
  recordJourney(result) {
    const s = this.data.stats;
    s.journeys += 1;
    if (result.completed) s.completed += 1;
    s.distanceKm += result.distanceKm || 0;
    s.drivingTimeSec += result.durationSec || 0;
    s.spads += result.spads || 0;
    s.perfectStops += result.perfectStops || 0;
    s.stops += result.stops || 0;
    s.onTimeArrivals += result.onTimeArrivals || 0;
    s.emergencyBrakes += result.emergencyBrakes || 0;
    s.bestScore = Math.max(s.bestScore, result.total || 0);
    this.data.history.unshift({
      at: Date.now(),
      title: result.title,
      total: result.total,
      stars: result.stars,
      completed: result.completed,
    });
    this.data.history = this.data.history.slice(0, 12);
    if (result.scenarioId) {
      const prev = this.data.scenarios[result.scenarioId] || { best: 0, stars: 0 };
      if (result.completed) {
        this.data.scenarios[result.scenarioId] = {
          best: Math.max(prev.best, result.total),
          stars: Math.max(prev.stars, result.stars),
          completedAt: Date.now(),
        };
      }
    }
    if (result.dutyId && result.completed) {
      const prev = this.data.duties[result.dutyId] || { best: 0, stars: 0 };
      this.data.duties[result.dutyId] = { best: Math.max(prev.best, result.total), stars: Math.max(prev.stars, result.stars) };
    }
    this.save();
  }
  setCustomization(key, value) {
    this.data.customization[key] = value;
    this.save();
    bus.emit('profile:customization', { key, value });
  }
  rename(name) {
    this.data.name = String(name || '').trim().slice(0, 24) || 'Loco Pilot';
    this.save();
  }
  save() {
    Storage.save(KEY, this.data);
  }
  reset() {
    this.data = structuredClone(DEFAULTS);
    this.data.createdAt = Date.now();
    this.save();
    bus.emit('profile:reset', {});
  }
}

export const profile = new ProfileStore();
