// Grouping-axis helpers + picker control for the kanban view: which Select
// fields a doctype can be boarded by, which one wins by default ("status"
// first — desk convention), and a DropdownMenu control (ViewHeader switcher
// pattern) to change the axis at runtime.

import { CaretDownIcon } from '@phosphor-icons/react';
import { useResolvedKnobs } from '@repo/theme';
import { Button, DropdownMenu, Text, XStack } from '@repo/ui';
import type { DropdownMenuEntry } from '@repo/ui';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { DocFieldMeta, DoctypeMeta } from '../shared/use-doctype-meta';

import { isHiddenField } from './view-meta';

/**
 * Every visible Select field with options — the fields a kanban board can
 * group by. Order follows the doctype's field order, so the first candidate
 * is the desk-style fallback axis.
 */
export const kanbanFieldCandidates = (meta: DoctypeMeta): DocFieldMeta[] =>
  meta.fields.filter(
    (field) => field.fieldtype === 'Select' && !isHiddenField(field) && (field.options ?? '').trim().length > 0,
  );

/**
 * Default grouping axis when no Kanban Board doc governs: a Select field
 * literally named "status" wins (desk convention), else the first Select
 * field with options.
 */
export const preferredKanbanField = (candidates: readonly DocFieldMeta[]): DocFieldMeta | undefined =>
  candidates.find((field) => field.fieldname === 'status') ?? candidates[0];

/** One switchable grouping axis (a Select fieldname + its display label). */
export interface KanbanFieldOption {
  fieldname: string;
  label: string;
}

export interface KanbanFieldPickerProps {
  /** Axes on offer (board field first, then Select candidates), deduped. */
  options: readonly KanbanFieldOption[];
  /** Fieldname of the currently active grouping axis. */
  active: string;
  onSelect: (fieldname: string) => void;
}

/**
 * Compact "Board field" switcher: a labeled DropdownMenu button listing the
 * available grouping axes, with the active one disabled (same pattern as the
 * ViewHeader view switcher). Menu-based on purpose — works with the same
 * press/keyboard affordances on web, native, and GTK.
 */
export const KanbanFieldPicker = ({ options, active, onSelect }: KanbanFieldPickerProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const items: DropdownMenuEntry[] = options.map((option) => ({
    key: option.fieldname,
    label: option.label,
    disabled: option.fieldname === active,
    disabledReason: option.fieldname === active ? t('views.kanbanBoardFieldCurrent', 'Current board field') : undefined,
    onSelect: () => {
      onSelect(option.fieldname);
    },
  }));
  const activeLabel = options.find((option) => option.fieldname === active)?.label ?? active;

  return (
    <XStack
      {...knobProps.gap}
      alignItems="center">
      <Text
        color="$color10"
        fontSize="$2">
        {t('views.kanbanBoardField', 'Board field')}
      </Text>
      <DropdownMenu
        items={items}
        placement="bottom-start">
        <Button
          size="$3"
          iconAfter={CaretDownIcon}
          aria-label={t('views.kanbanBoardFieldSwitch', 'Switch board field')}>
          {activeLabel}
        </Button>
      </DropdownMenu>
    </XStack>
  );
};
