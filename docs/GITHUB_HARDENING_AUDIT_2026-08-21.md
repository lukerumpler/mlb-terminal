# GitHub Hardening Audit — 2026-08-21

## Verified baseline

The authenticated GitHub browser shows an existing classic branch-protection rule for `main`. The rule requires pull requests, one approval, dismissal of stale approvals, successful status checks, an up-to-date branch before merging, and resolved conversations. The required checks are **Migration drift**, **Tests, types, and build**, **API deployment smoke test**, and **Padres Operations regression**. This already meets the requested “all checks must pass before merging” policy, including the new Padres Operations verification.

The repository already contains `.github/workflows/padres-operations-regression.yml`. It runs on pull requests, pushes to `main`, and manual dispatch. Its `Padres Operations regression` job installs the lockfile dependencies and runs `test/team-schedule-snapshot.test.js`, `test/petco-game-context.test.js`, and `test/padres-operations-context.test.jsx` with a single Vitest worker.

The GitHub Actions history confirms that this workflow has completed successfully on current `main` and on recent pull requests. The most recent observed run completed successfully in 35 seconds on `main`, and the workflow has recorded 13 successful runs.

The current GitHub branch list has no branches matching `fix/vercel-*`; the requested stale Vercel branches were already removed. No branch deletion is needed or performed in this release.

The local release gate completed successfully: 147 test files passed, 658 tests passed, one environment-only suite was skipped, lint passed, TypeScript passed, the production build passed, and the production dependency audit reported no known vulnerabilities.

The focused request-boundary audit also passed: six cache, team-data, schedule snapshot, Petco context, Padres Operations, and player-race regression files ran 74 tests successfully. The verified stale-cache fallback remained intact for a transient MLB 504 response, so no new uncontrolled provider refresh or duplicate-request path was introduced.
