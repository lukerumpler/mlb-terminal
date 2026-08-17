import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.SKIP_E2E_BASE_URL || 'http://localhost:3000';
const outputDir = path.resolve('audit-results/e2e');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium';
const registryIdentity = {
  mlb: {
    id:'660271',
    canonicalUrl:'https://www.mlb.com/player/660271',
    confidence:'official-id',
    provenance:'MLB Stats API player identifier',
  },
  baseballReference: {
    id:'ohtansh01',
    canonicalUrl:'https://www.baseball-reference.com/players/o/ohtansh01.shtml',
    confidence:'exact-name',
    provenance:'Baseball-Reference canonical player page verified by exact normalized player name',
    matchedName:'Shohei Ohtani',
    verifiedAt:new Date().toISOString(),
  },
};

async function openPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const requestFailures = [];
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText || 'failed';
    if (failure !== 'net::ERR_ABORTED') requestFailures.push({ url:request.url(), failure });
  });
  await page.addInitScript(identity => {
    window.localStorage.setItem('skip:player-provider-identity:v1', JSON.stringify({
      '660271': { identity, expiresAt:Date.now() + 24 * 60 * 60_000 },
    }));
    window.localStorage.removeItem('skip-player-identity-telemetry-v1');
  }, registryIdentity);
  await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:30_000 });
  await page.getByRole('combobox', { name:'Select team' }).waitFor({ state:'visible', timeout:30_000 });
  return { page, requestFailures };
}

const browser = await chromium.launch({ headless:true, executablePath, args:['--no-sandbox'] });
const results = [];
try {
  for (const [label, viewport] of [['desktop', { width:1440, height:1000 }], ['mobile', { width:390, height:844 }]]) {
    const { page, requestFailures } = await openPage(browser, viewport);
    await page.waitForFunction(() => /WAR proxy|Team WAR/.test(document.querySelector('#root')?.innerText || ''), { timeout:30_000 });
    const overviewText = await page.locator('#root').innerText();
    const calculatedFallback = /WAR proxy/.test(overviewText) && /Playoff est/.test(overviewText) && /Calculated/.test(overviewText);
    const verifiedModel = /Team WAR/.test(overviewText) && /Playoff Odds/.test(overviewText) && /FanGraphs/.test(overviewText);
    assert.equal(calculatedFallback || verifiedModel, true, `${label} Overview should show either verified FanGraphs metrics or explicitly calculated fallback metrics`);
    await fs.mkdir(outputDir, { recursive:true });
    await page.screenshot({ path:path.join(outputDir, `${label}-overview-fallback-e2e.png`), fullPage:true });

    const playersTab = page.locator('button[title="Players"]').first();
    await playersTab.evaluate(element => element.click());
    const ohtani = page.getByRole('button', { name:/Shohei Ohtani/i }).first();
    await ohtani.waitFor({ state:'visible', timeout:30_000 });
    await ohtani.click();
    await page.waitForFunction(() => /data confidence/i.test(document.querySelector('#root')?.innerText || ''), { timeout:30_000 });
    await page.waitForTimeout(750);
    const telemetry = await page.evaluate(() => JSON.parse(window.localStorage.getItem('skip-player-identity-telemetry-v1') || '{}'));
    const counters = telemetry.counters || {};
    assert.equal(Number(counters.resolverRequests || 0) >= 1, true, `${label} player profile should issue an identity resolver request`);
    assert.equal(Number(counters.registryReuses || 0) >= 1, true, `${label} player profile should reuse the persisted registry mapping`);
    assert.equal(Number(counters.directIdRequests || 0) >= 1, true, `${label} player profile should send a direct Baseball-Reference ID request`);
    await page.screenshot({ path:path.join(outputDir, `${label}-player-telemetry-e2e.png`), fullPage:true });
    results.push({
      viewport:label,
      overview:{ calculatedFallback, verifiedModel },
      telemetry:counters,
      requestFailures,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

const report = {
  auditedAt:new Date().toISOString(),
  baseUrl,
  results,
  allDataRequestFailures:results.flatMap(result => result.requestFailures),
};
await fs.mkdir(outputDir, { recursive:true });
await fs.writeFile(path.join(outputDir, 'fallback-telemetry-ui-e2e.json'), `${JSON.stringify(report, null, 2)}\n`);
console.table(results.map(result => ({
  viewport:result.viewport,
  calculatedFallback:result.overview.calculatedFallback,
  verifiedModel:result.overview.verifiedModel,
  resolverRequests:result.telemetry.resolverRequests || 0,
  registryReuses:result.telemetry.registryReuses || 0,
  directIdRequests:result.telemetry.directIdRequests || 0,
  dataRequestFailures:result.requestFailures.length,
})));
