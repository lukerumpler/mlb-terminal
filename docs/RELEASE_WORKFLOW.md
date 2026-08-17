# Preferred Release Workflow

This project uses a **release gate**. The gate is a short set of checks run before a managed project checkpoint. It compares the linked GitHub `main` branch with the last reviewed GitHub commit, confirms that core public data providers return the response shapes the application expects, and runs the existing code-quality checks. It does **not** publish anything by itself.

> **Important:** A provider can be temporarily blocked, rate-limited, or served from cache. The gate reports those conditions honestly. MLB and Baseball Savant are core checks; a failure of either stops the gate. News and FanGraphs can be marked **degraded** without blocking release when the application’s documented fallback state remains valid.

## Before Every Release

Start the local application in one terminal. In a second terminal, run the release commands shown below. The provider check needs the local application running because it verifies the same API routes the browser uses.

| Step                                           | Command                                                 | What a passing result means                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1. Start the application                       | `pnpm dev`                                              | The local API routes are available on port 3000.                                                              |
| 2. Compare sources                             | `pnpm release:compare`                                  | GitHub `main` still matches the reviewed reference in `release/release-gate-baseline.json`.                   |
| 3. Probe provider health                       | `pnpm release:providers`                                | MLB and Savant returned valid JSON contracts; optional providers are reported with their actual health state. |
| 4. Run the complete gate                       | `pnpm release:gate`                                     | Source comparison, provider checks, TypeScript, linting, tests, and production build all passed.              |
| 5. Publish through the managed project release | Create a managed checkpoint only after the gate passes. | The shared project history and production release stay synchronized.                                          |

## When the Source Comparison Requires Review

If `pnpm release:compare` reports `review-required`, GitHub `main` changed after the last accepted review. Do not force-push, reset, or copy files wholesale. Instead, synchronize the shared project through the managed project workflow, compare the changed GitHub paths with the current project, run the full validation suite, and update both `GITHUB_SYNC_AUDIT.md` and `release/release-gate-baseline.json` only after the review is complete.

## When Provider Health Fails

If a core provider fails, stop the release and inspect the response report. A cached or stale response is still a valid response when the script reports a successful JSON contract. A blocked FanGraphs or empty news fallback is recorded as **degraded** rather than hidden; it is safe to release only when the relevant user interface already shows the existing transparent unavailable or coverage-gap state.

## Configuration

The comparison baseline lives in `release/release-gate-baseline.json`. It records the GitHub repository, the last reviewed GitHub commit, and the audit file that explains why it is safe. The provider command defaults to `http://127.0.0.1:3000`; set `SKIP_RELEASE_BASE_URL` only when checking a different controlled environment.

## References

[1]: https://github.com/lukerumpler/mlb-terminal/commit/ffb803e6c417897dfad0dbfa95d898468edab4f7 "Reviewed GitHub reference commit"
