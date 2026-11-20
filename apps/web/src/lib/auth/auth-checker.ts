'use server';

import { cookies } from 'next/headers';

export const isAuthenticated = async () => {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const jwtCookie = allCookies.find((cookie) => cookie.name === 'jwt');
    return { isAuthenticated: jwtCookie?.value !== undefined && jwtCookie.value !== '' };
  } catch (error) {
    console.error('Error checking authentication:', error);
    return { isAuthenticated: false };
  }
};
