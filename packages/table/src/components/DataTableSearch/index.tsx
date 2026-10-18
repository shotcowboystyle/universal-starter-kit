import { SlidersHorizontalIcon } from '@phosphor-icons/react';
import { Button, Checkbox, FloatingPanel, SearchInput, formCommonColors } from '@repo/forms';
import { sizeRecipeForToken, useResolvedKnobs } from '@repo/theme';
import type React from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Separator, Text, View, XStack, YStack, isWeb } from 'tamagui';

import { t } from '../../shared/t';
import { bidiIsolate } from '../../utils/with-interp';
import { useDataTableState } from '../DataTable/data-table-state-context';

export interface SearchOptions {
  searchTerm: string;
  columns: string[];
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  highlightResults: boolean;
}

export interface DataTableSearchProps<T = unknown> {
  data?: T[];
  columns?: {
    accessorKey?: string;
    header?: string;
    id?: string;
    searchable?: boolean;
  }[];
  onSearchResults?: (results: T[], searchOptions: SearchOptions) => void;
  onHighlightText?: (text: string) => void;
  placeholder?: string;
  debounceMs?: number;
  showAdvancedOptions?: boolean;
  defaultSearchColumns?: string[];
  disabled?: boolean;
}

const escapeRegex = (string: string): string => string.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

interface CompiledPattern {
  regex: RegExp | null;
  invalid: boolean;
}

const compileSearchPattern = (
  options: Pick<SearchOptions, 'searchTerm' | 'caseSensitive' | 'wholeWord' | 'regex'>,
): CompiledPattern => {
  const { searchTerm, caseSensitive, wholeWord, regex } = options;
  if (!searchTerm.trim()) {
    return { regex: null, invalid: false };
  }

  const flags = caseSensitive ? '' : 'i';
  try {
    if (regex) {
      return { regex: new RegExp(searchTerm, flags), invalid: false };
    }
    const pattern = wholeWord ? `\\b${escapeRegex(searchTerm)}\\b` : escapeRegex(searchTerm);
    return { regex: new RegExp(pattern, flags), invalid: false };
  } catch {
    return { regex: null, invalid: true };
  }
};

const matchRows = <T,>(data: T[], columns: string[], searchPattern: RegExp): T[] =>
  data.filter((item) =>
    columns.some((columnKey) => {
      // SAFETY: rows are arbitrary consumer records keyed by column accessor; a missing key reads as undefined and is skipped below
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- row shape is the consumer's generic T; there is no parse boundary for table data
      const value = (item as Record<string, unknown>)[columnKey];
      if (value == null) {
        return false;
      }
      searchPattern.lastIndex = 0;
      // oxlint-disable-next-line typescript/no-base-to-string -- cell values are arbitrary row data; String() is the intended match text
      return searchPattern.test(String(value));
    }),
  );

const performSearch = <T,>(data: T[], options: SearchOptions): T[] => {
  const compiled = compileSearchPattern(options);
  if (!options.searchTerm.trim()) {
    return data;
  }
  if (compiled.invalid || !compiled.regex) {
    return [];
  }
  return matchRows(data, options.columns, compiled.regex);
};

interface SearchOptionsPanelProps {
  searchOptions: SearchOptions;
  onOptionsChange: (options: Partial<SearchOptions>) => void;
  columns: {
    accessorKey?: string;
    header?: string;
    id?: string;
    searchable?: boolean;
  }[];
  selectedColumnCount: number;
  totalColumnCount: number;
  disabled: boolean;
  iconPx: number;
  optionsActive: boolean;
}

const SearchOptionsPanel = ({
  searchOptions,
  onOptionsChange,
  columns,
  selectedColumnCount,
  totalColumnCount,
  disabled,
  iconPx,
  optionsActive,
}: SearchOptionsPanelProps) => {
  const { knobProps } = useResolvedKnobs();
  const [open, setOpen] = useState(false);

  const handleColumnToggle = (columnKey: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...searchOptions.columns, columnKey])]
      : searchOptions.columns.filter((key) => key !== columnKey);
    onOptionsChange({ columns: next });
  };

  const selectedColumns = new Set(searchOptions.columns);

  const handleSelectAllColumns = () => {
    onOptionsChange({ columns: columns.map((col) => col.accessorKey ?? col.id ?? '') });
  };

  const handleSelectNoColumns = () => {
    onOptionsChange({ columns: [] });
  };

  const trigger = (
    <Button
      size={knobProps.sizeToken}
      accent={optionsActive}
      icon={
        <SlidersHorizontalIcon
          size={iconPx}
          weight={optionsActive ? 'fill' : 'regular'}
        />
      }
      disabled={disabled}
      aria-label={t('Search options')}
      aria-expanded={open}
      aria-haspopup="dialog"
    />
  );

  return (
    <FloatingPanel
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      triggerSizing="content"
      widthMode="fit-content"
      disabled={disabled}
      scrollable>
      <YStack
        {...knobProps.gapLg}
        minWidth={280}
        data-dismiss-class="compose">
        <Text
          {...knobProps.heading}
          {...knobProps.label}
          fontWeight="400">
          {t('Search Options')}
        </Text>

        <YStack {...knobProps.gap}>
          <Text
            {...knobProps.label}
            fontWeight="400">
            {t('Search Settings')}
          </Text>

          <Checkbox
            compact
            label={t('Case sensitive')}
            checked={searchOptions.caseSensitive}
            onChange={(checked) => {
              onOptionsChange({ caseSensitive: checked === true });
            }}
          />

          <Checkbox
            compact
            label={t('Whole word only')}
            checked={searchOptions.wholeWord}
            onChange={(checked) => {
              onOptionsChange({ wholeWord: checked === true });
            }}
          />

          <Checkbox
            compact
            label={t('Use regex')}
            checked={searchOptions.regex}
            onChange={(checked) => {
              onOptionsChange({ regex: checked === true });
            }}
          />

          <Checkbox
            compact
            label={t('Highlight results')}
            checked={searchOptions.highlightResults}
            onChange={(checked) => {
              onOptionsChange({ highlightResults: checked === true });
            }}
          />
        </YStack>

        <Separator />

        <YStack {...knobProps.gap}>
          <XStack
            justifyContent="space-between"
            alignItems="center">
            <Text
              {...knobProps.label}
              fontWeight="400">
              {t('Search Columns')}
            </Text>
            <Text
              {...knobProps.label}
              color={formCommonColors.muted}>
              {bidiIsolate(
                t('{{selected}} of {{total}}', {
                  selected: selectedColumnCount,
                  total: totalColumnCount,
                }),
              )}
            </Text>
          </XStack>

          <XStack {...knobProps.gap}>
            <Button
              size="$2"
              compact
              onPress={handleSelectAllColumns}>
              {t('All')}
            </Button>
            <Button
              size="$2"
              compact
              onPress={handleSelectNoColumns}>
              {t('None')}
            </Button>
          </XStack>

          <YStack gap="$1">
            {columns.map((col) => {
              const key = col.accessorKey ?? col.id ?? '';
              return (
                <Checkbox
                  key={key}
                  compact
                  label={col.header ?? key}
                  checked={selectedColumns.has(key)}
                  onChange={(checked) => {
                    handleColumnToggle(key, checked === true);
                  }}
                />
              );
            })}
          </YStack>
        </YStack>
      </YStack>
    </FloatingPanel>
  );
};

// Search glyphs are control-internal icons (LC-75/LC-79): the generated
// recipe's icon channel — no handwritten per-token px map.
const iconSizeForToken = (token: string): number => sizeRecipeForToken(token).iconSize;

const EMPTY_ROWS: never[] = [];

// role="search" is a valid ARIA landmark role but outside RN's `Role` union;
// this web-only bag forwards it to the DOM node.
// oxlint-disable-next-line anti-slop/no-known-value-widening -- the open record keeps `role` out of tamagui's RN Role prop check
const SEARCH_LANDMARK_PROPS: Record<string, string> = { role: 'search' };

const searchMaxWidthForToken = (token: string): number => {
  if (token === '$3') {
    return 320;
  }
  if (token === '$5') {
    return 480;
  }
  return 400;
};

// oxlint-disable-next-line eslint/complexity -- the branches are prop defaults, optional callbacks and status rendering
export const DataTableSearch = <T = unknown,>(props: DataTableSearchProps<T>) => {
  const ctx = useDataTableState();

  // SAFETY: without a `data` prop the search runs over the table context's filtered rows, which are the same T rows
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the context stores rows untyped; T is the caller's row type
  const data = props.data ?? (ctx?.computed.filteredData as T[]) ?? EMPTY_ROWS;
  const columns = props.columns ?? [];

  const {
    onSearchResults,
    onHighlightText,
    placeholder = t('Search across all columns...'),
    debounceMs = 300,
    showAdvancedOptions = true,
    defaultSearchColumns,
    disabled = false,
  } = props;

  const { knobProps } = useResolvedKnobs();
  const sz = knobProps.sizeToken;
  const searchMaxWidth = searchMaxWidthForToken(sz);
  const iconPx = iconSizeForToken(sz);
  const resultsId = useId();
  const rootRef = useRef<HTMLElement | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    searchTerm: '',
    columns: defaultSearchColumns ?? columns.map((col) => col.accessorKey ?? col.id ?? ''),
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    highlightResults: true,
  });

  const compiled = useMemo(
    () => compileSearchPattern({ ...searchOptions, searchTerm: debouncedSearchTerm }),
    [searchOptions, debouncedSearchTerm],
  );

  const results = useMemo(() => {
    if (!debouncedSearchTerm.trim()) {
      return data;
    }
    if (compiled.invalid || !compiled.regex) {
      return [];
    }
    return matchRows(data, searchOptions.columns, compiled.regex);
  }, [data, debouncedSearchTerm, compiled, searchOptions.columns]);

  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent -- onSearchResults is the public notify-after-debounce contract
    onSearchResults?.(results, {
      ...searchOptions,
      searchTerm: debouncedSearchTerm,
    });
  }, [results, searchOptions, debouncedSearchTerm, onSearchResults]);

  useEffect(() => {
    if (!onHighlightText) {
      return;
    }
    if (searchOptions.highlightResults && debouncedSearchTerm.trim() && !compiled.invalid) {
      // oxlint-disable-next-line react-doctor/no-pass-live-state-to-parent -- onHighlightText is the public notify-after-debounce contract
      onHighlightText(debouncedSearchTerm);
    } else {
      onHighlightText('');
    }
  }, [debouncedSearchTerm, searchOptions.highlightResults, compiled.invalid, onHighlightText]);

  useEffect(() => {
    if (!isWeb || disabled) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const onKey = (e: KeyboardEvent) => {
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;
      if (e.key !== '/' || hasModifier || e.isComposing) {
        return;
      }
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable=true]')) {
        return;
      }
      e.preventDefault();
      const field = rootRef.current?.querySelector?.<HTMLElement>("[role='searchbox']");
      field?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [disabled]);

  const handleOptionsChange = (newOptions: Partial<SearchOptions>) => {
    setSearchOptions((prev) => ({ ...prev, ...newOptions }));
  };

  const searchableColumns = columns.filter((col) => col.searchable !== false);
  const selectedColumnCount = searchOptions.columns.length;
  const totalColumnCount = searchableColumns.length;
  const matchModifiersActive = searchOptions.caseSensitive || searchOptions.wholeWord || searchOptions.regex;
  const optionsActive =
    matchModifiersActive || !searchOptions.highlightResults || selectedColumnCount !== totalColumnCount;
  const isSearching = searchTerm !== debouncedSearchTerm;
  const showStatus = Boolean(debouncedSearchTerm.trim());

  return (
    <XStack
      // SAFETY: on web XStack renders a DOM element, which is what rootRef holds; native never reads it (the effect is web-only)
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tamagui's ref type is the RN view instance, not the DOM node
      ref={rootRef as never}
      {...SEARCH_LANDMARK_PROPS}
      aria-busy={isSearching || undefined}
      {...knobProps.gap}
      alignItems="center"
      flex={1}
      maxWidth={searchMaxWidth}>
      {/* LC-71: SearchInput is the whole search box — ring lives on its
          Input.Box (magnifier + field + clear). Do not fork or wrap the
          field in extra chrome that would split that boundary. */}
      <View
        flex={1}
        minWidth={0}>
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          onSearch={setDebouncedSearchTerm}
          debounceMs={debounceMs}
          placeholder={placeholder}
          disabled={disabled}
          size={sz}
          aria-label={t('Search table')}
          inputProps={{
            'aria-describedby': showStatus ? resultsId : undefined,
            'aria-keyshortcuts': '/',
            'aria-invalid': compiled.invalid || undefined,
          }}
        />
      </View>

      {showAdvancedOptions && (
        <SearchOptionsPanel
          searchOptions={searchOptions}
          onOptionsChange={handleOptionsChange}
          columns={searchableColumns}
          selectedColumnCount={selectedColumnCount}
          totalColumnCount={totalColumnCount}
          disabled={disabled}
          iconPx={iconPx}
          optionsActive={optionsActive}
        />
      )}

      {showStatus ? (
        <Text
          id={resultsId}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- tamagui Text is the cross-platform primitive (no native <output> on RN); role supplies the live-region semantics
          role="status"
          aria-live="polite"
          aria-atomic="true"
          {...knobProps.label}
          color={compiled.invalid ? formCommonColors.error : formCommonColors.muted}
          flexShrink={0}>
          {compiled.invalid
            ? t('Invalid regex')
            : bidiIsolate(
                t('{{shown}} of {{total}}', {
                  shown: results.length,
                  total: data.length,
                }),
              )}
        </Text>
      ) : null}
    </XStack>
  );
};

export interface HighlightOptions {
  searchTerm: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  highlightClassName?: string;
  highlightStyle?: React.CSSProperties;
}

const highlightText = (text: string, options: HighlightOptions): React.ReactNode => {
  const {
    searchTerm,
    caseSensitive = false,
    wholeWord = false,
    regex = false,
    highlightClassName = 'search-highlight',
  } = options;

  if (!searchTerm.trim() || !text) {
    return text;
  }

  const compiled = compileSearchPattern({
    searchTerm,
    caseSensitive,
    wholeWord,
    regex,
  });
  if (!compiled.regex) {
    return text;
  }

  const global = new RegExp(compiled.regex.source, compiled.regex.flags.includes('i') ? 'gi' : 'g');
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(global)) {
    const start = match.index ?? 0;
    if (start > last) {
      parts.push(text.slice(last, start));
    }
    parts.push(
      <Text
        key={`highlight-${start}`}
        className={highlightClassName}
        backgroundColor="$yellow3"
        paddingHorizontal="$1"
        borderRadius="$1"
        fontWeight="bold">
        {match[0]}
      </Text>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts.length ? parts : text;
};

export interface UseFullTextSearchOptions<T = unknown> {
  data: T[];
  columns: {
    accessorKey?: string;
    header?: string;
    id?: string;
    searchable?: boolean;
  }[];
  debounceMs?: number;
  defaultSearchColumns?: string[];
}

export interface UseFullTextSearchReturn<T = unknown> {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResults: T[];
  searchOptions: SearchOptions;
  setSearchOptions: React.Dispatch<React.SetStateAction<SearchOptions>>;
  isSearching: boolean;
  clearSearch: () => void;
  highlightText: (text: string) => React.ReactNode;
}

export const useFullTextSearch = <T = unknown,>({
  data,
  columns,
  debounceMs = 300,
  defaultSearchColumns,
}: UseFullTextSearchOptions<T>): UseFullTextSearchReturn<T> => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    searchTerm: '',
    columns: defaultSearchColumns ?? columns.map((col) => col.accessorKey ?? col.id ?? ''),
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    highlightResults: true,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [searchTerm, debounceMs]);

  const searchResults = useMemo(() => {
    if (!debouncedSearchTerm.trim()) {
      return data;
    }

    return performSearch(data, {
      ...searchOptions,
      searchTerm: debouncedSearchTerm,
    });
  }, [data, debouncedSearchTerm, searchOptions]);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
  }, []);

  const highlightTextFunction = useCallback(
    // oxlint-disable-next-line typescript/promise-function-async -- React 19's ReactNode union includes a Promise; this callback is synchronous
    (text: string) => {
      if (!searchOptions.highlightResults || !debouncedSearchTerm.trim()) {
        return text;
      }

      return highlightText(text, {
        searchTerm: debouncedSearchTerm,
        caseSensitive: searchOptions.caseSensitive,
        wholeWord: searchOptions.wholeWord,
        regex: searchOptions.regex,
      });
    },
    [debouncedSearchTerm, searchOptions],
  );

  return {
    searchTerm,
    setSearchTerm,
    searchResults,
    searchOptions,
    setSearchOptions,
    isSearching: debouncedSearchTerm !== searchTerm,
    clearSearch,
    highlightText: highlightTextFunction,
  };
};
