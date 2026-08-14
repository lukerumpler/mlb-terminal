import { describe, expect, it } from 'vitest';
import { sortPlayerNotes } from '../client/src/pages/playerNotes.js';

describe('player note sorting', () => {
  const notes = [
    { id: 'a', category: 'Scouting', createdAt: 100, text: 'A' },
    { id: 'b', category: 'Medical', createdAt: 300, text: 'B' },
    { id: 'c', category: 'Development', createdAt: 200, text: 'C' },
  ];

  it('sorts newest and oldest observations by timestamp', () => {
    expect(sortPlayerNotes(notes, 'date-desc').map(note => note.id)).toEqual(['b', 'c', 'a']);
    expect(sortPlayerNotes(notes, 'date-asc').map(note => note.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts observations by category and uses recency as a stable tie-breaker', () => {
    expect(sortPlayerNotes(notes, 'category').map(note => note.category)).toEqual(['Development', 'Medical', 'Scouting']);
  });
});
