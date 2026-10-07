import { Card, Chip, Skeleton, Text, XStack, useTheme } from '@repo/ui';
import { useFrappeAggregate, useFrappeConfig } from '@repo/frappe-ui';
import { openUrl } from '@repo/platform';
import {
  TOUCH_HEIGHT_FLOOR,
  ensureFocusVisibleRing,
  sizeRecipeEscape,
  useResolvedKnobs,
} from '@repo/theme';
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
import { useSingleDoctypes } from '../shared/useSlugTarget';

import { parseFrappeFilters } from './parseContent';
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
export function resolveShortcutTarget(
  row: WorkspaceShortcutRow,
  paths: BackofficePaths = defaultPaths,
): {
  path?: string;
  externalUrl?: string;
  disabled?: boolean;
} {
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
}

export interface WorkspaceShortcutProps {
  row: WorkspaceShortcutRow;
  /** Override the default navigation/open behavior for this chip. */
  onPress?: (row: WorkspaceShortcutRow) => void;
}

/** Leading chip glyph per shortcut target type. */
const TYPE_ICONS: Record<string, Icon> = {
  DocType: ListBulletsIcon,
  Report: ChartBarIcon,
  Page: BrowserIcon,
  Dashboard: GaugeIcon,
  URL: ArrowSquareOutIcon,
};

export function WorkspaceShortcut({ row, onPress }: WorkspaceShortcutProps) {
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const config = useFrappeConfig();
  const { knobProps } = useResolvedKnobs();
  const iconSize = Number(knobProps.controlIcon?.width) || 16;
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const theme = useTheme();
  const { views } = useBackofficeCapabilities();
  const isDoctypeAllowed = useIsDoctypeAllowed();
  // Phosphor icons take a resolved color string, not a tamagui token —
  // read the theme value so native/GTK get a real color (not a CSS var).
  const iconColor = typeof theme.color11?.val === 'string' ? theme.color11.val : undefined;

  const isDoctype = row.type === 'DocType' && !!row.link_to;
  const filters = useMemo(() => parseFrappeFilters(row.stats_filter), [row.stats_filter]);
  // Desk parity (boot single_types): Single doctypes cannot be counted —
  // `get_count` HTTP-500s on every probe. The set rides the session-cached
  // slug index; `undefined` (still loading) holds the probe briefly.
  const singleDoctypes = useSingleDoctypes();

  const connection = useMemo(
    () =>
      config?.baseURL || config?.fixtures
        ? {
            baseURL: config.baseURL,
            socketPort: config.socketPort,
            siteName: config.siteName,
            socketBaseURL: config.socketBaseURL,
            auth: config.auth,
            syncOptions: config.syncOptions,
            fixtures: config.fixtures,
          }
        : undefined,
    [config],
  );

  // Visibility gates (before any early return — hooks above stay stable).
  const hiddenByScope = isDoctype && row.link_to ? !isDoctypeAllowed(row.link_to) : false;
  const hiddenByViews = (row.type === 'DocType' || row.type === 'Report') && !views.enabled;

  const isCountable =
    isDoctype &&
    singleDoctypes !== undefined &&
    !singleDoctypes.has(row.link_to ?? '') &&
    !uncountableDoctypes.has(row.link_to ?? '');
  const {
    value: count,
    isLoading: countLoading,
    error: countError,
  } = useFrappeAggregate(connection, {
    doctype: row.link_to ?? '',
    filters,
    enabled: isCountable && !!connection && !hiddenByScope && !hiddenByViews,
  });
  useEffect(() => {
    if (countError && row.link_to) {
      uncountableDoctypes.add(row.link_to);
    }
  }, [countError, row.link_to]);

  if (hiddenByScope || hiddenByViews) {
    return null;
  }

  const target = resolveShortcutTarget(row, paths);

  const handlePress = () => {
    if (onPress) {
      onPress(row);
      return;
    }
    if (target.path) {
      navigator.navigate(target.path);
      return;
    }
    if (target.externalUrl) {
      // Platform-split: new tab on web, Linking on native, Gio on GNOME.
      openUrl(target.externalUrl);
    }
  };

  // Desk shows "{} Open"-style templates when `format` is set.
  const countLabel =
    count === undefined ? undefined : row.format ? row.format.replace('{}', String(count)) : String(count);

  const TypeIcon = TYPE_ICONS[row.type] ?? SquaresFourIcon;

  return (
    <Card
      // Chip-scale surface: eject the Card's default panelPadding — the
      // inner row owns the compact inset (LC-18 eject-last contract).
      padding={0}
      onPress={target.disabled && !onPress ? undefined : handlePress}
      disabled={target.disabled && !onPress}
      opacity={target.disabled && !onPress ? 0.5 : 1}
      cursor={target.disabled && !onPress ? 'default' : 'pointer'}
      hoverStyle={target.disabled && !onPress ? undefined : { borderColor: '$accentBackground' }}
      pressStyle={target.disabled && !onPress ? undefined : { scale: 0.98 }}
      role="button"
      aria-label={row.label}
      tabIndex={target.disabled && !onPress ? undefined : 0}
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
        {isDoctype ? (
          countLoading ? (
            <Skeleton
              variant="rounded"
              width="$2"
              height={sizeRecipeEscape(16, 'count bone: the height of the count badge it stands in for')}
            />
          ) : countError ? null : countLabel === undefined ? null : (
            <Chip
              size="$2"
              variant="subtle"
              color="gray">
              {countLabel}
            </Chip>
          )
        ) : target.disabled && !onPress ? (
          <Text
            {...knobProps.label}
            fontWeight="400"
            color="$color10">
            {t('workspaceShortcutUnavailable', 'Not available')}
          </Text>
        ) : null}
      </XStack>
    </Card>
  );
}
