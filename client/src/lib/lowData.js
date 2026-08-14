import { useSyncExternalStore } from 'react';

export const LOW_DATA_STORAGE_KEY = 'skip-low-data-mode';
const LOW_DATA_EVENT = 'skip-low-data-mode-change';

function readRaw() {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(LOW_DATA_STORAGE_KEY) === 'true'; } catch { return false; }
}

export function readLowDataMode() {
  return readRaw();
}

export function setLowDataMode(enabled) {
  const value = Boolean(enabled);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(LOW_DATA_STORAGE_KEY, String(value)); } catch { /* private browsing / storage disabled */ }
    window.dispatchEvent(new Event(LOW_DATA_EVENT));
  }
  return value;
}

function subscribe(callback) {
  if (typeof window === 'undefined') return () => {};
  const onChange = () => callback();
  window.addEventListener(LOW_DATA_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(LOW_DATA_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useLowDataMode() {
  return useSyncExternalStore(subscribe, readRaw, () => false);
}
