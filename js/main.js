// ================= BOOTSTRAP =================
const Main = {
  game: null,
  currentScreen: 'screen-menu',

  init() {
    const canvas = document.getElementById('game');
    this.game = new Game(canvas);
    UI.init(this.game);
    this.bindInput(canvas);
    this.bindScreens();
    window.addEventListener('resize', () => { if (this.game.map) { this.game.resize(); UI.refresh(); } });

    // ensure fresh progress structure exists
    if (!Store.load().progress) Store.setProgress({ unlocked: 1, stars: {} });

    UI.buildLevelSelect();
    this.bindSettings();
    this.game.start(); // loop runs; screens overlay when not playing
    this.showScreen('screen-menu');
  },

  bindSettings() {
    const s = Store.getSettings();
    const muteBtn = document.getElementById('set-mute');
    const vol = document.getElementById('set-volume');
    const syncMute = () => {
      muteBtn.textContent = s.muted ? 'Off' : 'On';
      muteBtn.classList.toggle('off', s.muted);
    };
    vol.value = Math.round((s.volume != null ? s.volume : 0.32) * 100);
    syncMute();
    muteBtn.onclick = () => {
      s.muted = !s.muted; Store.setSettings(s);
      Sound.init(); Sound.setMuted(s.muted); syncMute();
      if (!s.muted) Sound.build();
    };
    vol.oninput = () => {
      s.volume = vol.value / 100; Store.setSettings(s);
      Sound.init(); Sound.setVolume(s.volume);
    };
    vol.onchange = () => { if (!s.muted) Sound.build(); };
  },

  bindScreens() {
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', () => {
        Sound.init(); Sound.resume();
        const a = el.dataset.action;
        if (a === 'play') { UI.buildLevelSelect(); this.showScreen('screen-levels'); }
        else if (a === 'howto') this.showScreen('screen-howto');
        else if (a === 'settings') this.showScreen('screen-settings');
        else if (a === 'back-menu') this.showScreen('screen-menu');
        else if (a === 'back-levels') { UI.buildLevelSelect(); this.showScreen('screen-levels'); }
        else if (a === 'reset') { Store.reset(); UI.buildLevelSelect(); UI.toast('Progress reset'); }
        else if (a === 'next-or-retry') this.handleResultPrimary(el);
      });
    });
  },

  handleResultPrimary(el) {
    const mode = el.dataset.next;
    if (mode === 'retry') { this.startLevel(this.game.mapIndex); }
    else if (mode === '1') { this.startLevel(this.game.mapIndex + 1); }
    else { UI.buildLevelSelect(); this.showScreen('screen-levels'); }
  },

  showScreen(id) {
    ['screen-menu', 'screen-levels', 'screen-howto', 'screen-settings', 'screen-result'].forEach(sid => {
      document.getElementById(sid).classList.toggle('hidden', sid !== id);
    });
    this.currentScreen = id;
    const playing = id === null;
    UI.showHud(playing);
  },

  startLevel(index) {
    Sound.init(); Sound.resume();
    this.game.loadMap(index);
    UI.buildTray();
    // hide all screens
    ['screen-menu', 'screen-levels', 'screen-howto', 'screen-settings', 'screen-result'].forEach(sid =>
      document.getElementById(sid).classList.add('hidden'));
    this.currentScreen = null;
    UI.showHud(true);
    UI.refresh();
    UI.toast(this.game.map.name + ' — ' + this.game.map.diff);
  },

  bindInput(canvas) {
    let downX = 0, downY = 0, moved = false, isDown = false;
    let dragHero = null;

    const getPoint = (e) => {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };

    const onDown = (e) => {
      if (this.currentScreen !== null) return;
      isDown = true; moved = false; dragHero = null;
      const p = getPoint(e); downX = p.x; downY = p.y;
      const tile = this.game.screenToTile(p.x, p.y);
      this.game.hoverTile = tile;
      // if not in a placement/aiming mode, pressing on a hero begins a drag
      if (!this.game.selectedBuild && !this.game.selectedHero && !this.game.armedAbility) {
        const h = this.game.heroAt(tile.fx, tile.fy);
        if (h) { dragHero = h; h.dragging = true; this.game.selectedUnit = h; this.game.selectedTower = null; Sound.pickup(); UI.refresh(); }
      }
    };
    const onMove = (e) => {
      if (this.currentScreen !== null) return;
      const p = getPoint(e);
      if (isDown && (Math.abs(p.x - downX) > 8 || Math.abs(p.y - downY) > 8)) moved = true;
      const tile = this.game.screenToTile(p.x, p.y);
      this.game.hoverTile = tile;
      if (dragHero) {
        dragHero.x = U.clamp(tile.fx, 0.4, this.game.cols - 0.4);
        dragHero.y = U.clamp(tile.fy, 0.4, this.game.rows - 0.4);
      }
    };
    const onUp = (e) => {
      if (this.currentScreen !== null) return;
      isDown = false;
      const p = getPoint(e);
      const tile = this.game.screenToTile(p.x, p.y);
      if (dragHero) {
        dragHero.dragging = false;
        // attempt fusion with an overlapping same-rank hero
        this.game.tryMergeHeroes(dragHero);
        dragHero = null;
        this.game.hoverTile = null;
        UI.refresh();
        return;
      }
      if (moved) { this.game.hoverTile = null; return; }
      this.handleTap(tile);
      this.game.hoverTile = null;
    };

    // mouse
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    // touch
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onMove(e); }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); onUp(e); }, { passive: false });
  },

  handleTap(tile) {
    const g = this.game;
    // Orbital strike aiming: cast at tapped point (allow off-grid within canvas)
    if (g.armedAbility === 'strike') {
      const cx = U.clamp(tile.fx, 0, g.cols), cy = U.clamp(tile.fy, 0, g.rows);
      g.castStrike(cx, cy);
      UI.refresh();
      return;
    }
    // Hero deploy mode: place a hero at the tapped point (free placement)
    if (g.selectedHero) {
      if (g.deployHero(tile)) {
        // if can no longer afford, exit deploy mode
        if (g.gold < HEROES[g.selectedHero].cost) g.selectedHero = null;
      }
      UI.refresh();
      return;
    }
    if (tile.x < 0 || tile.y < 0 || tile.x >= g.cols || tile.y >= g.rows) {
      g.selectedTower = null; g.selectedUnit = null; UI.refresh(); return;
    }
    // If a build tower is selected from tray, try to place
    if (g.selectedBuild) {
      if (g.tryBuild(tile.x, tile.y)) {
        // keep selection so player can place multiple; refresh affordability
        UI.refresh();
      } else {
        // tapped elsewhere: cancel build selection if tapping existing tower
        const t = g.towerAt(tile.x, tile.y);
        if (t) { g.selectedBuild = null; g.selectTowerAt(tile.x, tile.y); }
      }
      UI.refresh();
      return;
    }
    // tapping a hero selects/inspects it
    const hero = g.heroAt(tile.fx, tile.fy);
    if (hero) { g.selectedUnit = hero; g.selectedTower = null; UI.refresh(); return; }
    // otherwise select/inspect a tower
    const t = g.towerAt(tile.x, tile.y);
    g.selectTowerAt(tile.x, tile.y);
    if (!t) { g.selectedTower = null; }
    g.selectedUnit = null;
    UI.refresh();
  },
};

window.addEventListener('load', () => Main.init());
