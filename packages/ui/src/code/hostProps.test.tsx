import { renderWithProviders } from '@repo/test-utils';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Code, CodeInline } from './Code';
import { HighlightedCode } from './HighlightedCode';
import type { HighlightLine } from './Highlighter';

const tokens: HighlightLine[] = [[{ content: 'const x = 1;' }]];

const cases: [string, ReactElement][] = [
  ['Code', <Code>const x = 1;</Code>],
  ['CodeInline', <CodeInline>npm install</CodeInline>],
  ['HighlightedCode', <HighlightedCode tokens={tokens} />],
];

function hostProps(el: Element): Record<string, unknown> {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  return key ? ((el as unknown as Record<string, Record<string, unknown>>)[key] ?? {}) : {};
}

function formatConsoleCall(args: unknown[]): string {
  const [format = '', ...substitutions] = args.map(String);
  let next = 0;
  return format.replace(/%s/g, () => substitutions[next++] ?? '');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(['web', 'native'])('code family host props, TAMAGUI_TARGET=%s', (target) => {
  it.each(cases)('%s hands the code-font node no dataset prop map', (_name, node) => {
    vi.stubEnv('TAMAGUI_TARGET', target);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { container } = renderWithProviders(node);
      const hosts = Array.from(container.querySelectorAll('[data-code-font]'));
      expect(hosts.length).toBeGreaterThan(0);
      for (const host of hosts) {
        const props = hostProps(host);
        expect(props['data-code-font']).toBe('mono');
        expect(Object.keys(props).filter((key) => key.toLowerCase() === 'dataset')).toEqual([]);
        expect(host.hasAttribute('dataset')).toBe(false);
      }
      // React warns once per prop name per process, so the console alone
      // cannot prove a later case clean; the props check above can.
      const unknownProps = errorSpy.mock.calls
        .map(formatConsoleCall)
        .filter((message) => /does not recognize the `\w+` prop on a DOM element/.test(message));
      expect(unknownProps).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
