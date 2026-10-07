import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { getVariable, useTheme } from 'tamagui';

import { isString } from '../Image/shared';

const decodeDataUri = (uri: string): string => {
  const commaIndex = uri.indexOf(',');
  if (commaIndex === -1) {
    return '';
  }
  const meta = uri.slice(0, commaIndex);
  const data = uri.slice(commaIndex + 1);
  if (meta.includes('base64')) {
    return atob(data);
  }
  return decodeURIComponent(data);
};

const fetchSvgText = async (uri: string, signal: AbortSignal): Promise<string> => {
  if (uri.startsWith('data:')) {
    return decodeDataUri(uri);
  }
  const res = await fetch(uri, { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch SVG: ${res.status}`);
  }
  return await res.text();
};

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

const parseSvg = (text: string, { width, height, preserveAspectRatio, accessibilityLabel }: SvgAttributes): Element => {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) {
    throw new Error('No SVG element found in response');
  }

  for (const script of svgEl.querySelectorAll('script')) {
    script.remove();
  }
  svgEl.removeAttribute('onload');
  svgEl.removeAttribute('onerror');

  if (width != null) {
    svgEl.setAttribute('width', String(width));
  }
  if (height != null) {
    svgEl.setAttribute('height', String(height));
  }
  if (hasText(preserveAspectRatio)) {
    svgEl.setAttribute('preserveAspectRatio', preserveAspectRatio);
  }
  if (hasText(accessibilityLabel)) {
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('aria-label', accessibilityLabel);
  }
  return svgEl;
};

export const SvgUri = ({
  uri,
  width,
  height,
  preserveAspectRatio,
  onError,
  onLoad,
  fallback,
  accessibilityLabel,
}: SvgUriProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);

  const emitLoad = useEffectEvent(() => {
    onLoad?.();
  });
  const emitError = useEffectEvent((failure: Error) => {
    onError?.(failure);
  });

  // oxlint-disable-next-line react-doctor/no-fetch-in-effect -- SvgUri is the data layer for a single remote SVG: it aborts on cleanup and ignores AbortError, so there is no race or leak
  useEffect(() => {
    const controller = new AbortController();

    const load = async (source: string) => {
      try {
        const text = await fetchSvgText(source, controller.signal);
        const svgEl = parseSvg(text, { width, height, preserveAspectRatio, accessibilityLabel });
        containerRef.current?.replaceChildren(document.importNode(svgEl, true));
        setHasError(false);
        emitLoad();
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        setHasError(true);
        emitError(error instanceof Error ? error : new Error(String(error)));
      }
    };

    if (uri !== null && uri !== '') {
      void load(uri);
    }

    return () => {
      controller.abort();
    };
  }, [uri, width, height, preserveAspectRatio, accessibilityLabel]);

  const color: unknown = getVariable(useTheme().color);

  if (uri === null || uri === '') {
    return null;
  }
  if (hasError) {
    return fallback ?? null;
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'inline-block',
        width: width ?? undefined,
        height: height ?? undefined,
        lineHeight: 0,
        color: isString(color) && color !== '' ? color : undefined,
      }}
    />
  );
};

interface SvgAttributes {
  width?: number | string;
  height?: number | string;
  preserveAspectRatio?: string;
  accessibilityLabel?: string;
}

export interface SvgUriProps {
  uri: string | null;
  width?: number | string;
  height?: number | string;
  preserveAspectRatio?: string;
  accessibilityLabel?: string;
  onError?: (error: Error) => void;
  onLoad?: () => void;
  fallback?: React.JSX.Element;
}
