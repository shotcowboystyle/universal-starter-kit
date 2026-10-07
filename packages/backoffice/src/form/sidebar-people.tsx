/**
 * People rows for the form sidebar (Assigned To / Shared With) and the
 * compact avatar strip (Liked By). Unlike frappe-ui FormSidebar's built-in
 * initials-only rows, these render the docinfo `user_info` image with an
 * initials fallback — desk parity for user chips.
 */

import { Avatar, Button, styled, Text, XStack, YStack } from '@repo/ui';
import { useResolvedKnobs } from '@repo/theme';
import { XIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

const SidebarAvatarSlot = styled(XStack, { name: 'SidebarAvatarSlot' });

export interface SidebarPersonItem {
  /** Stable row id (assignment/share row name, or the user id). */
  id: string;
  /** User id (email) the action RPCs target. */
  user: string;
  /** Display name (user_info fullname, falls back to the user id). */
  label: string;
  /** Secondary line (assignment description, share level, …). */
  sublabel?: string;
  /** Avatar image URL (user_info image), absolute. */
  image?: string;
  /** Hide the remove affordance for this row (e.g. "Everyone" shares). */
  removable?: boolean;
}

export interface SidebarPeopleListProps {
  items: SidebarPersonItem[];
  emptyText: string;
  onRemove?: (item: SidebarPersonItem) => void;
  disabled?: boolean;
}

export function SidebarPeopleList({ items, emptyText, onRemove, disabled }: SidebarPeopleListProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const sz = knobProps.sizeToken;
  const avatarSize = sz === '$3' ? '$1' : sz === '$5' ? '$3' : '$2';
  const labelFontSize = sz === '$3' ? '$1' : sz === '$5' ? '$4' : '$2';
  const subFontSize = sz === '$5' ? '$2' : '$1';

  if (items.length === 0) {
    return (
      <Text
        fontSize={subFontSize}
        color="$color11">
        {emptyText}
      </Text>
    );
  }

  return (
    <YStack {...knobProps.gap}>
      {items.map((item) => (
        <XStack
          key={item.id}
          gap="$2"
          alignItems="center">
          <Avatar
            size={avatarSize}
            src={item.image}
            name={item.label}
          />
          <YStack
            flex={1}
            minWidth={0}>
            <Text
              fontSize={labelFontSize}
              color="$color12"
              numberOfLines={1}>
              {item.label}
            </Text>
            {item.sublabel ? (
              <Text
                fontSize={subFontSize}
                color="$color11"
                numberOfLines={1}>
                {item.sublabel}
              </Text>
            ) : null}
          </YStack>
          {onRemove && item.removable !== false && (
            <Button
              size="$1"
              chromeless
              icon={XIcon}
              disabled={disabled}
              aria-label={t('removePerson', 'Remove {{name}}', {
                name: item.label,
              })}
              onPress={() => {
                onRemove(item);
              }}
            />
          )}
        </XStack>
      ))}
    </YStack>
  );
}

export interface SidebarAvatarStripProps {
  items: { id: string; label: string; image?: string }[];
  /**
   * Clamp to the first `max` avatars and render a "+N" bubble for the rest
   * (header-cluster readout). Unset = render every avatar (sidebar rows).
   */
  max?: number;
}

/** Overlapping mini-avatar strip (Liked By, header cluster assignees). */
export function SidebarAvatarStrip({ items, max }: SidebarAvatarStripProps) {
  if (items.length === 0) {
    return null;
  }
  const visible = typeof max === 'number' && max > 0 ? items.slice(0, max) : items;
  const overflow = items.length - visible.length;
  return (
    <XStack alignItems="center">
      {visible.map((item, index) => (
        <SidebarAvatarSlot
          key={item.id}
          marginInlineStart={index === 0 ? 0 : -6}>
          <Avatar
            size="$1"
            src={item.image}
            name={item.label}
            alt={item.label}
          />
        </SidebarAvatarSlot>
      ))}
      {overflow > 0 && (
        <SidebarAvatarSlot marginInlineStart={-6}>
          <Avatar
            size="$1"
            alt={`+${overflow}`}
            fallback={
              <Text
                fontSize="$1"
                fontWeight="400"
                color="$color11">
                +{overflow}
              </Text>
            }
          />
        </SidebarAvatarSlot>
      )}
    </XStack>
  );
}
