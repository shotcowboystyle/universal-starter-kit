import { config } from '@repo/platform';
import {
  type Knobs,
  type ThemeConfig,
  BodyFont,
  BorderRadius,
  BorderWidth,
  CornerSmoothing,
  Density,
  DisabledStyle,
  Elevation,
  FillStyle,
  FontWeight,
  HeadingFont,
  PageTitleScale,
  animationNames,
  Space,
  Size,
  TableZebra,
  TextAccent,
  activateThemeConfig,
  getPreset,
  getPresetNames,
  useTheme,
  PresetContext,
  defaultPreset,
  defaultKnobs,
} from '@repo/theme';
import type { ThemeName } from '@tamagui/web';
import { type ComponentType, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CookiesProvider } from 'react-cookie';
import type { InputType } from 'storybook/internal/csf';
import { Theme, YStack, useTheme as useTamaguiTheme } from 'tamagui';

export const themeColorsChannelEvent = 'theme-addon/theme-colors';
export const themeColorsOppositeChannelEvent = 'theme-addon/theme-colors-opposite';
export const baseThemeColorsChannelEvent = 'theme-addon/base-theme-colors';
export const baseOppositeChannelEvent = 'theme-addon/base-colors-opposite';
export const accentColorsChannelEvent = 'theme-addon/accent-colors';
export const accentOppositeChannelEvent = 'theme-addon/accent-colors-opposite';
export const animationNamesChannelEvent = 'theme-addon/animation-names';
export const frappeDebugChannelEvent = 'frappe-addon/debug-state';

/**
 * Storybook 10 changed the `Preview` type to an opaque wrapper.
 * We define a simple ProjectAnnotations-compatible type for the factory return.
 * Exported so consumers' `const preview = createPreview(…)` declarations can
 * name the type (TS4023 otherwise).
 */
export interface Preview {
  globalTypes?: Record<string, InputType>;
  initialGlobals?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  decorators?: Array<(Story: any, context: any) => any>;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CreatePreviewI18n {
  /** An i18next-compatible instance (must expose changeLanguage). */
  instance: { changeLanguage(lang: string): Promise<unknown> };
  /** Available language codes shown in the Storybook toolbar. */
  languages: readonly string[];
  /** Fallback language. */
  defaultLanguage: string;
}

export interface CreatePreviewOptions {
  /** ThemeConfig produced by createDefaultThemeConfig(). */
  themeConfig: ThemeConfig;
  /**
   * More ThemeConfigs the `tamaguiConfig` toolbar global switches to, by
   * name, e.g. `{ subset: subsetThemeConfig }`. Each must build a subset of
   * `themeConfig`'s themes. `themeConfig` stays the default, listed as `full`.
   */
  themeConfigs?: Record<string, ThemeConfig>;
  /** i18n configuration for language switching via Storybook globals. */
  i18n: CreatePreviewI18n;
  /** AppProvider component produced by createApp(). */
  AppProvider: ComponentType<{
    themeConfig?: ThemeConfig;
    systemTheme?: 'light' | 'dark';
    children?: ReactNode;
  }>;
  /**
   * Pass `setUserScheme` from `one` / `@vxrn/color-scheme` so a story that
   * reads `useUserScheme` sees the `scheme` global, as the app's reader would.
   */
  setUserScheme?: (setting: 'system' | 'light' | 'dark') => void;
  /** Extra decorators appended after the framework decorator. */
  decorators?: Preview['decorators'];
  /** Extra parameters merged into the default set. */
  parameters?: Record<string, unknown>;
  /** Extra globalTypes merged into the generated set. */
  globalTypes?: Record<string, InputType>;
}

const defaultThemeConfigName = 'full';

// ---------------------------------------------------------------------------
// Knob options map — enum values for Storybook controls
// ---------------------------------------------------------------------------

const knobOptions: Record<string, readonly string[]> = {
  fillStyle: Object.values(FillStyle),
  borderRadius: Object.values(BorderRadius),
  cornerSmoothing: Object.values(CornerSmoothing),
  borderWidth: Object.values(BorderWidth),
  elevation: Object.values(Elevation),
  space: Object.values(Space),
  size: Object.values(Size),
  // Density is its own dial (compact steps space only), so
  // the size × density matrix is sweepable from the toolbar / URL globals.
  density: Object.values(Density),
  textAccent: Object.values(TextAccent),
  headingFont: Object.values(HeadingFont),
  bodyFont: Object.values(BodyFont),
  fontWeight: Object.values(FontWeight),
  // Hero-H1 dial: the page-title step is sweepable so the VERIFY probes
  // (and humans) can flip moderate/display from the toolbar or URL globals.
  pageTitleScale: Object.values(PageTitleScale),
  animation: ['none', ...animationNames],
  // The disabled-treatment dial is sweepable so the
  // VERIFY probes (and humans) can flip keepLabel/dimWhole from the toolbar
  // or via URL globals.
  disabledStyle: Object.values(DisabledStyle),
  // The one house knob a table sweep has to flip.
  tableZebra: Object.values(TableZebra),
};

const stateKnobFields = [
  'fillStyle',
  'borderRadius',
  'borderWidth',
  'elevation',
  'space',
  'size',
  'textAccent',
  'headingFont',
  'bodyFont',
  'fontWeight',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const toTitleCase = (str: string) => str.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());

function createControl(key: string): InputType {
  const name = toTitleCase(key);
  const values = knobOptions[key] ?? [];
  // SB 10 expects options as a flat array of primitive values.
  const serialized = values.map((value) => value);
  const labels = Object.fromEntries(serialized.map((v) => [v, v.replace('$', '')]));
  // Include defaultValue so Storybook's internal getValuesFromArgTypes
  // always registers this key — even if initialGlobals gets serialized away.
  const fallback = defaultKnobs[key as keyof typeof defaultKnobs];
  return {
    name,
    description: name.toLowerCase(),
    options: serialized,
    control: { type: 'select', labels },
    ...(fallback !== undefined && { defaultValue: fallback }),
  };
}

// ---------------------------------------------------------------------------
// Canvas background — keeps the preview iframe body in sync with $background
// ---------------------------------------------------------------------------

/**
 * Wraps story content and sets both the Tamagui `$background` on the wrapper
 * and the preview iframe `document.body` background so the entire canvas
 * matches the active color scheme (light/dark/system).
 */
function CanvasBackground({ children }: { children: ReactNode }) {
  const tamaguiTheme = useTamaguiTheme();
  const bg = tamaguiTheme.background?.val as string | undefined;

  useLayoutEffect(() => {
    if (bg) {
      document.body.style.backgroundColor = bg;
      document.documentElement.style.backgroundColor = bg;
    }
  }, [bg]);

  return (
    <YStack
      flex={1}
      minHeight="100vh"
      backgroundColor="$background"
      // Stable inner root for the theme-matrix capturer. `#storybook-root`
      // children include the Tamagui `<Theme>` host, which appears only
      // when a colour global is set — capturing there reports a remount as
      // geometry drift and a dead colour axis.
      id="mpo-matrix-root">
      {children}
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// ThemeColorEmitter — publishes resolved CSS color values via the Storybook
// channel so the manager-side ThemePanel can render accurate color previews
// without cross-iframe DOM scraping.
// ---------------------------------------------------------------------------

let _channelEmit: ((event: string, data: unknown) => void) | null = null;
function getChannelEmit(): ((event: string, data: unknown) => void) | null {
  if (_channelEmit) {
    return _channelEmit;
  }
  try {
    const mod = require('storybook/preview-api');
    const channel = mod.addons.getChannel();
    _channelEmit = (event: string, data: unknown) => channel.emit(event, data);
    return _channelEmit;
  } catch {
    return null;
  }
}

function AnimationNamesEmitter() {
  const emittedRef = useRef(false);
  useEffect(() => {
    if (emittedRef.current) {
      return;
    }
    emittedRef.current = true;
    getChannelEmit()?.(animationNamesChannelEvent, animationNames as string[]);
  }, []);
  return null;
}

/**
 * Emits SyncModule.__debug() snapshots to the manager-side Frappe addon panel.
 * Lazily resolves the frappe package — no-op if not installed or no SyncModule exists.
 */
function FrappeDebugEmitter() {
  const prevRef = useRef<string>('');
  const syncRef = useRef<any>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      try {
        const { __getActiveSyncModule } = await import('@multiplatform.one/frappe');
        const sync = __getActiveSyncModule();
        if (sync && !cancelled) {
          syncRef.current = sync;
          setTick((t) => t + 1);
          return sync.subscribeStore(() => {
            if (!cancelled) {
              setTick((t) => t + 1);
            }
          });
        }
      } catch {
        // frappe not available
      }
    }

    const cleanupPromise = resolve();
    // Retry a few times since SyncModule is created lazily
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (syncRef.current || cancelled || attempts >= 10) {
        clearInterval(interval);
        return;
      }
      await resolve();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      cleanupPromise.then((unsub) => unsub?.());
    };
  }, []);

  useEffect(() => {
    if (!syncRef.current) {
      return;
    }
    const emit = getChannelEmit();
    if (!emit) {
      return;
    }
    try {
      const state = syncRef.current.__debug();
      const key = JSON.stringify(state);
      if (key === prevRef.current) {
        return;
      }
      prevRef.current = key;
      emit(frappeDebugChannelEvent, state);
    } catch {
      // debug not available
    }
  }, [tick]);

  return null;
}

function ThemeColorEmitter() {
  const tamaguiTheme = useTamaguiTheme();
  const prevRef = useRef<string>('');

  useEffect(() => {
    const colors: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const token = (tamaguiTheme as Record<string, { val?: string } | undefined>)[`color${i}`];
      colors.push(token?.val ?? '');
    }
    const key = colors.join('|');
    if (key === prevRef.current) {
      return;
    }
    prevRef.current = key;

    getChannelEmit()?.(themeColorsChannelEvent, colors);
  }, [tamaguiTheme]);

  return null;
}

function BaseThemeColorEmitter() {
  const tamaguiTheme = useTamaguiTheme();
  const prevRef = useRef<string>('');

  useEffect(() => {
    const colors: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const token = (tamaguiTheme as Record<string, { val?: string } | undefined>)[`color${i}`];
      colors.push(token?.val ?? '');
    }
    const key = colors.join('|');
    if (key === prevRef.current) {
      return;
    }
    prevRef.current = key;

    getChannelEmit()?.(baseThemeColorsChannelEvent, colors);
  }, [tamaguiTheme]);

  return null;
}

function OppositeThemeColorEmitter() {
  const tamaguiTheme = useTamaguiTheme();
  const prevRef = useRef<string>('');

  useEffect(() => {
    const colors: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const token = (tamaguiTheme as Record<string, { val?: string } | undefined>)[`color${i}`];
      colors.push(token?.val ?? '');
    }
    const key = colors.join('|');
    if (key === prevRef.current) {
      return;
    }
    prevRef.current = key;

    getChannelEmit()?.(themeColorsOppositeChannelEvent, colors);
  }, [tamaguiTheme]);

  return null;
}

function ColorChannelEmitter({ event, prefix = 'color' }: { event: string; prefix?: 'color' | 'accent' }) {
  const tamaguiTheme = useTamaguiTheme();
  const prevRef = useRef<string>('');

  useEffect(() => {
    const colors: string[] = [];
    let found = false;
    for (let i = 1; i <= 12; i++) {
      const token = (tamaguiTheme as Record<string, { val?: string } | undefined>)[`${prefix}${i}`];
      const val = token?.val ?? '';
      colors.push(val);
      if (val) {
        found = true;
      }
    }
    if (!found) {
      return;
    }
    const key = colors.join('|');
    if (key === prevRef.current) {
      return;
    }
    prevRef.current = key;

    getChannelEmit()?.(event, colors);
  }, [tamaguiTheme, event, prefix]);

  return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Storybook Preview config with Tamagui theme-switching, dark-mode
 * sync, and i18n language-switching baked in.
 *
 * Returns a Preview object ready to `export default` from your `.storybook/preview.tsx`.
 */
const tamaguiPropLeakPatterns = [
  'pressTheme',
  'scaleIcon',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderTopLeftRadius',
  'borderBottomLeftRadius',
] as const;

function suppressTamaguiDomWarnings() {
  if (typeof window === 'undefined') {
    return;
  }
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
    if (msg.includes('React does not recognize the') && tamaguiPropLeakPatterns.some((p) => msg.includes(p))) {
      return;
    }
    origError(...args);
  };
}
suppressTamaguiDomWarnings();

export function createPreview(options: CreatePreviewOptions): Preview {
  const {
    themeConfig,
    i18n,
    AppProvider,
    setUserScheme,
    decorators: extraDecorators = [],
    parameters: extraParameters = {},
    globalTypes: extraGlobalTypes = {},
  } = options;

  // -- Tamagui config switch -------------------------------------------------

  const themeConfigsByName: Record<string, ThemeConfig> = {
    ...options.themeConfigs,
    [defaultThemeConfigName]: themeConfig,
  };
  const themeConfigNames = [
    defaultThemeConfigName,
    ...Object.keys(themeConfigsByName).filter((name) => name !== defaultThemeConfigName),
  ];
  const switchesThemeConfig = themeConfigNames.length > 1;
  // Tamagui reads theme values from the themes of the config it first renders
  // under, for good, so the preview boots on the default config and every
  // alternate must build a subset of its themes.
  if (switchesThemeConfig) {
    activateThemeConfig(themeConfig);
  }
  let activeThemeConfigName = defaultThemeConfigName;

  // Switching runs in a layout effect, not during render: dropping Tamagui's
  // theme-name cache re-renders every mounted theme consumer. The keyed
  // AppProvider then remounts the story under the new config before paint.
  function useActiveThemeConfigName(requested: string): string {
    const [active, setActive] = useState(activeThemeConfigName);
    useLayoutEffect(() => {
      if (requested !== activeThemeConfigName) {
        activateThemeConfig(themeConfigsByName[requested]);
        activeThemeConfigName = requested;
      }
      setActive(requested);
    }, [requested]);
    return active;
  }

  // -- globalTypes -----------------------------------------------------------

  const enumKeys = Object.keys(knobOptions);

  const generatedGlobalTypes: Record<string, InputType> = {};
  for (const key of enumKeys) {
    generatedGlobalTypes[key] = createControl(key);
  }
  // Register state override globals so Storybook persists them across reloads.
  for (const state of ['hover', 'press', 'focus', 'focusVisible'] as const) {
    for (const field of stateKnobFields) {
      const stateKey = `${state}.${field}`;
      const values = knobOptions[field] ?? [];
      const serialized = values.map((value) => value);
      const labels = Object.fromEntries(serialized.map((v) => [v, v.replace('$', '')]));
      generatedGlobalTypes[stateKey] = {
        name: `${toTitleCase(state)} ${toTitleCase(field)}`,
        description: `${state} override for ${field}`,
        options: serialized,
        control: { type: 'select', labels },
        defaultValue: '',
      };
    }
  }
  // Color theme control — use the pre-computed themeColors list from the
  // ThemeConfig (extracted from the raw themes object at config creation
  // time, with semantic/state sub-themes already filtered out).
  const themeColorNames = ['', ...themeConfig.themeColors];

  // Extract a representative midpoint color (color7) from each theme so the
  // manager-side toolbar can show colored swatches without iframe access.
  const themeSwatches: Record<string, string> = {};
  const allThemes = (themeConfig.tamagui as unknown as { themes?: Record<string, Record<string, unknown>> }).themes;
  if (allThemes) {
    for (const name of themeConfig.themeColors) {
      const theme = allThemes[`light_${name}`] ?? allThemes[name];
      if (!theme) {
        continue;
      }
      const token = theme.color7;
      if (typeof token === 'string') {
        themeSwatches[name] = token;
      } else if (token && typeof token === 'object' && 'val' in (token as Record<string, unknown>)) {
        themeSwatches[name] = String((token as { val: unknown }).val);
      }
    }
  }

  generatedGlobalTypes.color = {
    name: 'Theme',
    description: 'Theme color palette',
    options: themeColorNames,
    control: {
      type: 'select',
      labels: Object.fromEntries(themeColorNames.map((v) => [v, v || '(none)'])),
    },
  };

  generatedGlobalTypes.scheme = {
    name: 'Scheme',
    description: 'Color scheme (light/dark/system)',
    options: ['system', 'light', 'dark'],
    control: { type: 'select' },
  };

  generatedGlobalTypes.locale = {
    name: 'Locale',
    description: 'Controls internationalization language',
    options: [...i18n.languages],
    control: { type: 'select' },
    toolbar: {
      title: 'Locale',
      items: [...i18n.languages],
      dynamicTitle: true,
    },
  };

  if (switchesThemeConfig) {
    generatedGlobalTypes.tamaguiConfig = {
      name: 'Tamagui config',
      description: 'Tamagui config the story renders under',
      options: themeConfigNames,
      control: { type: 'select' },
      toolbar: {
        title: 'Tamagui config',
        icon: 'paintbrush',
        items: themeConfigNames.map((name) => ({ value: name, title: `${name} config` })),
        dynamicTitle: true,
      },
    };
  }

  const globalTypes = { ...generatedGlobalTypes, ...extraGlobalTypes };

  // -- initialGlobals --------------------------------------------------------

  // Color and scheme get initial values (always visible in toolbar).
  // All knob keys are declared (as undefined) so that Storybook's runtime
  // recognises them when the ThemePanel calls updateGlobals(). The decorator
  // falls through to preset → knob defaults when a value is undefined.
  const initialGlobals: Record<string, unknown> = {
    locale: config.get('I18N_DEFAULT_LANGUAGE', i18n.defaultLanguage),
    color: '',
    scheme: 'system',
    // Publish registered preset names so the manager-side ThemePanel can
    // render a preset selector without importing the theme package.
    __presetNames: getPresetNames(),
    // Publish available theme color names so the ThemePanel can show only
    // colors that actually have registered Tamagui sub-themes.
    __themeColors: themeColorNames,
    __themeSwatches: themeSwatches,
    preset: themeConfig.defaultPreset ?? '',
    ...(switchesThemeConfig && { tamaguiConfig: defaultThemeConfigName }),
  };
  // Register every knob key so Storybook allows setting them from the manager.
  // Use empty string (not undefined) — JSON.stringify strips undefined values,
  // so Storybook would lose the keys after serialization/reload.
  for (const key of enumKeys) {
    if (!(key in initialGlobals)) {
      initialGlobals[key] = '';
    }
  }
  for (const state of ['hover', 'press', 'focus', 'focusVisible'] as const) {
    for (const field of stateKnobFields) {
      initialGlobals[`${state}.${field}`] = '';
    }
  }

  // Publish the machine-readable globals axes for automated sweeps
  // (verify:theme-matrix, lost-pixel matrix page generation). Probes read
  // this one well-known global from the preview iframe instead of
  // spelunking Storybook internals; every value is URL-addressable via
  // `iframe.html?globals=scheme:dark;color:blue;preset:bold`. The empty
  // string is the real default cell on both axes (no colour override /
  // the implicit default preset), so it is part of the axis, not padding.
  (globalThis as Record<string, unknown>).__MPO_THEME_AXES__ = {
    schemes: ['light', 'dark'],
    themeColors: themeColorNames,
    presets: ['', ...getPresetNames()],
  };

  // -- parameters ------------------------------------------------------------

  const defaultParameters = {
    actions: { argTypesRegex: '^on[A-Z].*' },
    layout: 'padded',
    viewMode: 'story',
    controls: {
      expanded: true,
      hideNoControlsWarning: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    // Disable the built-in backgrounds addon — the CanvasBackground component
    // manages the preview background via the Tamagui $background token so it
    // stays in sync with the active color scheme.
    backgrounds: { disable: true },
    previewTabs: {
      'storybook/docs/panel': { hidden: true },
    },
    a11y: { test: false },
    docs: {
      codePanel: true,
    },
    darkMode: {
      stylePreview: true,
    },
  };

  // -- framework decorator ---------------------------------------------------

  // useTheme() calls useCookies() internally, which requires <CookiesProvider>
  // to be a parent in the React tree. Since the decorator *renders* the provider,
  // we split into an outer shell (provides CookiesProvider) and an inner component
  // (calls useTheme safely inside that provider).
  function FrameworkDecoratorInner({
    Story,
    context,
  }: {
    Story: NonNullable<Parameters<NonNullable<Preview['decorators']>[number]>[0]>;
    context: Parameters<NonNullable<Preview['decorators']>[number]>[1];
  }) {
    const [knobs, setKnobs] = useTheme();

    // Resolve the effective color scheme from the toolbar global.
    // "system" defers to the browser's prefers-color-scheme and reacts to
    // OS changes in real-time. "light"/"dark" are used as-is.
    // URL globals (?globals=scheme:dark;…) are handled natively by SB 10.
    const schemeGlobal = (context.globals.scheme as string) || 'system';
    const [resolvedScheme, setResolvedScheme] = useState<'light' | 'dark'>(() => {
      if (schemeGlobal === 'light' || schemeGlobal === 'dark') {
        return schemeGlobal;
      }
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'light';
    });
    useEffect(() => {
      if (schemeGlobal === 'light' || schemeGlobal === 'dark') {
        setResolvedScheme(schemeGlobal);
        return;
      }
      if (typeof window === 'undefined' || !window.matchMedia) {
        setResolvedScheme('light');
        return;
      }
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        setResolvedScheme(mq.matches ? 'dark' : 'light');
      };
      handler();
      mq.addEventListener('change', handler);
      return () => {
        mq.removeEventListener('change', handler);
      };
    }, [schemeGlobal]);
    useLayoutEffect(() => {
      setUserScheme?.(schemeGlobal === 'light' || schemeGlobal === 'dark' ? schemeGlobal : 'system');
    }, [schemeGlobal]);

    // Resolve the active Tamagui color theme (e.g. "purple", "blue") from
    // the toolbar global. This wraps the story in <Theme name={color}> so
    // all Tamagui components pick it up implicitly through context.
    const colorGlobal = (context.globals.color as string) || '';

    const requestedThemeConfig = context.globals.tamaguiConfig as string | undefined;
    const themeConfigName = useActiveThemeConfigName(
      requestedThemeConfig && themeConfigNames.includes(requestedThemeConfig)
        ? requestedThemeConfig
        : defaultThemeConfigName,
    );

    // Per-story theme overrides via `parameters.theme` (AC-5.4).
    // Stories can specify e.g. `parameters: { theme: { padding: "large" } }`
    // to pin a specific knob configuration for that story.
    const storyThemeParams = context.parameters?.theme as Partial<Knobs> | undefined;

    // Resolve the active preset (if any) from the `preset` global.
    const activePresetName = context.globals.preset as string | undefined;
    const activePreset = activePresetName ? getPreset(activePresetName) : undefined;

    const knobUpdate = useMemo(() => {
      const result: Partial<Knobs> = {};
      const stateKeys = new Set(['hover', 'press', 'focus', 'focusVisible']);
      for (const key of Object.keys(knobs) as Array<keyof Knobs>) {
        if (stateKeys.has(key)) {
          continue;
        }
        if (storyThemeParams && key in storyThemeParams) {
          (result as Record<string, unknown>)[key] = storyThemeParams[key];
        } else if (key in context.globals && context.globals[key] !== undefined && context.globals[key] !== '') {
          (result as Record<string, unknown>)[key] = parseValue(context.globals[key]);
        } else if (activePreset && key in activePreset.knobs) {
          (result as Record<string, unknown>)[key] = activePreset.knobs[key];
        } else {
          (result as Record<string, unknown>)[key] = defaultKnobs[key];
        }
      }
      for (const state of stateKeys) {
        const stateObj: Record<string, string> = {};
        let hasValues = false;
        for (const field of stateKnobFields) {
          const globalKey = `${state}.${field}`;
          const val = context.globals[globalKey] as string | undefined;
          if (val) {
            stateObj[field] = val;
            hasValues = true;
          }
        }
        if (hasValues) {
          (result as Record<string, unknown>)[state] = stateObj;
        }
      }
      return result;
    }, [knobs, context.globals, storyThemeParams, activePreset]);

    useEffect(() => {
      setKnobs(knobUpdate);
    }, [knobUpdate, setKnobs]);

    useEffect(() => {
      i18n.instance.changeLanguage(context.globals.locale);
    }, [context.globals.locale]);

    // Build a PresetContext value from the resolved knobs so that
    // useResolvedKnobs() inside story components picks up the live values.
    // Include the active color theme so components can read preset.theme.
    const presetCtxValue = useMemo(
      () => ({
        preset: {
          ...defaultPreset,
          theme: colorGlobal || defaultPreset.theme,
          knobs: { ...defaultKnobs, ...knobUpdate } as Knobs,
        },
        overrides: undefined,
      }),
      [knobUpdate, colorGlobal],
    );

    const animationValue = presetCtxValue.preset.knobs.animation;
    useEffect(() => {
      const ms =
        animationValue === 'none'
          ? '0ms'
          : animationValue === 'quick'
            ? '100ms'
            : animationValue === 'medium'
              ? '200ms'
              : animationValue === 'slow' || animationValue === 'lazy'
                ? '350ms'
                : animationValue === 'bouncy'
                  ? '300ms'
                  : '200ms';
      document.documentElement.style.setProperty('--mp-transition', ms);
    }, [animationValue]);

    const storyContent = (
      <CanvasBackground>
        <Story {...context} />
      </CanvasBackground>
    );

    const oppositeScheme = resolvedScheme === 'dark' ? 'light' : 'dark';

    return (
      <PresetContext.Provider value={presetCtxValue}>
        <AppProvider
          key={themeConfigName}
          themeConfig={themeConfigsByName[themeConfigName]}
          systemTheme={resolvedScheme}>
          {/* FontKnobStyles lives inside ThemeProvider / KnobBridge so
              Storybook and shipped apps share one mount. A second copy
              here would race the style-tag cleanup. */}
          <AnimationNamesEmitter />
          <FrappeDebugEmitter />
          <BaseThemeColorEmitter />
          {/* Always wrap in Theme so the host node exists on the default
              colour cell too. An empty colour global keeps the scheme
              theme; a named colour is the Tamagui subtheme. */}
          <Theme name={colorGlobal || resolvedScheme}>
            <ThemeColorEmitter />
            <ColorChannelEmitter event={accentColorsChannelEvent} prefix="accent" />
            {storyContent}
          </Theme>
          {/* Opposite scheme emitters */}
          <Theme name={oppositeScheme as ThemeName}>
            <OppositeThemeColorEmitter />
            {colorGlobal ? (
              <Theme name={colorGlobal}>
                <ColorChannelEmitter event={baseOppositeChannelEvent} />
                <ColorChannelEmitter event={accentOppositeChannelEvent} prefix="accent" />
              </Theme>
            ) : (
              <>
                <ColorChannelEmitter event={baseOppositeChannelEvent} />
                <ColorChannelEmitter event={accentOppositeChannelEvent} prefix="accent" />
              </>
            )}
          </Theme>
        </AppProvider>
      </PresetContext.Provider>
    );
  }

  const frameworkDecorator: NonNullable<Preview['decorators']>[number] = (Story, context) => (
    <CookiesProvider>
      <FrameworkDecoratorInner Story={Story} context={context} />
    </CookiesProvider>
  );

  // -- assemble --------------------------------------------------------------

  return {
    globalTypes,
    initialGlobals,
    parameters: { ...defaultParameters, ...extraParameters },
    decorators: [frameworkDecorator, ...extraDecorators],
  };
}
