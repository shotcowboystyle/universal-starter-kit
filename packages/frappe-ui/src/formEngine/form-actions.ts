/**
 * Desk form RPC helpers — thin wrappers over the whitelisted methods the
 * stock desk form view calls. Every payload here was probed against a live
 * bench (frappe v15) before implementation:
 *
 *   frappe.desk.form.assign_to.add        {doctype, name, assign_to: [..], description?}
 *   frappe.desk.form.assign_to.remove     {doctype, name, assign_to: "user"}
 *   frappe.desk.form.utils.add_comment    {reference_doctype, reference_name, content,
 *                                          comment_email, comment_by}
 *   frappe.desk.doctype.tag.tag.add_tag   {tag, dt, dn}
 *   frappe.desk.doctype.tag.tag.remove_tag{tag, dt, dn}
 *   frappe.desk.like.toggle_like          {doctype, name, add: "Yes"|"No"}
 *   frappe.desk.form.document_follow.follow_document / unfollow_document
 *                                         {doctype, doc_name, user}
 *   frappe.model.rename_doc.update_document_title
 *                                         {doctype, docname, name, merge: 0} → new name
 *                                         (what desk calls — syncs the title field too)
 *   frappe.client.submit                  {doc} (full doc incl. modified — OCC enforced)
 *   frappe.client.cancel                  {doctype, name}
 *   frappe.client.get_count               {doctype, filters}
 *   frappe.client.validate_link           {doctype, docname, fields: [..]} →
 *                                         {name, <field>: value} (fetch_from preview)
 *   frappe.core.doctype.communication.email.make
 *                                         {doctype, name, recipients, subject, content,
 *                                          send_email: 1}
 *   frappe.desk.form.utils.remove_attach  {fid, dt, dn}
 */

import { HttpClient, FileModule } from '@repo/frappe';
import type { AuthConfig, FixtureProvider } from '@repo/frappe';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Frappe docs and RPC payloads are DocType/method-defined JSON
type JsonObject = Record<string, unknown>;

/**
 * Connection shape shared by every form loader/action — structurally
 * compatible with frappe-ui's FrappeConfig and the frappe package's
 * UseFrappeCollectionConfig (function tokens included).
 */
export interface FrappeConnection {
  baseURL: string;
  /** False keeps HTTP reads without realtime subscriptions. */
  realtime?: boolean;
  socketPort?: number;
  /** Same-origin socket override (see FrappeConfig.socketBaseURL). */
  socketBaseURL?: string;
  /** Frappe site name — the realtime Socket.IO namespace. */
  siteName?: string;
  auth?: {
    useToken?: boolean;
    token?: string | (() => string | Promise<string>);
    type?: string;
  };
  // oxlint-disable-next-line typescript/no-explicit-any -- matches FrappeConfig.syncOptions; hosts also pass untyped option bags
  syncOptions?: any;
  fixtures?: FixtureProvider;
}

export const createHttpClient = (connection: FrappeConnection): HttpClient => {
  const auth: AuthConfig | undefined = connection.auth
    ? {
        useToken: connection.auth.useToken,
        token: connection.auth.token,
        // SAFETY: HttpClient only compares `type` against AuthType.Token; any other string falls back to Bearer
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        type: connection.auth.type as AuthConfig['type'],
      }
    : undefined;
  return new HttpClient(connection.baseURL, auth);
};

const post = async <T = unknown>(http: HttpClient, method: string, body: JsonObject): Promise<T | undefined> => {
  const response = await http.post<{ message?: T }>(`/api/method/${method}`, body);
  return response.payload?.message;
};

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export const addAssignment = async (
  http: HttpClient,
  doctype: string,
  name: string,
  users: string[],
  description?: string,
) =>
  await post(http, 'frappe.desk.form.assign_to.add', {
    doctype,
    name,
    assign_to: users,
    description: description ?? undefined,
  });

export const removeAssignment = async (http: HttpClient, doctype: string, name: string, user: string) =>
  await post(http, 'frappe.desk.form.assign_to.remove', { doctype, name, assign_to: user });

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const addComment = async (
  http: HttpClient,
  args: {
    doctype: string;
    name: string;
    content: string;
    commentEmail: string;
    commentBy?: string;
  },
) =>
  await post(http, 'frappe.desk.form.utils.add_comment', {
    reference_doctype: args.doctype,
    reference_name: args.name,
    content: args.content,
    comment_email: args.commentEmail,
    comment_by: args.commentBy ?? args.commentEmail,
  });

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const addTag = async (http: HttpClient, doctype: string, name: string, tag: string) =>
  await post(http, 'frappe.desk.doctype.tag.tag.add_tag', { tag, dt: doctype, dn: name });

export const removeTag = async (http: HttpClient, doctype: string, name: string, tag: string) =>
  await post(http, 'frappe.desk.doctype.tag.tag.remove_tag', { tag, dt: doctype, dn: name });

// ---------------------------------------------------------------------------
// Like / Follow
// ---------------------------------------------------------------------------

export const toggleLike = async (http: HttpClient, doctype: string, name: string, add: boolean) =>
  await post(http, 'frappe.desk.like.toggle_like', {
    doctype,
    name,
    add: add ? 'Yes' : 'No',
  });

export const followDocument = async (http: HttpClient, doctype: string, name: string, user: string) =>
  await post(http, 'frappe.desk.form.document_follow.follow_document', {
    doctype,
    doc_name: name,
    user,
  });

export const unfollowDocument = async (http: HttpClient, doctype: string, name: string, user: string) =>
  await post(http, 'frappe.desk.form.document_follow.unfollow_document', {
    doctype,
    doc_name: name,
    user,
  });

// ---------------------------------------------------------------------------
// Document lifecycle
// ---------------------------------------------------------------------------

/**
 * Rename a document; resolves with the new name. Uses desk's own
 * `update_document_title` (handles title-field sync; the bare
 * `frappe.rename_doc` does not). Pass a `title` argument instead of `name`
 * to retitle without renaming — not needed here yet.
 */
export const renameDoc = async (
  http: HttpClient,
  doctype: string,
  oldName: string,
  newName: string,
): Promise<string> => {
  const result = await post<string>(http, 'frappe.model.rename_doc.update_document_title', {
    doctype,
    docname: oldName,
    name: newName,
    merge: 0,
  });
  return result ?? newName;
};

/** Submit a saved draft (docstatus 0 → 1). Requires the current full doc for OCC. */
export const submitDoc = async (http: HttpClient, doc: JsonObject) =>
  await post<JsonObject>(http, 'frappe.client.submit', { doc });

/** Cancel a submitted doc (docstatus 1 → 2). */
export const cancelDoc = async (http: HttpClient, doctype: string, name: string) =>
  await post<JsonObject>(http, 'frappe.client.cancel', { doctype, name });

/** Direct REST insert — returns the created doc (with its server-issued name). */
export const insertDoc = async (http: HttpClient, doctype: string, values: JsonObject): Promise<JsonObject> => {
  const response = await http.post<{ data?: JsonObject }>(`/api/resource/${encodeURIComponent(doctype)}`, values);
  const data = response.payload?.data;
  if (!data) {
    throw new Error(`Insert into ${doctype} returned no document`);
  }
  return data;
};

/**
 * Validate a link value and fetch columns off the linked doc in one call —
 * what desk's Link control uses to drive fetch_from previews. Resolves with
 * `{name, <field>: value, ...}`; rejects when the target doc is missing.
 */
export const validateLink = async (
  http: HttpClient,
  doctype: string,
  docname: string,
  fields: string[],
): Promise<JsonObject> => {
  const result = await post<JsonObject>(http, 'frappe.client.validate_link', {
    doctype,
    docname,
    fields,
  });
  return result ?? {};
};

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export const getCount = async (http: HttpClient, doctype: string, filters: JsonObject): Promise<number> => {
  const response = await http.get<{ message?: number }>('/api/method/frappe.client.get_count', {
    doctype,
    filters: JSON.stringify(filters),
  });
  return response.payload?.message ?? 0;
};

let cachedUser: string | undefined;
export const getLoggedUser = async (http: HttpClient): Promise<string> => {
  if (cachedUser !== undefined && cachedUser !== '') {
    return cachedUser;
  }
  const response = await http.get<{ message?: string }>('/api/method/frappe.auth.get_logged_user');
  cachedUser = response.payload?.message ?? 'Guest';
  return cachedUser;
};

export const removeAttachment = async (http: HttpClient, fileId: string, doctype: string, name: string) =>
  await post(http, 'frappe.desk.form.utils.remove_attach', { fid: fileId, dt: doctype, dn: name });

export const uploadAttachment = async (http: HttpClient, file: File | Blob, doctype: string, name: string) => {
  const files = new FileModule(http);
  return await files.uploadFile(file, { doctype, docname: name });
};

export const sendEmail = async (
  http: HttpClient,
  args: {
    doctype: string;
    name: string;
    recipients: string;
    subject: string;
    content: string;
  },
) =>
  await post(http, 'frappe.core.doctype.communication.email.make', {
    doctype: args.doctype,
    name: args.name,
    recipients: args.recipients,
    subject: args.subject,
    content: args.content,
    send_email: 1,
  });
