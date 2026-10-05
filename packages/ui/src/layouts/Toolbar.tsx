import { Button } from '@repo/forms';
import {
  MIN_PRESS_TARGET,
  Surface,
  hairline,
  hairlineWidth,
  pressTargetHitSlop,
  pressTargetStyle,
  useResolvedKnobs,
} from '@repo/theme';
import type React from 'react';
import { Group, Separator, Text, XStack, isWeb } from 'tamagui';

import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';

export interface ToolbarAction {
  label: string;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'outlined' | 'destructive';
  disabled?: boolean;
  /**
   * Explains why the action is disabled. Flows through the Button
   * contract (visible reason, aria-describedby, stays focusable). A bare
   * `disabled` without it DEV-warns `bare-disabled`.
   */
  disabledReason?: string;
  loading?: boolean;
  /**
   * When true, consecutive fused actions render as one segmented Group
   * (true picker/segment semantics). Independent actions leave this unset
   * and receive real gap (component.gallery Toolbar / Button-group consensus).
   */
  fused?: boolean;
}

export interface ToolbarProps {
  primaryActions?: ToolbarAction[];
  secondaryActions?: ToolbarAction[];
  position?: 'top' | 'bottom';
  /** Label to display when an action is loading (default: "Loading...") */
  loadingLabel?: string;
}

type ActionCluster = { kind: 'independent'; actions: ToolbarAction[] } | { kind: 'fused'; actions: ToolbarAction[] };

function clusterActions(actions: ToolbarAction[]): ActionCluster[] {
  const clusters: ActionCluster[] = [];
  for (const action of actions) {
    const prev = clusters[clusters.length - 1];
    if (action.fused) {
      if (prev?.kind === 'fused') {
        prev.actions.push(action);
      } else {
        clusters.push({ kind: 'fused', actions: [action] });
      }
    } else if (prev?.kind === 'independent') {
      prev.actions.push(action);
    } else {
      clusters.push({ kind: 'independent', actions: [action] });
    }
  }
  return clusters;
}

function partitionByDestructive(actions: ToolbarAction[]) {
  const neutral: ToolbarAction[] = [];
  const destructive: ToolbarAction[] = [];
  for (const action of actions) {
    if (action.variant === 'destructive') {
      destructive.push(action);
    } else {
      neutral.push(action);
    }
  }
  return { neutral, destructive };
}

export function Toolbar(props: ToolbarProps) {
  // Toolbar chrome is small + compact (Primer ActionBar / Spectrum quiet /
  // Linear). Previously this rode `compact: true` (which then stepped size AND
  // space); with the axes split, the Surface host declares the same intent
  // lawfully: a subtree ceiling, so hosted actions clamp to
  // small+compact while ambient pages keep their own size.
  return (
    <Surface size="small" density="compact">
      <ToolbarInner {...props} />
    </Surface>
  );
}

function ToolbarInner({
  primaryActions = [],
  secondaryActions = [],
  position = 'top',
  loadingLabel: loadingLabelProp,
}: ToolbarProps) {
  const { t } = useTranslation();
  const loadingLabel = loadingLabelProp ?? t('Loading...');
  // Must run inside <Surface> so size/density clamp to this ceiling.
  // Painted actions stay ≥44 via the pressTarget* channel.
  const { knobProps } = useResolvedKnobs();
  // Recipe height, not the flat token ramp — `sizeToken` is the recipe KEY
  // Flat `$3` is 36 while the painted small control is 28, which
  // under-slopped the native press target below the 44 floor.
  const sizePx = knobProps.control.height;
  const pressFloor = pressTargetStyle();
  const actionHitSlop = pressTargetHitSlop(sizePx);

  // Route emphasis through the intent system (accent/error) instead of
  // hardcoded color themes, so toolbar actions share the app's one solid
  // emphasis language.
  const getButtonIntents = (variant?: string) => ({
    accent: variant === 'primary',
    error: variant === 'destructive',
  });

  const renderAction = (action: ToolbarAction) => (
    <Button
      key={action.label}
      icon={action.icon as any}
      onPress={action.onPress}
      disabled={action.disabled}
      // Busy is derived state, not a bare disable — Button shows the spinner
      // and skips the bare-disabled warn; loadingLabel stays for SRs.
      loading={action.loading}
      aria-label={action.loading ? loadingLabel : undefined}
      disabledReason={action.disabledReason}
      disabledReasonPlacement="inline"
      flexShrink={0}
      {...getButtonIntents(action.variant)}
      // Axiom 13 ONE BODY: the Toolbar's `outlined` variant maps to the
      // Button's canonical boolean `outlined` prop. Passing it as a string
      // `variant` matched no styled-frame key and silently dissolved.
      outlined={action.variant === 'outlined'}
      {...pressFloor}
      {...(!isWeb ? { hitSlop: actionHitSlop } : undefined)}>
      {/* §6.1: action labels measure 400 on the TEXT NODE. */}
      <Text fontWeight="400">{action.label}</Text>
    </Button>
  );

  const renderClusters = (actions: ToolbarAction[], region: string) =>
    clusterActions(actions).map((cluster, index) => {
      if (cluster.kind === 'fused') {
        return (
          <Group
            key={`${region}-fused-${index}`}
            orientation="horizontal"
            flexWrap="nowrap"
            flexShrink={0}
            data-toolbar-cluster="fused"
            data-toolbar-region={region}>
            {cluster.actions.map((action) => (
              <Group.Item key={action.label}>{renderAction(action)}</Group.Item>
            ))}
          </Group>
        );
      }
      return (
        <XStack
          key={`${region}-independent-${index}`}
          {...knobProps.gap}
          alignItems="center"
          flexWrap="nowrap"
          flexShrink={0}
          data-toolbar-cluster="independent"
          data-toolbar-region={region}>
          {cluster.actions.map((action) => renderAction(action))}
        </XStack>
      );
    });

  const { neutral: secondaryNeutral, destructive: secondaryDestructive } = partitionByDestructive(secondaryActions);
  const hasTrailing = secondaryNeutral.length > 0 || secondaryDestructive.length > 0;

  // Two bar children only (start cluster + trailing cluster). The separator
  // lives INSIDE the trailing cluster between neutral and destructive so it
  // cannot float mid-bar under space-between.
  // Primer ActionBar / Spectrum ActionBar / Linear: one row, leading groups
  // scroll, trailing (incl. destructive) stays pinned.
  return (
    <XStack
      role="toolbar"
      aria-label={t('Toolbar')}
      // Earned inset: the bar paints no
      // distinguishable surface — SF-TRANSPARENT, so it earns no horizontal
      // inset. Spread the panelPadding recipe whole, then eject the
      // horizontal sides. Vertical padding stays (rhythm against the
      // divider edge the bar actually paints).
      {...knobProps.panelPadding}
      paddingHorizontal={0}
      {...knobProps.gapLg}
      // Bar edge is a divider (not a control border): hairline on high-DPI
      // (Axiom 15). Only class the side that carries the rule so the low-DPI
      // fallback cannot paint the other edge.
      borderTopWidth={position === 'bottom' ? hairlineWidth : 0}
      borderBottomWidth={position === 'top' ? hairlineWidth : 0}
      {...(isWeb && {
        className: position === 'top' ? 'mp-hairline-b' : 'mp-hairline-t',
      })}
      borderColor="$borderColor"
      backgroundColor="transparent"
      justifyContent="space-between"
      alignItems="center"
      flexWrap="nowrap"
      width="100%"
      minHeight={MIN_PRESS_TARGET}
      overflow="hidden"
      data-testid="toolbar">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        flex={1}
        flexShrink={1}
        minWidth={0}
        {...(isWeb ? { overflow: 'scroll' as const } : undefined)}
        contentContainerStyle={{ alignItems: 'center' }}>
        <XStack {...knobProps.gapLg} alignItems="center" flexWrap="nowrap" flexShrink={0} data-toolbar-slot="start">
          {renderClusters(primaryActions, 'primary')}
        </XStack>
      </ScrollView>

      {hasTrailing && (
        <XStack
          {...knobProps.gap}
          alignItems="center"
          flexWrap="nowrap"
          flexShrink={0}
          justifyContent="flex-end"
          data-toolbar-slot="end">
          {renderClusters(secondaryNeutral, 'secondary')}
          {secondaryNeutral.length > 0 && secondaryDestructive.length > 0 && (
            <Separator
              vertical
              {...hairline.vline}
              // Match the painted control chrome, not the flat token ramp
              // (sizeToken is a key, not a height scalar).
              height={knobProps.control.height}
              alignSelf="center"
              data-toolbar-separator="destructive"
            />
          )}
          {renderClusters(secondaryDestructive, 'destructive')}
        </XStack>
      )}
    </XStack>
  );
}
