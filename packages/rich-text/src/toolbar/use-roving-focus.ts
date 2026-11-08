/**
 * Roving tabindex for the toolbar (WAI-ARIA toolbar pattern).
 *
 * The toolbar is ONE tab stop: Tab enters at the last-active control and
 * leaves on the next Tab; ArrowLeft/ArrowRight (direction-aware for RTL),
 * Home, and End move between enabled controls.
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';

// Tamagui Buttons render as <div role="button">, so match by role as well
// as by tag; disabled controls drop out of the roving order either way.
const FOCUSABLE = [
  'button:not([disabled]):not([aria-disabled="true"])',
  '[role="button"]:not([disabled]):not([aria-disabled="true"])',
].join(', ');

export const useRovingFocus = (containerRef: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }

    const controls = () => [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];

    const setTabStops = (active?: HTMLElement) => {
      const list = controls();
      if (list.length === 0) {
        return;
      }
      const current = active && list.includes(active) ? active : (list.find((b) => b.tabIndex === 0) ?? list[0]);
      for (const control of list) {
        control.tabIndex = control === current ? 0 : -1;
      }
    };

    setTabStops();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        return;
      }
      const list = controls();
      if (list.length === 0) {
        return;
      }
      const current = document.activeElement;
      let index = current instanceof HTMLElement ? list.indexOf(current) : -1;
      if (index === -1) {
        return;
      }

      const isRtl = container.closest<HTMLElement>('[dir]')?.dir === 'rtl' || document.dir === 'rtl';
      const forward = isRtl ? -1 : 1;

      if (event.key === 'ArrowRight') {
        index = (index + forward + list.length) % list.length;
      } else if (event.key === 'ArrowLeft') {
        index = (index - forward + list.length) % list.length;
      } else if (event.key === 'Home') {
        index = 0;
      } else {
        index = list.length - 1;
      }

      event.preventDefault();
      const next = list[index];
      setTabStops(next);
      next.focus();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    const handleFocusIn = (event: FocusEvent) => {
      const { target } = event;
      if (target instanceof HTMLElement && target.matches(FOCUSABLE)) {
        setTabStops(target);
      }
    };

    // Buttons mount/unmount (sections, disabled flips) -- keep stops valid
    const observer = new MutationObserver(() => {
      setTabStops();
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled'],
    });

    container.addEventListener('keydown', handleKeyDown);
    container.addEventListener('focusin', handleFocusIn);
    return () => {
      observer.disconnect();
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('focusin', handleFocusIn);
    };
  }, [containerRef]);
};
