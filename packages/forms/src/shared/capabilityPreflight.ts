/**
 * Shared CAPABILITY-PREFLIGHT primitives.
 * Capability-specific checks (camera devices, geolocation API, …) stay next
 * to their fields; only the result shape and Permissions API probe are shared.
 */

export type CapabilityPreflightResult = { ok: true } | { ok: false; reason: string };

/**
 * Query the Permissions API for a named capability.
 * Returns `"unknown"` when the API is missing, the name is unsupported, or
 * the query throws — callers treat that as "prompt inside the stable surface".
 */
export async function queryPermissionState(
  name: PermissionName | (string & {}),
): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const status = await navigator.permissions?.query?.({
      name: name as PermissionName,
    });
    const state = status?.state;
    if (state === 'granted' || state === 'denied' || state === 'prompt') {
      return state;
    }
  } catch {
    // Permissions API unsupported for this name (Safari quirks, etc.)
  }
  return 'unknown';
}
