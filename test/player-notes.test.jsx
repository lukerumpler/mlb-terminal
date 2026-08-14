import { describe, expect, it } from 'vitest';
import { applyImportedNotes, buildNotesExportPayload, normalizeImportedNotes, removeNoteTag, renameNoteTag, sortPlayerNotes } from '../client/src/pages/playerNotes.js';

describe('player note sorting and management', () => {
  const notes = [
    { id: 'a', category: 'Scouting', createdAt: 100, text: 'A', tags: ['contact', 'review'] },
    { id: 'b', category: 'Medical', createdAt: 300, text: 'B', tags: ['review'] },
    { id: 'c', category: 'Development', createdAt: 200, text: 'C', tags: [] },
  ];

  it('sorts newest and oldest observations by timestamp', () => {
    expect(sortPlayerNotes(notes, 'date-desc').map(note => note.id)).toEqual(['b', 'c', 'a']);
    expect(sortPlayerNotes(notes, 'date-asc').map(note => note.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts observations by category and uses recency as a stable tie-breaker', () => {
    expect(sortPlayerNotes(notes, 'category').map(note => note.category)).toEqual(['Development', 'Medical', 'Scouting']);
  });

  it('renames and removes tags across every observation without duplicating replacements', () => {
    expect(renameNoteTag(notes, 'review', 'follow-up').map(note => note.tags)).toEqual([['contact', 'follow-up'], ['follow-up'], []]);
    expect(removeNoteTag(notes, 'review').map(note => note.tags)).toEqual([['contact'], [], []]);
  });

  it('builds a portable export payload and applies merge or replace imports', () => {
    const payload = buildNotesExportPayload(7, 'Test Player', notes, '2026-08-14T00:00:00.000Z');
    expect(payload).toMatchObject({ schema: 'skip-player-notes/v1', playerId: 7, playerName: 'Test Player', exportedAt: '2026-08-14T00:00:00.000Z' });
    expect(payload.observations).toHaveLength(3);
    const incoming = [{ id: 'b', text: 'Updated B', category: 'Medical', tags: ['new'], createdAt: 400 }, { id: 'd', text: 'D', category: 'Scouting', tags: [], createdAt: 500 }];
    expect(applyImportedNotes(notes, incoming, 'merge').map(note => note.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(applyImportedNotes(notes, incoming, 'replace').map(note => note.id)).toEqual(['b', 'd']);
  });

  it('normalizes supported JSON imports and rejects malformed rows', () => {
    const imported = normalizeImportedNotes({ observations: [
      { id: 'x', text: 'Imported note', category: 'Medical', tags: ['#rehab', 'rehab'], createdAt: 123 },
      { id: 'bad', text: '' },
      { id: 'fallback', text: 'Unknown category', category: 'Unknown', tags: 'not-an-array' },
    ] });
    expect(imported).toHaveLength(2);
    expect(imported[0]).toMatchObject({ id: 'x', category: 'Medical', tags: ['rehab'], createdAt: 123 });
    expect(imported[1]).toMatchObject({ id: 'fallback', category: 'Scouting', tags: [] });
    expect(normalizeImportedNotes({ bad: true })).toEqual([]);
  });
});
