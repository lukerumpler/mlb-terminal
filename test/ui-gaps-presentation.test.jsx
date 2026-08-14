import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MetricInfo from '../client/src/components/MetricInfo.jsx';

describe('UI gap presentation primitives', () => {
  it('exposes a definition for common baseball metrics without relying on hover', () => {
    render(<MetricInfo label="xwOBA" />);
    const button = screen.getByRole('button', { name: 'Definition for xwOBA' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Expected weighted on-base average');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});
