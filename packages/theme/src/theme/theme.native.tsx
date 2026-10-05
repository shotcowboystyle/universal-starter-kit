import { ToastProvider } from '@tamagui/toast';
import { useContext, useMemo } from 'react';
import type { PropsWithChildren } from 'react';
import { type CreateTamaguiProps, TamaguiProvider, type TamaguiProviderProps } from 'tamagui';

import { CornerSmoothingStyles } from './cornerSmoothing';
import { FontKnobStyles } from './FontKnobStyles';
import { PresetContext, type PresetContextValue } from './PresetContext';
import { defaultPreset } from './presets';
import { useTheme } from './useTheme';

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
  const activeTheme = systemTheme;

  return (
    <TamaguiProvider {...tamaguiProps} config={config?.tamagui} defaultTheme={activeTheme} disableInjectCSS={false}>
      <ToastProvider>
        <KnobBridge>{children}</KnobBridge>
      </ToastProvider>
    </TamaguiProvider>
  );
}

function KnobBridge({ children }: PropsWithChildren) {
  const existingCtx = useContext(PresetContext);
  const [knobs] = useTheme();

  const presetCtxValue = useMemo<PresetContextValue>(
    () => ({
      preset: { ...defaultPreset, knobs },
      overrides: undefined,
    }),
    [knobs],
  );

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
