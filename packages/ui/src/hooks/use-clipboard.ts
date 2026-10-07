import { writeToClipboard } from '@repo/platform';
import { useEffect, useState } from 'react';
import { useEvent } from 'tamagui';

export const copyToClipboard = async (text: string) => await writeToClipboard(text);

/** Anything with a `type` (DOM, React or RN events): `onCopy` may be bound straight to a press handler. */
interface CopyTriggerEvent {
  type: string;
}

const isTriggerEvent = (arg: string | CopyTriggerEvent | undefined): arg is CopyTriggerEvent | undefined =>
  typeof arg === 'object' || arg === undefined;

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
export const useClipboard = (text = '', options?: UseClipboardOptions) => {
  const timeout = options?.timeout ?? 1500;
  const [hasCopied, setHasCopied] = useState(false);
  const [hasCopyFailed, setHasCopyFailed] = useState(false);

  const onCopy = useEvent(async (overrideText?: string | CopyTriggerEvent) => {
    const textToCopy = isTriggerEvent(overrideText) ? text : overrideText;
    let success: boolean;
    try {
      success = await copyToClipboard(textToCopy);
    } catch {
      // Safe to continue: a denied/failed write is reported through hasCopyFailed.
      success = false;
    }
    setHasCopied(success);
    setHasCopyFailed(!success);
    return success;
  });

  useEffect(() => {
    if (!hasCopied && !hasCopyFailed) {
      return () => {
        // nothing scheduled
      };
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
};
