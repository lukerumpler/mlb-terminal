import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.SKIP_STRESS_BASE_URL || 'http://localhost:3000';
const season = Number(process.env.SKIP_STRESS_SEASON || 2026);
const burstSize = Number(process.env.SKIP_STRESS_BURST_SIZE || 45);
const outputDir = path.resolve('audit-results/performance');
const endpoint = `/api/intelligence-calculations?teamId=119&season=${season}`;
const nowMs = () => performance.now();

async function singleRequest() {
  const startedAt = nowMs();
  const response = await fetch(`${baseUrl}${endpoint}`, { signal:AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => ({}));
  return {
    status:response.status,
    retryAfter:response.headers.get('retry-after'),
    durationMs:Number((nowMs() - startedAt).toFixed(1)),
    error:body.error || null,
  };
}

const burstStartedAt = new Date().toISOString();
const burst = await Promise.all(Array.from({ length:burstSize }, () => singleRequest()));
const allowed = burst.filter(result => result.status === 200);
const limited = burst.filter(result => result.status === 429);
const other = burst.filter(result => ![200, 429].includes(result.status));
const retryAfterValues = [...new Set(limited.map(result => result.retryAfter))];
assert.equal(allowed.length, 30, 'The first 30 requests in the ten-second window should be allowed');
assert.equal(limited.length, burstSize - 30, 'Requests beyond the window should be rate limited');
assert.equal(other.length, 0, 'The controlled burst should have no unexpected response statuses');
assert.deepEqual(retryAfterValues, ['10'], 'Every limited response should advertise a ten-second retry window');
assert.equal(limited.every(result => /slow down/i.test(result.error || '')), true, 'Rate-limited responses should provide an actionable error');

const retryDelayMs = Number(retryAfterValues[0]) * 1000 + 150;
await new Promise(resolve => setTimeout(resolve, retryDelayMs));
const recovered = await singleRequest();
assert.equal(recovered.status, 200, 'A request after the advertised retry window should recover');

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)].toFixed(1));
};
const report = {
  benchmark:'controlled local burst against cached intelligence endpoint; upstream MLB data is not multiplied',
  generatedAt:new Date().toISOString(),
  baseUrl,
  endpoint,
  burst:{ size:burstSize, startedAt:burstStartedAt, allowed:allowed.length, limited:limited.length, unexpected:other.length },
  retryAfter:{ values:retryAfterValues, waitedMs:retryDelayMs, recovery:recovered },
  latencyMs:{
    allowed:{ average:Number((allowed.reduce((sum, item) => sum + item.durationMs, 0) / allowed.length).toFixed(1)), p95:percentile(allowed.map(item => item.durationMs), .95), max:percentile(allowed.map(item => item.durationMs), 1) },
    limited:{ average:Number((limited.reduce((sum, item) => sum + item.durationMs, 0) / limited.length).toFixed(1)), p95:percentile(limited.map(item => item.durationMs), .95), max:percentile(limited.map(item => item.durationMs), 1) },
  },
};
await fs.mkdir(outputDir, { recursive:true });
await fs.writeFile(path.join(outputDir, 'rate-limit-stress-test.json'), `${JSON.stringify(report, null, 2)}\n`);
console.table([{
  burstSize,
  allowed:report.burst.allowed,
  rateLimited:report.burst.limited,
  retryAfter:retryAfterValues.join(', '),
  recoveredStatus:recovered.status,
  allowedP95Ms:report.latencyMs.allowed.p95,
  limitedP95Ms:report.latencyMs.limited.p95,
}]);
