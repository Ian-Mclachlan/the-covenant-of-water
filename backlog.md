# Covenant of Water — Backlog

Organized by priority. Move items into GitHub Issues when actively working on them. Keep this scannable — if it gets longer than one screen, archive completed or dead items.


## Active / Next Up

### Mirror view enrichment — THE next step

The engine computes ~30 metrics per player but the multiplayer views only render 2 of them (archetype title + prose). Everything else is already in Firebase at `/sessions/{id}/results`. This is the single highest-leverage remaining task. Players are currently getting ~5% of the engine's output. Fixing it makes the multiplayer Mirror feel as specific as the Solo Safari Mirror.

Broken into two tasks so progress is trackable:

- **Task 1 — Upgrade the Player Phones (Player Mirror).** Rewrite the phone's Mirror view so it displays the deep data that's already computed: archetype blend percentages (e.g., "52% Vanguard / 28% Anchor"), top and shadow foundations, drift arc label, breaking point, latency type, and 2–4 computed narratives pulled from the trigger engine. Model the rendering after the Solo Safari's Mirror output — that's the target bar for specificity.
- **Task 2 — Power Up the Host Screen (Host Mirror).** The visual components (`RCGauge`, `BreakpointCurve`, radar chart) already exist in `group.html` but are unplugged in the multiplayer render path. Wire them up during the `mirror` phase and add the group-level metrics: RC%, Moral Elasticity, Adaptive Calibration, Holding Environment, Capstone Synthesis, plus the group-level computed narratives.

### Host visual atmosphere expansion

Beyond the CSS campfire patch. The group safari host screen is currently functional but visually thin compared to the Solo Safari. After Mirror enrichment is done, expand the host experience with:
- Apply the campfire atmosphere patch (already written, CSS-only, zero-logic — `CAMPFIRE_ATMOSPHERE_PATCH.md`).
- Per-scenario atmospheric backgrounds, not just per-tier.
- Phase-specific visual choreography (pulse phase, campfire phase, reveal phase each have distinct moods).
- Reveal phase animation — drift count should land with weight, not just appear.
- Capstone visual treatment for the chaotic/crisis vibe.

### Group safari avatar selection
- **Replace the lion emoji on the player join screen with a real animal portrait.** Currently shows the same lion across all players. Easy fix using existing `/img/` portraits.
- **Add avatar selection step before joining a session.** Player picks one of the 9 instinct animals (or a subset) before entering their name. Mirrors the Solo Safari's "What do you bring to the watering hole?" framing.
- **Display chosen avatar throughout the player's experience:** in the lobby roster, at the top of the pulse screen, on the prediction screen, and on the personal Mirror.
- **Capture avatar choice as data, but do NOT yet use it as a Bayesian prior in analyze().** Store at `sessions/{id}/players/{pid}/avatarId` for future research. See `decisions.md` for full reasoning.

### Content & messaging changes
- **Replace drift reveal with historical outcome.** Instead of "X players drifted from the group," show what society actually did in this real-world scenario. Scenarios already have `teach` fields with "WHAT ACTUALLY HAPPENED" narratives — surface those in the reveal phase. Turns a subtle shaming moment into a genuinely educational one.
- **Change the avatar question on solo safari.** Replace "Who do you think you are?" (ego-threat trigger) with:
  - Heading: *Step 1: Choose Your Avatar*
  - Subhead: *What do you bring to the watering hole? Select the instinct that feels most natural to you.*
- **Personalize the Mirror narrative.** Use the player's name several times throughout their Mirror output so it feels genuinely addressed to them, not templated.
- **Update solo safari context tabs (World, Rules, Scoring, Psychology).** Current copy describes the v1 psychometric engine. Rewrite to reflect v2 — foundation weights, Euclidean archetypes, piecewise breakpoints, shadow scoring, drift analysis.
- **Add matching tabs to group safari.** New content covering Haidt's Moral Foundations Theory, Edmondson's psychological safety, Lencioni's team dysfunction model, and the group psychometric math at a high level. Significant writing task.

### Solo safari polish
- **Update final-tier image progression.** Last background needs many animals to emphasize ecological complexity. Currently backwards — earlier tiers are denser than the final.

## Phase 4: Polish & Launch Prep

### Bug-resistance & robustness (new)
From the 2026-04-19 post-mortem on the playtest bugs. None of these are urgent; they are the "make future bugs less likely" pile.
- **Centralize the double-tap guard.** Replace scattered `pulseLocked` / `predLocked` ref patterns with a single `useSubmitOnce()` hook. One place to get right; every submit action reuses it.
- **State machine for phase transitions.** Phases are currently strings compared with `===`. A typo (`'capston_vote'`) fails silently. Define a `PHASES` constants object so typos become reference errors.
- **Enable React StrictMode in development.** Wrap `<App />` in `<React.StrictMode>`. Intentionally double-invokes effects and renders in dev, which surfaces the "effect runs twice and breaks the counter" bug class months before a playtest finds it.
- **Server-side dedup pattern for all critical writes.** `submitPulse` and `submitPrediction` now have check-then-write dedup. Extend the same pattern to `submitGroupVote`, `submitCapstoneAssessment`, and any future write that increments a counter or transitions a phase.
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
