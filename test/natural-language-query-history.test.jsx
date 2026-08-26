import { describe, expect, it } from 'vitest';
import { normalizeQueryHistory, upsertQueryHistory, HISTORY_LIMIT } from '../client/src/components/NaturalLanguageMlbQuery.jsx';

describe('AI query history', () => {
  it('deduplicates case-insensitively and keeps the newest question first', () => {
    const next = upsertQueryHistory([{ query:'Who leads OPS?', savedAt:1 }], ' who leads ops? ', 2);
    expect(next).toEqual([{ query:'who leads ops?', savedAt:2 }]);
  });

  it('bounds retained questions and ignores empty or malformed values', () => {
    const history = Array.from({ length:HISTORY_LIMIT + 2 }, (_, index) => ({ query:`Question ${index}`, savedAt:index }));
    expect(normalizeQueryHistory(history)).toHaveLength(HISTORY_LIMIT);
    expect(upsertQueryHistory(history, '   ')).toHaveLength(HISTORY_LIMIT);
    expect(normalizeQueryHistory([{ query:'' }, null, { query:'valid' }])).toEqual([{ query:'valid' }]);
  });
});
