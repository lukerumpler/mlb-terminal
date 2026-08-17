export const LOCAL_PUBLISHED_OVERVIEW_FALLBACK = 'https://skipbasebal-mm6hz9ps.manus.space/?e2e=overview-default';

export function resolvePublishedOverviewTarget(environment = process.env) {
  const configured = String(environment.SKIP_LIVE_URL || '').trim();
  if (configured) return configured;
  if (String(environment.CI || '').toLowerCase() === 'true') {
    throw new Error('SKIP_LIVE_URL must identify the exact deployment candidate when published Overview E2E runs in CI.');
  }
  return LOCAL_PUBLISHED_OVERVIEW_FALLBACK;
}
