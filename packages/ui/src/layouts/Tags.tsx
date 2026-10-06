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
import type React from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Input, Label, Popover, Text, View, XStack, YStack, isWeb, styled } from 'tamagui';
import type { InputProps, YStackProps } from 'tamagui';

import { Chip, ChipFrame, ChipText, chipIconSize, chipTextSize } from '../Chip';
import type { ChipColor, ChipSize, ChipVariant } from '../Chip';
import { componentColors } from '../component-colors';
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

type ResolvedKnobProps = ReturnType<typeof useResolvedKnobs>['knobProps'];

type TranslateFn = ReturnType<typeof useTranslation>['t'];

const NO_SUGGESTIONS: TagItem[] = [];
const NO_LABELS: NonNullable<TagsProps['labels']> = {};
const MAX_SUGGESTIONS = 10;
const CHIP_COLORS = ['gray', 'red', 'green', 'blue', 'yellow', 'orange', 'purple'] as const satisfies ChipColor[];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const resolveChipSize = (sizeToken: string, compact = false): ChipSize => {
  if (compact) {
    if (sizeToken === '$5') {
      return '$4';
    }
    return sizeToken === '$4' ? '$3' : '$2';
  }
  // sizeToken comes from sizeTokenMap in resolve-knobs: $3 | $4 | $5.
  if (sizeToken === '$3' || sizeToken === '$5') {
    return sizeToken;
  }
  return '$4';
};

const resolveChipVariant = (variant: TagVariant): ChipVariant => {
  if (variant === 'filled') {
    return 'solid';
  }
  if (variant === 'outlined') {
    return 'outline';
  }
  if (variant === 'ghost') {
    return 'subtle';
  }
  return variant;
};

const fieldPadding = (compact = false) =>
  compact ? ({ horizontal: '$2', vertical: '$1.5' } as const) : ({ horizontal: '$2.5', vertical: '$2' } as const);

// "listbox" is a valid ARIA role but outside RN's `Role` union; forwarded to
// the DOM node on web. The index signature keeps it out of prop type-checking.
interface ListboxRoleProps {
  [prop: string]: 'listbox';
}

const LISTBOX_ROLE_PROPS: ListboxRoleProps = { role: 'listbox' };

const resolveChipColor = (chipTheme: string | undefined): ChipColor =>
  CHIP_COLORS.find((color) => color === chipTheme) ?? 'gray';

const resolveTagLabels = (labels: NonNullable<TagsProps['labels']>, t: TranslateFn) => ({
  addTagLabel: labels.addTag ?? t('Add Tag'),
  noTagsLabel: labels.noTags ?? t('No tags'),
  suggestionsLabel: labels.suggestions ?? t('Suggestions'),
  noAvailableTagsLabel: labels.noAvailableTags ?? t('No available tags'),
  createTagLabel: labels.createTag ?? ((value: string) => withInterp(t('Create "{{value}}"'), { value })),
});

const stepActiveIndex = (current: number, count: number, direction: 'down' | 'up'): number => {
  if (count === 0) {
    return -1;
  }
  if (direction === 'down') {
    return current < 0 ? 0 : Math.min(current + 1, count - 1);
  }
  return current < 0 ? count - 1 : Math.max(current - 1, 0);
};

interface CanAddArgs {
  disabled: boolean;
  enableAdd: boolean;
  hasOnAdd: boolean;
  maxTags: number;
  tagCount: number;
}

const computeCanAdd = ({ disabled, enableAdd, hasOnAdd, maxTags, tagCount }: CanAddArgs): boolean => {
  if (disabled || !enableAdd || !hasOnAdd) {
    return false;
  }
  if (maxTags > 0 && tagCount >= maxTags) {
    return false;
  }
  return true;
};

const filterSuggestions = (suggestions: TagItem[], appliedTagNames: Set<string>, inputValue: string): TagItem[] => {
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
    .slice(0, MAX_SUGGESTIONS);
};

// ---------------------------------------------------------------------------
// Input state (suggestions, keyboard navigation, add/remove)
// ---------------------------------------------------------------------------

interface TagInputArgs {
  tags: TagItem[];
  suggestions: TagItem[];
  disabled: boolean;
  enableAdd: boolean;
  enableRemove: boolean;
  maxTags: number;
  onAdd?: (tagName: string) => void;
  onRemove?: (tag: TagItem) => void;
  createTagLabel: (value: string) => string;
}

const useTagInput = ({
  tags,
  suggestions,
  disabled,
  enableAdd,
  enableRemove,
  maxTags,
  onAdd,
  onRemove,
  createTagLabel,
}: TagInputArgs) => {
  const inputRef = useRef<React.ComponentRef<typeof Input>>(null);
  const [inputValue, setInputValue] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [kbNav, setKbNav] = useState(false);

  const appliedTagNames = useMemo(() => new Set(tags.map((tag) => tag.label.toLowerCase())), [tags]);
  const availableSuggestions = useMemo(
    () => filterSuggestions(suggestions, appliedTagNames, inputValue),
    [suggestions, appliedTagNames, inputValue],
  );

  const canAdd = computeCanAdd({ disabled, enableAdd, hasOnAdd: onAdd != null, maxTags, tagCount: tags.length });
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

  const submitEnter = () => {
    const option = activeIndex >= 0 ? listOptions[activeIndex] : undefined;
    if (option) {
      handleSelectOption(option);
    } else if (trimmedInput) {
      handleAddTag(trimmedInput);
    }
  };

  const lastTag = tags.at(-1);
  const canBackspaceRemove = enableRemove && onRemove != null && lastTag !== undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent?.isComposing) {
      return;
    }
    const count = listOptions.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsPopoverOpen(true);
      setKbNav(true);
      setActiveIndex((i) => stepActiveIndex(i, count, 'down'));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setKbNav(true);
      setActiveIndex((i) => stepActiveIndex(i, count, 'up'));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submitEnter();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsPopoverOpen(false);
      setInputValue('');
      setActiveIndex(-1);
      return;
    }
    if (e.key === 'Backspace' && !inputValue && canBackspaceRemove) {
      e.preventDefault();
      onRemove(lastTag);
      return;
    }
    if (e.key === ',' && trimmedInput) {
      e.preventDefault();
      handleAddTag(trimmedInput);
    }
  };

  useEffect(() => {
    if (isPopoverOpen) {
      inputRef.current?.focus();
    }
  }, [isPopoverOpen]);

  // Keep the active row inside the (possibly shrunken) option list.
  if (activeIndex >= listOptions.length) {
    setActiveIndex(listOptions.length === 0 ? -1 : 0);
  }

  const openAdd = () => {
    if (canAdd) {
      setIsPopoverOpen(true);
    }
  };

  const showEmptyMessage = isPopoverOpen && trimmedInput === '' && availableSuggestions.length === 0 && !canCreate;
  const hasActiveOption = isPopoverOpen && activeIndex >= 0 && listOptions[activeIndex] != null;

  return {
    inputRef,
    inputValue,
    isPopoverOpen,
    setIsPopoverOpen,
    activeIndex,
    setActiveIndex,
    kbNav,
    setKbNav,
    canAdd,
    listOptions,
    handleSelectOption,
    handleInputChange,
    handleKeyDown,
    openAdd,
    showEmptyMessage,
    hasActiveOption,
  };
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TagsEmptyStateProps {
  compact?: boolean;
  label: string;
  knobProps: ResolvedKnobProps;
}

const TagsEmptyState = ({ compact, label, knobProps }: TagsEmptyStateProps) => (
  <XStack
    alignItems="center"
    gap="$2"
    opacity={0.5}>
    <TagIcon size={compact ? 14 : 16} />
    <Text
      color={knobProps.textAccentColor}
      fontSize={compact ? '$1' : '$2'}
      {...knobProps.body}>
      {label}
    </Text>
  </XStack>
);

interface TagsLabelProps {
  label: string;
  knobProps: ResolvedKnobProps;
  maxTags: number;
  tagCount: number;
}

const TagsLabel = ({ label, knobProps, maxTags, tagCount }: TagsLabelProps) => (
  <XStack
    alignItems="center"
    justifyContent="space-between">
    <Label
      {...knobProps.label}
      fontWeight="400">
      {label}
      {maxTags > 0 && (
        <Text
          color={knobProps.textAccentColor}
          fontSize="$2">
          {' '}
          ({tagCount}/{maxTags})
        </Text>
      )}
    </Label>
  </XStack>
);

interface TagChipItemProps {
  tag: TagItem;
  chipSize: ChipSize;
  chipVariant: ChipVariant;
  chipColor: ChipColor;
  disabled: boolean;
  enableRemove: boolean;
  onTagClick?: (tag: TagItem) => void;
  onRemove?: (tag: TagItem) => void;
  renderTag?: TagsProps['renderTag'];
}

// oxlint-disable-next-line typescript/promise-function-async -- returns the consumer's renderTag ReactNode, whose React 19 type includes Promise; the component cannot be async
const TagChipItem = ({
  tag,
  chipSize,
  chipVariant,
  chipColor,
  disabled,
  enableRemove,
  onTagClick,
  onRemove,
  renderTag,
}: TagChipItemProps) => {
  const actions = {
    onRemove: () => {
      onRemove?.(tag);
    },
  };

  const chip = (
    <Chip
      size={chipSize}
      variant={chipVariant}
      color={chipColor}
      disabled={disabled}
      onDismiss={enableRemove && !disabled && onRemove != null ? actions.onRemove : undefined}>
      {tag.label}
    </Chip>
  );

  const defaultContent =
    onTagClick == null ? (
      <View data-tag-chip="">{chip}</View>
    ) : (
      <XStack
        key={tag.id}
        cursor="pointer"
        data-tag-chip=""
        onPress={(e) => {
          e.stopPropagation?.();
          onTagClick(tag);
        }}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui XStack wrapper around a Chip that renders its own dismiss button
        role="button"
        aria-label={tag.label}
        hoverStyle={{ opacity: 0.85 }}
        pressStyle={{ opacity: 0.7 }}>
        {chip}
      </XStack>
    );

  if (renderTag) {
    return renderTag(tag, defaultContent, actions);
  }

  return defaultContent;
};

interface TagListboxRowProps {
  option: ListOption;
  index: number;
  isActive: boolean;
  kbNav: boolean;
  listboxId: string;
  knobProps: ResolvedKnobProps;
  onHover: (index: number) => void;
  onSelect: (option: ListOption) => void;
}

const TagListboxRow = ({
  option,
  index,
  isActive,
  kbNav,
  listboxId,
  knobProps,
  onHover,
  onSelect,
}: TagListboxRowProps) => {
  const rowRing = isActive && kbNav ? ensureFocusVisibleRing({ outlineOffset: -2 }) : { outlineWidth: 0 as const };
  const fill = isActive ? componentColors.interactive.hover : 'transparent';
  const isCreate = option.kind === 'create';
  return (
    <XStack
      {...menuRowFrame}
      // `menuRowFrame` deliberately leaves vertical sizing to the
      // consumer; without it the rows collapse to text height while the
      // "Suggestions" caption above them keeps its own padding, so the
      // list reads as unevenly spaced.
      minHeight={knobProps.sizeToken}
      paddingVertical="$1.5"
      gap="$2"
      id={`${listboxId}-opt-${index}`}
      role={isCreate ? 'button' : 'option'}
      aria-label={isCreate ? option.label : undefined}
      aria-selected={isCreate ? undefined : isActive}
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
        onHover(index);
      }}
      onPress={() => {
        onSelect(option);
      }}>
      {isCreate ? <PlusIcon size={16} /> : null}
      <Text
        {...knobProps.body}
        color={componentColors.text.primary}>
        {option.label}
      </Text>
    </XStack>
  );
};

interface TagListboxProps {
  listOptions: ListOption[];
  activeIndex: number;
  kbNav: boolean;
  listboxId: string;
  knobProps: ResolvedKnobProps;
  suggestionsLabel: string;
  noAvailableTagsLabel: string;
  showEmptyMessage: boolean;
  onHover: (index: number) => void;
  onSelect: (option: ListOption) => void;
}

const TagListbox = ({
  listOptions,
  activeIndex,
  kbNav,
  listboxId,
  knobProps,
  suggestionsLabel,
  noAvailableTagsLabel,
  showEmptyMessage,
  onHover,
  onSelect,
}: TagListboxProps) => {
  const createOption = listOptions.find((o) => o.kind === 'create');
  const suggestionOptions = listOptions.filter(
    (o): o is Extract<ListOption, { kind: 'suggestion' }> => o.kind === 'suggestion',
  );
  const suggestionOffset = createOption === undefined ? 0 : 1;
  const renderRow = (option: ListOption, index: number) => (
    <TagListboxRow
      key={option.key}
      option={option}
      index={index}
      isActive={index === activeIndex}
      kbNav={kbNav}
      listboxId={listboxId}
      knobProps={knobProps}
      onHover={onHover}
      onSelect={onSelect}
    />
  );

  return (
    <YStack
      {...LISTBOX_ROLE_PROPS}
      width="100%"
      id={listboxId}
      aria-label={suggestionsLabel}
      onMouseDown={(e) => {
        e.preventDefault();
      }}>
      {createOption === undefined ? null : renderRow(createOption, 0)}
      {suggestionOptions.length > 0 && (
        <Text
          fontSize="$1"
          color={knobProps.textAccentColor}
          paddingHorizontal="$3"
          paddingVertical="$1.5">
          {suggestionsLabel}
        </Text>
      )}
      {suggestionOptions.map((option, i) => renderRow(option, suggestionOffset + i))}
      {showEmptyMessage && (
        <Text
          fontSize="$2"
          color={knobProps.textAccentColor}
          textAlign="center"
          padding="$3"
          {...knobProps.body}>
          {noAvailableTagsLabel}
        </Text>
      )}
    </YStack>
  );
};

interface AddTagTriggerProps {
  label: string;
  chipSize: ChipSize;
  compact?: boolean;
  knobProps: ResolvedKnobProps;
  onOpen: () => void;
}

const AddTagTrigger = ({ label, chipSize, compact, knobProps, onOpen }: AddTagTriggerProps) => {
  const [addKbFocus, setAddKbFocus] = useState(false);
  return (
    <Popover.Trigger asChild>
      <AddTagTarget
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Popover.Trigger asChild injects handlers/ref into this Tamagui View; a native <button> would change the trigger's box and focus behavior
        role="button"
        aria-label={label}
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
          onOpen();
        }}
        onFocus={() => {
          if (wasKeyboardFocus()) {
            setAddKbFocus(true);
          }
        }}
        onBlur={() => {
          setAddKbFocus(false);
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}>
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
          <ChipText
            size={chipSize}
            color={knobProps.textAccentColor}>
            {compact ? '​' : label}
          </ChipText>
        </ChipFrame>
      </AddTagTarget>
    </Popover.Trigger>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type DefaultedTagsProp = 'suggestions' | 'disabled' | 'maxTags' | 'enableAdd' | 'enableRemove' | 'variant' | 'labels';

type ResolvedTagsProps = Omit<TagsProps, DefaultedTagsProp> & Required<Pick<TagsProps, DefaultedTagsProp>>;

const TagsContent = ({
  tags,
  suggestions,
  label,
  disabled,
  maxTags,
  onTagClick,
  onAdd,
  onRemove,
  renderEmpty,
  renderTag,
  enableAdd,
  enableRemove,
  compact,
  variant,
  theme: chipTheme,
  labels,
  placeholder: placeholderProp,
  ...stackProps
}: ResolvedTagsProps) => {
  const { t } = useTranslation();
  const placeholder = placeholderProp ?? t('Add tag...');
  const { knobProps, disabledState } = useResolvedKnobs();
  const listboxId = useId();
  if (isWeb) {
    ensureCompositeFocusRing();
    ensureKeyboardModalityTracking();
  }

  const chipSize = resolveChipSize(knobProps.sizeToken, compact);
  const { addTagLabel, noTagsLabel, suggestionsLabel, noAvailableTagsLabel, createTagLabel } = resolveTagLabels(
    labels,
    t,
  );
  const {
    inputRef,
    inputValue,
    isPopoverOpen,
    setIsPopoverOpen,
    activeIndex,
    setActiveIndex,
    kbNav,
    setKbNav,
    canAdd,
    listOptions,
    handleSelectOption,
    handleInputChange,
    handleKeyDown,
    openAdd,
    showEmptyMessage,
    hasActiveOption,
  } = useTagInput({ tags, suggestions, disabled, enableAdd, enableRemove, maxTags, onAdd, onRemove, createTagLabel });

  const emptyState = renderEmpty ? (
    renderEmpty()
  ) : (
    <TagsEmptyState
      compact={compact}
      label={noTagsLabel}
      knobProps={knobProps}
    />
  );

  const chipVariant = resolveChipVariant(variant);
  const chipColor = resolveChipColor(chipTheme);
  const activeOptionId = hasActiveOption ? `${listboxId}-opt-${activeIndex}` : undefined;

  const pad = fieldPadding(compact);

  const field = (
    <XStack
      data-testid="tags-field"
      flexWrap="wrap"
      alignItems="center"
      gap="$1.5"
      width="100%"
      minHeight={knobProps.sizeToken}
      paddingHorizontal={pad.horizontal}
      paddingVertical={pad.vertical}
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
        : tags.map((tag) => (
            <TagChipItem
              key={tag.id}
              tag={tag}
              chipSize={chipSize}
              chipVariant={chipVariant}
              chipColor={chipColor}
              disabled={disabled}
              enableRemove={enableRemove}
              onTagClick={onTagClick}
              onRemove={onRemove}
              renderTag={renderTag}
            />
          ))}

      {canAdd && (
        <AddTagTrigger
          label={addTagLabel}
          chipSize={chipSize}
          compact={compact}
          knobProps={knobProps}
          onOpen={openAdd}
        />
      )}

      {canAdd && (
        <Input
          ref={inputRef}
          value={inputValue}
          onChangeText={handleInputChange}
          onKeyDown={handleKeyDown}
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
          // SAFETY: textAccentColor is a Tamagui color token string, which placeholderTextColor accepts.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- textAccentColor is typed `string` but always a theme color token; the prop only accepts the token union
          placeholderTextColor={knobProps.textAccentColor as InputProps['placeholderTextColor']}
          autoComplete="off"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui Input already renders a native <input>; role adds the combobox semantics
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
    <YStack
      {...knobProps.gap}
      {...stackProps}>
      {label !== undefined && label !== '' && (
        <TagsLabel
          label={label}
          knobProps={knobProps}
          maxTags={maxTags}
          tagCount={tags.length}
        />
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
              <ScrollView
                width="100%"
                maxHeight={240}
                contentContainerStyle={{ minWidth: '100%' }}>
                <TagListbox
                  listOptions={listOptions}
                  activeIndex={activeIndex}
                  kbNav={kbNav}
                  listboxId={listboxId}
                  knobProps={knobProps}
                  suggestionsLabel={suggestionsLabel}
                  noAvailableTagsLabel={noAvailableTagsLabel}
                  showEmptyMessage={showEmptyMessage}
                  onHover={(index) => {
                    setKbNav(false);
                    setActiveIndex(index);
                  }}
                  onSelect={handleSelectOption}
                />
              </ScrollView>
            </Popover.Content>
          </Popover>
        ) : (
          field
        )}
      </YStack>
    </YStack>
  );
};

/**
 * Generic Tags component for displaying and managing tags.
 * Fully data-agnostic -- accepts tags via props and emits callbacks.
 *
 * Polariss Combobox + GitHub TokenInput anatomy: chips live inside one
 * input-surface field (rings that field on text focus). Suggestions
 * are a CONTAINER-CLIP listbox: flat rows, overlay clips corners,
 * keyboard-active row is fill + inset ring (never a border on every sibling).
 */
export const Tags = ({
  suggestions = NO_SUGGESTIONS,
  disabled = false,
  maxTags = 0,
  enableAdd = true,
  enableRemove = true,
  variant = 'subtle',
  labels = NO_LABELS,
  ...rest
}: TagsProps) => (
  <TagsContent
    {...rest}
    suggestions={suggestions}
    disabled={disabled}
    maxTags={maxTags}
    enableAdd={enableAdd}
    enableRemove={enableRemove}
    variant={variant}
    labels={labels}
  />
);
