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

export type { DocFieldMeta, DocLinkMeta, DocPermissionRule, DoctypeMeta } from './doctypeMeta';

export { buildPermLevelMatrix, canReadLevel, canWriteLevel } from './fieldPermissions';
export type { LevelPerm, PermLevelMatrix } from './fieldPermissions';

export { applyFetchedValues, buildFetchMap, isFetchLocked } from './fetchFrom';
export type { FetchMap, FetchRule } from './fetchFrom';

export { computeDirtyFields, isEmptyValue, isSameValue } from './dirtyTracking';

export { setCreatePrefill, takeCreatePrefill } from './createPrefill';

export { buildCopyValues, buildCreateDefaults, buildFormTabs, isPromptNamed } from './formLayout';
export type { BuildTabsOptions, FormTab } from './formLayout';

export { useFormEngine } from './useFormEngine';
export type { FormEngine } from './useFormEngine';

export { useFrappeSession, useSessionRoles } from './useSessionRoles';
export type { FrappeSession } from './useSessionRoles';

export {
  allDocRights,
  docinfoRights,
  docRightNames,
  fixtureDocRights,
  resolveDocRights,
  sessionDocRights,
} from './docPermissions';
export type {
  DocRight,
  DocRights,
  DocShareGrant,
  ResolveDocRightsInput,
  SessionDocRightsInput,
} from './docPermissions';

export { useDocRights } from './useDocRights';
export type { DocRightsOptions, DocRightsResult } from './useDocRights';
