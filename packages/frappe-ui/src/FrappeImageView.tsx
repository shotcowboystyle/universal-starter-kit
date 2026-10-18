import { ImageSquareIcon } from '@phosphor-icons/react';
import { Spinner, formCommonColors } from '@repo/forms';
import { useDocTypeMeta } from '@repo/frappe';
import { isServer } from '@repo/platform';
import { useResolvedKnobs } from '@repo/theme';
import { AsyncSkeleton, Card, ImageGrid } from '@repo/ui';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Text, YStack, useTheme } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { useFrappeConfig } from './FrappeProvider';
import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import { useFrappeRows } from './useFrappeRows';

/**
 * True when this module is evaluated during web server rendering.
 *
 * This used to read `import.meta.env.SSR` behind a try/catch, which MPO-192
 * ruled out: in a classic script — the vxrn/rolldown Hermes bundle, or any
 * Metro bundle for platform=web, which is what an Expo DOM component
 * (`'use dom'`) is — `import.meta` is a PARSE-time SyntaxError, so the catch
 * never runs and the whole module fails to parse.
 *
 * `isServer` carries no `import.meta` and is split at the FILE level
 * (@tamagui/constants ships a `.native` flavour hardcoding it false), so it
 * answers correctly in all four places: true only under web server render,
 * false in a browser, on native, and inside a DOM component's WebView.
 */
const IS_SSR: boolean = isServer;

/**
 * Resolves an image field value to a full URL.
 */
function getImageUrl(value: unknown, baseURL: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  if (value.startsWith('/')) {
    return `${baseURL}${value}`;
  }
  return value;
}

export interface FrappeImageViewProps<TDoc extends { name: string; doctype: string }> extends Omit<
  YStackProps,
  'children'
> {
  doctype: string;
  imageField?: string;
  titleField?: string;
  subtitleField?: string;
  columns?: number;
  filters?: Partial<TDoc> | [keyof TDoc & string, string, any][];
  fields?: readonly (keyof TDoc & string)[];
  searchText?: string;
  onItemClick?: (doc: Partial<TDoc>) => void;
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  syncOptions?: Record<string, unknown>;
  /**
   * Items to render during server-side rendering and pre-hydration. Allows
   * the consumer (typically a `useLoader` result) to provide initial data
   * so the grid can render real content on the server instead of a spinner.
   *
   * Once the client mounts, the live `useLiveQuery` data takes over and
   * this prop is ignored.
   */
  ssrItems?: TDoc[];
}

/**
 * Thin Frappe wrapper around the generic ImageGrid component.
 *
 * Fetches data via `useFrappeRows`, resolves image URLs, and passes items
 * to the generic `ImageGrid` from `@repo/ui`.
 *
 * **SSR**: `useLiveQuery` (via `useSyncExternalStore`) lacks a
 * `getServerSnapshot` so it can't run on the server. If the consumer
 * passes `ssrItems` (e.g. from a route loader), we render them through
 * the same card design as the client so the SSR markup matches the
 * eventual hydrated output. Otherwise we fall back to a loading spinner.
 */
export function FrappeImageView<TDoc extends { name: string; doctype: string }>(props: FrappeImageViewProps<TDoc>) {
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  // The provider's baseURL serves the static branch below: route loaders
  // pass ssrItems but consumers shouldn't have to thread baseURL as a prop
  // when FrappeProvider already carries it.
  const providerConfig = useFrappeConfig();
  // Note: `typeof window` is unreliable because react-native-web polyfills
  // `window` during SSR. Use the module-level platform flag instead
  // (see IS_SSR above).
  if (IS_SSR) {
    const {
      doctype,
      imageField,
      titleField = 'name',
      subtitleField,
      columns,
      onItemClick,
      baseURL: baseURLProp,
      ssrItems,
      ...stackProps
    } = props;
    const baseURL = baseURLProp ?? providerConfig?.baseURL;

    if (ssrItems && ssrItems.length > 0 && imageField && baseURL) {
      return (
        <ImageGrid
          items={ssrItems}
          columns={columns}
          onItemClick={onItemClick}
          emptyMessage={t('No items found')}
          testID={`${doctype.toLowerCase()}-list`}
          {...(stackProps as any)}
          renderItem={(doc) => (
            <FrappeImageCard
              doc={doc as Record<string, unknown>}
              doctype={doctype}
              imageField={imageField}
              titleField={titleField}
              subtitleField={subtitleField}
              baseURL={baseURL}
              onItemClick={onItemClick as ((doc: Partial<unknown>) => void) | undefined}
              knobProps={knobProps}
            />
          )}
        />
      );
    }

    return (
      <YStack
        {...knobProps.panelPadding}
        alignItems="center"
        justifyContent="center"
        gap="$2"
        {...(stackProps as any)}>
        <Spinner size="large" />
        <Text
          color={formCommonColors.muted}
          {...knobProps.body}>
          {t('Loading {{doctype}}...', { doctype })}
        </Text>
      </YStack>
    );
  }

  // Avoid explicit generic <TDoc> in JSX — the `one` compiler injects
  // data-one-source attributes that break generic syntax.  TypeScript
  // infers TDoc from the props.
  return <FrappeImageViewClient {...props} />;
}

/**
 * Inner client-only implementation that calls the hooks requiring a
 * browser environment (useFrappeRows).
 */
function FrappeImageViewClient<TDoc extends { name: string; doctype: string }>({
  doctype,
  imageField,
  titleField,
  subtitleField,
  columns,
  filters,
  fields,
  searchText,
  onItemClick,
  baseURL,
  auth,
  syncOptions,
  ...stackProps
}: FrappeImageViewProps<TDoc>) {
  const theme = useTheme();
  const config = useFrappeConfig();
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  if (!finalBaseURL) {
    throw new Error('FrappeImageView requires baseURL prop or FrappeProvider with baseURL');
  }

  // Memoize so downstream hooks (useDocTypeMeta / useFrappeRows) receive
  // a stable config reference across renders instead of a fresh object each
  // time (which would otherwise retrigger their effects every render).
  const appConfig = useMemo(
    () => ({
      baseURL: finalBaseURL,
      socketPort: config?.socketPort,
      siteName: config?.siteName,
      socketBaseURL: config?.socketBaseURL,
      auth: finalAuth,
      syncOptions: finalSyncOptions,
      realtime: config?.realtime,
      fixtures: config?.fixtures,
    }),
    [
      finalBaseURL,
      config?.socketPort,
      config?.siteName,
      config?.socketBaseURL,
      config?.realtime,
      finalAuth,
      finalSyncOptions,
      config?.fixtures,
    ],
  );

  const { meta, isLoading: isMetaLoading } = useDocTypeMeta(appConfig, doctype);

  const effectiveImageField = imageField ?? meta?.image_field;
  const effectiveTitleField = titleField ?? meta?.title_field ?? 'name';

  const effectiveFields = useMemo(() => {
    const fieldSet = new Set<string>(fields as string[] | undefined);
    fieldSet.add('name');
    if (effectiveImageField) {
      fieldSet.add(effectiveImageField);
    }
    if (effectiveTitleField) {
      fieldSet.add(effectiveTitleField);
    }
    if (subtitleField) {
      fieldSet.add(subtitleField);
    }
    return [...fieldSet] as (keyof TDoc & string)[];
  }, [fields, effectiveImageField, effectiveTitleField, subtitleField]);

  const effectiveFilters = useMemo(() => {
    if (!searchText || !effectiveTitleField) {
      return filters;
    }
    const searchFilter: [string, string, any][] = [[effectiveTitleField, 'like', `%${searchText}%`]];
    if (Array.isArray(filters)) {
      return [...(filters as [string, string, any][]), ...searchFilter] as unknown as typeof filters;
    }
    if (filters) {
      const objectFilters = Object.entries(filters).map(([key, value]) => [key, '=', value] as [string, string, any]);
      return [...objectFilters, ...searchFilter] as unknown as typeof filters;
    }
    return searchFilter as unknown as typeof filters;
  }, [filters, searchText, effectiveTitleField]);

  const { rows: items, isQueryLoading: isDataLoading } = useFrappeRows<TDoc>(appConfig, doctype, {
    fields: effectiveFields,
    filters: effectiveFilters,
    limit: null,
  });

  // Only block rendering on DocType-meta loading when we actually need it
  // (i.e. the caller didn't pass explicit image/title fields). The meta
  // endpoint is permission-gated and 403s for Guests; when the fields are
  // already known, the grid can render from Guest-readable list data without
  // it. Always wait on the actual list data.
  const needsMeta = !imageField || !titleField;
  // Honest first-load state: layout skeleton per catalog pattern (DG-ST-02)
  if ((needsMeta && isMetaLoading) || isDataLoading) {
    return (
      <YStack
        {...knobProps.panelPadding}
        testID={`${doctype.toLowerCase()}-skeleton`}
        {...stackProps}>
        <AsyncSkeleton layout="generic" />
      </YStack>
    );
  }

  // No image field configured. R11: state is chrome outside the tile (no pip).
  if (!effectiveImageField) {
    const iconSize = Number(knobProps.controlIcon?.width) || 16;
    return (
      <YStack
        {...knobProps.panelPadding}
        alignItems="center"
        {...knobProps.gap}
        {...stackProps}>
        <ImageSquareIcon
          size={iconSize * 2}
          color={theme.color11?.val ?? 'currentColor'}
        />
        <Text
          color={formCommonColors.muted}
          {...knobProps.body}>
          {t('No image field configured for {{doctype}}', { doctype })}
        </Text>
      </YStack>
    );
  }

  return (
    <>
      <FrappeReconnectIndicator config={appConfig} />
      <ImageGrid
        items={items}
        columns={columns}
        onItemClick={onItemClick}
        emptyMessage={t('No items found')}
        testID={`${doctype.toLowerCase()}-list`}
        {...(stackProps as any)}
        renderItem={(doc) => (
          <FrappeImageCard
            doc={doc as Record<string, unknown>}
            doctype={doctype}
            imageField={effectiveImageField}
            titleField={effectiveTitleField}
            subtitleField={subtitleField}
            baseURL={finalBaseURL}
            onItemClick={onItemClick as ((doc: Partial<unknown>) => void) | undefined}
            knobProps={knobProps}
          />
        )}
      />
    </>
  );
}

/**
 * Card renderer shared between SSR and client paths so they produce
 * matching markup (avoiding hydration mismatches) and the look stays
 * defined in one place.
 */
function FrappeImageCard({
  doc,
  doctype,
  imageField,
  titleField,
  subtitleField,
  baseURL,
  onItemClick,
  knobProps,
}: {
  doc: Record<string, unknown>;
  doctype: string;
  imageField: string;
  titleField: string;
  subtitleField?: string;
  baseURL: string;
  onItemClick?: (doc: Partial<unknown>) => void;
  knobProps: ReturnType<typeof useResolvedKnobs>['knobProps'];
}) {
  const theme = useTheme();
  const imageUrl = getImageUrl(doc[imageField], baseURL);
  const title = doc[titleField] ?? doc.name;
  const subtitle = subtitleField ? doc[subtitleField] : undefined;
  const iconSize = Number(knobProps.controlIcon?.width) || 16;

  return (
    // Catalog Card owns cardSurface (no cherry-picked radius). Inner media
    // radius stays UNCLAMPED (R11). No status pip on the tile.
    <Card
      testID={`${doctype.toLowerCase()}-card-${doc.name}`}
      cursor="pointer"
      hoverStyle={{ scale: 1.02 }}
      pressStyle={{ scale: 0.98 }}
      onPress={(e) => {
        // Bind click directly to `doc` so the correct item is used even
        // if the ImageGrid wrapper's closure captured a stale/recycled item.
        (e as unknown as { stopPropagation?: () => void })?.stopPropagation?.();
        onItemClick?.(doc as Partial<unknown>);
      }}>
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={String(title)}
          width="100%"
          aspectRatio={1}
          objectFit="cover"
          backgroundColor="$color2"
          {...knobProps.borderRadius}
        />
      ) : (
        <YStack
          width="100%"
          aspectRatio={1}
          backgroundColor="$color2"
          {...knobProps.borderRadius}
          alignItems="center"
          justifyContent="center">
          <ImageSquareIcon
            size={iconSize * 2}
            color={theme.color11?.val ?? 'currentColor'}
          />
        </YStack>
      )}
      <Card.Footer>
        <YStack {...knobProps.gap}>
          <Text
            testID={`${doctype.toLowerCase()}-name-${doc.name}`}
            {...knobProps.heading}
            fontWeight="400"
            numberOfLines={1}>
            {String(title)}
          </Text>
          {subtitle == null ? null : (
            <Text
              testID={`${doctype.toLowerCase()}-subtitle-${doc.name}`}
              color={formCommonColors.muted}
              {...knobProps.label}
              numberOfLines={1}>
              {String(subtitle)}
            </Text>
          )}
        </YStack>
      </Card.Footer>
    </Card>
  );
}
