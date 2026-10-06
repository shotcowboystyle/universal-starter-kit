import type { Announcements, Active, Over, DataRef } from '@dnd-kit/core';
import { useRef } from 'react';

import type { Project, Task } from '@/types/db-interface';
import type DraggableData from '@/types/drag-and-drop';

const hasDraggableData = <T extends Active | Over>(
  entry: T | null | undefined,
): entry is T & {
  data: DataRef<DraggableData>;
} => {
  if (!entry) {
    return false;
  }
  const data = entry.data.current;
  if (data?.type === 'Project' || data?.type === 'Task') {
    return true;
  }
  return false;
};

const getDraggingTaskData = (taskId: string, projectId: string, projects: Project[]) => {
  const project = projects.find((candidate: Project) => candidate._id === projectId);
  if (!project) {
    return {
      tasksInProject: [],
      taskPosition: -1,
      project: null,
    };
  }
  const tasksInProject = project.tasks.filter((task: Task) => task.project === projectId);
  const taskPosition = tasksInProject.findIndex((task: { _id: string }) => task._id === taskId);
  return {
    tasksInProject,
    taskPosition,
    project,
  };
};

export const useDndAnnouncements = (projects: Project[], projectsId: string[]): Announcements => {
  const pickedUpTaskProject = useRef<string | null>(null);

  return {
    onDragStart({ active }) {
      let message: string | undefined;
      if (!hasDraggableData(active)) {
        return message;
      }
      if (active.data.current?.type === 'Project') {
        const startProjectIdx = projectsId.indexOf(String(active.id));
        const startProject = projects[startProjectIdx];
        message = `Picked up Project ${startProject?.title} at position: ${startProjectIdx + 1} of ${projectsId.length}`;
      } else if (active.data.current?.type === 'Task') {
        pickedUpTaskProject.current = active.data.current.task.project;
        const { tasksInProject, taskPosition, project } = getDraggingTaskData(
          active.data.current.task._id,
          active.data.current.task.project,
          projects,
        );
        message = `Picked up Task ${active.data.current.task.title} at position: ${taskPosition + 1} of ${
          tasksInProject.length
        } in project ${project?.title}`;
      }
      return message;
    },
    onDragOver({ active, over }) {
      let message: string | undefined;
      if (!hasDraggableData(active) || !hasDraggableData(over)) {
        return message;
      }
      if (active.data.current?.type === 'Project' && over.data.current?.type === 'Project') {
        const overProjectIdx = projectsId.indexOf(String(over.id));
        message = `Project ${active.data.current.project.title} was moved over ${
          over.data.current.project.title
        } at position ${overProjectIdx + 1} of ${projectsId.length}`;
      } else if (active.data.current?.type === 'Task' && over.data.current?.type === 'Task') {
        const { tasksInProject, taskPosition, project } = getDraggingTaskData(
          over.data.current.task._id,
          over.data.current.task.project,
          projects,
        );
        message =
          over.data.current.task.project === pickedUpTaskProject.current
            ? `Task was moved over position ${taskPosition + 1} of ${tasksInProject.length} in project ${project?.title}`
            : `Task ${active.data.current.task.title} was moved over project ${project?.title} in position ${
                taskPosition + 1
              } of ${tasksInProject.length}`;
      }
      return message;
    },
    onDragEnd({ active, over }) {
      let message: string | undefined;
      if (!hasDraggableData(active) || !hasDraggableData(over)) {
        pickedUpTaskProject.current = null;
        return message;
      }
      if (active.data.current?.type === 'Project' && over.data.current?.type === 'Project') {
        const overProjectPosition = projectsId.indexOf(String(over.id));

        message = `Project ${active.data.current.project.title} was dropped into position ${overProjectPosition + 1} of ${
          projectsId.length
        }`;
      } else if (active.data.current?.type === 'Task' && over.data.current?.type === 'Task') {
        const { tasksInProject, taskPosition, project } = getDraggingTaskData(
          over.data.current.task._id,
          over.data.current.task.project,
          projects,
        );
        message =
          over.data.current.task.project === pickedUpTaskProject.current
            ? `Task was dropped into position ${taskPosition + 1} of ${tasksInProject.length} in project ${project?.title}`
            : `Task was dropped into project ${project?.title} in position ${taskPosition + 1} of ${tasksInProject.length}`;
      } else {
        pickedUpTaskProject.current = null;
      }
      return message;
    },
    onDragCancel({ active }) {
      return hasDraggableData(active) ? `Dragging ${active.data.current?.type} cancelled.` : undefined;
    },
  };
};
