// Calibration: simulate a STRONG player (fills the board, upgrades greedily)
// and a WEAKER player (limited tower count, slower upgrades) to get a
// difficulty band per map. Target design:
//   Easy    : strong wins comfortably (>=80% lives), weak still wins
//   Normal  : strong wins (>=60%), weak marginal
//   Hard    : strong wins with losses (<80%), weak usually loses
//   Extreme : strong barely wins / sometimes loses, weak loses
const { loadGame } = require('./harness');
const { Game, TOWERS, ENEMIES, MAPS, generateWaves, waveThreat } = loadGame();

function strongPlayer(g) {
  const mix = ['cannon', 'arc', 'cryo', 'rail', 'venom', 'pylon'];
  let idx = g.towers.length, safety = 0, acted = true;
  while (acted && safety++ < 40) {
    acted = false;
    if (g.gold > 250) {
      const up = g.towers.filter(t => t.nextTier && g.gold >= t.nextTier.cost).sort((a, b) => a.nextTier.cost - b.nextTier.cost)[0];
      if (up) { up.upgrade(); acted = true; continue; }
    }
    const empty = g.buildNodes.filter(n => !g.towerAt(n.x, n.y));
    if (empty.length) {
      const id = mix[idx % mix.length];
      if (g.gold >= TOWERS[id].cost) { g.selectedBuild = id; const n = empty[idx % empty.length]; if (g.tryBuild(n.x, n.y)) { idx++; acted = true; } }
    }
  }
  g.selectedBuild = null;
}
// Weaker player: caps total towers (~14) and only upgrades when rich.
function weakPlayer(g) {
  const mix = ['cannon', 'arc', 'rail', 'cryo'];
  const CAP = 14;
  let safety = 0, acted = true;
  while (acted && safety++ < 20) {
    acted = false;
    if (g.towers.length < CAP) {
      const empty = g.buildNodes.filter(n => !g.towerAt(n.x, n.y));
      const id = mix[g.towers.length % mix.length];
      if (empty.length && g.gold >= TOWERS[id].cost) {
        g.selectedBuild = id; const n = empty[Math.floor(empty.length / 2)];
        if (g.tryBuild(n.x, n.y)) acted = true;
      }
    } else if (g.gold > 450) {
      const up = g.towers.filter(t => t.nextTier && g.gold >= t.nextTier.cost).sort((a, b) => a.nextTier.cost - b.nextTier.cost)[0];
      if (up) { up.upgrade(); acted = true; }
    }
  }
  g.selectedBuild = null;
}
function sim(m, ai) {
  const g = new Game(global.__canvas); g.onEvent = () => {}; g.loadMap(m);
  const dt = 1 / 60; let frames = 0;
  while (g.state !== 'won' && g.state !== 'lost' && frames < 60 * 60 * 12) {
    if (g.state === 'building' && !g.waveActive) { ai(g); g.startWave(); }
    g.update(dt); frames++;
  }
  return { result: g.state, lives: g.lives, max: MAPS[m].lives, pct: Math.round(100 * g.lives / MAPS[m].lives), waves: g.waveIndex + '/' + g.waves.length, sec: +(frames / 60).toFixed(0), towers: g.towers.length };
}
console.log('=== Difficulty band (strong vs weak player) ===');
for (let m = 0; m < MAPS.length; m++) {
  const s = sim(m, strongPlayer), w = sim(m, weakPlayer);
  console.log(`${MAPS[m].diff.padEnd(8)} ${MAPS[m].name.padEnd(14)} | strong: ${s.result.toUpperCase().padEnd(5)} ${String(s.pct).padStart(3)}% lives (${s.lives}/${s.max}) ${s.towers}t ${s.sec}s | weak: ${w.result.toUpperCase().padEnd(5)} ${String(w.pct).padStart(3)}% lives (${w.lives}/${w.max}) ${w.towers}t`);
}
console.log('\n=== Wave threat curves ===');
for (let m = 0; m < MAPS.length; m++) {
  const ws = generateWaves(MAPS[m]);
  console.log(`  ${MAPS[m].diff.padEnd(8)} ${ws.filter(w => !w.isBoss).map(w => waveThreat(w)).join(' ')}`);
}
console.log('\n=== No-defense sanity ===');
for (let m = 0; m < MAPS.length; m++) {
  const g = new Game(global.__canvas); g.onEvent = () => {}; g.loadMap(m);
  const dt = 1 / 60; let frames = 0;
  while (g.state !== 'won' && g.state !== 'lost' && frames < 60 * 60 * 4) { if (g.state === 'building' && !g.waveActive) g.startWave(); g.update(dt); frames++; }
  console.log(`  ${MAPS[m].name.padEnd(14)} -> ${g.state} by wave ${g.waveIndex + (g.state === 'lost' ? 1 : 0)}`);
}
