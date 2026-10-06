'use client';

import { Input } from '@repo/forms';
import { Button, Chip, XStack, YStack } from '@repo/ui';
import { useTranslations } from 'next-intl';
import React from 'react';

import { useWorkspaceStore } from '@/stores/workspace-store';

type StatusKey = 'TOTAL' | 'TODO' | 'IN_PROGRESS' | 'DONE';

export const TaskFilter = () => {
  const { filter, setFilter, projects } = useWorkspaceStore();
  const t = useTranslations('kanban.task');

  const statusCounts = React.useMemo(() => {
    const counts: Record<StatusKey, number> = {
      TOTAL: 0,
      TODO: 0,
      IN_PROGRESS: 0,
      DONE: 0,
    };

    if (!Array.isArray(projects)) {
      return counts;
    }

    for (const project of projects) {
      const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
      for (const task of tasks) {
        if (task == null) {
          continue;
        }
        counts.TOTAL += 1;
        if (Object.hasOwn(counts, task.status)) {
          // SAFETY: Object.hasOwn(counts, task.status) just confirmed the key exists in counts
          counts[task.status as StatusKey] += 1;
        }
      }
    }

    return counts;
  }, [projects]);

  const statusOptions: { value: StatusKey; label: string }[] = [
    { value: 'TOTAL', label: t('total') },
    { value: 'TODO', label: t('statusTodo') },
    { value: 'IN_PROGRESS', label: t('statusInProgress') },
    { value: 'DONE', label: t('statusDone') },
  ];
  const activeStatus = filter.status == null || filter.status === '' ? 'TOTAL' : filter.status;

  const hasActiveFilter =
    (filter.status != null && filter.status !== '') || (filter.search != null && filter.search !== '');

  return (
    <XStack
      width="100%"
      alignItems="center"
      gap="$2"
      flexWrap="wrap"
      $md={{ justifyContent: 'flex-end' }}>
      <YStack
        width="100%"
        $md={{ width: 300 }}>
        <Input
          placeholder={t('searchPlaceholder')}
          value={filter.search}
          onChangeText={(search) => {
            setFilter({ search });
          }}
          aria-label={t('searchPlaceholder')}
          inputProps={{ testID: 'search-input' }}
        />
      </YStack>
      <XStack
        gap="$2"
        flexWrap="wrap"
        testID="status-filter">
        {statusOptions.map(({ value, label }) => (
          <Chip
            key={value}
            variant="outline"
            selected={activeStatus === value}
            onPress={() => {
              setFilter({ status: value === 'TOTAL' ? null : value });
            }}>
            {`${label} ${statusCounts[value]}`}
          </Chip>
        ))}
      </XStack>

      {hasActiveFilter ? (
        <Button
          chromeless
          size="$3"
          onPress={() => {
            setFilter({ status: null, search: '' });
          }}
          testID="clear-filter-button">
          {t('clearFilter')}
        </Button>
      ) : null}
    </XStack>
  );
};
