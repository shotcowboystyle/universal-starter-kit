import { Button, Text, XStack, YStack } from 'tamagui';

import { toDoFixtureData, useSeededJournal, useStoryConfig } from '../tests/story-fixtures';
import type { ToDo } from '../tests/story-fixtures';

import { useFrappeCollection, useFrappePendingMutations } from './frappe-react';
import { Status } from './sync/types';
import { useLiveQuery } from './use-live-query';

export default {
  title: 'Frappe/useFrappePendingMutations',
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'The mutation ledger behind the rejected-write UI contract: useFrappePendingMutations(config, doctype?) returns the live journal entries (pending + failed), a retry() that re-issues them with their original mutation ids, and dismiss(id) for a failed entry. The probe opens a ToDo subscription, then writes to two scripted documents: one whose update never acks (stays pending) and one the server rejects (failed, optimistic state rolled back). Network-hermetic (G-15/D-05): config.fixtures is an InMemoryFixtureProvider and nothing is fetched. Retry re-runs the same scripted writes, so the hanging one keeps hanging and the rejected one fails again; that is the ledger doing its job, not a bug in the story.',
      },
    },
  },
};

interface ProbeProps {
  /** Seed the journal once the subscription is ready. */
  seed?: boolean;
  /** Scope the hook to one doctype. */
  scope?: string;
}

const LedgerProbe = ({ seed = true, scope }: ProbeProps) => {
  const config = useStoryConfig(toDoFixtureData(3));
  const collection = useFrappeCollection<ToDo>(config, 'ToDo');
  const { data, isReady } = useLiveQuery((q) => (collection ? q.from({ todo: collection }) : null), [collection]);
  useSeededJournal(config, isReady, seed);
  const ledger = useFrappePendingMutations(config, scope);
  const rows = (data as ToDo[] | undefined) ?? [];

  return (
    <YStack
      gap="$3"
      data-testid="ledger-probe">
      <Text fontWeight="600">
        useFrappePendingMutations(config{scope === undefined || scope === '' ? '' : `, "${scope}"`})
      </Text>
      <Text
        fontSize="$2"
        data-testid="ledger-counts">
        entries {ledger.entries.length} · pending {ledger.pending.length} · failed {ledger.failed.length}
      </Text>
      <XStack gap="$2">
        <Button
          size="$2"
          onPress={() => {
            void ledger.retry();
          }}
          disabled={!ledger.entries.length}>
          Retry all
        </Button>
      </XStack>
      <YStack gap="$1">
        {ledger.entries.map((entry) => (
          <XStack
            key={entry.id}
            gap="$3"
            alignItems="center"
            data-testid={`ledger-entry-${entry.status}`}>
            <Text
              fontSize="$2"
              width={80}>
              {entry.status}
            </Text>
            <Text
              fontSize="$2"
              width={70}>
              {entry.operation}
            </Text>
            <Text
              fontSize="$2"
              flex={1}>
              {entry.doctype}/{entry.docname ?? '?'} · retries {entry.retryCount}
              {(entry.error ?? '') === '' ? '' : ` · ${entry.error}`}
            </Text>
            {entry.status === Status.Failed ? (
              <Button
                size="$2"
                onPress={() => {
                  ledger.dismiss(entry.id);
                }}>
                Dismiss
              </Button>
            ) : null}
          </XStack>
        ))}
        {ledger.entries.length === 0 ? (
          <Text
            fontSize="$2"
            color="$color10">
            The ledger is empty: every write has been acked.
          </Text>
        ) : null}
      </YStack>
      <Text
        fontSize="$2"
        color="$color10"
        data-testid="ledger-rows">
        cached rows: {rows.map((r) => `${r.name}=${r.status}`).join(' · ') || '(none)'}
      </Text>
    </YStack>
  );
};

// oxlint-disable-next-line sonarjs/todo-tag -- names the fixture documents, not a task marker
/** One pending entry (TODO-HANGS) and one failed entry (TODO-REJECTS, rolled back to Open). */
export const Main = () => <LedgerProbe />;
Main.storyName = 'Main';

/** Nothing written yet: entries, pending and failed are all empty. */
export const Clean = () => <LedgerProbe seed={false} />;

// oxlint-disable-next-line sonarjs/todo-tag -- names the doctype, not a task marker
/** Scoped to another doctype: the ToDo entries exist but the hook reports none. */
export const ScopedToNote = () => <LedgerProbe scope="Note" />;
