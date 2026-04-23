# Covenant of Water — Backlog

Organized by priority. Move items into GitHub Issues when actively working on them. Keep this scannable — if it gets longer than one screen, archive completed or dead items.


## Active / Next Up

### Host visual atmosphere expansion

Beyond the CSS campfire patch. The group safari host screen is currently functional but visually thin compared to the Solo Safari. After Mirror enrichment is done, expand the host experience with:
- ~~Apply the campfire atmosphere patch (already written, CSS-only, zero-logic — `CAMPFIRE_ATMOSPHERE_PATCH.md`).~~ ✅ Shipped 2026-04-22 — v2 patch applied (data-tier attribute system, CSS-variable driven, randomized per-ember vars via JS spawner, film grain, vignette-breathe). Old class-based rules removed; card warmth and campfire-phase overrides retained.
- Per-scenario atmospheric backgrounds, not just per-tier.
- Phase-specific visual choreography (pulse phase, campfire phase, reveal phase each have distinct moods).
- Reveal phase animation — drift count should land with weight, not just appear.
- Capstone visual treatment for the chaotic/crisis vibe.

### Group safari avatar selection
- **Add avatar selection step before joining a session.** Player picks one of the 9 instinct animals (or a subset) before entering their name. Mirrors the Solo Safari's "What do you bring to the watering hole?" framing.
- **Display chosen avatar throughout the player's experience:** in the lobby roster, at the top of the pulse screen, on the prediction screen, and on the personal Mirror.
- **Capture avatar choice as data, but do NOT yet use it as a Bayesian prior in analyze().** Store at `sessions/{id}/players/{pid}/avatarId` for future research. See `decisions.md` for full reasoning.
- ~~Replace the lion emoji on the player join screen with a real animal portrait.~~ ✅ Shipped 2026-04-22 — `elephant.jpg` portrait now renders on the join card.

### Content & messaging changes
- **Update solo safari context tabs (World, Rules, Scoring, Psychology).** Current copy describes the v1 psychometric engine. Rewrite to reflect v2 — foundation weights, Euclidean archetypes, piecewise breakpoints, shadow scoring, drift analysis.
- ~~Add matching tabs to group safari.~~ ✅ Shipped 2026-04-23 — five tabs (World / Rules / Scoring / Theory / Applications), persistent top-nav, content lifted from the 2026-04-23 Innovation-Readiness spec. Theory names Snowden, Heifetz, Edmondson, Woolley, Haidt, Rittel & Webber.
- ~~Replace drift reveal with historical outcome.~~ ✅ Shipped 2026-04-22 — host reveal now leads with the scenario's real-world context (`teach` field); drift count is a footer line. Phones show "The Real Story" card beneath the personal drift verdict.
- ~~Change the avatar question on solo safari.~~ ✅ Shipped 2026-04-22 — heading is "Choose Your Avatar" with the "watering hole" subhead.
- ~~Personalize the Mirror narrative.~~ ✅ Shipped 2026-04-22 — player's name threads into the eyebrow, moral-signature prose, breakpoint prose, and insights intro on `PlayerMirrorPhone`.
- ~~Mirror debrief restructure (2026-04-23 spec Part 3).~~ ✅ Shipped 2026-04-23 — `GroupMirrorHost` now leads with the 5-section spec layout (Arrival, Group Profile, Metrics, Academic Synthesis, Bridge) with dynamic descriptors threaded to RC / Holding Environment / Turn-Taking scores. Rich visuals moved to Deep Dive panel.
- ~~Innovation-Readiness metric (turn-taking equality).~~ ✅ Shipped 2026-04-23 — `computeTurnTakingEquality` wired into `analyze()` as a Woolley c-factor proxy; exposed via `grp.turnTakingEquality`, shown as a 5th RC gauge, two new narrative triggers (GT-TT-HIGH/LOW).
- ~~Biome display names + Cynefin subtitles + biome intro cards.~~ ✅ Shipped 2026-04-23 — internal codes WONDER/TENSION/FRACTURE/ABYSS/MIRROR unchanged; display layer uses Short-Grass Plains / Acacia Savanna / Woodland & River / Montane Highlands / The Campfire.

### Solo safari polish
- **Update final-tier image progression.** Last background needs many animals to emphasize ecological complexity. Currently backwards — earlier tiers are denser than the final.

## Phase 4: Polish & Launch Prep

### Bug-resistance & robustness (new)
From the 2026-04-19 post-mortem on the playtest bugs. None of these are urgent; they are the "make future bugs less likely" pile.
- **Centralize the double-tap guard.** Replace scattered `pulseLocked` / `predLocked` ref patterns with a single `useSubmitOnce()` hook. One place to get right; every submit action reuses it.
- **State machine for phase transitions.** Phases are currently strings compared with `===`. A typo (`'capston_vote'`) fails silently. Define a `PHASES` constants object so typos become reference errors.
- **Enable React StrictMode in development.** Wrap `<App />` in `<React.StrictMode>`. Intentionally double-invokes effects and renders in dev, which surfaces the "effect runs twice and breaks the counter" bug class months before a playtest finds it.
- **Server-side dedup pattern for all critical writes.** `submitPulse` and `submitPrediction` now have check-then-write dedup. Extend the same pattern to `submitGroupVote`, `submitCapstoneAssessment`, and any future write that increments a counter or transitions a phase.
- **Bridge-API contract smoke test** (from the 2026-04-22 regression). A tiny 5-line check run on every commit that confirms every function named in `window.CovenantFirebase` is actually defined. Would have caught the `reshapeResultsForFirebase` drop instantly. See `decisions.md` 2026-04-22.
- **Consider extracting the React views into a separate `multiplayer-views.js` module.** Nice-to-have for version-control diff size, browser caching, and code hygiene — but NOT a bug-prevention mechanism. Do only if/when the inline script block becomes unwieldy. See decisions log.

### General hardening
- **Multiplayer edge case hardening.** Disconnects mid-round, host refresh behavior, session timeout, player reconnect flow, graceful analyze() failure, stale sessionStorage on new device.
- **Tighten Firebase security rules.** Currently `.read: true, .write: true` — fine for development, not for public launch. Add shape validation and scoped writes.
- **Replace emoji/icon placeholders with rich SVG illustrations.** Drop-in replacements matching the warm-earth palette.
- **Missing visual assets.** FRACTURE tier background (cracked earth / drought), ABYSS tier background (volcanic rift), CAPSTONE background. Gemini prompts drafted in `visual_implementation_and_gemini_prompts.md`.
- **Additional animal portraits** for any archetypes still showing as emoji.

## Icebox (maybe someday)

- **AION-ΔYP Field Guide integration.** PDF is stunning but it's a NotebookLM deck, not a web asset. Options: convert key slides to standalone pages, or link as downloadable PDF from results screen.
- **Session analytics dashboard.** Compare sessions over time, track which scenarios produce the most differentiated data, surface outlier groups.
- **Host controls for mid-game adjustments** (skip a scenario, extend campfire timer, re-roll a round).
- **Post-game export.** Let players download their Mirror portrait as an image or PDF.
- **"Hide drift count" option.** Some user research may be needed on whether publicly broadcasting drift helps or hurts psychological safety.

## Reference
- Psychometric math: `psychometric_engine_spec_v2.md`
- Visual asset strategy: `visual_implementation_and_gemini_prompts.md`
- Firebase setup: `FIREBASE_SETUP_GUIDE.md`
- Multiplayer integration: `INTEGRATION_CHECKLIST.md`
- Architecture decisions: `decisions.md`
- Ship log: `changelog.md`
- Test harness: `test-harness.js` (paste into browser console)
