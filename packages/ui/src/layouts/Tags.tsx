import { PlusIcon, TagIcon } from '@phosphor-icons/react';
import {
  ensureCompositeFocusRing,
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  menuRowFrame,
  pressTargetStyle,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Input,
  Label,
  Popover,
  Text,
  View,
  XStack,
  YStack,
  isWeb,
  styled,
  type InputProps,
  type YStackProps,
} from 'tamagui';

import {
  Chip,
  ChipFrame,
  ChipText,
  chipIconSize,
  chipTextSize,
  type ChipColor,
  type ChipSize,
  type ChipVariant,
} from '../Chip';
import { componentColors } from '../componentColors';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';
import { withInterp } from '../shared/t';

const AddTagTarget = styled(View, { name: 'AddTagTarget' });

// ---------------------------------------------------------------------------
// Types  (generic -- no Frappe dependency)
// ---------------------------------------------------------------------------

/**
 * Generic tag item.
 * Replaces FrappeTag / FrappeTagLink with a framework-agnostic type.
 */
export interface TagItem {
  /** Unique identifier for the tag */
  id: string;
  /** Display label / name */
  label: string;
}

/**
 * Chip visual variant (canonical Chip vocabulary).
 * Legacy aliases accepted for back-compat: "filled" → solid, "outlined" → outline, "ghost" → subtle.
 */
export type TagVariant = ChipVariant | 'filled' | 'outlined' | 'ghost';

export interface TagsProps extends Omit<YStackProps, 'children' | 'theme'> {
  /** Tags to display */
  tags: TagItem[];

  /** Optional list of all available tags (for autocomplete suggestions) */
  suggestions?: TagItem[];

  /** Section label */
  label?: string;
  /** Whether interactions are disabled */
  disabled?: boolean;
  /** Maximum number of tags allowed (0 = unlimited) */
  maxTags?: number;

  /** Called when a tag is clicked */
  onTagClick?: (tag: TagItem) => void;
  /** Called when the user adds a tag (by name string) */
  onAdd?: (tagName: string) => void;
  /** Called when the user removes a tag */
  onRemove?: (tag: TagItem) => void;

  /** Custom empty state renderer */
  renderEmpty?: () => React.ReactNode;
  /** Custom tag renderer */
  renderTag?: (tag: TagItem, defaultContent: React.ReactNode, actions: { onRemove: () => void }) => React.ReactNode;

  /** Allow adding new tags */
  enableAdd?: boolean;
  /** Allow removing tags */
  enableRemove?: boolean;
  /** Compact mode - smaller UI */
  compact?: boolean;

  /** Chip visual variant: "subtle" (default), "solid", or "outline" */
  variant?: TagVariant;
  /** Chip color (e.g. "blue", "red"). Uses "gray" when omitted or unrecognized. */
  theme?: string;

  /** Labels for i18n -- consumers pass pre-translated strings */
  labels?: {
    addTag?: string;
    noTags?: string;
    clickToAdd?: string;
    suggestions?: string;
    noAvailableTags?: string;
    createTag?: (value: string) => string;
    tagAlreadyApplied?: (name: string) => string;
  };
  /** Placeholder text for new tag input */
  placeholder?: string;
}

type ListOption =
  | { kind: 'create'; key: 'create'; label: string }
  | { kind: 'suggestion'; key: string; label: string; tag: TagItem };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Generic Tags component for displaying and managing tags.
 * Fully data-agnostic -- accepts tags via props and emits callbacks.
 *
 * Polariss Combobox + GitHub TokenInput anatomy: chips live inside one
 * input-surface field (rings that field on text focus). Suggestions
 * are a CONTAINER-CLIP listbox: flat rows, overlay clips corners,
 * keyboard-active row is fill + inset ring (never a border on every sibling).
 */
export function Tags({
  tags,
  suggestions = [],
  label,
  disabled = false,
  maxTags = 0,
  onTagClick,
  onAdd,
  onRemove,
  renderEmpty,
  renderTag,
  enableAdd = true,
  enableRemove = true,
  compact,
  variant = 'subtle',
  theme: chipTheme,
  labels = {},
  placeholder: placeholderProp,
  ...stackProps
}: TagsProps) {
  const { t } = useTranslation();
  const placeholder = placeholderProp ?? t('Add tag...');
  const { knobProps, disabledState } = useResolvedKnobs();
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  if (isWeb) {
    ensureCompositeFocusRing();
    ensureKeyboardModalityTracking();
  }

  const chipSize = (
    compact ? (knobProps.sizeToken === '$5' ? '$4' : knobProps.sizeToken === '$4' ? '$3' : '$2') : knobProps.sizeToken
  ) as ChipSize;

  const [inputValue, setInputValue] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [addKbFocus, setAddKbFocus] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [kbNav, setKbNav] = useState(false);

  const {
    addTag: addTagLabel = t('Add Tag'),
    noTags: noTagsLabel = t('No tags'),
    suggestions: suggestionsLabel = t('Suggestions'),
    noAvailableTags: noAvailableTagsLabel = t('No available tags'),
    createTag: createTagLabel = (value: string) => withInterp(t('Create "{{value}}"'), { value }),
  } = labels;

  const appliedTagNames = useMemo(() => new Set(tags.map((tag) => tag.label.toLowerCase())), [tags]);

  const availableSuggestions = useMemo(() => {
    const searchTerm = inputValue.toLowerCase().trim();
    return suggestions
      .filter((tag) => {
        const tagName = tag.label.toLowerCase();
        if (appliedTagNames.has(tagName)) {
          return false;
        }
        if (searchTerm && !tagName.includes(searchTerm)) {
          return false;
        }
        return true;
      })
      .slice(0, 10);
  }, [suggestions, appliedTagNames, inputValue]);

  const canAdd = useMemo(() => {
    if (disabled || !enableAdd || !onAdd) {
      return false;
    }
    if (maxTags > 0 && tags.length >= maxTags) {
      return false;
    }
    return true;
  }, [disabled, enableAdd, onAdd, maxTags, tags.length]);

  const trimmedInput = inputValue.trim();
  const canCreate = canAdd && trimmedInput.length > 0 && !appliedTagNames.has(trimmedInput.toLowerCase());

  const listOptions = useMemo<ListOption[]>(() => {
    const rows: ListOption[] = [];
    if (canCreate) {
      rows.push({ kind: 'create', key: 'create', label: createTagLabel(trimmedInput) });
    }
    for (const tag of availableSuggestions) {
      rows.push({ kind: 'suggestion', key: tag.id, label: tag.label, tag });
    }
    return rows;
  }, [canCreate, createTagLabel, trimmedInput, availableSuggestions]);

  const handleAddTag = useCallback(
    (tagName: string) => {
      const trimmedName = tagName.trim();
      if (!trimmedName || !canAdd) {
        return;
      }
      if (appliedTagNames.has(trimmedName.toLowerCase())) {
        return;
      }

      setInputValue('');
      setActiveIndex(-1);
      onAdd?.(trimmedName);
    },
    [canAdd, appliedTagNames, onAdd],
  );

  const handleSelectOption = useCallback(
    (option: ListOption) => {
      if (option.kind === 'create') {
        handleAddTag(trimmedInput);
        return;
      }
      handleAddTag(option.label);
    },
    [handleAddTag, trimmedInput],
  );

  const handleInputChange = useCallback((text: string) => {
    setInputValue(text);
    setIsPopoverOpen(true);
    setKbNav(false);
    setActiveIndex(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent?.isComposing) {
        return;
      }
      const count = listOptions.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsPopoverOpen(true);
        setKbNav(true);
        setActiveIndex((i) => {
          if (count === 0) {
            return -1;
          }
          if (i < 0) {
            return 0;
          }
          return Math.min(i + 1, count - 1);
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setKbNav(true);
        setActiveIndex((i) => {
          if (count === 0) {
            return -1;
          }
          if (i < 0) {
            return count - 1;
          }
          return Math.max(i - 1, 0);
        });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const option = activeIndex >= 0 ? listOptions[activeIndex] : undefined;
        if (option) {
          handleSelectOption(option);
        } else if (trimmedInput) {
          handleAddTag(trimmedInput);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsPopoverOpen(false);
        setInputValue('');
        setActiveIndex(-1);
        return;
      }
      if (e.key === 'Backspace' && !inputValue && enableRemove && onRemove && tags.length > 0) {
        e.preventDefault();
        onRemove(tags[tags.length - 1]);
        return;
      }
      if (e.key === ',' && trimmedInput) {
        e.preventDefault();
        handleAddTag(trimmedInput);
      }
    },
    [
      listOptions,
      activeIndex,
      handleSelectOption,
      handleAddTag,
      trimmedInput,
      inputValue,
      enableRemove,
      onRemove,
      tags,
    ],
  );

  useEffect(() => {
    if (isPopoverOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isPopoverOpen]);

  useEffect(() => {
    if (activeIndex >= listOptions.length) {
      setActiveIndex(listOptions.length === 0 ? -1 : 0);
    }
  }, [activeIndex, listOptions.length]);

  const emptyState = renderEmpty ? (
    renderEmpty()
  ) : (
    <XStack alignItems="center" gap="$2" opacity={0.5}>
      <TagIcon size={compact ? 14 : 16} />
      <Text color={knobProps.textAccentColor} fontSize={compact ? '$1' : '$2'} {...knobProps.body}>
        {noTagsLabel}
      </Text>
    </XStack>
  );

  const chipVariant: ChipVariant =
    variant === 'filled' ? 'solid' : variant === 'outlined' ? 'outline' : variant === 'ghost' ? 'subtle' : variant;

  const chipColor: ChipColor = (['gray', 'red', 'green', 'blue', 'yellow', 'orange', 'purple'] as const).includes(
    chipTheme as ChipColor,
  )
    ? (chipTheme as ChipColor)
    : 'gray';

  const renderTagItem = (tag: TagItem) => {
    const actions = {
      onRemove: () => onRemove?.(tag),
    };

    const chip = (
      <Chip
        size={chipSize}
        variant={chipVariant}
        color={chipColor}
        disabled={disabled}
        onDismiss={enableRemove && !disabled && onRemove ? actions.onRemove : undefined}>
        {tag.label}
      </Chip>
    );

    const defaultContent = onTagClick ? (
      <XStack
        key={tag.id}
        cursor="pointer"
        data-tag-chip=""
        onPress={(e) => {
          e.stopPropagation?.();
          onTagClick(tag);
        }}
        role="button"
        aria-label={tag.label}
        hoverStyle={{ opacity: 0.85 }}
        pressStyle={{ opacity: 0.7 }}>
        {chip}
      </XStack>
    ) : (
      <View data-tag-chip="">{chip}</View>
    );

    if (renderTag) {
      return renderTag(tag, defaultContent, actions);
    }

    return defaultContent;
  };

  const activeOptionId =
    isPopoverOpen && activeIndex >= 0 && listOptions[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined;

  const showEmptyMessage = isPopoverOpen && trimmedInput === '' && availableSuggestions.length === 0 && !canCreate;

  const renderListboxOrdered = () => {
    const createOption = listOptions.find((o) => o.kind === 'create');
    const suggestionOptions = listOptions.filter(
      (o): o is Extract<ListOption, { kind: 'suggestion' }> => o.kind === 'suggestion',
    );
    const renderRow = (option: ListOption, index: number) => {
      const isActive = index === activeIndex;
      const rowRing = isActive && kbNav ? ensureFocusVisibleRing({ outlineOffset: -2 }) : { outlineWidth: 0 as const };
      const fill = isActive ? componentColors.interactive.hover : 'transparent';
      return (
        <XStack
          key={option.key}
          {...menuRowFrame}
          // `menuRowFrame` deliberately leaves vertical sizing to the
          // consumer; without it the rows collapse to text height while the
          // "Suggestions" caption above them keeps its own padding, so the
          // list reads as unevenly spaced.
          minHeight={knobProps.sizeToken}
          paddingVertical="$1.5"
          gap="$2"
          id={`${listboxId}-opt-${index}`}
          role={option.kind === 'create' ? 'button' : 'option'}
          aria-label={option.kind === 'create' ? option.label : undefined}
          aria-selected={option.kind === 'suggestion' ? isActive : undefined}
          data-active={isActive || undefined}
          backgroundColor={fill}
          hoverStyle={{
            backgroundColor: componentColors.interactive.hover,
            borderRadius: 0,
          }}
          pressStyle={{
            backgroundColor: componentColors.interactive.active,
            borderRadius: 0,
          }}
          cursor="pointer"
          {...rowRing}
          onMouseEnter={() => {
            setKbNav(false);
            setActiveIndex(index);
          }}
          onPress={() => {
            handleSelectOption(option);
          }}>
          {option.kind === 'create' ? <PlusIcon size={16} /> : null}
          <Text {...knobProps.body} color={componentColors.text.primary}>
            {option.label}
          </Text>
        </XStack>
      );
    };

    return (
      <YStack
        // "listbox" is a valid ARIA role but outside RN's `Role` union;
        // forwarded to the DOM node on web (house Record cast).
        {...({ role: 'listbox' } as Record<string, unknown>)}
        width="100%"
        id={listboxId}
        aria-label={suggestionsLabel}
        onMouseDown={(e) => {
          e.preventDefault();
        }}>
        {createOption ? renderRow(createOption, 0) : null}
        {suggestionOptions.length > 0 && (
          <Text fontSize="$1" color={knobProps.textAccentColor} paddingHorizontal="$3" paddingVertical="$1.5">
            {suggestionsLabel}
          </Text>
        )}
        {suggestionOptions.map((option, i) => renderRow(option, (createOption ? 1 : 0) + i))}
        {showEmptyMessage && (
          <Text fontSize="$2" color={knobProps.textAccentColor} textAlign="center" padding="$3" {...knobProps.body}>
            {noAvailableTagsLabel}
          </Text>
        )}
      </YStack>
    );
  };

  const openAdd = useCallback(() => {
    if (!canAdd) {
      return;
    }
    setIsPopoverOpen(true);
  }, [canAdd]);

  const fieldPadH = compact ? ('$2' as const) : ('$2.5' as const);
  const fieldPadV = compact ? ('$1.5' as const) : ('$2' as const);

  const field = (
    <XStack
      data-testid="tags-field"
      flexWrap="wrap"
      alignItems="center"
      gap="$1.5"
      width="100%"
      minHeight={knobProps.sizeToken}
      paddingHorizontal={fieldPadH}
      paddingVertical={fieldPadV}
      backgroundColor={componentColors.surface.background}
      {...knobProps.inputSurface}
      {...knobProps.borderRadius}
      overflow="hidden"
      cursor={canAdd ? 'text' : 'default'}
      {...(isWeb ? { className: 'mp-composite-ring' } : {})}
      outlineWidth={0}
      hoverStyle={canAdd ? { borderColor: componentColors.interactive.border } : undefined}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={{ outlineWidth: 0 }}
      {...(disabled
        ? {
            'aria-disabled': true,
            ...disabledState.surfaceKnobProps,
            ...disabledState.assemblyKnobProps,
          }
        : undefined)}
      onPress={() => {
        if (!canAdd) {
          return;
        }
        openAdd();
        inputRef.current?.focus();
      }}>
      {tags.length === 0 && !enableAdd
        ? emptyState
        : tags.map((tag) => <React.Fragment key={tag.id}>{renderTagItem(tag)}</React.Fragment>)}

      {canAdd && (
        <Popover.Trigger asChild>
          <AddTagTarget
            role="button"
            aria-label={addTagLabel}
            tabIndex={0}
            cursor="pointer"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
            {...pressTargetStyle()}
            minWidth={undefined}
            paddingHorizontal={3}
            marginHorizontal={-3}
            outlineWidth={0}
            focusStyle={{ outlineWidth: 0 }}
            focusVisibleStyle={{ outlineWidth: 0 }}
            onPress={(e) => {
              e.stopPropagation?.();
              openAdd();
            }}
            onFocus={() => {
              if (wasKeyboardFocus()) {
                setAddKbFocus(true);
              }
            }}
            onBlur={() => {
              setAddKbFocus(false);
            }}
            onKeyDown={
              ((e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openAdd();
                }
              }) as unknown as () => void
            }>
            <ChipFrame
              size={chipSize}
              variant="outline"
              backgroundColor="transparent"
              {...knobProps.borderRadius}
              borderColor={componentColors.interactive.border}
              gap={compact ? 0 : '$1'}
              hoverStyle={{ backgroundColor: componentColors.interactive.hover }}
              pressStyle={{ backgroundColor: componentColors.interactive.active }}
              {...(addKbFocus ? ensureFocusVisibleRing() : { outlineWidth: 0 })}>
              <PlusIcon size={chipIconSize(chipSize)} />
              <ChipText size={chipSize} color={knobProps.textAccentColor}>
                {compact ? '\u200B' : addTagLabel}
              </ChipText>
            </ChipFrame>
          </AddTagTarget>
        </Popover.Trigger>
      )}

      {canAdd && (
        <Input
          ref={inputRef as any}
          value={inputValue}
          onChangeText={handleInputChange}
          onKeyDown={handleKeyDown as unknown as () => void}
          onFocus={() => {
            setIsPopoverOpen(true);
          }}
          placeholder={placeholder}
          flexGrow={1}
          flexShrink={1}
          flexBasis={96}
          minWidth={96}
          height="auto"
          padding={0}
          margin={0}
          borderWidth={0}
          backgroundColor="transparent"
          outlineWidth={0}
          focusStyle={{ outlineWidth: 0, borderWidth: 0 }}
          focusVisibleStyle={{ outlineWidth: 0 }}
          {...knobProps.body}
          // Chip-scale type: the input shares its row with the tag chips, so
          // it rides the same recipe font channel their labels do -- with
          // the body size it set the text a step larger and the placeholder
          // sat off the chips' optical line.
          fontSize={chipTextSize(chipSize)}
          color={componentColors.text.primary}
          placeholderTextColor={knobProps.textAccentColor as InputProps['placeholderTextColor']}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isPopoverOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
        />
      )}
    </XStack>
  );

  return (
    <YStack {...knobProps.gap} {...stackProps}>
      {label && (
        <XStack alignItems="center" justifyContent="space-between">
          <Label {...knobProps.label} fontWeight="400">
            {label}
            {maxTags > 0 && (
              <Text color={knobProps.textAccentColor} fontSize="$2">
                {' '}
                ({tags.length}/{maxTags})
              </Text>
            )}
          </Label>
        </XStack>
      )}

      <YStack width="100%">
        {canAdd ? (
          <Popover
            open={isPopoverOpen}
            onOpenChange={setIsPopoverOpen}
            placement="bottom-start"
            offset={4}
            stayInFrame
            allowFlip>
            {field}
            <Popover.Content
              {...knobProps.elevatedSurface}
              padding={0}
              overflow="hidden"
              minWidth={220}
              transition={knobProps.transition}
              enterStyle={{ y: -4, opacity: 0 }}
              exitStyle={{ y: -4, opacity: 0 }}>
              {/*
                The scroller has to be told to fill the overlay. Its content
                container shrink-wraps by default, and every row inside takes
                its width from `menuRowFrame`'s `width: "100%"` -- so without
                this the highlight on the active row stops short of the panel
                edge on both sides instead of spanning it (SP-EDGE).
              */}
              <ScrollView width="100%" maxHeight={240} contentContainerStyle={{ minWidth: '100%' }}>
                {renderListboxOrdered()}
              </ScrollView>
            </Popover.Content>
          </Popover>
        ) : (
          field
        )}
      </YStack>
    </YStack>
  );
}
