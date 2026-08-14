const STORAGE_KEY = 'skip-verified-trend-snapshots-v1';

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* best effort */ }
}

export function readVerifiedSnapshot(scope) {
  const all = readAll();
  const row = all[String(scope)];
  return row && typeof row === 'object' ? row : null;
}

export function captureVerifiedSnapshot(scope, metrics, capturedAt = Date.now()) {
  const all = readAll();
  const previous = all[String(scope)] || null;
  const next = { capturedAt, metrics: {} };
  Object.entries(metrics || {}).forEach(([key, metric]) => {
    const value = Number(metric?.value);
    if (metric?.status !== 'verified' || !Number.isFinite(value)) return;
    next.metrics[key] = { value, label: metric.label || key, source: metric.source || 'Verified source' };
  });
  if (!Object.keys(next.metrics).length) return previous;
  all[String(scope)] = next;
  writeAll(all);
  return previous;
}

export function deriveVerifiedTrends(metrics, previous) {
  return Object.fromEntries(Object.entries(metrics || {}).map(([key, metric]) => {
    const current = Number(metric?.value);
    const baseline = Number(previous?.metrics?.[key]?.value);
    if (metric?.status !== 'verified' || !Number.isFinite(current) || !Number.isFinite(baseline)) {
      return [key, { status: 'unavailable', delta: null, baselineAt: previous?.capturedAt || null }];
    }
    const delta = current - baseline;
    return [key, {
      status: 'verified',
      delta,
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
      baselineAt: previous.capturedAt,
      source: metric.source || previous.metrics[key]?.source || 'Verified source',
    }];
  }));
}

export function formatTrendDelta(delta, digits = 3) {
  if (!Number.isFinite(Number(delta))) return '—';
  const value = Number(delta);
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export const TREND_SNAPSHOT_STORAGE_KEY = STORAGE_KEY;
