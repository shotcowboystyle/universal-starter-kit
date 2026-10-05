import { ToastProvider } from '@tamagui/toast';
import { useContext, useEffect, useInsertionEffect, useMemo, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import { useCookies } from 'react-cookie';
import { type CreateTamaguiProps, TamaguiProvider, type TamaguiProviderProps, useDidFinishSSR } from 'tamagui';

import { animationDurations } from './animations/css';
import { getCookieWatchList, readOverridesCookie, readPresetCookie } from './cookies';
import { CornerSmoothingStyles } from './cornerSmoothing';
import { FontKnobStyles } from './FontKnobStyles';
import { PresetContext, type PresetContextValue } from './PresetContext';
import { defaultPreset } from './presets';
import { getPreset } from './shared';

/**
 * Animate a DOM mutation (typically a theme/scheme switch) using the View
 * Transitions API where available, falling back to a temporary class-gated
 * CSS transition on `<html>`.
 *
 * Both paths derive their duration from the `--mp-transition` CSS variable,
 * which KnobBridge keeps in sync with the animation knob.
 */
export function startThemeTransition(apply: () => void): void {
  if (typeof document === 'undefined') {
    apply();
    return;
  }

  if (document.startViewTransition) {
    document.startViewTransition(apply);
    return;
  }

  const root = document.documentElement;
  root.classList.add('mp-transitioning');
  apply();

  const transitionMs = Number.parseInt(getComputedStyle(root).getPropertyValue('--mp-transition'), 10) || 200;
  setTimeout(() => {
    root.classList.remove('mp-transitioning');
  }, transitionMs + 50);
}

// ---------------------------------------------------------------------------
// ThemeProviderProps (simplified — knob-based theming)
// ---------------------------------------------------------------------------

export interface ThemeProviderProps<T extends CreateTamaguiProps = CreateTamaguiProps> extends PropsWithChildren<
  Omit<TamaguiProviderProps, 'config' | 'defaultTheme'>
> {
  config?: {
    tamagui: ReturnType<typeof import('tamagui').createTamagui<T>>;
  };
  systemTheme?: 'light' | 'dark';
}

// ---------------------------------------------------------------------------
// ThemeProvider (simplified — TamaguiProvider + scheme + ToastProvider)
// ---------------------------------------------------------------------------

export function ThemeProvider<T extends CreateTamaguiProps>({
  children,
  config,
  systemTheme = 'light',
  ...tamaguiProps
}: ThemeProviderProps<T>) {
  // The caller is responsible for resolving the active scheme:
  //   - App: useUserScheme() from @vxrn/color-scheme (reacts to OS changes)
  //   - Storybook: decorator resolves "system"/"light"/"dark" with OS listener
  // ThemeProvider simply applies whatever the caller provides.
  const activeTheme = systemTheme;
  // A hydrating root renders a light placeholder to match SSR; the
  // blocking scheme script owns <html> until hydration finishes.
  const hydrated = useDidFinishSSR();

  const prevThemeRef = useRef<string | undefined>(undefined);

  // Set the initial theme class synchronously to avoid FOUC.
  useInsertionEffect(() => {
    if (typeof document === 'undefined' || !hydrated) {
      return;
    }
    const classList = document.documentElement.classList;
    const toAdd = `t_${activeTheme}`;
    if (!classList.contains(toAdd)) {
      classList.remove(activeTheme === 'dark' ? 't_light' : 't_dark');
      classList.add(toAdd);
    }
    document.documentElement.style.colorScheme = activeTheme;
  }, [activeTheme, hydrated]);

  // Animate subsequent scheme changes via View Transitions / class-gated fallback.
  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const previous = prevThemeRef.current;
    prevThemeRef.current = activeTheme;
    if (previous === undefined || previous === activeTheme) {
      return;
    }

    startThemeTransition(() => {
      const classList = document.documentElement.classList;
      classList.remove(activeTheme === 'dark' ? 't_light' : 't_dark');
      classList.add(`t_${activeTheme}`);
      document.documentElement.style.colorScheme = activeTheme;
    });
  }, [activeTheme]);

  // Inject class-gated CSS fallback (dormant until .mp-transitioning is added)
  // plus View Transition duration tied to the animation knob.
  useInsertionEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const id = '__mp-theme-transitions';
    if (document.getElementById(id)) {
      return;
    }
    const style = document.createElement('style');
    style.id = id;
    style.textContent = [
      ':root { --mp-transition: 200ms; }',
      // Reserve space for scrollbar to prevent gap when modal Sheet hides it
      'html { scrollbar-gutter: stable; }',
      // Disable browser-native focus ring on form controls;
      // components provide their own focus-visible affordance.
      'input:focus, input:focus-visible,',
      'textarea:focus, textarea:focus-visible,',
      'select:focus, select:focus-visible,',
      'button:focus, button:focus-visible {',
      '  outline: none;',
      '  box-shadow: none;',
      '}',
      '.mp-transitioning *, .mp-transitioning *::before, .mp-transitioning *::after {',
      '  transition: background-color var(--mp-transition) ease,',
      '    color var(--mp-transition) ease,',
      '    border-color var(--mp-transition) ease,',
      '    box-shadow var(--mp-transition) ease,',
      '    outline-color var(--mp-transition) ease;',
      '}',
      '::view-transition-old(root), ::view-transition-new(root) {',
      '  animation-duration: calc(var(--mp-transition) * 1);',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }, []);

  return (
    <TamaguiProvider {...tamaguiProps} config={config?.tamagui} defaultTheme={activeTheme} disableInjectCSS={false}>
      <ToastProvider>
        <KnobBridge>{children}</KnobBridge>
      </ToastProvider>
    </TamaguiProvider>
  );
}

/**
 * Internal bridge that reads the preset name + knob overrides from cookies
 * (reactive via CookiesProvider) and provides a PresetContext so that
 * useResolvedKnobs() picks up the live values.
 *
 * Resolution order (same on SSR and client):
 *   1. Read `mp.preset` cookie → look up the preset from the registry
 *   2. Read `mp.ov.*` cookies → partial knob overrides
 *   3. Merge: preset base knobs + overrides → final knobs
 *   4. Provide the full preset (knobs, tints, intents) via PresetContext
 *
 * If an ancestor PresetContext already exists (e.g. from a Storybook decorator),
 * the bridge is a pass-through to avoid overriding it.
 *
 * FontKnobStyles and CornerSmoothingStyles mount here (not only in
 * Storybook CreatePreview) so heading/body fonts and the corner-shape
 * stylesheet restyle every shipped app that uses ThemeProvider. Hairline
 * still self-mounts on module load.
 */
function KnobBridge({ children }: PropsWithChildren) {
  const existingCtx = useContext(PresetContext);

  const isCookieDisabled = typeof process !== 'undefined' && process.env?.COOKIE_POLICY?.toLowerCase() === 'disabled';
  const watchList = isCookieDisabled ? [] : getCookieWatchList();
  const [cookie] = useCookies<string, Record<string, string>>(watchList);

  const presetName = readPresetCookie(cookie as Record<string, string | undefined>);
  const overrides = readOverridesCookie(cookie as Record<string, string | undefined>);

  const presetCtxValue = useMemo<PresetContextValue>(() => {
    const base = (presetName ? getPreset(presetName) : undefined) ?? defaultPreset;
    return {
      preset: { ...base, knobs: { ...base.knobs, ...overrides } },
      overrides,
    };
  }, [presetName, overrides]);

  const animationValue = presetCtxValue.preset.knobs.animation;
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const durationMs = animationValue === 'none' ? 0 : (animationDurations[animationValue] ?? 200);
    document.documentElement.style.setProperty('--mp-transition', `${durationMs}ms`);
  }, [animationValue]);

  // Inside the provider (or the Storybook ancestor context) so the
  // heading/body CSS vars follow the same cookie path as useResolvedKnobs.
  const tree = (
    <>
      <FontKnobStyles />
      <CornerSmoothingStyles />
      {children}
    </>
  );

  if (existingCtx) {
    return tree;
  }

  return <PresetContext.Provider value={presetCtxValue}>{tree}</PresetContext.Provider>;
}
