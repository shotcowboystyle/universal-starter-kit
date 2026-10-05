import { zIndex } from '@repo/forms';
import { FOCUS_RING_MIN_WIDTH, FOCUS_VISIBLE_RING, useResolvedKnobs } from '@repo/theme';
import { type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react';
import type { GetProps } from 'tamagui';
import { SizableText, YStack, getTokenValue, isWeb, styled } from 'tamagui';

// ── Types ─────────────────────────────────────────────────────

export interface SkipLinkProps {
  /** id of the element to jump to (rendered as href="#<targetId>"). */
  targetId?: string;
  /** Alternative to targetId: a ref whose current element receives focus. */
  targetRef?: RefObject<HTMLElement | { focus?: () => void } | null>;
  /** Link label (default "Skip to content"). */
  children?: ReactNode;
  /** Called after focus has been moved to the target. */
  onSkip?: (target: HTMLElement | null) => void;
}

// ── Styled components ─────────────────────────────────────────

// Themed chip surface shown once the link has focus: elevated overlay tier.
const SkipLinkSurface = styled(YStack, {
  name: 'SkipLink',
  paddingVertical: '$2.5',
  paddingHorizontal: '$3.5',
});

const SKIP_LINK_STYLE_ID = 'mp-skip-link-css';
const SKIP_LINK_TARGET_CLASS = 'mp-skip-link-target';

/**
 * GOV.UK / Primer visually-hidden-until-focused, plus the focus ring on the `<a>`.
 *
 * Reveal is CSS-first (`:focus` / `:focus-visible`) so the chip paints the
 * same frame the keystroke lands — no React `focused` lag. The ring is
 * `:focus-visible` only (keyboard-origin; mouse click paints none). Offset
 * is +2px outside: this chip is a floating overlay, not a clipped composite.
 */
const skipLinkCss = `.mp-skip-link {
  position: absolute;
  top: 0;
  inset-inline-start: 0;
  display: inline-block;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
  z-index: ${zIndex.sheet};
  text-decoration: none;
  color: inherit;
}
.mp-skip-link:focus,
.mp-skip-link:focus-visible {
  position: fixed;
  top: 12px;
  inset-inline-start: 12px;
  width: auto;
  height: auto;
  margin: 0;
  overflow: visible;
  clip: auto;
  clip-path: none;
  white-space: nowrap;
  z-index: ${zIndex.sheet};
  text-decoration: none;
  border-radius: var(--mp-skip-link-radius, 0px);
}
.mp-skip-link:focus-visible {
  outline: ${FOCUS_RING_MIN_WIDTH}px ${FOCUS_VISIBLE_RING.outlineStyle} var(--outlineColor, var(--c-outlineColor, CanvasText));
  outline-offset: ${FOCUS_VISIBLE_RING.outlineOffset}px;
}
.mp-skip-link:focus:not(:focus-visible) {
  outline: none;
}
.${SKIP_LINK_TARGET_CLASS}:focus {
  outline: none;
}`;

function ensureSkipLinkStyles() {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(SKIP_LINK_STYLE_ID)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = SKIP_LINK_STYLE_ID;
  tag.textContent = skipLinkCss;
  document.head.appendChild(tag);
}

function resolveRadiusPx(token: string | number | undefined): number | undefined {
  if (typeof token === 'number' && Number.isFinite(token)) {
    return token;
  }
  if (typeof token !== 'string' || token.length === 0) {
    return undefined;
  }
  try {
    const value = getTokenValue(token as Parameters<typeof getTokenValue>[0], 'radius');
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function focusSkipTarget(target: HTMLElement) {
  const hadTabIndex = target.hasAttribute('tabindex');
  if (!hadTabIndex) {
    target.setAttribute('tabindex', '-1');
  }
  target.classList.add(SKIP_LINK_TARGET_CLASS);
  const cleanup = () => {
    if (!hadTabIndex) {
      target.removeAttribute('tabindex');
    }
    target.classList.remove(SKIP_LINK_TARGET_CLASS);
    target.removeEventListener('blur', cleanup);
  };
  target.addEventListener('blur', cleanup);
  target.focus();
}

// ── SkipLink Component ────────────────────────────────────────

/**
 * "Skip to content" link for keyboard users: visually hidden until it
 * receives focus (first Tab on the page), then revealed fixed top-start on
 * a themed elevated surface. Activating it (Enter/click) moves focus to the
 * target — GOV.UK's VoiceOver pattern: temporary `tabindex="-1"`, stripped
 * on blur, no ring on the landmark. Renders nothing on native.
 */
export function SkipLink({ targetId, targetRef, children = 'Skip to content', onSkip }: SkipLinkProps) {
  const { knobProps } = useResolvedKnobs({ component: 'SkipLink' });
  if (!isWeb) {
    return null;
  }
  ensureSkipLinkStyles();

  const radiusPx = resolveRadiusPx(knobProps.elevatedSurface.borderRadius);
  const href = targetId ? `#${targetId}` : '#';

  const handleActivate = (event: MouseEvent<HTMLAnchorElement>) => {
    let target: HTMLElement | null = null;
    if (targetRef?.current) {
      event.preventDefault();
      const current = targetRef.current;
      if (typeof (current as { focus?: () => void }).focus === 'function') {
        target = current as HTMLElement;
      }
    } else if (targetId && typeof document !== 'undefined') {
      target = document.getElementById(targetId);
    } else {
      event.preventDefault();
    }
    if (target) {
      focusSkipTarget(target);
    }
    onSkip?.(target instanceof HTMLElement ? target : null);
  };

  return (
    <a
      className="mp-skip-link"
      href={href}
      style={
        typeof radiusPx === 'number'
          ? ({
              borderRadius: radiusPx,
              ['--mp-skip-link-radius']: `${radiusPx}px`,
            } as CSSProperties)
          : undefined
      }
      onClick={handleActivate}>
      <SkipLinkSurface
        {...knobProps.elevatedSurface}
        borderWidth={Math.max(knobProps.elevatedSurface.borderWidth, 1)}
        elevation={knobProps.elevatedSurface.elevation ?? '$2'}>
        <SizableText {...knobProps.body} {...knobProps.label} fontWeight="400" color="$color12" whiteSpace="nowrap">
          {children}
        </SizableText>
      </SkipLinkSurface>
    </a>
  );
}

export type SkipLinkSurfaceProps = GetProps<typeof SkipLinkSurface>;
