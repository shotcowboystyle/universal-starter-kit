/**
 * Carousel geometry contract specs (SLIDE-VIEWPORT-WIDTH): slides size
 * from the MEASURED scroll viewport — never percent-of-track — and every
 * paging offset is index × (slideWidth + gap), so slide N is actually
 * reachable at the offset the dots promise. Also locks the re-anchor on
 * re-measure (resize) and the scroll → active-dot mapping at the same pitch.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { Preset, isTouchSurface, sizeRecipeForToken } from '@repo/theme';
import { act, fireEvent } from '@testing-library/react';
import { Text, View, getTokens } from 'tamagui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Carousel } from './index';

const here = dirname(fileURLToPath(import.meta.url));

// ── happy-dom layout plumbing ─────────────────────────────────
// react-native-web's onLayout rides a module-level ResizeObserver singleton
// captured on first use, so the stub must exist before the first render and
// stay installed for the whole file. `observe` fires immediately (mount
// measure); `fireResize` re-fires for every observed node (resize). The
// measure callback itself reads offsetWidth via a setTimeout(0), hence the
// prototype getter and the flushMeasure() helper.

let layoutWidth = 400;

interface ObserverRecord {
  cb: ResizeObserverCallback;
  targets: Set<Element>;
}
const observerRecords: ObserverRecord[] = [];

function makeEntry(target: Element): ResizeObserverEntry {
  return {
    target,
    contentRect: { width: layoutWidth, height: 240 } as DOMRectReadOnly,
    borderBoxSize: [],
    contentBoxSize: [],
    devicePixelContentBoxSize: [],
  } as unknown as ResizeObserverEntry;
}

vi.stubGlobal(
  'ResizeObserver',
  class {
    record: ObserverRecord;
    constructor(cb: ResizeObserverCallback) {
      this.record = { cb, targets: new Set() };
      observerRecords.push(this.record);
    }
    observe(target: Element) {
      this.record.targets.add(target);
      this.record.cb([makeEntry(target)], this as unknown as ResizeObserver);
    }
    unobserve(target: Element) {
      this.record.targets.delete(target);
    }
    disconnect() {
      this.record.targets.clear();
    }
  },
);

Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get() {
    return layoutWidth;
  },
});
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get() {
    return 240;
  },
});

// react-native-web's scrollTo lands on the DOM node's scroll(); capture it.
const scrollCalls: Array<{ left?: number; top?: number; behavior?: string }> = [];
Object.defineProperty(HTMLElement.prototype, 'scroll', {
  configurable: true,
  writable: true,
  value(options: { left?: number; top?: number; behavior?: string }) {
    scrollCalls.push(options);
  },
});

/** Flush UIManager.measure's setTimeout(0) so onLayout commits. */
async function flushMeasure() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function fireResize(width: number) {
  layoutWidth = width;
  for (const record of observerRecords) {
    for (const target of record.targets) {
      record.cb([makeEntry(target)], undefined as unknown as ResizeObserver);
    }
  }
}

function slides(container: HTMLElement) {
  return container.querySelectorAll('[data-carousel-slide]');
}

/**
 * Tamagui materializes dynamic numeric widths as atomic CSS classes, not
 * inline style — resolve whether any class on the node carries the width, in
 * inline style, <style> text, CSSOM rules, or adopted sheets.
 */
function elementCarriesWidth(node: HTMLElement, widthPx: number): boolean {
  const needle = `${widthPx}px`;
  const inline = node.getAttribute('style') ?? '';
  if (inline.includes(needle)) {
    return true;
  }
  const ruleTexts: string[] = [];
  for (const styleTag of Array.from(document.querySelectorAll('style'))) {
    ruleTexts.push(styleTag.textContent ?? '');
  }
  const sheets = [
    ...Array.from(document.styleSheets),
    ...Array.from((document as unknown as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? []),
  ];
  for (const sheet of sheets) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        ruleTexts.push(rule.cssText);
      }
    } catch {
      // Unreadable sheet — nothing Tamagui inserts is.
    }
  }
  return Array.from(node.classList).some((className) =>
    ruleTexts.some((text) => text.includes(`.${className}`) && text.includes(needle)),
  );
}

function dots(container: HTMLElement) {
  return container.querySelectorAll("[role='button'][aria-label^='Go to item']");
}

beforeEach(() => {
  layoutWidth = 400;
  scrollCalls.length = 0;
});

const Slide = ({ index }: { index: number }) => (
  <View height={100}>
    <Text>Slide {index + 1}</Text>
  </View>
);

describe('Carousel geometry', () => {
  it('sizes each slide from the measured viewport, never percent-of-track', async () => {
    const { container } = renderWithProviders(
      <Carousel gap={0}>
        {[0, 1, 2].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    const slideNodes = slides(container);
    expect(slideNodes).toHaveLength(3);
    for (const node of slideNodes) {
      expect(elementCarriesWidth(node as HTMLElement, 400)).toBe(true);
      expect((node as HTMLElement).getAttribute('style') ?? '').not.toContain('100%');
    }
  });

  it('pages to index × slideWidth when gap is 0', async () => {
    const { container } = renderWithProviders(
      <Carousel gap={0}>
        {[0, 1, 2].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    // First measure anchors the initial slide without animating.
    expect(scrollCalls[0]).toMatchObject({ left: 0, behavior: 'auto' });
    fireEvent.click(dots(container)[2]);
    expect(scrollCalls.at(-1)).toMatchObject({ left: 800, behavior: 'smooth' });
    fireEvent.click(dots(container)[1]);
    expect(scrollCalls.at(-1)).toMatchObject({ left: 400, behavior: 'smooth' });
  });

  it('includes the inter-slide gap in the pitch: index × (slideWidth + gap)', async () => {
    const { container } = renderWithProviders(
      <Carousel gap={16}>
        {[0, 1, 2, 3, 4].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    fireEvent.click(dots(container)[4]);
    expect(scrollCalls.at(-1)).toMatchObject({ left: 4 * (400 + 16), behavior: 'smooth' });
  });

  it('resolves token gaps into the offset math', async () => {
    const tokenGap = (getTokens().space as Record<string, { val?: number } | undefined>)?.$4?.val;
    expect(typeof tokenGap).toBe('number');
    expect(tokenGap!).toBeGreaterThan(0);
    const { container } = renderWithProviders(
      <Carousel gap="$4">
        {[0, 1, 2].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    fireEvent.click(dots(container)[2]);
    expect(scrollCalls.at(-1)).toMatchObject({ left: 2 * (400 + tokenGap!), behavior: 'smooth' });
  });

  it('re-anchors the active slide when the viewport re-measures', async () => {
    const { container } = renderWithProviders(
      <Carousel gap={16}>
        {[0, 1, 2].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    fireEvent.click(dots(container)[2]);
    expect(scrollCalls.at(-1)).toMatchObject({ left: 2 * (400 + 16), behavior: 'smooth' });
    fireResize(600);
    await flushMeasure();
    // Same slide, new pitch, no animation.
    expect(scrollCalls.at(-1)).toMatchObject({ left: 2 * (600 + 16), behavior: 'auto' });
    expect(elementCarriesWidth(slides(container)[0] as HTMLElement, 600)).toBe(true);
  });

  it('maps scroll offsets back to the active dot at the same pitch', async () => {
    const { container } = renderWithProviders(
      <Carousel gap={16}>
        {[0, 1, 2].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    const track = container.querySelector('[data-carousel-track]') as HTMLElement;
    expect(track).toBeTruthy();
    Object.defineProperty(track, 'scrollLeft', { configurable: true, value: 2 * (400 + 16) });
    fireEvent.scroll(track);
    expect(dots(container)[2].getAttribute('aria-current')).toBe('true');
  });

  it('renders a single slide without dots or arrows (N=1)', async () => {
    const { container } = renderWithProviders(
      <Carousel gap={0}>
        <Slide index={0} />
      </Carousel>,
    );
    await flushMeasure();
    expect(slides(container)).toHaveLength(1);
    expect(dots(container)).toHaveLength(0);
    expect(container.querySelector("[aria-label='Next slide']")).toBeNull();
  });

  it('lands initialSlide at its pitch offset on first measure', async () => {
    renderWithProviders(
      <Carousel gap={0} initialSlide={2}>
        {[0, 1, 2, 3].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    expect(scrollCalls.at(-1)).toMatchObject({ left: 2 * 400, behavior: 'auto' });
  });
});

// ── MOTION-RIDES-KNOB ───────────────────────────────────
// Slide snaps gate on knobProps.transition: undefined at animation "none"
// (which also carries prefers-reduced-motion) means `scrollTo({ animated:
// false })` — the track JUMPS (behavior "auto" on the captured DOM scroll).
// With motion on the same snap smooth-scrolls (positive control proving the
// probe measures). A hardcoded `animated: true` is the violation this locks
// out.
describe('Carousel snaps ride the animation knob', () => {
  it('jumps (animated: false → behavior auto) on dot click at animation none', async () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <Carousel gap={0}>
          {[0, 1, 2].map((index) => (
            <Slide key={index} index={index} />
          ))}
        </Carousel>
      </Preset>,
    );
    await flushMeasure();
    fireEvent.click(dots(container)[2]);
    expect(scrollCalls.at(-1)).toMatchObject({ left: 800, behavior: 'auto' });
    fireEvent.click(dots(container)[1]);
    expect(scrollCalls.at(-1)).toMatchObject({ left: 400, behavior: 'auto' });
  });

  it('smooth-scrolls (animated: true) on dot click with motion on (positive control)', async () => {
    const { container } = renderWithProviders(
      // Default knobs: animation "quick" — knobProps.transition is defined.
      <Carousel gap={0}>
        {[0, 1, 2].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    fireEvent.click(dots(container)[2]);
    expect(scrollCalls.at(-1)).toMatchObject({ left: 800, behavior: 'smooth' });
  });
});

// ── RING-ANATOMY + size recipes + 44px floor ────────────
// Rings live on arrows/dots (keyboard-only), never as a UA outline on the
// scroll viewport. Painted arrow size follows sizeToken; the hit target is
// floored at MIN_PRESS_TARGET (44). Embla/Polaris/Apple: halo on the control.

function arrow(container: HTMLElement, side: 'prev' | 'next') {
  return container.querySelector(`[data-carousel-arrow='${side}']`) as HTMLElement | null;
}

function arrowVisual(container: HTMLElement, side: 'prev' | 'next') {
  return container.querySelector(`[data-carousel-arrow-visual='${side}']`) as HTMLElement | null;
}

describe('Carousel ring anatomy, size recipes, 44px floor', () => {
  it('keeps the viewport out of the tab order with no outline', async () => {
    const { container } = renderWithProviders(
      <Carousel gap={0}>
        {[0, 1, 2].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    const track = container.querySelector('[data-carousel-track]') as HTMLElement;
    expect(track).toBeTruthy();
    expect(track.tabIndex).toBe(-1);
    const style = track.getAttribute('style') ?? '';
    expect(style).not.toMatch(/outline-width:\s*[1-9]/);
  });

  it('floors arrow press targets at 44px and paints the size-recipe visual', async () => {
    const { container } = renderWithProviders(
      <Carousel gap={0}>
        {[0, 1, 2].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    const next = arrow(container, 'next');
    const visual = arrowVisual(container, 'next');
    expect(next).toBeTruthy();
    expect(visual).toBeTruthy();
    // Arrow chrome follows the size recipe. The desktop
    // $4 recipe is the measured Tamagui 44, so visual and press target
    // coincide at the floor (touch lifts the recipe to 48).
    const recipe = sizeRecipeForToken('$4', { touch: isTouchSurface() });
    expect(recipe.height).toBe(isTouchSurface() ? 48 : 44);
    expect(elementCarriesWidth(next!, Math.max(recipe.height, 44))).toBe(true);
    expect(elementCarriesWidth(visual!, recipe.height)).toBe(true);
    expect(next!.className).toContain('mp-carousel-arrow');
    expect(visual!.className).toContain('mp-carousel-arrow-visual');
  });

  it('keeps the 44px floor when the size knob paints a smaller arrow', async () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ size: 'small' }}>
        <Carousel gap={0}>
          {[0, 1, 2].map((index) => (
            <Slide key={index} index={index} />
          ))}
        </Carousel>
      </Preset>,
    );
    await flushMeasure();
    const next = arrow(container, 'next');
    const visual = arrowVisual(container, 'next');
    // The small recipe (desktop $3 height 28) paints the visual; the
    // outer press target stays floored at 44 (press-floor channel).
    const smallPx = sizeRecipeForToken('$3', { touch: isTouchSurface() }).height;
    expect(smallPx).toBeLessThan(44);
    expect(elementCarriesWidth(visual!, smallPx)).toBe(true);
    expect(elementCarriesWidth(next!, 44)).toBe(true);
  });

  it('pages with ArrowRight / ArrowLeft on the carousel region (Embla/Polaris)', async () => {
    const { container } = renderWithProviders(
      <Carousel gap={0}>
        {[0, 1, 2].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    const region = container.querySelector("[aria-roledescription='carousel']") as HTMLElement;
    expect(region).toBeTruthy();
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(scrollCalls.at(-1)).toMatchObject({ left: 400, behavior: 'smooth' });
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(scrollCalls.at(-1)).toMatchObject({ left: 800, behavior: 'smooth' });
    fireEvent.keyDown(region, { key: 'Home' });
    expect(scrollCalls.at(-1)).toMatchObject({ left: 0, behavior: 'smooth' });
    fireEvent.keyDown(region, { key: 'End' });
    expect(scrollCalls.at(-1)).toMatchObject({ left: 800, behavior: 'smooth' });
  });

  it('installs the keyboard-only arrow ring stylesheet (not a viewport UA outline)', async () => {
    renderWithProviders(
      <Carousel gap={0}>
        {[0, 1, 2].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    const sheet = document.getElementById('mp-carousel-arrow-ring');
    expect(sheet?.textContent ?? '').toContain('.mp-carousel-arrow:focus-visible');
    expect(sheet?.textContent ?? '').toContain('.mp-carousel-arrow-visual');
    expect(sheet?.textContent ?? '').not.toContain('[data-carousel-track]');
  });
});

describe('Carousel live-media tile', () => {
  it('does not paint a status pip; viewport radius stays UNCLAMPED', async () => {
    const src = readFileSync(join(here, 'index.tsx'), 'utf8');
    expect(src).not.toMatch(/knobProps\.containerRadius|knobProps\.cardSurface|capContainerRadius\(/);
    expect(src).not.toMatch(/data-status-pip|StatusPip|statusPip/);
    expect(src).toContain('knobProps.borderRadius');

    const { container } = renderWithProviders(
      <Carousel gap={0}>
        {[0, 1, 2].map((index) => (
          <Slide key={index} index={index} />
        ))}
      </Carousel>,
    );
    await flushMeasure();
    expect(container.querySelector('[data-status-pip]')).toBeNull();
    expect(container.querySelector("[data-media-tile='carousel']")).toBeTruthy();
  });
});
