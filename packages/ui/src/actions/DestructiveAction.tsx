/**
 * Destructive actions pick confirm friction by severity.
 *
 * Medium/high default to `<ConfirmDialog>` (destructive confirm; high may require
 * typed `expectedText`). Pass `confirm` to eject to a custom gate.
 */

import { Button, formatActionLabel, type ButtonProps } from '@repo/forms';
import { useCallback, useState, type ReactNode } from 'react';
import { Input, Paragraph, YStack } from 'tamagui';

import { ConfirmDialog } from '../feedback/ConfirmDialog';
import { useTranslation } from '../shared/i18n';
import { withInterp } from '../shared/t';

import {
  resolveDestructiveSeverity,
  severityRequiresConfirm,
  severityUsesDangerTone,
  type DestructiveSeverity,
  type DestructiveSeverityHints,
} from './severity';

export interface DestructiveConfirmContext {
  verb: string;
  noun?: string;
  /** Verb-only label for the confirm button (never "OK"). */
  confirmLabel: string;
  /** Trigger label (verb + noun). */
  actionLabel: string;
  severity: DestructiveSeverity;
  consequence?: string;
  /** High tier: string the user must type (defaults to noun || verb). */
  expectedText?: string;
  confirmationText?: string;
}

export type DestructiveActionProps = Omit<
  ButtonProps,
  'onPress' | 'error' | 'accent' | 'warning' | 'success' | 'children' | 'action' | 'verb' | 'noun'
> &
  DestructiveSeverityHints & {
    verb: string;
    noun?: string;
    /** Override the computed label. */
    children?: ReactNode;
    consequence?: string;
    /**
     * High-tier typed-confirm expected value. Defaults to `noun ?? verb`.
     * Used by the default ConfirmDialog gate (and passed through to `confirm`).
     */
    confirmationText?: string;
    /**
     * Confirm gate eject hatch. When provided, wins over the default ConfirmDialog.
     * Return `true` to run `onAction`.
     */
    confirm?: (ctx: DestructiveConfirmContext) => boolean | Promise<boolean>;
    /** Runs after a successful confirm (or immediately for `severity="low"`). */
    onAction: () => void | Promise<void>;
    /**
     * When set, control stays focusable (`aria-disabled`) and
     * exposes the reason instead of a bare `disabled`.
     */
    disabledReason?: string;
  };

function buildConfirmContext(props: {
  verb: string;
  noun?: string;
  severity: DestructiveSeverity;
  consequence?: string;
  confirmationText?: string;
}): DestructiveConfirmContext {
  const actionLabel = formatActionLabel({ verb: props.verb, noun: props.noun });
  const confirmLabel = formatActionLabel({ verb: props.verb });
  const expectedText =
    props.severity === 'high' ? (props.confirmationText ?? props.noun ?? props.verb).trim() : undefined;
  return {
    verb: props.verb,
    noun: props.noun,
    confirmLabel,
    actionLabel,
    severity: props.severity,
    consequence: props.consequence,
    expectedText,
    confirmationText: props.confirmationText,
  };
}

export function DestructiveAction({
  verb,
  noun,
  severity: severityProp,
  bulk,
  irreversible,
  cascades,
  consequence,
  confirmationText,
  confirm,
  onAction,
  children,
  disabled,
  disabledReason,
  loading,
  ...buttonProps
}: DestructiveActionProps) {
  const { t } = useTranslation();
  const severity = resolveDestructiveSeverity({
    severity: severityProp,
    bulk,
    irreversible,
    cascades,
  });
  const needsConfirm = severityRequiresConfirm(severity);
  const useDanger = severityUsesDangerTone(severity);
  const label = children ?? formatActionLabel({ verb, noun });
  const [pending, setPending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [typedText, setTypedText] = useState('');

  const dialogCtx = buildConfirmContext({
    verb,
    noun,
    severity,
    consequence,
    confirmationText,
  });
  const useCustomConfirm = Boolean(confirm);
  const typedMatch = !dialogCtx.expectedText || typedText.trim() === dialogCtx.expectedText;

  const runAction = useCallback(async () => {
    setPending(true);
    try {
      await onAction();
    } finally {
      setPending(false);
    }
  }, [onAction]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setTypedText('');
  }, []);

  const handlePress = useCallback(async () => {
    if (disabled || disabledReason || pending) {
      return;
    }
    const ctx = buildConfirmContext({
      verb,
      noun,
      severity,
      consequence,
      confirmationText,
    });
    if (needsConfirm) {
      if (confirm) {
        setPending(true);
        try {
          const ok = await confirm(ctx);
          if (!ok) {
            return;
          }
          await onAction();
        } finally {
          setPending(false);
        }
        return;
      }
      setTypedText('');
      setDialogOpen(true);
      return;
    }
    await runAction();
  }, [
    confirm,
    confirmationText,
    consequence,
    disabled,
    disabledReason,
    needsConfirm,
    noun,
    onAction,
    pending,
    runAction,
    severity,
    verb,
  ]);

  const handleDialogConfirm = useCallback(async () => {
    if (dialogCtx.expectedText && typedText.trim() !== dialogCtx.expectedText) {
      return;
    }
    closeDialog();
    await runAction();
  }, [closeDialog, dialogCtx.expectedText, runAction, typedText]);

  const markers = {
    'data-mp-destructive': 'true',
    'data-mp-destructive-severity': severity,
    ...(needsConfirm && useCustomConfirm ? { 'data-mp-confirmed-upstream': 'true' } : {}),
    ...(needsConfirm && !useCustomConfirm ? { 'data-mp-confirm-dialog': 'true' } : {}),
  } as Record<string, string>;

  // Build outside Tamagui <Paragraph>/<Text> children — the compiler extracts those
  // into `{{var}}` placeholders and drops runtime values in unit tests.
  const typedPrompt =
    dialogCtx.expectedText != null
      ? withInterp(t('Type "{{text}}" to confirm.'), {
          text: dialogCtx.expectedText,
        })
      : null;

  const dialogBody =
    dialogCtx.expectedText != null ? (
      <YStack gap="$3">
        {consequence ? <Paragraph size="$3">{consequence}</Paragraph> : null}
        <Paragraph size="$3" data-mp-confirm-prompt="">
          {typedPrompt}
        </Paragraph>
        <Input
          value={typedText}
          onChangeText={setTypedText}
          placeholder={dialogCtx.expectedText}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          data-mp-confirm-expected=""
          accessibilityLabel={typedPrompt ?? undefined}
          width="100%"
        />
      </YStack>
    ) : (
      consequence
    );

  return (
    <>
      <Button
        {...buttonProps}
        {...markers}
        verb={verb}
        noun={noun}
        error={useDanger || undefined}
        // Button renders the explain affordance (aria-disabled +
        // visible reason via aria-describedby) when disabledReason is set.
        disabled={disabled || Boolean(disabledReason) || undefined}
        disabledReason={disabledReason}
        loading={loading || pending}
        onPress={handlePress}>
        {label}
      </Button>
      {needsConfirm && !useCustomConfirm ? (
        <ConfirmDialog
          open={dialogOpen}
          title={`${dialogCtx.actionLabel}?`}
          body={dialogBody}
          confirmLabel={dialogCtx.confirmLabel}
          cancelLabel={t('Cancel')}
          destructive
          confirmDisabled={Boolean(dialogCtx.expectedText) && !typedMatch}
          // The typed-confirm gate explains itself — the expected
          // text hint doubles as the confirm button's disabled reason.
          confirmDisabledReason={typedPrompt ?? undefined}
          onConfirm={() => {
            void handleDialogConfirm();
          }}
          onCancel={closeDialog}
          onOpenChange={(next) => {
            if (!next) {
              closeDialog();
            } else {
              setDialogOpen(true);
            }
          }}
        />
      ) : null}
    </>
  );
}

export type { DestructiveSeverity };
