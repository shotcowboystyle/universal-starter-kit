export const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`).exec(document.cookie);
  return match ? decodeURIComponent(match[1]) : null;
};

export const setCookie = (
  name: string,
  value: string,
  options: {
    days?: number;
    path?: string;
    sameSite?: 'Strict' | 'Lax' | 'None';
    secure?: boolean;
  } = {},
): void => {
  if (typeof document === 'undefined') {
    return;
  }
  const { days, path = '/', sameSite = 'Lax', secure = false } = options;
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=${path}; SameSite=${sameSite}`;
  if (days != null) {
    const expires = new Date(Date.now() + days * 864e5);
    cookie += `; expires=${expires.toUTCString()}`;
  }
  if (secure) {
    cookie += '; Secure';
  }
  document.cookie = cookie;
};

export const deleteCookie = (name: string, path = '/'): void => {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${encodeURIComponent(name)}=; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};
