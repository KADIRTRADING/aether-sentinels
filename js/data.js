// ================= GAME DATA =================
// Grid is TILE-based. Each map defines cols/rows, a path (list of tile coords),
// and build nodes (tiles where towers can be placed).

const TILE = 44; // logical tile size, scaled at render time

// ---------- TOWER DEFINITIONS ----------
// Each tower has a distinct strategic role. Upgrades follow 3 tiers per tower.
const TOWERS = {
  arc: {
    id: 'arc', name: 'Arc Coil', glyph: '⚡', color: '#5ad1ff',
    role: 'Chain lightning — energy damage ignores half of armor, hits several foes',
    cost: 90,
    // Playtest fix: at dmg 14 vs armor 14 this tower did ~1 DPS and was dead
    // weight from wave 5. Energy arcs now bypass half of armor (armorMul 0.5)
    // and base damage is higher, giving it a real anti-crowd role.
    base: { range: 3.0, dmg: 22, rate: 0.85, chains: 2, chainRange: 2.0, splash: 0, armorMul: 0.5 },
    tiers: [
      { cost: 110, desc: '+1 chain target, +10 dmg', mod: { chains: 1, dmg: 10 } },
      { cost: 180, desc: '+1 chain, +12 dmg, +0.4 range', mod: { chains: 1, dmg: 12, range: 0.4 } },
      { cost: 320, desc: 'Overload: +2 chains, arcs briefly stun', mod: { chains: 2, dmg: 14, stun: 0.3 } },
    ],
    kind: 'chain'
  },
  cryo: {
    id: 'cryo', name: 'Cryo Node', glyph: '❄', color: '#8fdcff', role: 'Slows enemies in an area (control)',
    cost: 80,
    base: { range: 2.6, dmg: 4, rate: 0.7, slow: 0.35, slowDur: 1.2, splash: 1.4 },
    tiers: [
      { cost: 90, desc: 'Stronger slow (50%) + more damage', mod: { slow: 0.15, dmg: 4 } },
      { cost: 160, desc: '+range, longer slow duration', mod: { range: 0.5, slowDur: 0.8, dmg: 4 } },
      { cost: 300, desc: 'Deep Freeze: chance to briefly freeze solid', mod: { slow: 0.15, freezeChance: 0.18, dmg: 6 } },
    ],
    kind: 'aoe-slow'
  },
  cannon: {
    id: 'cannon', name: 'Mortar', glyph: '💥', color: '#ffab5e', role: 'Splash damage — clears grouped swarms',
    cost: 120,
    base: { range: 3.4, dmg: 40, rate: 1.6, splash: 1.3 },
    tiers: [
      { cost: 130, desc: '+20 dmg, +splash radius', mod: { dmg: 20, splash: 0.4 } },
      { cost: 220, desc: '+35 dmg, faster reload', mod: { dmg: 35, rate: -0.3 } },
      { cost: 420, desc: 'Cluster shells: +60 dmg, big splash', mod: { dmg: 60, splash: 0.6 } },
    ],
    kind: 'splash'
  },
  rail: {
    id: 'rail', name: 'Railgun', glyph: '🎯', color: '#ff6b9d', role: 'Long-range single-target, armor piercing',
    cost: 150,
    base: { range: 5.2, dmg: 55, rate: 1.7, pierce: true },
    tiers: [
      { cost: 160, desc: '+30 dmg, +range', mod: { dmg: 30, range: 0.6 } },
      { cost: 260, desc: '+50 dmg, faster charge', mod: { dmg: 50, rate: -0.35 } },
      { cost: 480, desc: 'Executioner: +40% dmg vs bosses', mod: { dmg: 70, bossBonus: 0.4 } },
    ],
    kind: 'sniper'
  },
  pylon: {
    id: 'pylon', name: 'Aegis Pylon', glyph: '◈', color: '#c9a3ff', role: 'Support — buffs nearby towers',
    cost: 100,
    base: { range: 2.4, dmg: 0, rate: 1, buffDmg: 0.15, buffRate: 0.10 },
    tiers: [
      { cost: 120, desc: 'Stronger damage buff (+25%)', mod: { buffDmg: 0.10 } },
      { cost: 200, desc: 'Stronger fire-rate buff (+20%)', mod: { buffRate: 0.10, range: 0.4 } },
      { cost: 360, desc: 'Overdrive: buffs also add small AoE range', mod: { buffDmg: 0.10, buffRange: 0.4 } },
    ],
    kind: 'support'
  },
  venom: {
    id: 'venom', name: 'Venom Spire', glyph: '☣', color: '#8dff6b',
    role: 'Poison over time — ignores armor, best against high-HP targets',
    // Playtest fix: was the strictly-dominant pick (36 dps/100g, armor-immune).
    // Cost raised and poison tuned so it trades off against burst towers, and it
    // is now weaker against low-HP swarms (poison needs time to tick).
    cost: 130,
    base: { range: 3.0, dmg: 6, rate: 1.1, dot: 11, dotDur: 3.0 },
    tiers: [
      { cost: 130, desc: 'Stronger poison stacks', mod: { dot: 8, dotDur: 0.5 } },
      { cost: 210, desc: '+range, +poison, faster', mod: { range: 0.5, dot: 10, rate: -0.2 } },
      { cost: 380, desc: 'Necrosis: poison also burns % of max HP', mod: { dotPct: 0.015, dot: 9 } },
    ],
    kind: 'dot'
  },
};

const TOWER_ORDER = ['arc', 'cryo', 'cannon', 'rail', 'pylon', 'venom'];

// ---------- HERO / WEAPON DEFINITIONS ----------
// Heroes are draggable soldier units carrying realistic weapons. Dragging two
// heroes of the SAME rank together fuses them into the next weapon in the chain.
// weapon spec drives rendering: barrel geometry, fire behavior, muzzle flash,
// shell ejection, and a distinct gun sound (Sound.gun(<sound>)).
//
// rank ladder: 0 pistol -> 1 smg -> 2 rifle -> 3 sniper -> 4 minigun -> 5 rocket
const HEROES = {
  pistol: {
    id: 'pistol', rank: 0, name: 'Recruit', weapon: 'Pistol', glyph: '🔫',
    color: '#8fd6ff', body: '#3a6ea5', role: 'Sidearm — cheap, reliable single shots',
    cost: 120, mergeTo: 'smg',
    stats: { range: 3.0, dmg: 22, rate: 0.55, hp: 120, projSpeed: 16 },
    weaponSpec: { kind: 'bullet', sound: 'pistol', barrelLen: 0.30, barrelW: 0.09, mag: 0, burst: 1, flash: 0.5, shell: true, tracer: '#ffe08a' },
  },
  smg: {
    id: 'smg', rank: 1, name: 'Trooper', weapon: 'SMG', glyph: '🔫',
    color: '#7dffcf', body: '#2f8f6b', role: 'Rapid-fire spray — melts light swarms',
    cost: 0, mergeTo: 'rifle',
    stats: { range: 3.2, dmg: 16, rate: 0.16, hp: 180, projSpeed: 18 },
    weaponSpec: { kind: 'bullet', sound: 'smg', barrelLen: 0.36, barrelW: 0.10, burst: 3, burstGap: 0.05, flash: 0.55, shell: true, tracer: '#b6ffe0' },
  },
  rifle: {
    id: 'rifle', rank: 2, name: 'Vanguard', weapon: 'Assault Rifle', glyph: '🔫',
    color: '#ffd36b', body: '#a5822f', role: 'Balanced automatic — solid all-rounder',
    cost: 0, mergeTo: 'sniper',
    stats: { range: 3.9, dmg: 30, rate: 0.28, hp: 300, projSpeed: 22 },
    weaponSpec: { kind: 'bullet', sound: 'rifle', barrelLen: 0.46, barrelW: 0.12, burst: 3, burstGap: 0.07, flash: 0.7, shell: true, stock: true, tracer: '#ffe08a' },
  },
  sniper: {
    id: 'sniper', rank: 3, name: 'Marksman', weapon: 'Sniper Rifle', glyph: '🎯',
    color: '#ff9d6b', body: '#8a4a2f', role: 'Hitscan — huge single-target, armor pierce',
    cost: 0, mergeTo: 'minigun',
    stats: { range: 6.5, dmg: 180, rate: 1.5, hp: 260, pierce: true },
    weaponSpec: { kind: 'hitscan', sound: 'sniper', barrelLen: 0.72, barrelW: 0.09, flash: 0.9, scope: true, stock: true, beam: '#ffd0b0' },
  },
  minigun: {
    id: 'minigun', rank: 4, name: 'Juggernaut', weapon: 'Minigun', glyph: '🔥',
    color: '#ff6b9d', body: '#8a2f52', role: 'Spinning barrels — relentless suppression',
    cost: 0, mergeTo: 'rocket',
    stats: { range: 4.2, dmg: 24, rate: 0.07, hp: 520, projSpeed: 24 },
    weaponSpec: { kind: 'bullet', sound: 'minigun', barrelLen: 0.52, barrelW: 0.20, barrels: 5, spin: true, flash: 0.8, shell: true, spread: 0.10, tracer: '#ffd36b' },
  },
  rocket: {
    id: 'rocket', rank: 5, name: 'Warlord', weapon: 'Rocket Launcher', glyph: '🚀',
    color: '#ff5470', body: '#8a2f3a', role: 'Explosive splash — apex fusion, clears crowds',
    cost: 0, mergeTo: null,
    stats: { range: 5.0, dmg: 140, rate: 1.1, hp: 700, projSpeed: 11, splash: 1.6 },
    weaponSpec: { kind: 'rocket', sound: 'rocket', barrelLen: 0.62, barrelW: 0.26, flash: 1.0, stock: true, smoke: true },
  },
};

// Only the base hero is buyable from the roster; the rest are reached by merging.
const HERO_ORDER = ['pistol', 'smg', 'rifle', 'sniper', 'minigun', 'rocket'];
const HERO_BUYABLE = ['pistol'];

// ---------- ENEMY DEFINITIONS ----------
// Each enemy is a distinct counter-check on the player's tower mix:
//   drone/runner  -> baseline & speed pressure (splash / fast towers)
//   swarm         -> crowds (splash, chain)
//   brute         -> high HP (poison, railgun)
//   shield/Warden -> heavy armor (railgun pierce, arc's half-armor energy)
//   healer/Mender -> sustains the group (focus-fire "Strongest" targeting)
//   phantom       -> 25% dodge (DoT & AoE can't be dodged)
// HP raised from the original values so late waves demand upgrades, not just
// more base towers (see test/dps-audit.js: required DPS was far too low).
const ENEMIES = {
  drone:   { name: 'Drone',    hp: 85,   speed: 1.6, gold: 6,  color: '#9fb4ff', r: 0.30, armor: 0 },
  runner:  { name: 'Runner',   hp: 65,   speed: 2.8, gold: 7,  color: '#7dffcf', r: 0.26, armor: 0 },
  brute:   { name: 'Brute',    hp: 320,  speed: 1.1, gold: 15, color: '#ff9d6b', r: 0.40, armor: 8 },
  shield:  { name: 'Warden',   hp: 230,  speed: 1.3, gold: 17, color: '#c9a3ff', r: 0.36, armor: 16 },
  swarm:   { name: 'Spawnling',hp: 40,   speed: 2.1, gold: 3,  color: '#ffd36b', r: 0.22, armor: 0 },
  healer:  { name: 'Mender',   hp: 175,  speed: 1.4, gold: 19, color: '#6bffb0', r: 0.34, armor: 4, heal: 10, healRange: 2.2 },
  phantom: { name: 'Phantom',  hp: 130,  speed: 1.9, gold: 21, color: '#b0b7d6', r: 0.30, armor: 0, dodge: 0.25 },
  // ---- Bosses ----
  // Tuned from playtesting (test/boss-audit.js): previously every boss walked
  // through a competent defence and cost 10 lives. HP/armor/resist reduced and
  // Hive Mind's minion spawning is now capped so it can't flood the board.
  // Bosses remain a real threat: they still need focused fire + slows to stop.
  titan:   { name: 'Aether Titan',  hp: 3400, speed: 0.62, gold: 300, color: '#ff5470', r: 0.7,  armor: 12, boss: true, resist: 0.15 },
  hivemind:{ name: 'Hive Mind',     hp: 4200, speed: 0.55, gold: 350, color: '#c86bff', r: 0.75, armor: 10, boss: true, resist: 0.12,
             spawns: 'swarm', spawnEvery: 2.6, maxSpawns: 12 },
  colossus:{ name: 'Void Colossus', hp: 6200, speed: 0.5,  gold: 500, color: '#ff3d5e', r: 0.85, armor: 20, boss: true, resist: 0.2, regen: 22 },
};

// ---------- MAP DEFINITIONS ----------
// path: array of {x,y} tile centers (integers). Enemies walk from path[0] to last.
// buildNodes: tiles where towers can be placed.
// We generate build nodes procedurally around the path per map for variety.
function makePath(points) { return points.map(p => ({ x: p[0], y: p[1] })); }

// diffScale drives wave threat; startGold/lives/waves are tuned alongside it so
// the labelled difficulty matches measured difficulty (see test/balance.test.js).
// Shorter wave counts keep a mobile session brisk (~3–6 min per map).
const MAPS = [
  {
    id: 0, name: 'Verdant Pass', diff: 'Easy', cols: 16, rows: 11,
    bg: ['#0d2018', '#0a1a14'], pathColor: '#1f3d2e',
    path: makePath([[-1,2],[3,2],[3,7],[8,7],[8,3],[12,3],[12,8],[16,8]]),
    startGold: 280, lives: 20, waves: 10, bossWave: 10, bossType: 'titan',
    diffScale: 0.85,
  },
  {
    id: 1, name: 'Frost Canyon', diff: 'Normal', cols: 16, rows: 11,
    bg: ['#0c1626', '#0a1120'], pathColor: '#1c2c48',
    path: makePath([[-1,5],[4,5],[4,1],[9,1],[9,9],[13,9],[13,4],[16,4]]),
    startGold: 260, lives: 20, waves: 12, bossWave: 12, bossType: 'hivemind',
    diffScale: 1.15,
  },
  {
    id: 2, name: 'Ember Foundry', diff: 'Hard', cols: 17, rows: 12,
    bg: ['#20120c', '#170c08'], pathColor: '#3d241c',
    path: makePath([[-1,1],[5,1],[5,6],[2,6],[2,10],[10,10],[10,3],[14,3],[14,9],[17,9]]),
    startGold: 260, lives: 18, waves: 14, bossWave: 14, bossType: 'colossus',
    diffScale: 1.5,
  },
  {
    id: 3, name: 'Void Nexus', diff: 'Extreme', cols: 18, rows: 12,
    bg: ['#160b26', '#0e0818'], pathColor: '#2c1c48',
    path: makePath([[-1,6],[3,6],[3,2],[7,2],[7,10],[11,10],[11,2],[15,2],[15,7],[18,7]]),
    startGold: 250, lives: 16, waves: 16, bossWave: 16, bossType: 'colossus',
    diffScale: 1.95,
  },
];

// ---------- WAVE GENERATION ----------
// Fully deterministic (seeded per map) so difficulty is reproducible and tunable.
// Design goals from playtesting:
//   * Difficulty scales monotonically with map.diffScale (Easy < Normal < Hard < Extreme).
//   * Waves 1–2 are a gentle ramp (learn controls) but never free if undefended.
//   * No random spikes: enemy "budget" grows on a smooth curve; composition is
//     scheduled by wave band, with light per-wave variation from the seed.
//   * Boss wave = boss + themed escort sized to the map.
//
// Each enemy has a "threat" weight (roughly effective HP × speed pressure) used
// to size waves consistently regardless of which enemy types are chosen.
// Threat ≈ effective HP cost to the player, accounting for armor/dodge/support.
// Keep these in sync with ENEMIES hp values (test/balance.test.js asserts this).
const ENEMY_THREAT = {
  drone: 13, runner: 14, swarm: 7, brute: 46, shield: 42, phantom: 30, healer: 36,
};

function generateWaves(map) {
  const rng = U.seededRng((map.id + 1) * 977 + 12345);
  const scale = map.diffScale != null ? map.diffScale : (1 + map.id * 0.28);
  const waves = [];
  const N = map.waves;
  let prevThreat = 0;   // enforces a strictly non-decreasing difficulty curve

  for (let w = 1; w <= N; w++) {
    const isBoss = w === map.bossWave;
    const groups = [];

    if (isBoss) {
      groups.push({ type: map.bossType, count: 1, gap: 0, delay: 0.5 });
      groups.push({ type: 'brute', count: 2 + map.id, gap: 0.9, delay: 2.0 });
      if (w > 6) groups.push({ type: 'shield', count: 2 + map.id, gap: 0.9, delay: 4.0 });
      groups.push({ type: 'swarm', count: 6 + map.id * 2, gap: 0.32, delay: 6.0 });
      waves.push({ index: w, isBoss, groups });
      continue;
    }

    // Smooth, strictly-increasing threat budget: gentle early so the player can
    // learn, with real late-game acceleration. Tuned against test/balance.test.js
    // so base towers alone are not sufficient — upgrades are required.
    const prog = (w - 1) / Math.max(1, N - 1);           // 0..1 across the map
    const base = 26 + w * 11;                             // linear growth
    const curve = 150 * prog * prog * prog;               // strong late acceleration
    let budget = Math.round((base + curve) * scale);

    // Composition bands (which enemy types are available this wave).
    const pool = [];
    pool.push('drone');
    if (w >= 2) pool.push('runner');
    if (w >= 3) pool.push('swarm');
    if (w >= 4) pool.push('brute');
    if (w >= 5) pool.push('shield');
    if (w >= 6) pool.push('phantom');
    if (w >= 7 && w % 2 === 1) pool.push('healer');       // occasional support enemy

    // Feature enemy for this wave (rotates deterministically) gets the bulk of
    // the budget; a filler type gets the rest. This produces readable waves.
    const feature = pool[Math.floor(rng() * pool.length)];
    const filler = w <= 2 ? 'drone' : (rng() < 0.5 ? 'drone' : 'runner');

    // Allocate the feature group first, then give the FILLER whatever threat
    // remains after rounding. This keeps the realised wave threat close to the
    // budget so the curve stays monotonic (no random difficulty dips).
    let delay = 0;
    const addGroup = (type, threatBudget) => {
      const per = ENEMY_THREAT[type] || 10;
      let count = Math.max(2, Math.round(threatBudget / per));
      count = Math.min(count, type === 'swarm' ? 18 : 14);
      const gap = ENEMIES[type].speed > 2 ? 0.42 : 0.62;
      groups.push({ type, count, gap, delay });
      delay += 0.35;
      return count * per; // realised threat
    };

    const used = addGroup(feature, budget * 0.65);
    let remaining = Math.max(ENEMY_THREAT[filler] * 2, budget - used);
    const used2 = addGroup(filler, remaining);
    // If per-group count caps swallowed part of the budget (common in late waves
    // when the feature is a cheap swarm type), top up with a heavy escort group
    // so the realised threat still tracks the intended curve.
    const shortfall = budget - used - used2;
    if (shortfall > 40) {
      const heavy = w >= 5 ? 'brute' : 'drone';
      addGroup(heavy, shortfall);
    }

    // Rounding in the group sizes can leave a wave marginally lighter than its
    // predecessor. Top up with cheap filler so the realised curve never dips.
    let realised = groups.reduce((a, gr) => a + gr.count * (ENEMY_THREAT[gr.type] || 10), 0);
    if (realised < prevThreat) {
      const per = ENEMY_THREAT.drone;
      const need = Math.ceil((prevThreat - realised) / per);
      const droneGroup = groups.find(gr => gr.type === 'drone');
      if (droneGroup) droneGroup.count += need;
      else groups.push({ type: 'drone', count: need, gap: 0.62, delay });
      realised += need * per;
    }
    prevThreat = realised;

    waves.push({ index: w, isBoss, groups });
  }
  return waves;
}

// Convenience for tests/tools: total threat of a wave.
function waveThreat(wave) {
  return wave.groups.reduce((a, g) => a + g.count * (ENEMY_THREAT[g.type] || (ENEMIES[g.type] ? 40 : 0)), 0);
}
