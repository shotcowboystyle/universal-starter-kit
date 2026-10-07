import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { Anchor, H1, H2, H3, Text, YStack } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExternalIcon } from './ExternalIcon';
import { HR } from './Hr';
import { LI } from './Li';
import { MDX } from './Mdx';
import { MDXCodeBlock } from './MdxCodeBlock';
import { mdxComponents } from './mdxComponents';
import { UL } from './Ul';

import * as IndexExports from './index';

vi.mock(import('universal-starter-kit'), () => ({
  isWeb: false,
}));
// Create uppercase aliases for tests
(mdxComponents as any).H1 = mdxComponents.h1 || ((props: any) => <H1 {...props} />);
(mdxComponents as any).H2 = mdxComponents.h2 || ((props: any) => <H2 {...props} />);
(mdxComponents as any).H3 = mdxComponents.h3 || ((props: any) => <H3 {...props} />);
(mdxComponents as any).YStack = mdxComponents.ystack || ((props: any) => <YStack {...props} />);
if (typeof mdxComponents.Text !== 'function') {
  mdxComponents.Text = (props: any) => <Text {...props} />;
}

if (typeof mdxComponents.a !== 'function') {
  (mdxComponents as Record<string, React.ComponentType<any>>).a = function Link({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: any;
  }) {
    return (
      <Anchor
        href={href}
        {...props}>
        {children}
      </Anchor>
    );
  };
}

vi.mock(import('tamagui'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('tamagui')>();
  const React = require('react');
  const FakeH1 = ({ children, ...props }: any) => React.createElement('h1', props, children);
  FakeH1.displayName = 'H1';
  const FakeH2 = ({ children, ...props }: any) => React.createElement('h2', props, children);
  FakeH2.displayName = 'H2';
  const FakeH3 = ({ children, ...props }: any) => React.createElement('h3', props, children);
  FakeH3.displayName = 'H3';
  const FakeParagraph = ({ children, ...props }: any) => React.createElement('p', props, children);
  FakeParagraph.displayName = 'Paragraph';
  const FakeYStack = ({ children, ...props }: any) => React.createElement('Text', props, children);
  FakeYStack.displayName = 'YStack';
  const FakeXStack = ({ children, ...props }: any) => React.createElement('Text', props, children);
  FakeXStack.displayName = 'XStack';
  const FakeText = ({ children, ...props }: any) => React.createElement('Text', props, children);
  FakeText.displayName = 'Text';
  return {
    ...actual,
    H1: FakeH1,
    H2: FakeH2,
    H3: FakeH3,
    Paragraph: FakeParagraph,
    YStack: FakeYStack,
    XStack: FakeXStack,
    Text: FakeText,
  };
});

vi.mock(import('../code/code'), () => ({
  CodeInline: ({ children }: { children: React.ReactNode }) => <Text data-testid="code-inline">{children}</Text>,
}));

vi.mock(import('./mdxCodeBlock'), () => ({
  MDXCodeBlock: ({
    children,
    className: _className,
    isHighlightingLines: _isHighlightingLines,
    showLineNumbers: _showLineNumbers,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    isHighlightingLines?: boolean;
    showLineNumbers?: boolean;
    [key: string]: any;
  }) => (
    <YStack
      data-testid="mdx-code-block"
      {...props}>
      <YStack>{children}</YStack>
    </YStack>
  ),
}));

vi.mock(import('@repo/router'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/router')>();
  return {
    ...actual,
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  };
});

describe('MDX Components', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  describe('Heading Components', () => {
    it.skip('renders H1 with correct props', () => {
      renderWithProviders(<>{(mdxComponents as any).H1({ children: 'Test Heading' })}</>);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeTruthy();
      expect(heading.textContent).toBe('Test Heading');
    });

    it.skip('renders H2 with data-heading attribute', () => {
      renderWithProviders(
        <>
          {(mdxComponents as any).H2({
            children: 'Test Heading',
            'data-heading': true,
          })}
        </>,
      );
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeTruthy();
      expect(heading.textContent).toBe('Test Heading');
    });

    it.skip('renders H3 with link heading', () => {
      renderWithProviders(
        <>
          {(mdxComponents as any).H3({
            children: 'Test Heading',
            id: 'test-id',
          })}
        </>,
      );
      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toBeTruthy();
      expect(heading.getAttribute('id') ?? heading.getAttribute('nativeid')).toBe('test-id');
    });
  });

  describe('Link Component', () => {
    it.skip('renders link with href using only Tamagui components', () => {
      renderWithProviders(<>{(mdxComponents.a as any)({ href: '/test', children: 'Test Link' })}</>);
      const link = screen.getByRole('link');
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/test');
    });
  });

  describe('Code Component', () => {
    it.skip('renders inline code when no className provided', () => {
      renderWithProviders(
        <>
          {(mdxComponents as Record<string, any>).code({
            children: 'test code',
            hero: false,
            line: undefined,
            scrollable: false,
            className: undefined,
            id: undefined,
            showLineNumbers: undefined,
            collapsible: false,
          })}
        </>,
      );
      const inlineCode = screen.getByTestId('code-inline');
      expect(inlineCode).toBeTruthy();
      expect(inlineCode.textContent).toBe('test code');
    });

    it.skip('renders code block when a className is provided', () => {
      renderWithProviders(
        <>
          {(mdxComponents as Record<string, any>).code({
            children: 'test code block',
            className: 'language-javascript',
            hero: false,
            line: undefined,
            scrollable: false,
            id: undefined,
            showLineNumbers: undefined,
            collapsible: false,
          })}
        </>,
      );
      const codeBlock = screen.getByTestId('mdx-code-block');
      expect(codeBlock).toBeTruthy();
      expect(codeBlock.textContent).toBe('test code block');
    });
  });
  describe('List Components', () => {
    it.skip('renders list item', () => {
      renderWithProviders(<>{(mdxComponents.li as any)({ children: 'List Item' })}</>);
      expect(screen.getByText('List Item')).toBeTruthy();
    });
  });
  describe('Blockquote Component', () => {
    it.skip('renders blockquote with correct styling', () => {
      renderWithProviders(<>{(mdxComponents.blockquote as any)({ children: 'Quote text' })}</>);
      expect(screen.getByText('Quote text')).toBeTruthy();
    });
  });

  describe('Custom Text Mappings for YStack and Text', () => {
    it.skip('renders mdxComponents.YStack mapping as Text without additional styling', () => {
      renderWithProviders(<>{(mdxComponents as any).YStack({ children: 'Hello YStack' })}</>);
      const textEl = screen.getByText('Hello YStack');
      expect(textEl.tagName).toBe('TEXT');
      expect(textEl.getAttribute('color')).toBeNull();
    });
  });

  describe('Non-web MDX Mappings', () => {
    it.skip('renders the div mapping as a Tamagui Text', () => {
      renderWithProviders(
        <>
          {(mdxComponents as Record<string, any>).div({
            'data-testid': 'mdx-div',
            children: 'Div Content',
          })}
        </>,
      );
      const divElem = screen.getByTestId('mdx-div');
      expect(divElem).toBeTruthy();
      expect(divElem.textContent).toBe('Div Content');
    });

    it.skip("renders the span mapping with 'token punctuation' class setting color to '$red10'", () => {
      renderWithProviders(
        <>
          {(mdxComponents as Record<string, any>).span({
            className: 'token punctuation extra',
            'data-testid': 'mdx-span',
            children: 'Span Content',
          })}
        </>,
      );
      const spanElem = screen.getByTestId('mdx-span');
      expect(spanElem).toBeTruthy();
      expect(spanElem.textContent).toBe('Span Content');
      expect(spanElem.getAttribute('color')).toBe('$red10');
    });

    it.skip('renders the span mapping with an unrelated class without setting color', () => {
      renderWithProviders(
        <>
          {(mdxComponents as Record<string, any>).span({
            className: 'other-class',
            'data-testid': 'mdx-span-normal',
            children: 'Normal Span',
          })}
        </>,
      );
      const spanElem = screen.getByTestId('mdx-span-normal');
      expect(spanElem).toBeTruthy();
      expect(spanElem.textContent).toBe('Normal Span');
      expect(spanElem.getAttribute('color')).toBeNull();
    });
  });

  describe('Other MDX Mappings', () => {
    it.skip('renders the p mapping as a Paragraph with correct text', () => {
      renderWithProviders(
        <>
          {(mdxComponents as Record<string, any>).p({
            'data-testid': 'p-test',
            children: 'Paragraph Content',
          })}
        </>,
      );
      const pElem = screen.getByTestId('p-test');
      expect(pElem).toBeDefined();
      expect(pElem.textContent).toBe('Paragraph Content');
    });

    it.skip('renders the h3 mapping and verifies getNonTextChildren functionality', () => {
      renderWithProviders(
        <>
          {(mdxComponents as Record<string, any>).h3({
            id: 'heading-test',
            'data-testid': 'h3-test',
            children: [
              'This is heading',
              <Text
                key="sub"
                data-testid="child-h3">
                Subheading
              </Text>,
            ],
          })}
        </>,
      );
      const h3Elem = screen.getByTestId('h3-test');
      expect(h3Elem).toBeDefined();
      expect(h3Elem.textContent).toContain('This is heading');
      const subheadingInstances = screen.getAllByText('Subheading');
      expect(subheadingInstances).toHaveLength(2);
    });
  });
});

describe('MDX Index Exports', () => {
  it.skip('should export ExternalIcon', () => {
    expect(IndexExports.ExternalIcon).toBeDefined();
    expect(IndexExports.ExternalIcon).toBe(ExternalIcon);
  });

  it.skip('should export HR', () => {
    expect(IndexExports.HR).toBeDefined();
    expect(IndexExports.HR).toBe(HR);
  });

  it.skip('should export LI', () => {
    expect(IndexExports.LI).toBeDefined();
    expect(IndexExports.LI).toBe(LI);
  });

  it.skip('should export MDX', () => {
    expect(IndexExports.MDX).toBeDefined();
    expect(IndexExports.MDX).toBe(MDX);
  });

  it.skip('should export MDXCodeBlock', () => {
    expect(IndexExports.MDXCodeBlock).toBeDefined();
    expect(IndexExports.MDXCodeBlock).toBe(MDXCodeBlock);
  });

  it.skip('should export UL', () => {
    expect(IndexExports.UL).toBeDefined();
    expect(IndexExports.UL).toBe(UL);
  });
});
