/**
 * The `tamaguiConfig` toolbar global renders a story under the full
 * house config or its default subset. A subset fails quietly (a dropped theme
 * renders in its parent's colours), so the switch is only worth having if the
 * dropped theme really falls back under it and comes back under full.
 */

import { createDefaultThemeConfig, type ThemeConfig, useResolvedKnobs } from '@repo/theme';
import { act, cleanup, render, screen } from '@testing-library/react';
import { setUserScheme, useUserScheme } from '@vxrn/color-scheme';
import type { ReactNode } from 'react';
import { TamaguiProvider, Theme, type ThemeName, getConfig, useThemeName } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { type Preview, createPreview } from './CreatePreview';

const full = createDefaultThemeConfig({});
const subset = createDefaultThemeConfig({
  subset: {
    components: ['Button', 'Input', 'TextArea'],
    tints: ['accent', 'active', 'alt1', 'alt2', 'error', 'success', 'warning'],
  },
});

const i18n = {
  instance: { changeLanguage: async () => undefined },
  languages: ['en'],
  defaultLanguage: 'en',
};

function AppProvider({
  themeConfig,
  systemTheme,
  children,
}: {
  themeConfig?: ThemeConfig;
  systemTheme?: 'light' | 'dark';
  children?: ReactNode;
}) {
  return (
    <TamaguiProvider config={themeConfig?.tamagui} defaultTheme={systemTheme} disableInjectCSS>
      {children}
    </TamaguiProvider>
  );
}

function ResolvedName({ theme }: { theme: string }) {
  return <span data-testid={theme}>{useThemeName()}</span>;
}

function Story() {
  return (
    <>
      {(['red', 'error'] as const).map((theme) => (
        <Theme key={theme} name={theme as ThemeName}>
          <ResolvedName theme={theme} />
        </Theme>
      ))}
    </>
  );
}

function renderStory(preview: Preview, globals: Record<string, unknown>) {
  const [frameworkDecorator] = preview.decorators ?? [];
  const context = (next: Record<string, unknown>) => ({
    globals: { ...preview.initialGlobals, scheme: 'light', ...next },
    parameters: {},
  });
  const view = render(frameworkDecorator(Story, context(globals)));
  return {
    rerender: (next: Record<string, unknown>) => {
      act(() => view.rerender(frameworkDecorator(Story, context(next))));
    },
  };
}

const resolved = (theme: string) => screen.getByTestId(theme).textContent;

afterEach(cleanup);

describe('createPreview tamaguiConfig global', () => {
  const preview = createPreview({ themeConfig: full, themeConfigs: { subset }, i18n, AppProvider });

  it('boots on the full config although the subset was created last', () => {
    expect(getConfig()).toBe(full.tamagui);
  });

  it('offers full and subset in the toolbar and defaults to full', () => {
    const toolbar = preview.globalTypes?.tamaguiConfig?.toolbar as { items: { value: string }[] };
    expect(toolbar.items.map((item) => item.value)).toEqual(['full', 'subset']);
    expect(preview.initialGlobals?.tamaguiConfig).toBe('full');
  });

  it('drops a hue under subset, keeps the semantic theme, and brings the hue back under full', () => {
    const story = renderStory(preview, {});
    expect(resolved('red')).toBe('light_red');
    expect(resolved('error')).toBe('light_error');

    story.rerender({ tamaguiConfig: 'subset' });
    expect(getConfig()).toBe(subset.tamagui);
    expect(resolved('red')).toBe('light');
    expect(resolved('error')).toBe('light_error');

    story.rerender({ tamaguiConfig: 'subset', scheme: 'dark' });
    expect(resolved('red')).toBe('dark');
    expect(resolved('error')).toBe('dark_error');

    story.rerender({ tamaguiConfig: 'full', scheme: 'dark' });
    expect(getConfig()).toBe(full.tamagui);
    expect(resolved('red')).toBe('dark_red');
    expect(resolved('error')).toBe('dark_error');
  });

  it('mounts straight under subset when the global arrives with the story', () => {
    renderStory(preview, { tamaguiConfig: 'subset' });
    expect(resolved('red')).toBe('light');
    expect(resolved('error')).toBe('light_error');
  });

  it('treats an unknown config name as full', () => {
    renderStory(preview, { tamaguiConfig: 'nope' });
    expect(getConfig()).toBe(full.tamagui);
    expect(resolved('red')).toBe('light_red');
  });
});

describe('createPreview actions', () => {
  it('does not inject implicit on* actions, which throw when fired during render', () => {
    const preview = createPreview({ themeConfig: full, i18n, AppProvider });
    expect(preview.parameters?.actions).toBeUndefined();
  });
});

describe('createPreview with one config', () => {
  it('registers no tamaguiConfig global', () => {
    const preview = createPreview({ themeConfig: full, i18n, AppProvider });
    expect(preview.globalTypes?.tamaguiConfig).toBeUndefined();
    expect(preview.initialGlobals).not.toHaveProperty('tamaguiConfig');
  });
});

describe('createPreview tableZebra global', () => {
  const preview = createPreview({ themeConfig: full, i18n, AppProvider });

  function Zebra() {
    return <span data-testid="zebra">{useResolvedKnobs().knobProps.tableZebra}</span>;
  }

  function renderZebra(globals: Record<string, unknown>) {
    const [frameworkDecorator] = preview.decorators ?? [];
    render(
      frameworkDecorator(Zebra, {
        globals: { ...preview.initialGlobals, scheme: 'light', ...globals },
        parameters: {},
      }),
    );
    return screen.getByTestId('zebra').textContent;
  }

  it('registers tableZebra so a URL global or the toolbar can set it', () => {
    expect(preview.globalTypes?.tableZebra?.options).toEqual(['on', 'off']);
    expect(preview.initialGlobals?.tableZebra).toBe('');
  });

  it("leaves the preset's zebra in place until the global is set", () => {
    expect(renderZebra({})).toBe('off');
    cleanup();
    expect(renderZebra({ tableZebra: 'on' })).toBe('on');
  });
});

describe('createPreview scheme global reaches useUserScheme', () => {
  const preview = createPreview({ themeConfig: full, i18n, AppProvider, setUserScheme });

  function UserScheme() {
    return <span data-testid="user-scheme">{useUserScheme().value}</span>;
  }

  function renderUserScheme(globals: Record<string, unknown>) {
    const [frameworkDecorator] = preview.decorators ?? [];
    const context = (next: Record<string, unknown>) => ({
      globals: { ...preview.initialGlobals, ...next },
      parameters: {},
    });
    const view = render(frameworkDecorator(UserScheme, context(globals)));
    return {
      value: () => screen.getByTestId('user-scheme').textContent,
      rerender: (next: Record<string, unknown>) => {
        act(() => view.rerender(frameworkDecorator(UserScheme, context(next))));
      },
    };
  }

  const prefersDark = (dark: boolean) => {
    const { happyDOM } = window as unknown as {
      happyDOM: { settings: { device: { prefersColorScheme: string } } };
    };
    happyDOM.settings.device.prefersColorScheme = dark ? 'dark' : 'light';
  };

  afterEach(() => {
    prefersDark(false);
  });

  it('reads dark under scheme:dark and light under scheme:light', () => {
    expect(renderUserScheme({ scheme: 'dark' }).value()).toBe('dark');
    cleanup();
    expect(renderUserScheme({ scheme: 'light' }).value()).toBe('light');
  });

  it('follows the toolbar when the global flips under a mounted story', () => {
    const story = renderUserScheme({ scheme: 'light' });
    story.rerender({ scheme: 'dark' });
    expect(story.value()).toBe('dark');
    story.rerender({ scheme: 'light' });
    expect(story.value()).toBe('light');
  });

  it("keeps scheme:system on the browser's prefers-color-scheme", () => {
    prefersDark(true);
    expect(renderUserScheme({ scheme: 'system' }).value()).toBe('dark');
    cleanup();
    prefersDark(false);
    expect(renderUserScheme({ scheme: 'system' }).value()).toBe('light');
  });
});
