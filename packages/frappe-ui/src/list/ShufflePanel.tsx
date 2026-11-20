import { ArrowCounterClockwiseIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { useResolvedKnobs } from '@repo/theme';
import { Button, Wheel, XStack, YStack } from '@repo/ui';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface ShufflePanelProps<TDoc extends { name?: string }> {
  /** DOM id the toggle names in aria-controls. */
  id?: string;
  label: string;
  /** Records to pick from, in wheel order. */
  rows: readonly TDoc[];
  /** A record's wheel label. */
  itemLabel: (doc: TDoc) => string;
  /** Draws the current pick beside the wheel. */
  renderPick: (doc: TDoc) => React.ReactNode;
  onGo: (doc: TDoc) => void;
  testID?: string;
}

const pickWidth = '$12';

const randomOtherIndex = (current: number, length: number): number => {
  if (length < 2) {
    return Math.max(0, current);
  }
  // oxlint-disable-next-line sonarjs/pseudo-random -- a UI shuffle over list records; nothing security-sensitive depends on it
  const offset = 1 + Math.floor(Math.random() * (length - 1));
  return (Math.max(0, current) + offset) % length;
};

/**
 * Pick a random record: a wheel of record labels beside the current pick.
 * Drag or flick the wheel, or Spin for a random jump, then Go opens it.
 */
export const ShufflePanel = <TDoc extends { name?: string }>({
  id,
  label,
  rows,
  itemLabel,
  renderPick,
  onGo,
  testID,
}: ShufflePanelProps<TDoc>) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const named = useMemo(
    () => rows.filter((row): row is TDoc & { name: string } => row.name !== undefined && row.name !== ''),
    [rows],
  );
  const items = useMemo(() => named.map((row) => ({ value: row.name, label: itemLabel(row) })), [named, itemLabel]);
  const [selected, setSelected] = useState<string>(() => named[randomOtherIndex(0, named.length)]?.name ?? '');
  // The rows can change while the panel is open; a pick that dropped out
  // falls back to the first row.
  const pick = named.find((row) => row.name === selected) ?? named.at(0);
  if (pick === undefined) {
    return null;
  }

  const spin = () => {
    const current = named.findIndex((row) => row.name === pick.name);
    setSelected(named[randomOtherIndex(current, named.length)]?.name ?? '');
  };

  return (
    <XStack
      id={id}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- cross-platform Tamagui stack (no <section> on native); the labeled role gives the landmark on web
      role="region"
      aria-label={label}
      {...knobProps.surface}
      {...knobProps.borderRadius}
      {...knobProps.panelPadding}
      {...knobProps.gap}
      alignItems="center"
      flexWrap="wrap"
      testID={testID}>
      <Wheel
        items={items}
        value={pick.name}
        onChange={(next) => {
          setSelected(next);
        }}
        visibleItems={3}
        loop
        aria-label={label}
      />
      <YStack
        width={pickWidth}
        flexShrink={0}>
        {renderPick(pick)}
      </YStack>
      <XStack
        {...knobProps.gap}
        alignItems="center"
        flexShrink={0}>
        <Button
          outlined
          onPress={spin}
          icon={<ArrowCounterClockwiseIcon size={16} />}
          testID={testID !== undefined && testID !== '' ? `${testID}-spin` : undefined}>
          {t('Spin')}
        </Button>
        <Button
          theme="accent"
          onPress={() => {
            onGo(pick);
          }}
          iconAfter={<ArrowRightIcon size={16} />}
          testID={testID !== undefined && testID !== '' ? `${testID}-go` : undefined}>
          {t('Go')}
        </Button>
      </XStack>
    </XStack>
  );
};
