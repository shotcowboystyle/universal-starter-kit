import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import type { MDXComponents } from 'mdx/types';
import type { ReactNode } from 'react';
import { YStack } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCompileAndEvaluateMdx } from '../hooks/use-compile-and-evaluate-mdx';

import { MDX as Mdx } from './index';

const DummyComponent = ({ components }: { components?: MDXComponents }) => (
  <YStack data-testid="dummy">{JSON.stringify(components)}</YStack>
);

// Lists the merged component keys so the test can check the merge.
const KeysComponent = ({ components }: { components?: MDXComponents }) => (
  <YStack data-testid="dummy">{Object.keys(components ?? {}).join(',')}</YStack>
);

const debugFrontmatter = { content: '', data: { test: 'frontmatter' } };

vi.mock<object>(import('../hooks/use-compile-and-evaluate-mdx'), () => ({
  useCompileAndEvaluateMdx: vi.fn<typeof useCompileAndEvaluateMdx>(),
}));
vi.mock<object>(import('@mdx-js/react'), () => ({
  useMDXComponents: () => ({ hookKey: 'hookValue' }),
}));
vi.mock<object>(import('../mdx-components'), () => ({
  mdxComponents: { mdxKey: 'mdxValue' },
}));

describe('MDX component', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing if no component is returned from the hook', () => {
    vi.mocked(useCompileAndEvaluateMdx).mockReturnValue({
      code: 'some code',
      frontmatter: debugFrontmatter,
    });
    renderWithProviders(<Mdx>hello</Mdx>);
    // When Component is missing, no MDX content should be rendered
    const mdxContent = screen.queryByText('hello');
    expect(mdxContent).toBeNull();
  });

  it('renders the evaluated MDX component and passes the merged components prop', () => {
    vi.mocked(useCompileAndEvaluateMdx).mockReturnValue({
      Component: KeysComponent,
      code: 'compiledCode',
      frontmatter: debugFrontmatter,
    });
    const additionalComponents = {
      p: ({ children }: { children?: ReactNode }) => <div data-testid="custom-p">{children}</div>,
    };
    renderWithProviders(<Mdx components={additionalComponents}>hello</Mdx>);
    const dummyDiv = screen.getByTestId('dummy');
    const componentKeys = dummyDiv.textContent?.split(',') ?? [];
    expect(componentKeys).toContain('mdxKey');
    expect(componentKeys).toContain('hookKey');
    expect(componentKeys).toContain('p');
  });

  it('calls debug logging when the debug prop is provided', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {
      // Silence the expected debug output.
    });
    vi.mocked(useCompileAndEvaluateMdx).mockReturnValue({
      Component: DummyComponent,
      code: 'compiledCode',
      frontmatter: debugFrontmatter,
    });
    renderWithProviders(<Mdx debug>hello</Mdx>);
    expect(debugSpy).toHaveBeenCalledWith('MDX', {
      frontmatter: debugFrontmatter,
    });
    expect(debugSpy).toHaveBeenCalledWith('compiledCode');
    debugSpy.mockRestore();
  });

  it('does not call debug logging when the debug prop is false', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {
      // Silence any unexpected debug output.
    });
    vi.mocked(useCompileAndEvaluateMdx).mockReturnValue({
      Component: DummyComponent,
      code: 'compiledCode',
      frontmatter: debugFrontmatter,
    });
    renderWithProviders(<Mdx debug={false}>hello</Mdx>);
    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('does not throw an error when an empty code string is returned', () => {
    vi.mocked(useCompileAndEvaluateMdx).mockReturnValue({
      Component: DummyComponent,
      code: '',
      frontmatter: { content: '', data: {} },
    });
    expect(() => renderWithProviders(<Mdx>hello</Mdx>)).not.toThrow();
  });
});
