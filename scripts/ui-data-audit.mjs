import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.SKIP_AUDIT_BASE_URL || 'http://localhost:3000';
const outputDir = path.resolve('audit-results/ui');
await fs.mkdir(outputDir, { recursive:true });

const states = [
  { id:'overview', tab:'Overview', markers:['Team Command Center', 'Source:', 'Dodgers'] },
  { id:'players', tab:'Players', markers:['Quick access', 'What\'s in a SKIP report'] },
  { id:'prospects', tab:'Prospects', markers:['Prospect', 'Source'] },
  { id:'draft', tab:'Draft', markers:['Draft', 'Source'] },
  { id:'league', tab:'League', markers:['League', 'Standings'] },
  { id:'intelligence', tab:'Intelligence', markers:['Intelligence', 'Source'] },
  { id:'feed', tab:'Intel Feed', markers:['Feed', 'Source'] },
];

function assessText(text, markers) {
  const lower = text.toLowerCase();
  const hasErrorBoundary = /something went wrong|unexpected application error|error boundary/i.test(text);
  const loadedMarkers = markers.filter(marker => lower.includes(marker.toLowerCase()));
  const honestState = /unavailable|coverage gap|loading|provider blocked|not retrieved|no verified/i.test(text);
  return {
    characters:text.length,
    loadedMarkers,
    hasErrorBoundary,
    honestState,
    status:hasErrorBoundary ? 'error-boundary' : loadedMarkers.length ? 'rendered' : 'marker-missing',
  };
}

async function waitForStable(page) {
  await page.waitForTimeout(900);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
}

async function activateTab(page, name) {
  const button = page.locator(`button[title="${name}"]`).first();
  if (await button.count() !== 1) throw new Error(`Missing navigation tab: ${name}`);
  await button.evaluate(element => element.click());
}

async function auditViewport(label, viewport) {
  const browser = await chromium.launch({
    headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium',
    args:['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport });
  const results = [];
  const requestFailures = [];
  page.on('requestfailed', request => requestFailures.push({ url:request.url(), failure:request.failure()?.errorText || 'failed' }));
  await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:30_000 });
  await waitForStable(page);

  for (const state of states) {
    if (state.id !== 'overview') {
      await activateTab(page, state.tab);
      await waitForStable(page);
    }
    const text = await page.locator('#root').innerText();
    const assessment = assessText(text, state.markers);
    const screenshot = path.join(outputDir, `${label}-${state.id}.png`);
    await page.screenshot({ path:screenshot, fullPage:true });
    results.push({ viewport:label, page:state.id, ...assessment, screenshot });
  }

  // Player profile is deliberately separate because its optional data feeds can
  // take longer than a workspace shell. The audit records either the loaded
  // profile or a clearly visible loading/error state, never an inferred result.
  await activateTab(page, 'Players');
  await waitForStable(page);
  const ohtani = page.getByRole('button', { name:/Shohei Ohtani/i }).first();
  if (await ohtani.count()) {
    await ohtani.evaluate(element => element.click());
    await page.waitForTimeout(24_000);
  }
  const playerText = await page.locator('#root').innerText();
  const playerAssessment = assessText(playerText, ['Shohei Ohtani', 'Data Confidence', 'Season Stats']);
  const playerScreenshot = path.join(outputDir, `${label}-player-profile.png`);
  await page.screenshot({ path:playerScreenshot, fullPage:true });
  results.push({ viewport:label, page:'player-profile', ...playerAssessment, screenshot:playerScreenshot });

  await browser.close();
  return { results, requestFailures };
}

const desktop = await auditViewport('desktop', { width:1440, height:1000 });
const mobile = await auditViewport('mobile', { width:390, height:844 });
const report = {
  auditedAt:new Date().toISOString(),
  baseUrl,
  results:[...desktop.results, ...mobile.results],
  requestFailures:[...desktop.requestFailures, ...mobile.requestFailures],
};
await fs.writeFile(path.join(outputDir, 'ui-data-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
const rows = report.results.map(item => `| ${item.viewport} | ${item.page} | ${item.status} | ${item.loadedMarkers.join(', ') || '—'} | ${item.honestState ? 'yes' : 'no'} | ${item.hasErrorBoundary ? 'yes' : 'no'} |`);
const markdown = [
  '# UI Data Audit',
  '',
  `Audited at: ${report.auditedAt}`,
  '',
  '| Viewport | Workspace | Render state | Observed data markers | Honest loading/unavailable state | Error boundary |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows,
  '',
  `Request failures recorded by the browser: ${report.requestFailures.length}.`,
  '',
].join('\n');
await fs.writeFile(path.join(outputDir, 'ui-data-audit.md'), `${markdown}\n`);
console.table(report.results.map(({ viewport, page, status, loadedMarkers, honestState, hasErrorBoundary }) => ({ viewport, page, status, markers:loadedMarkers.join(', '), honestState, hasErrorBoundary })));
console.log(`Browser request failures: ${report.requestFailures.length}`);
