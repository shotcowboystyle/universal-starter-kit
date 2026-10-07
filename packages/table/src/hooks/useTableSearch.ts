import { useState } from 'react';

export interface TableSearchOptions {
  searchTerm: string;
  columns: string[];
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  highlightResults: boolean;
}

export interface UseTableSearchOptions<T = any> {
  data?: T[];
  columns?: {
    accessorKey?: string;
    header?: string;
    id?: string;
    searchable?: boolean;
  }[];
  debounceMs?: number;
  defaultSearchColumns?: string[];
}

export interface UseTableSearchReturn {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchOptions: TableSearchOptions;
  setSearchOptions: React.Dispatch<React.SetStateAction<TableSearchOptions>>;
}

export function useTableSearch<T = any>({
  columns = [],
  defaultSearchColumns,
}: UseTableSearchOptions<T> = {}): UseTableSearchReturn {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<TableSearchOptions>({
    searchTerm: '',
    columns: defaultSearchColumns ?? columns.map((col) => col.accessorKey ?? col.id ?? ''),
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    highlightResults: true,
  });

  return {
    searchQuery,
    setSearchQuery,
    searchOptions,
    setSearchOptions,
  };
}
