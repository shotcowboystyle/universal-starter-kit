import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { LI as ListItem } from './index';

describe('LI Component', () => {
  it('should render without errors', () => {
    const { getByText } = renderWithProviders(<ListItem>This is a list item</ListItem>);
    expect(getByText('This is a list item')).toBeDefined();
  });

  it('should have the correct tag', () => {
    const { container } = renderWithProviders(<ListItem>This is a list item</ListItem>);
    // Tamagui may render as li or as a styled element; ensure list content is present
    expect(container.textContent).toContain('This is a list item');
    expect(container.querySelector('li')).not.toBeNull();
  });

  it('should render dynamic content correctly', () => {
    const { getByText } = renderWithProviders(<ListItem>Another list item</ListItem>);
    expect(getByText('Another list item')).toBeDefined();
  });

  it('should have display: list-item', () => {
    const { container } = renderWithProviders(<ListItem>This is a list item</ListItem>);
    expect(container.textContent).toContain('This is a list item');
    const listItem = container.querySelector('li');
    expect(listItem).not.toBeNull();
    expect(window.getComputedStyle(listItem!).display).toBe('list-item');
  });
});
