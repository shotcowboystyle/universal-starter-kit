import { renderWithProviders } from '@repo/test-utils';
import { createThemesBuilder, defaultAccentTheme, defaultBaseTheme, defaultBuilderOptions } from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { fireEvent, render } from '@testing-library/react';
import { TamaguiProvider, createTamagui } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { ProgressSteps } from './index';

const steps = [{ label: 'One' }, { label: 'Two' }, { label: 'Three' }];

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

describe('ProgressSteps', () => {
  it('marks the current step with aria-current=step', () => {
    const { container } = renderWithProviders(<ProgressSteps steps={steps} current={1} />);
    const current = container.querySelector('[aria-current="step"]');
    expect(current).toBeTruthy();
    expect(container.textContent).toContain('Two');
  });

  // One emphasis: the current step marker is a
  // selection mark, so it fills with the accent channel (indicator.selected),
  // never the ink tier it used to take. House themes mounted because the
  // stock test themes carry no $accentBackground.
  it('paints the current marker with the accent mark', () => {
    const { container } = render(
      <TamaguiProvider config={houseConfig} defaultTheme="light" disableInjectCSS>
        <ProgressSteps steps={steps} current={1} />
      </TamaguiProvider>,
    );
    const current = container.querySelector('[aria-current="step"]') as HTMLElement;
    expect(current).toBeTruthy();
    expect(current.className).toContain('_bg-accentBackg');
  });

  it('keeps the dark current fill on $accentBackground now the build holds it to 4.5', () => {
    const { container } = render(
      <TamaguiProvider config={houseConfig} defaultTheme="dark" disableInjectCSS>
        <ProgressSteps steps={steps} current={1} />
      </TamaguiProvider>,
    );
    const current = container.querySelector('[aria-current="step"]') as HTMLElement;
    expect(current).toBeTruthy();
    expect(current.className).toContain('_bg-accentBackg');
  });

  it('calls onStepChange when jumping back to a completed step', () => {
    const onStepChange = vi.fn();
    const { container } = renderWithProviders(<ProgressSteps steps={steps} current={1} onStepChange={onStepChange} />);
    const jump = container.querySelector('[aria-label="Go to step 1: One"]');
    expect(jump).toBeTruthy();
    fireEvent.click(jump as Element);
    expect(onStepChange).toHaveBeenCalledWith(0);
  });

  it('keeps upcoming steps inert when linear', () => {
    const onStepChange = vi.fn();
    const { container } = renderWithProviders(<ProgressSteps steps={steps} current={0} onStepChange={onStepChange} />);
    expect(container.querySelector('[aria-label="Go to step 2: Two"]')).toBeFalsy();
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it('jumps to upcoming steps when linear is false', () => {
    const onStepChange = vi.fn();
    const { container } = renderWithProviders(
      <ProgressSteps steps={steps} current={0} linear={false} onStepChange={onStepChange} />,
    );
    const jump = container.querySelector('[aria-label="Go to step 2: Two"]');
    expect(jump).toBeTruthy();
    fireEvent.click(jump as Element);
    expect(onStepChange).toHaveBeenCalledWith(1);
  });

  it('does not expose jump buttons without onStepChange', () => {
    const { container } = renderWithProviders(<ProgressSteps steps={steps} current={0} />);
    expect(container.querySelector('[aria-label="Go to step 2: Two"]')).toBeFalsy();
  });

  it('publishes density without pinning compact (labels at 400)', () => {
    const { container } = renderWithProviders(<ProgressSteps steps={steps} current={1} />);
    const root = container.querySelector('[role="list"]') as HTMLElement;
    expect(root.getAttribute('data-density')).toBeTruthy();
    const labels = Array.from(container.querySelectorAll('[role="list"] *')).filter(
      (el) => el.textContent === 'Two' && (el as HTMLElement).style?.fontWeight,
    );
    for (const el of labels) {
      const weight = (el as HTMLElement).style.fontWeight || getComputedStyle(el).fontWeight;
      expect(['400', 'normal', '']).toContain(String(weight));
    }
  });

  it('paints markers at nestedControl size, not the 44px press floor', () => {
    const { container } = renderWithProviders(<ProgressSteps steps={steps} current={1} />);
    const marker = container.querySelector('[data-nested-px]') as HTMLElement;
    expect(marker).toBeTruthy();
    expect(marker.getAttribute('data-nested-px')).toBe('32');
    const target = container.querySelector('[data-press-min]') as HTMLElement;
    expect(target.getAttribute('data-press-min')).toBe('44');
  });

  it('declares the marker R-PILL and tracks the borderWidth knob for the ring', () => {
    const { container } = renderWithProviders(<ProgressSteps steps={steps} current={1} />);
    const marker = container.querySelector('[data-nested-px]') as HTMLElement;
    expect(marker.getAttribute('data-radius-class')).toBe('R-PILL');
    expect(marker.getAttribute('data-radius-part')).toBe('ProgressSteps marker');
    // Default knobs: borderWidth medium = 1. The previous 2px pin is gone.
    const upcoming = container.querySelector('[data-step-state="upcoming"]') as HTMLElement;
    expect(upcoming.getAttribute('data-marker-ring')).toBe('1');
    const current = container.querySelector('[data-step-state="current"]') as HTMLElement;
    expect(current.getAttribute('data-marker-ring')).toBe('1');
  });

  it('keeps nested marker size on the size channel under compact', () => {
    const { container } = renderWithProviders(<ProgressSteps steps={steps} current={0} compact />);
    const root = container.querySelector('[role="list"]') as HTMLElement;
    expect(root.getAttribute('data-density')).toBe('compact');
    const marker = container.querySelector('[data-nested-px]') as HTMLElement;
    // Compact steps space only — nestedControl follows size (medium = 32).
    expect(marker.getAttribute('data-nested-px')).toBe('32');
  });

  it('hides visible step labels when labels is hidden', () => {
    const { container } = renderWithProviders(<ProgressSteps steps={steps} current={1} labels="hidden" />);
    expect(container.querySelector("[data-labels='hidden']")).toBeTruthy();
    expect(container.textContent).not.toContain('One');
    expect(container.textContent).not.toContain('Two');
    expect(container.querySelector('[aria-current="step"]')).toBeTruthy();
  });

  it('flags an error step on the marker', () => {
    const { container } = renderWithProviders(
      <ProgressSteps steps={[{ label: 'One' }, { label: 'Two', error: true, description: 'Fix this' }]} current={1} />,
    );
    const marker = container.querySelector('[data-step-state="error"]');
    expect(marker).toBeTruthy();
    expect(container.textContent).toContain('Fix this');
  });
});
