import { TagIcon } from '@phosphor-icons/react';
import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chip, ChipFrame, ChipText, chipIconSize, chipTone } from './index';

describe('Chip', () => {
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
    const onDismiss = vi.fn();
    const result = renderWithProviders(
      <Chip disabled onDismiss={onDismiss}>
        Locked
      </Chip>,
    );
    expect(result.container.querySelector("[aria-label='Remove']")).toBeNull();
  });

  it('dismiss fires onDismiss when the click lands on the inner ring', () => {
    const onDismiss = vi.fn();
    const result = renderWithProviders(<Chip onDismiss={onDismiss}>Tag</Chip>);
    const target = result.container.querySelector("[aria-label='Remove']") as HTMLElement;
    expect(target).not.toBeNull();
    const inner = (target.firstElementChild ?? target) as HTMLElement;
    fireEvent.click(inner);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismiss fires onDismiss on Enter', () => {
    const onDismiss = vi.fn();
    const result = renderWithProviders(<Chip onDismiss={onDismiss}>Tag</Chip>);
    const target = result.container.querySelector("[aria-label='Remove']") as HTMLElement;
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('filled and ghost paint different surfaces (solid is no longer a synonym of subtle)', () => {
    const filled = renderWithProviders(<Chip variant="filled">Solid</Chip>);
    const ghost = renderWithProviders(<Chip variant="ghost">Tint</Chip>);
    const filledFrame = filled.container.querySelector('[data-chip]') as HTMLElement;
    const ghostFrame = ghost.container.querySelector('[data-chip]') as HTMLElement;
    expect(filledFrame.className).toMatch(/_bg-/);
    expect(ghostFrame.className).toMatch(/_bg-/);
    expect(filledFrame.className).not.toEqual(ghostFrame.className);
  });

  it('maps solid/subtle/outline onto filled/ghost/outlined', () => {
    expect(chipTone('solid')).toBe('filled');
    expect(chipTone('subtle')).toBe('ghost');
    expect(chipTone('outline')).toBe('outlined');
    expect(chipTone('filled')).toBe('filled');
    expect(chipTone('ghost')).toBe('ghost');
    expect(chipTone(undefined)).toBe('ghost');
  });

  it('selected interactive chip is a pressed toggle and marks the fill', () => {
    const onPress = vi.fn();
    const result = renderWithProviders(
      <Chip selected onPress={onPress}>
        Fire
      </Chip>,
    );
    const frame = result.container.querySelector('[data-chip]') as HTMLElement;
    expect(frame.getAttribute('aria-pressed')).toBe('true');
    expect(frame.getAttribute('data-selected')).toBe('true');
    expect(frame.getAttribute('role')).toBe('button');
    fireEvent.click(frame);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Enter activates an interactive chip', () => {
    const onPress = vi.fn();
    const result = renderWithProviders(<Chip onPress={onPress}>Assist</Chip>);
    const frame = result.container.querySelector('[data-chip]') as HTMLElement;
    fireEvent.keyDown(frame, { key: 'Enter' });
    expect(onPress).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(frame, { key: ' ' });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('dismiss does not fire onPress (two focusables, two actions)', () => {
    const onPress = vi.fn();
    const onDismiss = vi.fn();
    const result = renderWithProviders(
      <Chip onPress={onPress} onDismiss={onDismiss}>
        Both
      </Chip>,
    );
    const dismiss = result.container.querySelector("[aria-label='Remove']") as HTMLElement;
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('dismiss ring class is on the glyph box, not the 44px floor', () => {
    const result = renderWithProviders(<Chip onDismiss={() => {}}>Tag</Chip>);
    const floor = result.container.querySelector('.mp-chip-dismiss') as HTMLElement;
    const ring = result.container.querySelector('.mp-chip-dismiss-ring') as HTMLElement;
    expect(floor).not.toBeNull();
    expect(ring).not.toBeNull();
    expect(floor.contains(ring)).toBe(true);
    expect(floor.className).not.toMatch(/mp-chip-dismiss-ring/);
  });

  it('dismiss floor carries no hover/press background paint', () => {
    const paintedStateAtom = /_bg-0(?:hover|active)-(?!transparent)/;
    const result = renderWithProviders(<Chip onDismiss={() => {}}>Tag</Chip>);
    const floor = result.container.querySelector("[aria-label='Remove']") as HTMLElement;
    expect(floor.className).not.toMatch(paintedStateAtom);
    const ring = floor.firstElementChild as HTMLElement;
    expect(ring.className).toMatch(/_bg-0hover-color5/);
  });

  it('static chip is not a tab stop; interactive chip is', () => {
    const idle = renderWithProviders(<Chip>Idle</Chip>);
    expect(idle.container.querySelector('[data-chip]')!.getAttribute('tabindex')).toBeNull();
    const live = renderWithProviders(<Chip onPress={() => {}}>Go</Chip>);
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
    expect(typeof mod.chipIconSize).toBe('function');
    expect(chipIconSize('$3')).toBeGreaterThan(0);
    expect('default' in mod).toBe(false);
  });

  it('label TEXT NODE weight is 400, never 500/600', () => {
    const result = renderWithProviders(
      <>
        <Chip>Ghost-label</Chip>
        <Chip variant="filled">Filled-label</Chip>
        <Chip variant="outlined">Outlined-label</Chip>
        <Chip selected onPress={() => {}}>
          Selected-label
        </Chip>
      </>,
    );
    for (const text of ['Ghost-label', 'Filled-label', 'Outlined-label', 'Selected-label']) {
      const node = result.findTextElement(text) as HTMLElement;
      expect(node.className).toMatch(/_fow-400\b/);
      expect(node.className).not.toMatch(/_fow-500\b/);
      expect(node.className).not.toMatch(/_fow-600\b/);
    }
  });

  it('DEFAULT radius class: frame squares at none and follows the scale to full', () => {
    const none = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Chip>Square</Chip>
      </Preset>,
    );
    const noneFrame = none.container.querySelector('[data-chip]') as HTMLElement;
    expect(
      String(noneFrame.className)
        .split(' ')
        .filter((c) => c.startsWith('_btlr-')),
    ).toEqual(['_btlr-t-radius-0']);
    expect(noneFrame.getAttribute('data-radius-class')).toBeNull();

    const full = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Chip>Pill</Chip>
      </Preset>,
    );
    const fullFrame = full.container.querySelector('[data-chip]') as HTMLElement;
    expect(
      String(fullFrame.className)
        .split(' ')
        .filter((c) => c.startsWith('_btlr-')),
    ).toEqual(['_btlr-t-radius-12']);
  });

  it('dismiss is CIRCULAR-AT-FULL: the token below full, a circle at full', () => {
    const radiusAt = (borderRadius: 'none' | 'small' | 'medium' | 'full') => {
      const result = renderWithProviders(
        <Preset overrides={{ borderRadius }}>
          <Chip onDismiss={() => {}}>Dismiss</Chip>
        </Preset>,
      );
      const button = result.container.querySelector("[aria-label='Remove']") as HTMLElement;
      const ring = button.querySelector('.mp-chip-dismiss-ring') as HTMLElement;
      const atoms = [button, ring].map((el) =>
        String(el.className)
          .split(' ')
          .filter((c) => c.startsWith('_btlr-')),
      );
      result.unmount();
      return atoms;
    };
    expect(radiusAt('none')).toEqual([['_btlr-0px'], ['_btlr-0px']]);
    expect(radiusAt('small')).toEqual([['_btlr-5px'], ['_btlr-5px']]);
    expect(radiusAt('medium')).toEqual([['_btlr-9px'], ['_btlr-9px']]);
    expect(radiusAt('full')).toEqual([['_btlr-1000px'], ['_btlr-1000px']]);
  });
});
