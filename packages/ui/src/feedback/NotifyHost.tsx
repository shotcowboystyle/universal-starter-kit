/**
 * Host for notify() non-toast surfaces: page banners + blocking dialogs.
 * Also mounts ToastViewport so a single root host covers all routes.
 *
 * Blocking error/warning routes render `<ConfirmDialog>` (alertdialog).
 */

import { zIndex } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { SizableText, YStack } from 'tamagui';

import { Alert } from '../Alert';
import { useTranslation } from '../shared/i18n';
import { ToastViewport } from '../Toast';
import type { ToastViewportProps } from '../Toast';

import { ConfirmDialog } from './ConfirmDialog';
import type { NotifyAction } from './route';
import { dismissFeedback, getFeedback, subscribeFeedback } from './store';
import type { FeedbackEntry } from './store';

export interface NotifyHostProps {
  /** Mount ToastViewport (default true). Pass false if the app already mounts one. */
  toastViewport?: boolean | ToastViewportProps;
  children?: ReactNode;
}

const useFeedbackEntries = (): FeedbackEntry[] => useSyncExternalStore(subscribeFeedback, getFeedback, getFeedback);

/**
 * Alert's convenience `actionLabel` hardcodes 600. The `action`
 * slot plus a text node pinned at 400 is the Notify path (same trap as
 * AsyncBoundary Retry).
 */
const NotifyActionLabel = ({ action }: { action: NotifyAction }) => {
  const { knobProps } = useResolvedKnobs();
  const { label, onPress: handlePress } = action;
  return (
    <SizableText
      {...knobProps.body}
      {...knobProps.label}
      fontWeight="400"
      color="$color12"
      userSelect="none"
      cursor="pointer"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui SizableText renders a span; swapping the tag would change layout/styling of the pinned-weight action label
      role="button"
      tabIndex={0}
      onPress={handlePress}>
      {label}
    </SizableText>
  );
};

const notifyAction = (entry: FeedbackEntry) => (entry.action ? <NotifyActionLabel action={entry.action} /> : undefined);

const BannerStack = ({ entries }: { entries: FeedbackEntry[] }) => {
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
          intent={entry.severity}
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
};

/**
 * Blocking notify() surface → ConfirmDialog.
 * error → destructive confirm; warning → warning confirm; Escape/Cancel dismisses.
 */
const FeedbackDialog = ({ entry }: { entry: FeedbackEntry | undefined }) => {
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
};

/**
 * Inline region for section/field-scoped alerts from `notify()`.
 * Place next to the relevant form section or field.
 */
export const NotifyRegion = ({
  scope,
  region,
  compact,
}: {
  scope: 'section' | 'field';
  /** Match one target; omitted regions display only untargeted feedback. */
  region?: string;
  compact?: boolean;
}) => {
  const all = useFeedbackEntries();
  // Inline alert stacking rides the space knob.
  const { knobProps } = useResolvedKnobs();
  const entries = useMemo(
    () =>
      all.filter(
        (e) => e.surface === 'alert' && e.scope === scope && (region == null ? e.region == null : e.region === region),
      ),
    [all, scope, region],
  );
  if (entries.length === 0) {
    return null;
  }
  return (
    <YStack
      {...knobProps.gap}
      width="100%"
      data-density={knobProps.density}>
      {entries.map((entry) => (
        <Alert
          key={entry.id}
          intent={entry.severity}
          title={entry.title}
          {...(compact == null ? {} : { compact })}
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
};

const resolveViewportProps = (toastViewport: boolean | ToastViewportProps): ToastViewportProps | null => {
  if (toastViewport === true) {
    return {};
  }
  return toastViewport === false ? null : toastViewport;
};

/**
 * App/story root host: page banners, blocking dialog, and (optionally) toast viewport.
 */
export const NotifyHost = ({ toastViewport = true, children }: NotifyHostProps) => {
  const all = useFeedbackEntries();
  const banners = useMemo(() => all.filter((e) => e.surface === 'banner'), [all]);
  const dialog = useMemo(() => all.find((e) => e.surface === 'dialog'), [all]);
  const viewportProps = resolveViewportProps(toastViewport);

  return (
    <>
      <BannerStack entries={banners} />
      {children}
      <FeedbackDialog entry={dialog} />
      {viewportProps == null ? null : <ToastViewport {...viewportProps} />}
    </>
  );
};
