import type { __getActiveSyncModule } from '@repo/frappe';
import { config } from '@repo/platform';
import {
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
import type { Knobs, ThemeConfig } from '@repo/theme';
import type { ThemeName, Variable } from '@tamagui/web';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { CookiesProvider } from 'react-cookie';
import type { Globals, InputType, Parameters as StoryParameters } from 'storybook/internal/csf';
import type { addons } from 'storybook/preview-api';
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
  initialGlobals?: Globals;
  parameters?: StoryParameters;
  // oxlint-disable-next-line typescript/no-explicit-any -- Storybook's Story/context types are renderer-specific; `any` keeps consumers' own Decorator types assignable
  decorators?: ((Story: any, context: any) => any)[];
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CreatePreviewI18n {
  /** An i18next-compatible instance (must expose changeLanguage). */
  instance: {
    // oxlint-disable-next-line anti-slop/no-unknown-returns -- i18next resolves with its own TFunction; callers only await completion
    changeLanguage: (lang: string) => Promise<unknown>;
  };
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
  parameters?: StoryParameters;
  /** Extra globalTypes merged into the generated set. */
  globalTypes?: Record<string, InputType>;
}

const defaultThemeConfigName = 'full';

// ---------------------------------------------------------------------------
// Knob options map — enum values for Storybook controls
// ---------------------------------------------------------------------------

const knobOptions = {
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
} satisfies Record<string, readonly string[]>;

type KnobOptionKey = keyof typeof knobOptions;

// SAFETY: Object.keys(knobOptions) yields exactly the keys of the knobOptions literal.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys is typed string[]
const knobOptionKeys = Object.keys(knobOptions) as KnobOptionKey[];

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
] as const satisfies readonly KnobOptionKey[];

const interactionStateNames = ['hover', 'press', 'focus', 'focusVisible'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reads a global as a string; anything else (unset, non-string) reads as undefined. */
const readGlobal = (globals: Globals, key: string): string | undefined => {
  const value: unknown = globals[key];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Storybook globals are untyped external input
  return typeof value === 'string' ? value : undefined;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- JSON boundary: serialized globals in, arbitrary parsed value out
const parseValue = (value: unknown): unknown => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- JSON boundary: only strings are serialized
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const toTitleCase = (str: string) => str.replaceAll(/[A-Z]/gu, ' $&').replace(/^./u, (s) => s.toUpperCase());

/** `options` + `control` for a select over `values`, as Storybook 10 expects (flat primitives). */
const createSelectControl = (values: readonly string[]): Pick<InputType, 'control' | 'options'> => {
  const options = [...values];
  const labels = Object.fromEntries(options.map((v) => [v, v.replace('$', '')]));
  return { options, control: { type: 'select', labels } };
};

const createControl = (key: KnobOptionKey): InputType => {
  const name = toTitleCase(key);
  // Include defaultValue so Storybook's internal getValuesFromArgTypes
  // always registers this key — even if initialGlobals gets serialized away.
  const fallback = defaultKnobs[key];
  return {
    name,
    description: name.toLowerCase(),
    ...createSelectControl(knobOptions[key]),
    ...(fallback !== undefined && { defaultValue: fallback }),
  };
};

/** `hover.fillStyle`-style globals that pin a knob per interaction state. */
const stateOverrides = interactionStateNames.flatMap((state) =>
  stateKnobFields.map((field) => ({ state, field, key: `${state}.${field}` })),
);

/** Every SELECT dial and state override as a Storybook global type. */
const createGeneratedGlobalTypes = () => ({
  ...Object.fromEntries(knobOptionKeys.map((key) => [key, createControl(key)])),
  // Register state override globals so Storybook persists them across reloads.
  ...Object.fromEntries(
    stateOverrides.map(({ state, field, key }) => [
      key,
      {
        name: `${toTitleCase(state)} ${toTitleCase(field)}`,
        description: `${state} override for ${field}`,
        ...createSelectControl(knobOptions[field]),
        defaultValue: '',
      } satisfies InputType,
    ]),
  ),
});

/** A theme token as Tamagui exposes it: a Variable with a resolved `val`. */
interface ThemeToken {
  val?: string;
}

/** Tamagui theme proxies resolve any token name to a ThemeToken (or undefined). */
interface ThemeTokenLookup {
  [name: string]: ThemeToken | undefined;
}

const readTokenValue = (theme: ReturnType<typeof useTamaguiTheme>, name: string): string | undefined => {
  // SAFETY: a Tamagui theme proxy answers every token name with a Variable ({ val }) or undefined.
  const tokens = theme as ThemeTokenLookup;
  return tokens[name]?.val;
};

const swatchValue = (token: string | Variable | undefined): string | undefined => {
  if (token == null) {
    return undefined;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Tamagui theme values are either a CSS string or a Variable
  if (typeof token === 'string') {
    return token;
  }
  return 'val' in token ? String(token.val) : undefined;
};

/** Resolves each theme color's `color7` midpoint token to a CSS value, for toolbar swatches. */
const buildThemeSwatches = (themeConfig: ThemeConfig) => {
  const { themes } = themeConfig.tamagui;
  return Object.fromEntries(
    themeConfig.themeColors.flatMap((name) => {
      const theme = themes[`light_${name}`] ?? themes[name];
      if (theme === undefined) {
        return [];
      }
      const value = swatchValue(theme.color7);
      return value === undefined ? [] : [[name, value]];
    }),
  );
};

// ---------------------------------------------------------------------------
// Canvas background — keeps the preview iframe body in sync with $background
// ---------------------------------------------------------------------------

/**
 * Wraps story content and sets both the Tamagui `$background` on the wrapper
 * and the preview iframe `document.body` background so the entire canvas
 * matches the active color scheme (light/dark/system).
 */
const CanvasBackground = ({ children }: { children: ReactNode }) => {
  const tamaguiTheme = useTamaguiTheme();
  const bg = readTokenValue(tamaguiTheme, 'background');

  useLayoutEffect(() => {
    if (bg !== undefined && bg !== '') {
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
      // when a color global is set — capturing there reports a remount as
      // geometry drift and a dead color axis.
      id="mpo-matrix-root">
      {children}
    </YStack>
  );
};

// ---------------------------------------------------------------------------
// ThemeColorEmitter — publishes resolved CSS color values via the Storybook
// channel so the manager-side ThemePanel can render accurate color previews
// without cross-iframe DOM scraping.
// ---------------------------------------------------------------------------

type SyncModule = NonNullable<ReturnType<typeof __getActiveSyncModule>>;

type ChannelPayload = string[] | ReturnType<SyncModule['__debug']>;

type ChannelEmit = (event: string, data: ChannelPayload) => void;

let channelEmit: ChannelEmit | null = null;
const getChannelEmit = (): ChannelEmit | null => {
  if (channelEmit !== null) {
    return channelEmit;
  }
  try {
    // Lazy on purpose: the preview API only exists inside a running Storybook, so a missing module means "no channel".
    // oxlint-disable-next-line typescript/no-unsafe-assignment, unicorn/prefer-module, node/global-require -- lazy CJS require inside try; a static import would throw at load outside Storybook
    const mod: { addons: typeof addons } = require('storybook/preview-api');
    const channel = mod.addons.getChannel();
    channelEmit = (event, data) => {
      channel.emit(event, data);
    };
    return channelEmit;
  } catch {
    return null;
  }
};

const AnimationNamesEmitter = () => {
  const emittedRef = useRef(false);
  useEffect(() => {
    if (emittedRef.current) {
      return;
    }
    emittedRef.current = true;
    getChannelEmit()?.(animationNamesChannelEvent, [...animationNames]);
  }, []);
  return null;
};

const loadActiveSyncModule = async () => {
  const { __getActiveSyncModule: getActiveSyncModule } = await import('@repo/frappe');
  return getActiveSyncModule();
};

/**
 * Emits SyncModule.__debug() snapshots to the manager-side Frappe addon panel.
 * Lazily resolves the frappe package — no-op if not installed or no SyncModule exists.
 */
const FrappeDebugEmitter = () => {
  const prevRef = useRef<string>('');
  const syncRef = useRef<SyncModule | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const bump = () => {
      setTick((t) => t + 1);
    };
    const resolve = async (): Promise<(() => void) | undefined> => {
      let unsubscribe: (() => void) | undefined;
      try {
        const sync = await loadActiveSyncModule();
        if (sync !== undefined && !cancelled) {
          syncRef.current = sync;
          bump();
          unsubscribe = sync.subscribeStore(() => {
            if (!cancelled) {
              bump();
            }
          });
        }
      } catch {
        // frappe not available
      }
      return unsubscribe;
    };

    const cleanupPromise = resolve();
    // Retry a few times since SyncModule is created lazily
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (syncRef.current !== null || cancelled || attempts >= 10) {
        clearInterval(interval);
        return;
      }
      void resolve();
    }, 2000);

    const dispose = async () => {
      const unsubscribe = await cleanupPromise;
      unsubscribe?.();
    };
    return () => {
      cancelled = true;
      clearInterval(interval);
      void dispose();
    };
  }, []);

  // `tick` is bumped by the SyncModule subscription; it is the re-run trigger, not a value read here.
  useEffect(() => {
    if (syncRef.current === null) {
      return;
    }
    const emit = getChannelEmit();
    if (emit === null) {
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
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- tick only re-runs the snapshot
  }, [tick]);

  return null;
};

const COLOR_STEP_COUNT = 12;

/**
 * Publishes the resolved `<prefix>1..12` tokens of the surrounding Theme on `event`.
 * With `requireValue`, nothing is emitted until at least one step resolves.
 */
const ColorChannelEmitter = ({
  event,
  prefix = 'color',
  requireValue = true,
}: {
  event: string;
  prefix?: 'color' | 'accent';
  requireValue?: boolean;
}) => {
  const tamaguiTheme = useTamaguiTheme();
  const prevRef = useRef<string>('');

  useEffect(() => {
    const colors = Array.from(
      { length: COLOR_STEP_COUNT },
      (_, index) => readTokenValue(tamaguiTheme, `${prefix}${index + 1}`) ?? '',
    );
    if (requireValue && colors.every((color) => color === '')) {
      return;
    }
    const key = colors.join('|');
    if (key === prevRef.current) {
      return;
    }
    prevRef.current = key;

    getChannelEmit()?.(event, colors);
  }, [tamaguiTheme, event, prefix, requireValue]);

  return null;
};

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

const suppressTamaguiDomWarnings = () => {
  if (typeof window === 'undefined') {
    return;
  }
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- console args are untyped external input
    const msg = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
    if (msg.includes('React does not recognize the') && tamaguiPropLeakPatterns.some((p) => msg.includes(p))) {
      return;
    }
    origError(...args);
  };
};
suppressTamaguiDomWarnings();

// ---------------------------------------------------------------------------
// Framework decorator
// ---------------------------------------------------------------------------

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const hasMatchMedia = () => typeof window !== 'undefined' && window.matchMedia !== undefined;

const subscribeSystemScheme = (onChange: () => void): (() => void) => {
  if (!hasMatchMedia()) {
    return () => {
      // Nothing was subscribed.
    };
  }
  const mq = window.matchMedia(DARK_SCHEME_QUERY);
  mq.addEventListener('change', onChange);
  return () => {
    mq.removeEventListener('change', onChange);
  };
};

const getSystemScheme = (): 'light' | 'dark' =>
  hasMatchMedia() && window.matchMedia(DARK_SCHEME_QUERY).matches ? 'dark' : 'light';

const getServerSystemScheme = (): 'light' | 'dark' => 'light';

/**
 * Resolves the effective color scheme from the toolbar global.
 * "system" defers to the browser's prefers-color-scheme and reacts to
 * OS changes in real-time. "light"/"dark" are used as-is.
 * URL globals (?globals=scheme:dark;…) are handled natively by SB 10.
 */
const useResolvedScheme = (schemeGlobal: string): 'light' | 'dark' => {
  const systemScheme = useSyncExternalStore(subscribeSystemScheme, getSystemScheme, getServerSystemScheme);
  return schemeGlobal === 'light' || schemeGlobal === 'dark' ? schemeGlobal : systemScheme;
};

const transitionDuration = (animation: string): string => {
  switch (animation) {
    case 'none': {
      return '0ms';
    }
    case 'quick': {
      return '100ms';
    }
    case 'medium': {
      return '200ms';
    }
    case 'slow':
    case 'lazy': {
      return '350ms';
    }
    case 'bouncy': {
      return '300ms';
    }
    default: {
      return '200ms';
    }
  }
};

/** Where a knob's value comes from, highest priority first. */
interface KnobSources {
  storyThemeParams: Partial<Knobs> | undefined;
  globals: Globals;
  activePreset: ReturnType<typeof getPreset>;
}

/**
 * Resolves every knob: per-story `parameters.theme`, then the toolbar global,
 * then the active preset, then the defaults. Interaction-state overrides come
 * from `hover.fillStyle`-style globals.
 */
const resolveKnobUpdate = (knobs: Knobs, { storyThemeParams, globals, activePreset }: KnobSources): Partial<Knobs> => {
  const result: Partial<Knobs> = {};
  // SAFETY: Object.keys of a Knobs object yields Knobs keys.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys is typed string[]
  const knobKeys = Object.keys(knobs) as (keyof Knobs)[];
  for (const key of knobKeys) {
    if (interactionStateNames.some((state) => state === key)) {
      continue;
    }
    const globalValue: unknown = globals[key];
    if (storyThemeParams !== undefined && key in storyThemeParams) {
      Object.assign(result, { [key]: storyThemeParams[key] });
    } else if (key in globals && globalValue !== undefined && globalValue !== '') {
      Object.assign(result, { [key]: parseValue(globalValue) });
    } else if (activePreset !== undefined && key in activePreset.knobs) {
      Object.assign(result, { [key]: activePreset.knobs[key] });
    } else {
      Object.assign(result, { [key]: defaultKnobs[key] });
    }
  }
  for (const state of interactionStateNames) {
    const stateObj: Record<string, string> = {};
    let hasValues = false;
    for (const field of stateKnobFields) {
      const val = readGlobal(globals, `${state}.${field}`);
      if (val !== undefined && val !== '') {
        stateObj[field] = val;
        hasValues = true;
      }
    }
    if (hasValues) {
      Object.assign(result, { [state]: stateObj });
    }
  }
  return result;
};

const activeThemeConfigNames = new WeakMap<Record<string, ThemeConfig>, string>();

// Switching runs in a layout effect, not during render: dropping Tamagui's
// theme-name cache re-renders every mounted theme consumer. The keyed
// AppProvider then remounts the story under the new config before paint.
const useActiveThemeConfigName = (themeConfigsByName: Record<string, ThemeConfig>, requested: string): string => {
  const [active, setActive] = useState(() => activeThemeConfigNames.get(themeConfigsByName) ?? defaultThemeConfigName);
  // oxlint-disable-next-line react-doctor/no-derived-state-effect -- `active` must lag `requested` by one commit so the keyed AppProvider remounts after the switch
  useLayoutEffect(() => {
    if (requested !== (activeThemeConfigNames.get(themeConfigsByName) ?? defaultThemeConfigName)) {
      activateThemeConfig(themeConfigsByName[requested]);
      activeThemeConfigNames.set(themeConfigsByName, requested);
    }
    // oxlint-disable-next-line react/set-state-in-effect -- `active` must lag `requested` by one commit so the keyed AppProvider remounts after the switch
    setActive(requested);
  }, [themeConfigsByName, requested]);
  return active;
};

interface DecoratorContext {
  globals: Globals;
  parameters?: { theme?: Partial<Knobs> };
}

interface FrameworkDecoratorConfig {
  AppProvider: CreatePreviewOptions['AppProvider'];
  i18n: CreatePreviewI18n;
  setUserScheme: CreatePreviewOptions['setUserScheme'];
  themeConfigNames: string[];
  themeConfigsByName: Record<string, ThemeConfig>;
}

// useTheme() calls useCookies() internally, which requires <CookiesProvider>
// to be a parent in the React tree. Since the decorator *renders* the provider,
// we split into an outer shell (provides CookiesProvider) and an inner component
// (calls useTheme safely inside that provider).
const FrameworkDecoratorInner = ({
  Story,
  context,
  frameworkConfig,
}: {
  Story: ComponentType<DecoratorContext>;
  context: DecoratorContext;
  frameworkConfig: FrameworkDecoratorConfig;
}) => {
  const { AppProvider, i18n, setUserScheme, themeConfigNames, themeConfigsByName } = frameworkConfig;
  const [knobs, setKnobs] = useTheme();

  const schemeGlobal = readGlobal(context.globals, 'scheme');
  const effectiveSchemeGlobal = schemeGlobal === undefined || schemeGlobal === '' ? 'system' : schemeGlobal;
  const resolvedScheme = useResolvedScheme(effectiveSchemeGlobal);
  useLayoutEffect(() => {
    setUserScheme?.(
      effectiveSchemeGlobal === 'light' || effectiveSchemeGlobal === 'dark' ? effectiveSchemeGlobal : 'system',
    );
  }, [effectiveSchemeGlobal, setUserScheme]);

  // Resolve the active Tamagui color theme (e.g. "purple", "blue") from
  // the toolbar global. This wraps the story in <Theme name={color}> so
  // all Tamagui components pick it up implicitly through context.
  const colorGlobal = readGlobal(context.globals, 'color') ?? '';

  const requestedThemeConfig = readGlobal(context.globals, 'tamaguiConfig');
  const themeConfigName = useActiveThemeConfigName(
    themeConfigsByName,
    requestedThemeConfig !== undefined && themeConfigNames.includes(requestedThemeConfig)
      ? requestedThemeConfig
      : defaultThemeConfigName,
  );

  // Per-story theme overrides via `parameters.theme` (AC-5.4).
  // Stories can specify e.g. `parameters: { theme: { padding: "large" } }`
  // to pin a specific knob configuration for that story.
  const storyThemeParams = context.parameters?.theme;

  // Resolve the active preset (if any) from the `preset` global.
  const activePresetName = readGlobal(context.globals, 'preset');
  const activePreset =
    activePresetName !== undefined && activePresetName !== '' ? getPreset(activePresetName) : undefined;

  const knobUpdate = useMemo(
    () => resolveKnobUpdate(knobs, { storyThemeParams, globals: context.globals, activePreset }),
    [knobs, context.globals, storyThemeParams, activePreset],
  );

  useEffect(() => {
    setKnobs(knobUpdate);
  }, [knobUpdate, setKnobs]);

  const locale = readGlobal(context.globals, 'locale');
  useEffect(() => {
    if (locale !== undefined) {
      void i18n.instance.changeLanguage(locale);
    }
  }, [i18n, locale]);

  // Build a PresetContext value from the resolved knobs so that
  // useResolvedKnobs() inside story components picks up the live values.
  // Include the active color theme so components can read preset.theme.
  const presetCtxValue = useMemo(
    () => ({
      preset: {
        ...defaultPreset,
        theme: colorGlobal === '' ? defaultPreset.theme : colorGlobal,
        knobs: { ...defaultKnobs, ...knobUpdate },
      },
    }),
    [knobUpdate, colorGlobal],
  );

  const animationValue = presetCtxValue.preset.knobs.animation;
  useEffect(() => {
    document.documentElement.style.setProperty('--mp-transition', transitionDuration(animationValue));
  }, [animationValue]);

  const storyContent = (
    <CanvasBackground>
      <Story {...context} />
    </CanvasBackground>
  );

  // SAFETY: 'light' and 'dark' are always registered Tamagui scheme themes.
  const oppositeSchemeTheme = (resolvedScheme === 'dark' ? 'light' : 'dark') as ThemeName;

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
        <ColorChannelEmitter
          event={baseThemeColorsChannelEvent}
          requireValue={false}
        />
        {/* Always wrap in Theme so the host node exists on the default
              color cell too. An empty color global keeps the scheme
              theme; a named color is the Tamagui subtheme. */}
        <Theme name={colorGlobal === '' ? resolvedScheme : colorGlobal}>
          <ColorChannelEmitter
            event={themeColorsChannelEvent}
            requireValue={false}
          />
          <ColorChannelEmitter
            event={accentColorsChannelEvent}
            prefix="accent"
          />
          {storyContent}
        </Theme>
        {/* Opposite scheme emitters */}
        <Theme name={oppositeSchemeTheme}>
          <ColorChannelEmitter
            event={themeColorsOppositeChannelEvent}
            requireValue={false}
          />
          {colorGlobal === '' ? (
            <>
              <ColorChannelEmitter event={baseOppositeChannelEvent} />
              <ColorChannelEmitter
                event={accentOppositeChannelEvent}
                prefix="accent"
              />
            </>
          ) : (
            <Theme name={colorGlobal}>
              <ColorChannelEmitter event={baseOppositeChannelEvent} />
              <ColorChannelEmitter
                event={accentOppositeChannelEvent}
                prefix="accent"
              />
            </Theme>
          )}
        </Theme>
      </AppProvider>
    </PresetContext.Provider>
  );
};

export const createPreview = (options: CreatePreviewOptions): Preview => {
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

  const themeConfigsByName = {
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

  // -- globalTypes -----------------------------------------------------------

  const generatedGlobalTypes = createGeneratedGlobalTypes();
  // Color theme control — use the pre-computed themeColors list from the
  // ThemeConfig (extracted from the raw themes object at config creation
  // time, with semantic/state sub-themes already filtered out).
  const themeColorNames = ['', ...themeConfig.themeColors];

  // Extract a representative midpoint color (color7) from each theme so the
  // manager-side toolbar can show colored swatches without iframe access.
  const themeSwatches = buildThemeSwatches(themeConfig);

  generatedGlobalTypes.color = {
    name: 'Theme',
    description: 'Theme color palette',
    options: themeColorNames,
    control: {
      type: 'select',
      labels: Object.fromEntries(themeColorNames.map((v) => [v, v === '' ? '(none)' : v])),
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
  // recognizes them when the ThemePanel calls updateGlobals(). The decorator
  // falls through to preset → knob defaults when a value is undefined.
  const initialGlobals: Globals = {
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
  for (const key of knobOptionKeys) {
    if (!(key in initialGlobals)) {
      initialGlobals[key] = '';
    }
  }
  for (const { key } of stateOverrides) {
    initialGlobals[key] = '';
  }

  // Publish the machine-readable globals axes for automated sweeps
  // (verify:theme-matrix, lost-pixel matrix page generation). Probes read
  // this one well-known global from the preview iframe instead of
  // spelunking Storybook internals; every value is URL-addressable via
  // `iframe.html?globals=scheme:dark;color:blue;preset:bold`. The empty
  // string is the real default cell on both axes (no color override /
  // the implicit default preset), so it is part of the axis, not padding.
  Object.defineProperty(globalThis, '__MPO_THEME_AXES__', {
    value: {
      schemes: ['light', 'dark'],
      themeColors: themeColorNames,
      presets: ['', ...getPresetNames()],
    },
    writable: true,
    configurable: true,
    enumerable: true,
  });

  // -- parameters ------------------------------------------------------------

  const defaultParameters = {
    // No `actions.argTypesRegex`: implicit on* actions throw in Storybook 10
    // when a component fires one during render (Image onLoad, Wheel onChange)
    // and skip safeAction's sanitizing. Stories pass `action()` explicitly.
    layout: 'padded',
    viewMode: 'story',
    controls: {
      expanded: true,
      hideNoControlsWarning: true,
      matchers: {
        color: /(?:background|color)$/iu,
        date: /Date$/u,
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

  const frameworkConfig: FrameworkDecoratorConfig = {
    AppProvider,
    i18n,
    setUserScheme,
    themeConfigNames,
    themeConfigsByName,
  };

  const frameworkDecorator = (Story: ComponentType<DecoratorContext>, context: DecoratorContext) => (
    <CookiesProvider>
      <FrameworkDecoratorInner
        Story={Story}
        context={context}
        frameworkConfig={frameworkConfig}
      />
    </CookiesProvider>
  );

  // -- assemble --------------------------------------------------------------

  return {
    globalTypes,
    initialGlobals,
    parameters: { ...defaultParameters, ...extraParameters },
    decorators: [frameworkDecorator, ...extraDecorators],
  };
};
