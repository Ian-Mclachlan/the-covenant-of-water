/* ═══════════════════════════════════════════════════════════════════════════
   SOLO SAFARI PSYCHOMETRIC ENGINE v2.0
   Aligned to psychometric_engine_spec_v2.md
   
   INTEGRATION: This module replaces the showDash() function in index.html.
   
   WHAT IT DOES:
   1. Euclidean distance archetype assignment (replaces threshold buckets)
   2. Stress-response curve with piecewise breakpoint detection
   3. Decision latency analysis (conviction physics)
   4. Instinct shadow scoring (avoidance patterns)
   5. Temporal drift arc (how strategy shifts across the game)
   6. Computed narrative trigger engine (data-driven Mirror output)
   7. Enhanced DBT integration
   
   DEPENDENCIES: Expects the existing G (game state), IN (instincts), 
   AV (avatars), BIOMES, DL, MC, dbtMap, FATE_NARRATIVES, and QB globals.
   
   MODIFICATIONS NEEDED IN EXISTING CODE:
   - Add G.pf.latency = [] to game state initialization
   - Add G.pf.instinctHistory = [] to track per-question instinct choices
   - Capture Date.now() at question render and at answer selection
   ═══════════════════════════════════════════════════════════════════════════ */

// ═══ TIER-TO-STRESS MAPPING ═══
// Maps Solo Safari tiers to the spec's stress scale
const TIER_STRESS = { A: 2.5, B: 5.5, C: 7.5, D: 9.5 };

// ═══ STRESS MULTIPLIERS (from spec 3.3.1) ═══
function stressMultiplier(stress) {
  if (stress <= 3) return 1.0;
  if (stress <= 6) return 1.15;
  if (stress <= 8) return 1.30;
  return 1.60;
}

// ═══ 1. ARCHETYPE CENTROIDS — 9 instincts in 6D space ═══
// Each centroid represents the ideal-type vector for that instinct
// Dimensions: [ag, af, st, th, mn, im] — normalized to 0-100 scale
const INSTINCT_CENTROIDS = {
  elephant: [30, 35, 85, 50, 40, 25],  // high structure
  lion:     [85, 20, 40, 55, 30, 65],  // high agency + image
  hippo:    [25, 80, 55, 30, 40, 15],  // high affiliation
  monkey:   [60, 55, 10, 20, 40, 60],  // low structure, high agency
  owl:      [20, 20, 75, 55, 65, 15],  // high structure + meaning
  meerkat:  [35, 50, 55, 85, 30, 20],  // high threat sensitivity
  bonobo:   [15, 85, 35, 30, 60, 15],  // high affiliation + meaning
  peacock:  [55, 30, 35, 20, 30, 90],  // high image
  songbird: [20, 55, 25, 30, 90, 25],  // high meaning
};

// ═══ 2. EUCLIDEAN DISTANCE ARCHETYPE ASSIGNMENT (spec 3.3.3) ═══
// Replaces threshold-bucket assignment with continuous distance metrics
function computeArchetypeProximities(playerDimensions) {
  // Normalize player dimensions to 0-100 scale
  const vals = Object.values(playerDimensions);
  const maxAbs = Math.max(...vals.map(Math.abs), 1);
  const normalized = {
    ag: ((playerDimensions.ag / maxAbs) * 50) + 50,
    af: ((playerDimensions.af / maxAbs) * 50) + 50,
    st: ((playerDimensions.st / maxAbs) * 50) + 50,
    th: ((playerDimensions.th / maxAbs) * 50) + 50,
    mn: ((playerDimensions.mn / maxAbs) * 50) + 50,
    im: ((playerDimensions.im / maxAbs) * 50) + 50,
  };
  
  const p = [normalized.ag, normalized.af, normalized.st, normalized.th, normalized.mn, normalized.im];
  const distances = {};
  
  for (const [name, centroid] of Object.entries(INSTINCT_CENTROIDS)) {
    distances[name] = Math.sqrt(
      centroid.reduce((sum, c, i) => sum + Math.pow(c - p[i], 2), 0)
    );
  }
  
  // Convert distances to proximity percentages (closer = higher %)
  const maxDist = Math.max(...Object.values(distances));
  const proximities = {};
  let total = 0;
  
  for (const [name, dist] of Object.entries(distances)) {
    proximities[name] = maxDist - dist;
    total += proximities[name];
  }
  
  for (const name of Object.keys(proximities)) {
    proximities[name] = total > 0 ? Math.round((proximities[name] / total) * 100) : 0;
  }
  
  return proximities;
}

// Get sorted archetypes by proximity (highest first)
function getSortedArchetypes(proximities) {
  return Object.entries(proximities)
    .sort((a, b) => b[1] - a[1])
    .map(([id, pct]) => ({ id, pct, ...IN.find(i => i.id === id) }));
}


// ═══ 3. INSTINCT SHADOW SCORING (adapted from spec 3.3.2) ═══
// Tracks which instincts the player consistently avoids
function computeInstinctShadow(instinctHistory) {
  // instinctHistory = [{chosen: 'lion', available: ['lion','hippo','owl','monkey'], tier: 'B'}, ...]
  // For tier B/C/D questions where player chose an instinct
  
  const available_count = {};
  const chosen_count = {};
  
  for (const round of instinctHistory) {
    if (!round || !round.available) continue;
    for (const inst of round.available) {
      available_count[inst] = (available_count[inst] || 0) + 1;
    }
    if (round.chosen) {
      chosen_count[round.chosen] = (chosen_count[round.chosen] || 0) + 1;
    }
  }
  
  // Shadow score = how often available but NOT chosen
  const shadowScores = {};
  for (const [inst, avail] of Object.entries(available_count)) {
    const chosen = chosen_count[inst] || 0;
    shadowScores[inst] = avail > 0 ? (avail - chosen) / avail : 0;
  }
  
  return shadowScores;
}

// Find the deepest shadow (highest rejection rate)
function getDeepestShadow(shadowScores) {
  let maxShadow = null;
  let maxScore = 0;
  
  for (const [inst, score] of Object.entries(shadowScores)) {
    if (score > maxScore) {
      maxScore = score;
      maxShadow = inst;
    }
  }
  
  return maxShadow && maxScore > 0.6 
    ? { instinct: maxShadow, score: maxScore, instData: IN.find(i => i.id === maxShadow) }
    : null;
}


// ═══ 4. DECISION LATENCY ANALYSIS (spec 3.3.4) ═══
function computeLatencyProfile(latencyData) {
  // latencyData = [{tier: 'A', latency_ms: 3200, timer_remaining_pct: 73.3}, ...]
  
  if (!latencyData || latencyData.length < 3) {
    return { ratio: 1.0, type: 'Steady Hand', baselineAvg: 0, crisisAvg: 0 };
  }
  
  const baseline = latencyData.filter(d => d.tier === 'A' || d.tier === 'B');
  const crisis = latencyData.filter(d => d.tier === 'C' || d.tier === 'D');
  
  const baselineAvg = baseline.length > 0 
    ? baseline.reduce((s, d) => s + d.latency_ms, 0) / baseline.length 
    : 5000;
  const crisisAvg = crisis.length > 0 
    ? crisis.reduce((s, d) => s + d.latency_ms, 0) / crisis.length 
    : 5000;
  
  const ratio = baselineAvg > 0 ? crisisAvg / baselineAvg : 1.0;
  
  let type;
  if (ratio > 1.3) type = 'The Deliberator';
  else if (ratio < 0.8) type = 'The Snap Reactor';
  else type = 'The Steady Hand';
  
  return { ratio, type, baselineAvg, crisisAvg };
}


// ═══ 5. STRESS-RESPONSE CURVE & BREAKING POINT (spec 3.3.7) ═══
// Adapted for solo play: uses instinct consistency across tiers
// "Drift" in solo = strategy shift (different instinct category under stress)
function computeStressResponse(instinctHistory) {
  if (!instinctHistory || instinctHistory.length < 4) {
    return { breakpoint: null, baselineSlope: 0, crisisSlope: 0, detected: false };
  }
  
  // Map each choice to a "stability score" — did the player stick to their
  // dominant instinct type, or shift to something new?
  const dominant = getDominantInstinctId(instinctHistory);
  
  // Create stress-ordered data: 0 = stayed with dominant pattern, 1 = shifted
  const stressData = instinctHistory
    .filter(r => r && r.chosen)
    .map(r => ({
      stress: TIER_STRESS[r.tier] || 5,
      shifted: r.chosen !== dominant ? 1 : 0
    }))
    .sort((a, b) => a.stress - b.stress);
  
  if (stressData.length < 4) {
    return { breakpoint: null, baselineSlope: 0, crisisSlope: 0, detected: false };
  }
  
  return findBreakpoint(
    stressData.map(d => d.stress),
    stressData.map(d => d.shifted)
  );
}

function getDominantInstinctId(instinctHistory) {
  const counts = {};
  for (const r of instinctHistory) {
    if (r && r.chosen) {
      counts[r.chosen] = (counts[r.chosen] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'elephant';
}

// Piecewise linear breakpoint detection (spec 3.3.7)
function findBreakpoint(stressLevels, shiftValues) {
  let bestBP = 5, bestError = Infinity;
  
  for (let bp = 3; bp <= 8; bp++) {
    const low = [], high = [];
    stressLevels.forEach((s, i) => {
      if (s <= bp) low.push({ s, d: shiftValues[i] });
      else high.push({ s, d: shiftValues[i] });
    });
    
    if (low.length < 2 || high.length < 2) continue;
    
    const errLow = segmentError(low);
    const errHigh = segmentError(high);
    
    if (errLow + errHigh < bestError) {
      bestError = errLow + errHigh;
      bestBP = bp;
    }
  }
  
  const bSlope = slopeOf(stressLevels, shiftValues, s => s <= bestBP);
  const cSlope = slopeOf(stressLevels, shiftValues, s => s > bestBP);
  
  // Only report a breakpoint if the crisis slope is meaningfully steeper
  const detected = cSlope > bSlope + 0.15;
  
  return {
    breakpoint: detected ? bestBP : null,
    baselineSlope: bSlope,
    crisisSlope: cSlope,
    detected
  };
}

function segmentError(points) {
  if (points.length < 2) return 0;
  const mean = points.reduce((s, p) => s + p.d, 0) / points.length;
  return points.reduce((s, p) => s + Math.pow(p.d - mean, 2), 0);
}

function slopeOf(stressLevels, values, filter) {
  const indices = stressLevels.map((s, i) => filter(s) ? i : -1).filter(i => i >= 0);
  if (indices.length < 2) return 0;
  const xs = indices.map(i => stressLevels[i]);
  const ys = indices.map(i => values[i]);
  const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  return den > 0 ? num / den : 0;
}


// ═══ 6. DRIFT ARC / TEMPORAL TRAJECTORY (spec 3.3.6) ═══
// In solo mode: tracks whether the player's instinct consistency
// erodes, strengthens, or holds steady across the game
function computeDriftArc(instinctHistory) {
  if (!instinctHistory || instinctHistory.length < 4) {
    return { slope: 0, type: 'Steady State' };
  }
  
  const dominant = getDominantInstinctId(instinctHistory);
  
  // Create boolean array: 1 = shifted from dominant, 0 = stayed with dominant
  const driftBooleans = instinctHistory
    .filter(r => r && r.chosen)
    .map(r => r.chosen !== dominant ? 1 : 0);
  
  const slope = driftSlope(driftBooleans);
  
  let type;
  if (slope > 0.08) type = 'The Eroded Anchor';
  else if (slope < -0.08) type = 'The Late Bloomer';
  else type = 'Steady State';
  
  return { slope, type };
}

function driftSlope(driftBooleans) {
  const n = driftBooleans.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = driftBooleans.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (driftBooleans[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den > 0 ? num / den : 0;
}


// ═══ 7. COMPUTED NARRATIVE TRIGGER ENGINE (spec 3.5) ═══
// Each trigger fires based on computed data intersections
const SOLO_NARRATIVE_TRIGGERS = [
  // === IDENTITY ALIGNMENT ===
  {
    id: "ST-001",
    check: (d) => d.avatarMatch === true,
    narrative: (d) => `Your chosen identity as ${d.avatarName} aligned with your most-used instinct — a rare coherence between self-concept and enacted behavior. When the pressure mounted, you did exactly what you said you would. That integrity is rarer than you might think.`
  },
  
  // === IDENTITY DIVERGENCE ===
  {
    id: "ST-002",
    check: (d) => d.avatarMatch === false,
    narrative: (d) => `You entered the Serengeti as ${d.avatarName} — ${d.avatarDesc}. But under pressure, your dominant instinct was ${d.dominantName} (${d.dominantDesc}). This gap between who you think you are and who you become when the stakes are real is not a flaw — it is the most honest data point in this game.`
  },
  
  // === THE DELIBERATOR ===
  {
    id: "ST-003",
    check: (d) => d.latencyType === 'The Deliberator',
    narrative: (d) => `When the stakes rose, you slowed down — your decision latency increased by ${Math.round((d.latencyRatio - 1) * 100)}% in crisis rounds. Linehan would call this 'wise mind' — the place where emotion and reason hold each other in balance. You refused to let urgency override judgment.`
  },
  
  // === THE SNAP REACTOR ===
  {
    id: "ST-004",
    check: (d) => d.latencyType === 'The Snap Reactor',
    narrative: (d) => `Under pressure, your decisions got faster — a ${Math.round((1 - d.latencyRatio) * 100)}% drop in deliberation time from baseline to crisis. Linehan would call this 'emotion mind' overriding 'wise mind.' The amygdala seized the wheel. Knowing this is the first step toward changing it.`
  },
  
  // === THE BREAKING POINT REVELATION ===
  {
    id: "ST-005",
    check: (d) => d.breakpointDetected === true,
    narrative: (d) => {
      const tierName = d.breakpoint <= 3 ? 'the Plains' : d.breakpoint <= 6 ? 'the Savanna' : d.breakpoint <= 8 ? 'the Highlands' : 'the River';
      return `Your breaking point arrived at stress level ${d.breakpoint} — somewhere in ${tierName}. Below that threshold, your instinct strategy held steady. Above it, you shifted. That inflection — the exact moment your baseline self gave way to your crisis self — is the most differentiating data point in the entire game.`;
    }
  },
  
  // === THE UNBREAKABLE ===
  {
    id: "ST-006",
    check: (d) => d.breakpointDetected === false && d.overallShiftPct < 25,
    narrative: (d) => `The engine could not find your breaking point — because you didn't break. Across the full stress gradient, from the Plains to the River, your instinct strategy held. Whether this reflects deep principle or practiced detachment, the data cannot say. Only you know which it is.`
  },
  
  // === THE ERODING ANCHOR ===
  {
    id: "ST-007",
    check: (d) => d.driftType === 'The Eroded Anchor',
    narrative: (d) => `You started this safari with consistent instincts — but as the terrain grew hostile, your strategy shifted. By the Highlands and River, you had abandoned your baseline approach. The question is whether the environment demanded adaptation, or whether fatigue simply wore you down.`
  },
  
  // === THE LATE BLOOMER ===
  {
    id: "ST-008",
    check: (d) => d.driftType === 'The Late Bloomer',
    narrative: (d) => `You began this game searching — shifting between instincts in the early rounds. But as the stakes rose, you found your center. By the crisis rounds, your choices were focused and deliberate. That trajectory — from exploration to conviction — is the rarest arc in the data.`
  },
  
  // === THE INSTINCT SHADOW ===
  {
    id: "ST-009",
    check: (d) => d.shadow !== null,
    narrative: (d) => `Across the game, when ${d.shadow.instData.nm} (${d.shadow.instData.ds}) was available to you, you walked past it ${Math.round(d.shadow.score * 100)}% of the time. This consistent avoidance is your instinct shadow — the response mode you cannot or will not reach for. Not wrong. But invisible to you. And what we cannot see in ourselves, we often cannot tolerate in others.`
  },
  
  // === STRESS SHIFT PATTERN ===
  {
    id: "ST-010",
    check: (d) => d.stressShift === true,
    narrative: (d) => `Under low stress, you gravitated toward ${d.lowStressInstinct} — but when pressure mounted, you shifted toward ${d.highStressInstinct}. This stress shift is your most honest portrait: the difference between who you are when things are calm and who you become when they aren't.`
  },
  
  // === DIMENSIONAL DOMINANCE ===
  {
    id: "ST-011",
    check: (d) => d.topDimPct > 35,
    narrative: (d) => {
      const dimNarr = {
        ag: "Your decisions were dominated by Agency — the drive to act, assert, and control outcomes. You reached for the lever before asking whether it was the right one to pull.",
        af: "Your decisions were dominated by Affiliation — the pull toward connection, harmony, and belonging. You prioritized the relationship over the result, again and again.",
        st: "Your decisions were dominated by Structure — the need for order, protocol, and predictability. When chaos arrived, you built a framework before you took a step.",
        th: "Your decisions were dominated by Threat Sensitivity — the vigilance that scans every horizon for danger. You saw the risk others missed, but the cost of constant watchfulness is exhaustion.",
        mn: "Your decisions were dominated by Meaning-Making — the search for purpose, identity, and moral coherence. You asked 'why' before you asked 'how,' even when the house was on fire.",
        im: "Your decisions were dominated by Image Management — the strategic awareness of how actions are perceived. You read the room before you entered it."
      };
      return dimNarr[d.topDim] || '';
    }
  },
  
  // === THE SPECIALIST vs GENERALIST ===
  {
    id: "ST-012",
    check: (d) => d.instinctDiversity !== null,
    narrative: (d) => {
      if (d.instinctDiversity <= 3) {
        return `You drew from only ${d.instinctDiversity} of 9 instinct modes across the entire game. Your response palette is narrow but deep — a specialist's approach. The risk: scenarios that demand a language you don't speak.`;
      } else if (d.instinctDiversity >= 6) {
        return `You drew from ${d.instinctDiversity} of 9 instinct modes — a remarkably broad palette. You shifted strategies as the terrain demanded. The risk: breadth without depth, adapting to everything but mastering nothing.`;
      }
      return null; // Don't fire for moderate diversity
    }
  },
  
  // === CYNEFIN MISMATCH ===
  {
    id: "ST-013",
    check: (d) => d.cynefinMismatch === true,
    narrative: (d) => `Your avatar (${d.avatarName}) thrives in ${d.avatarCynefin} environments — but the Safari pushed you through all four Cynefin domains. In the ${d.weakestDomain} domain, your instinct pattern shifted most dramatically, suggesting this is where your adaptive strategy is most vulnerable.`
  },

  // === ECOSYSTEM IMPACT ===
  {
    id: "ST-014",
    check: (d) => d.ecosystemCritical !== null,
    narrative: (d) => {
      const meter = d.ecosystemCritical;
      if (meter.value <= 1) {
        return `Your choices drove ${meter.name} to critical levels (${meter.value}/6). This isn't just a number — it reflects the cumulative cost of your instinct strategy on the group's capacity for ${meter.name.toLowerCase()}.`;
      } else if (meter.value >= 5) {
        return `Your instinct pattern built exceptional ${meter.name.toLowerCase()} (${meter.value}/6) — but notice what it cost. The meters you strengthened came at the expense of others. Every strategy has a shadow.`;
      }
      return null;
    }
  }
];

// Fire all matching narrative triggers and return an array of paragraphs
function generateNarratives(data) {
  const narratives = [];
  
  for (const trigger of SOLO_NARRATIVE_TRIGGERS) {
    if (trigger.check(data)) {
      const text = trigger.narrative(data);
      if (text) narratives.push({ id: trigger.id, text });
    }
  }
  
  return narratives;
}


// ═══ 8. ENHANCED DBT MAP ═══
const ENHANCED_DBT = {
  ag: {
    skill: 'Mindfulness',
    insight: "When stressed, you moved toward action and force — Agency as armor. Your strongest skill is decisive engagement, but over-reliance on action crowds out reflection. Growth edge: practice mindfulness. Not every situation requires a response. Sometimes the most powerful act is to pause.",
    exercise: "Try the 'STOP' skill: Stop what you're doing, Take a breath, Observe your internal experience, Proceed mindfully."
  },
  af: {
    skill: 'Interpersonal Effectiveness',
    insight: "When stressed, you moved toward connection and care — Affiliation as anchor. Your strongest skill is interpersonal effectiveness, but over-reliance on others' approval erodes self-validation. Growth edge: practice self-validation. Your worth does not depend on being needed.",
    exercise: "Practice 'FAST' for self-respect: be Fair, no Apologies (unnecessary), Stick to values, be Truthful."
  },
  st: {
    skill: 'Emotion Regulation',
    insight: "When stressed, you sought order and protocol — Structure as sanctuary. Your cognitive clarity is a genuine strength, but rigidity under pressure prevents the flexibility that complex situations demand. Growth edge: practice emotion regulation — allow feelings to exist without organizing them into frameworks.",
    exercise: "Try 'Check the Facts': Is the emotion fitting the actual situation, or the one your structure-seeking mind constructed?"
  },
  th: {
    skill: 'Distress Tolerance',
    insight: "When stressed, you moved toward vigilance — Threat Sensitivity on high alert. Your ability to detect danger protects the group, but hypervigilance exhausts emotional resources and finds threats that aren't there. Growth edge: practice radical acceptance. Not every uncertainty is a threat.",
    exercise: "Try 'TIPP' when overwhelmed: Temperature change, Intense exercise, Paced breathing, Progressive muscle relaxation."
  },
  mn: {
    skill: 'Meaning-Making',
    insight: "When stressed, you sought purpose and narrative — Meaning as medicine. Your capacity to find the 'why' sustains others through chaos, but narrating suffering is not the same as ending it. Growth edge: practice distress tolerance — sit with discomfort rather than translate it into a story.",
    exercise: "Practice 'Wise Mind': Sit quietly and notice where emotion mind and reason mind overlap. That intersection is where growth lives."
  },
  im: {
    skill: 'Interpersonal Authenticity',
    insight: "When stressed, you managed presentation and influence — Image as instrument. Your strategic awareness of how actions land is genuinely valuable, but the performance costs energy that could fuel authentic connection. Growth edge: practice interpersonal authenticity. True influence requires vulnerability.",
    exercise: "Try 'GIVE': be Gentle, act Interested, Validate the other person, use an Easy manner — without calculating the impression it makes."
  }
};


// ═══ MAIN ENGINE: COMPUTE SOLO PROFILE ═══
// Call this from showDash() — it takes the existing G state and produces
// all the computed metrics needed for the Mirror output
function computeSoloProfile(G, AV, IN) {
  const av = AV[G.av];
  const p = G.pf;
  
  // --- Instinct tallies (existing) ---
  const instinctEntries = Object.entries(p.it).sort((a, b) => b[1] - a[1]);
  const domId = instinctEntries[0][0];
  const domCount = instinctEntries[0][1];
  const secId = instinctEntries.length > 1 && instinctEntries[1][1] > 0 ? instinctEntries[1][0] : null;
  const dom = IN.find(i => i.id === domId);
  const sec = secId ? IN.find(i => i.id === secId) : null;
  
  // Total instinct choices for diversity calculation
  const totalChoices = instinctEntries.reduce((s, [_, v]) => s + v, 0);
  const instinctDiversity = instinctEntries.filter(([_, v]) => v > 0).length;
  
  // --- 1. Euclidean distance archetype proximities ---
  const proximities = computeArchetypeProximities(p.dm);
  const sortedArchetypes = getSortedArchetypes(proximities);
  
  // --- 2. Stress shift analysis (using existing ls/hs data) ---
  const lsEntries = Object.entries(p.ls).sort((a, b) => b[1] - a[1]);
  const hsEntries = Object.entries(p.hs).sort((a, b) => b[1] - a[1]);
  const lowStressId = lsEntries[0]?.[1] > 0 ? lsEntries[0][0] : domId;
  const highStressId = hsEntries[0]?.[1] > 0 ? hsEntries[0][0] : domId;
  const stressShift = lowStressId !== highStressId;
  const lowStressInst = IN.find(i => i.id === lowStressId);
  const highStressInst = IN.find(i => i.id === highStressId);
  
  // --- 3. Decision latency (if captured) ---
  const latencyProfile = computeLatencyProfile(p.latency || []);
  
  // --- 4. Instinct shadow ---
  const shadowScores = computeInstinctShadow(p.instinctHistory || []);
  const shadow = getDeepestShadow(shadowScores);
  
  // --- 5. Stress-response curve / breaking point ---
  const stressResponse = computeStressResponse(p.instinctHistory || []);
  
  // --- 6. Drift arc ---
  const driftArc = computeDriftArc(p.instinctHistory || []);
  
  // --- 7. Dimensional analysis ---
  const ds = Object.entries(p.dm).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const topDim = ds[0][0];
  const topDimVal = ds[0][1];
  const dimTotal = ds.reduce((s, [_, v]) => s + Math.abs(v), 0);
  const topDimPct = dimTotal > 0 ? Math.round((Math.abs(topDimVal) / dimTotal) * 100) : 0;
  
  // --- 8. Avatar alignment ---
  const avInst = IN.find(i => i.id === av.id);
  const avatarMatch = avInst && avInst.id === domId;
  
  // --- 9. Ecosystem critical meters ---
  const meterEntries = Object.entries(G.mt);
  const lowestMeter = meterEntries.sort((a, b) => a[1] - b[1])[0];
  const highestMeter = meterEntries.sort((a, b) => b[1] - a[1])[0];
  let ecosystemCritical = null;
  if (lowestMeter[1] <= 1) ecosystemCritical = { name: lowestMeter[0], value: lowestMeter[1] };
  else if (highestMeter[1] >= 5) ecosystemCritical = { name: highestMeter[0], value: highestMeter[1] };
  
  // --- 10. Cynefin mismatch ---
  const tierChoices = { A: [], B: [], C: [], D: [] };
  (p.instinctHistory || []).forEach(r => {
    if (r && r.tier && r.chosen) tierChoices[r.tier]?.push(r.chosen);
  });
  // Find tier with most instinct diversity (most shifting = weakest domain)
  let weakestDomain = 'Complex';
  let maxDiversity = 0;
  for (const [tier, choices] of Object.entries(tierChoices)) {
    const unique = new Set(choices).size;
    if (unique > maxDiversity && choices.length > 0) {
      maxDiversity = unique;
      weakestDomain = BIOMES?.[tier]?.tier || tier;
    }
  }
  const cynefinMismatch = av.cy && av.cy !== weakestDomain;
  
  // --- 11. Instinct shift percentage (overall) ---
  const overallShiftPct = totalChoices > 0 
    ? Math.round(((totalChoices - domCount) / totalChoices) * 100) 
    : 0;
  
  // --- Compile data for narrative triggers ---
  const triggerData = {
    avatarMatch,
    avatarName: `${av.ic} ${av.nm}`,
    avatarDesc: av.ds,
    avatarCynefin: av.cy,
    dominantName: dom.nm,
    dominantDesc: dom.ds,
    latencyType: latencyProfile.type,
    latencyRatio: latencyProfile.ratio,
    breakpointDetected: stressResponse.detected,
    breakpoint: stressResponse.breakpoint,
    driftType: driftArc.type,
    shadow,
    stressShift,
    lowStressInstinct: lowStressInst?.nm || 'unknown',
    highStressInstinct: highStressInst?.nm || 'unknown',
    topDim,
    topDimPct,
    instinctDiversity,
    cynefinMismatch,
    weakestDomain,
    ecosystemCritical,
    overallShiftPct,
  };
  
  // --- Generate computed narratives ---
  const narratives = generateNarratives(triggerData);
  
  // --- DBT insight ---
  const dbtData = ENHANCED_DBT[topDim] || ENHANCED_DBT.ag;
  
  return {
    // Existing data (for backward compat)
    dom, sec, domId, secId, instinctEntries,
    ds, // dimensional scores sorted
    
    // New computed metrics
    proximities,
    sortedArchetypes,
    stressShift,
    lowStressInst,
    highStressInst,
    latencyProfile,
    shadowScores,
    shadow,
    stressResponse,
    driftArc,
    avatarMatch,
    instinctDiversity,
    topDim,
    topDimPct,
    narratives,
    dbtData,
    overallShiftPct,
    
    // Formatting helpers
    dimLine: ds.slice(0, 4).map(([k, v]) => `${DL[k]} ${v > 0 ? '+' : ''}${v.toFixed(1)}`).join(' · '),
  };
}


// ═══ MIRROR RENDERING ═══
// Generates the complete HTML for the Mirror portrait
// Drop-in replacement for the innerHTML assignment in showDash()
function renderMirror(G, profile) {
  const av = AV[G.av];
  const { dom, sec, proximities, sortedArchetypes, ds, narratives, 
          dbtData, shadow, stressResponse, driftArc, latencyProfile,
          stressShift, lowStressInst, highStressInst, dimLine } = profile;
  
  // --- Archetype proximity bars ---
  const archBars = sortedArchetypes.slice(0, 5).map(a => {
    const inst = IN.find(i => i.id === a.id);
    return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
      <span style="font-size:1.1rem">${inst?.lb || ''}</span>
      <span style="font-size:.7rem;color:var(--sand);width:60px">${inst?.nm || a.id}</span>
      <div style="flex:1;height:8px;background:rgba(255,255,255,.05);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${a.pct}%;background:var(--gold);border-radius:4px;transition:width .8s"></div>
      </div>
      <span style="font-size:.65rem;color:var(--gold);width:32px;text-align:right">${a.pct}%</span>
    </div>`;
  }).join('');
  
  // --- Hidden dimensions bars ---
  const dimBars = ds.map(([k, v]) => {
    const pct = Math.min(Math.abs(v) * 10, 100);
    const color = v > 0 ? 'var(--water)' : 'var(--red)';
    return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
      <span style="font-size:.65rem;color:var(--sand);width:80px">${DL[k]}</span>
      <div style="flex:1;height:6px;background:rgba(255,255,255,.05);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div>
      </div>
      <span style="font-size:.6rem;color:${color};width:36px;text-align:right">${v > 0 ? '+' : ''}${v.toFixed(1)}</span>
    </div>`;
  }).join('');
  
  // --- Shadow display ---
  let shadowHTML = '';
  if (shadow) {
    shadowHTML = `
    <div class="dx" style="animation-delay:2.1s">
      <h3>🌑 The Instinct Shadow</h3>
      <p class="ip">Your deepest shadow: <strong>${shadow.instData.lb} ${shadow.instData.nm}</strong> — avoided ${Math.round(shadow.score * 100)}% of the time when available.</p>
      <p class="ip" style="font-style:italic;color:var(--gold)">${shadow.instData.ds} — the response mode you cannot or will not reach for.</p>
    </div>`;
  }
  
  // --- Breaking point display ---
  let breakpointHTML = '';
  if (stressResponse.detected) {
    const tierName = stressResponse.breakpoint <= 3 ? 'Plains (Simple)' 
      : stressResponse.breakpoint <= 6 ? 'Savanna (Complicated)' 
      : stressResponse.breakpoint <= 8 ? 'Highlands (Complex)' 
      : 'River (Chaotic)';
    breakpointHTML = `
    <div class="dx" style="animation-delay:2.3s">
      <h3>⚡ The Breaking Point</h3>
      <p class="ip">Your strategy held through stress level ${stressResponse.breakpoint} — the ${tierName}. Beyond that threshold, your instinct pattern shifted. Baseline slope: ${(stressResponse.baselineSlope * 100).toFixed(0)}%. Crisis slope: ${(stressResponse.crisisSlope * 100).toFixed(0)}%.</p>
    </div>`;
  }
  
  // --- Drift arc display ---
  let driftHTML = '';
  if (driftArc.type !== 'Steady State') {
    const driftIcon = driftArc.type === 'The Eroded Anchor' ? '⚓' : '🌱';
    driftHTML = `
    <div class="dx" style="animation-delay:2.5s">
      <h3>${driftIcon} ${driftArc.type}</h3>
      <p class="ip">Drift slope: ${(driftArc.slope * 100).toFixed(1)}%. ${
        driftArc.type === 'The Eroded Anchor' 
          ? 'Your instinct consistency eroded as the game progressed — the terrain wore you down.' 
          : 'You found your center as the game progressed — starting scattered, ending focused.'
      }</p>
    </div>`;
  }
  
  // --- Latency display ---
  let latencyHTML = '';
  if (latencyProfile.type !== 'The Steady Hand' && latencyProfile.baselineAvg > 0) {
    latencyHTML = `
    <div class="dx" style="animation-delay:2.7s">
      <h3>⏱ Decision Physics: ${latencyProfile.type}</h3>
      <p class="ip">Baseline latency: ${(latencyProfile.baselineAvg / 1000).toFixed(1)}s. Crisis latency: ${(latencyProfile.crisisAvg / 1000).toFixed(1)}s. Ratio: ${latencyProfile.ratio.toFixed(2)}×.</p>
    </div>`;
  }
  
  // --- Computed narratives (the spec's crown jewel) ---
  const narrativeHTML = narratives.map((n, i) => 
    `<p class="ip" style="margin-bottom:.6rem;animation-delay:${3 + i * 0.2}s">${n.text}</p>`
  ).join('');
  
  // --- Stress shift display ---
  let shiftHTML = '';
  if (stressShift) {
    shiftHTML = `<p class="ip" style="color:var(--gold);font-style:italic">Stress Shift: ${lowStressInst?.lb} ${lowStressInst?.nm} → ${highStressInst?.lb} ${highStressInst?.nm}</p>`;
  }

  // === ASSEMBLE THE MIRROR ===
  return `<div class="dc" id="portraitContainer">
    <div class="de">Your Safari is Complete</div>
    <h2 class="dt">The Mirror</h2>
    <p class="dd">Not your permanent essence — but who you become when the stakes are real</p>
    <div class="ds-stats">
      <div><div class="sn">${G.sc}</div><div class="sl">Points</div></div>
      <div><div class="sn">${G.cc}/${G.tot}</div><div class="sl">Correct</div></div>
      <div><div class="sn">${G.bk}</div><div class="sl">Best Streak</div></div>
    </div>

    <!-- Section 1: Chosen Identity -->
    <div class="dx" style="animation-delay:.9s">
      <h3>${av.ic} Chosen Identity: ${G.name} the ${av.nm}</h3>
      <p class="ip">${av.ds}. Enneagram resonance: Type ${av.en}. Core fear: ${av.fr}. Cynefin home: ${av.cy} domain.</p>
    </div>

    <!-- Section 2: Archetype Proximities (Euclidean Distance) -->
    <div class="dx" style="animation-delay:1.1s">
      <h3>${dom.lb} Instinct Profile — Continuous Distance</h3>
      <p style="font-size:.65rem;color:var(--sand);margin-bottom:.6rem;font-style:italic">
        Not a label — a coordinate in multidimensional space
      </p>
      ${archBars}
      ${shiftHTML}
    </div>

    <!-- Section 3: Hidden Dimensions -->
    <div class="dx" style="animation-delay:1.3s">
      <h3>Hidden Dimensions</h3>
      <p style="font-size:.65rem;color:var(--sand);margin-bottom:.6rem;font-style:italic">Six psychological axes tracked silently across every decision</p>
      ${dimBars}
    </div>

    <!-- Section 4: The Instinct Shadow -->
    ${shadowHTML}

    <!-- Section 5: The Breaking Point -->
    ${breakpointHTML}

    <!-- Section 6: The Drift Arc -->
    ${driftHTML}

    <!-- Section 7: Decision Physics -->
    ${latencyHTML}

    <!-- Section 8: Computed Narrative — The Interpretation -->
    <div class="dx" style="animation-delay:2.9s">
      <h3>🔮 Psychological Interpretation</h3>
      <p style="font-size:.65rem;color:var(--sand);margin-bottom:.6rem;font-style:italic">
        Each sentence below is triggered by a specific data intersection — a combination of metrics that produces a statement unique to your session
      </p>
      ${narrativeHTML}
    </div>

    <!-- Section 9: DBT-Informed Insight -->
    <div class="dx" style="animation-delay:3.5s">
      <h3>DBT-Informed Insight: ${dbtData.skill}</h3>
      <p class="ip">${dbtData.insight}</p>
      <p class="ip" style="background:rgba(200,164,90,.08);padding:.6rem;border-radius:8px;border-left:3px solid var(--gold);margin-top:.5rem"><strong>Practice:</strong> ${dbtData.exercise}</p>
    </div>

    <!-- Section 10: Ecosystem Final State -->
    <div class="dx" style="animation-delay:3.7s">
      <h3>Ecosystem Final State</h3>
      <div style="display:flex;gap:.8rem;flex-wrap:wrap;justify-content:center;margin-top:.5rem">
        ${Object.entries(G.mt).map(([k, v]) => `<div style="text-align:center"><div style="font-size:.5rem;letter-spacing:.08em;text-transform:uppercase;color:rgba(200,164,90,.5)">${k}</div><div style="font-family:var(--serif);font-size:1rem;font-weight:700;color:${MC[k]}">${v}/6</div></div>`).join('')}
      </div>
    </div>

    <!-- Section 11: Final Identity Card -->
    <div class="dx" style="animation-delay:3.9s;text-align:center;background:rgba(200,164,90,.08);border-color:rgba(200,164,90,.2)">
      <div style="font-size:2.5rem;margin-bottom:.3rem">${av.ic}</div>
      <div style="font-family:var(--serif);font-size:1.3rem;font-weight:900;color:var(--gold)">${G.name} the ${av.nm}</div>
      <div style="font-size:.7rem;color:var(--sand);margin:.3rem 0">
        Dominant: ${dom.lb} ${dom.nm}${stressShift ? ` → ${highStressInst?.lb} ${highStressInst?.nm} under stress` : ''}
      </div>
      <div style="font-size:.6rem;color:var(--sand);opacity:.6;margin-top:.2rem">${dimLine}</div>
    </div>

    <!-- Replay -->
    <div style="text-align:center;margin-top:1.5rem">
      <button class="btn" onclick="location.reload()" style="margin-right:.5rem">Play Again</button>
      <button class="btn-back" onclick="go('S0')">Home</button>
    </div>
  </div>`;
}


// ═══ DROP-IN REPLACEMENT FOR showDash() ═══
// Replace the existing showDash() function with this one
function showDash_v2() {
  go('S3');
  const profile = computeSoloProfile(G, AV, IN);
  const el = document.getElementById('S3');
  el.innerHTML = renderMirror(G, profile);
}
