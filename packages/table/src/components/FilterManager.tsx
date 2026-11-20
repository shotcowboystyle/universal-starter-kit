import { FloppyDiskIcon, XIcon } from '@phosphor-icons/react';
import { Button, Checkbox, Input } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import type React from 'react';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { t } from '../shared/t';

import {
  KnobDialog,
  KnobDialogContent,
  KnobDialogTrigger,
  KnobDialogTitle,
  KnobDialogDescription,
  KnobDialogClose,
} from './KnobDialog';

export interface FilterManagerProps {
  currentFilters: [string, string, unknown][];
  onSaveFilter: (filterName: string, isGlobal: boolean) => Promise<void> | void;
  disabled?: boolean;
  /**
   * DG-ST-03 — explains a caller-driven `disabled` (renders as visible
   * adjacent text + aria-describedby via the Button contract). The built-in
   * "no filters applied" disable carries its own reason.
   */
  disabledReason?: string;
  /**
   * Reason placement forwarded to the trigger Button — `"inline"` keeps the
   * reason on the control line in toolbar rows (the stacked default breaks
   * the row's shared control height). See the Button contract.
   */
  disabledReasonPlacement?: 'below' | 'inline';
  canCreateGlobal?: boolean;
  trigger?: React.ReactNode;
}

const dialogMinWidthFor = (sizeToken: string): number => {
  if (sizeToken === '$3') {
    return 320;
  }
  if (sizeToken === '$5') {
    return 480;
  }
  return 400;
};

export const FilterManager = ({
  currentFilters,
  onSaveFilter,
  disabled = false,
  disabledReason,
  disabledReasonPlacement,
  canCreateGlobal = false,
  trigger,
}: FilterManagerProps) => {
  const { knobProps } = useResolvedKnobs();
  const sz = knobProps.sizeToken;
  const dialogMinWidth = dialogMinWidthFor(sz);
  const [open, setOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [isGlobal, setIsGlobal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFilters = currentFilters.length > 0;
  const saveFilterLabel = t('Save Filter');
  let triggerDisabledReason: string | undefined;
  if (disabled) {
    triggerDisabledReason = disabledReason;
  } else if (!hasFilters) {
    triggerDisabledReason = t('Apply filters to save them');
  }

  const handleSave = async () => {
    if (!filterName.trim()) {
      setError(t('Filter name is required'));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSaveFilter(filterName.trim(), isGlobal);
      setFilterName('');
      setIsGlobal(false);
      setOpen(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t('Failed to save filter'));
    }
    setIsSaving(false);
  };

  return (
    <KnobDialog
      open={open}
      onOpenChange={setOpen}>
      <KnobDialogTrigger asChild>
        {trigger ?? (
          <Button
            size={knobProps.sizeToken}
            icon={FloppyDiskIcon}
            disabled={disabled || !hasFilters}
            // DG-ST-03 explain: an unfiltered table is the common RESTING
            // state, so a bare `disabled` here fired the `[theme]
            // bare-disabled` guardrail on every list at load. The reason
            // renders adjacent + aria-describedby (Button contract).
            disabledReason={triggerDisabledReason}
            disabledReasonPlacement={disabledReasonPlacement}
            aria-label={t('Save filter')}>
            {saveFilterLabel}
          </Button>
        )}
      </KnobDialogTrigger>

      <KnobDialogContent minWidth={dialogMinWidth}>
        <KnobDialogTitle>{saveFilterLabel}</KnobDialogTitle>
        <KnobDialogDescription>
          {t('Save the current filter configuration for quick access later.')}
        </KnobDialogDescription>

        <YStack gap="$3">
          <Input
            label={t('Filter Name')}
            value={filterName}
            onChangeText={setFilterName}
            placeholder={t('e.g., Big Pokemon')}
            disabled={isSaving}
          />

          {canCreateGlobal && (
            <Checkbox
              label={t('Make this filter global (visible to all users)')}
              checked={isGlobal}
              onChange={(checked) => {
                setIsGlobal(checked === true);
              }}
              disabled={isSaving}
            />
          )}

          {error !== null && error !== '' && (
            <Text
              color="$red11"
              fontSize="$2">
              {error}
            </Text>
          )}

          <Text
            color="$color10"
            fontSize="$2">
            {t('Current filters: {{count}} active', { count: currentFilters.length })}
          </Text>
        </YStack>

        <XStack
          gap="$3"
          justifyContent="flex-end">
          <KnobDialogClose asChild>
            {/* DG-ACT-05: the cancel action never renders disabled. */}
            <Button size={knobProps.sizeToken}>{t('Cancel')}</Button>
          </KnobDialogClose>
          {/* Stays pressable on an empty name — handleSave surfaces the
              inline "Filter name is required" instead of a bare-disabled
              dangle (DG-ST-03); busy is derived state via `loading`.
              `accent` = the dialog's one primary (LC-05), not theme="active". */}
          <Button
            size={knobProps.sizeToken}
            accent
            icon={FloppyDiskIcon}
            onPress={() => {
              void handleSave();
            }}
            loading={isSaving}>
            {saveFilterLabel}
          </Button>
        </XStack>

        <KnobDialogClose asChild>
          <Button
            position="absolute"
            top="$3"
            right="$3"
            size="$2"
            circular
            icon={XIcon}
            aria-label={t('Close dialog')}
          />
        </KnobDialogClose>
      </KnobDialogContent>
    </KnobDialog>
  );
};
