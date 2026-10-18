/**
 * Awesomebar - Global search bar for Frappe Desk.
 *
 * Features:
 * - Ctrl+K / Cmd+K keyboard shortcut to focus
 * - Debounced navigation search via useDocTypeSearch
 * - Document search via GET /api/method/frappe.utils.global_search.search
 * - Inline math evaluation for numeric expressions
 * - Command palette (settings, logout, etc.)
 * - Recent searches stored via platform storage adapter
 *
 * Refactored to use Combobox for consistent UX and accessibility.
 */

import { Combobox, formCommonColors } from '@repo/forms';
import type { ComboboxOption } from '@repo/forms';
import { useDocTypeSearch, HttpClient } from '@repo/frappe';
import type { FrappeConnectionConfig } from '@repo/frappe';
import { writeToClipboard } from '@repo/platform';
import { storage } from '@repo/store';
import { useResolvedKnobs } from '@repo/theme';
import { useHotkey } from '@tanstack/react-hotkeys';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, XStack, isWeb } from 'tamagui';
import type { XStackProps } from 'tamagui';

import { useFrappeConfig } from '../FrappeProvider';
import { createHttpClient } from '../formEngine/formActions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AwesomebarProps extends Omit<XStackProps, 'onPress'> {
  /** Called when user navigates to a result */
  onNavigate?: (path: string) => void;
  /** Base path for desk routes (default "/desk") */
  basePath?: string;
}

interface DocSearchResult {
  doctype: string;
  name: string;
  content: string;
}

interface RecentSearch {
  query: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const recentStorageKey = 'frappe-awesomebar-recent';
const maxRecent = 10;
const mathRegex = /^[\d\s+\-*/.()]+$/;

const commands: Record<string, string> = {
  settings: '/desk/settings',
  logout: '/logout',
  home: '/desk',
  help: '/desk/help',
};

// Value prefixes to encode result type
const prefix = {
  MATH: 'math:',
  COMMAND: 'cmd:',
  NAV: 'nav:',
  DOC: 'doc:',
} as const;

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function getRecentSearches(): Promise<RecentSearch[]> {
  try {
    const raw = await Promise.resolve(storage.getItem(recentStorageKey));
    return raw ? (JSON.parse(raw) as RecentSearch[]) : [];
  } catch {
    return [];
  }
}

async function addRecentSearch(query: string): Promise<void> {
  try {
    const recent = (await getRecentSearches()).filter((r) => r.query !== query);
    recent.unshift({ query, timestamp: Date.now() });
    await Promise.resolve(storage.setItem(recentStorageKey, JSON.stringify(recent.slice(0, maxRecent))));
  } catch {
    // storage unavailable
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function evaluateMath(expr: string): number | null {
  if (!mathRegex.test(expr.trim())) {
    return null;
  }
  try {
    const result = new Function(`return (${expr.trim()})`)() as unknown;
    if (typeof result === 'number' && Number.isFinite(result)) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

function matchingCommands(query: string): { label: string; path: string }[] {
  if (!query) {
    return [];
  }
  const lower = query.toLowerCase();
  return Object.entries(commands)
    .filter(([name]) => name.includes(lower))
    .map(([name, path]) => ({ label: name, path }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Awesomebar({ onNavigate, basePath = '/desk', ...stackProps }: AwesomebarProps) {
  const { t } = useTranslation();
  const { knobProps, control } = useResolvedKnobs();
  const config = useFrappeConfig();
  const [query, setQuery] = useState('');
  const [docResults, setDocResults] = useState<DocSearchResult[]>([]);
  const [docSearchLoading, setDocSearchLoading] = useState(false);

  // Navigation search via useDocTypeSearch. Memoized: a fresh config object
  // per render re-runs the hook's fetch effect per render (and loops when
  // the fetch fails, e.g. Guest 403 on the DocType list).
  const frappeConfig = useMemo<FrappeConnectionConfig | undefined>(
    () =>
      config
        ? {
            baseURL: config.baseURL,
            realtime: config.realtime,
            socketPort: config.socketPort,
            auth: config.auth,
          }
        : undefined,
    [config],
  );
  const { results: navResults, error: navError } = useDocTypeSearch(frappeConfig, query);

  // Limit navigation results
  const limitedNavResults = useMemo(() => navResults.slice(0, 15), [navResults]);

  // Math evaluation
  const mathResult = useMemo(() => (query ? evaluateMath(query) : null), [query]);

  // Command matching
  const matchedCommands = useMemo(() => matchingCommands(query), [query]);

  // HttpClient ref for document search
  const httpRef = useRef<HttpClient | undefined>(undefined);
  const configKeyRef = useRef('');
  if (config?.baseURL) {
    const key = `${config.baseURL}:${config.auth?.useToken ? 't' : ''}:${config.auth?.token ?? ''}:${config.auth?.type ?? ''}`;
    if (key !== configKeyRef.current) {
      httpRef.current = createHttpClient({
        baseURL: config.baseURL,
        auth: config.auth,
      });
      configKeyRef.current = key;
    }
  }

  // Build Combobox options from all result sources
  const options = useMemo<ComboboxOption[]>(() => {
    const opts: ComboboxOption[] = [];

    // Math result
    if (mathResult !== null) {
      opts.push({
        value: `${prefix.MATH}${mathResult}`,
        label: `= ${mathResult}`,
        group: t('Result'),
      });
    }

    // Commands
    for (const cmd of matchedCommands) {
      opts.push({
        value: `${prefix.COMMAND}${cmd.path}`,
        label: cmd.label,
        group: t('Commands'),
      });
    }

    // Navigation results
    for (const result of limitedNavResults) {
      const path =
        result.type === 'list'
          ? `${basePath}/${result.doctype}`
          : result.type === 'new'
            ? `${basePath}/${result.doctype}/new`
            : `${basePath}/${result.doctype}?view=report`;
      opts.push({
        value: `${prefix.NAV}${path}`,
        label: result.label,
        keywords: result.doctype,
        group: t('Navigation'),
      });
    }

    // Document results
    for (const result of docResults) {
      const path = `${basePath}/${result.doctype}/${result.name}`;
      opts.push({
        value: `${prefix.DOC}${path}`,
        label: result.name,
        keywords: `${result.doctype} ${result.content}`,
        group: t('Documents'),
      });
    }

    return opts;
  }, [mathResult, matchedCommands, limitedNavResults, docResults, basePath, t]);

  // Handle search for async document fetching
  const handleSearch = useCallback((searchQuery: string) => {
    setQuery(searchQuery);

    if (!searchQuery || !httpRef.current) {
      setDocResults([]);
      setDocSearchLoading(false);
      return;
    }

    setDocSearchLoading(true);
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const http = httpRef.current;
        if (!http || cancelled) {
          return;
        }

        const response = await http.get<{
          message?: {
            doctype: string;
            name: string;
            content: string;
          }[];
        }>('/api/method/frappe.utils.global_search.search', {
          text: searchQuery,
          start: 0,
          limit: 10,
        });

        if (cancelled) {
          return;
        }
        setDocResults(response.payload?.message ?? []);
      } catch {
        if (!cancelled) {
          setDocResults([]);
        }
      } finally {
        if (!cancelled) {
          setDocSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Handle selection - parse value prefix and navigate
  const handleValueChange = useCallback(
    (value: string | string[]) => {
      const selectedValue = Array.isArray(value) ? value[0] : value;
      if (!selectedValue) {
        return;
      }

      void addRecentSearch(query);

      if (selectedValue.startsWith(prefix.MATH)) {
        // Copy math result to clipboard
        const result = selectedValue.slice(prefix.MATH.length);
        writeToClipboard(result);
        return;
      }

      if (selectedValue.startsWith(prefix.COMMAND)) {
        const path = selectedValue.slice(prefix.COMMAND.length);
        onNavigate?.(path);
        return;
      }

      if (selectedValue.startsWith(prefix.NAV)) {
        const path = selectedValue.slice(prefix.NAV.length);
        onNavigate?.(path);
        return;
      }

      if (selectedValue.startsWith(prefix.DOC)) {
        const path = selectedValue.slice(prefix.DOC.length);
        onNavigate?.(path);
        return;
      }
    },
    [query, onNavigate],
  );

  // Keyboard shortcuts via @tanstack/react-hotkeys
  useHotkey(
    'Mod+K',
    () => {
      if (!isWeb || typeof document === 'undefined') {
        return;
      }
      const trigger = document.querySelector<HTMLElement>('[data-awesomebar-trigger]');
      trigger?.click();
    },
    { conflictBehavior: 'allow' },
  );

  // Height from the LC-65 size recipe (not a private px map). Combobox's
  // custom-trigger wrapper used to collapse Tamagui `height` — pin via style
  // + outer shell (SB-M-1703).
  const triggerHeight = knobProps.control.height;

  const renderTrigger = useCallback(
    (_selected: ComboboxOption | ComboboxOption[] | undefined, open: boolean) => (
      <XStack
        data-awesomebar-trigger
        width="100%"
        alignItems="center"
        cursor="text"
        backgroundColor={knobProps.inputBackground}
        {...knobProps.control}
        {...knobProps.inputSurface}
        {...knobProps.borderRadius}
        borderColor={open ? '$borderColorFocus' : '$borderColor'}
        hoverStyle={{
          borderColor: '$borderColorHover',
          ...control.hoverKnobProps,
        }}
        pressStyle={{ ...control.pressKnobProps }}
        focusVisibleStyle={{
          borderColor: '$borderColorFocus',
          ...control.focusVisibleKnobProps,
        }}
        // Inline style wins over flex-shrink collapse of the Combobox wrapper.
        style={{
          height: triggerHeight,
          minHeight: triggerHeight,
          maxHeight: triggerHeight,
          width: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
        }}>
        <Text
          flex={1}
          numberOfLines={1}
          color={formCommonColors.muted}
          {...knobProps.body}
          {...knobProps.controlType}>
          {t('Search or type a command...')}
        </Text>
        <View
          paddingHorizontal="$2"
          paddingVertical="$1"
          backgroundColor="$color3"
          {...knobProps.borderRadius}
          borderWidth={0}>
          <Text
            fontFamily="$mono"
            color={formCommonColors.muted}
            {...knobProps.controlType}
            {...knobProps.textWeight}>
            ⌘K
          </Text>
        </View>
      </XStack>
    ),
    [control, knobProps, t, triggerHeight],
  );

  return (
    <XStack
      data-awesomebar-root
      position="relative"
      flex={1}
      minWidth={0}
      height={triggerHeight}
      minHeight={triggerHeight}
      maxHeight={triggerHeight}
      alignItems="stretch"
      {...stackProps}>
      <Combobox
        options={options}
        onValueChange={handleValueChange}
        onSearch={handleSearch}
        loading={docSearchLoading}
        aria-label={t('Search or type a command')}
        placeholder={t('Search or type a command...')}
        searchPlaceholder={t('Search...')}
        emptyMessage={
          // The DocType catalog behind navigation search is permission-gated
          // (Guests get a 403): say so instead of a misleading "No results".
          query && navError
            ? t('Search unavailable -- are you logged in?')
            : query
              ? t('No results found.')
              : t('Type to search...')
        }
        trigger={renderTrigger}
        size={knobProps.sizeToken}
      />
    </XStack>
  );
}
