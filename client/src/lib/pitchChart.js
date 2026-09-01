import { useState, useEffect, useCallback } from 'react';

// Live pitch-charting tool (Roadmap #8) — a manual data-entry aid for
// someone charting a game in person, not a stats-aggregator feature like
// the rest of SKIP. Same client-only, localStorage-backed persistence
// pattern as Scouting Notes / the watchlist: nothing here round-trips to a
// server. Split into a pure-logic half (uid/emptySession/applyResult,
// exported and unit-tested directly, no DOM needed) and a stateful-hook
// half (usePitchChart), same shape as lib/watchlist.js's useWatchlist().

const STORAGE_KEY = 'skip-pitch-chart';
const EVENT = 'skip-pitch-chart-change';

function uid() {
  return 'pc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptySession() {
  return {
    id: uid(),
    createdAt: Date.now(),
    pitcherName: '', pitcherThrows: 'R',
    batterName: '', batterBats: 'R',
    inning: 1, outs: 0,
    balls: 0, strikes: 0,
    currentPitches: [],   // pitches in the in-progress at-bat, newest last
    atBats: [],           // completed at-bats this session, newest first
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return emptySession();
    // Merge over a fresh emptySession() rather than trusting the stored
    // shape outright, so an older/partial session from a prior version of
    // this tool doesn't crash the UI on a missing field.
    return { ...emptySession(), ...parsed, id: parsed.id || uid() };
  } catch { return emptySession(); } // private browsing / storage disabled — degrade to a fresh session
}

function persist(session) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* best effort */ }
}

// Archives whatever's sitting in currentPitches into atBats under the given
// outcome label, or just clears the count if there's nothing to archive.
// Shared by newAtBat() and both inning-rollover paths below (recordOut's
// 3rd out, advanceInning). An earlier pass fixed the core bug here — an
// inning rollover leaving a stale count/orphaned pitch badges from an
// unfinished at-bat sitting around into the next inning — but did it by
// discarding those pitches outright ("no honest outcome to attach to
// them"). Optimizing that: an "Inning ended" outcome *is* an honest,
// literal description of what happened, and it's a real charter's real
// entered data (zone/type/result for actual pitches thrown) — silently
// dropping it loses more than a generic-but-true label costs.
export function closeCurrentAtBat(session, outcome) {
  if (session.currentPitches.length === 0) {
    return { ...session, balls:0, strikes:0 };
  }
  const closedAtBat = {
    id:uid(), batterName:session.batterName, pitcherName:session.pitcherName,
    pitches:session.currentPitches, outcome, closedAt:Date.now(),
  };
  return { ...session, balls:0, strikes:0, currentPitches:[], atBats:[closedAtBat, ...session.atBats] };
}

export const RESULTS = [
  { key:'ball',       lbl:'Ball' },
  { key:'called',     lbl:'Called Strike' },
  { key:'swinging',   lbl:'Swinging Strike' },
  { key:'foul',       lbl:'Foul' },
  { key:'inplay_out', lbl:'In Play — Out' },
  { key:'inplay_hit', lbl:'In Play — Hit' },
  { key:'hbp',        lbl:'Hit By Pitch' },
];

// A "swing" for whiff-rate purposes — anything the batter offered at.
// 'ball', 'called', and 'hbp' are explicitly not swings.
const SWING_RESULTS = new Set(['swinging', 'foul', 'inplay_out', 'inplay_hit']);

// Every pitch thrown this session, oldest first: closed at-bats (already
// newest-first, so reversed) followed by whatever's still in progress. Pulled
// out as its own helper because both summarizePitches() and any future
// per-session aggregate (e.g. a post-game report) need the same flattened,
// chronological view rather than each re-deriving it from session.atBats /
// session.currentPitches separately.
export function allSessionPitches(session) {
  const closed = [...session.atBats].reverse().flatMap(ab => ab.pitches);
  return [...closed, ...session.currentPitches];
}

// Pure aggregation for the Pitch Summary panel (Roadmap #8 v2): groups every
// pitch thrown this session by type and returns usage/velocity/whiff-rate
// per type, sorted by most-thrown first. Deliberately only surfaces a stat
// when the underlying field actually supports it — velocity is an optional
// per-pitch entry (a charter may not have a radar/scoreboard reading handy),
// so avgVelocity/veloRange stay null for a type until at least one recorded
// pitch of that type has one, rather than defaulting to 0 and implying a
// real (if slow) fastball. Same reasoning for whiffRate: null, not 0%, when
// that type was never actually swung at.
export function summarizePitches(pitchesOrSession) {
  const pitches = Array.isArray(pitchesOrSession) ? pitchesOrSession : allSessionPitches(pitchesOrSession);
  const total = pitches.length;
  if (total === 0) return [];

  const byType = new Map();
  for (const p of pitches) {
    const key = p.type || 'UNK';
    if (!byType.has(key)) byType.set(key, { type: key, count: 0, velocities: [], swings: 0, whiffs: 0 });
    const row = byType.get(key);
    row.count += 1;
    if (Number.isFinite(p.velocity)) row.velocities.push(p.velocity);
    if (SWING_RESULTS.has(p.result)) {
      row.swings += 1;
      if (p.result === 'swinging') row.whiffs += 1;
    }
  }

  return [...byType.values()]
    .map(row => ({
      type: row.type,
      count: row.count,
      usagePct: total > 0 ? (row.count / total) * 100 : null,
      avgVelocity: row.velocities.length ? row.velocities.reduce((a, b) => a + b, 0) / row.velocities.length : null,
      minVelocity: row.velocities.length ? Math.min(...row.velocities) : null,
      maxVelocity: row.velocities.length ? Math.max(...row.velocities) : null,
      whiffRate: row.swings > 0 ? (row.whiffs / row.swings) * 100 : null,
    }))
    .sort((a, b) => b.count - a.count);
}

// Pure function: given the count *before* a pitch and its result, returns
// the count *after* it plus whether the at-bat is over. Exported and
// unit-tested on its own (test/pitch-chart.test.jsx), independent of the
// component or localStorage, so real baseball count rules (a foul doesn't
// add a 3rd strike; ball four is a walk; strike three is a strikeout) are
// verified directly rather than only indirectly through UI interaction.
export function applyResult(balls, strikes, resultKey) {
  switch (resultKey) {
    case 'ball': {
      const b = balls + 1;
      return b >= 4 ? { balls:b, strikes, endsAtBat:true, outcome:'Walk' } : { balls:b, strikes, endsAtBat:false, outcome:null };
    }
    case 'called':
    case 'swinging': {
      const s = strikes + 1;
      return s >= 3 ? { balls, strikes:s, endsAtBat:true, outcome:'Strikeout' } : { balls, strikes:s, endsAtBat:false, outcome:null };
    }
    case 'foul': {
      const s = strikes < 2 ? strikes + 1 : strikes; // a foul with 2 strikes stays at 2, never a 3rd strike
      return { balls, strikes:s, endsAtBat:false, outcome:null };
    }
    case 'inplay_out':
      return { balls, strikes, endsAtBat:true, outcome:'In Play — Out' };
    case 'inplay_hit':
      return { balls, strikes, endsAtBat:true, outcome:'In Play — Hit' };
    case 'hbp':
      return { balls, strikes, endsAtBat:true, outcome:'Hit By Pitch' };
    default:
      return { balls, strikes, endsAtBat:false, outcome:null };
  }
}

export function usePitchChart() {
  const [session, setSession] = useState(load);

  useEffect(() => {
    const onChange = () => setSession(load());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const commit = useCallback((next) => {
    persist(next);
    setSession(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const setField = useCallback((patch) => {
    commit({ ...load(), ...patch });
  }, [commit]);

  // The one entry point that actually logs a pitch. zone/type may be null
  // (a charter can log a result without having picked a zone or type yet —
  // better an incomplete-but-real row than blocking entry entirely), but
  // resultKey is required; logPitch no-ops without one. velocity and
  // targetZone (the catcher's pre-pitch target, vs. `zone` which is where it
  // actually crossed — a command signal, not a duplicate of `zone`) are both
  // optional extras layered on the same v1 entry point rather than a second
  // one, so a charter who skips them still gets the fast, one-tap-per-field
  // flow the tool was built for.
  const logPitch = useCallback((zone, type, resultKey, extras = {}) => {
    if (!resultKey) return;
    const { velocity = null, targetZone = null } = extras;
    const cur = load();
    const { balls, strikes, endsAtBat, outcome } = applyResult(cur.balls, cur.strikes, resultKey);
    const pitch = {
      id:uid(), zone, targetZone, type,
      velocity: Number.isFinite(velocity) ? velocity : null,
      result:resultKey, countBefore:`${cur.balls}-${cur.strikes}`, ts:Date.now(),
    };
    const pitches = [...cur.currentPitches, pitch];

    if (!endsAtBat) {
      commit({ ...cur, balls, strikes, currentPitches:pitches });
      return;
    }
    const closedAtBat = {
      id:uid(), batterName:cur.batterName, pitcherName:cur.pitcherName,
      pitches, outcome, closedAt:Date.now(),
    };
    commit({ ...cur, balls:0, strikes:0, currentPitches:[], atBats:[closedAtBat, ...cur.atBats] });
  }, [commit]);

  // Corrects a mis-tap: drops the most recently logged pitch from the
  // in-progress at-bat and restores the count to what it was immediately
  // before that pitch (stored on the pitch itself as `countBefore`, so this
  // needs no replay of the whole at-bat). Deliberately scoped to the
  // current, still-open at-bat only — reopening an already-closed at-bat
  // (e.g. to fix the pitch that ended it) is a materially different,
  // riskier operation (recomputing outs/inning state too) and out of scope
  // for a same-at-bat correction tool. No-ops with nothing to undo.
  const undoLastPitch = useCallback(() => {
    const cur = load();
    if (cur.currentPitches.length === 0) return;
    const last = cur.currentPitches[cur.currentPitches.length - 1];
    const [balls, strikes] = (last.countBefore || '0-0').split('-').map(Number);
    commit({ ...cur, balls: balls || 0, strikes: strikes || 0, currentPitches: cur.currentPitches.slice(0, -1) });
  }, [commit]);

  // Manually closes the current at-bat even if the count didn't force it
  // (charter wants to move on for any reason — batter injury, mis-tap
  // recovery, etc.). A no-op beyond resetting the count if nothing's been
  // logged yet for this at-bat.
  const newAtBat = useCallback(() => {
    commit(closeCurrentAtBat(load(), 'Ended manually'));
  }, [commit]);

  const recordOut = useCallback(() => {
    const cur = load();
    const outs = cur.outs + 1;
    if (outs >= 3) {
      commit({ ...closeCurrentAtBat(cur, 'Inning ended'), outs:0, inning:cur.inning + 1 });
    } else {
      commit({ ...cur, outs });
    }
  }, [commit]);

  const advanceInning = useCallback(() => {
    const cur = load();
    commit({ ...closeCurrentAtBat(cur, 'Inning ended'), inning:cur.inning + 1, outs:0 });
  }, [commit]);

  const resetCount = useCallback(() => {
    const cur = load();
    commit({ ...cur, balls:0, strikes:0 });
  }, [commit]);

  const newSession = useCallback(() => {
    commit(emptySession());
  }, [commit]);

  return { session, setField, logPitch, undoLastPitch, newAtBat, recordOut, advanceInning, resetCount, newSession };
}
