import { useDismiss, useInteractions } from '@floating-ui/react';
import { useTouchSurface, ensureFocusVisibleRing, keyboardFocusRingProps, menuRowFrame } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, UIEvent } from 'react';
import { useProps, Avatar, Text, XStack, YStack, isWeb, styled } from 'tamagui';
import type { GetProps, SizeTokens, TamaguiElement } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import type { FormFieldProps } from '../../FieldLayout';
import { useFloatingPanel, panelTransition } from '../../FloatingPanel';
import { PanelPortal } from '../../FloatingPanel/PanelPortal';
import { formCommonColors, formInputColors } from '../../shared/color-ramps';
import { ScrollArrow } from '../../shared/floating-list';
import { t } from '../../shared/t';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { zIndex } from '../../shared/z-index';
import { Skeleton } from '../../Skeleton';
import type { Validator, FieldComponentProps } from '../../types';
import { TextArea } from '../TextArea';
import type { TextAreaProps } from '../TextArea';

export interface MentionItem {
  id: string;
  display: string;
  avatar?: string;
  description?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- opaque consumer payload carried through selection; no owner type exists
  metadata?: Record<string, unknown>;
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
// oxlint-disable-next-line anti-slop/no-unknown-parameters, react-doctor/only-export-components -- boundary parser for untyped form values; exported helper alongside the component
export const parseMentionValue = (raw: unknown): MentionValue => {
  // oxlint-disable anti-slop/no-runtime-typeof -- this IS the parse boundary: it classifies an untyped seed
  if (typeof raw === 'string') {
    return { text: raw, mentions: [] };
  }
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    // SAFETY: raw is a non-null, non-array object; every property is read as unknown and re-checked below.
    const o = raw as { text?: unknown; mentions?: unknown };
    return {
      text: typeof o.text === 'string' ? o.text : '',
      // SAFETY: seeds are produced by this component (emit), so a mentions array holds MentionData entries.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Array.isArray narrows to any[]; element shape is trusted per the SAFETY note
      mentions: Array.isArray(o.mentions) ? (o.mentions as MentionData[]) : [],
    };
  }
  // oxlint-enable anti-slop/no-runtime-typeof
  return { text: '', mentions: [] };
};

const mentionValuesEqual = (a: MentionValue, b: MentionValue): boolean =>
  a.text === b.text && JSON.stringify(a.mentions) === JSON.stringify(b.mentions);

const MentionFieldSync = ({
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
  children: ReactElement;
}) => {
  useEffect(() => {
    if (disabled || fieldValue === undefined) {
      return;
    }
    const next = parseMentionValue(fieldValue);
    if (mentionValuesEqual(next, current)) {
      return;
    }
    // oxlint-disable-next-line react-doctor/no-pass-data-to-parent -- adopts an externally written field value into local state, which is this sync component's job
    onAdopt(next);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- deps must stay [fieldValue, disabled]; re-running on local edits would revert them to the stale field value
  }, [fieldValue, disabled]);
  return children;
};

export type MentionInputProps<
  TParentData = object,
  TName extends DeepKeys<TParentData> = DeepKeys<TParentData>,
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
    textAreaProps?: TextAreaProps['textAreaProps'];
    /** When true, renders a skeleton placeholder instead of the mention input */
    skeleton?: boolean;
    /** When true, applies compact density (tighter layout gaps; control size unchanged) */
    compact?: boolean;
  };

const blurCloseDelayMs = 150;
const zeroWidthSpace = '\u200B';

// One fontSize step below the field size token \u2014 the T-HELPER register for the
// secondary (role/description) line, matching the shared suggestion-row recipe.
const helperFontSizeMap = new Map<string, string>([
  ['$3', '$2'],
  ['$4', '$3'],
  ['$5', '$4'],
]);

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

const SLUG_ID = /^[A-Za-z][\w.-]*$/u;

type MentionTextProps = GetProps<typeof Text>;

/** GitHub/Slack: bold the query hit inside the suggestion label. */
const MentionMatchText = ({ text, query, ...rest }: MentionTextProps & { text: string; query: string }) => {
  const needle = query.trim();
  if (!needle) {
    return <Text {...rest}>{text}</Text>;
  }
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) {
    return <Text {...rest}>{text}</Text>;
  }
  return (
    <Text {...rest}>
      {text.slice(0, idx)}
      <Text
        {...rest}
        fontWeight="700">
        {text.slice(idx, idx + needle.length)}
      </Text>
      {text.slice(idx + needle.length)}
    </Text>
  );
};

const mentionSecondary = (item: MentionItem, trigger: string): string | undefined => {
  if (item.description !== undefined && item.description !== '') {
    return item.description;
  }
  if (item.id && item.id !== item.display && SLUG_ID.test(item.id)) {
    return `${trigger}${item.id}`;
  }
  return undefined;
};

const mentionForDelete = (
  mentions: MentionData[],
  cursor: number,
  key: 'Backspace' | 'Delete',
): MentionData | undefined => {
  if (key === 'Backspace') {
    return mentions.find((m) => cursor > m.position && cursor <= m.position + m.length);
  }
  return mentions.find((m) => cursor >= m.position && cursor < m.position + m.length);
};

const isWordBreak = (char: string | undefined, allowSpace: boolean): boolean =>
  char === '\n' || (char === ' ' && !allowSpace);

const menuDimensionByToken = (token: string, compactValue: number, roomyValue: number): number => {
  if (token === '$3') {
    return compactValue;
  }
  if (token === '$5') {
    return roomyValue;
  }
  return 200;
};

/** Shift surviving mentions by the edit; drop those the edit overlapped or corrupted. */
const shiftMentions = (
  mentions: MentionData[],
  editPosition: number,
  lengthDiff: number,
  newText: string,
): MentionData[] => {
  const next: MentionData[] = [];
  for (const m of mentions) {
    const mention = { ...m };
    const mentionEnd = mention.position + mention.length;
    if (editPosition >= mentionEnd) {
      next.push(mention);
    } else if (editPosition <= mention.position) {
      mention.position += lengthDiff;
      const expectedText = `${mention.type}${mention.display}`;
      const actualText = newText.slice(mention.position, mention.position + mention.length);
      if (actualText === expectedText) {
        next.push(mention);
      }
    }
  }
  return next;
};

const parsePx = (value: string): number =>
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed styles carry a `px` suffix that Number() would reject
  Number.parseFloat(value);

const resolveCaretLineHeight = (lineHeight: string, fontSize: string): number => {
  const parsedLineHeight = parsePx(lineHeight);
  if (Number.isFinite(parsedLineHeight)) {
    return parsedLineHeight;
  }
  const parsedFontSize = parsePx(fontSize);
  return Number.isFinite(parsedFontSize) ? parsedFontSize * 1.2 : 18;
};

/** Measure the caret rect by mirroring the textarea text into an offscreen div. */
const measureCaretRect = (textAreaElement: HTMLTextAreaElement, text: string, caret: number): DOMRect => {
  const style = window.getComputedStyle(textAreaElement);
  const textAreaRect = textAreaElement.getBoundingClientRect();
  const mirror = document.createElement('div');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = 'pre-wrap';
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
  mirror.textContent = text.slice(0, caret);

  const marker = document.createElement('span');
  marker.textContent = text[caret] || zeroWidthSpace;
  mirror.append(marker);
  document.body.append(mirror);

  try {
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const lineHeight = resolveCaretLineHeight(style.lineHeight, style.fontSize);
    const relLeft = markerRect.left - mirrorRect.left - textAreaElement.scrollLeft;
    const relTop = markerRect.top - mirrorRect.top - textAreaElement.scrollTop;
    return DOMRect.fromRect({
      x: textAreaRect.left + relLeft,
      y: textAreaRect.top + relTop,
      width: 1,
      height: lineHeight,
    });
  } finally {
    mirror.remove();
  }
};

type TextAreaHandle =
  | HTMLElement
  | { focus?: () => void; textarea?: HTMLTextAreaElement; _textarea?: HTMLTextAreaElement };

interface MentionSelectionEvent {
  nativeEvent?: { selection?: { start: number } };
}

interface MentionKeyEvent {
  key?: string;
  nativeEvent?: { key?: string };
  preventDefault?: () => void;
}

// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity -- single cohesive field; splitting hooks/state across files is out of scope for the lint pass
export const MentionInput = <
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(
  props: MentionInputProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see component note above
) => {
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
    // oxlint-disable-next-line typescript/no-deprecated -- deprecated prop is still supported until removal
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
  const resolvedSizeToken: SizeTokens = size ?? knobProps.sizeToken;
  const minHeight = minHeightProp ?? getFieldHeight(resolvedSizeToken, 3, hydrationTouch);
  const maxHeight = maxHeightProp ?? getFieldHeight(resolvedSizeToken, 8, hydrationTouch);
  const minRows = Math.max(1, Math.round(minHeight / 20));
  const maxRows = Math.max(minRows, Math.round(maxHeight / 20));

  const initialValue = parseMentionValue(valueProp ?? defaultValue);
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

  const textAreaRef = useRef<TextAreaHandle | null>(null);
  const prevCursorRef = useRef(0);
  const prevQueryRef = useRef('');
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldRef = useRef<{ handleChange: (value: MentionValue) => void } | null>(null);
  const isControlled = valueProp !== undefined;
  const displayed = useMemo(
    () => (isControlled ? parseMentionValue(valueProp) : { text, mentions: mentionList }),
    [isControlled, valueProp, text, mentionList],
  );
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
        while (wordStart > 0 && !isWordBreak(currentText[wordStart - 1], allowSpace)) {
          wordStart -= 1;
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
    () =>
      showSuggestions && currentTrigger !== null && currentTrigger !== ''
        ? getFilteredSuggestions(currentTrigger, searchQuery)
        : [],
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
    disabled: disabled === true || readOnly === true,
    fitContent: true,
  });

  const dismiss = useDismiss(panel.context, {
    outsidePressEvent: 'click',
    ancestorScroll: false,
  });
  const { getFloatingProps } = useInteractions([dismiss]);

  useEffect(
    () => () => {
      if (blurTimeoutRef.current !== null) {
        clearTimeout(blurTimeoutRef.current);
      }
    },
    [],
  );

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
    const { current } = textAreaRef;
    if (current === null) {
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
      const domCaret = webElement?.selectionStart ?? null;
      const editPosition = domCaret === null ? prevCursorRef.current : Math.max(0, domCaret - Math.max(0, lengthDiff));

      const nextMentions =
        lengthDiff === 0 ? displayed.mentions : shiftMentions(displayed.mentions, editPosition, lengthDiff, newText);

      emit({ text: newText, mentions: nextMentions });
      const estimatedCursor = domCaret ?? Math.max(0, Math.min(editPosition + Math.max(0, lengthDiff), newText.length));
      prevCursorRef.current = estimatedCursor;
      setCursorPosition(estimatedCursor);
      updateTriggerState(newText, estimatedCursor);
    },
    [displayed, emit, updateTriggerState, getWebTextAreaElement],
  );

  const handleSelectionChange = useCallback(
    (event: MentionSelectionEvent) => {
      const selection = event.nativeEvent?.selection;
      if (selection !== undefined) {
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
    const position = el?.selectionStart ?? null;
    if (el === null || position === null) {
      return;
    }
    prevCursorRef.current = position;
    setCursorPosition(position);
    updateTriggerState(el.value, position);
  }, [getWebTextAreaElement, updateTriggerState]);

  const insertMention = useCallback(
    (item: MentionItem) => {
      if (currentTrigger === null || currentTrigger === '') {
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
          textAreaRef.current?.focus?.();
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
      const nextMentions: MentionData[] = [];
      for (const m of displayed.mentions) {
        if (m.position !== mention.position || m.id !== mention.id) {
          nextMentions.push(m.position > mention.position ? { ...m, position: m.position - removedLen } : m);
        }
      }
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

  const handleSuggestionKey = useCallback(
    (key: string, event: MentionKeyEvent) => {
      if (suggestions.length === 0) {
        if (key === 'Escape') {
          event.preventDefault?.();
          setShowSuggestions(false);
        }
        return;
      }

      switch (key) {
        case 'ArrowDown': {
          event.preventDefault?.();
          setKeyboardHighlight(true);
          setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
          break;
        }
        case 'ArrowUp': {
          event.preventDefault?.();
          setKeyboardHighlight(true);
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
          break;
        }
        case 'Enter':
        case 'Tab': {
          event.preventDefault?.();
          const picked = suggestions.at(selectedIndex);
          if (picked !== undefined) {
            insertMention(picked);
          }
          break;
        }
        case 'Escape': {
          event.preventDefault?.();
          setShowSuggestions(false);
          break;
        }
        default: {
          break;
        }
      }
    },
    [suggestions, selectedIndex, insertMention],
  );

  const handleKeyDown = useCallback(
    (event: MentionKeyEvent) => {
      const key = (event.key === undefined || event.key === '' ? event.nativeEvent?.key : event.key) ?? '';
      const caret = getWebTextAreaElement()?.selectionStart ?? cursorPosition;

      // Slack: Backspace/Delete at a mention token eats the whole token.
      if (key === 'Backspace' || key === 'Delete') {
        const mention = mentionForDelete(displayed.mentions, caret, key);
        if (mention) {
          event.preventDefault?.();
          removeMention(mention);
          return;
        }
      }

      if (!showSuggestions || currentTrigger === null || currentTrigger === '') {
        return;
      }

      handleSuggestionKey(key, event);
    },
    [
      showSuggestions,
      currentTrigger,
      displayed,
      cursorPosition,
      removeMention,
      getWebTextAreaElement,
      handleSuggestionKey,
    ],
  );

  const itemRefs = useRef<(TamaguiElement | null)[]>([]);

  // Keep the keyboard-active row in view by measuring the real row, same as
  // Select's controlled-scrolling adjustment (no estimated item height).
  useEffect(() => {
    if (!hasSuggestions) {
      return;
    }
    const floating = panel.refs.floating.current;
    const item = itemRefs.current[selectedIndex];
    if (!floating || !item || !('getBoundingClientRect' in item)) {
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

  const handleBlurInternal = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      setShowSuggestions(false);
    }, blurCloseDelayMs);
  }, []);

  const handleSuggestionPress = useCallback(
    (item: MentionItem) => {
      if (blurTimeoutRef.current !== null) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
      insertMention(item);
    },
    [insertMention],
  );

  const activeConfig = currentTrigger === null ? null : triggerMap.get(currentTrigger);
  const suggestionsMaxHeight = activeConfig?.menuHeight ?? menuDimensionByToken(knobProps.sizeToken, 160, 240);
  const suggestionsMinWidth = activeConfig?.menuWidth ?? menuDimensionByToken(knobProps.sizeToken, 180, 240);

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
    return measureCaretRect(textAreaElement, displayed.text, cursorPosition);
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
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- see note above
  }, [triggerActive, cursorPosition, displayed.text]);

  const suggestionListId = `${id}-suggestions`;
  const selectedItem = hasSuggestions ? suggestions.at(selectedIndex) : undefined;
  const selectedOptionId = selectedItem === undefined ? undefined : `${id}-option-${selectedItem.id}`;

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
            scrollbarWidth: 'none',
            zIndex: zIndex.dropdown,
            overflow: 'auto',
            opacity: panel.visible ? 1 : 0,
            transform: panel.visible ? 'scale(1)' : 'scale(0.96)',
            transition: panel.knobProps.transition === undefined ? 'none' : panelTransition,
            transformOrigin: panel.placement.startsWith('top') ? 'bottom left' : 'top left',
          },
          onScroll: (e: UIEvent<HTMLElement>) => {
            panel.updateArrows(e.currentTarget);
          },
        })}
        outlineWidth={0}
        pointerEvents={panel.visible ? 'auto' : 'none'}
        {...elevatedSurfaceProps}
        borderRadius={panel.dropdownRadius}
        padding={0}
        maxHeight={suggestionsMaxHeight}
        minWidth={suggestionsMinWidth}
        // SAFETY: Tamagui's Role union omits 'listbox'; 'list' is the nearest member and the DOM role attribute is emitted verbatim.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- literal cast to satisfy Tamagui's narrower Role union
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
                  ref={(node: TamaguiElement | null) => {
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
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui styled XStack row; a native <option> cannot host the row layout
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
                      <Avatar
                        size={mediaSlot}
                        circular>
                        {item.avatar !== undefined && item.avatar !== '' ? <Avatar.Image src={item.avatar} /> : null}
                        <Avatar.Fallback
                          backgroundColor={formInputColors.background.focus}
                          justifyContent="center"
                          alignItems="center">
                          <Text fontSize={helperFontSizeMap.get(knobProps.sizeToken) ?? '$2'}>{item.display[0]}</Text>
                        </Avatar.Fallback>
                      </Avatar>
                    </YStack>
                  )}
                  <YStack
                    flex={1}
                    minWidth={0}>
                    <MentionMatchText
                      text={item.display}
                      query={searchQuery}
                      {...knobProps.label}
                    />
                    {secondary !== undefined && secondary !== '' ? (
                      <MentionMatchText
                        text={secondary}
                        query={searchQuery}
                        fontSize={helperFontSizeMap.get(knobProps.sizeToken) ?? '$2'}
                        color={formCommonColors.muted}
                        {...knobProps.body}
                      />
                    ) : null}
                  </YStack>
                </MentionSuggestionItem>
              );
            })
          : triggerActive && (
              <YStack
                paddingHorizontal="$3"
                paddingVertical="$2"
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui YStack layout container; <output> would change styling semantics
                role="status"
                aria-live="polite">
                <Text
                  fontSize={helperFontSizeMap.get(knobProps.sizeToken) ?? '$2'}
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

  type BlurArgs = Parameters<NonNullable<typeof onBlur>>;
  const mentionTextArea = (resolvedError?: string | boolean, fieldBlurHandler?: (...args: BlurArgs) => void) => (
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
      onBlur={(...args: BlurArgs) => {
        handleBlurInternal();
        if (fieldBlurHandler) {
          fieldBlurHandler(...args);
        } else {
          onBlur?.(...args);
        }
      }}
      value={displayed.text}
      // oxlint-disable-next-line typescript/no-deprecated -- TextArea's canonical text callback is still onChangeText
      onChangeText={handleTextChange}
      placeholder={placeholder}
      autoResize={autoResize}
      minRows={minRows}
      maxRows={maxRows}
      textAreaRef={textAreaRef}
      textAreaProps={{
        onSelectionChange: handleSelectionChange,
        onSelect: isWeb ? handleWebSelect : undefined,
        onKeyDown: handleKeyDown,
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
        <Skeleton
          variant="rounded"
          width="100%"
          height={minHeight}
        />
      </FieldLayout>
    );
  }

  if (resolvedForm === undefined || name === undefined || name === '') {
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
};
