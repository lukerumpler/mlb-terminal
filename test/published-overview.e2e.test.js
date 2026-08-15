import assert from 'node:assert/strict';
import { afterAll, describe, it } from 'vitest';
import { chromium } from 'playwright';

const LIVE_URL = process.env.SKIP_LIVE_URL || 'https://skipbasebal-mm6hz9ps.manus.space/?e2e=overview-default';
let browser;

describe('published Dodgers Overview', () => {
  it('keeps the MLB team selected first and separates source badges', async () => {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const teamSelect = page.getByRole('combobox', { name: 'Select team' });
    const affiliateSelect = page.getByRole('combobox', { name: 'Select minor league affiliate' });
    await teamSelect.waitFor({ state: 'visible', timeout: 30_000 });
    await affiliateSelect.waitFor({ state: 'visible', timeout: 30_000 });
    assert.equal(await teamSelect.inputValue(), 'lad');
    assert.equal(await affiliateSelect.inputValue(), '');
    assert.equal(await page.getByText('Minor-League Affiliate Overview').count(), 0);
    assert.equal(await page.getByText(/· error/).count(), 0);

    const badgeGroups = page.locator('.skip-overview-source-badges');
    assert.equal(await badgeGroups.first().isVisible(), true);
    const gaps = await badgeGroups.evaluateAll(nodes => nodes.map(node => Number.parseFloat(getComputedStyle(node).gap || '0')));
    assert.equal(gaps.some(gap => gap >= 10), true);
  }, 45_000);

  it('does not dispatch affiliate selection during either fresh-load mode', async () => {
    const traces = [];
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      window.__skipStartupTrace = { affiliateEvents: [], recentHistoryReads: [] };
      const originalDispatch = window.dispatchEvent.bind(window);
      window.dispatchEvent = event => {
        if (event?.type === 'skip-select-affiliate') {
          window.__skipStartupTrace.affiliateEvents.push(event.detail || null);
        }
        return originalDispatch(event);
      };
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        if (key === 'skip-recent-history') {
          window.__skipStartupTrace.recentHistoryReads.push(originalGetItem.call(this, key));
        }
        return originalGetItem.call(this, key);
      };
    });
    for (const url of [LIVE_URL.replace('?e2e=overview-default', '?e2e=overview-hard-refresh'), LIVE_URL.replace('?e2e=overview-default', '?e2e=overview-cache-busted-2')]) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const affiliateSelect = page.getByRole('combobox', { name: 'Select minor league affiliate' });
      await affiliateSelect.waitFor({ state: 'visible', timeout: 30_000 });
      traces.push({
        url,
        value: await affiliateSelect.inputValue(),
        trace: await page.evaluate(() => window.__skipStartupTrace),
      });
    }
    assert.deepEqual(traces.map(item => item.value), ['', '']);
    assert.equal(traces.every(item => item.trace.affiliateEvents.length === 0), true);
    assert.equal(traces.every(item => Array.isArray(item.trace.recentHistoryReads)), true);
    await page.close();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });
});
