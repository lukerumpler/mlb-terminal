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
  // resultKey is required; logPitch no-ops without one.
  const logPitch = useCallback((zone, type, resultKey) => {
    if (!resultKey) return;
    const cur = load();
    const { balls, strikes, endsAtBat, outcome } = applyResult(cur.balls, cur.strikes, resultKey);
    const pitch = { id:uid(), zone, type, result:resultKey, countBefore:`${cur.balls}-${cur.strikes}`, ts:Date.now() };
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

  return { session, setField, logPitch, newAtBat, recordOut, advanceInning, resetCount, newSession };
}
