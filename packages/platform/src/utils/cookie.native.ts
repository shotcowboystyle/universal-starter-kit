import type { CookieOptions } from './cookie';

const store = new Map<string, string>();

export const getCookie = (name: string): string | null => store.get(name) ?? null;

export const setCookie = (name: string, value: string, _options?: CookieOptions): void => {
  store.set(name, value);
};

export const deleteCookie = (name: string, _path?: string): void => {
  store.delete(name);
};
