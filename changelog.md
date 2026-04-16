# Covenant of Water — Changelog

What has actually shipped, date-stamped. Newest first. Keep entries to 1–3 lines.

## 2026-04-15

- **MVP progress reassessed at ~70%.** Phase 1 ~92%, Phase 2 ~80%, Phase 3 ~40%. Primary remaining risk: real multiplayer playtest has not yet verified today's bugfixes. Estimated 15-25 hours remaining across 6-10 focused sessions.
- **Synthetic test harness built and validated.** 200-line browser-pasteable JS that simulates 2–8 players across 6 distinct test scenarios and runs analyze() on the synthetic output. Confirmed it catches the argument-order bug instantly (same error the browser console showed). Full suite runs in ~2 seconds. Stored in Claude project knowledge as `test-harness.js` — not committed to GitHub (dev tool, not product asset).
- **Bug #1 identified and fixed: analyze() argument order.** `handleAnalyze()` in group.html was calling `analyze(pl, sc, gv, sy)` but the function signature is `analyze(pl, gv, sc, campDur, sy)`. Every multiplayer session since launch crashed at the Mirror phase because of this — including SHARK61, which got stuck at `phase: "analyzing"` and never wrote `/results`. Fix also threads the `campfire_duration_ms` array through to populate the Holding Environment metric. Deployed to GitHub (commit: "fix chaotic crisis mirror crash"). **Awaiting real playtest verification.**
- **Bug #2 identified and fixed: capstone randomization per-device.** `const CAP = CAPSTONES[Math.floor(Math.random()*...)` ran on every device at page load, so host and players independently rolled different capstone scenarios. Host now picks once at game start, broadcasts index to Firebase at `sessions/{id}/capstoneIndex`, players subscribe and sync. This was the "why is the fragment about cobalt when the scenario is about something else" bug.
- **Campfire atmosphere + stress escalation patch written (not yet applied).** CSS-only: 20 drifting ember particles that intensify by tier, radial warm glow from bottom-center during campfire phase, progressive corner vignetting as WONDER → TENSION → FRACTURE → ABYSS, tier-responsive card warmth, subtle card-breathing animation at high stress. Fully respects `prefers-reduced-motion`. Zero game-logic changes.
- **Project tracking established.** Created `backlog.md`, `changelog.md`, `decisions.md` as the three planning documents. Committed to GitHub for version history and rendered readability; also mirrored in Claude project knowledge so context persists across sessions.

## 2026-04-14

- **Multiplayer Firebase backend live (writes layer only).** Full session flow verified with real playtest: host creates session with safari-themed join code, players join on phones, 9 rounds of private pulses + campfire + group votes + predictions + reveal all captured to Firebase correctly. **Important correction:** analyze() crashed silently at end of every session due to Bug #1; the Mirror never successfully rendered. This was discovered 2026-04-15.
- **Multiplayer views v2 playtest fixes:** prediction double-tap prevention (ref-based lock), drift results displayed in reveal phase, scenario text and options visible during campfire discussion, capstone scenario text displayed on host, Mirror/analyze flow wired (though analyze itself was broken), 30-second minimum campfire discussion time.
- **Tier-specific background system** wired into both `HostView` and `PlayerView`. `BG_MAP` + `updateBgLayer()` cycles through wonder/tension/river/montane/milkyway/campfire per phase with opacity crossfades.
- **Lush backgrounds added to solo safari** with lightened overlay so the art is visible through the dark gradient.

## 2026-04-13

- **Psychometric Engine v2.0 integrated into `group.html`.** Enhanced `analyze()` with Euclidean distance archetype assignment (replaces threshold buckets), piecewise breakpoint detection, shadow scores, Moral Elasticity, Adaptive Calibration, Holding Environment, Relational Calibration composite, and 12 individual + 8 group computed narrative triggers. `RCGauge` and `BreakpointCurve` visualization components added.
- **All 75 group scenarios re-tagged** with multi-vector foundation weights (`fw`) and contextually appropriate foundation markers (`caf`).
- **`selSess()` restructured** to guarantee a stress gradient (2 WONDER → 3 TENSION → 2 FRACTURE → 1 ABYSS → 1 MIRROR) for piecewise curve fitting.

## 2026-04-12 and earlier

- **Solo Safari psychometric engine module** (`solo-psychometric-engine.js`) created with Euclidean centroids, piecewise breakpoints, shadow scoring, drift arcs, narrative triggers. Latency tracking hooks wired into `index.html` and verified working.
- **Firebase Realtime Database provisioned** on Spark (free) tier. Permissive development rules. `firebase-bridge.js` authored to wrap all Firebase operations as a single module.
- **Visual asset library committed:** 14 animal portraits, 8+ tier backgrounds, 3 texture overlays, splash video.
- **Initial single-device group.html prototype** built with React + Babel + pass-the-device flow, 75 scenarios across 5 tiers, campfire discussion, prediction mechanics, capstone synthesis, Mirror output.
- **Initial solo safari** with 4-biome progression, 9 instinct avatars, ecosystem meters, fate dice.
