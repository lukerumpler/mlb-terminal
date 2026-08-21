import { describe, expect, it } from 'vitest';
import {
  buildPlayerHighlightSearches,
  buildPlayerVideoLinks,
  normalizeEmbeddableVideoUrl,
} from '../client/src/features/player-profile/media.js';
import { buildHandednessComparison } from '../client/src/features/player-profile/handedness.js';
import {
  BOXSCORE_PAGE_SIZE,
  filterAndSortBoxscoreGames,
} from '../client/src/features/player-profile/boxscore.js';

describe('Player Profile feature modules', () => {
  it('keeps media discovery source-safe and validates embeddable YouTube URLs locally', () => {
    const links = buildPlayerVideoLinks({ id: 660271, fullName: 'Shohei Ohtani', teamAbbreviation: 'LAD' });
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'MLB', href: expect.stringContaining('mlb.com/video/search') }),
      expect.objectContaining({ source: 'YouTube', href: expect.stringContaining('youtube.com/results') }),
    ]));
    expect(buildPlayerHighlightSearches({ fullName: 'Shohei Ohtani' })).toHaveLength(4);
    expect(normalizeEmbeddableVideoUrl('https://youtu.be/abc_1234567')).toMatchObject({ videoId: 'abc_1234567' });
    expect(normalizeEmbeddableVideoUrl('https://example.com/not-a-video')).toBeNull();
  });

  it('aggregates handedness rows without converting legitimate zeroes into unavailable values', () => {
    const [left] = buildHandednessComparison({ rows: [{ side: 'LHP', stat: { atBats: 10, hits: 2, homeRuns: 0, plateAppearances: 10, strikeOuts: 3 } }] });
    expect(left.stat).toMatchObject({ homeRuns: 0, hits: 2, atBats: 10, plateAppearances: 10 });
  });

  it('owns predictable boxscore filtering and page sizing outside the page container', () => {
    const rows = filterAndSortBoxscoreGames([
      { date: '2026-08-02', opponent: 'SF' },
      { date: '2026-08-01', opponent: 'SD' },
    ], { team: 'sd', sort: 'date-desc' });
    expect(rows).toEqual([{ date: '2026-08-01', opponent: 'SD' }]);
    expect(BOXSCORE_PAGE_SIZE).toBe(5);
  });
});
