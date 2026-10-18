/**
 * Workspace shortcut chip — compact chip rendering for the `shortcut`
 * content block (MOD-11): type icon + label + live count pill in a ~44px
 * self-sized chip, laid out as a wrapping band by WorkspaceScreen (not
 * grid-stretched cards).
 *
 * DocType shortcuts show a live count (respecting `stats_filter`) via the
 * shared realtime aggregate and navigate to the doctype list. Report and
 * Page shortcuts navigate into the backoffice slug router (best-effort —
 * see the navigation notes on `resolveShortcutTarget`). URL shortcuts open
 * via the platform-split openUrl (web new tab / native Linking / GNOME Gio).
 *
 * Rendering gates: chips targeting doctypes outside the provider's
 * `doctypes` scope render nothing, and DocType/Report chips (list-surface
 * navigations) render nothing when the `views` capability is off.
 */
import {
  ArrowSquareOutIcon,
  BrowserIcon,
  ChartBarIcon,
  GaugeIcon,
  ListBulletsIcon,
  SquaresFourIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useFrappeAggregate, useFrappeConfig } from '@repo/frappe-ui';
import { openUrl } from '@repo/platform';
import { TOUCH_HEIGHT_FLOOR, ensureFocusVisibleRing, sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import { Card, Chip, Skeleton, Text, XStack, useTheme } from '@repo/ui';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useBackofficeCapabilities,
  useBackofficeNavigator,
  useBackofficePaths,
  useIsDoctypeAllowed,
} from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { createBackofficePaths } from '../navigation/paths';
import type { BackofficePaths } from '../navigation/paths';
import { useSingleDoctypes } from '../shared/use-slug-target';

import { parseFrappeFilters } from './parse-content';
import type { WorkspaceShortcutRow } from './types';

const defaultPaths = createBackofficePaths();

/**
 * Doctypes whose count probe failed this session (belt-and-braces beside
 * the singles gate below — e.g. virtual doctypes without count support).
 * `frappe.client.get_count` rejects permanently for those, so re-probing on
 * every workspace visit would spray HTTP 500s across the console (found
 * during the resilience verification pass). The chip already renders
 * count-less on error; memoized doctypes just skip future probes.
 */
const uncountableDoctypes = new Set<string>();

/** Where a shortcut press goes: an in-app path, an external URL, or nowhere. */
export interface WorkspaceShortcutTarget {
  path?: string;
  externalUrl?: string;
  disabled?: boolean;
}

/**
 * Resolve a shortcut press to a router path (or an external URL) —
 * basePath-aware when the provider's `paths` are passed; defaults to the
 * canonical "/backoffice".
 *
 * - DocType → paths.list(link_to)
 * - Report → paths.list(link_to): there is no query-report route yet, so the
 *   report slug goes through the runtime slug resolver (documented gap).
 * - Page → `{base}/<link_to>` (frappe page names are already slugs,
 *   e.g. "permission-manager"); resolution is up to the slug router.
 * - Dashboard → no dashboard-view route yet → disabled (documented gap).
 * - URL → external, opened through the platform openUrl.
 */
export const resolveShortcutTarget = (
  row: WorkspaceShortcutRow,
  paths: BackofficePaths = defaultPaths,
): WorkspaceShortcutTarget => {
  const target = row.link_to ?? row.url ?? '';
  const prefix = paths.base === '/' ? '' : paths.base;
  switch (row.type) {
    case 'DocType': {
      return { path: paths.list(target) };
    }
    case 'Report': {
      return { path: paths.list(target) };
    }
    case 'Page': {
      return { path: `${prefix}/${target}` };
    }
    case 'URL': {
      return { externalUrl: row.url ?? row.link_to };
    }
    default: {
      // "Dashboard" and unknown types have no backoffice route yet.
      return { disabled: true };
    }
  }
};

/** Follow a resolved shortcut target: in-app path first, else the external URL. */
const openShortcutTarget = (target: WorkspaceShortcutTarget, navigate: (path: string) => void): void => {
  if (target.path !== undefined && target.path !== '') {
    navigate(target.path);
    return;
  }
  if (target.externalUrl !== undefined && target.externalUrl !== '') {
    // Platform-split: new tab on web, Linking on native, Gio on GNOME.
    openUrl(target.externalUrl);
  }
};

export interface WorkspaceShortcutProps {
  row: WorkspaceShortcutRow;
  /** Override the default navigation/open behavior for this chip. */
  onPress?: (row: WorkspaceShortcutRow) => void;
}

/** Leading chip glyph per shortcut target type. */
const TYPE_ICONS = new Map<string, Icon>([
  ['DocType', ListBulletsIcon],
  ['Report', ChartBarIcon],
  ['Page', BrowserIcon],
  ['Dashboard', GaugeIcon],
  ['URL', ArrowSquareOutIcon],
]);

/** Desk shows "{} Open"-style templates when `format` is set. */
const formatCount = (count: number | undefined, format: string | undefined): string | undefined => {
  if (count === undefined) {
    return undefined;
  }
  return format === undefined || format === '' ? String(count) : format.replace('{}', String(count));
};

/**
 * Live count for a DocType shortcut chip. `enabled` is false for chips the
 * visibility gates hide, so hidden chips never probe.
 */
const useShortcutCount = (row: WorkspaceShortcutRow, isDoctype: boolean, enabled: boolean) => {
  const config = useFrappeConfig();
  const filters = useMemo(() => parseFrappeFilters(row.stats_filter), [row.stats_filter]);
  // Desk parity (boot single_types): Single doctypes cannot be counted —
  // `get_count` HTTP-500s on every probe. The set rides the session-cached
  // slug index; `undefined` (still loading) holds the probe briefly.
  const singleDoctypes = useSingleDoctypes();

  const connection = useMemo(() => {
    const hasSource = config !== undefined && (Boolean(config.baseURL) || Boolean(config.fixtures));
    return hasSource
      ? {
          baseURL: config.baseURL,
          socketPort: config.socketPort,
          siteName: config.siteName,
          socketBaseURL: config.socketBaseURL,
          auth: config.auth,
          syncOptions: config.syncOptions,
          fixtures: config.fixtures,
        }
      : undefined;
  }, [config]);

  const doctype = row.link_to ?? '';
  const isCountable =
    isDoctype && singleDoctypes !== undefined && !singleDoctypes.has(doctype) && !uncountableDoctypes.has(doctype);
  const { value, isLoading, error } = useFrappeAggregate(connection, {
    doctype,
    filters,
    enabled: isCountable && connection !== undefined && enabled,
  });
  useEffect(() => {
    if (error && doctype !== '') {
      uncountableDoctypes.add(doctype);
    }
  }, [error, doctype]);

  return { count: value, countLoading: isLoading, countError: error };
};

/**
 * Visibility gates for a shortcut chip: doctype scope + the views capability
 * (DocType/Report chips navigate to list surfaces).
 */
const useShortcutVisibility = (row: WorkspaceShortcutRow) => {
  const { views } = useBackofficeCapabilities();
  const isDoctypeAllowed = useIsDoctypeAllowed();
  const linkTo = row.link_to ?? '';
  const isDoctype = row.type === 'DocType' && linkTo !== '';
  const hiddenByScope = isDoctype ? !isDoctypeAllowed(linkTo) : false;
  const hiddenByViews = (row.type === 'DocType' || row.type === 'Report') && !views.enabled;
  return { isDoctype, hidden: hiddenByScope || hiddenByViews };
};

interface ShortcutTrailingProps {
  isDoctype: boolean;
  inert: boolean;
  countLoading: boolean;
  countFailed: boolean;
  countLabel: string | undefined;
}

/** The chip's trailing slot: count bone, count badge, or "Not available". */
const ShortcutTrailing = ({ isDoctype, inert, countLoading, countFailed, countLabel }: ShortcutTrailingProps) => {
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  if (isDoctype) {
    if (countLoading) {
      return (
        <Skeleton
          variant="rounded"
          width="$2"
          height={sizeRecipeEscape(16, 'count bone: the height of the count badge it stands in for')}
        />
      );
    }
    if (countFailed || countLabel === undefined) {
      return null;
    }
    return (
      <Chip
        size="$2"
        variant="subtle"
        color="gray">
        {countLabel}
      </Chip>
    );
  }
  if (!inert) {
    return null;
  }
  return (
    <Text
      {...knobProps.label}
      fontWeight="400"
      color="$color10">
      {t('workspaceShortcutUnavailable', 'Not available')}
    </Text>
  );
};

export const WorkspaceShortcut = ({ row, onPress }: WorkspaceShortcutProps) => {
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { knobProps } = useResolvedKnobs();
  const iconSize = knobProps.controlIcon?.width || 16;
  const theme = useTheme();
  // Phosphor icons take a resolved color string, not a tamagui token —
  // read the theme value so native/GTK get a real color (not a CSS var).
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- theme values are string | number; only a string is a color
  const iconColor = typeof theme.color11?.val === 'string' ? theme.color11.val : undefined;

  const { isDoctype, hidden } = useShortcutVisibility(row);
  const { count, countLoading, countError } = useShortcutCount(row, isDoctype, !hidden);

  if (hidden) {
    return null;
  }

  const target = resolveShortcutTarget(row, paths);
  const inert = target.disabled === true && !onPress;

  const handlePress = () => {
    if (onPress) {
      onPress(row);
      return;
    }
    openShortcutTarget(target, (path) => {
      navigator.navigate(path);
    });
  };

  const countLabel = formatCount(count, row.format);

  const TypeIcon = TYPE_ICONS.get(row.type) ?? SquaresFourIcon;

  return (
    <Card
      // Chip-scale surface: eject the Card's default panelPadding — the
      // inner row owns the compact inset (LC-18 eject-last contract).
      padding={0}
      onPress={inert ? undefined : handlePress}
      disabled={inert}
      opacity={inert ? 0.5 : 1}
      cursor={inert ? 'default' : 'pointer'}
      hoverStyle={inert ? undefined : { borderColor: '$accentBackground' }}
      pressStyle={inert ? undefined : { scale: 0.98 }}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- cross-platform Tamagui Card; there is no <button> on native
      role="button"
      aria-label={row.label}
      tabIndex={inert ? undefined : 0}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      // Default ring (offset 0): a shortcut tile is a standalone rectangle on
      // the page ground, not a thumb or an inline link, so it takes no LC-71 §4
      // carve-out (MPO-92).
      focusVisibleStyle={ensureFocusVisibleRing()}>
      {/* Compact chip anatomy: icon + label + count, ≥44px press target
          (DG-LAY-04), self-sized so the band wraps instead of stretching. */}
      <XStack
        paddingHorizontal="$3"
        minHeight={TOUCH_HEIGHT_FLOOR}
        alignItems="center"
        {...knobProps.gap}>
        {/* oxlint-disable-next-line react/static-components -- a module-level icon picked from a static map, not created during render */}
        <TypeIcon
          size={iconSize}
          color={iconColor}
          aria-hidden
        />
        <Text
          {...knobProps.label}
          fontWeight="400"
          numberOfLines={1}
          flexShrink={1}>
          {row.label}
        </Text>
        <ShortcutTrailing
          isDoctype={isDoctype}
          inert={inert}
          countLoading={countLoading}
          countFailed={Boolean(countError)}
          countLabel={countLabel}
        />
      </XStack>
    </Card>
  );
};
