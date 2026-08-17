# Production Promotion and Runtime Verification — 2026-08-17

## Executive status

The validated release was promoted from GitHub main to Vercel production as an immutable fast-forward. The initial production deployment was created directly from commit `f7f45a52b8fc060662b099fd9e99c4e21c52deac` and passed public health, live-data, calculated-intelligence, and published browser smoke checks. A follow-up, narrowly scoped serverless-adapter mitigation is now prepared to prevent absolute-form request targets from reaching Express's legacy `parseurl` dependency, the most probable application-controlled trigger for the Node 24 `DEP0169` warning.

| Item | Status | Evidence |
| --- | --- | --- |
| GitHub main promotion | Complete | Fast-forward only from `ffb803e` to `f7f45a5`; no force push or history rewrite. |
| GitHub-backed production deployment | Complete | `dpl_6hTadWPadH5ZyVbguhvK8Mai1Tii` reached `READY` from `f7f45a5` on `main`. |
| Public production health | Passing | `https://mlb-terminal.vercel.app/api/health` returned `{"ok":true,"service":"skip-baseball-api"}`. |
| Live MLB standings proxy | Passing | A fully specified `/api/mlb` standings request returned current 2026 regular-season data. |
| All-team calculated intelligence | Passing | Production response identified `MLB Stats API`, `calculated-from-verified-standings`, and explicit approximation methodology. |
| Published browser smoke test | Passing | `2/2` tests passed against the protected public production alias. |
| Production package audit | Passing | `pnpm audit --prod --json` completed with 0 critical, high, moderate, low, and info advisories across 502 production dependencies. |
| Production environment variables | Blocking configuration gap | Vercel project settings show no project environment variables. |
| `DEP0169` runtime warning | Resolved | Vercel built the final production deployment on Node 22; a fresh Savant request returned 200 without the prior deprecation warning. |

## Immutable GitHub-to-production promotion

Before promotion, local `HEAD` was confirmed to be a descendant of GitHub main at `ffb803e6c417897dfad0dbfa95d898468edab4f7`. The exact local release head `f7f45a52b8fc060662b099fd9e99c4e21c52deac` was then pushed using a standard fast-forward update. Vercel automatically created deployment `dpl_6hTadWPadH5ZyVbguhvK8Mai1Tii` with target `production`, state `READY`, branch `main`, and matching GitHub commit SHA.

> The release path preserved Git history. No force push, deployment of uncommitted code, or manual production-payload substitution was used.

## Production behavior verification

The rendered SKIP application loaded successfully through the protected production deployment and the canonical public alias. The application shell, navigation, 30-team selector, current team aggregates, roster-leader content, ballpark metadata, and schedule rendered. Provider-backed FanGraphs values that were unavailable at initial load remained labeled as unavailable or loading rather than being represented as verified data.

| Verification target | Result | Notes |
| --- | --- | --- |
| `/api/health` | Pass | Healthy API response on both immutable deployment URL and public alias. |
| `/api/mlb` request guard | Pass | Bare proxy request rejected the missing `path` parameter as designed. |
| `/api/mlb?path=/standings...` | Pass | Returned 2026 AL/NL standings and source timestamps. |
| `/api/player-identity?mode=metrics` | Pass | Returned process-scoped aggregate counters and latency summaries only; no names, provider IDs, or canonical URLs were retained. |
| `/api/intelligence-calculations?season=2026&mode=all` | Pass | Returned calculated team results with explicit non-FanGraphs WAR-proxy and playoff-approximation disclosures. |
| Published Overview browser E2E | Pass | Both tests passed against `mlb-terminal.vercel.app`. |

## Production environment-variable audit

The authenticated Vercel **Environment Variables** settings page reported **No Environment Variables Added** for the project. No values were viewed, changed, or created during this audit.

| Variable | Observed state | Operational effect |
| --- | --- | --- |
| `OAUTH_SERVER_URL` | Absent | Runtime logs report an empty OAuth base URL and an initialization error. Authentication-dependent flows are not production-configured. |
| `ALLOWED_ORIGIN` | Absent | In production, cross-origin API access receives no CORS allowlist; same-origin requests continue to work. |
| `DATABASE_URL` | Absent | Database-backed features cannot be considered production-configured without a valid connection setting. |
| `JWT_SECRET` | Absent | Session signing cannot be considered production-configured. |
| `OWNER_OPEN_ID` | Absent | Owner-specific identity behavior cannot be considered production-configured. |

The public health, MLB proxy, calculated fallback, and published browser smoke paths remain operational because they do not require these absent settings. The configuration gap remains a release risk for authenticated and database-backed capabilities.

## `DEP0169` deprecation investigation and mitigation

Production runtime logs show the Node 24 warning `DEP0169` during serverless requests, alongside the missing OAuth warning. Local tracing with `NODE_OPTIONS=--trace-deprecation` exercised the compiled serverless bundle and a valid Baseball Savant request without producing `DEP0169`. Application-source inspection found no direct `url.parse()` invocation. The installed production graph includes Express 5.2.1 and its `parseurl` 1.3.3 dependency, which imports Node's legacy URL parser for non-relative request targets.

A defensive serverless-adapter normalization has been added in `server/vercel.ts`. When an upstream runtime supplies an absolute request target such as `https://host/api/health?x=1`, the adapter now safely converts it to `/api/health?x=1` with the WHATWG `URL` API before Express receives it. Standard relative request targets are unchanged; malformed values retain Express's normal error behavior. The adapter regression suite now verifies both cases, and an absolute-form local HTTP request returned the expected health response.

> The adapter normalization is retained as a safe compatibility guard. It did not eliminate the Savant-path warning in Vercel Node 24. Node 24 documentation and current upstream issue reports establish that the warning can be emitted by legacy URL API usage in runtime or dependency contexts, including calls from `node_modules`.[1] [2] The Vercel project has therefore been pinned through `package.json` to its already validated Node 22 major line, which Vercel documents as the project-level runtime override.[3]

## Validation after the mitigation

| Check | Result |
| --- | --- |
| Focused serverless adapter tests | 6 passed |
| TypeScript validation | Passed |
| Formatting gate | Passed |
| Production build | Passed |
| Full regression suite | 91 files passed, 1 explicitly skipped; 442 tests passed, 2 explicitly skipped |
| Absolute-form local serverless request | `200` health response; no local deprecation trace |
| Production registry audit | Completed successfully with zero advisories |

## Remaining production action

The final production release is verified. The only outstanding deployment configuration work is to supply the required Vercel environment values before authentication- or database-dependent features can be treated as configured for public production use.

## Follow-up immutable mitigation deployment

The request-target normalization was committed as `f6096e27868be47fef3f5b30e16af4ab702af505` and pushed with a fast-forward update to GitHub main. Vercel created Git-backed production deployment `dpl_3KCxHpNgF46m7pzCTuNicwGHX3Po`, which reached `READY` and now owns the canonical production aliases. The public health route continued to return the expected healthy response after this deployment.

A fresh production Savant request returned HTTP 200 but still emitted `DEP0169`; the subsequent Vercel runtime-error aggregation recorded the warning on `/api/index` with the final occurrence on this deployment. The compiled `api/index.mjs` contains no `url.parse`, `url.resolve`, or `parseurl` callsite, and the same bundled code does not emit `DEP0169` when exercised locally on Node 22. The remaining behavior is therefore isolated to the Vercel Node 24 runtime/dependency combination rather than an application source call.

## Final Node 22 production deployment

The Node 22 runtime pin was committed as `9aeea29996ca681ffeec64df7beb789e2f79419b` and promoted to GitHub main by fast-forward. Vercel created Git-backed production deployment `dpl_83eDuiUoxiJrK5AM3nfotxoZpMLY`, state `READY`, target `production`, with the canonical aliases attached. Its build log states that Vercel skipped the prior Node 24 cache because the version changed to `22.x` and that the `package.json` engine override selected Node 22 over the project default. A fresh public Savant request returned HTTP 200; its runtime log contained the known missing-OAuth configuration message but no `DEP0169` warning. The final published browser smoke suite also passed 2/2 against `https://mlb-terminal.vercel.app`.

## References

[1]: https://nodejs.org/api/deprecations.html "Node.js deprecated APIs"
[2]: https://github.com/nodejs/node/issues/61724 "Node.js issue: DEP0169 warning under Node 24 and 25"
[3]: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions "Vercel Node.js runtime version configuration"
