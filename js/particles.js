// ---------- Particle system (animations) ----------
class Particle {
  constructor(x, y, vx, vy, life, color, size, kind) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color; this.size = size;
    this.kind = kind || 'dot'; this.dead = false; this.rot = Math.random() * Math.PI * 2;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 0.92; this.vy *= 0.92;
    if (this.kind === 'spark') this.vy += 40 * dt;
    this.rot += dt * 6;
  }
  draw(ctx, s) {
    const a = U.clamp(this.life / this.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    const px = this.x * s, py = this.y * s, sz = this.size * s * (0.4 + a * 0.6);
    if (this.kind === 'ring') {
      ctx.globalAlpha = a * 0.7; ctx.strokeStyle = this.color; ctx.lineWidth = 2 * (s / TILE);
      ctx.beginPath(); ctx.arc(px, py, sz * (1.6 - a), 0, Math.PI * 2); ctx.stroke();
    } else if (this.kind === 'spark') {
      ctx.save(); ctx.translate(px, py); ctx.rotate(this.rot);
      ctx.fillRect(-sz * 0.15, -sz * 0.6, sz * 0.3, sz * 1.2); ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

class ParticleSystem {
  constructor() { this.list = []; }
  update(dt) {
    for (const p of this.list) p.update(dt);
    this.list = this.list.filter(p => !p.dead);
  }
  draw(ctx, s) { for (const p of this.list) p.draw(ctx, s); }
  burst(x, y, color, n = 10, spread = 3, kind = 'dot', life = 0.5, size = 0.12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = U.rand(0.5, spread);
      this.list.push(new Particle(x, y, Math.cos(a) * v, Math.sin(a) * v, U.rand(life * 0.6, life), color, size, kind));
    }
  }
  ring(x, y, color, size = 0.5) { this.list.push(new Particle(x, y, 0, 0, 0.4, color, size, 'ring')); }
  sparks(x, y, color, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = U.rand(1, 4);
      this.list.push(new Particle(x, y, Math.cos(a) * v, Math.sin(a) * v - 1, U.rand(0.3, 0.6), color, 0.14, 'spark'));
    }
  }
}

// Floating combat text
class FloatText {
  constructor(x, y, text, color) { this.x = x; this.y = y; this.text = text; this.color = color; this.life = 0.9; this.max = 0.9; }
  update(dt) { this.life -= dt; this.y -= dt * 0.8; }
  get dead() { return this.life <= 0; }
  draw(ctx, s) {
    const a = U.clamp(this.life / this.max, 0, 1);
    ctx.globalAlpha = a; ctx.fillStyle = this.color;
    ctx.font = `bold ${Math.round(s * 0.34)}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(this.text, this.x * s, this.y * s);
    ctx.globalAlpha = 1;
  }
}
