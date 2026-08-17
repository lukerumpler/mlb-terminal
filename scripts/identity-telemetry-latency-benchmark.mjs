import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import handler, {
  __resetPlayerIdentityStateForTests,
  getPlayerIdentityTelemetry,
} from '../server/api/player-identity.js';

const outputDir = path.resolve('audit-results/performance');
const delays = { directCanonicalMs:40, nameSearchMs:100 };

function response() {
  return {
    statusCode:200,
    headers:{},
    body:undefined,
    setHeader(name, value) { this.headers[name] = String(value); },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  };
}

function request(url, ip) {
  return { method:'GET', url, headers:{}, socket:{ remoteAddress:ip } };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const originalFetch = globalThis.fetch;
__resetPlayerIdentityStateForTests();
globalThis.fetch = async url => {
  const target = String(url);
  if (target.includes('/players/o/ohtansh01.shtml')) {
    await sleep(delays.directCanonicalMs);
    return new Response('<h1>Shohei Ohtani</h1>', { status:200 });
  }
  if (target.includes('/search/search.fcgi')) {
    await sleep(delays.nameSearchMs);
    return new Response('<a href="/players/a/aaronju01.shtml">Aaron Judge</a>', { status:200 });
  }
  throw new Error(`Unexpected benchmark URL: ${target}`);
};

try {
  const directFirst = response();
  await handler(request('/api/player-identity?mlbId=660271&name=Shohei%20Ohtani&baseballReferenceId=ohtansh01&identitySource=registry', '198.51.100.31'), directFirst);
  assert.equal(directFirst.statusCode, 200);
  assert.equal(directFirst.body.found, true);

  const directWarm = response();
  await handler(request('/api/player-identity?mlbId=660271&name=Shohei%20Ohtani&baseballReferenceId=ohtansh01&identitySource=registry', '198.51.100.31'), directWarm);
  assert.equal(directWarm.statusCode, 200);
  assert.equal(directWarm.body.found, true);

  const search = response();
  await handler(request('/api/player-identity?mlbId=592450&name=Aaron%20Judge', '198.51.100.31'), search);
  assert.equal(search.statusCode, 200);
  assert.equal(search.body.found, true);

  const telemetry = getPlayerIdentityTelemetry();
  const directMs = telemetry.latencyMs.directCanonical.averageMs;
  const searchMs = telemetry.latencyMs.nameSearch.averageMs;
  const warmRegistryMs = telemetry.latencyMs.serverRegistryHit.averageMs;
  const directVsSearchSavedMs = searchMs - directMs;
  const directVsSearchSavedPct = Number((100 * directVsSearchSavedMs / searchMs).toFixed(1));
  const registryVsSearchSavedMs = searchMs - warmRegistryMs;
  const registryVsSearchSavedPct = Number((100 * registryVsSearchSavedMs / searchMs).toFixed(1));

  assert.equal(telemetry.directIdRequestRate, 66.7);
  assert.equal(telemetry.browserRegistryReuseRate, 100);
  assert.equal(telemetry.serverRegistryHitRate, 33.3);
  assert.equal(telemetry.directCanonicalVerificationRate, 100);
  assert.equal(telemetry.nameSearchExactMatchRate, 100);
  assert.equal(telemetry.latencyMs.directCanonical.samples, 1);
  assert.equal(telemetry.latencyMs.nameSearch.samples, 1);
  assert.equal(telemetry.latencyMs.serverRegistryHit.samples, 1);
  assert.equal(directVsSearchSavedMs > 0, true);
  assert.equal(registryVsSearchSavedMs > 0, true);

  const report = {
    benchmark:'controlled local provider-delay simulation; not a production network measurement',
    generatedAt:new Date().toISOString(),
    injectedProviderDelayMs:delays,
    telemetry,
    latencyImprovement:{
      directIdVsNameSearch:{ savedMs:directVsSearchSavedMs, savedPct:directVsSearchSavedPct },
      warmRegistryVsNameSearch:{ savedMs:registryVsSearchSavedMs, savedPct:registryVsSearchSavedPct },
    },
  };
  await fs.mkdir(outputDir, { recursive:true });
  await fs.writeFile(path.join(outputDir, 'identity-latency-benchmark.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.table([{
    directIdRequestRate:telemetry.directIdRequestRate,
    browserRegistryReuseRate:telemetry.browserRegistryReuseRate,
    serverRegistryHitRate:telemetry.serverRegistryHitRate,
    directCanonicalAverageMs:directMs,
    nameSearchAverageMs:searchMs,
    warmRegistryAverageMs:warmRegistryMs,
    directVsSearchSavedMs,
    registryVsSearchSavedMs,
  }]);
} finally {
  globalThis.fetch = originalFetch;
  __resetPlayerIdentityStateForTests();
}
