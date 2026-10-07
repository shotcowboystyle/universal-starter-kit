import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import type { MDXComponents } from 'mdx/types';
import { YStack } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCompileAndEvaluateMdx } from '../hooks';

import { MDX } from './index';

const DummyComponent = ({ components }: { components: MDXComponents }) => (
  <YStack data-testid="dummy">{JSON.stringify(components)}</YStack>
);
vi.mock(import('../hooks'), () => ({
  useCompileAndEvaluateMdx: vi.fn(),
}));
vi.mock(import('@mdx-js/react'), () => ({
  useMDXComponents: () => ({ hookKey: 'hookValue' }),
}));
vi.mock(import('../mdxComponents'), () => ({
  mdxComponents: { mdxKey: 'mdxValue' },
}));

describe('MDX component', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders an empty fragment if no component is returned from the hook', () => {
    (useCompileAndEvaluateMdx as any).mockReturnValue({
      Component: null,
      code: 'some code',
      frontmatter: { test: 'frontmatter' },
    });
    renderWithProviders(
      <>
        <MDX children="hello" />
      </>,
    );
    // When Component is null, no MDX content should be rendered
    const mdxContent = screen.queryByText('hello');
    expect(mdxContent).toBeNull();
  });

  it('renders the evaluated MDX component and passes the merged components prop', () => {
    const TestDummyComponent = ({ components }: { components: MDXComponents }) => {
      // Check if components are properly merged by checking keys
      const componentKeys = Object.keys(components || {});
      return <YStack data-testid="dummy">{componentKeys.join(',')}</YStack>;
    };

    (useCompileAndEvaluateMdx as any).mockReturnValue({
      Component: TestDummyComponent,
      code: 'compiledCode',
      frontmatter: { test: true },
    });
    const additionalComponents = {
      p: ({ children }: any) => <div data-testid="custom-p">{children}</div>,
    };
    renderWithProviders(
      <>
        <MDX
          children="hello"
          components={additionalComponents}
        />
      </>,
    );
    const dummyDiv = screen.getByTestId('dummy');
    const componentKeys = dummyDiv.textContent?.split(',') || [];
    expect(componentKeys).toContain('mdxKey');
    expect(componentKeys).toContain('hookKey');
    expect(componentKeys).toContain('p');
  });

  it('calls debug logging when the debug prop is provided', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    (useCompileAndEvaluateMdx as any).mockReturnValue({
      Component: DummyComponent,
      code: 'compiledCode',
      frontmatter: { test: 'frontmatter' },
    });
    renderWithProviders(
      <>
        <MDX
          children="hello"
          debug={true}
        />
      </>,
    );
    expect(debugSpy).toHaveBeenCalledWith('MDX', {
      frontmatter: { test: 'frontmatter' },
    });
    expect(debugSpy).toHaveBeenCalledWith('compiledCode');
    debugSpy.mockRestore();
  });

  it('does not call debug logging when the debug prop is false', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    (useCompileAndEvaluateMdx as any).mockReturnValue({
      Component: DummyComponent,
      code: 'compiledCode',
      frontmatter: { test: 'frontmatter' },
    });
    renderWithProviders(
      <>
        <MDX
          children="hello"
          debug={false}
        />
      </>,
    );
    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('does not throw an error when an empty children string is provided', () => {
    (useCompileAndEvaluateMdx as any).mockReturnValue({
      Component: DummyComponent,
      code: '',
      frontmatter: {},
    });
    expect(() =>
      renderWithProviders(
        <>
          <MDX children="hello" />
        </>,
      ),
    ).not.toThrow();
  });
});
