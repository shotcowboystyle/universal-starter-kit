import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveKeyboardAvoidingBehavior } from './behavior';

import { KeyboardAvoidingWrapper } from './index';

describe(resolveKeyboardAvoidingBehavior, () => {
  it('defaults to padding on iOS and height elsewhere', () => {
    expect(resolveKeyboardAvoidingBehavior('ios')).toBe('padding');
    expect(resolveKeyboardAvoidingBehavior('android')).toBe('height');
    expect(resolveKeyboardAvoidingBehavior('web')).toBe('height');
  });

  it('an explicit behavior always wins', () => {
    expect(resolveKeyboardAvoidingBehavior('ios', 'position')).toBe('position');
    expect(resolveKeyboardAvoidingBehavior('android', 'padding')).toBe('padding');
  });
});

describe('KeyboardAvoidingWrapper web', () => {
  afterEach(cleanup);

  it('is a passthrough that still renders children', () => {
    const { container } = renderWithProviders(
      <KeyboardAvoidingWrapper
        behavior="padding"
        keyboardVerticalOffset={24}>
        <span>Field</span>
      </KeyboardAvoidingWrapper>,
    );
    const frame = container.querySelector<HTMLElement>('[data-testid="keyboard-avoiding-wrapper"]')!;
    expect(frame).toBeTruthy();
    expect(frame.dataset.keyboardAvoiding).toBe('web');
    expect(frame.dataset.enabled).toBe('true');
    expect(frame.textContent).toContain('Field');
  });

  it('enabled=false still renders children on web', () => {
    const { container } = renderWithProviders(
      <KeyboardAvoidingWrapper enabled={false}>
        <span>Still visible</span>
      </KeyboardAvoidingWrapper>,
    );
    const frame = container.querySelector<HTMLElement>('[data-testid="keyboard-avoiding-wrapper"]')!;
    expect(frame.dataset.enabled).toBe('false');
    expect(frame.textContent).toContain('Still visible');
  });
});
