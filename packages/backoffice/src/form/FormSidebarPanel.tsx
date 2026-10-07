import {
  Accordion,
  AsyncSkeleton,
  Chip,
  Image,
  Tags,
  Text,
  XStack,
  YStack,
  useTheme,
} from '@repo/ui';
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
 * 2026-08-12): "Assigned To" embeds `FrappeAssignment` (live ToDo
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
import { FrappeAssignment, FrappeLikedBy, parseLikedBy, useFrappeConfig } from '@repo/frappe-ui';
import {
  ensureFocusVisibleRing,
  getGroupPosition,
  sizeRecipeEscape,
  stackEdgeRadius,
  useResolvedKnobs,
} from '@repo/theme';
import {
  ClockIcon,
  HeartIcon,
  PaperclipIcon,
  PlusIcon,
  ShareNetworkIcon,
  TagIcon,
  UsersIcon,
} from '@phosphor-icons/react';
import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeCapabilities } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { invalidateDocinfo, useDocinfo } from '../shared/useDocinfo';
import type { DocInfo } from '../shared/useDocinfo';
import type { DoctypeMeta } from '../shared/useDoctypeMeta';
import { useFrappeApp } from '../shared/useFrappeApp';

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
export function SidebarAccordionTrigger({
  section,
  index,
  count,
  open,
}: {
  section: SidebarAccordionSection;
  index: number;
  count: number;
  open: boolean;
}) {
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
}

export function FormSidebarPanel({
  doctype,
  name,
  meta,
  doc,
  stacked = false,
  docinfo: docinfoProp,
  onRefresh,
  docinfoOverride,
  currentUser,
}: FormSidebarPanelProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const iconSize = Number(knobProps.controlIcon?.width) || 14;
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
      return;
    }
    let cancelled = false;
    fetchTagSuggestions(app, doctype)
      .then((names) => {
        if (!cancelled) {
          setTagSuggestions(names);
        }
      })
      .catch(() => {
        // Suggestions are sugar; typing a new tag still works.
      });
    return () => {
      cancelled = true;
    };
  }, [app, doctype, docinfoOverride]);

  const refresh = () => {
    invalidateDocinfo(doctype, name);
    reload();
    onRefresh?.();
  };

  const run = async (action: () => Promise<unknown>) => {
    if (busy || !app) {
      return;
    }
    setBusy(true);
    try {
      await action();
    } catch {
      // Sidebar mutations are non-critical; the refresh below reflects the
      // server's actual state either way.
    } finally {
      refresh();
      setBusy(false);
    }
  };

  const userInfo = docinfo?.user_info ?? {};
  const userLabel = (id: string): string => userInfo[id]?.fullname ?? id;
  const userImage = (id: string): string | undefined => {
    const image = userInfo[id]?.image;
    return typeof image === 'string' && image ? toAbsoluteUrl(baseURL, image) : undefined;
  };

  // -- Assigned To ------------------------------------------------------------
  // The section body is the live FrappeAssignment widget; docinfo only feeds
  // the accordion badge (desk parity: open assignments count) and refreshes
  // through the widget's mutation callbacks.
  const assignedCount = (docinfo?.assignments ?? []).filter((assignment) => !!assignment.owner).length;

  // -- Attachments ----------------------------------------------------------
  const attachments: SidebarAttachmentItem[] = (docinfo?.attachments ?? []).flatMap((file) => {
    if (!file.name || !file.file_url) {
      return [];
    }
    return [
      {
        id: file.name,
        fileName: file.file_name ?? file.file_url.split('/').pop() ?? file.name,
        fileUrl: file.file_url,
        isPrivate: Boolean(file.is_private),
      },
    ];
  });
  const maxAttachments = typeof meta?.max_attachments === 'number' ? meta.max_attachments : undefined;

  // -- Tags -------------------------------------------------------------------
  const tags = parseTagString(docinfo?.tags);

  // -- Shared With ------------------------------------------------------------
  const shares: SidebarPersonItem[] = (docinfo?.shared ?? []).flatMap((share) => {
    const rowName = typeof share.name === 'string' ? share.name : undefined;
    const user = typeof share.user === 'string' ? share.user : undefined;
    const everyone = Boolean(share.everyone);
    if (!user && !everyone) {
      return [];
    }
    return [
      {
        id: rowName ?? user ?? 'everyone',
        user: user ?? '',
        label: everyone ? t('everyone', 'Everyone') : userLabel(user ?? ''),
        sublabel: share.write ? t('canEdit', 'Can edit') : share.read ? t('canView', 'Can view') : undefined,
        image: everyone || !user ? undefined : userImage(user),
        removable: !everyone && Boolean(user),
      },
    ];
  });

  // -- Liked By ----------------------------------------------------------------
  // The section body is the live FrappeLikedBy widget (`_liked_by` heart +
  // avatar cluster). The badge prefers the doc's current `_liked_by`; when
  // the doc payload lacks it (older fixtures) fall back to distinct
  // like-log owners from docinfo.
  const likedByField = doc ? (doc as { _liked_by?: unknown })._liked_by : undefined;
  const likeLogOwners = new Set(
    (docinfo?.like_logs ?? []).flatMap((log) => (typeof log.owner === 'string' && log.owner ? [log.owner] : [])),
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
            void run(async () => await uploadAttachment(app!, file, doctype, name));
          }}
          onRemove={(item) => {
            void run(async () => await removeAttachment(app!, item.id, doctype, name));
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
            void run(async () => await addTag(app!, doctype, name, tagName));
          }}
          onRemove={(tag) => {
            void run(async () => await removeTag(app!, doctype, name, tag.label));
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
              void run(async () => await removeShare(app!, doctype, name, item.user));
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
  const sectionEnabled: Record<string, boolean> = {
    assigned: capabilities.assignments.enabled,
    attachments: capabilities.attachments.enabled,
    tags: capabilities.tags.enabled,
    shared: capabilities.shares.enabled,
  };
  const sections = allSections.filter((section) => sectionEnabled[section.key]);

  // -- Byline footer ----------------------------------------------------------
  const metadata: { key: string; label: string }[] = [];
  if (doc?.creation) {
    const rel = formatRelativeTime(doc.creation, t);
    const owner = typeof doc.owner === 'string' ? doc.owner : undefined;
    if (rel) {
      metadata.push({
        key: 'created',
        label: owner
          ? t('createdByline', 'Created {{when}} by {{user}}', {
              when: rel,
              user: userLabel(owner),
            })
          : t('createdWhen', 'Created {{when}}', { when: rel }),
      });
    }
  }
  if (doc?.modified) {
    const rel = formatRelativeTime(doc.modified, t);
    const editor = typeof doc.modified_by === 'string' ? doc.modified_by : undefined;
    if (rel) {
      metadata.push({
        key: 'edited',
        label: editor
          ? t('editedByline', 'Last edited {{when}} by {{user}}', {
              when: rel,
              user: userLabel(editor),
            })
          : t('editedWhen', 'Last edited {{when}}', { when: rel }),
      });
    }
  }

  // -- Document image ---------------------------------------------------------
  const imageField = meta?.image_field;
  const imageValue = imageField && doc ? doc[imageField] : undefined;
  const imageUrl = typeof imageValue === 'string' && imageValue ? toAbsoluteUrl(baseURL, imageValue) : undefined;

  return (
    <>
      {/* P-14: no scroll container here — the page scaffold owns scroll. */}
      <YStack
        {...(stacked ? { width: '100%' } : { width: RAIL_WIDTH, flexShrink: 0 })}
        {...knobProps.gap}
        testID="form-sidebar">
        {imageUrl && (
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
                open={openSections.includes(section.key)}
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
          void run(async () => await addShare(app!, doctype, name, user, { write: canWrite }));
        }}
      />
    </>
  );
}
