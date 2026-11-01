import { Combobox } from '@repo/forms';
import type { ComboboxOption } from '@repo/forms';
/**
 * Frappe Link field: a backend-searching combobox over a target DocType,
 * or TreeSelect when that DocType is a tree (Account, Item Group, Territory).
 *
 * Combobox path — stock Frappe data:
 * - each (debounced) keystroke hits `frappe.desk.search.search_link`
 * - opening with an empty query loads the first page
 * - an existing value resolves its display title via `get_link_title`
 *
 * Tree path — `useDocTypeMeta().is_tree` chooses TreeSelect (DG-CTRL-06
 * `control="combobox"` ejects back to Combobox).
 */
import { useDocTypeMeta, useLinkSearch, useLinkTitle } from '@repo/frappe';
import type { FrappeConnectionConfig } from '@repo/frappe';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { YStackProps } from 'tamagui';

import { useFrappeConfig } from '../FrappeProvider';

import { LinkTree } from './LinkTree';

export interface LinkProps extends Omit<YStackProps, 'children' | 'onChange'> {
  label?: string;
  value?: string;
  /** Canonical change handler (LC-14): fires with the picked document name. */
  onChange: (value: string) => void;
  /** Target DocType to search within */
  doctype: string;
  /** @deprecated The server resolves display titles (`get_link_title`). */
  displayField?: string;
  /** Restrict matching to one field (maps to `search_link`'s `searchfield`) */
  searchFields?: string[];
  /** Link filters applied server-side on top of the doctype's link query */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Frappe link filters map arbitrary fieldnames to filter values
  filters?: Record<string, unknown> | [string, string, unknown][];
  /** Offer a create affordance when the typed text matches nothing */
  allowCreate?: boolean;
  createRoute?: string;
  onCreateNew?: () => void;
  /** Render the server's ranked description under each result (stock Frappe). Default true. */
  showDescription?: boolean;
  /** @deprecated The server owns result descriptions (`search_link`). */
  descriptionField?: string;
  /** @deprecated No advanced-search surface in the combobox presentation. */
  showAdvancedSearch?: boolean;
  /** @deprecated No advanced-search surface in the combobox presentation. */
  onAdvancedSearch?: () => void;
  disabled?: boolean;
  required?: boolean;
  baseURL?: string;
  auth?: FrappeConnectionConfig['auth'];
  error?: string;
  helperText?: string;
  readOnly?: boolean;
  skeleton?: boolean;
  compact?: boolean;
  placeholder?: string;
  /** Results per page for the backend search (default 20) */
  pageLength?: number;
  /** Doctype of the form this link sits on (server `reference_doctype`, feeds link queries) */
  referenceDoctype?: string;
  /**
   * DG-CTRL-06 eject hatch. Tree doctypes render TreeSelect; pass
   * `"combobox"` to keep the search_link Combobox.
   */
  control?: 'combobox';
}

const useLinkConnection = (baseURL?: string, auth?: LinkProps['auth']) => {
  const config = useFrappeConfig();
  const finalBaseURL = baseURL ?? config?.baseURL ?? '';
  const connectionConfig: FrappeConnectionConfig | undefined = finalBaseURL
    ? {
        baseURL: finalBaseURL,
        realtime: config?.realtime,
        socketPort: config?.socketPort,
        auth: auth ?? config?.auth,
      }
    : undefined;
  return { config, connectionConfig };
};

const searchErrorStatus = (searchError: Error): number | undefined => {
  // SAFETY: HTTP failures carry the response status on the error; other errors leave the optional field absent
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const { status } = searchError as { status?: number };
  return status;
};

const LinkCombobox = ({
  label,
  value = '',
  onChange,
  doctype,
  // oxlint-disable-next-line typescript/no-deprecated -- destructured out so the deprecated prop never reaches the Combobox
  displayField: _displayField,
  searchFields,
  filters,
  allowCreate = false,
  createRoute: _createRoute,
  onCreateNew,
  showDescription = true,
  // oxlint-disable-next-line typescript/no-deprecated -- destructured out so the deprecated prop never reaches the Combobox
  descriptionField: _descriptionField,
  // oxlint-disable-next-line typescript/no-deprecated -- destructured out so the deprecated prop never reaches the Combobox
  showAdvancedSearch: _showAdvancedSearch,
  // oxlint-disable-next-line typescript/no-deprecated -- destructured out so the deprecated prop never reaches the Combobox
  onAdvancedSearch: _onAdvancedSearch,
  disabled = false,
  required = false,
  baseURL,
  auth,
  error,
  helperText,
  readOnly = false,
  skeleton = false,
  compact = false,
  placeholder,
  pageLength = 20,
  referenceDoctype,
  ...stackProps
}: LinkProps) => {
  const { t } = useTranslation();
  const { connectionConfig } = useLinkConnection(baseURL, auth);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const isLocked = disabled || readOnly;

  const {
    results,
    isLoading,
    error: searchError,
  } = useLinkSearch(connectionConfig, doctype, {
    query,
    searchFields,
    filters,
    limit: pageLength,
    enabled: open && !isLocked,
    allowEmptyQuery: true,
    debounceMs: 100,
    referenceDoctype,
  });

  const { title } = useLinkTitle(connectionConfig, doctype, value || undefined);

  const options = useMemo<ComboboxOption[]>(
    () =>
      results.map((result) => {
        const description = result.description ?? '';
        return {
          value: result.value,
          label: result.label,
          description: showDescription && description !== '' && description !== result.label ? description : undefined,
        };
      }),
    [results, showDescription],
  );

  const handleSearch = useCallback((next: string) => {
    setQuery(next);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery('');
    }
  }, []);

  const handleChange = useCallback(
    (next: string | string[]) => {
      if (isLocked) {
        return;
      }
      onChange(Array.isArray(next) ? (next[0] ?? '') : next);
    },
    [onChange, isLocked],
  );

  const handleCreate = useCallback(() => {
    onCreateNew?.();
  }, [onCreateNew]);

  const searchErrorText = useMemo(() => {
    if (!searchError) {
      return null;
    }
    const status = searchErrorStatus(searchError);
    if (status === 401 || status === 403) {
      return t("You don't have permission to search {{doctype}}", { doctype });
    }
    return t('Search failed');
  }, [searchError, doctype, t]);

  return (
    <Combobox
      options={options}
      value={value}
      onChange={handleChange}
      onSearch={handleSearch}
      loading={isLoading}
      searchError={searchErrorText ?? undefined}
      valueLabel={value ? (title ?? value) : undefined}
      clearable
      open={open}
      onOpenChange={handleOpenChange}
      label={label}
      placeholder={placeholder ?? t('Select {{doctype}}', { doctype })}
      searchPlaceholder={t('Search {{doctype}}', { doctype })}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      error={error}
      helperText={helperText}
      skeleton={skeleton}
      compact={compact}
      creatable={allowCreate && !!onCreateNew}
      onCreate={handleCreate}
      createLabel={t('Create new {{doctype}}', { doctype })}
      // SAFETY: the remaining YStack props are forwarded verbatim to the Combobox root stack
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- see SAFETY above
      {...(stackProps as Record<string, unknown>)}
    />
  );
};

export const Link = (props: LinkProps) => {
  const { connectionConfig } = useLinkConnection(props.baseURL, props.auth);
  const { meta } = useDocTypeMeta(connectionConfig, props.doctype);
  if ((meta?.is_tree ?? 0) !== 0 && props.control !== 'combobox') {
    return <LinkTree {...props} />;
  }
  return <LinkCombobox {...props} />;
};
