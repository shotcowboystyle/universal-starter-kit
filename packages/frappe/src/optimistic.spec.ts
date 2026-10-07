import { createOptimisticAction as tanstackCreateOptimisticAction } from '@tanstack/db';
import { describe, expect, it, vi } from 'vitest';

import {
  OPTIMISTIC_TEMP_PREFIX,
  createOptimisticAction,
  isOptimisticTempId,
  newOptimisticTempId,
  runOptimisticRpc,
} from './optimistic';

describe('createOptimisticAction re-export', () => {
  it('is the same reference as @tanstack/db createOptimisticAction', () => {
    expect(createOptimisticAction).toBe(tanstackCreateOptimisticAction);
  });

  it('is a function', () => {
    expect(createOptimisticAction).toBeTypeOf('function');
  });
});

describe('newOptimisticTempId / isOptimisticTempId', () => {
  it('issues unique tmp_-prefixed identities (MutationEngine convention)', () => {
    const a = newOptimisticTempId();
    const b = newOptimisticTempId();
    expect(a.startsWith(OPTIMISTIC_TEMP_PREFIX)).toBe(true);
    expect(b.startsWith(OPTIMISTIC_TEMP_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(isOptimisticTempId(a)).toBe(true);
  });

  it('rejects server-issued names and non-strings', () => {
    expect(isOptimisticTempId('TODO-0001')).toBe(false);
    expect(isOptimisticTempId()).toBe(false);
    expect(isOptimisticTempId(42)).toBe(false);
  });
});

describe('runOptimisticRpc lifecycle', () => {
  it('applies locally BEFORE the request resolves (local apply is the first reveal)', async () => {
    const order: string[] = [];
    let releaseSend: (value: string) => void = () => {};
    const sendGate = new Promise<string>((resolve) => {
      releaseSend = resolve;
    });

    const promise = runOptimisticRpc<string>({
      apply: () => {
        order.push('apply');
        return () => order.push('undo');
      },
      send: async () => {
        order.push('send');
        return await sendGate;
      },
      reconcile: () => order.push('reconcile'),
    });

    // Apply and send already happened synchronously; the ack has not landed.
    expect(order).toEqual(['apply', 'send']);
    releaseSend('ack');
    await expect(promise).resolves.toBe('ack');
    expect(order).toEqual(['apply', 'send', 'reconcile']);
  });

  it('passes the SAME temp id through apply, send, and reconcile (identity convergence)', async () => {
    const seen: string[] = [];
    await runOptimisticRpc({
      apply: (ctx) => {
        seen.push(ctx.tempId);
      },
      send: async (ctx) => {
        seen.push(ctx.tempId);
        return 'ok';
      },
      reconcile: (_ack, ctx) => {
        seen.push(ctx.tempId);
      },
    });
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(1);
    expect(isOptimisticTempId(seen[0])).toBe(true);
  });

  it('rolls back (undo) then surfaces the error visibly (onError) on failure, and rethrows', async () => {
    const order: string[] = [];
    const failure = new Error('server said no');
    const onError = vi.fn((error: unknown) => {
      order.push('onError');
      expect(error).toBe(failure);
    });

    await expect(
      runOptimisticRpc({
        apply: () => {
          order.push('apply');
          return () => order.push('undo');
        },
        send: async () => {
          throw failure;
        },
        reconcile: () => order.push('reconcile'),
        onError,
      }),
    ).rejects.toBe(failure);

    // Rollback precedes the visible error; reconcile never runs.
    expect(order).toEqual(['apply', 'undo', 'onError']);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('still surfaces onError when apply returned no undo', async () => {
    const onError = vi.fn();
    await expect(
      runOptimisticRpc({
        apply: () => {},
        send: async () => {
          throw new Error('boom');
        },
        onError,
      }),
    ).rejects.toThrow('boom');
    expect(onError).toHaveBeenCalledOnce();
  });
});
