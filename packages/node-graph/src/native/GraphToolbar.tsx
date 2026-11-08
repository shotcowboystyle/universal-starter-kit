/**
 * The toolbar that owns the interaction mode (design §7.3, §7.5; task 3.6).
 *
 * It lives under `src/native/` because the shell it belongs to is the native
 * one — a WebView cannot draw chrome the OS will treat as chrome, and design
 * §7.6 already puts every control outside the canvas. It is NOT a `.native.tsx`
 * twin: it is plain Tamagui and it renders identically on the web canvas, which
 * is what makes the web story a real rehearsal of the phone rather than a
 * different component that happens to look similar.
 *
 * MILESTONE 6 GAVE IT THE REST OF THE CONTROLS. Tidy, Undo and Redo used to
 * live inside `NodeGraph/AutoLayout` as `children` of the canvas, which native
 * drops — so on device the story painted 12 nodes with no way to lay them out,
 * `layoutRunner` read `none` on every host, and MPO-213's device criterion had
 * no way to be attempted. They are here now because here is a SIBLING, and a
 * sibling is one of the two legal places a control can go (design §9.1). Each
 * is rendered only when its handler is given, so a canvas with no auto-layout
 * does not grow three dead buttons.
 *
 * Two decisions worth stating:
 *
 *  - `fitView` is a BUTTON and not a double-tap. Design §7.5: a hidden gesture
 *    that fights the platform's own double-tap zoom is worse than a visible
 *    control. It renders only when a handler is given, so a read-only canvas
 *    does not grow a dead button.
 *  - selection is exposed explicitly to the shared house Button, which owns
 *    selected paint and the control recipes on both platforms.
 *
 * The toolbar surface resolves its own layout fragments. Its controls use the
 * canonical forms Button so radius, type and interaction states keep one owner.
 *
 * A11y is expressed with `role` / `aria-*` and not with the React Native
 * `accessibility*` names, matching the house count (113 `aria-label` against 15
 * `accessibilityLabel` under public/components, and `role="toolbar"` in
 * `layouts/toolbar.tsx`). Measured in Chrome: Tamagui's `Button` forwards
 * `accessibilityLabel`, `accessibilityRole` and `accessibilityState` straight to
 * the DOM node, and React logs an error per prop per button. React Native
 * >= 0.71 understands `aria-*` and `role`, so this is the spelling that is
 * correct on both platforms rather than a web-only concession.
 */

import { Button } from '@repo/forms';
import { pressTargetStyle, useResolvedKnobs } from '@repo/theme';
import { XStack, isWeb } from 'tamagui';

import type { GraphInteractionMode } from '../interaction/use-lasso-select';

export interface GraphToolbarProps {
  readonly mode: GraphInteractionMode;
  readonly onModeChange: (mode: GraphInteractionMode) => void;
  /** Design §7.5. Omitted, the button is not rendered. */
  readonly onFitView?: () => void;
  /** Auto-layout, design §8. Omitted, the button is not rendered. */
  readonly onTidy?: () => void;
  readonly onUndo?: () => void;
  readonly onRedo?: () => void;
  /**
   * Undo and Redo are disabled from the HOST's knowledge of the history, not
   * from the canvas's.
   *
   * On native the journal lives on the far side of the bridge and nothing
   * reports `canUndo` across it, so a native shell that has applied commits
   * knows this and the canvas does not. Both default to enabled: a disabled
   * button that should have worked is a worse failure than a press that turns
   * out to be a no-op, and `history.undo` returns the same document when there
   * is nothing to undo.
   */
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  /** True while a relayout is in flight, so Tidy cannot be double-pressed. */
  readonly busy?: boolean;
  readonly disabled?: boolean;
}

const modeLabels: Record<GraphInteractionMode, string> = {
  pan: 'Pan',
  select: 'Select',
};

const modes: readonly GraphInteractionMode[] = ['pan', 'select'];

export const GraphToolbar = ({
  busy = false,
  canRedo = true,
  canUndo = true,
  disabled,
  mode,
  onFitView,
  onModeChange,
  onRedo,
  onTidy,
  onUndo,
}: GraphToolbarProps) => {
  const { knobProps } = useResolvedKnobs({ component: 'GraphToolbar' });

  return (
    <XStack
      role="toolbar"
      alignItems="center"
      {...knobProps.gap}
      {...knobProps.panelPadding}
      {...knobProps.elevatedSurface}
      flexWrap="wrap"
      maxWidth="100%"
      minWidth={0}
      flexShrink={1}>
      {modes.map((candidate) => {
        const active = candidate === mode;
        return (
          <Button
            key={candidate}
            aria-label={`${modeLabels[candidate]} mode`}
            {...(isWeb ? { 'aria-pressed': active } : { 'aria-selected': active })}
            selected={active}
            chromeless={!active}
            disabled={disabled}
            onPress={() => {
              onModeChange(candidate);
            }}
            size={knobProps.sizeToken}
            {...pressTargetStyle()}>
            {modeLabels[candidate]}
          </Button>
        );
      })}
      {onFitView ? (
        <Button
          aria-label="Fit the graph to the view"
          chromeless
          disabled={disabled}
          onPress={onFitView}
          size={knobProps.sizeToken}
          {...pressTargetStyle()}>
          Fit
        </Button>
      ) : null}
      {onTidy ? (
        <Button
          aria-label="Tidy the graph"
          chromeless
          disabled={disabled ?? busy}
          onPress={onTidy}
          size={knobProps.sizeToken}
          {...pressTargetStyle()}>
          {busy ? 'Tidying…' : 'Tidy'}
        </Button>
      ) : null}
      {onUndo ? (
        <Button
          aria-label="Undo"
          chromeless
          disabled={disabled ?? !canUndo}
          onPress={onUndo}
          size={knobProps.sizeToken}
          {...pressTargetStyle()}>
          Undo
        </Button>
      ) : null}
      {onRedo ? (
        <Button
          aria-label="Redo"
          chromeless
          disabled={disabled ?? !canRedo}
          onPress={onRedo}
          size={knobProps.sizeToken}
          {...pressTargetStyle()}>
          Redo
        </Button>
      ) : null}
    </XStack>
  );
};
