import { ImageSquareIcon } from '@phosphor-icons/react';
import { Spinner, formCommonColors } from '@repo/forms';
import { useDocTypeMeta } from '@repo/frappe';
import { isServer } from '@repo/platform';
import { useResolvedKnobs } from '@repo/theme';
import { AsyncSkeleton, Card, ImageGrid } from '@repo/ui';
import type { ImageGridProps } from '@repo/ui';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Text, YStack, useTheme } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { useFrappeConfig } from './FrappeProvider';
import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import { useFrappeRows } from './use-frappe-rows';

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

/** A row as an open field bag; a row object is one, so no conversion is needed. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the configured image/title/subtitle fields are read off untyped list rows
const rowFields = (doc: { name: string }): Record<string, unknown> => doc;

/** A row field that holds a string, else undefined. */
const stringField = (doc: { name: string }, field: string): string | undefined => {
  const value = rowFields(doc)[field];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- list rows are untyped server JSON; only a string names an image
  return typeof value === 'string' ? value : undefined;
};

/** A row field as display text, or undefined when the row leaves it unset. */
const displayField = (doc: { name: string }, field: string): string | undefined => {
  const value = rowFields(doc)[field];
  // oxlint-disable-next-line typescript/no-base-to-string -- title / subtitle fields are scalars; String() renders them as the list does
  return value == null ? undefined : String(value);
};

/**
 * Resolves an image field value to a full URL.
 */
const getImageUrl = (value: string | undefined, baseURL: string): string => {
  if (value === undefined || value === '') {
    return '';
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  if (value.startsWith('/')) {
    return `${baseURL}${value}`;
  }
  return value;
};

type KnobProps = ReturnType<typeof useResolvedKnobs>['knobProps'];

const iconSizeOf = (knobProps: KnobProps): number => {
  const width = knobProps.controlIcon?.width;
  return width !== 0 && !Number.isNaN(width) ? width : 16;
};

const mutedGlyphColor = (theme: ReturnType<typeof useTheme>): string => {
  const token = theme.color11;
  // oxlint-disable-next-line typescript/no-unsafe-return -- tamagui types a theme variable's resolved value loosely; `.val` is its color string
  return token?.val ?? 'currentColor';
};

/** Stops the press reaching the grid wrapper; not every platform's press event carries stopPropagation. */
const stopPress = (event: { stopPropagation?: () => void } | undefined) => {
  event?.stopPropagation?.();
};

export interface FrappeImageViewProps<TDoc extends { name: string; doctype: string }> extends Omit<
  YStackProps,
  'children'
> {
  doctype: string;
  imageField?: string;
  titleField?: string;
  subtitleField?: string;
  columns?: number;
  filters?: Partial<TDoc> | [keyof TDoc & string, string, unknown][];
  fields?: readonly (keyof TDoc & string)[];
  searchText?: string;
  onItemClick?: (doc: Partial<TDoc>) => void;
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- SyncModule options pass through to @repo/frappe untouched
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

interface FrappeImageCardProps {
  doc: { name: string };
  doctype: string;
  imageField: string;
  titleField: string;
  subtitleField?: string;
  baseURL: string;
  onPress: () => void;
  knobProps: KnobProps;
}

/**
 * Card renderer shared between SSR and client paths so they produce
 * matching markup (avoiding hydration mismatches) and the look stays
 * defined in one place.
 */
const FrappeImageCard = ({
  doc,
  doctype,
  imageField,
  titleField,
  subtitleField,
  baseURL,
  onPress,
  knobProps,
}: FrappeImageCardProps) => {
  const theme = useTheme();
  const imageUrl = getImageUrl(stringField(doc, imageField), baseURL);
  const title = displayField(doc, titleField) ?? doc.name;
  const subtitle = subtitleField === undefined || subtitleField === '' ? undefined : displayField(doc, subtitleField);
  const iconSize = iconSizeOf(knobProps);

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
        stopPress(e);
        onPress();
      }}>
      {imageUrl === '' ? (
        <YStack
          width="100%"
          aspectRatio={1}
          backgroundColor="$color2"
          {...knobProps.borderRadius}
          alignItems="center"
          justifyContent="center">
          <ImageSquareIcon
            size={iconSize * 2}
            color={mutedGlyphColor(theme)}
          />
        </YStack>
      ) : (
        <Image
          src={imageUrl}
          alt={title}
          width="100%"
          aspectRatio={1}
          objectFit="cover"
          backgroundColor="$color2"
          {...knobProps.borderRadius}
        />
      )}
      <Card.Footer>
        <YStack {...knobProps.gap}>
          <Text
            testID={`${doctype.toLowerCase()}-name-${doc.name}`}
            {...knobProps.heading}
            fontWeight="400"
            numberOfLines={1}>
            {title}
          </Text>
          {subtitle === undefined ? null : (
            <Text
              testID={`${doctype.toLowerCase()}-subtitle-${doc.name}`}
              color={formCommonColors.muted}
              {...knobProps.label}
              numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </YStack>
      </Card.Footer>
    </Card>
  );
};

/** The connection the grid reads through, from the props or the FrappeProvider above. */
const useImageAppConfig = (
  baseURL: string | undefined,
  auth: FrappeImageViewProps<{ name: string; doctype: string }>['auth'],
  syncOptions: FrappeImageViewProps<{ name: string; doctype: string }>['syncOptions'],
) => {
  const config = useFrappeConfig();
  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  if (finalBaseURL === undefined || finalBaseURL === '') {
    throw new Error('FrappeImageView requires baseURL prop or FrappeProvider with baseURL');
  }

  // Memoize so downstream hooks (useDocTypeMeta / useFrappeRows) receive
  // a stable config reference across renders instead of a fresh object each
  // time (which would otherwise retrigger their effects every render).
  return useMemo(
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
};

/** The fields the grid reads: the caller's, plus name / image / title / subtitle. */
const imageFieldNames = (fields: readonly string[] | undefined, extra: (string | undefined)[]): string[] => {
  const fieldSet = new Set<string>(fields);
  fieldSet.add('name');
  for (const field of extra) {
    if (field !== undefined && field !== '') {
      fieldSet.add(field);
    }
  }
  return [...fieldSet];
};

type ImageFilterRow<TDoc> = [keyof TDoc & string, string, unknown];

/** The caller's filters plus a LIKE on the title field. */
const withSearchFilter = <TDoc extends { name: string; doctype: string }>(
  filters: FrappeImageViewProps<TDoc>['filters'],
  titleField: string,
  searchText: string,
): ImageFilterRow<TDoc>[] => {
  // SAFETY: the title field is the caller's titleField or the doctype meta's title_field, both fields of TDoc rows
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const searchFilter: ImageFilterRow<TDoc> = [titleField as keyof TDoc & string, 'like', `%${searchText}%`];
  if (Array.isArray(filters)) {
    return [...filters, searchFilter];
  }
  if (!filters) {
    return [searchFilter];
  }
  const objectFilters = Object.entries(filters).map(
    // SAFETY: Object.entries of a Partial<TDoc> yields TDoc's own keys
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    ([key, value]): ImageFilterRow<TDoc> => [key as keyof TDoc & string, '=', value],
  );
  return [...objectFilters, searchFilter];
};

const NoImageFieldState = ({ doctype, ...stackProps }: YStackProps & { doctype: string }) => {
  const theme = useTheme();
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  return (
    <YStack
      {...knobProps.panelPadding}
      alignItems="center"
      {...knobProps.gap}
      {...stackProps}>
      <ImageSquareIcon
        size={iconSizeOf(knobProps) * 2}
        color={mutedGlyphColor(theme)}
      />
      <Text
        color={formCommonColors.muted}
        {...knobProps.body}>
        {t('No image field configured for {{doctype}}', { doctype })}
      </Text>
    </YStack>
  );
};

/**
 * Inner client-only implementation that calls the hooks requiring a
 * browser environment (useFrappeRows).
 */
const FrappeImageViewClient = <TDoc extends { name: string; doctype: string }>({
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
}: FrappeImageViewProps<TDoc>) => {
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const appConfig = useImageAppConfig(baseURL, auth, syncOptions);

  const { meta, isLoading: isMetaLoading } = useDocTypeMeta(appConfig, doctype);

  const effectiveImageField = imageField ?? meta?.image_field;
  const effectiveTitleField = titleField ?? meta?.title_field ?? 'name';

  const effectiveFields = useMemo(
    () =>
      // SAFETY: the extra names are the doctype's own image / title / subtitle fields, which TDoc rows carry
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      imageFieldNames(fields, [effectiveImageField, effectiveTitleField, subtitleField]) as (keyof TDoc & string)[],
    [fields, effectiveImageField, effectiveTitleField, subtitleField],
  );

  const effectiveFilters = useMemo(
    () =>
      searchText === undefined || searchText === '' || !effectiveTitleField
        ? filters
        : withSearchFilter<TDoc>(filters, effectiveTitleField, searchText),
    [filters, searchText, effectiveTitleField],
  );

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
  const needsMeta = imageField === undefined || imageField === '' || titleField === undefined || titleField === '';
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
  if (effectiveImageField === undefined || effectiveImageField === '') {
    return (
      <NoImageFieldState
        doctype={doctype}
        {...stackProps}
      />
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
        // SAFETY: the rest of FrappeImageViewProps is YStackProps; ImageGrid narrows only `height` to a number, which is what callers pass
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        {...(stackProps as Partial<ImageGridProps<TDoc>>)}
        renderItem={(doc) => (
          <FrappeImageCard
            doc={doc}
            doctype={doctype}
            imageField={effectiveImageField}
            titleField={effectiveTitleField}
            subtitleField={subtitleField}
            baseURL={appConfig.baseURL}
            onPress={() => {
              onItemClick?.(doc);
            }}
            knobProps={knobProps}
          />
        )}
      />
    </>
  );
};

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
export const FrappeImageView = <TDoc extends { name: string; doctype: string }>(props: FrappeImageViewProps<TDoc>) => {
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
    const hasItems = ssrItems !== undefined && ssrItems.length > 0;
    const hasImageField = imageField !== undefined && imageField !== '';
    const hasBaseURL = baseURL !== undefined && baseURL !== '';

    if (hasItems && hasImageField && hasBaseURL) {
      return (
        <ImageGrid
          items={ssrItems}
          columns={columns}
          onItemClick={onItemClick}
          emptyMessage={t('No items found')}
          testID={`${doctype.toLowerCase()}-list`}
          // SAFETY: the rest is YStackProps plus the client-only read options; ImageGrid narrows only `height` to a number, which is what callers pass
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          {...(stackProps as Partial<ImageGridProps<TDoc>>)}
          renderItem={(doc) => (
            <FrappeImageCard
              doc={doc}
              doctype={doctype}
              imageField={imageField}
              titleField={titleField}
              subtitleField={subtitleField}
              baseURL={baseURL}
              onPress={() => {
                onItemClick?.(doc);
              }}
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
        {...stackProps}>
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
};
