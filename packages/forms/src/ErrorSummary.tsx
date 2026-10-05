import { WarningCircleIcon } from '@phosphor-icons/react';
import { FOCUS_RING_HALO_OFFSET, useResolvedKnobs } from '@repo/theme';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Anchor, H4, Paragraph, YStack, isWeb } from 'tamagui';

import { focusFieldTarget } from './hooks/useFocusManagement';
import { formCommonColors } from './shared/colorRamps';
import { warnBannedErrorWords as warnBannedErrorWordsShared } from './shared/devWarn';
import { t } from './shared/t';

/** Structured field error. */
export interface StructuredFieldError {
  problem: string;
  action?: string;
  cta?: { label: string; href?: string };
}

/** Validators may return a plain string or a structured `{ problem, action }`. */
export type FieldErrorMessage = string | StructuredFieldError;

export interface ErrorSummaryItem {
  /** TanStack field name (used as React key and default focus target). */
  name: string;
  /** DOM id of the control to focus; defaults to `name`. Prefer `id={name}` on fields. */
  id?: string;
  /** Error payload — string or `{ problem, action?, cta? }`. */
  error: FieldErrorMessage;
  /** Optional human label; defaults to formatted error text for the link. */
  label?: string;
}

export interface ErrorSummaryProps {
  errors: ErrorSummaryItem[];
  /** Heading text (GOV.UK default). */
  title?: string;
  /** Skip moving focus to the summary when it appears. */
  disableAutoFocus?: boolean;
  /** Root form element used to resolve focus targets. */
  formElement?: HTMLElement | null;
  /** Called after a summary link focuses a field. */
  onFocusField?: (item: ErrorSummaryItem) => void;
  children?: ReactNode;
}

/** Flatten structured / string errors into display copy. */
export function formatFieldError(error: FieldErrorMessage): string {
  if (typeof error === 'string') {
    return error;
  }
  const problem = error.problem?.trim() ?? '';
  const action = error.action?.trim();
  if (problem && action) {
    return `${problem} ${action}`;
  }
  return problem || action || '';
}

/** Normalize unknown validator return values into FieldErrorMessage. */
export function normalizeFieldError(raw: unknown): FieldErrorMessage | undefined {
  if (raw == null || raw === false || raw === '') {
    return undefined;
  }
  if (typeof raw === 'string') {
    return raw;
  }
  if (typeof raw === 'object' && raw !== null && 'problem' in raw) {
    const problem = String((raw as StructuredFieldError).problem ?? '').trim();
    if (!problem) {
      return undefined;
    }
    return raw as StructuredFieldError;
  }
  return String(raw);
}

/**
 * DEV-only banned-word guard (blueprint `banned-error-word`).
 * Tree-shaken when `NODE_ENV === "production"`.
 */
export function warnBannedErrorWords(message: string, fieldName?: string): void {
  warnBannedErrorWordsShared(message, {
    component: 'ErrorSummary',
    fieldName,
    id: fieldName,
  });
}

type FieldMetaLike = { errors?: unknown[] } | undefined;

/** Collect field errors from TanStack `state.fieldMeta` for ErrorSummary. */
export function collectFormFieldErrors(
  fieldMeta: Partial<Record<string, FieldMetaLike>> | null | undefined,
): ErrorSummaryItem[] {
  if (!fieldMeta) {
    return [];
  }
  const items: ErrorSummaryItem[] = [];
  for (const [name, meta] of Object.entries(fieldMeta)) {
    const error = normalizeFieldError(meta?.errors?.[0]);
    if (!error) {
      continue;
    }
    const message = formatFieldError(error);
    if (!message) {
      continue;
    }
    warnBannedErrorWords(message, name);
    items.push({ name, id: name, error });
  }
  return items;
}

/**
 * Form-level error summary. Lists field errors with focusable
 * links, `role="alert"`, and moves keyboard focus onto itself when it appears.
 */
export function ErrorSummary({
  errors,
  title = t('There is a problem'),
  disableAutoFocus = false,
  formElement,
  onFocusField,
}: ErrorSummaryProps) {
  const { knobProps } = useResolvedKnobs({ component: 'ErrorSummary' });
  const headingId = useId();
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (disableAutoFocus || !isWeb || errors.length === 0) {
      return;
    }
    const node = containerRef.current;
    if (!node || typeof node.focus !== 'function') {
      return;
    }
    // Defer so the alert is in the accessibility tree before focus moves.
    const timer = setTimeout(() => {
      node.focus();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [disableAutoFocus, errors.length]);

  if (errors.length === 0) {
    return null;
  }

  const focusItem = (item: ErrorSummaryItem) => {
    if (!isWeb) {
      onFocusField?.(item);
      return;
    }
    const root =
      formElement ??
      (containerRef.current?.closest?.('form') as HTMLElement | null) ??
      (typeof document !== 'undefined' ? document.body : null);
    focusFieldTarget(root, { id: item.id ?? item.name, name: item.name });
    onFocusField?.(item);
  };

  return (
    <YStack
      ref={containerRef as any}
      role="alert"
      aria-labelledby={headingId}
      tabIndex={-1}
      theme="error"
      backgroundColor="$color3"
      width="100%"
      gap="$2"
      marginBottom="$3"
      padding={knobProps.panelPadding?.padding ?? '$3'}
      {...knobProps.borderRadius}
      outlineWidth={0}
      focusVisibleStyle={{
        outlineWidth: 2,
        outlineStyle: 'solid',
        outlineColor: '$color8',
        // Halo: inline text link. The summary sits in a run of prose,
        // so a band at offset 0 crosses the line box and collides with the
        // ascenders/descenders around it.
        outlineOffset: FOCUS_RING_HALO_OFFSET,
      }}
      data-testid="error-summary">
      <YStack flexDirection="row" alignItems="center" gap="$2">
        <WarningCircleIcon size={20} aria-hidden />
        <H4 id={headingId} size="$4" color="$color12" fontWeight="700" margin={0}>
          {title}
        </H4>
      </YStack>
      <YStack {...({ tag: 'ul' } as any)} gap="$1" paddingInlineStart="$1" margin={0}>
        {errors.map((item) => {
          const message = item.label ?? formatFieldError(item.error);
          const targetId = item.id ?? item.name;
          return (
            <YStack key={item.name} {...({ tag: 'li' } as any)}>
              <Paragraph size="$3" color="$color12" {...(knobProps.body as Record<string, unknown>)}>
                {isWeb ? (
                  <Anchor
                    href={`#${targetId}`}
                    color={formCommonColors.error}
                    textDecorationLine="underline"
                    cursor="pointer"
                    onPress={(e: any) => {
                      e?.preventDefault?.();
                      focusItem(item);
                    }}>
                    {message}
                  </Anchor>
                ) : (
                  <Paragraph
                    color={formCommonColors.error}
                    textDecorationLine="underline"
                    onPress={() => {
                      focusItem(item);
                    }}>
                    {message}
                  </Paragraph>
                )}
              </Paragraph>
            </YStack>
          );
        })}
      </YStack>
    </YStack>
  );
}
