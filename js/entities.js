// ================= ENTITIES =================

class Enemy {
  constructor(type, game) {
    const d = ENEMIES[type];
    this.type = type; this.def = d; this.game = game;
    this.maxHp = d.hp; this.hp = d.hp;
    this.baseSpeed = d.speed; this.armor = d.armor || 0;
    this.r = d.r; this.color = d.color; this.gold = d.gold;
    this.boss = !!d.boss;
    this.pathIndex = 0; this.t = 0; // progress along current segment
    this.dead = false; this.reachedEnd = false;
    this.slowFactor = 1; this.slowTimer = 0;
    this.frozen = 0;
    this.dots = []; // {dps, time, pct}
    this.healCd = 0; this.spawnCd = d.spawnEvery || 0;
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
    // boss continuous spawns (hivemind)
    if (this.def.spawns && !this.dead) {
      this.spawnCd -= dt;
      if (this.spawnCd <= 0) {
        this.spawnCd = this.def.spawnEvery;
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
    this.stats = Object.assign({}, this.def.base);
    this.cooldown = 0; this.angle = -Math.PI / 2;
    this.totalCost = this.def.cost;
    this.targetMode = 'first'; // first | last | strong | close
    this.recompute();
    this.pulse = 0; this.recoil = 0;
  }

  cycleTargetMode() {
    const modes = ['first', 'last', 'strong', 'close'];
    this.targetMode = modes[(modes.indexOf(this.targetMode) + 1) % modes.length];
    return this.targetMode;
  }

  recompute() {
    // start from base then apply each purchased tier mod
    const s = Object.assign({}, this.def.base);
    for (let i = 0; i < this.tier; i++) {
      const mod = this.def.tiers[i].mod;
      for (const k in mod) s[k] = (s[k] || 0) + mod[k];
    }
    this.stats = s;
  }

  get nextTier() { return this.tier < 3 ? this.def.tiers[this.tier] : null; }
  get sellValue() { return Math.floor(this.totalCost * 0.6); }

  // Support buffs from nearby pylons
  buffs() {
    let dmgMul = 1, rateMul = 1, rangeAdd = 0;
    if (this.def.kind === 'support') return { dmgMul, rateMul, rangeAdd };
    for (const t of this.game.towers) {
      if (t.def.kind !== 'support' || t === this) continue;
      if (U.dist(this.x, this.y, t.x, t.y) <= t.stats.range) {
        dmgMul += t.stats.buffDmg;
        rateMul += t.stats.buffRate;
        rangeAdd += t.stats.buffRange || 0;
      }
    }
    return { dmgMul, rateMul, rangeAdd };
  }

  upgrade() {
    const nt = this.nextTier; if (!nt) return false;
    if (this.game.gold < nt.cost) return false;
    this.game.spendGold(nt.cost);
    this.totalCost += nt.cost;
    this.tier++; this.recompute();
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
    if (this.recoil > 0) this.recoil -= dt * 4;
    const b = this.buffs();
    const range = this.stats.range + b.rangeAdd;
    this.cooldown -= dt;

    if (this.def.kind === 'support') { this._buffPulse = (this._buffPulse || 0) + dt; return; }

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
        if (hit) { Sound.shoot('aoe-slow'); this.game.particles.ring(this.x, this.y, this.def.color, range * 0.9); }
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
    if (this.def.kind === 'sniper') {
      // hitscan
      Sound.shoot('sniper');
      const dmg = this.stats.dmg * b.dmgMul;
      target.damage(dmg, { pierce: true, bossBonus: this.stats.bossBonus || 0 });
      this.game.beams.push({ x1: this.x, y1: this.y, x2: target.x, y2: target.y, life: 0.15, color: this.def.color });
      this.game.particles.sparks(target.x, target.y, this.def.color, 6);
      this.game.addFloat(target.x, target.y, Math.round(dmg), '#ff6b9d');
    } else {
      this.game.projectiles.push(new Projectile(this.game, this.x, this.y, target, this));
      Sound.shoot(this.def.kind);
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
      for (let j = 0; j < jumps && cur; j++) {
        if (cur.dead && j > 0) break;
        cur.damage(dmg * Math.pow(0.85, j));
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

    // turret
    ctx.save(); ctx.translate(px, py);
    if (this.def.kind !== 'support' && this.def.kind !== 'aoe-slow') ctx.rotate(this.angle);
    const rec = this.recoil > 0 ? this.recoil * s * 0.1 : 0;
    ctx.fillStyle = this.def.color;
    if (this.def.kind === 'support') {
      // rotating diamond
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

    // glyph
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(s * 0.34)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.def.glyph, px, py);
    ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;

    // tier pips
    for (let i = 0; i < this.tier; i++) {
      ctx.fillStyle = '#ffcf4d';
      ctx.beginPath(); ctx.arc(px - s * 0.2 + i * s * 0.16, py + s * 0.34, s * 0.05, 0, Math.PI * 2); ctx.fill();
    }
    // upgrade pulse
    if (this.pulse > 0) {
      ctx.globalAlpha = this.pulse; ctx.strokeStyle = this.def.color; ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.arc(px, py, s * 0.5 * (1.4 - this.pulse), 0, Math.PI * 2); ctx.stroke();
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
