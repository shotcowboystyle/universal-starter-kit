/**
 * DataTableContext - styled context for DataTable compound component.
 *
 * Shares variant props (size, compact) across the compound tree
 * so sub-components render with consistent sizing without prop drilling.
 */

import { createStyledContext } from 'tamagui';

export const DataTableContext = createStyledContext<{
  size: 'sm' | 'md' | 'lg';
  compact: boolean;
}>({
  size: 'md',
  compact: false,
});
