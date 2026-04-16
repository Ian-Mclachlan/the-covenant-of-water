# Covenant of Water — Backlog

Organized by priority. Move items into GitHub Issues when actively working on them. Keep this scannable — if it gets longer than one screen, archive completed or dead items.

## Active / Next Up

### Critical bugs
- **Multi-vote lockout in group safari.** Players can submit predictions and group-vote choices multiple times; the engine counts all of them. Lock out after first vote, or allow vote change but cap total submissions at player count. Applies to both the pulse phase and the prediction phase. Confirmed broken even with 2-player session.

### Content updates
- **Change the avatar question on solo safari.** Current text "Who do you think you are?" is an ego-threat trigger that undermines the psychological safety needed for an accurate Social MRI read. Replace with:
  - Heading: *Step 1: Choose Your Avatar*
  - Subhead: *What do you bring to the watering hole? Select the instinct that feels most natural to you.*

- **Update solo safari context tabs (World, Rules, Scoring, Psychology).** Current copy describes the v1 psychometric engine. Rewrite to reflect v2 — foundation weights, Euclidean archetypes, piecewise breakpoints, shadow scoring, drift analysis. Dedicated writing session.

- **Add matching tabs to group safari.** New content covering Haidt's Moral Foundations Theory, Edmondson's psychological safety, Lencioni's team dysfunction model, and a high-level explanation of the group psychometric math (foundation weights, drift, breaking points, Relational Calibration). This is a feature addition, not a visual tweak — dedicated writing session.

- **Personalize the Mirror narrative.** Use the player's name several times throughout the Mirror output so it feels genuinely addressed to them, not templated.

### Campfire visual experience
- **Campfire phase atmosphere (host screen).** Warm amber glow radiating from center, ember particle effects, `bg-campfire.jpg` behind the card, timer pulsing gently. Currently just a 🔥 emoji + timer + scenario text.
- **Wire existing Mirror components into multiplayer Host Mirror view.** `RCGauge`, `BreakpointCurve`, group narratives already exist and work in classic mode — just call them in the multiplayer `mirror` phase render path.
- **Wire individual Mirror into Player Mirror view.** Radar chart, shadow scores, breaking point, drift arc, computed narratives. Currently only shows archetype name + description on phone.
- **Stress escalation atmosphere.** As WONDER → TENSION → FRACTURE → ABYSS, warm card borders from gold toward rust, increase subtle vignetting, shift timer bar color, deepen the overall mood.
- **Lobby animal portraits.** Assign a random animal from `/img/` to each player and display alongside their name in the `HostLobby` roster.

### Solo safari polish
- **Update final-tier image progression.** Last background needs to include many animals to emphasize ecological complexity (currently under-populated — earlier backgrounds are denser than the final one, which is backwards).

## Phase 4: Polish & Launch Prep

- **Multiplayer edge case hardening.** Disconnects mid-round, host refresh behavior, session timeout, player reconnect flow, graceful `analyze()` failure, stale `sessionStorage` on new device.
- **Tighten Firebase security rules.** Currently `.read: true, .write: true` — fine for development, not for any public launch. Add shape validation and scoped writes.
- **Replace emoji/icon placeholders with rich SVG illustrations.** Drop-in replacements matching the warm-earth palette (see `visual_implementation_and_gemini_prompts.md`).
- **Missing visual assets.** FRACTURE tier background (cracked earth / drought), ABYSS tier background (volcanic rift), CAPSTONE background. Gemini prompts already drafted.
- **Additional animal portraits** for any archetypes still showing as emoji.

## Icebox (maybe someday)

- **AION-ΔYP Field Guide integration.** The PDF is stunning but is a NotebookLM deck, not a web asset. Options: convert key slides to standalone web pages, or link as downloadable PDF from the results screen.
- **Session analytics.** Compare sessions over time, track which scenarios produce the most differentiated data, surface outlier groups.
- **Host controls for mid-game adjustments** (skip a scenario, extend campfire timer, re-roll a round).
- **Post-game export.** Let players download their Mirror portrait as an image or PDF.

## Reference
- Psychometric math: `psychometric_engine_spec_v2.md`
- Visual asset strategy: `visual_implementation_and_gemini_prompts.md`
- Firebase setup: `FIREBASE_SETUP_GUIDE.md`
- Multiplayer integration: `INTEGRATION_CHECKLIST.md`
- Architecture decisions: `DECISIONS.md`
- Ship log: `CHANGELOG.md`
