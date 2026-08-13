import { useState, useEffect, useCallback } from 'react';

// A lightweight "star to track" list, distinct from Scouting Notes — this is
// for bookmarking players you want to keep an eye on, not for writing a
// report about them. Same persistence pattern as notes/theme: client-only,
// localStorage, nothing round-trips to a server.
const STORAGE_KEY = 'skip-watchlist';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persist(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* best effort */ }
}

// Fired whenever the watchlist changes, so every component using the hook
// (even in a different part of the tree) stays in sync without prop drilling.
const EVENT = 'skip-watchlist-change';

export function useWatchlist() {
  const [list, setList] = useState(load);

  useEffect(() => {
    const onChange = () => setList(load());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const isWatched = useCallback((mlbId) => list.some(w => w.mlbId === mlbId), [list]);

  const toggle = useCallback((entry) => {
    const current = load();
    const exists = current.some(w => w.mlbId === entry.mlbId);
    const next = exists
      ? current.filter(w => w.mlbId !== entry.mlbId)
      : [...current, { ...entry, addedAt: Date.now() }];
    persist(next);
    setList(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { list, isWatched, toggle };
}
