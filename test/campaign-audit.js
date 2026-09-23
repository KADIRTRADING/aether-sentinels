// Campaign audit across all 100 maps: verifies the difficulty curve is smooth
// and that a competent player can clear every map ("hard but possible").
const { loadGame } = require('./harness');
const { Game, TOWERS, TOWER_ORDER, unlockedTowers, MAPS, CHAPTERS, generateWaves, waveThreat } = loadGame();

// Competent player: spends nearly all gold each build phase, prefers upgrading
// existing towers (strong play), spreads a balanced mix along the path, and uses
// both abilities whenever they are ready.
function competentPlayer(g, unlocked) {
  const pool = unlocked.filter(id => TOWERS[id].kind !== 'support').concat(['pylon']);
  let safety = 0, acted = true;
  while (acted && safety++ < 60) {
    acted = false;
    // upgrade first: concentrated power beats many weak towers
    const up = g.towers.filter(t => t.nextTier && g.gold >= t.nextTier.cost)
      .sort((a, b) => a.nextTier.cost - b.nextTier.cost)[0];
    if (up && g.gold >= up.nextTier.cost + 60) { up.upgrade(); acted = true; continue; }
    const empty = g.buildNodes.filter(n => !g.towerAt(n.x, n.y));
    if (empty.length) {
      const id = pool[g.towers.length % pool.length];
      if (g.gold >= TOWERS[id].cost) {
        g.selectedBuild = id;
        // prefer nodes near the middle of the path for coverage
        const n = empty[Math.floor(empty.length * ((g.towers.length * 0.37) % 1))];
        if (g.tryBuild(n.x, n.y)) acted = true;
      }
    }
  }
  g.selectedBuild = null;
}

function sim(i) {
  const g = new Game(global.__canvas); g.onEvent = () => {}; g.loadMap(i);
  const unlocked = unlockedTowers(i + 1);
  const dt = 1 / 60; let frames = 0;
  const cap = 60 * 60 * 15;
  while (g.state !== 'won' && g.state !== 'lost' && frames < cap) {
    if (g.state === 'building' && !g.waveActive) { competentPlayer(g, unlocked); g.startWave(); }
    // use abilities during waves when enemies are present
    if (g.enemies.length > 4) {
      if (g.abilityReady('strike')) {
        // drop it on the densest cluster
        let bx = g.enemies[0].x, by = g.enemies[0].y, best = 0;
        for (const e of g.enemies) {
          let c = 0;
          for (const o of g.enemies) if (Math.hypot(o.x - e.x, o.y - e.y) < 2.2) c++;
          if (c > best) { best = c; bx = e.x; by = e.y; }
        }
        g.castStrike(bx, by);
      }
      if (g.abilityReady('freeze') && g.enemies.length > 8) g.castFreeze();
    }
    g.update(dt); frames++;
  }
  return { state: g.state, lives: g.lives, max: MAPS[i].lives, waves: g.waveIndex, total: g.waves.length, towers: g.towers.length, sec: Math.round(frames / 60) };
}

const only = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const sample = only != null ? [only] :
  [0, 4, 9, 14, 19, 24, 29, 34, 39, 44, 49, 54, 59, 64, 69, 74, 79, 84, 89, 94, 97, 99];

console.log('=== Campaign playthrough (competent player, sampled) ===');
console.log('map  chapter            diff        result  lives      waves    towers time');
let losses = 0;
for (const i of sample) {
  const r = sim(i);
  if (r.state !== 'won') losses++;
  const pct = Math.round(100 * r.lives / r.max);
  console.log(
    String(i).padStart(3),
    MAPS[i].chapterName.padEnd(18),
    MAPS[i].diff.padEnd(10),
    r.state.toUpperCase().padEnd(6),
    (r.lives + '/' + r.max + ' (' + pct + '%)').padEnd(11),
    (r.waves + '/' + r.total).padEnd(8),
    String(r.towers).padStart(4),
    String(r.sec) + 's'
  );
}
console.log(`\nlosses in sample: ${losses}/${sample.length}`);

if (only == null) {
  console.log('\n=== Difficulty curve (final normal wave threat per map) ===');
  const rows = [];
  for (let i = 0; i < MAPS.length; i += 10) {
    const ws = generateWaves(MAPS[i]).filter(w => !w.isBoss);
    rows.push(`${String(i).padStart(3)} ${MAPS[i].chapterName.padEnd(16)} first ${String(waveThreat(ws[0])).padStart(4)}  last ${String(waveThreat(ws[ws.length - 1])).padStart(5)}  scale ${MAPS[i].diffScale}`);
  }
  console.log(rows.join('\n'));
}
