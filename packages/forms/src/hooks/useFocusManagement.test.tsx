import { renderWithProviders } from '@repo/test-utils';
import { act } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  focusFieldTarget,
  focusFirstInvalid,
  useFocusManagement,
  useOTPFocusManagement,
  useSearchableDropdownFocus,
} from './useFocusManagement';

// Mock HTMLElement methods
const mockFocus = vi.fn();
const mockContains = vi.fn();

beforeAll(() => {
  // Mock HTMLElement.prototype.focus
  Object.defineProperty(HTMLElement.prototype, 'focus', {
    writable: true,
    value: mockFocus,
  });

  // Mock HTMLElement.prototype.contains
  Object.defineProperty(HTMLElement.prototype, 'contains', {
    writable: true,
    value: mockContains,
  });

  // Mock document.activeElement
  Object.defineProperty(document, 'activeElement', {
    writable: true,
    value: null,
  });

  // Mock querySelectorAll
  const mockQuerySelectorAll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'querySelectorAll', {
    writable: true,
    value: mockQuerySelectorAll,
  });
});

describe('useFocusManagement', () => {
  describe('basic functionality', () => {
    it('should return the correct interface', () => {
      const TestComponent = () => {
        const focusManagement = useFocusManagement();

        expect(focusManagement).toHaveProperty('containerRef');
        expect(focusManagement).toHaveProperty('focusedElement');
        expect(focusManagement).toHaveProperty('focusNext');
        expect(focusManagement).toHaveProperty('focusPrevious');
        expect(focusManagement).toHaveProperty('focusElement');
        expect(focusManagement).toHaveProperty('getFocusableElements');
        expect(focusManagement).toHaveProperty('setFocusTrap');

        expect(typeof focusManagement.containerRef).toBe('object');
        expect(typeof focusManagement.focusNext).toBe('function');
        expect(typeof focusManagement.focusPrevious).toBe('function');
        expect(typeof focusManagement.focusElement).toBe('function');
        expect(typeof focusManagement.getFocusableElements).toBe('function');
        expect(typeof focusManagement.setFocusTrap).toBe('function');

        return null;
      };

      renderWithProviders(<TestComponent />);
    });

    it('should initialize with default options', () => {
      const TestComponent = () => {
        const focusManagement = useFocusManagement();

        expect(focusManagement.containerRef.current).toBeNull();
        expect(focusManagement.focusedElement).toBeNull();

        return null;
      };

      renderWithProviders(<TestComponent />);
    });
  });

  describe('container ref', () => {
    it('should provide a container ref', () => {
      let refValue: any = null;

      const TestComponent = () => {
        const focusManagement = useFocusManagement();
        refValue = focusManagement.containerRef;

        return (
          <div ref={focusManagement.containerRef as any} data-testid="container">
            <button type="button">Test Button</button>
          </div>
        );
      };

      renderWithProviders(<TestComponent />);

      expect(refValue).toHaveProperty('current');
    });
  });

  describe('focusable elements detection', () => {
    it('should return empty array when no container', () => {
      const TestComponent = () => {
        const focusManagement = useFocusManagement();

        const elements = focusManagement.getFocusableElements();
        expect(elements).toHaveLength(0);

        return null;
      };

      renderWithProviders(<TestComponent />);
    });
  });

  describe('initial focus', () => {
    it('should not set initial focus when set to none', () => {
      const TestComponent = () => {
        const focusManagement = useFocusManagement({
          initialFocus: 'none',
        });

        return <div ref={focusManagement.containerRef as any}>Test</div>;
      };

      renderWithProviders(<TestComponent />);
      expect(mockFocus).not.toHaveBeenCalled();
    });
  });

  describe('auto focus delay', () => {
    it('should delay initial focus', () => {
      vi.useFakeTimers();

      const mockElement = { focus: vi.fn() };

      HTMLElement.prototype.querySelectorAll = vi.fn(() => ({
        [Symbol.iterator]: function* () {
          yield mockElement;
        },
      })) as any;

      const TestComponent = () => {
        const focusManagement = useFocusManagement({
          initialFocus: 'first',
          autoFocusDelay: 1000,
        });

        return <div ref={focusManagement.containerRef as any}>Test</div>;
      };

      renderWithProviders(<TestComponent />);

      expect(mockElement.focus).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(mockElement.focus).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('focus change callback', () => {
    it('should call onFocusChange when focus changes', () => {
      const onFocusChange = vi.fn();
      let testFocusManagement: any;

      const TestComponent = () => {
        testFocusManagement = useFocusManagement({
          onFocusChange,
        });

        return <div ref={testFocusManagement.containerRef}>Test</div>;
      };

      renderWithProviders(<TestComponent />);

      const mockElement = { focus: vi.fn() };
      act(() => {
        testFocusManagement.focusElement(mockElement as any);
      });

      expect(onFocusChange).toHaveBeenCalledWith(mockElement);
    });
  });

  describe('restore focus', () => {
    it('should restore focus when enabled', () => {
      const mockPreviouslyFocused = { focus: vi.fn() };
      Object.defineProperty(document, 'activeElement', {
        value: mockPreviouslyFocused,
      });

      const TestComponent = () => {
        const focusManagement = useFocusManagement({
          restoreFocus: true,
        });

        return <div ref={focusManagement.containerRef as any}>Test</div>;
      };

      const { unmount } = renderWithProviders(<TestComponent />);
      unmount();

      expect(mockPreviouslyFocused.focus).toHaveBeenCalled();
    });

    it('should not restore focus when disabled', () => {
      const mockPreviouslyFocused = { focus: vi.fn() };
      Object.defineProperty(document, 'activeElement', {
        value: mockPreviouslyFocused,
      });

      const TestComponent = () => {
        const focusManagement = useFocusManagement({
          restoreFocus: false,
        });

        return <div ref={focusManagement.containerRef as any}>Test</div>;
      };

      const { unmount } = renderWithProviders(<TestComponent />);
      unmount();

      expect(mockPreviouslyFocused.focus).not.toHaveBeenCalled();
    });
  });
});

describe('useOTPFocusManagement', () => {
  it('should return the correct interface', () => {
    const TestComponent = () => {
      const otpFocus = useOTPFocusManagement(6);

      expect(otpFocus).toHaveProperty('focusedIndex');
      expect(otpFocus).toHaveProperty('focusInput');
      expect(otpFocus).toHaveProperty('handleKeyPress');
      expect(otpFocus).toHaveProperty('setInputRef');

      expect(typeof otpFocus.focusInput).toBe('function');
      expect(typeof otpFocus.handleKeyPress).toBe('function');
      expect(typeof otpFocus.setInputRef).toBe('function');

      return null;
    };

    renderWithProviders(<TestComponent />);
  });
});

describe('useSearchableDropdownFocus', () => {
  it('should return the correct interface', () => {
    const TestComponent = () => {
      const dropdownFocus = useSearchableDropdownFocus(true, []);

      expect(dropdownFocus).toHaveProperty('highlightedIndex');
      expect(dropdownFocus).toHaveProperty('setHighlightedIndex');
      expect(dropdownFocus).toHaveProperty('handleKeyDown');

      expect(typeof dropdownFocus.setHighlightedIndex).toBe('function');
      expect(typeof dropdownFocus.handleKeyDown).toBe('function');

      return null;
    };

    renderWithProviders(<TestComponent />);
  });

  it('should reset highlighted index when closed', () => {
    const TestComponent = () => {
      const dropdownFocus = useSearchableDropdownFocus(false, ['Item 1']);

      expect(dropdownFocus.highlightedIndex).toBe(-1);

      return null;
    };

    renderWithProviders(<TestComponent />);
  });
});

describe('focusFirstInvalid / focusFieldTarget', () => {
  it('focuses the first aria-invalid control', () => {
    const form = document.createElement('form');
    const ok = document.createElement('input');
    ok.id = 'ok';
    const bad = document.createElement('input');
    bad.id = 'bad';
    bad.setAttribute('aria-invalid', 'true');
    form.append(ok, bad);
    document.body.appendChild(form);

    const focused = focusFirstInvalid(form);
    expect(focused?.id).toBe('bad');
    expect(mockFocus).toHaveBeenCalled();
    form.remove();
  });

  it('resolves by id then falls back to first invalid', () => {
    const form = document.createElement('form');
    const email = document.createElement('input');
    email.id = 'email';
    const other = document.createElement('input');
    other.id = 'other';
    other.setAttribute('aria-invalid', 'true');
    form.append(email, other);
    document.body.appendChild(form);

    expect(focusFieldTarget(form, { id: 'email' })?.id).toBe('email');
    expect(focusFieldTarget(form, { id: 'missing', name: 'nope' })?.id).toBe('other');
    form.remove();
  });
});
