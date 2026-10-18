/**
 * MOD-07 header cluster — the document's social/meta signals compacted into
 * the toolbar row, right after the status chip: assignee avatar strip
 * (+N overflow) with an assign affordance, like toggle + count, and the
 * follow bell. One glance = state of the document, no scroll.
 *
 * Management surfaces (remove assignment, who liked, shares, attachments)
 * stay in the sidebar accordion — this cluster is the readout plus the two
 * highest-frequency toggles. Data rides the parent's docinfo (one shared
 * get_docinfo per form screen); every mutation calls `onRefresh` so the
 * toolbar, sidebar, and timeline all see the new counts.
 */

import { BellIcon, HeartIcon, UserCirclePlusIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useFrappeConfig } from '@repo/frappe-ui';
import { pressTargetStyle, useResolvedKnobs } from '@repo/theme';
import { XStack, useTheme } from '@repo/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeCapabilities } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { DocInfo, DocInfoRecord } from '../shared/use-docinfo';
import { useFrappeApp } from '../shared/use-frappe-app';

import { SidebarAssignDialog } from './sidebar-dialogs';
import { SidebarAvatarStrip } from './sidebar-people';
import { addAssignment, followDocument, toggleLike, unfollowDocument } from './sidebar-rpc';
import { toAbsoluteUrl } from './sidebar-utils';

const MAX_ASSIGNEE_AVATARS = 3;

export interface FormHeaderClusterProps {
  doctype: string;
  name: string;
  /** Shared docinfo from the form screen (one get_docinfo per screen). */
  docinfo?: DocInfo;
  /** Session user — drives the like/follow toggle state. */
  currentUser?: string;
  /** Invalidate + reload docinfo after a mutation (the parent owns the fetch). */
  onRefresh: () => void;
}

type ClusterAction = 'assign' | 'like' | 'follow';

/** Distinct non-empty `owner` ids of docinfo rows, in first-seen order. */
const uniqueOwners = (rows: readonly DocInfoRecord[]): string[] => [
  ...new Set(
    rows.flatMap((row) =>
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- docinfo is wire data; frappe sends null for absent users/images, so only a non-empty string is usable
      typeof row.owner === 'string' && row.owner ? [row.owner] : [],
    ),
  ),
];

// oxlint-disable-next-line eslint/complexity -- flat JSX branching over the three toggles; splitting it would scatter the shared busy/refresh state
export const FormHeaderCluster = ({ doctype, name, docinfo, currentUser, onRefresh }: FormHeaderClusterProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const iconSize = knobProps.controlIcon?.width ?? 16;
  const app = useFrappeApp();
  const config = useFrappeConfig();
  const capabilities = useBackofficeCapabilities();
  const theme = useTheme();
  const [busy, setBusy] = useState<ClusterAction | undefined>();
  const [assignOpen, setAssignOpen] = useState(false);

  if (!docinfo) {
    return null;
  }

  const userInfo = docinfo.user_info ?? {};
  const userLabel = (id: string): string => userInfo[id]?.fullname ?? id;
  const userImage = (id: string): string | undefined => {
    const image = userInfo[id]?.image;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- docinfo is wire data; frappe sends null for absent users/images, so only a non-empty string is usable
    return typeof image === 'string' && image ? toAbsoluteUrl(config?.baseURL, image) : undefined;
  };

  const assignees = uniqueOwners(docinfo.assignments ?? []);
  const likers = uniqueOwners(docinfo.like_logs ?? []);
  const signedIn = currentUser !== undefined && currentUser !== '';
  const likedByMe = signedIn && likers.includes(currentUser);
  // NOTE: follow_document is a server-side no-op when document-follow
  // notifications are disabled (the local bench default) — the toggle then
  // snaps back on refresh, matching desk behavior.
  const isFollowed = Boolean(docinfo.is_document_followed);

  const run = async (kind: ClusterAction, action: () => Promise<void>) => {
    if (busy || !app) {
      return;
    }
    setBusy(kind);
    try {
      await action();
    } catch {
      // Cluster mutations are non-critical; the refresh reflects the
      // server's actual state either way.
    }
    onRefresh();
    setBusy(undefined);
  };

  // Phosphor icons take resolved color strings (not tamagui tokens) so
  // native/GTK get a real color — same pattern as sidebar-attachments.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- theme values are loosely typed tokens; only a string is a usable color
  const mutedColor = typeof theme.color11?.val === 'string' ? theme.color11.val : undefined;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- theme values are loosely typed tokens; only a string is a usable color
  const likedColor = typeof theme.red10?.val === 'string' ? theme.red10.val : mutedColor;

  // Chromeless toggles keep a measurable ≥44px press floor via box size
  // (DG-LAY-04 / docket D-02 — the invisible box is the sanctioned channel
  // for visually-small controls).
  const pressFloor = pressTargetStyle();

  // Assignment surfaces (avatar strip + assign affordance) ride the
  // provider's `assignments` capability; like/follow are core social chrome.
  const showAssignments = capabilities.assignments.enabled;

  return (
    <XStack
      alignItems="center"
      flexShrink={0}
      testID="form-header-cluster">
      {showAssignments && (
        <SidebarAvatarStrip
          items={assignees.map((assignee) => ({
            id: assignee,
            label: userLabel(assignee),
            image: userImage(assignee),
          }))}
          max={MAX_ASSIGNEE_AVATARS}
        />
      )}
      {app && (
        <>
          {showAssignments && (
            <Button
              chromeless
              {...pressFloor}
              icon={
                <UserCirclePlusIcon
                  size={iconSize}
                  color={mutedColor}
                />
              }
              loading={busy === 'assign'}
              aria-label={t('assignTitle', 'Add assignment')}
              onPress={() => {
                setAssignOpen(true);
              }}
              testID="form-header-assign"
            />
          )}
          <Button
            chromeless
            {...pressFloor}
            icon={
              <HeartIcon
                size={iconSize}
                weight={likedByMe ? 'fill' : 'regular'}
                color={likedByMe ? likedColor : mutedColor}
              />
            }
            loading={busy === 'like'}
            aria-pressed={likedByMe}
            aria-label={likedByMe ? t('unlike', 'Unlike') : t('like', 'Like')}
            onPress={() => {
              void run('like', async () => {
                await toggleLike(app, doctype, name, !likedByMe);
              });
            }}
            testID="form-header-like">
            {likers.length > 0 ? String(likers.length) : undefined}
          </Button>
          {signedIn && (
            // Hidden (not disabled) while the session probe resolves —
            // DG-ST-03 hide beats a flashing explained-disable in chrome.
            <Button
              chromeless
              {...pressFloor}
              icon={
                <BellIcon
                  size={iconSize}
                  weight={isFollowed ? 'fill' : 'regular'}
                  color={mutedColor}
                />
              }
              loading={busy === 'follow'}
              aria-pressed={isFollowed}
              aria-label={
                isFollowed ? t('unfollowDocument', 'Unfollow document') : t('followDocument', 'Follow document')
              }
              onPress={() => {
                const user = currentUser;
                void run('follow', async () => {
                  await (isFollowed
                    ? unfollowDocument(app, doctype, name, user)
                    : followDocument(app, doctype, name, user));
                });
              }}
              testID="form-header-follow"
            />
          )}
          <SidebarAssignDialog
            open={assignOpen}
            onOpenChange={setAssignOpen}
            onAssign={(user, description) => {
              void run('assign', async () => {
                await addAssignment(app, doctype, name, [user], description);
              });
            }}
          />
        </>
      )}
    </XStack>
  );
};
