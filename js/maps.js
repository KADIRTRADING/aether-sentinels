// =============================================================================
//  CAMPAIGN — 100 procedurally-built but fully deterministic maps.
//
//  Maps are grouped into 10 themed CHAPTERS of 10 maps each. A chapter supplies
//  the art direction (palette, path styling and decorative "creatives" such as
//  crystals, lava vents, trees or ruins) while each map inside it gets its own
//  seeded path layout and a difficulty step.
//
//  Everything here is derived from the map index, so the campaign is identical
//  on every device and can be balance-tested offline (see test/run-tests.js).
// =============================================================================

// ---------- CHAPTER THEMES (art direction + decoration recipes) ----------
// deco kinds are drawn by Game.drawDecor(): 'tree' 'crystal' 'rock' 'vent'
// 'ice' 'pipe' 'ruin' 'fungus' 'shard' 'rune'
const CHAPTERS = [
  {
    name: 'Verdant Reach', biome: 'Forest',
    bg: ['#0e2419', '#081611'], path: '#20402f', edge: '#2f6a49', accent: '#4dffa1',
    deco: ['tree', 'rock'], decoDensity: 0.16, fog: 'rgba(60,200,140,0.05)',
  },
  {
    name: 'Frost Expanse', biome: 'Glacier',
    bg: ['#0c1a2b', '#081220'], path: '#1e3050', edge: '#3f6ea8', accent: '#8fdcff',
    deco: ['ice', 'shard'], decoDensity: 0.18, fog: 'rgba(140,220,255,0.06)',
  },
  {
    name: 'Ember Foundry', biome: 'Volcanic',
    bg: ['#24130c', '#170b07'], path: '#432618', edge: '#8a4520', accent: '#ff8a3c',
    deco: ['vent', 'rock'], decoDensity: 0.15, fog: 'rgba(255,120,40,0.06)',
  },
  {
    name: 'Void Nexus', biome: 'Void',
    bg: ['#170c28', '#0d0718'], path: '#2d1c4c', edge: '#5c3fa8', accent: '#c9a3ff',
    deco: ['rune', 'crystal'], decoDensity: 0.14, fog: 'rgba(160,110,255,0.07)',
  },
  {
    name: 'Sunken Works', biome: 'Flooded ruins',
    bg: ['#08202a', '#051419'], path: '#153a44', edge: '#2b7c8a', accent: '#5ad1ff',
    deco: ['ruin', 'pipe'], decoDensity: 0.17, fog: 'rgba(60,180,220,0.07)',
  },
  {
    name: 'Crimson Waste', biome: 'Desert',
    bg: ['#261607', '#180e05'], path: '#4a2f12', edge: '#9a6320', accent: '#ffcf4d',
    deco: ['rock', 'ruin'], decoDensity: 0.13, fog: 'rgba(255,200,90,0.05)',
  },
  {
    name: 'Spore Hollow', biome: 'Fungal',
    bg: ['#1a0a22', '#0f0615'], path: '#33164a', edge: '#7a2fa0', accent: '#8dff6b',
    deco: ['fungus', 'crystal'], decoDensity: 0.2, fog: 'rgba(140,255,110,0.06)',
  },
  {
    name: 'Iron Bastion', biome: 'Fortress',
    bg: ['#12161f', '#0a0d14'], path: '#252b3a', edge: '#4c5a78', accent: '#b9c6ef',
    deco: ['pipe', 'ruin'], decoDensity: 0.16, fog: 'rgba(180,200,240,0.04)',
  },
  {
    name: 'Aurora Rift', biome: 'Storm',
    bg: ['#0a1430', '#060b1c'], path: '#1b2a58', edge: '#3d5fc4', accent: '#6fe0ff',
    deco: ['crystal', 'shard'], decoDensity: 0.15, fog: 'rgba(110,200,255,0.07)',
  },
  {
    name: 'Last Aether', biome: 'Finale',
    bg: ['#22060f', '#12040a'], path: '#45121f', edge: '#a3203a', accent: '#ff5470',
    deco: ['rune', 'shard'], decoDensity: 0.17, fog: 'rgba(255,84,112,0.07)',
  },
];

const MAPS_PER_CHAPTER = 10;
const TOTAL_MAPS = CHAPTERS.length * MAPS_PER_CHAPTER;   // 100

// Difficulty label bands used on the level-select cards.
function difficultyLabel(i) {
  if (i < 10) return 'Easy';
  if (i < 25) return 'Normal';
  if (i < 45) return 'Hard';
  if (i < 70) return 'Brutal';
  if (i < 90) return 'Extreme';
  return 'Nightmare';
}

// ---------- PATH GENERATION ----------
// Builds a serpentine path across the grid with a seeded number of legs. The
// path always enters off the left edge and exits off the right edge so enemies
// visibly walk on and off the board.
function generatePath(cols, rows, seed) {
  const rng = U.seededRng(seed);
  const margin = 1;
  const minY = margin, maxY = rows - 1 - margin;
  const legs = 3 + Math.floor(rng() * 3);           // 3..5 vertical sweeps
  const usableW = cols - margin * 2;
  const step = usableW / legs;
  const MIN_LEG = 2;                                 // guarantees a real corner

  // Alternate between an upper and a lower band, but pick a varied depth inside
  // the band instead of always slamming into the margin. That stops the path
  // from reading as a set of nested rectangles and gives an organic road.
  let y = Math.round(U.lerp(minY, maxY, 0.3 + rng() * 0.4));
  const pts = [[-1, y]];
  let x = margin + Math.max(1, Math.round(step * 0.45));
  pts.push([x, y]);

  let goUp = rng() < 0.5;
  for (let i = 0; i < legs; i++) {
    // target a point in the chosen band, varying how deep we go
    const depth = 0.15 + rng() * 0.6;
    let ny = goUp
      ? Math.round(U.lerp(y, minY, depth + 0.35))
      : Math.round(U.lerp(y, maxY, depth + 0.35));
    ny = U.clamp(ny, minY, maxY);
    // enforce a minimum vertical leg so corners are meaningful
    if (Math.abs(ny - y) < MIN_LEG) {
      ny = goUp ? Math.max(minY, y - MIN_LEG) : Math.min(maxY, y + MIN_LEG);
      // if the board edge blocks it, flip direction instead of emitting a stub
      if (Math.abs(ny - y) < MIN_LEG) { goUp = !goUp; ny = goUp ? Math.max(minY, y - MIN_LEG) : Math.min(maxY, y + MIN_LEG); }
    }
    if (ny !== y) { pts.push([x, ny]); y = ny; }
    const nx = Math.min(cols - margin, Math.round(margin + step * (i + 1)));
    if (nx > x) { pts.push([nx, y]); x = nx; }
    goUp = !goUp;
  }
  // exit off the right edge at the current height
  if (x < cols - 1) pts.push([cols - 1, y]);
  pts.push([cols, y]);
  return pts.map(p => ({ x: p[0], y: p[1] }));
}

// ---------- DECORATION PLACEMENT ----------
// Scatters themed props on tiles that are neither path nor build nodes, so the
// art never hides gameplay affordances.
function generateDecor(map, pathKeys, nodeKeys, seed) {
  const rng = U.seededRng(seed ^ 0x9e3779b9);
  const theme = CHAPTERS[map.chapter];
  const out = [];
  for (let x = 0; x < map.cols; x++) {
    for (let y = 0; y < map.rows; y++) {
      const k = x + ',' + y;
      if (pathKeys.has(k)) continue;                    // never on the road
      const onNode = nodeKeys.has(k);
      // Build nodes cover nearly every tile beside the path, so excluding them
      // left maps visually barren. Scenery is allowed there but drawn smaller and
      // dimmer, and always beneath the ⬡ marker, so the affordance still reads.
      const density = onNode ? theme.decoDensity * 0.45 : theme.decoDensity * 2.1;
      if (rng() > density) continue;
      out.push({
        x: x + 0.2 + rng() * 0.6,
        y: y + 0.2 + rng() * 0.6,
        kind: theme.deco[Math.floor(rng() * theme.deco.length)],
        s: (onNode ? 0.34 : 0.58) + rng() * (onNode ? 0.22 : 0.62),
        r: rng() * Math.PI * 2,
        t: rng(),
        dim: onNode ? 0.5 : 1,          // node props are faded back
      });
    }
  }
  return out;
}

// ---------- CAMPAIGN BUILD ----------
// Difficulty is a smooth curve over 100 maps. Values were fitted so that a
// competent player who upgrades and uses abilities can clear every map, while
// an unfocused build fails from roughly the Hard band onward
// (verified in test/run-tests.js and test/balance-audit.js).
function buildCampaign() {
  const maps = [];
  for (let i = 0; i < TOTAL_MAPS; i++) {
    const chapter = Math.floor(i / MAPS_PER_CHAPTER);
    const within = i % MAPS_PER_CHAPTER;
    const theme = CHAPTERS[chapter];
    const seed = (i + 1) * 7919 + 104729;
    const prog = i / (TOTAL_MAPS - 1);                  // 0..1 across the campaign

    // Board grows slowly so later maps have longer paths and more build room.
    const cols = 16 + Math.min(4, Math.floor(chapter / 2.5));
    const rows = 11 + (chapter >= 5 ? 1 : 0);

    // Threat multiplier: gentle start, steady climb, steep finale.
    const diffScale = +(0.70 + 2.9 * Math.pow(prog, 1.35)).toFixed(3);
    // Waves per map: 10 -> 20.
    const waves = 10 + Math.round(10 * prog);
    // Lives taper from 20 to 12; gold rises to keep pace with tougher waves.
    const lives = Math.max(12, 20 - Math.round(8 * prog));
    const startGold = 280 + Math.round(170 * prog) + within * 4;
    // Boss rotation with per-map scaling.
    const bossType = ['titan', 'hivemind', 'colossus'][chapter % 3 === 0 && chapter > 0 ? 2 : chapter % 3];
    const bossHpMul = +(0.8 + 1.9 * Math.pow(prog, 1.25)).toFixed(3);

    maps.push({
      id: i,
      chapter,
      index: within,
      name: `${theme.name} ${within + 1}`,
      chapterName: theme.name,
      biome: theme.biome,
      diff: difficultyLabel(i),
      cols, rows,
      bg: theme.bg,
      pathColor: theme.path,
      edgeColor: theme.edge,
      accent: theme.accent,
      fog: theme.fog,
      decoKinds: theme.deco,
      seed,
      path: generatePath(cols, rows, seed),
      startGold, lives, waves,
      bossWave: waves,
      bossType,
      diffScale,
      bossHpMul,
    });
  }
  return maps;
}

const MAPS = buildCampaign();

// Helper for the level-select UI.
function chapterOf(mapIndex) { return Math.floor(mapIndex / MAPS_PER_CHAPTER); }

if (typeof window !== 'undefined') {
  window.CHAPTERS = CHAPTERS; window.MAPS = MAPS;
  window.MAPS_PER_CHAPTER = MAPS_PER_CHAPTER; window.TOTAL_MAPS = TOTAL_MAPS;
  window.generateDecor = generateDecor; window.chapterOf = chapterOf;
  window.difficultyLabel = difficultyLabel;
}
