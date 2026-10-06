export type ColorScheme = 'light' | 'dark';

/**
 * Cookie mirroring next-themes' resolved scheme so the server renders the same
 * one. Lives outside the "use client" provider so server code gets the value.
 */
export const COLOR_SCHEME_COOKIE = 'color-scheme';
