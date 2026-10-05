import { describe, expect, it, vi } from 'vitest';

import { onAppFocus, onAppBlur, onOnline, onOffline, onVisibilityChange } from './lifecycle';

describe('onAppFocus', () => {
  it('calls callback on window focus', () => {
    const cb = vi.fn();
    const cleanup = onAppFocus(cb);
    window.dispatchEvent(new Event('focus'));
    expect(cb).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('stops listening after cleanup', () => {
    const cb = vi.fn();
    const cleanup = onAppFocus(cb);
    cleanup();
    window.dispatchEvent(new Event('focus'));
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('onAppBlur', () => {
  it('calls callback on window blur', () => {
    const cb = vi.fn();
    const cleanup = onAppBlur(cb);
    window.dispatchEvent(new Event('blur'));
    expect(cb).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('stops listening after cleanup', () => {
    const cb = vi.fn();
    const cleanup = onAppBlur(cb);
    cleanup();
    window.dispatchEvent(new Event('blur'));
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('onOnline', () => {
  it('calls callback on online event', () => {
    const cb = vi.fn();
    const cleanup = onOnline(cb);
    window.dispatchEvent(new Event('online'));
    expect(cb).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe('onOffline', () => {
  it('calls callback on offline event', () => {
    const cb = vi.fn();
    const cleanup = onOffline(cb);
    window.dispatchEvent(new Event('offline'));
    expect(cb).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe('onVisibilityChange', () => {
  it('calls callback with visibility state', () => {
    const cb = vi.fn();
    const cleanup = onVisibilityChange(cb);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(typeof cb.mock.calls[0][0]).toBe('boolean');
    cleanup();
  });

  it('stops listening after cleanup', () => {
    const cb = vi.fn();
    const cleanup = onVisibilityChange(cb);
    cleanup();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).not.toHaveBeenCalled();
  });
});
