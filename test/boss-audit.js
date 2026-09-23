// Isolate boss-wave difficulty: how much damage does the boss wave do to a
// player who did well up to that point?
const { loadGame } = require('./harness');
const { Game, TOWERS, ENEMIES, MAPS } = loadGame();

function autoPlayer(g) {
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
  const dt = 1 / 60; let frames = 0;
  let livesBeforeBoss = null, bossLeaks = 0, normalLeaks = 0;
  const ol = g.onEnemyLeaked.bind(g);
  g.onEnemyLeaked = e => { if (e.boss) bossLeaks++; else normalLeaks++; ol(e); };
  while (g.state !== 'won' && g.state !== 'lost' && frames < 60 * 60 * 12) {
    if (g.state === 'building' && !g.waveActive) {
      if (g.waveIndex + 1 === MAPS[m].bossWave && livesBeforeBoss == null) livesBeforeBoss = g.lives;
      autoPlayer(g); g.startWave();
    }
    g.update(dt); frames++;
  }
  const bossName = ENEMIES[MAPS[m].bossType].name;
  console.log(`${MAPS[m].diff.padEnd(8)} ${MAPS[m].name.padEnd(14)} boss=${bossName.padEnd(14)} ` +
    `lives before boss: ${String(livesBeforeBoss).padStart(3)}/${MAPS[m].lives} -> final ${String(g.lives).padStart(3)} ` +
    `| bossLeaks ${bossLeaks} normalLeaks ${normalLeaks} | ${g.state}`);
}
