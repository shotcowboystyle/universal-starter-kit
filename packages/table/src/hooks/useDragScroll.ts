/**
 * useDragScroll - enables drag-to-scroll on a scrollable element.
 *
 * Web-only hook. On native, this is a no-op.
 * Uses a 5px threshold before activating drag mode.
 * Ignores interactive elements (button, input, select, textarea,
 * [role="button"]).
 */

import { useEffect } from 'react';
import { isWeb } from 'tamagui';

export function useDragScroll(ref: React.RefObject<HTMLElement | null>, enabled: boolean = true) {
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const el = ref.current;
    if (!el || !enabled) {
      return;
    }

    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) {
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('button, input, select, textarea, [role="button"]')) {
        return;
      }

      isDown = true;
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = el.scrollLeft;
      scrollTop = el.scrollTop;
      el.style.cursor = 'grab';
    };

    const handleMouseUp = () => {
      isDown = false;
      el.style.cursor = '';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) {
        return;
      }

      const x = e.clientX;
      const y = e.clientY;
      const diffX = Math.abs(x - startX);
      const diffY = Math.abs(y - startY);

      if (diffX > 5 || diffY > 5) {
        el.style.cursor = 'grabbing';
        e.preventDefault();
        el.scrollLeft = scrollLeft - (x - startX);
        el.scrollTop = scrollTop - (y - startY);
      }
    };

    const handleMouseLeave = () => {
      if (isDown) {
        isDown = false;
        el.style.cursor = '';
      }
    };

    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [ref, enabled]);
}
