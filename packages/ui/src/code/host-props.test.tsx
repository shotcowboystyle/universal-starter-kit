import { renderWithProviders } from '@repo/test-utils';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Code, CodeInline } from './Code';
import { HighlightedCode } from './HighlightedCode';
import type { HighlightLine } from './Highlighter';

const tokens: HighlightLine[] = [[{ content: 'const x = 1;' }]];

const cases: [string, ReactElement][] = [
  ['Code', <Code key="Code">const x = 1;</Code>],
  ['CodeInline', <CodeInline key="CodeInline">npm install</CodeInline>],
  [
    'HighlightedCode',
    <HighlightedCode
      key="HighlightedCode"
      tokens={tokens}
    />,
  ],
];

interface HostProps {
  'data-code-font'?: string;
}

const hostProps = (el: Element): HostProps => {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (key === undefined) {
    return {};
  }
  // SAFETY: React stores a host element's props object under its `__reactProps$<id>` expando key.
  return (el as Element & Record<string, HostProps>)[key] ?? {};
};

const formatConsoleCall = (args: unknown[]): string => {
  const [format = '', ...substitutions] = args.map(String);
  return format.replaceAll('%s', () => substitutions.shift() ?? '');
};

describe.each(['web', 'native'])('code family host props, TAMAGUI_TARGET=%s', (target) => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(cases)('%s hands the code-font node no dataset prop map', (_name, node) => {
    vi.stubEnv('TAMAGUI_TARGET', target);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { container } = renderWithProviders(node);
      const hosts = [...container.querySelectorAll('[data-code-font]')];
      expect(hosts.length).toBeGreaterThan(0);
      for (const host of hosts) {
        const props = hostProps(host);
        expect(props['data-code-font']).toBe('mono');
        expect(Object.keys(props).filter((key) => key.toLowerCase() === 'dataset')).toStrictEqual([]);
        expect(host.hasAttribute('dataset')).toBe(false);
      }
      // React warns once per prop name per process, so the console alone
      // cannot prove a later case clean; the props check above can.
      const unknownProps = errorSpy.mock.calls
        .map(formatConsoleCall)
        .filter((message) => /does not recognize the `\w+` prop on a DOM element/u.test(message));
      expect(unknownProps).toStrictEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
