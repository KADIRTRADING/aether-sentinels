// Economy audit: track gold income vs spend per wave, and total threat, to see
// whether the player out-earns the difficulty curve.
const { loadGame } = require('./harness');
const { Game, TOWERS, MAPS, generateWaves, waveThreat } = loadGame();

function player(g) {
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

for (let m = 0; m < MAPS.length; m++) {
  const g = new Game(global.__canvas); g.onEvent = () => {}; g.loadMap(m);
  const dt = 1 / 60; let frames = 0, lastWave = 0;
  const rows = [];
  let goldAtWaveStart = g.gold;
  while (g.state !== 'won' && g.state !== 'lost' && frames < 60 * 60 * 12) {
    if (g.state === 'building' && !g.waveActive) {
      if (g.waveIndex > lastWave) {
        rows.push({ w: g.waveIndex, goldAfter: g.gold, towers: g.towers.length, tiers: g.towers.reduce((a, t) => a + t.tier, 0) });
        lastWave = g.waveIndex;
      }
      player(g); g.startWave(); goldAtWaveStart = g.gold;
    }
    g.update(dt); frames++;
  }
  const ws = generateWaves(MAPS[m]);
  console.log(`\n${MAPS[m].diff} ${MAPS[m].name} (${g.state}, lives ${g.lives}/${MAPS[m].lives})`);
  console.log('  wave : goldAfterClear  towers  totalTiers  waveThreat');
  rows.forEach(r => {
    const th = ws[r.w - 1] ? waveThreat(ws[r.w - 1]) : '-';
    console.log(`  ${String(r.w).padStart(4)} : ${String(r.goldAfter).padStart(13)} ${String(r.towers).padStart(7)} ${String(r.tiers).padStart(11)} ${String(th).padStart(11)}`);
  });
}
