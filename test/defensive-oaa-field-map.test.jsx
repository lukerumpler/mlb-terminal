import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DefensiveOaaFieldMap, { buildPositionOaaMapRows } from '../client/src/components/DefensiveOaaFieldMap.jsx';

describe('DefensiveOaaFieldMap', () => {
  it('aggregates only returned player OAA rows by the documented field position', () => {
    expect(buildPositionOaaMapRows([
      { position:'SS', oaa:2.4 },
      { position:'shortstop', oaa:1.1 },
      { position:'LF', oaa:-0.5 },
      { position:'DH', oaa:99 },
    ]).filter(row => row.oaa != null)).toEqual([
      expect.objectContaining({ key:'SS', oaa:3.5, players:2 }),
      expect.objectContaining({ key:'LF', oaa:-0.5, players:1 }),
    ]);
  });

  it('renders an explicit unavailable state rather than inferring position values', () => {
    render(<DefensiveOaaFieldMap playerRows={[]} status="unavailable" />);
    expect(screen.getByRole('status')).toHaveTextContent('Per-position OAA is unavailable');
  });

  it('renders only the returned position values with an OAA-specific map label', () => {
    render(<DefensiveOaaFieldMap playerRows={[{ position:'CF', oaa:4.2 }]} status="verified" />);
    expect(screen.getByRole('img', { name:/defensive value by position map/i })).toBeInTheDocument();
    expect(screen.getByText(/Defensive value by position \(OAA\)/)).toBeInTheDocument();
    expect(screen.getByLabelText('Per-position Outs Above Average values')).toHaveTextContent('CF+4.2');
  });
});
