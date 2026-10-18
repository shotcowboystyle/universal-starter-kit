import type { FrappeApp } from '@repo/frappe';
/**
 * Sidebar mutation RPCs — thin wrappers over the whitelisted desk methods,
 * every payload probed against the live bench (frappe v15) 2026-08-12:
 *
 *   frappe.desk.form.assign_to.add        {doctype, name, assign_to: ["user"], description?}
 *                                         → message: [{owner, name}]
 *   frappe.desk.form.assign_to.remove     {doctype, name, assign_to: "user"} → message: [...]
 *   frappe.desk.doctype.tag.tag.add_tag   {tag, dt, dn} → message: "<tag>"
 *   frappe.desk.doctype.tag.tag.remove_tag{tag, dt, dn} → {}
 *   frappe.desk.doctype.tag.tag.get_tags  {doctype, txt} → message: string[]
 *   frappe.desk.like.toggle_like          {doctype, name, add: "Yes"|"No"} → {}
 *   frappe.share.add                      {doctype, name, user, read, write, share, notify}
 *                                         → message: DocShare doc
 *   frappe.share.set_permission           {doctype, name, user, permission_to: "read", value: 0}
 *                                         removes the share (share.remove is NOT whitelisted)
 *   frappe.desk.form.document_follow.follow_document / unfollow_document
 *                                         {doctype, doc_name, user} (no-op when document
 *                                         follow is disabled server-side)
 *   upload_file (multipart via app.file()) {file, doctype, docname} → message: File doc
 *   frappe.desk.form.utils.remove_attach  {fid, dt, dn} → {}
 *   frappe.auth.get_logged_user           → message: "Administrator"
 */
import React, { useEffect, useState } from 'react';

interface MessagePayload<T = unknown> {
  message?: T;
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/** frappe.desk.form.assign_to.add arguments. */
interface AssignToAddBody {
  doctype: string;
  name: string;
  assign_to: string[];
  description?: string;
}

export const addAssignment = async (
  app: FrappeApp,
  doctype: string,
  name: string,
  users: string[],
  description?: string,
): Promise<void> => {
  const body: AssignToAddBody = {
    doctype,
    name,
    assign_to: users,
  };
  if (description !== undefined && description !== '') {
    body.description = description;
  }
  await app.call().post<MessagePayload>('frappe.desk.form.assign_to.add', body);
};

export const removeAssignment = async (app: FrappeApp, doctype: string, name: string, user: string): Promise<void> => {
  await app.call().post<MessagePayload>('frappe.desk.form.assign_to.remove', {
    doctype,
    name,
    assign_to: user,
  });
};

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const addTag = async (app: FrappeApp, doctype: string, name: string, tag: string): Promise<void> => {
  await app.call().post<MessagePayload<string>>('frappe.desk.doctype.tag.tag.add_tag', {
    tag,
    dt: doctype,
    dn: name,
  });
};

export const removeTag = async (app: FrappeApp, doctype: string, name: string, tag: string): Promise<void> => {
  await app.call().post<MessagePayload>('frappe.desk.doctype.tag.tag.remove_tag', {
    tag,
    dt: doctype,
    dn: name,
  });
};

/** All existing tag names for the doctype (sidebar add-tag suggestions). */
export const fetchTagSuggestions = async (app: FrappeApp, doctype: string): Promise<string[]> => {
  const res = await app
    .call()
    .get<MessagePayload<string[]>>('frappe.desk.doctype.tag.tag.get_tags', { doctype, txt: '' });
  return res.payload?.message ?? [];
};

// ---------------------------------------------------------------------------
// Like / Follow
// ---------------------------------------------------------------------------

export const toggleLike = async (app: FrappeApp, doctype: string, name: string, add: boolean): Promise<void> => {
  await app.call().post<MessagePayload>('frappe.desk.like.toggle_like', {
    doctype,
    name,
    add: add ? 'Yes' : 'No',
  });
};

export const followDocument = async (app: FrappeApp, doctype: string, name: string, user: string): Promise<void> => {
  await app.call().post<MessagePayload>('frappe.desk.form.document_follow.follow_document', {
    doctype,
    doc_name: name,
    user,
  });
};

export const unfollowDocument = async (app: FrappeApp, doctype: string, name: string, user: string): Promise<void> => {
  await app.call().post<MessagePayload>('frappe.desk.form.document_follow.unfollow_document', {
    doctype,
    doc_name: name,
    user,
  });
};

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

export const addShare = async (
  app: FrappeApp,
  doctype: string,
  name: string,
  user: string,
  options: { write?: boolean } = {},
): Promise<void> => {
  await app.call().post<MessagePayload>('frappe.share.add', {
    doctype,
    name,
    user,
    read: 1,
    write: options.write ? 1 : 0,
    share: 0,
    notify: 0,
  });
};

/** Dropping read cascades server-side and deletes the DocShare row. */
export const removeShare = async (app: FrappeApp, doctype: string, name: string, user: string): Promise<void> => {
  await app.call().post<MessagePayload>('frappe.share.set_permission', {
    doctype,
    name,
    user,
    permission_to: 'read',
    value: 0,
  });
};

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export const uploadAttachment = async (
  app: FrappeApp,
  file: File | Blob,
  doctype: string,
  name: string,
): Promise<void> => {
  await app.file().uploadFile(file, { doctype, docname: name });
};

export const removeAttachment = async (
  app: FrappeApp,
  fileId: string,
  doctype: string,
  name: string,
): Promise<void> => {
  await app.call().post<MessagePayload>('frappe.desk.form.utils.remove_attach', {
    fid: fileId,
    dt: doctype,
    dn: name,
  });
};

// ---------------------------------------------------------------------------
// Session user
// ---------------------------------------------------------------------------

const loggedUserCache = new WeakMap<FrappeApp, Promise<string>>();

const fetchLoggedUser = async (app: FrappeApp): Promise<string> => {
  try {
    const res = await app.call().get<MessagePayload<string>>('frappe.auth.get_logged_user');
    return res.payload?.message ?? 'Guest';
  } catch (error) {
    // Evict failed probes so a later mount can retry; callers still see the failure.
    loggedUserCache.delete(app);
    throw error;
  }
};

/** The session user probe, shared per FrappeApp. */
const sessionUser = async (app: FrappeApp): Promise<string> => {
  let promise = loggedUserCache.get(app);
  if (!promise) {
    promise = fetchLoggedUser(app);
    loggedUserCache.set(app, promise);
  }
  return await promise;
};

/** Session user via frappe.auth.get_logged_user, cached per FrappeApp. */
export const useCurrentUser = (app: FrappeApp | undefined, override?: string): string | undefined => {
  const [user, setUser] = useState<string | undefined>(override);

  useEffect(() => {
    if ((override !== undefined && override !== '') || !app) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const value = await sessionUser(app);
        if (!cancelled) {
          setUser(value);
        }
      } catch {
        // Session probe failed (bench down / unauthenticated): leave undefined
        // so user-scoped affordances (follow) stay disabled.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [app, override]);

  return override ?? user;
};
