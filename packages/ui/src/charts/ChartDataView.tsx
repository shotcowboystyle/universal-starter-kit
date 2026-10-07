import { Button } from '@repo/forms';
import { isWeb } from '@repo/platform';
import { useResolvedKnobs } from '@repo/theme';
import { createContext, useContext, useId, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Dialog, Paragraph, XStack, YStack } from 'tamagui';

import { sectionHeading } from '../component-colors';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';
import { DialogContent, DialogOverlay } from '../surfaces';

import { describeDatum } from './accessibility';
import { formatChartValue, normalizeChartData, uniqueKeys } from './math';
import { chartWebProps } from './svg';
import type { ChartAttrs } from './svg';
import type { ChartDatum } from './types';

const ChartDataContext = createContext<{ id: string; triggerId: string } | null>(null);

export interface ChartDataViewProps {
  data: (number | ChartDatum)[];
  title?: string;
  valueFormatter?: (value: number) => string;
  /** Place the action in the chart's existing header, outside its drawing. */
  children: (view: { action: ReactNode; data: ChartDatum[]; valueFormatter: (value: number) => string }) => ReactNode;
}

/** One complete, reachable data view. The ordinary chart keeps its short name. */
export const ChartDataView = ({ data, title, valueFormatter, children }: ChartDataViewProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const { knobProps: datumKnobs } = useResolvedKnobs({ compact: true });
  const [open, setOpen] = useState(false);
  const id = `mpo-chart-data-${useId().replaceAll(/[^a-zA-Z0-9_-]/gu, '_')}`;
  const triggerId = `${id}-trigger`;
  const normalized = normalizeChartData(data);
  const format = valueFormatter ?? formatChartValue;
  const rowKeys = uniqueKeys(normalized.map((datum) => datum.label));
  const contextValue = useMemo(() => ({ id, triggerId }), [id, triggerId]);
  const hasTitle = title !== undefined && title !== '';
  const actionLabel = hasTitle ? `${t('View data for')} ${title}` : t('View chart data');
  const action = (
    <Dialog.Trigger asChild>
      <Button
        compact
        id={triggerId}
        {...(isWeb ? { 'aria-label': actionLabel } : { accessibilityLabel: actionLabel })}
        {...chartWebProps({ 'data-mpo-chart-data-trigger': id })}>
        {t('View data')}
      </Button>
    </Dialog.Trigger>
  );
  return (
    <ChartDataContext.Provider value={contextValue}>
      <Dialog
        modal
        open={open}
        onOpenChange={setOpen}>
        {children({ action, data: normalized, valueFormatter: format })}
        <Dialog.Portal>
          <DialogOverlay key="overlay" />
          <DialogContent
            key="content"
            width="90%"
            maxWidth={480}
            maxHeight="80%"
            {...chartWebProps({ 'data-mpo-chart-data-panel': id })}>
            <Dialog.Title
              {...knobProps.heading}
              {...sectionHeading}>
              {hasTitle ? `${title}: ${t('data')}` : t('Chart data')}
            </Dialog.Title>
            <Dialog.Description {...knobProps.body}>{`${normalized.length} ${t('data points')}`}</Dialog.Description>
            <ScrollView
              flexShrink={1}
              minHeight={0}>
              <YStack {...knobProps.gap}>
                {normalized.map((datum, index) => (
                  <XStack
                    key={rowKeys[index]}
                    alignItems="flex-start"
                    flexWrap="wrap"
                    {...datumKnobs.gap}
                    {...chartWebProps({ 'data-mpo-chart-data-row': String(index) })}
                    {...(isWeb
                      ? {}
                      : {
                          accessible: true,
                          accessibilityLabel: describeDatum({ datum, formatValue: format }),
                        })}>
                    <Paragraph
                      flexBasis="50%"
                      flexGrow={1}
                      flexShrink={1}
                      minWidth={0}
                      {...knobProps.body}
                      {...chartWebProps({ 'data-mpo-chart-data-label': 'true' })}>
                      {datum.label}
                    </Paragraph>
                    <Paragraph
                      flexShrink={1}
                      maxWidth="100%"
                      {...knobProps.body}
                      {...chartWebProps({ 'data-mpo-chart-data-value': 'true' })}>
                      {format(datum.value)}
                    </Paragraph>
                  </XStack>
                ))}
              </YStack>
            </ScrollView>
            <XStack justifyContent="flex-end">
              <Dialog.Close
                asChild
                aria-label={t('Close')}>
                <Button
                  aria-label={t('Close')}
                  {...(isWeb ? {} : { accessibilityLabel: t('Close') })}
                  {...chartWebProps({ 'data-mpo-chart-data-close': id })}>
                  {t('Close')}
                </Button>
              </Dialog.Close>
            </XStack>
          </DialogContent>
        </Dialog.Portal>
      </Dialog>
    </ChartDataContext.Provider>
  );
};

/** Shared chart implementations join a composed header instead of adding a second action. */
export const ChartDataFrame = ({
  data,
  title,
  valueFormatter,
  width,
  children,
}: Omit<ChartDataViewProps, 'children'> & { children: ReactElement; width?: number }) => {
  const inherited = useContext(ChartDataContext);
  const { knobProps } = useResolvedKnobs();
  if (inherited) {
    return children;
  }
  return (
    <ChartDataView
      data={data}
      title={title}
      valueFormatter={valueFormatter}>
      {({ action }): ReactElement => (
        <YStack
          minWidth={0}
          width={width ?? '100%'}
          maxWidth="100%"
          {...knobProps.gap}>
          {children}
          <XStack justifyContent="flex-end">{action}</XStack>
        </YStack>
      )}
    </ChartDataView>
  );
};

export const useChartDataViewProps = (): ChartAttrs => {
  const context = useContext(ChartDataContext);
  if (!context) {
    return {};
  }
  return chartWebProps({
    'data-mpo-chart-data-view': context.id,
    'aria-describedby': context.triggerId,
  });
};
