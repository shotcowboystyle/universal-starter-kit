import { FolderIcon, HeartIcon } from '@phosphor-icons/react';
/**
 * A phosphor glyph handed a Tamagui token paints that token's colour
 * on web. Raw @phosphor-icons/react writes `color` straight into `<svg fill>`;
 * "$color9" is not a paint, the browser drops it and the glyph falls back to
 * black. createVitestConfig carries the same IconBase resolution every web
 * bundle gets (phosphorTokenColorPlugin), so these renders go through it.
 */
import { renderWithProviders } from '@repo/test-utils';
import { Theme, useTheme } from 'tamagui';
import { describe, expect, it } from 'vitest';

function ThemeValue({ name }: { name: string }) {
  const theme = useTheme() as unknown as Record<string, { val?: unknown } | undefined>;
  return <span data-theme-value={name} data-val={String(theme[name]?.val ?? '')} />;
}

function fillOf(container: HTMLElement, testId: string) {
  return container.querySelector(`[data-testid="${testId}"]`)?.getAttribute('fill') ?? '';
}

function valueOf(container: HTMLElement, name: string) {
  return container.querySelector(`[data-theme-value="${name}"]`)?.getAttribute('data-val') ?? '';
}

describe('phosphor glyph token colour on web', () => {
  it("paints $color9 with the theme's resolved colour, not the token string", () => {
    const { container } = renderWithProviders(
      <>
        <FolderIcon data-testid="glyph" color="$color9" />
        <ThemeValue name="color9" />
      </>,
    );
    const fill = fillOf(container, 'glyph');
    expect(valueOf(container, 'color9')).not.toBe('');
    expect(fill).toBe(valueOf(container, 'color9'));
    expect(fill.startsWith('$')).toBe(false);
  });

  it('resolves against the theme in scope, so dark paints the dark step', () => {
    const { container } = renderWithProviders(
      <>
        <HeartIcon data-testid="light" color="$color11" />
        <Theme name="dark">
          <HeartIcon data-testid="dark" color="$color11" />
          <ThemeValue name="color11" />
        </Theme>
      </>,
    );
    const dark = fillOf(container, 'dark');
    expect(dark).toBe(valueOf(container, 'color11'));
    expect(dark).not.toBe(fillOf(container, 'light'));
  });

  it("resolves a palette token such as the liked heart's $red11", () => {
    const { container } = renderWithProviders(
      <>
        <HeartIcon data-testid="glyph" weight="fill" color="$red11" />
        <ThemeValue name="red11" />
      </>,
    );
    expect(valueOf(container, 'red11')).not.toBe('');
    expect(fillOf(container, 'glyph')).toBe(valueOf(container, 'red11'));
  });

  it('leaves a literal colour alone', () => {
    const { container } = renderWithProviders(<HeartIcon data-testid="glyph" color="#123456" />);
    expect(fillOf(container, 'glyph')).toBe('#123456');
  });

  it('inherits currentColor when no colour is given', () => {
    const { container } = renderWithProviders(<HeartIcon data-testid="glyph" />);
    expect(fillOf(container, 'glyph')).toBe('currentColor');
  });

  it("takes the theme's ink, never black, for a token the theme does not carry", () => {
    const { container } = renderWithProviders(
      <>
        <HeartIcon data-testid="glyph" color="$notAThemeKey" />
        <ThemeValue name="color" />
      </>,
    );
    expect(valueOf(container, 'color')).not.toBe('');
    expect(fillOf(container, 'glyph')).toBe(valueOf(container, 'color'));
  });
});
