// Shared headless harness: stubs browser globals and loads the real game logic
// into Node so we can simulate deterministic gameplay for audit + tests.
const fs = require('fs'), path = require('path');

function makeCtx() {
  const c = new Proxy({}, { get: () => (() => {}) });
  c.createLinearGradient = () => ({ addColorStop() {} });
  c.createRadialGradient = () => ({ addColorStop() {} });
  c.setTransform = () => {};
  return c;
}
function loadGame() {
  global.window = { devicePixelRatio: 1, innerWidth: 900, innerHeight: 520, addEventListener() {} };
  global.performance = { now: () => Date.now() };
  global.requestAnimationFrame = () => 0; global.cancelAnimationFrame = () => {};
  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = '' + v; }, removeItem: k => { delete store[k]; } };
  const ctx = makeCtx();
  global.__canvas = { getContext: () => ctx, width: 0, height: 0, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 520 }), addEventListener() {} };
  global.document = {
    hidden: false,
    getElementById: () => global.__canvas,
    querySelector: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
    querySelectorAll: () => [], createElement: () => ({ classList: { add() {}, toggle() {} }, style: {}, appendChild() {}, dataset: {} }),
    addEventListener() {}, removeEventListener() {},
    documentElement: { style: {} },
  };
  global.getComputedStyle = () => ({ getPropertyValue: () => '0' });
  global.Image = function () { return { set src(v) {}, addEventListener() {} }; };
  global.Audio = function () { return { play: () => Promise.resolve(), cloneNode() { return this; }, set src(v) {} }; };
  global.AudioContext = function () { return { createGain: () => ({ gain: {}, connect() {} }), currentTime: 0, state: 'running', destination: {}, createOscillator: () => ({ frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }), createBuffer: () => ({ getChannelData: () => new Float32Array(1) }), createBufferSource: () => ({ connect() {}, start() {} }), createBiquadFilter: () => ({ frequency: {}, connect() {} }), resume() {}, sampleRate: 44100 }; };
  global.webkitAudioContext = global.AudioContext;
  const files = ['utils.js', 'assets.config.js', 'data.js', 'maps.js', 'audio.js', 'assetmanager.js', 'particles.js', 'entities.js', 'game.js'];
  let combined = '';
  for (const f of files) combined += fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8') + '\n';
  combined += '\nmodule.exports = { U, Store, ASSET_CONFIG, Assets, TILE, TOWERS, TOWER_ORDER, unlockedTowers, HEROES, HERO_ORDER, HERO_BUYABLE, ENEMIES, ENEMY_THREAT, MAPS, CHAPTERS, MAPS_PER_CHAPTER, TOTAL_MAPS, generateDecor, chapterOf, difficultyLabel, generateWaves, waveThreat, Sound, ParticleSystem, Enemy, Projectile, Tower, Hero, Bullet, Shell, Game };\n';
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'require', 'global', 'window', 'document', 'localStorage', 'performance', 'AudioContext', 'webkitAudioContext', 'Image', 'Audio', 'requestAnimationFrame', 'cancelAnimationFrame', combined);
  fn(mod, mod.exports, require, global, global.window, global.document, global.localStorage, global.performance, global.AudioContext, global.webkitAudioContext, global.Image, global.Audio, global.requestAnimationFrame, global.cancelAnimationFrame);
  const G = mod.exports;
  if (G.Assets && G.Assets.init) G.Assets.init();
  return G;
}
module.exports = { loadGame, makeCtx };
