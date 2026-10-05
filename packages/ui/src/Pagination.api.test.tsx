/**
 * Pagination public-API surface lock.
 *
 * The dot strip is no longer a second implementation inside this file — it is
 * the catalog `DotIndicator` — so every prop that used to be answered by the
 * inline dots body is now answered by a composition. That is exactly the kind
 * of change that silently drops features, so each published prop gets a test
 * asserting the observable behavior it buys, not the internals that deliver it.
 *
 * Deliberately included: the DOM contract other suites and the live probes
 * assert against (`data-pagination-dot`, the bold check glyph, "Go to step N"),
 * because a published component's probe hooks are part of what consumers rely on.
 */

import { renderWithProviders } from '@repo/test-utils';
import { createThemesBuilder, defaultAccentTheme, defaultBaseTheme, defaultBuilderOptions } from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { fireEvent, render } from '@testing-library/react';
import { TamaguiProvider, createTamagui } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Pagination, getPaginationItems } from './Pagination';

// House builder themes for the selected-mark assertions — created at MODULE
// scope: tamagui registers a config's theme variables globally at
// createTamagui time, and a config created after the first render never
// resolves its tokens (forms Progress.spec pattern).
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();
const houseConfig = createTamagui({
  ...configWithoutAnimations,
  animations: animationsCSS,
  themes: houseThemes as any,
});

const dots = (c: HTMLElement) => c.querySelectorAll('[data-pagination-dot]');
const activeDot = (c: HTMLElement) => c.querySelectorAll('[data-pagination-dot="active"]');
const pageButtons = (c: HTMLElement) => c.querySelectorAll('[aria-label^="Page "]');
const byLabel = (c: HTMLElement, label: string) => c.querySelector(`[aria-label="${label}"]`);
/** The pressable wrapper the strip primitive puts around each painted dot. */
const stepTargets = (c: HTMLElement) => c.querySelectorAll('[aria-label^="Go to step"]');

describe('Pagination public API — variants', () => {
  it('defaults to the dots strip and marks exactly one dot current', () => {
    const { container } = renderWithProviders(<Pagination total={5} activeIndex={2} />);
    expect(dots(container)).toHaveLength(5);
    expect(activeDot(container)).toHaveLength(1);
    expect(container.querySelector('[aria-current="step"]')).toBeTruthy();
  });

  it('variant="dots" is explicit and equivalent to the default', () => {
    const { container } = renderWithProviders(<Pagination variant="dots" total={4} activeIndex={1} />);
    expect(dots(container)).toHaveLength(4);
    expect(activeDot(container)).toHaveLength(1);
  });

  it('variant="bars" renders the strip and never carries a completion glyph', () => {
    const { container } = renderWithProviders(
      <Pagination variant="bars" total={5} activeIndex={2} completedSteps={new Set([0, 1])} />,
    );
    expect(dots(container)).toHaveLength(5);
    expect(activeDot(container)).toHaveLength(1);
    expect(container.querySelectorAll('[data-pagination-dot] svg')).toHaveLength(0);
  });

  it('variant="numbered" renders page buttons with aria-current="page" and no dots', () => {
    const { container } = renderWithProviders(<Pagination variant="numbered" total={5} page={3} />);
    expect(dots(container)).toHaveLength(0);
    expect(pageButtons(container)).toHaveLength(5);
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('3');
  });

  it('publishes one navigation landmark whose label a consumer can override', () => {
    const { container } = renderWithProviders(<Pagination total={3} activeIndex={0} />);
    expect(container.querySelector('[role="navigation"]')?.getAttribute('aria-label')).toBe('Pagination');
    const { container: c2 } = renderWithProviders(
      <Pagination total={3} activeIndex={0} aria-label="Table pagination" />,
    );
    expect(c2.querySelector('[role="navigation"]')?.getAttribute('aria-label')).toBe('Table pagination');
  });
});

describe('Pagination public API — wizard props', () => {
  it('completedSteps paints a bold checkmark on each completed dot, not on the current one', () => {
    const { container } = renderWithProviders(
      <Pagination total={5} activeIndex={2} completedSteps={new Set([0, 1, 2])} />,
    );
    const withGlyph = [...dots(container)].filter((d) => d.querySelector('svg'));
    expect(withGlyph).toHaveLength(2);
    expect(activeDot(container)[0].querySelector('svg')).toBeNull();
  });

  it('allowJumpTo makes every dot a keyboard-reachable button', () => {
    const { container } = renderWithProviders(<Pagination total={4} activeIndex={0} allowJumpTo onChange={() => {}} />);
    const targets = stepTargets(container);
    expect(targets).toHaveLength(4);
    for (const target of targets) {
      expect(target.getAttribute('role')).toBe('button');
      expect(target.getAttribute('tabindex')).toBe('0');
    }
    expect(targets[2].getAttribute('aria-label')).toBe('Go to step 3');
  });

  it('allowJumpTo dots activate on click, Enter and Space', () => {
    const onChange = vi.fn();
    const onPageChange = vi.fn();
    const { container } = renderWithProviders(
      <Pagination total={5} activeIndex={0} allowJumpTo onChange={onChange} onPageChange={onPageChange} />,
    );
    const targets = stepTargets(container);
    fireEvent.click(targets[3]);
    expect(onChange).toHaveBeenLastCalledWith(3);
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(targets[1], { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(targets[2], { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith(2);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('leaves the strip a pure indicator without allowJumpTo', () => {
    const { container } = renderWithProviders(<Pagination total={4} activeIndex={1} />);
    expect(container.querySelectorAll('[aria-label^="Go to step"][role="button"]')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-label^="Go to step"][tabindex="0"]')).toHaveLength(0);
    // The arrows stay tabbable — it is the dots that are not controls here.
    expect(container.querySelectorAll('[tabindex="0"]').length).toBeGreaterThan(0);
  });

  it('isLastStep + onSubmit turn the forward control into Submit', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const { container } = renderWithProviders(
      <Pagination total={3} activeIndex={2} isLastStep onSubmit={onSubmit} onChange={onChange} />,
    );
    const submit = byLabel(container, 'Submit');
    expect(submit).toBeTruthy();
    expect(byLabel(container, 'Next page')).toBeNull();
    fireEvent.click(submit as Element);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the forward control live on the last step when an onSubmit exists', () => {
    const onSubmit = vi.fn();
    const { container } = renderWithProviders(<Pagination total={3} activeIndex={2} onSubmit={onSubmit} />);
    // Not flagged isLastStep, so it is still "Next page" — but an onSubmit
    // means the control is not dead at the end of the strip.
    const next = byLabel(container, 'Next page');
    expect(next?.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('disabled blocks navigation and leaves nothing tabbable', () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(
      <Pagination total={5} activeIndex={2} allowJumpTo disabled onChange={onChange} />,
    );
    expect(dots(container)).toHaveLength(5);
    expect(container.querySelectorAll('[aria-label^="Go to step"][tabindex="0"]')).toHaveLength(0);
    fireEvent.click(stepTargets(container)[0]);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Pagination public API — control models', () => {
  it('drives the same body from activeIndex (0-based) or page (1-based)', () => {
    const { container: byIndex } = renderWithProviders(<Pagination total={5} activeIndex={2} />);
    const { container: byPage } = renderWithProviders(<Pagination total={5} page={3} />);
    const marked = (c: HTMLElement) =>
      [...dots(c)].findIndex((d) => d.getAttribute('data-pagination-dot') === 'active');
    expect(marked(byIndex)).toBe(2);
    expect(marked(byPage)).toBe(2);
  });

  it('fires both change aliases from one emit site', () => {
    const onChange = vi.fn();
    const onPageChange = vi.fn();
    const { container } = renderWithProviders(
      <Pagination total={5} activeIndex={1} onChange={onChange} onPageChange={onPageChange} />,
    );
    fireEvent.click(byLabel(container, 'Next page') as Element);
    expect(onChange).toHaveBeenCalledWith(2);
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('runs uncontrolled from defaultPage', () => {
    const { container } = renderWithProviders(<Pagination variant="numbered" total={9} defaultPage={3} />);
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('3');
    fireEvent.click(byLabel(container, 'Page 5') as Element);
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('5');
  });

  it('clamps navigation to the strip bounds', () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(<Pagination total={3} activeIndex={0} onChange={onChange} />);
    fireEvent.click(byLabel(container, 'Previous page') as Element);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Pagination public API — numbered chrome', () => {
  it('showSummary renders the bidi-isolated range and stays numbered-only', () => {
    const { container } = renderWithProviders(
      <Pagination variant="numbered" total={13} page={2} showSummary totalItems={312} pageSize={25} />,
    );
    expect(container.textContent).toContain('\u206826–50 of 312\u2069');
    // Queries bound to the document would see the render above, so the
    // negative case is asserted against its own container.
    const { container: dotsContainer } = renderWithProviders(
      <Pagination total={13} activeIndex={1} showSummary totalItems={312} pageSize={25} />,
    );
    expect(dotsContainer.textContent).not.toContain('of 312');
  });

  it('showFirstLast adds boundary jumps', () => {
    const onPageChange = vi.fn();
    const { container } = renderWithProviders(
      <Pagination variant="numbered" total={20} page={5} showFirstLast onPageChange={onPageChange} />,
    );
    expect(byLabel(container, 'Go to first page')).toBeTruthy();
    fireEvent.click(byLabel(container, 'Go to last page') as Element);
    expect(onPageChange).toHaveBeenCalledWith(20);
  });

  it('siblingCount and boundaryCount widen the window', () => {
    const { container } = renderWithProviders(
      <Pagination variant="numbered" total={20} page={10} siblingCount={2} boundaryCount={2} />,
    );
    const labels = [...pageButtons(container)].map((b) => b.textContent);
    expect(labels).toContain('8');
    expect(labels).toContain('12');
    expect(labels).toContain('19');
  });

  it('exports getPaginationItems with its ellipsis windowing', () => {
    expect(getPaginationItems(20, 5)).toEqual([1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 20]);
    expect(getPaginationItems(0, 1)).toEqual([]);
  });

  it('page buttons activate on Enter and Space', () => {
    const onPageChange = vi.fn();
    // Controlled, so the window does not move between the two presses.
    const { container } = renderWithProviders(
      <Pagination variant="numbered" total={9} page={2} onPageChange={onPageChange} />,
    );
    fireEvent.keyDown(byLabel(container, 'Page 4') as Element, { key: 'Enter' });
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(byLabel(container, 'Page 5') as Element, { key: ' ' });
    expect(onPageChange).toHaveBeenLastCalledWith(5);
  });
});

describe('Pagination public API — layout passthrough', () => {
  it('forwards XStack props to the frame', () => {
    const { container } = renderWithProviders(
      <Pagination total={3} activeIndex={0} testID="pager" paddingVertical="$1" />,
    );
    expect(container.querySelector('[data-testid="pager"]')).toBeTruthy();
  });

  it('renders exactly `total` dots', () => {
    for (const total of [1, 3, 8]) {
      const { container, unmount } = renderWithProviders(<Pagination total={total} activeIndex={0} />);
      expect(dots(container)).toHaveLength(total);
      unmount();
    }
  });
});

// One emphasis: one Pagination body, one selected
// language — BOTH variants mark "current" in the accent CHANNEL (the STEP may
// differ where the contrast floor requires it, per the owner-amended VERIFY).
// Stock test themes carry no accent ramp, so mount the house builder themes.
describe('Pagination selected mark', () => {
  const renderHouse = (ui: Parameters<typeof render>[0]) =>
    render(
      <TamaguiProvider config={houseConfig} defaultTheme="light" disableInjectCSS>
        {ui}
      </TamaguiProvider>,
    );

  it('dots body: the current dot fills with the accent mark, idle dots stay neutral', () => {
    const { container } = renderHouse(<Pagination total={5} activeIndex={2} />);
    const active = container.querySelector('[data-pagination-dot="active"]') as HTMLElement;
    const idle = container.querySelector('[data-pagination-dot="idle"]') as HTMLElement;
    expect(active).toBeTruthy();
    expect(idle).toBeTruthy();
    expect(active.className).toContain('_bg-accentBackg');
    expect(idle.className).not.toContain('_bg-accentBackg');
  });

  it('numbered body: the current page button rides the accent sub-theme, others stay chromeless', () => {
    const { container } = renderHouse(<Pagination variant="numbered" total={5} page={3} />);
    const current = container.querySelector('[aria-current="page"]') as HTMLElement;
    expect(current).toBeTruthy();
    // The house Button's `accent` intent re-themes the frame (<Theme
    // name="accent">), so the accent scope is the detectable channel.
    expect(current.closest('.t_accent')).toBeTruthy();
    const other = container.querySelector('[aria-label="Page 2"]') as HTMLElement;
    expect(other).toBeTruthy();
    expect(other.closest('.t_accent')).toBeNull();
  });
});

describe('Pagination ring anatomy / 44px floor', () => {
  it('every numbered page control paints at least 44×44', () => {
    const { container } = renderWithProviders(<Pagination variant="numbered" total={8} page={3} showFirstLast />);
    const labels = [
      'Go to first page',
      'Go to previous page',
      'Page 1',
      'Page 3',
      'Go to next page',
      'Go to last page',
    ];
    for (const label of labels) {
      const el = byLabel(container, label) as HTMLElement;
      expect(el, label).toBeTruthy();
      const style = getComputedStyle(el);
      expect(parseFloat(style.minWidth) || parseFloat(style.width), `${label} minWidth`).toBeGreaterThanOrEqual(44);
      expect(parseFloat(style.minHeight) || parseFloat(style.height), `${label} minHeight`).toBeGreaterThanOrEqual(44);
    }
  });

  it('selected page is fill, not a ring, and unselected siblings have no outline', () => {
    const { container } = renderWithProviders(<Pagination variant="numbered" total={5} page={3} />);
    const current = container.querySelector('[aria-current="page"]') as HTMLElement;
    const other = byLabel(container, 'Page 2') as HTMLElement;
    expect(current.closest('.t_accent')).toBeTruthy();
    expect(other.closest('.t_accent')).toBeNull();
    const currentStyle = getComputedStyle(current);
    const otherStyle = getComputedStyle(other);
    expect(parseFloat(currentStyle.outlineWidth) || 0).toBe(0);
    expect(parseFloat(otherStyle.outlineWidth) || 0).toBe(0);
  });
});
