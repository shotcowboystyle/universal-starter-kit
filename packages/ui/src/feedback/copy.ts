import { useCallback, useEffect, useId, useRef } from 'react';

/**
 * Copy confirm channel. Success is a page toast; errors
 * never toast. The glyph does not flip — notify() is the one confirm.
 */
import { copyToClipboard } from '../hooks/useClipboard';

import { notify } from './notify';
import { dismissFeedbackByRegion } from './store';

export const COPY_OK = 'Copied to clipboard.';
export const COPY_FAIL = 'Copy failed.';

export function reportCopy(ok: boolean, options?: { region?: string }): void {
  const region = options?.region;
  if (region != null) {
    dismissFeedbackByRegion(region);
  }
  if (ok) {
    notify({ severity: 'success', scope: 'page', body: COPY_OK });
    return;
  }
  notify({ severity: 'error', scope: 'field', region, body: COPY_FAIL });
}

export async function copyAndNotify(text: string, options?: { region?: string }): Promise<boolean> {
  const ok = await copyToClipboard(text).catch(() => false);
  reportCopy(ok, options);
  return ok;
}

/** Keeps copy failures beside their owner, including asynchronous clipboard results. */
export function useCopyFeedback() {
  const region = useId();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dismissFeedbackByRegion(region);
    };
  }, [region]);
  const report = useCallback(
    (ok: boolean) => {
      if (mounted.current) {
        reportCopy(ok, { region });
      }
    },
    [region],
  );
  const copy = useCallback(
    async (text: string) => {
      const ok = await copyToClipboard(text).catch(() => false);
      report(ok);
      return ok;
    },
    [report],
  );
  return { region, report, copy };
}
