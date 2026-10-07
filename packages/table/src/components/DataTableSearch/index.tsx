import { Button, Checkbox, FloatingPanel, SearchInput, formCommonColors } from '@repo/forms';
import { sizeRecipeForToken, useResolvedKnobs } from '@repo/theme';
import { SlidersHorizontalIcon } from '@phosphor-icons/react';
import type React from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Separator, Text, View, XStack, YStack, isWeb } from 'tamagui';

import { t } from '../../shared/t';
import { bidiIsolate } from '../../utils/withInterp';
import { useDataTableState } from '../DataTable/DataTableStateContext';

export interface SearchOptions {
  searchTerm: string;
  columns: string[];
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  highlightResults: boolean;
}

export interface DataTableSearchProps<T = any> {
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

// Search glyphs are control-internal icons (LC-75/LC-79): the generated
// recipe's icon channel — no handwritten per-token px map.
const iconSizeForToken = (token: string): number => sizeRecipeForToken(token).iconSize;

export function DataTableSearch<T = any>(props: DataTableSearchProps<T>) {
  const ctx = useDataTableState();

  const data = props.data ?? (ctx?.computed.filteredData as T[]) ?? [];
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
  const searchMaxWidth = sz === '$3' ? 320 : sz === '$5' ? 480 : 400;
  const iconPx = iconSizeForToken(String(sz));
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
    onSearchResults?.(results, {
      ...searchOptions,
      searchTerm: debouncedSearchTerm,
    });
  }, [results, data, searchOptions, debouncedSearchTerm, onSearchResults]);

  useEffect(() => {
    if (!onHighlightText) {
      return;
    }
    if (searchOptions.highlightResults && debouncedSearchTerm.trim() && !compiled.invalid) {
      onHighlightText(debouncedSearchTerm);
    } else {
      onHighlightText('');
    }
  }, [debouncedSearchTerm, searchOptions.highlightResults, compiled.invalid, onHighlightText]);

  useEffect(() => {
    if (!isWeb || disabled) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable=true]')) {
        return;
      }
      e.preventDefault();
      const field = rootRef.current?.querySelector?.("[role='searchbox']") as HTMLElement | null;
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
  const optionsActive =
    searchOptions.caseSensitive ||
    searchOptions.wholeWord ||
    searchOptions.regex ||
    !searchOptions.highlightResults ||
    selectedColumnCount !== totalColumnCount;
  const isSearching = searchTerm !== debouncedSearchTerm;
  const showStatus = Boolean(debouncedSearchTerm.trim());

  return (
    <XStack
      ref={rootRef as never}
      // role="search" is a valid ARIA landmark role but outside RN's `Role`
      // union; this web-only bag forwards it to the DOM node (house Record
      // cast).
      {...({ role: 'search' } as Record<string, unknown>)}
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
}

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

function SearchOptionsPanel({
  searchOptions,
  onOptionsChange,
  columns,
  selectedColumnCount,
  totalColumnCount,
  disabled,
  iconPx,
  optionsActive,
}: SearchOptionsPanelProps) {
  const { knobProps } = useResolvedKnobs();
  const [open, setOpen] = useState(false);

  const handleColumnToggle = (columnKey: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...searchOptions.columns, columnKey])]
      : searchOptions.columns.filter((key) => key !== columnKey);
    onOptionsChange({ columns: next });
  };

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
            onCheckedChange={(checked) => {
              onOptionsChange({ caseSensitive: checked as boolean });
            }}
          />

          <Checkbox
            compact
            label={t('Whole word only')}
            checked={searchOptions.wholeWord}
            onCheckedChange={(checked) => {
              onOptionsChange({ wholeWord: checked as boolean });
            }}
          />

          <Checkbox
            compact
            label={t('Use regex')}
            checked={searchOptions.regex}
            onCheckedChange={(checked) => {
              onOptionsChange({ regex: checked as boolean });
            }}
          />

          <Checkbox
            compact
            label={t('Highlight results')}
            checked={searchOptions.highlightResults}
            onCheckedChange={(checked) => {
              onOptionsChange({ highlightResults: checked as boolean });
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
                  checked={searchOptions.columns.includes(key)}
                  onCheckedChange={(checked) => {
                    handleColumnToggle(key, checked as boolean);
                  }}
                />
              );
            })}
          </YStack>
        </YStack>
      </YStack>
    </FloatingPanel>
  );
}

interface CompiledPattern {
  regex: RegExp | null;
  invalid: boolean;
}

function compileSearchPattern(
  options: Pick<SearchOptions, 'searchTerm' | 'caseSensitive' | 'wholeWord' | 'regex'>,
): CompiledPattern {
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
}

function matchRows<T>(data: T[], columns: string[], searchPattern: RegExp): T[] {
  return data.filter((item) =>
    columns.some((columnKey) => {
      const value = (item as Record<string, unknown>)[columnKey];
      if (value == null) {
        return false;
      }
      searchPattern.lastIndex = 0;
      return searchPattern.test(String(value));
    }),
  );
}

function performSearch<T>(data: T[], options: SearchOptions): T[] {
  const compiled = compileSearchPattern(options);
  if (!options.searchTerm.trim()) {
    return data;
  }
  if (compiled.invalid || !compiled.regex) {
    return [];
  }
  return matchRows(data, options.columns, compiled.regex);
}

function escapeRegex(string: string): string {
  return string.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface HighlightOptions {
  searchTerm: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  highlightClassName?: string;
  highlightStyle?: React.CSSProperties;
}

function highlightText(text: string, options: HighlightOptions): React.ReactNode {
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
  let index = 0;
  for (const match of text.matchAll(global)) {
    const start = match.index ?? 0;
    if (start > last) {
      parts.push(text.slice(last, start));
    }
    parts.push(
      <Text
        key={`highlight-${index}`}
        className={highlightClassName}
        backgroundColor="$yellow3"
        paddingHorizontal="$1"
        borderRadius="$1"
        fontWeight="bold">
        {match[0]}
      </Text>,
    );
    last = start + match[0].length;
    index += 1;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts.length ? parts : text;
}

export interface UseFullTextSearchOptions<T = any> {
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

export interface UseFullTextSearchReturn<T = any> {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResults: T[];
  searchOptions: SearchOptions;
  setSearchOptions: React.Dispatch<React.SetStateAction<SearchOptions>>;
  isSearching: boolean;
  clearSearch: () => void;
  highlightText: (text: string) => React.ReactNode;
}

export function useFullTextSearch<T = any>({
  data,
  columns,
  debounceMs = 300,
  defaultSearchColumns,
}: UseFullTextSearchOptions<T>): UseFullTextSearchReturn<T> {
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
}
