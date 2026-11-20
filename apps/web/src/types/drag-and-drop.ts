import type { ProjectDragData } from '@/components/kanban/project/Project';
import type { TaskDragData } from '@/components/kanban/task/TaskCard';

type DraggableData = ProjectDragData | TaskDragData;

export default DraggableData;
