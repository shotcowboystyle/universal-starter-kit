import {
  ClockIcon,
  HeartIcon,
  PaperclipIcon,
  PlusIcon,
  ShareNetworkIcon,
  TagIcon,
  UsersIcon,
} from '@phosphor-icons/react';
/**
 * Form page metadata rail (MOD-07): Assigned To / Attachments / Tags /
 * Shared With / Liked By as accordion sections with live count badges —
 * populated sections default open, empty sections default collapsed and stay
 * one tap from their add affordance (tap the header → expands → add). The
 * high-frequency like/follow toggles ALSO live in the toolbar header cluster
 * (FormHeaderCluster); this rail is the management surface (assign / remove /
 * upload / share rows, liked-by cluster with its own heart).
 *
 * P-14 (owner, ratified 2026-08-12) is preserved by this redesign: the rail
 * never owns a scroll container (the page scaffold scrolls — accordion items
 * grow the page); rows are not pressable (only explicit remove/link
 * affordances).
 *
 * Collaboration blocks ride the frappe-ui components (roadmap adoption,
 * 2026-08-12): "Assigned To" embeds `FrappeAssignment` (live to-do
 * collection, assign_to add/close/remove parity, backend-searched user
 * combobox) and "Liked By" embeds `FrappeLikedBy` (live `_liked_by` heart +
 * avatar cluster over `toggle_like`). Both refresh the shared docinfo via
 * their mutation callbacks so the accordion badges and the header cluster
 * stay in sync. Each block sits behind a FormErrorBoundary so a crashing
 * collaboration widget degrades to its slot, never the route.
 *
 * Contract (fixed — form-core composes this): props {doctype, name, meta?,
 * doc?}. Optional additions: stacked, docinfo/onRefresh (parent-owned shared
 * fetch so the header cluster and rail stay in sync), docinfoOverride
 * (stories/tests render without a bench), currentUser (session user for the
 * like toggle + assigned_by attribution; resolved server-side when omitted).
 */
import { Button } from '@repo/forms';
import type { FrappeApp } from '@repo/frappe';
import { FrappeAssignment, FrappeLikedBy, parseLikedBy, useFrappeConfig } from '@repo/frappe-ui';
import {
  ensureFocusVisibleRing,
  getGroupPosition,
  sizeRecipeEscape,
  stackEdgeRadius,
  useResolvedKnobs,
} from '@repo/theme';
import { Accordion, AsyncSkeleton, Chip, Image, Tags, Text, XStack, YStack, useTheme } from '@repo/ui';
import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeCapabilities } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { invalidateDocinfo, useDocinfo } from '../shared/use-docinfo';
import type { DocInfo, DocInfoRecord } from '../shared/use-docinfo';
import type { DoctypeMeta } from '../shared/use-doctype-meta';
import { useFrappeApp } from '../shared/use-frappe-app';

import { FormErrorBoundary } from './FormErrorBoundary';
import { SidebarAttachments } from './sidebar-attachments';
import type { SidebarAttachmentItem } from './sidebar-attachments';
import { SidebarShareDialog } from './sidebar-dialogs';
import { SidebarPeopleList } from './sidebar-people';
import type { SidebarPersonItem } from './sidebar-people';
import {
  addShare,
  addTag,
  fetchTagSuggestions,
  removeAttachment,
  removeShare,
  removeTag,
  uploadAttachment,
} from './sidebar-rpc';
import { formatRelativeTime, parseTagString, toAbsoluteUrl } from './sidebar-utils';
import type { SidebarTranslate } from './sidebar-utils';

const RAIL_WIDTH = 280;

/**
 * Structural subset of doctype meta the sidebar reads. The union keeps the
 * shared DoctypeMeta contract while also admitting other loose meta shapes
 * (stories, tests) without a cast.
 */
export interface FormSidebarPanelMetaLike {
  image_field?: string;
  max_attachments?: number;
}

export interface FormSidebarPanelProps {
  doctype: string;
  name: string;
  meta?: DoctypeMeta | FormSidebarPanelMetaLike;
  /** Current document values (owner, modified_by, timestamps, …) */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- an open frappe document whose keys vary by doctype
  doc?: Record<string, unknown>;
  /** Full-width variant without the end rail (stacks under the form). */
  stacked?: boolean;
  /**
   * Parent-owned docinfo (DocFormScreen shares one get_docinfo with the
   * header cluster). Takes precedence over the internal fetch so cluster
   * mutations reflect here without a second round-trip.
   */
  docinfo?: DocInfo;
  /** Notify the parent after a mutation so sibling panels refresh too. */
  onRefresh?: () => void;
  /** Preloaded docinfo (stories/tests) — skips the get_docinfo fetch. */
  docinfoOverride?: DocInfo;
  /**
   * Session user: enables the like toggle and attributes `assigned_by` on
   * new assignments. The embedded components resolve it server-side when
   * omitted (fixture mode then renders the heart disabled).
   */
  currentUser?: string;
}

interface SidebarAccordionSection {
  key: string;
  title: string;
  count: number;
  icon: ReactNode;
  content: ReactNode;
}

/**
 * Accordion.Trigger chrome for one rail section. LC-72: hover/press/ring
 * inherit stacked-group corners (Assigned To first, Liked By last; an OPEN
 * trigger squares its bottom even at last). Accordion.Item stays a direct
 * Accordion child so the root can count positions — a custom Item wrapper
 * is opaque and would collapse every row to "only".
 */
export const SidebarAccordionTrigger = ({
  section,
  index,
  count,
  open,
}: {
  section: SidebarAccordionSection;
  index: number;
  count: number;
  open: boolean;
}) => {
  const { knobProps } = useResolvedKnobs();
  const position = getGroupPosition(index, count);
  const corners = stackEdgeRadius(knobProps.borderRadius.borderRadius, {
    start: position === 'first' || position === 'only',
    end: (position === 'last' || position === 'only') && !open,
  });
  return (
    <Accordion.Trigger
      icon={section.icon}
      testID={`form-sidebar-section-${section.key}`}
      minHeight={36}
      paddingVertical="$2"
      paddingHorizontal="$2"
      overflow="hidden"
      outlineWidth={0}
      {...corners}
      {...{ 'data-group-position': position }}
      hoverStyle={{ backgroundColor: '$color3', ...corners }}
      pressStyle={{ backgroundColor: '$color5', ...corners }}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}>
      <XStack
        flex={1}
        alignItems="center"
        gap="$2">
        <Text
          fontSize="$3"
          fontWeight="400"
          color="$color12"
          numberOfLines={1}>
          {section.title}
        </Text>
        <Chip
          size="$2"
          variant="subtle"
          color="gray">
          {String(section.count)}
        </Chip>
      </XStack>
    </Accordion.Trigger>
  );
};

interface ShareLabels {
  everyone: string;
  canEdit: string;
  canView: string;
}

/** Shared With rows from docinfo.shared: one per user share, plus the Everyone share. */
const toShareItems = (
  rows: readonly DocInfoRecord[],
  labels: ShareLabels,
  userLabel: (id: string) => string,
  userImage: (id: string) => string | undefined,
): SidebarPersonItem[] =>
  rows.flatMap((share) => {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- docinfo is wire data; frappe sends null for absent values, so only a non-empty string is usable
    const rowName = typeof share.name === 'string' ? share.name : undefined;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- docinfo is wire data; frappe sends null for absent values, so only a non-empty string is usable
    const user = typeof share.user === 'string' ? share.user : '';
    const everyone = Boolean(share.everyone);
    if (user === '' && !everyone) {
      return [];
    }
    const canWrite = Boolean(share.write);
    const canRead = Boolean(share.read);
    let sublabel: string | undefined;
    if (canWrite) {
      sublabel = labels.canEdit;
    } else if (canRead) {
      sublabel = labels.canView;
    }
    return [
      {
        id: rowName ?? (user || 'everyone'),
        user,
        label: everyone ? labels.everyone : userLabel(user),
        sublabel,
        image: everyone || user === '' ? undefined : userImage(user),
        removable: !everyone && user !== '',
      },
    ];
  });

/** "Created … by …" / "Last edited … by …" footer lines from the doc's stamps. */
const bylineEntries = (
  doc: FormSidebarPanelProps['doc'],
  t: SidebarTranslate,
  userLabel: (id: string) => string,
): { key: string; label: string }[] => {
  const metadata: { key: string; label: string }[] = [];
  const created = formatRelativeTime(doc?.creation, t) ?? '';
  if (created !== '') {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- docinfo is wire data; frappe sends null for absent values, so only a non-empty string is usable
    const owner = typeof doc?.owner === 'string' ? doc.owner : '';
    metadata.push({
      key: 'created',
      label:
        owner === ''
          ? t('createdWhen', 'Created {{when}}', { when: created })
          : t('createdByline', 'Created {{when}} by {{user}}', { when: created, user: userLabel(owner) }),
    });
  }
  const edited = formatRelativeTime(doc?.modified, t) ?? '';
  if (edited !== '') {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- docinfo is wire data; frappe sends null for absent values, so only a non-empty string is usable
    const editor = typeof doc?.modified_by === 'string' ? doc.modified_by : '';
    metadata.push({
      key: 'edited',
      label:
        editor === ''
          ? t('editedWhen', 'Last edited {{when}}', { when: edited })
          : t('editedByline', 'Last edited {{when}} by {{user}}', { when: edited, user: userLabel(editor) }),
    });
  }
  return metadata;
};

// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity -- one accordion of five sibling sections over shared docinfo/busy state; each section is already a component
export const FormSidebarPanel = ({
  doctype,
  name,
  meta,
  doc,
  stacked = false,
  docinfo: docinfoProp,
  onRefresh,
  docinfoOverride,
  currentUser,
}: FormSidebarPanelProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const iconSize = knobProps.controlIcon?.width ?? 14;
  const theme = useTheme();
  const app = useFrappeApp();
  const config = useFrappeConfig();
  const capabilities = useBackofficeCapabilities();
  const baseURL = config?.baseURL;
  const isNewDoc = !name || name === 'new';

  const {
    docinfo: fetched,
    loading,
    reload,
  } = useDocinfo(docinfoOverride ? undefined : doctype, docinfoOverride ? undefined : name);
  const docinfo = docinfoOverride ?? docinfoProp ?? fetched;

  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  // Open accordion sections: initialized from counts once docinfo resolves
  // (populated → open, empty → collapsed); user toggles win afterwards.
  const [openSections, setOpenSections] = useState<string[]>([]);
  const openInitializedRef = useRef(false);

  // Existing tag names for the add-tag autocomplete (best-effort).
  useEffect(() => {
    if (!app || !doctype || docinfoOverride) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const names = await fetchTagSuggestions(app, doctype);
        if (!cancelled) {
          setTagSuggestions(names);
        }
      } catch {
        // Suggestions are sugar; typing a new tag still works.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [app, doctype, docinfoOverride]);

  const refresh = () => {
    invalidateDocinfo(doctype, name);
    reload();
    onRefresh?.();
  };

  const run = async (action: (client: FrappeApp) => Promise<void>) => {
    if (busy || !app) {
      return;
    }
    setBusy(true);
    try {
      await action(app);
    } catch {
      // Sidebar mutations are non-critical; the refresh below reflects the
      // server's actual state either way.
    }
    refresh();
    setBusy(false);
  };

  const userInfo = docinfo?.user_info ?? {};
  const userLabel = (id: string): string => userInfo[id]?.fullname ?? id;
  const userImage = (id: string): string | undefined => {
    const image = userInfo[id]?.image;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- docinfo is wire data; frappe sends null for absent values, so only a non-empty string is usable
    return typeof image === 'string' && image ? toAbsoluteUrl(baseURL, image) : undefined;
  };

  // -- Assigned To ------------------------------------------------------------
  // The section body is the live FrappeAssignment widget; docinfo only feeds
  // the accordion badge (desk parity: open assignments count) and refreshes
  // through the widget's mutation callbacks.
  const assignedCount = (docinfo?.assignments ?? []).filter((assignment) => (assignment.owner ?? '') !== '').length;

  // -- Attachments ----------------------------------------------------------
  const attachments: SidebarAttachmentItem[] = (docinfo?.attachments ?? []).flatMap((file) => {
    const id = file.name ?? '';
    const fileUrl = file.file_url ?? '';
    if (id === '' || fileUrl === '') {
      return [];
    }
    return [
      {
        id,
        fileName: file.file_name ?? fileUrl.split('/').pop() ?? id,
        fileUrl,
        isPrivate: Boolean(file.is_private),
      },
    ];
  });
  const maxAttachments = meta?.max_attachments ?? undefined;

  // -- Tags -------------------------------------------------------------------
  const tags = parseTagString(docinfo?.tags);

  // -- Shared With ------------------------------------------------------------
  const shares = toShareItems(
    docinfo?.shared ?? [],
    { everyone: t('everyone', 'Everyone'), canEdit: t('canEdit', 'Can edit'), canView: t('canView', 'Can view') },
    userLabel,
    userImage,
  );

  // -- Liked By ----------------------------------------------------------------
  // The section body is the live FrappeLikedBy widget (`_liked_by` heart +
  // avatar cluster). The badge prefers the doc's current `_liked_by`; when
  // the doc payload lacks it (older fixtures) fall back to distinct
  // like-log owners from docinfo.
  const likedByField = doc?._liked_by;
  const likeLogOwners = new Set(
    (docinfo?.like_logs ?? []).flatMap((log) =>
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- docinfo is wire data; frappe sends null for absent values, so only a non-empty string is usable
      typeof log.owner === 'string' && log.owner ? [log.owner] : [],
    ),
  );
  const likeCount = likedByField === undefined ? likeLogOwners.size : parseLikedBy(likedByField).length;

  // Default open set from counts, once, when docinfo first resolves.
  const attachmentCount = attachments.length;
  const tagCount = tags.length;
  const shareCount = shares.length;
  const hasDocinfo = Boolean(docinfo);
  useEffect(() => {
    if (openInitializedRef.current || !hasDocinfo) {
      return;
    }
    openInitializedRef.current = true;
    const defaults: string[] = [];
    if (assignedCount > 0) {
      defaults.push('assigned');
    }
    if (attachmentCount > 0) {
      defaults.push('attachments');
    }
    if (tagCount > 0) {
      defaults.push('tags');
    }
    if (shareCount > 0) {
      defaults.push('shared');
    }
    if (likeCount > 0) {
      defaults.push('liked');
    }
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- one-shot default from the first docinfo; user toggles win afterwards
    setOpenSections(defaults);
  }, [hasDocinfo, assignedCount, attachmentCount, tagCount, shareCount, likeCount]);

  if (isNewDoc) {
    return null;
  }

  if (!docinfo && loading) {
    return (
      <YStack
        {...knobProps.panelPadding}
        {...(stacked ? { width: '100%' } : { width: RAIL_WIDTH })}
        testID="form-sidebar-skeleton">
        <AsyncSkeleton layout="list" />
      </YStack>
    );
  }

  // Phosphor icons take resolved color strings (not tamagui tokens) so
  // native/GTK get a real color — same pattern as sidebar-attachments.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- theme values are loosely typed tokens; only a string is a usable color
  const iconColor = typeof theme.color11?.val === 'string' ? theme.color11.val : undefined;

  const allSections: SidebarAccordionSection[] = [
    {
      key: 'assigned',
      title: t('assignedTo', 'Assigned To'),
      count: assignedCount,
      icon: (
        <UsersIcon
          size={iconSize}
          color={iconColor}
        />
      ),
      content: (
        // The accordion header owns the section title, so the widget's own
        // label slot is blanked (label="") — its add affordance and live
        // assignee list are the section body. Mutations refresh the shared
        // docinfo so the badge and the header cluster stay honest.
        <FormErrorBoundary
          errorTitle={t('assignmentsRenderError', 'Assignments failed to render')}
          testID="form-sidebar-assigned-error">
          <FrappeAssignment
            doctype={doctype}
            name={name}
            label=""
            currentUser={currentUser}
            onAssign={() => {
              refresh();
            }}
            onRemove={() => {
              refresh();
            }}
            onComplete={() => {
              refresh();
            }}
            testID="form-sidebar-assignment"
          />
        </FormErrorBoundary>
      ),
    },
    {
      key: 'attachments',
      title: t('attachments', 'Attachments'),
      count: attachmentCount,
      icon: (
        <PaperclipIcon
          size={iconSize}
          color={iconColor}
        />
      ),
      content: (
        <SidebarAttachments
          items={attachments}
          baseURL={baseURL}
          maxAttachments={maxAttachments}
          disabled={busy}
          onUpload={(file) => {
            void run(async (client) => {
              await uploadAttachment(client, file, doctype, name);
            });
          }}
          onRemove={(item) => {
            void run(async (client) => {
              await removeAttachment(client, item.id, doctype, name);
            });
          }}
        />
      ),
    },
    {
      key: 'tags',
      title: t('tags', 'Tags'),
      count: tagCount,
      icon: (
        <TagIcon
          size={iconSize}
          color={iconColor}
        />
      ),
      content: (
        <Tags
          compact
          tags={tags.map((tag) => ({ id: tag, label: tag }))}
          suggestions={tagSuggestions.map((tag) => ({ id: tag, label: tag }))}
          disabled={busy}
          enableAdd
          onAdd={(tagName) => {
            void run(async (client) => {
              await addTag(client, doctype, name, tagName);
            });
          }}
          onRemove={(tag) => {
            void run(async (client) => {
              await removeTag(client, doctype, name, tag.label);
            });
          }}
          labels={{
            addTag: t('addTag', 'Add Tag'),
            noTags: t('noTags', 'No tags'),
            clickToAdd: t('clickToAddTags', 'Click + to add tags'),
            suggestions: t('tagSuggestions', 'Suggestions'),
            noAvailableTags: t('noAvailableTags', 'No available tags'),
            createTag: (value: string) => t('createTag', 'Create "{{value}}"', { value }),
          }}
          placeholder={t('addTagPlaceholder', 'Add tag...')}
        />
      ),
    },
    {
      key: 'shared',
      title: t('sharedWith', 'Shared With'),
      count: shareCount,
      icon: (
        <ShareNetworkIcon
          size={iconSize}
          color={iconColor}
        />
      ),
      content: (
        <YStack {...knobProps.gap}>
          <SidebarPeopleList
            items={shares}
            emptyText={t('notShared', 'Not shared')}
            disabled={busy}
            onRemove={(item) => {
              void run(async (client) => {
                await removeShare(client, doctype, name, item.user);
              });
            }}
          />
          <XStack>
            <Button
              size="$2"
              outlined
              icon={<PlusIcon size={iconSize} />}
              loading={busy}
              onPress={() => {
                setShareOpen(true);
              }}
              testID="form-sidebar-share">
              {t('share', 'Share')}
            </Button>
          </XStack>
        </YStack>
      ),
    },
    {
      key: 'liked',
      title: t('likedBy', 'Liked By'),
      count: likeCount,
      icon: (
        <HeartIcon
          size={iconSize}
          color={iconColor}
        />
      ),
      content: (
        // Live `_liked_by` heart + avatar cluster; the toggle mirrors the
        // header cluster's heart and both refresh the shared docinfo.
        <FormErrorBoundary
          errorTitle={t('likesRenderError', 'Likes failed to render')}
          testID="form-sidebar-liked-error">
          <FrappeLikedBy
            doctype={doctype}
            name={name}
            currentUser={currentUser}
            onToggle={() => {
              refresh();
            }}
            testID="form-sidebar-liked-by"
          />
        </FormErrorBoundary>
      ),
    },
  ];

  // Host capability flags gate whole sections (provider `capabilities`).
  const sectionEnabled = new Map<string, boolean>([
    ['assigned', capabilities.assignments.enabled],
    ['attachments', capabilities.attachments.enabled],
    ['tags', capabilities.tags.enabled],
    ['shared', capabilities.shares.enabled],
  ]);
  const sections = allSections.filter((section) => sectionEnabled.get(section.key) === true);

  // -- Byline footer ----------------------------------------------------------
  const metadata = bylineEntries(doc, t, userLabel);

  // -- Document image ---------------------------------------------------------
  const imageField = meta?.image_field ?? '';
  const imageValue = imageField !== '' && doc ? doc[imageField] : undefined;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- docinfo is wire data; frappe sends null for absent values, so only a non-empty string is usable
  const imageUrl = typeof imageValue === 'string' && imageValue ? toAbsoluteUrl(baseURL, imageValue) : undefined;

  const openSectionSet = new Set(openSections);

  return (
    <>
      {/* P-14: no scroll container here — the page scaffold owns scroll. */}
      <YStack
        {...(stacked ? { width: '100%' } : { width: RAIL_WIDTH, flexShrink: 0 })}
        {...knobProps.gap}
        testID="form-sidebar">
        {imageUrl !== undefined && (
          <Image
            src={imageUrl}
            alt={t('documentImage', 'Document image')}
            width="100%"
            height={sizeRecipeEscape(140, 'document image: a fixed-height cover thumbnail in the sidebar')}
            objectFit="cover"
            {...knobProps.containerRadius}
          />
        )}
        <Accordion
          type="multiple"
          variant="plain"
          value={openSections}
          onValueChange={setOpenSections}>
          {sections.map((section, index) => (
            <Accordion.Item
              key={section.key}
              value={section.key}
              borderBottomWidth={0}>
              <SidebarAccordionTrigger
                section={section}
                index={index}
                count={sections.length}
                open={openSectionSet.has(section.key)}
              />
              <Accordion.Content
                paddingTop={0}
                paddingHorizontal="$2"
                paddingBottom="$2">
                {section.content}
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion>
        {metadata.length > 0 && (
          <YStack
            gap="$1.5"
            {...knobProps.panelPadding}
            paddingTop="$2">
            {metadata.map((entry) => (
              <XStack
                key={entry.key}
                gap="$2"
                alignItems="center">
                <ClockIcon
                  size={iconSize}
                  color={iconColor}
                />
                <Text
                  flex={1}
                  fontSize="$1"
                  color="$color11">
                  {entry.label}
                </Text>
              </XStack>
            ))}
          </YStack>
        )}
      </YStack>
      <SidebarShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        onShare={(user, canWrite) => {
          void run(async (client) => {
            await addShare(client, doctype, name, user, { write: canWrite });
          });
        }}
      />
    </>
  );
};
