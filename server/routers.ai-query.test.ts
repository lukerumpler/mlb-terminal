import { describe, expect, it } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

const ctx = {
  user: null,
  req: { protocol:'https', headers:{} },
  res: {},
} as TrpcContext;

describe('ai.query', () => {
  it('rejects empty or overly long questions at the procedure boundary', async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.ai.query({ query:'', context:{} })).rejects.toMatchObject({ code:'BAD_REQUEST' });
    await expect(caller.ai.query({ query:'x'.repeat(241), context:{} })).rejects.toMatchObject({ code:'BAD_REQUEST' });
  });
});
