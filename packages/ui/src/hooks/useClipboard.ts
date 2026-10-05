import { writeToClipboard } from '@repo/platform';
import { useEffect, useState } from 'react';
import { useEvent } from 'tamagui';

export const copyToClipboard = (text: string) => {
  return writeToClipboard(text);
};

export interface UseClipboardOptions {
  timeout?: number;
}

/**
 * Hook for copying text to the clipboard with "copied" / "copy failed" state indicators.
 *
 * @param text - Default text to copy
 * @param options - `timeout` in ms before `hasCopied` / `hasCopyFailed` reset (default 1500)
 * @returns `{ value, onCopy, hasCopied, hasCopyFailed }`
 *
 * `onCopy` accepts an optional string argument to override the default text and
 * resolves to whether the clipboard write succeeded. `hasCopied` only becomes
 * true when the write actually resolved successfully; a rejected/denied write
 * sets `hasCopyFailed` instead.
 */
export function useClipboard(text = '', options?: UseClipboardOptions) {
  const timeout = options?.timeout ?? 1500;
  const [hasCopied, setHasCopied] = useState(false);
  const [hasCopyFailed, setHasCopyFailed] = useState(false);

  const onCopy = useEvent(async (overrideText?: string | unknown) => {
    const textToCopy = typeof overrideText === 'string' ? overrideText : text;
    const success = await copyToClipboard(textToCopy).catch(() => false);
    setHasCopied(success);
    setHasCopyFailed(!success);
    return success;
  });

  useEffect(() => {
    if (!hasCopied && !hasCopyFailed) {
      return;
    }
    const id = setTimeout(() => {
      setHasCopied(false);
      setHasCopyFailed(false);
    }, timeout);
    return () => {
      clearTimeout(id);
    };
  }, [timeout, hasCopied, hasCopyFailed]);

  return { value: text, onCopy, hasCopied, hasCopyFailed };
}
