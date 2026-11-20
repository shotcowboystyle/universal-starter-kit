/**
 * <Markdown> component specs — the string-in, UI-out entry point. Locks down:
 * string children parse + render, non-string children render nothing instead
 * of crashing, and custom components reach the renderer.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Text, View } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { Markdown } from './Markdown';

describe(Markdown, () => {
  it('parses and renders a markdown string', () => {
    const { container } = renderWithProviders(<Markdown>{'# Hello\n\nSome **bold** text.'}</Markdown>);
    expect(container.querySelector('h1')?.textContent).toBe('Hello');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
  });

  it('renders nothing (no crash) for non-string children', () => {
    // Consumers sometimes pass elements by mistake; cast to exercise that path.
    const notMarkdown = (
      <View>
        <Text>not markdown</Text>
      </View>
    ) as unknown as string;
    const { container } = renderWithProviders(<Markdown>{notMarkdown}</Markdown>);
    expect(container.textContent).not.toContain('not markdown');
  });

  it('renders nothing for empty children', () => {
    const emptyMarkdown = '';
    const { container } = renderWithProviders(<Markdown>{emptyMarkdown}</Markdown>);
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('p')).toBeNull();
  });

  it('threads custom components through to the renderer', () => {
    const { getByTestId } = renderWithProviders(
      <Markdown
        components={{
          h1: ({ children }) => <Text data-testid="branded-h1">{children}</Text>,
        }}>
        # Branded
      </Markdown>,
    );
    expect(getByTestId('branded-h1').textContent).toBe('Branded');
  });

  it('spreads extra view props onto the wrapper', () => {
    const { getByTestId } = renderWithProviders(<Markdown data-testid="md-root">content</Markdown>);
    expect(getByTestId('md-root')).toBeTruthy();
    expect(getByTestId('md-root').textContent).toContain('content');
  });
});
