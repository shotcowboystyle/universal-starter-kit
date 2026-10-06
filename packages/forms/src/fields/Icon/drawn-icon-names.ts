export const DRAWN_ICON_NAMES = [
  'chev-d',
  'chev-r',
  'chev-l',
  'x',
  'check',
  'warn',
  'arr-d',
  'copy',
  'disk',
  'grip',
  'chev-u',
  'arr-u',
  'arr-r',
  'upload',
  'mail',
  'menu',
] as const;

export type DrawnIconName = (typeof DRAWN_ICON_NAMES)[number];

const DRAWN_ICON_NAME_SET = new Set<string>(DRAWN_ICON_NAMES);

export const isDrawnIconName = (value: string): value is DrawnIconName => DRAWN_ICON_NAME_SET.has(value);

export const resolveIconCatalog = (options?: readonly string[]): DrawnIconName[] => {
  if (options === undefined || options.length === 0) {
    return [...DRAWN_ICON_NAMES];
  }
  const allowed = new Set(options);
  return DRAWN_ICON_NAMES.filter((name) => allowed.has(name));
};

export const parseIconOptions = (options?: string): DrawnIconName[] | undefined => {
  if (options === undefined || options === '') {
    return undefined;
  }
  const names = options
    .split('\n')
    .map((line) => line.trim())
    .filter(isDrawnIconName);
  return names.length > 0 ? names : undefined;
};

export const filterDrawnIcons = (catalog: readonly DrawnIconName[], query: string): DrawnIconName[] => {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return [...catalog];
  }
  return catalog.filter((name) => name.toLowerCase().includes(needle));
};
