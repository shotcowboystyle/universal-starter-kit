// RPC helpers behind the list bulk actions (probed against a stock bench):
// - delete: per-row REST delete so per-row failures are reportable
//   (frappe.desk.reportview.delete_items exists but swallows failures)
// - assign: frappe.desk.form.assign_to.add_multiple
//   {doctype, name: JSON names[], assign_to: JSON users[], description}
// - tags: frappe.desk.doctype.tag.tag.add_tag {tag, dt, dn} per document
// - like: frappe.desk.like.toggle_like {doctype, name, add: "Yes"|"No"}
import type { FrappeApp } from '@repo/frappe';

export interface BulkFailure {
  name: string;
  message: string;
}

export interface BulkResult {
  succeeded: string[];
  failed: BulkFailure[];
}

function toMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return String(reason);
}

async function settlePerDoc(names: string[], run: (name: string) => Promise<unknown>): Promise<BulkResult> {
  const settled = await Promise.allSettled(names.map(async (name) => await run(name)));
  const result: BulkResult = { succeeded: [], failed: [] };
  settled.forEach((outcome, index) => {
    const name = names[index];
    if (outcome.status === 'fulfilled') {
      result.succeeded.push(name);
    } else {
      result.failed.push({ name, message: toMessage(outcome.reason) });
    }
  });
  return result;
}

/** Delete each document; failures are collected per row, not thrown. */
export async function bulkDelete(app: FrappeApp, doctype: string, names: string[]): Promise<BulkResult> {
  return await settlePerDoc(names, async (name) => await app.db().deleteDoc({ doctype, name }));
}

/** Assign users to every selected document (desk ToDo assignments). */
export async function bulkAssign(
  app: FrappeApp,
  doctype: string,
  names: string[],
  assignTo: string[],
  description?: string,
): Promise<void> {
  await app.call().post('frappe.desk.form.assign_to.add_multiple', {
    doctype,
    name: JSON.stringify(names),
    assign_to: JSON.stringify(assignTo),
    ...(description ? { description } : {}),
  });
}

/** Add a tag to every selected document; per-row failures collected.
 * Sequential on purpose: parallel `add_tag` calls race on creating the Tag
 * master for a brand-new tag — every call but the winner fails with
 * DuplicateEntry (verified against the live bench: 2 selected docs, only one
 * got the new tag). The first call creates the master; the rest reuse it. */
export async function bulkAddTag(app: FrappeApp, doctype: string, names: string[], tag: string): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] };
  for (const name of names) {
    try {
      await app.call().post('frappe.desk.doctype.tag.tag.add_tag', { tag, dt: doctype, dn: name });
      result.succeeded.push(name);
    } catch (error) {
      result.failed.push({ name, message: toMessage(error) });
    }
  }
  return result;
}

/** Toggle the session user's like on a document. */
export async function toggleLike(app: FrappeApp, doctype: string, name: string, liked: boolean): Promise<void> {
  await app.call().post('frappe.desk.like.toggle_like', {
    doctype,
    name,
    add: liked ? 'Yes' : 'No',
  });
}
