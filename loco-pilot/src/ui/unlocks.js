import { profile } from '../core/Profile.js';
import { TRAINS } from '../data/trains.js';
import { LOCOMOTIVES, LIVERIES, CAB_THEMES } from '../data/locomotives.js';

export const DIFF_UNLOCK = { easy: 1, normal: 1, hard: 2, sim: 3 };

export function level() {
  return profile.level;
}
export function trainLock(t) {
  if (!t.available) return t.lockedReason || 'Coming in a future update';
  if (level() < t.unlockLevel) return `Unlocks at level ${t.unlockLevel}`;
  const loco = LOCOMOTIVES[t.loco];
  if (loco && !loco.available) return loco.lockedReason;
  return null;
}
export function locoLock(l) {
  if (!l.available) return l.lockedReason || 'Coming in a future update';
  if (level() < l.unlockLevel) return `Unlocks at level ${l.unlockLevel}`;
  return null;
}
export function liveryLock(lv) {
  return level() < lv.unlockLevel ? `Unlocks at level ${lv.unlockLevel}` : null;
}
export function cabThemeLock(c) {
  return level() < c.unlockLevel ? `Unlocks at level ${c.unlockLevel}` : null;
}
export function scenarioLock(s) {
  if (s.locked) return s.locked;
  if (level() < s.unlockLevel) return `Unlocks at level ${s.unlockLevel}`;
  if (s.train && trainLock(TRAINS[s.train]) && level() < (TRAINS[s.train].unlockLevel || 1) - 0) return null;
  return null;
}
export function dutyLock(d) {
  if (d.locked) return d.locked;
  if (level() < d.level) return `Reach level ${d.level}`;
  return null;
}
export function difficultyLock(id) {
  return level() < DIFF_UNLOCK[id] ? `Unlocks at level ${DIFF_UNLOCK[id]}` : null;
}
export { LIVERIES, CAB_THEMES };
