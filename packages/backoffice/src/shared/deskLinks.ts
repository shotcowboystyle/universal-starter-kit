/**
 * Desk deep links: backoffice surfaces always offer an "Open in Desk" hop to
 * their native frappe/desk counterpart (`…/app/<slug>[/<name>|/view/<view>]`),
 * the mirror of feature screens deep-linking INTO the backoffice. URL shapes
 * follow desk's router: `frappe.router.slug` doctype slugs, encoded doc
 * names, and bare-slug list routes.
 */

import { toSlug } from '../navigation/paths';
import type { BackofficeView } from '../navigation/paths';

function trimBase(baseURL: string): string {
  return baseURL.replace(/\/+$/, '');
}

/** Desk form page for one document: `<base>/app/<slug>/<encoded name>`. */
export function deskDocUrl(baseURL: string, doctype: string, name: string): string {
  return `${trimBase(baseURL)}/app/${toSlug(doctype)}/${encodeURIComponent(name)}`;
}

/**
 * Desk view page for a doctype. List is desk's bare slug route; every other
 * view rides `/view/<view>` (desk and backoffice share the view vocabulary).
 */
export function deskViewUrl(baseURL: string, doctype: string, view: BackofficeView = 'list'): string {
  const base = `${trimBase(baseURL)}/app/${toSlug(doctype)}`;
  return view === 'list' ? base : `${base}/view/${view}`;
}
