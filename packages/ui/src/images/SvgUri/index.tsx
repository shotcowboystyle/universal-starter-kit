import { useEffect, useRef, useState } from 'react';
import { getVariable, useTheme } from 'tamagui';

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
  const [error, setError] = useState(false);
  const [, setLoaded] = useState(false);

  useEffect(() => {
    if (!uri) {
      setLoaded(false);
      return;
    }

    const controller = new AbortController();

    (uri.startsWith('data:')
      ? Promise.resolve(decodeDataUri(uri))
      : fetch(uri, { signal: controller.signal }).then(async (res) => {
          if (!res.ok) {
            throw new Error(`Failed to fetch SVG: ${res.status}`);
          }
          return await res.text();
        })
    )
      .then((text) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (!svgEl) {
          throw new Error('No SVG element found in response');
        }

        for (const script of Array.from(svgEl.querySelectorAll('script'))) {
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
        if (preserveAspectRatio) {
          svgEl.setAttribute('preserveAspectRatio', preserveAspectRatio);
        }
        if (accessibilityLabel) {
          svgEl.setAttribute('role', 'img');
          svgEl.setAttribute('aria-label', accessibilityLabel);
        }

        if (containerRef.current) {
          containerRef.current.innerHTML = svgEl.outerHTML;
        }

        setError(false);
        setLoaded(true);
        onLoad?.();
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          return;
        }
        setError(true);
        onError?.(err);
      });

    return () => {
      controller.abort();
    };
  }, [uri, width, height, preserveAspectRatio, accessibilityLabel]);

  const color = getVariable(useTheme().color);

  if (!uri) {
    return null;
  }
  if (error) {
    return fallback ?? null;
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'inline-block',
        width: width == null ? undefined : width,
        height: height == null ? undefined : height,
        lineHeight: 0,
        color: color || undefined,
      }}
    />
  );
};

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
