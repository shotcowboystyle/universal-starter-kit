/**
 * Optimistic comment writes for timeline surfaces (frappe-ui Timeline and
 * the backoffice FormTimeline).
 *
 * Server-side parity ruling: the desk RPCs are KEPT as the transport,
 * wrapped in engine mutations via `mutation.execute`. A plain live
 * `create_doc` on Comment is NOT equivalent to
 * `frappe.desk.form.utils.add_comment` — upstream, add_comment inserts
 * with ignore_permissions (any user who can read the reference doc may
 * comment, without Comment-create permission) and extracts inline images
 * into Files. Losing either silently would be a regression, so the RPC
 * stays; the engine supplies optimism, journaling, temp→real remap, and
 * rollback around it. In fixture mode there is no desk endpoint, so the
 * engine's default REST-shape path (FixtureDbModule) is used instead.
 */
import { FrappeApp, Operation, getFrappeSyncModule } from '@repo/frappe';
import type { FrappeDoc, FrappeDocData, UseFrappeCollectionConfig } from '@repo/frappe';
import { useMemo } from 'react';

type CommentDoc = FrappeDoc<FrappeDocData>;

export interface AddCommentInput {
  content: string;
  /** Session user's email (`comment_email` on the Comment). */
  email: string;
  /** Display name (`comment_by`); falls back to the email. */
  fullname?: string;
}

export interface FrappeCommentActions {
  /**
   * Inserts a comment optimistically: the row paints from the in-memory
   * store immediately under a `local:` identity, the desk RPC runs in the
   * background, and the ack remaps to the server-assigned name (the
   * realtime echo then reconciles idempotently). On rejection the row is
   * rolled back and the failure lands in the mutation ledger
   * (`useFrappePendingMutations` + `SyncErrorNotice`).
   */
  addComment: (input: AddCommentInput) => Promise<void>;
  /** Optimistic content edit via `frappe.desk.form.utils.update_comment`. */
  updateComment: (commentName: string, content: string) => Promise<void>;
  /** Optimistic delete via `frappe.client.delete`. */
  deleteComment: (commentName: string) => Promise<void>;
}

const nowFrappeTimestamp = (): string =>
  // Frappe timestamps are "YYYY-MM-DD HH:mm:ss.SSSSSS" naive datetimes.
  new Date().toISOString().replace('T', ' ').replace('Z', '');

/**
 * Builds the optimistic comment actions for one referenced document. The
 * mutations run through the shared sync engine, so any mounted Comment
 * collection (frappe-ui Timeline, backoffice FormTimeline) repaints
 * optimistically without extra wiring.
 */
export const useFrappeCommentActions = (
  config: UseFrappeCollectionConfig | undefined,
  doctype: string,
  docname: string,
): FrappeCommentActions =>
  useMemo(() => {
    const baseURL = config?.baseURL;
    const hasBench = baseURL !== undefined && baseURL !== '' && !config?.fixtures;
    // SAFETY: the collection auth block carries the same token/session fields FrappeApp reads from its config
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- widened only to hand the auth block to FrappeApp
    const auth = (config?.auth ?? {}) as Record<string, unknown>;
    const app = hasBench ? new FrappeApp(baseURL, auth) : undefined;

    const requireSync = () => {
      const sync = getFrappeSyncModule(config);
      if (!sync) {
        throw new Error('Frappe connection is not available');
      }
      return sync;
    };

    const addComment = async ({ content, email, fullname }: AddCommentInput) => {
      const sync = requireSync();
      const doc: CommentDoc = {
        doctype: 'Comment',
        name: `local:${crypto.randomUUID()}`,
        comment_type: 'Comment',
        reference_doctype: doctype,
        reference_name: docname,
        content,
        comment_email: email,
        comment_by: fullname ?? email,
        owner: email,
        creation: nowFrappeTimestamp(),
        modified: nowFrappeTimestamp(),
      };
      await sync.mutate({
        mutationId: crypto.randomUUID(),
        operation: Operation.Create,
        doc,
        execute: app
          ? async () => {
              const response = await app.call().post<{ message?: CommentDoc }>('frappe.desk.form.utils.add_comment', {
                reference_doctype: doctype,
                reference_name: docname,
                content,
                comment_email: email,
                comment_by: fullname ?? email,
              });
              const payload = response?.payload;
              // SAFETY: add_comment answers either `{ message: doc }` or the bare doc; the name check below rejects anything else
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
              const created = payload?.message ?? (payload as CommentDoc | undefined);
              if (created?.name === undefined || created.name === '') {
                throw new Error('add_comment returned no document');
              }
              return created;
            }
          : undefined,
      });
    };

    const updateComment = async (commentName: string, content: string) => {
      const sync = requireSync();
      await sync.mutate({
        mutationId: crypto.randomUUID(),
        operation: Operation.Update,
        // SAFETY: an Update mutation merges these fields over the stored Comment row
        doc: { doctype: 'Comment', name: commentName, content } as CommentDoc,
        execute: app
          ? async () => {
              await app.call().post('frappe.desk.form.utils.update_comment', {
                name: commentName,
                content,
              });
              // update_comment returns no document — the optimistic value
              // stands until the realtime echo reconciles.
            }
          : undefined,
      });
    };

    const deleteComment = async (commentName: string) => {
      const sync = requireSync();
      await sync.mutate({
        mutationId: crypto.randomUUID(),
        operation: Operation.Delete,
        // SAFETY: a Delete mutation reads only the doctype and name of the stored Comment row
        doc: { doctype: 'Comment', name: commentName } as CommentDoc,
        execute: app
          ? async () => {
              await app.call().post('frappe.client.delete', {
                doctype: 'Comment',
                name: commentName,
              });
            }
          : undefined,
      });
    };

    return { addComment, updateComment, deleteComment };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- hosts pass a fresh config object per render; keying on the bench URL and corpus keeps the actions stable
  }, [config?.baseURL, config?.fixtures, doctype, docname]);
