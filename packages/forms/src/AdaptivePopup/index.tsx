import { OVERLAY_BREAKPOINT, ensureFocusVisibleRing, useResolvedKnobs } from '@repo/theme';
import { X } from '@tamagui/lucide-icons-2';
import { useCallback, useRef, type ReactNode } from 'react';
import { Dialog, isWeb, Sheet, Unspaced, useMedia, View, VisuallyHidden, XStack, YStack } from 'tamagui';

import { useViewportGtSm } from '../FloatingPanel';
import { formCommonColors } from '../shared/colorRamps';
import { DialogShowFocus, useReturnFocusOnClose, useSheetModalFocus } from '../shared/focusManagement';
import { t } from '../shared/t';
import { useSheetEscapeDismiss } from '../shared/useSheetEscapeDismiss';
import { zIndex } from '../shared/zIndex';

export interface AdaptivePopupProps {
  /** Controlled open state */
  open: boolean;
  /** Callback when popup opens/closes */
  onOpenChange: (open: boolean) => void;
  /** Optional trigger element. If not provided, control open state externally. */
  trigger?: ReactNode;
  /** Title shown in the header */
  title?: ReactNode;
  /** Description shown below the title */
  description?: ReactNode;
  /** Main content */
  children: ReactNode;
  /**
   * Size of the popup on desktop.
   * - `sm`: 400px max width
   * - `md`: 600px max width (default)
   * - `lg`: 800px max width
   * - `xl`: 1000px max width
   * - `fullscreen`: fills viewport with padding
   */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
  /**
   * Desktop face. `"drawer"` is the edge-anchored companion (C22) above
   * `OVERLAY_BREAKPOINT`. At the breakpoint and below the drawer face does
   * not exist — the same props render the existing sheet. `size="fullscreen"`
   * stays dialog-family. Default `"dialog"`.
   */
  face?: 'dialog' | 'drawer';
  /** Whether to show the close button. Default true. */
  showCloseButton?: boolean;
  /** Custom footer content (e.g. action buttons) */
  footer?: ReactNode;
  /** Whether to disable the trigger */
  disabled?: boolean;
}

const sizeToWidth: Record<NonNullable<AdaptivePopupProps['size']>, number | string> = {
  sm: 400,
  md: 600,
  lg: 800,
  xl: 1000,
  fullscreen: '95vw',
};

const sizeToHeight: Record<NonNullable<AdaptivePopupProps['size']>, number | string> = {
  sm: 'auto',
  md: 'auto',
  lg: 'auto',
  xl: 'auto',
  fullscreen: '90vh',
};

export type AdaptivePopupRenderedFace = 'dialog' | 'drawer' | 'sheet';

/**
 * Face-picking rule (C22): ≤ OVERLAY_BREAKPOINT always sheet; above it,
 * `face="drawer"` → edge panel unless `size="fullscreen"` (dialog-family).
 * A panel the user keeps open is SupportingPaneLayout, not this overlay.
 */
export function pickAdaptivePopupFace(options: {
  face?: AdaptivePopupProps['face'];
  size?: AdaptivePopupProps['size'];
  viewportWidth: number;
}): AdaptivePopupRenderedFace {
  if (options.viewportWidth <= OVERLAY_BREAKPOINT) {
    return 'sheet';
  }
  if (options.size === 'fullscreen') {
    return 'dialog';
  }
  if (options.face === 'drawer') {
    return 'drawer';
  }
  return 'dialog';
}

function readRtl(): boolean {
  return isWeb && typeof document !== 'undefined' && document.documentElement.getAttribute('dir') === 'rtl';
}

/**
 * The overlay frame is not a control. Auto-focus on open (Radix /
 * Sheet) must not paint a ring on the panel; the first inner field rings if
 * the open was keyboard-origin (text-entry carve-out) or the close control
 * rings when Tab reaches it.
 */
const overlayFrameFocus = {
  outlineWidth: 0,
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: { outlineWidth: 0 },
} as const;

/**
 * Overlay close: nested density, keyboard-only ring on the painted
 * circle. House Button's circular press floor is the page 44px well —
 * too big for dialog chrome, and it would put the ring on that well instead
 * of the glyph the user reads as the control.
 */
function PopupCloseButton({ onPress }: { onPress: () => void }) {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const { px, hitSlop, ...box } = knobProps.nestedControl;
  const glyph = Math.max(12, Math.round(px * 0.5));
  const onKeyDown = (e: { key?: string; preventDefault?: () => void }) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault?.();
      onPress();
    }
  };
  return (
    <View
      {...box}
      position="absolute"
      top={0}
      right={0}
      zIndex={1}
      role="button"
      aria-label={t('Close')}
      data-testid="adaptive-popup-close"
      data-nested-px={px}
      cursor="pointer"
      alignItems="center"
      justifyContent="center"
      borderRadius={knobProps.pointy ? 0 : 9999}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing()}
      onPress={onPress}
      {...(!isWeb ? { hitSlop } : {})}
      {...(isWeb
        ? { tabIndex: 0, onKeyDown: onKeyDown as unknown as () => void }
        : { accessible: true, accessibilityRole: 'button', accessibilityLabel: t('Close') })}>
      <X size={glyph} color={formCommonColors.muted} />
    </View>
  );
}

function focusFirstField(event: Event) {
  const root = event.currentTarget as HTMLElement | null;
  const field = root?.querySelector<HTMLElement>("input, textarea, select, [contenteditable='true']");
  if (!field) {
    return;
  }
  event.preventDefault();
  field.focus({ preventScroll: true });
}

export function AdaptivePopup({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  size = 'md',
  face = 'dialog',
  showCloseButton = true,
  footer,
  disabled,
}: AdaptivePopupProps) {
  const { knobProps } = useResolvedKnobs();
  const { knobProps: nestedKnobs } = useResolvedKnobs({ compact: true });
  const media = useMedia();
  const viewportGtSm = useViewportGtSm();
  // `media.sm` = v5 minWidth 640 (`gtSm` died with the v5 media map)
  // — SSR fallback only; the viewport hook wins on client.
  const isDesktop = typeof window !== 'undefined' ? viewportGtSm : media.sm;
  const renderedFace = pickAdaptivePopupFace({
    face,
    size,
    viewportWidth: isDesktop ? OVERLAY_BREAKPOINT + 1 : OVERLAY_BREAKPOINT,
  });
  const rtl = readRtl();
  // Sheet mode only: the desktop Dialog already dismisses via Dismissable.
  useSheetEscapeDismiss(open && renderedFace === 'sheet', () => {
    onOpenChange(false);
  });
  // Tamagui's focus scope only restores focus when a
  // Dialog.Trigger lives inside the Dialog — this popup is (also) opened
  // programmatically, so close dropped focus on <body>. Restore it ourselves;
  // sheet mode additionally moves focus in and traps Tab (Sheet has no scope).
  const sheetFrameRef = useRef<HTMLElement | null>(null);
  useReturnFocusOnClose(open && renderedFace !== 'sheet');
  useSheetModalFocus(open && renderedFace === 'sheet', sheetFrameRef);

  const maxWidth = sizeToWidth[size];
  const maxHeight = sizeToHeight[size];
  const closePx = nestedKnobs.nestedControl.px;
  const drawerWidth = typeof maxWidth === 'number' ? maxWidth : sizeToWidth.md;
  const { borderRadius: drawerFreeRadius, ...drawerRadiusRest } = knobProps.containerRadius;

  const openFromTrigger = useCallback(() => {
    if (!disabled) {
      onOpenChange(true);
    }
  }, [disabled, onOpenChange]);
  // `trigger` is a SLOT: the wrapper below is what opens the popup, so the
  // press has to travel from whatever the consumer put in the slot out to that
  // wrapper. Tamagui's press wrapper calls `e.stopPropagation()` on any
  // component carrying its own `onPress`/`onClick` (`@tamagui/web`
  // `createComponent`, the `onPress` branch), so a PRESSABLE trigger — a
  // Button, which is what every doc example and every story passes — swallowed
  // the click and neither branch ever opened. The capture phase runs before
  // any descendant handler and cannot be swallowed, and it also catches the
  // click Button synthesizes for Enter/Space. Opening is idempotent
  // (`onOpenChange(true)`, never a toggle), so it composes safely with the
  // bubble-phase path a non-pressable trigger still takes.
  const triggerActivation = isWeb ? ({ onClickCapture: openFromTrigger } as Record<string, unknown>) : undefined;

  // The wrapper is a press-relay, not a control. The painted
  // trigger (usually a Button) is the perceived boundary and the only tab stop.
  // Web: capture-phase click is enough — putting `onPress` on this View makes
  // Tamagui promote it to role=button and steal the ring. Native: the wrapper
  // owns the gesture (no capture phase).
  const triggerWrap = {
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    'data-testid': 'adaptive-popup-trigger',
    ...(isWeb ? { tabIndex: -1, role: 'presentation' as const, ...triggerActivation } : { onPress: openFromTrigger }),
  };

  const headerContent = (title || showCloseButton) && (
    <Unspaced>
      <XStack
        justifyContent="space-between"
        alignItems="center"
        paddingRight={showCloseButton ? closePx : undefined}
        minHeight={showCloseButton ? closePx : undefined}>
        {title ? (
          <YStack flex={1}>
            <Dialog.Title {...knobProps.heading}>{title}</Dialog.Title>
          </YStack>
        ) : null}
      </XStack>
    </Unspaced>
  );

  const footerContent = footer && <YStack paddingTop="$2">{footer}</YStack>;

  const body = (
    <YStack flex={size === 'fullscreen' ? 1 : undefined} position="relative" {...knobProps.gap}>
      {!title ? (
        <VisuallyHidden>
          <Dialog.Title>Dialog</Dialog.Title>
        </VisuallyHidden>
      ) : null}
      {headerContent}
      {description ? (
        <Dialog.Description {...knobProps.body} {...knobProps.label} color={formCommonColors.muted}>
          {description}
        </Dialog.Description>
      ) : (
        <VisuallyHidden>
          <Dialog.Description> </Dialog.Description>
        </VisuallyHidden>
      )}
      <YStack flex={size === 'fullscreen' ? 1 : undefined}>{children}</YStack>
      {footerContent}
      {showCloseButton ? (
        <PopupCloseButton
          onPress={() => {
            onOpenChange(false);
          }}
        />
      ) : null}
    </YStack>
  );

  // Compact: sheet. Regular: modal dialog (form sheet). Drawer is the third
  // face: edge-anchored companion above the overlay breakpoint. Same 860
  // pivot as FloatingPanel (useViewportGtSm) — never Tamagui Adapt. Popover
  // is the wrong desktop primitive here — AdaptivePopup is a titled form
  // with a footer, not a small anchored bubble (that's FloatingPanel).
  if (renderedFace === 'sheet') {
    return (
      <>
        {trigger && <View {...triggerWrap}>{trigger}</View>}
        <Sheet
          modal
          open={open}
          onOpenChange={onOpenChange}
          dismissOnSnapToBottom
          dismissOnOverlayPress
          moveOnKeyboardChange
          snapPointsMode={size === 'fullscreen' ? 'percent' : 'fit'}
          snapPoints={size === 'fullscreen' ? [92] : undefined}
          zIndex={zIndex.sheet}
          transition={knobProps.transition}>
          <Sheet.Overlay
            backgroundColor="$shadow6"
            transition={knobProps.transition}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Sheet.Handle {...({ 'aria-hidden': true } as Record<string, unknown>)} />
          <Sheet.Frame
            // Sheet.Frame forwards its ref at runtime; the styled prop type
            // just omits `ref`, hence the cast. tabIndex -1 makes the frame a
            // programmatic focus target without joining the tab order.
            {...({
              ref: sheetFrameRef,
              tabIndex: -1,
            } as Record<string, unknown>)}
            unstyled
            position="relative"
            role="dialog"
            aria-modal={true}
            aria-label={typeof title === 'string' ? title : 'Dialog'}
            data-testid="adaptive-popup-surface"
            data-adaptive-popup-mode="sheet"
            {...knobProps.elevatedSurface}
            borderBottomLeftRadius={0}
            borderBottomRightRadius={0}
            {...overlayFrameFocus}
            {...knobProps.panelPadding}
            transition={knobProps.transition}>
            {body}
          </Sheet.Frame>
        </Sheet>
      </>
    );
  }

  if (renderedFace === 'drawer') {
    const attached = 0;
    const free = drawerFreeRadius;
    const drawerRadius = rtl
      ? {
          borderTopLeftRadius: attached,
          borderBottomLeftRadius: attached,
          borderTopRightRadius: free,
          borderBottomRightRadius: free,
        }
      : {
          borderTopRightRadius: attached,
          borderBottomRightRadius: attached,
          borderTopLeftRadius: free,
          borderBottomLeftRadius: free,
        };
    const slideFromEnd = rtl ? -24 : 24;
    return (
      <Dialog modal open={open} onOpenChange={onOpenChange}>
        {trigger && (
          <Dialog.Trigger asChild disabled={disabled}>
            <View {...triggerWrap}>{trigger}</View>
          </Dialog.Trigger>
        )}

        <Dialog.Portal zIndex={zIndex.dropdown}>
          <Dialog.Overlay
            key="overlay"
            backgroundColor="$shadow6"
            transition={knobProps.transition}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            key="content"
            unstyled
            position="fixed"
            top={0}
            bottom={0}
            {...(rtl ? { left: 0 } : { right: 0 })}
            height="100%"
            width={drawerWidth}
            maxHeight="100%"
            margin={0}
            x={0}
            y={0}
            pointerEvents="auto"
            tabIndex={-1}
            data-testid="adaptive-popup-surface"
            data-adaptive-popup-mode="drawer"
            data-popup-ground="$background"
            data-drawer-gap="0"
            data-drawer-edge="inline-end"
            data-popup-width={String(drawerWidth)}
            data-drawer-attached-radius="0"
            {...knobProps.elevatedSurface}
            {...drawerRadiusRest}
            {...drawerRadius}
            elevate={false}
            elevation={knobProps.elevatedSurface.elevation}
            backgroundColor="$background"
            {...overlayFrameFocus}
            transition={knobProps.transition}
            animateOnly={['transform', 'opacity']}
            enterStyle={{ opacity: 0, x: slideFromEnd }}
            exitStyle={{ opacity: 0, x: slideFromEnd }}
            {...knobProps.panelPadding}
            onOpenAutoFocus={focusFirstField}
            onCloseAutoFocus={(event) => {
              // Dialog.Trigger is the wrapper View (tabIndex -1), not
              // the painted Button. Prevent Radix restoring there so
              // useReturnFocusOnClose can return to the opener.
              event.preventDefault();
            }}>
            {body}
            <DialogShowFocus onOpenAutoFocus={focusFirstField} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    );
  }

  return (
    <Dialog modal open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <Dialog.Trigger asChild disabled={disabled}>
          <View {...triggerWrap}>{trigger}</View>
        </Dialog.Trigger>
      )}

      <Dialog.Portal zIndex={zIndex.dropdown}>
        <Dialog.Overlay
          key="overlay"
          backgroundColor="$shadow6"
          transition={knobProps.transition}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Dialog.Content
          key="content"
          // Dialog.Content's styled base bakes in `elevate: true` (plus its
          // own bg/border/radius/padding); `unstyled` drops that so the
          // elevatedSurface knob recipe (SF-OVERLAY/E-OVERLAY) is the only
          // surface source and elevation `none` actually flattens.
          unstyled
          position="relative"
          pointerEvents="auto"
          tabIndex={-1}
          data-testid="adaptive-popup-surface"
          data-adaptive-popup-mode="dialog"
          {...knobProps.elevatedSurface}
          {...overlayFrameFocus}
          transition={knobProps.transition}
          animateOnly={['transform', 'opacity']}
          enterStyle={{ opacity: 0, scale: 0.96, y: -10 }}
          exitStyle={{ opacity: 0, scale: 0.96, y: -10 }}
          maxWidth={maxWidth}
          maxHeight={maxHeight}
          width="90vw"
          {...knobProps.panelPadding}
          onOpenAutoFocus={focusFirstField}
          onCloseAutoFocus={(event) => {
            // Dialog.Trigger is the wrapper View (tabIndex -1), not
            // the painted Button. Prevent Radix restoring there so
            // useReturnFocusOnClose can return to the opener.
            event.preventDefault();
          }}>
          {body}
          <DialogShowFocus onOpenAutoFocus={focusFirstField} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
