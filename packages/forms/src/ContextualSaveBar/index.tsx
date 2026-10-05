import { useResolvedKnobs, warnCancelDisabled, type KnobProps } from '@repo/theme';
import { Store, useStore } from '@tanstack/react-store';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, Text, XStack, isWeb } from 'tamagui';

import { Button } from '../Button';
import { collectFormFieldErrors } from '../ErrorSummary';
import { useFormContext } from '../Form';
import { getFormSubmission } from '../Form/submissionController';
import { formCommonColors } from '../shared/colorRamps';
import { t } from '../shared/t';
import { getElevationWrapperProps } from '../shared/utils';
import { zIndex } from '../shared/zIndex';
import { Spinner } from '../Spinner';

import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { useUnsavedChangesGuard, type NavigationBlocker, type UseNavigationBlocker } from './useUnsavedChangesGuard';

export { clientKnownIdentity } from './clientKnownIdentity';
export { commitImmediateField } from './commitImmediateField';
export type { NavigationBlocker, UseNavigationBlocker } from './useUnsavedChangesGuard';

export interface ContextualSaveBarProps {
  /**
   * Render the bar even when the form is clean — test / specimen only.
   * Production presence is `form.state.isDirty`.
   */
  forceVisible?: boolean;
  /**
   * IGNORED. Discard never renders disabled.
   */
  discardDisabled?: boolean;
  /** Host `useBlocker` (TanStack / one). Seam hosts may pass a no-op. */
  useBlocker?: UseNavigationBlocker;
  onSaved?: (values: Record<string, unknown>) => void;
  /**
   * Fired after a Switch auto-commit in declarative mode.
   * Form reads this; the bar itself does not.
   */
  onAutoCommit?: (name: string, value: unknown) => void;
  /** Override normal dirty-state copy; saving and failures retain their status. */
  message?: string;
}

type FieldMetaMap = Record<string, { isDirty?: boolean; errors?: unknown[] } | undefined>;

function dirtyCount(fieldMeta: FieldMetaMap): number {
  return Object.values(fieldMeta).filter((meta) => meta?.isDirty).length;
}

function fieldErrorCount(fieldMeta: FieldMetaMap): number {
  return collectFormFieldErrors(fieldMeta).length;
}

interface SaveBarStoreState {
  isDirty?: boolean;
  isSubmitting?: boolean;
  fieldMeta?: FieldMetaMap;
  submissionAttempts?: number;
  values?: Record<string, unknown>;
}

function useSaveBarSnapshot() {
  const form = useFormContext();
  return useStore(form.store as unknown as Store<SaveBarStoreState>, (state: SaveBarStoreState) => ({
    isDirty: Boolean(state.isDirty),
    isSubmitting: Boolean(state.isSubmitting),
    fieldMeta: state.fieldMeta ?? {},
    submissionAttempts: state.submissionAttempts ?? 0,
    values: state.values ?? {},
  }));
}

function statusCopy(args: {
  isSubmitting: boolean;
  saveError: string | null;
  errorCount: number;
  submissionAttempts: number;
  dirty: number;
  override?: string;
}): { text: string; failed: boolean; qualifier?: string } {
  if (args.isSubmitting) {
    return { text: t('Saving…'), failed: false };
  }
  if (args.saveError) {
    return {
      text: t("Couldn't save — {{error}} Edits are kept on this page.", {
        error: /[.!?。！？]$/u.test(args.saveError.trimEnd())
          ? args.saveError.trimEnd()
          : `${args.saveError.trimEnd()}.`,
      }),
      failed: true,
    };
  }
  if (args.submissionAttempts >= 1 && args.errorCount > 0) {
    return {
      text: t("Can't save yet · {{count}} fields need attention", {
        count: args.errorCount,
      }),
      failed: true,
    };
  }
  if (args.override) {
    return { text: args.override, failed: false };
  }
  const qualifier =
    args.dirty > 0 ? (args.dirty === 1 ? t('· 1 field') : t('· {{count}} fields', { count: args.dirty })) : undefined;
  return { text: t('Unsaved changes'), failed: false, qualifier };
}

function barRadius(knobProps: KnobProps) {
  const top = knobProps.containerRadius.borderRadius;
  return {
    borderTopLeftRadius: top,
    borderTopRightRadius: top,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  };
}

function containerRadiusRest(knobProps: KnobProps) {
  const fragment = knobProps.containerRadius as KnobProps['containerRadius'] & {
    className?: string;
  };
  const { className, borderRadius: _topPair, ...rest } = fragment;
  return { className, rest };
}

export function ContextualSaveBar({
  forceVisible = false,
  discardDisabled = false,
  useBlocker,
  onSaved,
  message,
}: ContextualSaveBarProps) {
  const form = useFormContext();
  const { knobProps, elevation } = useResolvedKnobs();
  const snap = useSaveBarSnapshot();
  const submission = getFormSubmission(form);
  const { error: saveError } = useSyncExternalStore(
    submission.subscribe,
    submission.getSnapshot,
    submission.getSnapshot,
  );
  const [discardOpen, setDiscardOpen] = useState(false);

  const stagedDirty = dirtyCount(snap.fieldMeta);
  const visible = forceVisible || snap.isDirty || snap.isSubmitting || Boolean(saveError);
  const blocker = useUnsavedChangesGuard(snap.isDirty, useBlocker);
  const guardOpen = discardOpen || blocker.state === 'blocked';

  useEffect(() => {
    warnCancelDisabled({ disabled: discardDisabled, component: 'ContextualSaveBar' });
  }, [discardDisabled]);

  const restoreFocusToForm = useCallback(() => {
    if (!isWeb || typeof document === 'undefined') {
      return;
    }
    const bar = document.querySelector('[data-mp-contextual-savebar]');
    const active = document.activeElement;
    if (!bar || !active || !bar.contains(active)) {
      return;
    }
    const formEl = document.querySelector<HTMLElement>('[data-mpo-form-layout]');
    formEl?.focus?.();
  }, []);

  const handleSave = useCallback(async () => {
    if (snap.isSubmitting) {
      return;
    }
    try {
      if ((await submission.submit()) !== 'success') {
        return;
      }
      const errors = fieldErrorCount((form.store.state.fieldMeta ?? {}) as FieldMetaMap);
      if (errors > 0) {
        return;
      }
      const values = form.store.state.values as Record<string, unknown>;
      const update = (form as { update?: (opts: { defaultValues: Record<string, unknown> }) => void }).update;
      if (typeof update === 'function') {
        update({ defaultValues: values });
      }
      form.reset(values);
      onSaved?.(values);
      restoreFocusToForm();
    } catch (error) {
      submission.reportError(error);
    }
  }, [form, onSaved, restoreFocusToForm, snap.isSubmitting, submission]);

  const handleDiscardCommit = useCallback(() => {
    submission.clearError();
    form.reset();
    setDiscardOpen(false);
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
    restoreFocusToForm();
  }, [blocker, form, restoreFocusToForm, submission]);

  const handleKeepEditing = useCallback(() => {
    setDiscardOpen(false);
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  }, [blocker]);

  useEffect(() => {
    if (!visible || typeof document === 'undefined') {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [handleSave, visible]);

  const copy = statusCopy({
    isSubmitting: snap.isSubmitting,
    saveError,
    errorCount: fieldErrorCount(snap.fieldMeta),
    submissionAttempts: snap.submissionAttempts,
    dirty: stagedDirty,
    override: message,
  });

  const padX = knobProps.panelPadding.padding;
  const borderWidth = knobProps.borderRadius.borderWidth;
  const elevationProps = getElevationWrapperProps(knobProps, elevation);
  const { className: smoothClass, rest: smoothRest } = containerRadiusRest(knobProps);
  const topRadius = knobProps.containerRadius.borderRadius;
  const transition = knobProps.transition;

  return (
    <>
      <AnimatePresence>
        {visible ? (
          <XStack
            key="contextual-savebar"
            data-mp-contextual-savebar=""
            data-mp-savebar-dock="bottom"
            data-mp-savebar-radius-class="CONTAINER-CAP"
            data-mp-savebar-top-radius={String(topRadius)}
            data-mp-savebar-bottom-radius="0"
            role="region"
            aria-label={t('Unsaved changes')}
            // Tamagui maps sticky to absolute on native; keep the dock in flow there.
            position={isWeb ? 'sticky' : 'relative'}
            bottom={isWeb ? 0 : undefined}
            width="100%"
            zIndex={zIndex.sheet}
            flexDirection={copy.failed ? 'column' : 'row'}
            alignItems={copy.failed ? 'stretch' : 'center'}
            paddingTop="$2.5"
            paddingHorizontal={padX as never}
            paddingBottom="$2.5"
            backgroundColor="$color1"
            borderStyle="solid"
            borderTopWidth={borderWidth}
            borderTopColor="$borderColor"
            borderLeftWidth={0}
            borderRightWidth={0}
            borderBottomWidth={0}
            {...smoothRest}
            className={smoothClass}
            {...knobProps.gap}
            transition={transition}
            enterStyle={transition ? { y: 12, opacity: 0 } : undefined}
            exitStyle={transition ? { y: 12, opacity: 0 } : undefined}
            {...elevationProps}
            {...barRadius(knobProps)}
            style={{
              ...(isWeb ? { paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' } : undefined),
              ...(elevationProps.style as object | undefined),
            }}>
            <XStack flex={copy.failed ? undefined : 1} minWidth={0} alignItems="baseline" gap="$2">
              <Text
                role="status"
                {...knobProps.body}
                fontSize="$4"
                lineHeight="$4"
                color={copy.failed ? formCommonColors.error : '$color'}
                flexShrink={1}
                numberOfLines={copy.failed ? undefined : 1}
                ellipsizeMode={copy.failed ? undefined : 'tail'}
                {...(isWeb && copy.failed ? { style: { overflowWrap: 'anywhere' } } : {})}>
                {copy.text}
              </Text>
              {copy.qualifier ? (
                <Text
                  {...knobProps.body}
                  fontSize="$4"
                  lineHeight="$4"
                  color={knobProps.textAccentColor}
                  flexShrink={0}>
                  {copy.qualifier}
                </Text>
              ) : null}
            </XStack>
            <XStack
              data-mp-savebar-actions=""
              alignItems="center"
              {...knobProps.gap}
              alignSelf={copy.failed ? 'flex-end' : undefined}
              flexShrink={0}>
              <Button
                outlined
                size="$4"
                data-mp-savebar-discard=""
                data-mp-cancel-disabled-ignored={discardDisabled ? 'true' : undefined}
                onPress={() => {
                  setDiscardOpen(true);
                }}>
                {t('Discard')}
              </Button>
              <Button
                theme="active"
                outlined={knobProps.outlined}
                actionRole="primary"
                size="$4"
                icon={snap.isSubmitting ? <Spinner size="small" /> : undefined}
                disabled={snap.isSubmitting || undefined}
                disabledReason={snap.isSubmitting ? t('Saving') : undefined}
                data-mp-savebar-save=""
                onPress={() => {
                  void handleSave();
                }}>
                {t('Save')}
              </Button>
            </XStack>
          </XStack>
        ) : null}
      </AnimatePresence>
      <UnsavedChangesDialog
        open={guardOpen}
        fieldCount={Math.max(stagedDirty, 1)}
        onKeepEditing={handleKeepEditing}
        onDiscard={handleDiscardCommit}
      />
    </>
  );
}
