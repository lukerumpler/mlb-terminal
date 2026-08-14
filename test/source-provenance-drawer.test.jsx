import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SourceProvenanceDrawer, { ProvenanceButton } from '../client/src/components/SourceProvenanceDrawer.jsx';

describe('SourceProvenanceDrawer', () => {
  it('renders provider, retrieval, sample size, and transformation details', () => {
    render(<SourceProvenanceDrawer open onClose={() => {}} context="Los Angeles Dodgers · 2026 season" entries={[{
      label:'Batted ball and exit velocity', available:true, provider:'Baseball Savant', retrieved:'Aug 14, 2026, 6:40 AM', sampleSize:'184 batted balls', method:'Verified roster-player Statcast rows aggregated into team bins.',
    }]} />);
    expect(screen.getByRole('dialog', { name:'Source provenance' })).toBeInTheDocument();
    expect(screen.getByText('Baseball Savant')).toBeInTheDocument();
    expect(screen.getByText('184 batted balls')).toBeInTheDocument();
    expect(screen.getByText(/aggregated into team bins/)).toBeInTheDocument();
  });

  it('traps Tab focus and returns focus to the initiating trigger on close', () => {
    const triggerRef = React.createRef();
    const { rerender } = render(<>
      <ProvenanceButton ref={triggerRef} onClick={() => {}} label="SOURCES" />
      <SourceProvenanceDrawer open onClose={() => {}} returnFocusRef={triggerRef} entries={[{ label:'Identity', available:true, provider:'MLB Stats API', method:'Direct record.' }]} />
    </>);
    const close = within(screen.getAllByRole('dialog', { name:'Source provenance' }).at(-1)).getByRole('button', { name:'Close source provenance' });
    close.focus();
    fireEvent.keyDown(document, { key:'Tab' });
    expect(document.activeElement).toBe(close);
    rerender(<>
      <ProvenanceButton ref={triggerRef} onClick={() => {}} label="SOURCES" />
      <SourceProvenanceDrawer open={false} onClose={() => {}} returnFocusRef={triggerRef} entries={[]} />
    </>);
    expect(document.activeElement).toBe(triggerRef.current);
  });

  it('marks missing metadata unavailable and closes on Escape', () => {
    const onClose = vi.fn();
    render(<SourceProvenanceDrawer open onClose={onClose} entries={[{
      label:'Contract and service time', available:false, provider:'Spotrac', retrieved:null, sampleSize:null, method:'Direct contract/service metadata; unavailable dollar fields are not estimated.',
    }]} />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('Not supplied by source').length).toBeGreaterThan(0);
    fireEvent.keyDown(document, { key:'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
