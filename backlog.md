# Covenant of Water — Backlog

Organized by priority. Move items into GitHub Issues when actively working on them. Keep this scannable — if it gets longer than one screen, archive completed or dead items.

## Blocking (Do Before Anything Else)

- **Verify the bugfix in a real multiplayer playtest.** Applied fixes for Bug #1 (analyze argument order) and Bug #2 (capstone randomization) are deployed but unverified in live session. Two players, 9 rounds, watch for: Mirror actually renders, capstone fragments match the scenario, no console errors. Until this is confirmed, MVP progress is blocked.

## Active / Next Up

### Critical bugs (from 2026-04-15 playtest)
- **Multi-vote lockout during pulse phase.** Players can submit pulses multiple times; calculator counts all of them. Lock needs to be stronger than the current `pulseLocked.current` ref — investigate timing/re-render race condition.
- **Multi-vote lockout during prediction phase.** Same pattern as above.
- **Pulse timer doesn't stop when player submits.** Should freeze at current value or show "TIME'S UP" immediately on submit, not continue counting.
- **Vote confirmation flash is too brief.** The checkmark that appears after voting disappears in a fraction of a second. Should hold for ~2 seconds so players register that their vote was captured.
- **Drift display sync broken.** Host screen says "look at your phone"; phone says "look at the shared screen." Neither actually shows the drift to the player who needs it.

### Content & messaging changes
- **Replace drift reveal with historical outcome.** Instead of "X players drifted from the group," show what society actually did in this real-world scenario. Scenarios already have `teach` fields with "WHAT ACTUALLY HAPPENED" narratives — surface those in the reveal phase. Turns a subtle shaming moment into a genuinely educational one.
- **Change the avatar question on solo safari.** Replace "Who do you think you are?" (ego-threat trigger) with:
  - Heading: *Step 1: Choose Your Avatar*
  - Subhead: *What do you bring to the watering hole? Select the instinct that feels most natural to you.*
- **Personalize the Mirror narrative.** Use the player's name several times throughout their Mirror output so it feels genuinely addressed to them, not templated.
- **Update solo safari context tabs (World, Rules, Scoring, Psychology).** Current copy describes the v1 psychometric engine. Rewrite to reflect v2 — foundation weights, Euclidean archetypes, piecewise breakpoints, shadow scoring, drift analysis.
- **Add matching tabs to group safari.** New content covering Haidt's Moral Foundations Theory, Edmondson's psychological safety, Lencioni's team dysfunction model, and the group psychometric math at a high level. Significant writing task.

### Campfire visual experience
- **Apply the campfire atmosphere patch.** Written and ready (`CAMPFIRE_ATMOSPHERE_PATCH.md`) — CSS-only ember particles, warm glow, tier-responsive card styling, stress escalation vignette. Zero logic changes. Apply after multiplayer verification.
- **Wire RCGauge and BreakpointCurve into multiplayer Host Mirror view.** Components exist and work in classic mode; just need to be rendered in the multiplayer mirror phase.
- **Wire individual Mirror into Player Mirror view.** Radar chart, shadow scores, breaking point, drift arc, computed narratives. Currently shows only archetype name + description on phone.
- **Lobby animal portraits.** Assign a random animal from `/img/` to each player and display alongside their name in the HostLobby roster.

### Solo safari polish
- **Update final-tier image progression.** Last background needs many animals to emphasize ecological complexity. Currently backwards — earlier tiers are denser than the final.

## Phase 4: Polish & Launch Prep

- **Multiplayer edge case hardening.** Disconnects mid-round, host refresh behavior, session timeout, player reconnect flow, graceful analyze() failure, stale sessionStorage on new device.
- **Tighten Firebase security rules.** Currently `.read: true, .write: true` — fine for development, not for public launch. Add shape validation and scoped writes.
- **Replace emoji/icon placeholders with rich SVG illustrations.** Drop-in replacements matching the warm-earth palette.
- **Missing visual assets.** FRACTURE tier background (cracked earth / drought), ABYSS tier background (volcanic rift), CAPSTONE background. Gemini prompts drafted in `visual_implementation_and_gemini_prompts.md`.
- **Additional animal portraits** for any archetypes still showing as emoji.
- **Varied per-scenario backgrounds.** Beyond tier-wide backgrounds, each scenario could have its own atmospheric shot (particularly for the shared host screen).

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
