import type { Task } from '@repo/store';
import { View } from '@tamagui/core';
import { useState, useMemo, useCallback } from 'react';

import { MoveTaskSheet } from './move-task-sheet';
import { TaskCard } from './task-card';

interface SortableTaskListProps {
  tasks: Task[];
  projectId: string;
  boardId: string;
  onTaskPress?: (taskId: string) => void;
}

export const SortableTaskList = ({ tasks, projectId, boardId, onTaskPress: _onTaskPress }: SortableTaskListProps) => {
  const [moveSheetVisible, setMoveSheetVisible] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const data = useMemo(() => tasks.toSorted((a, b) => (a.orderInProject ?? 0) - (b.orderInProject ?? 0)), [tasks]);

  const handleMoveToProject = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setMoveSheetVisible(true);
  }, []);

  return (
    <>
      <View>
        {data.map((item) => (
          <TaskCard
            key={item._id}
            task={item}
            onMoveToProject={() => {
              handleMoveToProject(item._id);
            }}
          />
        ))}
      </View>
      {selectedTaskId !== null && selectedTaskId !== '' && (
        <MoveTaskSheet
          visible={moveSheetVisible}
          taskId={selectedTaskId}
          currentProjectId={projectId}
          boardId={boardId}
          onClose={() => {
            setMoveSheetVisible(false);
            setSelectedTaskId(null);
          }}
        />
      )}
    </>
  );
};
