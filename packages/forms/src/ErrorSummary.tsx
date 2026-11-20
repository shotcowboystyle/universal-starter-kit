import { WarningCircleIcon } from '@phosphor-icons/react';
import { FOCUS_RING_HALO_OFFSET, useResolvedKnobs } from '@repo/theme';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Anchor, H4, Paragraph, YStack, isWeb } from 'tamagui';
import type { TamaguiElement } from 'tamagui';

import { focusFieldTarget } from './hooks/use-focus-management';
import { formCommonColors } from './shared/color-ramps';
import { warnBannedErrorWords as warnBannedErrorWordsShared } from './shared/dev-warn';
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
// oxlint-disable-next-line react-doctor/only-export-components -- public helper co-located with ErrorSummary; consumers import both from './ErrorSummary'
export const formatFieldError = (error: FieldErrorMessage): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- FieldErrorMessage is string | object with no discriminant field
  if (typeof error === 'string') {
    return error;
  }
  const problem = error.problem?.trim() ?? '';
  const action = error.action?.trim() ?? '';
  if (problem !== '' && action !== '') {
    return `${problem} ${action}`;
  }
  return problem === '' ? action : problem;
};

/** Structural check: an object carrying a `problem` key is treated as a StructuredFieldError. */
const isStructuredFieldError = (value: unknown): value is StructuredFieldError =>
  typeof value === 'object' && value !== null && 'problem' in value;

/** Normalize unknown validator return values into FieldErrorMessage. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, react-doctor/only-export-components -- parse boundary for untyped validator output; public helper that consumers import from './ErrorSummary' alongside the component
export const normalizeFieldError = (raw: unknown): FieldErrorMessage | undefined => {
  if (raw == null || raw === false || raw === '') {
    return undefined;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this function is the boundary parser for untyped validator output
  if (typeof raw === 'string') {
    return raw;
  }
  if (isStructuredFieldError(raw)) {
    const problem = raw.problem?.trim() ?? '';
    if (problem === '') {
      return undefined;
    }
    return raw;
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- legacy stringification of unexpected validator return values
  return String(raw);
};

/**
 * DEV-only banned-word guard (blueprint `banned-error-word`).
 * Tree-shaken when `NODE_ENV === "production"`.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- public helper co-located with ErrorSummary; consumers import both from './ErrorSummary'
export const warnBannedErrorWords = (message: string, fieldName?: string): void => {
  warnBannedErrorWordsShared(message, {
    component: 'ErrorSummary',
    fieldName,
    id: fieldName,
  });
};

type FieldMetaLike = { errors?: unknown[] } | undefined;

/** Collect field errors from TanStack `state.fieldMeta` for ErrorSummary. */
// oxlint-disable-next-line react-doctor/only-export-components -- public helper co-located with ErrorSummary; consumers import both from './ErrorSummary'
export const collectFormFieldErrors = (
  fieldMeta: Partial<Record<string, FieldMetaLike>> | null | undefined,
): ErrorSummaryItem[] => {
  if (fieldMeta == null) {
    return [];
  }
  const items: ErrorSummaryItem[] = [];
  for (const [name, meta] of Object.entries(fieldMeta)) {
    const error = normalizeFieldError(meta?.errors?.[0]);
    const message = error === undefined ? '' : formatFieldError(error);
    if (error !== undefined && message !== '') {
      warnBannedErrorWords(message, name);
      items.push({ name, id: name, error });
    }
  }
  return items;
};

/** The element field lookups run against: the given form, else the summary's own form, else the page. */
const resolveFocusRoot = (formElement: HTMLElement | null | undefined, container: TamaguiElement | null) => {
  if (formElement != null) {
    return formElement;
  }
  const owningForm = container instanceof HTMLElement ? container.closest<HTMLFormElement>('form') : null;
  return owningForm ?? (typeof document === 'undefined' ? null : document.body);
};

/**
 * Form-level error summary. Lists field errors with focusable
 * links, `role="alert"`, and moves keyboard focus onto itself when it appears.
 */
export const ErrorSummary = ({
  errors,
  title = t('There is a problem'),
  disableAutoFocus = false,
  formElement,
  onFocusField,
}: ErrorSummaryProps) => {
  const { knobProps } = useResolvedKnobs({ component: 'ErrorSummary' });
  const headingId = useId();
  const containerRef = useRef<TamaguiElement>(null);

  useEffect(() => {
    if (disableAutoFocus || !isWeb || errors.length === 0) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const node = containerRef.current;
    if (node == null) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
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
    const root = resolveFocusRoot(formElement, containerRef.current);
    focusFieldTarget(root, { id: item.id ?? item.name, name: item.name });
    onFocusField?.(item);
  };

  return (
    <YStack
      ref={containerRef}
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
      <YStack
        flexDirection="row"
        alignItems="center"
        gap="$2">
        <WarningCircleIcon
          size={20}
          aria-hidden
        />
        <H4
          id={headingId}
          size="$4"
          color="$color12"
          fontWeight="700"
          margin={0}>
          {title}
        </H4>
      </YStack>
      <YStack
        {...{ tag: 'ul' }}
        gap="$1"
        paddingInlineStart="$1"
        margin={0}>
        {errors.map((item) => {
          const message = item.label ?? formatFieldError(item.error);
          const targetId = item.id ?? item.name;
          return (
            <YStack
              key={item.name}
              {...{ tag: 'li' }}>
              <Paragraph
                size="$3"
                color="$color12"
                {...knobProps.body}>
                {isWeb ? (
                  <Anchor
                    href={`#${targetId}`}
                    color={formCommonColors.error}
                    textDecorationLine="underline"
                    cursor="pointer"
                    onPress={(e) => {
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
};
