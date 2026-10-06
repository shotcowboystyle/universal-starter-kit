export type PaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

export type PaginationEllipsis = Exclude<PaginationItem, number>;

export const isEllipsis = (item: PaginationItem): item is PaginationEllipsis =>
  item === 'ellipsis-start' || item === 'ellipsis-end';

const range = (start: number, end: number) => Array.from({ length: Math.max(end - start + 1, 0) }, (_, i) => start + i);

/**
 * Ellipsis windowing for the numbered variant: always show the boundary
 * pages, the current page and its siblings, and collapse the gaps into
 * ellipses — e.g. total=20, page=5 → [1, …, 4, 5, 6, …, 20].
 */
export const getPaginationItems = (
  total: number,
  page: number,
  siblingCount = 1,
  boundaryCount = 1,
): PaginationItem[] => {
  if (total <= 0) {
    return [];
  }
  const startPages = range(1, Math.min(boundaryCount, total));
  const endPages = range(Math.max(total - boundaryCount + 1, boundaryCount + 1), total);

  const siblingsStart = Math.max(
    Math.min(page - siblingCount, total - boundaryCount - siblingCount * 2 - 1),
    boundaryCount + 2,
  );
  const siblingsEnd = Math.min(
    Math.max(page + siblingCount, boundaryCount + siblingCount * 2 + 2),
    endPages.length > 0 ? endPages[0] - 2 : total - 1,
  );

  const items: PaginationItem[] = [...startPages];
  if (siblingsStart > boundaryCount + 2) {
    items.push('ellipsis-start');
  } else if (boundaryCount + 1 < total - boundaryCount) {
    items.push(boundaryCount + 1);
  }
  items.push(...range(siblingsStart, siblingsEnd));
  if (siblingsEnd < total - boundaryCount - 1) {
    items.push('ellipsis-end');
  } else if (total - boundaryCount > boundaryCount) {
    items.push(total - boundaryCount);
  }
  items.push(...endPages);
  return items;
};
