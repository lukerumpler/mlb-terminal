import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceNoteRecorder } from '../client/src/App.jsx';

// Regression test: VoiceNoteRecorder called trpc.storage.upload.useMutation()
// and trpc.voice.transcribe.useMutation() directly in its component body,
// but App.jsx never imported trpc. That's a plain ReferenceError thrown on
// every render, not caught by tsc (App.jsx is untyped .jsx) or by prettier
// (the only "lint" this repo runs). Nothing exercised this component before
// this test existed, which is exactly how it went unnoticed.
vi.mock('../client/src/lib/trpc', () => ({
  trpc: {
    storage: { upload: { useMutation: () => ({ mutateAsync: vi.fn() }) } },
    voice: { transcribe: { useMutation: () => ({ mutateAsync: vi.fn() }) } },
  },
}));

describe('VoiceNoteRecorder', () => {
  it('renders without throwing (trpc must be imported and both mutations must resolve)', () => {
    expect(() =>
      render(<VoiceNoteRecorder onTranscribed={() => {}} onCancel={() => {}} />)
    ).not.toThrow();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
