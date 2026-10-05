import { PaletteIcon } from '@phosphor-icons/react';
import { ThemeDevtoolsPanel } from '@repo/theme';
import { Suspense, lazy, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { SizableText, Text, YStack } from 'tamagui';

import { Button } from '../Button';
import { SheetModal } from '../SheetModal';
import { Tooltip } from '../Tooltip';

export interface ThemePlaygroundProps {
  testID?: string;
}

/**
 * The panel reads the reader's color scheme through `@vxrn/color-scheme`,
 * an optional peer: without it the panel still opens, minus the scheme row.
 */
const ScopedPanel = lazy(async (): Promise<{ default: ComponentType<object> }> => {
  const scheme = await import('@vxrn/color-scheme').catch(() => undefined);
  const useUserScheme = scheme?.useUserScheme;
  if (!useUserScheme) {
    return { default: () => <ThemeDevtoolsPanel /> };
  }
  const Panel = () => <ThemeDevtoolsPanel useUserScheme={useUserScheme} devtoolsTheme={useUserScheme().value} />;
  return { default: Panel };
});

/**
 * A palette toggle opening the house ThemeDevtoolsPanel in a sheet: scheme,
 * preset and style knobs, restyling the page live. The panel stays mounted after the first open so closing the
 * sheet does not blank it mid-slide.
 */
export function ThemePlayground({ testID }: ThemePlaygroundProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const change = (next: boolean) => {
    setOpen(next);
    if (next) {
      setOpened(true);
    }
  };
  return (
    <>
      <Tooltip content={t('Restyle the page live: scheme, preset and style knobs')}>
        <Button
          variant={open ? undefined : 'outlined'}
          theme={open ? 'accent' : undefined}
          minHeight={44}
          minWidth={44}
          onPress={() => {
            change(true);
          }}
          icon=<PaletteIcon size={16} />
          aria-label={t('Theme')}
          aria-expanded={open}
          testID={testID}
        />
      </Tooltip>
      <SheetModal
        open={open}
        onOpenChange={change}
        snapPoint={85}
        scrollable
        header={
          <YStack>
            <SizableText size="$6" fontWeight="700">
              {t('Theme playground')}
            </SizableText>
            <Text fontSize="$2" color="$color10">
              {t('Changes restyle the page live')}
            </Text>
          </YStack>
        }>
        {opened ? (
          <Suspense fallback={null}>
            <ScopedPanel />
          </Suspense>
        ) : null}
      </SheetModal>
    </>
  );
}
