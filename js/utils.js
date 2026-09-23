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
  // Small deterministic PRNG (mulberry32) — returns a function producing [0,1).
  // Used for reproducible, tunable wave generation.
  seededRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
};

// Simple persistent store with a versioned schema + safe migration.
// Never silently wipes progress: unknown/older saves are migrated and defaulted.
const Store = {
  key: 'aether_sentinels_save_v1',   // kept for backward compat (v1.0–1.3 data lives here)
  SCHEMA: 2,
  DEFAULTS: {
    schema: 2,
    progress: { unlocked: 1, stars: {} },
    settings: { muted: false, volume: 0.32, sfxVolume: 0.32, reducedMotion: false, tutorialDone: false },
    coins: 150,
    adReadyAt: 0,
  },
  _cache: null,

  _read() {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; }
    catch (e) { return {}; }
  },

  // Migrate any older/partial save to the current schema, preserving data.
  migrate(raw) {
    const d = Object.assign({}, raw);
    // v1.x saves had no `schema`. Fill missing fields from defaults without
    // overwriting anything the player already earned.
    if (!d.progress || typeof d.progress !== 'object') d.progress = { unlocked: 1, stars: {} };
    if (typeof d.progress.unlocked !== 'number' || d.progress.unlocked < 1) d.progress.unlocked = 1;
    if (!d.progress.stars || typeof d.progress.stars !== 'object') d.progress.stars = {};
    if (!d.settings || typeof d.settings !== 'object') d.settings = {};
    const s = d.settings;
    if (typeof s.muted !== 'boolean') s.muted = false;
    if (typeof s.volume !== 'number') s.volume = 0.32;
    if (typeof s.sfxVolume !== 'number') s.sfxVolume = s.volume;      // new in schema 2
    if (typeof s.reducedMotion !== 'boolean') s.reducedMotion = false; // new in schema 2
    if (typeof s.tutorialDone !== 'boolean') s.tutorialDone = false;   // new in schema 2
    if (typeof d.coins !== 'number' || !isFinite(d.coins)) d.coins = 150;
    d.coins = Math.max(0, Math.floor(d.coins));
    if (typeof d.adReadyAt !== 'number') d.adReadyAt = 0;
    d.schema = this.SCHEMA;
    return d;
  },

  load() {
    if (this._cache) return this._cache;
    const migrated = this.migrate(this._read());
    this._cache = migrated;
    // persist the migrated form so future loads are clean (only if changed)
    this.save(migrated);
    return migrated;
  },
  save(data) {
    this._cache = data;
    try { localStorage.setItem(this.key, JSON.stringify(data)); } catch (e) {}
  },

  getProgress() { return this.load().progress; },
  setProgress(p) { const d = this.load(); d.progress = p; this.save(d); },

  getSettings() { return this.load().settings; },
  setSettings(s) { const d = this.load(); d.settings = Object.assign(d.settings, s); this.save(d); },

  // ---- Coins (persistent meta-currency, separate from in-match gold) ----
  getCoins() { return this.load().coins; },
  setCoins(n) { const d = this.load(); d.coins = Math.max(0, Math.floor(n)); this.save(d); return d.coins; },
  addCoins(n) { return this.setCoins(this.getCoins() + n); },
  spendCoins(n) {
    const c = this.getCoins();
    if (c < n) return false;
    this.setCoins(c - n);
    return true;
  },

  // ---- Ad cooldown timestamp ----
  getAdReadyAt() { return this.load().adReadyAt || 0; },
  setAdReadyAt(ts) { const d = this.load(); d.adReadyAt = ts; this.save(d); },

  reset() {
    const d = this.load();
    // Preserve settings on reset (players don't expect audio prefs wiped);
    // clear progress + coins to starting values.
    this.save({
      schema: this.SCHEMA,
      progress: { unlocked: 1, stars: {} },
      settings: d.settings,
      coins: 150,
      adReadyAt: 0,
    });
  }
};
