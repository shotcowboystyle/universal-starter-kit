import { isWeb } from '@repo/platform';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useCookies } from 'react-cookie';

import {
  cookiePreset,
  computeOverrides,
  getCookieWatchList,
  readOverridesCookie,
  readPresetCookie,
  writeOverridesCookie,
} from './cookies';
import { type Knobs, defaultKnobs } from './knobs';
import { getPreset } from './shared';

// ---------------------------------------------------------------------------
// Scheme type (lives here since it's orthogonal to knobs)
// ---------------------------------------------------------------------------

export type ThemeScheme = 'system' | 'dark' | 'light';

// ---------------------------------------------------------------------------
// useTheme hook — knob-aware
// ---------------------------------------------------------------------------

/**
 * Hook that returns the current knob values (merged from preset base + cookie
 * overrides), a setter to persist partial knob changes, a boolean indicating
 * whether the initial state came from a persisted cookie, a setter to switch
 * the active preset, and the active preset name.
 *
 * Return type:
 * ```
 * [
 *   Knobs,                              // resolved knobs
 *   (knobs?: Partial<Knobs>) => void,   // merge partial knob updates
 *   boolean,                            // true if initialized from cookie
 *   (presetName: string) => void,       // switch preset (resets overrides)
 *   string | undefined,                 // active preset name
 * ]
 * ```
 *
 * On SSR the preset name is read from `mp.preset` cookie, looked up in the
 * preset registry, and its base knobs are merged with `mp.ov.*` overrides.
 * This produces the same resolved knobs on the server as on the client.
 */
export function useTheme(): [
  Knobs,
  (knobs?: Partial<Knobs>) => void,
  boolean,
  (presetName: string) => void,
  string | undefined,
] {
  const isCookieDisabled = typeof process !== 'undefined' && process.env?.COOKIE_POLICY?.toLowerCase() === 'disabled';
  const watchList = isCookieDisabled ? [] : getCookieWatchList();
  const [cookie, setCookie, removeCookie] = useCookies<string, Record<string, string>>(watchList);
  const themeSavedToCookie = useRef(false);
  const isClient = typeof window !== 'undefined';

  // -------------------------------------------------------------------------
  // Read preset + overrides from cookies
  // -------------------------------------------------------------------------
  const presetName = readPresetCookie(cookie as Record<string, string | undefined>);
  const overrides = readOverridesCookie(cookie as Record<string, string | undefined>);

  const initializedFromCookieRef = useRef<boolean | null>(null);
  if (initializedFromCookieRef.current === null) {
    initializedFromCookieRef.current = presetName != null && presetName.length > 0;
  }
  const initializedFromCookie = initializedFromCookieRef.current;

  // -------------------------------------------------------------------------
  // Resolve initial knobs: preset base (looked up by name) + overrides
  // -------------------------------------------------------------------------
  const resolvedPreset = presetName ? getPreset(presetName) : undefined;
  const presetBaseKnobs = resolvedPreset?.knobs ?? defaultKnobs;

  const [localKnobs, setLocalKnobs] = useState<Knobs>(() => ({
    ...presetBaseKnobs,
    ...overrides,
  }));
  const knobsRef = useRef(localKnobs);
  knobsRef.current = localKnobs;

  const [activePreset, setActivePreset] = useState<string | undefined>(presetName || undefined);

  // -------------------------------------------------------------------------
  // Cookie write helper
  // -------------------------------------------------------------------------
  const cookieOptions = isClient
    ? {
        path: '/',
        sameSite: 'strict' as const,
        secure: isWeb && window.location.protocol === 'https:',
        maxAge: 60 * 60 * 24 * 365,
      }
    : {
        path: '/',
        sameSite: 'strict' as const,
        maxAge: 60 * 60 * 24 * 365,
      };

  const writeCookies = useCallback(
    (pName: string, knobOverrides: Partial<Knobs>) => {
      if (isCookieDisabled || !isClient) {
        return;
      }

      setCookie(cookiePreset, pName, cookieOptions);

      const { toSet, toRemove } = writeOverridesCookie(knobOverrides);
      for (const { key, value } of toSet) {
        setCookie(key, value, cookieOptions);
      }
      for (const key of toRemove) {
        try {
          removeCookie(key, { path: '/' });
        } catch {
          // Ignore errors removing non-existent cookies
        }
      }
    },
    [setCookie, removeCookie, isCookieDisabled, isClient, cookieOptions],
  );

  // -------------------------------------------------------------------------
  // setKnobs — accepts partial knob updates (overrides relative to preset)
  // -------------------------------------------------------------------------
  const setKnobs = useCallback(
    (partial?: Partial<Knobs>): void => {
      if (!partial) {
        return;
      }

      const current = knobsRef.current;
      let hasChanges = false;
      const updated = { ...current };

      for (const key of Object.keys(partial) as Array<keyof Knobs>) {
        const newValue = partial[key];
        if (newValue === undefined) {
          continue;
        }
        const oldValue = current[key];
        const changed =
          typeof newValue === 'object' && newValue !== null
            ? JSON.stringify(newValue) !== JSON.stringify(oldValue)
            : newValue !== oldValue;
        if (changed) {
          (updated as Record<string, unknown>)[key] = newValue;
          hasChanges = true;
        }
      }

      const shouldSave = hasChanges || !themeSavedToCookie.current;
      if (shouldSave) {
        if (hasChanges) {
          knobsRef.current = updated;
          setLocalKnobs(updated);
        }

        if (!isCookieDisabled && isClient) {
          const base = (activePreset ? getPreset(activePreset)?.knobs : undefined) ?? defaultKnobs;
          const knobOverrides = computeOverrides(base, updated);
          writeCookies(activePreset ?? '', knobOverrides);
          themeSavedToCookie.current = true;

          if (process.env.NODE_ENV === 'development') {
            const size = JSON.stringify(knobOverrides).length;
            if (size > 3072) {
              console.warn(
                `[@repo/theme] Knob overrides cookie is ${size} chars (>3072). Consider reducing overrides.`,
              );
            }
          }
        }
      }
    },
    [activePreset, isCookieDisabled, isClient, writeCookies],
  );

  // -------------------------------------------------------------------------
  // setPreset — switch the active preset (resets overrides to empty)
  // -------------------------------------------------------------------------
  const setPresetFn = useCallback(
    (newPresetName: string) => {
      const preset = getPreset(newPresetName);
      const knobs = preset?.knobs ?? defaultKnobs;

      setActivePreset(newPresetName);
      setLocalKnobs(knobs);

      if (!isCookieDisabled && isClient) {
        writeCookies(newPresetName, {});
        themeSavedToCookie.current = true;
      }
    },
    [isCookieDisabled, isClient, writeCookies],
  );

  // Save initial knobs to cookies on first client mount
  const savedOnClient = useRef(false);
  useLayoutEffect(() => {
    if (!isClient || isCookieDisabled || savedOnClient.current) {
      return;
    }
    setTimeout(() => {
      try {
        const base = (activePreset ? getPreset(activePreset)?.knobs : undefined) ?? defaultKnobs;
        const knobOverrides = computeOverrides(base, localKnobs);
        writeCookies(activePreset ?? '', knobOverrides);
        savedOnClient.current = true;
        themeSavedToCookie.current = true;
      } catch (error) {
        // Safe to continue: cookie persistence is best-effort; the knobs still
        // apply in memory for this session.
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to set initial cookie:', error);
        }
      }
    }, 0);
  }, [isClient, isCookieDisabled, writeCookies, localKnobs, activePreset]);

  return [localKnobs, setKnobs, initializedFromCookie, setPresetFn, activePreset];
}
