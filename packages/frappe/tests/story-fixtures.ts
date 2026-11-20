/**
 * Network-hermetic data for the frappe stories (G-15/D-05).
 *
 * Every story runs the real SyncModule pipeline over an
 * InMemoryFixtureProvider, so nothing is fetched. Two scripted documents give
 * the journal something to show: an update to the hanging one never settles
 * (a Pending entry) and an update to the rejected one is refused (a Failed
 * entry, rolled back to Open).
 */
import { useEffect, useRef, useState } from 'react';

import type { FrappeDocData } from '../src/common/types';
import { InMemoryFixtureProvider } from '../src/fixtures';
import type { FixtureDoc, FixtureProvider } from '../src/fixtures';
import { getFrappeSyncModule } from '../src/frappe-react';
import type { UseFrappeCollectionConfig } from '../src/frappe-react';
import type { SyncModule } from '../src/sync';
import { Operation } from '../src/sync/types';

export type ToDoStatus = 'Open' | 'Working' | 'Completed' | 'Cancelled';
export type ToDoPriority = 'Low' | 'Medium' | 'High';

export interface ToDo {
  name: string;
  doctype: string;
  description: string;
  status: ToDoStatus;
  priority: ToDoPriority;
  date: string;
  modified: string;
}

/** An update to this document is accepted but never acknowledged. */
export const HANGING_TODO = 'TODO-HANGS';
/** An update to this document is refused by the "server". */
export const REJECTED_TODO = 'TODO-REJECTS';
/** The document the seeded journal writes to and the provider confirms. */
const CONFIRMED_TODO = 'TODO-0001';

const DEFAULT_COUNT = 4;
const statuses: readonly ToDoStatus[] = ['Open', 'Working', 'Completed', 'Cancelled'];
const priorities: readonly ToDoPriority[] = ['Low', 'Medium', 'High'];
const DAYS_IN_SEPTEMBER = 30;

const twoDigits = (n: number): string => String(n).padStart(2, '0');

const toDoAt = (index: number, name: string): ToDo => {
  const day = twoDigits((index % DAYS_IN_SEPTEMBER) + 1);
  return {
    name,
    doctype: 'ToDo',
    description: `Fixture task ${index + 1}`,
    status: statuses[index % statuses.length] ?? 'Open',
    priority: priorities[index % priorities.length] ?? 'Medium',
    date: `2026-09-${day}`,
    modified: `2026-09-${day} 09:00:00`,
  };
};

/** Answers updates to the two scripted documents the way a misbehaving server would. */
class ScriptedFixtureProvider extends InMemoryFixtureProvider {
  override async updateDoc<TDoc extends FrappeDocData>(
    doctype: string,
    name: string,
    values: Partial<TDoc>,
  ): Promise<TDoc> {
    if (name === HANGING_TODO) {
      return await Promise.withResolvers<TDoc>().promise;
    }
    if (name === REJECTED_TODO) {
      throw new Error(`Scripted rejection: ${doctype} ${name} refuses every update`);
    }
    return await super.updateDoc(doctype, name, values);
  }
}

/**
 * `count` task rows, numbered from 0001. Scripted by default: the two scripted
 * documents are appended, both Open, and the provider answers their updates.
 */
export const toDoFixtureData = (
  count = DEFAULT_COUNT,
  { scripted = true }: { scripted?: boolean } = {},
): FixtureProvider => {
  const rows: FixtureDoc[] = Array.from({ length: count }, (_, index) =>
    toDoAt(index, `TODO-${String(index + 1).padStart(4, '0')}`),
  );
  if (!scripted) {
    return new InMemoryFixtureProvider({ ToDo: rows });
  }
  const scriptedRows = [HANGING_TODO, REJECTED_TODO].map((name, offset) => ({
    ...toDoAt(count + offset, name),
    status: 'Open' satisfies ToDoStatus,
  }));
  return new ScriptedFixtureProvider({ ToDo: [...rows, ...scriptedRows] });
};

/**
 * A config over `fixtures`, stable for the life of the story. Only the first
 * provider is kept: a story builds a fresh one every render, and a new
 * provider would mean a new SyncModule.
 */
export const useStoryConfig = (fixtures: FixtureProvider): UseFrappeCollectionConfig => {
  // oxlint-disable-next-line react/hook-use-state -- the config never changes, so there is no setter to name
  const [config] = useState<UseFrappeCollectionConfig>(() => ({ fixtures, realtime: false }));
  return config;
};

const advance = async (sync: SyncModule, name: string): Promise<void> => {
  try {
    await sync.mutate({
      mutationId: `story-seed-${name}`,
      operation: Operation.Update,
      doc: { doctype: 'ToDo', name, status: 'Working' },
    });
  } catch {
    // Safe to ignore: a refused write is recorded as a Failed journal entry, which is what the story shows.
  }
};

/**
 * The config's SyncModule, with three updates written once `isReady` and
 * `seed` both hold: one the provider confirms, one that stays Pending and one
 * that Fails.
 */
export const useSeededJournal = (
  config: UseFrappeCollectionConfig,
  isReady: boolean,
  seed = true,
): SyncModule | undefined => {
  const sync = getFrappeSyncModule(config);
  const seeded = useRef(false);
  useEffect(() => {
    if (!sync || !isReady || !seed || seeded.current) {
      return;
    }
    seeded.current = true;
    for (const name of [CONFIRMED_TODO, HANGING_TODO, REJECTED_TODO]) {
      void advance(sync, name);
    }
  }, [sync, isReady, seed]);
  return sync;
};
