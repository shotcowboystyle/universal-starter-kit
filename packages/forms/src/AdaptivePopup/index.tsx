import { OVERLAY_BREAKPOINT, ensureFocusVisibleRing, useResolvedKnobs } from '@repo/theme';
import { X } from '@tamagui/lucide-icons-2';
import { useCallback, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { Dialog, isWeb, Sheet, Unspaced, useMedia, View, VisuallyHidden, XStack, YStack } from 'tamagui';

import { useViewportGtSm } from '../FloatingPanel';
import { formCommonColors } from '../shared/color-ramps';
import { DialogShowFocus, useReturnFocusOnClose, useSheetModalFocus } from '../shared/focus-management';
import { t } from '../shared/t';
import { useSheetEscapeDismiss } from '../shared/use-sheet-escape-dismiss';
import { zIndex } from '../shared/z-index';

export type AdaptivePopupSize = 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';

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
  size?: AdaptivePopupSize;
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

const POPUP_WIDTHS = { sm: 400, md: 600, lg: 800, xl: 1000 } as const;
const FULLSCREEN_WIDTH = '95vw';
const FULLSCREEN_HEIGHT = '90vh';

const widthFor = (size: AdaptivePopupSize): number | string =>
  size === 'fullscreen' ? FULLSCREEN_WIDTH : POPUP_WIDTHS[size];

const heightFor = (size: AdaptivePopupSize): string => (size === 'fullscreen' ? FULLSCREEN_HEIGHT : 'auto');

/** The drawer is never fullscreen (that size stays dialog-family), so it reads the `md` width then. */
const drawerWidthFor = (size: AdaptivePopupSize): number => POPUP_WIDTHS[size === 'fullscreen' ? 'md' : size];

export type AdaptivePopupRenderedFace = 'dialog' | 'drawer' | 'sheet';

/**
 * Face-picking rule (C22): ≤ OVERLAY_BREAKPOINT always sheet; above it,
 * `face="drawer"` → edge panel unless `size="fullscreen"` (dialog-family).
 * A panel the user keeps open is SupportingPaneLayout, not this overlay.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- public face-picking rule consumed by tests and callers alongside the component
export const pickAdaptivePopupFace = (options: {
  face?: AdaptivePopupProps['face'];
  size?: AdaptivePopupProps['size'];
  viewportWidth: number;
}): AdaptivePopupRenderedFace => {
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
};

const readRtl = (): boolean =>
  isWeb && typeof document !== 'undefined' && document.documentElement.getAttribute('dir') === 'rtl';

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
const PopupCloseButton = ({ onPress }: { onPress: () => void }) => {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const { px, hitSlop, ...box } = knobProps.nestedControl;
  const glyph = Math.max(12, Math.round(px * 0.5));
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
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
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui View renders on native too, where role is the only button semantic
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
      {...(isWeb ? {} : { hitSlop })}
      {...(isWeb
        ? { tabIndex: 0, onKeyDown }
        : { accessible: true, accessibilityRole: 'button', accessibilityLabel: t('Close') })}>
      <X
        size={glyph}
        color={formCommonColors.muted}
      />
    </View>
  );
};

const focusFirstField = (event: Event) => {
  const root = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const field = root?.querySelector<HTMLElement>("input, textarea, select, [contenteditable='true']");
  if (!field) {
    return;
  }
  event.preventDefault();
  field.focus({ preventScroll: true });
};

// oxlint-disable-next-line anti-slop/no-runtime-typeof -- ReactNode has no discriminant; only a string title is usable as an aria-label
const dialogLabel = (title: ReactNode): string => (typeof title === 'string' ? title : 'Dialog');

interface PopupBodyProps {
  title: ReactNode;
  description: ReactNode;
  footer: ReactNode;
  size: AdaptivePopupSize;
  showCloseButton: boolean;
  onClose: () => void;
  children: ReactNode;
}

const PopupBody = ({ title, description, footer, size, showCloseButton, onClose, children }: PopupBodyProps) => {
  const { knobProps } = useResolvedKnobs();
  const { knobProps: nestedKnobs } = useResolvedKnobs({ compact: true });
  const closePx = nestedKnobs.nestedControl.px;
  const hasTitle = Boolean(title);
  const hasDescription = Boolean(description);
  const hasFooter = Boolean(footer);
  const fill = size === 'fullscreen' ? 1 : undefined;

  const headerContent =
    hasTitle || showCloseButton ? (
      <Unspaced>
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingRight={showCloseButton ? closePx : undefined}
          minHeight={showCloseButton ? closePx : undefined}>
          {hasTitle ? (
            <YStack flex={1}>
              <Dialog.Title {...knobProps.heading}>{title}</Dialog.Title>
            </YStack>
          ) : null}
        </XStack>
      </Unspaced>
    ) : null;

  const footerContent = hasFooter ? <YStack paddingTop="$2">{footer}</YStack> : null;

  return (
    <YStack
      flex={fill}
      position="relative"
      {...knobProps.gap}>
      {hasTitle ? null : (
        <VisuallyHidden>
          <Dialog.Title>Dialog</Dialog.Title>
        </VisuallyHidden>
      )}
      {headerContent}
      {hasDescription ? (
        <Dialog.Description
          {...knobProps.body}
          {...knobProps.label}
          color={formCommonColors.muted}>
          {description}
        </Dialog.Description>
      ) : (
        <VisuallyHidden>
          <Dialog.Description> </Dialog.Description>
        </VisuallyHidden>
      )}
      <YStack flex={fill}>{children}</YStack>
      {footerContent}
      {showCloseButton ? <PopupCloseButton onPress={onClose} /> : null}
    </YStack>
  );
};

interface PopupTriggerProps {
  trigger: ReactNode;
  disabled: boolean | undefined;
  onOpenChange: (open: boolean) => void;
  /** Desktop faces wrap the slot in Dialog.Trigger; the sheet face does not. */
  inDialog: boolean;
}

const PopupTrigger = ({ trigger, disabled, onOpenChange, inDialog }: PopupTriggerProps) => {
  const openFromTrigger = useCallback(() => {
    if (!disabled) {
      onOpenChange(true);
    }
  }, [disabled, onOpenChange]);
  if (trigger === null || trigger === undefined || trigger === false || trigger === '') {
    return null;
  }
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
  const triggerActivation = isWeb ? { onClickCapture: openFromTrigger } : undefined;

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
  const wrapped = <View {...triggerWrap}>{trigger}</View>;
  if (!inDialog) {
    return wrapped;
  }
  return (
    <Dialog.Trigger
      asChild
      disabled={disabled}>
      {wrapped}
    </Dialog.Trigger>
  );
};

interface PopupFaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  disabled: boolean | undefined;
  size: AdaptivePopupSize;
  body: ReactNode;
}

const SheetFace = ({
  open,
  onOpenChange,
  trigger,
  disabled,
  size,
  body,
  frameRef,
  label,
}: PopupFaceProps & { frameRef: RefObject<HTMLElement | null>; label: string }) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <>
      <PopupTrigger
        trigger={trigger}
        disabled={disabled}
        onOpenChange={onOpenChange}
        inDialog={false}
      />
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
        <Sheet.Handle {...{ 'aria-hidden': true }} />
        <Sheet.Frame
          // Sheet.Frame forwards its ref at runtime; the styled prop type
          // just omits `ref`, hence the spread. tabIndex -1 makes the frame a
          // programmatic focus target without joining the tab order.
          {...{
            ref: frameRef,
            tabIndex: -1,
          }}
          unstyled
          position="relative"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Sheet.Frame is a Tamagui view that also renders on native; role is its dialog semantic
          role="dialog"
          aria-modal={true}
          aria-label={label}
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
};

const DrawerFace = ({ open, onOpenChange, trigger, disabled, size, body }: PopupFaceProps) => {
  const { knobProps } = useResolvedKnobs();
  const rtl = readRtl();
  const drawerWidth = drawerWidthFor(size);
  const { borderRadius: drawerFreeRadius, ...drawerRadiusRest } = knobProps.containerRadius;
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
    <Dialog
      modal
      open={open}
      onOpenChange={onOpenChange}>
      <PopupTrigger
        trigger={trigger}
        disabled={disabled}
        onOpenChange={onOpenChange}
        inDialog
      />

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
};

const DialogFace = ({ open, onOpenChange, trigger, disabled, size, body }: PopupFaceProps) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <Dialog
      modal
      open={open}
      onOpenChange={onOpenChange}>
      <PopupTrigger
        trigger={trigger}
        disabled={disabled}
        onOpenChange={onOpenChange}
        inDialog
      />

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
          maxWidth={widthFor(size)}
          maxHeight={heightFor(size)}
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
};

export const AdaptivePopup = ({
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
}: AdaptivePopupProps) => {
  const media = useMedia();
  const viewportGtSm = useViewportGtSm();
  // `media.sm` = v5 minWidth 640 (`gtSm` died with the v5 media map)
  // — SSR fallback only; the viewport hook wins on client.
  const isDesktop = typeof window === 'undefined' ? media.sm : viewportGtSm;
  const renderedFace = pickAdaptivePopupFace({
    face,
    size,
    viewportWidth: isDesktop ? OVERLAY_BREAKPOINT + 1 : OVERLAY_BREAKPOINT,
  });
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

  const body = (
    <PopupBody
      title={title}
      description={description}
      footer={footer}
      size={size}
      showCloseButton={showCloseButton}
      onClose={() => {
        onOpenChange(false);
      }}>
      {children}
    </PopupBody>
  );
  const faceProps = { open, onOpenChange, trigger, disabled, size, body };

  // Compact: sheet. Regular: modal dialog (form sheet). Drawer is the third
  // face: edge-anchored companion above the overlay breakpoint. Same 860
  // pivot as FloatingPanel (useViewportGtSm) — never Tamagui Adapt. Popover
  // is the wrong desktop primitive here — AdaptivePopup is a titled form
  // with a footer, not a small anchored bubble (that's FloatingPanel).
  if (renderedFace === 'sheet') {
    return (
      <SheetFace
        {...faceProps}
        frameRef={sheetFrameRef}
        label={dialogLabel(title)}
      />
    );
  }
  if (renderedFace === 'drawer') {
    return <DrawerFace {...faceProps} />;
  }
  return <DialogFace {...faceProps} />;
};
