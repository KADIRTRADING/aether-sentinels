// =============================================================================
//  AETHER SENTINELS — ASSET OVERRIDE CONFIG
// =============================================================================
//  EDIT THIS FILE to skin the game with your own images and sounds.
//
//  HOW IT WORKS
//  ------------
//  * Every tower and hero can use a custom IMAGE per LEVEL and a custom
//    FIRE SOUND (played each time that unit shoots).
//  * Put a URL (https://..., or a local path like "assets/venom_l1.png") next
//    to the unit. Change the URL, reload the game, and the new art/sound is used.
//  * Leave a value as "" (empty string) or null to keep the built-in
//    vector graphics / procedural sound for that unit.
//
//  IMAGES: images.<unitId> is an ARRAY indexed by (level - 1).
//    images.venom[0] -> the image shown at LEVEL 1
//    images.venom[1] -> the image shown at LEVEL 2   (after paying coins)
//    images.venom[2] -> LEVEL 3, and so on.
//    If a level has no image, the highest available image (or vector) is used.
//
//  AUDIO: audio.<unitId> is a single URL played when that unit fires.
//
//  EXAMPLE (uncomment / replace the URLs with your own):
//    images.venom = [
//      "https://your.cdn/venom_level1.png",
//      "https://your.cdn/venom_level2.png",
//      "https://your.cdn/venom_level3.png"
//    ];
//    audio.venom = "https://your.cdn/venom_shot.mp3";
//
//  Unit IDs
//  --------
//  Towers: arc, cryo, cannon, rail, pylon, venom
//  Heroes: pistol, smg, rifle, sniper, minigun, rocket
// =============================================================================

const ASSET_CONFIG = {

  // ---- IMAGES (per level: [level1, level2, level3, ...]) ----
  images: {
    // Towers
    arc:    [],
    cryo:   [],
    cannon: [],
    rail:   [],
    pylon:  [],
    venom:  [
      // "assets/venom_l1.png",   // Venom Spire — Level 1  (image.1 = url)
      // "assets/venom_l2.png",   // Venom Spire — Level 2
      // "assets/venom_l3.png",   // Venom Spire — Level 3
    ],

    // Heroes
    pistol:  [],
    smg:     [],
    rifle:   [],
    sniper:  [],
    minigun: [],
    rocket:  [],
  },

  // ---- FIRE AUDIO (one sound per unit, played when it shoots) ----
  audio: {
    // Towers
    arc:    "",
    cryo:   "",
    cannon: "",
    rail:   "",
    pylon:  "",
    venom:  "",   // e.g. "assets/venom_shot.mp3"  -> plays when Venom Spire fires

    // Heroes
    pistol:  "",
    smg:     "",
    rifle:   "",
    sniper:  "",
    minigun: "",
    rocket:  "",
  },

  // ---- COIN LEVEL-UP COSTS ----
  //  Cost (in COINS) to raise a unit's level. Index 0 = cost for 1->2.
  //  Level increases stats multiplicatively (see levelBonus).
  levelUp: {
    costs: [50, 120, 250, 500, 900],  // 1->2, 2->3, 3->4, 4->5, 5->6
    maxLevel: 6,
    // each level multiplies damage & health by this much
    dmgPerLevel: 0.35,     // +35% damage per level
    hpPerLevel: 0.30,      // +30% health per level (heroes)
    ratePerLevel: 0.06,    // fires 6% faster per level
  },

  // ---- REWARDED ADS ----
  ads: {
    rewardCoins: 100,        // coins granted per completed rewarded ad
    cooldownSec: 30,         // seconds before the watch-ad button re-arms
    adDurationSec: 5,        // simulated ad length (skippable after this)
    // Rotating "creatives" shown in the simulated ad. Add image/video URLs here
    // to show your own promo art. Each item: { title, sub, img, bg }.
    creatives: [
      { title: "AETHER ELITE", sub: "Unlock legendary weapon skins!", img: "", bg: "#6a5cff" },
      { title: "DOUBLE COINS", sub: "Limited-time booster pack", img: "", bg: "#35e0d0" },
      { title: "NEW MAPS", sub: "Conquer the Void expansion", img: "", bg: "#ff5470" },
    ],
  },
};

// Expose globally (classic script, no modules)
if (typeof window !== 'undefined') window.ASSET_CONFIG = ASSET_CONFIG;
