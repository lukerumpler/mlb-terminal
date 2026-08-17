import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.SKIP_AUDIT_BASE_URL || 'http://localhost:3000';
const outputDir = path.resolve('audit-results/ui');
await fs.mkdir(outputDir, { recursive:true });
const browser = await chromium.launch({
  headless:true,
  executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium',
  args:['--no-sandbox'],
});
const page = await browser.newPage({ viewport:{ width:390, height:844 } });
const requestFailures = [];
page.on('requestfailed', request => requestFailures.push({ url:request.url(), failure:request.failure()?.errorText || 'failed' }));
await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:30_000 });
await page.locator('button[title="Players"]').evaluate(element => element.click());
await page.waitForTimeout(750);
const ohtani = page.getByRole('button', { name:/Shohei Ohtani/i }).first();
if (!await ohtani.count()) throw new Error('Shohei Ohtani quick-access button was not available');
const startedAt = Date.now();
await ohtani.evaluate(element => element.click());
let outcome = 'timeout';
try {
  await page.waitForFunction(() => {
    const text = document.body.innerText || '';
    return text.includes('DATA CONFIDENCE') && text.includes('Performance Summary') && !text.includes('Loading profile, season stats, career splits, and Statcast context…');
  }, undefined, { timeout:15_000 });
  outcome = 'loaded';
} catch { /* audit records the deadline rather than failing silently */ }
const durationMs = Date.now() - startedAt;
const text = await page.locator('#root').innerText();
const screenshot = path.join(outputDir, 'mobile-player-profile-load-check.png');
await page.screenshot({ path:screenshot, fullPage:true });
const report = {
  auditedAt:new Date().toISOString(),
  viewport:'390x844',
  outcome,
  durationMs,
  hasDataConfidence:text.includes('DATA CONFIDENCE'),
  hasPerformanceSummary:text.includes('Performance Summary'),
  hasProfileSkeleton:text.includes('Loading profile, season stats, career splits, and Statcast context…'),
  hasBoxscoreLoading:text.includes('Checking official boxscores'),
  requestFailures,
  screenshot,
};
await fs.writeFile(path.join(outputDir, 'mobile-player-profile-load-check.json'), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'mobile-player-profile-load-check.md'), `# Mobile Player Profile Load Check\n\n| Metric | Result |\n| --- | --- |\n| Outcome | ${report.outcome} |\n| First usable profile | ${report.durationMs} ms |\n| Data confidence visible | ${report.hasDataConfidence ? 'yes' : 'no'} |\n| Performance summary visible | ${report.hasPerformanceSummary ? 'yes' : 'no'} |
\n| Profile skeleton still visible | ${report.hasProfileSkeleton ? 'yes' : 'no'} |\n| Optional boxscore still loading | ${report.hasBoxscoreLoading ? 'yes' : 'no'} |\n| Browser request failures | ${requestFailures.length} |\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
