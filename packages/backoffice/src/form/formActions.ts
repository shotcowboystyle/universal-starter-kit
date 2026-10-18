/**
 * Desk RPC helpers — moved to
 * `@repo/frappe-ui/src/formEngine/formActions` (MPO-15),
 * because useFormEngine consumes them and the engine now lives there.
 *
 * Deep-import only on both sides: these utility names collide with the list
 * and shell surfaces, so neither barrel carries them.
 */

// Dedicated "./formActions" subpath (see frappe-ui package.json exports),
// following the ./dependsOn precedent: a deep, extension-less
// "@repo/frappe-ui/src/*" import does NOT resolve under the
// storybook workspace aliases (bare-name alias -> src/index.ts).
export {
  addAssignment,
  addComment,
  addTag,
  cancelDoc,
  createHttpClient,
  followDocument,
  getCount,
  getLoggedUser,
  insertDoc,
  removeAssignment,
  removeAttachment,
  removeTag,
  renameDoc,
  sendEmail,
  submitDoc,
  toggleLike,
  unfollowDocument,
  uploadAttachment,
  validateLink,
  type FrappeConnection,
} from '@repo/frappe-ui/formActions';
