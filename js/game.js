// ================= GAME ENGINE =================
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.running = false;
    this.speed = 1; this.paused = false;
    this.onEvent = () => {};
    this._raf = null;
    this._lastT = 0;
  }

  // ---------- setup ----------
  loadMap(mapIndex) {
    const map = MAPS[mapIndex];
    this.map = map; this.mapIndex = mapIndex;
    this.cols = map.cols; this.rows = map.rows;
    this.path = map.path.slice().map(p => ({ x: p.x + 0.5, y: p.y + 0.5 }));
    this.waves = generateWaves(map);
    this.gold = map.startGold; this.lives = map.lives;
    this.time = 0;
    this.towers = []; this.enemies = []; this.projectiles = []; this.beams = [];
    this.heroes = []; this.bullets = []; this.shells = []; this.muzzles = [];
    this.particles = new ParticleSystem(); this.floats = [];
    this.waveIndex = 0; this.waveActive = false; this.spawnQueue = [];
    this.selectedBuild = null; // tower id chosen from tray
    this.selectedHero = null;  // hero id chosen from roster (deploy mode)
    this.selectedUnit = null;  // placed hero under inspection
    this.selectedTower = null; // placed tower under inspection
    this.hoverTile = null;
    this.state = 'building'; // building | wave | won | lost
    this.buildNodes = this.computeBuildNodes();
    this.pathTiles = this.computePathTiles();
    // active abilities: cooldown timers (seconds). 0 = ready.
    this.abilities = {
      strike: { cd: 0, max: 25, radius: 2.2, dmg: 260, name: 'Orbital Strike' },
      freeze: { cd: 0, max: 40, dur: 3.0, name: 'Cryo Pulse' },
    };
    this.armedAbility = null; // 'strike' when player is aiming a targeted ability
    this.bossIntro = 0; // countdown timer for boss intro banner
    this.stars = this.makeStars(70);
    this.resize();
    this.speed = 1; this.paused = false;
    this.emit();
  }

  makeStars(n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        x: Math.random(), y: Math.random(),
        z: U.rand(0.3, 1),           // depth -> parallax + size
        tw: Math.random() * Math.PI * 2, // twinkle phase
      });
    }
    return arr;
  }

  // ---------- active abilities ----------
  abilityReady(id) { return this.abilities[id] && this.abilities[id].cd <= 0 && this.state !== 'won' && this.state !== 'lost'; }

  armAbility(id) {
    if (!this.abilityReady(id)) return false;
    if (id === 'strike') {
      // targeted: enter aiming mode, actual cast happens on map tap
      this.armedAbility = (this.armedAbility === 'strike') ? null : 'strike';
      this.selectedBuild = null; this.selectedTower = null;
      this.emit();
      return true;
    }
    if (id === 'freeze') { this.castFreeze(); return true; }
    return false;
  }

  castStrike(x, y) {
    const a = this.abilities.strike;
    if (a.cd > 0) return;
    a.cd = a.max;
    this.armedAbility = null;
    this.shake = 0.7;
    Sound.shoot('splash'); Sound.bossSpawn();
    this.particles.ring(x, y, '#ffab5e', a.radius);
    this.particles.burst(x, y, '#ffab5e', 40, 6, 'spark', 0.7, 0.22);
    this.particles.burst(x, y, '#fff', 20, 4, 'spark', 0.5, 0.16);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = U.dist(x, y, e.x, e.y);
      if (d <= a.radius) {
        const falloff = 1 - (d / a.radius) * 0.4;
        e.damage(a.dmg * falloff, { trueDmg: true });
      }
    }
    this.emit();
  }

  castFreeze() {
    const a = this.abilities.freeze;
    if (a.cd > 0) return;
    a.cd = a.max;
    Sound.shoot('aoe-slow');
    const end = this.path[this.path.length - 1];
    this.particles.ring(this.cols / 2, this.rows / 2, '#8fdcff', Math.max(this.cols, this.rows) / 2);
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.freeze(a.dur);
      this.particles.burst(e.x, e.y, '#8fdcff', 6, 1.5, 'dot', 0.5, 0.1);
    }
    this.emit();
  }

  computePathTiles() {
    // mark all tiles the path crosses so we don't place towers on them
    const set = new Set();
    const pts = this.map.path;
    for (let i = 0; i < pts.length - 1; i++) {
      let { x: x1, y: y1 } = pts[i], { x: x2, y: y2 } = pts[i + 1];
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(U.lerp(x1, x2, s / steps));
        const y = Math.round(U.lerp(y1, y2, s / steps));
        set.add(x + ',' + y);
        // widen path by 0 (keep single tile) — nodes are placed adjacent
      }
    }
    return set;
  }

  computeBuildNodes() {
    // build nodes = tiles adjacent to path but not on path, inside grid
    const pathSet = new Set();
    const pts = this.map.path;
    for (let i = 0; i < pts.length - 1; i++) {
      let { x: x1, y: y1 } = pts[i], { x: x2, y: y2 } = pts[i + 1];
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      for (let s = 0; s <= steps; s++) {
        pathSet.add(Math.round(U.lerp(x1, x2, s / steps)) + ',' + Math.round(U.lerp(y1, y2, s / steps)));
      }
    }
    const nodes = [];
    const seen = new Set();
    for (const key of pathSet) {
      const [px, py] = key.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const x = px + dx, y = py + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        const k = x + ',' + y;
        if (pathSet.has(k) || seen.has(k)) continue;
        seen.add(k); nodes.push({ x, y });
      }
    }
    return nodes;
  }

  isBuildNode(x, y) { return this.buildNodes.some(n => n.x === x && n.y === y); }
  towerAt(x, y) { return this.towers.find(t => t.tx === x && t.ty === y); }

  // ---------- sizing ----------
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availW = window.innerWidth;
    const availH = window.innerHeight;
    // fit grid into screen, leave HUD/tray margins
    const marginTop = 56, marginBottom = 96;
    const usableH = availH - marginTop - marginBottom;
    const scaleX = availW / this.cols;
    const scaleY = usableH / this.rows;
    this.s = Math.floor(Math.min(scaleX, scaleY));
    this.s = U.clamp(this.s, 24, 90);
    const w = this.cols * this.s, h = this.rows * this.s;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = w; this.viewH = h;
  }

  // ---------- input mapping ----------
  screenToTile(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / this.s;
    const y = (clientY - rect.top) / this.s;
    return { x: Math.floor(x), y: Math.floor(y), fx: x, fy: y };
  }

  // ---------- economy ----------
  spendGold(n) { this.gold -= n; this.emit(); }
  addGold(n) { this.gold += n; this.emit(); }

  // ---------- build / interact ----------
  tryBuild(tx, ty) {
    if (!this.selectedBuild) return false;
    if (!this.isBuildNode(tx, ty)) { Sound.error && Sound.error(); this.toast('Place on a glowing ⬡ node'); return false; }
    if (this.towerAt(tx, ty)) { Sound.error && Sound.error(); this.toast('That node is occupied'); return false; }
    const def = TOWERS[this.selectedBuild];
    if (this.gold < def.cost) { Sound.error && Sound.error(); this.toast('Not enough gold (need ' + def.cost + ' ⬢)'); return false; }
    this.spendGold(def.cost);
    const t = new Tower(this.selectedBuild, tx, ty, this);
    this.towers.push(t);
    Sound.build();
    this.particles.ring(t.x, t.y, def.color, 0.7);
    this.particles.burst(t.x, t.y, def.color, 12, 3, 'spark', 0.5);
    return true;
  }

  selectTowerAt(tx, ty) {
    const t = this.towerAt(tx, ty);
    this.selectedTower = t || null;
    this.emit();
    return t;
  }

  sellSelected() {
    if (!this.selectedTower) return;
    const t = this.selectedTower;
    this.addGold(t.sellValue);
    this.particles.burst(t.x, t.y, '#ffcf4d', 14, 3, 'spark', 0.5);
    this.towers = this.towers.filter(x => x !== t);
    this.selectedTower = null;
    this.emit();
  }

  // ---------- heroes ----------
  heroAt(fx, fy, ignore) {
    let best = null, bd = 0.55 * 0.55; // within ~half a tile
    for (const h of this.heroes) {
      if (h === ignore || h.dead) continue;
      const d2 = U.dist2(fx, fy, h.x, h.y);
      if (d2 <= bd) { bd = d2; best = h; }
    }
    return best;
  }

  deployHero(tile) {
    if (!this.selectedHero) return false;
    const def = HEROES[this.selectedHero];
    if (this.gold < def.cost) { Sound.error && Sound.error(); this.toast('Not enough gold (need ' + def.cost + ' ⬢)'); return false; }
    const fx = U.clamp(tile.fx, 0.4, this.cols - 0.4);
    const fy = U.clamp(tile.fy, 0.4, this.rows - 0.4);
    // don't stack directly on another hero
    if (this.heroAt(fx, fy)) { Sound.error && Sound.error(); this.toast('Too close to another hero'); return false; }
    this.spendGold(def.cost);
    const h = new Hero(this.selectedHero, fx, fy, this);
    this.heroes.push(h);
    Sound.deploy();
    this.particles.ring(fx, fy, def.color, 0.7);
    this.particles.burst(fx, fy, def.color, 12, 3, 'spark', 0.5);
    return true;
  }

  // Attempt to fuse `hero` with an overlapping same-rank hero into the next weapon.
  tryMergeHeroes(hero) {
    if (!hero || hero.dead) return false;
    const partner = this.heroes.find(h =>
      h !== hero && !h.dead && h.id === hero.id &&
      U.dist(h.x, h.y, hero.x, hero.y) <= 0.6);
    if (!partner) return false;
    const nextId = hero.def.mergeTo;
    if (!nextId) { this.toast(hero.def.weapon + ' is max rank'); return false; }
    // consume both, create fused hero at the drop position
    const fx = hero.x, fy = hero.y;
    this.heroes = this.heroes.filter(h => h !== hero && h !== partner);
    const fused = new Hero(nextId, fx, fy, this);
    fused.mergeGlow = 1; fused.spawnAnim = 0.5;
    // carry a little cost value forward for sell value
    fused.totalCost = hero.totalCost + partner.totalCost;
    this.heroes.push(fused);
    this.selectedUnit = fused;
    Sound.merge();
    this.shake = 0.35;
    this.particles.ring(fx, fy, fused.def.color, 1.2);
    this.particles.burst(fx, fy, fused.def.color, 28, 4, 'spark', 0.7, 0.18);
    this.particles.burst(fx, fy, '#ffffff', 14, 3, 'spark', 0.5, 0.12);
    this.toast('Fused → ' + fused.def.weapon + '!');
    this.emit();
    return true;
  }

  sellSelectedUnit() {
    if (!this.selectedUnit) return;
    const h = this.selectedUnit;
    this.addGold(h.sellValue);
    this.particles.burst(h.x, h.y, '#ffcf4d', 14, 3, 'spark', 0.5);
    this.heroes = this.heroes.filter(x => x !== h);
    this.selectedUnit = null;
    this.emit();
  }

  // ---------- coin level-up (works for both Tower and Hero units) ----------
  levelUpUnit(unit) {
    if (!unit) return false;
    const cost = unit.levelUpCost ? unit.levelUpCost() : null;
    if (cost == null) { this.toast('Max level'); return false; }
    if (Store.getCoins() < cost) { this.toast('Not enough coins — watch an ad!'); return false; }
    Store.spendCoins(cost);
    unit.level += 1;
    if (unit.recompute) unit.recompute(); else if (unit.applyLevel) unit.applyLevel();
    unit.levelPulse = 0.5;
    Sound.upgrade();
    this.particles.ring(unit.x, unit.y, '#35e0d0', 1.0);
    this.particles.burst(unit.x, unit.y, '#35e0d0', 18, 3, 'spark', 0.6);
    this.particles.burst(unit.x, unit.y, '#ffcf4d', 10, 3, 'spark', 0.5);
    this.toast(unit.def.name + ' → Level ' + unit.level + '!');
    this.emit();
    return true;
  }

  // ---------- waves ----------
  startWave() {
    if (this.waveActive || this.state !== 'building') return;
    if (this.waveIndex >= this.waves.length) return;
    const wave = this.waves[this.waveIndex];
    this.waveActive = true; this.state = 'wave';
    this.spawnQueue = [];
    let clock = 0;
    for (const g of wave.groups) {
      let t = (g.delay || 0);
      for (let i = 0; i < g.count; i++) {
        this.spawnQueue.push({ time: t, type: g.type });
        t += g.gap;
      }
    }
    this.spawnQueue.sort((a, b) => a.time - b.time);
    this._waveClock = 0;
    if (wave.isBoss) { Sound.bossSpawn(); this.bossIntro = 2.4; this.shake = 0.6; }
    else Sound.waveStart();
    this.emit();
  }

  spawnAt(type, x, y, pathIndex, t) {
    const e = new Enemy(type, this);
    e.x = x; e.y = y; e.pathIndex = pathIndex || 0; e.t = t || 0;
    this.enemies.push(e);
  }

  onEnemyKilled(e) {
    this.addGold(e.gold);
    this.particles.burst(e.x, e.y, e.color, e.boss ? 40 : 12, e.boss ? 5 : 3, 'spark', 0.6, e.boss ? 0.25 : 0.14);
    if (e.boss) { this.shake = 0.8; this.particles.ring(e.x, e.y, e.color, 3); Sound.bossDown && Sound.bossDown(); }
    else Sound.kill();
    // split on death
    if (e.def.splitOnDeath) {
      for (let i = 0; i < 3; i++) this.spawnAt(e.def.splitOnDeath, e.x, e.y, e.pathIndex, e.t);
    }
  }

  onEnemyLeaked(e) {
    // Boss leaks hurt a lot but shouldn't instantly end the run: scale to ~25%
    // of the map's starting lives instead of a flat 10.
    const dmg = e.boss ? Math.max(3, Math.round(this.map.lives * 0.25)) : 1;
    this.lives -= dmg;
    this.shake = e.boss ? 0.7 : 0.25;
    Sound.hitCore();
    const end = this.path[this.path.length - 1];
    this.particles.burst(end.x, end.y, '#ff5470', 16, 3, 'spark', 0.5);
    this.addFloat(end.x, end.y, '-' + dmg + ' ❤', '#ff5470');
    if (e.boss) this.toast('The ' + e.def.name + ' reached your Core! −' + dmg + ' lives');
    this.emit();
    if (this.lives <= 0) { this.lives = 0; this.lose(); }
  }

  addFloat(x, y, text, color) { this.floats.push(new FloatText(x, y, text, color)); }
  toast(msg) { this.onEvent({ type: 'toast', msg }); }
  emit() { this.onEvent({ type: 'stats' }); }

  win() {
    if (this.state === 'won' || this.state === 'lost') return;
    this.state = 'won'; Sound.win();
    const stars = this.lives >= this.map.lives ? 3 : this.lives >= this.map.lives * 0.5 ? 2 : 1;
    this.onEvent({ type: 'won', stars });
  }
  lose() {
    if (this.state === 'won' || this.state === 'lost') return;
    this.state = 'lost'; Sound.lose();
    this.onEvent({ type: 'lost' });
  }

  // ---------- loop ----------
  // Fixed-timestep simulation with an accumulator. Gameplay always advances in
  // constant STEP-sized ticks so behaviour is identical at any frame rate; the
  // speed multiplier simply runs more ticks per real second. Rendering happens
  // once per animation frame with the latest state.
  start() {
    this.running = true; this._lastT = performance.now();
    this._accum = 0;
    this.STEP = 1 / 60;               // fixed simulation step (seconds)
    const MAX_FRAME = 0.1;            // clamp huge gaps (tab resume) to avoid spiral-of-death
    const MAX_TICKS = 8;              // never run more than this many sim steps per frame
    const loop = (now) => {
      if (!this.running) return;
      let frame = (now - this._lastT) / 1000; this._lastT = now;
      if (frame > MAX_FRAME) frame = MAX_FRAME;   // dropped time after suspension is discarded, not fast-forwarded
      if (this.map) {
        const simulating = !this.paused && this.state !== 'won' && this.state !== 'lost';
        if (simulating) {
          this._accum += frame * this.speed;
          let ticks = 0;
          while (this._accum >= this.STEP && ticks < MAX_TICKS * this.speed) {
            this.update(this.STEP);
            this._accum -= this.STEP;
            ticks++;
          }
          // if we hit the tick ceiling, drop the backlog so we don't spiral
          if (this._accum > this.STEP) this._accum = 0;
        } else {
          this._accum = 0;
        }
        this.render();
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    // Pause simulation timing when the tab is hidden so returning doesn't lurch.
    this._onVis = () => { if (document.hidden) { this._accum = 0; } this._lastT = performance.now(); };
    document.addEventListener('visibilitychange', this._onVis);
  }
  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._onVis) { document.removeEventListener('visibilitychange', this._onVis); this._onVis = null; }
  }

  update(dt) {
    this.time += dt;
    if (this.shake > 0) this.shake -= dt;
    if (this.bossIntro > 0) this.bossIntro -= dt;

    // tick ability cooldowns
    let abReady = false;
    for (const k in this.abilities) {
      const a = this.abilities[k];
      if (a.cd > 0) { a.cd = Math.max(0, a.cd - dt); if (a.cd === 0) abReady = true; }
    }
    if (abReady) this.emit();

    // spawn from queue
    if (this.waveActive) {
      this._waveClock += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].time <= this._waveClock) {
        const s = this.spawnQueue.shift();
        this.enemies.push(new Enemy(s.type, this));
      }
    }

    for (const t of this.towers) t.update(dt);
    for (const h of this.heroes) h.update(dt);
    for (const e of this.enemies) e.update(dt);
    for (const p of this.projectiles) p.update(dt);
    for (const b of this.bullets) b.update(dt);
    for (const sh of this.shells) sh.update(dt);
    for (const b of this.beams) b.life -= dt;
    for (const mz of this.muzzles) mz.life -= dt;
    this.particles.update(dt);
    for (const f of this.floats) f.update(dt);

    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.bullets = this.bullets.filter(b => !b.dead);
    this.shells = this.shells.filter(sh => !sh.dead);
    this.beams = this.beams.filter(b => b.life > 0);
    this.muzzles = this.muzzles.filter(mz => mz.life > 0);
    this.floats = this.floats.filter(f => !f.dead);
    const wasEnemies = this.enemies.length;
    this.enemies = this.enemies.filter(e => !e.dead);

    // wave end check
    if (this.waveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      this.waveIndex++;
      const bonus = 30 + this.waveIndex * 8;
      this.addGold(bonus);
      if (this.waveIndex >= this.waves.length) { this.win(); }
      else { this.state = 'building'; Sound.waveClear && Sound.waveClear(); this.toast('Wave cleared!  +' + bonus + ' ⬢  ·  Build & upgrade, then Start Wave'); }
      this.emit();
    }
  }

  // ---------- render ----------
  render() {
    const ctx = this.ctx, s = this.s;
    ctx.save();
    if (this.shake > 0) {
      const m = this.shake * s * 0.3;
      ctx.translate(U.rand(-m, m), U.rand(-m, m));
    }
    // background
    const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
    g.addColorStop(0, this.map.bg[0]); g.addColorStop(1, this.map.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(-20, -20, this.viewW + 40, this.viewH + 40);

    // parallax starfield
    for (const st of this.stars) {
      const drift = (this.time * 6 * st.z) % (this.viewW + 20);
      const sx = ((st.x * this.viewW) - drift + this.viewW + 20) % (this.viewW + 20) - 10;
      const sy = st.y * this.viewH;
      const tw = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(this.time * 2 * st.z + st.tw));
      ctx.globalAlpha = tw * st.z;
      ctx.fillStyle = st.z > 0.75 ? '#bcd0ff' : '#5b6b9a';
      const r = st.z * s * 0.05;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,.03)'; ctx.lineWidth = 1;
    for (let x = 0; x <= this.cols; x++) { ctx.beginPath(); ctx.moveTo(x * s, 0); ctx.lineTo(x * s, this.viewH); ctx.stroke(); }
    for (let y = 0; y <= this.rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * s); ctx.lineTo(this.viewW, y * s); ctx.stroke(); }

    this.drawPath(ctx, s);
    this.drawBuildNodes(ctx, s);

    // range preview for build placement
    if (this.selectedBuild && this.hoverTile) {
      const def = TOWERS[this.selectedBuild];
      const valid = this.isBuildNode(this.hoverTile.x, this.hoverTile.y) && !this.towerAt(this.hoverTile.x, this.hoverTile.y);
      const cx = (this.hoverTile.x + 0.5) * s, cy = (this.hoverTile.y + 0.5) * s;
      ctx.globalAlpha = 0.12; ctx.fillStyle = valid ? def.color : '#ff5470';
      ctx.beginPath(); ctx.arc(cx, cy, def.base.range * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = valid ? def.color : '#ff5470'; ctx.lineWidth = s * 0.05;
      ctx.strokeRect(this.hoverTile.x * s + 2, this.hoverTile.y * s + 2, s - 4, s - 4);
      ctx.globalAlpha = 1;
    }

    // selected tower range
    if (this.selectedTower) this.selectedTower.drawRange(ctx, s);

    // orbital strike aiming reticle
    if (this.armedAbility === 'strike' && this.hoverTile) {
      const a = this.abilities.strike;
      const cx = (this.hoverTile.x + 0.5) * s, cy = (this.hoverTile.y + 0.5) * s;
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffab5e';
      ctx.beginPath(); ctx.arc(cx, cy, a.radius * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7; ctx.strokeStyle = '#ffab5e'; ctx.lineWidth = s * 0.05;
      ctx.beginPath(); ctx.arc(cx, cy, a.radius * s, 0, Math.PI * 2); ctx.stroke();
      // crosshair
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3, cy); ctx.lineTo(cx + s * 0.3, cy);
      ctx.moveTo(cx, cy - s * 0.3); ctx.lineTo(cx, cy + s * 0.3);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // core marker at path end
    const end = this.path[this.path.length - 1];
    ctx.save(); ctx.translate(end.x * s, end.y * s); ctx.rotate(this.time);
    ctx.strokeStyle = '#35e0d0'; ctx.lineWidth = s * 0.06; ctx.globalAlpha = 0.8;
    ctx.strokeRect(-s * 0.28, -s * 0.28, s * 0.56, s * 0.56);
    ctx.restore(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#35e0d0'; ctx.beginPath(); ctx.arc(end.x * s, end.y * s, s * 0.16, 0, Math.PI * 2); ctx.fill();

    // entities
    for (const t of this.towers) t.draw(ctx, s);
    for (const sh of this.shells) sh.draw(ctx, s);
    for (const h of this.heroes) h.draw(ctx, s);
    for (const e of this.enemies) e.draw(ctx, s);
    for (const p of this.projectiles) p.draw(ctx, s);
    for (const b of this.bullets) b.draw(ctx, s);

    // beams
    for (const b of this.beams) {
      ctx.globalAlpha = U.clamp(b.life / 0.15, 0, 1);
      ctx.strokeStyle = b.color; ctx.lineWidth = s * 0.08 * ctx.globalAlpha;
      ctx.shadowColor = b.color; ctx.shadowBlur = s * 0.3;
      ctx.beginPath(); ctx.moveTo(b.x1 * s, b.y1 * s); ctx.lineTo(b.x2 * s, b.y2 * s); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    // muzzle flash glints
    for (const mz of this.muzzles) {
      ctx.globalAlpha = U.clamp(mz.life / 0.06, 0, 1);
      ctx.fillStyle = '#fff2a8'; ctx.shadowColor = mz.color; ctx.shadowBlur = s * 0.4;
      ctx.beginPath(); ctx.arc(mz.x * s, mz.y * s, s * 0.14 * mz.size, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    // selected hero range + deploy preview
    if (this.selectedUnit && !this.selectedUnit.dead) this.selectedUnit.drawRange(ctx, s);
    if (this.selectedHero && this.hoverTile) {
      const def = HEROES[this.selectedHero];
      const cx = U.clamp(this.hoverTile.fx, 0.4, this.cols - 0.4) * s;
      const cy = U.clamp(this.hoverTile.fy, 0.4, this.rows - 0.4) * s;
      ctx.globalAlpha = 0.12; ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(cx, cy, def.stats.range * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = def.color; ctx.lineWidth = s * 0.04;
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    this.particles.draw(ctx, s);
    for (const f of this.floats) f.draw(ctx, s);

    // boss intro banner (dramatic sweep)
    if (this.bossIntro > 0) {
      const p = this.bossIntro; // 2.4 -> 0
      const bossName = this.waves[this.waveIndex] && ENEMIES[this.waves[this.waveIndex].groups[0].type]
        ? ENEMIES[this.waves[this.waveIndex].groups[0].type].name : 'BOSS';
      const cy = this.viewH / 2;
      const bh = this.viewH * 0.24;
      // slide in/out alpha
      const alpha = U.clamp(p > 2.0 ? (2.4 - p) / 0.4 : p / 0.6, 0, 1);
      ctx.globalAlpha = alpha * 0.85;
      const grad = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
      grad.addColorStop(0, 'rgba(255,84,112,0)');
      grad.addColorStop(0.5, 'rgba(120,10,30,0.92)');
      grad.addColorStop(1, 'rgba(255,84,112,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, cy - bh / 2, this.viewW, bh);
      // top/bottom danger lines with scroll
      ctx.strokeStyle = 'rgba(255,84,112,' + alpha + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, cy - bh / 2); ctx.lineTo(this.viewW, cy - bh / 2);
      ctx.moveTo(0, cy + bh / 2); ctx.lineTo(this.viewW, cy + bh / 2); ctx.stroke();
      // text
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff5470';
      ctx.font = `900 ${Math.round(s * 0.34)}px system-ui`;
      ctx.fillText('⚠  WARNING  ⚠', this.viewW / 2, cy - s * 0.34);
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.round(s * 0.7)}px system-ui`;
      ctx.fillText(bossName.toUpperCase(), this.viewW / 2, cy + s * 0.15);
      ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  drawPath(ctx, s) {
    const pts = this.path;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // outer
    ctx.strokeStyle = this.map.pathColor; ctx.lineWidth = s * 0.86;
    ctx.beginPath(); ctx.moveTo(pts[0].x * s, pts[0].y * s);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * s, pts[i].y * s);
    ctx.stroke();
    // inner
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = s * 0.5;
    ctx.beginPath(); ctx.moveTo(pts[0].x * s, pts[0].y * s);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * s, pts[i].y * s);
    ctx.stroke();
    // animated flow dashes
    ctx.strokeStyle = 'rgba(53,224,208,.25)'; ctx.lineWidth = s * 0.08;
    ctx.setLineDash([s * 0.3, s * 0.5]); ctx.lineDashOffset = -this.time * s * 2;
    ctx.beginPath(); ctx.moveTo(pts[0].x * s, pts[0].y * s);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * s, pts[i].y * s);
    ctx.stroke(); ctx.setLineDash([]);
  }

  drawBuildNodes(ctx, s) {
    for (const n of this.buildNodes) {
      if (this.towerAt(n.x, n.y)) continue;
      const cx = (n.x + 0.5) * s, cy = (n.y + 0.5) * s;
      ctx.globalAlpha = this.selectedBuild ? 0.6 : 0.22;
      ctx.strokeStyle = '#6a5cff'; ctx.lineWidth = s * 0.03;
      // hexagon marker
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const x = cx + Math.cos(a) * s * 0.26, y = cy + Math.sin(a) * s * 0.26;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
