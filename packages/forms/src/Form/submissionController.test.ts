import { describe, expect, it, vi } from 'vitest';

import { getFormSubmission } from './submissionController';

describe('submission controller', () => {
  it('shares one guarded attempt per form and keeps other forms independent', async () => {
    let finish!: () => void;
    const form = {
      state: { isSubmitting: false, isSubmitSuccessful: false },
      handleSubmit: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        form.state.isSubmitSuccessful = true;
      }),
    };
    const other = {
      state: { isSubmitting: false, isSubmitSuccessful: false },
      handleSubmit: vi.fn(async () => {}),
    };
    const controller = getFormSubmission(form);
    expect(getFormSubmission(form)).toBe(controller);
    expect(getFormSubmission(other)).not.toBe(controller);
    const first = controller.submit();
    const duplicate = controller.submit();
    await Promise.resolve();
    expect(form.handleSubmit).toHaveBeenCalledTimes(1);
    expect(await duplicate).toBe('busy');
    finish();
    expect(await first).toBe('success');
    expect(other.handleSubmit).not.toHaveBeenCalled();
  });

  it('captures sync throws, exposes stable reactive snapshots and unsubscribes', async () => {
    const form = {
      state: { isSubmitting: false, isSubmitSuccessful: false },
      handleSubmit: vi.fn(() => {
        throw new Error('Service unavailable');
      }),
    };
    const controller = getFormSubmission(form);
    const initial = controller.getSnapshot();
    expect(controller.getSnapshot()).toBe(initial);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    expect(await controller.submit()).toBe('failed');
    expect(controller.getSnapshot().error).toBe('Service unavailable');
    expect(controller.getSnapshot()).toBe(controller.getSnapshot());
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    controller.clearError();
    expect(controller.getSnapshot().error).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    expect(await controller.submit()).toBe('failed');
    expect(form.handleSubmit).toHaveBeenCalledTimes(2);
  });

  it('clears a prior refusal when retry starts and does not treat validation as success', async () => {
    const form = {
      state: { isSubmitting: false, isSubmitSuccessful: false },
      handleSubmit: vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('Try again'))
        .mockResolvedValue(undefined),
    };
    const controller = getFormSubmission(form);
    expect(await controller.submit()).toBe('failed');
    const retry = controller.submit();
    expect(controller.getSnapshot().error).toBeNull();
    expect(await retry).toBe('invalid');
    expect(form.handleSubmit).toHaveBeenCalledTimes(2);
  });
});
