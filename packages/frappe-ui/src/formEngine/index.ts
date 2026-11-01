/**
 * The desk form engine.
 *
 * Frappe's desk resolves a form from meta at render time: tabs and sections
 * from the layout breaks, visibility and read-only from `depends_on` chains,
 * `permlevel`, `set_only_once`, `fetch_from`, `docstatus`, and a
 * save/submit/cancel/amend lifecycle on top. All of that used to live in
 * `@repo/backoffice`, so an app author who imported the
 * EXPORTED `FrappeForm` got a strictly weaker form than the desk rendered
 * for the same doctype (MPO-15).
 *
 * It lives here now. `@repo/backoffice` re-exports every name
 * from its previous paths, so existing imports — barrel and
 * `@repo/backoffice/src/form/*` deep — keep resolving.
 */

export type { DocFieldMeta, DocLinkMeta, DocPermissionRule, DoctypeMeta } from './doctype-meta';

export { buildPermLevelMatrix, canReadLevel, canWriteLevel } from './field-permissions';
export type { LevelPerm, PermLevelMatrix } from './field-permissions';

export { applyFetchedValues, buildFetchMap, isFetchLocked } from './fetch-from';
export type { FetchMap, FetchRule } from './fetch-from';

export { computeDirtyFields, isEmptyValue, isSameValue } from './dirty-tracking';

export { setCreatePrefill, takeCreatePrefill } from './create-prefill';

export { buildCopyValues, buildCreateDefaults, buildFormTabs, isPromptNamed } from './form-layout';
export type { BuildTabsOptions, FormTab } from './form-layout';

export { useFormEngine } from './use-form-engine';
export type { FormEngine } from './use-form-engine';

export { useFrappeSession, useSessionRoles } from './use-session-roles';
export type { FrappeSession } from './use-session-roles';

export {
  allDocRights,
  docinfoRights,
  docRightNames,
  fixtureDocRights,
  resolveDocRights,
  sessionDocRights,
} from './doc-permissions';
export type {
  DocRight,
  DocRights,
  DocShareGrant,
  ResolveDocRightsInput,
  SessionDocRightsInput,
} from './doc-permissions';

export { useDocRights } from './use-doc-rights';
export type { DocRightsOptions, DocRightsResult } from './use-doc-rights';
