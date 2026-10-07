/**
 * Drag-to-resize handle for the editor container.
 * Positioned at the bottom-right corner; dragging vertically adjusts editor height.
 */

import { useCallback, useRef } from 'react';
import { View } from 'tamagui';

export interface ResizeHandleProps {
  containerRef: React.RefObject<HTMLElement | null>;
  minHeight?: number;
  maxHeight?: number;
}

function GripIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="currentColor"
      opacity={0.4}>
      <path
        d="M10 2L2 10"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M10 6L6 10"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M10 10L10 10"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

export function ResizeHandle({ containerRef, minHeight = 150, maxHeight }: ResizeHandleProps) {
  const startY = useRef(0);
  const startHeight = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) {
        return;
      }

      startY.current = e.clientY;
      startHeight.current = el.getBoundingClientRect().height;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientY - startY.current;
        let newHeight = startHeight.current + delta;
        if (newHeight < minHeight) {
          newHeight = minHeight;
        }
        if (maxHeight && newHeight > maxHeight) {
          newHeight = maxHeight;
        }
        el.style.height = `${newHeight}px`;
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [containerRef, minHeight, maxHeight],
  );

  return (
    <View
      position="absolute"
      bottom={0}
      right={0}
      width={16}
      height={16}
      cursor="ns-resize"
      alignItems="center"
      justifyContent="center"
      opacity={0.6}
      hoverStyle={{ opacity: 1 }}
      onMouseDown={onMouseDown as any}
      aria-label="Resize editor"
      role="separator">
      <GripIcon />
    </View>
  );
}
