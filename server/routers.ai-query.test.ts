import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./_core/llm', () => ({ invokeLLM: vi.fn() }));
import { invokeLLM } from './_core/llm';
import { __resetAiQueryCacheForTests, appRouter } from './routers';
import type { TrpcContext } from './_core/context';

const ctx = {
  user: null,
  req: { protocol:'https', headers:{} },
  res: {},
} as TrpcContext;

describe('ai.query', () => {
  beforeEach(() => {
    __resetAiQueryCacheForTests();
    vi.mocked(invokeLLM).mockReset();
  });

  it('rejects empty or overly long questions at the procedure boundary', async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.ai.query({ query:'', context:{} })).rejects.toMatchObject({ code:'BAD_REQUEST' });
    await expect(caller.ai.query({ query:'x'.repeat(241), context:{} })).rejects.toMatchObject({ code:'BAD_REQUEST' });
  });

  it('reuses a verified identical query response without a second model request', async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce({ choices:[{ message:{ content:JSON.stringify({ answer:'The visible OPS is .901.', intent:'player_stat', metric:'OPS', confidence:'verified' }) } }] } as never);
    const caller = appRouter.createCaller(ctx);
    const input = { query:'What is the visible OPS?', context:{ player:'Example', stats:{ ops:'.901' } } };
    await expect(caller.ai.query(input)).resolves.toMatchObject({ confidence:'verified', metric:'OPS' });
    await expect(caller.ai.query(input)).resolves.toMatchObject({ confidence:'verified', metric:'OPS' });
    expect(invokeLLM).toHaveBeenCalledTimes(1);
  });

  it('uses one verified cache entry when equivalent metric context has a different key insertion order', async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce({ choices:[{ message:{ content:JSON.stringify({ answer:'The visible OPS is .901.', intent:'player_stat', metric:'OPS', confidence:'verified' }) } }] } as never);
    const caller = appRouter.createCaller(ctx);
    await caller.ai.query({ query:'What is the visible OPS?', context:{ player:'Example', stats:{ ops:'.901', avg:'.300' } } });
    await caller.ai.query({ query:'What is the visible OPS?', context:{ stats:{ avg:'.300', ops:'.901' }, player:'Example' } });
    expect(invokeLLM).toHaveBeenCalledTimes(1);
  });

  it('keeps oversized browser context out of the model request and returns an explicit unavailable state', async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.ai.query({ query:'Review this context', context:{ rows:'x'.repeat(12_001) } })).resolves.toMatchObject({ confidence:'unavailable', intent:'unavailable' });
    expect(invokeLLM).not.toHaveBeenCalled();
  });
});
