import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.SKIP_RECOVERY_BASE_URL || 'http://localhost:3000';
const outputDir = path.resolve('audit-results/recovery');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium';
const mlbIdentity = {
  id:'660271',
  canonicalUrl:'https://www.mlb.com/player/660271',
  confidence:'official-id',
  provenance:'MLB Stats API player identifier',
};
const recoveredIdentity = {
  mlb:mlbIdentity,
  baseballReference:{
    id:'ohtansh01',
    canonicalUrl:'https://www.baseball-reference.com/players/o/ohtansh01.shtml',
    confidence:'exact-name',
    provenance:'Baseball-Reference canonical player page verified by exact normalized player name',
    matchedName:'Shohei Ohtani',
    verifiedAt:new Date().toISOString(),
  },
};

const browser = await chromium.launch({ headless:true, executablePath, args:['--no-sandbox'] });
const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
const failures = [];
let resolverCalls = 0;
page.on('requestfailed', request => {
  const error = request.failure()?.errorText || 'failed';
  if (error !== 'net::ERR_ABORTED') failures.push({ url:request.url(), error });
});
await page.addInitScript(() => {
  window.localStorage.removeItem('skip:player-provider-identity:v1');
  window.localStorage.removeItem('skip-player-identity-telemetry-v1');
});
await page.route('**/api/player-identity?*', async route => {
  resolverCalls += 1;
  const recovered = resolverCalls > 1;
  await route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify(recovered
      ? { found:true, identity:recoveredIdentity, invalidateBaseballReferenceId:false }
      : { found:false, identity:{ mlb:mlbIdentity, baseballReference:null }, invalidateBaseballReferenceId:false }),
  });
});

async function openOhtani() {
  const players = page.locator('button[title="Players"]').first();
  await players.evaluate(element => element.click());
  const ohtani = page.getByRole('button', { name:/Shohei Ohtani/i }).first();
  await ohtani.waitFor({ state:'visible', timeout:30_000 });
  await ohtani.click();
  await page.waitForFunction(() => /data confidence/i.test(document.querySelector('#root')?.innerText || ''), { timeout:30_000 });
}

try {
  await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:30_000 });
  await openOhtani();
  await page.waitForFunction(() => {
    const text = document.querySelector('#root')?.innerText || '';
    return /B-Ref ID/i.test(text) && /Unavailable/i.test(text);
  }, { timeout:30_000 });
  const unavailableText = await page.locator('#root').innerText();
  await fs.mkdir(outputDir, { recursive:true });
  await page.screenshot({ path:path.join(outputDir, 'profile-confidence-unavailable.png'), fullPage:true });
  assert.match(unavailableText, /B-Ref ID/i);
  assert.match(unavailableText, /Unavailable/i);

  await page.reload({ waitUntil:'domcontentloaded', timeout:30_000 });
  await openOhtani();
  await page.waitForFunction(() => {
    const text = document.querySelector('#root')?.innerText || '';
    return /B-Ref ID/i.test(text) && /Exact name/i.test(text);
  }, { timeout:30_000 });
  const recoveredText = await page.locator('#root').innerText();
  await page.screenshot({ path:path.join(outputDir, 'profile-confidence-recovered.png'), fullPage:true });
  assert.equal(resolverCalls, 2, 'The simulated provider should be called once before and once after recovery');
  assert.match(recoveredText, /Exact name/i);
  assert.equal(failures.length, 0, `Unexpected browser failures: ${JSON.stringify(failures)}`);

  const report = {
    generatedAt:new Date().toISOString(),
    baseUrl,
    resolverCalls,
    transition:{ from:'B-Ref ID · Unavailable', to:'B-Ref ID · Exact name' },
    browserRequestFailures:failures,
  };
  await fs.writeFile(path.join(outputDir, 'bref-recovery-transition.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.table([{
    resolverCalls,
    initialState:'Unavailable',
    recoveredState:'Exact name',
    browserRequestFailures:failures.length,
  }]);
} finally {
  await browser.close();
}
