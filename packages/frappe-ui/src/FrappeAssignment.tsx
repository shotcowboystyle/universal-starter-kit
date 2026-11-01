import { CheckIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import { Button, formCommonColors } from '@repo/forms';
import { useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { useResolvedKnobs } from '@repo/theme';
// oxlint-disable sonarjs/todo-tag -- the comment names the Frappe doctype of that name, not a task marker
/**
 * FrappeAssignment — assignment (ToDo) management for a single document.
 *
 * Frappe models assignments as ToDo documents pointing back at the target
 * doc (`reference_type` / `reference_name`) with `allocated_to` naming the
 * assignee. This bridge subscribes to those ToDos via the live collection
 * (realtime insert/evict for free) and mutates them with plain ToDo CRUD,
 * mirroring `frappe.desk.form.assign_to` semantics:
 * - add    → insert an Open ToDo for the picked user
 * - remove → status "Cancelled" (assign_to.remove parity — never hard-delete)
 * - done   → status "Closed"   (assign_to.close parity)
 *
 * The add flow reuses the backend-searching user combobox (`Link` over the
 * User doctype — stock `search_link` ranking and permissions server-side).
 */
// oxlint-enable sonarjs/todo-tag
import { AsyncBoundary, Avatar } from '@repo/ui';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, XStack, YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { toFrappeDateValue } from './fields/Date/wire';
import { Link } from './fields/Link';
import { useFrappeUsers } from './frappe-users';
import { useFrappeConfig } from './FrappeProvider';
import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import { toLiveLoadError } from './live-errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// oxlint-disable-next-line sonarjs/todo-tag -- names the Frappe doctype of that name, not a task marker
/** A Frappe ToDo document (the assignment record). */
export interface FrappeToDo {
  name: string;
  doctype: string;
  allocated_to?: string;
  assigned_by?: string;
  reference_type?: string;
  reference_name?: string;
  description?: string;
  /** "Open" | "Closed" | "Cancelled" */
  status?: string;
  priority?: string;
  date?: string;
  creation?: string;
  modified?: string;
}

export interface FrappeAssignmentDerivation {
  /** Active assignments (status Open), oldest first. */
  open: FrappeToDo[];
  /** Completed assignments (status Closed), oldest first. */
  completed: FrappeToDo[];
}

export interface FrappeAssignmentProps extends Omit<YStackProps, 'children' | 'name'> {
  /** DocType of the target document the assignments point at. */
  doctype: string;
  /** Name of the target document. */
  name: string;
  /** Section label (defaults to the localized "Assigned To"). */
  label?: string;
  /** Session user recorded as `assigned_by` on new assignments. */
  currentUser?: string;
  /** Disable all mutation affordances (add / complete / remove). */
  disabled?: boolean;
  /** Render the completed (Closed) assignments section. Default true. */
  showCompleted?: boolean;
  /** Called after an assignment is created for `user`. */
  onAssign?: (user: string) => void;
  /** Called after an assignment is removed (cancelled). */
  onRemove?: (todo: FrappeToDo) => void;
  /** Called after an assignment is marked complete (closed). */
  onComplete?: (todo: FrappeToDo) => void;
}

// ---------------------------------------------------------------------------
// Pure derivation helpers (unit-tested)
// ---------------------------------------------------------------------------

const byCreation = (a: FrappeToDo, b: FrappeToDo) => (a.creation ?? '').localeCompare(b.creation ?? '');

// oxlint-disable sonarjs/todo-tag -- the comment names the Frappe doctype of that name, not a task marker
/**
 * Splits raw ToDo docs into open / completed assignee lists.
 * Cancelled assignments are dropped (assign_to.remove parity); a missing
 * status is treated as Open (Frappe's ToDo default).
 */
// oxlint-enable sonarjs/todo-tag
export const deriveAssignments = (todos: readonly FrappeToDo[] | undefined): FrappeAssignmentDerivation => {
  const open: FrappeToDo[] = [];
  const completed: FrappeToDo[] = [];
  for (const todo of todos ?? []) {
    const status = todo.status ?? 'Open';
    if (status === 'Open') {
      open.push(todo);
    } else if (status === 'Closed') {
      completed.push(todo);
    }
  }
  open.sort(byCreation);
  completed.sort(byCreation);
  return { open, completed };
};

// oxlint-disable sonarjs/todo-tag -- the comment names the Frappe doctype of that name, not a task marker
/**
 * Builds the optimistic ToDo document for a new assignment — the same field
 * contract `frappe.desk.form.assign_to.add` writes server-side. The `name`
 * is a client placeholder; the server assigns the real name on create.
 */
// oxlint-enable sonarjs/todo-tag
export const buildAssignmentTodo = (args: {
  doctype: string;
  name: string;
  user: string;
  assignedBy?: string;
  description?: string;
}): FrappeToDo => {
  const todo: FrappeToDo = {
    doctype: 'ToDo',
    // oxlint-disable-next-line sonarjs/pseudo-random -- a client placeholder name; the server assigns the real one on create
    name: `new-todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    allocated_to: args.user,
    reference_type: args.doctype,
    reference_name: args.name,
    description: args.description ?? `Assignment for ${args.doctype} ${args.name}`,
    status: 'Open',
    priority: 'Medium',
    // oxlint-disable-next-line sonarjs/todo-tag, eslint/no-warning-comments -- names the Frappe doctype field, not a task marker
    // ToDo.date is a Frappe Date field: timezone-naive, so the default is the
    // user's local calendar day. `toISOString()` would name UTC's day instead.
    date: toFrappeDateValue(new Date(), 'date'),
  };
  if (args.assignedBy !== undefined && args.assignedBy !== '') {
    todo.assigned_by = args.assignedBy;
  }
  return todo;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TODO_FIELDS = [
  'name',
  'allocated_to',
  'assigned_by',
  'reference_type',
  'reference_name',
  'description',
  'status',
  'priority',
  'date',
  'creation',
  'modified',
] as const;

const AssignmentRow = ({
  todo,
  label,
  image,
  completed,
  disabled,
  onComplete,
  onRemove,
}: {
  todo: FrappeToDo;
  label: string;
  image?: string;
  completed?: boolean;
  disabled?: boolean;
  onComplete?: (todo: FrappeToDo) => void;
  onRemove?: (todo: FrappeToDo) => void;
}) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const iconWidth = knobProps.controlIcon?.width;
  const iconSize = iconWidth !== undefined && iconWidth !== 0 ? iconWidth : 14;
  return (
    <XStack
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- XStack renders a styled flex row; <li> would drop the Tamagui layout props
      role="listitem"
      alignItems="center"
      gap="$2"
      opacity={completed ? 0.6 : 1}
      testID={`frappe-assignment-${todo.name}`}>
      <Avatar
        size="$2"
        src={image}
        name={label}
      />
      <YStack
        flex={1}
        minWidth={0}>
        <Text
          {...knobProps.body}
          numberOfLines={1}>
          {label}
        </Text>
        {todo.allocated_to !== undefined && todo.allocated_to !== '' && todo.allocated_to !== label ? (
          <Text
            {...knobProps.label}
            color={formCommonColors.muted}
            numberOfLines={1}>
            {todo.allocated_to}
          </Text>
        ) : null}
      </YStack>
      {completed ? (
        <CheckIcon
          size={iconSize}
          aria-label={t('Completed')}
        />
      ) : (
        <>
          {onComplete ? (
            <Button
              size="$2"
              circular
              chromeless
              disabled={disabled}
              aria-label={t('Mark assignment complete')}
              onPress={() => {
                onComplete(todo);
              }}
              icon={<CheckIcon size={iconSize} />}
            />
          ) : null}
          {onRemove ? (
            <Button
              size="$2"
              circular
              chromeless
              disabled={disabled}
              aria-label={t('Remove assignment')}
              onPress={() => {
                onRemove(todo);
              }}
              icon={<XIcon size={iconSize} />}
            />
          ) : null}
        </>
      )}
    </XStack>
  );
};

const FrappeAssignmentBody = ({
  doctype,
  name,
  label,
  currentUser,
  disabled = false,
  showCompleted = true,
  onAssign,
  onRemove,
  onComplete,
  onRetry,
  ...stackProps
}: FrappeAssignmentProps & { onRetry?: () => void }) => {
  const config = useFrappeConfig();
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const [addOpen, setAddOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Honest error state (DG-ST-01): the collection swallows failed
  // subscription fetches — onSyncError surfaces them as error chrome so a
  // failed load never masquerades as "no one assigned".
  const [syncError, setSyncError] = useState<unknown>(null);

  const connectionConfig = useMemo(
    () =>
      config
        ? {
            baseURL: config.baseURL,
            socketPort: config.socketPort,
            siteName: config.siteName,
            socketBaseURL: config.socketBaseURL,
            auth: config.auth,
            syncOptions: config.syncOptions,
            realtime: config.realtime,
            fixtures: config.fixtures,
          }
        : undefined,
    [config],
  );

  const filters = useMemo<[string, string, unknown][]>(
    () => [
      ['reference_type', '=', doctype],
      ['reference_name', '=', name],
    ],
    [doctype, name],
  );

  const collection = useFrappeCollection<FrappeToDo>(connectionConfig, 'ToDo', {
    filters,
    fields: TODO_FIELDS,
    onSyncError: setSyncError,
  });

  const { data, isLoading } = useLiveQuery((q) => (collection ? q.from({ _list: collection }) : null), [collection]);

  // SAFETY: the live query reads only the assignment collection typed as FrappeToDo above
  const { open, completed } = useMemo(() => deriveAssignments(data as FrappeToDo[] | undefined), [data]);

  const assigneeIds = useMemo(
    () =>
      [...open, ...completed]
        .map((todo) => todo.allocated_to)
        .filter((user): user is string => user !== undefined && user !== ''),
    [open, completed],
  );
  const users = useFrappeUsers(config, assigneeIds);

  const displayFor = useCallback(
    (todo: FrappeToDo) => {
      const id = todo.allocated_to ?? '';
      const info = id ? users.get(id) : undefined;
      return { label: info?.label ?? id, image: info?.image };
    },
    [users],
  );

  const handleAssign = useCallback(
    async (user: string) => {
      setAddOpen(false);
      if (!user || !collection) {
        return;
      }
      // assign_to.add duplicate guard: one Open assignment per user per doc.
      if (open.some((todo) => todo.allocated_to === user)) {
        return;
      }
      setActionError(null);
      try {
        const tx = collection.insert(
          buildAssignmentTodo({
            doctype,
            name,
            user,
            assignedBy: currentUser,
            description: t('Assignment for {{doctype}} {{docname}}', {
              doctype,
              docname: name,
            }),
          }),
        );
        await tx.isPersisted.promise;
        onAssign?.(user);
      } catch {
        setActionError(t('Failed to add assignment'));
      }
    },
    [collection, open, doctype, name, currentUser, onAssign, t],
  );

  const handleComplete = useCallback(
    async (todo: FrappeToDo) => {
      if (!collection) {
        return;
      }
      setActionError(null);
      try {
        const tx = collection.update(todo.name, (draft) => {
          draft.status = 'Closed';
        });
        await tx.isPersisted.promise;
        onComplete?.(todo);
      } catch {
        setActionError(t('Failed to complete assignment'));
      }
    },
    [collection, onComplete, t],
  );

  const handleRemove = useCallback(
    async (todo: FrappeToDo) => {
      if (!collection) {
        return;
      }
      setActionError(null);
      try {
        const tx = collection.update(todo.name, (draft) => {
          draft.status = 'Cancelled';
        });
        await tx.isPersisted.promise;
        onRemove?.(todo);
      } catch {
        setActionError(t('Failed to remove assignment'));
      }
    },
    [collection, onRemove, t],
  );

  const loadError =
    syncError === null
      ? null
      : toLiveLoadError(syncError, {
          permissionMessage: t('You do not have permission to view assignments'),
          genericMessage: t('Failed to load assignments'),
        });

  const canMutate = !!collection && !disabled;

  return (
    <YStack
      {...knobProps.gap}
      testID="frappe-assignment"
      {...stackProps}>
      <FrappeReconnectIndicator config={connectionConfig} />
      <XStack
        alignItems="center"
        gap="$2">
        <Text
          flex={1}
          {...knobProps.label}
          fontWeight="400"
          color={formCommonColors.muted}>
          {label ?? t('Assigned To')}
        </Text>
        {canMutate ? (
          <Button
            size="$2"
            circular
            chromeless
            aria-label={t('Add assignment')}
            onPress={() => {
              setAddOpen((prev) => !prev);
            }}
            icon={<PlusIcon size={14} />}
          />
        ) : null}
      </XStack>
      {addOpen && canMutate ? (
        <Link
          doctype="User"
          value=""
          // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- awaitable handler, never rejects: failures land in actionError
          onChange={handleAssign}
          placeholder={t('Assign to user')}
          compact
        />
      ) : null}
      {/* oxlint-disable-next-line sonarjs/todo-tag -- names the Frappe doctype of that name, not a task marker */}
      {/* Honest first-load state: skeleton until the ToDo subscription is
          live; a failed subscription renders error chrome, never "no one
          assigned" (DG-ST-01 / LC-20). */}
      <AsyncBoundary
        compact
        loading={!!collection && isLoading}
        error={loadError}
        onRetry={onRetry}
        empty={open.length === 0 && completed.length === 0}
        emptyTitle={t('No one assigned')}>
        <YStack
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- YStack renders a styled flex column; <ul> would drop the Tamagui layout props
          role="list"
          gap="$2">
          {open.map((todo) => {
            const { label: rowLabel, image } = displayFor(todo);
            return (
              <AssignmentRow
                key={todo.name}
                todo={todo}
                label={rowLabel}
                image={image}
                disabled={!canMutate}
                // oxlint-disable-next-line typescript/no-misused-promises -- awaitable handler, never rejects: failures land in actionError
                onComplete={canMutate ? handleComplete : undefined}
                // oxlint-disable-next-line typescript/no-misused-promises -- awaitable handler, never rejects: failures land in actionError
                onRemove={canMutate ? handleRemove : undefined}
              />
            );
          })}
          {showCompleted && completed.length > 0 ? (
            <YStack gap="$2">
              <Text
                {...knobProps.label}
                color={formCommonColors.muted}
                fontWeight="400">
                {t('Completed')}
              </Text>
              {completed.map((todo) => {
                const { label: rowLabel, image } = displayFor(todo);
                return (
                  <AssignmentRow
                    key={todo.name}
                    todo={todo}
                    label={rowLabel}
                    image={image}
                    completed
                  />
                );
              })}
            </YStack>
          ) : null}
        </YStack>
      </AsyncBoundary>
      {actionError !== null && actionError !== '' ? (
        <Text
          role="alert"
          {...knobProps.label}
          color={formCommonColors.error}>
          {actionError}
        </Text>
      ) : null}
    </YStack>
  );
};

/**
 * Assignment widget for one document: live assignee list (avatars + names),
 * add via backend-searched user combobox, complete / remove per row.
 */
export const FrappeAssignment = (props: FrappeAssignmentProps) => {
  // oxlint-disable-next-line sonarjs/todo-tag -- names the Frappe doctype of that name, not a task marker
  // Retry re-creates the ToDo collection (fresh initial sync) by remounting
  // the body — useFrappeCollection has no refetch surface of its own.
  const [retryNonce, setRetryNonce] = useState(0);
  const handleRetry = useCallback(() => {
    setRetryNonce((nonce) => nonce + 1);
  }, []);
  return (
    <FrappeAssignmentBody
      key={retryNonce}
      onRetry={handleRetry}
      {...props}
    />
  );
};
