# ⚡ Aether Sentinels — Strategic Tower Defense

A mobile-first HTML5 Canvas tower defense game in **vanilla JavaScript** — no
framework, no build step, and **no runtime dependencies**. Runs in any modern
browser and is set up to be wrapped as an Android app with
[Capacitor](https://capacitorjs.com/).

![icon](assets/icon-192.png)

---

## Quick start

```bash
git clone https://github.com/KADIRTRADING/aether-sentinels.git
cd aether-sentinels
npm run serve          # -> http://localhost:8080   (no install needed)
```

`npm run serve` uses a small zero-dependency Node server (`tools/serve.js`), so
you do **not** need `npm install` to play or to run the tests.

```bash
npm test               # 38 unit/integration tests (pure Node, no deps)
npm run test:browser   # drives index.html in headless Chrome
```

> `npm install` is only required for the Android/Capacitor wrapper. Serving a
> local HTTP origin (rather than opening `index.html` via `file://`) is
> recommended so the WebAudio context and `localStorage` behave normally.

---

## Controls

| Action | Touch | Mouse / Keyboard |
|---|---|---|
| Select a tower / hero to place | Tap a tray card | Click |
| Build | Tap a glowing ⬡ node | Click |
| Inspect / upgrade / sell | Tap a placed unit | Click |
| Move a hero | Press and drag it | Click and drag |
| **Fuse heroes** | Drag one hero onto another of the same weapon | Same |
| Aim Orbital Strike | Tap ☄ then tap the map | `Q`, then click |
| Cryo Pulse | Tap ❄ | `W` |
| Start wave | Tap **Start Wave** | `Space` / `Enter` |
| Pause | Tap ❚❚ | `P` |
| Speed 1× / 2× / 3× | Tap ▶ | `1` `2` `3` |
| Mute | Tap 🔊 in the HUD | `M` |
| Clear selection | Tap empty ground | `Esc` |

---

## How the game works

**Goal.** Enemies walk the lit path toward your Core. Every leak costs a life;
lose them all and the run ends. Clear all waves — including the boss — to win.

### The campaign: 100 maps in 10 themed chapters

| Chapter | Biome | Maps | Band |
|---|---|---|---|
| 1 Verdant Reach | Forest | 1–10 | Easy |
| 2 Frost Expanse | Glacier | 11–20 | Normal |
| 3 Ember Foundry | Volcanic | 21–30 | Normal → Hard |
| 4 Void Nexus | Void | 31–40 | Hard |
| 5 Sunken Works | Flooded ruins | 41–50 | Hard → Brutal |
| 6 Crimson Waste | Desert | 51–60 | Brutal |
| 7 Spore Hollow | Fungal | 61–70 | Brutal |
| 8 Iron Bastion | Fortress | 71–80 | Extreme |
| 9 Aurora Rift | Storm | 81–90 | Extreme |
| 10 Last Aether | Finale | 91–100 | Nightmare |

Every chapter has its own palette, path styling, animated colour wash and
decorative props (trees, ice shards, lava vents, runes, ruins, fungus, pipes,
crystals…). Each of the 100 maps has a **unique seeded path**, previewed as a
miniature on its level-select card, and its own difficulty step: wave threat
climbs smoothly from 52 to about 1160, waves per map from 10 to 20, lives taper
20 → 12, and boss health scales 0.8× → 2.7×.

Difficulty was fitted so the campaign is **hard but winnable throughout**: a
competent player who upgrades and uses abilities clears every sampled map, most
of them finishing in the 55–80% lives band (see `npm run audit:campaign`).

### Two currencies (a common point of confusion, now explained in-game)

| | Earned | Spent on | Persists? |
|---|---|---|---|
| **⬢ Gold** | Kills and cleared waves, **during** a battle | Building & upgrading towers/heroes | No — resets each match |
| **🪙 Coins** | Clearing maps, improving a star rating, rewarded ads | Permanent **level-ups** for a unit | Yes — saved to `localStorage` |

### Towers — each has a distinct counter-role

| Tower | Cost | Role |
|---|---|---|
| ⚡ **Arc Coil** | 90 | Chain lightning; energy **ignores half of armor** |
| ❄ **Cryo Node** | 80 | Area slow field (control, low damage) |
| 💥 **Mortar** | 120 | Splash — clears packed swarms |
| 🎯 **Railgun** | 150 | Long range, **armor-piercing**, bonus vs bosses |
| ◈ **Aegis Pylon** | 100 | Support — buffs damage/rate/range of nearby towers |
| ☣ **Venom Spire** | 130 | Poison over time; **ignores armor**, great vs high HP |
| 🔥 **Pyre Vent** | 100 | Flame **cone** — best DPS/gold but only 2.0 range, place on a corner *(map 4)* |
| 🌀 **Graviton Well** | 140 | Control — heavy slow plus a periodic **pull that drags enemies backwards** *(map 8)* |
| 🔆 **Prism Lance** | 190 | Beam that **ramps to 3.4× damage** while locked on one target — the boss answer *(map 14)* |
| 💠 **Flak Battery** | 160 | Multi-pellet spread; each pellet rolls dodge separately, so it **beats Phantoms** *(map 20)* |

Each has 3 gold upgrade tiers, **10 coin levels**, and a targeting priority
(First / Last / Strongest / Closest). Towers unlock as the campaign progresses
(shown in italics) so the first map offers a readable six rather than all ten.

### Enemies — each checks a different part of your build

`Drone` baseline · `Runner` speed · `Spawnling` crowds · `Brute` high HP ·
**`Warden`** heavy armor · **`Mender`** heals nearby allies ·
**`Phantom`** 25% dodge (DoT and AoE cannot be dodged).

The HUD shows a **NEXT** preview of the coming wave's composition so you can
prepare counters.

### Heroes & weapon fusion

Heroes deploy anywhere (not restricted to build nodes) and can be dragged to
reposition. **Drag one hero onto another of the same weapon to fuse them:**

`Pistol → SMG → Assault Rifle → Sniper Rifle → Minigun → Rocket Launcher`

### Bosses

`Aether Titan` (softest, first boss) · `Hive Mind` (spawns minions, capped) ·
`Void Colossus` (regenerates). Boss health scales per map across the campaign.
Bosses have damage
resistance, so a single-strategy defence will not stop them. A boss leak costs
~25% of the map's life pool.

---

## Custom skins & sounds — edit one file

Open **`js/assets.config.js`** and drop in your own image/audio URLs. Change a
URL, reload, done — no code changes:

```js
images.venom = [
  "assets/venom_l1.png",   // shown at Level 1
  "assets/venom_l2.png",   // Level 2 (after paying coins)
  "assets/venom_l3.png",   // Level 3 ...
];
audio.venom = "assets/venom_shot.mp3";   // plays whenever Venom Spire fires
```

Images are **per level**, so a unit's art changes as you level it up. Anything
left blank keeps the built-in vector art / procedural sound. Level-up costs and
ad rewards are configurable in the same file. Unit IDs: towers
`arc, cryo, cannon, rail, pylon, venom`; heroes
`pistol, smg, rifle, sniper, minigun, rocket`.

---

## Accessibility

* **Reduced motion** — disables screen shake and thins particles (also honours
  the OS `prefers-reduced-motion` setting).
* **High contrast** — brighter text and stronger borders.
* **Volume / mute** — persisted; mute is also on the `M` key.
* Keyboard shortcuts for every core action, visible focus outlines, `aria-label`
  / `aria-pressed` on DOM controls, and ≥44px touch targets.

---

## Project structure

```
index.html                 App shell (HUD, tray, panels, screens)
css/style.css              All styling incl. safe-area + responsive rules
js/
  utils.js                 Math helpers, seeded PRNG, versioned save store
  assets.config.js         ★ EDIT ME: custom image/audio URLs per unit & level
  data.js                  Towers, heroes, enemies, wave generation
  maps.js                  100-map campaign: chapter themes, seeded paths, decor
  audio.js                 Procedural WebAudio SFX (incl. per-weapon gun sounds)
  assetmanager.js          Loads/caches custom art & audio, falls back to vectors
  ads.js                   Rewarded-ad flow — SIMULATED (see limitations)
  particles.js             Capped particle system + floating combat text
  entities.js              Enemy, Projectile, Tower, Bullet, Shell, Hero
  game.js                  Engine: fixed-timestep loop, waves, economy, render
  tutorial.js              Contextual first-session coaching
  ui.js                    HUD, tray, inspect panels, level select, results
  main.js                  Bootstrap, input (mouse/touch/keys), screen routing
tools/serve.js             Zero-dependency static server
test/
  run-tests.js             52 automated tests  (npm test)
  harness.js               Loads game logic into Node with browser stubs
  browser-check.mjs        Headless-Chrome integration run
  screenshot.mjs           Visual capture helper
  *-audit.js               Balance / boss / economy / DPS / perf instrumentation
assets/                    Icons + icon generator
capacitor.config.json      Android wrapper config
```

---

## Testing

```bash
npm test                 # 52 tests: deterministic rules, balance invariants,
                         # campaign/chapter integrity, the four new tower kinds,
                         # save migration, reward accounting, regressions
npm run test:browser     # headless-Chrome run of the real index.html
npm run audit:balance    # difficulty band + wave threat curves
npm run audit:perf       # frame cost under heavy load
npm run audit:dps        # per-tower DPS and DPS-per-gold
npm run audit:campaign   # samples playthroughs across all 100 maps
```

`npm run test:browser` requires a Chrome/Chromium binary at
`/usr/local/bin/chrome` — edit the path in `test/browser-check.mjs` if yours
differs.

### Manual smoke test

**Desktop browser**
1. `npm run serve`, open `http://localhost:8080`.
2. Campaign → pick a chapter from the strip, then a map. The tutorial should appear and advance as you
   select a tower, place it, and inspect it.
3. Build 3–4 towers, press **Start Wave**; confirm kills, gold gain, and the
   wave-clear bonus toast.
4. Tap a tower: upgrade, change targeting, level up with coins, sell.
5. Deploy two Pistol heroes, drag one onto the other → they fuse into an SMG.
6. Press `1` `2` `3` — speed changes and motion stays smooth; `P` pauses.
7. Tap the coin **+** → the demo ad plays, pauses the battle, and pays out once.
8. Switch to another tab for ~30s and return — the game must **not** fast-forward.
9. Reach the boss wave; confirm the warning banner and that a boss leak costs
   several lives (not the whole pool).
10. Win or lose, then reload the page — progress, stars, and coins persist.

**Mobile browser (landscape)**
1. Serve on your LAN and open on the phone (`http://<your-ip>:8080`).
2. Confirm nothing is hidden behind a notch/gesture bar and the whole map fits.
3. Tap a tower — the inspect panel docks as a compact strip above the tray and
   the battlefield stays visible; every button is reachable.
4. Drag a hero; confirm the page never scrolls or pull-to-refreshes.
5. Rotate the device and back — the canvas re-fits correctly.
6. Check Settings → Reduced motion removes shake.

**Android (Capacitor)** — see below; not verified in this environment.

---

## Packaging for Android (Capacitor)

```bash
npm install              # needs npm registry access
npm run cap:add          # creates android/ from capacitor.config.json
npm run cap:sync         # copy web assets into the native project
npm run cap:open         # open in Android Studio
npm run android:bundle   # -> android/app/build/outputs/bundle/release/app-release.aab
```

Before uploading to Google Play you must generate a signing key and configure
`signingConfigs` in `android/app/build.gradle`, set launcher icons from
`assets/icon-512.png`, and complete the Play Console listing, content rating and
data-safety forms.

---

## Limitations — please read

* **Ads are simulated.** `js/ads.js` is a self-contained demo: it renders a
  locally generated placeholder, makes **no network request**, and contains **no
  ad SDK**. The overlay is labelled "Demo placeholder — not a real ad" in-game.
  To ship real rewarded ads you must supply an ad network account, choose a
  Capacitor plugin, add the app ID / ad unit IDs, and replace the body of
  `Ads.showRewarded()` with that SDK's call, invoking the reward callback from
  its completion handler. None of those credentials exist in this repository, so
  no real integration was attempted.
* **Android was not built or verified.** The development environment used for
  this work has no Android SDK and no access to the npm registry
  (`npm install` returns HTTP 403), so `npm install`, `npm audit`,
  `npx cap sync` and a Gradle build could not be executed. The Capacitor
  configuration and scripts are present and unchanged in structure, but treat
  the Android path as **untested**. Capacitor packages are declared as
  `optionalDependencies` so a plain clone never needs them.
* **Dependency audit could not be run** for the same reason. The browser game
  ships **zero runtime dependencies**, which keeps its attack surface minimal;
  Capacitor was bumped `6.1.2 → 6.2.1` (a compatible same-major patch) rather
  than force-upgraded across majors. Please run `npm install && npm audit` in an
  environment with registry access before release.
* **Balance was tuned against scripted players**, not human playtesters. The
  simulated players do not use abilities and upgrade conservatively, so they
  represent a *lower* skill bound; a skilled human will find the maps easier.
* On a very short landscape screen (≈360px tall) the 16×11 grid is
  height-constrained, so the canvas does not use the full screen width. Changing
  this would require reshaping the maps.
* Tower/HUD icons use emoji, which depend on a system emoji font. They render
  correctly on Android/iOS/desktop but appear as boxes in environments without
  one (e.g. bare headless Chrome).

---

## License

MIT.
