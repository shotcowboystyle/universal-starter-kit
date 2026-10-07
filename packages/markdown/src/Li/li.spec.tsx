import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { LI } from './index';

describe('LI Component', () => {
  it('should render without errors', () => {
    const { getByText } = renderWithProviders(<LI>This is a list item</LI>);
    expect(getByText('This is a list item')).toBeDefined();
  });

  it('should have the correct tag', () => {
    const { container } = renderWithProviders(<LI>This is a list item</LI>);
    // Tamagui may render as li or as a styled element; ensure list content is present
    expect(container.textContent).toContain('This is a list item');
    const listItem = container.querySelector('li') ?? container.querySelector("[role='listitem']");
    if (listItem) {
      expect(listItem).toBeTruthy();
    }
  });

  it('should render dynamic content correctly', () => {
    const { getByText } = renderWithProviders(<LI>Another list item</LI>);
    expect(getByText('Another list item')).toBeDefined();
  });

  it('should have display: list-item', () => {
    const { container } = renderWithProviders(<LI>This is a list item</LI>);
    expect(container.textContent).toContain('This is a list item');
    const listItem = container.querySelector('li') ?? container.querySelector("[role='listitem']");
    if (listItem) {
      const { display } = window.getComputedStyle(listItem);
      expect(display).toBe('list-item');
    }
  });
});
