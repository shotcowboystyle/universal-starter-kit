/**
 * Last list-result order per doctype — the prev/next document pager's
 * context channel (desk parity: a form opened FROM a list pages through
 * that list's neighbors in the same order).
 *
 * Write side: DoctypeListScreen mirrors each resolved table page here
 * (display order, current page). Read side: DocFormScreen looks the open
 * document up and pages through its neighbors. The store is module-level
 * (writer and reader never co-mount, so React state buys nothing) with a
 * sessionStorage mirror on web so the context survives a reload honestly —
 * a deep link with no context renders no pager at all (LC-40: no dead
 * arrows).
 */

/** Cap stored context so a huge page size cannot bloat sessionStorage. */
const MAX_NAMES = 1000;

const memory = new Map<string, string[]>();

const storageKey = (doctype: string): string => `backoffice:listNav:${doctype}`;

const readStorage = (doctype: string): string[] | undefined => {
  try {
    if (typeof sessionStorage === 'undefined') {
      return undefined;
    }
    const raw = sessionStorage.getItem(storageKey(doctype));
    if (raw === null || raw === '') {
      return undefined;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const names = parsed.filter((name): name is string => typeof name === 'string' && name.length > 0);
    return names.length > 0 ? names : undefined;
  } catch {
    return undefined;
  }
};

const writeStorage = (doctype: string, names: string[]): void => {
  try {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    sessionStorage.setItem(storageKey(doctype), JSON.stringify(names));
  } catch {
    // Quota / private-mode failures degrade to in-memory context.
  }
};

/**
 * Record the doctype's current list order. Empty writes are ignored on
 * purpose: the table reports state on every render, including the
 * fetch-in-flight passes where `data` is still `[]` — wiping the context
 * there would kill the pager whenever the list remounts.
 */
export const setListNavContext = (doctype: string, names: readonly string[]): void => {
  const cleaned = names
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .slice(0, MAX_NAMES);
  if (cleaned.length === 0) {
    return;
  }
  const existing = memory.get(doctype);
  if (existing && existing.length === cleaned.length && existing.every((name, index) => name === cleaned[index])) {
    return;
  }
  memory.set(doctype, cleaned);
  writeStorage(doctype, cleaned);
};

/** The last recorded list order for a doctype (memory, then reload mirror). */
export const getListNavContext = (doctype: string): readonly string[] | undefined => {
  const inMemory = memory.get(doctype);
  if (inMemory) {
    return inMemory;
  }
  const stored = readStorage(doctype);
  if (stored) {
    memory.set(doctype, stored);
  }
  return stored;
};

export interface ListNavNeighbors {
  /** True when `name` is part of the doctype's last list result. */
  inList: boolean;
  prev?: string;
  next?: string;
}

/** Neighbors of `name` in the doctype's last list order. */
export const getListNavNeighbors = (doctype: string, name: string): ListNavNeighbors => {
  const names = getListNavContext(doctype);
  if (!names) {
    return { inList: false };
  }
  const index = names.indexOf(name);
  if (index === -1) {
    return { inList: false };
  }
  const prev = index > 0 ? names[index - 1] : undefined;
  const next = index < names.length - 1 ? names[index + 1] : undefined;
  const neighbors: ListNavNeighbors = { inList: true };
  if (prev !== undefined) {
    neighbors.prev = prev;
  }
  if (next !== undefined) {
    neighbors.next = next;
  }
  return neighbors;
};

/** Hard-reset (tests). Clears memory and the sessionStorage mirror. */
export const resetListNavContext = (): void => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      for (const doctype of memory.keys()) {
        sessionStorage.removeItem(storageKey(doctype));
      }
    }
  } catch {
    // storage unavailable — memory reset below still applies
  }
  memory.clear();
};
