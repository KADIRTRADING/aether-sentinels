// =============================================================================
//  Tutorial — contextual first-session coaching.
//
//  Rather than a blocking wall of text, this shows short, dismissible hints that
//  advance when the player actually performs the action. It runs only on the
//  first playthrough (persisted via settings.tutorialDone) and can be replayed
//  from the How to Play screen.
// =============================================================================
const Tutorial = {
  active: false,
  step: 0,
  el: null,
  game: null,

  // Each step: text, an optional anchor element id to point at, and a `done`
  // predicate evaluated against the game to auto-advance.
  STEPS: [
    {
      text: 'Welcome, Commander. <b>⬢ Gold</b> is earned during a battle and spent on towers. Tap a tower card below to select it.',
      anchor: 'tray',
      done: g => !!g.selectedBuild,
    },
    {
      text: 'Now tap a glowing <b>⬡ node</b> beside the path to build it. Nodes are the only valid build spots.',
      anchor: null,
      done: g => g.towers.length > 0,
    },
    {
      text: 'Good. Tap a placed tower to <b>upgrade</b> it, change its <b>targeting</b>, or sell it.',
      anchor: null,
      done: g => !!g.selectedTower,
    },
    {
      text: 'Enemies walk the lit path to your <b>Core</b>. Every leak costs a life. Press <b>Start Wave</b> when you are ready.',
      anchor: 'btn-start-wave',
      done: g => g.waveActive || g.waveIndex > 0,
    },
    {
      text: '<b>🪙 Coins</b> are different: they persist between matches and permanently <b>level up</b> a unit. Earn them by clearing maps or watching an ad.',
      anchor: 'stat-coins',
      done: () => false,   // advanced by the Next button
      manual: true,
    },
    {
      text: 'Deploy <b>🪖 Heroes</b> anywhere — then <b>drag one hero onto another of the same weapon</b> to fuse them into a stronger gun.',
      anchor: 'tray',
      done: () => false,
      manual: true,
    },
    {
      text: 'That is everything. Mix tower roles — slows, splash, armor-piercing and support — because bosses resist single strategies. Good luck!',
      anchor: null,
      done: () => false,
      manual: true,
    },
  ],

  shouldRun() {
    const s = Store.getSettings();
    return !s.tutorialDone;
  },

  start(game, force) {
    this.game = game;
    if (!force && !this.shouldRun()) return;
    this.active = true; this.step = 0;
    this._ensureEl();
    this.render();
  },

  _ensureEl() {
    if (this.el && document.getElementById('tutorial')) return;
    const el = document.createElement('div');
    el.id = 'tutorial';
    el.className = 'tutorial hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="tut-body">
        <div class="tut-text" id="tut-text"></div>
        <div class="tut-actions">
          <button class="tut-skip" id="tut-skip">Skip</button>
          <button class="tut-next" id="tut-next">Got it</button>
        </div>
        <div class="tut-dots" id="tut-dots"></div>
      </div>`;
    document.getElementById('app').appendChild(el);
    this.el = el;
    document.getElementById('tut-skip').onclick = () => this.finish();
    document.getElementById('tut-next').onclick = () => this.next();
  },

  render() {
    if (!this.active) { if (this.el) this.el.classList.add('hidden'); return; }
    const s = this.STEPS[this.step];
    if (!s) return this.finish();
    this._ensureEl();
    this.el.classList.remove('hidden');
    document.getElementById('tut-text').innerHTML = s.text;
    // progress dots
    document.getElementById('tut-dots').innerHTML =
      this.STEPS.map((_, i) => `<span class="${i === this.step ? 'on' : ''}"></span>`).join('');
    // "Got it" only advances manual steps; action steps advance themselves
    const nextBtn = document.getElementById('tut-next');
    nextBtn.textContent = s.manual ? (this.step === this.STEPS.length - 1 ? 'Start playing' : 'Next') : 'Got it';
    // highlight the anchor element
    document.querySelectorAll('.tut-highlight').forEach(e => e.classList.remove('tut-highlight'));
    if (s.anchor) {
      const a = document.getElementById(s.anchor);
      if (a) a.classList.add('tut-highlight');
    }
  },

  // Called from the game loop / UI refresh to auto-advance action steps.
  poll() {
    if (!this.active || !this.game) return;
    const s = this.STEPS[this.step];
    if (!s || s.manual) return;
    try {
      if (s.done(this.game)) this.next();
    } catch (e) { /* never let a hint break the game */ }
  },

  next() {
    this.step++;
    if (this.step >= this.STEPS.length) return this.finish();
    this.render();
  },

  finish() {
    this.active = false;
    Store.setSettings({ tutorialDone: true });
    document.querySelectorAll('.tut-highlight').forEach(e => e.classList.remove('tut-highlight'));
    if (this.el) this.el.classList.add('hidden');
  },
};

if (typeof window !== 'undefined') window.Tutorial = Tutorial;
