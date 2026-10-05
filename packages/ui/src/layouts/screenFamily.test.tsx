import { renderWithProviders } from '@repo/test-utils';
import { Preset, defaultKnobs, resolveKnobs } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Screen, ScreenToolbar } from './Page';

import * as Layouts from './index';

afterEach(cleanup);

function padAtoms(el: Element): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => c.startsWith('_p-') || c.startsWith('_pt-') || c.startsWith('_pad'))
    .sort();
}

describe('Screen family named exports', () => {
  it('exports Screen, ScreenToolbar, SafeAreaWrapper, and KeyboardAvoidingWrapper', () => {
    expect(typeof Layouts.Screen).toBe('function');
    expect(typeof Layouts.ScreenToolbar).toBe('function');
    expect(typeof Layouts.SafeAreaWrapper).toBe('function');
    expect(typeof Layouts.KeyboardAvoidingWrapper).toBe('function');
    expect(Layouts).not.toHaveProperty('default');
  });
});

describe('Screen density', () => {
  it('publishes the resolved density and does not pin comfortable', () => {
    const { container } = renderWithProviders(
      <Screen scroll={false}>
        <span>Page body</span>
      </Screen>,
    );
    const frame = container.querySelector('[data-testid="screen"]') as HTMLElement;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('data-density')).toBe(resolveKnobs(defaultKnobs).knobProps.density);
  });

  it('lets a compact preset restyle the page inset', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ density: 'compact' }}>
        <Screen scroll={false}>
          <span>Compact page</span>
        </Screen>
      </Preset>,
    );
    const frame = container.querySelector('[data-testid="screen"]') as HTMLElement;
    expect(frame.getAttribute('data-density')).toBe('compact');
  });

  it('noPadding skips panel padding', () => {
    const padded = renderWithProviders(
      <Screen scroll={false}>
        <span>Padded</span>
      </Screen>,
    );
    const paddedFrame = padded.container.querySelector('[data-testid="screen"]') as HTMLElement;
    cleanup();
    const bare = renderWithProviders(
      <Screen scroll={false} noPadding>
        <span>Bare</span>
      </Screen>,
    );
    const bareFrame = bare.container.querySelector('[data-testid="screen"]') as HTMLElement;
    expect(padAtoms(paddedFrame).length).toBeGreaterThan(0);
    expect(padAtoms(bareFrame)).not.toEqual(padAtoms(paddedFrame));
  });
});

describe('ScreenToolbar padding and containment', () => {
  it('spreads panelPadding and gap on the bar', () => {
    const { container } = renderWithProviders(
      <ScreenToolbar leading={<span>Back</span>} trailing={<span>Save</span>} />,
    );
    const bar = container.querySelector('[data-testid="screen-toolbar"]') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.getAttribute('data-density')).toBe(resolveKnobs(defaultKnobs).knobProps.density);
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
    const bar = container.querySelector('[data-testid="screen-toolbar"]') as HTMLElement;
    expect(bar).toBeTruthy();
    const style = bar.getAttribute('style') || bar.className;
    expect(style).toMatch(/wrap|flex-wrap|_fw-/);
  });

  it('bleeds Screen inset so nested toolbars do not double-pad', () => {
    const standalone = renderWithProviders(<ScreenToolbar leading={<span>Back</span>} />);
    const standaloneBar = standalone.container.querySelector('[data-testid="screen-toolbar"]') as HTMLElement;
    const standaloneMargin = String(standaloneBar.className || '')
      .split(' ')
      .filter((c) => c.startsWith('_mx-') || c.startsWith('_ml-') || c.startsWith('_mr-'))
      .sort();
    cleanup();

    const nested = renderWithProviders(
      <Screen scroll={false}>
        <ScreenToolbar leading={<span>Back</span>} />
      </Screen>,
    );
    const nestedBar = nested.container.querySelector('[data-testid="screen-toolbar"]') as HTMLElement;
    const nestedMargin = String(nestedBar.className || '')
      .split(' ')
      .filter((c) => c.startsWith('_mx-') || c.startsWith('_ml-') || c.startsWith('_mr-'))
      .sort();
    expect(nestedMargin).not.toEqual(standaloneMargin);
  });
});
