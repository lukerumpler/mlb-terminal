import { describe, it, expect, afterEach } from 'vitest';
import { mlb } from '../client/src/api/mlb.js';

// Regression coverage for a bug found in a debug pass: mlb() called
// res.json() unconditionally after an ok status check, so a 200 response
// with a non-JSON body threw a raw SyntaxError straight out of JSON
// parsing. That error's own .message is shown to the user verbatim
// (PlayersPage.jsx: `Could not load ${name}. ${err.message}`), so it
// surfaced as literal parser noise ("Unexpected token '/', ... is not
// valid JSON") instead of a readable message — not the honest "couldn't
// load" fallback the rest of the app is supposed to show everywhere else.

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function mockNonJsonResponse() {
  global.fetch = () => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.reject(new SyntaxError("Unexpected token '/', \"/**\" is not valid JSON")),
    text: () => Promise.resolve('/** raw source, not JSON **/'),
  });
}

describe('mlb() — non-JSON response handling', () => {
  it('throws a clean, readable Error instead of a raw JSON SyntaxError', async () => {
    mockNonJsonResponse();
    await expect(mlb('/test/non-json-path', {}, { cache: false })).rejects.toThrow();
    try {
      await mlb('/test/non-json-path-2', {}, { cache: false });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).not.toMatch(/Unexpected token/);
      expect(err.message).not.toBeInstanceOf(SyntaxError);
      expect(err.message).toMatch(/unreadable response/i);
    }
  });
});
