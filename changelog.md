# Covenant of Water — Changelog

What has actually shipped, date-stamped. Newest first. Keep entries to 1–3 lines.

## 2026-04-22 — Mirror bridge restored + drift reveal rewritten + avatar/name polish

One evening pass on the post-Mirror-enrichment backlog. Five-in-one.

- **Bridge regression found and fixed.** `firebase-bridge.js` was missing `reshapeResultsForFirebase`, `playerNames`, `latencies`, and per-round `campDur` — all of them silently dropped by the 2026-04-19 deduplication commit. `HostView.handleAnalyze` was falling into its catch branch on every session, writing `{error: ...}` to `/results`, so players have been rendering the error fallback, not the rich portrait. Restored from `5a9c81a`. The Mirror enrichment components (`PlayerMirrorPhone`, `GroupMirrorHost`) have been wired all along; they just never received real data.
- **Drift reveal → historical outcome.** Host reveal phase now leads with "The Real Story" and the scenario's `teach` paragraph in a styled card; drift count is a compact footer line. Phones keep the personal YOU DRIFTED / YOU HELD GROUND verdict and append a "The Real Story" card beneath it. Shaming moment becomes educational.
- **Mirror personalization.** `PlayerMirrorPhone` now threads `myName` into four spots: eyebrow ("IAN'S MIRROR"), moral-signature prose, breakpoint prose, and the computed-insights intro. Fallback copy preserved when name is missing.
- **Solo avatar question rewritten.** Header on `S1` is now "Step 1 · Choose Your Avatar" with the subhead "What do you bring to the watering hole? Select the instinct that feels most natural to you." Ego-threat trigger ("Who do you think you are?") retired.
- **Lion emoji → elephant portrait on the player join screen.** Real `img/elephant.jpg` in a circular frame replaces the 🦁 emoji. Not per-player yet (that's the avatar-selection task still in the backlog), but the visual upgrade alone is a meaningful welcome.
- **Still needs:** real multi-device playtest to verify the bridge fix actually makes the rich Mirror render. Everything compiles; no end-to-end run yet.

## 2026-04-19 — All 5 playtest bugs fixed (awaiting real-game verification)

All five bugs logged from the 2026-04-15 playtest have been patched in `group.html` and `firebase-bridge.js`. Fixes compiled locally; real multi-device playtest still needed to confirm.

- **Bug #1 (pulse multi-vote):** Root cause was server-side — `submitPulse` unconditionally incremented `pulsesSubmitted` on every call, so any client-side lock failure inflated the counter. Added check-then-write: if a pulse already exists for that player/round, the payload overwrites but the counter does NOT re-increment.
- **Bug #2 (prediction multi-vote):** Same pattern, same fix applied to `submitPrediction`.
- **Bug #3 (pulse timer keeps counting):** `handlePulse` now explicitly sets `pulseTimer` to 0 and nulls `timerRef.current` so no stale render can show a ticking number post-submit.
- **Bug #4 (confirmation flash too brief):** Added `flashUntil` state + pre-phase-routing intercept. The "✓ Pulse Submitted" / "✓ Prediction Submitted" screen now holds for a guaranteed 2 seconds even if the host advances the phase immediately.
- **Bug #5 (drift display sync):** Player reveal view rewritten with explicit YOU CHOSE / GROUP CHOSE cards and color-coded verdict. "Loading drift data..." dead-end replaced with useful states that distinguish "no pulse on record" from "waiting for group vote".
- **No architectural changes.** Bugs were addressed in-place inside `group.html`'s inline React code; the file split into `multiplayer-views-v2.js` was explicitly declined (see decisions log).

## 2026-04-15 (evening) — FIRST SUCCESSFUL END-TO-END MULTIPLAYER GAME

After 3 days of bug-hunting, a complete 2-player multiplayer session ran to completion with differentiated Mirror portraits rendered on both player devices.

- **Players:** Ian (laptop host + Firefox incognito player_0) and Onur (iPhone Chrome player_1)
- **Session:** 9 rounds + capstone synthesis
- **Player 0 result:** "The Vanguard" — full prose narrative rendered
- **Player 1 result:** "The Chameleon" — distinct archetype, full prose narrative rendered
- **Bugs fixed during session to reach this state:**
  - Bug #1 (analyze argument order) — previously documented
  - Bug #2 (capstone randomization per-device) — previously documented
  - Bug #3 (missing phase transition after writeResults) — fixed with setTimeout workaround
  - Bug #4 (PlayerView reading myResults.players instead of myResults.ind)
  - Bug #5 (PlayerView reading arch.nm/arch.de instead of arch.title/arch.prose)
- **Known remaining gap:** Both host and player Mirror views render only the archetype title/prose — not the full 30-metric portrait (archBlend, shadow, drift arc, breaking point, latency type, computed narratives, radar chart, etc.). Engine data is complete in Firebase; UI needs to be expanded. Tracked in backlog as highest-priority Phase 3 item.

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
