/**
 * FormSidebar — a generic sidebar for form views.
 *
 * Renders configurable sections (image, custom sections, metadata)
 * from a generic section config.  Completely framework-agnostic: no
 * dependency on Frappe, live queries, or any ORM layer.
 *
 * Affordances are callback-driven and render only when wired:
 * - `onImageAdd` / `onImageRemove` — add/replace/remove the document image
 *   (the file-picking UI itself is consumer-owned).
 * - `SidebarSection.onAdd` — the "+" button per section.
 * - `SidebarSection.onRemoveItem` — a per-row remove button.
 *
 * Richer desk sections (tags, attachments, follow toggles) compose through
 * `SidebarSection.render` with the catalog primitives (`Tags`,
 * `Attachments` from `@repo/ui`) — see the
 * DeskParity story.
 */

import { ImageSquareIcon, PlusIcon, UploadIcon, UserIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { Avatar, componentColors, getInitials } from '@repo/ui';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ListItem, Separator, Text, XStack, YStack, isWeb, useTheme } from 'tamagui';
import type { YStackProps } from 'tamagui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single item in an assignment / shared-with section. */
export interface SidebarPerson {
  id: string;
  label: string;
  sublabel?: string;
}

/** A generic sidebar section. */
export interface SidebarSection {
  /** Unique key for this section */
  key: string;
  /** Section heading */
  title: string;
  /** Optional icon next to the heading */
  icon?: React.ReactNode;
  /** Items to render in this section */
  items?: SidebarPerson[];
  /** Empty-state text when items is empty */
  emptyText?: string;
  /** Callback when the "add" button is pressed */
  onAdd?: () => void;
  /** Called with the row's item when its remove affordance is pressed;
   *  when provided every row renders a small remove button */
  onRemoveItem?: (item: SidebarPerson) => void;
  /** Optional custom renderer – if provided, items/emptyText are ignored */
  render?: () => React.ReactNode;
}

/** Metadata entry displayed in the Info section. */
export interface SidebarMetadataEntry {
  label: string;
  icon?: React.ReactNode;
}

export interface FormSidebarProps extends Omit<YStackProps, 'children'> {
  /** Optional image URL to display at the top */
  imageUrl?: string;
  /** Accessible label for the image block (defaults to "Document image") */
  imageLabel?: string;
  /** Request to add/replace the document image. Renders an "Add image"
   *  placeholder when `imageUrl` is unset and a Replace button when set. */
  onImageAdd?: () => void;
  /** Request to remove the current image; renders a Remove button. */
  onImageRemove?: () => void;
  /** Configurable sections to render (assignments, shares, tags, etc.) */
  sections?: SidebarSection[];
  /** Metadata lines shown at the bottom (e.g. created by / modified by) */
  metadata?: SidebarMetadataEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Initials come from the catalog Avatar helper (census #21) — the local copy
// this file carried could drift from the one Timeline/Avatar consume.

// R12 tint family (decorative, not semantic): orange / blue / purple / pink.
const avatarColors = ['$orange4', '$blue4', '$purple4', '$pink4'];
function avatarColor(index: number): string {
  return avatarColors[index % avatarColors.length];
}

const textColors = ['$orange11', '$blue11', '$purple11', '$pink11'];
function textColor(index: number): string {
  return textColors[index % textColors.length];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormSidebar({
  imageUrl,
  imageLabel,
  onImageAdd,
  onImageRemove,
  sections = [],
  metadata = [],
  ...stackProps
}: FormSidebarProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const theme = useTheme();
  // Resolved token, not "var(--color11)": CSS var strings reach react-native-svg
  // unparsed on native and the icon renders invisible.
  const placeholderIconColor = theme.color11?.val ?? 'currentColor';
  const iconSize = Number(knobProps.controlIcon?.width) || 16;

  // Broken-image fallback: remember which URL failed so a replacement URL
  // gets a fresh attempt (no effect needed).
  const [erroredUrl, setErroredUrl] = React.useState<string | undefined>();
  const imageBroken = Boolean(imageUrl) && erroredUrl === imageUrl;

  // Scale typography, avatars, icons and the image block with the size knob
  const sz = knobProps.sizeToken;
  const avatarSize = sz === '$3' ? '$1' : sz === '$5' ? '$3' : '$2';
  const imageSize = sz === '$3' ? 160 : sz === '$5' ? 240 : 200;

  const resolvedImageLabel = imageLabel ?? t('Document image');
  const showImageBlock = Boolean(imageUrl) || Boolean(onImageAdd);

  return (
    <YStack
      // Radius-only fragment: the full borderRadius fragment carries
      // borderWidth and drew an unintended box border around the whole rail
      // (rtl-audit U6); the panel border is the logical end rail below.
      {...knobProps.containerRadius}
      {...knobProps.panelPadding}
      {...knobProps.gapLg}
      width={280}
      // Logical end edge so the rail mirrors in RTL; tamagui borderEndWidth
      // does not compile to working CSS on web (SB-M-1215)
      {...(isWeb
        ? {
            borderInlineEndWidth: 1,
            borderInlineEndStyle: 'solid' as any,
            borderInlineEndColor: '$borderColor',
          }
        : { borderEndWidth: 1, borderEndColor: '$borderColor' })}
      {...stackProps}>
      {/* -- Image section -- */}
      {showImageBlock && (
        <>
          <YStack
            alignItems="center"
            gap="$2">
            {imageUrl && !imageBroken ? (
              <Image
                {...knobProps.containerRadius}
                // src (string), not source: the RN source object leaks onto
                // the DOM <img> as source="[object Object]" on web
                src={imageUrl}
                alt={resolvedImageLabel}
                width={imageSize}
                height={imageSize}
                objectFit="contain"
                onError={() => {
                  setErroredUrl(imageUrl);
                }}
              />
            ) : imageUrl && imageBroken ? (
              <YStack
                {...knobProps.containerRadius}
                width={imageSize}
                height={imageSize}
                alignItems="center"
                justifyContent="center"
                gap="$2"
                borderWidth={1}
                borderStyle="dashed"
                borderColor="$borderColor"
                aria-label={resolvedImageLabel}>
                <ImageSquareIcon
                  size={iconSize * 2}
                  color={placeholderIconColor}
                />
                <Text
                  color={knobProps.textAccentColor}
                  {...knobProps.label}>
                  {t('Image failed to load')}
                </Text>
              </YStack>
            ) : (
              <YStack
                role="button"
                tabIndex={0}
                onPress={onImageAdd}
                aria-label={t('Add image')}
                width={imageSize}
                height={imageSize}
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                gap="$2"
                {...knobProps.containerRadius}
                borderWidth={1}
                borderStyle="dashed"
                borderColor="$borderColor">
                <ImageSquareIcon
                  size={iconSize * 2}
                  color={placeholderIconColor}
                />
                <Text
                  color={knobProps.textAccentColor}
                  {...knobProps.label}>
                  {t('Add image')}
                </Text>
              </YStack>
            )}

            {imageUrl && (onImageAdd || onImageRemove) && (
              <XStack gap="$2">
                {onImageAdd && (
                  <Button
                    size="$2"
                    chromeless
                    icon={UploadIcon}
                    aria-label={t('Replace image')}
                    onPress={onImageAdd}>
                    {t('Replace')}
                  </Button>
                )}
                {onImageRemove && (
                  <Button
                    size="$2"
                    chromeless
                    icon={XIcon}
                    aria-label={t('Remove image')}
                    onPress={onImageRemove}>
                    {t('Remove')}
                  </Button>
                )}
              </XStack>
            )}
          </YStack>
          <Separator />
        </>
      )}

      {/* -- Dynamic sections -- */}
      {sections.map((section, sectionIdx) => (
        <React.Fragment key={section.key}>
          <YStack {...knobProps.gap}>
            <XStack
              alignItems="center"
              justifyContent="space-between">
              <XStack
                alignItems="center"
                gap="$2">
                {section.icon}
                <Text
                  color={knobProps.textAccentColor}
                  {...knobProps.label}
                  fontWeight="400">
                  {section.title}
                </Text>
              </XStack>
              {section.onAdd && (
                <Button
                  size="$2"
                  circular
                  chromeless
                  icon={PlusIcon}
                  aria-label={t('Add {{section}}', {
                    section: section.title,
                  })}
                  onPress={section.onAdd}
                />
              )}
            </XStack>

            {section.render ? (
              section.render()
            ) : section.items && section.items.length > 0 ? (
              <YStack {...knobProps.gap}>
                {section.items.map((item) => (
                  <XStack
                    key={item.id}
                    gap="$2"
                    alignItems="center">
                    <Avatar
                      circular
                      size={avatarSize}
                      backgroundColor={avatarColor(sectionIdx)}>
                      <Avatar.Fallback backgroundColor={avatarColor(sectionIdx)}>
                        <Text
                          color={textColor(sectionIdx)}
                          {...knobProps.label}
                          fontWeight="700">
                          {getInitials(item.label)}
                        </Text>
                      </Avatar.Fallback>
                    </Avatar>
                    <YStack flex={1}>
                      <Text
                        color={componentColors.text.primary}
                        numberOfLines={1}
                        {...knobProps.label}>
                        {item.label}
                      </Text>
                      {item.sublabel && (
                        <Text
                          color={knobProps.textAccentColor}
                          {...knobProps.label}>
                          {item.sublabel}
                        </Text>
                      )}
                    </YStack>
                    {section.onRemoveItem && (
                      <Button
                        size="$2"
                        circular
                        chromeless
                        icon={XIcon}
                        aria-label={t('Remove {{name}}', { name: item.label })}
                        onPress={() => section.onRemoveItem?.(item)}
                      />
                    )}
                  </XStack>
                ))}
              </YStack>
            ) : (
              <Text
                color={knobProps.textAccentColor}
                {...knobProps.label}>
                {section.emptyText ?? t('None')}
              </Text>
            )}
          </YStack>

          {sectionIdx < sections.length - 1 && <Separator />}
        </React.Fragment>
      ))}

      {/* -- Separator before metadata -- */}
      {metadata.length > 0 && sections.length > 0 && <Separator />}

      {/* -- Info / Metadata -- */}
      {metadata.length > 0 && (
        <YStack gap="$1">
          <Text
            color={knobProps.textAccentColor}
            paddingHorizontal="$2"
            {...knobProps.label}
            fontWeight="400">
            {t('Info')}
          </Text>
          {metadata.map((entry) => (
            <ListItem
              key={entry.label}
              size={knobProps.sizeToken}
              icon={
                (entry.icon ?? (
                  <UserIcon
                    size={iconSize}
                    color={placeholderIconColor}
                    style={{ flexShrink: 0 }}
                  />
                )) as any
              }
              title={
                <Text
                  color={knobProps.textAccentColor}
                  {...knobProps.label}>
                  {entry.label}
                </Text>
              }
              backgroundColor="transparent"
              paddingVertical="$1"
            />
          ))}
        </YStack>
      )}
    </YStack>
  );
}
