/**
 * Universal block drag handle extension.
 * Shows a grip icon to the left of the hovered top-level block.
 * Dragging from the handle moves the entire block.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';

const HANDLE_WIDTH = 20;
const SVG_NS = 'http://www.w3.org/2000/svg';
const GRIP_DOTS: [number, number][] = [
  [4, 3],
  [10, 3],
  [4, 7],
  [10, 7],
  [4, 11],
  [10, 11],
];

function createGripIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('opacity', '0.35');
  for (const [cx, cy] of GRIP_DOTS) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', '1.2');
    svg.append(circle);
  }
  return svg;
}

function createHandleElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'block-drag-handle';
  el.draggable = true;
  el.append(createGripIcon());
  Object.assign(el.style, {
    position: 'absolute',
    width: `${HANDLE_WIDTH}px`,
    height: `${HANDLE_WIDTH}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    borderRadius: '4px',
    opacity: '0',
    // decorative fade lives in editorStyles CSS, driven by the motion knob
    // (animation none silences it); direct drag stays instant either way
    zIndex: '10',
    userSelect: 'none',
  });
  return el;
}

export const BlockDragHandle = Extension.create({
  name: 'blockDragHandle',

  addProseMirrorPlugins() {
    let handle: HTMLDivElement | null = null;
    let currentBlockPos: number | null = null;

    return [
      new Plugin({
        key: new PluginKey('blockDragHandle'),

        view(editorView) {
          handle = createHandleElement();
          editorView.dom.parentElement?.append(handle);
          editorView.dom.parentElement!.style.position = 'relative';

          const onMouseMove = (event: MouseEvent) => {
            if (!handle || !editorView.dom.contains(event.target as Node)) {
              if (handle) {
                handle.style.opacity = '0';
              }
              currentBlockPos = null;
              return;
            }

            const pos = editorView.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            if (!pos) {
              handle.style.opacity = '0';
              currentBlockPos = null;
              return;
            }

            const $pos = editorView.state.doc.resolve(pos.pos);
            const { depth } = $pos;
            if (depth === 0) {
              handle.style.opacity = '0';
              currentBlockPos = null;
              return;
            }

            const topLevelPos = $pos.before(1);
            const node = editorView.state.doc.nodeAt(topLevelPos);
            if (!node) {
              handle.style.opacity = '0';
              currentBlockPos = null;
              return;
            }

            currentBlockPos = topLevelPos;

            const domNode = editorView.nodeDOM(topLevelPos) as HTMLElement | null;
            if (!domNode) {
              handle.style.opacity = '0';
              return;
            }

            const editorRect = editorView.dom.parentElement!.getBoundingClientRect();
            const blockRect = domNode.getBoundingClientRect();

            handle.style.left = `${blockRect.left - editorRect.left - HANDLE_WIDTH - 2}px`;
            handle.style.top = `${blockRect.top - editorRect.top + 2}px`;
            handle.style.opacity = '1';
          };

          const onMouseLeave = () => {
            if (handle) {
              handle.style.opacity = '0';
            }
            currentBlockPos = null;
          };

          const onDragStart = (event: DragEvent) => {
            if (currentBlockPos === null) {
              return;
            }
            const node = editorView.state.doc.nodeAt(currentBlockPos);
            if (!node) {
              return;
            }

            const sel = NodeSelection.create(editorView.state.doc, currentBlockPos);
            editorView.dispatch(editorView.state.tr.setSelection(sel));

            editorView.dragging = {
              slice: sel.content(),
              move: true,
            };

            event.dataTransfer?.setDragImage(editorView.nodeDOM(currentBlockPos) as HTMLElement, 0, 0);
          };

          handle.addEventListener('dragstart', onDragStart);
          editorView.dom.addEventListener('mousemove', onMouseMove);
          editorView.dom.addEventListener('mouseleave', onMouseLeave);

          return {
            destroy() {
              handle?.remove();
              editorView.dom.removeEventListener('mousemove', onMouseMove);
              editorView.dom.removeEventListener('mouseleave', onMouseLeave);
            },
          };
        },
      }),
    ];
  },
});
