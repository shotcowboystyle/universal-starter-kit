import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { Text } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { LI as ListItem } from '../Li';

import { UL as UnorderedList } from './index';

describe('UL Component', () => {
  it('should render successfully', () => {
    const { container } = renderWithProviders(
      <UnorderedList>
        <ListItem>Item 1</ListItem>
        <ListItem>Item 2</ListItem>
      </UnorderedList>,
    );
    const ulElement = container.querySelector('ul');
    expect(ulElement).toBeDefined();
    expect(ulElement?.children.length).toBe(2);
  });

  it('should dynamically handle nested list items', () => {
    const { container, rerender } = renderWithProviders(
      <UnorderedList>
        <ListItem>Item 1</ListItem>
        <ListItem>
          Item 2
          <UnorderedList>
            <ListItem>Subitem 1</ListItem>
            <ListItem>Subitem 2</ListItem>
          </UnorderedList>
        </ListItem>
      </UnorderedList>,
    );
    let ulElement = container.querySelectorAll('ul');
    expect(ulElement).toHaveLength(2);
    rerender(
      <UnorderedList>
        <ListItem>Item 1</ListItem>
        <ListItem>
          Item 2
          <UnorderedList>
            <ListItem>Updated Subitem 1</ListItem>
            <ListItem>Updated Subitem 2</ListItem>
            <ListItem>New Subitem 3</ListItem>
          </UnorderedList>
        </ListItem>
      </UnorderedList>,
    );
    ulElement = container.querySelectorAll('ul');
    expect(ulElement).toHaveLength(2);
    const [, nestedUL] = ulElement;
    expect(nestedUL?.children.length).toBe(3);
    expect(nestedUL?.children[0].textContent).toContain('Updated Subitem 1');
    expect(nestedUL?.children[1].textContent).toContain('Updated Subitem 2');
    expect(nestedUL?.children[2].textContent).toContain('New Subitem 3');
  });

  describe('edge cases', () => {
    it('should handle empty content dynamically', () => {
      const { container, rerender } = renderWithProviders(<UnorderedList />);
      let ulElement = container.querySelector('ul');
      expect(ulElement).toBeDefined();
      expect(ulElement?.children.length).toBe(0);
      rerender(
        <UnorderedList>
          <ListItem>Item 1</ListItem>
          <ListItem>Item 2</ListItem>
        </UnorderedList>,
      );
      ulElement = container.querySelector('ul');
      expect(ulElement?.children.length).toBe(2);
    });

    it('should handle dynamic updates for list items with special characters', () => {
      const { rerender } = renderWithProviders(
        <UnorderedList>
          <ListItem>Item &amp; More</ListItem>
          <ListItem>
            Item with <Text>bold</Text> text
          </ListItem>
        </UnorderedList>,
      );
      let ulElement = screen.getByRole('list');
      const liElements = ulElement.querySelectorAll('li');
      expect(liElements).toHaveLength(2);
      expect(liElements[0].textContent).toContain('Item & More');
      expect(liElements[1].textContent).toBe('Item with bold text');
      rerender(
        <UnorderedList>
          <ListItem>Updated Item &amp; More</ListItem>
          <ListItem>
            New Item with <Text>italic</Text> text
          </ListItem>
        </UnorderedList>,
      );
      ulElement = screen.getByRole('list');
      const updatedLiElements = ulElement.querySelectorAll('li');
      expect(updatedLiElements).toHaveLength(2);
      expect(updatedLiElements[0].textContent).toContain('Updated Item & More');
      expect(updatedLiElements[1].textContent).toBe('New Item with italic text');
    });
  });
});
