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

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
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
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static getDerivedStateFromError(_err: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  state: ErrorBoundaryState = { hasError: false };

  componentDidCatch(err: Error, errorInfo: ErrorInfo) {
    logger.info({ error: err, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.noMessage) {
        return null;
      }
      return (
        <ErrorFallback
          onRetry={() => {
            this.setState({ hasError: false });
          }}
        />
      );
    }
    return this.props.children;
  }
}
