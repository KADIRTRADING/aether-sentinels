// ---------- Utility helpers ----------
const U = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
  dist2: (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
  rand: (a, b) => a + Math.random() * (b - a),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  choice: arr => arr[Math.floor(Math.random() * arr.length)],
  angleTo: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
  approachAngle: (cur, target, step) => {
    let d = ((target - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(d) <= step) return target;
    return cur + Math.sign(d) * step;
  },
  fmt: n => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : '' + Math.floor(n)),
  ease: t => t * t * (3 - 2 * t),
};

// Simple persistent store
const Store = {
  key: 'aether_sentinels_save_v1',
  load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; }
    catch (e) { return {}; }
  },
  save(data) {
    try { localStorage.setItem(this.key, JSON.stringify(data)); } catch (e) {}
  },
  getProgress() {
    const d = this.load();
    return d.progress || { unlocked: 1, stars: {} };
  },
  setProgress(p) {
    const d = this.load();
    d.progress = p;
    this.save(d);
  },
  getSettings() {
    const d = this.load();
    return d.settings || { muted: false, volume: 0.32 };
  },
  setSettings(s) {
    const d = this.load();
    d.settings = s;
    this.save(d);
  },
  reset() {
    const d = this.load();
    this.save({ progress: { unlocked: 1, stars: {} }, settings: d.settings || { muted: false, volume: 0.32 } });
  }
};
