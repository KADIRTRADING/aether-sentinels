// ================= ENTITIES =================

class Enemy {
  constructor(type, game) {
    const d = ENEMIES[type];
    this.type = type; this.def = d; this.game = game;
    // Bosses scale with the map so the same boss type is a stiffer fight on a
    // harder map (Hard and Extreme share the Void Colossus).
    const hpMul = (d.boss && game.map && game.map.bossHpMul) ? game.map.bossHpMul : 1;
    this.maxHp = Math.round(d.hp * hpMul); this.hp = this.maxHp;
    this.baseSpeed = d.speed; this.armor = d.armor || 0;
    this.r = d.r; this.color = d.color; this.gold = d.gold;
    this.boss = !!d.boss;
    this.pathIndex = 0; this.t = 0; // progress along current segment
    this.dead = false; this.reachedEnd = false;
    this.slowFactor = 1; this.slowTimer = 0;
    this.frozen = 0;
    this.dots = []; // {dps, time, pct}
    this.healCd = 0; this.spawnCd = d.spawnEvery || 0; this.spawnCount = 0;
    this.hitFlash = 0;
    this.dist = 0; // total distance traveled (for targeting "first")
    // set start position
    const p = game.path[0];
    this.x = p.x; this.y = p.y;
  }

  get speed() {
    if (this.frozen > 0) return 0;
    return this.baseSpeed * this.slowFactor;
  }

  applySlow(factor, dur) {
    // take the strongest slow
    if (factor < this.slowFactor || this.slowTimer <= 0) { this.slowFactor = factor; }
    this.slowTimer = Math.max(this.slowTimer, dur);
  }
  freeze(dur) { this.frozen = Math.max(this.frozen, dur); }

  // Drag the enemy backwards along the path by `amount` tiles (Graviton Well).
  // Walks segments in reverse so it works across corners, and can never push an
  // enemy behind the spawn point.
  pullBack(amount) {
    const path = this.game.path;
    let left = Math.max(0, amount);
    while (left > 0 && (this.pathIndex > 0 || this.t > 0)) {
      const a = path[this.pathIndex], b2 = path[this.pathIndex + 1] || a;
      const segLen = U.dist(a.x, a.y, b2.x, b2.y) || 0.0001;
      const backOnSeg = this.t * segLen;              // distance travelled into this segment
      if (backOnSeg >= left) { this.t -= left / segLen; left = 0; }
      else {
        left -= backOnSeg;
        if (this.pathIndex === 0) { this.t = 0; break; }
        this.pathIndex--;
        this.t = 1;
      }
    }
    this.t = U.clamp(this.t, 0, 1);
    this.dist = Math.max(0, this.dist - amount);
    const na = path[this.pathIndex], nb = path[this.pathIndex + 1] || na;
    this.x = U.lerp(na.x, nb.x, this.t);
    this.y = U.lerp(na.y, nb.y, this.t);
    this.pulled = 0.3;   // brief visual marker
  }

  applyDot(dps, dur, pct) { this.dots.push({ dps, time: dur, pct: pct || 0 }); }

  damage(amount, opts = {}) {
    if (this.dead) return 0;
    // dodge (phantom)
    if (this.def.dodge && !opts.trueDmg && Math.random() < this.def.dodge) {
      this.game.addFloat(this.x, this.y, 'miss', '#b0b7d6');
      return 0;
    }
    let dmg = amount;
    // armor (piercing ignores portion)
    if (!opts.pierce) dmg = Math.max(1, dmg - this.armor * (opts.armorMul != null ? opts.armorMul : 1));
    // boss resist
    if (this.def.resist && !opts.trueDmg) dmg *= (1 - this.def.resist);
    if (opts.bossBonus && this.boss) dmg *= (1 + opts.bossBonus);
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.hitFlash = 0.12;
    if (this.hp <= 0) { this.die(); }
    return dmg;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.game.onEnemyKilled(this);
  }

  update(dt) {
    if (this.dead) return;
    // status timers
    if (this.slowTimer > 0) { this.slowTimer -= dt; if (this.slowTimer <= 0) this.slowFactor = 1; }
    if (this.frozen > 0) this.frozen -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // DoT
    if (this.dots.length) {
      let total = 0;
      for (const d of this.dots) {
        let tick = d.dps * dt;
        if (d.pct) tick += this.maxHp * d.pct * dt;
        total += tick;
        d.time -= dt;
      }
      this.dots = this.dots.filter(d => d.time > 0);
      if (total > 0) { this.hp -= total; if (this.hp <= 0) this.die(); }
    }

    // healer aura
    if (this.def.heal && !this.dead) {
      this.healCd -= dt;
      if (this.healCd <= 0) {
        this.healCd = 1.0;
        for (const e of this.game.enemies) {
          if (e === this || e.dead) continue;
          if (U.dist(this.x, this.y, e.x, e.y) <= this.def.healRange && e.hp < e.maxHp) {
            e.hp = Math.min(e.maxHp, e.hp + this.def.heal);
            this.game.particles.burst(e.x, e.y, '#6bffb0', 3, 1.2, 'dot', 0.4, 0.08);
          }
        }
      }
    }
    // boss regen
    if (this.def.regen && !this.dead) { this.hp = Math.min(this.maxHp, this.hp + this.def.regen * dt); }
    // boss continuous spawns (hivemind) — capped so it cannot flood the board
    if (this.def.spawns && !this.dead) {
      this.spawnCd -= dt;
      const cap = this.def.maxSpawns != null ? this.def.maxSpawns : Infinity;
      if (this.spawnCd <= 0 && this.spawnCount < cap) {
        this.spawnCd = this.def.spawnEvery;
        this.spawnCount++;
        this.game.spawnAt(this.def.spawns, this.x, this.y, this.pathIndex, this.t);
      }
    }

    // move along path
    const path = this.game.path;
    if (this.pathIndex >= path.length - 1) { this.arrive(); return; }
    const a = path[this.pathIndex], b = path[this.pathIndex + 1];
    const segLen = U.dist(a.x, a.y, b.x, b.y) || 0.0001;
    const step = (this.speed * dt) / segLen;
    this.t += step;
    this.dist += this.speed * dt;
    while (this.t >= 1) {
      this.t -= 1; this.pathIndex++;
      if (this.pathIndex >= path.length - 1) { this.arrive(); return; }
    }
    const na = path[this.pathIndex], nb = path[this.pathIndex + 1];
    this.x = U.lerp(na.x, nb.x, this.t);
    this.y = U.lerp(na.y, nb.y, this.t);
  }

  arrive() {
    if (this.dead) return;
    this.reachedEnd = true; this.dead = true;
    this.game.onEnemyLeaked(this);
  }

  draw(ctx, s) {
    const px = this.x * s, py = this.y * s, r = this.r * s;
    // shadow
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(px, py + r * 0.7, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // body
    let col = this.color;
    if (this.hitFlash > 0) col = '#ffffff';
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    if (this.boss) {
      // spiky boss shape
      const spikes = 8;
      for (let i = 0; i < spikes * 2; i++) {
        const ang = (i / (spikes * 2)) * Math.PI * 2;
        const rr = i % 2 ? r * 0.72 : r;
        const x = px + Math.cos(ang) * rr, y = py + Math.sin(ang) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else {
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.stroke();

    // frozen overlay
    if (this.frozen > 0) { ctx.fillStyle = 'rgba(140,220,255,.5)'; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); }
    else if (this.slowFactor < 1) { ctx.fillStyle = 'rgba(140,220,255,.25)'; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); }
    // poison tint
    if (this.dots.length) { ctx.fillStyle = 'rgba(140,255,110,.2)'; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); }
    // armor pips
    if (this.armor > 0 && !this.boss) {
      ctx.strokeStyle = 'rgba(200,163,255,.9)'; ctx.lineWidth = s * 0.04;
      ctx.beginPath(); ctx.arc(px, py, r * 0.55, -0.5, 2.0); ctx.stroke();
    }

    // hp bar
    const hpFrac = U.clamp(this.hp / this.maxHp, 0, 1);
    const bw = r * 2.2, bh = Math.max(3, s * 0.07);
    const by = py - r - bh - s * 0.08;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(px - bw / 2, by, bw, bh);
    ctx.fillStyle = hpFrac > 0.5 ? '#4dffa1' : hpFrac > 0.25 ? '#ffcf4d' : '#ff5470';
    ctx.fillRect(px - bw / 2, by, bw * hpFrac, bh);
    if (this.boss) {
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(s*0.22)}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText(this.def.name, px, by - s * 0.12);
    }
  }
}

// ---------------- Projectiles ----------------
class Projectile {
  constructor(game, x, y, target, tower) {
    this.game = game; this.x = x; this.y = y; this.target = target; this.tower = tower;
    this.speed = 12; this.dead = false; this.color = tower.def.color;
  }
  update(dt) {
    if (!this.target || this.target.dead) { this.dead = true; return; }
    const d = U.dist(this.x, this.y, this.target.x, this.target.y);
    const step = this.speed * dt;
    if (d <= step) { this.hit(); this.dead = true; return; }
    this.x += (this.target.x - this.x) / d * step;
    this.y += (this.target.y - this.y) / d * step;
  }
  hit() { this.tower.onProjectileHit(this.target, this.x, this.y); }
  draw(ctx, s) {
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color; ctx.shadowBlur = s * 0.3;
    ctx.beginPath(); ctx.arc(this.x * s, this.y * s, s * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ---------------- Tower ----------------
class Tower {
  constructor(defId, tx, ty, game) {
    this.def = TOWERS[defId]; this.id = defId; this.game = game;
    this.tx = tx; this.ty = ty; // tile coords
    this.x = tx + 0.5; this.y = ty + 0.5;
    this.tier = 0; // 0 = base, up to 3
    this.level = 1; // coin-paid level (independent of gold-tier); boosts stats + swaps image
    this.stats = Object.assign({}, this.def.base);
    this.cooldown = 0; this.angle = -Math.PI / 2;
    this.totalCost = this.def.cost;
    this.targetMode = 'first'; // first | last | strong | close
    this.recompute();
    this.pulse = 0; this.recoil = 0; this.levelPulse = 0;
  }

  cycleTargetMode() {
    const modes = ['first', 'last', 'strong', 'close'];
    this.targetMode = modes[(modes.indexOf(this.targetMode) + 1) % modes.length];
    return this.targetMode;
  }

  // coin level-up: multiply stats and (optionally) swap image
  levelUpCost() {
    const lu = (Assets.cfg().levelUp) || { costs: [50], maxLevel: 6 };
    if (this.level >= (lu.maxLevel || 6)) return null;
    const costs = lu.costs || [50];
    return costs[Math.min(this.level - 1, costs.length - 1)];
  }
  applyLevel() {
    const lu = (Assets.cfg().levelUp) || {};
    const extra = this.level - 1;
    this._levelDmgMul = 1 + extra * (lu.dmgPerLevel || 0.35);
    this._levelRateMul = 1 + extra * (lu.ratePerLevel || 0.06);
  }

  recompute() {
    // start from base then apply each purchased tier mod
    const s = Object.assign({}, this.def.base);
    for (let i = 0; i < this.tier; i++) {
      const mod = this.def.tiers[i].mod;
      for (const k in mod) s[k] = (s[k] || 0) + mod[k];
    }
    // apply coin-level multipliers
    this.applyLevel();
    if (s.dmg) s.dmg = Math.round(s.dmg * (this._levelDmgMul || 1));
    if (s.dot) s.dot = Math.round(s.dot * (this._levelDmgMul || 1));
    if (s.rate) s.rate = s.rate / (this._levelRateMul || 1);
    this.stats = s;
  }

  get nextTier() { return this.tier < 3 ? this.def.tiers[this.tier] : null; }
  get sellValue() { return Math.floor(this.totalCost * 0.6); }

  // Support buffs from nearby Aegis Pylons.
  // Cached per (tower, frame): buffs only change when towers are built/sold or
  // upgraded, so recomputing for every tower every frame was wasted work. The
  // cache key is the game's buffEpoch, bumped whenever the tower set changes.
  buffs() {
    const epoch = this.game.buffEpoch || 0;
    if (this._buffCache && this._buffEpoch === epoch) return this._buffCache;
    let dmgMul = 1, rateMul = 1, rangeAdd = 0;
    if (this.def.kind !== 'support') {
      const towers = this.game.towers;
      for (let i = 0; i < towers.length; i++) {
        const t = towers[i];
        if (t.def.kind !== 'support' || t === this) continue;
        if (U.dist(this.x, this.y, t.x, t.y) <= t.stats.range) {
          dmgMul += t.stats.buffDmg;
          rateMul += t.stats.buffRate;
          rangeAdd += t.stats.buffRange || 0;
        }
      }
    }
    this._buffCache = { dmgMul, rateMul, rangeAdd };
    this._buffEpoch = epoch;
    return this._buffCache;
  }

  upgrade() {
    const nt = this.nextTier; if (!nt) return false;
    if (this.game.gold < nt.cost) return false;
    this.game.spendGold(nt.cost);
    this.totalCost += nt.cost;
    this.tier++; this.recompute();
    this.game.buffEpoch = (this.game.buffEpoch || 0) + 1; // stats changed -> invalidate buff caches
    this.pulse = 0.4;
    Sound.upgrade();
    this.game.particles.ring(this.x, this.y, this.def.color, 0.8);
    this.game.particles.burst(this.x, this.y, this.def.color, 14, 3, 'spark', 0.5);
    return true;
  }

  pickTarget(range) {
    // choose target within range according to targeting mode (strategic control)
    let best = null, score = -Infinity;
    const mode = this.targetMode;
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      const d2 = U.dist2(this.x, this.y, e.x, e.y);
      if (d2 > range * range) continue;
      let s;
      switch (mode) {
        case 'last':   s = -e.dist; break;              // furthest from core (earliest on path)
        case 'strong': s = e.hp; break;                 // highest current HP
        case 'close':  s = -d2; break;                  // nearest to this tower
        case 'first':
        default:       s = e.dist; break;               // furthest along path (closest to core)
      }
      if (s > score) { score = s; best = e; }
    }
    return best;
  }

  update(dt) {
    if (this.pulse > 0) this.pulse -= dt;
    if (this.levelPulse > 0) this.levelPulse -= dt;
    if (this.recoil > 0) this.recoil -= dt * 4;
    const b = this.buffs();
    const range = this.stats.range + b.rangeAdd;
    this.cooldown -= dt;

    if (this.def.kind === 'support') { this._buffPulse = (this._buffPulse || 0) + dt; return; }

    // ---- Pyre Vent: continuous flame cone in front of the turret ----
    if (this.def.kind === 'flame') {
      const target = this.pickTarget(range);
      if (target) this.angle = U.approachAngle(this.angle, U.angleTo(this.x, this.y, target.x, target.y), dt * 9);
      this.flameOn = !!target;
      if (this.cooldown <= 0 && target) {
        this.cooldown = this.stats.rate / b.rateMul;
        const halfArc = (this.stats.arc || 0.8) / 2;
        const armorMul = this.stats.armorMul != null ? U.clamp(this.stats.armorMul, 0, 1) : 1;
        let hit = false;
        for (const e of this.game.enemies) {
          if (e.dead) continue;
          const d = U.dist(this.x, this.y, e.x, e.y);
          if (d > range + e.r) continue;
          // inside the cone?
          const a = U.angleTo(this.x, this.y, e.x, e.y);
          let da = Math.abs(((a - this.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (da > halfArc && d > 0.8) continue;   // very close enemies are always hit
          e.damage(this.stats.dmg * b.dmgMul, { armorMul });
          if (this.stats.burn) e.applyDot(this.stats.burn, this.stats.burnDur || 2, 0);
          hit = true;
        }
        if (hit) {
          if (!Assets.playFire(this.id)) Sound.flame && Sound.flame();
          const m = { x: this.x + Math.cos(this.angle) * range * 0.6, y: this.y + Math.sin(this.angle) * range * 0.6 };
          this.game.particles.burst(m.x, m.y, '#ff9d3c', 3, 2, 'spark', 0.22, 0.13);
        }
      }
      return;
    }

    // ---- Graviton Well: heavy slow plus a periodic pull back along the path ----
    if (this.def.kind === 'gravity') {
      // continuous slow inside the field
      for (const e of this.game.enemies) {
        if (e.dead) continue;
        if (U.dist(this.x, this.y, e.x, e.y) <= range) {
          e.applySlow(1 - this.stats.slow, this.stats.slowDur);
        }
      }
      if (this.cooldown <= 0) {
        this.cooldown = this.stats.rate / b.rateMul;
        let pulled = false;
        for (const e of this.game.enemies) {
          if (e.dead || e.boss) continue;               // bosses resist the pull
          if (U.dist(this.x, this.y, e.x, e.y) <= range) {
            e.pullBack(this.stats.pull);
            if (this.stats.dmg) e.damage(this.stats.dmg * b.dmgMul, { armorMul: 0.5 });
            pulled = true;
          }
        }
        if (pulled) {
          if (!Assets.playFire(this.id)) Sound.gravity && Sound.gravity();
          this.game.particles.ring(this.x, this.y, this.def.color, range * 0.85);
        }
      }
      this._spin = (this._spin || 0) + dt * 2.4;
      return;
    }

    // ---- Prism Lance: continuous beam that ramps while locked on one target ----
    if (this.def.kind === 'beam') {
      const target = this.pickTarget(range);
      if (!target) { this.beamTarget = null; this.rampT = 0; return; }
      this.angle = U.approachAngle(this.angle, U.angleTo(this.x, this.y, target.x, target.y), dt * 8);
      // reset the ramp when the beam switches target
      if (this.beamTarget !== target) { this.beamTarget = target; this.rampT = 0; }
      this.rampT = Math.min((this.rampT || 0) + dt, 60);
      if (this.cooldown <= 0) {
        this.cooldown = this.stats.rate / b.rateMul;
        const mult = Math.min(1 + this.rampT * (this.stats.ramp || 0.15), this.stats.rampMax || 3);
        const dmg = this.stats.dmg * b.dmgMul * mult;
        target.damage(dmg, { pierce: !!this.stats.pierce });
        this.game.beams.push({ x1: this.x, y1: this.y, x2: target.x, y2: target.y, life: 0.1, color: this.def.color });
        if (Math.random() < 0.35) this.game.particles.sparks(target.x, target.y, this.def.color, 2);
        if (!Assets.playFire(this.id)) { if (Math.random() < 0.25) Sound.beam && Sound.beam(); }
      }
      return;
    }

    if (this.def.kind === 'aoe-slow') {
      // continuous field: slows everything in range, ticks damage
      if (this.cooldown <= 0) {
        this.cooldown = this.stats.rate / b.rateMul;
        let hit = false;
        for (const e of this.game.enemies) {
          if (e.dead) continue;
          if (U.dist(this.x, this.y, e.x, e.y) <= range) {
            e.applySlow(1 - this.stats.slow, this.stats.slowDur);
            e.damage(this.stats.dmg * b.dmgMul, { armorMul: 0.5 });
            if (this.stats.freezeChance && Math.random() < this.stats.freezeChance) e.freeze(0.6);
            hit = true;
          }
        }
        if (hit) { if (!Assets.playFire(this.id)) Sound.shoot('aoe-slow'); this.game.particles.ring(this.x, this.y, this.def.color, range * 0.9); }
      }
      return;
    }

    // aim + fire
    const target = this.pickTarget(range);
    if (target) {
      this.angle = U.approachAngle(this.angle, U.angleTo(this.x, this.y, target.x, target.y), dt * 10);
      if (this.cooldown <= 0) {
        this.cooldown = this.stats.rate / b.rateMul;
        this.fire(target, b);
      }
    }
  }

  fire(target, b) {
    this.recoil = 1; this._buff = b;
    const customAudio = Assets.playFire(this.id); // custom fire sound overrides built-in
    // ---- Flak Battery: a spread of independent pellets ----
    // Each pellet resolves separately, so Phantom's dodge is rolled per pellet
    // and volume beats evasion — the designed counter to dodgy/fast enemies.
    if (this.def.kind === 'flak') {
      if (!customAudio) Sound.flak && Sound.flak();
      const n = Math.max(1, Math.round(this.stats.pellets || 3));
      const spread = this.stats.spread || 0.25;
      const base = U.angleTo(this.x, this.y, target.x, target.y);
      for (let i = 0; i < n; i++) {
        const frac = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;   // -1..1 across the fan
        const a = base + frac * spread;
        // pellets are short-lived hitscan rays: find the first enemy along the ray
        const reach = this.stats.range + b.rangeAdd;
        let best = null, bestD = Infinity;
        for (const e of this.game.enemies) {
          if (e.dead) continue;
          const d = U.dist(this.x, this.y, e.x, e.y);
          if (d > reach + e.r) continue;
          const ea = U.angleTo(this.x, this.y, e.x, e.y);
          const da = Math.abs(((ea - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (da < 0.18 + e.r / Math.max(0.5, d) && d < bestD) { bestD = d; best = e; }
        }
        const ex = this.x + Math.cos(a) * (best ? bestD : reach);
        const ey = this.y + Math.sin(a) * (best ? bestD : reach);
        this.game.beams.push({ x1: this.x, y1: this.y, x2: ex, y2: ey, life: 0.07, color: this.def.color });
        if (best) {
          best.damage(this.stats.dmg * b.dmgMul);
          this.game.particles.sparks(ex, ey, this.def.color, 2);
        }
      }
      this.game.addFloat(target.x, target.y, Math.round(this.stats.dmg * b.dmgMul * n * 0.6), this.def.color);
      return;
    }
    if (this.def.kind === 'sniper') {
      // hitscan
      if (!customAudio) Sound.shoot('sniper');
      const dmg = this.stats.dmg * b.dmgMul;
      target.damage(dmg, { pierce: true, bossBonus: this.stats.bossBonus || 0 });
      this.game.beams.push({ x1: this.x, y1: this.y, x2: target.x, y2: target.y, life: 0.15, color: this.def.color });
      this.game.particles.sparks(target.x, target.y, this.def.color, 6);
      this.game.addFloat(target.x, target.y, Math.round(dmg), '#ff6b9d');
    } else {
      this.game.projectiles.push(new Projectile(this.game, this.x, this.y, target, this));
      if (!customAudio) Sound.shoot(this.def.kind);
    }
  }

  onProjectileHit(target, hx, hy) {
    const b = this._buff || { dmgMul: 1 };
    const dmg = this.stats.dmg * b.dmgMul;
    if (this.def.kind === 'chain') {
      // chain lightning
      const hitSet = new Set();
      let cur = target, from = { x: this.x, y: this.y };
      let jumps = this.stats.chains + 1;
      const armorMul = this.stats.armorMul != null ? this.stats.armorMul : 1;
      for (let j = 0; j < jumps && cur; j++) {
        if (cur.dead && j > 0) break;
        cur.damage(dmg * Math.pow(0.85, j), { armorMul });
        if (this.stats.stun) cur.freeze(this.stats.stun);
        hitSet.add(cur);
        this.game.beams.push({ x1: from.x, y1: from.y, x2: cur.x, y2: cur.y, life: 0.12, color: this.def.color });
        this.game.particles.sparks(cur.x, cur.y, this.def.color, 4);
        from = { x: cur.x, y: cur.y };
        // find next
        let next = null, nd = this.stats.chainRange * this.stats.chainRange;
        for (const e of this.game.enemies) {
          if (e.dead || hitSet.has(e)) continue;
          const d2 = U.dist2(from.x, from.y, e.x, e.y);
          if (d2 < nd) { nd = d2; next = e; }
        }
        cur = next;
      }
      this.game.addFloat(target.x, target.y, Math.round(dmg), '#5ad1ff');
    } else if (this.def.kind === 'splash') {
      // AoE
      this.game.particles.burst(hx, hy, this.def.color, 18, 4, 'spark', 0.5, 0.14);
      this.game.particles.ring(hx, hy, this.def.color, this.stats.splash);
      Sound.shoot('splash');
      for (const e of this.game.enemies) {
        if (e.dead) continue;
        const d = U.dist(hx, hy, e.x, e.y);
        if (d <= this.stats.splash) {
          const falloff = 1 - (d / this.stats.splash) * 0.5;
          e.damage(dmg * falloff);
        }
      }
      this.game.addFloat(hx, hy, Math.round(dmg), '#ffab5e');
    } else if (this.def.kind === 'dot') {
      target.damage(dmg);
      target.applyDot(this.stats.dot, this.stats.dotDur, this.stats.dotPct || 0);
      this.game.particles.burst(hx, hy, this.def.color, 6, 2, 'dot', 0.5, 0.1);
      this.game.addFloat(hx, hy, '☣', '#8dff6b');
    } else {
      target.damage(dmg);
      this.game.particles.burst(hx, hy, this.def.color, 6, 2, 'dot', 0.4, 0.1);
    }
  }

  draw(ctx, s) {
    const px = this.x * s, py = this.y * s;
    const b = this.buffs();
    const range = this.stats.range + b.rangeAdd;
    // base platform
    ctx.fillStyle = 'rgba(20,26,46,.9)';
    ctx.strokeStyle = this.def.color; ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.arc(px, py, s * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // buff glow
    if (b.dmgMul > 1) {
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(this.game.time * 4);
      ctx.strokeStyle = '#c9a3ff'; ctx.lineWidth = s * 0.04;
      ctx.beginPath(); ctx.arc(px, py, s * 0.46, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // custom image (per level) overrides the vector turret when available
    const img = Assets.getImage(this.id, this.level);
    if (img) {
      const rec = this.recoil > 0 ? this.recoil * s * 0.06 : 0;
      ctx.save(); ctx.translate(px, py);
      if (this.def.kind !== 'support' && this.def.kind !== 'aoe-slow') ctx.rotate(this.angle + Math.PI / 2);
      const sz = s * 0.8;
      ctx.drawImage(img, -sz / 2, -sz / 2 - rec, sz, sz);
      ctx.restore();
    } else {
      // turret (vector)
      ctx.save(); ctx.translate(px, py);
      if (this.def.kind !== 'support' && this.def.kind !== 'aoe-slow') ctx.rotate(this.angle);
      const rec = this.recoil > 0 ? this.recoil * s * 0.1 : 0;
      ctx.fillStyle = this.def.color;
      if (this.def.kind === 'support') {
        ctx.rotate(this.game.time * 1.5);
        ctx.fillRect(-s * 0.16, -s * 0.16, s * 0.32, s * 0.32);
      } else if (this.def.kind === 'aoe-slow') {
        const p = 0.9 + 0.1 * Math.sin(this.game.time * 6);
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(0, 0, s * 0.22 * p, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillRect(-s * 0.08, -s * 0.34 - rec, s * 0.16, s * 0.34);
        ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // glyph (only when no custom art)
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff';
      ctx.font = `${Math.round(s * 0.34)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.def.glyph, px, py);
      ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    }

    // tier pips
    for (let i = 0; i < this.tier; i++) {
      ctx.fillStyle = '#ffcf4d';
      ctx.beginPath(); ctx.arc(px - s * 0.2 + i * s * 0.16, py + s * 0.34, s * 0.05, 0, Math.PI * 2); ctx.fill();
    }
    // coin-level badge (top-right)
    if (this.level > 1) {
      ctx.fillStyle = '#35e0d0';
      ctx.beginPath(); ctx.arc(px + s * 0.28, py - s * 0.28, s * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#04231f'; ctx.font = `bold ${Math.round(s * 0.18)}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('L' + this.level, px + s * 0.28, py - s * 0.27);
      ctx.textBaseline = 'alphabetic';
    }
    // upgrade / level pulse
    const pulseAmt = Math.max(this.pulse, this.levelPulse);
    if (pulseAmt > 0) {
      ctx.globalAlpha = pulseAmt; ctx.strokeStyle = this.levelPulse > this.pulse ? '#35e0d0' : this.def.color; ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.arc(px, py, s * 0.5 * (1.4 - pulseAmt), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawRange(ctx, s) {
    const b = this.buffs();
    const range = this.stats.range + b.rangeAdd;
    ctx.globalAlpha = 0.12; ctx.fillStyle = this.def.color;
    ctx.beginPath(); ctx.arc(this.x * s, this.y * s, range * s, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.4; ctx.strokeStyle = this.def.color; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.arc(this.x * s, this.y * s, range * s, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}


// ---------------- Hero bullet (owned by a hero) ----------------
class Bullet {
  constructor(game, x, y, angle, hero) {
    this.game = game; this.x = x; this.y = y; this.hero = hero;
    const spec = hero.def.weaponSpec;
    const spread = spec.spread || 0;
    this.angle = angle + U.rand(-spread, spread);
    this.speed = hero.stats.projSpeed || 16;
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
    this.life = 0.8; this.dead = false;
    this.rocket = spec.kind === 'rocket';
    this.tracer = spec.tracer || '#ffe08a';
    this.color = this.rocket ? hero.def.color : this.tracer;
    this.r = this.rocket ? 0.16 : 0.07;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const px = this.x, py = this.y;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.rocket) this.game.particles.burst(px, py, '#ffd0a0', 1, 0.5, 'dot', 0.25, 0.06);
    // collision vs enemies (segment-ish: check endpoint)
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      if (U.dist(this.x, this.y, e.x, e.y) <= e.r + this.r + 0.05) {
        this.hero.onBulletHit(e, this.x, this.y);
        this.dead = true;
        return;
      }
    }
    // out of bounds
    if (this.x < -1 || this.y < -1 || this.x > this.game.cols + 1 || this.y > this.game.rows + 1) this.dead = true;
  }
  draw(ctx, s) {
    const px = this.x * s, py = this.y * s;
    if (this.rocket) {
      ctx.save(); ctx.translate(px, py); ctx.rotate(this.angle);
      ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = s * 0.25;
      ctx.beginPath();
      ctx.moveTo(s * 0.18, 0); ctx.lineTo(-s * 0.12, -s * 0.09); ctx.lineTo(-s * 0.12, s * 0.09);
      ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
    } else {
      // tracer streak
      ctx.strokeStyle = this.color; ctx.lineWidth = s * 0.09;
      ctx.shadowColor = this.color; ctx.shadowBlur = s * 0.2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - this.vx * s * 0.03, py - this.vy * s * 0.03);
      ctx.stroke(); ctx.shadowBlur = 0;
    }
  }
}

// ---------------- Ejected shell casing (pure visual) ----------------
class Shell {
  constructor(x, y, angle) {
    this.x = x; this.y = y;
    const a = angle + Math.PI / 2 + U.rand(-0.4, 0.4);
    const v = U.rand(1.2, 2.4);
    this.vx = Math.cos(a) * v; this.vy = Math.sin(a) * v - 1;
    this.life = 0.5; this.max = 0.5; this.rot = Math.random() * 6;
    this.dead = false;
  }
  update(dt) {
    this.life -= dt; if (this.life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy += 6 * dt; this.vx *= 0.96; this.rot += dt * 12;
  }
  draw(ctx, s) {
    const a = U.clamp(this.life / this.max, 0, 1);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(this.x * s, this.y * s); ctx.rotate(this.rot);
    ctx.fillStyle = '#e8c66a';
    ctx.fillRect(-s * 0.03, -s * 0.06, s * 0.06, s * 0.12);
    ctx.restore(); ctx.globalAlpha = 1;
  }
}

// ---------------- Hero ----------------
class Hero {
  constructor(defId, x, y, game) {
    this.def = HEROES[defId]; this.id = defId; this.game = game;
    this.x = x; this.y = y;             // free world position (tile units)
    this.level = 1;
    this.stats = Object.assign({}, this.def.stats);
    this.applyLevel();
    this.maxHp = this.stats.hp; this.hp = this.maxHp;
    this.angle = -Math.PI / 2; this.cooldown = 0;
    this.targetMode = 'first';
    this.recoil = 0; this.barrelSpin = 0; this.spawnAnim = 0.5;
    this.dragging = false; this.dead = false;
    this.burstLeft = 0; this.burstTimer = 0; this._target = null;
    this.mergeGlow = 0; this.levelPulse = 0;
    this.totalCost = this.def.cost;
  }

  levelUpCost() {
    const lu = (Assets.cfg().levelUp) || { costs: [50], maxLevel: 6 };
    if (this.level >= (lu.maxLevel || 6)) return null;
    const costs = lu.costs || [50];
    return costs[Math.min(this.level - 1, costs.length - 1)];
  }
  applyLevel() {
    const lu = (Assets.cfg().levelUp) || {};
    const extra = this.level - 1;
    const dmgMul = 1 + extra * (lu.dmgPerLevel || 0.35);
    const hpMul = 1 + extra * (lu.hpPerLevel || 0.30);
    const rateMul = 1 + extra * (lu.ratePerLevel || 0.06);
    const base = this.def.stats;
    this.stats = Object.assign({}, base);
    if (base.dmg) this.stats.dmg = Math.round(base.dmg * dmgMul);
    if (base.hp) this.stats.hp = Math.round(base.hp * hpMul);
    if (base.rate) this.stats.rate = base.rate / rateMul;
    // scale current/max hp preserving fraction
    if (this.maxHp) { const frac = this.hp / this.maxHp; this.maxHp = this.stats.hp; this.hp = Math.round(this.maxHp * frac); }
  }

  cycleTargetMode() {
    const modes = ['first', 'last', 'strong', 'close'];
    this.targetMode = modes[(modes.indexOf(this.targetMode) + 1) % modes.length];
    return this.targetMode;
  }

  get sellValue() { return Math.floor(this.totalCost * 0.6); }

  pickTarget(range) {
    let best = null, score = -Infinity;
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      const d2 = U.dist2(this.x, this.y, e.x, e.y);
      if (d2 > range * range) continue;
      let sc;
      switch (this.targetMode) {
        case 'last':   sc = -e.dist; break;
        case 'strong': sc = e.hp; break;
        case 'close':  sc = -d2; break;
        default:       sc = e.dist; break;
      }
      if (sc > score) { score = sc; best = e; }
    }
    return best;
  }

  update(dt) {
    if (this.spawnAnim > 0) this.spawnAnim -= dt;
    if (this.recoil > 0) this.recoil -= dt * 5;
    if (this.mergeGlow > 0) this.mergeGlow -= dt;
    if (this.levelPulse > 0) this.levelPulse -= dt;
    const spec = this.def.weaponSpec;
    if (spec.spin) this.barrelSpin += dt * (this.burstLeft > 0 || this.cooldown < this.stats.rate * 0.5 ? 26 : 4);

    if (this.dragging) return; // don't fight while being repositioned

    this.cooldown -= dt;
    const range = this.stats.range;

    // continue an active burst
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0 && this._target && !this._target.dead) {
        this.angle = U.angleTo(this.x, this.y, this._target.x, this._target.y);
        this.shootOnce(this._target);
        this.burstLeft--;
        this.burstTimer = spec.burstGap || 0.05;
      } else if (!this._target || this._target.dead) {
        this.burstLeft = 0;
      }
      return;
    }

    const target = this.pickTarget(range);
    if (target) {
      this.angle = U.approachAngle(this.angle, U.angleTo(this.x, this.y, target.x, target.y), dt * 12);
      if (this.cooldown <= 0) {
        this.cooldown = this.stats.rate;
        this._target = target;
        const burst = spec.burst || 1;
        if (burst > 1) { this.burstLeft = burst; this.burstTimer = 0; }
        else this.shootOnce(target);
      }
    }
  }

  muzzlePos() {
    const spec = this.def.weaponSpec;
    const len = spec.barrelLen + 0.15;
    return { x: this.x + Math.cos(this.angle) * len, y: this.y + Math.sin(this.angle) * len };
  }

  shootOnce(target) {
    const spec = this.def.weaponSpec;
    this.recoil = 1;
    const m = this.muzzlePos();
    // muzzle flash particles
    this.game.particles.burst(m.x, m.y, '#fff2b0', 3, 1.5, 'spark', 0.14, 0.12 * (spec.flash || 0.6));
    this.game.muzzles.push({ x: m.x, y: m.y, angle: this.angle, life: 0.06, size: spec.flash || 0.6, color: this.def.color });
    // shell ejection
    if (spec.shell) this.game.shells.push(new Shell(this.x, this.y, this.angle));
    if (!Assets.playFire(this.id)) Sound.gun(spec.sound);

    if (spec.kind === 'hitscan') {
      const dmg = this.stats.dmg;
      target.damage(dmg, { pierce: !!this.stats.pierce });
      this.game.beams.push({ x1: m.x, y1: m.y, x2: target.x, y2: target.y, life: 0.14, color: spec.beam || this.def.color });
      this.game.particles.sparks(target.x, target.y, this.def.color, 6);
      this.game.addFloat(target.x, target.y, Math.round(dmg), this.def.color);
    } else {
      this.game.bullets.push(new Bullet(this.game, m.x, m.y, this.angle, this));
    }
  }

  onBulletHit(target, hx, hy) {
    const spec = this.def.weaponSpec;
    const dmg = this.stats.dmg;
    if (spec.kind === 'rocket') {
      // explosive splash
      Sound.explosion();
      this.game.shake = 0.4;
      this.game.particles.burst(hx, hy, '#ffb15e', 24, 5, 'spark', 0.6, 0.2);
      this.game.particles.ring(hx, hy, '#ffab5e', this.stats.splash);
      const rad = this.stats.splash;
      for (const e of this.game.enemies) {
        if (e.dead) continue;
        const d = U.dist(hx, hy, e.x, e.y);
        if (d <= rad) e.damage(dmg * (1 - (d / rad) * 0.5));
      }
      this.game.addFloat(hx, hy, Math.round(dmg), '#ffab5e');
    } else {
      target.damage(dmg);
      this.game.particles.burst(hx, hy, this.def.color, 4, 2, 'spark', 0.25, 0.09);
      this.game.addFloat(hx, hy, Math.round(dmg), this.def.color);
    }
  }

  // ---- rendering ----
  draw(ctx, s) {
    const px = this.x * s, py = this.y * s;
    const spawn = this.spawnAnim > 0 ? U.ease(1 - this.spawnAnim / 0.5) : 1;

    // shadow
    ctx.globalAlpha = 0.3 * spawn; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(px, py + s * 0.32, s * 0.3, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // merge glow
    if (this.mergeGlow > 0) {
      ctx.globalAlpha = this.mergeGlow; ctx.strokeStyle = this.def.color; ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.arc(px, py, s * 0.5 * (1.6 - this.mergeGlow), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // dragging indicator
    if (this.dragging) {
      ctx.globalAlpha = 0.15; ctx.fillStyle = this.def.color;
      ctx.beginPath(); ctx.arc(px, py, this.stats.range * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = this.def.color; ctx.lineWidth = s * 0.03;
      ctx.beginPath(); ctx.arc(px, py, this.stats.range * s, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(spawn, spawn);

    const img = Assets.getImage(this.id, this.level);
    if (img) {
      // custom art rotated toward target (image faces "up" by convention)
      const rec = this.recoil > 0 ? this.recoil * s * 0.08 : 0;
      ctx.save();
      ctx.rotate(this.angle + Math.PI / 2);
      const sz = s * 0.86;
      ctx.drawImage(img, -sz / 2, -sz / 2 - rec, sz, sz);
      ctx.restore();
    } else {
      // body base ring (soldier stance)
      ctx.fillStyle = 'rgba(16,22,40,.92)';
      ctx.strokeStyle = this.def.color; ctx.lineWidth = s * 0.05;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // rank chevrons
      for (let i = 0; i <= this.def.rank && i < 6; i++) {
        ctx.fillStyle = '#ffcf4d';
        ctx.beginPath(); ctx.arc(-s * 0.18 + i * s * 0.075, -s * 0.30, s * 0.028, 0, Math.PI * 2); ctx.fill();
      }

      // weapon (rotated toward target)
      ctx.save();
      ctx.rotate(this.angle);
      const rec = this.recoil > 0 ? this.recoil : 0;
      this.drawWeapon(ctx, s, rec);
      ctx.restore();

      // helmet / head on top
      ctx.fillStyle = this.def.body;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.def.color;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.10, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();

    // coin-level badge
    if (this.level > 1) {
      ctx.fillStyle = '#35e0d0';
      ctx.beginPath(); ctx.arc(px + s * 0.26, py - s * 0.26, s * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#04231f'; ctx.font = `bold ${Math.round(s * 0.16)}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('L' + this.level, px + s * 0.26, py - s * 0.25);
      ctx.textBaseline = 'alphabetic';
    }
    // level-up pulse
    if (this.levelPulse > 0) {
      ctx.globalAlpha = this.levelPulse; ctx.strokeStyle = '#35e0d0'; ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.arc(px, py, s * 0.5 * (1.4 - this.levelPulse), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // hp bar
    const frac = U.clamp(this.hp / this.maxHp, 0, 1);
    if (frac < 1) {
      const bw = s * 0.62, bh = Math.max(3, s * 0.06), by = py - s * 0.44;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(px - bw / 2, by, bw, bh);
      ctx.fillStyle = frac > 0.5 ? '#4dffa1' : frac > 0.25 ? '#ffcf4d' : '#ff5470';
      ctx.fillRect(px - bw / 2, by, bw * frac, bh);
    }
  }

  drawWeapon(ctx, s, rec) {
    const spec = this.def.weaponSpec;
    const bl = spec.barrelLen * s, bw = spec.barrelW * s;
    const back = -rec * s * 0.12; // recoil kickback along barrel

    ctx.save();
    ctx.translate(back, 0);

    if (spec.stock) { // shoulder stock behind grip
      ctx.fillStyle = '#2a2f42';
      ctx.fillRect(-s * 0.18, -bw * 0.35, s * 0.14, bw * 0.7);
    }
    // grip / receiver body
    ctx.fillStyle = this.def.body;
    ctx.fillRect(-s * 0.06, -bw * 0.6, s * 0.16, bw * 1.2);

    if (spec.spin) {
      // minigun rotating barrel cluster (draw circle of barrels)
      const n = spec.barrels || 5, R = bw * 0.34;
      for (let i = 0; i < n; i++) {
        const a = this.barrelSpin + (i / n) * Math.PI * 2;
        const oy = Math.sin(a) * R;
        const shade = 0.5 + 0.5 * Math.cos(a);
        ctx.fillStyle = `rgba(${Math.round(120*shade+40)},${Math.round(120*shade+40)},${Math.round(140*shade+50)},1)`;
        ctx.fillRect(s * 0.06, oy - bw * 0.12, bl, bw * 0.24);
      }
      // muzzle housing
      ctx.fillStyle = '#3a3f55';
      ctx.fillRect(s * 0.06 + bl, -bw * 0.5, s * 0.05, bw);
    } else {
      // single barrel
      ctx.fillStyle = '#3a3f55';
      ctx.fillRect(s * 0.06, -bw * 0.5, bl, bw);
      // muzzle tip
      ctx.fillStyle = '#20242f';
      ctx.fillRect(s * 0.06 + bl - s * 0.04, -bw * 0.6, s * 0.05, bw * 1.2);
    }

    if (spec.kind === 'rocket') { // warhead sticking out
      ctx.fillStyle = this.def.color;
      ctx.beginPath();
      ctx.moveTo(s * 0.06 + bl + s * 0.1, 0);
      ctx.lineTo(s * 0.06 + bl - s * 0.02, -bw * 0.5);
      ctx.lineTo(s * 0.06 + bl - s * 0.02, bw * 0.5);
      ctx.closePath(); ctx.fill();
    }
    if (spec.scope) { // sniper scope
      ctx.fillStyle = '#12151f';
      ctx.fillRect(s * 0.02, -bw * 1.1, s * 0.14, bw * 0.5);
      ctx.fillStyle = '#6fe0ff';
      ctx.beginPath(); ctx.arc(s * 0.02, -bw * 0.85, bw * 0.2, 0, Math.PI * 2); ctx.fill();
    }

    // muzzle flash (only right after firing)
    if (rec > 0.6) {
      const fx = s * 0.06 + bl + s * 0.02;
      const fs = (spec.flash || 0.6) * s * 0.3 * (rec);
      ctx.globalAlpha = U.clamp((rec - 0.6) / 0.4, 0, 1);
      ctx.fillStyle = '#fff2a8';
      ctx.beginPath();
      ctx.moveTo(fx, 0);
      ctx.lineTo(fx + fs, -fs * 0.5);
      ctx.lineTo(fx + fs * 1.6, 0);
      ctx.lineTo(fx + fs, fs * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd36b';
      ctx.beginPath(); ctx.arc(fx, 0, fs * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawRange(ctx, s) {
    ctx.globalAlpha = 0.12; ctx.fillStyle = this.def.color;
    ctx.beginPath(); ctx.arc(this.x * s, this.y * s, this.stats.range * s, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.4; ctx.strokeStyle = this.def.color; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.arc(this.x * s, this.y * s, this.stats.range * s, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
