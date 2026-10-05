import { renderWithProviders } from '@repo/test-utils';
import {
  __resetDevWarnSeen,
  aaTextContrastRatio,
  createDefaultThemeConfig,
  createThemesBuilder,
  defaultAccentTheme,
  defaultBaseTheme,
  defaultBuilderOptions,
  measureContrast,
  normalizeToHex,
  Preset,
  useAccentOnSurface,
} from '@repo/theme';
import { fireEvent, screen, act, cleanup } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { Button, SizableText, TamaguiProvider, useTheme, YStack } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetToastViewportRegistry,
  dismissToast,
  getToasts,
  resetToasts,
  resolveToastPolicy,
  showToast,
  TOAST_ACTION_MIN_MS,
  TOAST_DEFAULT_MS,
  TOAST_ERROR_MS,
  TOAST_EXIT_MS,
  TOAST_WARNING_MS,
} from './store';

import { Toast, ToastViewport, useToast, nativeToastA11y, nativeToastControlA11y } from './index';

afterEach(() => {
  act(() => {
    resetToasts();
    __resetToastViewportRegistry();
  });
});

function Trigger(props: Parameters<ReturnType<typeof useToast>['show']>[0]) {
  const toast = useToast();
  return <Button onPress={() => toast.show(props)}>fire</Button>;
}

describe('native toast accessibility', () => {
  it('groups text-only content while leaving action and dismiss controls reachable', () => {
    expect(nativeToastA11y('Saved', false, false)).toEqual({
      accessible: true,
      accessibilityLabel: 'Saved',
    });
    expect(nativeToastA11y('Saved', true, false)).toEqual({ accessible: false });
  });

  it('does not wire a second native announcement channel or web grouping', () => {
    expect(nativeToastA11y('Saved', false, false)).not.toHaveProperty('accessibilityLiveRegion');
    expect(nativeToastA11y('Saved', false, false)).not.toHaveProperty('aria-live');
    expect(nativeToastA11y('Saved', false, true)).toEqual({});
    expect(nativeToastA11y(undefined, false, false)).toEqual({ accessible: false });
  });

  it('makes native action and dismiss controls accessibility elements without leaking to web', () => {
    expect(nativeToastControlA11y(false)).toEqual({ accessible: true });
    expect(nativeToastControlA11y(true)).toEqual({});
  });

  it('records the library grouping default and keeps native control props off the DOM', () => {
    renderWithProviders(
      <>
        <Trigger title="Saved" dismissible />
        <ToastViewport />
      </>,
    );
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByTestId('toast')).toHaveAttribute('tabindex', '0');
    expect(screen.getByLabelText('Dismiss notification')).not.toHaveAttribute('accessible');
  });
});

describe('Toast (standalone)', () => {
  it('renders title, description and role=status', () => {
    renderWithProviders(<Toast title="Saved" description="Record updated." intent="success" onDismiss={() => {}} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Record updated.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('names CopyField confirm for assistive tech', () => {
    renderWithProviders(<Toast title="Copied to clipboard." intent="success" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-label', 'Copied to clipboard.');
    expect(status).toHaveTextContent('Copied to clipboard.');
    expect(status).toHaveAttribute('aria-atomic');
  });

  it('fires onDismiss from the close button', () => {
    const onDismiss = vi.fn();
    renderWithProviders(<Toast title="Saved" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss notification'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fires the action button', () => {
    const onPress = vi.fn();
    renderWithProviders(<Toast title="Archived" action={{ label: 'Undo', onPress }} onDismiss={() => {}} />);
    fireEvent.click(screen.getByText('Undo'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('hides the close button when not dismissible', () => {
    renderWithProviders(<Toast title="Plain" />);
    expect(screen.queryByLabelText('Dismiss notification')).not.toBeInTheDocument();
  });

  it('paints the keyboard ring on the glyph/pill, not the 44px hit box', () => {
    renderWithProviders(<Toast title="Archived" action={{ label: 'Undo', onPress: () => {} }} onDismiss={() => {}} />);
    const close = screen.getByLabelText('Dismiss notification');
    expect(close.className).toMatch(/mp-chip-dismiss/);
    expect(close.querySelector('.mp-chip-dismiss-ring')).not.toBeNull();
    const action = screen.getByLabelText('Undo');
    expect(action.className).toMatch(/mp-chip-dismiss/);
    expect(action.querySelector('.mp-chip-dismiss-ring')).not.toBeNull();
  });

  it('keeps nested painted chrome below 44px and the press floor at 44', () => {
    renderWithProviders(<Toast title="Saved" onDismiss={() => {}} />);
    const toast = screen.getByTestId('toast');
    const nestedPx = Number(toast.getAttribute('data-nested-px'));
    expect(nestedPx).toBeGreaterThan(0);
    expect(nestedPx).toBeLessThan(44);
    const close = screen.getByLabelText('Dismiss notification');
    expect(close).toHaveStyle({ minHeight: '44px' });
    expect(close).toHaveStyle({ minWidth: '44px' });
  });

  it('compact flips density; size stays an independent axis', () => {
    const { rerender } = renderWithProviders(<Toast title="Saved" compact={false} onDismiss={() => {}} />);
    const comfortable = screen.getByTestId('toast');
    expect(comfortable.getAttribute('data-density')).toBe('comfortable');
    expect(comfortable.getAttribute('data-size')).toBe('medium');
    const comfortablePx = Number(comfortable.getAttribute('data-nested-px'));
    rerender(<Toast title="Saved" compact onDismiss={() => {}} />);
    const compactToast = screen.getByTestId('toast');
    expect(compactToast.getAttribute('data-density')).toBe('compact');
    expect(compactToast.getAttribute('data-size')).toBe('medium');
    // nested-px follows size, not density — same size → same nested box
    expect(Number(compactToast.getAttribute('data-nested-px'))).toBe(comfortablePx);
  });
});

describe('toast expiry policy (resolveToastPolicy)', () => {
  it('resolves the house per-intent defaults', () => {
    expect(resolveToastPolicy({ title: 't' }).duration).toBe(TOAST_DEFAULT_MS);
    expect(resolveToastPolicy({ title: 't', intent: 'success' }).duration).toBe(TOAST_DEFAULT_MS);
    expect(resolveToastPolicy({ title: 't', intent: 'warning' }).duration).toBe(TOAST_WARNING_MS);
    expect(resolveToastPolicy({ title: 't', intent: 'error' }).duration).toBe(TOAST_ERROR_MS);
  });

  it('error toasts auto-expire at the ceiling, not never', () => {
    const { duration, sticky } = resolveToastPolicy({ title: 't', intent: 'error' });
    expect(sticky).toBe(false);
    expect(duration).toBeGreaterThan(0);
    expect(Number.isFinite(duration)).toBe(true);
  });

  it('sticky opts out of expiry and forces the dismiss affordance', () => {
    const policy = resolveToastPolicy({ title: 't', sticky: true });
    expect(policy.sticky).toBe(true);
    expect(policy.duration).toBe(0);
    expect(policy.dismissible).toBe(true);
  });

  it('legacy duration 0 / Infinity map to sticky', () => {
    expect(resolveToastPolicy({ title: 't', duration: 0 }).sticky).toBe(true);
    expect(resolveToastPolicy({ title: 't', duration: Number.POSITIVE_INFINITY }).sticky).toBe(true);
  });

  it('explicit duration wins over the intent default (action floor still applies)', () => {
    expect(resolveToastPolicy({ title: 't', intent: 'error', duration: 3000 }).duration).toBe(3000);
    expect(
      resolveToastPolicy({
        title: 't',
        duration: 3000,
        action: { label: 'Undo', onPress: () => {} },
      }).duration,
    ).toBe(TOAST_ACTION_MIN_MS);
  });

  it('forces dismissible for error and sticky toasts (DEV warn)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(resolveToastPolicy({ title: 't', intent: 'error', dismissible: false }).dismissible).toBe(true);
      expect(resolveToastPolicy({ title: 't', sticky: true, dismissible: false }).dismissible).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[toast]'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('showToast stores the resolved policy on the entry', () => {
    act(() => {
      showToast({ title: 'Default' });
      showToast({ title: 'Failure', intent: 'error' });
      showToast({ title: 'Pinned', sticky: true });
    });
    const byTitle = (title: string) => getToasts().find((e) => e.title === title);
    expect(byTitle('Default')?.duration).toBe(TOAST_DEFAULT_MS);
    expect(byTitle('Failure')?.duration).toBe(TOAST_ERROR_MS);
    expect(byTitle('Failure')?.dismissible).toBe(true);
    expect(byTitle('Pinned')?.duration).toBe(0);
    expect(byTitle('Pinned')?.sticky).toBe(true);
  });
});

describe('useToast + ToastViewport (imperative)', () => {
  it('shows a toast in the viewport and stacks multiple', () => {
    renderWithProviders(
      <>
        <Trigger title="First toast" intent="accent" />
        <ToastViewport />
      </>,
    );
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByText('First toast')).toBeInTheDocument();
    act(() => {
      showToast({ title: 'Second toast', intent: 'error' });
    });
    expect(screen.getByText('First toast')).toBeInTheDocument();
    expect(screen.getByText('Second toast')).toBeInTheDocument();
    expect(getToasts()).toHaveLength(2);
  });

  it('viewport announce region carries Copied to clipboard.', async () => {
    renderWithProviders(<ToastViewport />);
    act(() => {
      showToast({ title: 'Copied to clipboard.', intent: 'success' });
    });
    expect(await screen.findByText('Copied to clipboard.')).toBeInTheDocument();
    await vi.waitFor(() => {
      const live = document.querySelector("[aria-live]:not([aria-live='off'])");
      expect(live?.textContent ?? '').toMatch(/Copied to clipboard/);
    });
  });

  it('dismisses via the close button', async () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<ToastViewport />);
      act(() => {
        showToast({ title: 'Closable', intent: 'warning' });
      });
      expect(screen.getByText('Closable')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Dismiss notification'));
      act(() => {
        vi.advanceTimersByTime(TOAST_EXIT_MS + 50);
      });
      expect(getToasts()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('auto-dismisses after its duration but keeps sticky toasts', () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<ToastViewport />);
      act(() => {
        showToast({ title: 'Ephemeral', duration: 1000 });
        showToast({ title: 'Sticky', sticky: true });
      });
      expect(getToasts()).toHaveLength(2);
      // Two advances: the close flows through React state (onOpenChange) and
      // only then schedules the store-removal timer.
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      act(() => {
        vi.advanceTimersByTime(TOAST_EXIT_MS + 100);
      });
      const titles = getToasts().map((t) => t.title);
      expect(titles).toContain('Sticky');
      expect(titles).not.toContain('Ephemeral');
    } finally {
      vi.useRealTimers();
    }
  });

  it('error toasts expire at the ceiling; sticky errors survive it', () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<ToastViewport />);
      act(() => {
        showToast({ title: 'Transient failure', intent: 'error' });
        showToast({ title: 'Pinned failure', intent: 'error', sticky: true });
      });
      expect(getToasts()).toHaveLength(2);
      act(() => {
        vi.advanceTimersByTime(TOAST_ERROR_MS + 100);
      });
      act(() => {
        vi.advanceTimersByTime(TOAST_EXIT_MS + 100);
      });
      const titles = getToasts().map((t) => t.title);
      expect(titles).not.toContain('Transient failure');
      expect(titles).toContain('Pinned failure');
      // Well past the ceiling the sticky error is still on screen.
      act(() => {
        vi.advanceTimersByTime(TOAST_ERROR_MS * 10);
      });
      expect(screen.getByText('Pinned failure')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('error toasts render the dismiss affordance even when the caller opts out', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      renderWithProviders(<ToastViewport />);
      act(() => {
        showToast({ title: 'Failure', intent: 'error', dismissible: false });
      });
      expect(screen.getByLabelText('Dismiss notification')).toBeInTheDocument();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('action button runs the callback and closes the toast', () => {
    vi.useFakeTimers();
    try {
      const onPress = vi.fn();
      renderWithProviders(<ToastViewport />);
      act(() => {
        showToast({
          title: 'Archived',
          sticky: true,
          action: { label: 'Undo', altText: 'Undo archive', onPress },
        });
      });
      fireEvent.click(screen.getByText('Undo'));
      expect(onPress).toHaveBeenCalledTimes(1);
      act(() => {
        vi.advanceTimersByTime(TOAST_EXIT_MS + 50);
      });
      expect(getToasts()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('extends duration to ≥10s when an action is present', () => {
    act(() => {
      showToast({
        title: 'Archived',
        duration: 3000,
        action: { label: 'Undo', onPress: () => {} },
      });
    });
    expect(getToasts()[0]?.duration).toBe(TOAST_ACTION_MIN_MS);
    act(() => {
      resetToasts();
    });
    act(() => {
      showToast({
        title: 'Archived',
        action: { label: 'Undo', onPress: () => {} },
      });
    });
    expect(getToasts()[0]?.duration).toBe(TOAST_ACTION_MIN_MS);
    act(() => {
      resetToasts();
    });
    act(() => {
      showToast({
        title: 'Sticky action',
        sticky: true,
        action: { label: 'Undo', onPress: () => {} },
      });
    });
    expect(getToasts()[0]?.duration).toBe(0);
  });

  it('re-showing the same id replaces instead of stacking', () => {
    renderWithProviders(<ToastViewport />);
    act(() => {
      showToast({ id: 'save', title: 'Saving…', sticky: true });
      showToast({ id: 'save', title: 'Saved', sticky: true });
    });
    expect(getToasts()).toHaveLength(1);
    expect(getToasts()[0]?.title).toBe('Saved');
  });

  it('dismissToast marks the entry closed then removes it', () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<ToastViewport />);
      let id = '';
      act(() => {
        id = showToast({ title: 'Bye', sticky: true });
      });
      act(() => {
        dismissToast(id);
      });
      expect(getToasts()[0]?.open).toBe(false);
      act(() => {
        vi.advanceTimersByTime(TOAST_EXIT_MS + 50);
      });
      expect(getToasts()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ToastViewport layering + single-mount contract', () => {
  it('contains the web viewport in the loading-tier stacking context', () => {
    renderWithProviders(<ToastViewport />);
    act(() => {
      showToast({ title: 'Layered' });
    });
    const layer = screen.getByTestId('toast-layer');
    expect(layer).toBeInTheDocument();
    // The toast card renders INSIDE the contained layer, so the tamagui
    // wrapper's hardcoded zIndex 1e5 is flattened below sheet/dialog portals.
    expect(layer.contains(screen.getByText('Layered'))).toBe(true);
  });

  it('renders each toast once when a second viewport mounts (DEV warn), and hands over on unmount', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { rerender } = renderWithProviders(
        <>
          <ToastViewport key="first" />
          <ToastViewport key="second" />
        </>,
      );
      act(() => {
        showToast({ title: 'Solo', sticky: true });
      });
      expect(screen.getAllByText('Solo')).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[toast] a second ToastViewport'));

      // Owner unmounts → the surviving viewport takes over rendering.
      rerender(
        <>
          <ToastViewport key="second" />
        </>,
      );
      expect(screen.getAllByText('Solo')).toHaveLength(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('Toast banned-error-word DEV warn', () => {
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
    renderWithProviders(<Toast title="Oops, please try again" intent="error" onDismiss={() => {}} />);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('banned-error-word'));
  });

  it('is silent for clean copy', () => {
    renderWithProviders(<Toast title="Saved" description="Record updated." onDismiss={() => {}} />);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('banned-error-word'));
  });
});

function classesByPrefix(el: Element, prefixes: string[]): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
}

function shadowClasses(el: Element): string[] {
  return classesByPrefix(el, ['_bxsh-']);
}

const ACTION = 'Undo';

function renderActionWeight(node: ReactElement): string[] {
  renderWithProviders(node);
  const textNode = screen.getByText(ACTION);
  const classes = classesByPrefix(textNode, ['_fow-']);
  cleanup();
  return classes;
}

function tokenVal(theme: ReturnType<typeof useTheme>, key: string): string {
  const t = theme as unknown as Record<string, { val?: unknown; get?: () => unknown }>;
  const raw = t[key]?.val ?? t[key]?.get?.();
  return typeof raw === 'string' ? raw : '';
}

const TOAST_INTENTS = ['accent', 'success', 'warning', 'error'] as const;
const CONTRAST_SCHEMES = ['light', 'dark'] as const;

const houseConfig = createDefaultThemeConfig();
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

/**
 * The HOUSE config, not the stock one `renderWithProviders` mounts. The
 * intent sub-themes the Toast wraps in (`light_warning`, ...) exist only
 * there; under stock the wrap falls back to the base ramp and the arm
 * certifies a pair the product never paints.
 */
function ContrastScheme({ scheme, children }: { scheme: (typeof CONTRAST_SCHEMES)[number]; children: ReactNode }) {
  return (
    <TamaguiProvider config={houseConfig.tamagui} defaultTheme={scheme} disableInjectCSS>
      <YStack backgroundColor="$background">{children}</YStack>
    </TamaguiProvider>
  );
}

/**
 * Accent toasts stay on the BASE theme and take their ink from
 * `useAccentOnSurface()` -- a picked value, not a token the label can name in
 * a class. Stamp it from inside the theme the Toast mounts in.
 */
function AccentInkProbe() {
  const onSurface = useAccentOnSurface();
  const theme = useTheme();
  const ink = onSurface.startsWith('$') ? tokenVal(theme, onSurface.slice(1)) || onSurface : onSurface;
  return <span data-testid="accent-ink" data-fg={ink} />;
}

/**
 * The RESTING atom for a prefix. Tamagui spells state atoms `_o-0hover-1` /
 * `_bg-0active-color5`, so a bare prefix read picks up hover paint and
 * certifies a surface nobody rests on.
 */
function restAtom(node: Element, prefix: string): string | undefined {
  for (const cls of Array.from(node.classList)) {
    if (!cls.startsWith(prefix)) {
      continue;
    }
    const value = cls.slice(prefix.length);
    if (/^\d*(hover|active|focus|press|disabled)/.test(value)) {
      continue;
    }
    return value;
  }
  return undefined;
}

/** `_o-0--9` is Tamagui's atom for 0.9; no resting atom means no rest dim. */
function restOpacity(node: Element): number {
  const atom = restAtom(node, '_o-');
  if (atom === undefined) {
    return 1;
  }
  const value = Number(atom.replaceAll('--', '.'));
  return Number.isFinite(value) ? value : 1;
}

/**
 * The ink as PAINTED. An opacity on the press target multiplies the label
 * toward the fill under it, so the token pair is not what a reader sees:
 * A warning action measured 4.66:1 as tokens and 3.88:1 as pixels.
 */
function paintedInk(ink: string, ground: string, alpha: number): string {
  const f = normalizeToHex(ink);
  const b = normalizeToHex(ground);
  if (!f || !b) {
    return ink;
  }
  if (alpha >= 1) {
    return f;
  }
  const channel = (offset: number) =>
    Math.round(
      Number.parseInt(f.slice(offset, offset + 2), 16) * alpha +
        Number.parseInt(b.slice(offset, offset + 2), 16) * (1 - alpha),
    )
      .toString(16)
      .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

describe('Toast overlay shadow (standalone === viewport)', () => {
  it('paints the SAME overlay shadow on both paths, not the $1 control token', () => {
    renderWithProviders(
      <YStack elevation={'$1' as never} data-testid="control-elev">
        control
      </YStack>,
    );
    const controlShadow = shadowClasses(screen.getByTestId('control-elev'));
    cleanup();

    renderWithProviders(
      <YStack elevation={'$2' as never} data-testid="overlay-elev">
        overlay
      </YStack>,
    );
    const overlayShadow = shadowClasses(screen.getByTestId('overlay-elev'));
    expect(overlayShadow).not.toHaveLength(0);
    expect(overlayShadow).not.toEqual(controlShadow);
    cleanup();

    renderWithProviders(<Toast title="Saved" onDismiss={() => {}} />);
    const standaloneShadow = shadowClasses(screen.getByTestId('toast'));
    expect(standaloneShadow).toEqual(overlayShadow);
    cleanup();

    renderWithProviders(<ToastViewport />);
    act(() => {
      showToast({ title: 'Viewport saved', sticky: true });
    });
    const viewportShadow = shadowClasses(screen.getByTestId('toast'));
    expect(viewportShadow).toEqual(overlayShadow);
    expect(viewportShadow).toEqual(standaloneShadow);
  });

  it('elevation none is flat on both paths; large is a different overlay token', () => {
    renderWithProviders(
      <Preset overrides={{ elevation: 'none' }}>
        <Toast title="Flat" onDismiss={() => {}} />
      </Preset>,
    );
    expect(shadowClasses(screen.getByTestId('toast'))).toEqual([]);
    cleanup();

    renderWithProviders(
      <Preset overrides={{ elevation: 'large' }}>
        <Toast title="High" onDismiss={() => {}} />
      </Preset>,
    );
    const large = shadowClasses(screen.getByTestId('toast'));
    expect(large).not.toHaveLength(0);
    cleanup();

    renderWithProviders(<Toast title="Default" onDismiss={() => {}} />);
    expect(shadowClasses(screen.getByTestId('toast'))).not.toEqual(large);
  });
});

describe('Toast 3px logical intent edge', () => {
  it('survives Tamagui style clobber in the style attribute and mirrors under RTL', () => {
    renderWithProviders(<Toast title="Saved" intent="success" onDismiss={() => {}} />);
    const toast = screen.getByTestId('toast') as HTMLElement;
    expect(toast.style.borderInlineStartWidth).toBe('3px');
    expect(toast.style.borderInlineStartStyle).toBe('solid');
    expect(toast.style.borderInlineStartColor).toBeTruthy();
    cleanup();

    renderWithProviders(
      <div dir="rtl">
        <Toast title="Saved" intent="error" onDismiss={() => {}} />
      </div>,
    );
    const rtl = screen.getByTestId('toast') as HTMLElement;
    expect(rtl.style.borderInlineStartWidth).toBe('3px');
    expect(rtl.closest("[dir='rtl']")).not.toBeNull();
  });
});

describe('Toast data attributes reach the DOM', () => {
  it('data-testid/data-size/data-density/data-nested-px land on standalone and viewport', () => {
    renderWithProviders(<Toast title="Saved" onDismiss={() => {}} />);
    const standalone = screen.getByTestId('toast');
    expect(standalone.getAttribute('data-testid')).toBe('toast');
    expect(standalone.getAttribute('data-size')).toBe('medium');
    expect(standalone.getAttribute('data-density')).toBe('comfortable');
    expect(Number(standalone.getAttribute('data-nested-px'))).toBeGreaterThan(0);
    cleanup();

    renderWithProviders(<ToastViewport />);
    act(() => {
      showToast({ title: 'Viewport attrs', sticky: true });
    });
    const viewport = screen.getByTestId('toast');
    expect(viewport.getAttribute('data-testid')).toBe('toast');
    expect(viewport.getAttribute('data-size')).toBeTruthy();
    expect(viewport.getAttribute('data-density')).toBeTruthy();
    expect(viewport.getAttribute('data-nested-px')).toBeTruthy();
  });

  it('size and density knob strips measurably move', () => {
    renderWithProviders(
      <Preset overrides={{ size: 'large' }}>
        <Toast title="Big" onDismiss={() => {}} />
      </Preset>,
    );
    const large = screen.getByTestId('toast');
    expect(large.getAttribute('data-size')).toBe('large');
    const largePx = Number(large.getAttribute('data-nested-px'));
    cleanup();

    renderWithProviders(
      <Preset overrides={{ size: 'small' }}>
        <Toast title="Small" onDismiss={() => {}} />
      </Preset>,
    );
    const small = screen.getByTestId('toast');
    expect(small.getAttribute('data-size')).toBe('small');
    expect(Number(small.getAttribute('data-nested-px'))).toBeLessThan(largePx);
    cleanup();

    renderWithProviders(
      <Preset overrides={{ density: 'compact' }}>
        <Toast title="Tight" onDismiss={() => {}} />
      </Preset>,
    );
    const compact = screen.getByTestId('toast');
    expect(compact.getAttribute('data-density')).toBe('compact');
    expect(compact.getAttribute('data-size')).toBe('medium');
  });
});

describe('Toast density moves padX and gap on the host', () => {
  afterEach(cleanup);

  const padX = ['_px-', '_pl-', '_pr-'];
  const gap = ['_gap-'];

  function hostAtoms(node: ReactElement) {
    renderWithProviders(node);
    const host = screen.getByTestId('toast');
    const measured = {
      density: host.getAttribute('data-density'),
      padX: classesByPrefix(host, padX),
      gap: classesByPrefix(host, gap),
    };
    cleanup();
    return measured;
  }

  it('the density knob changes padX and gap between the two stops', () => {
    const comfortable = hostAtoms(
      <Preset overrides={{ density: 'comfortable' }}>
        <Toast title="Saved" onDismiss={() => {}} />
      </Preset>,
    );
    const compact = hostAtoms(
      <Preset overrides={{ density: 'compact' }}>
        <Toast title="Saved" onDismiss={() => {}} />
      </Preset>,
    );
    expect(comfortable.density).toBe('comfortable');
    expect(compact.density).toBe('compact');
    expect(comfortable.padX.length).toBeGreaterThan(0);
    expect(comfortable.gap.length).toBeGreaterThan(0);
    expect(compact.padX).not.toEqual(comfortable.padX);
    expect(compact.gap).not.toEqual(comfortable.gap);
  });

  it('the compact prop lands the same padX and gap as the density knob', () => {
    const knob = hostAtoms(
      <Preset overrides={{ density: 'compact' }}>
        <Toast title="Saved" onDismiss={() => {}} />
      </Preset>,
    );
    const prop = hostAtoms(<Toast compact title="Saved" onDismiss={() => {}} />);
    expect(prop.density).toBe('compact');
    expect(prop.padX).toEqual(knob.padX);
    expect(prop.gap).toEqual(knob.gap);
  });
});

describe('Toast action label weight and contrast (TEXT NODE)', () => {
  it('Undo is weight 400 on the TEXT NODE, never 600', () => {
    const action = renderActionWeight(
      <Toast title="Archived" action={{ label: ACTION, onPress: () => {} }} onDismiss={() => {}} />,
    );
    const explicit400 = renderActionWeight(<SizableText fontWeight="400">{ACTION}</SizableText>);
    const explicit600 = renderActionWeight(<SizableText fontWeight="600">{ACTION}</SizableText>);
    expect(action).not.toHaveLength(0);
    expect(action).toEqual(explicit400);
    expect(action).not.toEqual(explicit600);

    renderWithProviders(<Toast title="Archived" action={{ label: ACTION, onPress: () => {} }} onDismiss={() => {}} />);
    const textNode = screen.getByText(ACTION);
    expect(textNode).not.toBe(screen.getByTestId('toast'));
    expect(screen.getByTestId('toast').contains(textNode)).toBe(true);
  });

  it.each(TOAST_INTENTS)('%s action label clears the AA floor AS PAINTED, in light and dark', (intent) => {
    for (const scheme of CONTRAST_SCHEMES) {
      renderWithProviders(
        <ContrastScheme scheme={scheme}>
          <AccentInkProbe />
          <Toast title="Archived" intent={intent} action={{ label: ACTION, onPress: () => {} }} onDismiss={() => {}} />
        </ContrastScheme>,
      );
      // Non-accent intents ride their hue sub-theme; accent stays on base.
      const theme = houseThemes[intent === 'accent' ? scheme : `${scheme}_${intent}`];
      const groundToken = restAtom(screen.getByTestId('toast'), '_bg-');
      const inkToken = restAtom(screen.getByText(ACTION), '_col-');
      const ground = theme?.[groundToken ?? ''] ?? '';
      const ink =
        intent === 'accent'
          ? (screen.getByTestId('accent-ink').getAttribute('data-fg') ?? '')
          : (theme?.[inkToken ?? ''] ?? '');
      const where = `${scheme} ${intent}: ${inkToken ?? '?'} on ${groundToken ?? '?'}`;
      expect(ground, `${where} -- the toast frame paints no resting fill`).toBeTruthy();
      expect(ink, `${where} -- the action label emits no resting ink`).toBeTruthy();
      const alpha = restOpacity(screen.getByLabelText(ACTION));
      const report = measureContrast({
        foreground: paintedInk(ink, ground, alpha),
        background: ground,
        label: `${where} at rest opacity ${alpha}`,
      });
      expect(report.ratio, report.label).toBeGreaterThanOrEqual(aaTextContrastRatio);
      cleanup();
    }
  });
});
