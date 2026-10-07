// Contract: renders a frappe Workspace document (shortcuts, link cards,
// charts, number cards, quick lists) by workspace name.
/**
 * Dashboard-first workspace page (MOD-11). The Workspace doc's `content`
 * JSON declares the blocks; the composition is ours, not desk's authoring
 * order (owner mandate: desk is a capability reference, not a design
 * constraint): recent strip, then live data widgets (number cards →
 * charts → quick lists), then narrative text, then a compact shortcut chip
 * band, then the grouped link cards behind a searchable "Browse all"
 * disclosure. Each widget resolves its definition from the doc's child
 * tables (`shortcuts`, `links`, `charts`, `number_cards`, `quick_lists`)
 * — shapes verified against a real bench (see types.ts).
 *
 * Skipped block types (rendered as nothing, by design): `onboarding`
 * (module onboarding widget needs its own RPC surface), `custom_block`
 * (arbitrary HTML — unsafe cross-platform), and `spacer` (the section
 * composition owns vertical rhythm now).
 */
import {
  AsyncBoundary,
  H2,
  H3,
  H4,
  H5,
  H6,
  PageHeader,
  PageSection,
  Paragraph,
  Screen,
  Skeleton,
  XStack,
  YStack,
} from '@repo/ui';
import { TOUCH_HEIGHT_FLOOR, sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import {
  composeWorkspaceBlocks,
  findLinkGroup,
  findShortcut,
  groupLinks,
  headerLevel,
  parseWorkspaceContent,
  stripHtml,
} from './parseContent';
import type { WorkspaceBlock, WorkspaceDoc, WorkspaceShortcutRow } from './types';
import { useWorkspaceDoc } from './useWorkspaceDoc';
import { WorkspaceChartBlock } from './WorkspaceChartBlock';
import { WorkspaceGrid } from './WorkspaceGrid';
import type { WorkspaceGridItem } from './WorkspaceGrid';
import { WorkspaceLinkDirectory } from './WorkspaceLinkDirectory';
import type { WorkspaceLinkDirectoryItem } from './WorkspaceLinkDirectory';
import { WorkspaceNumberCard } from './WorkspaceNumberCard';
import { WorkspaceQuickList } from './WorkspaceQuickList';
import { WorkspaceRecents } from './WorkspaceRecents';
import { WorkspaceShortcut } from './WorkspaceShortcut';

/** Block classes a host can hide from the workspace composition. */
export type WorkspaceBlockKind = 'shortcuts' | 'links' | 'charts' | 'numbers' | 'quickLists' | 'recent';

export interface WorkspaceScreenProps {
  /** Workspace document name (proper case, e.g. "Home", "Users") */
  workspace: string;
  /** Hide whole block classes from the composition. */
  hiddenBlocks?: readonly WorkspaceBlockKind[];
  /** Override the default shortcut-chip navigation. */
  onShortcutPress?: (row: WorkspaceShortcutRow) => void;
  /**
   * Replace the rendering of individual grid blocks (data widgets and
   * narrative text). Shortcut chips and link cards have their own
   * composition and are controlled via `hiddenBlocks`/`onShortcutPress`.
   */
  renderBlock?: (context: { block: WorkspaceBlock; doc: WorkspaceDoc; defaultContent: ReactNode }) => ReactNode;
}

// Section headers step under the page H1; visual scale follows desk's
// small workspace section headings.
const HEADER_TAGS = { 1: H2, 2: H2, 3: H3, 4: H4, 5: H5, 6: H6 } as const;

/**
 * Map a text or data block to a grid item. Shortcut and card blocks never
 * reach this — the composition renders them as the chip band and the
 * "Browse all" directory instead.
 */
function blockToGridItem(block: WorkspaceBlock, doc: WorkspaceDoc): WorkspaceGridItem | undefined {
  const key = block.id || JSON.stringify(block.data);
  switch (block.type) {
    case 'header': {
      const text = stripHtml(block.data.text);
      if (!text) {
        return undefined;
      }
      const Tag = HEADER_TAGS[headerLevel(block.data.text)];
      return {
        key,
        col: 12,
        node: (
          <Tag
            margin={0}
            marginTop="$3">
            {text}
          </Tag>
        ),
      };
    }
    case 'paragraph': {
      const text = stripHtml(block.data.text);
      if (!text) {
        return undefined;
      }
      return {
        key,
        col: 12,
        node: <Paragraph margin={0}>{text}</Paragraph>,
      };
    }
    case 'chart': {
      const row = doc.charts?.find(
        (chart) => chart.chart_name === block.data.chart_name || chart.label === block.data.chart_name,
      );
      if (!row) {
        return undefined;
      }
      return { key, col: block.data.col ?? 12, node: <WorkspaceChartBlock row={row} /> };
    }
    case 'number_card': {
      const row = doc.number_cards?.find(
        (card) => card.number_card_name === block.data.number_card_name || card.label === block.data.number_card_name,
      );
      if (!row) {
        return undefined;
      }
      return { key, col: block.data.col ?? 3, node: <WorkspaceNumberCard row={row} /> };
    }
    case 'quick_list': {
      const row = doc.quick_lists?.find(
        (list) => list.document_type === block.data.quick_list_name || list.label === block.data.quick_list_name,
      );
      if (!row) {
        return undefined;
      }
      return { key, col: block.data.col ?? 4, node: <WorkspaceQuickList row={row} /> };
    }
    default: {
      return undefined;
    }
  }
}

const chipBoneWidths = sizeRecipeEscape(
  [128, 104, 144, 112],
  'loading bones: placeholder chip widths and card height for content that has not loaded',
);
const cardBoneHeight = sizeRecipeEscape(
  200,
  'loading bones: placeholder chip widths and card height for content that has not loaded',
);

function WorkspaceSkeleton() {
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  // Mirrors the dashboard-first anatomy (LC-20): title line, shortcut chip
  // band (44px chips, deterministic widths), then the content card region.
  return (
    <YStack
      {...knobProps.gapLg}
      aria-busy
      aria-label={t('loading', 'Loading')}>
      <Skeleton
        width="30%"
        height="$2.5"
      />
      <XStack {...knobProps.gap}>
        {chipBoneWidths.map((width) => (
          <Skeleton
            key={width}
            variant="rounded"
            width={width}
            height={TOUCH_HEIGHT_FLOOR}
          />
        ))}
      </XStack>
      <XStack {...knobProps.gap}>
        <Skeleton
          variant="rounded"
          width="32%"
          height={cardBoneHeight}
        />
        <Skeleton
          variant="rounded"
          width="32%"
          height={cardBoneHeight}
        />
        <Skeleton
          variant="rounded"
          width="32%"
          height={cardBoneHeight}
        />
      </XStack>
    </YStack>
  );
}

interface WorkspaceSections {
  /** Data widgets first: number cards → charts → quick lists. */
  data: WorkspaceGridItem[];
  /** Narrative headers/paragraphs (e.g. the text-only Welcome Workspace). */
  text: WorkspaceGridItem[];
  /** Resolved shortcut rows for the chip band. */
  shortcuts: WorkspaceShortcutRow[];
  /** Resolved link groups (with authored spans) for the directory. */
  links: WorkspaceLinkDirectoryItem[];
}

const DATA_KIND_BY_TYPE: Record<string, WorkspaceBlockKind> = {
  chart: 'charts',
  number_card: 'numbers',
  quick_list: 'quickLists',
};

function buildSections(
  doc: WorkspaceDoc,
  hidden: ReadonlySet<WorkspaceBlockKind>,
  renderBlock?: WorkspaceScreenProps['renderBlock'],
): WorkspaceSections {
  const composition = composeWorkspaceBlocks(parseWorkspaceContent(doc.content));
  const toGridItems = (blocks: WorkspaceBlock[]) =>
    blocks
      .map((block) => {
        const item = blockToGridItem(block, doc);
        if (!item || !renderBlock) {
          return item;
        }
        return { ...item, node: renderBlock({ block, doc, defaultContent: item.node }) };
      })
      .filter((item): item is WorkspaceGridItem => item !== undefined);
  const groups = groupLinks(doc.links);
  const dataBlocks = composition.data.filter((block) => {
    const kind = DATA_KIND_BY_TYPE[block.type];
    return !kind || !hidden.has(kind);
  });
  return {
    data: toGridItems(dataBlocks),
    text: toGridItems(composition.text),
    shortcuts: hidden.has('shortcuts')
      ? []
      : composition.shortcuts.flatMap((block) => {
          const row = findShortcut(doc, block.data.shortcut_name);
          return row ? [row] : [];
        }),
    links: hidden.has('links')
      ? []
      : composition.cards.flatMap((block) => {
          const group = findLinkGroup(groups, block.data.card_name);
          if (!group) {
            return [];
          }
          return [{ key: block.id || group.label, col: block.data.col ?? 4, group }];
        }),
  };
}

export function WorkspaceScreen({ workspace, hiddenBlocks, onShortcutPress, renderBlock }: WorkspaceScreenProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const { doc, isLoading, error, isPermissionError, refresh } = useWorkspaceDoc(workspace);

  const hidden = useMemo(() => new Set(hiddenBlocks ?? []), [hiddenBlocks]);
  const sections = useMemo(
    () => (doc ? buildSections(doc, hidden, renderBlock) : undefined),
    [doc, hidden, renderBlock],
  );

  if (isLoading) {
    return (
      <Screen>
        <WorkspaceSkeleton />
      </Screen>
    );
  }

  if (error || !doc || !sections) {
    return (
      <Screen>
        <AsyncBoundary
          error={error ?? true}
          onRetry={refresh}
          errorTitle={
            isPermissionError
              ? t('workspacePermissionError', 'You do not have permission to view {{workspace}}', {
                  workspace,
                })
              : t('workspaceError', "Couldn't load workspace {{workspace}}", {
                  workspace,
                })
          }
        />
      </Screen>
    );
  }

  const isEmpty =
    sections.data.length === 0 &&
    sections.text.length === 0 &&
    sections.shortcuts.length === 0 &&
    sections.links.length === 0;

  return (
    <Screen>
      {/* D-11 page-title dial: moderate (32px) — a workspace title is
          wayfinding, not display copy. No divider: the rule under the title
          earned no role (Axiom 16 chrome-earns-role). */}
      <PageHeader
        title={doc.title ?? doc.label ?? workspace}
        titleScale="moderate"
        divider={false}
      />
      {hidden.has('recent') ? null : <WorkspaceRecents />}
      {isEmpty ? (
        <AsyncBoundary
          empty
          emptyTitle={t('workspaceEmpty', 'This workspace is empty')}
          emptyDescription={t('workspaceEmptyDescription', 'No blocks have been added to {{workspace}} yet', {
            workspace,
          })}
        />
      ) : (
        <>
          {sections.data.length > 0 ? <WorkspaceGrid items={sections.data} /> : null}
          {sections.text.length > 0 ? <WorkspaceGrid items={sections.text} /> : null}
          {sections.shortcuts.length > 0 ? (
            // Section heading on the shared sectionHeading scale (LC-17) —
            // PageSection owns it; no divider rule over a chip band.
            <PageSection
              title={t('workspaceShortcuts', 'Shortcuts')}
              divider={false}>
              <XStack
                flexWrap="wrap"
                {...knobProps.gap}>
                {sections.shortcuts.map((row) => (
                  <WorkspaceShortcut
                    key={row.name}
                    row={row}
                    onPress={onShortcutPress}
                  />
                ))}
              </XStack>
            </PageSection>
          ) : null}
          {sections.links.length > 0 ? <WorkspaceLinkDirectory items={sections.links} /> : null}
        </>
      )}
    </Screen>
  );
}
