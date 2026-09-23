// Capture gameplay screenshots for visual review.
// Usage: node test/screenshot.mjs <name> <width,height> [scenario]
//   scenarios: build | wave | boss | ad | tutorial | result
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

const name = process.argv[2] || 'shot';
const size = process.argv[3] || '1280,720';
const scenario = process.argv[4] || 'wave';

const script = `
setTimeout(() => {
  try {
    Store.setSettings({ tutorialDone: ${scenario === 'tutorial' ? 'false' : 'true'} });
    Store.setCoins(340); Store.setAdReadyAt(0);
    const s = '${scenario}';
    const MAPIDX = ${process.env.MAPIDX || 0};
    if (s === 'levels') {
      Main.showScreen('screen-levels');
      UI.selectedChapter = ${process.env.CH || 0};
      UI.buildLevelSelect();
      return;
    }
    Main.startLevel(MAPIDX);
    const g = Main.game; g.gold = 4000;
    if (s !== 'tutorial') {
      const pool = (typeof unlockedTowers === 'function' ? unlockedTowers(MAPIDX + 1) : ['cannon','arc','cryo','rail','venom','pylon']);
      pool.forEach((t,i) => {
        const n = g.buildNodes[i*3]; if (n) { g.selectedBuild = t; g.tryBuild(n.x, n.y); }
      });
      g.selectedBuild = null;
      const v = g.towers.find(t => t.id === 'venom'); if (v) { v.level = 3; v.recompute(); }
      g.heroes.push(new Hero('pistol', 3, 8, g));
      g.heroes.push(new Hero('minigun', 5.5, 8, g));
    }
    if (s === 'wave' || s === 'boss') {
      if (s === 'boss') { g.waveIndex = g.map.bossWave - 1; }
      g.startWave();
      const ticks = s === 'boss' ? 40 : 240;
      for (let k = 0; k < ticks; k++) g.update(1/60);
      if (s === 'wave') { g.selectedTower = g.towers[0]; UI.refresh(); }
    } else if (s === 'ad') {
      UI.watchAd();
    } else if (s === 'result') {
      g.lives = Math.round(g.map.lives * 0.8); g.waveIndex = g.waves.length; g.win();
    }
    g.render();
  } catch (e) { document.title = 'ERR ' + e.message; }
}, 400);`;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/(src|href)="(css|js|assets|manifest)/g, '$1="/$2')
  .replace('</body>', `<script>${script}</script></body>`);
const harness = path.join(ROOT, 'test', '_shot.html');
fs.writeFileSync(harness, html);
const outFile = `test/${name}.png`;
const c = spawn('/usr/local/bin/chrome', ['--headless=new','--no-sandbox','--disable-gpu',
  `--window-size=${size}`, '--virtual-time-budget=9000', `--screenshot=${outFile}`,
  `http://localhost:${port}/test/_shot.html`]);
c.on('close', () => {
  fs.unlinkSync(harness); server.close();
  console.log(fs.existsSync(outFile) ? `${outFile} (${fs.statSync(outFile).size} bytes)` : 'FAILED');
});
