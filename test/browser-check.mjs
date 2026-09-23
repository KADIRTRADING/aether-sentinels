// Browser smoke/feature check: loads index.html in headless Chrome, runs a
// scripted session, and reports behaviour + any console errors.
// Usage: node test/browser-check.mjs [width,height]
import { spawn } from 'node:child_process';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const ROOT = path.resolve('.');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const probe = `
window.__errs = [];
addEventListener('error', e => window.__errs.push('' + (e.message || e.error)));
addEventListener('unhandledrejection', e => window.__errs.push('rej:' + e.reason));
function out(o){ var d=document.createElement('div'); d.id='outbox'; d.setAttribute('data-report', JSON.stringify(o)); document.body.appendChild(d); }
setTimeout(() => {
  const R = {};
  try {
    // ---- fresh player: tutorial should run ----
    Store.setSettings({ tutorialDone: false });
    Main.startLevel(0);
    const g = Main.game;
    R.tutorialVisible = !document.getElementById('tutorial').classList.contains('hidden');
    R.tutorialStep0 = document.getElementById('tut-text').textContent.slice(0, 28);
    // performing the action advances the hint
    UI.selectBuild('cannon');
    R.afterSelectStep = Tutorial.step;              // expect 1
    const n = g.buildNodes[0];
    Main.handleTap({ x: n.x, y: n.y, fx: n.x + 0.5, fy: n.y + 0.5 });
    R.towerBuilt = g.towers.length;                  // expect 1
    R.afterBuildStep = Tutorial.step;                // expect 2
    Tutorial.finish();

    // ---- tapping empty ground must NOT mute (regression) ----
    const mutedBefore = Store.getSettings().muted;
    g.selectedTower = null; g.selectedUnit = null; g.selectedBuild = null;
    Main.handleTap({ x: 0, y: 0, fx: 0.2, fy: 0.2 });
    R.emptyTapDidNotMute = Store.getSettings().muted === mutedBefore;

    // ---- explicit mute control still works ----
    UI.toggleMute();
    R.muteButtonWorks = Store.getSettings().muted !== mutedBefore;
    UI.toggleMute();

    // ---- keyboard: space starts a wave, p pauses, 2 sets speed ----
    g.state = 'building'; g.waveActive = false;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    R.spaceStartedWave = g.waveActive === true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
    R.pKeyPaused = g.paused === true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    R.speedKey = g.speed;                            // expect 2

    // ---- double Start Wave must not double-spawn ----
    g.speed = 1; g.paused = false;
    const qLen = g.spawnQueue.length;
    g.startWave();                                   // already active -> ignored
    R.noDoubleWave = g.spawnQueue.length === qLen;

    // ---- rewarded ad grants coins exactly once ----
    Store.setCoins(100); Store.setAdReadyAt(0);
    UI.watchAd();
    R.adOpened = !document.getElementById('ad-overlay').classList.contains('hidden');
    Ads.els.skip.disabled = false;
    Ads.finish(true);
    const afterFirst = Store.getCoins();
    Ads.finish(true);                                // second call must be a no-op
    R.coinsAfterAd = afterFirst;
    R.adRewardOnce = Store.getCoins() === afterFirst;

    // ---- level-up spends coins once ----
    Store.setCoins(1000);
    const t = g.towers[0]; const lvl0 = t.level; const c0 = Store.getCoins();
    g.levelUpUnit(t);
    R.leveledOnce = t.level === lvl0 + 1 && Store.getCoins() < c0;

    // ---- hero drag + fusion through real events ----
    g.gold = 99999; g.selectedHero = 'pistol';
    Main.handleTap({ x: 5, y: 5, fx: 5.4, fy: 5.4 });
    Main.handleTap({ x: 7, y: 5, fx: 7.4, fy: 5.4 });
    g.selectedHero = null;
    R.heroes = g.heroes.length;                      // expect 2
    const cv = document.getElementById('game'); const rect = cv.getBoundingClientRect(); const s = g.s;
    const ev = (type, fx, fy) => new MouseEvent(type, { clientX: rect.left + fx * s, clientY: rect.top + fy * s, bubbles: true });
    const h0 = g.heroes[0], h1 = g.heroes[1];
    cv.dispatchEvent(ev('mousedown', h0.x, h0.y));
    window.dispatchEvent(ev('mousemove', h0.x + 0.6, h0.y));
    window.dispatchEvent(ev('mousemove', h1.x, h1.y));
    window.dispatchEvent(ev('mouseup', h1.x, h1.y));
    R.afterFuseCount = g.heroes.length;              // expect 1
    R.fusedTo = g.heroes.length ? g.heroes[0].id : null; // expect smg

    // ---- drag a hero far off-board: must stay clamped in bounds ----
    const h = g.heroes[0];
    cv.dispatchEvent(ev('mousedown', h.x, h.y));
    window.dispatchEvent(ev('mousemove', -50, -50));
    window.dispatchEvent(ev('mouseup', -50, -50));
    R.heroInBounds = h.x >= 0 && h.y >= 0 && h.x <= g.cols && h.y <= g.rows;

    // ---- switching screens mid-wave then returning ----
    g.startWave();
    Main.showScreen('screen-menu');
    R.hudHiddenOnMenu = document.getElementById('hud').classList.contains('hidden');
    Main.startLevel(0);
    R.freshAfterRestart = g.towers.length === 0 && g.waveIndex === 0 && g.lives === g.map.lives;

    // ---- fixed timestep: same sim time at 1x vs 3x for equal ticks ----
    R.hasFixedStep = typeof g.STEP === 'number';

    // ---- run a wave for a while to check for runtime errors ----
    g.startWave();
    for (let i = 0; i < 600; i++) g.update(g.STEP);
    R.state = g.state;
    R.errs = window.__errs;
    R.ok = window.__errs.length === 0;
    out(R);
  } catch (e) {
    R.crash = e.message + ' | ' + (e.stack || '').split('\\n')[1];
    R.errs = window.__errs; out(R);
  }
}, 500);
`;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/(src|href)="(css|js|assets|manifest)/g, '$1="/$2')
  .replace('</body>', `<script>${probe}</script></body>`);
const harness = path.join(ROOT, 'test', '_probe.html');
fs.writeFileSync(harness, html);

const size = process.argv[2] || '1280,720';
const chrome = spawn('/usr/local/bin/chrome', ['--headless=new','--no-sandbox','--disable-gpu','--dump-dom',
  '--virtual-time-budget=15000', `--window-size=${size}`, `http://localhost:${port}/test/_probe.html`]);
let out = ''; chrome.stdout.on('data', d => out += d); chrome.stderr.on('data', () => {});
chrome.on('close', () => {
  const m = out.match(/id="?outbox"?\s+data-report="([^"]*)"/);
  if (!m) { console.log('NO REPORT\n' + out.slice(-1200)); }
  else {
    const rep = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    console.log(`--- Browser check @ ${size} ---`);
    for (const k of Object.keys(rep)) console.log('  ' + k.padEnd(22), JSON.stringify(rep[k]));
  }
  fs.unlinkSync(harness); server.close();
});
