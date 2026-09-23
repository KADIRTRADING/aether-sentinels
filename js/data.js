// ================= GAME DATA =================
// Grid is TILE-based. Each map defines cols/rows, a path (list of tile coords),
// and build nodes (tiles where towers can be placed).

const TILE = 44; // logical tile size, scaled at render time

// ---------- TOWER DEFINITIONS ----------
// Each tower has a distinct strategic role. Upgrades follow 3 tiers per tower.
const TOWERS = {
  arc: {
    id: 'arc', name: 'Arc Coil', glyph: '⚡', color: '#5ad1ff', role: 'Chain lightning — hits multiple foes',
    cost: 90,
    base: { range: 3.0, dmg: 14, rate: 0.9, chains: 2, chainRange: 2.0, splash: 0 },
    tiers: [
      { cost: 110, desc: '+1 chain target, +6 dmg', mod: { chains: 1, dmg: 6 } },
      { cost: 180, desc: '+1 chain, +8 dmg, +0.4 range', mod: { chains: 1, dmg: 8, range: 0.4 } },
      { cost: 320, desc: 'Overload: +2 chains, chains apply short stun', mod: { chains: 2, dmg: 10, stun: 0.3 } },
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
    id: 'venom', name: 'Venom Spire', glyph: '☣', color: '#8dff6b', role: 'Damage-over-time, shreds high-HP targets',
    cost: 110,
    base: { range: 3.0, dmg: 8, rate: 1.0, dot: 12, dotDur: 3.0 },
    tiers: [
      { cost: 120, desc: 'Stronger poison stacks', mod: { dot: 10, dotDur: 0.5 } },
      { cost: 200, desc: '+range, +poison, faster', mod: { range: 0.5, dot: 12, rate: -0.2 } },
      { cost: 380, desc: 'Necrosis: poison % of max HP per tick', mod: { dotPct: 0.02, dot: 10 } },
    ],
    kind: 'dot'
  },
};

const TOWER_ORDER = ['arc', 'cryo', 'cannon', 'rail', 'pylon', 'venom'];

// ---------- ENEMY DEFINITIONS ----------
const ENEMIES = {
  drone:   { name: 'Drone',    hp: 60,   speed: 1.6, gold: 6,  color: '#9fb4ff', r: 0.30, armor: 0 },
  runner:  { name: 'Runner',   hp: 45,   speed: 2.8, gold: 7,  color: '#7dffcf', r: 0.26, armor: 0 },
  brute:   { name: 'Brute',    hp: 220,  speed: 1.1, gold: 14, color: '#ff9d6b', r: 0.40, armor: 6 },
  shield:  { name: 'Warden',   hp: 160,  speed: 1.3, gold: 16, color: '#c9a3ff', r: 0.36, armor: 14 },
  swarm:   { name: 'Spawnling',hp: 28,   speed: 2.1, gold: 3,  color: '#ffd36b', r: 0.22, armor: 0 },
  healer:  { name: 'Mender',   hp: 120,  speed: 1.4, gold: 18, color: '#6bffb0', r: 0.34, armor: 4, heal: 8, healRange: 2.2 },
  phantom: { name: 'Phantom',  hp: 90,   speed: 1.9, gold: 20, color: '#b0b7d6', r: 0.30, armor: 0, dodge: 0.25 },
  // Bosses
  titan:   { name: 'Aether Titan', hp: 4200, speed: 0.7, gold: 300, color: '#ff5470', r: 0.7, armor: 20, boss: true, splitOnDeath: null, resist: 0.2 },
  hivemind:{ name: 'Hive Mind',    hp: 5200, speed: 0.6, gold: 350, color: '#c86bff', r: 0.75, armor: 12, boss: true, spawns: 'swarm', spawnEvery: 2.2, resist: 0.15 },
  colossus:{ name: 'Void Colossus', hp: 9000, speed: 0.55, gold: 500, color: '#ff3d5e', r: 0.85, armor: 30, boss: true, regen: 40, resist: 0.25 },
};

// ---------- MAP DEFINITIONS ----------
// path: array of {x,y} tile centers (integers). Enemies walk from path[0] to last.
// buildNodes: tiles where towers can be placed.
// We generate build nodes procedurally around the path per map for variety.
function makePath(points) { return points.map(p => ({ x: p[0], y: p[1] })); }

const MAPS = [
  {
    id: 0, name: 'Verdant Pass', diff: 'Easy', cols: 16, rows: 11,
    bg: ['#0d2018', '#0a1a14'], pathColor: '#1f3d2e',
    path: makePath([[-1,2],[3,2],[3,7],[8,7],[8,3],[12,3],[12,8],[16,8]]),
    startGold: 220, lives: 20, waves: 12, bossWave: 12, bossType: 'titan',
  },
  {
    id: 1, name: 'Frost Canyon', diff: 'Normal', cols: 16, rows: 11,
    bg: ['#0c1626', '#0a1120'], pathColor: '#1c2c48',
    path: makePath([[-1,5],[4,5],[4,1],[9,1],[9,9],[13,9],[13,4],[16,4]]),
    startGold: 240, lives: 20, waves: 14, bossWave: 14, bossType: 'hivemind',
  },
  {
    id: 2, name: 'Ember Foundry', diff: 'Hard', cols: 17, rows: 12,
    bg: ['#20120c', '#170c08'], pathColor: '#3d241c',
    path: makePath([[-1,1],[5,1],[5,6],[2,6],[2,10],[10,10],[10,3],[14,3],[14,9],[17,9]]),
    startGold: 260, lives: 18, waves: 16, bossWave: 16, bossType: 'colossus',
  },
  {
    id: 3, name: 'Void Nexus', diff: 'Extreme', cols: 18, rows: 12,
    bg: ['#160b26', '#0e0818'], pathColor: '#2c1c48',
    path: makePath([[-1,6],[3,6],[3,2],[7,2],[7,10],[11,10],[11,2],[15,2],[15,7],[18,7]]),
    startGold: 280, lives: 16, waves: 18, bossWave: 18, bossType: 'colossus',
  },
];

// ---------- WAVE GENERATION ----------
// Deterministic but scaling. Boss appears on bossWave.
function generateWaves(map) {
  const waves = [];
  const scale = 1 + map.id * 0.28; // harder maps scale hp/count
  for (let w = 1; w <= map.waves; w++) {
    const isBoss = w === map.bossWave;
    const t = w / map.waves;
    const groups = [];
    if (isBoss) {
      groups.push({ type: map.bossType, count: 1, gap: 0, delay: 0 });
      // escort
      groups.push({ type: 'brute', count: 3 + map.id, gap: 0.8, delay: 1.5 });
      groups.push({ type: 'swarm', count: 8 + map.id * 2, gap: 0.35, delay: 3 });
    } else {
      const budget = Math.floor((10 + w * 6) * scale);
      let b = budget;
      // early waves: drones/runners; mid: brutes/shields; late: mix + phantom/healer
      const pool = [];
      pool.push(['drone', 8]);
      if (w >= 3) pool.push(['runner', 7]);
      if (w >= 4) pool.push(['swarm', 4]);
      if (w >= 5) pool.push(['brute', 22]);
      if (w >= 6) pool.push(['shield', 24]);
      if (w >= 8) pool.push(['phantom', 20]);
      if (w >= 7 && w % 2 === 0) pool.push(['healer', 26]);
      let delay = 0;
      let guard = 0;
      while (b > 0 && guard++ < 40) {
        const [type, cost] = U.choice(pool);
        if (cost > b && groups.length) break;
        const count = U.clamp(Math.round(U.rand(3, 6) + t * 4), 2, 12);
        groups.push({ type, count, gap: ENEMIES[type].speed > 2 ? 0.4 : 0.6, delay });
        delay += 0.4;
        b -= cost * count / 4;
      }
    }
    waves.push({ index: w, isBoss, groups });
  }
  return waves;
}
