import { getConfig } from '@tamagui/web';
import { cleanup, render, screen } from '@testing-library/react';
import { TamaguiProvider, Theme, useThemeName } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { activateThemeConfig } from './activateThemeConfig';
import { createDefaultThemeConfig } from './createDefaultThemeConfig';
import type { ThemeConfig } from './shared';

const full = createDefaultThemeConfig({});
const subset = createDefaultThemeConfig({
  subset: { components: ['Button'], tints: ['accent', 'error', 'success', 'warning'] },
});

function Name() {
  return <span data-testid="red">{useThemeName()}</span>;
}

function ResolvedRed({ themeConfig }: { themeConfig: ThemeConfig }) {
  return (
    <TamaguiProvider config={themeConfig.tamagui} defaultTheme="light" disableInjectCSS>
      <Theme name="red">
        <Name />
      </Theme>
    </TamaguiProvider>
  );
}

afterEach(cleanup);

describe('activateThemeConfig', () => {
  it('makes the given config the one Tamagui resolves against, once', () => {
    expect(getConfig()).toBe(subset.tamagui);
    expect(activateThemeConfig(full)).toBe(true);
    expect(getConfig()).toBe(full.tamagui);
    expect(activateThemeConfig(full)).toBe(false);
  });

  it('drops the resolved-name cache, so a theme the new config lacks stops resolving', () => {
    activateThemeConfig(full);
    const first = render(<ResolvedRed themeConfig={full} />);
    expect(screen.getByTestId('red').textContent).toBe('light_red');
    first.unmount();

    activateThemeConfig(subset);
    const second = render(<ResolvedRed themeConfig={subset} />);
    expect(screen.getByTestId('red').textContent).toBe('light');
    second.unmount();

    activateThemeConfig(full);
    render(<ResolvedRed themeConfig={full} />);
    expect(screen.getByTestId('red').textContent).toBe('light_red');
  });
});
