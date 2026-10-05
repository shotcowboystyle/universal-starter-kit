import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Avatar, fallbackTone, fallbackToneIndex, getInitials } from './index';

afterEach(cleanup);

describe('getInitials', () => {
  it('takes first letters of two words', () => {
    expect(getInitials('Ada Lovelace')).toBe('AL');
  });

  it('splits email / dotted local parts', () => {
    expect(getInitials('john.doe@example.com')).toBe('JD');
  });

  it('falls back to two chars of a single token', () => {
    expect(getInitials('Ada')).toBe('AD');
  });

  it('returns ? for empty', () => {
    expect(getInitials('')).toBe('?');
  });
});

describe('fallbackTone', () => {
  it('is stable for the same seed', () => {
    expect(fallbackToneIndex('Ada Lovelace')).toBe(fallbackToneIndex('Ada Lovelace'));
    expect(fallbackTone('Ada Lovelace')).toEqual(fallbackTone('Ada Lovelace'));
  });

  it('diverges for different names', () => {
    expect(fallbackTone('Ada Lovelace')?.bg).not.toBe(fallbackTone('Grace Hopper')?.bg);
  });
});

describe('Avatar', () => {
  const pxOf = (container: HTMLElement) =>
    Number(container.querySelector('[data-avatar-px]')?.getAttribute('data-avatar-px'));

  it('renders initials from name', () => {
    const { container } = renderWithProviders(<Avatar name="Ada Lovelace" />);
    expect(container.textContent).toContain('AL');
  });

  it('respects explicit initials override', () => {
    const { container } = renderWithProviders(<Avatar name="Ada Lovelace" initials="XX" />);
    expect(container.textContent).toContain('XX');
    expect(container.textContent).not.toContain('AL');
  });

  it('supports compound Fallback children', () => {
    const { container } = renderWithProviders(
      <Avatar size="$3">
        <Avatar.Fallback>
          <span>OK</span>
        </Avatar.Fallback>
      </Avatar>,
    );
    expect(container.textContent).toContain('OK');
  });

  it('keeps size, density, and nested on separate channels', () => {
    const page = renderWithProviders(<Avatar name="Ada Lovelace" />);
    const nested = renderWithProviders(<Avatar name="Ada Lovelace" nested />);
    const compact = renderWithProviders(<Avatar name="Ada Lovelace" compact />);
    expect(pxOf(page.container)).toBe(36);
    expect(pxOf(nested.container)).toBe(32);
    // Density is not size. `compact` steps SPACE only (see
    // resolveKnobs.applyDensity / compactSpaceMap) — it must not shrink a
    // painted control. Only `nested` and an explicit size token move the face.
    expect(pxOf(compact.container)).toBe(36);
    expect(nested.container.querySelector('[data-avatar-nested]')?.getAttribute('data-avatar-nested')).toBe('true');
  });

  it('lets an explicit size token eject the recipe', () => {
    const { container } = renderWithProviders(<Avatar name="Ada Lovelace" size="$5" />);
    expect(pxOf(container)).toBe(52);
  });

  it('restores the 44px floor with hitSlop when painted below it', () => {
    const onPress = vi.fn();
    const { container } = renderWithProviders(<Avatar name="Ada Lovelace" nested onPress={onPress} />);
    const el = container.querySelector('[data-avatar-interactive]');
    expect(el?.getAttribute('data-avatar-px')).toBe('32');
    expect(el?.getAttribute('data-avatar-hitslop')).toBe('6');
    fireEvent.click(el as Element);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Avatar.Group', () => {
  it('overflows extras as +N (Primer stack cap)', () => {
    const { container } = renderWithProviders(
      <Avatar.Group max={2}>
        <Avatar name="Ada Lovelace" />
        <Avatar name="Grace Hopper" />
        <Avatar name="Alan Turing" />
      </Avatar.Group>,
    );
    expect(container.textContent).toContain('+1');
    expect(container.querySelector('[data-avatar-group]')).toBeTruthy();
    expect(container.querySelector('[data-avatar-overlap]')?.getAttribute('data-avatar-overlap')).toBe('true');
  });

  it('flush square stacks declare no identity circle', () => {
    const { container } = renderWithProviders(
      <Avatar.Group circular={false} overlap={false}>
        <Avatar name="Core Team" />
        <Avatar name="Ops Bot" />
      </Avatar.Group>,
    );
    expect(container.querySelector("[data-radius-class='R-IDENTITY']")).toBeNull();
  });
});

// Avatar is the spec's declared R-IDENTITY part. Knob immunity
// is only legitimate when it is declared, so the declaration is part of the
// contract — the `radius:none` sweep reads it off the DOM and matches it
// against the registry generated from the spec's radius-class table.
describe('Avatar identity-shape declaration', () => {
  const declaration = (container: HTMLElement) => container.querySelector('[data-radius-class]');

  it('declares R-IDENTITY / Avatar while it is a circle', () => {
    const { container } = renderWithProviders(<Avatar name="Ada Lovelace" />);
    const el = declaration(container);
    expect(el?.getAttribute('data-radius-class')).toBe('R-IDENTITY');
    expect(el?.getAttribute('data-radius-part')).toBe('Avatar');
  });

  it('declares on the compound branch too', () => {
    const { container } = renderWithProviders(
      <Avatar size="$3">
        <Avatar.Fallback>
          <span>OK</span>
        </Avatar.Fallback>
      </Avatar>,
    );
    expect(declaration(container)?.getAttribute('data-radius-class')).toBe('R-IDENTITY');
  });

  it('drops the declaration when a consumer ejects to circular={false}', () => {
    const { container } = renderWithProviders(<Avatar name="Ada Lovelace" circular={false} />);
    expect(declaration(container)).toBeNull();
  });
});

// happy-dom cannot cascade Tamagui's class CSS, so the resolved radius is
// read off the atomic `_btlr-*` class the face emits — same technique as
// Button.test.tsx. CIRCULAR-AT-FULL writes a px number, not a `$12` token.
function squareFaceRadiusPx(container: HTMLElement): number | undefined {
  const el = container.querySelector('[data-avatar-px]');
  const token = String(el?.className || '')
    .split(' ')
    .find((c) => c.startsWith('_btlr-'));
  if (!token) {
    return undefined;
  }
  const px = token.match(/^_btlr-(\d+(?:\.\d+)?)px$/);
  if (px) {
    return Number(px[1]);
  }
  const bare = token.match(/^_btlr-(\d+(?:\.\d+)?)$/);
  return bare ? Number(bare[1]) : undefined;
}

describe('Avatar square face radius (CIRCULAR-AT-FULL)', () => {
  const STOPS = {
    none: 0,
    small: 5,
    medium: 9,
    large: 16,
  } as const;
  const FACE = 44;

  it('resolves full to height/2, not the raw $12 token (50)', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Avatar name="Bitspur Labs" circular={false} size={FACE} />
      </Preset>,
    );
    const face = container.querySelector('[data-avatar-px]') as HTMLElement;
    expect(face.getAttribute('data-avatar-px')).toBe(String(FACE));
    const radius = squareFaceRadiusPx(container);
    expect(radius).toBe(FACE / 2);
    expect(radius).not.toBe(50);
    expect(String(face.className)).not.toMatch(/_btlr-t-radius-12/);
    expect(container.querySelector('[data-radius-class]')).toBeNull();
  });

  it('rides the token scale below full and squares at none', () => {
    for (const [stop, px] of Object.entries(STOPS)) {
      const { container } = renderWithProviders(
        <Preset overrides={{ borderRadius: stop as keyof typeof STOPS }}>
          <Avatar name="Bitspur Labs" circular={false} size={FACE} />
        </Preset>,
      );
      expect(squareFaceRadiusPx(container)).toBe(px);
      cleanup();
    }
  });

  it('leaves the circular face on R-IDENTITY — outside the knob', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Avatar name="Ada Lovelace" size={FACE} />
      </Preset>,
    );
    const face = container.querySelector('[data-avatar-px]') as HTMLElement;
    expect(face.getAttribute('data-radius-class')).toBe('R-IDENTITY');
    expect(squareFaceRadiusPx(container)).not.toBe(FACE / 2);
    expect(String(face.className)).toMatch(/_btlr-100000px/);
  });
});
