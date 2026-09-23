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
  // ---- Gun / weapon effects (procedural, punchy) ----
  gun(kind) {
    if (!this.enabled || !this.ctx || this.muted) return;
    switch (kind) {
      case 'pistol':
        // sharp crack + short low thump
        this.noise(0.06, 0.5, 2600); this.tone(220, 0.06, 'square', 0.22, 90);
        break;
      case 'smg':
        // light, fast tick
        this.noise(0.035, 0.32, 3200); this.tone(320, 0.03, 'square', 0.14, 160);
        break;
      case 'rifle':
        // meatier report with a bit of body
        this.noise(0.07, 0.5, 2200); this.tone(180, 0.08, 'square', 0.24, 70);
        break;
      case 'sniper':
        // big crack + long tail boom
        this.noise(0.12, 0.7, 1600); this.tone(140, 0.28, 'sawtooth', 0.32, 45);
        this.tone(1800, 0.05, 'square', 0.18, 400);
        break;
      case 'minigun':
        // dense buzzy burst
        this.noise(0.03, 0.4, 3800); this.tone(140, 0.04, 'sawtooth', 0.16, 90);
        break;
      case 'rocket':
        // whoosh launch
        this.noise(0.3, 0.5, 900); this.tone(90, 0.32, 'sawtooth', 0.3, 260);
        break;
      default:
        this.noise(0.05, 0.4, 2600);
    }
  },
  explosion() {
    if (!this.enabled || !this.ctx || this.muted) return;
    this.noise(0.35, 0.85, 700); this.tone(70, 0.4, 'sawtooth', 0.4, 30);
    this.tone(130, 0.25, 'square', 0.25, 50);
  },
  merge() {
    // rising triumphant sweep for fusion
    [392, 523, 659, 880, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.28, f * 1.2), i * 55));
    this.noise(0.2, 0.3, 1400);
  },
  deploy() { this.tone(300, 0.09, 'square', 0.24, 500); this.tone(500, 0.1, 'square', 0.2, 720); },
  pickup() { this.tone(660, 0.06, 'sine', 0.2, 880); },
  build() { this.tone(440, 0.08, 'square', 0.25, 660); this.tone(660, 0.1, 'square', 0.2, 880); },
  upgrade() { this.tone(523, 0.1, 'triangle', 0.25, 784); this.tone(784, 0.12, 'triangle', 0.2, 1046); },
  hitCore() { this.tone(160, 0.25, 'sawtooth', 0.3, 60); this.noise(0.2, 0.3, 300); },
  waveStart() { this.tone(330, 0.15, 'sine', 0.25, 440); this.tone(440, 0.15, 'sine', 0.2, 550); },
  bossSpawn() { this.tone(90, 0.6, 'sawtooth', 0.4, 50); this.noise(0.5, 0.35, 200); },
  // Victory fanfare: a real triumphant cadence rather than a plain arpeggio.
  // Brass-like stacked fifths -> rising run -> sustained major chord with a
  // shimmer on top. Scheduled on the audio clock so it stays in time.
  win() {
    if (!this.enabled || !this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const at = (delay, freq, dur, type, vol, slide) => {
      // schedule a note relative to now using the same envelope as tone()
      const t = t0 + delay;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(1, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.03);
    };
    // 1. Triple brass hit (tonic + fifth) — the "announcement"
    [0, 0.16, 0.32].forEach((d, i) => {
      at(d, 392, 0.17, 'triangle', 0.26);            // G4
      at(d, 587.33, 0.17, 'triangle', 0.17);         // D5
      if (i === 2) at(d, 784, 0.2, 'triangle', 0.14); // G5 on the third hit
    });
    // 2. Rising run into the resolution
    [[0.52, 523.25], [0.62, 659.25], [0.72, 784], [0.82, 880]].forEach(([d, f]) =>
      at(d, f, 0.13, 'square', 0.14));
    // 3. Sustained major chord (C major add9) — the payoff
    const hold = 0.98;
    at(hold, 523.25, 1.25, 'triangle', 0.26);   // C5
    at(hold, 659.25, 1.25, 'triangle', 0.2);    // E5
    at(hold, 784, 1.25, 'triangle', 0.18);      // G5
    at(hold, 1046.5, 1.3, 'sine', 0.16);        // C6
    at(hold, 1174.7, 1.0, 'sine', 0.08);        // D6 shimmer
    at(hold, 261.63, 1.35, 'sine', 0.2);        // C4 root underneath
    // 4. Cymbal-ish shimmer on the downbeat
    setTimeout(() => this.noise(0.5, 0.16, 6000), Math.round(hold * 1000));
  },
  lose() { [440,349,262,196].forEach((f,i)=>setTimeout(()=>this.tone(f,0.25,'sawtooth',0.25),i*140)); },
  kill() { this.tone(200, 0.06, 'square', 0.12, 120); },
  bossDown() { this.noise(0.5, 0.5, 400); [392,523,659].forEach((f,i)=>setTimeout(()=>this.tone(f,0.18,'triangle',0.3,f*1.2),i*90)); },
  waveClear() { this.tone(587, 0.12, 'triangle', 0.24, 784); this.tone(880, 0.14, 'triangle', 0.2, 988); },
  error() { this.tone(180, 0.12, 'sawtooth', 0.22, 120); },
  coin() { this.tone(880, 0.05, 'square', 0.18, 1320); this.tone(1320, 0.07, 'square', 0.14, 1760); },
  // ---- Tier-2 tower voices ----
  flame() { this.noise(0.1, 0.22, 1100); },
  gravity() { this.tone(70, 0.3, 'sine', 0.22, 190); this.tone(150, 0.25, 'triangle', 0.12, 60); },
  beam() { this.tone(1500, 0.09, 'sine', 0.12, 1900); },
  flak() { this.noise(0.06, 0.4, 3000); this.tone(260, 0.05, 'square', 0.16, 150); },
};
