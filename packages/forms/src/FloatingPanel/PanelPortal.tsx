import { TamaguiRoot, useThemeName } from '@tamagui/web';
import type { CSSProperties, FocusEvent, ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { panelPortalAttribute, registerPanelPortal } from '../shared/panelPortal';

export interface PanelPortalProps {
  /** The element the panel opened from: the trigger it attaches to. */
  anchor: HTMLElement | null;
  children: ReactNode;
}

const layerRootSelector = '[role="dialog"], [aria-modal="true"]';

const tabbableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusGuardAttribute = 'data-fp-focus-guard';

const focusGuardStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Where a web panel mounts: the nearest modal layer around its trigger, else
 * the body. Staying inside a dialog keeps that dialog's focus trap and
 * outside-press test treating the panel as its own content; every scroll
 * view between the trigger and that layer is escaped either way.
 */
export function panelPortalHost(anchor: Element | null): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return anchor?.closest<HTMLElement>(layerRootSelector) ?? document.body;
}

function isTabbable(element: HTMLElement): boolean {
  if (element.hasAttribute(focusGuardAttribute) || element.tabIndex < 0) {
    return false;
  }
  if (element.closest('[inert]')) {
    return false;
  }
  return element.getClientRects().length > 0;
}

function tabbablesIn(root: Element | null): HTMLElement[] {
  if (!root) {
    return [];
  }
  return Array.from(root.querySelectorAll<HTMLElement>(tabbableSelector)).filter(isTabbable);
}

/** Tab order resumes beside the trigger, not at the end of the portal host. */
function focusBesideAnchor(anchor: HTMLElement | null, side: 'before' | 'after') {
  if (!anchor) {
    return;
  }
  const inAnchor = tabbablesIn(anchor);
  if (side === 'before' && isTabbable(anchor)) {
    inAnchor.unshift(anchor);
  }
  const own = side === 'before' ? inAnchor[inAnchor.length - 1] : undefined;
  if (own) {
    own.focus();
    return;
  }
  const edge = side === 'before' ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
  const page = tabbablesIn(document.body).filter((element) => {
    if (anchor.contains(element) || !(anchor.compareDocumentPosition(element) & edge)) {
      return false;
    }
    const portal = element.closest(`[${panelPortalAttribute}]`);
    return !portal || portal.contains(anchor);
  });
  (side === 'before' ? page[page.length - 1] : page[0])?.focus();
}

/**
 * Web: renders a floating panel outside every scroll view between its trigger
 * and the page. react-native-web's ScrollView sets
 * `transform: translateZ(0)`, which makes it the containing block of a
 * `position: fixed` descendant, so a panel left in place is clipped by the
 * scroller. The portal carries the trigger's theme across (knobs are React
 * context and follow on their own). Hidden focus guards keep the panel in Tab
 * order right after the trigger, where it sat before it moved.
 */
export function PanelPortal({ anchor, children }: PanelPortalProps) {
  const themeName = useThemeName();
  const portalRef = useRef<HTMLSpanElement | null>(null);
  const host = panelPortalHost(anchor);
  const direction = anchor?.closest('[dir]')?.getAttribute('dir') ?? undefined;

  useLayoutEffect(() => {
    const portal = portalRef.current;
    if (!portal || !anchor) {
      return;
    }
    return registerPanelPortal(portal, anchor);
  }, [anchor, host]);

  if (!host) {
    return null;
  }
  // Stands where the panel used to be in tab order: right after the trigger.
  const enterPanel = (event: FocusEvent<HTMLSpanElement>) => {
    const guard = event.currentTarget;
    const from = event.relatedTarget;
    const forward =
      !(from instanceof Node) || Boolean(guard.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_PRECEDING);
    const inside = tabbablesIn(portalRef.current);
    const target = forward ? inside[0] : inside[inside.length - 1];
    if (target) {
      target.focus();
    } else {
      focusBesideAnchor(anchor, forward ? 'after' : 'before');
    }
  };
  const portal = createPortal(
    <span ref={portalRef} {...{ [panelPortalAttribute]: '' }} dir={direction} style={{ display: 'contents' }}>
      <span
        {...{ [focusGuardAttribute]: '' }}
        tabIndex={0}
        style={focusGuardStyle}
        onFocus={() => {
          focusBesideAnchor(anchor, 'before');
        }}
      />
      <TamaguiRoot theme={themeName}>{children}</TamaguiRoot>
      <span
        {...{ [focusGuardAttribute]: '' }}
        tabIndex={0}
        style={focusGuardStyle}
        onFocus={() => {
          focusBesideAnchor(anchor, 'after');
        }}
      />
    </span>,
    host,
  );
  return (
    <>
      <span {...{ [focusGuardAttribute]: '' }} tabIndex={0} style={focusGuardStyle} onFocus={enterPanel} />
      {portal}
    </>
  );
}
