import type { FieldSchema } from '@repo/frappe-ui';
import { ensureCompositeFocusRing, useResolvedKnobs } from '@repo/theme';
/**
 * Render-error containment for the backoffice form surfaces.
 *
 * Before this boundary existed, a single field renderer throwing during
 * render (the tiptap-v3 TextEditor regression, any registry adapter bug)
 * escaped to the host's ROUTE-level error boundary and unmounted the entire
 * desk — list chrome included in the QuickEntry-dialog case
 * (p-results/backoffice-e2e-verify.md gap #2). Desk parity is per-field
 * degradation: one broken field renders an inline honest-error slot (field
 * label + error panel + retry, DG-ST-01) while every sibling field, the
 * toolbar, sidebar, and timeline stay alive and interactive.
 *
 * Two granularities, both composed from the same class:
 *   - per field   — `wrapFieldWithErrorBoundary` rides SchemaForm's
 *                   `renderFieldWrapper` bridge, so registry defaults,
 *                   overrides, and the unsupported-type fallback are all
 *                   contained without re-implementing the render path;
 *   - per surface — DocFormScreen wraps each body tab's SchemaForm and the
 *                   collaboration sidebar blocks; QuickEntryDialog wraps its
 *                   mini-form (the dialog footer with "Edit Full Form"
 *                   survives, so the desk-routing escape stays reachable).
 *
 * Follows the house ErrorBoundary primitive's shape
 * (public/components/src/ErrorBoundary — class boundary, retry resets
 * state); the fallback here additionally carries the field label and the
 * AsyncBoundary error chrome, which the house primitive's fixed fallback
 * cannot express. Retry honestly re-attempts: a deterministic crash lands
 * back in the slot (never the blank route), a transient one recovers.
 */
import { AsyncBoundary, Text, YStack } from '@repo/ui';
import React, { Component, useEffect } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

const logger = console;

export interface FormErrorBoundaryProps {
  /**
   * Label rendered above the error panel (field slot order: Label → Error)
   * so the user still knows WHICH field is broken.
   */
  label?: string;
  /** Error panel title; defaults to the field-scope copy. */
  errorTitle?: string;
  /** testID for the fallback slot (children render untouched). */
  testID?: string;
  children?: ReactNode;
}

interface FormErrorBoundaryState {
  error: Error | null;
  /** Bumped on retry so the children subtree remounts from scratch. */
  resetNonce: number;
}

const FormErrorFallback = ({
  label,
  errorTitle,
  error,
  onRetry,
  testID,
}: {
  label?: string;
  errorTitle?: string;
  error: Error;
  onRetry: () => void;
  testID?: string;
}) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack
      {...knobProps.gap}
      minWidth={0}
      testID={testID}>
      {label !== undefined && label !== '' ? (
        <Text
          fontSize="$3"
          fontWeight="400"
          color="$color11"
          numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      <AsyncBoundary
        compact
        error={error}
        onRetry={onRetry}
        errorTitle={errorTitle ?? t('fieldRenderError', 'This field failed to render')}
      />
    </YStack>
  );
};

export class FormErrorBoundary extends Component<FormErrorBoundaryProps, FormErrorBoundaryState> {
  static getDerivedStateFromError(error: Error): Partial<FormErrorBoundaryState> {
    return { error };
  }

  constructor(props: FormErrorBoundaryProps) {
    super(props);
    this.state = { error: null, resetNonce: 0 };
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- React lifecycle method; it must live on the instance
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Contained, not swallowed: keep the signal for devs / e2e consoles.
    logger.warn('[backoffice] form render error contained', { error, errorInfo });
  }

  handleRetry = () => {
    // oxlint-disable-next-line react/no-set-state -- error boundaries can only be class components
    this.setState((prev) => ({ error: null, resetNonce: prev.resetNonce + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <FormErrorFallback
          label={this.props.label}
          errorTitle={this.props.errorTitle}
          error={this.state.error}
          onRetry={this.handleRetry}
          testID={this.props.testID}
        />
      );
    }
    // Keyed so a retry remounts the subtree instead of re-rendering the
    // crashed instances in place (their internal state may be corrupt).
    return <React.Fragment key={this.state.resetNonce}>{this.props.children}</React.Fragment>;
  }
}

/**
 * SchemaForm `renderFieldWrapper` bridge — one boundary per rendered field.
 * Stable module-level function so SchemaForm consumers can pass it directly
 * without memoization.
 *
 * LC-71: the shell is an anchor, not a second ring. It mounts the composite
 * ring stylesheet so catalog fields ring the control box (never the inner
 * native field) and exposes `form-field-${name}` for desk Jump-to-field.
 */
const FieldFocusShell = ({ field, children }: { field: FieldSchema; children: ReactNode }) => {
  useEffect(() => {
    ensureCompositeFocusRing();
  }, []);
  return (
    <YStack
      id={`form-field-${field.name}`}
      nativeID={`form-field-${field.name}`}
      minWidth={0}
      testID={`form-field-${field.name}`}
      {...{ 'data-fieldname': field.name }}>
      {children}
    </YStack>
  );
};

export const wrapFieldWithErrorBoundary = (rendered: ReactNode, field: FieldSchema): ReactNode => (
  <FieldFocusShell field={field}>
    <FormErrorBoundary
      key={field.name}
      label={field.label}
      testID={`form-field-error-${field.name}`}>
      {rendered}
    </FormErrorBoundary>
  </FieldFocusShell>
);
