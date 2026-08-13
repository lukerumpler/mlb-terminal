import { describe, it, expect, afterEach } from 'vitest';
import { getScoreboard } from '../client/src/api/ncaa.js';

// Same regression class as test/mlb-defensive-json.test.jsx, found while
// auditing for the same bug pattern elsewhere: ncaa()'s ok-response path
// also called res.json() unconditionally, and OtherPages.jsx shows
// err.message to the user verbatim for this call path too
// (`setError(err.message || 'Could not load college baseball data.')`).

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function mockNonJsonResponse() {
  global.fetch = () => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.reject(new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON")),
  });
}

describe('ncaa() — non-JSON response handling', () => {
  it('throws a clean, readable Error instead of a raw JSON SyntaxError', async () => {
    mockNonJsonResponse();
    try {
      await getScoreboard('2026/05');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).not.toMatch(/Unexpected token/);
      expect(err.message).toMatch(/unreadable response/i);
    }
  });
});
