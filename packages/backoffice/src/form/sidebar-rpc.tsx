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

export async function addAssignment(
  app: FrappeApp,
  doctype: string,
  name: string,
  users: string[],
  description?: string,
): Promise<unknown> {
  return await app.call().post<MessagePayload>('frappe.desk.form.assign_to.add', {
    doctype,
    name,
    assign_to: users,
    ...(description ? { description } : {}),
  });
}

export async function removeAssignment(app: FrappeApp, doctype: string, name: string, user: string): Promise<unknown> {
  return await app.call().post<MessagePayload>('frappe.desk.form.assign_to.remove', {
    doctype,
    name,
    assign_to: user,
  });
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function addTag(app: FrappeApp, doctype: string, name: string, tag: string): Promise<unknown> {
  return await app.call().post<MessagePayload<string>>('frappe.desk.doctype.tag.tag.add_tag', {
    tag,
    dt: doctype,
    dn: name,
  });
}

export async function removeTag(app: FrappeApp, doctype: string, name: string, tag: string): Promise<unknown> {
  return await app.call().post<MessagePayload>('frappe.desk.doctype.tag.tag.remove_tag', {
    tag,
    dt: doctype,
    dn: name,
  });
}

/** All existing tag names for the doctype (sidebar add-tag suggestions). */
export async function fetchTagSuggestions(app: FrappeApp, doctype: string): Promise<string[]> {
  const res = await app
    .call()
    .get<MessagePayload<string[]>>('frappe.desk.doctype.tag.tag.get_tags', { doctype, txt: '' });
  return res.payload?.message ?? [];
}

// ---------------------------------------------------------------------------
// Like / Follow
// ---------------------------------------------------------------------------

export async function toggleLike(app: FrappeApp, doctype: string, name: string, add: boolean): Promise<unknown> {
  return await app.call().post<MessagePayload>('frappe.desk.like.toggle_like', {
    doctype,
    name,
    add: add ? 'Yes' : 'No',
  });
}

export async function followDocument(app: FrappeApp, doctype: string, name: string, user: string): Promise<unknown> {
  return await app.call().post<MessagePayload>('frappe.desk.form.document_follow.follow_document', {
    doctype,
    doc_name: name,
    user,
  });
}

export async function unfollowDocument(app: FrappeApp, doctype: string, name: string, user: string): Promise<unknown> {
  return await app.call().post<MessagePayload>('frappe.desk.form.document_follow.unfollow_document', {
    doctype,
    doc_name: name,
    user,
  });
}

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

export async function addShare(
  app: FrappeApp,
  doctype: string,
  name: string,
  user: string,
  options: { write?: boolean } = {},
): Promise<unknown> {
  return await app.call().post<MessagePayload>('frappe.share.add', {
    doctype,
    name,
    user,
    read: 1,
    write: options.write ? 1 : 0,
    share: 0,
    notify: 0,
  });
}

/** Dropping read cascades server-side and deletes the DocShare row. */
export async function removeShare(app: FrappeApp, doctype: string, name: string, user: string): Promise<unknown> {
  return await app.call().post<MessagePayload>('frappe.share.set_permission', {
    doctype,
    name,
    user,
    permission_to: 'read',
    value: 0,
  });
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function uploadAttachment(
  app: FrappeApp,
  file: File | Blob,
  doctype: string,
  name: string,
): Promise<unknown> {
  return await app.file().uploadFile(file, { doctype, docname: name });
}

export async function removeAttachment(
  app: FrappeApp,
  fileId: string,
  doctype: string,
  name: string,
): Promise<unknown> {
  return await app.call().post<MessagePayload>('frappe.desk.form.utils.remove_attach', {
    fid: fileId,
    dt: doctype,
    dn: name,
  });
}

// ---------------------------------------------------------------------------
// Session user
// ---------------------------------------------------------------------------

const loggedUserCache = new WeakMap<FrappeApp, Promise<string>>();

/** Session user via frappe.auth.get_logged_user, cached per FrappeApp. */
export function useCurrentUser(app: FrappeApp | undefined, override?: string): string | undefined {
  const [user, setUser] = useState<string | undefined>(override);

  useEffect(() => {
    if (override || !app) {
      return;
    }
    let cancelled = false;
    let promise = loggedUserCache.get(app);
    if (!promise) {
      promise = app
        .call()
        .get<MessagePayload<string>>('frappe.auth.get_logged_user')
        .then((res) => res.payload?.message ?? 'Guest');
      loggedUserCache.set(app, promise);
      promise.catch(() => loggedUserCache.delete(app));
    }
    promise
      .then((value) => {
        if (!cancelled) {
          setUser(value);
        }
      })
      .catch(() => {
        // Session probe failed (bench down / unauthenticated): leave undefined
        // so user-scoped affordances (follow) stay disabled.
      });
    return () => {
      cancelled = true;
    };
  }, [app, override]);

  return override ?? user;
}
