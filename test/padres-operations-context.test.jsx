import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';
import { __resetMlbClientStateForTests, __resetTeamScheduleSnapshotCacheForTests } from '../client/src/api/mlb.js';

const response = json => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => json, text: async () => JSON.stringify(json) });

describe('Padres Operations context', () => {
  beforeEach(() => {
    cleanup();
    __resetMlbClientStateForTests();
    __resetTeamScheduleSnapshotCacheForTests();
    vi.stubGlobal('fetch', vi.fn(async url => {
      const value = String(url);
      if (value.includes('path=%2Fteams%2F135')) return response({ teams: [{ venue: { id: 2680, name: 'Petco Park' } }] });
      if (value.includes('path=%2Fvenues%2F2680')) return response({ venues: [{ id: 2680, name: 'Petco Park', location: { city: 'San Diego', stateAbbrev: 'CA', latitude: 32.707, longitude: -117.157 }, fieldInfo: { capacity: 40209, turfType: 'Grass', roofType: 'Open', leftLine: 336, leftCenter: 357, center: 396, rightCenter: 411, rightLine: 322 } }] });
      if (value.includes('path=%2Fschedule') && value.includes('teamId=135')) return response({ dates: [{ games: [{ gamePk: 987654, gameDate: '2026-08-20T01:00:00Z', dayNight: 'night', status: { abstractGameState: 'Final' }, teams: { home: { team: { id: 135, name: 'San Diego Padres', abbreviation: 'SD' }, score: 5, isWinner: true }, away: { team: { id: 100, name: 'Opponent', abbreviation: 'OPP' }, score: 3, isWinner: false } } }] }] });
      if (value.includes('path=%2Fschedule')) return response({ dates: [{ games: [{ gamePk: 987655, gameDate: '2026-08-21T23:40:00Z', status: { detailedState: 'Scheduled', statusCode: 'S' }, teams: { home: { team: { id: 135, name: 'San Diego Padres', abbreviation: 'SD' } }, away: { team: { id: 100, name: 'Opponent', abbreviation: 'OPP' } } }, weather: { condition: 'Clear', temp: 72, wind: '5 mph' }, venue: { name: 'Petco Park' } }] }] });
      return response({});
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    __resetTeamScheduleSnapshotCacheForTests();
  });

  it('shows verified Petco Park context and a sourced completed-game result after Operations is opened', async () => {
    render(<OverviewPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Operations' }));

    await waitFor(() => expect(screen.getByText(/Petco Park context/)).toBeInTheDocument());
    expect(screen.getByText('Capacity')).toBeInTheDocument();
    expect(screen.getByText('40,209')).toBeInTheDocument();
    expect(screen.getByText('San Diego Padres Recent Results')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1-game winning streak')).toBeInTheDocument());
    expect(screen.getByText('vs OPP')).toBeInTheDocument();
    expect(screen.getByText('5–3')).toBeInTheDocument();
    expect(screen.getByText('Petco Park Game Context')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Clear')).toBeInTheDocument());
    expect(screen.getByText('72°')).toBeInTheDocument();
    expect(screen.getByText('5 mph')).toBeInTheDocument();
    expect(screen.getByText(/shares its single cached schedule request with Splits Dashboard/)).toBeInTheDocument();
  });
});
