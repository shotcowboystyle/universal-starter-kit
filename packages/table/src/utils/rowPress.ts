/**
 * Row-press inner-control isolation (the stopPropagation contract's
 * defensive arm).
 *
 * When `onRowPress` makes the whole row a pressable unit, interactive
 * elements INSIDE cells (selection checkboxes, like buttons, links,
 * editors) must keep working without also firing the row press. Inner
 * controls that call `stopPropagation()` never reach the row handler;
 * this walk catches the rest — anything between the event target and the
 * row that declares interactivity (native controls, ARIA control roles,
 * its own tab stop, or an expand/collapse toggle).
 */

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="textbox"]',
  // Expand/collapse toggles (the row-expansion caret) predate a role — the
  // expanded-state attribute is their detectable interactivity signal.
  '[aria-expanded]',
  // A cell editor's floating panel is portaled out of the row (MPO-335), and
  // React still bubbles its presses to the row: all of it is inner control.
  '[data-fp-portal]',
].join(', ');

/**
 * True when `target` is (or sits inside) an interactive element between
 * itself and `boundary` (exclusive). Web-only — native nested pressables
 * already claim the gesture responder, so a child press never bubbles to
 * the row there.
 */
export function isInteractiveInnerTarget(target: unknown, boundary: unknown): boolean {
  if (typeof Element === 'undefined') {
    return false;
  }
  if (!(target instanceof Element)) {
    return false;
  }
  const boundaryEl = boundary instanceof Element ? boundary : null;
  let node: Element | null = target;
  while (node && node !== boundaryEl) {
    if (node.matches(INTERACTIVE_SELECTOR)) {
      return true;
    }
    const tabIndex = node.getAttribute('tabindex');
    // A tab stop of its own (0 or positive) marks a focusable control; the
    // row's roving -1/0 tabindex lives on the boundary, not inside it.
    if (tabIndex != null && Number(tabIndex) >= 0) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}
