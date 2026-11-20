import { useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core';
import type { Active, Over, UniqueIdentifier, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { taskApi } from '@/lib/api/task-api';
import type { Project, Task } from '@/types/db-interface';
import type DraggableData from '@/types/drag-and-drop';

import { useDndAnnouncements } from './use-dnd-announcements';

const hasDraggableData = <T extends Active | Over>(
  entry: T | null | undefined,
): entry is T & {
  data: { current: DraggableData };
} => {
  if (entry == null) {
    return false;
  }
  const data = entry.data.current;
  if (data?.type === 'Project' || data?.type === 'Task') {
    return true;
  }
  return false;
};

const loadProjectApi = async () => await import('@/lib/api/project-api');

const getOverProjectId = (overData: DraggableData): string | null => {
  if (overData.type === 'Project') {
    return overData.project._id;
  }
  return overData.task.project;
};

const findTaskLocation = (projects: Project[], taskId: string) => {
  for (const project of projects) {
    const idx = project.tasks.findIndex((t) => t._id === taskId);
    if (idx !== -1) {
      return { projectId: project._id, idx };
    }
  }
  return null;
};

export const useBoardDnd = (
  projects: Project[],
  projectsId: string[],
  setProjects: (projects: Project[]) => void,
  rawProjects: Project[],
) => {
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const originalProjects = useRef<Project[] | null>(null);

  const sensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor));
  const announcements = useDndAnnouncements(projects, projectsId);

  const onDragStart = (event: DragStartEvent) => {
    if (!hasDraggableData(event.active)) {
      return;
    }
    originalProjects.current = structuredClone(projects);

    const data = event.active.data.current;
    if (data.type === 'Project') {
      setActiveProject(data.project);
      return;
    }
    if (data.type === 'Task') {
      setActiveTask(data.task);
    }
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    if (!over) {
      return;
    }
    if (active.id === over.id) {
      return;
    }
    if (!hasDraggableData(active) || !hasDraggableData(over)) {
      return;
    }
    const activeData = active.data.current;
    if (activeData.type === 'Project') {
      return;
    }

    const draggedTask = activeData.task;
    const overData = over.data.current;

    let activeProjectId: string | null = null;
    for (const p of projects) {
      if (p.tasks.some((t) => t._id === draggedTask._id)) {
        activeProjectId = p._id;
        break;
      }
    }

    const overProjectId = getOverProjectId(overData);

    if (activeProjectId === null || activeProjectId === '' || overProjectId === null || overProjectId === '') {
      return;
    }

    if (activeProjectId === overProjectId) {
      return;
    }

    const updatedProjects = projects.map((project) => ({
      ...project,
      tasks: [...project.tasks],
    }));

    const sourceProject = updatedProjects.find((p) => p._id === activeProjectId);
    const targetProject = updatedProjects.find((p) => p._id === overProjectId);

    if (!sourceProject || !targetProject) {
      return;
    }

    const activeIdx = sourceProject.tasks.findIndex((t) => t._id === draggedTask._id);
    if (activeIdx === -1) {
      return;
    }

    const [movedTask] = sourceProject.tasks.splice(activeIdx, 1);
    movedTask.project = targetProject._id;

    if (overData.type === 'Task') {
      const overIdx = targetProject.tasks.findIndex((t) => t._id === overData.task._id);
      targetProject.tasks.splice(overIdx === -1 ? targetProject.tasks.length : overIdx, 0, movedTask);
    } else {
      targetProject.tasks.push(movedTask);
    }

    setProjects(updatedProjects);
  };

  const revertToOriginal = () => {
    if (originalProjects.current) {
      setProjects(originalProjects.current);
    }
    originalProjects.current = null;
  };

  const moveTaskWithinProject = (projectId: string, currentIdx: number, overTask: Task): number => {
    const project = projects.find((p) => p._id === projectId);
    if (!project) {
      return currentIdx;
    }
    const overIdx = project.tasks.findIndex((t) => t._id === overTask._id);
    if (overIdx === -1 || currentIdx === overIdx) {
      return currentIdx;
    }
    const newTasks = arrayMove([...project.tasks], currentIdx, overIdx);
    setProjects(projects.map((p) => (p._id === projectId ? { ...p, tasks: newTasks } : p)));
    return overIdx;
  };

  const handleTaskDragEnd = async (movedTask: Task, over: Over) => {
    const location = findTaskLocation(projects, movedTask._id);

    if (location === null || location.projectId === '') {
      originalProjects.current = null;
      return;
    }

    const currentProjectId = location.projectId;
    let currentIdx = location.idx;

    if (hasDraggableData(over) && over.data.current.type === 'Task') {
      const overTask = over.data.current.task;

      if (currentProjectId === overTask.project) {
        currentIdx = moveTaskWithinProject(currentProjectId, currentIdx, overTask);
      }
    }

    const originalProject = originalProjects.current?.find((p) => p.tasks.some((t) => t._id === movedTask._id));
    const originalIdx = originalProject?.tasks.findIndex((t) => t._id === movedTask._id) ?? -1;

    if (originalProject?._id === currentProjectId && originalIdx === currentIdx) {
      originalProjects.current = null;
      return;
    }

    try {
      await taskApi.moveTask(movedTask._id, currentProjectId, currentIdx);
      toast.success(`Task "${movedTask.title}" moved successfully`);
      originalProjects.current = null;
    } catch (error) {
      console.error('Failed to move task:', error);
      toast.error('Failed to move task. Reverting...');
      revertToOriginal();
    }
  };

  const handleProjectDragEnd = async (activeId: UniqueIdentifier, overId: UniqueIdentifier) => {
    if (activeId === overId) {
      originalProjects.current = null;
      return;
    }

    const activeProjectIndex = projectsId.indexOf(String(activeId));
    const overProjectIndex = projectsId.indexOf(String(overId));

    if (activeProjectIndex === -1 || overProjectIndex === -1) {
      originalProjects.current = null;
      return;
    }

    const previousProjects = originalProjects.current ?? [...rawProjects];

    const reorderedProjects = arrayMove(projects, activeProjectIndex, overProjectIndex);
    const updatedProjects = reorderedProjects.map((project, index) => ({
      ...project,
      orderInBoard: index,
    }));

    setProjects(updatedProjects);

    try {
      const { projectApi } = await loadProjectApi();

      const updatePromises = updatedProjects.flatMap((project, newIndex) => {
        const oldProject = previousProjects.find((p) => p._id === project._id);
        const oldIndex = oldProject?.orderInBoard ?? 0;

        return oldIndex === newIndex ? [] : [projectApi.updateProject(project._id, { orderInBoard: newIndex })];
      });

      await Promise.all(updatePromises);
      toast.success('Project order updated successfully');
      originalProjects.current = null;
    } catch (error) {
      console.error('Failed to update project order:', error);
      toast.error('Failed to update project order. Reverting...');
      setProjects(previousProjects);
      originalProjects.current = null;
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveProject(null);
    setActiveTask(null);

    const { active, over } = event;
    if (!over) {
      revertToOriginal();
      return;
    }

    if (!hasDraggableData(active)) {
      originalProjects.current = null;
      return;
    }

    const activeData = active.data.current;

    if (activeData.type === 'Task') {
      await handleTaskDragEnd(activeData.task, over);
      return;
    }

    await handleProjectDragEnd(active.id, over.id);
  };

  const onDragCancel = () => {
    if (originalProjects.current) {
      setProjects(originalProjects.current);
    }
    setActiveProject(null);
    setActiveTask(null);
    originalProjects.current = null;
  };

  return {
    sensors,
    activeProject,
    activeTask,
    announcements,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
};
