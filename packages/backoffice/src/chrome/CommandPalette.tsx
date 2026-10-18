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
import { SearchInput } from '@repo/forms';
import { addToRecent } from '@repo/frappe-ui';
import { menuRowFrame, useLayoutSizeClass, useReadableTextOn, useResolvedKnobs } from '@repo/theme';
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

/** Selected-row fill (LC-71 SELECTED channel). */
const ACCENT_BACKGROUND = '$accentBackground';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Match highlighting (Linear / Spotlight: bold the matched run)
// ---------------------------------------------------------------------------

const HighlightedText = ({
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
}) => {
  const { knobProps } = useResolvedKnobs();
  const indices = query ? matchQueryIndices(query, text) : [];
  const matchSet = new Set(indices);
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
};

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

const PaletteResults = ({ model, highlight, onHighlight, onActivate, itemNodesRef }: PaletteResultsProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  // LC-71 SELECTED channel: the roving highlight is fill, never a ring
  // (combobox focus stays on the search input). Accent + readable ink
  // (LC-05) so selected + unselected stay one emphasis system.
  const onAccent = useReadableTextOn(ACCENT_BACKGROUND);
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
            // oxlint-disable-next-line react/immutability -- render-local running index across sections, reset every render
            flatIndex += 1;
            const index = flatIndex;
            const highlighted = index === highlight;
            const Icon = item.icon;
            const accentInk = highlighted && onAccent !== undefined && onAccent !== '' ? onAccent : undefined;
            const ink = accentInk ?? '$color12';
            const muted = accentInk ?? '$color10';
            return (
              <XStack
                key={item.id}
                id={optionId(index)}
                ref={
                  // SAFETY: the node is only stored (web element / native view) and read back by the scroll effect.
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unknown-parameters -- see SAFETY above
                  ((node: unknown) => {
                    itemNodesRef.current[index] = node;
                  }) as never
                }
                // SAFETY: Tamagui's role union lacks "option"; web renders the ARIA role verbatim.
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
                role={'option' as 'listitem'}
                aria-selected={highlighted}
                data-highlighted={highlighted ? 'true' : undefined}
                {...menuRowFrame}
                gap="$2.5"
                paddingVertical="$2"
                minHeight={ROW_MIN_HEIGHT}
                cursor="pointer"
                backgroundColor={highlighted ? ACCENT_BACKGROUND : 'transparent'}
                hoverStyle={{
                  backgroundColor: highlighted ? ACCENT_BACKGROUND : '$color3',
                }}
                pressStyle={{ backgroundColor: ACCENT_BACKGROUND }}
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
                    color={accentInk}
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
                  {item.description !== undefined && item.description !== '' ? (
                    <HighlightedText
                      text={item.description}
                      query={query}
                      color={muted}
                      fontSize="$2"
                      opacity={highlighted ? 0.8 : 1}
                    />
                  ) : null}
                </YStack>
                {item.badge !== undefined && item.badge !== '' ? (
                  <XStack
                    borderWidth={1}
                    borderColor={accentInk ?? '$borderColor'}
                    borderRadius="$2"
                    paddingHorizontal="$1.5"
                    paddingVertical="$1"
                    flexShrink={0}
                    opacity={highlighted ? 0.9 : 1}>
                    <Text
                      fontSize="$1"
                      color={accentInk ?? '$color10'}
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
};

// ---------------------------------------------------------------------------
// Footer hint bar (overlay container only — keyboard hints, DG discoverable)
// ---------------------------------------------------------------------------

const KeyCap = ({ label }: { label: string }) => (
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

const PaletteFooter = () => {
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
};

// oxlint-disable-next-line react-doctor/no-giant-component -- one palette state machine (focus capture, roving highlight, commit) shared by both containers
export const CommandPalette = ({ open, onOpenChange }: CommandPaletteProps) => {
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
  // oxlint-disable-next-line react/refs -- D-22 render-phase capture: focus must be read before the overlay mounts and steals it
  if (open && !wasOpenRef.current && isWeb && typeof document !== 'undefined') {
    // oxlint-disable-next-line react/refs -- see D-22 above
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  // oxlint-disable-next-line react/refs -- see D-22 above
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
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
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
    // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-adjust-state-on-prop-change -- streamed results arrive from the model; clamping on render would fight the roving highlight's own updates
    setHighlight((current) => (current < items.length ? current : 0));
  }, [items]);

  // Keep the keyboard-highlighted row scrolled into view (web).
  // oxlint-disable-next-line react-doctor/no-effect-chain -- scrolling is a DOM side effect, not derived state
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    // SAFETY: on web the row ref callbacks store DOM elements (or null on unmount).
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
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
    // oxlint-disable-next-line eslint/complexity -- one flat key switch (roving highlight, commit, dismiss, tab trap)
    (event: { key?: string; nativeEvent?: { key?: string }; preventDefault?: () => void }) => {
      const key = event.key ?? event.nativeEvent?.key;
      // SAFETY: on web the input forwards the DOM KeyboardEvent; native events lack the modifier flags, which read falsy.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see SAFETY above
      const native = event as unknown as KeyboardEvent;
      const withMod = native.metaKey || native.ctrlKey;
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
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
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
    // oxlint-disable-next-line react-doctor/prefer-use-effect-event -- `close` is a stable useCallback; re-subscribing only happens when onOpenChange changes
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

  const activeOptionId = highlight < items.length ? optionId(highlight) : undefined;

  // SAFETY: SearchInput's inputProps type omits the DOM combobox ARIA attributes the web input accepts.
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
          // SAFETY: Tamagui's role union lacks "listbox"; web renders the ARIA role verbatim.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
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
              // SAFETY: Tamagui's role union lacks "listbox"; web renders the ARIA role verbatim.
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
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
};
