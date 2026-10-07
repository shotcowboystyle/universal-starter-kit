/**
 * Metro file fallback for `@repo/node-graph/model` (MPO-185).
 *
 * `exports["./model"]` resolves into `dist/`, which is never built for a
 * source-consumed workspace package. Metro does not reconsider `source` or
 * `default` when the condition it picked is missing: it warns and retries a
 * plain file lookup at `<pkg>/model.*`, which is this file.
 */
export * from './src/model/index';
