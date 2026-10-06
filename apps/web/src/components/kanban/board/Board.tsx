'use client';

import { DndContext, DragOverlay } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { Skeleton, XStack, YStack } from '@repo/ui';
import { Fragment, useMemo } from 'react';

import { useWorkspaceStore } from '@/stores/workspace-store';
import { Project, Task } from '@/types/dbInterface';

import NewProjectDialog from '../project/NewProjectDialog';
import { BoardContainer, BoardProject } from '../project/Project';
import { TaskCard } from '../task/TaskCard';
import { TaskFilter } from '../task/TaskFilter';

import { BoardProvider, useBoardContext } from './BoardContext';
import { useBoardDnd } from './useBoardDnd';

function BoardContent() {
  const rawProjects = useWorkspaceStore((state) => state.projects);
  const isLoadingProjects = useWorkspaceStore((state) => state.isLoadingProjects);
  const filter = useWorkspaceStore((state) => state.filter);
  const setProjects = useWorkspaceStore((state) => state.setProjects);
  const { currentUserId, isBoardOwner, isBoardMember } = useBoardContext();

  const projects = useMemo(() => {
    return [...rawProjects].sort((a, b) => {
      const orderA = a.orderInBoard ?? 0;
      const orderB = b.orderInBoard ?? 0;
      return orderA - orderB;
    });
  }, [rawProjects]);

  const projectsId = useMemo(() => projects.map((project: Project) => project._id), [projects]);

  const { sensors, activeProject, activeTask, announcements, onDragStart, onDragOver, onDragEnd, onDragCancel } =
    useBoardDnd(projects, projectsId, setProjects, rawProjects);

  const filterTasks = (tasks: Task[] = []) => {
    if (!Array.isArray(tasks)) {
      return [];
    }
    return tasks.filter((task) => {
      if (filter.status && task.status !== filter.status) {
        return false;
      }

      if (filter.search) {
        const searchTerm = filter.search.toLowerCase();
        return (
          task.title.toLowerCase().includes(searchTerm) ||
          (task.description?.toLowerCase().includes(searchTerm) ?? false)
        );
      }

      return true;
    });
  };

  return (
    <YStack testID="board">
      <DndContext
        id="dnd-context"
        sensors={sensors}
        accessibility={{
          announcements,
        }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}>
        <YStack
          marginBottom="$4"
          gap="$2"
          alignItems="flex-start"
          justifyContent="space-between"
          $sm={{ flexDirection: 'row', alignItems: 'center' }}>
          <YStack width="100%" $sm={{ width: 200 }}>
            <NewProjectDialog />
          </YStack>
          <XStack width="100%" $sm={{ flex: 1, width: 'auto', minWidth: 0, justifyContent: 'flex-end' }}>
            <TaskFilter />
          </XStack>
        </YStack>
        <BoardContainer>
          {isLoadingProjects ? (
            <Skeleton variant="rounded" width="100%" height="75vh" $md={{ width: 380 }} testID="projects-skeleton" />
          ) : (
            <SortableContext items={projectsId}>
              {projects?.map((project: Project) => (
                <Fragment key={project._id}>
                  <BoardProject
                    project={project}
                    tasks={filterTasks(project.tasks)}
                    isBoardOwner={isBoardOwner}
                    isBoardMember={isBoardMember}
                    currentUserId={currentUserId}
                  />
                </Fragment>
              ))}
            </SortableContext>
          )}
        </BoardContainer>
        <DragOverlay>
          {activeProject && (
            <BoardProject
              isOverlay
              project={activeProject}
              tasks={filterTasks(activeProject.tasks)}
              isBoardOwner={isBoardOwner}
              isBoardMember={isBoardMember}
              currentUserId={currentUserId}
            />
          )}
          {activeTask && <TaskCard task={activeTask} isOverlay />}
        </DragOverlay>
      </DndContext>
    </YStack>
  );
}

export function Board() {
  return (
    <BoardProvider>
      <BoardContent />
    </BoardProvider>
  );
}
