import { useSyncExternalStore } from 'react';
import { SizableText, YStack } from 'tamagui';

export default {
  title: 'Theme/ThemeProvider',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'ThemeProvider is the Storybook preview wrapper (TamaguiProvider + KnobBridge). This story measures that live provider: the html theme class and the FontKnobStyles stylesheet KnobBridge mounts. Remounting ThemeProvider inside the preview would nest TamaguiProvider, so the probe reads the one already on the page.',
      },
    },
  },
};

// The probe reads the page once the provider has mounted; nothing it reads changes afterward.
const subscribeNever = () => () => {
  // Nothing to unsubscribe from: the snapshots below are static after mount.
};

const readThemeClass = (): string => {
  const { classList } = document.documentElement;
  if (classList.contains('t_dark')) {
    return 't_dark';
  }
  return classList.contains('t_light') ? 't_light' : 'none';
};

const readFontStyles = (): string => (document.querySelector('#mp-font-knob-styles') === null ? 'missing' : 'present');

const readPending = (): string => 'pending';

const Probe = () => {
  const themeClass = useSyncExternalStore(subscribeNever, readThemeClass, readPending);
  const fontStyles = useSyncExternalStore(subscribeNever, readFontStyles, readPending);
  return (
    <YStack
      testID="theme-provider-probe"
      gap="$2"
      padding="$4"
      data-theme-class={themeClass}
      data-font-styles={fontStyles}>
      <SizableText>html class: {themeClass}</SizableText>
      <SizableText>FontKnobStyles: {fontStyles}</SizableText>
    </YStack>
  );
};

export const main = {
  name: 'Main',
  render: () => <Probe />,
};
