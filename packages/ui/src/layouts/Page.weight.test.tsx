import { defaultHeadingFont, Preset } from '@repo/theme';
import { defaultConfig } from '@tamagui/config/v5';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createTamagui, TamaguiProvider } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHeader } from './Page';

const config = createTamagui({
  ...defaultConfig,
  fonts: { ...defaultConfig.fonts, heading: defaultHeadingFont },
});
function renderWithProviders(node: ReactElement) {
  return render(
    <TamaguiProvider config={config} defaultTheme="light">
      {node}
    </TamaguiProvider>,
  );
}
afterEach(cleanup);

describe('PageHeader rendered Tamagui title recipes', () => {
  for (const scale of ['moderate', 'display'] as const) {
    for (const weight of ['regular', 'bold'] as const) {
      it(`${scale} preserves ${weight} independently of size`, () => {
        renderWithProviders(
          <Preset overrides={{ pageTitleScale: scale, fontWeight: weight }}>
            <PageHeader title="Measured title" />
          </Preset>,
        );
        const title = screen.getByRole('heading', { name: 'Measured title' });
        expect(getComputedStyle(title).fontSize).toBe(scale === 'moderate' ? '26px' : '40px');
        expect(getComputedStyle(title).fontWeight).toBe(weight === 'regular' ? '400' : '700');
        expect(title.tagName).toBe('H1');
        expect(title).toHaveAttribute('data-font-weight-knob', weight);
        expect(title.className).toContain('font_heading');
      });

      it(`${scale}/${weight} survives nested overrides and a titleScale eject`, () => {
        renderWithProviders(
          <Preset
            overrides={{
              pageTitleScale: scale,
              fontWeight: weight === 'bold' ? 'regular' : 'bold',
            }}>
            <Preset overrides={{ fontWeight: weight }}>
              <PageHeader
                title="Nested title"
                headingLevel={2}
                titleScale={scale === 'moderate' ? 'display' : 'moderate'}
              />
            </Preset>
          </Preset>,
        );
        const title = screen.getByRole('heading', { name: 'Nested title' });
        expect(getComputedStyle(title).fontSize).toBe(scale === 'moderate' ? '40px' : '26px');
        expect(getComputedStyle(title).fontWeight).toBe(weight === 'regular' ? '400' : '700');
        expect(title.tagName).toBe('H2');
      });
    }
  }

  it('preserves the consumer heading eject and wrapper props', () => {
    renderWithProviders(
      <PageHeader heading={<h3 style={{ fontWeight: 600 }}>Custom</h3>} data-testid="eject" padding={7} />,
    );
    expect(getComputedStyle(screen.getByRole('heading')).fontWeight).toBe('600');
    expect(getComputedStyle(screen.getByTestId('eject')).paddingTop).toBe('7px');
  });
});
