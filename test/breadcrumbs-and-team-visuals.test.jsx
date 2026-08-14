import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Breadcrumbs from '../client/src/components/Breadcrumbs.jsx';
import { getTeamAccent } from '../client/src/lib/teamVisuals.js';
import { C } from '../client/src/constants/colors.js';

describe('breadcrumbs', () => {
  it('renders a current page and clickable parent crumbs', () => {
    const onOverview = vi.fn();
    render(<Breadcrumbs items={[{ label:'Overview', onClick:onOverview }, { label:'Los Angeles Dodgers' }]} accent="#005A9C" />);
    expect(screen.getByRole('navigation', { name:'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Los Angeles Dodgers')).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name:'Overview' }));
    expect(onOverview).toHaveBeenCalledTimes(1);
  });
});

describe('team accent derivation', () => {
  it('uses the registered team color and falls back for unavailable identity', () => {
    expect(getTeamAccent({ color:'#005A9C' })).toBe('#005A9C');
    expect(getTeamAccent(null)).toBe(C.amber);
    expect(getTeamAccent({ color:'   ' }, '#123456')).toBe('#123456');
  });
});
