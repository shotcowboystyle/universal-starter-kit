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

import { XStack, useTheme } from '@repo/ui';
import { Button } from '@repo/forms';
import { useFrappeConfig } from '@repo/frappe-ui';
import { pressTargetStyle, useResolvedKnobs } from '@repo/theme';
import { BellIcon, HeartIcon, UserCirclePlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeCapabilities } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { DocInfo } from '../shared/useDocinfo';
import { useFrappeApp } from '../shared/useFrappeApp';

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

export function FormHeaderCluster({ doctype, name, docinfo, currentUser, onRefresh }: FormHeaderClusterProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const iconSize = Number(knobProps.controlIcon?.width) || 16;
  const app = useFrappeApp();
  const config = useFrappeConfig();
  const capabilities = useBackofficeCapabilities();
  const theme = useTheme();
  const [busy, setBusy] = useState<'assign' | 'like' | 'follow' | undefined>();
  const [assignOpen, setAssignOpen] = useState(false);

  if (!docinfo) {
    return null;
  }

  const userInfo = docinfo.user_info ?? {};
  const userLabel = (id: string): string => userInfo[id]?.fullname ?? id;
  const userImage = (id: string): string | undefined => {
    const image = userInfo[id]?.image;
    return typeof image === 'string' && image ? toAbsoluteUrl(config?.baseURL, image) : undefined;
  };

  const assignees = [
    ...new Set(
      (docinfo.assignments ?? []).flatMap((assignment) =>
        typeof assignment.owner === 'string' && assignment.owner ? [assignment.owner] : [],
      ),
    ),
  ];
  const likers = [
    ...new Set(
      (docinfo.like_logs ?? []).flatMap((log) => (typeof log.owner === 'string' && log.owner ? [log.owner] : [])),
    ),
  ];
  const likedByMe = Boolean(currentUser) && likers.includes(currentUser!);
  // NOTE: follow_document is a server-side no-op when document-follow
  // notifications are disabled (the local bench default) — the toggle then
  // snaps back on refresh, matching desk behavior.
  const isFollowed = Boolean(docinfo.is_document_followed);

  const run = async (kind: 'assign' | 'like' | 'follow', action: () => Promise<unknown>) => {
    if (busy || !app) {
      return;
    }
    setBusy(kind);
    try {
      await action();
    } catch {
      // Cluster mutations are non-critical; the refresh reflects the
      // server's actual state either way.
    } finally {
      onRefresh();
      setBusy(undefined);
    }
  };

  // Phosphor icons take resolved color strings (not tamagui tokens) so
  // native/GTK get a real color — same pattern as sidebar-attachments.
  const mutedColor = typeof theme.color11?.val === 'string' ? theme.color11.val : undefined;
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
              void run('like', async () => await toggleLike(app, doctype, name, !likedByMe));
            }}
            testID="form-header-like">
            {likers.length > 0 ? String(likers.length) : undefined}
          </Button>
          {currentUser && (
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
                void run('follow', async () =>
                  isFollowed
                    ? await unfollowDocument(app, doctype, name, user)
                    : await followDocument(app, doctype, name, user),
                );
              }}
              testID="form-header-follow"
            />
          )}
          <SidebarAssignDialog
            open={assignOpen}
            onOpenChange={setAssignOpen}
            onAssign={(user, description) => {
              void run('assign', async () => await addAssignment(app, doctype, name, [user], description));
            }}
          />
        </>
      )}
    </XStack>
  );
}
