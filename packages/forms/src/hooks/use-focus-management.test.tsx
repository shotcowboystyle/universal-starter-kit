import { renderWithProviders } from '@repo/test-utils';
import { act, renderHook } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  focusFieldTarget,
  focusFirstInvalid,
  useFocusManagement,
  useOTPFocusManagement,
  useSearchableDropdownFocus,
} from './use-focus-management';
import type { FocusManagementOptions } from './use-focus-management';

// Mock HTMLElement methods
const mockFocus = vi.fn<() => void>();
const mockContains = vi.fn<(other: Node | null) => boolean>();

const FocusHost = ({ options }: { options?: FocusManagementOptions }) => {
  const { containerRef } = useFocusManagement(options);
  return <section ref={containerRef}>Test</section>;
};

const focusableButton = () => {
  const button = document.createElement('button');
  return { button, focusSpy: vi.spyOn(button, 'focus') };
};

describe('use-focus-management', () => {
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
    const mockQuerySelectorAll = vi.fn<() => HTMLElement[]>();
    Object.defineProperty(HTMLElement.prototype, 'querySelectorAll', {
      writable: true,
      value: mockQuerySelectorAll,
    });
  });

  describe(useFocusManagement, () => {
    describe('basic functionality', () => {
      it('should return the correct interface', () => {
        const { result } = renderHook(() => useFocusManagement());
        const focusManagement = result.current;

        expect(focusManagement).toHaveProperty('containerRef');
        expect(focusManagement).toHaveProperty('focusedElement');
        expect(focusManagement).toHaveProperty('focusNext');
        expect(focusManagement).toHaveProperty('focusPrevious');
        expect(focusManagement).toHaveProperty('focusElement');
        expect(focusManagement).toHaveProperty('getFocusableElements');
        expect(focusManagement).toHaveProperty('setFocusTrap');

        expect(focusManagement.containerRef).toBeTypeOf('object');
        expect(focusManagement.focusNext).toBeTypeOf('function');
        expect(focusManagement.focusPrevious).toBeTypeOf('function');
        expect(focusManagement.focusElement).toBeTypeOf('function');
        expect(focusManagement.getFocusableElements).toBeTypeOf('function');
        expect(focusManagement.setFocusTrap).toBeTypeOf('function');
      });

      it('should initialize with default options', () => {
        const { result } = renderHook(() => useFocusManagement());

        expect(result.current.containerRef.current).toBeNull();
        expect(result.current.focusedElement).toBeNull();
      });
    });

    describe('container ref', () => {
      it('should provide a container ref', () => {
        const { result } = renderHook(() => useFocusManagement());

        expect(result.current.containerRef).toHaveProperty('current');
      });
    });

    describe('focusable elements detection', () => {
      it('should return empty array when no container', () => {
        const { result } = renderHook(() => useFocusManagement());

        expect(result.current.getFocusableElements()).toHaveLength(0);
      });
    });

    describe('initial focus', () => {
      it('should not set initial focus when set to none', () => {
        renderWithProviders(<FocusHost options={{ initialFocus: 'none' }} />);
        expect(mockFocus).not.toHaveBeenCalled();
      });
    });

    describe('auto focus delay', () => {
      it('should delay initial focus', () => {
        vi.useFakeTimers();

        const { button: mockElement, focusSpy } = focusableButton();

        Object.defineProperty(HTMLElement.prototype, 'querySelectorAll', {
          writable: true,
          value: vi.fn<() => HTMLElement[]>(() => [mockElement]),
        });

        renderWithProviders(<FocusHost options={{ initialFocus: 'first', autoFocusDelay: 1000 }} />);

        expect(focusSpy).not.toHaveBeenCalled();

        act(() => {
          vi.advanceTimersByTime(1000);
        });

        expect(focusSpy).toHaveBeenCalledWith();

        vi.useRealTimers();
      });
    });

    describe('focus change callback', () => {
      it('should call onFocusChange when focus changes', () => {
        const onFocusChange = vi.fn<(element: HTMLElement | null) => void>();
        const { result } = renderHook(() => useFocusManagement({ onFocusChange }));

        const { button: mockElement } = focusableButton();
        act(() => {
          result.current.focusElement(mockElement);
        });

        expect(onFocusChange).toHaveBeenCalledWith(mockElement);
      });
    });

    describe('restore focus', () => {
      it('should restore focus when enabled', () => {
        const { button: mockPreviouslyFocused, focusSpy } = focusableButton();
        Object.defineProperty(document, 'activeElement', {
          value: mockPreviouslyFocused,
        });

        const { unmount } = renderWithProviders(<FocusHost options={{ restoreFocus: true }} />);
        unmount();

        expect(focusSpy).toHaveBeenCalledWith();
      });

      it('should not restore focus when disabled', () => {
        const { button: mockPreviouslyFocused, focusSpy } = focusableButton();
        Object.defineProperty(document, 'activeElement', {
          value: mockPreviouslyFocused,
        });

        const { unmount } = renderWithProviders(<FocusHost options={{ restoreFocus: false }} />);
        unmount();

        expect(focusSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe(useOTPFocusManagement, () => {
    it('should return the correct interface', () => {
      const { result } = renderHook(() => useOTPFocusManagement(6));
      const otpFocus = result.current;

      expect(otpFocus).toHaveProperty('focusedIndex');
      expect(otpFocus).toHaveProperty('focusInput');
      expect(otpFocus).toHaveProperty('handleKeyPress');
      expect(otpFocus).toHaveProperty('setInputRef');

      expect(otpFocus.focusInput).toBeTypeOf('function');
      expect(otpFocus.handleKeyPress).toBeTypeOf('function');
      expect(otpFocus.setInputRef).toBeTypeOf('function');
    });
  });

  describe(useSearchableDropdownFocus, () => {
    it('should return the correct interface', () => {
      const { result } = renderHook(() => useSearchableDropdownFocus(true, []));
      const dropdownFocus = result.current;

      expect(dropdownFocus).toHaveProperty('highlightedIndex');
      expect(dropdownFocus).toHaveProperty('setHighlightedIndex');
      expect(dropdownFocus).toHaveProperty('handleKeyDown');

      expect(dropdownFocus.setHighlightedIndex).toBeTypeOf('function');
      expect(dropdownFocus.handleKeyDown).toBeTypeOf('function');
    });

    it('should reset highlighted index when closed', () => {
      const { result } = renderHook(() => useSearchableDropdownFocus(false, ['Item 1']));

      expect(result.current.highlightedIndex).toBe(-1);
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
      document.body.append(form);

      const focused = focusFirstInvalid(form);
      expect(focused?.id).toBe('bad');
      expect(mockFocus).toHaveBeenCalledWith();
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
      document.body.append(form);

      expect(focusFieldTarget(form, { id: 'email' })?.id).toBe('email');
      expect(focusFieldTarget(form, { id: 'missing', name: 'nope' })?.id).toBe('other');
      form.remove();
    });
  });
});
