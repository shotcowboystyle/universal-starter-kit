import { renderWithProviders } from '@repo/test-utils';
import { Preset, defaultKnobs, resolveKnobs } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Screen, ScreenToolbar } from './Page';

const Layouts = await import('./index');

const padAtoms = (el: Element): string[] =>
  el.className
    .split(' ')
    .filter((c) => c.startsWith('_p-') || c.startsWith('_pt-') || c.startsWith('_pad'))
    .toSorted();

describe('Screen family named exports', () => {
  it('exports Screen, ScreenToolbar, SafeAreaWrapper, and KeyboardAvoidingWrapper', () => {
    expect(Layouts.Screen).toBeTypeOf('function');
    expect(Layouts.ScreenToolbar).toBeTypeOf('function');
    expect(Layouts.SafeAreaWrapper).toBeTypeOf('function');
    expect(Layouts.KeyboardAvoidingWrapper).toBeTypeOf('function');
    expect(Layouts).not.toHaveProperty('default');
  });
});

describe('Screen density', () => {
  afterEach(cleanup);

  it('publishes the resolved density and does not pin comfortable', () => {
    const { container } = renderWithProviders(
      <Screen scroll={false}>
        <span>Page body</span>
      </Screen>,
    );
    const frame = container.querySelector<HTMLElement>('[data-testid="screen"]')!;
    expect(frame).toBeTruthy();
    expect(frame.dataset.density).toBe(resolveKnobs(defaultKnobs).knobProps.density);
  });

  it('lets a compact preset restyle the page inset', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ density: 'compact' }}>
        <Screen scroll={false}>
          <span>Compact page</span>
        </Screen>
      </Preset>,
    );
    const frame = container.querySelector<HTMLElement>('[data-testid="screen"]')!;
    expect(frame.dataset.density).toBe('compact');
  });

  it('noPadding skips panel padding', () => {
    const padded = renderWithProviders(
      <Screen scroll={false}>
        <span>Padded</span>
      </Screen>,
    );
    const paddedFrame = padded.container.querySelector<HTMLElement>('[data-testid="screen"]')!;
    cleanup();
    const bare = renderWithProviders(
      <Screen
        scroll={false}
        noPadding>
        <span>Bare</span>
      </Screen>,
    );
    const bareFrame = bare.container.querySelector<HTMLElement>('[data-testid="screen"]')!;
    expect(padAtoms(paddedFrame).length).toBeGreaterThan(0);
    expect(padAtoms(bareFrame)).not.toStrictEqual(padAtoms(paddedFrame));
  });
});

describe('ScreenToolbar padding and containment', () => {
  afterEach(cleanup);

  it('spreads panelPadding and gap on the bar', () => {
    const { container } = renderWithProviders(
      <ScreenToolbar
        leading={<span>Back</span>}
        trailing={<span>Save</span>}
      />,
    );
    const bar = container.querySelector<HTMLElement>('[data-testid="screen-toolbar"]')!;
    expect(bar).toBeTruthy();
    expect(bar.dataset.density).toBe(resolveKnobs(defaultKnobs).knobProps.density);
    expect(padAtoms(bar).length).toBeGreaterThan(0);
  });

  it('wraps long actions instead of painting past a narrow frame', () => {
    const { container } = renderWithProviders(
      <ScreenToolbar
        leading={<span>Back to the previous screen</span>}
        trailing={
          <>
            <span>Duplicate</span>
            <span>Archive</span>
            <span>Delete permanently</span>
            <span>Save changes</span>
          </>
        }
      />,
    );
    const bar = container.querySelector<HTMLElement>('[data-testid="screen-toolbar"]')!;
    expect(bar).toBeTruthy();
    const styleAttr = bar.getAttribute('style');
    const style = styleAttr === null || styleAttr === '' ? bar.className : styleAttr;
    expect(style).toMatch(/wrap|flex-wrap|_fw-/u);
  });

  it('bleeds Screen inset so nested toolbars do not double-pad', () => {
    const standalone = renderWithProviders(<ScreenToolbar leading={<span>Back</span>} />);
    const standaloneBar = standalone.container.querySelector<HTMLElement>('[data-testid="screen-toolbar"]')!;
    const standaloneMargin = standaloneBar.className
      .split(' ')
      .filter((c) => c.startsWith('_mx-') || c.startsWith('_ml-') || c.startsWith('_mr-'))
      .toSorted();
    cleanup();

    const nested = renderWithProviders(
      <Screen scroll={false}>
        <ScreenToolbar leading={<span>Back</span>} />
      </Screen>,
    );
    const nestedBar = nested.container.querySelector<HTMLElement>('[data-testid="screen-toolbar"]')!;
    const nestedMargin = nestedBar.className
      .split(' ')
      .filter((c) => c.startsWith('_mx-') || c.startsWith('_ml-') || c.startsWith('_mr-'))
      .toSorted();
    expect(nestedMargin).not.toStrictEqual(standaloneMargin);
  });
});
