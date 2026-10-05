/**
 * @vitest-environment jsdom
 */

import { Button } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { OVERLAY_ANCHOR_GAP, Preset, __resetDevWarnSeen } from '@repo/theme';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Tooltip,
  __resetTooltipSkipForTests,
  createNativeTooltipPressHandlers,
  noteTooltipClosed,
  resolveTooltipDelay,
  resolveTooltipPadRecipe,
  resolveTooltipSizeRecipe,
  tooltipPadRecipes,
  tooltipSizeRecipes,
  TOOLTIP_COLLISION_PADDING_PX,
  TOOLTIP_DEFAULT_DELAY_MS,
  TOOLTIP_NATIVE_LONG_PRESS_MS,
  TOOLTIP_SKIP_DELAY_MS,
} from './index';

describe('Tooltip size vs space recipes', () => {
  it('size steps max-width and does not change pad', () => {
    expect(resolveTooltipSizeRecipe('small').maxWidth).toBe(tooltipSizeRecipes.small.maxWidth);
    expect(resolveTooltipSizeRecipe('large').maxWidth).toBe(tooltipSizeRecipes.large.maxWidth);
    expect(resolveTooltipSizeRecipe('small').maxWidth).not.toBe(resolveTooltipSizeRecipe('large').maxWidth);
    expect(resolveTooltipPadRecipe('medium')).toEqual(tooltipPadRecipes.medium);
  });

  it('space steps pad and does not change max-width', () => {
    expect(resolveTooltipPadRecipe('small')).toEqual(tooltipPadRecipes.small);
    expect(resolveTooltipPadRecipe('large')).toEqual(tooltipPadRecipes.large);
    expect(resolveTooltipPadRecipe('small')).not.toEqual(resolveTooltipPadRecipe('large'));
    expect(resolveTooltipSizeRecipe('medium').maxWidth).toBe(tooltipSizeRecipes.medium.maxWidth);
  });

  it('nested bubble recipes stay below the 44px press floor', () => {
    expect(tooltipSizeRecipes.medium.maxWidth).toBeGreaterThan(44);
    expect(tooltipPadRecipes.medium.paddingVertical).not.toBe('$4');
    expect(OVERLAY_ANCHOR_GAP).toBe(4);
    expect(TOOLTIP_COLLISION_PADDING_PX).toBe(8);
  });
});

describe('Tooltip skip delay (Radix / Spectrum cooldown)', () => {
  beforeEach(() => {
    __resetTooltipSkipForTests();
  });

  it('uses the warmup delay until a tooltip has just closed', () => {
    expect(resolveTooltipDelay(TOOLTIP_DEFAULT_DELAY_MS, 1_000)).toBe(TOOLTIP_DEFAULT_DELAY_MS);
  });

  it('skips the delay inside the cooldown window', () => {
    noteTooltipClosed(1_000);
    expect(resolveTooltipDelay(TOOLTIP_DEFAULT_DELAY_MS, 1_000 + 10)).toBe(0);
    expect(resolveTooltipDelay(TOOLTIP_DEFAULT_DELAY_MS, 1_000 + TOOLTIP_SKIP_DELAY_MS + 1)).toBe(
      TOOLTIP_DEFAULT_DELAY_MS,
    );
  });
});

describe('Tooltip interaction', () => {
  beforeEach(() => {
    __resetDevWarnSeen();
    __resetTooltipSkipForTests();
  });

  afterEach(() => {
    __resetDevWarnSeen();
    __resetTooltipSkipForTests();
  });

  it('does not wrap the trigger when disabled', () => {
    const { container } = renderWithProviders(
      <Tooltip content="Nope" disabled>
        <Button>Idle</Button>
      </Tooltip>,
    );
    expect(container.querySelector("[data-tooltip='content']")).toBeNull();
    expect(container.textContent).toContain('Idle');
  });

  it('Escape closes a controlled open tooltip without moving focus into it', () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <Tooltip content="Hint" open onOpenChange={onOpenChange}>
        <Button>Edit</Button>
      </Tooltip>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Tooltip content rides the border, elevation and animation knobs', () => {
  const stops = [
    { borderWidth: 'none', elevation: 'none', animation: 'none' },
    { borderWidth: 'small', elevation: 'small', animation: 'quick' },
    { borderWidth: 'large', elevation: 'large', animation: 'slow' },
  ] as const;

  async function measure(stop: (typeof stops)[number]) {
    const result = renderWithProviders(
      <Preset overrides={stop}>
        <Tooltip content="Hint" open>
          <Button>Edit</Button>
        </Tooltip>
      </Preset>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const content = document.querySelector<HTMLElement>("[data-tooltip='content']");
    const classes = content?.className.split(/\s+/) ?? [];
    const measured = {
      mounted: content !== null,
      border: classes.find((c) => c.startsWith('_btw-')),
      shadow: classes.find((c) => c.startsWith('_bxsh-'))?.match(/^_bxsh-\d+px\d+px\d+px/)?.[0],
      transition: content?.style.transition.match(/^all \d+ms/)?.[0],
    };
    result.unmount();
    return measured;
  }

  it('follows each stop on the mounted bubble, and none carries no border, shadow or motion', async () => {
    const none = await measure(stops[0]);
    const small = await measure(stops[1]);
    const large = await measure(stops[2]);
    expect(none).toEqual({
      mounted: true,
      border: '_btw-0px',
      shadow: undefined,
      transition: undefined,
    });
    expect(small).toMatchObject({
      mounted: true,
      border: '_btw-0--5px',
      shadow: '_bxsh-0px3px6px',
    });
    // Overlay large is the ladder's own $5 dialog stop, not the control $4.
    expect(large).toMatchObject({ mounted: true, border: '_btw-2px', shadow: '_bxsh-0px12px24px' });
    expect(small.transition).toMatch(/^all \d+ms$/);
    expect(large.transition).toMatch(/^all \d+ms$/);
    expect(large.transition).not.toBe(small.transition);
  });
});

describe('Tooltip native long-press open path', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens after the ~500ms press-in delay and closes on press-out', () => {
    const setOpen = vi.fn();
    const press = createNativeTooltipPressHandlers(setOpen, TOOLTIP_NATIVE_LONG_PRESS_MS);
    press.pressIn();
    vi.advanceTimersByTime(TOOLTIP_NATIVE_LONG_PRESS_MS - 1);
    expect(setOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setOpen).toHaveBeenCalledWith(true);
    press.pressOut();
    expect(setOpen).toHaveBeenLastCalledWith(false);
    press.dispose();
  });

  it('cancels a pending press-in when the finger lifts early', () => {
    const setOpen = vi.fn();
    const press = createNativeTooltipPressHandlers(setOpen);
    press.pressIn();
    press.pressOut();
    vi.advanceTimersByTime(TOOLTIP_NATIVE_LONG_PRESS_MS);
    expect(setOpen).toHaveBeenCalledTimes(1);
    expect(setOpen).toHaveBeenCalledWith(false);
    press.dispose();
  });

  it('opens on long-press and closes on tap outside', () => {
    const setOpen = vi.fn();
    const press = createNativeTooltipPressHandlers(setOpen);
    press.longPress();
    expect(setOpen).toHaveBeenCalledWith(true);
    press.tapOutside();
    expect(setOpen).toHaveBeenLastCalledWith(false);
    press.dispose();
  });
});
