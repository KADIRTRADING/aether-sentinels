// =============================================================================
//  Ads — rewarded ad flow (simulated, swappable for a real SDK e.g. AdMob).
//
//  To integrate a REAL ad network for the Play Store build, replace the body of
//  Ads.showRewarded() with the native bridge call (e.g. AdMob rewarded via a
//  Capacitor plugin) and invoke onReward()/onClose() from its callbacks.
// =============================================================================
const Ads = {
  els: {}, active: false, _timer: null, _onReward: null,

  init() {
    this.els = {
      overlay: document.getElementById('ad-overlay'),
      art: document.getElementById('ad-art'),
      title: document.getElementById('ad-title'),
      sub: document.getElementById('ad-sub'),
      reward: document.getElementById('ad-reward'),
      skip: document.getElementById('ad-skip'),
      count: document.getElementById('ad-count'),
      bar: document.getElementById('ad-progress-bar'),
      cta: document.getElementById('ad-cta'),
    };
    this.els.skip.onclick = () => this.finish(true);
    this.els.cta.onclick = () => { /* would open store listing */ this.finish(true); };
  },

  cfg() { return (Assets.cfg().ads) || { rewardCoins: 100, adDurationSec: 5, creatives: [] }; },

  // Show a rewarded ad. onReward(coins) is called if the user watches to the end.
  showRewarded(onReward) {
    if (this.active) return;
    const cfg = this.cfg();
    this.active = true; this._onReward = onReward;
    // pick a rotating creative
    const creatives = cfg.creatives && cfg.creatives.length ? cfg.creatives : [{ title: 'AETHER', sub: 'Play more!', bg: '#6a5cff', img: '' }];
    const c = creatives[Math.floor(Math.random() * creatives.length)];
    this.els.title.textContent = c.title;
    this.els.sub.textContent = c.sub;
    this.els.reward.innerHTML = 'Reward: <b>+' + (cfg.rewardCoins || 100) + ' 🪙</b>';
    if (c.img) { this.els.art.style.backgroundImage = `url("${c.img}")`; }
    else { this.els.art.style.backgroundImage = ''; this.els.art.style.background = `linear-gradient(135deg, ${c.bg || '#6a5cff'}, #101a2e)`; }
    this.els.overlay.classList.remove('hidden');

    const dur = cfg.adDurationSec || 5;
    let remaining = dur;
    this.els.skip.disabled = true;
    this.els.count.textContent = remaining;
    this.els.bar.style.width = '0%';
    if (typeof Sound !== 'undefined') Sound.deploy && Sound.deploy();

    const t0 = performance.now();
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      const pct = U.clamp(elapsed / dur, 0, 1);
      this.els.bar.style.width = (pct * 100) + '%';
      remaining = Math.ceil(dur - elapsed);
      this.els.count.textContent = Math.max(0, remaining);
      if (pct >= 1) {
        clearInterval(this._timer);
        this.els.skip.disabled = false;
        this.els.skip.innerHTML = 'Claim reward ✓';
      }
    }, 100);
  },

  finish(completed) {
    if (!this.active) return;
    clearInterval(this._timer);
    const rewarded = completed && !this.els.skip.disabled; // must have watched fully
    this.els.overlay.classList.add('hidden');
    this.els.skip.innerHTML = 'Skip in <span id="ad-count">5</span>';
    this.els.count = document.getElementById('ad-count');
    this.active = false;
    if (rewarded && this._onReward) {
      const coins = this.cfg().rewardCoins || 100;
      this._onReward(coins);
    }
    this._onReward = null;
  },
};

if (typeof window !== 'undefined') window.Ads = Ads;
