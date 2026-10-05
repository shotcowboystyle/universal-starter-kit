import { useEffect, useState } from 'react';

function readScale(): string[] | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const style = getComputedStyle(document.documentElement);
  const out: string[] = [];
  for (let i = 1; i <= 12; i++) {
    let c = style.getPropertyValue(`--color${i}`).trim();
    if (!c) {
      c = style.getPropertyValue(`--color-${i}`).trim();
    }
    if (!c) {
      return null;
    }
    out.push(c);
  }
  return out;
}

/**
 * Returns the current theme's 12 color values read from CSS custom
 * properties (--color1 … --color12). Returns null on the server or
 * when the variables aren't available.
 */
export function useColorScale(): string[] | null {
  const [scale, setScale] = useState<string[] | null>(() => readScale());

  useEffect(() => {
    setScale(readScale());
  }, []);

  return scale;
}
