/**
 * Pagination — RTL directional-glyph mirroring (rtl-audit backlog #1 / B1).
 *
 * The prev/next/first/last glyphs encode direction-of-travel, so they swap
 * to the paired glyph in RTL (icon-swap mechanism keyed on useDirection).
 * Icon identity is asserted by comparing the rendered svg path data against
 * standalone reference renders of each phosphor glyph — no hardcoded path
 * strings. The submit checkmark is direction-neutral and must NOT mirror.
 */

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  type Icon,
  type IconProps,
} from '@phosphor-icons/react';
import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Pagination } from './Pagination';

const clearDirs = () => {
  document.documentElement.removeAttribute('dir');
  document.body.removeAttribute('dir');
};

afterEach(clearDirs);

/** All svg path data inside an element, joined — icon identity fingerprint. */
const iconPaths = (el: Element | null | undefined): string =>
  Array.from(el?.querySelectorAll('svg path') ?? [])
    .map((p) => p.getAttribute('d') ?? '')
    .join('|');

/** Reference fingerprint from a standalone render of the phosphor glyph. */
const refPaths = (IconComponent: Icon, props: IconProps = {}): string => {
  const { container, unmount } = render(<IconComponent {...props} />);
  const d = iconPaths(container);
  unmount();
  expect(d).not.toBe('');
  return d;
};

const byLabel = (container: HTMLElement, label: string) => {
  const el = container.querySelector(`[aria-label="${label}"]`);
  expect(el, `button "${label}"`).toBeTruthy();
  return el as HTMLElement;
};

describe('Pagination directional glyphs (numbered variant)', () => {
  const renderNumbered = () => renderWithProviders(<Pagination variant="numbered" total={10} page={5} showFirstLast />);

  it('points prev/next carets toward their targets in LTR', () => {
    clearDirs();
    const { container } = renderNumbered();
    expect(iconPaths(byLabel(container, 'Go to previous page'))).toBe(refPaths(CaretLeftIcon));
    expect(iconPaths(byLabel(container, 'Go to next page'))).toBe(refPaths(CaretRightIcon));
    expect(iconPaths(byLabel(container, 'Go to first page'))).toBe(refPaths(CaretDoubleLeftIcon));
    expect(iconPaths(byLabel(container, 'Go to last page'))).toBe(refPaths(CaretDoubleRightIcon));
  });

  it('swaps all four caret pairs in RTL so they point toward their targets', () => {
    document.documentElement.dir = 'rtl';
    const { container } = renderNumbered();
    expect(iconPaths(byLabel(container, 'Go to previous page'))).toBe(refPaths(CaretRightIcon));
    expect(iconPaths(byLabel(container, 'Go to next page'))).toBe(refPaths(CaretLeftIcon));
    expect(iconPaths(byLabel(container, 'Go to first page'))).toBe(refPaths(CaretDoubleRightIcon));
    expect(iconPaths(byLabel(container, 'Go to last page'))).toBe(refPaths(CaretDoubleLeftIcon));
  });

  it('re-mirrors live when the document direction flips (useDirection reactivity)', async () => {
    clearDirs();
    const { container } = renderNumbered();
    expect(iconPaths(byLabel(container, 'Go to next page'))).toBe(refPaths(CaretRightIcon));

    await act(async () => {
      document.documentElement.dir = 'rtl';
    });
    expect(iconPaths(byLabel(container, 'Go to next page'))).toBe(refPaths(CaretLeftIcon));

    await act(async () => {
      document.documentElement.dir = 'ltr';
    });
    expect(iconPaths(byLabel(container, 'Go to next page'))).toBe(refPaths(CaretRightIcon));
  });
});

describe('Pagination directional glyphs (dots variant)', () => {
  it('swaps the prev/next arrows in RTL', () => {
    document.documentElement.dir = 'rtl';
    const { container } = renderWithProviders(<Pagination total={5} activeIndex={2} />);
    expect(iconPaths(byLabel(container, 'Previous page'))).toBe(refPaths(ArrowRightIcon));
    expect(iconPaths(byLabel(container, 'Next page'))).toBe(refPaths(ArrowLeftIcon));
  });

  it('keeps arrows physical in LTR', () => {
    clearDirs();
    const { container } = renderWithProviders(<Pagination total={5} activeIndex={2} />);
    expect(iconPaths(byLabel(container, 'Previous page'))).toBe(refPaths(ArrowLeftIcon));
    expect(iconPaths(byLabel(container, 'Next page'))).toBe(refPaths(ArrowRightIcon));
  });

  it('never mirrors the direction-neutral submit checkmark', () => {
    document.documentElement.dir = 'rtl';
    const { container } = renderWithProviders(<Pagination total={3} activeIndex={2} isLastStep onSubmit={() => {}} />);
    expect(iconPaths(byLabel(container, 'Submit'))).toBe(refPaths(CheckIcon));
  });

  it('keeps completed-step checkmarks unmirrored in RTL (dots variant)', () => {
    document.documentElement.dir = 'rtl';
    const { container } = renderWithProviders(
      <Pagination total={4} activeIndex={2} completedSteps={new Set([0, 1])} />,
    );
    const dots = container.querySelectorAll('[data-pagination-dot]');
    expect(dots.length).toBe(4);
    const completedWithCheck = Array.from(dots).filter((dot) => iconPaths(dot) !== '');
    expect(completedWithCheck.length).toBe(2);
    // The dot checkmark renders weight="bold"; the reference must match it.
    for (const dot of completedWithCheck) {
      expect(iconPaths(dot)).toBe(refPaths(CheckIcon, { weight: 'bold' }));
    }
  });
});

describe('Pagination summary bidi isolation', () => {
  it('wraps the range summary in FSI…PDI so RTL contexts cannot reorder it', () => {
    clearDirs();
    const { getByText } = renderWithProviders(
      <Pagination variant="numbered" total={13} page={1} showSummary totalItems={312} pageSize={25} />,
    );
    // The whole formatted run is isolated — first-strong direction keeps
    // "1–25 of 312" in order inside an RTL paragraph.
    expect(getByText('\u20681–25 of 312\u2069')).toBeTruthy();
  });

  it('isolates the empty-set summary too', () => {
    clearDirs();
    const { getByText } = renderWithProviders(
      <Pagination variant="numbered" total={1} page={1} showSummary totalItems={0} pageSize={25} />,
    );
    expect(getByText('\u20680 of 0\u2069')).toBeTruthy();
  });
});

describe('Pagination design-law', () => {
  it('exposes named exports and no default', async () => {
    const mod = await import('./Pagination');
    expect(mod.Pagination).toBe(Pagination);
    expect(mod.getPaginationItems).toBeTypeOf('function');
    expect('default' in mod).toBe(false);
  });

  it('animation none publishes data-animation=none (no quick fallback)', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <Pagination total={5} activeIndex={2} />
      </Preset>,
    );
    const nav = container.querySelector('[role="navigation"]') as HTMLElement;
    expect(nav.getAttribute('data-animation')).toBe('none');
  });

  it('default animation publishes a named transition, not none', () => {
    const { container } = renderWithProviders(<Pagination total={5} activeIndex={2} />);
    const nav = container.querySelector('[role="navigation"]') as HTMLElement;
    expect(nav.getAttribute('data-animation')).not.toBe('none');
    expect(nav.getAttribute('data-animation')).toBeTruthy();
  });

  it('frame publishes data-pad=panel (SP-PAD)', () => {
    const { container } = renderWithProviders(<Pagination total={5} activeIndex={2} />);
    const nav = container.querySelector('[role="navigation"]') as HTMLElement;
    expect(nav.getAttribute('data-pad')).toBe('panel');
  });
});
