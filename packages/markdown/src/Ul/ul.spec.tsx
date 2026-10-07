import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { Text } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { LI } from '../Li';

import { UL } from './index';

describe('UL Component', () => {
  it.skip('should render successfully', () => {
    const { container } = renderWithProviders(
      <UL>
        <LI>Item 1</LI>
        <LI>Item 2</LI>
      </UL>,
    );
    const ulElement = container.querySelector('ul');
    expect(ulElement).toBeDefined();
    expect(ulElement?.children.length).toBe(2);
  });

  it.skip('should dynamically apply styles when changed', () => {
    const { container, rerender } = renderWithProviders(
      <UL>
        <LI>Item 1</LI>
        <LI>Item 2</LI>
      </UL>,
    );
    let ulElement = container.querySelector('ul');
    let computedStyle = window.getComputedStyle(ulElement);
    expect(computedStyle.marginTop).toBe('var(--t-space-1)');
    expect(computedStyle.marginLeft).toBe('var(--t-space-4)');
    rerender(
      <UL>
        <LI>Updated Item 1</LI>
        <LI>Updated Item 2</LI>
        <LI>New Item 3</LI>
      </UL>,
    );
    ulElement = container.querySelector('ul');
    computedStyle = window.getComputedStyle(ulElement);
    expect(ulElement?.children.length).toBe(3);
    expect(ulElement?.children[0].textContent).toContain('Updated Item 1');
    expect(ulElement?.children[1].textContent).toContain('Updated Item 2');
    expect(ulElement?.children[2].textContent).toContain('New Item 3');
    expect(computedStyle.marginTop).toBe('var(--t-space-1)');
    expect(computedStyle.marginLeft).toBe('var(--t-space-4)');
  });

  it.skip('should dynamically handle nested list items', () => {
    const { container, rerender } = renderWithProviders(
      <UL>
        <LI>Item 1</LI>
        <LI>
          Item 2
          <UL>
            <LI>Subitem 1</LI>
            <LI>Subitem 2</LI>
          </UL>
        </LI>
      </UL>,
    );
    let ulElement = container.querySelectorAll('ul');
    expect(ulElement).toHaveLength(2);
    rerender(
      <UL>
        <LI>Item 1</LI>
        <LI>
          Item 2
          <UL>
            <LI>Updated Subitem 1</LI>
            <LI>Updated Subitem 2</LI>
            <LI>New Subitem 3</LI>
          </UL>
        </LI>
      </UL>,
    );
    ulElement = container.querySelectorAll('ul');
    expect(ulElement).toHaveLength(2);
    const nestedUL = ulElement[1];
    expect(nestedUL?.children.length).toBe(3);
    expect(nestedUL?.children[0].textContent).toContain('Updated Subitem 1');
    expect(nestedUL?.children[1].textContent).toContain('Updated Subitem 2');
    expect(nestedUL?.children[2].textContent).toContain('New Subitem 3');
  });

  describe('edge cases', () => {
    it.skip('should handle empty content dynamically', () => {
      const { container, rerender } = renderWithProviders(<UL />);
      let ulElement = container.querySelector('ul');
      expect(ulElement).toBeDefined();
      expect(ulElement?.children.length).toBe(0);
      rerender(
        <UL>
          <LI>Item 1</LI>
          <LI>Item 2</LI>
        </UL>,
      );
      ulElement = container.querySelector('ul');
      expect(ulElement?.children.length).toBe(2);
    });

    it.skip('should handle dynamic updates for list items with special characters', () => {
      const { rerender } = renderWithProviders(
        <UL>
          <LI>Item &amp; More</LI>
          <LI>
            Item with <Text>bold</Text> text
          </LI>
        </UL>,
      );
      let ulElement = screen.getByRole('list');
      const liElements = ulElement.querySelectorAll('li');
      expect(liElements).toHaveLength(2);
      expect(liElements[0].textContent).toContain('Item & More');
      expect(liElements[1].textContent).toBe('Item with bold text');
      rerender(
        <UL>
          <LI>Updated Item &amp; More</LI>
          <LI>
            New Item with <Text>italic</Text> text
          </LI>
        </UL>,
      );
      ulElement = screen.getByRole('list');
      const updatedLiElements = ulElement.querySelectorAll('li');
      expect(updatedLiElements).toHaveLength(2);
      expect(updatedLiElements[0].textContent).toContain('Updated Item & More');
      expect(updatedLiElements[1].textContent).toBe('New Item with italic text');
    });
  });
});
