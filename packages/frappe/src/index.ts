/**
 * Frappe SDK with TanStack DB Integration
 *
 * Production-ready SDK with modular architecture and enterprise features.
 * Uses TanStack DB for reactive collections, live queries, and optimistic mutations.
 */

// Core Frappe functionality
export { FrappeApp } from './frappeApp';
export type { FrappeConfig } from './frappeApp';
export {
  frappeDocLoader,
  frappeListLoader,
  loadDoc,
  loadDocList,
  serverFrappeBaseURL,
  type FrappeLoaderRequest,
  type FrappeRouteLoaderProps,
  type LoadDocListOptions,
  type LoadDocOptions,
} from './serverLoaders';
export { AuthModule } from './auth';
export { CallModule } from './call';
export { DbModule } from './db';
export { FileModule } from './file';
export { RealtimeModule, RealtimePlatform } from './realtime';
export type {
  RealtimeConfig,
  RealtimeTransport,
  RealtimeSSEConfig,
  SSEFrame,
  SSEMappedEvent,
  SSEMessageEventLike,
  SSEEventSourceLike,
  SSEEventSourceConstructor,
  DocRoom,
  ListRoom,
} from './realtime';
export { SyncModule } from './sync';

// TanStack DB collection integration
export {
  createFrappeCollection,
  frappeCollectionOptions,
  createFixtureCollection,
  fixtureCollectionOptions,
} from './collection';
export type { FrappeCollectionOptionsConfig, FixtureCollectionOptionsConfig } from './collection';
export {
  createOptimisticAction,
  isOptimisticTempId,
  newOptimisticTempId,
  OPTIMISTIC_TEMP_PREFIX,
  runOptimisticRpc,
} from './optimistic';
export type { OptimisticRpcContext, OptimisticRpcOptions } from './optimistic';

// React hooks for Frappe + TanStack DB
export {
  useFrappeCollection,
  useFrappeCatchUp,
  useFrappeConnection,
  useFrappeDoctypeEvents,
  useFrappePendingMutations,
  useInfiniteScroll,
  useFrappeInfiniteList,
  getFrappeSyncModule,
  __getActiveSyncModule,
} from './frappeReact';
export type {
  FrappeConnectionState,
  UseFrappeCatchUpResult,
  UseFrappeCollectionConfig,
  UseFrappePendingMutationsResult,
  UseInfiniteScrollConfig,
  UseInfiniteScrollResult,
  UseFrappeInfiniteListConfig,
  UseFrappeInfiniteListResult,
} from './frappeReact';
export type { SyncRealtimeEvent, SubscriptionRefreshOptions, SubscriptionRefreshResult } from './sync';

// TanStack Pacer utilities for Frappe
export { useDebouncedSearch, useThrottledPagination, createRateLimitedBatch } from './pacer';
export type {
  DebouncedSearchOptions,
  DebouncedSearchResult,
  FrappeConnectionConfig,
  ThrottledPaginationOptions,
  ThrottledPaginationResult,
  RateLimitedBatchOptions,
  RateLimitedBatchHandle,
} from './pacer';

// Re-export TanStack DB React hooks (SSR-safe wrapper)
export { useLiveQuery } from './useLiveQuery';
export { createCollection, createTransaction } from '@tanstack/db';

// Re-export TanStack DB query builder functions
export {
  eq,
  gt,
  gte,
  lt,
  lte,
  and,
  or,
  not,
  inArray,
  like,
  ilike,
  isUndefined,
  isNull,
  count,
  avg,
  sum,
  min,
  max,
} from '@tanstack/db';

// Re-export TanStack Pacer primitives
export {
  Debouncer,
  AsyncDebouncer,
  Throttler,
  AsyncThrottler,
  RateLimiter,
  AsyncRateLimiter,
  Queuer,
  AsyncQueuer,
  Batcher,
  AsyncBatcher,
  debounce,
  asyncDebounce,
  throttle,
  asyncThrottle,
  rateLimit,
  asyncRateLimit,
  queue,
  asyncQueue,
  batch,
  asyncBatch,
} from '@tanstack/pacer';

// Fixture support for testing
export * from './fixtures';

// Core infrastructure exports (for advanced users)
export {
  HttpClient,
  getCookie,
  setCookie,
  deleteCookie,
  setSSRCookies,
  clearSSRCookies,
  invalidateCookieCache,
} from './core/http';
export { readServerMessages, serverMessageLines } from './core/serverMessages';
// FrappeError is a class (runtime value) — consumers catch/instanceof it.
export { FrappeError } from './core/types';
export type { AuthConfig, ListOptions, CustomEndpoints, FrappeLiveConfig, WriteStrategy } from './core/types';

// frappe_live extension types
export type {
  BackfillArgs,
  BackfillResponse,
  CursorPaginationArgs,
  CursorPaginationResponse,
  BatchMutationType,
  BatchMutation,
  BatchMutationsArgs,
  BatchMutationResult,
  BatchMutationsResponse,
  ListSinceArgs,
  ListSinceResponse,
} from './db';

// DocType metadata hooks
export {
  useDocTypeMeta,
  useLinkSearch,
  useLinkTitle,
  useDocTypeSearch,
  parseDependsOn,
  parseFormLayout,
  stockFieldTypes,
  customFieldTypes,
  frappeFieldTypes,
} from './doctype';
export type {
  DocTypeMeta,
  DocTypeField,
  DocTypePermission,
  DocTypeLink,
  FormSection,
  FormColumn,
  FrappeFieldType,
  LinkSearchResult,
  LinkSearchOptions,
  DocTypeSearchResult,
} from './doctype';

// Common types
export type { FrappeDocValue, FrappeDocData, FrappeDoc, ChildTableRow } from './common/types';

// Sync types with advanced features
export type {
  SyncOptions,
  SyncCatchUpState,
  PageBoundaries,
  RehydrationStrategy,
  Mutation,
  CreateMutation,
  UpdateMutation,
  DeleteMutation,
  ConnectionConfig,
  TabCoordinationConfig,
  TabMessage,
  FrappeDebugState,
  DebugSubscription,
  DebugMutationEntry,
  PageIsland,
} from './sync/types';
export { defaultPageLength, Order, Operation } from './sync/types';
export { MergeStrategy, FieldMergeStrategy } from './sync/merge';
export type { FieldMergeStrategyOrFunction, MergeConfig, MergeResult } from './sync/merge';

// Filter utilities
export {
  matchesFilters,
  validateFilters,
  normalizeFilters,
  extractFilterFields,
  extractSingleName,
  formatFilter,
  hasServerOnlyOperators,
  canEvaluateClientSide,
  isTreeOperator,
  getClientEvaluationBlockers,
  FilterOperator,
} from './sync/filters';
export type {
  Filters,
  FilterTuple,
  FilterObject,
  FilterValue,
  FilterValidationResult,
  FilterValidationError,
} from './sync/filters';

// Tree DocType support
export { TreeDbModule } from './db';
export type { GetTreeChildrenArgs, GetTreeAncestorsArgs, GetTreeDescendantsArgs, TreeNode } from './db';

// TypeScript Language Service Plugin
export { default as frappePlugin } from './plugin';
