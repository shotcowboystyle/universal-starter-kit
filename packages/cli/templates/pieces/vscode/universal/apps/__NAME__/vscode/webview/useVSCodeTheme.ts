import { useEffect, useState } from 'react';

export type VSCodeScheme = 'light' | 'dark';

/**
 * Resolve the house theme scheme from the VS Code webview host.
 *
 * VS Code stamps the webview <body> with a theme class
 * (`vscode-light` | `vscode-dark` | `vscode-high-contrast`) and a
 * `data-vscode-theme-kind` attribute. Outside VS Code (browser harness, dev
 * preview) neither exists, so fall back to `prefers-color-scheme`.
 */
function readScheme(): VSCodeScheme {
  if (typeof document === 'undefined') {
    return 'light';
  }
  const { body } = document;
  const kind = body?.dataset?.vscodeThemeKind;
  if (kind) {
    return kind.includes('light') ? 'light' : 'dark';
  }
  if (body?.classList.contains('vscode-high-contrast-light')) {
    return 'light';
  }
  if (body?.classList.contains('vscode-light')) {
    return 'light';
  }
  if (body?.classList.contains('vscode-dark') || body?.classList.contains('vscode-high-contrast')) {
    return 'dark';
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Live VS Code theme scheme: VS Code mutates the body class/data attributes
 * in place when the user switches color themes, so a MutationObserver keeps
 * the scheme in sync without extension-host message plumbing.
 */
export function useVSCodeTheme(): VSCodeScheme {
  const [scheme, setScheme] = useState<VSCodeScheme>(readScheme);

  useEffect(() => {
    const update = () => setScheme(readScheme());
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-vscode-theme-kind'],
    });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener('change', update);
    return () => {
      observer.disconnect();
      mq?.removeEventListener('change', update);
    };
  }, []);

  return scheme;
}
