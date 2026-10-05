import { renderWithProviders } from '@repo/test-utils';
import { __resetDevWarnSeen, Preset } from '@repo/theme';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Alert } from './index';

function atoms(el: Element, prefixes: string[]): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
}

function renderFrame(node: ReactElement) {
  const result = renderWithProviders(node);
  const frame = result.container.querySelector('[role="status"], [role="alert"]') as HTMLElement;
  return { ...result, frame };
}

describe('Alert', () => {
  it('renders title and description with role=status for info', () => {
    const { container } = renderWithProviders(
      <Alert intent="info" title="Heads up">
        Something changed.
      </Alert>,
    );
    const region = container.querySelector('[role="status"]');
    expect(region).toBeTruthy();
    expect(container.textContent).toContain('Heads up');
    expect(container.textContent).toContain('Something changed.');
  });

  it('uses role=alert for error and warning intents', () => {
    const error = renderWithProviders(<Alert intent="error" title="Save failed" />);
    expect(error.container.querySelector('[role="alert"]')).toBeTruthy();
    const warning = renderWithProviders(<Alert intent="warning" title="Unsaved changes" />);
    expect(warning.container.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('dismisses itself (uncontrolled) and calls onDismiss', () => {
    const onDismiss = vi.fn();
    const { container } = renderWithProviders(<Alert intent="info" title="Bye" dismissible onDismiss={onDismiss} />);
    const dismiss = container.querySelector('[aria-label="Dismiss"]');
    expect(dismiss).toBeTruthy();
    fireEvent.click(dismiss as Element);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')).toBeFalsy();
  });

  it('stays visible when controlled visible=true despite dismiss press', () => {
    const onDismiss = vi.fn();
    const { container } = renderWithProviders(
      <Alert intent="info" title="Pinned" dismissible visible onDismiss={onDismiss} />,
    );
    fireEvent.click(container.querySelector('[aria-label="Dismiss"]') as Element);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it('renders the convenience action button', () => {
    const onAction = vi.fn();
    const { container } = renderWithProviders(
      <Alert intent="error" title="Connection lost" actionLabel="Retry" onAction={onAction} />,
    );
    const button = container.querySelector('[aria-label="Retry"]');
    expect(button?.textContent).toContain('Retry');
    fireEvent.click(button as Element);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('stacks actions under title+body (Primer complex layout)', () => {
    const { container } = renderWithProviders(
      <Alert intent="error" title="Connection lost" actionLabel="Retry">
        Changes are no longer syncing.
      </Alert>,
    );
    expect(container.querySelector('[data-layout="stacked"]')).toBeTruthy();
  });

  it('keeps a single-line title+action inline', () => {
    const { container } = renderWithProviders(<Alert intent="error" title="Connection lost" actionLabel="Retry" />);
    expect(container.querySelector('[data-layout="inline"]')).toBeTruthy();
  });

  it('exposes density and nested-scale on the frame', () => {
    const compact = renderWithProviders(<Alert compact intent="info" title="Read-only" />);
    const frame = compact.container.querySelector('[role="status"]') as HTMLElement;
    expect(frame.getAttribute('data-density')).toBe('compact');
    expect(Number(frame.getAttribute('data-nested-px'))).toBeGreaterThan(0);
    expect(Number(frame.getAttribute('data-nested-px'))).toBeLessThan(44);
    expect(frame.getAttribute('data-accent-stripe')).toBe('3');
  });

  it('wires aria-labelledby to the title and is programmatically focusable', () => {
    const { container } = renderWithProviders(
      <Alert intent="info" title="Heads up">
        Something changed.
      </Alert>,
    );
    const region = container.querySelector('[role="status"]') as HTMLElement;
    const titleId = region.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId as string)?.textContent).toContain('Heads up');
    expect(region.tabIndex).toBe(-1);
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  it('uses assertive live region for error intents', () => {
    const { container } = renderWithProviders(<Alert intent="error" title="Save failed" />);
    const region = container.querySelector('[role="alert"]') as HTMLElement;
    expect(region.getAttribute('aria-live')).toBe('assertive');
  });

  it('fires the secondary convenience action', () => {
    const onSecondaryAction = vi.fn();
    const { container } = renderWithProviders(
      <Alert
        intent="warning"
        title="Trial expiring"
        actionLabel="Upgrade"
        secondaryActionLabel="Remind me"
        onSecondaryAction={onSecondaryAction}
      />,
    );
    fireEvent.click(container.querySelector('[aria-label="Remind me"]') as Element);
    expect(onSecondaryAction).toHaveBeenCalledTimes(1);
  });
});

// In hover/press the element
// carrying the press-target outset keeps `background-color: transparent` —
// painted feedback lives on the glyph-scale ring inside it. jsdom never
// applies :hover, but tamagui compiles state backgrounds into value-carrying
// atomic classes (`_bg-0hover-color5`, `_bg-0active-color6`), so the paint
// channel is asserted through the atoms each node carries — red on the old
// anatomy (the floor carried both atoms), green only when the floor is
// paint-free in every state.
describe('Alert dismiss press-floor paint', () => {
  const paintedStateAtom = /_bg-0(?:hover|active)-(?!transparent)/;
  const renderDismissible = (onDismiss: () => void = () => {}) =>
    renderWithProviders(<Alert intent="info" title="Bye" dismissible onDismiss={onDismiss} />);

  it('floor node carries no hover/press background paint', () => {
    const { container } = renderDismissible();
    const floor = container.querySelector('[aria-label="Dismiss"]') as HTMLElement;
    expect(floor).not.toBeNull();
    expect(floor.className).not.toMatch(paintedStateAtom);
  });

  it('positive control: the glyph-scale ring is where the hover fill lives', () => {
    const { container } = renderDismissible();
    const floor = container.querySelector('[aria-label="Dismiss"]') as HTMLElement;
    const ring = floor.firstElementChild as HTMLElement;
    expect(ring).not.toBeNull();
    // Proves the atom detector can see hover paint in this harness (the
    // no-paint assert above is meaningless without this arm), and pins the
    // fill to the ring: icon + one space token, never the 44px floor.
    expect(ring.className).toMatch(/_bg-0hover-color5/);
    expect(ring.querySelector('svg')).not.toBeNull();
  });

  it('dismiss activates through the ring (pointer) and via Enter (keyboard)', () => {
    const onDismiss = vi.fn();
    const { container } = renderDismissible(onDismiss);
    const floor = container.querySelector('[aria-label="Dismiss"]') as HTMLElement;
    const ring = (floor.firstElementChild ?? floor) as HTMLElement;
    fireEvent.click(ring);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismiss fires on Enter', () => {
    const onDismiss = vi.fn();
    const { container } = renderDismissible(onDismiss);
    const floor = container.querySelector('[aria-label="Dismiss"]') as HTMLElement;
    fireEvent.keyDown(floor, { key: 'Enter' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('Alert nested action press-floor paint', () => {
  const paintedStateAtom = /_bg-0(?:hover|active)-(?!transparent)/;

  it('action floor is unpainted; hover fill lives on the nested pill', () => {
    const { container } = renderWithProviders(<Alert intent="error" title="Connection lost" actionLabel="Retry" />);
    const floor = container.querySelector('[aria-label="Retry"]') as HTMLElement;
    expect(floor).not.toBeNull();
    expect(floor.className).not.toMatch(paintedStateAtom);
    const pill = floor.firstElementChild as HTMLElement;
    expect(pill.className).toMatch(/_bg-0hover-color5/);
  });

  it('action activates via Enter on the floor', () => {
    const onAction = vi.fn();
    const { container } = renderWithProviders(
      <Alert intent="error" title="Connection lost" actionLabel="Retry" onAction={onAction} />,
    );
    fireEvent.keyDown(container.querySelector('[aria-label="Retry"]') as HTMLElement, {
      key: 'Enter',
    });
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('Alert banned-error-word DEV warn', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDevWarnSeen();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetDevWarnSeen();
  });

  it('warns when title uses banned wording', () => {
    renderWithProviders(<Alert intent="error" title="Sorry, an error occurred" />);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('banned-error-word'));
  });

  it('is silent for clean copy', () => {
    renderWithProviders(<Alert intent="error" title="Save failed" />);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('banned-error-word'));
  });
});

describe('Alert host data attributes reach the DOM', () => {
  afterEach(cleanup);

  it('puts data-accent-stripe, data-density and data-layout on the live region', () => {
    const stacked = renderFrame(
      <Alert intent="error" title="Connection lost" actionLabel="Retry">
        Changes are no longer syncing.
      </Alert>,
    );
    expect(stacked.frame.getAttribute('data-accent-stripe')).toBe('3');
    expect(stacked.frame.getAttribute('data-density')).toBe('comfortable');
    expect(stacked.frame.getAttribute('data-layout')).toBe('stacked');
    cleanup();

    const inline = renderFrame(<Alert intent="error" title="Connection lost" actionLabel="Retry" />);
    expect(inline.frame.getAttribute('data-accent-stripe')).toBe('3');
    expect(inline.frame.getAttribute('data-layout')).toBe('inline');
  });
});

describe('Alert action labels — weight 400 on the TEXT NODE', () => {
  afterEach(cleanup);

  it('measures Retry on the text node, never the press-floor', () => {
    renderWithProviders(<Alert intent="error" title="Connection lost" actionLabel="Retry" />);
    const floor = document.querySelector('[aria-label="Retry"]') as HTMLElement;
    const textNode = screen.getByText('Retry');
    expect(textNode).not.toBe(floor);
    const weight = atoms(textNode, ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
    expect(atoms(floor, ['_fow-'])).toHaveLength(0);
  });

  it('keeps Open runbook and Mute 24h at weight 400 on their text nodes', () => {
    renderWithProviders(
      <Alert intent="warning" title="Runbook" actionLabel="Open runbook" secondaryActionLabel="Mute 24h" />,
    );
    for (const label of ['Open runbook', 'Mute 24h']) {
      const floor = document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
      const textNode = screen.getByText(label);
      expect(textNode).not.toBe(floor);
      const weight = atoms(textNode, ['_fow-']);
      expect(weight.length).toBeGreaterThan(0);
      expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
    }
  });
});

describe('Alert density — padX and gap move, height holds', () => {
  afterEach(cleanup);

  const padX = ['_px-', '_pl-', '_pr-'];
  const padY = ['_py-', '_pt-', '_pb-'];
  const gap = ['_gap-'];
  const height = ['_h-', '_mih-', '_mah-'];

  it('density knob restyles padX and gap without changing height', () => {
    const comfortable = renderFrame(
      <Preset overrides={{ density: 'comfortable' }}>
        <Alert intent="info" title="Read-only" />
      </Preset>,
    );
    const comfortableMeasure = {
      density: comfortable.frame.getAttribute('data-density'),
      nested: comfortable.frame.getAttribute('data-nested-px'),
      padX: atoms(comfortable.frame, padX),
      padY: atoms(comfortable.frame, padY),
      gap: atoms(comfortable.frame, gap),
      height: atoms(comfortable.frame, height),
    };
    cleanup();

    const compact = renderFrame(
      <Preset overrides={{ density: 'compact' }}>
        <Alert intent="info" title="Read-only" />
      </Preset>,
    );
    expect(comfortableMeasure.density).toBe('comfortable');
    expect(compact.frame.getAttribute('data-density')).toBe('compact');
    expect(comfortableMeasure.padX.length).toBeGreaterThan(0);
    expect(atoms(compact.frame, padX)).not.toEqual(comfortableMeasure.padX);
    expect(comfortableMeasure.gap.length).toBeGreaterThan(0);
    expect(atoms(compact.frame, gap)).not.toEqual(comfortableMeasure.gap);
    expect(atoms(compact.frame, padY)).toEqual(comfortableMeasure.padY);
    expect(atoms(compact.frame, height)).toEqual(comfortableMeasure.height);
    expect(compact.frame.getAttribute('data-nested-px')).toBe(comfortableMeasure.nested);
  });

  it('compact prop tightens padX and gap while height holds', () => {
    const comfortable = renderFrame(<Alert intent="info" title="Read-only" />);
    const comfortableMeasure = {
      padX: atoms(comfortable.frame, padX),
      padY: atoms(comfortable.frame, padY),
      gap: atoms(comfortable.frame, gap),
      height: atoms(comfortable.frame, height),
      nested: comfortable.frame.getAttribute('data-nested-px'),
    };
    cleanup();

    const compact = renderFrame(<Alert compact intent="info" title="Read-only" />);
    expect(compact.frame.getAttribute('data-density')).toBe('compact');
    expect(atoms(compact.frame, padX)).not.toEqual(comfortableMeasure.padX);
    expect(atoms(compact.frame, gap)).not.toEqual(comfortableMeasure.gap);
    expect(atoms(compact.frame, padY)).toEqual(comfortableMeasure.padY);
    expect(atoms(compact.frame, height)).toEqual(comfortableMeasure.height);
    expect(compact.frame.getAttribute('data-nested-px')).toBe(comfortableMeasure.nested);
  });
});
