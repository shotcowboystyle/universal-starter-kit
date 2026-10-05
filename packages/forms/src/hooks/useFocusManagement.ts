import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { isWeb } from 'tamagui';

/**
 * Focus the first invalid control inside a container (`aria-invalid="true"`).
 * Used after failed submit / ErrorSummary jump links.
 */
export function focusFirstInvalid(container: HTMLElement | null | undefined): HTMLElement | null {
  if (!isWeb || !container || typeof container.querySelector !== 'function') {
    return null;
  }
  const el = container.querySelector(
    '[aria-invalid="true"]:not([disabled]):not([aria-disabled="true"])',
  ) as HTMLElement | null;
  if (!el || typeof el.focus !== 'function') {
    return null;
  }
  el.focus();
  el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  return el;
}

/**
 * Resolve and focus a field by DOM id, then name attribute, then first invalid.
 */
export function focusFieldTarget(
  container: HTMLElement | null | undefined,
  target: { id?: string; name?: string },
): HTMLElement | null {
  if (!isWeb || !container) {
    return null;
  }

  const tryFocus = (el: Element | null | undefined): HTMLElement | null => {
    if (!el || !(el instanceof HTMLElement) || typeof el.focus !== 'function') {
      return null;
    }
    // Prefer a nested focusable control when the match is a wrapper.
    const nested = el.matches?.(
      "input, textarea, select, button, [tabindex]:not([tabindex='-1']), [contenteditable='true']",
    )
      ? el
      : (el.querySelector?.(
          "input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ) as HTMLElement | null);
    const focusable = nested ?? el;
    focusable.focus();
    focusable.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    return focusable;
  };

  if (target.id) {
    const byId =
      (typeof document !== 'undefined' ? document.getElementById(target.id) : null) ??
      container.querySelector(`#${cssEscape(target.id)}`);
    const focused = tryFocus(byId);
    if (focused) {
      return focused;
    }
  }

  if (target.name) {
    const byName = container.querySelector(`[name="${cssEscape(target.name)}"]`);
    const focused = tryFocus(byName);
    if (focused) {
      return focused;
    }
  }

  return focusFirstInvalid(container);
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

export interface FocusManagementOptions {
  /**
   * Whether to trap focus within the container
   */
  trapFocus?: boolean;

  /**
   * Whether to restore focus to the previously focused element when unmounting
   */
  restoreFocus?: boolean;

  /**
   * Initial focus behavior
   */
  initialFocus?: 'first' | 'none' | HTMLElement;

  /**
   * Auto-focus delay in milliseconds
   */
  autoFocusDelay?: number;

  /**
   * Callback when focus changes
   */
  onFocusChange?: (element: HTMLElement | null) => void;
}

export interface FocusManagementReturn {
  /**
   * Ref to attach to the container element
   */
  containerRef: RefObject<HTMLElement | null>;

  /**
   * Current focused element
   */
  focusedElement: HTMLElement | null;

  /**
   * Focus the next focusable element
   */
  focusNext: () => void;

  /**
   * Focus the previous focusable element
   */
  focusPrevious: () => void;

  /**
   * Focus a specific element
   */
  focusElement: (element: HTMLElement) => void;

  /**
   * Get all focusable elements within the container
   */
  getFocusableElements: () => HTMLElement[];

  /**
   * Manually set focus trap
   */
  setFocusTrap: (enabled: boolean) => void;
}

/**
 * Hook for advanced focus management within a container
 */
export function useFocusManagement(options: FocusManagementOptions = {}): FocusManagementReturn {
  const { trapFocus = false, restoreFocus = true, initialFocus = 'none', autoFocusDelay = 0, onFocusChange } = options;

  const containerRef = useRef<HTMLElement>(null);
  const [focusedElement, setFocusedElement] = useState<HTMLElement | null>(null);
  const [isFocusTrapped, setIsFocusTrapped] = useState(trapFocus);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const hasAppliedInitialFocus = useRef(false);
  const focusableSelectors = useRef([
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    "[tabindex]:not([tabindex='-1'])",
    "[contenteditable='true']",
  ]);

  // Get all focusable elements within the container, respecting tabIndex={-1}
  // and the data-focus-skip attribute for elements that should be excluded
  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) {
      return [];
    }

    const elements = containerRef.current.querySelectorAll(focusableSelectors.current.join(', '));

    return (Array.from(elements) as HTMLElement[]).filter((el) => {
      if (el.tabIndex === -1) {
        return false;
      }
      if (typeof el.closest === 'function' && el.closest('[data-focus-skip]')) {
        return false;
      }
      return true;
    });
  }, []);

  // Focus a specific element
  const focusElement = useCallback(
    (element: HTMLElement) => {
      if (element && typeof element.focus === 'function') {
        element.focus();
        setFocusedElement(element);
        onFocusChange?.(element);
      }
    },
    [onFocusChange],
  );

  // Focus the next element
  const focusNext = useCallback(() => {
    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) {
      return;
    }

    const currentIndex = focusedElement ? focusableElements.indexOf(focusedElement) : -1;
    const nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;

    focusElement(focusableElements[nextIndex]);
  }, [focusedElement, getFocusableElements, focusElement]);

  // Focus the previous element
  const focusPrevious = useCallback(() => {
    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) {
      return;
    }

    const currentIndex = focusedElement ? focusableElements.indexOf(focusedElement) : 0;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;

    focusElement(focusableElements[prevIndex]);
  }, [focusedElement, getFocusableElements, focusElement]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isFocusTrapped) {
        return;
      }

      switch (event.key) {
        case 'Tab':
          event.preventDefault();
          if (event.shiftKey) {
            focusPrevious();
          } else {
            focusNext();
          }
          break;
        case 'ArrowDown':
          event.preventDefault();
          focusNext();
          break;
        case 'ArrowUp':
          event.preventDefault();
          focusPrevious();
          break;
        case 'Home': {
          event.preventDefault();
          const firstElement = getFocusableElements()[0];
          if (firstElement) {
            focusElement(firstElement);
          }
          break;
        }
        case 'End': {
          event.preventDefault();
          const focusableElements = getFocusableElements();
          const lastElement = focusableElements[focusableElements.length - 1];
          if (lastElement) {
            focusElement(lastElement);
          }
          break;
        }
      }
    },
    [isFocusTrapped, focusNext, focusPrevious, getFocusableElements, focusElement],
  );

  // Handle focus events
  const handleFocusIn = useCallback(
    (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (containerRef.current?.contains(target)) {
        setFocusedElement(target);
        onFocusChange?.(target);
      }
    },
    [onFocusChange],
  );

  const handleFocusOut = useCallback(
    (event: FocusEvent) => {
      const relatedTarget = event.relatedTarget as HTMLElement;
      if (!containerRef.current?.contains(relatedTarget)) {
        setFocusedElement(null);
        onFocusChange?.(null);
      }
    },
    [onFocusChange],
  );

  // Set up focus trap
  const setFocusTrap = useCallback((enabled: boolean) => {
    setIsFocusTrapped(enabled);
  }, []);

  // Initialize focus management (web only)
  useEffect(() => {
    if (!isWeb) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Store previously focused element
    if (restoreFocus && typeof document !== 'undefined') {
      previouslyFocusedElement.current = document.activeElement as HTMLElement;
    }

    // Add event listeners
    container.addEventListener('keydown', handleKeyDown);
    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', handleFocusOut);

    // Set initial focus only once per mount - effect re-runs when handlers change
    // (e.g. when focusedElement updates) and must not steal focus from the user
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    if (initialFocus !== 'none' && !hasAppliedInitialFocus.current) {
      hasAppliedInitialFocus.current = true;
      focusTimer = setTimeout(() => {
        if (initialFocus === 'first') {
          const firstElement = getFocusableElements()[0];
          if (firstElement) {
            focusElement(firstElement);
          }
        } else if (initialFocus instanceof HTMLElement) {
          focusElement(initialFocus);
        }
      }, autoFocusDelay);
    }

    return () => {
      if (focusTimer !== undefined) {
        clearTimeout(focusTimer);
      }
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', handleFocusOut);
    };
  }, [
    handleKeyDown,
    handleFocusIn,
    handleFocusOut,
    initialFocus,
    autoFocusDelay,
    getFocusableElements,
    focusElement,
    restoreFocus,
  ]);

  // Restore focus when unmounting (web only)
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    return () => {
      if (restoreFocus && previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus();
      }
    };
  }, [restoreFocus]);

  return {
    containerRef,
    focusedElement,
    focusNext,
    focusPrevious,
    focusElement,
    getFocusableElements,
    setFocusTrap,
  };
}

/**
 * Hook for managing focus within OTP input groups
 */
export function useOTPFocusManagement(length: number, _onComplete?: (code: string) => void) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(length).fill(null));

  const focusInput = useCallback(
    (index: number) => {
      if (index >= 0 && index < length && inputRefs.current[index]) {
        inputRefs.current[index]?.focus();
        setFocusedIndex(index);
      }
    },
    [length],
  );

  const handleKeyPress = useCallback(
    (index: number, key: string, value: string) => {
      switch (key) {
        case 'Backspace':
          if (!value && index > 0) {
            focusInput(index - 1);
          }
          break;
        case 'ArrowLeft':
          if (index > 0) {
            focusInput(index - 1);
          }
          break;
        case 'ArrowRight':
          if (index < length - 1) {
            focusInput(index + 1);
          }
          break;
        default:
          // Auto-advance for digit input
          if (/^\d$/.test(key) && value && index < length - 1) {
            focusInput(index + 1);
          }
          break;
      }
    },
    [length, focusInput],
  );

  const setInputRef = useCallback((index: number, ref: HTMLInputElement | null) => {
    inputRefs.current[index] = ref;
  }, []);

  return {
    focusedIndex,
    focusInput,
    handleKeyPress,
    setInputRef,
  };
}

/**
 * Hook for managing focus in searchable dropdowns
 */
export function useSearchableDropdownFocus<TItem = unknown>(
  isOpen: boolean,
  items: TItem[],
  onSelect?: (item: TItem) => void,
) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    if (!isOpen) {
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen || items.length === 0) {
        return;
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setHighlightedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          break;
        case 'Enter':
          event.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < items.length) {
            onSelect?.(items[highlightedIndex]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          setHighlightedIndex(-1);
          break;
      }
    },
    [isOpen, items, highlightedIndex, onSelect],
  );

  return {
    highlightedIndex,
    setHighlightedIndex,
    handleKeyDown,
  };
}
