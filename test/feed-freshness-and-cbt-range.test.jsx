import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  readFeedFreshnessSettings,
  saveFeedFreshnessSettings,
  readFeedSuccesses,
  recordFeedSuccess,
  formatFeedFreshness,
  summarizeFeedFreshness,
} from '../client/src/lib/feedFreshness.js';
import { FeedFreshnessPanel } from '../client/src/components/FeedFreshnessPanel.jsx';
import { CBT_HISTORY_OPTIONS, buildCbtHistorySeasons, normalizeCbtHistoryRange, readCbtHistoryRange, saveCbtHistoryRange } from '../client/src/lib/cbtHistory.js';

beforeEach(() => {
  localStorage.clear();
});

describe('feed freshness persistence', () => {
  it('keeps the default visible relative preference and merges partial updates', () => {
    expect(readFeedFreshnessSettings()).toEqual({ enabled:true, displayMode:'relative' });
    expect(saveFeedFreshnessSettings({ displayMode:'exact' })).toEqual({ enabled:true, displayMode:'exact' });
    expect(saveFeedFreshnessSettings({ enabled:false })).toEqual({ enabled:false, displayMode:'exact' });
    expect(readFeedFreshnessSettings()).toEqual({ enabled:false, displayMode:'exact' });
  });

  it('records only known successful feeds and preserves their timestamps', () => {
    expect(recordFeedSuccess('mlb-scores', 1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(recordFeedSuccess('not-a-feed', 1_700_000_000_100)).toBeNull();
    expect(readFeedSuccesses()).toEqual({ 'mlb-scores':1_700_000_000_000 });
    expect(summarizeFeedFreshness(readFeedSuccesses()).successful).toBe(1);
  });

  it('uses honest text for missing timestamps and readable relative/exact values', () => {
    expect(formatFeedFreshness(null)).toBe('No successful update recorded');
    expect(formatFeedFreshness(1_700_000_000_000, { now:1_700_000_120_000 })).toBe('2 mins ago');
    expect(formatFeedFreshness(1_700_000_000_000, { mode:'exact' })).toContain('2023');
  });

  it('renders each feed and lets the user toggle the global indicator', () => {
    const updateSettings = vi.fn();
    render(<FeedFreshnessPanel settings={{ enabled:true, displayMode:'relative' }} successes={{ 'mlb-scores':Date.now() - 60_000 }} updateSettings={updateSettings} />);
    expect(screen.getByText('MLB live scores')).toBeInTheDocument();
    expect(screen.getByText(/1 min ago/)).toBeInTheDocument();
    expect(screen.getAllByText('No successful update recorded').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('switch', { name:/Toggle data freshness indicator/i }));
    expect(updateSettings).toHaveBeenCalledWith({ enabled:false });
  });
});

describe('selectable CBT history range', () => {
  it('accepts only 5, 10, and 15 seasons and persists the normalized value', () => {
    expect(CBT_HISTORY_OPTIONS).toEqual([5, 10, 15]);
    expect(normalizeCbtHistoryRange(10)).toBe(10);
    expect(normalizeCbtHistoryRange(7)).toBe(5);
    expect(saveCbtHistoryRange(15)).toBe(15);
    expect(readCbtHistoryRange()).toBe(15);
  });

  it('builds an inclusive current-season window in chronological order', () => {
    expect(buildCbtHistorySeasons(5, 2026)).toEqual([2022, 2023, 2024, 2025, 2026]);
    expect(buildCbtHistorySeasons(10, 2026)).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(buildCbtHistorySeasons(15, 2026)).toHaveLength(15);
    expect(buildCbtHistorySeasons(15, 2026).at(-1)).toBe(2026);
  });
});
