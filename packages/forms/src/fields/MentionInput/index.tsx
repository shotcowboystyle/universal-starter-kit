import { useDismiss, useInteractions } from '@floating-ui/react';
import { useTouchSurface } from '@repo/theme';
import { ensureFocusVisibleRing, keyboardFocusRingProps, menuRowFrame } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useProps, type GetProps, type SizeTokens } from 'tamagui';
import { Avatar, Text, XStack, YStack, isWeb, styled } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { useFloatingPanel, panelTransition } from '../../FloatingPanel';
import { PanelPortal } from '../../FloatingPanel/PanelPortal';
import { formCommonColors, formInputColors } from '../../shared/colorRamps';
import { ScrollArrow } from '../../shared/floatingList';
import { t } from '../../shared/t';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { zIndex } from '../../shared/zIndex';
import { Skeleton } from '../../Skeleton';
import type { Validator } from '../../types';
import type { FieldComponentProps } from '../../types';
import { TextArea } from '../TextArea';

export interface MentionItem {
  id: string;
  display: string;
  avatar?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface MentionConfig {
  trigger: string;
  data: MentionItem[];
  allowSpace?: boolean;
  insertSpace?: boolean;
  menuHeight?: number;
  menuWidth?: number;
}

export interface MentionData {
  type: string;
  id: string;
  display: string;
  position: number;
  length: number;
}

export interface MentionValue {
  text: string;
  mentions: MentionData[];
}

/** Normalize string / object / empty seeds into the field value. */
export function parseMentionValue(raw: unknown): MentionValue {
  if (typeof raw === 'string') {
    return { text: raw, mentions: [] };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as { text?: unknown; mentions?: unknown };
    return {
      text: typeof o.text === 'string' ? o.text : '',
      mentions: Array.isArray(o.mentions) ? (o.mentions as MentionData[]) : [],
    };
  }
  return { text: '', mentions: [] };
}

function mentionValuesEqual(a: MentionValue, b: MentionValue): boolean {
  return a.text === b.text && JSON.stringify(a.mentions) === JSON.stringify(b.mentions);
}

function MentionFieldSync({
  fieldValue,
  current,
  disabled,
  onAdopt,
  children,
}: {
  fieldValue: unknown;
  current: MentionValue;
  disabled: boolean;
  onAdopt: (next: MentionValue) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (disabled || fieldValue === undefined) {
      return;
    }
    const next = parseMentionValue(fieldValue);
    if (mentionValuesEqual(next, current)) {
      return;
    }
    onAdopt(next);
  }, [fieldValue, disabled]);
  return children;
}

export type MentionInputProps<
  TParentData = any,
  TName extends DeepKeys<TParentData> = any,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<
  FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  // "onChange": FormFieldProps carries the DOM ChangeEventHandler from
  // YStackProps; this field exposes a canonical value callback instead.
  'children' | 'field' | 'onChange'
> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    readOnly?: boolean;
    mentions: MentionConfig[];
    placeholder?: string;
    minHeight?: number;
    maxHeight?: number;
    autoResize?: boolean;
    onMentionSelect?: (mention: MentionItem, trigger: string) => void;
    /**
     * Canonical change handler. Fires the field value `{ text, mentions }` on
     * every user edit. String seeds still parse via {@link parseMentionValue}.
     */
    onChange?: (value: MentionValue) => void;
    /** @deprecated Use `onChange` instead. Fires the raw text from the same emit. */
    onTextChange?: (text: string) => void;
    /**
     * Controlled value. String or {@link MentionValue}. A value arriving after
     * mount must display without emitting onChange (create-mode seeding).
     */
    value?: string | MentionValue;
    textAreaProps?: Record<string, any>;
    /** When true, renders a skeleton placeholder instead of the mention input */
    skeleton?: boolean;
    /** When true, applies compact density (tighter layout gaps; control size unchanged) */
    compact?: boolean;
  };

const blurCloseDelayMs = 150;
const zeroWidthSpace = '\u200b';

// One fontSize step below the field size token \u2014 the T-HELPER register for the
// secondary (role/description) line, matching the shared suggestion-row recipe.
const helperFontSizeMap: Record<string, string> = { $3: '$2', $4: '$3', $5: '$4' };

// The row spans the full menu width and owns ALL padding
// (the overlay container owns only its border), so the active/hover highlight
// runs edge-to-edge. One implementation: geometry IS the shared
// `menuRowFrame` recipe from theme (same frame as SelectRow and the
// DropdownMenu item row). Suggestion-list concerns stay local: cursor,
// gap, vertical padding, and the form-input color ramp.
const MentionSuggestionItem = styled(XStack, {
  name: 'MentionSuggestionItem',
  ...menuRowFrame,
  paddingVertical: '$2',
  gap: '$2',
  cursor: 'pointer',
  hoverStyle: { backgroundColor: formInputColors.background.focus },
  // Rows are not tab stops (aria-activedescendant). focusVisibleStyle is the
  // belt if a row ever takes real focus; the keyboard-active row paints
  // keyboardFocusRingProps below (fill and ring stay orthogonal).
  focusVisibleStyle: ensureFocusVisibleRing({ outlineOffset: -2 }),
  variants: {
    selected: {
      true: { backgroundColor: formInputColors.background.focus },
      false: { backgroundColor: 'transparent' },
    },
  } as const,
});

// Fallback if nestedControl is missing. Live rows use nestedControl.px.
const MEDIA_SLOT_FALLBACK = 32;

const SLUG_ID = /^[A-Za-z][\w.-]*$/;

type MentionTextProps = GetProps<typeof Text>;

/** GitHub/Slack: bold the query hit inside the suggestion label. */
function MentionMatchText({ text, query, ...rest }: MentionTextProps & { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) {
    return <Text {...rest}>{text}</Text>;
  }
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) {
    return <Text {...rest}>{text}</Text>;
  }
  return (
    <Text {...rest}>
      {text.slice(0, idx)}
      <Text {...rest} fontWeight="700">
        {text.slice(idx, idx + needle.length)}
      </Text>
      {text.slice(idx + needle.length)}
    </Text>
  );
}

function mentionSecondary(item: MentionItem, trigger: string): string | undefined {
  if (item.description) {
    return item.description;
  }
  if (item.id && item.id !== item.display && SLUG_ID.test(item.id)) {
    return `${trigger}${item.id}`;
  }
  return undefined;
}

function mentionForDelete(
  mentions: MentionData[],
  cursor: number,
  key: 'Backspace' | 'Delete',
): MentionData | undefined {
  if (key === 'Backspace') {
    return mentions.find((m) => cursor > m.position && cursor <= m.position + m.length);
  }
  return mentions.find((m) => cursor >= m.position && cursor < m.position + m.length);
}

export function MentionInput<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: MentionInputProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const hydrationTouch = useTouchSurface();
  const {
    defaultValue,
    form,
    mentions = [],
    placeholder = t('Type @ to mention someone'),
    minHeight: minHeightProp,
    maxHeight: maxHeightProp,
    autoResize = false,
    onMentionSelect,
    onChange,
    onTextChange,
    textAreaProps,
    mode,
    name,
    preserveValue,
    validators,
    disabled,
    readOnly,
    label,
    labelProps,
    error: errorProp,
    helperText,
    required,
    size,
    onBlur,
    skeleton,
    compact,
    id: idProp,
    value: valueProp,
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const resolvedSizeToken = (size || knobProps.sizeToken) as SizeTokens;
  const minHeight = minHeightProp ?? getFieldHeight(resolvedSizeToken, 3, hydrationTouch);
  const maxHeight = maxHeightProp ?? getFieldHeight(resolvedSizeToken, 8, hydrationTouch);
  const minRows = Math.max(1, Math.round(minHeight / 20));
  const maxRows = Math.max(minRows, Math.round(maxHeight / 20));

  const initialValue = parseMentionValue(valueProp !== undefined ? valueProp : defaultValue);
  const [text, setText] = useState(initialValue.text);
  const [mentionList, setMentionList] = useState<MentionData[]>(initialValue.mentions);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentTrigger, setCurrentTrigger] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  // Suggestion rows are not focused (activedescendant). Paint the
  // inset ring only while the active row was chosen by keyboard/typing.
  const [keyboardHighlight, setKeyboardHighlight] = useState(false);

  const textAreaRef = useRef<any>(null);
  const prevCursorRef = useRef(0);
  const prevQueryRef = useRef('');
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldRef = useRef<{ handleChange: (value: any) => void } | null>(null);
  const isControlled = valueProp !== undefined;
  const displayed = isControlled ? parseMentionValue(valueProp) : { text, mentions: mentionList };
  const mediaSlot = knobProps.nestedControl.px ?? MEDIA_SLOT_FALLBACK;

  const adoptValue = useCallback((next: MentionValue) => {
    setText(next.text);
    setMentionList(next.mentions);
  }, []);

  const emit = useCallback(
    (next: MentionValue) => {
      if (!isControlled) {
        adoptValue(next);
      }
      onChange?.(next);
      onTextChange?.(next.text);
      fieldRef.current?.handleChange(next);
    },
    [adoptValue, isControlled, onChange, onTextChange],
  );

  useEffect(() => {
    if (valueProp === undefined) {
      return;
    }
    const next = parseMentionValue(valueProp);
    adoptValue(next);
  }, [valueProp, adoptValue]);

  const triggerMap = useMemo(() => {
    const map = new Map<string, MentionConfig>();
    for (const config of mentions) {
      map.set(config.trigger, config);
    }
    return map;
  }, [mentions]);

  const checkForTrigger = useCallback(
    (currentText: string, position: number) => {
      for (const [trigger, config] of triggerMap) {
        const allowSpace = config.allowSpace ?? false;
        let wordStart = position;
        while (wordStart > 0) {
          const char = currentText[wordStart - 1];
          if (char === '\n') {
            break;
          }
          if (char === ' ' && !allowSpace) {
            break;
          }
          wordStart--;
        }
        const currentWord = currentText.slice(wordStart, position);
        if (currentWord.startsWith(trigger)) {
          const query = currentWord.slice(trigger.length);
          return { trigger, query, wordStart };
        }
      }
      return null;
    },
    [triggerMap],
  );

  const getFilteredSuggestions = useCallback(
    (trigger: string, query: string) => {
      const config = triggerMap.get(trigger);
      if (!config) {
        return [];
      }
      return config.data.filter(
        (item) =>
          item.display.toLowerCase().includes(query.toLowerCase()) ||
          item.id.toLowerCase().includes(query.toLowerCase()),
      );
    },
    [triggerMap],
  );

  const suggestions = useMemo(
    () => (showSuggestions && currentTrigger ? getFilteredSuggestions(currentTrigger, searchQuery) : []),
    [showSuggestions, currentTrigger, searchQuery, getFilteredSuggestions],
  );
  // GitHub/Slack keep the popup open on a live trigger even when the query
  // matches nothing (empty state). Disabled/readOnly still open nothing.
  const triggerActive = Boolean(!disabled && !readOnly && showSuggestions && currentTrigger);
  const hasSuggestions = triggerActive && suggestions.length > 0;
  // Uniform slot decision is per-list — if any visible row has media,
  // all rows reserve the slot; an all-text list (e.g. hashtags) has none.
  const suggestionsHaveMedia = useMemo(() => suggestions.some((item) => Boolean(item.avatar)), [suggestions]);

  const panel = useFloatingPanel({
    open: triggerActive,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) {
        setShowSuggestions(false);
        setCurrentTrigger(null);
        prevQueryRef.current = '';
      }
    },
    disabled: disabled || readOnly,
    fitContent: true,
  });

  const dismiss = useDismiss(panel.context, {
    outsidePressEvent: 'click',
    ancestorScroll: false,
  });
  const { getFloatingProps } = useInteractions([dismiss]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const updateTriggerState = useCallback(
    (currentText: string, position: number) => {
      const triggerInfo = checkForTrigger(currentText, position);
      if (triggerInfo) {
        setCurrentTrigger(triggerInfo.trigger);
        setSearchQuery(triggerInfo.query);
        setShowSuggestions(true);
        setKeyboardHighlight(true);
        if (triggerInfo.query !== prevQueryRef.current) {
          setSelectedIndex(0);
        }
        prevQueryRef.current = triggerInfo.query;
      } else {
        setShowSuggestions(false);
        setCurrentTrigger(null);
        prevQueryRef.current = '';
      }
    },
    [checkForTrigger],
  );

  // ── Textarea element access ────────────────────────────────

  const getWebTextAreaElement = useCallback((): HTMLTextAreaElement | null => {
    if (typeof document === 'undefined') {
      return null;
    }
    const current = textAreaRef.current as
      | HTMLTextAreaElement
      | { textarea?: HTMLTextAreaElement; _textarea?: HTMLTextAreaElement }
      | HTMLElement
      | null;
    if (!current) {
      return null;
    }
    if (current instanceof HTMLTextAreaElement) {
      return current;
    }
    if ('textarea' in current && current.textarea instanceof HTMLTextAreaElement) {
      return current.textarea;
    }
    if ('_textarea' in current && current._textarea instanceof HTMLTextAreaElement) {
      return current._textarea;
    }
    if (current instanceof HTMLElement) {
      const nested = current.querySelector('textarea');
      return nested instanceof HTMLTextAreaElement ? nested : null;
    }
    return null;
  }, []);

  const handleTextChange = useCallback(
    (newText: string) => {
      const oldText = displayed.text;
      const lengthDiff = newText.length - oldText.length;
      // On web the RN onSelectionChange callback never fires, so read the
      // caret straight off the DOM textarea (already updated by input time)
      const webElement = getWebTextAreaElement();
      const domCaret = webElement && typeof webElement.selectionStart === 'number' ? webElement.selectionStart : null;
      const editPosition = domCaret !== null ? Math.max(0, domCaret - Math.max(0, lengthDiff)) : prevCursorRef.current;

      let nextMentions = displayed.mentions;
      if (lengthDiff !== 0) {
        nextMentions = displayed.mentions
          .map((m) => ({ ...m }))
          .filter((mention) => {
            const mentionEnd = mention.position + mention.length;
            if (editPosition >= mentionEnd) {
              return true;
            }
            if (editPosition <= mention.position) {
              mention.position += lengthDiff;
              const expectedText = `${mention.type}${mention.display}`;
              const actualText = newText.slice(mention.position, mention.position + mention.length);
              return actualText === expectedText;
            }
            return false;
          });
      }

      emit({ text: newText, mentions: nextMentions });
      const estimatedCursor =
        domCaret !== null ? domCaret : Math.max(0, Math.min(editPosition + Math.max(0, lengthDiff), newText.length));
      prevCursorRef.current = estimatedCursor;
      setCursorPosition(estimatedCursor);
      updateTriggerState(newText, estimatedCursor);
    },
    [displayed, emit, updateTriggerState, getWebTextAreaElement],
  );

  const handleSelectionChange = useCallback(
    (event: any) => {
      const selection = event?.nativeEvent?.selection;
      if (selection) {
        prevCursorRef.current = selection.start;
        setCursorPosition(selection.start);
        updateTriggerState(displayed.text, selection.start);
      }
    },
    [displayed.text, updateTriggerState],
  );

  // Web caret tracking: the DOM `select` event fires on every caret move
  // (clicks, arrow keys, typing), unlike RN's onSelectionChange
  const handleWebSelect = useCallback(() => {
    const el = getWebTextAreaElement();
    if (!el || typeof el.selectionStart !== 'number') {
      return;
    }
    const position = el.selectionStart;
    prevCursorRef.current = position;
    setCursorPosition(position);
    updateTriggerState(el.value, position);
  }, [getWebTextAreaElement, updateTriggerState]);

  const insertMention = useCallback(
    (item: MentionItem) => {
      if (!currentTrigger) {
        return;
      }
      const triggerInfo = checkForTrigger(displayed.text, cursorPosition);
      if (!triggerInfo) {
        return;
      }

      const { wordStart } = triggerInfo;
      const beforeMention = displayed.text.slice(0, wordStart);
      const afterMention = displayed.text.slice(cursorPosition);
      const mentionText = `${currentTrigger}${item.display}`;
      const config = triggerMap.get(currentTrigger);
      const insertSpace = config?.insertSpace !== false;
      const newText = beforeMention + mentionText + (insertSpace ? ' ' : '') + afterMention;
      const insertedLength = mentionText.length + (insertSpace ? 1 : 0);
      const oldLength = cursorPosition - wordStart;
      const positionDiff = insertedLength - oldLength;

      const adjustedMentions = displayed.mentions.map((m) =>
        m.position > wordStart ? { ...m, position: m.position + positionDiff } : m,
      );

      const newMention: MentionData = {
        type: currentTrigger,
        id: item.id,
        display: item.display,
        position: wordStart,
        length: mentionText.length,
      };

      const newCursorPos = wordStart + mentionText.length + (insertSpace ? 1 : 0);
      emit({ text: newText, mentions: [...adjustedMentions, newMention] });
      setCursorPosition(newCursorPos);
      prevCursorRef.current = newCursorPos;
      setShowSuggestions(false);
      setCurrentTrigger(null);
      prevQueryRef.current = '';
      onMentionSelect?.(item, currentTrigger);
      setTimeout(() => {
        const el = getWebTextAreaElement();
        if (el) {
          el.focus();
          el.setSelectionRange(newCursorPos, newCursorPos);
        } else {
          textAreaRef.current?.focus();
        }
      }, 0);
    },
    [
      displayed,
      cursorPosition,
      currentTrigger,
      checkForTrigger,
      triggerMap,
      onMentionSelect,
      emit,
      getWebTextAreaElement,
    ],
  );

  const removeMention = useCallback(
    (mention: MentionData) => {
      const before = displayed.text.slice(0, mention.position);
      const after = displayed.text.slice(mention.position + mention.length);
      const newText = before + after;
      const removedLen = mention.length;
      const nextMentions = displayed.mentions
        .filter((m) => !(m.position === mention.position && m.id === mention.id))
        .map((m) => (m.position > mention.position ? { ...m, position: m.position - removedLen } : m));
      emit({ text: newText, mentions: nextMentions });
      const newCursor = mention.position;
      setCursorPosition(newCursor);
      prevCursorRef.current = newCursor;
      updateTriggerState(newText, newCursor);
      setTimeout(() => {
        const el = getWebTextAreaElement();
        if (el) {
          el.focus();
          el.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
    },
    [displayed, emit, updateTriggerState, getWebTextAreaElement],
  );

  const handleKeyDown = useCallback(
    (event: any) => {
      const key = event.key || event.nativeEvent?.key;
      const webElement = getWebTextAreaElement();
      const caret =
        webElement && typeof webElement.selectionStart === 'number' ? webElement.selectionStart : cursorPosition;

      // Slack: Backspace/Delete at a mention token eats the whole token.
      if (key === 'Backspace' || key === 'Delete') {
        const mention = mentionForDelete(displayed.mentions, caret, key);
        if (mention) {
          event.preventDefault?.();
          removeMention(mention);
          return;
        }
      }

      if (!showSuggestions || !currentTrigger) {
        return;
      }

      if (suggestions.length === 0) {
        if (key === 'Escape') {
          event.preventDefault?.();
          setShowSuggestions(false);
        }
        return;
      }

      switch (key) {
        case 'ArrowDown':
          event.preventDefault?.();
          setKeyboardHighlight(true);
          setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          event.preventDefault?.();
          setKeyboardHighlight(true);
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
          break;
        case 'Enter':
        case 'Tab':
          event.preventDefault?.();
          if (suggestions[selectedIndex]) {
            insertMention(suggestions[selectedIndex]);
          }
          break;
        case 'Escape':
          event.preventDefault?.();
          setShowSuggestions(false);
          break;
      }
    },
    [
      showSuggestions,
      currentTrigger,
      suggestions,
      selectedIndex,
      insertMention,
      displayed,
      cursorPosition,
      removeMention,
      getWebTextAreaElement,
    ],
  );

  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  // Keep the keyboard-active row in view by measuring the real row, same as
  // Select's controlled-scrolling adjustment (no estimated item height).
  useEffect(() => {
    if (!hasSuggestions) {
      return;
    }
    const floating = panel.refs.floating.current;
    const item = itemRefs.current[selectedIndex];
    if (!floating || !item?.getBoundingClientRect) {
      return;
    }
    const containerRect = floating.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.bottom > containerRect.bottom) {
      floating.scrollTop += itemRect.bottom - containerRect.bottom;
    } else if (itemRect.top < containerRect.top) {
      floating.scrollTop -= containerRect.top - itemRect.top;
    }
  }, [selectedIndex, hasSuggestions, panel.refs.floating]);

  const handleBlurInternal = useCallback((..._args: any[]) => {
    blurTimeoutRef.current = setTimeout(() => {
      setShowSuggestions(false);
    }, blurCloseDelayMs);
  }, []);

  const handleSuggestionPress = useCallback(
    (item: MentionItem) => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
      insertMention(item);
    },
    [insertMention],
  );

  const activeConfig = currentTrigger ? triggerMap.get(currentTrigger) : null;
  const suggestionsMaxHeight =
    activeConfig?.menuHeight ?? (knobProps.sizeToken === '$3' ? 160 : knobProps.sizeToken === '$5' ? 240 : 200);
  const suggestionsMinWidth =
    activeConfig?.menuWidth ?? (knobProps.sizeToken === '$3' ? 180 : knobProps.sizeToken === '$5' ? 240 : 200);

  // ── Virtual reference at caret position ────────────────────

  const getCaretClientRect = useCallback((): DOMRect => {
    const fallback = DOMRect.fromRect({ x: 0, y: 0, width: 1, height: 16 });
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return fallback;
    }
    const textAreaElement = getWebTextAreaElement();
    if (!textAreaElement) {
      return fallback;
    }

    const style = window.getComputedStyle(textAreaElement);
    const textAreaRect = textAreaElement.getBoundingClientRect();
    const mirror = document.createElement('div');
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.overflowWrap = 'anywhere';
    mirror.style.left = '-9999px';
    mirror.style.top = '0';
    mirror.style.width = `${textAreaElement.clientWidth}px`;
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.fontStyle = style.fontStyle;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.textTransform = style.textTransform;
    mirror.style.textIndent = style.textIndent;
    mirror.style.tabSize = style.tabSize;
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.boxSizing = style.boxSizing;
    mirror.textContent = displayed.text.slice(0, cursorPosition);

    const marker = document.createElement('span');
    marker.textContent = displayed.text[cursorPosition] || zeroWidthSpace;
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    try {
      const markerRect = marker.getBoundingClientRect();
      const mirrorRect = mirror.getBoundingClientRect();
      const parsedLineHeight = Number.parseFloat(style.lineHeight);
      const parsedFontSize = Number.parseFloat(style.fontSize);
      const lineHeight = Number.isFinite(parsedLineHeight)
        ? parsedLineHeight
        : Number.isFinite(parsedFontSize)
          ? parsedFontSize * 1.2
          : 18;
      const relLeft = markerRect.left - mirrorRect.left - textAreaElement.scrollLeft;
      const relTop = markerRect.top - mirrorRect.top - textAreaElement.scrollTop;
      const left = textAreaRect.left + relLeft;
      const top = textAreaRect.top + relTop;
      return DOMRect.fromRect({ x: left, y: top, width: 1, height: lineHeight });
    } finally {
      document.body.removeChild(mirror);
    }
  }, [getWebTextAreaElement, displayed.text, cursorPosition]);

  useEffect(() => {
    const el = getWebTextAreaElement();
    if (el) {
      panel.triggerRef.current = el;
    }
  });

  useLayoutEffect(() => {
    if (!triggerActive) {
      return;
    }
    const rect = getCaretClientRect();
    panel.refs.setReference({ getBoundingClientRect: () => rect });
    panel.update();
  }, [triggerActive, cursorPosition, displayed.text]);

  const suggestionListId = `${id}-suggestions`;
  const selectedOptionId =
    hasSuggestions && suggestions[selectedIndex] ? `${id}-option-${suggestions[selectedIndex].id}` : undefined;

  // ── Floating dropdown ──────────────────────────────────────

  // Same clobber the FloatingPanel web branch carried: the complete
  // `elevatedSurface` fragment ends in a web-only `style: { boxShadow }`, and a
  // second `style` prop on one element replaces rather than merges — so
  // spreading it after the positioning style dropped `position: fixed`. Fold
  // its style in instead of letting the two compete.
  const { style: elevatedSurfaceStyle, ...elevatedSurfaceProps } = panel.knobProps.elevatedSurface;

  const floatingDropdown = panel.mounted ? (
    <PanelPortal anchor={panel.triggerRef.current}>
      <YStack
        {...getFloatingProps({
          ref: panel.refs.setFloating,
          style: {
            ...elevatedSurfaceStyle,
            position: panel.strategy,
            top: panel.y ?? 0,
            left: panel.x ?? 0,
            scrollbarWidth: 'none' as any,
            zIndex: zIndex.dropdown,
            overflow: 'auto',
            opacity: panel.visible ? 1 : 0,
            transform: panel.visible ? 'scale(1)' : 'scale(0.96)',
            transition: panel.knobProps.transition ? panelTransition : 'none',
            transformOrigin: panel.placement.startsWith('top') ? 'bottom left' : 'top left',
          },
          onScroll: (e: any) => {
            panel.updateArrows(e.target as HTMLElement);
          },
        })}
        outlineWidth={0}
        pointerEvents={panel.visible ? 'auto' : 'none'}
        {...elevatedSurfaceProps}
        borderRadius={panel.dropdownRadius}
        padding={0}
        maxHeight={suggestionsMaxHeight}
        minWidth={suggestionsMinWidth}
        role={'listbox' as 'list'}
        id={suggestionListId}
        aria-label={t('Suggestions')}>
        <ScrollArrow
          direction="up"
          scrollRef={panel.refs.floating}
          visible={panel.arrowUp}
          arrowScrollDirRef={panel.arrowScrollDirRef}
        />
        {/* Rows are direct children of the scroll container — no padded
            wrapper, the container owns only its border. */}
        {hasSuggestions
          ? suggestions.map((item, index) => {
              const optionId = `${id}-option-${item.id}`;
              const active = index === selectedIndex;
              const keyboardRing = active && keyboardHighlight;
              const secondary = mentionSecondary(item, currentTrigger ?? '');
              return (
                <MentionSuggestionItem
                  key={item.id}
                  ref={(node: any) => {
                    itemRefs.current[index] = node;
                  }}
                  selected={active}
                  onPress={() => {
                    handleSuggestionPress(item);
                  }}
                  onMouseEnter={() => {
                    setKeyboardHighlight(false);
                    setSelectedIndex(index);
                  }}
                  role="option"
                  id={optionId}
                  aria-selected={active}
                  data-keyboard-ring={keyboardRing ? 'true' : undefined}
                  {...(keyboardRing ? keyboardFocusRingProps : undefined)}>
                  {/* When any row in the list has media, every
                      row reserves the same fixed slot (initials fallback, centered)
                      so the text columns share one left edge. */}
                  {suggestionsHaveMedia && (
                    <YStack
                      width={mediaSlot}
                      height={mediaSlot}
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                      data-media-slot={mediaSlot}>
                      <Avatar size={mediaSlot} circular>
                        {item.avatar ? <Avatar.Image src={item.avatar} /> : null}
                        <Avatar.Fallback
                          backgroundColor={formInputColors.background.focus}
                          justifyContent="center"
                          alignItems="center">
                          <Text fontSize={helperFontSizeMap[knobProps.sizeToken] ?? '$2'}>{item.display[0]}</Text>
                        </Avatar.Fallback>
                      </Avatar>
                    </YStack>
                  )}
                  <YStack flex={1} minWidth={0}>
                    <MentionMatchText text={item.display} query={searchQuery} {...knobProps.label} />
                    {secondary ? (
                      <MentionMatchText
                        text={secondary}
                        query={searchQuery}
                        fontSize={helperFontSizeMap[knobProps.sizeToken] ?? '$2'}
                        color={formCommonColors.muted}
                        {...knobProps.body}
                      />
                    ) : null}
                  </YStack>
                </MentionSuggestionItem>
              );
            })
          : triggerActive && (
              <YStack paddingHorizontal="$3" paddingVertical="$2" role="status" aria-live="polite">
                <Text
                  fontSize={helperFontSizeMap[knobProps.sizeToken] ?? '$2'}
                  color={formCommonColors.muted}
                  {...knobProps.body}>
                  {t('No matches')}
                </Text>
              </YStack>
            )}
        <ScrollArrow
          direction="down"
          scrollRef={panel.refs.floating}
          visible={panel.arrowDown}
          arrowScrollDirRef={panel.arrowScrollDirRef}
        />
      </YStack>
    </PanelPortal>
  ) : null;

  // ── TextArea ───────────────────────────────────────────────

  const mentionTextArea = (resolvedError?: string | boolean, fieldBlurHandler?: (...args: any[]) => void) => (
    <TextArea
      disabled={disabled}
      readOnly={readOnly}
      label={label}
      labelProps={labelProps}
      error={resolvedError ?? errorProp}
      helperText={helperText}
      required={required}
      size={size}
      compact={compact}
      onBlur={(...args: any[]) => {
        handleBlurInternal(...args);
        if (fieldBlurHandler) {
          fieldBlurHandler(...args);
        } else {
          onBlur?.(...args);
        }
      }}
      value={displayed.text}
      onChangeText={handleTextChange}
      placeholder={placeholder}
      autoResize={autoResize}
      minRows={minRows}
      maxRows={maxRows}
      textAreaRef={textAreaRef}
      textAreaProps={{
        onSelectionChange: handleSelectionChange,
        ...(isWeb ? { onSelect: handleWebSelect } : {}),
        onKeyDown: handleKeyDown as any,
        'aria-autocomplete': 'list',
        'aria-haspopup': 'listbox',
        'aria-expanded': triggerActive,
        'aria-controls': triggerActive ? suggestionListId : undefined,
        'aria-activedescendant': selectedOptionId,
        ...textAreaProps,
      }}
    />
  );

  // Render skeleton placeholder (after all hooks)
  if (skeleton) {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={errorProp}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        disabled={disabled}>
        <Skeleton variant="rounded" width="100%" height={minHeight} />
      </FieldLayout>
    );
  }

  if (!resolvedForm || !name) {
    return (
      <>
        {mentionTextArea()}
        {floatingDropdown}
      </>
    );
  }

  return (
    <>
      <Field
        defaultValue={defaultValue}
        form={resolvedForm}
        mode={mode}
        name={name}
        preserveValue={preserveValue}
        validators={resolvedValidators}>
        {(field) => {
          fieldRef.current = { handleChange: field.handleChange };
          const resolvedError = getFieldError(field, errorProp);
          return (
            <MentionFieldSync
              fieldValue={field.state.value}
              current={{ text, mentions: mentionList }}
              disabled={isControlled}
              onAdopt={adoptValue}>
              {mentionTextArea(resolvedError, mergeFieldHandler(field, 'handleBlur', onBlur))}
            </MentionFieldSync>
          );
        }}
      </Field>
      {floatingDropdown}
    </>
  );
}
