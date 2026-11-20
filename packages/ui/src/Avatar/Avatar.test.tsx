import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Avatar, fallbackTone, fallbackToneIndex, getInitials } from './index';

/** Painted diameter the face publishes on `data-avatar-px`. */
const pxOf = (container: HTMLElement) =>
  Number(container.querySelector<HTMLElement>('[data-avatar-px]')?.dataset.avatarPx);

const declaration = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-radius-class]');

describe(getInitials, () => {
  afterEach(cleanup);

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

describe(fallbackTone, () => {
  afterEach(cleanup);

  it('is stable for the same seed', () => {
    expect(fallbackToneIndex('Ada Lovelace')).toBe(fallbackToneIndex('Ada Lovelace'));
    expect(fallbackTone('Ada Lovelace')).toStrictEqual(fallbackTone('Ada Lovelace'));
  });

  it('diverges for different names', () => {
    expect(fallbackTone('Ada Lovelace')?.bg).not.toBe(fallbackTone('Grace Hopper')?.bg);
  });
});

describe(Avatar, () => {
  afterEach(cleanup);

  it('renders initials from name', () => {
    const { container } = renderWithProviders(<Avatar name="Ada Lovelace" />);
    expect(container.textContent).toContain('AL');
  });

  it('respects explicit initials override', () => {
    const { container } = renderWithProviders(
      <Avatar
        name="Ada Lovelace"
        initials="XX"
      />,
    );
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
    const nested = renderWithProviders(
      <Avatar
        name="Ada Lovelace"
        nested
      />,
    );
    const compact = renderWithProviders(
      <Avatar
        name="Ada Lovelace"
        compact
      />,
    );
    expect(pxOf(page.container)).toBe(36);
    expect(pxOf(nested.container)).toBe(32);
    // Density is not size. `compact` steps SPACE only (see
    // resolveKnobs.applyDensity / compactSpaceMap) — it must not shrink a
    // painted control. Only `nested` and an explicit size token move the face.
    expect(pxOf(compact.container)).toBe(36);
    expect(nested.container.querySelector<HTMLElement>('[data-avatar-nested]')?.dataset.avatarNested).toBe('true');
  });

  it('lets an explicit size token eject the recipe', () => {
    const { container } = renderWithProviders(
      <Avatar
        name="Ada Lovelace"
        size="$5"
      />,
    );
    expect(pxOf(container)).toBe(52);
  });

  it('restores the 44px floor with hitSlop when painted below it', () => {
    const onPress = vi.fn<() => void>();
    const { container } = renderWithProviders(
      <Avatar
        name="Ada Lovelace"
        nested
        onPress={onPress}
      />,
    );
    const el = container.querySelector<HTMLElement>('[data-avatar-interactive]');
    expect(el?.dataset.avatarPx).toBe('32');
    expect(el?.dataset.avatarHitslop).toBe('6');
    fireEvent.click(el!);
    expect(onPress).toHaveBeenCalledOnce();
  });
});

describe('Avatar.Group', () => {
  afterEach(cleanup);

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
    expect(container.querySelector<HTMLElement>('[data-avatar-overlap]')?.dataset.avatarOverlap).toBe('true');
  });

  it('flush square stacks declare no identity circle', () => {
    const { container } = renderWithProviders(
      <Avatar.Group
        circular={false}
        overlap={false}>
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
  afterEach(cleanup);

  it('declares R-IDENTITY / Avatar while it is a circle', () => {
    const { container } = renderWithProviders(<Avatar name="Ada Lovelace" />);
    const el = declaration(container);
    expect(el?.dataset.radiusClass).toBe('R-IDENTITY');
    expect(el?.dataset.radiusPart).toBe('Avatar');
  });

  it('declares on the compound branch too', () => {
    const { container } = renderWithProviders(
      <Avatar size="$3">
        <Avatar.Fallback>
          <span>OK</span>
        </Avatar.Fallback>
      </Avatar>,
    );
    expect(declaration(container)?.dataset.radiusClass).toBe('R-IDENTITY');
  });

  it('drops the declaration when a consumer ejects to circular={false}', () => {
    const { container } = renderWithProviders(
      <Avatar
        name="Ada Lovelace"
        circular={false}
      />,
    );
    expect(declaration(container)).toBeNull();
  });
});

// happy-dom cannot cascade Tamagui's class CSS, so the resolved radius is
// read off the atomic `_btlr-*` class the face emits — same technique as
// Button.test.tsx. CIRCULAR-AT-FULL writes a px number, not a `$12` token.
const squareFaceRadiusPx = (container: HTMLElement): number | undefined => {
  const el = container.querySelector('[data-avatar-px]');
  const token = (el?.getAttribute('class') ?? '').split(' ').find((c) => c.startsWith('_btlr-'));
  if (token === undefined) {
    return undefined;
  }
  const px = /^_btlr-(?<value>\d+(?:\.\d+)?)px$/u.exec(token)?.groups?.value;
  if (px !== undefined) {
    return Number(px);
  }
  const bare = /^_btlr-(?<value>\d+(?:\.\d+)?)$/u.exec(token)?.groups?.value;
  return bare === undefined ? undefined : Number(bare);
};

describe('Avatar square face radius (CIRCULAR-AT-FULL)', () => {
  afterEach(cleanup);

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
        <Avatar
          name="Bitspur Labs"
          circular={false}
          size={FACE}
        />
      </Preset>,
    );
    const face = container.querySelector<HTMLElement>('[data-avatar-px]')!;
    expect(face.dataset.avatarPx).toBe(String(FACE));
    const radius = squareFaceRadiusPx(container);
    expect(radius).toBe(FACE / 2);
    expect(radius).not.toBe(50);
    expect(face.className).not.toMatch(/_btlr-t-radius-12/u);
    expect(container.querySelector('[data-radius-class]')).toBeNull();
  });

  it('rides the token scale below full and squares at none', () => {
    for (const [stop, px] of Object.entries(STOPS)) {
      const { container } = renderWithProviders(
        <Preset overrides={{ borderRadius: stop as keyof typeof STOPS }}>
          <Avatar
            name="Bitspur Labs"
            circular={false}
            size={FACE}
          />
        </Preset>,
      );
      expect(squareFaceRadiusPx(container)).toBe(px);
      cleanup();
    }
  });

  it('leaves the circular face on R-IDENTITY — outside the knob', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Avatar
          name="Ada Lovelace"
          size={FACE}
        />
      </Preset>,
    );
    const face = container.querySelector<HTMLElement>('[data-avatar-px]')!;
    expect(face.dataset.radiusClass).toBe('R-IDENTITY');
    expect(squareFaceRadiusPx(container)).not.toBe(FACE / 2);
    expect(face.className).toMatch(/_btlr-100000px/u);
  });
});
