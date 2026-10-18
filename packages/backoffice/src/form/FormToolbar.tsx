/**
 * Desk-capability form toolbar: breadcrumbs → title + status indicator pill +
 * header cluster slot (MOD-07 — assignees/like/follow readout) → primary
 * actions (Save / Submit / Cancel / Amend per the docstatus lifecycle),
 * standalone Refresh, and the ⋯ menu. Presentational — every action is a
 * callback from DocFormScreen (which owns confirms, dialogs, and RPCs).
 *
 * Emphasis budget (LC-05): the current lifecycle primary (Save or Submit)
 * is THE single accent-solid action; everything else stays neutral, and
 * Cancel carries the error intent outlined (destructive, not primary).
 *
 * Indicator parity follows desk's `frappe.get_indicator` order:
 * unsaved → meta.states row (by status value) → docstatus defaults →
 * status-field value with a guessed color → Draft (submittable) → no pill.
 *
 * Compact viewports (< 640, `useLayoutSizeClass`) collapse secondary
 * lifecycle actions and the standalone Refresh into the ⋯ menu; one primary
 * button stays visible.
 */

import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CopyIcon,
  DotsThreeIcon,
  EnvelopeIcon,
  FloppyDiskIcon,
  LinkIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  PrinterIcon,
  ProhibitIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useLayoutSizeClass, useResolvedKnobs } from '@repo/theme';
import { Breadcrumbs, Chip, DropdownMenu, H1, XStack, YStack } from '@repo/ui';
import type { BreadcrumbItem, ChipColor, DropdownMenuEntry } from '@repo/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

export type DocIndicator =
  | 'notSaved'
  | 'draft'
  | 'submitted'
  | 'cancelled'
  | 'new'
  /** Clean, saved, non-submittable, no status → desk shows no pill. */
  | 'saved';

/** A resolved data-driven indicator (status value + chip color). */
export interface DocStatusIndicator {
  label: string;
  color: ChipColor;
}

export type DocIndicatorSpec = DocIndicator | DocStatusIndicator;

/** Desk indicator colors mapped to theme chip colors (no hex literals). */
const INDICATOR_COLORS: Record<Exclude<DocIndicator, 'saved'>, ChipColor> = {
  notSaved: 'orange',
  draft: 'red',
  submitted: 'blue',
  cancelled: 'red',
  new: 'orange',
};

/** Map a frappe indicator color name (DocType States rows) → ChipColor. */
export const frappeColorToChipColor = (color?: string): ChipColor => {
  switch (
    (color ?? '')
      .trim()
      .toLowerCase()
      .replaceAll(/[\s_-]+/gu, '')
  ) {
    case 'red': {
      return 'red';
    }
    case 'green': {
      return 'green';
    }
    case 'blue':
    case 'lightblue':
    case 'cyan': {
      return 'blue';
    }
    case 'orange': {
      return 'orange';
    }
    case 'yellow': {
      return 'yellow';
    }
    case 'purple':
    case 'pink': {
      return 'purple';
    }
    default: {
      return 'gray';
    }
  }
};

/**
 * Heuristic status → color mapping mirroring desk's `guess_colour` for
 * status values with no `meta.states` row (e.g. "Open" on the to-do doctype).
 */
const guessStatusColor = (status: string): ChipColor => {
  const value = status.toLowerCase();
  const has = (...words: string[]) => words.some((word) => value.includes(word));
  if (has('cancel', 'inactive', 'archiv', 'low')) {
    return 'gray';
  }
  if (
    has(
      'success',
      'complet',
      'closed',
      'approv',
      'confirm',
      'paid',
      'receiv',
      'active',
      'enabled',
      'done',
      'finish',
      'resolv',
    )
  ) {
    return 'green';
  }
  if (has('error', 'fail', 'reject', 'lost', 'overdue', 'urgent', 'high', 'disabled', 'expire')) {
    return 'red';
  }
  if (has('open', 'pending', 'progress', 'working', 'review', 'draft', 'unpaid', 'medium', 'wait', 'queue', 'hold')) {
    return 'orange';
  }
  return 'gray';
};

export const resolveIndicator = (args: {
  isCreate: boolean;
  isDirty: boolean;
  docstatus: number;
  isSubmittable: boolean;
  /** Doc's status-field (or workflow state field) value, when present. */
  statusValue?: string;
  /** `meta.states` rows — data-driven color mapping that wins over guesses. */
  states?: { title?: string; color?: string }[];
}): DocIndicatorSpec => {
  if (args.isCreate) {
    return 'new';
  }
  if (args.isDirty) {
    return 'notSaved';
  }
  const status = args.statusValue ?? '';
  if (status !== '') {
    const state = args.states?.find((row) => row.title === status);
    if (state) {
      return { label: status, color: frappeColorToChipColor(state.color) };
    }
  }
  if (args.docstatus === 1) {
    return 'submitted';
  }
  if (args.docstatus === 2) {
    return 'cancelled';
  }
  if (status !== '') {
    return { label: status, color: guessStatusColor(status) };
  }
  return args.isSubmittable ? 'draft' : 'saved';
};

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export type FormToolbarMenuIcon =
  | 'reload'
  | 'duplicate'
  | 'rename'
  | 'delete'
  | 'print'
  | 'email'
  | 'links'
  | 'new'
  | 'list'
  | 'desk'
  | 'jump';

export interface FormToolbarMenuItem {
  key: string;
  label: string;
  icon?: FormToolbarMenuIcon;
  destructive?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void;
}

export interface FormToolbarProps {
  breadcrumbs: BreadcrumbItem[];
  onNavigate: (href: string) => void;
  title: string;
  indicator: DocIndicatorSpec;
  /** Hide the status chip entirely (e.g. meta still loading). */
  showIndicator?: boolean;
  isSaving: boolean;
  /**
   * MOD-07 header cluster (assignee avatars / like / follow) rendered right
   * after the status chip. The toolbar stays presentational — the cluster
   * owns its own data + mutations.
   */
  cluster?: ReactNode;
  /** Primary action visibilities per permissions + lifecycle. */
  canSave: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  canAmend: boolean;
  onSave: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  onAmend: () => void;
  menuItems: FormToolbarMenuItem[];
  /**
   * Standalone Refresh button (desk parity). Falls back to the `reload`
   * menu item's action so existing consumers get the button for free.
   */
  onReload?: () => void;
  /**
   * "Open in Desk" hop — the document's native desk counterpart. Renders a
   * standalone icon button on wide viewports (narrow keeps the ⋯ menu's
   * `desk` entry as the only affordance, like Refresh).
   */
  onOpenDesk?: () => void;
  /**
   * Prev/next document pager (desk ‹ › parity) — pages through the list
   * order the user came from. The pair renders only when the composing
   * screen resolved a list context (no dead arrows on deep links); a
   * boundary endpoint renders disabled instead of hiding (LC-40 honest
   * disabled chrome keeps the pair spatially stable).
   */
  onPrevDoc?: () => void;
  onNextDoc?: () => void;
  prevDocDisabled?: boolean;
  nextDocDisabled?: boolean;
}

const MENU_ICONS = {
  reload: ArrowCounterClockwiseIcon,
  duplicate: CopyIcon,
  rename: PencilSimpleIcon,
  delete: TrashIcon,
  print: PrinterIcon,
  email: EnvelopeIcon,
  links: LinkIcon,
  new: PlusIcon,
  list: ListBulletsIcon,
  desk: ArrowSquareOutIcon,
  jump: MagnifyingGlassIcon,
} as const;

type LifecycleAction = 'save' | 'submit' | 'cancel' | 'amend';

/** The pill for an indicator: presets map to their label and color; 'saved' shows none. */
const resolveIndicatorChip = (
  indicator: DocIndicatorSpec,
  labels: Record<Exclude<DocIndicator, 'saved'>, string>,
): DocStatusIndicator | undefined => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates the DocIndicatorSpec union (preset name or status spec), not wire data
  if (typeof indicator !== 'string') {
    return indicator;
  }
  return indicator === 'saved' ? undefined : { label: labels[indicator], color: INDICATOR_COLORS[indicator] };
};

const ACTION_ENTRY_ICONS: Record<LifecycleAction, typeof CheckCircleIcon> = {
  save: FloppyDiskIcon,
  submit: CheckCircleIcon,
  cancel: ProhibitIcon,
  amend: CopyIcon,
};

// oxlint-disable-next-line eslint/complexity -- prop-driven toolbar layout; each branch is one optional control
export const FormToolbar = ({
  breadcrumbs,
  onNavigate,
  title,
  indicator,
  showIndicator = true,
  isSaving,
  cluster,
  canSave,
  canSubmit,
  canCancel,
  canAmend,
  onSave,
  onSubmit,
  onCancel,
  onAmend,
  menuItems,
  onReload,
  onOpenDesk,
  onPrevDoc,
  onNextDoc,
  prevDocDisabled,
  nextDocDisabled,
}: FormToolbarProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const iconSize = knobProps.controlIcon?.width ?? 16;
  const isNarrow = useLayoutSizeClass() === 'compact';

  const indicatorLabels: Record<Exclude<DocIndicator, 'saved'>, string> = {
    notSaved: t('notSaved', 'Not Saved'),
    draft: t('draft', 'Draft'),
    submitted: t('submitted', 'Submitted'),
    cancelled: t('cancelled', 'Cancelled'),
    new: t('notSaved', 'Not Saved'),
  };

  const chip = resolveIndicatorChip(indicator, indicatorLabels);

  // Desk primary-action lifecycle: dirty/new → Save; saved submittable
  // draft → Submit; docstatus 1 → Cancel; docstatus 2 → Amend.
  const isDirtyish = indicator === 'notSaved' || indicator === 'new';
  const actionLabels: Record<LifecycleAction, string> = {
    save: isSaving ? t('saving', 'Saving…') : t('save', 'Save'),
    submit: t('submit', 'Submit'),
    cancel: t('cancelAction', 'Cancel'),
    amend: t('amend', 'Amend'),
  };
  const actionHandlers: Record<LifecycleAction, () => void> = {
    save: onSave,
    submit: onSubmit,
    cancel: onCancel,
    amend: onAmend,
  };
  // Ordered by primacy: the first visible action is THE primary on narrow.
  const visibleActions: LifecycleAction[] = [
    ...(canSave && (isDirtyish || !canSubmit) ? (['save'] as const) : []),
    ...(canSubmit && !isDirtyish ? (['submit'] as const) : []),
    ...(canCancel ? (['cancel'] as const) : []),
    ...(canAmend ? (['amend'] as const) : []),
  ];
  const buttonActions = isNarrow ? visibleActions.slice(0, 1) : visibleActions;
  const collapsedActions = isNarrow ? visibleActions.slice(1) : [];

  const reload = onReload ?? menuItems.find((item) => item.key === 'reload')?.onSelect;

  const entries: DropdownMenuEntry[] = [
    // Narrow viewports: secondary lifecycle actions fold into the menu.
    ...collapsedActions.map((action) => {
      const Icon = ACTION_ENTRY_ICONS[action];
      return {
        key: `__action-${action}`,
        label: actionLabels[action],
        icon: <Icon size={iconSize} />,
        destructive: action === 'cancel',
        disabled: isSaving,
        disabledReason: isSaving ? t('saving', 'Saving…') : undefined,
        onSelect: actionHandlers[action],
      };
    }),
    ...(collapsedActions.length > 0 && menuItems.length > 0 ? [{ separator: true as const }] : []),
    ...menuItems.map((item) => ({
      key: item.key,
      label: item.label,
      icon: item.icon
        ? (() => {
            const Icon = MENU_ICONS[item.icon];
            return <Icon size={iconSize} />;
          })()
        : undefined,
      destructive: item.destructive,
      disabled: item.disabled,
      disabledReason: item.disabledReason,
      onSelect: item.onSelect,
    })),
  ];

  return (
    <YStack
      {...knobProps.gap}
      {...knobProps.panelPadding}
      paddingBottom={0}
      testID="form-toolbar">
      <Breadcrumbs
        items={breadcrumbs}
        onNavigate={onNavigate}
      />
      <XStack
        alignItems="center"
        flexWrap="wrap"
        {...knobProps.gap}>
        <XStack
          alignItems="center"
          gap="$3"
          flex={1}
          minWidth={0}>
          <H1
            {...knobProps.pageTitle}
            {...knobProps.heading}
            color="$color12"
            numberOfLines={1}
            flexShrink={1}
            margin={0}>
            {title}
          </H1>
          {showIndicator && chip && (
            <Chip
              size="$2"
              variant="subtle"
              color={chip.color}>
              {chip.label}
            </Chip>
          )}
          {cluster}
        </XStack>

        <XStack
          alignItems="center"
          gap="$2"
          flexShrink={0}>
          {(onPrevDoc || onNextDoc) && !isNarrow && (
            <XStack
              overflow="hidden"
              {...knobProps.borderRadius}
              borderWidth={1}
              borderColor="$borderColor">
              <Button
                size={knobProps.sizeToken}
                outlined
                borderWidth={0}
                borderRadius={0}
                icon={<CaretLeftIcon size={iconSize} />}
                aria-label={t('prevDoc', 'Previous document')}
                disabled={prevDocDisabled}
                onPress={onPrevDoc}
                testID="form-toolbar-prev"
              />
              <Button
                size={knobProps.sizeToken}
                outlined
                borderWidth={0}
                borderRadius={0}
                icon={<CaretRightIcon size={iconSize} />}
                aria-label={t('nextDoc', 'Next document')}
                disabled={nextDocDisabled}
                onPress={onNextDoc}
                testID="form-toolbar-next"
              />
            </XStack>
          )}
          {onOpenDesk && !isNarrow && (
            <Button
              size={knobProps.sizeToken}
              outlined
              icon={<ArrowSquareOutIcon size={iconSize} />}
              aria-label={t('openInDesk', 'Open in Desk')}
              onPress={onOpenDesk}
              testID="form-toolbar-desk"
            />
          )}
          {reload && !isNarrow && (
            <Button
              size={knobProps.sizeToken}
              outlined
              icon={<ArrowCounterClockwiseIcon size={iconSize} />}
              aria-label={t('reloadDoc', 'Reload')}
              onPress={reload}
              testID="form-toolbar-reload"
            />
          )}
          {entries.length > 0 && (
            <DropdownMenu
              items={entries}
              placement="bottom-end">
              <Button
                size={knobProps.sizeToken}
                outlined
                icon={
                  <DotsThreeIcon
                    size={iconSize}
                    weight="bold"
                  />
                }
                aria-label={t('menu', 'Menu')}
                testID="form-toolbar-menu"
              />
            </DropdownMenu>
          )}
          {buttonActions.includes('cancel') && (
            <Button
              size={knobProps.sizeToken}
              error
              outlined
              actionRole="secondary"
              icon={<ProhibitIcon size={iconSize} />}
              loading={isSaving}
              onPress={onCancel}
              testID="form-toolbar-cancel">
              {actionLabels.cancel}
            </Button>
          )}
          {buttonActions.includes('amend') && (
            <Button
              size={knobProps.sizeToken}
              outlined
              icon={<CopyIcon size={iconSize} />}
              loading={isSaving}
              onPress={onAmend}
              testID="form-toolbar-amend">
              {actionLabels.amend}
            </Button>
          )}
          {/* LC-05 / R-3: the lifecycle primary (Submit or Save — mutually
              exclusive per the visibleActions gate) is the single
              accent-solid action on the screen. */}
          {buttonActions.includes('submit') && (
            <Button
              size={knobProps.sizeToken}
              accent
              icon={<CheckCircleIcon size={iconSize} />}
              loading={isSaving}
              onPress={onSubmit}
              testID="form-toolbar-submit">
              {actionLabels.submit}
            </Button>
          )}
          {buttonActions.includes('save') && (
            <Button
              size={knobProps.sizeToken}
              accent
              icon={<FloppyDiskIcon size={iconSize} />}
              loading={isSaving}
              onPress={onSave}
              testID="form-toolbar-save">
              {actionLabels.save}
            </Button>
          )}
        </XStack>
      </XStack>
    </YStack>
  );
};
