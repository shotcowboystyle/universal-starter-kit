import type { ThemeName } from '@tamagui/web';
/**
 * The panel marks a knob "set" from its own session state, so every
 * remount showed every knob unset while the knobs stayed applied. core's
 * TanstackDevtools keys the shell on the resolved scheme, so a Scheme click
 * remounts it; a reload does the same. The applied knobs live in the
 * `mp.ov.*` cookies, so a fresh mount must read its markers back from them.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CookiesProvider } from 'react-cookie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cookieOverridesPrefix, cookiePreset, persistPresetOverrides } from '../cookies';
import { defaultKnobs } from '../knobs';
import { clearPresets, registerPreset } from '../shared';

import { ThemeDevtoolsPanel } from './ThemeDevtoolsPanel';

function clearThemeCookies() {
  for (const key of [cookiePreset, ...Array.from({ length: 10 }, (_, i) => `${cookieOverridesPrefix}.${i}`)]) {
    document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

function Shell({ scheme }: { scheme: 'light' | 'dark' }) {
  return (
    <CookiesProvider>
      <ThemeDevtoolsPanel key={scheme} devtoolsTheme={scheme} />
    </CookiesProvider>
  );
}

function pressed(label: string, title: string) {
  return within(screen.getByRole('group', { name: label }))
    .getByTitle(title)
    .getAttribute('aria-pressed');
}

beforeEach(clearThemeCookies);
afterEach(() => {
  cleanup();
  clearThemeCookies();
  clearPresets();
});

describe('ThemeDevtoolsPanel set markers survive a remount', () => {
  it('a reload over mp.ov.0 marks the persisted knob set and leaves the rest unset', () => {
    persistPresetOverrides({ fillStyle: 'outlined' });
    render(<Shell scheme="light" />);
    expect(pressed('Fill', 'outlined')).toBe('true');
    expect(pressed('Fill', 'unset (inherit)')).toBe('false');
    expect(pressed('Size', 'unset (inherit)')).toBe('true');
    expect(pressed('Radius', 'unset (inherit)')).toBe('true');
  });

  it('a knob set in the panel is still marked after the shell remounts it', () => {
    const shell = render(<Shell scheme="light" />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Fill' })).getByTitle('outlined'));
    expect(pressed('Fill', 'outlined')).toBe('true');

    shell.rerender(<Shell scheme="dark" />);
    expect(pressed('Fill', 'outlined')).toBe('true');
    expect(pressed('Fill', 'unset (inherit)')).toBe('false');
  });

  it("a preset's own values read as inherited, only the knobs over it as set", () => {
    registerPreset('mpo463', {
      theme: 'gray' as ThemeName,
      knobs: { ...defaultKnobs, fillStyle: 'outlined', size: 'small' },
      intents: {},
      tints: [],
    });
    document.cookie = `${cookiePreset}=mpo463; path=/`;
    persistPresetOverrides({ size: 'large' });
    render(<Shell scheme="light" />);
    expect(pressed('Fill', 'unset (inherit)')).toBe('true');
    expect(pressed('Size', 'large')).toBe('true');
    expect(pressed('Size', 'unset (inherit)')).toBe('false');
  });

  it('a knob never set shows unset after a remount', () => {
    const shell = render(<Shell scheme="light" />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Fill' })).getByTitle('outlined'));

    shell.rerender(<Shell scheme="dark" />);
    for (const label of ['Size', 'Space', 'Radius', 'Border', 'Elevation']) {
      expect(pressed(label, 'unset (inherit)'), label).toBe('true');
    }
  });
});
