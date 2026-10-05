import { TestProviders } from '@repo/test-utils';
import { sizeRecipeForToken } from '@repo/theme';
// @vitest-environment jsdom
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { themed } from './themed';

const host = vi.hoisted(() => ({ touch: false }));
vi.mock('@repo/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/platform')>()),
  isWeb: true,
  isTouchable: false,
  get isWebTouchable() {
    return host.touch;
  },
}));

const Icon = themed(({ size }: { size?: string | number }) => <svg width={size} height={size} />);
function Fixture() {
  return (
    <TestProviders>
      <Icon size="$4" />
    </TestProviders>
  );
}

describe('token icon hydration', () => {
  it('preserves the server SVG before adopting touch sizing', async () => {
    host.touch = false;
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Fixture />);
    document.body.append(container);
    const icon = container.querySelector('svg');
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
    host.touch = true;
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <Fixture />, {
          onRecoverableError: (error) => errors.push(error),
        });
      });
      expect(container.querySelector('svg')).toBe(icon);
      expect(icon?.getAttribute('width')).toBe(String(sizeRecipeForToken('$4', { touch: true }).iconSize));
      expect(errors.filter((error) => /hydration|hydrated|didn't match/i.test(String(error)))).toEqual([]);
    } finally {
      await act(async () => root?.unmount());
      spy.mockRestore();
      container.remove();
      host.touch = false;
    }
  });
});
