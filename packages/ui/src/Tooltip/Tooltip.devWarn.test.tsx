/**
 * @vitest-environment jsdom
 */

import { Button } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { __resetDevWarnSeen } from '@repo/theme';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Tooltip } from './index';

describe('Tooltip DEV guardrails', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDevWarnSeen();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetDevWarnSeen();
  });

  it('warns tooltip-on-disabled when child is disabled', () => {
    renderWithProviders(
      <Tooltip content="Why?">
        <Button disabled disabledReason="Locked">
          Edit
        </Button>
      </Tooltip>,
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tooltip-on-disabled'));
  });

  it('does not warn when child is enabled', () => {
    renderWithProviders(
      <Tooltip content="Hint">
        <Button>Edit</Button>
      </Tooltip>,
    );
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('tooltip-on-disabled'));
  });
});
