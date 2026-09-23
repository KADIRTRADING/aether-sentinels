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
      nextWave: document.getElementById('stat-next'),
      nextList: document.querySelector('#stat-next .nw-list'),
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
    if (show) this.syncTrayHeight();
  },

  // Expose the tray's real height so the docked inspect sheet can sit above it.
  syncTrayHeight() {
    const h = this.els.tray && this.els.tray.offsetHeight ? this.els.tray.offsetHeight : 78;
    document.documentElement.style.setProperty('--tray-h', h + 'px');
  },

  // True when the inspect panel is CSS-docked (short screens) — in that mode we
  // must not override its position from JS.
  isPanelDocked() {
    return window.matchMedia && window.matchMedia('(max-height: 520px)').matches;
  },

  // Position the floating panel near a unit while keeping it fully on screen.
  positionPanel(p, worldX, worldY) {
    if (this.isPanelDocked()) { p.style.left = ''; p.style.top = ''; return; }
    const g = this.game;
    const rect = g.canvas.getBoundingClientRect();
    const pw = p.offsetWidth || 232, ph = p.offsetHeight || 260;
    // prefer the right of the unit, flip to the left if it would overflow
    let x = rect.left + worldX * g.s + g.s * 0.6;
    if (x + pw > window.innerWidth - 8) x = rect.left + worldX * g.s - pw - g.s * 0.6;
    let y = rect.top + worldY * g.s - 10;
    x = U.clamp(x, 8, Math.max(8, window.innerWidth - pw - 8));
    y = U.clamp(y, 60, Math.max(60, window.innerHeight - ph - 8));
    p.style.left = x + 'px'; p.style.top = y + 'px';
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
    this.renderNextWave();
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
    // advance contextual tutorial when the player performs the taught action
    if (typeof Tutorial !== 'undefined') Tutorial.poll();
  },

  // Preview of what is coming next, so the player can prepare the right counters
  // instead of guessing. Hidden while a wave is in progress.
  renderNextWave() {
    const g = this.game;
    const el = this.els.nextWave, list = this.els.nextList;
    if (!el || !list) return;
    const wave = g.waves[g.waveIndex];
    if (!wave || g.waveActive || g.state !== 'building') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    // aggregate counts per enemy type, ordered by threat
    const counts = {};
    for (const grp of wave.groups) counts[grp.type] = (counts[grp.type] || 0) + grp.count;
    const entries = Object.keys(counts).sort((a, b) => (ENEMY_THREAT[b] || 99) - (ENEMY_THREAT[a] || 99));
    list.innerHTML = entries.map(type => {
      const d = ENEMIES[type];
      const tip = d.name + (d.armor ? ' · armor ' + d.armor : '') + (d.dodge ? ' · dodges' : '') +
        (d.heal ? ' · heals allies' : '') + (d.boss ? ' · BOSS' : '');
      return `<span class="nw-item" title="${tip}"><i style="background:${d.color}"></i>${counts[type]}</span>`;
    }).join('');
    if (wave.isBoss) list.innerHTML = `<span class="nw-boss">☠ ${ENEMIES[g.map.bossType].name}</span>` + list.innerHTML;
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
      <div class="stat-grid">
        <div class="stat-row"><span>Damage</span><b>${Math.round(h.stats.dmg)}</b></div>
        <div class="stat-row"><span>Rate</span><b>${rate}/s</b></div>
        <div class="stat-row"><span>Range</span><b>${h.stats.range.toFixed(1)}</b></div>
        <div class="stat-row"><span>HP</span><b>${Math.round(h.hp)}/${h.maxHp}</b></div>
      </div>
      ${this.levelUpHtml(h)}
      <button class="target-btn" id="h-target-btn">🎯 Target: <b>${modeLabels[h.targetMode]}</b></button>
      ${mergeHint}
      <button class="sell-btn" id="h-sell-btn">Sell (+${h.sellValue} ⬢)</button>`;
    this.wireLevelUp(h, () => this.renderHeroInspect(h));
    const tb = document.getElementById('h-target-btn');
    if (tb) tb.onclick = () => { h.cycleTargetMode(); this.renderHeroInspect(h); };
    document.getElementById('h-sell-btn').onclick = () => { g.sellSelectedUnit(); };
    this.positionPanel(p, h.x, h.y);
  },

  renderInspect(t) {
    const g = this.game;
    const p = this.els.inspect;
    p.classList.remove('hidden');
    const nt = t.nextTier;
    const b = t.buffs();
    const rng = (t.stats.range + b.rangeAdd).toFixed(1);
    let rows = `<div class="stat-row"><span>Range</span><b>${rng}</b></div>`;
    if (t.def.kind === 'support') {
      rows += `<div class="stat-row"><span>Dmg Buff</span><b>+${Math.round(t.stats.buffDmg*100)}%</b></div>
        <div class="stat-row"><span>Rate Buff</span><b>+${Math.round(t.stats.buffRate*100)}%</b></div>`;
    } else {
      rows += `<div class="stat-row"><span>Damage</span><b>${Math.round((t.stats.dmg||0)*b.dmgMul)}</b></div>`;
      if (t.def.kind !== 'aoe-slow') rows += `<div class="stat-row"><span>Rate</span><b>${(1/(t.stats.rate/b.rateMul)).toFixed(1)}/s</b></div>`;
      if (t.stats.chains) rows += `<div class="stat-row"><span>Chains</span><b>${t.stats.chains}</b></div>`;
      if (t.stats.splash) rows += `<div class="stat-row"><span>Splash</span><b>${t.stats.splash.toFixed(1)}</b></div>`;
      if (t.stats.slow) rows += `<div class="stat-row"><span>Slow</span><b>${Math.round(t.stats.slow*100)}%</b></div>`;
      if (t.stats.dot) rows += `<div class="stat-row"><span>Poison</span><b>${t.stats.dot}/s</b></div>`;
      if (t.stats.armorMul != null && t.stats.armorMul < 1) rows += `<div class="stat-row"><span>Armor pass</span><b>${Math.round((1-t.stats.armorMul)*100)}%</b></div>`;
    }
    const statsHtml = `<div class="stat-grid">${rows}</div>`;

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
    this.positionPanel(p, t.x, t.y);
  },

  cycleSpeed() {
    const speeds = [1, 2, 3];
    const i = speeds.indexOf(this.game.speed);
    this.game.speed = speeds[(i + 1) % speeds.length];
    this.syncSpeed();
  },
  syncSpeed() {
    this.els.btnSpeed.textContent = '▶ ' + this.game.speed + 'x';
    this.els.btnSpeed.setAttribute('aria-label', 'Game speed ' + this.game.speed + 'x');
  },
  togglePause() {
    this.game.paused = !this.game.paused;
    this.els.btnPause.textContent = this.game.paused ? '▶' : '❚❚';
    this.els.btnPause.setAttribute('aria-label', this.game.paused ? 'Resume' : 'Pause');
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

  // Victory. Rewards are granted exactly once per completed run: `_rewarded`
  // guards against a repeated 'won' event, and stars never regress on a replay.
  onWon(stars) {
    this.showHud(false);
    const g = this.game;
    const mapId = g.map.id;
    const prog = Store.getProgress();
    const prevStars = prog.stars[mapId] || 0;
    const firstClear = prevStars === 0;
    const improved = stars > prevStars;

    if (!g._rewarded) {
      g._rewarded = true;
      prog.stars[mapId] = Math.max(prevStars, stars);
      if (g.mapIndex + 2 > prog.unlocked && g.mapIndex + 1 < MAPS.length) {
        prog.unlocked = g.mapIndex + 2;
      }
      Store.setProgress(prog);
      // Coin reward: first clear pays more; replays pay a small amount, and an
      // improved star rating pays the difference. Granted once per run.
      const base = firstClear ? 60 + mapId * 30 : 15;
      const starBonus = improved ? (stars - prevStars) * 25 : 0;
      const coins = base + starBonus;
      Store.addCoins(coins);
      this._lastReward = coins;
    }

    const hasNext = g.mapIndex + 1 < MAPS.length;
    document.getElementById('result-title').textContent = '★ Victory!';
    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    document.getElementById('result-sub').innerHTML =
      `<b>${g.map.name}</b> cleared &nbsp;<span class="res-stars">${starStr}</span><br>` +
      `Lives remaining: ${g.lives}/${g.map.lives}` +
      (this._lastReward ? ` &nbsp;·&nbsp; <b>+${this._lastReward} 🪙</b>` : '') +
      (improved && !firstClear ? '<br><span class="res-note">New best rating!</span>' : '') +
      (!improved && !firstClear ? `<br><span class="res-note">Best: ${'★'.repeat(prevStars)}</span>` : '');
    const primary = document.getElementById('result-primary');
    primary.textContent = hasNext ? 'Next Map ›' : 'Map Select';
    primary.dataset.next = hasNext ? '1' : '0';
    Main.showScreen('screen-result');
  },
  onLost() {
    this.showHud(false);
    const g = this.game;
    const reached = g.waveIndex + 1;
    document.getElementById('result-title').textContent = '✖ Defeat';
    document.getElementById('result-sub').innerHTML =
      `The swarm overran your Core on <b>${g.map.name}</b> at wave ${Math.min(reached, g.waves.length)}/${g.waves.length}.<br>` +
      `<span class="res-note">${this._defeatTip()}</span>`;
    const primary = document.getElementById('result-primary');
    primary.textContent = '↻ Retry';
    primary.dataset.next = 'retry';
    Main.showScreen('screen-result');
  },

  // Contextual advice based on what the player actually built.
  _defeatTip() {
    const g = this.game;
    const kinds = new Set(g.towers.map(t => t.def.kind));
    if (g.towers.length <= 4) return 'Tip: build more towers — spend your gold between waves.';
    if (!kinds.has('aoe-slow')) return 'Tip: a Cryo Node ❄ slows groups so your damage has time to land.';
    if (!kinds.has('splash')) return 'Tip: add a Mortar 💥 to clear packed swarms.';
    if (!kinds.has('sniper')) return 'Tip: Railguns 🎯 pierce heavy armor like the Warden.';
    if (g.towers.every(t => t.tier === 0)) return 'Tip: upgrading a few towers beats building many weak ones.';
    if (!kinds.has('support')) return 'Tip: an Aegis Pylon ◈ boosts every tower around it.';
    return 'Tip: use ☄ Orbital Strike and ❄ Cryo Pulse on the boss wave.';
  },
};
