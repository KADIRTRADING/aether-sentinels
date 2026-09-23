// Objective tuning data: effective DPS per gold for each tower vs a reference
// target, and how much total DPS a map's gold budget can buy vs wave threat.
const { loadGame } = require('./harness');
const { Game, TOWERS, TOWER_ORDER, ENEMIES, MAPS, generateWaves, waveThreat } = loadGame();

const g = new Game(global.__canvas); g.onEvent = () => {}; g.loadMap(0);

// Measure single-tower sustained DPS against a stationary dummy of given armor.
function measureDps(id, armor, seconds = 10, tier = 0) {
  const gg = new Game(global.__canvas); gg.onEvent = () => {}; gg.loadMap(0);
  gg.gold = 1e9; gg.selectedBuild = id;
  const node = gg.buildNodes[0];
  gg.tryBuild(node.x, node.y);
  const t = gg.towers[0];
  for (let i = 0; i < tier; i++) t.upgrade();
  // dummy: huge hp, no movement, sits next to the tower
  const E = Object.assign({}, ENEMIES.drone);
  ENEMIES.__dummy = { name: 'Dummy', hp: 1e9, speed: 0, gold: 0, color: '#fff', r: 0.3, armor };
  gg.spawnAt('__dummy', t.x + 1, t.y, 0, 0);
  const d = gg.enemies[0]; d.baseSpeed = 0;
  const hp0 = d.hp;
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    d.x = t.x + 1; d.y = t.y; d.hp = Math.min(d.hp, 1e9); // hold position
    gg.update(dt);
    if (gg.enemies.length === 0) break;
  }
  const dealt = hp0 - (gg.enemies[0] ? gg.enemies[0].hp : 0);
  delete ENEMIES.__dummy;
  return dealt / seconds;
}

console.log('=== Tower DPS (10s, vs armor 0 / 14) and DPS per 100 gold ===');
for (const id of TOWER_ORDER) {
  const def = TOWERS[id];
  const d0 = measureDps(id, 0), d14 = measureDps(id, 14);
  console.log(`  ${def.name.padEnd(13)} cost ${String(def.cost).padStart(4)} | dps(0) ${d0.toFixed(0).padStart(5)} | dps(14) ${d14.toFixed(0).padStart(5)} | dps/100g ${(d0 / def.cost * 100).toFixed(1).padStart(5)}`);
}

console.log('\n=== Wave pressure: threat vs time-to-cross ===');
// How long does an enemy take to walk the path? DPS needed = totalHP / crossTime
for (let m = 0; m < MAPS.length; m++) {
  const gg = new Game(global.__canvas); gg.onEvent = () => {}; gg.loadMap(m);
  // path length in tiles
  let len = 0;
  for (let i = 0; i < gg.path.length - 1; i++) len += Math.hypot(gg.path[i + 1].x - gg.path[i].x, gg.path[i + 1].y - gg.path[i].y);
  const ws = generateWaves(MAPS[m]);
  const last = ws.filter(w => !w.isBoss).slice(-1)[0];
  let hp = 0, n = 0;
  last.groups.forEach(gr => { hp += gr.count * ENEMIES[gr.type].hp; n += gr.count; });
  const slowest = Math.min(...last.groups.map(gr => ENEMIES[gr.type].speed));
  const cross = len / slowest;
  console.log(`  ${MAPS[m].diff.padEnd(8)} pathLen ${len.toFixed(1)} | last normal wave: ${n} enemies, ${hp} HP, cross ${cross.toFixed(0)}s -> need ~${(hp / cross).toFixed(0)} dps`);
}
