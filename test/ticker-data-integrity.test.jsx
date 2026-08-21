import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getMlbScheduleDate } from '../client/src/api/mlb.js';
import { deriveTickerStatus, formatTickerGame, getTickerRefreshDelay, TICKER_SCROLL_DURATION_SECONDS } from '../client/src/lib/ticker.js';
import LiveScoreTicker from '../client/src/components/LiveScoreTicker.jsx';

describe('official MLB ticker integrity', () => {
  it('uses MLB’s Eastern Time baseball day instead of advancing to the UTC next-day schedule for western users', () => {
    expect(getMlbScheduleDate(new Date('2026-08-21T02:53:00Z'))).toBe('2026-08-20');
    expect(getMlbScheduleDate(new Date('2026-08-21T04:01:00Z'))).toBe('2026-08-21');
  });

  it('labels live, final, and scheduled official games accurately without inventing scores', () => {
    const live = { status:'In Progress', statusCode:'I', inning:9, inningHalf:'top', away:{ abbr:'LAA', runs:18 }, home:{ abbr:'HOU', runs:2 } };
    const final = { status:'Final', statusCode:'F', away:{ abbr:'STL', runs:10 }, home:{ abbr:'CIN', runs:9 } };
    const scheduled = { status:'Scheduled', statusCode:'S', time:'2026-08-21T23:10:00Z', away:{ abbr:'ATL', runs:null }, home:{ abbr:'MIL', runs:null } };

    expect(deriveTickerStatus([scheduled, final])).toBe('scheduled');
    expect(deriveTickerStatus([final])).toBe('final');
    expect(deriveTickerStatus([final, live])).toBe('live');
    expect(formatTickerGame(live)).toBe('LAA 18 — HOU 2 · ▲9');
    expect(formatTickerGame(final)).toBe('STL 10 — CIN 9 · Final');
    expect(formatTickerGame(scheduled, { locale:'en-US', timeZone:'America/New_York' })).toBe('ATL @ MIL · 7:10 PM');
  });

  it('renders the official source alongside a scheduled ticker instead of presenting future games as live', () => {
    render(<LiveScoreTicker status="scheduled" ticks={['ATL @ MIL · 7:10 PM']} updatedAt={new Date('2026-08-20T22:53:00Z')} />);

    expect(screen.getByLabelText(/schedule ticker · MLB Stats API/i)).toHaveTextContent('SCHEDULE · MLB');
    expect(screen.getAllByText('ATL @ MIL · 7:10 PM')).toHaveLength(2);
    expect(screen.queryByText('LIVE · MLB')).not.toBeInTheDocument();
    expect(document.querySelector('.skip-ticker-scroll')).toHaveStyle(`animation: scrollx ${TICKER_SCROLL_DURATION_SECONDS}s linear infinite`);
  });

  it('uses adaptive, low-data-aware official ticker refresh intervals instead of a fixed rapid poll', () => {
    expect(getTickerRefreshDelay('live')).toBe(120_000);
    expect(getTickerRefreshDelay('scheduled')).toBe(300_000);
    expect(getTickerRefreshDelay('final')).toBe(900_000);
    expect(getTickerRefreshDelay('live', { lowDataMode: true })).toBe(180_000);
    expect(getTickerRefreshDelay('scheduled', { lowDataMode: true })).toBe(600_000);
  });
});
