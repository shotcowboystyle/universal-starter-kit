import type { FrappeDocValue } from '../common/types';
import type { Filters } from '../sync/filters';
import { hasField } from '../util';

export interface MutationRequestHeaders {
  'Content-Type': 'application/json';
  'Idempotency-Key'?: string;
  'If-Match'?: string;
  'X-Frappe-CSRF-Token'?: string;
  Authorization?: string;
}

/**
 * Create operation request body
 */
export interface CreateRequestBody {
  doctype: string;
  /** Document fields */
  [field: string]: FrappeDocValue;
}

/**
 * Update operation request body
 */
export interface UpdateRequestBody {
  doctype: string;
  name: string;
  values: Record<string, FrappeDocValue>;
}

/**
 * Delete operation request body
 */
export interface DeleteRequestBody {
  doctype: string;
  name: string;
}

/**
 * List since (backfill) request parameters
 */
export interface ListSinceParams {
  doctype: string;
  modified_after?: string;
  limit?: number;
  fields?: string[];
  filters?: Filters;
}

// Response Types

/**
 * Standard Frappe document response
 */
export interface DocumentResponse {
  name: string;
  doctype: string;
  owner: string;
  creation: string;
  modified: string;
  modified_by: string;
  docstatus: 0 | 1 | 2;
  idx?: number;
  [field: string]: FrappeDocValue;
}

/**
 * Child table row in a document (wire protocol specific)
 * This is different from the general ChildTableRow type as it includes
 * parent relationship fields required by the Frappe wire protocol.
 */
export interface WireChildTableRow {
  name: string;
  idx: number;
  parent: string;
  parenttype: string;
  parentfield: string;
  [field: string]: FrappeDocValue;
}

/**
 * Create operation success response
 */
export interface CreateResponse extends DocumentResponse {
  _idempotent_replay?: boolean;
}

/**
 * Update operation success response
 */
export interface UpdateResponse extends DocumentResponse {
  _idempotent_replay?: boolean;
}

/**
 * Delete operation success response
 */
export interface DeleteResponse {
  message: string;
  _idempotent_replay?: boolean;
}

/**
 * List since (backfill) response
 */
export interface ListSinceResponse<T = DocumentResponse> {
  rows: T[];
  checkpoint?: string;
  deleted?: {
    doctype: string;
    name: string;
  }[];
}

// Error Response Types

/**
 * Base error response structure
 */
export interface ErrorResponse {
  exc_type?: string;
  exception?: string;
  _server_messages?: string;
}

/**
 * Version conflict error (409)
 */
export interface ConflictErrorResponse extends ErrorResponse {
  error: 'VERSION_MISMATCH';
  message: string;
  current_version?: string;
  current_doc?: DocumentResponse;
}

/**
 * Precondition failed error (412)
 */
export interface PreconditionFailedResponse extends ErrorResponse {
  error: 'PRECONDITION_FAILED';
  message: string;
  current_etag?: string;
}

/**
 * Validation error (400)
 */
export interface ValidationErrorResponse extends ErrorResponse {
  exc_type: 'ValidationError';
  exception: string;
}

/**
 * Permission error (403)
 */
export interface PermissionErrorResponse extends ErrorResponse {
  exc_type: 'PermissionError';
  exception: string;
}

/**
 * Not found error (404)
 */
export interface NotFoundErrorResponse extends ErrorResponse {
  exc_type: 'DoesNotExistError';
  exception: string;
}

// Realtime Event Types (Socket.IO)

/**
 * Document changed realtime event
 * Emitted when a document is created or updated
 */
export interface DocChangedEvent {
  event: 'doc_changed';
  message: {
    doctype: string;
    name: string;
    modified?: string;
    modified_by?: string;
  };
}

/**
 * Document deleted realtime event
 * Emitted when a document is deleted
 */
export interface DocDeletedEvent {
  event: 'doc_deleted';
  message: {
    doctype: string;
    name: string;
  };
}

/**
 * Permission epoch bump event
 * Emitted when permissions are changed, requiring cache invalidation
 */
export interface PermEpochBumpEvent {
  event: 'perm_epoch_bump';
  message: {
    epoch: number;
  };
}

/**
 * Document subscribe event
 * Sent to server to subscribe to document updates
 */
export interface DocSubscribeEvent {
  event: 'doc_subscribe';
  doctype: string;
  name: string;
}

/**
 * Document unsubscribe event
 * Sent to server to unsubscribe from document updates
 */
export interface DocUnsubscribeEvent {
  event: 'doc_unsubscribe';
  doctype: string;
  name: string;
}

/**
 * List subscribe event
 * Sent to server to subscribe to list updates
 */
export interface ListSubscribeEvent {
  event: 'list_subscribe';
  doctype: string;
  filters?: Filters;
}

/**
 * List unsubscribe event
 * Sent to server to unsubscribe from list updates
 */
export interface ListUnsubscribeEvent {
  event: 'list_unsubscribe';
  doctype: string;
}

/**
 * List update event
 * Emitted when a list view should be refreshed
 */
export interface ListUpdateEvent {
  event: 'list_update';
  message: {
    doctype: string;
    modified?: string;
  };
}

/**
 * Task progress event
 * Emitted for background task progress updates
 */
export interface TaskProgressEvent {
  event: 'task_progress';
  message: {
    task_id: string;
    percent?: number;
    description?: string;
  };
}

/**
 * Version update event
 * Emitted when Frappe version is updated
 */
export interface VersionUpdateEvent {
  event: 'version_update';
  message: {
    version: string;
    release_notes?: string;
  };
}

/**
 * Generic message event
 * For custom server-to-client messages
 */
export interface MessageEvent {
  event: 'message';
  message: {
    type?: string;
    content: unknown;
  };
}

/**
 * Socket.IO connection event
 */
export interface ConnectEvent {
  event: 'connect';
  sid: string;
}

/**
 * Socket.IO disconnection event
 */
export interface DisconnectEvent {
  event: 'disconnect';
  reason?: string;
}

/**
 * Socket.IO error event
 */
export interface ConnectErrorEvent {
  event: 'connect_error';
  error: Error;
}

/**
 * All possible realtime events from server
 */
export type RealtimeServerEvent =
  | DocChangedEvent
  | DocDeletedEvent
  | PermEpochBumpEvent
  | ListUpdateEvent
  | TaskProgressEvent
  | VersionUpdateEvent
  | MessageEvent
  | ConnectEvent
  | DisconnectEvent
  | ConnectErrorEvent;

/**
 * All possible realtime events to server
 */
export type RealtimeClientEvent = DocSubscribeEvent | DocUnsubscribeEvent | ListSubscribeEvent | ListUnsubscribeEvent;

/**
 * All possible realtime events
 */
export type RealtimeEvent = RealtimeServerEvent | RealtimeClientEvent;

// HTTP Method Types

/**
 * Wire protocol operation endpoints
 */
export interface WireEndpoints {
  create: string;
  update: string;
  delete: string;
  backfill: string;
}

/**
 * Default wire endpoints
 */
export const defaultWireEndpoints: WireEndpoints = {
  create: 'my_app.api.create_doc',
  update: 'my_app.api.update_doc',
  delete: 'my_app.api.delete_doc',
  backfill: 'my_app.api.backfill',
};

// Wire Protocol Contracts

/**
 * Complete wire protocol contract for a create operation
 */
export interface CreateWireContract {
  request: {
    method: 'POST';
    endpoint: string;
    headers: MutationRequestHeaders;
    body: CreateRequestBody;
  };
  response: {
    success: CreateResponse;
    conflict?: ConflictErrorResponse;
    validation?: ValidationErrorResponse;
    permission?: PermissionErrorResponse;
  };
}

/**
 * Complete wire protocol contract for an update operation
 */
export interface UpdateWireContract {
  request: {
    method: 'POST';
    endpoint: string;
    headers: MutationRequestHeaders;
    body: UpdateRequestBody;
  };
  response: {
    success: UpdateResponse;
    conflict?: ConflictErrorResponse;
    preconditionFailed?: PreconditionFailedResponse;
    validation?: ValidationErrorResponse;
    permission?: PermissionErrorResponse;
    notFound?: NotFoundErrorResponse;
  };
}

/**
 * Complete wire protocol contract for a delete operation
 */
export interface DeleteWireContract {
  request: {
    method: 'POST';
    endpoint: string;
    headers: MutationRequestHeaders;
    body: DeleteRequestBody;
  };
  response: {
    success: DeleteResponse;
    permission?: PermissionErrorResponse;
    notFound?: NotFoundErrorResponse;
  };
}

/**
 * Complete wire protocol contract for list since operation
 */
export interface ListSinceWireContract<T = DocumentResponse> {
  request: {
    method: 'GET';
    endpoint: string;
    params: ListSinceParams;
  };
  response: {
    success: ListSinceResponse<T>;
    permission?: PermissionErrorResponse;
  };
}

// Utility Types

/**
 * Extract success response type from a wire contract
 */
export type WireSuccess<T> = T extends { response: { success: infer S } } ? S : never;

/**
 * Extract error response types from a wire contract
 */
export type WireErrors<T> = T extends { response: infer R }
  ? R extends { success: unknown }
    ? Exclude<R[keyof R], R['success']>
    : never
  : never;

/**
 * Type guard for conflict error
 */
export const isConflictError = (err: unknown): err is ConflictErrorResponse =>
  hasField(err, 'error') && err.error === 'VERSION_MISMATCH';

/**
 * Type guard for precondition failed error
 */
export const isPreconditionFailedError = (err: unknown): err is PreconditionFailedResponse =>
  hasField(err, 'error') && err.error === 'PRECONDITION_FAILED';

/**
 * Type guard for validation error
 */
export const isValidationError = (err: unknown): err is ValidationErrorResponse =>
  hasField(err, 'exc_type') && err.exc_type === 'ValidationError';

/**
 * Type guard for permission error
 */
export const isPermissionError = (err: unknown): err is PermissionErrorResponse =>
  hasField(err, 'exc_type') && err.exc_type === 'PermissionError';

/**
 * Type guard for not found error
 */
export const isNotFoundError = (err: unknown): err is NotFoundErrorResponse =>
  hasField(err, 'exc_type') && err.exc_type === 'DoesNotExistError';
