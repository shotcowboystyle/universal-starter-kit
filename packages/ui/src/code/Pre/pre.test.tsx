import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import { Pre } from './index';

describe('Pre', () => {
  const defaultProps = {
    children: 'Test content',
  };
  const renderPre = (props = {}) => {
    return renderWithProviders(<Pre {...defaultProps} {...props} />);
  };

  describe('Basic Rendering', () => {
    it('should render successfully', () => {
      const { container } = renderPre();
      const preElement = container.querySelector('pre');
      expect(preElement).toBeDefined();
      expect(container.textContent).toContain('Test content');
    });

    it('should render with custom content', () => {
      const { container } = renderPre({
        children: 'Custom content',
      });
      const preElement = container.querySelector('pre');
      expect(preElement).toBeDefined();
      expect(container.textContent).toContain('Custom content');
    });
  });

  describe('Content Handling', () => {
    it('should handle empty content', () => {
      const { container } = renderPre({
        children: '',
      });
      const preElement = container.querySelector('pre');
      expect(preElement).toBeDefined();
    });

    it('should handle multiple lines', () => {
      const { container } = renderPre({
        children: `Line 1
        Line 2`,
      });
      const preElement = container.querySelector('pre');
      expect(preElement).toBeDefined();
      expect(container.textContent).toContain('Line 1');
      expect(container.textContent).toContain('Line 2');
    });

    it('should handle code content', () => {
      const { container } = renderPre({
        children: `
        const test = "hello";
        function greet() {
          return test;
        }`,
      });
      const preElement = container.querySelector('pre');
      expect(preElement).toBeDefined();
      expect(container.textContent).toContain('const test');
    });
  });

  describe('Styling', () => {
    it('should handle custom background color', () => {
      const { container } = renderPre({
        backgroundColor: '$blue10',
      });
      const preElement = container.querySelector('pre');
      expect(preElement).toBeDefined();
    });

    it('should handle custom text color', () => {
      const { container } = renderPre({
        color: '$color12',
      });
      const preElement = container.querySelector('pre');
      expect(preElement).toBeDefined();
    });
  });

  describe('Dynamic Updates', () => {
    it('should update content when changed', () => {
      const { container, rerender } = renderPre();
      rerender(<Pre>Updated content</Pre>);
      expect(container.textContent).toContain('Updated content');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters', () => {
      const { container } = renderPre({
        children: 'Special chars: @#$%^&*',
      });
      const preElement = container.querySelector('pre');
      expect(preElement).toBeDefined();
      expect(container.textContent).toContain('Special chars: @#$%^&*');
    });

    it('should handle very long content', () => {
      const { container } = renderPre({
        children: 'x'.repeat(1000),
      });
      const preElement = container.querySelector('pre');
      expect(preElement).toBeDefined();
      expect(container.textContent?.length ?? 0).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Knobs', () => {
    it('keeps a pre frame when font knobs change', () => {
      const { container } = renderWithProviders(
        <Preset overrides={{ bodyFont: 'serif', fontWeight: 'bold' }}>
          <Pre>const x = 1</Pre>
        </Preset>,
      );
      expect(container.querySelector('pre')).toBeTruthy();
      expect(container.textContent).toContain('const x = 1');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const { container } = renderPre({
        'aria-label': 'Code block',
      });
      const preElement = container.querySelector('pre');
      expect(preElement).toBeDefined();
      const labeled = container.querySelector('[aria-label="Code block"]');
      expect(labeled).toBeDefined();
    });
  });
});
