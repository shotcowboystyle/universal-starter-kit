/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetDevWarnSeen } from '../shared/devWarn';

import { Button } from './index';

describe('Button DEV guardrails', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDevWarnSeen();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetDevWarnSeen();
  });

  it('warns bare-disabled when disabled without disabledReason', () => {
    renderWithProviders(<Button disabled>Save</Button>);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
  });

  it('does not warn bare-disabled when disabledReason is set', () => {
    renderWithProviders(
      <Button disabled disabledReason="Needs approval">
        Save
      </Button>,
    );
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
  });

  it('does not warn bare-disabled for loading', () => {
    renderWithProviders(<Button loading>Save</Button>);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
  });

  it('warns positive-tabindex when tabIndex > 0', () => {
    renderWithProviders(
      <Button tabIndex={2} disabledReason="n/a">
        Jump
      </Button>,
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('positive-tabindex'));
  });
});
