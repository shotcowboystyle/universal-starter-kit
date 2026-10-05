/**
 * DotIndicator contract specs — the carousel/wheel position indicator.
 * Locks down: one labeled dot per item with aria-current on the active one,
 * click and keyboard (Enter/Space) activation when interactive, read-only
 * mode without button semantics when no onChange is given, and disabled
 * blocking activation.
 */

import { renderWithProviders } from '@repo/test-utils';
import { createThemesBuilder, defaultAccentTheme, defaultBaseTheme, defaultBuilderOptions } from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { fireEvent, render } from '@testing-library/react';
import { TamaguiProvider, createTamagui } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { DotIndicator } from './index';

// House builder themes for the selected-mark assertion — created at MODULE
// scope: tamagui registers a config's theme variables globally at
// createTamagui time, and a config created after the first render (inside a
// test body) never resolves its tokens (forms Progress.spec pattern).
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();
const houseConfig = createTamagui({
  ...configWithoutAnimations,
  animations: animationsCSS,
  themes: houseThemes as any,
});

describe('DotIndicator', () => {
  it('renders one labeled dot per item with aria-current on the active dot', () => {
    const { container } = renderWithProviders(<DotIndicator total={3} activeIndex={1} onChange={() => {}} />);
    const dots = container.querySelectorAll("[aria-label^='Go to item']");
    expect(dots).toHaveLength(3);
    expect(dots[1].getAttribute('aria-current')).toBe('true');
    expect(dots[0].getAttribute('aria-current')).toBeNull();
    expect(dots[2].getAttribute('aria-label')).toBe('Go to item 3');
  });

  it('activates a dot on click', () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(<DotIndicator total={3} activeIndex={0} onChange={onChange} />);
    const dots = container.querySelectorAll("[role='button']");
    expect(dots).toHaveLength(3);
    fireEvent.click(dots[2]);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('activates a dot with Enter and Space', () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(<DotIndicator total={2} activeIndex={0} onChange={onChange} />);
    const dots = container.querySelectorAll("[role='button']");
    fireEvent.keyDown(dots[1], { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(1);
    fireEvent.keyDown(dots[0], { key: ' ' });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('keyboard-focusable dots carry tabIndex 0 when interactive', () => {
    const { container } = renderWithProviders(<DotIndicator total={2} activeIndex={0} onChange={() => {}} />);
    const dots = container.querySelectorAll("[role='button']");
    expect(dots[0].getAttribute('tabindex')).toBe('0');
  });

  it('activates a dot with arrows, Home and End', () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(<DotIndicator total={5} activeIndex={2} onChange={onChange} />);
    const dots = container.querySelectorAll("[role='button']");
    fireEvent.keyDown(dots[2], { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(3);
    fireEvent.keyDown(dots[2], { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(1);
    fireEvent.keyDown(dots[2], { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith(0);
    fireEvent.keyDown(dots[2], { key: 'End' });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('does not ring the 44px hit box on pointer focus', () => {
    const { container } = renderWithProviders(<DotIndicator total={2} activeIndex={0} onChange={() => {}} />);
    const target = container.querySelector("[role='button']") as HTMLElement;
    fireEvent.focus(target);
    expect(container.querySelector('[data-dot-ring]')).toBeNull();
  });

  it('paints pills as idle capsules and dots as idle circles', () => {
    const { container: dotsC } = renderWithProviders(<DotIndicator total={3} activeIndex={0} variant="dots" />);
    const { container: pillsC } = renderWithProviders(<DotIndicator total={3} activeIndex={0} variant="pills" />);
    const dotIdle = dotsC.querySelector('[data-dot-state="idle"]') as HTMLElement;
    const pillIdle = pillsC.querySelector('[data-dot-state="idle"]') as HTMLElement;
    expect(Number(pillIdle.getAttribute('data-mark-width'))).toBeGreaterThan(
      Number(dotIdle.getAttribute('data-mark-width')),
    );
  });

  it('paints bars as ticks wider than tall when unpinned', () => {
    const { container } = renderWithProviders(<DotIndicator total={3} activeIndex={0} variant="bars" />);
    const idle = container.querySelector('[data-dot-state="idle"]') as HTMLElement;
    expect(Number(idle.getAttribute('data-mark-width'))).toBeGreaterThan(Number(idle.getAttribute('data-mark-height')));
  });

  it('windows long strips to five visible marks', () => {
    const { container } = renderWithProviders(<DotIndicator total={10} activeIndex={4} onChange={() => {}} />);
    expect(container.querySelectorAll("[aria-label^='Go to item']")).toHaveLength(10);
    expect(container.querySelectorAll("[data-dot-hidden='true']")).toHaveLength(5);
  });

  it('is read-only (no button semantics) without an onChange', () => {
    const { container } = renderWithProviders(<DotIndicator total={3} activeIndex={0} />);
    expect(container.querySelectorAll("[role='button']")).toHaveLength(0);
    expect(container.querySelectorAll("[aria-label^='Go to item']")).toHaveLength(3);
  });

  it('blocks activation when disabled but keeps button semantics', () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(<DotIndicator total={2} activeIndex={0} onChange={onChange} disabled />);
    const dots = container.querySelectorAll("[role='button']");
    expect(dots).toHaveLength(2);
    fireEvent.click(dots[1]);
    expect(onChange).not.toHaveBeenCalled();
  });

  // ONE-EMPHASIS: the active dot is the selection mark, so it
  // fills with the accent channel (indicator.selected = $accentBackground);
  // idle dots stay neutral chrome. Stock test themes carry no
  // $accentBackground, so mount the house builder themes for real resolution.
  it('paints the active dot with the accent mark and idle dots neutral', () => {
    const { container } = render(
      <TamaguiProvider config={houseConfig} defaultTheme="light" disableInjectCSS>
        <DotIndicator total={3} activeIndex={1} />
      </TamaguiProvider>,
    );
    const active = container.querySelector('[data-dot-state="active"]') as HTMLElement;
    const idle = container.querySelector('[data-dot-state="idle"]') as HTMLElement;
    expect(active).toBeTruthy();
    expect(idle).toBeTruthy();
    expect(active.className).toContain('_bg-accentBackg');
    expect(idle.className).not.toContain('_bg-accentBackg');
  });

  it('picks completed-check ink from luminance, never hardcoded white', () => {
    const { container } = renderWithProviders(<DotIndicator total={3} activeIndex={2} completedSteps={new Set([0])} />);
    const check = container.querySelector('svg');
    expect(check).toBeTruthy();
    const fill = check?.getAttribute('color') || check?.getAttribute('fill') || '';
    expect(fill.toLowerCase()).not.toBe('white');
    expect(fill.toLowerCase()).not.toBe('#ffffff');
    expect(fill.toLowerCase()).not.toBe('#fff');
  });
});
