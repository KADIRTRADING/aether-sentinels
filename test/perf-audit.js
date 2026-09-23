// Performance check: simulate a heavy late-game frame load (many towers,
// enemies, projectiles, particles) and measure update() cost per tick.
const { loadGame } = require('./harness');
const { Game, TOWERS, TOWER_ORDER, MAPS } = loadGame();

const g = new Game(global.__canvas); g.onEvent = () => {}; g.loadMap(3);
g.gold = 1e9;
// fill every build node
let i = 0;
for (const n of g.buildNodes) { g.selectedBuild = TOWER_ORDER[i++ % TOWER_ORDER.length]; g.tryBuild(n.x, n.y); }
g.selectedBuild = null;
// max out a chunk of them to raise projectile/particle volume
g.towers.forEach((t, k) => { if (k % 2 === 0) { t.upgrade(); t.upgrade(); } });
// Flood the board with very tanky, slow enemies so they survive the measurement
// window and we profile a genuinely heavy frame (targeting, projectiles,
// collisions, particles) rather than an empty board.
for (let k = 0; k < 150; k++) {
  g.spawnAt(k % 5 === 0 ? 'brute' : 'drone', g.path[0].x, g.path[0].y, 0, Math.random() * 0.9);
}
g.enemies.forEach(e => { e.maxHp = 1e7; e.hp = 1e7; e.baseSpeed = 0.05; });

const STEP = 1 / 60;
// warm up (also fills projectile/particle pools)
for (let k = 0; k < 60; k++) { g.update(STEP); g.enemies.forEach(e => { e.hp = 1e7; }); }

const t0 = process.hrtime.bigint();
const TICKS = 600;
for (let k = 0; k < TICKS; k++) { g.update(STEP); if (k % 10 === 0) g.enemies.forEach(e => { e.hp = 1e7; }); }
const t1 = process.hrtime.bigint();
const msPerTick = Number(t1 - t0) / 1e6 / TICKS;

console.log(`towers=${g.towers.length} enemies=${g.enemies.length} projectiles=${g.projectiles.length} particles=${g.particles.list.length}`);
console.log(`update(): ${msPerTick.toFixed(3)} ms/tick  (budget 16.7ms/frame at 1x, 5.6ms at 3x)`);
console.log(`particle cap respected: ${g.particles.list.length <= g.particles.MAX} (max ${g.particles.MAX})`);
// headroom: at 3x speed we run 3 ticks per frame
console.log(`3x speed cost: ${(msPerTick * 3).toFixed(2)} ms/frame -> ${(msPerTick * 3) < 16.7 ? 'OK' : 'TOO SLOW'}`);
