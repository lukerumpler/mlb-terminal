import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CacheHealthDashboard from '../client/src/components/CacheHealthDashboard.jsx';

const health = {
  day: '2026-08-18',
  providers: {
    contract: { 'durable-hit': 4, 'stale-hit': 1, 'upstream-miss': 2 },
  },
};

describe('CacheHealthDashboard', () => {
  it('keeps the last verified telemetry visible while a reread is in progress', () => {
    render(<CacheHealthDashboard health={health} status="refreshing" updatedAt={Date.UTC(2026, 7, 18, 12, 0)} onRefresh={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent(/showing last verified snapshot/i);
    expect(screen.getByText('Contract')).toBeInTheDocument();
    expect(screen.getByText('4 durable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh cache-health telemetry/i })).toBeDisabled();
    expect(screen.getByText('REFRESHING…')).toBeInTheDocument();
  });
});
