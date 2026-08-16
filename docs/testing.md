# Testing & Validation Guide

SKIP maintains a rigorous test suite using Vitest and React Testing Library.

## Running Tests

```bash
pnpm test
```

All test files reside under `server/` and `test/`. When modifying provider proxies, backend routers, or UI metrics, ensure existing tests pass and add new unit/interaction regressions covering failure and recovery states.
