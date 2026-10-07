/**
 * Block-rect anchoring for bubble menus (web).
 *
 * Tiptap's BubbleMenu anchors to the text caret by default. For tall blocks
 * (tables, code blocks) that puts the bubble INSIDE the block box — hovering
 * over the first table row / first code line, where it traps pointer events
 * and chases the caret on every keystroke. Anchoring to the block's own DOM
 * rect keeps the bubble outside the block (above it, or flipped below by
 * floating-ui), so block content stays clickable and the bubble holds still
 * while typing. GitLab's content editor anchors its table/code chrome the
 * same way.
 */

import type { Editor } from '@tiptap/core';

interface BlockVirtualElement {
  getBoundingClientRect: () => DOMRect;
  contextElement: Element;
}

/**
 * Returns a floating-ui VirtualElement for the nearest ancestor node of
 * `nodeTypeName` containing the selection, or null when the selection is
 * not inside one (the bubble is hidden by `shouldShow` in that case).
 */
export function getBlockVirtualElement(editor: Editor, nodeTypeName: string): BlockVirtualElement | null {
  const { $from } = editor.state.selection;
  for (let { depth } = $from; depth > 0; depth--) {
    if ($from.node(depth).type.name !== nodeTypeName) {
      continue;
    }
    const dom = editor.view.nodeDOM($from.before(depth));
    if (dom instanceof HTMLElement) {
      const block = dom.querySelector<HTMLElement>(':scope > table') ?? dom;
      return {
        getBoundingClientRect: () => block.getBoundingClientRect(),
        contextElement: block,
      };
    }
  }
  return null;
}
