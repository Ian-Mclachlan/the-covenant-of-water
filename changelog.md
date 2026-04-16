# Covenant of Water — Changelog

What has actually shipped, date-stamped. Newest first. Keep entries to 1–3 lines.

## 2026-04-14

- **Multiplayer Firebase backend live and tested end-to-end.** Full session flow verified with real playtest: host creates session with safari-themed join code (e.g., SHARK61), players join on phones, 9 rounds of private pulses + campfire + group votes + predictions + reveal, capstone synthesis, `analyze()` runs on host, Mirror results written to Firebase and pushed to player phones. Playtest data: Ian + Onur, session SHARK61, 9 rounds, all pulses and predictions captured with full telemetry.
- **Multiplayer views v2 playtest fixes:** prediction double-tap prevention (ref-based lock), drift results displayed in reveal phase, scenario text and options visible during campfire discussion, capstone scenario text displayed on host, Mirror/analyze flow completed end-to-end, 30-second minimum campfire discussion time.
- **Tier-specific background system** wired into both `HostView` and `PlayerView`. `BG_MAP` + `updateBgLayer()` cycles through wonder/tension/river/montane/milkyway/campfire per phase with opacity crossfades.
- **Lush backgrounds added to solo safari** with lightened overlay so the art is visible through the dark gradient.

## 2026-04-13

- **Psychometric Engine v2.0 integrated into `group.html`.** Enhanced `analyze()` with Euclidean distance archetype assignment (replaces threshold buckets), piecewise breakpoint detection, shadow scores, Moral Elasticity, Adaptive Calibration, Holding Environment, Relational Calibration composite, and 12 individual + 8 group computed narrative triggers. `RCGauge` and `BreakpointCurve` visualization components added.
- **All 75 group scenarios re-tagged** with multi-vector foundation weights (`fw`) and contextually appropriate foundation markers (`caf`).
- **`selSess()` restructured** to guarantee a stress gradient (2 WONDER → 3 TENSION → 2 FRACTURE → 1 ABYSS → 1 MIRROR) for piecewise curve fitting.

## 2026-04-12 and earlier

- **Solo Safari psychometric engine module** (`solo-psychometric-engine.js`) created with Euclidean centroids, piecewise breakpoints, shadow scoring, drift arcs, narrative triggers. Latency tracking hooks wired into `index.html` and verified working.
- **Firebase Realtime Database provisioned** on Spark (free) tier. Permissive development rules. `firebase-bridge.js` authored to wrap all Firebase operations as a single module.
- **Visual asset library** committed: 14 animal portraits, 8+ tier backgrounds (wonder, tension, river, montane, milkyway, campfire, plains, savanna, splash, select, biome, game, results), 3 texture overlays (embers, journal, kuba), splash video.
- **Initial single-device group.html prototype** built with React + Babel + pass-the-device flow, 75 scenarios across 5 tiers, campfire discussion, prediction mechanics, capstone synthesis, Mirror output.
- **Initial solo safari** with 4-biome progression, 9 instinct avatars, ecosystem meters, fate dice.
