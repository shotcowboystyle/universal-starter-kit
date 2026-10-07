// Contract: the desk "Connections" dashboard — linked doctypes (meta.links)
// grouped with counts; items navigate to filtered lists / linked docs.
// Keep props stable — form-core imports this.
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Separator,
  SizableText,
  Skeleton,
  XStack,
  YStack,
} from '@repo/ui';
import {
  ensureFocusVisibleRing,
  getGroupPosition,
  sizeRecipeEscape,
  stackRadiusProps,
  useResolvedKnobs,
} from '@repo/theme';
import { PlusIcon } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { DoctypeMeta } from '../shared/useDoctypeMeta';
import { useDoctypeMeta } from '../shared/useDoctypeMeta';

import {
  connectionListHref,
  formatConnectionCount,
  groupConnectionLinks,
  useConnectionCounts,
} from './connections-data';
import type { ConnectionCount, ConnectionGroup, ConnectionLink } from './connections-data';

export interface FormConnectionsProps {
  doctype: string;
  name: string;
  meta?: DoctypeMeta;
}

interface ConnectionRowProps {
  link: ConnectionLink;
  docname: string;
  count?: ConnectionCount;
  countsLoading: boolean;
  index: number;
  total: number;
}

function ConnectionRow({ link, docname, count, countsLoading, index, total }: ConnectionRowProps) {
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const countText = formatConnectionCount(count?.count);
  const openText = formatConnectionCount(count?.openCount);
  // Desk parity: an internal link without collected names has nowhere to
  // navigate (its filter is `name in (...)`), so the row press is disabled.
  const disabled = link.isChildTable && !count?.names?.length;
  const position = getGroupPosition(index, total);
  const corners = stackRadiusProps(position, knobProps.borderRadius.borderRadius);
  return (
    <XStack
      role="link"
      aria-label={link.targetDoctype}
      onPress={
        disabled
          ? undefined
          : () => {
              navigator.navigate(connectionListHref(paths, link, docname, count?.names));
            }
      }
      disabled={disabled}
      cursor={disabled ? 'default' : 'pointer'}
      opacity={disabled ? 0.6 : 1}
      alignItems="center"
      gap="$2"
      paddingVertical="$1"
      paddingHorizontal="$1.5"
      overflow="hidden"
      tabIndex={disabled ? -1 : 0}
      outlineWidth={0}
      {...corners}
      {...{ 'data-group-position': position }}
      hoverStyle={disabled ? undefined : { backgroundColor: '$color3', ...corners }}
      pressStyle={disabled ? undefined : { backgroundColor: '$color5', ...corners }}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
      onKeyDown={
        disabled
          ? undefined
          : (((e: { key?: string; preventDefault?: () => void }) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault?.();
                navigator.navigate(connectionListHref(paths, link, docname, count?.names));
              }
            }) as unknown as () => void)
      }>
      <SizableText
        size="$3"
        color={disabled ? '$color10' : '$color12'}
        numberOfLines={1}
        flex={1}
        flexShrink={1}>
        {link.targetDoctype}
      </SizableText>
      {countsLoading ? (
        <Skeleton
          variant="rounded"
          width="$2"
          height={sizeRecipeEscape(18, 'loading bones sized to the connection card rows they stand in for')}
        />
      ) : (
        <>
          {openText !== undefined && (
            <Chip
              size="$2"
              color="orange">
              {openText}
            </Chip>
          )}
          {countText !== undefined && (
            <Chip
              size="$2"
              color="gray">
              {countText}
            </Chip>
          )}
        </>
      )}
      <Button
        circular
        chromeless
        size="$2"
        icon={PlusIcon}
        aria-label={t('connections.newLinked', 'New {{doctype}}', {
          doctype: link.targetDoctype,
        })}
        onPress={(event) => {
          // The row itself is pressable — don't also open the filtered list.
          event?.stopPropagation?.();
          // Desk parity: prefill the back-reference field on the new doc via
          // `?d=` (desk's route_options). Internal (child-table) links have
          // no such field — the reference lives in THIS doc's child rows —
          // so they open blank, as desk does.
          navigator.navigate(
            link.isChildTable
              ? paths.newDoc(link.targetDoctype)
              : paths.newDoc(link.targetDoctype, { [link.linkFieldname]: docname }),
          );
        }}
      />
    </XStack>
  );
}

interface ConnectionGroupCardProps {
  group: ConnectionGroup;
  docname: string;
  counts: Record<string, ConnectionCount>;
  countsLoading: boolean;
}

function ConnectionGroupCard({ group, docname, counts, countsLoading }: ConnectionGroupCardProps) {
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  return (
    <Card
      flexBasis={240}
      flexGrow={1}
      flexShrink={1}>
      <YStack
        {...knobProps.panelPadding}
        {...knobProps.gap}>
        <SizableText
          size="$4"
          {...knobProps.heading}
          fontWeight="400">
          {group.label ?? t('connections.referenceGroup', 'Reference')}
        </SizableText>
        <Separator />
        <YStack>
          {group.links.map((link, index) => (
            <ConnectionRow
              key={link.targetDoctype}
              link={link}
              docname={docname}
              count={counts[link.targetDoctype]}
              countsLoading={countsLoading}
              index={index}
              total={group.links.length}
            />
          ))}
        </YStack>
      </YStack>
    </Card>
  );
}

function ConnectionsSkeleton() {
  const { knobProps } = useResolvedKnobs();
  return (
    <Card
      flexBasis={240}
      flexGrow={1}
      flexShrink={1}>
      <YStack
        {...knobProps.panelPadding}
        {...knobProps.gap}>
        <Skeleton
          width={sizeRecipeEscape(120, 'loading bones sized to the connection card rows they stand in for')}
          height={sizeRecipeEscape(18, 'loading bones sized to the connection card rows they stand in for')}
        />
        <Separator />
        <YStack gap="$2">
          <Skeleton
            width="82%"
            height={sizeRecipeEscape(16, 'loading bones sized to the connection card rows they stand in for')}
          />
          <Skeleton
            width="64%"
            height={sizeRecipeEscape(16, 'loading bones sized to the connection card rows they stand in for')}
          />
          <Skeleton
            width="73%"
            height={sizeRecipeEscape(16, 'loading bones sized to the connection card rows they stand in for')}
          />
        </YStack>
      </YStack>
    </Card>
  );
}

export function FormConnections({ doctype, name, meta: metaProp }: FormConnectionsProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  // form-core usually passes meta; fetch it only when it didn't.
  const { meta: loadedMeta, loading: metaLoading, error: metaError } = useDoctypeMeta(metaProp ? undefined : doctype);
  const meta = metaProp ?? loadedMeta;
  const groups = useMemo(() => groupConnectionLinks(meta), [meta]);
  const links = useMemo(() => groups.flatMap((group) => group.links), [groups]);
  const { counts, loading: countsLoading } = useConnectionCounts(doctype, name, links);

  if (!meta) {
    if (metaLoading) {
      return (
        <XStack
          flexWrap="wrap"
          {...knobProps.gap}>
          <ConnectionsSkeleton />
          <ConnectionsSkeleton />
        </XStack>
      );
    }
    return (
      <EmptyState
        compact
        intent="error"
        title={t('connections.metaError', "Couldn't load connections")}
        description={metaError?.message}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        compact
        title={t('connections.emptyTitle', 'No connections')}
        description={t('connections.empty', 'This document is not connected to any other documents')}
      />
    );
  }

  return (
    <XStack
      flexWrap="wrap"
      alignItems="flex-start"
      {...knobProps.gap}>
      {groups.map((group) => (
        <ConnectionGroupCard
          key={group.label ?? ''}
          group={group}
          docname={name}
          counts={counts}
          countsLoading={countsLoading}
        />
      ))}
    </XStack>
  );
}
