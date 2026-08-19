import { describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { TeamOverviewSkeleton } from '../client/src/components/PageSkeletons.jsx';

describe('Team Overview loading skeleton', () => {
  it('announces verified-data loading without presenting placeholder values as data', () => {
    const { container } = render(<TeamOverviewSkeleton />);
    const status = screen.getByRole('status', { name: 'Loading team overview' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent(/Loading verified team data/i);
    expect(status).toHaveTextContent(/Missing provider values will remain labeled as unavailable/i);
    expect(container.querySelector('.skip-overview-skeleton-workspace')).toBeInTheDocument();
    expect(container.querySelector('.skip-overview-skeleton-briefing')).toBeInTheDocument();
  });

  it('includes scoped shimmer and reduced-motion safeguards for desktop and mobile layouts', () => {
    const css = readFileSync('/home/ubuntu/skip-baseball/client/src/index.css', 'utf8');
    expect(css).toContain('@keyframes skip-overview-skeleton-shimmer');
    expect(css).toContain('.skip-overview-skeleton-workspace > div { grid-template-columns:repeat(2,minmax(0,1fr)); }');
    expect(css).toContain('.skip-overview-skeleton-loading-mark { animation:none !important; }');
  });
});
