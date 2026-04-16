# Covenant of Water — Architecture Decisions

Short records of meaningful choices and the reasoning behind them. Append-only — don't rewrite history. If a decision is reversed, add a new entry explaining why.

## 2026-04-15 — Invest in a synthetic test harness before any further engine work
After losing significant time to a hidden bug (analyze() argument order) that passed all superficial checks and was only discovered during teardown of a broken playtest, committed to maintaining a synthetic test harness that can run 6+ scenarios through analyze() in ~2 seconds. Stored in Claude project knowledge, not GitHub, because it's a dev tool rather than a product asset. Every future change to analyze(), selSess(), scenario weights, or narrative triggers must pass this harness before committing.

## 2026-04-15 — Host broadcasts capstone selection; no more per-device randomization
Any state that must be consistent across host and players must be chosen once (typically on the host) and broadcast via Firebase. Module-level `Math.random()` at page load is a landmine — runs independently on every device. Rule: if two devices need to agree on anything derived from randomness, the host picks and writes to Firebase, players subscribe and mirror. Applied first to capstone index; same pattern will apply to any future randomized shared state.

## 2026-04-15 — Markdown planning docs live in BOTH project knowledge AND GitHub
`backlog.md`, `changelog.md`, `decisions.md` are committed to GitHub (rendered readability, version history, readable from any device) and also mirrored in Claude project knowledge (Claude sees them in every session without needing to be told where to find them). Accepting the sync friction in exchange for both benefits. The right long-term fix is the GitHub connector once it's available.

## 2026-04-14 — Firebase Realtime Database over Supabase
Both would work. Chose Firebase because real-time sync is the primary need (not relational queries), the Spark tier is generous enough for expected usage, the SDK loads as CDN scripts (fits the zero-build-tools GitHub Pages deployment), and the permission model is simpler for development. Data schemas follow spec §3.1.x; see `firebase-bridge.js` for the bridge layer that translates between Firebase's flat structure and the format `analyze()` expects.

## 2026-04-14 — Hash-based view routing instead of accounts
`#host`, `#play`, `#classic` hash routes determine which component renders. No auth, no account creation, no passwords. Players just enter a safari-themed join code (e.g., SHARK61) and their name. This matches the game's social-gathering mental model (playing with friends, not strangers) and removes the single largest onboarding friction point.

## 2026-04-14 — Classic pass-the-device mode preserved as fallback
Even after Firebase was wired in, the original single-device `App` component is kept reachable via `#classic`. Reasons: (1) zero-dependency fallback if Firebase fails to load, (2) serves groups where not everyone has a phone, (3) simpler mental model for first-time players. The multiplayer views live alongside, not on top of, the original App.

## 2026-04-14 — Host computes `analyze()`; players read results
Running `analyze()` on each player's phone would duplicate expensive computation and risk inconsistencies. Host calls `getSessionData()` → `transformForAnalyze()` → `analyze()` → `writeResults()`. All phones subscribe to `/results` and render the relevant slice. Single source of truth, one computation, consistent output across all devices.

## 2026-04-14 — Permissive Firebase rules during development
Rules are currently `{ ".read": true, ".write": true }` for `sessions` and `joinCodes`. More restrictive rules (auth-required writes, shape validation) caused the multiplayer flow to break during initial testing. Decision: ship with open rules for now, tighten before any public launch. Tracked in `backlog.md` under Phase 4.

## 2026-04-14 — External `solo-psychometric-engine.js`
Solo safari's v2 engine lives in a separate file rather than inlined in `index.html`. Keeps the HTML file scannable, allows the engine to be versioned independently, and mirrors the `firebase-bridge.js` pattern in the group safari. Loaded via `<script src="solo-psychometric-engine.js">` after the main inline script so it can overwrite `showDash()` with `showDash_v2()`.

## 2026-04-13 — Euclidean distance over threshold buckets for archetypes
Threshold-based archetype assignment produced undifferentiated profiles (everyone landed in the same 2–3 buckets). Euclidean distance to centroid in 6D personality space produces a blend percentage (e.g., 52% Vanguard, 28% Anchor) with effectively infinite resolution. Eliminates the "bucket problem" permanently. See `psychometric_engine_spec_v2.md` §3.3.2.

## 2026-04-13 — Piecewise linear models for stress-response curves
Simple linear regression of decision patterns against stress level misses the most diagnostic signal: the exact inflection point where a player's baseline strategy collapses. Piecewise (two-segment) regression with breakpoint detection captures "The Breaking Point" — the single most differentiating metric per player. See spec §3.3.4.

## 2026-04-13 — Multi-vector foundation tagging (`fw`) over single-axis
Single-axis tagging (`f: "Care"`) gave one data point per choice. Multi-vector (`fw: {Care: 0.85, Authority: 0.15}`) captures secondary resonances and roughly doubles psychometric resolution per interaction. Primary weight 0.70–1.00, optional secondary 0.10–0.40, no forced inflation where it doesn't exist.

## 2026-04-13 — Guaranteed stress gradient in scenario selection
Random selection within tier left too few data points per stress level for piecewise regression to converge. `selSess()` now returns exactly 2 WONDER + 3 TENSION + 2 FRACTURE + 1 ABYSS + 1 MIRROR in escalating order. The MIRROR scenario is excluded from curve fitting and used as a self-referential narrative coda.
