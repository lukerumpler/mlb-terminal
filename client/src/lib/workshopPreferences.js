import { useSyncExternalStore } from 'react';

// Workshop View (Roadmap item: Team Overview header configuration control).
// Same lightweight localStorage-module shape as lib/lowData.js: a plain
// read/write pair plus a useSyncExternalStore hook, so any component can
// read current prefs reactively without its own effect/listener wiring.
//
// Every key here gates a real, already-existing piece of Team Overview —
// there is no toggle in this list without a corresponding conditional in
// OverviewPage.jsx. Defaults are all `true` (i.e. "show everything, same as
// today") specifically so introducing this control doesn't silently hide
// anything that was previously always visible; Workshop View is meant to
// let someone declutter, not a feature people are opted into by surprise.
export const WORKSHOP_STORAGE_KEY = 'skip-workshop-preferences';
const WORKSHOP_EVENT = 'skip-workshop-preferences-change';

export const WORKSHOP_OPTIONS = [
  { key: 'showPlayoffOdds', label: 'Playoff odds', description: 'Playoff Odds in the headline metrics row' },
  { key: 'showMinorLeagueControls', label: 'Minor league data', description: 'Affiliate selector in the team header' },
  { key: 'showContractData', label: 'Contract data', description: 'Franchise CBT Trend panel (Operations)' },
  { key: 'showCacheDiagnostics', label: 'Cache diagnostics', description: 'Provider cache health readout (Operations)' },
];

export const WORKSHOP_DEFAULTS = WORKSHOP_OPTIONS.reduce((acc, opt) => ({ ...acc, [opt.key]: true }), {});

// useSyncExternalStore requires getSnapshot to return a referentially
// stable value when nothing has actually changed, or React re-invokes it
// every render and (with an object-shaped snapshot, unlike lib/lowData.js's
// plain boolean) that's an infinite render loop, not just a wasted call.
// Caching against the raw stored string — not just "did we compute this
// once" — means a clear()/external write (e.g. the `storage` event from
// another tab) still correctly invalidates the cache on the next read.
let cachedRaw;
let cachedValue = WORKSHOP_DEFAULTS;

function readRaw() {
  if (typeof window === 'undefined') return WORKSHOP_DEFAULTS;
  let raw = null;
  try { raw = window.localStorage.getItem(WORKSHOP_STORAGE_KEY); } catch { /* private browsing / storage disabled */ }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  if (!raw) { cachedValue = WORKSHOP_DEFAULTS; return cachedValue; }
  try {
    const parsed = JSON.parse(raw);
    // Merge over defaults, not the other way around — an older saved blob
    // missing a since-added key (or one with a stray unknown key from a
    // future version) still resolves to a complete, valid preference object.
    cachedValue = (parsed && typeof parsed === 'object') ? { ...WORKSHOP_DEFAULTS, ...parsed } : WORKSHOP_DEFAULTS;
  } catch {
    cachedValue = WORKSHOP_DEFAULTS;
  }
  return cachedValue;
}

export function readWorkshopPreferences() {
  return readRaw();
}

export function saveWorkshopPreferences(next) {
  const current = readRaw();
  const merged = { ...current, ...(typeof next === 'function' ? next(current) : next) };
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(WORKSHOP_STORAGE_KEY, JSON.stringify(merged)); } catch { /* private browsing / storage disabled */ }
    window.dispatchEvent(new Event(WORKSHOP_EVENT));
  }
  return merged;
}

export function resetWorkshopPreferences() {
  return saveWorkshopPreferences(WORKSHOP_DEFAULTS);
}

function subscribe(callback) {
  if (typeof window === 'undefined') return () => {};
  const onChange = () => callback();
  window.addEventListener(WORKSHOP_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(WORKSHOP_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useWorkshopPreferences() {
  return useSyncExternalStore(subscribe, readRaw, () => WORKSHOP_DEFAULTS);
}
