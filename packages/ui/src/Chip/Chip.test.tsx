import { TagIcon } from '@phosphor-icons/react';
import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chip, ChipFrame, ChipText, chipIconSize, chipTone } from './index';

const noop = (): void => undefined;

const radiusAt = (borderRadius: Knobs['borderRadius']) => {
  const result = renderWithProviders(
    <Preset overrides={{ borderRadius }}>
      <Chip onDismiss={noop}>Dismiss</Chip>
    </Preset>,
  );
  const button = result.container.querySelector<HTMLElement>("[aria-label='Remove']")!;
  const ring = button.querySelector<HTMLElement>('.mp-chip-dismiss-ring')!;
  const atoms = [button, ring].map((el) => el.className.split(' ').filter((c) => c.startsWith('_btlr-')));
  result.unmount();
  return atoms;
};

describe(Chip, () => {
  it('renders its label', () => {
    const result = renderWithProviders(<Chip>Tag</Chip>);
    expect(result.findTextElement('Tag')).toBeDefined();
  });

  it('disabled chip exposes aria-disabled on its frame', () => {
    const result = renderWithProviders(<Chip disabled>Muted</Chip>);
    expect(result.container.querySelector("[aria-disabled='true']")).not.toBeNull();
  });

  it('enabled chip carries no aria-disabled', () => {
    const result = renderWithProviders(<Chip>Live</Chip>);
    expect(result.container.querySelector("[aria-disabled='true']")).toBeNull();
  });

  it('disabled chip removes the dismiss affordance', () => {
    const onDismiss = vi.fn<() => void>();
    const result = renderWithProviders(
      <Chip
        disabled
        onDismiss={onDismiss}>
        Locked
      </Chip>,
    );
    expect(result.container.querySelector("[aria-label='Remove']")).toBeNull();
  });

  it('dismiss fires onDismiss when the click lands on the inner ring', () => {
    const onDismiss = vi.fn<() => void>();
    const result = renderWithProviders(<Chip onDismiss={onDismiss}>Tag</Chip>);
    const target = result.container.querySelector<HTMLElement>("[aria-label='Remove']")!;
    expect(target).not.toBeNull();
    const inner = (target.firstElementChild ?? target) as HTMLElement;
    fireEvent.click(inner);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('dismiss fires onDismiss on Enter', () => {
    const onDismiss = vi.fn<() => void>();
    const result = renderWithProviders(<Chip onDismiss={onDismiss}>Tag</Chip>);
    const target = result.container.querySelector<HTMLElement>("[aria-label='Remove']")!;
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('filled and ghost paint different surfaces (solid is no longer a synonym of subtle)', () => {
    const filled = renderWithProviders(<Chip variant="filled">Solid</Chip>);
    const ghost = renderWithProviders(<Chip variant="ghost">Tint</Chip>);
    const filledFrame = filled.container.querySelector<HTMLElement>('[data-chip]')!;
    const ghostFrame = ghost.container.querySelector<HTMLElement>('[data-chip]')!;
    expect(filledFrame.className).toMatch(/_bg-/u);
    expect(ghostFrame.className).toMatch(/_bg-/u);
    expect(filledFrame.className).not.toStrictEqual(ghostFrame.className);
  });

  it('maps solid/subtle/outline onto filled/ghost/outlined', () => {
    expect(chipTone('solid')).toBe('filled');
    expect(chipTone('subtle')).toBe('ghost');
    expect(chipTone('outline')).toBe('outlined');
    expect(chipTone('filled')).toBe('filled');
    expect(chipTone('ghost')).toBe('ghost');
    expect(chipTone()).toBe('ghost');
  });

  it('selected interactive chip is a pressed toggle and marks the fill', () => {
    const onPress = vi.fn<() => void>();
    const result = renderWithProviders(
      <Chip
        selected
        onPress={onPress}>
        Fire
      </Chip>,
    );
    const frame = result.container.querySelector<HTMLElement>('[data-chip]')!;
    expect(frame.getAttribute('aria-pressed')).toBe('true');
    expect(frame.dataset.selected).toBe('true');
    expect(frame.getAttribute('role')).toBe('button');
    fireEvent.click(frame);
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('Enter activates an interactive chip', () => {
    const onPress = vi.fn<() => void>();
    const result = renderWithProviders(<Chip onPress={onPress}>Assist</Chip>);
    const frame = result.container.querySelector<HTMLElement>('[data-chip]')!;
    fireEvent.keyDown(frame, { key: 'Enter' });
    expect(onPress).toHaveBeenCalledOnce();
    fireEvent.keyDown(frame, { key: ' ' });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('dismiss does not fire onPress (two focusables, two actions)', () => {
    const onPress = vi.fn<() => void>();
    const onDismiss = vi.fn<() => void>();
    const result = renderWithProviders(
      <Chip
        onPress={onPress}
        onDismiss={onDismiss}>
        Both
      </Chip>,
    );
    const dismiss = result.container.querySelector<HTMLElement>("[aria-label='Remove']")!;
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('dismiss ring class is on the glyph box, not the 44px floor', () => {
    const result = renderWithProviders(<Chip onDismiss={noop}>Tag</Chip>);
    const floor = result.container.querySelector<HTMLElement>('.mp-chip-dismiss')!;
    const ring = result.container.querySelector<HTMLElement>('.mp-chip-dismiss-ring')!;
    expect(floor).not.toBeNull();
    expect(ring).not.toBeNull();
    expect(floor.contains(ring)).toBe(true);
    expect(floor.className).not.toMatch(/mp-chip-dismiss-ring/u);
  });

  it('dismiss floor carries no hover/press background paint', () => {
    const paintedStateAtom = /_bg-0(?:hover|active)-(?!transparent)/u;
    const result = renderWithProviders(<Chip onDismiss={noop}>Tag</Chip>);
    const floor = result.container.querySelector<HTMLElement>("[aria-label='Remove']")!;
    expect(floor.className).not.toMatch(paintedStateAtom);
    const ring = floor.firstElementChild as HTMLElement;
    expect(ring.className).toMatch(/_bg-0hover-color5/u);
  });

  it('static chip is not a tab stop; interactive chip is', () => {
    const idle = renderWithProviders(<Chip>Idle</Chip>);
    expect(idle.container.querySelector('[data-chip]')!.getAttribute('tabindex')).toBeNull();
    const live = renderWithProviders(<Chip onPress={noop}>Go</Chip>);
    expect(live.container.querySelector('[data-chip]')!.getAttribute('tabindex')).toBe('0');
  });

  it('renders a leading icon slot', () => {
    const result = renderWithProviders(<Chip icon=<TagIcon />>Tagged</Chip>);
    expect(result.container.querySelector('svg')).not.toBeNull();
  });

  it('exposes named Chip exports and no default', async () => {
    const mod = await import('./index');
    expect(mod.Chip).toBe(Chip);
    expect(mod.ChipFrame).toBe(ChipFrame);
    expect(mod.ChipText).toBe(ChipText);
    expect(mod.chipTone).toBe(chipTone);
    expect(mod.chipIconSize).toBeTypeOf('function');
    expect(chipIconSize('$3')).toBeGreaterThan(0);
    expect('default' in mod).toBe(false);
  });

  it('label TEXT NODE weight is 400, never 500/600', () => {
    const result = renderWithProviders(
      <>
        <Chip>Ghost-label</Chip>
        <Chip variant="filled">Filled-label</Chip>
        <Chip variant="outlined">Outlined-label</Chip>
        <Chip
          selected
          onPress={noop}>
          Selected-label
        </Chip>
      </>,
    );
    for (const text of ['Ghost-label', 'Filled-label', 'Outlined-label', 'Selected-label']) {
      const node = result.findTextElement(text) as HTMLElement;
      expect(node.className).toMatch(/_fow-400\b/u);
      expect(node.className).not.toMatch(/_fow-500\b/u);
      expect(node.className).not.toMatch(/_fow-600\b/u);
    }
  });

  it('DEFAULT radius class: frame squares at none and follows the scale to full', () => {
    const none = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Chip>Square</Chip>
      </Preset>,
    );
    const noneFrame = none.container.querySelector<HTMLElement>('[data-chip]')!;
    expect(noneFrame.className.split(' ').filter((c) => c.startsWith('_btlr-'))).toStrictEqual(['_btlr-t-radius-0']);
    expect(noneFrame.dataset.radiusClass).toBeUndefined();

    const full = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Chip>Pill</Chip>
      </Preset>,
    );
    const fullFrame = full.container.querySelector<HTMLElement>('[data-chip]')!;
    expect(fullFrame.className.split(' ').filter((c) => c.startsWith('_btlr-'))).toStrictEqual(['_btlr-t-radius-12']);
  });

  it('dismiss is CIRCULAR-AT-FULL: the token below full, a circle at full', () => {
    expect(radiusAt('none')).toStrictEqual([['_btlr-0px'], ['_btlr-0px']]);
    expect(radiusAt('small')).toStrictEqual([['_btlr-5px'], ['_btlr-5px']]);
    expect(radiusAt('medium')).toStrictEqual([['_btlr-9px'], ['_btlr-9px']]);
    expect(radiusAt('full')).toStrictEqual([['_btlr-1000px'], ['_btlr-1000px']]);
  });
});
