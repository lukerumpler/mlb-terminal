# Fallback and Telemetry E2E Verification — 2026-08-17

## Scope

This verification exercised the local MLB Terminal application as an integrated system. It covered the all-team standings fallback endpoint, all 30 individual team endpoints, server-side direct Baseball-Reference ID telemetry, and desktop/mobile browser flows with a persisted identity-registry entry.

## API verification

The E2E verifier first requested the all-team intelligence endpoint, then checked every returned team through its existing individual endpoint. Every individual response was compared with the all-team result for both Team WAR proxy and playoff estimate.

| Acceptance criterion | Result |
| --- | --- |
| `mode=all` response | HTTP 200 |
| Teams in official standings | 30 |
| Calculated team records | 30 |
| Team WAR proxy values | 30 |
| Playoff estimates | 30, all within 0–100% |
| Unavailable teams | 0 |
| Individual team endpoint checks | 30 of 30 returned HTTP 200 and matched the all-team result |
| Cache behavior | All individual reads used the same-day `DAILY` snapshot |

The verifier encountered the configured rate limiter once while making the 30 individual reads. It respected the server’s advertised `Retry-After: 10` response, retried after the window, and then completed successfully. This validates the endpoint contract without bypassing request protections.

## Telemetry verification

The verifier invoked the resolver with a persisted-style direct Baseball-Reference ID request and compared `/api/player-identity?mode=metrics` before and after the request. The direct-ID request count, browser-registry reuse count, and resolver request count each increased by one.

The external Baseball-Reference canonical-page request was unavailable in this environment, so the resolver returned its safe HTTP 200 contract with `found: false` and `invalidateBaseballReferenceId: true`. No name search occurred. This is the intended behavior: a provider-blocked direct ID is invalidated rather than used to attach data to a potentially stale or incorrect player identity.

## Browser verification

Desktop and mobile browser runs started with a persisted, exact-name registry mapping for Shohei Ohtani. Both flows rendered the user-visible calculated fallback and loaded the player profile. The browser-local telemetry counters confirmed one resolver request, one registry reuse, one direct-ID request, zero name searches, and zero browser data-request failures on each viewport.

| Viewport | Fallback visible | Registry reuse | Direct-ID request | Name search | Data-request failures |
| --- | --- | --- | --- | --- | --- |
| Desktop | Yes | 1 | 1 | 0 | 0 |
| Mobile | Yes | 1 | 1 | 0 | 0 |

## Validation

The reproducible scripts are:

```bash
node scripts/e2e-fallback-telemetry-api.mjs
node scripts/e2e-fallback-telemetry-ui.mjs
```

The final focused regression suite passed **32 tests across five files**. TypeScript validation and the production build also passed.

> This verification confirms the runtime contracts of the all-team fallback and telemetry flows. It does not convert the standings-based values into FanGraphs metrics: the user interface continues to mark them as **Calculated**, and a Baseball-Reference provider failure continues to produce an explicit safe state.
