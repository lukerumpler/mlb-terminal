import type { Request, Response } from 'express';
import { sdk } from '../_core/sdk';
// @ts-expect-error The legacy Savant handler is intentionally JavaScript.
import { warmSavantCache } from './savant.js';

export async function scheduledSavantRefresh(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) return res.status(403).json({ error: 'cron-only' });
    await warmSavantCache('2026');
    return res.json({ ok: true, refreshed: 'savant', policy: 'nightly-utc' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Savant nightly refresh failed';
    console.error('[scheduled-savant-refresh]', error);
    return res.status(500).json({ error: message, timestamp: new Date().toISOString() });
  }
}
