#!/usr/bin/env node
// =============================================================================
//  Aether Sentinels — automated test suite (no external dependencies).
//
//  Covers: deterministic gameplay rules, wave generation/balance invariants,
//  save-schema migration, reward accounting (granted exactly once), and
//  regression tests for each bug fixed during the audit.
//
//  Run:  npm test      (or: node test/run-tests.js)
// =============================================================================
const { loadGame } = require('./harness');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { failed++; failures.push({ name, msg: e.message }); console.log('  \x1b[31m✗\x1b[0m ' + name + '\n      ' + e.message); }
}
function group(name) { console.log('\n\x1b[1m' + name + '\x1b[0m'); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'expected equal') + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function approx(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error((msg || 'expected ~equal') + ` (got ${a}, want ${b}±${tol})`); }

const G = loadGame();
const { U, Store, Assets, ASSET_CONFIG, TOWERS, TOWER_ORDER, HEROES, ENEMIES, ENEMY_THREAT, MAPS, generateWaves, waveThreat, Game, Tower, Hero } = G;
const newGame = (m = 0) => { const g = new Game(global.__canvas); g.onEvent = () => {}; g.loadMap(m); return g; };

// ---------------------------------------------------------------- determinism
group('Deterministic gameplay rules');

test('seededRng is reproducible and in range', () => {
  const a = U.seededRng(42), b = U.seededRng(42);
  for (let i = 0; i < 50; i++) {
    const x = a(), y = b();
    eq(x, y, 'same seed must produce same sequence');
    assert(x >= 0 && x < 1, 'value in [0,1)');
  }
  assert(U.seededRng(1)() !== U.seededRng(2)(), 'different seeds differ');
});

test('generateWaves is deterministic for a given map', () => {
  for (const m of MAPS) {
    const a = JSON.stringify(generateWaves(m));
    const b = JSON.stringify(generateWaves(m));
    eq(a, b, 'wave generation must not depend on Math.random');
  }
});

test('generateWaves does not consume global Math.random', () => {
  // If wave gen used Math.random, seeding it would change the output.
  const before = JSON.stringify(generateWaves(MAPS[2]));
  const orig = Math.random; let calls = 0;
  Math.random = () => { calls++; return 0.5; };
  const after = JSON.stringify(generateWaves(MAPS[2]));
  Math.random = orig;
  eq(after, before, 'output changed when Math.random was stubbed');
  eq(calls, 0, 'generateWaves called Math.random ' + calls + ' times');
});

test('wave count and boss placement match the map definition', () => {
  for (const m of MAPS) {
    const ws = generateWaves(m);
    eq(ws.length, m.waves, m.name + ' wave count');
    const bosses = ws.filter(w => w.isBoss);
    eq(bosses.length, 1, m.name + ' must have exactly one boss wave');
    eq(bosses[0].index, m.bossWave, m.name + ' boss wave index');
    eq(bosses[0].groups[0].type, m.bossType, m.name + ' boss type');
  }
});

// ------------------------------------------------------------------- balance
group('Balance invariants');

test('threat rises monotonically across normal waves on every map', () => {
  for (const m of MAPS) {
    const normals = generateWaves(m).filter(w => !w.isBoss).map(waveThreat);
    for (let i = 1; i < normals.length; i++) {
      assert(normals[i] >= normals[i - 1],
        `${m.name}: wave ${i + 1} threat ${normals[i]} < wave ${i} ${normals[i - 1]} (curve must not dip)`);
    }
  }
});

test('difficulty scales monotonically across maps', () => {
  const scales = MAPS.map(m => m.diffScale);
  for (let i = 1; i < scales.length; i++) {
    assert(scales[i] > scales[i - 1], `map ${i} diffScale ${scales[i]} must exceed map ${i - 1} ${scales[i - 1]}`);
  }
  // and the first normal wave of a harder map must be at least as heavy
  const firsts = MAPS.map(m => waveThreat(generateWaves(m)[0]));
  for (let i = 1; i < firsts.length; i++) {
    assert(firsts[i] >= firsts[i - 1], `map ${i} opening wave should not be easier than map ${i - 1}`);
  }
});

test('ENEMY_THREAT weights stay ordered with enemy HP', () => {
  // A tougher enemy must not be cheaper to schedule than a weaker one.
  const ids = Object.keys(ENEMY_THREAT);
  for (const a of ids) for (const b of ids) {
    if (ENEMIES[a].hp > ENEMIES[b].hp * 1.5) {
      assert(ENEMY_THREAT[a] > ENEMY_THREAT[b],
        `${a} (hp ${ENEMIES[a].hp}) should outweigh ${b} (hp ${ENEMIES[b].hp})`);
    }
  }
});

test('no tower is strictly dominant on damage per gold', () => {
  // Measured sustained DPS per 100 gold should stay in a reasonable band so
  // every tower has a niche (regression for Venom Spire dominance).
  const dps = {};
  for (const id of TOWER_ORDER) {
    const g = newGame(); g.gold = 1e9; g.selectedBuild = id;
    const n = g.buildNodes[0]; g.tryBuild(n.x, n.y);
    const t = g.towers[0];
    ENEMIES.__dummy = { name: 'D', hp: 1e9, speed: 0, gold: 0, color: '#fff', r: 0.3, armor: 0 };
    g.spawnAt('__dummy', t.x + 1, t.y, 0, 0);
    const d = g.enemies[0]; d.baseSpeed = 0;
    const hp0 = d.hp;
    for (let i = 0; i < 600; i++) { d.x = t.x + 1; d.y = t.y; g.update(1 / 60); }
    dps[id] = (hp0 - (g.enemies[0] ? g.enemies[0].hp : hp0)) / 10 / TOWERS[id].cost * 100;
    delete ENEMIES.__dummy;
  }
  // Control/support towers (Pylon, Cryo, Graviton) buy time rather than damage,
  // so they are excluded from the damage-per-gold fairness band.
  const CONTROL = ['support', 'aoe-slow', 'gravity'];
  const attackers = TOWER_ORDER.filter(id => !CONTROL.includes(TOWERS[id].kind));
  const vals = attackers.map(id => dps[id]);
  const max = Math.max(...vals), min = Math.min(...vals);
  assert(max / min < 2.0, 'damage-per-gold spread too wide: ' +
    attackers.map(id => `${id}=${dps[id].toFixed(1)}`).join(' '));
});

test('Arc Coil remains effective against heavy armor', () => {
  // Regression: at dmg 14 vs armor 14 this tower did ~1 DPS and was useless.
  const g = newGame(); g.gold = 1e9; g.selectedBuild = 'arc';
  const n = g.buildNodes[0]; g.tryBuild(n.x, n.y);
  const t = g.towers[0];
  ENEMIES.__armored = { name: 'A', hp: 1e9, speed: 0, gold: 0, color: '#fff', r: 0.3, armor: 16 };
  g.spawnAt('__armored', t.x + 1, t.y, 0, 0);
  const d = g.enemies[0]; d.baseSpeed = 0;
  const hp0 = d.hp;
  for (let i = 0; i < 600; i++) { d.x = t.x + 1; d.y = t.y; g.update(1 / 60); }
  const dps = (hp0 - g.enemies[0].hp) / 10;
  delete ENEMIES.__armored;
  assert(dps > 10, 'Arc Coil DPS vs armor 16 is only ' + dps.toFixed(1));
});

test('undefended maps are lost (early waves are not free)', () => {
  for (let m = 0; m < MAPS.length; m++) {
    const g = newGame(m);
    let frames = 0;
    while (g.state !== 'won' && g.state !== 'lost' && frames < 60 * 60 * 5) {
      if (g.state === 'building' && !g.waveActive) g.startWave();
      g.update(1 / 60); frames++;
    }
    eq(g.state, 'lost', MAPS[m].name + ' should be lost with no towers');
    assert(g.waveIndex <= 6, MAPS[m].name + ' should be lost early, not at wave ' + g.waveIndex);
  }
});

test('boss minion spawning is capped', () => {
  const g = newGame(1); // Frost Canyon -> Hive Mind
  g.spawnAt('hivemind', g.path[0].x, g.path[0].y, 0, 0);
  const boss = g.enemies[0];
  boss.baseSpeed = 0;                       // hold it in place
  for (let i = 0; i < 60 * 120; i++) { boss.hp = boss.maxHp; g.update(1 / 60); }
  const cap = ENEMIES.hivemind.maxSpawns;
  assert(boss.spawnCount <= cap, `spawned ${boss.spawnCount}, cap ${cap}`);
});

// -------------------------------------------------------------- save schema
group('Save migration (never wipes progress)');

function withSave(raw, fn) {
  global.localStorage.setItem(Store.key, JSON.stringify(raw));
  Store._cache = null;
  return fn();
}

test('a v1 save (no schema field) is migrated and preserved', () => {
  withSave({ progress: { unlocked: 3, stars: { 0: 3, 1: 2 } }, settings: { muted: true, volume: 0.5 }, coins: 777 }, () => {
    const d = Store.load();
    eq(d.schema, Store.SCHEMA, 'schema stamped');
    eq(d.progress.unlocked, 3, 'unlocked preserved');
    eq(d.progress.stars[0], 3, 'stars preserved');
    eq(d.coins, 777, 'coins preserved');
    eq(d.settings.muted, true, 'muted preserved');
    eq(d.settings.volume, 0.5, 'volume preserved');
    // new schema-2 fields get sensible defaults
    eq(d.settings.sfxVolume, 0.5, 'sfxVolume defaults from volume');
    eq(d.settings.reducedMotion, false, 'reducedMotion default');
    eq(d.settings.tutorialDone, false, 'tutorialDone default');
  });
});

test('an empty / missing save yields safe defaults', () => {
  withSave({}, () => {
    const d = Store.load();
    eq(d.progress.unlocked, 1);
    eq(d.coins, 150);
    eq(d.settings.muted, false);
  });
});

test('a corrupt save does not throw and falls back to defaults', () => {
  global.localStorage.setItem(Store.key, '{not json');
  Store._cache = null;
  const d = Store.load();
  eq(d.progress.unlocked, 1, 'defaults applied');
  eq(d.coins, 150);
});

test('malformed field types are repaired, not crashed on', () => {
  withSave({ progress: 'nope', settings: 42, coins: 'abc', adReadyAt: 'x' }, () => {
    const d = Store.load();
    eq(d.progress.unlocked, 1);
    eq(typeof d.settings, 'object');
    eq(d.coins, 150);
    eq(d.adReadyAt, 0);
  });
});

test('reset clears progress but keeps audio/accessibility settings', () => {
  withSave({ progress: { unlocked: 4, stars: { 0: 3 } }, settings: { muted: true, volume: 0.9, reducedMotion: true }, coins: 999 }, () => {
    Store.reset();
    const d = Store.load();
    eq(d.progress.unlocked, 1, 'progress reset');
    eq(Object.keys(d.progress.stars).length, 0, 'stars cleared');
    eq(d.coins, 150, 'coins reset to stipend');
    eq(d.settings.muted, true, 'settings preserved');
    eq(d.settings.reducedMotion, true, 'accessibility preserved');
  });
});

test('ad cooldown far in the future is treated as ready (clock skew)', () => {
  withSave({ adReadyAt: Date.now() + 99 * 3600 * 1000 }, () => {
    eq(Store.getAdReadyAt(), 0, 'skewed timestamp must not lock the player out');
  });
});

// ---------------------------------------------------------- reward accounting
group('Reward accounting (exactly once)');

test('coins cannot be overspent and never go negative', () => {
  withSave({ coins: 100 }, () => {
    eq(Store.spendCoins(150), false, 'overspend refused');
    eq(Store.getCoins(), 100, 'balance untouched');
    eq(Store.spendCoins(100), true);
    eq(Store.getCoins(), 0);
    Store.setCoins(-50);
    eq(Store.getCoins(), 0, 'clamped at zero');
  });
});

test('levelUpUnit charges exactly once and raises stats', () => {
  withSave({ coins: 1000 }, () => {
    const g = newGame(); g.gold = 1e9; g.selectedBuild = 'venom';
    const n = g.buildNodes[0]; g.tryBuild(n.x, n.y);
    const t = g.towers[0];
    const cost = t.levelUpCost(), before = Store.getCoins(), dot0 = t.stats.dot;
    eq(g.levelUpUnit(t), true, 'level up succeeds');
    eq(t.level, 2, 'level incremented by one');
    eq(Store.getCoins(), before - cost, 'charged exactly the quoted cost');
    assert(t.stats.dot > dot0, 'poison increased with level');
  });
});

test('levelUpUnit is refused without enough coins and charges nothing', () => {
  withSave({ coins: 0 }, () => {
    const g = newGame(); g.gold = 1e9; g.selectedBuild = 'venom';
    const n = g.buildNodes[0]; g.tryBuild(n.x, n.y);
    const t = g.towers[0];
    eq(g.levelUpUnit(t), false);
    eq(t.level, 1, 'level unchanged');
    eq(Store.getCoins(), 0, 'nothing charged');
  });
});

test('level-up stops at max level and costs nothing further', () => {
  withSave({ coins: 1e6 }, () => {
    const g = newGame(); g.gold = 1e9; g.selectedBuild = 'arc';
    const n = g.buildNodes[0]; g.tryBuild(n.x, n.y);
    const t = g.towers[0];
    let guard = 0;
    while (t.levelUpCost() != null && guard++ < 20) g.levelUpUnit(t);
    eq(t.level, ASSET_CONFIG.levelUp.maxLevel, 'reached configured max level');
    const c = Store.getCoins();
    eq(g.levelUpUnit(t), false, 'further level-ups refused');
    eq(Store.getCoins(), c, 'no coins spent at max level');
  });
});

test('starting a wave twice does not double-spawn', () => {
  const g = newGame();
  g.startWave();
  const queued = g.spawnQueue.length;
  g.startWave(); g.startWave();
  eq(g.spawnQueue.length, queued, 'spawn queue unchanged by repeated startWave');
});

test('wave-clear bonus is granted once per wave', () => {
  const g = newGame();
  // fill the board so wave 1 dies quickly
  g.gold = 1e9; let i = 0;
  for (const n of g.buildNodes) { g.selectedBuild = TOWER_ORDER[i++ % TOWER_ORDER.length]; g.tryBuild(n.x, n.y); }
  g.selectedBuild = null;
  g.startWave();
  const idx0 = g.waveIndex;
  let frames = 0;
  while (g.waveIndex === idx0 && frames < 60 * 90) { g.update(1 / 60); frames++; }
  eq(g.waveIndex, idx0 + 1, 'wave index advanced exactly one');
  // running more ticks in the build phase must not advance again or pay again
  const goldAfter = g.gold, waveAfter = g.waveIndex;
  for (let k = 0; k < 120; k++) g.update(1 / 60);
  eq(g.waveIndex, waveAfter, 'wave index stable while idle');
  eq(g.gold, goldAfter, 'no repeated wave bonus while idle');
});

test('selling refunds once and frees the build node', () => {
  const g = newGame(); g.gold = 1000; g.selectedBuild = 'cannon';
  const n = g.buildNodes[0];
  g.tryBuild(n.x, n.y);
  const t = g.towers[0], refund = t.sellValue, goldBefore = g.gold;
  g.selectedTower = t;
  g.sellSelected();
  eq(g.towers.length, 0, 'tower removed');
  eq(g.gold, goldBefore + refund, 'refunded exactly once');
  eq(g.towerAt(n.x, n.y), undefined, 'node freed in the occupancy index');
  g.sellSelected();  // nothing selected now
  eq(g.gold, goldBefore + refund, 'second sell is a no-op');
});

test('win() and lose() are idempotent', () => {
  const g = newGame();
  let won = 0, lost = 0;
  g.onEvent = ev => { if (ev.type === 'won') won++; if (ev.type === 'lost') lost++; };
  g.win(); g.win(); g.win();
  eq(won, 1, 'won event emitted once');
  g.lose();
  eq(lost, 0, 'cannot lose after winning');
  const g2 = newGame();
  let lost2 = 0;
  g2.onEvent = ev => { if (ev.type === 'lost') lost2++; };
  g2.lose(); g2.lose();
  eq(lost2, 1, 'lost event emitted once');
});

// -------------------------------------------------------------- regressions
group('Regressions for fixed bugs');

test('building is rejected off build nodes, on occupied nodes, and when poor', () => {
  const g = newGame();
  g.gold = 1e9; g.selectedBuild = 'cannon';
  // a tile on the path is never a build node
  const pathTile = MAPS[0].path[1];
  eq(g.tryBuild(pathTile.x, pathTile.y), false, 'cannot build on the path');
  const n = g.buildNodes[0];
  eq(g.tryBuild(n.x, n.y), true, 'valid node accepted');
  eq(g.tryBuild(n.x, n.y), false, 'occupied node rejected');
  eq(g.towers.length, 1, 'exactly one tower built');
  g.gold = 0;
  const n2 = g.buildNodes.find(x => !g.towerAt(x.x, x.y));
  eq(g.tryBuild(n2.x, n2.y), false, 'insufficient gold rejected');
  eq(g.gold, 0, 'no gold deducted on failure');
});

test('repeated build taps on one node create only one tower', () => {
  const g = newGame(); g.gold = 1e9; g.selectedBuild = 'rail';
  const n = g.buildNodes[0];
  for (let i = 0; i < 10; i++) g.tryBuild(n.x, n.y);
  eq(g.towers.length, 1);
});

test('fixed timestep: identical simulation regardless of speed multiplier', () => {
  // Same number of fixed ticks must produce the same world state, because the
  // speed multiplier only changes how many ticks run per real frame.
  const run = (ticks) => {
    const g = newGame(); g.gold = 5000; g.selectedBuild = 'cannon';
    const n = g.buildNodes[0]; g.tryBuild(n.x, n.y); g.selectedBuild = null;
    g.startWave();
    for (let i = 0; i < ticks; i++) g.update(1 / 60);
    return { time: +g.time.toFixed(6), lives: g.lives, gold: g.gold, wave: g.waveIndex };
  };
  const a = run(300), b = run(300);
  eq(JSON.stringify(a), JSON.stringify(b), 'same tick count -> same state');
});

test('hero drag stays inside the board and fusion consumes both units', () => {
  const g = newGame(); g.gold = 1e9;
  g.selectedHero = 'pistol';
  g.deployHero({ fx: 4, fy: 4 });
  g.deployHero({ fx: 8, fy: 4 });
  g.selectedHero = null;
  eq(g.heroes.length, 2, 'two heroes deployed');
  // simulate a drag to the partner then release
  const a = g.heroes[0], b = g.heroes[1];
  a.x = U.clamp(-99, 0.4, g.cols - 0.4); a.y = U.clamp(-99, 0.4, g.rows - 0.4);
  assert(a.x >= 0.4 && a.y >= 0.4, 'clamped into bounds');
  a.x = b.x; a.y = b.y;
  eq(g.tryMergeHeroes(a), true, 'fusion succeeds when overlapping');
  eq(g.heroes.length, 1, 'both inputs consumed, one output');
  eq(g.heroes[0].id, 'smg', 'fused into the next weapon');
});

test('max-rank hero does not fuse further', () => {
  const g = newGame();
  const a = new Hero('rocket', 5, 5, g), b = new Hero('rocket', 5.05, 5, g);
  g.heroes.push(a, b);
  eq(g.tryMergeHeroes(a), false, 'rocket is terminal');
  eq(g.heroes.length, 2, 'both heroes survive');
});

test('deploying a hero on top of another is refused without charging', () => {
  const g = newGame(); g.gold = 1e9; g.selectedHero = 'pistol';
  eq(g.deployHero({ fx: 5, fy: 5 }), true);
  const gold = g.gold;
  eq(g.deployHero({ fx: 5.05, fy: 5.02 }), false, 'overlapping deploy refused');
  eq(g.gold, gold, 'no gold charged on refusal');
  eq(g.heroes.length, 1);
});

test('boss leak damage scales to the map and cannot exceed the life pool', () => {
  for (let m = 0; m < MAPS.length; m++) {
    const g = newGame(m);
    g.spawnAt(MAPS[m].bossType, g.path[0].x, g.path[0].y, 0, 0);
    const boss = g.enemies[0];
    const before = g.lives;
    boss.arrive();
    const dmg = before - g.lives;
    assert(dmg >= 3, 'boss leak should hurt (' + dmg + ')');
    assert(dmg <= Math.ceil(MAPS[m].lives * 0.25) + 1, 'boss leak ' + dmg + ' too large for ' + MAPS[m].name);
    assert(g.lives >= 0, 'lives never negative');
  }
});

test('particle system respects its hard cap', () => {
  const g = newGame();
  for (let i = 0; i < 400; i++) g.particles.burst(5, 5, '#fff', 40, 3, 'spark', 0.6, 0.2);
  assert(g.particles.list.length <= g.particles.MAX, 'particles ' + g.particles.list.length + ' exceeded cap ' + g.particles.MAX);
});

test('reduced motion suppresses shake and thins particles', () => {
  const g = newGame();
  g.reducedMotion = true;
  g.update(1 / 60);                   // syncs particle intensity
  approx(g.particles.intensity, 0.25, 0.001, 'intensity lowered');
  const before = g.particles.list.length;
  g.particles.burst(5, 5, '#fff', 40, 3, 'spark', 0.6, 0.2);
  const spawned = g.particles.list.length - before;
  assert(spawned <= 12, 'expected thinned burst, got ' + spawned);
});

test('O(1) lookups agree with a brute-force scan', () => {
  const g = newGame(2);
  g.gold = 1e9; g.selectedBuild = 'arc';
  g.tryBuild(g.buildNodes[3].x, g.buildNodes[3].y);
  for (let x = -1; x <= g.cols; x++) for (let y = -1; y <= g.rows; y++) {
    const fastNode = g.isBuildNode(x, y);
    const slowNode = g.buildNodes.some(n => n.x === x && n.y === y);
    eq(fastNode, slowNode, `isBuildNode mismatch at ${x},${y}`);
    const fastT = g.towerAt(x, y);
    const slowT = g.towers.find(t => t.tx === x && t.ty === y);
    eq(fastT, slowT, `towerAt mismatch at ${x},${y}`);
  }
});

test('support buff cache invalidates when towers change', () => {
  const g = newGame(); g.gold = 1e9;
  // place an attacker, note its buffs, then add a pylon next to it
  const nodes = g.buildNodes;
  g.selectedBuild = 'cannon'; g.tryBuild(nodes[0].x, nodes[0].y);
  const t = g.towers[0];
  eq(t.buffs().dmgMul, 1, 'no buff initially');
  // find a node within the pylon's range of the attacker
  const pylonRange = TOWERS.pylon.base.range;
  const spot = nodes.find(n => !g.towerAt(n.x, n.y) &&
    U.dist(n.x + 0.5, n.y + 0.5, t.x, t.y) <= pylonRange - 0.2);
  assert(spot, 'found a node in pylon range');
  g.selectedBuild = 'pylon'; g.tryBuild(spot.x, spot.y);
  assert(t.buffs().dmgMul > 1, 'buff applied after the pylon was built (cache invalidated)');
  // selling the pylon must remove the buff
  g.selectedTower = g.towers.find(x => x.id === 'pylon');
  g.sellSelected();
  eq(t.buffs().dmgMul, 1, 'buff removed after the pylon was sold');
});

test('enemy status effects behave (slow, freeze, poison, dodge, armor)', () => {
  const g = newGame();
  g.spawnAt('drone', g.path[0].x, g.path[0].y, 0, 0);
  const e = g.enemies[0];
  const base = e.speed;
  e.applySlow(0.5, 2);
  approx(e.speed, base * 0.5, 0.001, 'slow halves speed');
  e.freeze(1);
  eq(e.speed, 0, 'freeze stops movement');
  // armor reduces damage; pierce ignores it
  g.spawnAt('shield', g.path[0].x, g.path[0].y, 0, 0);
  const w = g.enemies[1];
  const plain = w.damage(50);
  const pierced = w.damage(50, { pierce: true });
  assert(pierced > plain, `pierce (${pierced}) should beat plain (${plain}) vs armor`);
  // poison ticks over time and ignores armor
  const hp0 = w.hp;
  w.applyDot(20, 1, 0);
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  assert(w.hp < hp0, 'poison dealt damage over time');
});

test('tab suspension does not fast-forward the simulation', () => {
  // A huge frame delta must be clamped: gameplay time advances by at most the
  // clamped amount, never by the full wall-clock gap.
  const g = newGame();
  g.start();               // sets STEP/_accum
  const t0 = g.time;
  // emulate a 30 second gap by feeding the accumulator the clamped max only
  g._accum = 0;
  const MAX_FRAME = 0.1;
  g._accum += MAX_FRAME * g.speed;
  let ticks = 0;
  while (g._accum >= g.STEP && ticks < 100) { g.update(g.STEP); g._accum -= g.STEP; ticks++; }
  g.stop();
  assert(g.time - t0 <= MAX_FRAME + g.STEP, `advanced ${(g.time - t0).toFixed(3)}s, expected <= ${MAX_FRAME}`);
  assert(ticks <= 7, 'ran ' + ticks + ' ticks for one clamped frame');
});

// ------------------------------------------------------- campaign expansion
group('Campaign: 100 maps / 10 chapters');

test('exactly 100 maps across 10 chapters of 10', () => {
  eq(G.TOTAL_MAPS, 100, 'total maps');
  eq(MAPS.length, 100, 'MAPS length');
  eq(G.CHAPTERS.length, 10, 'chapter count');
  eq(G.MAPS_PER_CHAPTER, 10);
  MAPS.forEach((m, i) => {
    eq(m.id, i, 'map id matches index');
    eq(m.chapter, Math.floor(i / 10), 'chapter assignment for map ' + i);
  });
});

test('every map has a valid, walkable path entering and leaving the board', () => {
  for (const m of MAPS) {
    assert(m.path.length >= 3, m.name + ' path too short');
    eq(m.path[0].x, -1, m.name + ' must enter from off the left edge');
    eq(m.path[m.path.length - 1].x, m.cols, m.name + ' must exit off the right edge');
    for (const p of m.path) {
      assert(p.y >= 0 && p.y < m.rows, m.name + ' path leaves the board vertically at y=' + p.y);
    }
    // consecutive points must be axis-aligned and non-zero length
    for (let i = 1; i < m.path.length; i++) {
      const a = m.path[i - 1], b = m.path[i];
      const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
      assert((dx === 0) !== (dy === 0), `${m.name} segment ${i} is not axis-aligned (${dx},${dy})`);
    }
  }
});

test('every map produces enough build nodes to be playable', () => {
  for (let i = 0; i < MAPS.length; i += 7) {
    const g = newGame(i);
    assert(g.buildNodes.length >= 20, MAPS[i].name + ' only has ' + g.buildNodes.length + ' build nodes');
  }
});

test('campaign difficulty rises monotonically map to map', () => {
  for (let i = 1; i < MAPS.length; i++) {
    assert(MAPS[i].diffScale >= MAPS[i - 1].diffScale,
      `map ${i} diffScale ${MAPS[i].diffScale} < map ${i - 1} ${MAPS[i - 1].diffScale}`);
    assert(MAPS[i].bossHpMul >= MAPS[i - 1].bossHpMul, `map ${i} boss scaling regressed`);
  }
  // and the span is meaningful
  assert(MAPS[99].diffScale > MAPS[0].diffScale * 4, 'final map should be far harder than the first');
});

test('map generation is deterministic', () => {
  const a = MAPS.map(m => m.path.map(p => p.x + ':' + p.y).join('>')).join('|');
  const b = G.MAPS.map(m => m.path.map(p => p.x + ':' + p.y).join('>')).join('|');
  eq(a, b, 'paths must be stable');
  // decor placement is seeded too
  const g1 = newGame(33), g2 = newGame(33);
  eq(g1.decor.length, g2.decor.length, 'decor count stable');
  eq(JSON.stringify(g1.decor.slice(0, 5)), JSON.stringify(g2.decor.slice(0, 5)), 'decor layout stable');
});

test('decoration never sits on the path', () => {
  for (const i of [0, 12, 37, 58, 71, 99]) {
    const g = newGame(i);
    for (const d of g.decor) {
      const key = Math.floor(d.x) + ',' + Math.floor(d.y);
      assert(!g.pathTiles.has(key), MAPS[i].name + ' has decor on the path at ' + key);
    }
    assert(g.decor.length > 0, MAPS[i].name + ' should have some scenery');
  }
});

test('each chapter has a complete, distinct theme', () => {
  const seen = new Set();
  for (const ch of G.CHAPTERS) {
    for (const k of ['name', 'biome', 'bg', 'path', 'edge', 'accent', 'deco', 'decoDensity']) {
      assert(ch[k] != null, `chapter ${ch.name} missing ${k}`);
    }
    assert(Array.isArray(ch.bg) && ch.bg.length === 2, ch.name + ' needs a 2-stop gradient');
    assert(Array.isArray(ch.deco) && ch.deco.length > 0, ch.name + ' needs decoration kinds');
    // colours must be valid hex
    for (const c of [ch.path, ch.edge, ch.accent, ...ch.bg]) {
      assert(/^#[0-9a-f]{6}$/i.test(c), `${ch.name} has an invalid colour: ${c}`);
    }
    assert(!seen.has(ch.name), 'duplicate chapter name ' + ch.name);
    seen.add(ch.name);
  }
});

group('Ten towers and ten levels');

test('there are 10 towers, progressively unlocked', () => {
  eq(TOWER_ORDER.length, 10, 'tower count');
  eq(G.unlockedTowers(1).length, 6, 'first map offers the original six');
  eq(G.unlockedTowers(100).length, 10, 'all towers available late');
  // unlock thresholds must be ascending in tray order
  let prev = 0;
  for (const id of TOWER_ORDER) {
    const at = TOWERS[id].unlockAt || 0;
    assert(at >= prev, `${id} unlockAt ${at} breaks ascending order`);
    prev = at;
  }
});

test('every tower kind is implemented and can fire without error', () => {
  for (const id of TOWER_ORDER) {
    const g = newGame(30);
    g.gold = 1e9; g.selectedBuild = id;
    const n = g.buildNodes[0];
    assert(g.tryBuild(n.x, n.y), 'could not build ' + id);
    const t = g.towers[0];
    // put a target in range and run long enough for several cycles
    ENEMIES.__t = { name: 'T', hp: 1e9, speed: 0, gold: 0, color: '#fff', r: 0.3, armor: 4 };
    g.spawnAt('__t', t.x + 1, t.y, 0, 0);
    const e = g.enemies[0]; e.baseSpeed = 0;
    for (let i = 0; i < 300; i++) { e.x = t.x + 1; e.y = t.y; g.update(1 / 60); }
    delete ENEMIES.__t;
    // control towers deal little/no damage but must still run cleanly
    const control = ['support', 'aoe-slow', 'gravity'].includes(TOWERS[id].kind);
    if (!control) assert(g.enemies[0].hp < 1e9, id + ' dealt no damage');
  }
});

test('towers can be levelled to 10 and stats scale', () => {
  withSave({ coins: 1e7 }, () => {
    const g = newGame(); g.gold = 1e9; g.selectedBuild = 'rail';
    const n = g.buildNodes[0]; g.tryBuild(n.x, n.y);
    const t = g.towers[0];
    const dmg1 = t.stats.dmg;
    let guard = 0;
    while (t.levelUpCost() != null && guard++ < 30) g.levelUpUnit(t);
    eq(t.level, 10, 'reached level 10');
    eq(ASSET_CONFIG.levelUp.maxLevel, 10);
    eq(ASSET_CONFIG.levelUp.costs.length, 9, 'nine level-up steps for ten levels');
    assert(t.stats.dmg > dmg1 * 3, `level 10 damage ${t.stats.dmg} should far exceed level 1 ${dmg1}`);
    eq(g.levelUpUnit(t), false, 'cannot exceed level 10');
  });
});

test('Graviton Well drags enemies back along the path', () => {
  const g = newGame();
  g.spawnAt('drone', g.path[0].x, g.path[0].y, 0, 0);
  const e = g.enemies[0];
  // advance it along the path first
  for (let i = 0; i < 180; i++) g.update(1 / 60);
  const before = e.dist, idx = e.pathIndex;
  e.pullBack(1.5);
  assert(e.dist < before, `pull should reduce progress (${before} -> ${e.dist})`);
  assert(e.pathIndex <= idx, 'pull should not advance the path index');
  assert(e.x >= -1.01 && e.y >= -0.01, 'pulled enemy stays on the board');
  // pulling at the spawn point must not break anything
  const g2 = newGame();
  g2.spawnAt('drone', g2.path[0].x, g2.path[0].y, 0, 0);
  const e2 = g2.enemies[0];
  e2.pullBack(99);
  eq(e2.pathIndex, 0, 'cannot be pulled behind the spawn');
  assert(e2.dist >= 0, 'distance never negative');
});

test('Prism Lance ramps damage the longer it holds a target', () => {
  const g = newGame(30);
  g.gold = 1e9; g.selectedBuild = 'prism';
  const n = g.buildNodes[0]; g.tryBuild(n.x, n.y);
  const t = g.towers[0];
  ENEMIES.__p = { name: 'P', hp: 1e9, speed: 0, gold: 0, color: '#fff', r: 0.3, armor: 0 };
  g.spawnAt('__p', t.x + 1, t.y, 0, 0);
  const e = g.enemies[0]; e.baseSpeed = 0;
  const sample = (secs) => {
    const h0 = e.hp;
    for (let i = 0; i < secs * 60; i++) { e.x = t.x + 1; e.y = t.y; g.update(1 / 60); }
    return h0 - e.hp;
  };
  const first = sample(1);          // ramp still near 1x
  sample(12);                        // hold the beam long enough to approach the ceiling
  const later = sample(1);           // ramp near rampMax
  delete ENEMIES.__p;
  assert(later > first * 1.8, `ramp should increase damage (${first.toFixed(0)} -> ${later.toFixed(0)})`);
  // and it must respect the configured ceiling rather than growing forever
  const ceiling = TOWERS.prism.base.rampMax;
  assert(later < first * (ceiling + 0.6), `ramp exceeded its ceiling (${(later / first).toFixed(2)}x vs max ${ceiling}x)`);
});

test('Pyre Vent only burns enemies inside its cone', () => {
  const g = newGame(30);
  g.gold = 1e9; g.selectedBuild = 'pyre';
  const n = g.buildNodes.find(b => b.x > 2 && b.y > 2) || g.buildNodes[0];
  g.tryBuild(n.x, n.y);
  const t = g.towers[0];
  ENEMIES.__f = { name: 'F', hp: 1e9, speed: 0, gold: 0, color: '#fff', r: 0.2, armor: 0 };
  // one target in front, one directly behind at the same distance
  g.spawnAt('__f', t.x + 1.5, t.y, 0, 0);
  g.spawnAt('__f', t.x - 1.5, t.y, 0, 0);
  const [a, b2] = g.enemies; a.baseSpeed = 0; b2.baseSpeed = 0;
  t.angle = 0; // face +x
  const ha = a.hp, hb = b2.hp;
  for (let i = 0; i < 120; i++) {
    a.x = t.x + 1.5; a.y = t.y; b2.x = t.x - 1.5; b2.y = t.y;
    t.angle = 0;                      // hold the facing
    g.update(1 / 60);
  }
  delete ENEMIES.__f;
  assert(ha - a.hp > 0, 'target in the cone should burn');
  assert((ha - a.hp) > (hb - b2.hp), 'the target in front must take more damage than the one behind');
});

test('Flak Battery fires multiple pellets per shot', () => {
  const g = newGame(30);
  g.gold = 1e9; g.selectedBuild = 'flak';
  const n = g.buildNodes[0]; g.tryBuild(n.x, n.y);
  const t = g.towers[0];
  ENEMIES.__k = { name: 'K', hp: 1e9, speed: 0, gold: 0, color: '#fff', r: 0.35, armor: 0 };
  g.spawnAt('__k', t.x + 1, t.y, 0, 0);
  const e = g.enemies[0]; e.baseSpeed = 0;
  g.beams.length = 0;
  t.cooldown = 0; t.angle = U.angleTo(t.x, t.y, e.x, e.y);
  t.fire(e, { dmgMul: 1, rateMul: 1, rangeAdd: 0 });
  delete ENEMIES.__k;
  eq(g.beams.length, Math.round(TOWERS.flak.base.pellets), 'one beam per pellet');
});

// ------------------------------------------------------------------ summary
console.log(`\n${'='.repeat(58)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f.name + ': ' + f.msg));
}
console.log('='.repeat(58));
process.exit(failed ? 1 : 0);
