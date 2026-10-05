import { useEffect, useState } from 'react';
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

function Probe() {
  const [themeClass, setThemeClass] = useState('pending');
  const [fontStyles, setFontStyles] = useState('pending');
  useEffect(() => {
    const html = document.documentElement;
    setThemeClass(
      html.classList.contains('t_dark') ? 't_dark' : html.classList.contains('t_light') ? 't_light' : 'none',
    );
    setFontStyles(document.getElementById('mp-font-knob-styles') ? 'present' : 'missing');
  }, []);
  return (
    <YStack
      testID="theme-provider-probe"
      gap="$2"
      padding="$4"
      {...({
        'data-theme-class': themeClass,
        'data-font-styles': fontStyles,
      } as Record<string, unknown>)}>
      <SizableText>html class: {themeClass}</SizableText>
      <SizableText>FontKnobStyles: {fontStyles}</SizableText>
    </YStack>
  );
}

export const main = {
  name: 'Main',
  render: () => <Probe />,
};
