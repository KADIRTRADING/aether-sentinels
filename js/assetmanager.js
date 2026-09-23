// =============================================================================
//  AssetManager — loads & caches custom images/audio declared in ASSET_CONFIG.
//  Falls back silently to built-in vector graphics / procedural sound.
// =============================================================================
const Assets = {
  images: {},   // key -> { url, img, ready }
  audio: {},    // unitId -> { url, buffer|el, ready }
  _cfg: null,

  init() {
    this._cfg = (typeof ASSET_CONFIG !== 'undefined') ? ASSET_CONFIG : { images: {}, audio: {}, ads: {}, levelUp: {} };
    this.load();
  },

  cfg() { return this._cfg || {}; },

  // (Re)load everything from the current config. Safe to call again to hot-reload.
  load() {
    const cfg = this.cfg();
    // Images: images[unitId] is an array (per level)
    const imgs = cfg.images || {};
    for (const unitId in imgs) {
      const arr = imgs[unitId] || [];
      arr.forEach((url, lvlIdx) => {
        if (!url) return;
        const key = unitId + '#' + lvlIdx;
        if (this.images[key] && this.images[key].url === url) return; // already loaded
        this.loadImage(key, url);
      });
    }
    // Audio: one fire sound per unit
    const auds = cfg.audio || {};
    for (const unitId in auds) {
      const url = auds[unitId];
      if (!url) { continue; }
      if (this.audio[unitId] && this.audio[unitId].url === url) continue;
      this.loadAudio(unitId, url);
    }
  },

  loadImage(key, url) {
    const rec = { url, img: null, ready: false, failed: false };
    this.images[key] = rec;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { rec.img = img; rec.ready = true; };
      img.onerror = () => { rec.failed = true; };
      img.src = url;
    } catch (e) { rec.failed = true; }
  },

  loadAudio(unitId, url) {
    const rec = { url, el: null, ready: false, failed: false };
    this.audio[unitId] = rec;
    try {
      const a = new Audio();
      a.preload = 'auto';
      a.oncanplaythrough = () => { rec.ready = true; };
      a.onerror = () => { rec.failed = true; };
      a.src = url;
      rec.el = a;
    } catch (e) { rec.failed = true; }
  },

  // Return a ready <img> for unit at a given level (1-based), or null.
  // Falls back to the highest available level image below the requested one.
  getImage(unitId, level) {
    const lvl = Math.max(1, level || 1);
    for (let l = lvl; l >= 1; l--) {
      const rec = this.images[unitId + '#' + (l - 1)];
      if (rec && rec.ready && rec.img) return rec.img;
    }
    return null;
  },

  hasImage(unitId) {
    for (const key in this.images) {
      if (key.indexOf(unitId + '#') === 0 && this.images[key].ready) return true;
    }
    return false;
  },

  // Play a unit's custom fire sound if configured & not muted. Returns true if played.
  playFire(unitId) {
    if (typeof Sound !== 'undefined' && (Sound.muted || !Sound.enabled)) return false;
    const rec = this.audio[unitId];
    if (!rec || !rec.ready || !rec.el) return false;
    try {
      // clone so rapid fire can overlap
      const node = rec.el.cloneNode();
      node.volume = (typeof Sound !== 'undefined' ? (Sound.volume != null ? Sound.volume : 0.32) : 0.32) * 2.2;
      node.play().catch(() => {});
      return true;
    } catch (e) { return false; }
  },

  hasAudio(unitId) { const r = this.audio[unitId]; return !!(r && r.ready); },

  // Live hot-reload: re-read config (e.g. after editing assets.config.js values
  // at runtime via console) and load anything new.
  reload() { this._cfg = (typeof ASSET_CONFIG !== 'undefined') ? ASSET_CONFIG : this._cfg; this.load(); },
};

if (typeof window !== 'undefined') window.Assets = Assets;
