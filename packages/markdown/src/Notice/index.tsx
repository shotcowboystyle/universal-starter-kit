import { Alert, unwrapText } from '@repo/ui';
import type { AlertIntent } from '@repo/ui';
import type { ReactNode } from 'react';

type NoticeTheme = 'yellow' | 'blue' | 'green' | 'red';

const themeIntentMap: Record<NoticeTheme, AlertIntent> = {
  yellow: 'warning',
  blue: 'info',
  green: 'success',
  red: 'error',
};

export interface NoticeProps {
  children: ReactNode;
  theme?: NoticeTheme;
  disableUnwrap?: boolean;
  title?: string;
}

/** Markdown-facing callout: a thin wrapper mapping Notice themes onto Alert intents. */
export function Notice({
  children,
  theme = 'yellow',
  disableUnwrap,
  title,
  ...props
}: NoticeProps & Record<string, unknown>) {
  const content = disableUnwrap ? children : unwrapText(children);
  return (
    <Alert
      intent={themeIntentMap[theme]}
      title={title}
      marginVertical="$4"
      {...props}>
      {content}
    </Alert>
  );
}
