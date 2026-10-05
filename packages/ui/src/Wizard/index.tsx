import {
  ErrorSummary,
  FormSection,
  focusFieldTarget,
  focusFirstInvalid,
  formReadableMaxWidth,
  type ErrorSummaryItem,
} from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import {
  Children,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Text, View, XStack, YStack, isWeb, useMedia, type GetProps, type TamaguiElement } from 'tamagui';

import { ActionBar } from '../actions/ActionBar';
import { Button } from '../Button';
import { EmptyState } from '../layouts/EmptyState';
import { ProgressSteps, type ProgressStep } from '../ProgressSteps';
import { useTranslation } from '../shared/i18n';
import { bidiIsolate, withInterp } from '../shared/t';
import { Skeleton } from '../Skeleton';

export interface WizardFormLike {
  validateField?: (name: string, cause?: string) => unknown | Promise<unknown>;
  getFieldMeta?: (name: string) => { errors?: unknown[] } | undefined;
  getFieldValue?: (name: string) => unknown;
  setFieldValue?: (name: string, value: unknown) => void;
  state?: { values?: Record<string, unknown> };
}

export interface WizardStep {
  id: string;
  label: string;
  description?: string;
  optional?: boolean;
  disabled?: boolean;
  /** Field names this step validates on Next. */
  fields?: readonly string[];
  /** Human labels for review rows; defaults to the field name. */
  fieldLabels?: Record<string, string>;
  /** Marks the rail's review step (Edit jumps back; primary is the task verb). */
  review?: boolean;
}

export type WizardStatus = 'loading' | 'empty' | 'error' | 'ready';

export interface WizardReviewRow {
  name: string;
  label: string;
  value?: string;
}

export interface WizardReviewGroup {
  stepIndex: number;
  label: string;
  rows: WizardReviewRow[];
}

export interface WizardProps extends Omit<GetProps<typeof YStack>, 'children'> {
  steps: WizardStep[];
  /** One child per step — all stay mounted. */
  children?: ReactNode;
  current?: number;
  defaultCurrent?: number;
  onStepChange?: (index: number) => void;
  onCancel?: () => void;
  onComplete?: () => void | Promise<void>;
  /** Last-step primary. Must be the task verb — never "Submit". */
  completeLabel: string;
  cancelLabel?: string;
  backLabel?: string;
  nextLabel?: (next: WizardStep) => string;
  form?: WizardFormLike;
  validateStep?: (index: number) => boolean | Promise<boolean>;
  status?: WizardStatus;
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
  compact?: boolean;
  /** Rail labels. `"auto"` hides them under the xs media (390 treatment). */
  labels?: 'visible' | 'hidden' | 'auto';
  editLabel?: string;
  reviewGroups?: WizardReviewGroup[];
}

interface WizardContextValue {
  current: number;
  steps: WizardStep[];
  goTo: (index: number, opts?: { returnToReview?: boolean }) => void;
  setFieldValue: (name: string, value: unknown) => void;
  getFieldValue: (name: string) => unknown;
  repaintGeneration: Record<string, number>;
  editLabel: string;
  reviewGroups?: WizardReviewGroup[];
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) {
    throw new Error('useWizard must be used within Wizard');
  }
  return ctx;
}

function formatReviewValue(value: unknown): string {
  if (value == null || value === '') {
    return '—';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function stepCaption(t: (key: string) => string, index: number, steps: WizardStep[]): string {
  return bidiIsolate(
    withInterp(t('Step {{current}} of {{total}} — {{label}}'), {
      current: index + 1,
      total: steps.length,
      label: steps[index]?.label ?? '',
    }),
  );
}

function WizardRule() {
  return (
    <View
      data-wizard-separator=""
      role="separator"
      height={1}
      backgroundColor="$borderColor"
      alignSelf="stretch"
      flexGrow={0}
      flexShrink={0}
    />
  );
}

const WizardShell = forwardRef<TamaguiElement, GetProps<typeof YStack> & { compact?: boolean }>(function WizardShell(
  { compact, children, ...props },
  ref,
) {
  const { knobProps } = useResolvedKnobs(compact === undefined ? undefined : { compact });
  return (
    <YStack
      ref={ref}
      data-wizard-shell=""
      backgroundColor="$color3"
      {...knobProps.containerRadius}
      {...knobProps.panelPadding}
      width="100%"
      {...props}
      borderWidth={1}
      borderColor="$color5">
      {children}
    </YStack>
  );
});

function WizardSkeleton() {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack {...knobProps.gapLg} width="100%" data-wizard-status="loading">
      <XStack gap="$3" alignItems="center" width="100%">
        <Skeleton variant="circular" width={32} height={32} />
        <Skeleton variant="circular" width={32} height={32} />
        <Skeleton variant="circular" width={32} height={32} />
      </XStack>
      <YStack {...knobProps.gap} maxWidth={formReadableMaxWidth} width="100%">
        <Skeleton variant="rounded" width="100%" height={44} />
        <Skeleton variant="rounded" width="100%" height={44} />
      </YStack>
    </YStack>
  );
}

/** Real element (not a fragment) so Children.toArray keeps one child per step. */
export function WizardPanel({ children }: { children: ReactNode }) {
  return (
    <YStack data-wizard-panel-body="" width="100%">
      {children}
    </YStack>
  );
}

export function WizardClearable({ names, children }: { names: readonly string[]; children: ReactNode }) {
  const { repaintGeneration } = useWizard();
  const key = names.map((name) => `${name}:${repaintGeneration[name] ?? 0}`).join('|');
  return <YStack key={key}>{children}</YStack>;
}

export function WizardReview({ groups }: { groups?: WizardReviewGroup[] }) {
  const { steps, getFieldValue, goTo, editLabel, reviewGroups } = useWizard();
  const { knobProps } = useResolvedKnobs();
  const resolved =
    groups ??
    reviewGroups ??
    steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => !step.review)
      .map(({ step, index }) => ({
        stepIndex: index,
        label: step.label,
        rows: (step.fields ?? []).map((name) => ({
          name,
          label: step.fieldLabels?.[name] ?? name,
          value: formatReviewValue(getFieldValue(name)),
        })),
      }));

  return (
    <YStack data-wizard-review="" width="100%" {...knobProps.gap}>
      {resolved.map((group, groupIndex) => (
        <YStack key={group.label} width="100%">
          {groupIndex > 0 ? <WizardRule /> : null}
          <XStack alignItems="baseline" justifyContent="space-between" gap="$3" width="100%">
            <Text {...knobProps.label} {...knobProps.heading} color="$color12">
              {group.label}
            </Text>
            <Button
              chromeless
              compact
              onPress={() => {
                goTo(group.stepIndex, { returnToReview: true });
              }}
              aria-label={`${editLabel} ${group.label}`}
              testID={`wizard-edit-${group.stepIndex}`}>
              {editLabel}
            </Button>
          </XStack>
          <YStack {...knobProps.gap} width="100%">
            {group.rows.map((row) => (
              <XStack key={row.name} gap="$4" alignItems="flex-start" width="100%">
                <Text {...knobProps.body} color="$color10" width={176} flexShrink={0}>
                  {row.label}
                </Text>
                <Text {...knobProps.body} color="$color12" flex={1} minWidth={0}>
                  {row.value ?? '—'}
                </Text>
              </XStack>
            ))}
          </YStack>
        </YStack>
      ))}
    </YStack>
  );
}

function WizardRoot({
  steps,
  children,
  current: controlledCurrent,
  defaultCurrent = 0,
  onStepChange,
  onCancel,
  onComplete,
  completeLabel,
  cancelLabel,
  backLabel,
  nextLabel,
  form,
  validateStep,
  status = 'ready',
  emptyTitle,
  emptyDescription,
  errorTitle,
  errorDescription,
  compact,
  labels = 'auto',
  editLabel,
  reviewGroups,
  ...props
}: WizardProps) {
  const { t } = useTranslation();
  const media = useMedia();
  const { knobProps } = useResolvedKnobs(compact === undefined ? undefined : { compact });
  const reactId = useId();
  const shellRef = useRef<TamaguiElement | null>(null);
  const panelRefs = useRef<Array<HTMLElement | null>>([]);
  const [uncontrolled, setUncontrolled] = useState(defaultCurrent);
  const [maxVisited, setMaxVisited] = useState(defaultCurrent);
  const [returnTo, setReturnTo] = useState<number | null>(null);
  const [stepErrors, setStepErrors] = useState<ErrorSummaryItem[]>([]);
  const [completing, setCompleting] = useState(false);
  const [repaintGeneration, setRepaintGeneration] = useState<Record<string, number>>({});
  const current = controlledCurrent ?? uncontrolled;
  const hideLabels = labels === 'hidden' || (labels !== 'visible' && Boolean(media.xs));
  const lastIndex = Math.max(0, steps.length - 1);
  const isLast = current >= lastIndex;
  const currentStep = steps[current];
  const resolvedCancel = cancelLabel ?? t('Cancel');
  const resolvedBack = backLabel ?? t('Back');
  const resolvedEdit = editLabel ?? t('Edit');
  const panels = Children.toArray(children);

  const setCurrent = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, lastIndex));
      setMaxVisited((max) => Math.max(max, clamped));
      setStepErrors([]);
      if (controlledCurrent === undefined) {
        setUncontrolled(clamped);
      }
      onStepChange?.(clamped);
    },
    [controlledCurrent, lastIndex, onStepChange],
  );

  const goTo = useCallback(
    (index: number, opts?: { returnToReview?: boolean }) => {
      if (opts?.returnToReview) {
        setReturnTo(lastIndex);
      }
      setCurrent(index);
    },
    [lastIndex, setCurrent],
  );

  const getFieldValue = useCallback(
    (name: string) => form?.getFieldValue?.(name) ?? form?.state?.values?.[name],
    [form],
  );

  const setFieldValue = useCallback(
    (name: string, value: unknown) => {
      form?.setFieldValue?.(name, value);
      setRepaintGeneration((prev) => ({ ...prev, [name]: (prev[name] ?? 0) + 1 }));
    },
    [form],
  );

  const collectFieldErrors = useCallback(
    async (names: readonly string[]): Promise<ErrorSummaryItem[]> => {
      const items: ErrorSummaryItem[] = [];
      for (const name of names) {
        const validated = await Promise.resolve(form?.validateField?.(name, 'submit'));
        const fromMeta = form?.getFieldMeta?.(name)?.errors?.[0];
        const raw = fromMeta ?? (typeof validated === 'string' ? validated : undefined);
        if (raw == null || raw === false || raw === '') {
          continue;
        }
        items.push({
          name,
          id: name,
          error: typeof raw === 'string' ? raw : String(raw),
          label: currentStep?.fieldLabels?.[name],
        });
      }
      return items;
    },
    [currentStep?.fieldLabels, form],
  );

  const runStepValidation = useCallback(
    async (index: number): Promise<ErrorSummaryItem[]> => {
      if (validateStep) {
        const ok = await validateStep(index);
        return ok ? [] : [{ name: steps[index]?.id ?? String(index), error: t('There is a problem') }];
      }
      const names = steps[index]?.fields ?? [];
      if (names.length === 0) {
        return [];
      }
      return collectFieldErrors(names);
    },
    [collectFieldErrors, steps, t, validateStep],
  );

  const focusFirstStepError = useCallback((errors: ErrorSummaryItem[], index: number) => {
    if (!isWeb || errors.length === 0) {
      return;
    }
    const root = (panelRefs.current[index] ??
      shellRef.current ??
      (typeof document !== 'undefined' ? document.body : null)) as HTMLElement | null;
    const first = errors[0];
    const focused = focusFieldTarget(root, { id: first.id ?? first.name, name: first.name });
    if (!focused) {
      focusFirstInvalid(root);
    }
  }, []);

  const handleNext = useCallback(async () => {
    const errors = await runStepValidation(current);
    setStepErrors(errors);
    if (errors.length > 0) {
      if (isWeb && typeof window !== 'undefined') {
        window.setTimeout(() => {
          focusFirstStepError(errors, current);
        }, 0);
      }
      return;
    }
    if (returnTo != null) {
      const target = returnTo;
      setReturnTo(null);
      setCurrent(target);
      return;
    }
    setCurrent(Math.min(current + 1, lastIndex));
  }, [current, focusFirstStepError, lastIndex, returnTo, runStepValidation, setCurrent]);

  const handleComplete = useCallback(async () => {
    const errors = await runStepValidation(current);
    setStepErrors(errors);
    if (errors.length > 0) {
      if (isWeb && typeof window !== 'undefined') {
        window.setTimeout(() => {
          focusFirstStepError(errors, current);
        }, 0);
      }
      return;
    }
    if (!onComplete) {
      return;
    }
    setCompleting(true);
    try {
      await onComplete();
    } finally {
      setCompleting(false);
    }
  }, [current, focusFirstStepError, onComplete, runStepValidation]);

  const handleBack = useCallback(() => {
    setCurrent(Math.max(0, current - 1));
  }, [current, setCurrent]);

  useEffect(() => {
    if (!isWeb || knobProps.formAutofocus !== 'on' || stepErrors.length > 0) {
      return;
    }
    const panel = panelRefs.current[current];
    const first = panel?.querySelector(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    ) as HTMLElement | null;
    first?.focus?.();
  }, [current, knobProps.formAutofocus, stepErrors.length]);

  const ctx = useMemo<WizardContextValue>(
    () => ({
      current,
      steps,
      goTo,
      setFieldValue,
      getFieldValue,
      repaintGeneration,
      editLabel: resolvedEdit,
      reviewGroups,
    }),
    [current, getFieldValue, goTo, repaintGeneration, resolvedEdit, reviewGroups, setFieldValue, steps],
  );

  const railSteps: ProgressStep[] = steps.map((step, index) => ({
    id: step.id,
    label: step.label,
    description: step.description,
    optional: step.optional,
    error: index === current && stepErrors.length > 0,
    completed: index !== current && index <= maxVisited,
    disabled: step.disabled || index > maxVisited,
  }));

  const nextStep = steps[current + 1];
  const primaryText = isLast
    ? completeLabel
    : (nextLabel?.(nextStep) ?? withInterp(t('Next: {{label}}'), { label: nextStep?.label ?? '' }));
  const hasLeading = Boolean(onCancel) || current > 0;

  if (status === 'loading') {
    return (
      <WizardShell compact={compact} {...props}>
        <WizardSkeleton />
      </WizardShell>
    );
  }

  if (status === 'empty' || steps.length === 0) {
    return (
      <WizardShell compact={compact} data-wizard-status="empty" {...props}>
        <EmptyState compact title={emptyTitle ?? t('No steps')} description={emptyDescription} />
      </WizardShell>
    );
  }

  if (status === 'error') {
    return (
      <WizardShell compact={compact} data-wizard-status="error" {...props}>
        <EmptyState
          compact
          intent="error"
          title={errorTitle ?? t('Could not load this flow')}
          description={errorDescription}
        />
      </WizardShell>
    );
  }

  return (
    <WizardContext.Provider value={ctx}>
      <WizardShell
        compact={compact}
        ref={shellRef}
        data-wizard-status="ready"
        data-wizard-current={String(current)}
        {...knobProps.gap}
        {...props}>
        <YStack data-wizard-rail="" width="100%">
          <ProgressSteps
            steps={railSteps}
            current={current}
            labels={hideLabels ? 'hidden' : 'visible'}
            compact={compact}
            linear
            onStepChange={(index) => {
              if (index <= maxVisited && !steps[index]?.disabled) {
                setCurrent(index);
              }
            }}
          />
        </YStack>
        <YStack width="100%">
          <WizardRule />
        </YStack>
        {stepErrors.length > 0 ? (
          <YStack
            data-error-summary=""
            backgroundColor="$red3"
            {...knobProps.borderRadius}
            borderWidth={1}
            borderColor="$red9"
            width="100%">
            <ErrorSummary
              errors={stepErrors}
              disableAutoFocus
              formElement={shellRef.current as HTMLElement | null}
              title={t('There is a problem')}
            />
          </YStack>
        ) : null}
        <YStack {...knobProps.gapLg} width="100%">
          <YStack width="100%">
            {steps.map((step, index) => {
              const legend = hideLabels ? stepCaption(t, index, steps) : step.label;
              return (
                <YStack
                  key={step.id || index}
                  ref={(node) => {
                    panelRefs.current[index] = node as HTMLElement | null;
                  }}
                  data-wizard-panel=""
                  data-wizard-fields=""
                  data-wizard-step-caption={hideLabels ? '' : undefined}
                  data-active={index === current ? 'true' : 'false'}
                  data-step-id={step.id}
                  display={index === current ? 'flex' : 'none'}
                  aria-hidden={index !== current || undefined}
                  width="100%"
                  maxWidth={formReadableMaxWidth}
                  alignSelf="flex-start"
                  {...knobProps.gap}>
                  <FormSection label={legend} compact={compact}>
                    {panels[index]}
                  </FormSection>
                </YStack>
              );
            })}
          </YStack>
          <YStack width="100%">
            <WizardRule />
          </YStack>
        </YStack>
        <ActionBar
          id={`${reactId}-footer`}
          data-wizard-footer=""
          align={hasLeading ? 'between' : 'end'}
          cancel={
            hasLeading ? (
              <XStack gap="$2" flexWrap="wrap" alignItems="center">
                {onCancel ? (
                  <Button chromeless onPress={onCancel} testID="wizard-cancel">
                    {resolvedCancel}
                  </Button>
                ) : null}
                {current > 0 ? (
                  <Button outlined onPress={handleBack} testID="wizard-back">
                    {resolvedBack}
                  </Button>
                ) : null}
              </XStack>
            ) : undefined
          }
          primary={
            <Button
              accent
              data-primary=""
              loading={completing}
              onPress={isLast ? handleComplete : handleNext}
              testID="wizard-primary">
              {primaryText}
            </Button>
          }
        />
      </WizardShell>
    </WizardContext.Provider>
  );
}

export const Wizard = Object.assign(WizardRoot, {
  Panel: WizardPanel,
  Clearable: WizardClearable,
  Review: WizardReview,
});
