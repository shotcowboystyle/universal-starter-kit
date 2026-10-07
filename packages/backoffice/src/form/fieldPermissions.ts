/**
 * Permlevel matrix helpers — moved to
 * `@repo/frappe-ui/src/formEngine/fieldPermissions` (MPO-15),
 * because formLayout consumes them and formLayout now lives there.
 * Re-exported here so existing imports keep resolving (the GNOME shim
 * deep-imports this path).
 */

export { buildPermLevelMatrix, canReadLevel, canWriteLevel } from '@repo/frappe-ui';
export type { LevelPerm, PermLevelMatrix } from '@repo/frappe-ui';
