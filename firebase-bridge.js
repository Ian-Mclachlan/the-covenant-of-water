/**
 * firebase-bridge.js
 * ──────────────────────────────────────────────────────────
 * The Covenant of Water — Firebase Realtime Database Bridge
 * Phase 2 Multiplayer Scaffold
 *
 * This module wraps all Firebase operations for the multiplayer
 * Group Safari. It is loaded as a global (window.CovenantFirebase)
 * and consumed by the React app in group.html.
 *
 * Data schemas follow psychometric_engine_spec_v2.md Section 3.1.
 * ──────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // CONFIGURATION — Replace with your Firebase project values
  // ═══════════════════════════════════════════════════════════

  const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC86dz-s_SD2I4MZaPnVwI-txRN9qLZxiI",
  authDomain: "covenant-of-water.firebaseapp.com",
  databaseURL: "https://covenant-of-water-default-rtdb.firebaseio.com",
  projectId: "covenant-of-water",
  storageBucket: "covenant-of-water.firebasestorage.app",
  messagingSenderId: "859710388639",
  appId: "1:859710388639:web:0a995bdf4ffca80863e5aa"
  };

  // ═══════════════════════════════════════════════════════════
  // JOIN CODE DICTIONARY — Safari-themed for brand coherence
  // ═══════════════════════════════════════════════════════════

  const ANIMALS = [
    'RHINO', 'COBRA', 'EAGLE', 'HYENA', 'CRANE', 'VIPER',
    'SHARK', 'BISON', 'RAVEN', 'OTTER', 'GECKO', 'PANDA',
    'SWIFT', 'DINGO', 'KOALA', 'LEMUR', 'HERON', 'TAPIR',
    'MYNAH', 'ORIBI', 'CIVET', 'GENET', 'KUDUS', 'NYALA',
    'ZEBRA', 'EGRET', 'IBIS', 'HARPY', 'KRAIT', 'MAMBA'
  ];

  function generateJoinCode() {
    const word = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const num = Math.floor(Math.random() * 90) + 10;
    return word + num;
  }

  function generateDeviceId() {
    let id = localStorage.getItem('cov_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now();
      localStorage.setItem('cov_device_id', id);
    }
    return id;
  }

  // ═══════════════════════════════════════════════════════════
  // FIREBASE INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  let db = null;
  let initialized = false;

  function initFirebase() {
    if (initialized) return;
    if (typeof firebase === 'undefined') {
      console.error('[CovenantFirebase] Firebase SDK not loaded. Add the script tags.');
      return;
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.database();
    initialized = true;
    console.log('[CovenantFirebase] Initialized');
  }

  function ensureInit() {
    if (!initialized) initFirebase();
    if (!db) throw new Error('Firebase not initialized. Check config and SDK script tags.');
  }

  // ═══════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  /**
   * HOST: Create a new game session.
   * Generates a join code, writes session config to Firebase,
   * and returns the session ID + join code.
   *
   * @returns {Promise<{sessionId: string, joinCode: string}>}
   */
  async function createSession() {
    ensureInit();
    const joinCode = generateJoinCode();
    const deviceId = generateDeviceId();

    const sessionRef = db.ref('sessions').push();
    const sessionId = sessionRef.key;

    await sessionRef.set({
      config: {
        hostId: deviceId,
        joinCode: joinCode,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        status: 'lobby',
        playerCount: 0,
        mode: 'multiplayer'
      },
      currentRound: {
        roundIndex: -1,
        phase: 'lobby',
        pulsesSubmitted: 0,
        predictionsSubmitted: 0
      }
    });

    // Write the join code index for fast lookup
    await db.ref('joinCodes/' + joinCode).set(sessionId);

    console.log('[CovenantFirebase] Session created:', sessionId, 'Code:', joinCode);
    return { sessionId, joinCode };
  }

  /**
   * PLAYER: Look up a session by join code.
   *
   * @param {string} code - The join code (e.g., "RHINO47")
   * @returns {Promise<string|null>} sessionId or null if not found
   */
  async function findSessionByCode(code) {
    ensureInit();
    const snap = await db.ref('joinCodes/' + code.toUpperCase().trim()).once('value');
    return snap.val();
  }

  /**
   * PLAYER: Join an existing session.
   *
   * @param {string} sessionId
   * @param {string} playerName
   * @returns {Promise<{playerId: string}>}
   */
  async function joinSession(sessionId, playerName) {
    ensureInit();
    const deviceId = generateDeviceId();

    // Check session exists and is in lobby
    const configSnap = await db.ref('sessions/' + sessionId + '/config').once('value');
    const config = configSnap.val();
    if (!config) throw new Error('Session not found');
    if (config.status !== 'lobby') throw new Error('Game already in progress');

    // Check if this device already joined (reconnection)
    const playersSnap = await db.ref('sessions/' + sessionId + '/players').once('value');
    const existingPlayers = playersSnap.val() || {};
    for (const [pid, pdata] of Object.entries(existingPlayers)) {
      if (pdata.deviceId === deviceId) {
        console.log('[CovenantFirebase] Reconnected as', pid);
        await db.ref('sessions/' + sessionId + '/players/' + pid + '/connected').set(true);
        return { playerId: pid };
      }
    }

    // Assign next player slot
    const playerCount = Object.keys(existingPlayers).length;
    if (playerCount >= 8) throw new Error('Session is full (max 8 players)');
    const playerId = 'player_' + playerCount;

    await db.ref('sessions/' + sessionId + '/players/' + playerId).set({
      name: playerName.trim(),
      deviceId: deviceId,
      joinedAt: firebase.database.ServerValue.TIMESTAMP,
      connected: true
    });

    // Update player count
    await db.ref('sessions/' + sessionId + '/config/playerCount').set(playerCount + 1);

    // Set up disconnect detection
    const connRef = db.ref('sessions/' + sessionId + '/players/' + playerId + '/connected');
    connRef.onDisconnect().set(false);

    console.log('[CovenantFirebase] Joined as', playerId, ':', playerName);
    return { playerId };
  }

  // ═══════════════════════════════════════════════════════════
  // GAME STATE — HOST WRITES
  // ═══════════════════════════════════════════════════════════

  /**
   * HOST: Start the game. Write scenario bank and advance status.
   *
   * @param {string} sessionId
   * @param {Array} scenarios - The selected scenario objects from selSess()
   */
  async function startGame(sessionId, scenarios) {
    ensureInit();

    // Write scenario data (stripped to what players need to see)
    const scenarioData = scenarios.map((s, i) => ({
      id: s.id || 'GS-' + String(i).padStart(3, '0'),
      tier: s.tier,
      stress: s.stress,
      text: s.text,
      theme: s.theme || null,
      caf: s.caf || null,
      options: s.options.map(o => ({
        t: o.t,
        f: o.f,
        fw: o.fw || null
      }))
    }));

    const updates = {};
    updates['sessions/' + sessionId + '/scenarios'] = scenarioData;
    updates['sessions/' + sessionId + '/config/status'] = 'playing';
    updates['sessions/' + sessionId + '/currentRound'] = {
      roundIndex: 0,
      phase: 'reading',
      pulsesSubmitted: 0,
      predictionsSubmitted: 0,
      phaseStartedAt: firebase.database.ServerValue.TIMESTAMP
    };

    await db.ref().update(updates);
    console.log('[CovenantFirebase] Game started with', scenarioData.length, 'scenarios');
  }

  /**
   * HOST: Advance the current phase.
   *
   * @param {string} sessionId
   * @param {string} phase - New phase name
   * @param {object} [extra] - Additional fields to merge into currentRound
   */
  async function setPhase(sessionId, phase, extra = {}) {
    ensureInit();
    const update = {
      phase: phase,
      phaseStartedAt: firebase.database.ServerValue.TIMESTAMP,
      ...extra
    };
    await db.ref('sessions/' + sessionId + '/currentRound').update(update);
  }

  /**
   * HOST: Advance to next round.
   *
   * @param {string} sessionId
   * @param {number} roundIndex
   */
  async function setRound(sessionId, roundIndex) {
    ensureInit();
    await db.ref('sessions/' + sessionId + '/currentRound').set({
      roundIndex: roundIndex,
      phase: 'reading',
      pulsesSubmitted: 0,
      predictionsSubmitted: 0,
      phaseStartedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  /**
   * HOST: Submit the group consensus vote (Section 3.1.2 payload).
   *
   * @param {string} sessionId
   * @param {number} roundIndex
   * @param {object} voteData - { selected_option_index, selected_foundation, campfire_duration_ms }
   */
  async function submitGroupVote(sessionId, roundIndex, voteData) {
    ensureInit();
    await db.ref('sessions/' + sessionId + '/groupVotes/' + roundIndex).set({
      ...voteData,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }

  /**
   * HOST: Write final analysis results so all players can see their Mirror.
   *
   * @param {string} sessionId
   * @param {object} results - The output of analyze()
   */
  async function writeResults(sessionId, results) {
    ensureInit();
    await db.ref('sessions/' + sessionId + '/results').set(results);
    await db.ref('sessions/' + sessionId + '/config/status').set('mirror');
  }

  // ═══════════════════════════════════════════════════════════
  // GAME STATE — PLAYER WRITES
  // ═══════════════════════════════════════════════════════════

  /**
   * PLAYER: Submit a private pulse (Section 3.1.1 payload).
   * Automatically increments the pulsesSubmitted counter on currentRound.
   *
   * @param {string} sessionId
   * @param {number} roundIndex
   * @param {string} playerId
   * @param {object} pulseData - Per the spec schema
   */
  async function submitPulse(sessionId, roundIndex, playerId, pulseData) {
    ensureInit();

    const pulsePayload = {
      selected_option_index: pulseData.selected_option_index,
      selected_foundation_primary: pulseData.selected_foundation_primary || null,
      selected_foundation_secondary: pulseData.selected_foundation_secondary || null,
      foundation_weights: pulseData.foundation_weights || {},
      rejected_foundations: pulseData.rejected_foundations || [],
      pulse_latency_ms: pulseData.pulse_latency_ms || 0,
      timer_remaining_pct: pulseData.timer_remaining_pct || 0,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    // BUG FIX #1: Server-side dedup. Check if this player already has a pulse
    // for this round. If so, overwrite the payload but do NOT increment the
    // counter (otherwise double-taps inflate pulsesSubmitted and prematurely
    // advance the phase, or worse, miscount the allIn check).
    const existingRef = db.ref('sessions/' + sessionId + '/pulses/' + roundIndex + '/' + playerId);
    const existingSnap = await existingRef.once('value');
    const isFirstSubmit = !existingSnap.exists();

    const updates = {};
    updates['sessions/' + sessionId + '/pulses/' + roundIndex + '/' + playerId] = pulsePayload;
    await db.ref().update(updates);

    if (isFirstSubmit) {
      // Increment pulse counter atomically — only on first submission.
      const counterRef = db.ref('sessions/' + sessionId + '/currentRound/pulsesSubmitted');
      await counterRef.transaction(current => (current || 0) + 1);
      console.log('[CovenantFirebase] Pulse submitted:', playerId, 'round', roundIndex);
    } else {
      console.log('[CovenantFirebase] Pulse OVERWRITE (duplicate call ignored for counter):', playerId, 'round', roundIndex);
    }
  }

  /**
   * PLAYER: Submit prediction (Section 3.1.3 payload).
   *
   * @param {string} sessionId
   * @param {number} roundIndex
   * @param {string} playerId
   * @param {number} predictedDriftCount
   */
  async function submitPrediction(sessionId, roundIndex, playerId, predictedDriftCount) {
    ensureInit();

    // BUG FIX #2: Server-side dedup for predictions. Same pattern as submitPulse.
    const predRef = db.ref('sessions/' + sessionId + '/predictions/' + roundIndex + '/' + playerId);
    const existingSnap = await predRef.once('value');
    const isFirstSubmit = !existingSnap.exists();

    await predRef.set({
      predicted_drift_count: predictedDriftCount,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    if (isFirstSubmit) {
      // Increment prediction counter atomically — only on first submission.
      const counterRef = db.ref('sessions/' + sessionId + '/currentRound/predictionsSubmitted');
      await counterRef.transaction(current => (current || 0) + 1);
    } else {
      console.log('[CovenantFirebase] Prediction OVERWRITE (duplicate call ignored for counter):', playerId, 'round', roundIndex);
    }
  }

  /**
   * PLAYER: Submit capstone assessment (Section 3.1.4 payload).
   *
   * @param {string} sessionId
   * @param {string} playerId
   * @param {object} capstoneData - { fragment_surfaced, player_assessment }
   */
  async function submitCapstoneAssessment(sessionId, playerId, capstoneData) {
    ensureInit();
    await db.ref('sessions/' + sessionId + '/capstone/fragments/' + playerId).update({
      fragment_surfaced: capstoneData.fragment_surfaced,
      player_assessment: capstoneData.player_assessment,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }

  // ═══════════════════════════════════════════════════════════
  // LISTENERS — Real-time state subscriptions
  // ═══════════════════════════════════════════════════════════

  /**
   * Subscribe to player roster changes (lobby + in-game).
   *
   * @param {string} sessionId
   * @param {function} callback - Receives { player_0: {name, connected, ...}, ... }
   * @returns {function} unsubscribe function
   */
  function onPlayersChanged(sessionId, callback) {
    ensureInit();
    const ref = db.ref('sessions/' + sessionId + '/players');
    const handler = ref.on('value', snap => callback(snap.val() || {}));
    return () => ref.off('value', handler);
  }

  /**
   * Subscribe to current round/phase changes.
   * This is the primary synchronization signal for view routing.
   *
   * @param {string} sessionId
   * @param {function} callback - Receives { roundIndex, phase, pulsesSubmitted, ... }
   * @returns {function} unsubscribe function
   */
  function onRoundChanged(sessionId, callback) {
    ensureInit();
    const ref = db.ref('sessions/' + sessionId + '/currentRound');
    const handler = ref.on('value', snap => callback(snap.val() || {}));
    return () => ref.off('value', handler);
  }

  /**
   * Subscribe to session config changes (status transitions).
   *
   * @param {string} sessionId
   * @param {function} callback - Receives { status, joinCode, playerCount, ... }
   * @returns {function} unsubscribe function
   */
  function onConfigChanged(sessionId, callback) {
    ensureInit();
    const ref = db.ref('sessions/' + sessionId + '/config');
    const handler = ref.on('value', snap => callback(snap.val() || {}));
    return () => ref.off('value', handler);
  }

  /**
   * Subscribe to pulse submissions for a specific round.
   * HOST uses this to know when all players have submitted.
   *
   * @param {string} sessionId
   * @param {number} roundIndex
   * @param {function} callback - Receives { player_0: {...pulse}, player_1: {...pulse}, ... }
   * @returns {function} unsubscribe function
   */
  function onPulsesForRound(sessionId, roundIndex, callback) {
    ensureInit();
    const ref = db.ref('sessions/' + sessionId + '/pulses/' + roundIndex);
    const handler = ref.on('value', snap => callback(snap.val() || {}));
    return () => ref.off('value', handler);
  }

  /**
   * Subscribe to prediction submissions for a specific round.
   *
   * @param {string} sessionId
   * @param {number} roundIndex
   * @param {function} callback
   * @returns {function} unsubscribe function
   */
  function onPredictionsForRound(sessionId, roundIndex, callback) {
    ensureInit();
    const ref = db.ref('sessions/' + sessionId + '/predictions/' + roundIndex);
    const handler = ref.on('value', snap => callback(snap.val() || {}));
    return () => ref.off('value', handler);
  }

  /**
   * Subscribe to final results (players watch for their Mirror data).
   *
   * @param {string} sessionId
   * @param {function} callback
   * @returns {function} unsubscribe function
   */
  function onResults(sessionId, callback) {
    ensureInit();
    const ref = db.ref('sessions/' + sessionId + '/results');
    const handler = ref.on('value', snap => callback(snap.val()));
    return () => ref.off('value', handler);
  }

  // ═══════════════════════════════════════════════════════════
  // DATA RETRIEVAL — One-shot reads for analyze()
  // ═══════════════════════════════════════════════════════════

  /**
   * HOST: Read all session data to feed into analyze().
   * Transforms Firebase's flat structure back into the local-state
   * format that the existing analyze() function expects.
   *
   * @param {string} sessionId
   * @returns {Promise<object>} - { players, pulses, groupVotes, predictions, capstone, scenarios }
   */
  async function getSessionData(sessionId) {
    ensureInit();
    const snap = await db.ref('sessions/' + sessionId).once('value');
    const data = snap.val();
    if (!data) throw new Error('Session data not found');
    return data;
  }

  /**
   * HOST: Transform Firebase session data into the format
   * that the existing analyze() function expects.
   *
   * The existing analyze() expects:
   *   - pl: array of { name, pulses: [optionIndex, ...], predictions: [driftCount, ...] }
   *   - sc: array of scenario objects
   *   - gv: array of group vote option indices
   *   - sy: array of capstone assessment data
   *
   * This function bridges from the Firebase schema (spec 3.1.x payloads)
   * to the legacy local-state format.
   *
   * @param {object} sessionData - Raw Firebase session data
   * @returns {object} - { pl, sc, gv, sy, enrichedPulses }
   */
  function transformForAnalyze(sessionData) {
    const players = sessionData.players || {};
    const scenarios = sessionData.scenarios || [];
    const pulses = sessionData.pulses || {};
    const groupVotes = sessionData.groupVotes || {};
    const predictions = sessionData.predictions || {};
    const capstone = sessionData.capstone || {};

    const playerIds = Object.keys(players).sort();
    const playerNames = playerIds.map(pid => players[pid].name || pid);
    const roundCount = scenarios.length;

    // Build pl array in the format analyze() expects
    const pl = playerIds.map(pid => {
      const pulsesArr = [];
      const predsArr = [];
      const latenciesArr = [];

      for (let r = 0; r < roundCount; r++) {
        const roundPulses = pulses[r] || {};
        const playerPulse = roundPulses[pid];
        pulsesArr.push(playerPulse ? playerPulse.selected_option_index : 0);
        latenciesArr.push(playerPulse ? (playerPulse.pulse_latency_ms || 0) : 0);

        const roundPreds = predictions[r] || {};
        const playerPred = roundPreds[pid];
        predsArr.push(playerPred ? playerPred.predicted_drift_count : 0);
      }

      return {
        name: players[pid].name,
        pulses: pulsesArr,
        predictions: predsArr,
        latencies: latenciesArr
      };
    });

    // Build gv + campDur (group vote option indices + campfire duration per round)
    const gv = [];
    const campDur = [];
    for (let r = 0; r < roundCount; r++) {
      const rv = groupVotes[r];
      gv.push(rv ? rv.selected_option_index : 0);
      campDur.push(rv ? (rv.campfire_duration_ms || 0) : 0);
    }

    // Build sy array (capstone assessment per player)
    const sy = playerIds.map(pid => {
      const frag = (capstone.fragments || {})[pid];
      return frag ? frag.player_assessment : null;
    });

    // Also provide the enriched pulse data (with latency, foundation weights, etc.)
    // for the Phase 1 psychometric engine to use
    const enrichedPulses = {};
    for (let r = 0; r < roundCount; r++) {
      enrichedPulses[r] = {};
      const roundPulses = pulses[r] || {};
      for (const pid of playerIds) {
        if (roundPulses[pid]) {
          enrichedPulses[r][pid] = roundPulses[pid];
        }
      }
    }

    return {
      pl,
      sc: scenarios,
      gv,
      campDur,
      sy,
      enrichedPulses,
      capstone,
      groupVotes,
      playerIds,
      playerNames,
      playerCount: playerIds.length
    };
  }

  // ═══════════════════════════════════════════════════════════
  // RESHAPE ANALYZE OUTPUT → FIREBASE-FRIENDLY SHAPE
  // ═══════════════════════════════════════════════════════════
  // analyze() returns { ind: [...], grp: {...} }
  // Firebase/PlayerView expects { players: {pid: profile}, group: {...} }.
  // This bridges the two without changing the engine. Undefined fields are
  // converted to null because Firebase silently drops undefined on write.

  function reshapeResultsForFirebase(analyzeOut, playerIds, playerNames) {
    if (!analyzeOut || !analyzeOut.ind || !analyzeOut.grp) {
      return { players: {}, group: {}, playerOrder: playerIds || [], error: 'analyze() returned empty' };
    }

    const players = {};
    playerIds.forEach(function(pid, idx) {
      const profile = analyzeOut.ind[idx];
      if (!profile) return;
      const out = {};
      Object.keys(profile).forEach(function(k) {
        const v = profile[k];
        out[k] = (v === undefined) ? null : v;
      });
      out.name = (playerNames && playerNames[idx]) || null;
      out.playerIndex = idx;
      players[pid] = out;
    });

    const group = {};
    Object.keys(analyzeOut.grp).forEach(function(k) {
      const v = analyzeOut.grp[k];
      group[k] = (v === undefined) ? null : v;
    });

    return {
      players: players,
      group: group,
      playerOrder: playerIds,
      computedAt: Date.now()
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SESSION CLEANUP
  // ═══════════════════════════════════════════════════════════

  /**
   * HOST: Clean up session data and join code index.
   * Call when game is complete and players have viewed results.
   *
   * @param {string} sessionId
   * @param {string} joinCode
   */
  async function cleanupSession(sessionId, joinCode) {
    ensureInit();
    await db.ref('joinCodes/' + joinCode).remove();
    // Optionally mark session as complete rather than deleting
    await db.ref('sessions/' + sessionId + '/config/status').set('complete');
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════

  window.CovenantFirebase = {
    // Initialization
    init: initFirebase,

    // Session management
    createSession,
    findSessionByCode,
    joinSession,
    cleanupSession,

    // Host writes
    startGame,
    setPhase,
    setRound,
    submitGroupVote,
    writeResults,

    // Player writes
    submitPulse,
    submitPrediction,
    submitCapstoneAssessment,

    // Listeners
    onPlayersChanged,
    onRoundChanged,
    onConfigChanged,
    onPulsesForRound,
    onPredictionsForRound,
    onResults,

    // Data retrieval
    getSessionData,
    transformForAnalyze,
    reshapeResultsForFirebase,

    // Utilities
    generateJoinCode,
    generateDeviceId
  };

})();
