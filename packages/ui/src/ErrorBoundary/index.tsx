import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { Text } from 'tamagui';

import { Button } from '../Button';
import { EmptyState } from '../layouts/EmptyState';
import { useTranslation } from '../shared/i18n';

const logger = console;

export interface ErrorBoundaryProps {
  children?: ReactNode;
  /** When true, renders nothing on error instead of the default error message UI */
  noMessage?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

const ErrorFallback = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation();
  // Retry is an inline action label — weight 400 on the TEXT NODE.
  const retryLabel = t('Try again?');
  return (
    <EmptyState
      intent="error"
      data-error-boundary=""
      title={t('Oops, there is an error!')}
      action={
        <Button onPress={onRetry}>
          <Text fontWeight="400">{retryLabel}</Text>
        </Button>
      }
    />
  );
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static getDerivedStateFromError(_err: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- React lifecycle hook; the signature is fixed by the framework and only reports to the logger
  componentDidCatch(err: Error, errorInfo: ErrorInfo) {
    logger.info({ error: err, errorInfo });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.noMessage) {
        return null;
      }
      return (
        <ErrorFallback
          onRetry={() => {
            // oxlint-disable-next-line react/no-set-state -- error boundaries must be class components; setState is the only way to clear the error and retry
            this.setState({ hasError: false });
          }}
        />
      );
    }
    return this.props.children;
  }
}
