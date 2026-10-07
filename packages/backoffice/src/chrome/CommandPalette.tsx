// Command palette (MOD-01) — Linear / Spotlight / Frappe awesomebar.
// One section model (useCommandPaletteModel) rendered through two
// containers:
//   ≥sm web  → centered modal overlay (~640px, top-anchored ~15vh) via the
//              house Dialog surface (LC-06 overlay anatomy, LC-24 transitions)
//   <sm/native → full-height SheetModal (same mechanics as the list tools
//              sheet and the native search sheet)
//
// Keyboard-first: the search input is the single tab stop (D-23); ArrowUp/
// ArrowDown / Home / End move one roving highlight across sections, Enter
// opens, Escape closes and returns focus to the pre-open element (D-22),
// Mod+K/G toggles closed while the input holds focus (Linear). The highlight
// is the SELECTED channel — accent fill, no ring (LC-71: focus stays on the
// text-entry control, which rings the whole SearchInput box). COMMIT-class
// dismissal (LC-21): picking a row commits and closes; otherwise only
// backdrop click / Escape / Mod+K dismiss.
import {
  Dialog,
  DialogContent,
  ScrollView,
  SheetModal,
  SizableText,
  Spinner,
  Text,
  XStack,
  YStack,
  isWeb,
} from '@repo/ui';
import { SearchInput } from '@repo/forms';
import { addToRecent } from '@repo/frappe-ui';
import { menuRowFrame, useLayoutSizeClass, useReadableTextOn, useResolvedKnobs } from '@repo/theme';
import type { ComponentProps, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeNavigator } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { matchQueryIndices } from './awesomebar-data';
import { useCommandPaletteModel } from './command-palette-model';
import type { CommandPaletteItem, CommandPaletteModel } from './command-palette-model';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 640;
const RESULTS_MAX_HEIGHT = 400;
/** Minimum press target for result rows (house 44px floor). */
const ROW_MIN_HEIGHT = 44;
const LISTBOX_ID = 'backoffice-command-palette-listbox';

const optionId = (index: number) => `backoffice-command-palette-option-${index}`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const navigator = useBackofficeNavigator();
  const { knobProps } = useResolvedKnobs();
  const isCompact = useLayoutSizeClass() === 'compact';
  const asSheet = !isWeb || isCompact;

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const model = useCommandPaletteModel({ query, debouncedQuery, open });
  const { items } = model;

  const itemNodesRef = useRef<unknown[]>([]);

  // ── D-22 FOCUS-RETURN: render-phase capture on the opening render (before
  // the overlay mounts and moves focus), restore on close. ─────────────────
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current && isWeb && typeof document !== 'undefined') {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpenRef.current = open;

  const close = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setHighlight(0);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true);
      } else {
        close();
      }
    },
    [close, onOpenChange],
  );

  useEffect(() => {
    if (open || !isWeb || typeof document === 'undefined') {
      return;
    }
    // Runs on close (and unmount-after-close): put focus back where it was.
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (target?.isConnected) {
      target.focus();
    }
  }, [open]);

  // Focus the palette input on open. The Dialog focus scope re-targets the
  // SearchInput's group frame (its first tabbable) DURING the mount
  // animation — after any one-shot focus — so assert the input for the
  // whole settle window, re-claiming every frame it gets stolen (D-23: the
  // input is the palette's single tab stop). The panel is found by testid:
  // Dialog.Content mounts in a portal and does not deliver a host-element
  // ref, and the palette is a chrome singleton. The sheet has no scope of
  // its own on web and settles on the first pass.
  useEffect(() => {
    if (!open || !isWeb || typeof document === 'undefined') {
      return;
    }
    let cancelled = false;
    let raf = 0;
    const deadline = Date.now() + 1000;
    const claim = () => {
      if (cancelled) {
        return;
      }
      const input = document.querySelector<HTMLInputElement>('[data-testid="backoffice-command-palette"] input');
      if (input && document.activeElement !== input) {
        input.focus();
      }
      if (Date.now() < deadline) {
        raf = requestAnimationFrame(claim);
      }
    };
    raf = requestAnimationFrame(claim);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [open]);

  // Keep the highlight on a real row as results stream in/out.
  useEffect(() => {
    setHighlight((current) => (current < items.length ? current : 0));
  }, [items]);

  // Keep the keyboard-highlighted row scrolled into view (web).
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const node = itemNodesRef.current[highlight] as HTMLElement | undefined | null;
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [highlight]);

  // One commit per open (LC-21 COMMIT class): Enter can reach both the
  // keydown handler and the input's onSubmitEditing on web — the second
  // call must not navigate again.
  const activatedRef = useRef(false);
  useEffect(() => {
    if (open) {
      activatedRef.current = false;
    }
  }, [open]);

  const activate = useCallback(
    (item: CommandPaletteItem | undefined) => {
      if (!item || activatedRef.current) {
        return;
      }
      activatedRef.current = true;
      navigator.navigate(item.path);
      addToRecent({ label: item.label, path: item.path });
      close();
    },
    [navigator, close],
  );

  // ── Input key handling (roving highlight, commit, dismiss, Linear toggle)
  const handleKeyDown = useCallback(
    (event: { key?: string; nativeEvent?: { key?: string }; preventDefault?: () => void }) => {
      const key = event.key ?? event.nativeEvent?.key;
      const native = event as unknown as KeyboardEvent;
      const withMod = Boolean(native.metaKey || native.ctrlKey);
      if (withMod && !native.altKey && !native.shiftKey) {
        const chord = key?.toLowerCase();
        if (chord === 'k' || chord === 'g') {
          event.preventDefault?.();
          close();
          return;
        }
      }
      if (key === 'ArrowDown') {
        event.preventDefault?.();
        setHighlight((current) => (items.length ? (current + 1) % items.length : 0));
      } else if (key === 'ArrowUp') {
        event.preventDefault?.();
        setHighlight((current) => (items.length ? (current - 1 + items.length) % items.length : 0));
      } else if (key === 'Home') {
        event.preventDefault?.();
        setHighlight(0);
      } else if (key === 'End') {
        event.preventDefault?.();
        if (items.length) {
          setHighlight(items.length - 1);
        }
      } else if (key === 'Enter') {
        event.preventDefault?.();
        activate(items[highlight] ?? items[0]);
      } else if (key === 'Escape') {
        event.preventDefault?.();
        close();
      } else if (key === 'Tab') {
        // D-23 ONE-TAB-STOP: the input is the palette's only tab stop.
        event.preventDefault?.();
      }
    },
    [items, highlight, activate, close],
  );

  // Sheet mode leaves Escape dismissal to the consumer (LC-21) — cover the
  // case where focus is outside the input (list-tools-sheet precedent).
  useEffect(() => {
    if (!asSheet || !isWeb || typeof document === 'undefined' || !open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [asSheet, open, close]);

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    setHighlight(0);
  }, []);

  const handleSearch = useCallback((text: string) => {
    setDebouncedQuery(text.trim());
  }, []);

  const handleClear = useCallback(() => {
    setDebouncedQuery('');
    setHighlight(0);
  }, []);

  const activeOptionId = items[highlight] ? optionId(highlight) : undefined;

  const inputProps = useMemo(
    () =>
      ({
        onKeyDown: handleKeyDown,
        onSubmitEditing: () => {
          activate(items[highlight] ?? items[0]);
        },
        role: 'combobox',
        'aria-expanded': true,
        'aria-haspopup': 'listbox',
        'aria-controls': LISTBOX_ID,
        'aria-activedescendant': activeOptionId,
      }) as ComponentProps<typeof SearchInput>['inputProps'],
    [handleKeyDown, activate, items, highlight, activeOptionId],
  );

  // Linear / Spotlight: the search IS the header — chromeless so the dialog
  // is not a box-in-a-box. LC-71 text-entry: SearchInput still rings the
  // whole control (magnifier included) on any focus.
  const searchInput = (
    <SearchInput
      value={query}
      onChange={handleChange}
      onSearch={handleSearch}
      onClear={handleClear}
      debounceMs={300}
      size="$4"
      chromeless
      placeholder={t('awesomebar.placeholder', 'Search or type a command…')}
      aria-label={t('awesomebar.label', 'Search or type a command')}
      inputProps={inputProps}
    />
  );

  const results = (
    <PaletteResults
      model={model}
      highlight={highlight}
      onHighlight={setHighlight}
      onActivate={activate}
      itemNodesRef={itemNodesRef}
    />
  );

  // ── <sm / native: full-height sheet (native search sheet pattern) ────────
  if (asSheet) {
    return (
      <SheetModal
        open={open}
        onOpenChange={handleOpenChange}
        snapPoint={92}
        scrollable
        header={
          <YStack
            paddingHorizontal="$3"
            paddingBottom="$2"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
            data-testid="backoffice-command-palette">
            {searchInput}
          </YStack>
        }>
        <YStack
          id={LISTBOX_ID}
          role={'listbox' as 'list'}
          aria-label={t('awesomebar.results', 'Search results')}
          paddingBottom="$4"
          data-dismiss-class="commit">
          {results}
        </YStack>
      </SheetModal>
    );
  }

  // ── ≥sm web: centered top-anchored modal overlay ─────────────────────────
  const topOffset = typeof window === 'undefined' ? 120 : Math.round(window.innerHeight * 0.15);

  return (
    <Dialog
      modal
      open={open}
      onOpenChange={handleOpenChange}>
      <Dialog.Portal
        justifyContent="flex-start"
        alignItems="center"
        paddingTop={topOffset}>
        <Dialog.Overlay
          key="overlay"
          backgroundColor="$shadow6"
          transition={knobProps.transition}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <DialogContent
          key="content"
          width={PANEL_WIDTH}
          maxWidth="92%"
          // SP-EDGE / LC-72 CONTAINER-CLIP: the container owns only its
          // border — the input band, rows, and footer own their insets, so
          // row fills run edge to edge and overflow hidden clips them to
          // the radius.
          padding={0}
          gap={0}
          overflow="hidden"
          aria-label={t('awesomebar.label', 'Search or type a command')}
          data-dismiss-class="commit"
          data-testid="backoffice-command-palette">
          <YStack
            paddingHorizontal="$3"
            paddingVertical="$1"
            borderBottomWidth={1}
            borderBottomColor="$borderColor">
            {searchInput}
          </YStack>
          <ScrollView maxHeight={RESULTS_MAX_HEIGHT}>
            <YStack
              id={LISTBOX_ID}
              role={'listbox' as 'list'}
              aria-label={t('awesomebar.results', 'Search results')}>
              {results}
            </YStack>
          </ScrollView>
          <PaletteFooter />
        </DialogContent>
      </Dialog.Portal>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Match highlighting (Linear / Spotlight: bold the matched run)
// ---------------------------------------------------------------------------

function HighlightedText({
  text,
  query,
  color,
  fontSize,
  opacity,
}: {
  text: string;
  query: string;
  color?: string;
  fontSize?: string;
  opacity?: number;
}) {
  const { knobProps } = useResolvedKnobs();
  const indices = query ? matchQueryIndices(query, text) : [];
  const matchSet = new Set(indices ?? []);
  if (!matchSet.size) {
    return (
      <Text
        numberOfLines={1}
        color={color}
        fontSize={fontSize}
        opacity={opacity}
        {...knobProps.body}>
        {text}
      </Text>
    );
  }
  const nodes: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const isMatch = matchSet.has(cursor);
    let end = cursor + 1;
    while (end < text.length && matchSet.has(end) === isMatch) {
      end += 1;
    }
    nodes.push(
      <Text
        key={cursor}
        fontWeight={isMatch ? '700' : '400'}
        color={color}
        fontSize={fontSize}
        opacity={opacity}
        {...(isMatch ? { 'data-match': 'true' } : {})}>
        {text.slice(cursor, end)}
      </Text>,
    );
    cursor = end;
  }
  return (
    <Text
      numberOfLines={1}
      color={color}
      fontSize={fontSize}
      opacity={opacity}
      {...knobProps.body}>
      {nodes}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Shared section list (one renderer for both containers)
// ---------------------------------------------------------------------------

interface PaletteResultsProps {
  model: CommandPaletteModel;
  highlight: number;
  onHighlight: (index: number) => void;
  onActivate: (item: CommandPaletteItem) => void;
  itemNodesRef: RefObject<unknown[]>;
}

function PaletteResults({ model, highlight, onHighlight, onActivate, itemNodesRef }: PaletteResultsProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  // LC-71 SELECTED channel: the roving highlight is fill, never a ring
  // (combobox focus stays on the search input). Accent + readable ink
  // (LC-05) so selected + unselected stay one emphasis system.
  const onAccent = useReadableTextOn('$accentBackground');
  const { sections, searching, hasQuery, noResults, query } = model;

  let flatIndex = -1;

  return (
    <>
      {sections.map((section) => (
        <YStack
          key={section.id}
          data-testid={`backoffice-palette-section-${section.id}`}>
          <Text
            fontSize="$1"
            color="$color10"
            textTransform="uppercase"
            letterSpacing={0.5}
            paddingHorizontal="$3"
            paddingTop="$2.5"
            paddingBottom="$1.5"
            // Sticky headers (Linear): stay visible while the section scrolls.
            {...(isWeb
              ? ({
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  backgroundColor: '$background',
                } as const)
              : {})}
            {...knobProps.body}>
            {section.label}
          </Text>
          {section.items.map((item) => {
            flatIndex += 1;
            const index = flatIndex;
            const highlighted = index === highlight;
            const Icon = item.icon;
            const ink = highlighted && onAccent ? onAccent : '$color12';
            const muted = highlighted && onAccent ? onAccent : '$color10';
            return (
              <XStack
                key={item.id}
                id={optionId(index)}
                ref={
                  ((node: unknown) => {
                    itemNodesRef.current[index] = node;
                  }) as never
                }
                role={'option' as 'listitem'}
                aria-selected={highlighted}
                data-highlighted={highlighted ? 'true' : undefined}
                {...menuRowFrame}
                gap="$2.5"
                paddingVertical="$2"
                minHeight={ROW_MIN_HEIGHT}
                cursor="pointer"
                backgroundColor={highlighted ? '$accentBackground' : 'transparent'}
                hoverStyle={{
                  backgroundColor: highlighted ? '$accentBackground' : '$color3',
                }}
                pressStyle={{ backgroundColor: '$accentBackground' }}
                onPress={() => {
                  onActivate(item);
                }}
                onMouseEnter={() => {
                  onHighlight(index);
                }}>
                {/* LC-08: one uniform leading media slot */}
                <XStack
                  width="$1"
                  justifyContent="center"
                  flexShrink={0}>
                  <Icon
                    size={16}
                    color={highlighted && onAccent ? onAccent : undefined}
                  />
                </XStack>
                <YStack
                  flex={1}
                  minWidth={0}>
                  <HighlightedText
                    text={item.label}
                    query={query}
                    color={ink}
                    fontSize="$3"
                  />
                  {item.description ? (
                    <HighlightedText
                      text={item.description}
                      query={query}
                      color={muted}
                      fontSize="$2"
                      opacity={highlighted ? 0.8 : 1}
                    />
                  ) : null}
                </YStack>
                {item.badge ? (
                  <XStack
                    borderWidth={1}
                    borderColor={highlighted && onAccent ? onAccent : '$borderColor'}
                    borderRadius="$2"
                    paddingHorizontal="$1.5"
                    paddingVertical="$1"
                    flexShrink={0}
                    opacity={highlighted ? 0.9 : 1}>
                    <Text
                      fontSize="$1"
                      color={highlighted && onAccent ? onAccent : '$color10'}
                      {...knobProps.body}>
                      {item.badge}
                    </Text>
                  </XStack>
                ) : null}
              </XStack>
            );
          })}
        </YStack>
      ))}

      {hasQuery && searching && (
        <XStack
          alignItems="center"
          gap="$2.5"
          paddingHorizontal="$3"
          paddingVertical="$2">
          <Spinner
            size="small"
            color="$color10"
          />
          <Text
            fontSize="$2"
            color="$color10"
            {...knobProps.body}>
            {t('awesomebar.searching', 'Searching…')}
          </Text>
        </XStack>
      )}

      {noResults && (
        <XStack
          paddingHorizontal="$3"
          paddingVertical="$3">
          <Text
            fontSize="$2"
            color="$color10"
            {...knobProps.body}>
            {t('awesomebar.noResults', {
              defaultValue: 'No results for “{{query}}”',
              query: model.query,
            })}
          </Text>
        </XStack>
      )}

      {!hasQuery && sections.length === 0 && (
        <XStack
          paddingHorizontal="$3"
          paddingVertical="$3">
          <Text
            fontSize="$2"
            color="$color10"
            {...knobProps.body}>
            {t('awesomebar.empty', 'Type to search…')}
          </Text>
        </XStack>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Footer hint bar (overlay container only — keyboard hints, DG discoverable)
// ---------------------------------------------------------------------------

function KeyCap({ label }: { label: string }) {
  return (
    <XStack
      borderWidth={1}
      borderColor="$borderColor"
      backgroundColor="$color2"
      borderRadius="$2"
      paddingHorizontal="$1.5"
      justifyContent="center">
      <SizableText
        size="$1"
        fontWeight="600"
        color="$color11">
        {label}
      </SizableText>
    </XStack>
  );
}

function PaletteFooter() {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  return (
    <XStack
      alignItems="center"
      gap="$3"
      paddingHorizontal="$3"
      paddingVertical="$2"
      borderTopWidth={1}
      borderTopColor="$borderColor">
      <XStack
        alignItems="center"
        gap="$1.5">
        <KeyCap label="↑↓" />
        <SizableText
          size="$1"
          color="$color10">
          {t('awesomebar.hintNavigate', 'navigate')}
        </SizableText>
      </XStack>
      <XStack
        alignItems="center"
        gap="$1.5">
        <KeyCap label="↵" />
        <SizableText
          size="$1"
          color="$color10">
          {t('awesomebar.hintOpen', 'open')}
        </SizableText>
      </XStack>
      <XStack
        alignItems="center"
        gap="$1.5">
        <KeyCap label="esc" />
        <SizableText
          size="$1"
          color="$color10">
          {t('awesomebar.hintClose', 'close')}
        </SizableText>
      </XStack>
    </XStack>
  );
}
