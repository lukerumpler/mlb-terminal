import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Panel, StatStrip } from '../client/src/components/atoms.jsx';

describe('shared analytic-card accessibility', () => {
  it('exposes labeled Panel and StatStrip regions with individually named metrics', () => {
    render(
      <>
        <Panel title="Provider health" badge="Verified">Current source status</Panel>
        <StatStrip
          label="Team command metrics"
          items={[{ val: '0.765', lbl: 'OPS', sub: 'Offense' }, { val: 163, lbl: 'Home Runs', sub: 'Power' }]}
        />
      </>
    );

    expect(screen.getByRole('region', { name: 'Provider health' })).toHaveTextContent('Current source status');
    expect(screen.getByRole('region', { name: 'Team command metrics' })).toBeInTheDocument();
    expect(screen.getByLabelText('OPS: 0.765')).toHaveTextContent('Offense');
    expect(screen.getByLabelText('Home Runs: 163')).toHaveTextContent('Power');
  });
});
