// Minimal publish/subscribe hub used to decouple simulation, audio and UI.
export class EventBus {
  constructor() {
    this.map = new Map();
  }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (d) => {
      off();
      fn(d);
    });
    return off;
  }
  off(name, fn) {
    const set = this.map.get(name);
    if (set) set.delete(fn);
  }
  emit(name, data) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[EventBus] handler for "${name}" failed`, err);
      }
    }
  }
}

export const bus = new EventBus();
