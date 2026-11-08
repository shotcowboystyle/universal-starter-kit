import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RichEditorContext } from '../context';

vi.mock<object>(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal()),
  Button: (props: any) => (
    <button
      type="button"
      aria-label={props['aria-label']}
      onClick={props.onPress}>
      {props.children}
    </button>
  ),
}));

vi.mock<object>(import('@repo/ui'), () => ({
  Tooltip: ({ children }: any) => children,
  useDirection: () => 'ltr',
}));

const { ToolbarButton, ToolbarDropdownButton } = await import('./ToolbarButton');

const chromeRadius = (overrides: Partial<Knobs>, dropdown = false) => {
  const { getByRole } = renderWithProviders(
    <Preset overrides={overrides}>
      <RichEditorContext.Provider
        size="$true"
        compact={false}
        disabled={false}>
        {dropdown ? (
          <ToolbarDropdownButton
            aria-label="Heading"
            onPress={() => {}}>
            H
          </ToolbarDropdownButton>
        ) : (
          <ToolbarButton
            aria-label="Bold"
            onPress={() => {}}>
            B
          </ToolbarButton>
        )}
      </RichEditorContext.Provider>
    </Preset>,
  );
  const chrome = getByRole('button').firstElementChild;
  const atom = (chrome?.getAttribute('class') ?? '').split(/\s+/u).find((c) => c.startsWith('_btlr-'));
  cleanup();
  return atom;
};

describe('toolbar chrome rides the borderRadius knob (DG-RAD-01, MPO-56)', () => {
  afterEach(cleanup);

  it('squares the visible chrome at none', () => {
    expect(chromeRadius({ borderRadius: 'none' })).toBe('_btlr-t-radius-0');
    expect(chromeRadius({ borderRadius: 'none' }, true)).toBe('_btlr-t-radius-0');
  });

  it('follows the token scale above none', () => {
    expect(chromeRadius({ borderRadius: 'medium' })).toBe('_btlr-t-radius-4');
    expect(chromeRadius({ borderRadius: 'large' }, true)).toBe('_btlr-t-radius-6');
  });
});
