// ================= UI LAYER =================
const UI = {
  game: null,
  els: {},
  toastTimer: null,

  init(game) {
    this.game = game;
    this.els = {
      hud: document.getElementById('hud'),
      tray: document.getElementById('tray'),
      inspect: document.getElementById('inspect'),
      lives: document.querySelector('#stat-lives .val'),
      gold: document.querySelector('#stat-gold .val'),
      coins: document.querySelector('#stat-coins .val'),
      wave: document.querySelector('#stat-wave .val'),
      btnStart: document.getElementById('btn-start-wave'),
      btnSpeed: document.getElementById('btn-speed'),
      btnPause: document.getElementById('btn-pause'),
      btnMute: document.getElementById('btn-mute'),
      btnWatchAd: document.getElementById('btn-watch-ad'),
      toast: document.getElementById('toast'),
      levelGrid: document.getElementById('level-grid'),
      abilities: document.getElementById('abilities'),
      abStrike: document.getElementById('ab-strike'),
      abFreeze: document.getElementById('ab-freeze'),
    };

    this.els.btnStart.onclick = () => { Sound.resume(); this.game.startWave(); this.refresh(); };
    this.els.btnSpeed.onclick = () => this.cycleSpeed();
    this.els.btnPause.onclick = () => this.togglePause();
    this.els.btnMute.onclick = () => this.toggleMute();
    this.els.btnWatchAd.onclick = (e) => { e.stopPropagation(); this.watchAd(); };
    this.els.abStrike.onclick = () => { Sound.resume(); this.game.armAbility('strike'); this.refresh(); };
    this.els.abFreeze.onclick = () => { Sound.resume(); this.game.armAbility('freeze'); this.refresh(); };

    game.onEvent = (ev) => this.handleEvent(ev);
  },

  // ---- coins & ads ----
  watchAd() {
    const now = Date.now();
    const readyAt = Store.getAdReadyAt();
    if (now < readyAt) { this.toast('Ad ready in ' + Math.ceil((readyAt - now) / 1000) + 's'); return; }
    Sound.resume();
    Ads.showRewarded((coins) => {
      Store.addCoins(coins);
      const cd = (Assets.cfg().ads && Assets.cfg().ads.cooldownSec) || 30;
      Store.setAdReadyAt(Date.now() + cd * 1000);
      Sound.win();
      this.toast('+' + coins + ' 🪙 earned!');
      this.refresh();
    });
  },

  toggleMute() {
    const s = Store.getSettings();
    s.muted = !s.muted; Store.setSettings(s);
    Sound.init(); Sound.setMuted(s.muted);
    this.refresh();
    if (!s.muted) Sound.pickup && Sound.pickup();
  },

  handleEvent(ev) {
    if (ev.type === 'stats') this.refresh();
    else if (ev.type === 'toast') this.toast(ev.msg);
    else if (ev.type === 'won') this.onWon(ev.stars);
    else if (ev.type === 'lost') this.onLost();
  },

  showHud(show) {
    this.els.hud.classList.toggle('hidden', !show);
    this.els.tray.classList.toggle('hidden', !show);
    this.els.abilities.classList.toggle('hidden', !show);
    if (!show) this.els.inspect.classList.add('hidden');
  },

  refreshAbilities() {
    const g = this.game;
    const map = { strike: this.els.abStrike, freeze: this.els.abFreeze };
    for (const id in map) {
      const el = map[id], a = g.abilities[id];
      const ready = a.cd <= 0;
      el.classList.toggle('ready', ready);
      el.classList.toggle('cooling', !ready);
      el.classList.toggle('armed', g.armedAbility === id);
      const cd = el.querySelector('.ab-cd');
      cd.textContent = ready ? '' : Math.ceil(a.cd);
    }
  },

  buildTray() {
    const g = this.game;
    this.els.tray.innerHTML = '';
    for (const id of TOWER_ORDER) {
      const def = TOWERS[id];
      const card = document.createElement('div');
      card.className = 'tower-card';
      card.dataset.id = id; card.dataset.kind = 'tower';
      card.innerHTML = `<div class="glyph" style="color:${def.color}">${def.glyph}</div>
        <div class="tname">${def.name}</div>
        <div class="tcost">${def.cost} ⬢</div>`;
      card.onclick = () => this.selectBuild(id);
      this.els.tray.appendChild(card);
    }
    // hero roster (buyable base hero). Fusion produces the rest.
    for (const id of HERO_BUYABLE) {
      const def = HEROES[id];
      const card = document.createElement('div');
      card.className = 'tower-card hero-card';
      card.dataset.id = id; card.dataset.kind = 'hero';
      card.innerHTML = `<div class="glyph" style="color:${def.color}">🪖</div>
        <div class="tname">${def.weapon}</div>
        <div class="tcost">${def.cost} ⬢</div>`;
      card.onclick = () => this.selectHero(id);
      this.els.tray.appendChild(card);
    }
    this.refresh();
  },

  selectBuild(id) {
    const g = this.game;
    if (g.selectedBuild === id) { g.selectedBuild = null; }
    else { g.selectedBuild = id; g.selectedHero = null; g.selectedTower = null; g.selectedUnit = null; this.els.inspect.classList.add('hidden'); }
    this.refresh();
  },

  selectHero(id) {
    const g = this.game;
    if (g.selectedHero === id) { g.selectedHero = null; }
    else { g.selectedHero = id; g.selectedBuild = null; g.selectedTower = null; g.selectedUnit = null; this.els.inspect.classList.add('hidden'); }
    this.refresh();
  },

  refresh() {
    const g = this.game;
    if (!g.map) return;
    this.els.lives.textContent = g.lives;
    this.els.gold.textContent = U.fmt(g.gold);
    if (this.els.coins) this.els.coins.textContent = U.fmt(Store.getCoins());
    this.els.wave.textContent = `${Math.min(g.waveIndex + (g.waveActive ? 1 : 0), g.waves.length)}/${g.waves.length}`;
    // mute icon
    if (this.els.btnMute) this.els.btnMute.textContent = Store.getSettings().muted ? '🔇' : '🔊';
    // watch-ad cooldown badge
    if (this.els.btnWatchAd) {
      const left = Math.ceil((Store.getAdReadyAt() - Date.now()) / 1000);
      if (left > 0) { this.els.btnWatchAd.classList.add('cooling'); this.els.btnWatchAd.textContent = left + 's'; }
      else { this.els.btnWatchAd.classList.remove('cooling'); this.els.btnWatchAd.textContent = '+'; }
    }
    // start button
    this.els.btnStart.disabled = g.waveActive || g.state !== 'building';
    this.els.btnStart.textContent = g.waves[g.waveIndex] && g.waves[g.waveIndex].isBoss ? '☠ Boss Wave' : 'Start Wave';
    // tray affordability + selection (towers and heroes)
    [...this.els.tray.children].forEach(c => {
      const isHero = c.dataset.kind === 'hero';
      const def = isHero ? HEROES[c.dataset.id] : TOWERS[c.dataset.id];
      c.classList.toggle('cant-afford', g.gold < def.cost);
      const sel = isHero ? (g.selectedHero === c.dataset.id) : (g.selectedBuild === c.dataset.id);
      c.classList.toggle('selected', sel);
    });
    // inspect panel — hero takes priority when selected
    if (g.selectedUnit && !g.selectedUnit.dead) this.renderHeroInspect(g.selectedUnit);
    else if (g.selectedTower) this.renderInspect(g.selectedTower);
    else this.els.inspect.classList.add('hidden');
    // abilities
    this.refreshAbilities();
  },

  // shared coin level-up button (works for towers & heroes)
  levelUpHtml(unit) {
    const cost = unit.levelUpCost ? unit.levelUpCost() : null;
    if (cost == null) return `<button class="levelup-btn maxed" disabled>★ MAX LEVEL ${unit.level}</button>`;
    const afford = Store.getCoins() >= cost;
    return `<button class="levelup-btn" id="levelup-btn" ${afford ? '' : 'disabled'}>
      <span>⬆ Level ${unit.level} → ${unit.level + 1}</span><span class="lu-cost">${cost} 🪙</span></button>`;
  },
  wireLevelUp(unit, rerender) {
    const btn = document.getElementById('levelup-btn');
    if (btn) btn.onclick = () => { if (this.game.levelUpUnit(unit)) { this.refresh(); rerender(); } };
  },

  renderHeroInspect(h) {
    const g = this.game;
    const p = this.els.inspect;
    p.classList.remove('hidden');
    const rate = h.stats.rate > 0 ? (1 / h.stats.rate).toFixed(1) : '—';
    const modeLabels = { first: 'First', last: 'Last', strong: 'Strongest', close: 'Closest' };
    const nextName = h.def.mergeTo ? HEROES[h.def.mergeTo].weapon : null;
    const mergeHint = nextName
      ? `<div class="up-desc">Drag onto another <b>${h.def.weapon}</b> to fuse → <b>${nextName}</b></div>`
      : `<div class="up-desc">Max-rank weapon — the apex fusion.</div>`;
    p.innerHTML = `<h3 style="color:${h.def.color}">🪖 ${h.def.name} · ${h.def.weapon}</h3>
      <div class="role">${h.def.role}</div>
      <div class="level-row"><span>Level</span><b>${h.level}</b></div>
      <div class="stat-row"><span>Damage</span><b>${Math.round(h.stats.dmg)}</b></div>
      <div class="stat-row"><span>Fire Rate</span><b>${rate}/s</b></div>
      <div class="stat-row"><span>Range</span><b>${h.stats.range.toFixed(1)}</b></div>
      <div class="stat-row"><span>Health</span><b>${Math.round(h.hp)}/${h.maxHp}</b></div>
      ${this.levelUpHtml(h)}
      <button class="target-btn" id="h-target-btn">🎯 Target: <b>${modeLabels[h.targetMode]}</b></button>
      ${mergeHint}
      <button class="sell-btn" id="h-sell-btn">Sell (+${h.sellValue} ⬢)</button>`;
    this.wireLevelUp(h, () => this.renderHeroInspect(h));
    const tb = document.getElementById('h-target-btn');
    if (tb) tb.onclick = () => { h.cycleTargetMode(); this.renderHeroInspect(h); };
    document.getElementById('h-sell-btn').onclick = () => { g.sellSelectedUnit(); };
    // position panel near hero
    const rect = g.canvas.getBoundingClientRect();
    let x = rect.left + h.x * g.s + g.s * 0.6;
    let y = rect.top + h.y * g.s - 10;
    x = U.clamp(x, 8, window.innerWidth - 248);
    y = U.clamp(y, 60, window.innerHeight - 280);
    p.style.left = x + 'px'; p.style.top = y + 'px';
  },

  renderInspect(t) {
    const g = this.game;
    const p = this.els.inspect;
    p.classList.remove('hidden');
    const nt = t.nextTier;
    const b = t.buffs();
    const rng = (t.stats.range + b.rangeAdd).toFixed(1);
    let statsHtml = `<div class="stat-row"><span>Range</span><b>${rng}</b></div>`;
    if (t.def.kind === 'support') {
      statsHtml += `<div class="stat-row"><span>Dmg Buff</span><b>+${Math.round(t.stats.buffDmg*100)}%</b></div>
        <div class="stat-row"><span>Rate Buff</span><b>+${Math.round(t.stats.buffRate*100)}%</b></div>`;
    } else {
      statsHtml += `<div class="stat-row"><span>Damage</span><b>${Math.round((t.stats.dmg||0)*b.dmgMul)}</b></div>`;
      if (t.def.kind !== 'aoe-slow') statsHtml += `<div class="stat-row"><span>Fire Rate</span><b>${(1/(t.stats.rate/b.rateMul)).toFixed(1)}/s</b></div>`;
      if (t.stats.chains) statsHtml += `<div class="stat-row"><span>Chains</span><b>${t.stats.chains}</b></div>`;
      if (t.stats.splash) statsHtml += `<div class="stat-row"><span>Splash</span><b>${t.stats.splash.toFixed(1)}</b></div>`;
      if (t.stats.slow) statsHtml += `<div class="stat-row"><span>Slow</span><b>${Math.round(t.stats.slow*100)}%</b></div>`;
      if (t.stats.dot) statsHtml += `<div class="stat-row"><span>Poison</span><b>${t.stats.dot}/s</b></div>`;
    }

    let upHtml;
    if (nt) {
      const afford = g.gold >= nt.cost;
      upHtml = `<button class="up-btn" id="up-btn" ${afford ? '' : 'disabled'}>
        <span>Upgrade ▸ Tier ${t.tier + 1}</span><span class="up-cost">${nt.cost} ⬢</span></button>
        <div class="up-desc">${nt.desc}</div>`;
    } else {
      upHtml = `<button class="up-btn maxed" disabled>MAX TIER</button>`;
    }

    const canTarget = t.def.kind !== 'support' && t.def.kind !== 'aoe-slow';
    const modeLabels = { first: 'First', last: 'Last', strong: 'Strongest', close: 'Closest' };
    const targetHtml = canTarget
      ? `<button class="target-btn" id="target-btn">🎯 Target: <b>${modeLabels[t.targetMode]}</b></button>`
      : '';

    p.innerHTML = `<h3 style="color:${t.def.color}">${t.def.glyph} ${t.def.name} ${'★'.repeat(t.tier)}</h3>
      <div class="role">${t.def.role}</div>
      <div class="level-row"><span>Level</span><b>${t.level}</b><span>Tier</span><b>${t.tier}</b></div>
      ${statsHtml}
      ${this.levelUpHtml(t)}
      ${targetHtml}
      ${upHtml}
      <button class="sell-btn" id="sell-btn">Sell (+${t.sellValue} ⬢)</button>`;

    this.wireLevelUp(t, () => this.renderInspect(t));
    const upBtn = document.getElementById('up-btn');
    if (upBtn) upBtn.onclick = () => { if (t.upgrade()) this.refresh(); };
    const targetBtn = document.getElementById('target-btn');
    if (targetBtn) targetBtn.onclick = () => { t.cycleTargetMode(); this.renderInspect(t); };
    document.getElementById('sell-btn').onclick = () => { this.game.sellSelected(); };

    // position near tower but keep on screen
    const rect = this.game.canvas.getBoundingClientRect();
    let x = rect.left + t.x * this.game.s + this.game.s * 0.6;
    let y = rect.top + t.y * this.game.s - 10;
    x = U.clamp(x, 8, window.innerWidth - 248);
    y = U.clamp(y, 60, window.innerHeight - 260);
    p.style.left = x + 'px'; p.style.top = y + 'px';
  },

  cycleSpeed() {
    const speeds = [1, 2, 3];
    const i = speeds.indexOf(this.game.speed);
    this.game.speed = speeds[(i + 1) % speeds.length];
    this.els.btnSpeed.textContent = '▶ ' + this.game.speed + 'x';
  },
  togglePause() {
    this.game.paused = !this.game.paused;
    this.els.btnPause.textContent = this.game.paused ? '▶' : '❚❚';
  },

  toast(msg) {
    const t = this.els.toast;
    t.textContent = msg; t.classList.remove('hidden');
    // retrigger animation
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
  },

  // ----- level select -----
  buildLevelSelect() {
    const grid = this.els.levelGrid;
    grid.innerHTML = '';
    const prog = Store.getProgress();
    MAPS.forEach((m, i) => {
      const locked = (i + 1) > prog.unlocked;
      const stars = prog.stars[m.id] || 0;
      const card = document.createElement('div');
      card.className = 'level-card' + (locked ? ' locked' : '');
      const grad = `linear-gradient(135deg, ${m.bg[0]}, ${m.pathColor})`;
      card.innerHTML = `
        <div class="lc-name">${m.name}</div>
        <div class="lc-diff">${m.diff} · ${m.waves} waves · Boss: ${ENEMIES[m.bossType].name}</div>
        <div class="lc-preview" style="background:${grad}"></div>
        <div class="lc-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        ${locked ? '<div class="lc-lock">🔒</div>' : ''}`;
      if (!locked) card.onclick = () => Main.startLevel(i);
      grid.appendChild(card);
    });
  },

  onWon(stars) {
    this.showHud(false);
    const prog = Store.getProgress();
    prog.stars[this.game.map.id] = Math.max(prog.stars[this.game.map.id] || 0, stars);
    if (this.game.mapIndex + 2 > prog.unlocked && this.game.mapIndex + 1 < MAPS.length) {
      prog.unlocked = this.game.mapIndex + 2;
    }
    Store.setProgress(prog);
    const hasNext = this.game.mapIndex + 1 < MAPS.length;
    document.getElementById('result-title').textContent = '★ Victory!';
    document.getElementById('result-sub').textContent = `${this.game.map.name} cleared with ${stars} star${stars>1?'s':''}. Lives left: ${this.game.lives}`;
    const primary = document.getElementById('result-primary');
    primary.textContent = hasNext ? 'Next Map ›' : 'Map Select';
    primary.dataset.next = hasNext ? '1' : '0';
    Main.showScreen('screen-result');
  },
  onLost() {
    this.showHud(false);
    document.getElementById('result-title').textContent = '✖ Defeat';
    document.getElementById('result-sub').textContent = `The swarm overran your Core on ${this.game.map.name}. Try adjusting your tower mix.`;
    const primary = document.getElementById('result-primary');
    primary.textContent = '↻ Retry';
    primary.dataset.next = 'retry';
    Main.showScreen('screen-result');
  },
};
