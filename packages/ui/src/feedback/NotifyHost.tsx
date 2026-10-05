/**
 * Host for notify() non-toast surfaces: page banners + blocking dialogs.
 * Also mounts ToastViewport so a single root host covers all routes.
 *
 * Blocking error/warning routes render `<ConfirmDialog>` (alertdialog).
 */

import { zIndex } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { SizableText, YStack } from 'tamagui';

import { Alert, type AlertIntent } from '../Alert';
import { useTranslation } from '../shared/i18n';
import { ToastViewport, type ToastViewportProps } from '../Toast';

import { ConfirmDialog } from './ConfirmDialog';
import { dismissFeedback, getFeedback, subscribeFeedback, type FeedbackEntry } from './store';

export interface NotifyHostProps {
  /** Mount ToastViewport (default true). Pass false if the app already mounts one. */
  toastViewport?: boolean | ToastViewportProps;
  children?: ReactNode;
}

function useFeedbackEntries(): FeedbackEntry[] {
  return useSyncExternalStore(subscribeFeedback, getFeedback, getFeedback);
}

/**
 * Alert's convenience `actionLabel` hardcodes 600. The `action`
 * slot plus a text node pinned at 400 is the Notify path (same trap as
 * AsyncBoundary Retry).
 */
function NotifyActionLabel({ label, onPress }: { label: string; onPress: () => void }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <SizableText
      {...knobProps.body}
      {...knobProps.label}
      fontWeight="400"
      color="$color12"
      userSelect="none"
      cursor="pointer"
      role="button"
      tabIndex={0}
      onPress={onPress}>
      {label}
    </SizableText>
  );
}

function notifyAction(entry: FeedbackEntry) {
  return entry.action ? <NotifyActionLabel label={entry.action.label} onPress={entry.action.onPress} /> : undefined;
}

function BannerStack({ entries }: { entries: FeedbackEntry[] }) {
  // The banner region's stack gap and page inset
  // ride the space knob through the complete fragments.
  const { knobProps } = useResolvedKnobs();
  if (entries.length === 0) {
    return null;
  }
  return (
    <YStack
      {...knobProps.gap}
      width="100%"
      {...knobProps.panelPadding}
      zIndex={zIndex.loading}
      data-density={knobProps.density}>
      {entries.map((entry) => (
        <Alert
          key={entry.id}
          intent={entry.severity as AlertIntent}
          title={entry.title}
          dismissible={entry.dismissible}
          onDismiss={() => {
            dismissFeedback(entry.id);
          }}
          action={notifyAction(entry)}>
          {entry.body}
        </Alert>
      ))}
    </YStack>
  );
}

/**
 * Blocking notify() surface → ConfirmDialog.
 * error → destructive confirm; warning → warning confirm; Escape/Cancel dismisses.
 */
function FeedbackDialog({ entry }: { entry: FeedbackEntry | undefined }) {
  const { t } = useTranslation();
  const open = entry != null;
  return (
    <ConfirmDialog
      open={open}
      title={entry?.title ?? entry?.severity ?? ''}
      body={entry?.body}
      confirmLabel={entry?.action?.label ?? t('OK')}
      cancelLabel={t('Cancel')}
      destructive={entry?.severity === 'error'}
      warning={entry?.severity === 'warning'}
      onConfirm={() => {
        entry?.action?.onPress();
        if (entry) {
          dismissFeedback(entry.id);
        }
      }}
      onCancel={() => {
        if (entry) {
          dismissFeedback(entry.id);
        }
      }}
      onOpenChange={(next) => {
        if (!next && entry) {
          dismissFeedback(entry.id);
        }
      }}
    />
  );
}

/**
 * Inline region for section/field-scoped alerts from `notify()`.
 * Place next to the relevant form section or field.
 */
export function NotifyRegion({
  scope,
  region,
  compact,
}: {
  scope: 'section' | 'field';
  /** Match one target; omitted regions display only untargeted feedback. */
  region?: string;
  compact?: boolean;
}) {
  const all = useFeedbackEntries();
  // Inline alert stacking rides the space knob.
  const { knobProps } = useResolvedKnobs();
  const entries = useMemo(
    () =>
      all.filter(
        (e) => e.surface === 'alert' && e.scope === scope && (region != null ? e.region === region : e.region == null),
      ),
    [all, scope, region],
  );
  if (entries.length === 0) {
    return null;
  }
  return (
    <YStack {...knobProps.gap} width="100%" data-density={knobProps.density}>
      {entries.map((entry) => (
        <Alert
          key={entry.id}
          intent={entry.severity as AlertIntent}
          title={entry.title}
          {...(compact != null ? { compact } : {})}
          dismissible={entry.dismissible}
          onDismiss={() => {
            dismissFeedback(entry.id);
          }}
          action={notifyAction(entry)}>
          {entry.body}
        </Alert>
      ))}
    </YStack>
  );
}

/**
 * App/story root host: page banners, blocking dialog, and (optionally) toast viewport.
 */
export function NotifyHost({ toastViewport = true, children }: NotifyHostProps) {
  const all = useFeedbackEntries();
  const banners = useMemo(() => all.filter((e) => e.surface === 'banner'), [all]);
  const dialog = useMemo(() => all.find((e) => e.surface === 'dialog'), [all]);
  const viewportProps = toastViewport === true ? {} : toastViewport === false ? null : toastViewport;

  return (
    <>
      <BannerStack entries={banners} />
      {children}
      <FeedbackDialog entry={dialog} />
      {viewportProps != null ? <ToastViewport {...viewportProps} /> : null}
    </>
  );
}
