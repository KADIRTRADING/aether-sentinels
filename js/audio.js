// ---------- Procedural audio (no asset files needed) ----------
const Sound = {
  ctx: null, master: null, enabled: true,
  muted: false, volume: 0.32, // 0..1 (baseline gain)
  init() {
    if (this.ctx) return;
    try {
      // apply persisted settings
      const s = (typeof Store !== 'undefined' && Store.getSettings) ? Store.getSettings() : { muted: false, volume: 0.32 };
      this.muted = !!s.muted; this.volume = s.volume != null ? s.volume : 0.32;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  },
  applyGain() { if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; },
  setMuted(m) { this.muted = m; this.applyGain(); },
  setVolume(v) { this.volume = U.clamp(v, 0, 1); this.applyGain(); },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(freq, dur, type = 'sine', vol = 1, slideTo = null) {
    if (!this.enabled || !this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.5, filterFreq = 800) {
    if (!this.enabled || !this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },
  // Named effects
  shoot(kind) {
    switch (kind) {
      case 'chain': this.tone(880, 0.12, 'sawtooth', 0.25, 1600); break;
      case 'splash': this.noise(0.18, 0.5, 500); this.tone(120, 0.2, 'square', 0.2, 60); break;
      case 'sniper': this.tone(1400, 0.09, 'square', 0.22, 300); break;
      case 'aoe-slow': this.tone(500, 0.14, 'sine', 0.15, 900); break;
      case 'dot': this.tone(300, 0.12, 'triangle', 0.18, 500); break;
      default: this.tone(700, 0.08, 'triangle', 0.18);
    }
  },
  build() { this.tone(440, 0.08, 'square', 0.25, 660); this.tone(660, 0.1, 'square', 0.2, 880); },
  upgrade() { this.tone(523, 0.1, 'triangle', 0.25, 784); this.tone(784, 0.12, 'triangle', 0.2, 1046); },
  hitCore() { this.tone(160, 0.25, 'sawtooth', 0.3, 60); this.noise(0.2, 0.3, 300); },
  waveStart() { this.tone(330, 0.15, 'sine', 0.25, 440); this.tone(440, 0.15, 'sine', 0.2, 550); },
  bossSpawn() { this.tone(90, 0.6, 'sawtooth', 0.4, 50); this.noise(0.5, 0.35, 200); },
  win() { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.tone(f,0.2,'triangle',0.28),i*120)); },
  lose() { [440,349,262,196].forEach((f,i)=>setTimeout(()=>this.tone(f,0.25,'sawtooth',0.25),i*140)); },
  kill() { this.tone(200, 0.06, 'square', 0.12, 120); },
};
