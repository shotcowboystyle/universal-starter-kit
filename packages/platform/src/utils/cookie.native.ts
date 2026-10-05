const store = new Map<string, string>();

export function getCookie(name: string): string | null {
  return store.get(name) ?? null;
}

export function setCookie(name: string, value: string, _options?: object): void {
  store.set(name, value);
}

export function deleteCookie(name: string, _path?: string): void {
  store.delete(name);
}
