import { C } from '../constants/colors.js';

const OUTCOMES = ['durable-hit', 'stale-hit', 'upstream-miss'];

function count(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function providerLabel(provider) {
  return String(provider || 'Unknown provider')
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function summarizeCacheTelemetry(health) {
  const providers = Object.entries(health?.providers || {})
    .map(([provider, outcomes]) => {
      const durableHits = count(outcomes?.['durable-hit']);
      const staleHits = count(outcomes?.['stale-hit']);
      const upstreamMisses = count(outcomes?.['upstream-miss']);
      return {
        provider,
        label: providerLabel(provider),
        durableHits,
        staleHits,
        upstreamMisses,
        servedFromCache: durableHits + staleHits,
        total: durableHits + staleHits + upstreamMisses,
      };
    })
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));

  const totals = providers.reduce((summary, provider) => ({
    durableHits: summary.durableHits + provider.durableHits,
    staleHits: summary.staleHits + provider.staleHits,
    upstreamMisses: summary.upstreamMisses + provider.upstreamMisses,
    servedFromCache: summary.servedFromCache + provider.servedFromCache,
    total: summary.total + provider.total,
  }), { durableHits: 0, staleHits: 0, upstreamMisses: 0, servedFromCache: 0, total: 0 });

  return {
    day: health?.day || null,
    providers,
    totals,
    cacheReusePercent: totals.total > 0 ? Math.round((totals.servedFromCache / totals.total) * 100) : null,
  };
}

export function buildOperationalAlerts({ cacheHealth, cacheHealthStatus, feedFreshnessSummary, lowDataMode } = {}) {
  const alerts = [];
  const summary = summarizeCacheTelemetry(cacheHealth);

  if (cacheHealthStatus === 'error') {
    alerts.push({
      id: 'cache-health-unavailable',
      type: 'warn',
      title: 'Cache telemetry unavailable',
      body: 'SKIP could not read its telemetry snapshot. This does not force a provider refresh; retrying only reads the internal cache-health endpoint.',
      source: 'SKIP cache telemetry',
      color: C.rust,
    });
  } else if (cacheHealthStatus === 'ready' && summary.providers.length === 0) {
    alerts.push({
      id: 'cache-health-idle',
      type: 'info',
      title: 'No provider cache events yet today',
      body: 'No monitored contract or team-financial cache operations have been recorded in the current UTC day.',
      source: 'SKIP cache telemetry',
      color: C.text3,
    });
  } else if (cacheHealthStatus === 'ready') {
    if (summary.totals.staleHits > 0) {
      alerts.push({
        id: 'stale-cache-served',
        type: 'warn',
        title: 'Stale cache fallback served',
        body: `${summary.totals.staleHits} request${summary.totals.staleHits === 1 ? '' : 's'} used a clearly labeled stale snapshot rather than issuing an unbounded provider retry.`,
        source: 'SKIP cache telemetry',
        color: C.amberDark,
      });
    }
    if (summary.totals.servedFromCache > 0) {
      alerts.push({
        id: 'cache-reuse-active',
        type: 'good',
        title: 'Cache reuse active',
        body: `${summary.totals.servedFromCache} request${summary.totals.servedFromCache === 1 ? '' : 's'} were served from durable or stale cache today${summary.cacheReusePercent != null ? ` (${summary.cacheReusePercent}% of recorded reads)` : ''}.`,
        source: 'SKIP cache telemetry',
        color: C.teal,
      });
    }
    if (summary.totals.upstreamMisses > 0) {
      alerts.push({
        id: 'controlled-upstream-reads',
        type: 'info',
        title: 'Controlled upstream reads recorded',
        body: `${summary.totals.upstreamMisses} cache miss${summary.totals.upstreamMisses === 1 ? '' : 'es'} reached a provider today. Counts are telemetry only, not a provider-error indicator.`,
        source: 'SKIP cache telemetry',
        color: C.text2,
      });
    }
  }

  if (feedFreshnessSummary) {
    const total = count(feedFreshnessSummary.total);
    const successful = count(feedFreshnessSummary.successful);
    if (total > 0 && successful < total) {
      alerts.push({
        id: 'feed-freshness-pending',
        type: 'warn',
        title: 'Some feed sources are pending',
        body: `${successful} of ${total} configured feed sources have recorded a recent successful update.`,
        source: 'Feed freshness settings',
        color: C.amberDark,
      });
    } else if (total > 0) {
      alerts.push({
        id: 'feed-freshness-current',
        type: 'good',
        title: 'Feed freshness is current',
        body: `${successful} configured feed source${successful === 1 ? '' : 's'} reported a recent successful update.`,
        source: 'Feed freshness settings',
        color: C.teal,
      });
    }
  }

  if (lowDataMode) {
    alerts.push({
      id: 'low-data-mode-active',
      type: 'info',
      title: 'Low Data Mode is active',
      body: 'High-resolution player media is reduced. Statistics, search links, and verified data remain available.',
      source: 'Workspace preferences',
      color: C.text2,
    });
  }

  return alerts;
}

export function countActionableAlerts(alerts) {
  return (alerts || []).filter(alert => alert.type === 'warn').length;
}

export { OUTCOMES };
